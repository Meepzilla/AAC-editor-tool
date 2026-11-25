import type { Database } from 'sql.js';
import { formatGridSize } from '../utils';
import { isZipBytes, safeUnzip } from './container-inspect';
import {
  findColumnCaseInsensitive,
  isSqliteBytes,
  listColumns,
  listTables,
  openReadOnlySqlite,
  queryRows,
  quoteIdentifier,
} from './sqlite-loader';
import {
  orderBoardsFromRoot,
  ParserRefusalError,
  SYMBOLS_OMITTED_NOTE,
  type ObfBoard,
  type ObfBoardSet,
  type ObfButton,
} from './types';

/**
 * TD Snap (.sps page set export / .spb full backup) read-only parser.
 *
 * Ported from the open-source AAC Editor project (github.com/rjpenny16/AAC-Editor, MIT):
 * - Discovers tables and columns dynamically at runtime (never hard-coding a single schema version).
 * - Runs SQLite hardening (`trusted_schema=OFF`, `cell_size_check=ON`) and `PRAGMA integrity_check`.
 * - Ignores TD Snap's proprietary `SyncHash` and symbol/media columns (read-only, never writes back).
 */

// TD Snap PageType 1 = user-visible vocabulary page; 3/4 = message bar / system pages.
const PAGE_TYPE_VOCAB = 1;

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function findTable(tables: string[], expectedLower: string): string | null {
  return tables.find((t) => t.toLowerCase() === expectedLower) ?? null;
}

/**
 * Parses TD Snap's "cols,rows" (or "cols,rows,..." prefix in PageLayoutSetting).
 * Note: TD Snap stores columns FIRST, then rows.
 */
export function parseTdSnapGrid(value: string): { cols: number; rows: number } | null {
  const parts = (value || '').split(',');
  if (parts.length < 2) return null;
  const cols = Number.parseInt(parts[0].trim(), 10);
  const rows = Number.parseInt(parts[1].trim(), 10);
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    return null;
  }
  return { cols, rows };
}

/**
 * Parses TD Snap's zero-based "col,row" placement coordinate in ElementPlacement.GridPosition.
 */
export function parseTdSnapGridPosition(value: string): { col: number; row: number } | null {
  const parts = (value || '').split(',');
  if (parts.length !== 2) return null;
  const col = Number.parseInt(parts[0].trim(), 10);
  const row = Number.parseInt(parts[1].trim(), 10);
  if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0) {
    return null;
  }
  return { col, row };
}

interface ParsedCommandSummary {
  linkedPageId: string | null;
}

/**
 * Parses TD Snap's CommandSequence.SerializedCommands JSON looking for navigation commands
 * (`$type` == "2" / 2 with `LinkedPageId`).
 */
function parseCommandSequence(serialized: unknown): ParsedCommandSummary {
  if (typeof serialized !== 'string' || !serialized.trim()) {
    return { linkedPageId: null };
  }
  try {
    const doc = JSON.parse(serialized) as { $values?: unknown };
    const values = Array.isArray(doc?.$values) ? doc.$values : [];
    for (const part of values) {
      if (!part || typeof part !== 'object') continue;
      const obj = part as Record<string, unknown>;
      if (String(obj.$type ?? '') === '2') {
        const linked = cleanText(obj.LinkedPageId);
        if (linked) return { linkedPageId: linked };
      }
    }
  } catch {
    // Unparseable JSON command sequences are ignored cleanly.
  }
  return { linkedPageId: null };
}

function extractSqlitePayload(bytes: Uint8Array): Uint8Array {
  if (isSqliteBytes(bytes)) return bytes;

  if (isZipBytes(bytes)) {
    const entries = safeUnzip(bytes, 'td-snap');
    for (const [entryName, entryBytes] of Object.entries(entries)) {
      if (entryName.endsWith('/')) continue;
      if (isSqliteBytes(entryBytes)) {
        return entryBytes;
      }
    }
    throw new ParserRefusalError(
      'TDSNAP_NO_SQLITE_IN_ZIP',
      'Refused: this ZIP-wrapped TD Snap file does not contain a readable SQLite database.',
      'td-snap'
    );
  }

  return bytes;
}

