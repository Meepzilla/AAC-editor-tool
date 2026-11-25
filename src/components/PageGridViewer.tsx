'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Compass,
  Grid3X3,
  Image as ImageIcon,
  Layers,
  MapPin,
  Plus,
  Sparkles,
} from 'lucide-react';
import {
  buildPageGridLayout,
  getSlotNeighbors,
  type GridPlacementLayout,
} from '@/lib/grid-layout';
import type { VocabButton, VocabPage, VocabSymbolAsset } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PageGridViewerProps {
  pages: VocabPage[];
  symbols?: Record<string, VocabSymbolAsset>;
  initialPageId?: string;
}

type SelectedCell =
  | { kind: 'button'; button: VocabButton & { rowSpan: number; colSpan: number } }
  | { kind: 'open'; row: number; column: number }
  | null;

/** Computes readable foreground ink (#0F172A or #FFFFFF) for a given #RRGGBB background. */
function readableTextForHex(hex?: string): string | undefined {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  // Standard YIQ perceived brightness
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance >= 145 ? '#0F172A' : '#FFFFFF';
}

function shortLibraryTag(library: string): string {
  if (library.toLowerCase().includes('symbolstix')) return 'SymbolStix';
  if (library.toLowerCase().includes('pcs')) return 'PCS';
  return library.length > 14 ? `${library.slice(0, 12)}…` : library;
}

