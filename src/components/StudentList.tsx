'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownAZ,
  ArrowUpZA,
  Calendar,
  ChevronRight,
  FileUp,
  Layers,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useProfiles } from '@/hooks/use-profiles';
import { AAC_SYSTEMS } from '@/lib/constants';
import {
  countProfilesBySystem,
  filterAndSortProfiles,
  type SortDirection,
} from '@/lib/profile-filters';
import type { AacSystem } from '@/lib/types';
import {
  cn,
  formatLocalDate,
  getProfileDisplayLabel,
  reviewDateStatus,
} from '@/lib/utils';
import { StudentAvatar } from './StudentAvatar';
import { SystemBadge } from './SystemBadge';

export function StudentList() {
  const { profiles, loading, error } = useProfiles();
  const [search, setSearch] = useState('');
  const [selectedSystem, setSelectedSystem] = useState<AacSystem | 'All'>('All');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const counts = useMemo(() => countProfilesBySystem(profiles), [profiles]);
  const filtered = useMemo(
    () =>
      filterAndSortProfiles(profiles, {
        search,
        system: selectedSystem,
        sortDirection,
      }),
    [profiles, search, selectedSystem, sortDirection]
  );

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Student Caseload
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? 'Loading profiles...'
              : `${profiles.length} student profile${profiles.length === 1 ? '' : 's'} stored locally on this device`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/import/"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-secondary transition-colors"
          >
            <FileUp className="h-4 w-4 text-primary" />
            <span>Import AAC File</span>
          </Link>
          <Link
            href="/profile/new/"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>New Profile</span>
          </Link>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {/* Search + Sort toolbar */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="caseload-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by initials, name, vocabulary, school, or teacher..."
              className="w-full min-h-[44px] rounded-xl border border-input bg-background pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl border border-input bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            {sortDirection === 'asc' ? (
              <>
                <ArrowDownAZ className="h-4 w-4 text-primary" />
                <span>Name A–Z</span>
              </>
            ) : (
              <>
                <ArrowUpZA className="h-4 w-4 text-primary" />
                <span>Name Z–A</span>
              </>
            )}
          </button>
        </div>

        {/* System filter pills */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by AAC system">
          {(['All', ...AAC_SYSTEMS] as const).map((system) => {
            const active = selectedSystem === system;
            const count = counts[system] ?? 0;
            return (
              <button
                key={system}
                type="button"
                onClick={() => setSelectedSystem(system)}
                className={cn(
                  'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <span>{system}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[11px] leading-none',
                    active ? 'bg-white/20 text-white' : 'bg-secondary text-foreground'
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Results list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-24 animate-pulse rounded-2xl border border-border bg-card"
            />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-primary">
            <Users className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">
            No student profiles yet
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
            Start building your classroom AAC caseload by creating a profile manually or
            importing a TouchChat, LAMP Words for Life, or TD Snap vocabulary export.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/profile/new/"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              <span>Create First Profile</span>
            </Link>
            <Link
              href="/import/"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
            >
              <FileUp className="h-4 w-4 text-primary" />
              <span>Import Vocabulary File</span>
            </Link>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            No students match your current search or filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setSelectedSystem('All');
            }}
            className="mt-3 inline-flex min-h-[40px] items-center rounded-xl border border-border px-4 py-2 text-sm font-medium text-primary hover:bg-accent"
          >
            Reset search & filters
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm divide-y divide-border">
          {filtered.map((profile) => {
            const label = getProfileDisplayLabel(profile);
            const reviewState = reviewDateStatus(profile.reviewDate);
            const latestSnap = profile.snapshots[0];
            return (
              <Link
                key={profile.id}
                href={`/profile/?id=${encodeURIComponent(profile.id)}`}
                className="group flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-accent/40 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <StudentAvatar profile={profile} />
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                        {label}
                      </span>
                      <SystemBadge system={profile.aacSystem} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">
                        {profile.vocabularyName || 'Vocabulary not specified'}
                        {profile.gridSize ? ` · ${profile.gridSize}` : ''}
                      </span>
                      {(profile.school || profile.classroom) && (
                        <span>
                          {[profile.school, profile.classroom].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {latestSnap && (
                        <span className="inline-flex items-center gap-1 text-teal-800">
                          <Layers className="h-3 w-3" />
                          {latestSnap.pageCount}p · {latestSnap.wordList.length} words
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 sm:justify-end pl-14 sm:pl-0">
                  <div className="text-left sm:text-right">
                    <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Review:</span>
                      <span
                        className={cn(
                          'font-medium',
                          reviewState === 'overdue' && 'text-destructive',
                          reviewState === 'soon' && 'text-amber-700',
                          reviewState === 'ok' && 'text-foreground',
                          reviewState === 'unset' && 'text-muted-foreground'
                        )}
                      >
                        {formatLocalDate(profile.reviewDate)}
                      </span>
                    </div>
                    {reviewState === 'overdue' && (
                      <div className="text-[11px] font-medium text-destructive">
                        Review overdue
                      </div>
                    )}
                    {reviewState === 'soon' && (
                      <div className="text-[11px] font-medium text-amber-700">
                        Review due soon
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
