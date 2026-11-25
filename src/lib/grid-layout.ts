import type { VocabButton, VocabPage } from './types';

export interface OpenGridSlot {
  row: number;
  column: number;
}

export interface PagePlacementStats {
  rows: number;
  columns: number;
  totalSlots: number;
  occupiedSlots: number;
  openSlots: number;
  buttonCount: number;
  embeddedSymbolCount: number;
  librarySymbolCount: number;
  textOnlyCount: number;
  linkCount: number;
}

export interface GridPlacementLayout {
  rows: number;
  columns: number;
  /** Visible buttons clamped safely inside [0..rows-1] x [0..columns-1] with span metadata. */
  placedButtons: Array<VocabButton & { rowSpan: number; colSpan: number }>;
  /** Exact unoccupied (row, column) coordinates where new symbols can be placed. */
  openSlots: OpenGridSlot[];
  /** Occupancy matrix [row][column] -> button occupying that cell (or null if open). */
  matrix: Array<Array<VocabButton | null>>;
  stats: PagePlacementStats;
}

export interface SlotNeighbors {
  above: VocabButton | null;
  below: VocabButton | null;
  left: VocabButton | null;
  right: VocabButton | null;
}

/**
 * Computes the exact grid placement matrix for an AAC page, including multi-cell spans
 * and every open/available grid slot where additional symbols can be placed.
 */
export function buildPageGridLayout(page: VocabPage): GridPlacementLayout {
  const rows = Math.max(1, Math.round(page.rows || 1));
  const columns = Math.max(1, Math.round(page.columns || 1));

  const matrix: Array<Array<VocabButton | null>> = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => null)
  );

  const placedButtons: Array<VocabButton & { rowSpan: number; colSpan: number }> = [];
  let embeddedSymbolCount = 0;
  let librarySymbolCount = 0;
  let textOnlyCount = 0;
  let linkCount = 0;

  for (const button of page.buttons) {
    if (button.row < 0 || button.column < 0 || button.row >= rows || button.column >= columns) {
      continue;
    }
    const rowSpan = Math.min(rows - button.row, Math.max(1, Math.round(button.rowSpan ?? 1)));
    const colSpan = Math.min(
      columns - button.column,
      Math.max(1, Math.round(button.colSpan ?? 1))
    );

    if (matrix[button.row][button.column] !== null) continue;

    for (let r = button.row; r < button.row + rowSpan; r++) {
      for (let c = button.column; c < button.column + colSpan; c++) {
        if (matrix[r][c] === null) {
          matrix[r][c] = button;
        }
      }
    }

    placedButtons.push({ ...button, rowSpan, colSpan });

    if (button.symbolImageId) embeddedSymbolCount += 1;
    else if (button.symbolLibraryRef) librarySymbolCount += 1;
    else textOnlyCount += 1;

    if (button.linkTargetPageName || button.linkTargetPageId) {
      linkCount += 1;
    }
  }

  const openSlots: OpenGridSlot[] = [];
  let occupiedSlots = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      if (matrix[r][c] === null) {
        openSlots.push({ row: r, column: c });
      } else {
        occupiedSlots += 1;
      }
    }
  }

  return {
    rows,
    columns,
    placedButtons,
    openSlots,
    matrix,
    stats: {
      rows,
      columns,
      totalSlots: rows * columns,
      occupiedSlots,
      openSlots: openSlots.length,
      buttonCount: placedButtons.length,
      embeddedSymbolCount,
      librarySymbolCount,
      textOnlyCount,
      linkCount,
    },
  };
}

/**
 * Returns the directly adjacent buttons surrounding a grid coordinate (row, column)
 * so an SLP can check semantic and motor-planning proximity when placing a new symbol.
 */
export function getSlotNeighbors(
  layout: GridPlacementLayout,
  row: number,
  column: number
): SlotNeighbors {
  const at = (r: number, c: number): VocabButton | null => {
    if (r < 0 || c < 0 || r >= layout.rows || c >= layout.columns) return null;
    return layout.matrix[r][c];
  };
  return {
    above: at(row - 1, column),
    below: at(row + 1, column),
    left: at(row, column - 1),
    right: at(row, column + 1),
  };
}
