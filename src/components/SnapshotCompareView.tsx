'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  FileUp,
  Grid3X3,
  Layers,
  MinusCircle,
  PlusCircle,
  Search,
} from 'lucide-react';
import { useProfiles } from '@/hooks/use-profiles';
import { compareSnapshots } from '@/lib/snapshot-compare';
import { cn, formatDateTime, getProfileDisplayLabel } from '@/lib/utils';

export function SnapshotCompareView({ profileId }: { profileId: string }) {
  const { profiles, loading } = useProfiles();
  const profile = useMemo(() => profiles.find((p) => p.id === profileId), [profiles, profileId]);

  const [beforeId, setBeforeId] = useState('');
  const [afterId, setAfterId] = useState('');
  const [wordFilter, setWordFilter] = useState('');

  useEffect(() => {
    if (!profile || profile.snapshots.length < 2) return;
    // Snapshots are stored newest-first: default Before = [1], After = [0].
    setAfterId((prev) =>
      prev && profile.snapshots.some((s) => s.id === prev) ? prev : profile.snapshots[0].id
    );
    setBeforeId((prev) =>
      prev && profile.snapshots.some((s) => s.id === prev) ? prev : profile.snapshots[1].id
    );
  }, [profile]);

  const beforeSnap = useMemo(
    () => profile?.snapshots.find((s) => s.id === beforeId) ?? null,
    [profile, beforeId]
  );
  const afterSnap = useMemo(
    () => profile?.snapshots.find((s) => s.id === afterId) ?? null,
    [profile, afterId]
  );

  const diff = useMemo(
    () => (beforeSnap && afterSnap ? compareSnapshots(beforeSnap, afterSnap) : null),
    [beforeSnap, afterSnap]
  );

  const filteredAdded = useMemo(() => {
    if (!diff) return [];
    const q = wordFilter.trim().toLowerCase();
    return q ? diff.wordsAdded.filter((w) => w.toLowerCase().includes(q)) : diff.wordsAdded;
  }, [diff, wordFilter]);

  const filteredRemoved = useMemo(() => {
    if (!diff) return [];
    const q = wordFilter.trim().toLowerCase();
    return q ? diff.wordsRemoved.filter((w) => w.toLowerCase().includes(q)) : diff.wordsRemoved;
  }, [diff, wordFilter]);

  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />;
  }

  if (!profile) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
        <h1 className="text-lg font-semibold text-foreground">Student profile not found</h1>
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Caseload</span>
        </Link>
      </div>
    );
  }

  const label = getProfileDisplayLabel(profile);

  return (
    <div className="space-y-6 pb-8">
      <div className="space-y-2">
        <Link
          href={`/profile/?id=${encodeURIComponent(profile.id)}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to {label}&rsquo;s Profile</span>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Compare Vocabulary Snapshots — {label}
        </h1>
        <p className="text-sm text-muted-foreground">
          Compare any two imported vocabulary snapshots to review words added, words removed, pages changed, and grid size updates.
        </p>
      </div>

      {profile.snapshots.length < 2 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center space-y-4">
          <Layers className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              Need at least two snapshots to compare
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {label} currently has {profile.snapshots.length} imported vocabulary snapshot
              {profile.snapshots.length === 1 ? '' : 's'}. Import another export later to track vocabulary growth over time.
            </p>
          </div>
          <Link
            href={`/import/?studentId=${encodeURIComponent(profile.id)}`}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
          >
            <FileUp className="h-4 w-4" />
            <span>Import Vocabulary Snapshot</span>
          </Link>
        </div>
      ) : (
        <>
          {/* Snapshot selectors */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-end gap-3">
              <div>
                <label htmlFor="snap-before" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Before (Earlier Snapshot)
                </label>
                <select
                  id="snap-before"
                  value={beforeId}
                  onChange={(e) => setBeforeId(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-input bg-background px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {profile.snapshots.map((snap) => (
                    <option key={snap.id} value={snap.id}>
                      {snap.vocabularyName || snap.sourceFileName} — {formatDateTime(snap.importedAt)} ({snap.wordList.length} words)
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  const prevBefore = beforeId;
                  setBeforeId(afterId);
                  setAfterId(prevBefore);
                }}
                title="Swap Before and After snapshots"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-medium text-foreground hover:bg-secondary"
              >
                <ArrowLeftRight className="h-4 w-4 text-primary" />
                <span>Swap</span>
              </button>

              <div>
                <label htmlFor="snap-after" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  After (Newer Snapshot)
                </label>
                <select
                  id="snap-after"
                  value={afterId}
                  onChange={(e) => setAfterId(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-input bg-background px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {profile.snapshots.map((snap) => (
                    <option key={snap.id} value={snap.id}>
                      {snap.vocabularyName || snap.sourceFileName} — {formatDateTime(snap.importedAt)} ({snap.wordList.length} words)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {diff && (
            <>
              {/* Summary metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div className="text-xs font-medium text-emerald-800">Words Added</div>
                  <div className="mt-1 text-2xl font-semibold text-emerald-950">
                    +{diff.summary.wordsAddedCount}
                  </div>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                  <div className="text-xs font-medium text-rose-800">Words Removed</div>
                  <div className="mt-1 text-2xl font-semibold text-rose-950">
                    −{diff.summary.wordsRemovedCount}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="text-xs font-medium text-muted-foreground">Pages Added</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">
                    +{diff.summary.pagesAddedCount}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="text-xs font-medium text-muted-foreground">Pages Removed</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">
                    −{diff.summary.pagesRemovedCount}
                  </div>
                </div>
                <div
                  className={cn(
                    'col-span-2 lg:col-span-1 rounded-2xl border p-4 shadow-sm',
                    diff.mainGridChange.changed
                      ? 'border-amber-300 bg-amber-50/80'
                      : 'border-border bg-card'
                  )}
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Grid3X3 className="h-3.5 w-3.5" />
                    <span>Main Grid Size</span>
                  </div>
                  <div className="mt-1 text-base font-semibold text-foreground">
                    {diff.mainGridChange.changed ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span>{diff.mainGridChange.before}</span>
                        <ArrowRight className="h-4 w-4 text-amber-700" />
                        <span>{diff.mainGridChange.after}</span>
                      </span>
                    ) : (
                      <span>{diff.mainGridChange.after} (no change)</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Word Filter */}
              {(diff.wordsAdded.length > 0 || diff.wordsRemoved.length > 0) && (
                <div className="relative max-w-md">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={wordFilter}
                    onChange={(e) => setWordFilter(e.target.value)}
                    placeholder="Filter added or removed words..."
                    className="w-full min-h-[42px] rounded-xl border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}

              {/* Words Added & Removed */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <PlusCircle className="h-4 w-4 text-emerald-700" />
                      <h2 className="text-base font-semibold text-foreground">
                        Words Added ({filteredAdded.length})
                      </h2>
                    </div>
                  </div>
                  {filteredAdded.length === 0 ? (
                    <p className="text-sm italic text-muted-foreground">
                      {diff.wordsAdded.length === 0
                        ? 'No new words were added between these snapshots.'
                        : 'No added words match your filter.'}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-80 overflow-y-auto pr-1">
                      {filteredAdded.map((word) => (
                        <span
                          key={word}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-950"
                        >
                          + {word}
                        </span>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <MinusCircle className="h-4 w-4 text-rose-700" />
                      <h2 className="text-base font-semibold text-foreground">
                        Words Removed ({filteredRemoved.length})
                      </h2>
                    </div>
                  </div>
                  {filteredRemoved.length === 0 ? (
                    <p className="text-sm italic text-muted-foreground">
                      {diff.wordsRemoved.length === 0
                        ? 'No words were removed between these snapshots.'
                        : 'No removed words match your filter.'}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-80 overflow-y-auto pr-1">
                      {filteredRemoved.map((word) => (
                        <span
                          key={word}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-950"
                        >
                          − {word}
                        </span>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* Pages Added & Removed */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
                  <h2 className="border-b border-border pb-3 text-base font-semibold text-foreground">
                    Pages Added ({diff.pagesAdded.length})
                  </h2>
                  {diff.pagesAdded.length === 0 ? (
                    <p className="text-sm italic text-muted-foreground">No new pages added.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-xl border border-border bg-background">
                      {diff.pagesAdded.map((p) => (
                        <li
                          key={p.name}
                          className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm"
                        >
                          <span className="font-medium text-emerald-900">+ {p.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {p.gridSize} · {p.buttonCount} buttons
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
                  <h2 className="border-b border-border pb-3 text-base font-semibold text-foreground">
                    Pages Removed ({diff.pagesRemoved.length})
                  </h2>
                  {diff.pagesRemoved.length === 0 ? (
                    <p className="text-sm italic text-muted-foreground">No pages removed.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-xl border border-border bg-background">
                      {diff.pagesRemoved.map((p) => (
                        <li
                          key={p.name}
                          className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm"
                        >
                          <span className="font-medium text-rose-900">− {p.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {p.gridSize} · {p.buttonCount} buttons
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {/* Per-page grid changes */}
              {diff.pageGridChanges.length > 0 && (
                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
                  <h2 className="border-b border-border pb-3 text-base font-semibold text-foreground">
                    Grid Size Changes on Shared Pages ({diff.pageGridChanges.length})
                  </h2>
                  <ul className="divide-y divide-border rounded-xl border border-border bg-background">
                    {diff.pageGridChanges.map((change) => (
                      <li
                        key={change.pageName}
                        className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm"
                      >
                        <span className="font-medium text-foreground">{change.pageName}</span>
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800">
                          <span>{change.beforeGrid}</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                          <span>{change.afterGrid}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
