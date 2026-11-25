import { describe, expect, it } from 'vitest';
import { compareSnapshots } from '../snapshot-compare';
import type { VocabSnapshot } from '../types';

function makeFixtureSnapshot(overrides: Partial<VocabSnapshot>): VocabSnapshot {
  return {
    id: 'snap-base',
    importedAt: '2026-09-01T10:00:00.000Z',
    sourceSystem: 'TouchChat',
    sourceFileName: 'baseline.ce',
    vocabularyName: 'WordPower 42',
    gridSize: '6 x 7',
    pageCount: 2,
    buttonCount: 5,
    wordList: ['apple', 'eat', 'more', 'stop', 'want'],
    pages: [
      {
        id: 'home',
        name: 'Home',
        rows: 6,
        columns: 7,
        buttons: [
          { id: '1', row: 0, column: 0, label: 'want', message: 'want' },
          { id: '2', row: 0, column: 1, label: 'more', message: 'more' },
          { id: '3', row: 0, column: 2, label: 'stop', message: 'stop' },
        ],
      },
      {
        id: 'snacks',
        name: 'Snacks',
        rows: 4,
        columns: 5,
        buttons: [
          { id: '4', row: 0, column: 0, label: 'eat', message: 'eat' },
          { id: '5', row: 0, column: 1, label: 'apple', message: 'apple' },
        ],
      },
    ],
    notes: '',
    ...overrides,
  };
}

describe('snapshot-compare', () => {
  it('accurately reports added words, removed words, added/removed pages, and grid size changes', () => {
    const fallSnapshot = makeFixtureSnapshot({ id: 'snap-fall' });

    const springSnapshot = makeFixtureSnapshot({
      id: 'snap-spring',
      importedAt: '2026-11-20T10:00:00.000Z',
      vocabularyName: 'WordPower 60',
      gridSize: '6 x 10',
      pageCount: 2,
      buttonCount: 6,
      // "Want" (capitalized) matches "want" case-insensitively (not added/removed).
      // "apple" removed; "all done", "banana", "recess" added.
      wordList: ['all done', 'banana', 'eat', 'more', 'recess', 'stop', 'Want'],
      pages: [
        {
          id: 'home-new',
          name: 'Home',
          rows: 6,
          columns: 10,
          buttons: [
            { id: '1', row: 0, column: 0, label: 'Want', message: 'want' },
            { id: '2', row: 0, column: 1, label: 'more', message: 'more' },
            { id: '3', row: 0, column: 2, label: 'stop', message: 'stop' },
            { id: '4', row: 0, column: 3, label: 'all done', message: 'all done' },
          ],
        },
        {
          id: 'playground',
          name: 'Playground',
          rows: 6,
          columns: 10,
          buttons: [
            { id: '5', row: 0, column: 0, label: 'recess', message: 'recess' },
            { id: '6', row: 0, column: 1, label: 'banana', message: 'banana' },
          ],
        },
      ],
    });

    const diff = compareSnapshots(fallSnapshot, springSnapshot);

    expect(diff.wordsAdded).toEqual(['all done', 'banana', 'recess']);
    expect(diff.wordsRemoved).toEqual(['apple']);
    expect(diff.pagesAdded.map((p) => p.name)).toEqual(['Playground']);
    expect(diff.pagesRemoved.map((p) => p.name)).toEqual(['Snacks']);

    expect(diff.mainGridChange).toEqual({
      changed: true,
      before: '6 x 7',
      after: '6 x 10',
    });
    expect(diff.pageGridChanges).toEqual([
      {
        pageName: 'Home',
        beforeGrid: '6 x 7',
        afterGrid: '6 x 10',
      },
    ]);
    expect(diff.summary.wordsAddedCount).toBe(3);
    expect(diff.summary.wordsRemovedCount).toBe(1);
    expect(diff.summary.pagesAddedCount).toBe(1);
    expect(diff.summary.pagesRemovedCount).toBe(1);
  });

  it('reports zero changes when comparing identical snapshots', () => {
    const snap = makeFixtureSnapshot({ id: 'same' });
    const diff = compareSnapshots(snap, snap);

    expect(diff.wordsAdded).toEqual([]);
    expect(diff.wordsRemoved).toEqual([]);
    expect(diff.pagesAdded).toEqual([]);
    expect(diff.pagesRemoved).toEqual([]);
    expect(diff.mainGridChange.changed).toBe(false);
    expect(diff.pageGridChanges).toEqual([]);
  });
});