function readPageSetProperties(
  db: Database,
  tables: string[]
): {
  schemaVersion: string;
  defaultGrid: { cols: number; rows: number } | null;
  homePageUniqueId: string | null;
  friendlyName: string | null;
} {
  const propTable = findTable(tables, 'pagesetproperties');
  if (!propTable) {
    return {
      schemaVersion: '',
      defaultGrid: null,
      homePageUniqueId: null,
      friendlyName: null,
    };
  }
  const cols = listColumns(db, propTable);
  const schemaCol = findColumnCaseInsensitive(cols, ['SchemaVersion']);
  const gridCol = findColumnCaseInsensitive(cols, ['GridDimension']);
  const homeCol = findColumnCaseInsensitive(cols, ['DefaultHomePageUniqueId', 'HomePageUniqueId']);
  const nameCol = findColumnCaseInsensitive(cols, ['FriendlyName', 'Title', 'Name', 'PageSetName']);

  const row = queryRows(db, `SELECT * FROM ${quoteIdentifier(propTable)} LIMIT 1`)[0];
  if (!row) {
    return {
      schemaVersion: '',
      defaultGrid: null,
      homePageUniqueId: null,
      friendlyName: null,
    };
  }

  const schemaVersion = schemaCol ? cleanText(row[schemaCol]) : '';
  const defaultGrid = gridCol ? parseTdSnapGrid(cleanText(row[gridCol])) : null;
  const homePageUniqueId = homeCol ? cleanText(row[homeCol]) || null : null;
  const friendlyName = nameCol ? cleanText(row[nameCol]) || null : null;

  return { schemaVersion, defaultGrid, homePageUniqueId, friendlyName };
}

/**
 * Parses a TD Snap `.sps` or `.spb` export into the common OBF board model.
 */
