import { describe, expect, it } from 'vitest';
import { buildPageGridLayout, getSlotNeighbors } from '../grid-layout';
import type { VocabPage } from '../types';

describe('grid-layout (exact symbol positions & open slot planning)', () => {
  const samplePage: VocabPage = {
    id: 'home',
    name: 'Home',
    rows: 2,
    columns: 3,
    buttons: [
      {
        id: 'b1',
        row: 0,
        column: 0,
        label: 'want',
        message: 'want',
        symbolLibraryRef: { library: 'SymbolStix', id: '{SYM-1}' },
      },
      {
        id: 'b2',
        row: 0,
        column: 1,
        colSpan: 2, // spans (0,1) and (0,2)
        label: 'eat',
        message: 'eat',
        symbolImageId: '{IMG-EAT}',
      },
      {
        id: 'b3',
        row: 1,
        column: 0,
        label: 'more',
        message: 'more',
      },
      {
        id: 'b4',
        row: 1,
        column: 2,
        label: 'SNACKS',
        message: 'snacks',
        linkTargetPageName: 'Snacks',
      },
    ],
  };

  it('tracks multi-cell spans, occupied counts, open slot coordinates, and symbol types', () => {
    const layout = buildPageGridLayout(samplePage);

    expect(layout.stats).toEqual({
      rows: 2,
      columns: 3,
      totalSlots: 6,
      occupiedSlots: 5, // 1 + 2 (span) + 1 + 1 = 5
      openSlots: 1,
      buttonCount: 4,
      embeddedSymbolCount: 1,
      librarySymbolCount: 1,
      textOnlyCount: 2,
      linkCount: 1,
    });

    // Only Row 1, Column 1 (0-based) is open!
    expect(layout.openSlots).toEqual([{ row: 1, column: 1 }]);
  });

  it('returns surrounding neighbor buttons around an open slot to guide symbol placement', () => {
    const layout = buildPageGridLayout(samplePage);
    const neighbors = getSlotNeighbors(layout, 1, 1);

    expect(neighbors.above?.label).toBe('eat');
    expect(neighbors.below).toBeNull();
    expect(neighbors.left?.label).toBe('more');
    expect(neighbors.right?.label).toBe('SNACKS');
  });
});
