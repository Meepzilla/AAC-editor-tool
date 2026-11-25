import { SafeClinicalError } from '../privacy';
import type {
  AacSystem,
  SymbolLibraryRef,
  VocabButton,
  VocabPage,
  VocabSnapshot,
  VocabSymbolAsset,
} from '../types';
import { formatGridSize, generateId } from '../utils';

/**
 * Common Open Board Format (OBF)-shaped board model produced by every AAC format parser.
 * Stores labels, spoken messages, grid placement (row/column/spans), colors, page links,
 * embedded symbol/photo assets from the export file, and built-in library symbol IDs.
 */
export interface ObfButton {
  id: string;
  row: number;
  column: number;
  rowSpan?: number;
  colSpan?: number;
  label: string;
  vocalization?: string;
  loadBoardId?: string;
  loadBoardName?: string;
  symbolImageId?: string;
  symbolLibraryRef?: SymbolLibraryRef;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
}

export interface ObfBoard {
  id: string;
  name: string;
  rows: number;
  columns: number;
  buttons: ObfButton[];
}

export interface ObfBoardSet {
  format: 'open-board-0.1';
  sourceSystem: AacSystem;
  vocabularyName: string;
  rootBoardId: string | null;
  /** Main grid size formatted as "rows x columns" (e.g., "6 x 10"). */
  mainGridSize: string;
  boards: ObfBoard[];
  /** Deduplicated symbol images extracted from the export archive/database. */
  symbols?: Record<string, VocabSymbolAsset>;
  notes: string[];
}

export type DetectedAacFormat =
  | 'touchchat-lamp'
  | 'td-snap'
  | 'proloquo2go'
  | 'unknown';

export interface StructuralInspectionReport {
  detectedExtension: string;
  container: 'zip' | 'sqlite' | 'plist' | 'xml' | 'json' | 'other';
  byteSize: number;
  magicHex: string;
  looksEncrypted: boolean;
  entropy: number;
  zipEntryCount?: number;
  zipEncryptedEntryCount?: number;
  /** Generalized entry shapes (e.g. "*.c4v", "Images.c4s") — never contains student vocabulary text. */
  entryShapes?: Array<{
    shape: string;
    count: number;
    bytes: number;
    contentType?: string;
    sqliteTables?: Array<{ table: string; columns: string[]; rows: number | null }>;
  }>;
  sqliteTables?: Array<{ table: string; columns: string[]; rows: number | null }>;
}

/**
 * Raised when a file cannot be parsed, appears encrypted, or belongs to an unmapped format.
 * By design, error messages name only structural findings (never button labels, word lists, or names).
 */
export class ParserRefusalError extends SafeClinicalError {
  readonly detectedFormat: DetectedAacFormat;
  readonly inspection?: StructuralInspectionReport;

  constructor(
    code: string,
    safeMessage: string,
    detectedFormat: DetectedAacFormat = 'unknown',
    inspection?: StructuralInspectionReport
  ) {
    super(code, safeMessage);
    this.name = 'ParserRefusalError';
    this.detectedFormat = detectedFormat;
    this.inspection = inspection;
  }
}

export function buildSymbolsSummaryNote(
  embeddedCount: number,
  libraryRefCount: number
): string {
  if (embeddedCount > 0 && libraryRefCount > 0) {
    return `Extracted ${embeddedCount} embedded symbol/image file${
      embeddedCount === 1 ? '' : 's'
    } from this export. ${libraryRefCount} button${
      libraryRefCount === 1 ? '' : 's'
    } reference built-in app symbol libraries (whose image artwork lives inside the AAC app on the iPad rather than inside the exported file) and are marked on the grid.`;
  }
  if (embeddedCount > 0) {
    return `Extracted ${embeddedCount} embedded symbol/image file${
      embeddedCount === 1 ? '' : 's'
    } onto their exact grid positions.`;
  }
  if (libraryRefCount > 0) {
    return `${libraryRefCount} button${
      libraryRefCount === 1 ? '' : 's'
    } reference built-in app symbol libraries (their artwork lives inside the AAC app rather than inside the export file); their positions, labels, colors, and open grid slots are mapped below.`;
  }
  return 'Labels, spoken messages, grid layout, open slots, and page links were extracted from this export.';
}