export async function parseTdSnapFile(
  fileName: string,
  bytes: Uint8Array
): Promise<ObfBoardSet> {
  const sqliteBytes = extractSqlitePayload(bytes);
  const db = await openReadOnlySqlite(sqliteBytes, 'td-snap', 'this TD Snap export');

  try {
    const tables = listTables(db);

    const pageTable = findTable(tables, 'page');
    const buttonTable = findTable(tables, 'button');
    const refTable = findTable(tables, 'elementreference');
    const placementTable = findTable(tables, 'elementplacement');
    const layoutTable = findTable(tables, 'pagelayout');

    const missingTables = [
      ['Page', pageTable],
      ['Button', buttonTable],
      ['ElementReference', refTable],
      ['ElementPlacement', placementTable],
      ['PageLayout', layoutTable],
    ]
      .filter(([, hit]) => !hit)
      .map(([name]) => name);

    if (missingTables.length > 0) {
      throw new ParserRefusalError(
        'TDSNAP_MISSING_TABLES',
        `Refused: this file does not look like a TD Snap page set (missing tables: ${missingTables.join(', ')}).`,
        'td-snap'
      );
    }

    const commandTable = findTable(tables, 'commandsequence');
    const linkTable = findTable(tables, 'buttonpagelink');

    // Runtime column discovery for Page
    const pageCols = listColumns(db, pageTable!);
    const pageIdCol = findColumnCaseInsensitive(pageCols, ['Id']);
    const pageUidCol = findColumnCaseInsensitive(pageCols, ['UniqueId']);
    const pageTitleCol = findColumnCaseInsensitive(pageCols, ['Title', 'Name']);
    const pageTypeCol = findColumnCaseInsensitive(pageCols, ['PageType']);
    if (!pageIdCol) {
      throw new ParserRefusalError(
        'TDSNAP_MISSING_PAGE_ID',
        'Refused: TD Snap Page table is missing an Id column.',
        'td-snap'
      );
    }

    // Runtime column discovery for PageLayout
    const layoutCols = listColumns(db, layoutTable!);
    const layoutIdCol = findColumnCaseInsensitive(layoutCols, ['Id']);
    const layoutPageIdCol = findColumnCaseInsensitive(layoutCols, ['PageId']);
    const layoutSettingCol = findColumnCaseInsensitive(layoutCols, ['PageLayoutSetting']);
    if (!layoutIdCol || !layoutPageIdCol || !layoutSettingCol) {
      throw new ParserRefusalError(
        'TDSNAP_MISSING_LAYOUT_COLUMNS',
        'Refused: TD Snap PageLayout table is missing required layout columns.',
        'td-snap'
      );
    }

    // Runtime column discovery for ElementPlacement
    const placeCols = listColumns(db, placementTable!);
    const placeIdCol = findColumnCaseInsensitive(placeCols, ['Id']);
    const placePosCol = findColumnCaseInsensitive(placeCols, ['GridPosition']);
    const placeVisCol = findColumnCaseInsensitive(placeCols, ['Visible']);
    const placeRefIdCol = findColumnCaseInsensitive(placeCols, ['ElementReferenceId']);
    const placeLayoutIdCol = findColumnCaseInsensitive(placeCols, ['PageLayoutId']);
    if (!placePosCol || !placeRefIdCol || !placeLayoutIdCol) {
      throw new ParserRefusalError(
        'TDSNAP_MISSING_PLACEMENT_COLUMNS',
        'Refused: TD Snap ElementPlacement table is missing required grid columns.',
        'td-snap'
      );
    }

    // Runtime column discovery for Button
    const btnCols = listColumns(db, buttonTable!);
    const btnIdCol = findColumnCaseInsensitive(btnCols, ['Id']);
    const btnLabelCol = findColumnCaseInsensitive(btnCols, ['Label']);
    const btnMsgCol = findColumnCaseInsensitive(btnCols, ['Message']);
    const btnRefIdCol = findColumnCaseInsensitive(btnCols, ['ElementReferenceId']);
    if (!btnIdCol || !btnLabelCol || !btnRefIdCol) {
      throw new ParserRefusalError(
        'TDSNAP_MISSING_BUTTON_COLUMNS',
        'Refused: TD Snap Button table is missing required label/reference columns.',
        'td-snap'
      );
    }

    const props = readPageSetProperties(db, tables);

    // Load pages (prefer PageType = 1 vocabulary pages when PageType column exists).
    const pageSelect = `
      SELECT
        ${quoteIdentifier(pageIdCol)} AS id,
        ${pageUidCol ? quoteIdentifier(pageUidCol) : `''`} AS uid,
        ${pageTitleCol ? quoteIdentifier(pageTitleCol) : `''`} AS title
      FROM ${quoteIdentifier(pageTable!)}
    `;
    let rawPages = pageTypeCol
      ? queryRows(db, `${pageSelect} WHERE ${quoteIdentifier(pageTypeCol)} = ?`, [PAGE_TYPE_VOCAB])
      : queryRows(db, pageSelect);

    if (rawPages.length === 0 && pageTypeCol) {
      rawPages = queryRows(db, pageSelect);
    }

    if (rawPages.length === 0) {
      throw new ParserRefusalError(
        'TDSNAP_NO_PAGES',
        'Refused: no vocabulary pages were found in this TD Snap file.',
        'td-snap'
      );
    }

    const pages = rawPages.map((row) => {
      const id = Number(row.id);
      const uid = cleanText(row.uid) || `page-${id}`;
      const title = cleanText(row.title) || `Page ${id}`;
      return { id, uid, title };
    });

    const pageByUid = new Map<string, { id: number; uid: string; title: string }>();
    for (const p of pages) {
      pageByUid.set(p.uid, p);
    }

    // Load all PageLayout rows and placement counts per layout.
    const layoutsByPageId = new Map<number, Array<{ id: number; setting: string }>>();
    for (const row of queryRows(
      db,
      `SELECT ${quoteIdentifier(layoutIdCol)} AS id, ${quoteIdentifier(layoutPageIdCol)} AS page_id, ${quoteIdentifier(layoutSettingCol)} AS setting FROM ${quoteIdentifier(layoutTable!)}`
    )) {
      const id = Number(row.id);
      const pageId = Number(row.page_id);
      const setting = cleanText(row.setting);
      if (!Number.isFinite(id) || !Number.isFinite(pageId)) continue;
      const list = layoutsByPageId.get(pageId) ?? [];
      list.push({ id, setting });
      layoutsByPageId.set(pageId, list);
    }

    const placementCountByLayout = new Map<number, number>();
    for (const row of queryRows(
      db,
      `SELECT ${quoteIdentifier(placeLayoutIdCol)} AS layout_id, COUNT(*) AS c FROM ${quoteIdentifier(placementTable!)} GROUP BY ${quoteIdentifier(placeLayoutIdCol)}`
    )) {
      placementCountByLayout.set(Number(row.layout_id), Number(row.c ?? 0));
    }

    // Determine fallback grid dimension from most common PageLayoutSetting among vocab pages if PageSetProperties lacked one.
    let defaultGrid = props.defaultGrid;
    if (!defaultGrid) {
      const freq = new Map<string, number>();
      for (const page of pages) {
        for (const layout of layoutsByPageId.get(page.id) ?? []) {
          const parsed = parseTdSnapGrid(layout.setting);
          if (!parsed) continue;
          const key = `${parsed.cols},${parsed.rows}`;
          freq.set(key, (freq.get(key) ?? 0) + 1);
        }
      }
      let bestKey: string | null = null;
      let bestCount = -1;
      for (const [k, c] of freq.entries()) {
        if (c > bestCount) {
          bestCount = c;
          bestKey = k;
        }
      }
      defaultGrid = bestKey ? parseTdSnapGrid(bestKey) : { cols: 1, rows: 1 };
    }

    // Load CommandSequence map (ButtonId -> linkedPageId) if table exists.
    const cmdLinkByButtonId = new Map<number, string>();
    if (commandTable) {
      const cCols = listColumns(db, commandTable);
      const cBtnCol = findColumnCaseInsensitive(cCols, ['ButtonId']);
      const cSerCol = findColumnCaseInsensitive(cCols, ['SerializedCommands']);
      const cIdCol = findColumnCaseInsensitive(cCols, ['Id']);
      if (cBtnCol && cSerCol) {
        const orderSql = cIdCol ? ` ORDER BY ${quoteIdentifier(cIdCol)} ASC` : '';
        for (const row of queryRows(
          db,
          `SELECT ${quoteIdentifier(cBtnCol)} AS btn_id, ${quoteIdentifier(cSerCol)} AS cmds FROM ${quoteIdentifier(commandTable)}${orderSql}`
        )) {
          const btnId = Number(row.btn_id);
          if (!Number.isFinite(btnId) || cmdLinkByButtonId.has(btnId)) continue;
          const summary = parseCommandSequence(row.cmds);
          if (summary.linkedPageId) {
            cmdLinkByButtonId.set(btnId, summary.linkedPageId);
          }
        }
      }
    }

    // Load ButtonPageLink map (ButtonId -> PageUniqueId) if table exists.
    const directLinkByButtonId = new Map<number, string>();
    if (linkTable) {
      const lCols = listColumns(db, linkTable);
      const lBtnCol = findColumnCaseInsensitive(lCols, ['ButtonId']);
      const lUidCol = findColumnCaseInsensitive(lCols, ['PageUniqueId']);
      const lIdCol = findColumnCaseInsensitive(lCols, ['Id']);
      if (lBtnCol && lUidCol) {
        const orderSql = lIdCol ? ` ORDER BY ${quoteIdentifier(lIdCol)} ASC` : '';
        for (const row of queryRows(
          db,
          `SELECT ${quoteIdentifier(lBtnCol)} AS btn_id, ${quoteIdentifier(lUidCol)} AS target_uid FROM ${quoteIdentifier(linkTable)}${orderSql}`
        )) {
          const btnId = Number(row.btn_id);
          const targetUid = cleanText(row.target_uid);
          if (!Number.isFinite(btnId) || !targetUid || directLinkByButtonId.has(btnId)) continue;
          directLinkByButtonId.set(btnId, targetUid);
        }
      }
    }

    // Assemble boards for each vocabulary page.
    const boards: ObfBoard[] = [];
    const visClause = placeVisCol ? ` AND ep.${quoteIdentifier(placeVisCol)} = 1` : '';
    const orderClause = placeIdCol ? ` ORDER BY ep.${quoteIdentifier(placeIdCol)} ASC` : '';
    const buttonQuerySql = `
      SELECT
        b.${quoteIdentifier(btnIdCol)} AS button_id,
        b.${quoteIdentifier(btnLabelCol)} AS label,
        ${btnMsgCol ? `b.${quoteIdentifier(btnMsgCol)}` : `''`} AS message,
        ep.${quoteIdentifier(placePosCol)} AS pos
      FROM ${quoteIdentifier(placementTable!)} ep
      JOIN ${quoteIdentifier(buttonTable!)} b
        ON b.${quoteIdentifier(btnRefIdCol)} = ep.${quoteIdentifier(placeRefIdCol)}
      WHERE ep.${quoteIdentifier(placeLayoutIdCol)} = ?${visClause}${orderClause}
    `;

    for (const page of pages) {
      const pageLayouts = layoutsByPageId.get(page.id) ?? [];
      let chosenLayout: { id: number; setting: string } | null = null;

      if (pageLayouts.length > 0) {
        if (defaultGrid) {
          const prefix = `${defaultGrid.cols},${defaultGrid.rows}`;
          chosenLayout =
            pageLayouts.find(
              (l) => l.setting === prefix || l.setting.startsWith(`${prefix},`)
            ) ?? null;
        }
        if (!chosenLayout) {
          chosenLayout = pageLayouts.reduce((best, cur) =>
            (placementCountByLayout.get(cur.id) ?? 0) > (placementCountByLayout.get(best.id) ?? 0)
              ? cur
              : best
          );
        }
      }

      const parsedLayoutGrid = chosenLayout ? parseTdSnapGrid(chosenLayout.setting) : null;
      const cols = parsedLayoutGrid?.cols ?? defaultGrid?.cols ?? 1;
      const rows = parsedLayoutGrid?.rows ?? defaultGrid?.rows ?? 1;
      const buttons: ObfButton[] = [];
      const taken = new Set<string>();

      if (chosenLayout) {
        const buttonRows = queryRows(db, buttonQuerySql, [chosenLayout.id]);
        for (const row of buttonRows) {
          const label = cleanText(row.label);
          const message = cleanText(row.message);
          const pos = parseTdSnapGridPosition(cleanText(row.pos));
          if (!pos) continue;
          if (pos.col >= cols || pos.row >= rows) continue;

          const cellKey = `${pos.row},${pos.col}`;
          if (taken.has(cellKey)) continue;

          const buttonId = Number(row.button_id);
          const targetUid =
            cmdLinkByButtonId.get(buttonId) ?? directLinkByButtonId.get(buttonId) ?? null;
          const targetPage =
            targetUid && targetUid !== page.uid ? pageByUid.get(targetUid) : undefined;

          const effectiveLabel = label || message || targetPage?.title || '';
          if (!effectiveLabel && !targetPage) continue;

          taken.add(cellKey);
          buttons.push({
            id: `${page.uid}:${pos.row}:${pos.col}`,
            row: pos.row,
            column: pos.col,
            label: effectiveLabel,
            ...(message && message !== effectiveLabel ? { vocalization: message } : {}),
            ...(targetPage
              ? {
                  loadBoardId: targetPage.uid,
                  loadBoardName: targetPage.title,
                }
              : {}),
          });
        }
      }

      boards.push({
        id: page.uid,
        name: page.title,
        rows,
        columns: cols,
        buttons,
      });
    }

    let rootBoardId: string | null = null;
    if (props.homePageUniqueId && pageByUid.has(props.homePageUniqueId)) {
      rootBoardId = props.homePageUniqueId;
    } else {
      const homeNamed = boards.find((b) => /^(home|top page|core|core words)$/i.test(b.name.trim()));
      rootBoardId = homeNamed?.id ?? boards[0]?.id ?? null;
    }

    const orderedBoards = orderBoardsFromRoot(boards, rootBoardId);
    const mainGridSize = defaultGrid
      ? formatGridSize(defaultGrid.rows, defaultGrid.cols)
      : orderedBoards[0]
      ? formatGridSize(orderedBoards[0].rows, orderedBoards[0].columns)
      : '';

    const stemName = fileName.replace(/\.(sps|spb)$/i, '') || 'TD Snap Page Set';
    const vocabularyName = props.friendlyName || stemName;
    const notes = [SYMBOLS_OMITTED_NOTE];
    if (props.schemaVersion) {
      notes.push(`Discovered TD Snap schema version ${props.schemaVersion} at runtime (SyncHash ignored, read-only).`);
    }

    return {
      format: 'open-board-0.1',
      sourceSystem: 'TD Snap',
      vocabularyName,
      rootBoardId,
      mainGridSize,
      boards: orderedBoards,
      notes,
    };
  } finally {
    db.close();
  }
}
