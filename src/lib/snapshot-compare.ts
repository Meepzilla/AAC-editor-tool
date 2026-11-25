import type { VocabPage, VocabSnapshot } from './types';
import { formatGridSize } from './utils';

export interface PageDiffItem {
  name: string;
  gridSize: string;
  buttonCount: number;
}

export interface PageGridChange {
  pageName: string;
  beforeGrid: string;
  afterGrid: string;
}

export interface SnapshotDiff {
  beforeId: string;
  afterId: string;
  wordsAdded: string[];
  wordsRemoved: string[];
  pagesAdded: PageDiffItem[];
  pagesRemoved: PageDiffItem[];
  mainGridChange: {
    changed: boolean;
    before: string;
    after: string;
  };
  pageGridChanges: PageGridChange[];
  summary: {
    pageCountDelta: number;
    wordCountDelta: number;
    buttonCountDelta: number;
    wordsAddedCount: number;
    wordsRemovedCount: number;
    pagesAddedCount: number;
    pagesRemovedCount: number;
  };
}

function buildWordMap(snapshot: VocabSnapshot): Map<string, string> {
  const map = new Map<string, string>();
  const sourceWords =
    snapshot.wordList.length > 0
      ? snapshot.wordList
      : snapshot.pages.flatMap((p) => p.buttons.map((b) => b.label));

  for (const raw of sourceWords) {
    const clean = raw.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!map.has(key)) {
      map.set(key, clean);
    }
  }
  return map;
}

function buildPageMap(pages: VocabPage[]): Map<string, VocabPage> {
  const map = new Map<string, VocabPage>();
  for (const page of pages) {
    const key = page.name.trim().toLowerCase();
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, page);
    }
  }
  return map;
}

function normalizeGridLabel(grid: string): string {
  return grid.trim().replace(/\s*[x×]\s*/gi, ' x ');
}

function sortAlpha(items: string[]): string[] {
  return [...items].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Compares two VocabSnapshots of one student (`before` -> `after`) and reports:
 * - words added & words removed (case-insensitive matching)
 * - pages added & pages removed (matched by page name)
 * - main grid size change & per-page grid size changes on shared pages
 */
export function compareSnapshots(before: VocabSnapshot, after: VocabSnapshot): SnapshotDiff {
  const beforeWords = buildWordMap(before);
  const afterWords = buildWordMap(after);

  const wordsAdded: string[] = [];
  for (const [key, display] of afterWords.entries()) {
    if (!beforeWords.has(key)) {
      wordsAdded.push(display);
    }
  }

  const wordsRemoved: string[] = [];
  for (const [key, display] of beforeWords.entries()) {
    if (!afterWords.has(key)) {
      wordsRemoved.push(display);
    }
  }

  const beforePages = buildPageMap(before.pages);
  const afterPages = buildPageMap(after.pages);

  const pagesAdded: PageDiffItem[] = [];
  for (const [key, page] of afterPages.entries()) {
    if (!beforePages.has(key)) {
      pagesAdded.push({
        name: page.name,
        gridSize: formatGridSize(page.rows, page.columns),
        buttonCount: page.buttons.length,
      });
    }
  }

  const pagesRemoved: PageDiffItem[] = [];
  for (const [key, page] of beforePages.entries()) {
    if (!afterPages.has(key)) {
      pagesRemoved.push({
        name: page.name,
        gridSize: formatGridSize(page.rows, page.columns),
        buttonCount: page.buttons.length,
      });
    }
  }

  const pageGridChanges: PageGridChange[] = [];
  for (const [key, afterPage] of afterPages.entries()) {
    const beforePage = beforePages.get(key);
    if (!beforePage) continue;
    const beforeGrid = formatGridSize(beforePage.rows, beforePage.columns);
    const afterGrid = formatGridSize(afterPage.rows, afterPage.columns);
    if (beforeGrid && afterGrid && beforeGrid !== afterGrid) {
      pageGridChanges.push({
        pageName: afterPage.name,
        beforeGrid,
        afterGrid,
      });
    }
  }

  const beforeMainGrid = normalizeGridLabel(
    before.gridSize ||
      (before.pages[0] ? formatGridSize(before.pages[0].rows, before.pages[0].columns) : '')
  );
  const afterMainGrid = normalizeGridLabel(
    after.gridSize ||
      (after.pages[0] ? formatGridSize(after.pages[0].rows, after.pages[0].columns) : '')
  );

  const sortedWordsAdded = sortAlpha(wordsAdded);
  const sortedWordsRemoved = sortAlpha(wordsRemoved);
  pagesAdded.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  pagesRemoved.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  pageGridChanges.sort((a, b) =>
    a.pageName.localeCompare(b.pageName, undefined, { sensitivity: 'base' })
  );

  return {
    beforeId: before.id,
    afterId: after.id,
    wordsAdded: sortedWordsAdded,
    wordsRemoved: sortedWordsRemoved,
    pagesAdded,
    pagesRemoved,
    mainGridChange: {
      changed: Boolean(beforeMainGrid && afterMainGrid && beforeMainGrid !== afterMainGrid),
      before: beforeMainGrid || 'Unknown',
      after: afterMainGrid || 'Unknown',
    },
    pageGridChanges,
    summary: {
      pageCountDelta: after.pageCount - before.pageCount,
      wordCountDelta: afterWords.size - beforeWords.size,
      buttonCountDelta: after.buttonCount - before.buttonCount,
      wordsAddedCount: sortedWordsAdded.length,
      wordsRemovedCount: sortedWordsRemoved.length,
      pagesAddedCount: pagesAdded.length,
      pagesRemovedCount: pagesRemoved.length,
    },
  };
}