export function PageGridViewer({
  pages,
  symbols,
  initialPageId,
}: PageGridViewerProps) {
  const [selectedPageId, setSelectedPageId] = useState<string>(
    () => initialPageId || pages[0]?.id || ''
  );
  const [history, setHistory] = useState<string[]>([]);
  const [onlyOpenPages, setOnlyOpenPages] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(true);
  const [showCoords, setShowCoords] = useState(true);
  const [selectedCell, setSelectedCell] = useState<SelectedCell>(null);

  useEffect(() => {
    if (pages.length === 0) return;
    if (!pages.some((p) => p.id === selectedPageId)) {
      setSelectedPageId(initialPageId && pages.some((p) => p.id === initialPageId) ? initialPageId : pages[0].id);
      setHistory([]);
      setSelectedCell(null);
    }
  }, [pages, initialPageId, selectedPageId]);

  const pageMetaList = useMemo(
    () =>
      pages.map((page) => {
        const layout = buildPageGridLayout(page);
        return { page, stats: layout.stats };
      }),
    [pages]
  );

  const visiblePageChoices = useMemo(
    () =>
      onlyOpenPages
        ? pageMetaList.filter((item) => item.stats.openSlots > 0)
        : pageMetaList,
    [pageMetaList, onlyOpenPages]
  );

  const currentPage = useMemo(
    () => pages.find((p) => p.id === selectedPageId) ?? pages[0] ?? null,
    [pages, selectedPageId]
  );

  const layout: GridPlacementLayout | null = useMemo(
    () => (currentPage ? buildPageGridLayout(currentPage) : null),
    [currentPage]
  );

  const openNeighbors = useMemo(() => {
    if (!layout || selectedCell?.kind !== 'open') return null;
    return getSlotNeighbors(layout, selectedCell.row, selectedCell.column);
  }, [layout, selectedCell]);

  if (!currentPage || !layout) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center text-xs text-muted-foreground">
        No pages with grid layout data in this snapshot.
      </div>
    );
  }

  const navigateToPage = (targetIdOrName: { id?: string; name?: string }) => {
    const match =
      (targetIdOrName.id && pages.find((p) => p.id === targetIdOrName.id)) ||
      (targetIdOrName.name &&
        pages.find((p) => p.name.toLowerCase() === targetIdOrName.name!.toLowerCase()));
    if (!match || match.id === currentPage.id) return;
    setHistory((prev) => [...prev, currentPage.id]);
    setSelectedPageId(match.id);
    setSelectedCell(null);
  };

  const navigateBack = () => {
    if (history.length === 0) return;
    const prevId = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setSelectedPageId(prevId);
    setSelectedCell(null);
  };

  const minColPx = layout.columns >= 10 ? 78 : layout.columns >= 7 ? 88 : 96;

  return (
    <div className="space-y-4">
      {/* Toolbar: Page picker + planning toggles */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3.5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {history.length > 0 && (
              <button
                type="button"
                onClick={navigateBack}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-secondary"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </button>
            )}
            <label htmlFor="grid-page-select" className="sr-only">
              Choose page
            </label>
            <select
              id="grid-page-select"
              value={currentPage.id}
              onChange={(e) => {
                setSelectedPageId(e.target.value);
                setHistory([]);
                setSelectedCell(null);
              }}
              className="w-full min-h-[40px] rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {(visiblePageChoices.length > 0 ? visiblePageChoices : pageMetaList).map(
                ({ page, stats }) => (
                  <option key={page.id} value={page.id}>
                    {page.name} ({stats.rows}×{stats.columns} · {stats.occupiedSlots}/{stats.totalSlots} used · {stats.openSlots} open)
                  </option>
                )
              )}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={highlightOpen}
                onChange={(e) => setHighlightOpen(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-input text-primary focus:ring-ring"
              />
              <span>Highlight open cells</span>
            </label>
            <label className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={showCoords}
                onChange={(e) => setShowCoords(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-input text-primary focus:ring-ring"
              />
              <span>Row/Col labels</span>
            </label>
            <label className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={onlyOpenPages}
                onChange={(e) => setOnlyOpenPages(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-input text-primary focus:ring-ring"
              />
              <span>Open pages only</span>
            </label>
          </div>
        </div>

        {/* Page placement metrics */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 font-medium text-foreground">
            <Grid3X3 className="h-3 w-3 text-primary" />
            {layout.rows} rows × {layout.columns} cols
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-muted-foreground">
            <Layers className="h-3 w-3" />
            {layout.stats.occupiedSlots} / {layout.stats.totalSlots} occupied
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold',
              layout.stats.openSlots > 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            )}
          >
            <Plus className="h-3 w-3" />
            {layout.stats.openSlots} open slot{layout.stats.openSlots === 1 ? '' : 's'}
          </span>
          {layout.stats.embeddedSymbolCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 font-medium text-teal-900">
              <ImageIcon className="h-3 w-3" />
              {layout.stats.embeddedSymbolCount} embedded symbol
              {layout.stats.embeddedSymbolCount === 1 ? '' : 's'}
            </span>
          )}
          {layout.stats.librarySymbolCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 font-medium text-sky-900">
              <Sparkles className="h-3 w-3" />
              {layout.stats.librarySymbolCount} built-in library
            </span>
          )}
        </div>
      </div>

      {/* Exact visual AAC grid */}
      <div className="overflow-x-auto rounded-xl border border-border bg-slate-100/70 p-3">
        <div
          style={{
            minWidth: `${layout.columns * minColPx + (showCoords ? 32 : 0)}px`,
          }}
        >
          {/* Optional Column coordinate headers */}
          {showCoords && (
            <div
              className="grid gap-1.5 mb-1.5"
              style={{
                gridTemplateColumns: `28px repeat(${layout.columns}, minmax(0, 1fr))`,
              }}
            >
              <div />
              {Array.from({ length: layout.columns }, (_, colIdx) => (
                <div
                  key={colIdx}
                  className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  C{colIdx + 1}
                </div>
              ))}
            </div>
          )}

          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: showCoords
                ? `28px minmax(0, 1fr)`
                : `minmax(0, 1fr)`,
            }}
          >
            {/* Optional Row coordinate headers */}
            {showCoords && (
              <div
                className="grid gap-1.5"
                style={{
                  gridTemplateRows: `repeat(${layout.rows}, minmax(82px, 1fr))`,
                }}
              >
                {Array.from({ length: layout.rows }, (_, rowIdx) => (
                  <div
                    key={rowIdx}
                    className="flex items-center justify-center text-[10px] font-semibold uppercase text-muted-foreground"
                  >
                    R{rowIdx + 1}
                  </div>
                ))}
              </div>
            )}

            {/* Actual rows × columns button grid */}
            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${layout.rows}, minmax(82px, 1fr))`,
              }}
            >
              {/* Placed buttons at exact (row, column) with span */}
              {layout.placedButtons.map((btn) => {
                const asset = btn.symbolImageId ? symbols?.[btn.symbolImageId] : undefined;
                const isSelected =
                  selectedCell?.kind === 'button' && selectedCell.button.id === btn.id;
                const bg = btn.backgroundColor;
                const fg = btn.textColor ?? readableTextForHex(bg);
                const border = btn.borderColor;
                const isLink = Boolean(btn.linkTargetPageName || btn.linkTargetPageId);

                return (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => setSelectedCell({ kind: 'button', button: btn })}
                    style={{
                      gridRow: `${btn.row + 1} / span ${btn.rowSpan}`,
                      gridColumn: `${btn.column + 1} / span ${btn.colSpan}`,
                      ...(bg ? { backgroundColor: bg } : {}),
                      ...(fg ? { color: fg } : {}),
                      ...(border ? { borderColor: border, borderWidth: '2px' } : {}),
                    }}
                    className={cn(
                      'group relative flex flex-col items-center justify-between rounded-xl border p-1.5 text-center shadow-xs transition-all hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-ring',
                      !bg && 'bg-card text-foreground border-border',
                      isSelected && 'ring-2 ring-primary ring-offset-1'
                    )}
                  >
                    {/* Link indicator corner */}
                    {isLink && (
                      <span
                        title={`Links to ${btn.linkTargetPageName}`}
                        className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-md bg-slate-900/15 text-current"
                      >
                        <ArrowUpRight className="h-3 w-3" />
                      </span>
                    )}

                    {/* Symbol artwork or library symbol marker */}
                    <div className="flex flex-1 w-full items-center justify-center overflow-hidden min-h-[34px]">
                      {asset ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={asset.dataUrl}
                          alt={btn.label || 'AAC symbol'}
                          className="max-h-11 max-w-full object-contain rounded"
                        />
                      ) : btn.symbolLibraryRef ? (
                        <div className="flex flex-col items-center justify-center gap-0.5 opacity-75">
                          <ImageIcon className="h-4 w-4" />
                          <span className="text-[9px] leading-none font-medium">
                            {shortLibraryTag(btn.symbolLibraryRef.library)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[9px] uppercase tracking-wider opacity-40">
                          Text
                        </span>
                      )}
                    </div>

                    {/* Button label */}
                    <span className="w-full truncate text-[11px] font-semibold leading-tight pt-1">
                      {btn.label || '(symbol only)'}
                    </span>
                  </button>
                );
              })}

              {/* Empty / Available grid slots explicitly placed so SLPs can see where new symbols can go */}
              {layout.openSlots.map((slot) => {
                const isSelected =
                  selectedCell?.kind === 'open' &&
                  selectedCell.row === slot.row &&
                  selectedCell.column === slot.column;

                return (
                  <button
                    key={`open-${slot.row}-${slot.column}`}
                    type="button"
                    onClick={() =>
                      setSelectedCell({ kind: 'open', row: slot.row, column: slot.column })
                    }
                    style={{
                      gridRow: `${slot.row + 1} / span 1`,
                      gridColumn: `${slot.column + 1} / span 1`,
                    }}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-1.5 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
                      highlightOpen
                        ? 'border-emerald-400/80 bg-emerald-50/50 text-emerald-900 hover:bg-emerald-100/60'
                        : 'border-border/60 bg-slate-50/40 text-muted-foreground hover:bg-secondary/60',
                      isSelected && 'ring-2 ring-emerald-600 bg-emerald-100/80'
                    )}
                    title={`Open slot at Row ${slot.row + 1}, Column ${slot.column + 1}`}
                  >
                    <Plus className="h-3.5 w-3.5 opacity-75" />
                    <span className="text-[10px] font-medium leading-none">
                      R{slot.row + 1}·C{slot.column + 1}
                    </span>
                    <span className="text-[9px] opacity-75 leading-none">Open</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Cell / Placement Inspector */}
      {selectedCell?.kind === 'button' && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {selectedCell.button.symbolImageId && symbols?.[selectedCell.button.symbolImageId] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={symbols[selectedCell.button.symbolImageId].dataUrl}
                  alt={selectedCell.button.label}
                  className="h-14 w-14 shrink-0 rounded-lg border border-border bg-background object-contain p-1"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary/50 text-muted-foreground">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-foreground">
                    {selectedCell.button.label || '(Unlabeled symbol)'}
                  </span>
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-mono text-foreground">
                    Row {selectedCell.button.row + 1}, Col {selectedCell.button.column + 1}
                    {(selectedCell.button.rowSpan > 1 || selectedCell.button.colSpan > 1) &&
                      ` (span ${selectedCell.button.rowSpan}×${selectedCell.button.colSpan})`}
                  </span>
                </div>
                {selectedCell.button.message &&
                  selectedCell.button.message !== selectedCell.button.label && (
                    <p className="text-xs text-muted-foreground">
                      Speaks: <span className="text-foreground">&ldquo;{selectedCell.button.message}&rdquo;</span>
                    </p>
                  )}
                <p className="text-xs text-muted-foreground">
                  {selectedCell.button.symbolImageId && symbols?.[selectedCell.button.symbolImageId]
                    ? `Embedded symbol image extracted (${symbols[selectedCell.button.symbolImageId].mimeType}${
                        symbols[selectedCell.button.symbolImageId].width
                          ? `, ${symbols[selectedCell.button.symbolImageId].width}×${symbols[selectedCell.button.symbolImageId].height}`
                          : ''
                      })`
                    : selectedCell.button.symbolLibraryRef
                    ? `Built-in symbol reference: ${selectedCell.button.symbolLibraryRef.library} (ID ${selectedCell.button.symbolLibraryRef.id})`
                    : 'No symbol attached (text button)'}
                </p>
              </div>
            </div>

            {(selectedCell.button.linkTargetPageId || selectedCell.button.linkTargetPageName) && (
              <button
                type="button"
                onClick={() =>
                  navigateToPage({
                    id: selectedCell.button.linkTargetPageId,
                    name: selectedCell.button.linkTargetPageName,
                  })
                }
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Compass className="h-3.5 w-3.5" />
                <span>Open &ldquo;{selectedCell.button.linkTargetPageName}&rdquo;</span>
              </button>
            )}
          </div>
        </div>
      )}

      {selectedCell?.kind === 'open' && openNeighbors && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
            <MapPin className="h-4 w-4 text-emerald-700" />
            <span>
              Available Slot: Row {selectedCell.row + 1}, Column {selectedCell.column + 1} on &ldquo;
              {currentPage.name}&rdquo;
            </span>
          </div>
          <p className="text-xs text-emerald-900/90">
            This cell is currently open for adding a new symbol. Nearby surrounding buttons:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {(
              [
                ['Above', openNeighbors.above],
                ['Below', openNeighbors.below],
                ['Left', openNeighbors.left],
                ['Right', openNeighbors.right],
              ] as const
            ).map(([dir, neighbor]) => (
              <div
                key={dir}
                className="rounded-lg border border-emerald-200/80 bg-card px-3 py-2"
              >
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                  {dir}
                </div>
                <div className="mt-0.5 truncate font-medium text-foreground">
                  {neighbor ? (
                    neighbor.label || '(symbol)'
                  ) : (
                    <span className="text-muted-foreground italic">Open / edge</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-primary" />
          Tap any button to inspect its symbol &amp; links, or tap any dashed open cell to see surrounding symbols for placement planning.
        </span>
      </div>
    </div>
  );
}
