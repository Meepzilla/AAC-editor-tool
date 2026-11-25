import { SafeClinicalError } from '../privacy';
import type { AacSystem, VocabButton, VocabPage, VocabSnapshot } from '../types';
import { formatGridSize, generateId } from '../utils';

/**
 * Common Open Board Format (OBF)-shaped board model produced by every AAC format parser.
 * Symbols/artwork are never extracted — only labels, spoken messages, grid layout, and page links.
 */
export interface ObfButton {
  id: string;
  row: number;
  column: number;
  label: string;
  vocalization?: string;
  loadBoardId?: string;
  loadBoardName?: string;
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

export const SYMBOLS_OMITTED_NOTE =
  'Symbol artwork is omitted (licensed symbols are never extracted); labels, spoken messages, grid layout, and page links are preserved.';

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
 * Converts a parsed ObfBoardSet into a storable VocabSnapshot.
 */
export function boardSetToSnapshot(
  boardSet: ObfBoardSet,
  sourceFileName: string,
  notes: string = ''
): VocabSnapshot {
  const pages: VocabPage[] = boardSet.boards.map((board) => {
    const buttons: VocabButton[] = board.buttons.map((btn) => ({
      id: btn.id,
      row: btn.row,
      column: btn.column,
      label: btn.label,
      message: btn.vocalization ?? btn.label,
      ...(btn.loadBoardName ? { linkTargetPageName: btn.loadBoardName } : {}),
      ...(btn.loadBoardId ? { linkTargetPageId: btn.loadBoardId } : {}),
    }));
    return {
      id: board.id,
      name: board.name,
      rows: board.rows,
      columns: board.columns,
      buttons,
    };
  });

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
    notes: notes.trim(),
  };
}
