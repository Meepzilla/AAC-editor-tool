'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileUp,
  FolderOpen,
  Info,
  Loader2,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useProfiles } from '@/hooks/use-profiles';
import { createEmptyProfile } from '@/lib/constants';
import {
  boardSetToSnapshot,
  parseAacFile,
  ParserRefusalError,
  type ObfBoardSet,
  type StructuralInspectionReport,
} from '@/lib/parsers';
import { toSafeErrorMessage } from '@/lib/privacy';
import { cn, formatBytes, getProfileDisplayLabel } from '@/lib/utils';
import { SystemBadge } from './SystemBadge';

interface ImportViewProps {
  preselectedStudentId?: string;
}

interface ParsedReviewState {
  fileName: string;
  boardSet: ObfBoardSet;
  uniqueWordCount: number;
  totalButtonCount: number;
}

interface RefusalState {
  fileName: string;
  code: string;
  message: string;
  inspection?: StructuralInspectionReport;
}

export function ImportView({ preselectedStudentId }: ImportViewProps) {
  const router = useRouter();
  const { profiles, save, attachSnapshot } = useProfiles();

  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [review, setReview] = useState<ParsedReviewState | null>(null);
  const [refusal, setRefusal] = useState<RefusalState | null>(null);

  // Review confirmation form state
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>(() =>
    preselectedStudentId || profiles.length > 0 ? 'existing' : 'new'
  );
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    preselectedStudentId || ''
  );
  const [newInitials, setNewInitials] = useState('');
  const [snapshotNotes, setSnapshotNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedStudentId && profiles.some((p) => p.id === preselectedStudentId)) {
      setTargetMode('existing');
      setSelectedStudentId(preselectedStudentId);
    } else if (!selectedStudentId && profiles.length > 0) {
      setSelectedStudentId(profiles[0].id);
    } else if (profiles.length === 0) {
      setTargetMode('new');
    }
  }, [preselectedStudentId, profiles, selectedStudentId]);

  const processFile = async (file: File) => {
    setParsing(true);
    setReview(null);
    setRefusal(null);
    setSaveError(null);
    setSnapshotNotes('');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const boardSet = await parseAacFile(file.name, bytes);

      const uniqueWords = new Set<string>();
      let totalButtonCount = 0;
      for (const board of boardSet.boards) {
        totalButtonCount += board.buttons.length;
        for (const btn of board.buttons) {
          const clean = btn.label.trim().toLowerCase();
          if (clean) uniqueWords.add(clean);
        }
      }

      setReview({
        fileName: file.name,
        boardSet,
        uniqueWordCount: uniqueWords.size,
        totalButtonCount,
      });
    } catch (err) {
      if (err instanceof ParserRefusalError) {
        setRefusal({
          fileName: file.name,
          code: err.code,
          message: err.message,
          inspection: err.inspection,
        });
      } else {
        setRefusal({
          fileName: file.name,
          code: 'PARSE_ERROR',
          message: toSafeErrorMessage(
            err,
            'This file could not be read as a supported AAC vocabulary export. No snapshot was saved.'
          ),
        });
      }
    } finally {
      setParsing(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      void processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleConfirmSave = async () => {
    if (!review) return;
    setSaveError(null);

    if (targetMode === 'existing' && !selectedStudentId) {
      setSaveError('Choose a student profile to attach this snapshot to.');
      return;
    }
    if (targetMode === 'new' && !newInitials.trim()) {
      setSaveError('Enter student initials (e.g., J.M.) to create a new profile.');
      return;
    }

    setSaving(true);
    try {
      const snapshot = boardSetToSnapshot(
        review.boardSet,
        review.fileName,
        snapshotNotes
      );

      if (targetMode === 'existing') {
        await attachSnapshot(selectedStudentId, snapshot);
        router.push(`/profile/?id=${encodeURIComponent(selectedStudentId)}`);
      } else {
        const profile = createEmptyProfile({
          displayName: newInitials.trim(),
          aacSystem: review.boardSet.sourceSystem,
          vocabularyName: review.boardSet.vocabularyName,
          gridSize: review.boardSet.mainGridSize,
          snapshots: [snapshot],
        });
        const saved = await save(profile);
        router.push(`/profile/?id=${encodeURIComponent(saved.id)}`);
      }
    } catch (err) {
      setSaveError(
        toSafeErrorMessage(err, 'Could not save snapshot to device storage. Please try again.')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Import AAC Vocabulary File
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read a student&rsquo;s real exported page set directly on this device and review what was found before saving.
        </p>
      </div>

      {/* Privacy assurance banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50/70 px-4 py-3.5 text-xs text-teal-950">
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-semibold">100% On-Device Read-Only Parsing</div>
          <p className="text-teal-900/80">
            Files are parsed inside your browser using local WebAssembly SQLite and never leave this iPad.
            Your original AAC export file is never modified, and licensed symbol artwork is never extracted.
          </p>
        </div>
      </div>

      {/* File Drop Zone */}
      {!review && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-colors bg-card',
            dragging ? 'border-primary bg-accent/40' : 'border-border'
          )}
        >
          {parsing ? (
            <div className="space-y-3 py-4">
              <Loader2 className="mx-auto h-9 w-9 animate-spin text-primary" />
              <div className="text-base font-medium text-foreground">
                Reading vocabulary structure on-device…
              </div>
              <p className="text-xs text-muted-foreground">
                Checking container integrity and extracting pages, layouts, labels, messages, and links.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary">
                <FileUp className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">
                  Choose an AAC export file
                </h2>
                <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                  Supports <strong>TouchChat / LAMP Words for Life (.ce)</strong> and{' '}
                  <strong>TD Snap (.sps, .spb)</strong>. Proloquo2Go (.p2gbk, .p2g) files are
                  recognized for safe container inspection.
                </p>
              </div>
              <div>
                <label className="inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors">
                  <FolderOpen className="h-4 w-4" />
                  <span>Select File from iPad / Files</span>
                  <input
                    id="aac-file-input"
                    type="file"
                    accept=".ce,.sps,.spb,.p2gbk,.p2g"
                    onChange={handleFileInputChange}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Refusal / Unmapped Format Card */}
      {refusal && (
        <section
          role="alert"
          className="rounded-2xl border border-amber-300 bg-amber-50/70 p-5 space-y-4"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-800 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-amber-950">
                File Not Imported — Nothing Was Saved
              </h2>
              <p className="text-sm text-amber-900">{refusal.message}</p>
            </div>
          </div>

          {refusal.inspection && (
            <div className="rounded-xl border border-amber-200 bg-card p-4 space-y-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Info className="h-4 w-4 text-primary" />
                <span>Structure-Only Findings (No Vocabulary Words Included)</span>
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <dt className="text-muted-foreground">Extension</dt>
                  <dd className="font-mono font-medium text-foreground">
                    {refusal.inspection.detectedExtension || '(none)'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Container</dt>
                  <dd className="font-mono font-medium text-foreground">
                    {refusal.inspection.container}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Size</dt>
                  <dd className="font-mono font-medium text-foreground">
                    {formatBytes(refusal.inspection.byteSize)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Encrypted Check</dt>
                  <dd className="font-mono font-medium text-foreground">
                    {refusal.inspection.looksEncrypted ? 'Looks encrypted' : 'Unencrypted'}
                  </dd>
                </div>
              </dl>

              {refusal.inspection.entryShapes && refusal.inspection.entryShapes.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <div className="font-medium text-muted-foreground">
                    Generalized container entries ({refusal.inspection.zipEntryCount ?? 0} total):
                  </div>
                  <ul className="space-y-1 font-mono text-[11px] text-foreground">
                    {refusal.inspection.entryShapes.slice(0, 12).map((item) => (
                      <li key={item.shape}>
                        {item.shape} ×{item.count} ({formatBytes(item.bytes)}
                        {item.contentType ? `, ${item.contentType}` : ''})
                        {item.sqliteTables && item.sqliteTables.length > 0 && (
                          <div className="pl-4 text-muted-foreground">
                            SQLite tables:{' '}
                            {item.sqliteTables
                              .map((t) => `${t.table} (${t.rows ?? '?'} rows)`)
                              .join(', ')}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {refusal.inspection.sqliteTables && refusal.inspection.sqliteTables.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-border">
                  <div className="font-medium text-muted-foreground">SQLite tables discovered:</div>
                  <div className="font-mono text-[11px] text-foreground">
                    {refusal.inspection.sqliteTables
                      .map((t) => `${t.table} (${t.rows ?? '?'} rows)`)
                      .join(', ')}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Review Screen (must confirm before saving) */}
      {review && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-teal-200 bg-card p-5 shadow-sm space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Ready to Review — Not Saved Yet</span>
                </div>
                <h2 className="text-xl font-semibold text-foreground">
                  {review.boardSet.vocabularyName}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <SystemBadge system={review.boardSet.sourceSystem} />
                  <span>Source file: {review.fileName}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setReview(null);
                  setRefusal(null);
                  setSaveError(null);
                }}
                className="min-h-[40px] rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-medium text-foreground hover:bg-secondary"
              >
                Choose Different File
              </button>
            </div>

            {/* Summary counts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border bg-background p-3.5">
                <div className="text-xs text-muted-foreground">Pages</div>
                <div className="mt-1 text-2xl font-semibold text-foreground">
                  {review.boardSet.boards.length}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background p-3.5">
                <div className="text-xs text-muted-foreground">Unique Words</div>
                <div className="mt-1 text-2xl font-semibold text-foreground">
                  {review.uniqueWordCount}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background p-3.5">
                <div className="text-xs text-muted-foreground">Total Buttons</div>
                <div className="mt-1 text-2xl font-semibold text-foreground">
                  {review.totalButtonCount}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background p-3.5">
                <div className="text-xs text-muted-foreground">Main Grid Size</div>
                <div className="mt-1 text-2xl font-semibold text-foreground">
                  {review.boardSet.mainGridSize || '—'}
                </div>
              </div>
            </div>

            {review.boardSet.notes.length > 0 && (
              <div className="rounded-xl border border-border bg-secondary/40 px-3.5 py-2.5 text-xs text-muted-foreground space-y-1">
                {review.boardSet.notes.map((note, idx) => (
                  <p key={idx}>{note}</p>
                ))}
              </div>
            )}

            {/* First pages preview */}
            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold text-foreground">
                First Pages Preview ({Math.min(review.boardSet.boards.length, 6)} of{' '}
                {review.boardSet.boards.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {review.boardSet.boards.slice(0, 6).map((board) => (
                  <div
                    key={board.id}
                    className="rounded-xl border border-border bg-background p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-foreground truncate">
                        {board.name}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {board.rows} × {board.columns} · {board.buttons.length} buttons
                      </span>
                    </div>
                    {board.buttons.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">No labeled buttons</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {board.buttons.slice(0, 18).map((btn) => (
                          <span
                            key={btn.id}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-xs text-foreground"
                          >
                            <span>{btn.label}</span>
                            {btn.loadBoardName && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary">
                                <ArrowRight className="h-2.5 w-2.5" />
                                {btn.loadBoardName}
                              </span>
                            )}
                          </span>
                        ))}
                        {board.buttons.length > 18 && (
                          <span className="text-xs text-muted-foreground self-center">
                            +{board.buttons.length - 18} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Confirm & Assign Student */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
            <h3 className="text-base font-semibold text-foreground">
              Save Snapshot to a Student Profile
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={profiles.length === 0}
                onClick={() => setTargetMode('existing')}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors disabled:opacity-50',
                  targetMode === 'existing'
                    ? 'border-primary bg-accent/50'
                    : 'border-border bg-background hover:bg-secondary/50'
                )}
              >
                <Users className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-foreground">Attach to existing student</div>
                  <div className="text-muted-foreground">
                    Adds a dated snapshot to history. Never overwrites existing profile notes.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTargetMode('new')}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
                  targetMode === 'new'
                    ? 'border-primary bg-accent/50'
                    : 'border-border bg-background hover:bg-secondary/50'
                )}
              >
                <UserPlus className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-foreground">Create new student profile</div>
                  <div className="text-muted-foreground">
                    Pre-fills AAC system, vocabulary name, and grid size from this file.
                  </div>
                </div>
              </button>
            </div>

            {targetMode === 'existing' ? (
              <div>
                <label htmlFor="target-student" className="mb-1.5 block text-xs font-medium">
                  Select Student Profile
                </label>
                <select
                  id="target-student"
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-input bg-background px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {getProfileDisplayLabel(p)} ({p.aacSystem}
                      {p.vocabularyName ? ` · ${p.vocabularyName}` : ''})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="new-student-initials" className="mb-1.5 block text-xs font-medium">
                  Student Initials / Display Name *
                </label>
                <input
                  id="new-student-initials"
                  type="text"
                  value={newInitials}
                  onChange={(e) => setNewInitials(e.target.value)}
                  placeholder="e.g., J.M."
                  className="w-full min-h-[44px] rounded-xl border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            <div>
              <label htmlFor="snapshot-notes" className="mb-1.5 block text-xs font-medium">
                Snapshot Notes (Optional)
              </label>
              <textarea
                id="snapshot-notes"
                rows={2}
                value={snapshotNotes}
                onChange={(e) => setSnapshotNotes(e.target.value)}
                placeholder="e.g., Fall IEP baseline export after adding classroom snacks page"
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {saveError && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {saveError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <Link
                href="/"
                className="inline-flex min-h-[44px] items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </Link>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmSave}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{saving ? 'Saving Snapshot…' : 'Confirm & Save Snapshot'}</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