/**
 * Orders boards starting with the root/home page, then breadth-first along page links,
 * followed by any remaining unlinked pages alphabetically.
 */
export function orderBoardsFromRoot(boards: ObfBoard[], rootBoardId: string | null): ObfBoard[] {
  const byId = new Map(boards.map((b) => [b.id, b]));
  const ordered: ObfBoard[] = [];
  const seen = new Set<string>();

  if (rootBoardId && byId.has(rootBoardId)) {
    const queue: string[] = [rootBoardId];
    while (queue.length > 0) {
      const nextId = queue.shift()!;
      if (seen.has(nextId)) continue;
      const board = byId.get(nextId);
      if (!board) continue;
      seen.add(nextId);
      ordered.push(board);
      for (const btn of board.buttons) {
        if (btn.loadBoardId && !seen.has(btn.loadBoardId) && byId.has(btn.loadBoardId)) {
          queue.push(btn.loadBoardId);
        }
      }
    }
  }

  const remaining = boards
    .filter((b) => !seen.has(b.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return [...ordered, ...remaining];
}

/**
 * Converts a parsed ObfBoardSet into a storable VocabSnapshot, preserving deduplicated
 * extracted symbol images, library references, grid spans, and colors.
 */
export function boardSetToSnapshot(
  boardSet: ObfBoardSet,
  sourceFileName: string,
  notes: string = ''
): VocabSnapshot {
  const usedSymbolIds = new Set<string>();

  const pages: VocabPage[] = boardSet.boards.map((board) => {
    const buttons: VocabButton[] = board.buttons.map((btn) => {
      if (btn.symbolImageId) usedSymbolIds.add(btn.symbolImageId);
      return {
        id: btn.id,
        row: btn.row,
        column: btn.column,
        ...(btn.rowSpan && btn.rowSpan > 1 ? { rowSpan: btn.rowSpan } : {}),
        ...(btn.colSpan && btn.colSpan > 1 ? { colSpan: btn.colSpan } : {}),
        label: btn.label,
        message: btn.vocalization ?? btn.label,
        ...(btn.loadBoardName ? { linkTargetPageName: btn.loadBoardName } : {}),
        ...(btn.loadBoardId ? { linkTargetPageId: btn.loadBoardId } : {}),
        ...(btn.symbolImageId ? { symbolImageId: btn.symbolImageId } : {}),
        ...(btn.symbolLibraryRef ? { symbolLibraryRef: btn.symbolLibraryRef } : {}),
        ...(btn.backgroundColor ? { backgroundColor: btn.backgroundColor } : {}),
        ...(btn.borderColor ? { borderColor: btn.borderColor } : {}),
        ...(btn.textColor ? { textColor: btn.textColor } : {}),
      };
    });
    return {
      id: board.id,
      name: board.name,
      rows: board.rows,
      columns: board.columns,
      buttons,
    };
  });

  // Only retain symbol assets referenced by at least one button on an exported page.
  let symbols: Record<string, VocabSymbolAsset> | undefined;
  if (boardSet.symbols) {
    const kept: Record<string, VocabSymbolAsset> = {};
    for (const id of usedSymbolIds) {
      const asset = boardSet.symbols[id];
      if (asset) kept[id] = asset;
    }
    if (Object.keys(kept).length > 0) {
      symbols = kept;
    }
  }

  // Deduplicate words case-insensitively while preserving the first observed capitalization.
  const uniqueWords = new Map<string, string>();
  let buttonCount = 0;
  for (const page of pages) {
    buttonCount += page.buttons.length;
    for (const btn of page.buttons) {
      const clean = btn.label.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (!uniqueWords.has(key)) {
        uniqueWords.set(key, clean);
      }
    }
  }

  const wordList = Array.from(uniqueWords.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  const fallbackGrid =
    pages.length > 0 ? formatGridSize(pages[0].rows, pages[0].columns) : '';

  return {
    id: generateId(),
    importedAt: new Date().toISOString(),
    sourceSystem: boardSet.sourceSystem,
    sourceFileName,
    vocabularyName: boardSet.vocabularyName,
    gridSize: boardSet.mainGridSize || fallbackGrid,
    pageCount: pages.length,
    buttonCount,
    wordList,
    pages,
    ...(symbols ? { symbols } : {}),
    notes: notes.trim(),
  };
}
