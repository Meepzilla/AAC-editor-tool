import type { Database } from 'sql.js';
import type { AacSystem } from '../types';
import { formatGridSize } from '../utils';
import { safeUnzip } from './container-inspect';
import {
  findColumnCaseInsensitive,
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
 * Saltillo .ce parser covering both TouchChat and LAMP Words for Life.
 *
 * Read-only. Extracts vocabulary name (from `variables` table `Name` row), pages,
 * button boxes (`layout_x` columns x `layout_y` rows), cells (both type-4 buttons and
 * type-5 button sets via modifier-0 base button), labels, spoken messages, and page links
 * (action codes 8, 9, and 73 targeting a page RID via `action_data` key 0).
 *
 * Ignores `Images.c4s` and symbol links completely — licensed symbols and photos are never extracted.
 */

const RESOURCE_TYPE_BUTTON = 4;
const RESOURCE_TYPE_BUTTON_SET = 5;
const RESOURCE_TYPE_PAGE = 7;

// Confirmed Saltillo navigation action codes (all store target page RID in action_data key 0).
const NAV_ACTION_CODES = new Set([8, 9, 73]);

interface ResourceRow {
  id: number;
  rid: string;
  name: string;
  type: number;
}

interface ButtonRow {
  id: number;
  resourceId: number;
  label: string;
  message: string;
  visible: boolean;
}

interface ButtonBoxRow {
  id: number;
  resourceId: number;
  layoutX: number;
  layoutY: number;
}

interface PageRow {
  id: number;
  resourceId: number;
  rid: string;
  name: string;
}

function normalizeRid(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function detectSaltilloSystem(vocabName: string, fileName: string): AacSystem {
  const combined = `${vocabName} ${fileName}`.toLowerCase();
  if (combined.includes('lamp') || combined.includes('words for life') || combined.includes('wfl')) {
    return 'LAMP Words for Life';
  }
  return 'TouchChat';
}

function readVariables(db: Database, tableSet: Set<string>): Map<string, string> {
  const vars = new Map<string, string>();
  const varTable = Array.from(tableSet).find((t) => t.toLowerCase() === 'variables');
  if (!varTable) return vars;

  const cols = listColumns(db, varTable);
  const nameCol = findColumnCaseInsensitive(cols, ['name', 'key', 'variable']);
  const valCol = findColumnCaseInsensitive(cols, ['value', 'val']);
  if (!nameCol || !valCol) return vars;

  const rows = queryRows(
    db,
    `SELECT ${quoteIdentifier(nameCol)} AS k, ${quoteIdentifier(valCol)} AS v FROM ${quoteIdentifier(varTable)}`
  );
  for (const row of rows) {
    const k = cleanText(row.k);
    if (k) vars.set(k.toLowerCase(), cleanText(row.v));
  }
  return vars;
}

function findTable(tableSet: Set<string>, expectedLower: string): string | null {
  for (const t of tableSet) {
    if (t.toLowerCase() === expectedLower) return t;
  }
  return null;
}

function readResources(db: Database, table: string): Map<number, ResourceRow> {
  const cols = listColumns(db, table);
  const idCol = findColumnCaseInsensitive(cols, ['id']);
  const ridCol = findColumnCaseInsensitive(cols, ['rid', 'guid', 'unique_id']);
  const nameCol = findColumnCaseInsensitive(cols, ['name', 'title']);
  const typeCol = findColumnCaseInsensitive(cols, ['type', 'resource_type']);
  if (!idCol || !typeCol) {
    throw new ParserRefusalError(
      'C4V_MISSING_RESOURCE_COLUMNS',
      'Refused: the .c4v vocabulary database has an unrecognized resources table structure.',
      'touchchat-lamp'
    );
  }

  const selectCols = [
    `${quoteIdentifier(idCol)} AS id`,
    ridCol ? `${quoteIdentifier(ridCol)} AS rid` : `'' AS rid`,
    nameCol ? `${quoteIdentifier(nameCol)} AS name` : `'' AS name`,
    `${quoteIdentifier(typeCol)} AS type`,
  ].join(', ');

  const map = new Map<number, ResourceRow>();
  for (const row of queryRows(db, `SELECT ${selectCols} FROM ${quoteIdentifier(table)}`)) {
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    map.set(id, {
      id,
      rid: normalizeRid(row.rid),
      name: cleanText(row.name),
      type: Number(row.type),
    });
  }
  return map;
}

function readPages(
  db: Database,
  pagesTable: string,
  resources: Map<number, ResourceRow>
): PageRow[] {
  const cols = listColumns(db, pagesTable);
  const idCol = findColumnCaseInsensitive(cols, ['id']);
  const resCol = findColumnCaseInsensitive(cols, ['resource_id']);
  const nameCol = findColumnCaseInsensitive(cols, ['name', 'title']);
  if (!idCol || !resCol) {
    throw new ParserRefusalError(
      'C4V_MISSING_PAGE_COLUMNS',
      'Refused: the .c4v vocabulary database has an unrecognized pages table structure.',
      'touchchat-lamp'
    );
  }

  const selectCols = [
    `${quoteIdentifier(idCol)} AS id`,
    `${quoteIdentifier(resCol)} AS resource_id`,
    nameCol ? `${quoteIdentifier(nameCol)} AS name` : `'' AS name`,
  ].join(', ');

  const pages: PageRow[] = [];
  for (const row of queryRows(db, `SELECT ${selectCols} FROM ${quoteIdentifier(pagesTable)}`)) {
    const id = Number(row.id);
    const resourceId = Number(row.resource_id);
    if (!Number.isFinite(id) || !Number.isFinite(resourceId)) continue;
    const res = resources.get(resourceId);
    const name = cleanText(row.name) || res?.name || `Page ${id}`;
    const rid = res?.rid || `PAGE_${id}`;
    pages.push({ id, resourceId, rid, name });
  }
  return pages;
}

function readButtonBoxes(db: Database, table: string): Map<number, ButtonBoxRow> {
  const cols = listColumns(db, table);
  const idCol = findColumnCaseInsensitive(cols, ['id']);
  const resCol = findColumnCaseInsensitive(cols, ['resource_id']);
  const xCol = findColumnCaseInsensitive(cols, ['layout_x', 'columns', 'cols', 'grid_x']);
  const yCol = findColumnCaseInsensitive(cols, ['layout_y', 'rows', 'grid_y']);
  if (!idCol || !xCol || !yCol) {
    throw new ParserRefusalError(
      'C4V_MISSING_BOX_COLUMNS',
      'Refused: the .c4v vocabulary database is missing grid layout columns in button_boxes.',
      'touchchat-lamp'
    );
  }

  const selectCols = [
    `${quoteIdentifier(idCol)} AS id`,
    resCol ? `${quoteIdentifier(resCol)} AS resource_id` : `0 AS resource_id`,
    `${quoteIdentifier(xCol)} AS layout_x`,
    `${quoteIdentifier(yCol)} AS layout_y`,
  ].join(', ');

  const map = new Map<number, ButtonBoxRow>();
  for (const row of queryRows(db, `SELECT ${selectCols} FROM ${quoteIdentifier(table)}`)) {
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    map.set(id, {
      id,
      resourceId: Number(row.resource_id) || 0,
      layoutX: Math.max(1, Number(row.layout_x) || 1),
      layoutY: Math.max(1, Number(row.layout_y) || 1),
    });
  }
  return map;
}

function readButtons(db: Database, table: string): {
  byId: Map<number, ButtonRow>;
  byResourceId: Map<number, ButtonRow>;
} {
  const cols = listColumns(db, table);
  const idCol = findColumnCaseInsensitive(cols, ['id']);
  const resCol = findColumnCaseInsensitive(cols, ['resource_id']);
  const labelCol = findColumnCaseInsensitive(cols, ['label', 'text', 'title']);
  const msgCol = findColumnCaseInsensitive(cols, ['message', 'vocalization', 'speech']);
  const visCol = findColumnCaseInsensitive(cols, ['visible', 'is_visible']);
  if (!idCol || !resCol || !labelCol) {
    throw new ParserRefusalError(
      'C4V_MISSING_BUTTON_COLUMNS',
      'Refused: the .c4v vocabulary database has an unrecognized buttons table structure.',
      'touchchat-lamp'
    );
  }

  const selectCols = [
    `${quoteIdentifier(idCol)} AS id`,
    `${quoteIdentifier(resCol)} AS resource_id`,
    `${quoteIdentifier(labelCol)} AS label`,
    msgCol ? `${quoteIdentifier(msgCol)} AS message` : `'' AS message`,
    visCol ? `${quoteIdentifier(visCol)} AS visible` : `1 AS visible`,
  ].join(', ');

  const byId = new Map<number, ButtonRow>();
  const byResourceId = new Map<number, ButtonRow>();
  for (const row of queryRows(db, `SELECT ${selectCols} FROM ${quoteIdentifier(table)}`)) {
    const id = Number(row.id);
    const resourceId = Number(row.resource_id);
    if (!Number.isFinite(id) || !Number.isFinite(resourceId)) continue;
    const item: ButtonRow = {
      id,
      resourceId,
      label: cleanText(row.label),
      message: cleanText(row.message),
      visible: row.visible === null || row.visible === undefined ? true : Number(row.visible) !== 0,
    };
    byId.set(id, item);
    byResourceId.set(resourceId, item);
  }
  return { byId, byResourceId };
}

/**
 * Resolves type-5 button sets (`button_sets` + `button_set_modifiers`) to their base type-4 button
 * (`modifier = 0`, falling back to lowest modifier if modifier 0 is missing).
 */
function readButtonSetBaseButtons(
  db: Database,
  tableSet: Set<string>,
  buttonsById: Map<number, ButtonRow>
): Map<number, ButtonRow> {
  const bySetResourceId = new Map<number, ButtonRow>();
  const setsTable = findTable(tableSet, 'button_sets');
  const modsTable = findTable(tableSet, 'button_set_modifiers');
  if (!setsTable || !modsTable) return bySetResourceId;

  const setCols = listColumns(db, setsTable);
  const setIdCol = findColumnCaseInsensitive(setCols, ['id']);
  const setResCol = findColumnCaseInsensitive(setCols, ['resource_id']);
  const modCols = listColumns(db, modsTable);
  const modSetIdCol = findColumnCaseInsensitive(modCols, ['button_set_id']);
  const modBtnIdCol = findColumnCaseInsensitive(modCols, ['button_id']);
  const modNumCol = findColumnCaseInsensitive(modCols, ['modifier', 'modifier_id']);
  if (!setIdCol || !setResCol || !modSetIdCol || !modBtnIdCol) return bySetResourceId;

  const setIdToResId = new Map<number, number>();
  for (const row of queryRows(
    db,
    `SELECT ${quoteIdentifier(setIdCol)} AS id, ${quoteIdentifier(setResCol)} AS rid FROM ${quoteIdentifier(setsTable)}`
  )) {
    const id = Number(row.id);
    const rid = Number(row.rid);
    if (Number.isFinite(id) && Number.isFinite(rid)) {
      setIdToResId.set(id, rid);
    }
  }

  const bestModifier = new Map<number, { modifier: number; button: ButtonRow }>();
  const modSql = `SELECT ${quoteIdentifier(modSetIdCol)} AS set_id, ${quoteIdentifier(modBtnIdCol)} AS btn_id, ${
    modNumCol ? `${quoteIdentifier(modNumCol)} AS modifier` : `0 AS modifier`
  } FROM ${quoteIdentifier(modsTable)}`;

  for (const row of queryRows(db, modSql)) {
    const setId = Number(row.set_id);
    const btnId = Number(row.btn_id);
    const modifier = Number(row.modifier ?? 0);
    const btn = buttonsById.get(btnId);
    if (!btn) continue;
    const prev = bestModifier.get(setId);
    if (!prev || (modifier === 0 && prev.modifier !== 0) || (prev.modifier !== 0 && modifier < prev.modifier)) {
      bestModifier.set(setId, { modifier, button: btn });
    }
  }

  for (const [setId, picked] of bestModifier.entries()) {
    const resId = setIdToResId.get(setId);
    if (resId !== undefined) {
      bySetResourceId.set(resId, picked.button);
    }
  }

  return bySetResourceId;
}

/**
 * Reads navigation actions (codes 8, 9, and 73) mapping a resource_id -> target page RID.
 */
function readNavigationTargets(db: Database, tableSet: Set<string>): Map<number, string> {
  const navByResourceId = new Map<number, string>();
  const actionsTable = findTable(tableSet, 'actions');
  const actionDataTable = findTable(tableSet, 'action_data');
  if (!actionsTable || !actionDataTable) return navByResourceId;

  const aCols = listColumns(db, actionsTable);
  const aIdCol = findColumnCaseInsensitive(aCols, ['id']);
  const aResCol = findColumnCaseInsensitive(aCols, ['resource_id']);
  const aCodeCol = findColumnCaseInsensitive(aCols, ['code', 'action_code']);
  const aRankCol = findColumnCaseInsensitive(aCols, ['rank', 'order', 'seq']);

  const dCols = listColumns(db, actionDataTable);
  const dActCol = findColumnCaseInsensitive(dCols, ['action_id']);
  const dKeyCol = findColumnCaseInsensitive(dCols, ['key', 'data_key']);
  const dValCol = findColumnCaseInsensitive(dCols, ['value', 'data_value']);

  if (!aIdCol || !aResCol || !aCodeCol || !dActCol || !dKeyCol || !dValCol) {
    return navByResourceId;
  }

  const sql = `
    SELECT
      a.${quoteIdentifier(aResCol)} AS resource_id,
      a.${quoteIdentifier(aCodeCol)} AS code,
      ${aRankCol ? `a.${quoteIdentifier(aRankCol)}` : '0'} AS rank,
      d.${quoteIdentifier(dKeyCol)} AS data_key,
      d.${quoteIdentifier(dValCol)} AS data_value
    FROM ${quoteIdentifier(actionsTable)} a
    JOIN ${quoteIdentifier(actionDataTable)} d
      ON d.${quoteIdentifier(dActCol)} = a.${quoteIdentifier(aIdCol)}
    ORDER BY rank ASC, a.${quoteIdentifier(aIdCol)} ASC
  `;

  for (const row of queryRows(db, sql)) {
    const code = Number(row.code);
    const key = Number(row.data_key);
    if (!NAV_ACTION_CODES.has(code) || key !== 0) continue;
    const resourceId = Number(row.resource_id);
    const targetRid = normalizeRid(row.data_value);
    if (!Number.isFinite(resourceId) || !targetRid) continue;
    if (!navByResourceId.has(resourceId)) {
      navByResourceId.set(resourceId, targetRid);
    }
  }

  return navByResourceId;
}

/**
 * Parses a TouchChat or LAMP Words for Life `.ce` file into the common OBF board model.
 */
export async function parseTouchChatCe(
  fileName: string,
  bytes: Uint8Array
): Promise<ObfBoardSet> {
  const entries = safeUnzip(bytes, 'touchchat-lamp');

  // Locate the .c4v vocabulary SQLite database (ignoring Images.c4s, Manifest.c4i, version.txt).
  const c4vEntries = Object.entries(entries).filter(
    ([entryName]) => !entryName.endsWith('/') && entryName.toLowerCase().endsWith('.c4v')
  );

  if (c4vEntries.length === 0) {
    throw new ParserRefusalError(
      'C4V_MISSING',
      'Refused: this ZIP archive does not contain a Saltillo .c4v vocabulary database.',
      'touchchat-lamp'
    );
  }

  const [c4vName, c4vBytes] = c4vEntries[0];
  const db = await openReadOnlySqlite(c4vBytes, 'touchchat-lamp', 'the .c4v vocabulary database');

  try {
    const tableList = listTables(db);
    const tableSet = new Set(tableList);

    const resourcesTable = findTable(tableSet, 'resources');
    const pagesTable = findTable(tableSet, 'pages');
    const boxesTable = findTable(tableSet, 'button_boxes');
    const instancesTable = findTable(tableSet, 'button_box_instances');
    const cellsTable = findTable(tableSet, 'button_box_cells');
    const buttonsTable = findTable(tableSet, 'buttons');

    const missingTables = [
      ['resources', resourcesTable],
      ['pages', pagesTable],
      ['button_boxes', boxesTable],
      ['button_box_instances', instancesTable],
      ['button_box_cells', cellsTable],
      ['buttons', buttonsTable],
    ]
      .filter(([, found]) => !found)
      .map(([name]) => name);

    if (missingTables.length > 0) {
      throw new ParserRefusalError(
        'C4V_MISSING_TABLES',
        `Refused: this .c4v database is missing expected Saltillo tables (${missingTables.join(', ')}).`,
        'touchchat-lamp'
      );
    }

    const variables = readVariables(db, tableSet);
    const stemFallback = c4vName.split('/').pop()?.replace(/\.c4v$/i, '') || fileName.replace(/\.ce$/i, '');
    const vocabularyName = variables.get('name') || stemFallback || 'Unnamed Vocabulary';
    const sourceSystem = detectSaltilloSystem(vocabularyName, fileName);

    const resources = readResources(db, resourcesTable!);
    const pages = readPages(db, pagesTable!, resources);
    if (pages.length === 0) {
      throw new ParserRefusalError(
        'C4V_NO_PAGES',
        'Refused: no pages were found in this .c4v vocabulary file.',
        'touchchat-lamp'
      );
    }

    const pageByRid = new Map<string, PageRow>();
    for (const page of pages) {
      if (page.rid) pageByRid.set(page.rid, page);
    }

    const boxes = readButtonBoxes(db, boxesTable!);
    const { byId: buttonsById, byResourceId: buttonsByResId } = readButtons(db, buttonsTable!);
    const buttonSetsByResId = readButtonSetBaseButtons(db, tableSet, buttonsById);
    const navByResId = readNavigationTargets(db, tableSet);

    // Map each page_id -> its button_box_id(s) via button_box_instances.
    const instCols = listColumns(db, instancesTable!);
    const instPageCol = findColumnCaseInsensitive(instCols, ['page_id']);
    const instBoxCol = findColumnCaseInsensitive(instCols, ['button_box_id', 'box_id']);
    if (!instPageCol || !instBoxCol) {
      throw new ParserRefusalError(
        'C4V_MISSING_INSTANCE_COLUMNS',
        'Refused: button_box_instances is missing page_id or button_box_id columns.',
        'touchchat-lamp'
      );
    }

    const boxesByPageId = new Map<number, number[]>();
    for (const row of queryRows(
      db,
      `SELECT ${quoteIdentifier(instPageCol)} AS page_id, ${quoteIdentifier(instBoxCol)} AS box_id FROM ${quoteIdentifier(instancesTable!)}`
    )) {
      const pageId = Number(row.page_id);
      const boxId = Number(row.box_id);
      if (!Number.isFinite(pageId) || !Number.isFinite(boxId)) continue;
      const list = boxesByPageId.get(pageId) ?? [];
      if (!list.includes(boxId)) list.push(boxId);
      boxesByPageId.set(pageId, list);
    }

    // Read all cells grouped by button_box_id.
    const cellCols = listColumns(db, cellsTable!);
    const cellBoxCol = findColumnCaseInsensitive(cellCols, ['button_box_id', 'box_id']);
    const cellResCol = findColumnCaseInsensitive(cellCols, ['resource_id']);
    const cellLocCol = findColumnCaseInsensitive(cellCols, ['location', 'position', 'cell_index']);
    if (!cellBoxCol || !cellResCol || !cellLocCol) {
      throw new ParserRefusalError(
        'C4V_MISSING_CELL_COLUMNS',
        'Refused: button_box_cells is missing expected layout columns.',
        'touchchat-lamp'
      );
    }

    const cellsByBoxId = new Map<number, Array<{ resourceId: number; location: number }>>();
    for (const row of queryRows(
      db,
      `SELECT ${quoteIdentifier(cellBoxCol)} AS box_id, ${quoteIdentifier(cellResCol)} AS resource_id, ${quoteIdentifier(cellLocCol)} AS location FROM ${quoteIdentifier(cellsTable!)} ORDER BY ${quoteIdentifier(cellLocCol)} ASC`
    )) {
      const boxId = Number(row.box_id);
      const resourceId = Number(row.resource_id);
      const location = Number(row.location);
      if (!Number.isFinite(boxId) || !Number.isFinite(resourceId) || !Number.isFinite(location)) {
        continue;
      }
      const list = cellsByBoxId.get(boxId) ?? [];
      list.push({ resourceId, location });
      cellsByBoxId.set(boxId, list);
    }

    // Assemble OBF boards for every page.
    const boards: ObfBoard[] = [];
    for (const page of pages) {
      const pageBoxIds = boxesByPageId.get(page.id) ?? [];
      // Pick the primary (largest capacity) button box on the page.
      let primaryBox: ButtonBoxRow | null = null;
      for (const boxId of pageBoxIds) {
        const candidate = boxes.get(boxId);
        if (!candidate) continue;
        if (
          !primaryBox ||
          candidate.layoutX * candidate.layoutY > primaryBox.layoutX * primaryBox.layoutY
        ) {
          primaryBox = candidate;
        }
      }

      const columns = primaryBox ? primaryBox.layoutX : 1;
      const rows = primaryBox ? primaryBox.layoutY : 1;
      const buttons: ObfButton[] = [];
      const occupied = new Set<string>();

      if (primaryBox) {
        const cells = cellsByBoxId.get(primaryBox.id) ?? [];
        for (const cell of cells) {
          const res = resources.get(cell.resourceId);
          let btnRow: ButtonRow | undefined;

          if (res?.type === RESOURCE_TYPE_BUTTON_SET || buttonSetsByResId.has(cell.resourceId)) {
            btnRow = buttonSetsByResId.get(cell.resourceId);
          } else if (!res || res.type === RESOURCE_TYPE_BUTTON) {
            btnRow = buttonsByResId.get(cell.resourceId);
          } else if (res.type === RESOURCE_TYPE_PAGE) {
            continue;
          }

          if (!btnRow || !btnRow.visible) continue;

          // Navigation may live on the button's own resource_id or the button set's resource_id.
          const targetRid =
            navByResId.get(btnRow.resourceId) ?? navByResId.get(cell.resourceId);
          const targetPage = targetRid ? pageByRid.get(targetRid) : undefined;

          const label = btnRow.label || btnRow.message;
          if (!label && !targetPage) continue;

          const rowIndex = Math.floor(cell.location / columns);
          const colIndex = cell.location % columns;
          const posKey = `${rowIndex},${colIndex}`;
          if (occupied.has(posKey)) continue;
          occupied.add(posKey);

          const message = btnRow.message || btnRow.label;
          buttons.push({
            id: `${page.rid}:${rowIndex}:${colIndex}`,
            row: rowIndex,
            column: colIndex,
            label: label || targetPage?.name || '',
            ...(message && message !== label ? { vocalization: message } : {}),
            ...(targetPage
              ? {
                  loadBoardId: targetPage.rid,
                  loadBoardName: targetPage.name,
                }
              : {}),
          });
        }
      }

      boards.push({
        id: page.rid,
        name: page.name,
        rows,
        columns,
        buttons,
      });
    }

    // Determine home/root page: variables HomePage/StartPage RID, or page named "HOME"/"Home", else first page.
    const homeRidCandidate = normalizeRid(
      variables.get('homepage') ||
        variables.get('home_page') ||
        variables.get('startpage') ||
        variables.get('start_page') ||
        ''
    );
    let rootBoardId: string | null = null;
    if (homeRidCandidate && pageByRid.has(homeRidCandidate)) {
      rootBoardId = homeRidCandidate;
    } else {
      const homeNamed = boards.find((b) => /^(home|main|core)$/i.test(b.name.trim()));
      rootBoardId = homeNamed?.id ?? boards[0]?.id ?? null;
    }

    const orderedBoards = orderBoardsFromRoot(boards, rootBoardId);
    const mainBoard = orderedBoards[0];
    const mainGridSize = mainBoard ? formatGridSize(mainBoard.rows, mainBoard.columns) : '';

    return {
      format: 'open-board-0.1',
      sourceSystem,
      vocabularyName,
      rootBoardId,
      mainGridSize,
      boards: orderedBoards,
      notes: [SYMBOLS_OMITTED_NOTE],
    };
  } finally {
    db.close();
  }
}
