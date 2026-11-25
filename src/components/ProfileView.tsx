'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronUp,
  Edit3,
  FileUp,
  GitCompare,
  Layers,
  MessageSquarePlus,
  Trash2,
} from 'lucide-react';
import { useProfiles } from '@/hooks/use-profiles';
import type { StudentProfile, VocabSnapshot } from '@/lib/types';
import {
  cn,
  formatDateTime,
  formatLocalDate,
  getProfileDisplayLabel,
  reviewDateStatus,
} from '@/lib/utils';
import { QuickNoteModal } from './QuickNoteModal';
import { StudentAvatar } from './StudentAvatar';
import { SystemBadge } from './SystemBadge';

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FieldRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground whitespace-pre-wrap">
        {value && value.trim() ? (
          value
        ) : (
          <span className="italic text-muted-foreground">Not documented</span>
        )}
      </div>
    </div>
  );
}

function SnapshotPreview({ snapshot }: { snapshot: VocabSnapshot }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-teal-200/80 bg-teal-50/50 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-teal-800">
            Latest Vocabulary Snapshot
          </div>
          <div className="mt-0.5 text-base font-semibold text-foreground">
            {snapshot.vocabularyName || snapshot.sourceFileName}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Imported {formatDateTime(snapshot.importedAt)} · {snapshot.sourceSystem}
          </div>
        </div>
        <SystemBadge system={snapshot.sourceSystem} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-border bg-card px-3 py-2.5">
          <div className="text-[11px] text-muted-foreground">Pages</div>
          <div className="text-lg font-semibold text-foreground">{snapshot.pageCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2.5">
          <div className="text-[11px] text-muted-foreground">Unique Words</div>
          <div className="text-lg font-semibold text-foreground">{snapshot.wordList.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2.5">
          <div className="text-[11px] text-muted-foreground">Total Buttons</div>
          <div className="text-lg font-semibold text-foreground">{snapshot.buttonCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2.5">
          <div className="text-[11px] text-muted-foreground">Main Grid</div>
          <div className="text-lg font-semibold text-foreground">
            {snapshot.gridSize || '—'}
          </div>
        </div>
      </div>

      {snapshot.notes && (
        <div className="rounded-lg bg-card/80 px-3 py-2 text-xs text-foreground border border-border">
          <span className="font-medium text-muted-foreground">Snapshot notes: </span>
          {snapshot.notes}
        </div>
      )}

      {snapshot.pages.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span>
              {expanded
                ? 'Hide pages & button labels'
                : `Browse first ${Math.min(snapshot.pages.length, 10)} of ${snapshot.pages.length} pages`}
            </span>
          </button>

          {expanded && (
            <div className="mt-3 space-y-2.5">
              {snapshot.pages.slice(0, 10).map((page) => (
                <div
                  key={page.id}
                  className="rounded-xl border border-border bg-card p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-foreground">{page.name}</span>
                    <span className="text-muted-foreground">
                      {page.rows} × {page.columns} · {page.buttons.length} buttons
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {page.buttons.slice(0, 24).map((btn) => (
                      <span
                        key={btn.id}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                        title={
                          btn.linkTargetPageName
                            ? `Links to ${btn.linkTargetPageName}`
                            : btn.message && btn.message !== btn.label
                            ? `Speaks: ${btn.message}`
                            : undefined
                        }
                      >
                        <span>{btn.label || '(unlabeled)'}</span>
                        {btn.linkTargetPageName && (
                          <span className="text-[10px] font-medium text-primary">
                            → {btn.linkTargetPageName}
                          </span>
                        )}
                      </span>
                    ))}
                    {page.buttons.length > 24 && (
                      <span className="text-xs text-muted-foreground self-center">
                        +{page.buttons.length - 24} more
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ProfileView({ profileId }: { profileId: string }) {
  const router = useRouter();
  const { profiles, loading, addNote, remove } = useProfiles();
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const profile: StudentProfile | undefined = useMemo(
    () => profiles.find((p) => p.id === profileId),
    [profiles, profileId]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl border border-border bg-card" />
        <div className="h-56 animate-pulse rounded-2xl border border-border bg-card" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
        <h1 className="text-lg font-semibold text-foreground">Profile not found</h1>
        <p className="text-sm text-muted-foreground">
          This student profile does not exist on this device or may have been deleted.
        </p>
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
  const reviewState = reviewDateStatus(profile.reviewDate);
  const latestSnapshot = profile.snapshots[0];

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await remove(profile.id);
      router.push('/');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top breadcrumb + action bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Caseload</span>
          </Link>

          <div className="flex items-center gap-4">
            <StudentAvatar profile={profile} size="lg" />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {label}
                </h1>
                <SystemBadge system={profile.aacSystem} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>
                  {[profile.school, profile.classroom, profile.teacher && `Teacher: ${profile.teacher}`]
                    .filter(Boolean)
                    .join(' · ') || 'Placement not set'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span
                    className={cn(
                      reviewState === 'overdue' && 'font-medium text-destructive',
                      reviewState === 'soon' && 'font-medium text-amber-700'
                    )}
                  >
                    Review: {formatLocalDate(profile.reviewDate)}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setQuickNoteOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <MessageSquarePlus className="h-4 w-4" />
            <span>Quick Note</span>
          </button>
          <Link
            href={`/profile/edit/?id=${encodeURIComponent(profile.id)}`}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-secondary transition-colors"
          >
            <Edit3 className="h-4 w-4 text-primary" />
            <span>Edit Profile</span>
          </Link>
          <Link
            href={`/import/?studentId=${encodeURIComponent(profile.id)}`}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-secondary transition-colors"
          >
            <FileUp className="h-4 w-4 text-primary" />
            <span>Import File</span>
          </Link>
        </div>
      </div>

      {/* Section 1: Student & Placement */}
      <SectionCard title="Student & Placement">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FieldRow label="Initials / Default Label" value={profile.displayName} />
          <FieldRow
            label="Full Name (Optional)"
            value={
              profile.fullName
                ? `${profile.fullName} (${profile.showFullName ? 'Shown' : 'Hidden in list'})`
                : 'Not entered'
            }
          />
          <FieldRow label="School" value={profile.school} />
          <FieldRow label="Classroom" value={profile.classroom} />
          <FieldRow label="Teacher" value={profile.teacher} />
          <FieldRow label="Review Date" value={formatLocalDate(profile.reviewDate)} />
          <FieldRow label="Profile Updated" value={formatDateTime(profile.updatedAt)} />
        </div>
      </SectionCard>

      {/* Section 2: AAC System & Layout */}
      <SectionCard title="AAC System & Layout">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FieldRow label="AAC System" value={profile.aacSystem} />
          <FieldRow label="Vocabulary / Page Set" value={profile.vocabularyName} />
          <FieldRow label="Main Grid Size (Rows × Columns)" value={profile.gridSize} />
        </div>
      </SectionCard>

      {/* Section 3: Access, Motor & Visual */}
      <SectionCard title="Access, Motor & Visual Considerations">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FieldRow label="Primary Access Method" value={profile.accessMethod} />
          <FieldRow label="Access Notes" value={profile.accessNotes} />
          <FieldRow label="Motor Notes (Positioning, Endurance, Keyguards)" value={profile.motorNotes} />
          <FieldRow label="Visual Notes (Visual Field, CVI, Symbol Size)" value={profile.visualNotes} />
        </div>
      </SectionCard>

      {/* Section 4: Communication Profile */}
      <SectionCard title="Communication Profile">
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Current Communication Modalities
              </div>
              {profile.modalities.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.modalities.map((mod) => (
                    <span
                      key={mod}
                      className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium capitalize text-teal-900"
                    >
                      {mod}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm italic text-muted-foreground">None selected</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Communicative Functions
              </div>
              {profile.communicativeFunctions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.communicativeFunctions.map((fn) => (
                    <span
                      key={fn}
                      className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium capitalize text-foreground"
                    >
                      {fn}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm italic text-muted-foreground">None selected</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-border">
            <FieldRow label="Independence Level" value={profile.independenceLevel} />
            <FieldRow label="Navigation Notes" value={profile.navigationNotes} />
          </div>
        </div>
      </SectionCard>

      {/* Section 5: Environmental Supports & Modeling */}
      <SectionCard
        title="Environmental Supports & Modeling"
        action={
          <button
            type="button"
            onClick={() => setQuickNoteOpen(true)}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/80"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            <span>Add Dated Note</span>
          </button>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FieldRow label="Environmental Supports" value={profile.environmentalSupports} />
            <FieldRow
              label="Modeling & Prompting Guidance (What Works / What to Avoid)"
              value={profile.modelingNotes}
            />
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Dated Modeling Notes Log ({profile.modelingNotesLog.length})
              </h3>
            </div>
            {profile.modelingNotesLog.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                No dated quick notes yet. Tap &ldquo;Quick Note&rdquo; to record what worked during a session.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {profile.modelingNotesLog.map((note) => (
                  <li
                    key={note.id}
                    className="rounded-xl border border-border bg-background px-4 py-3"
                  >
                    <div className="text-xs font-semibold text-primary">
                      {formatLocalDate(note.date)}
                    </div>
                    <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">
                      {note.text}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Section 6: Vocabulary Snapshots */}
      <SectionCard
        title={`Vocabulary Snapshots (${profile.snapshots.length})`}
        action={
          <div className="flex items-center gap-2">
            {profile.snapshots.length >= 2 && (
              <Link
                href={`/compare/?id=${encodeURIComponent(profile.id)}`}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
              >
                <GitCompare className="h-3.5 w-3.5 text-primary" />
                <span>Compare</span>
              </Link>
            )}
            <Link
              href={`/import/?studentId=${encodeURIComponent(profile.id)}`}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/80"
            >
              <FileUp className="h-3.5 w-3.5" />
              <span>Import Snapshot</span>
            </Link>
          </div>
        }
      >
        {!latestSnapshot ? (
          <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center space-y-2">
            <Layers className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              No vocabulary files imported yet
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Import a TouchChat/LAMP (.ce) or TD Snap (.sps/.spb) export to capture this student&rsquo;s
              pages, grid sizes, links, and word count without hand typing.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <SnapshotPreview snapshot={latestSnapshot} />

            {profile.snapshots.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Snapshot History
                </h3>
                <div className="divide-y divide-border rounded-xl border border-border bg-background">
                  {profile.snapshots.map((snap, idx) => (
                    <div
                      key={snap.id}
                      className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {snap.vocabularyName || snap.sourceFileName}
                          </span>
                          {idx === 0 && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                              Latest
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(snap.importedAt)} · {snap.sourceSystem}
                          {snap.notes ? ` · ${snap.notes}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-medium text-foreground/80">
                        <span>{snap.pageCount} pages</span>
                        <span>·</span>
                        <span>{snap.wordList.length} words</span>
                        {snap.gridSize && (
                          <>
                            <span>·</span>
                            <span>{snap.gridSize}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Danger zone */}
      <div className="rounded-2xl border border-destructive/25 bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-destructive">Delete Student Profile</h2>
            <p className="text-xs text-muted-foreground">
              Permanently removes this profile, its modeling notes log, and its imported snapshots from this device.
            </p>
          </div>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete Profile</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[40px] rounded-xl border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="min-h-[40px] rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          )}
        </div>
      </div>

      <QuickNoteModal
        open={quickNoteOpen}
        studentLabel={label}
        onClose={() => setQuickNoteOpen(false)}
        onSave={async (text, date) => {
          await addNote(profile.id, text, date);
        }}
      />
    </div>
  );
}
