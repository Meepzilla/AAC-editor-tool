'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  HardDrive,
  KeyRound,
  Lock,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import { useProfiles } from '@/hooks/use-profiles';
import {
  backupFileName,
  buildBackupBundle,
  downloadJsonFile,
  getLastBackupTimestamp,
  mergeBackupProfiles,
  parseAndValidateBackup,
  recordLastBackupTimestamp,
  serializeBackupBundle,
  type ParsedBackupResult,
  type RestoreMode,
} from '@/lib/backup';
import { toSafeErrorMessage } from '@/lib/privacy';
import {
  changePasscode,
  disablePasscode,
  enablePasscode,
  eraseAllDeviceData,
  getAutoLockMinutes,
  isPasscodeEnabled,
  lockNow,
  MIN_PASSCODE_LENGTH,
  setAutoLockMinutes,
} from '@/lib/secure-store';
import { getStorageUsageReport, type StorageUsageReport } from '@/lib/storage-size';
import { formatBytes, formatDateTime } from '@/lib/utils';

const INPUT_CLASS =
  'w-full min-h-[44px] rounded-xl border border-input bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

export function SettingsView() {
  const { profiles, replaceAll, refresh } = useProfiles();

  // Passcode state
  const [passcodeOn, setPasscodeOn] = useState(false);
  const [autoLock, setAutoLock] = useState<number>(15);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [disablePin, setDisablePin] = useState('');
  const [passcodeBusy, setPasscodeBusy] = useState(false);
  const [passcodeFeedback, setPasscodeFeedback] = useState<{
    kind: 'ok' | 'error';
    text: string;
  } | null>(null);

  // Backup state
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<ParsedBackupResult | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('merge');
  const [backupFeedback, setBackupFeedback] = useState<{
    kind: 'ok' | 'error';
    text: string;
  } | null>(null);

  // Storage state
  const [storage, setStorage] = useState<StorageUsageReport | null>(null);

  // Delete all state
  const [deleteStepOpen, setDeleteStepOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadStorage = useCallback(async () => {
    const report = await getStorageUsageReport();
    setStorage(report);
  }, []);

  useEffect(() => {
    setPasscodeOn(isPasscodeEnabled());
    setAutoLock(getAutoLockMinutes());
    setLastBackupAt(getLastBackupTimestamp());
    void loadStorage();
  }, [profiles, loadStorage]);

  const totalSnapshots = profiles.reduce((sum, p) => sum + p.snapshots.length, 0);

  const handleEnablePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasscodeFeedback(null);
    if (newPin.length < MIN_PASSCODE_LENGTH) {
      setPasscodeFeedback({
        kind: 'error',
        text: `Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`,
      });
      return;
    }
    if (newPin !== confirmPin) {
      setPasscodeFeedback({ kind: 'error', text: 'Passcodes do not match.' });
      return;
    }
    setPasscodeBusy(true);
    try {
      await enablePasscode(newPin);
      setAutoLockMinutes(autoLock);
      setPasscodeOn(true);
      setNewPin('');
      setConfirmPin('');
      await refresh();
      setPasscodeFeedback({
        kind: 'ok',
        text: 'Passcode enabled. All stored student profiles are now encrypted on this device.',
      });
    } catch (err) {
      setPasscodeFeedback({
        kind: 'error',
        text: toSafeErrorMessage(err, 'Could not enable passcode protection.'),
      });
    } finally {
      setPasscodeBusy(false);
    }
  };

  const handleChangePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasscodeFeedback(null);
    if (newPin.length < MIN_PASSCODE_LENGTH) {
      setPasscodeFeedback({
        kind: 'error',
        text: `New passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`,
      });
      return;
    }
    if (newPin !== confirmPin) {
      setPasscodeFeedback({ kind: 'error', text: 'New passcodes do not match.' });
      return;
    }
    setPasscodeBusy(true);
    try {
      await changePasscode(currentPin, newPin);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setPasscodeFeedback({ kind: 'ok', text: 'Passcode updated.' });
    } catch (err) {
      setPasscodeFeedback({
        kind: 'error',
        text: toSafeErrorMessage(err, 'Could not update passcode.'),
      });
    } finally {
      setPasscodeBusy(false);
    }
  };

  const handleDisablePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasscodeFeedback(null);
    setPasscodeBusy(true);
    try {
      await disablePasscode(disablePin);
      setDisablePin('');
      setPasscodeOn(false);
      await refresh();
      setPasscodeFeedback({
        kind: 'ok',
        text: 'Passcode protection turned off.',
      });
    } catch (err) {
      setPasscodeFeedback({
        kind: 'error',
        text: toSafeErrorMessage(err, 'Could not turn off passcode protection.'),
      });
    } finally {
      setPasscodeBusy(false);
    }
  };

  const handleExportBackup = async () => {
    setBackupFeedback(null);
    setBackupBusy(true);
    try {
      const bundle = await buildBackupBundle(profiles);
      const json = serializeBackupBundle(bundle);
      downloadJsonFile(backupFileName(), json);
      recordLastBackupTimestamp(bundle.exportedAt);
      setLastBackupAt(bundle.exportedAt);
      setBackupFeedback({
        kind: 'ok',
        text: `Exported ${bundle.profileCount} profile${bundle.profileCount === 1 ? '' : 's'} to a JSON backup file.`,
      });
    } catch (err) {
      setBackupFeedback({
        kind: 'error',
        text: toSafeErrorMessage(err, 'Could not export backup file.'),
      });
    } finally {
      setBackupBusy(false);
    }
  };

  const handleSelectBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBackupFeedback(null);
    setPendingRestore(null);
    try {
      const text = await file.text();
      const parsed = await parseAndValidateBackup(text);
      setPendingRestore(parsed);
      setRestoreMode('merge');
    } catch (err) {
      setBackupFeedback({
        kind: 'error',
        text: toSafeErrorMessage(err, 'Could not read that backup file.'),
      });
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore) return;
    setBackupBusy(true);
    setBackupFeedback(null);
    try {
      const targetProfiles =
        restoreMode === 'merge'
          ? mergeBackupProfiles(profiles, pendingRestore.profiles)
          : pendingRestore.profiles;
      await replaceAll(targetProfiles);
      setPendingRestore(null);
      await loadStorage();
      setBackupFeedback({
        kind: 'ok',
        text:
          restoreMode === 'merge'
            ? `Merged backup cleanly. Caseload now has ${targetProfiles.length} profile${targetProfiles.length === 1 ? '' : 's'}.`
            : `Restored ${targetProfiles.length} profile${targetProfiles.length === 1 ? '' : 's'} from backup.`,
      });
    } catch (err) {
      setBackupFeedback({
        kind: 'error',
        text: toSafeErrorMessage(err, 'Could not restore backup into device storage.'),
      });
    } finally {
      setBackupBusy(false);
    }
  };

  const handleDeleteAll = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') return;
    setDeleteBusy(true);
    try {
      await eraseAllDeviceData();
      setPasscodeOn(false);
      setDeleteConfirmText('');
      setDeleteStepOpen(false);
      await refresh();
      await loadStorage();
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage device passcode protection, JSON backups, and local classroom iPad storage.
        </p>
      </div>

      {/* Section 1: Passcode Gate */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Passcode Protection</h2>
              <p className="text-xs text-muted-foreground">
                Passcode is hashed with PBKDF2-SHA-256 and encrypts profiles on this device.
              </p>
            </div>
          </div>

          <span
            className={
              passcodeOn
                ? 'inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800'
                : 'inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground'
            }
          >
            <Shield className="h-3.5 w-3.5" />
            <span>{passcodeOn ? 'Enabled' : 'Off'}</span>
          </span>
        </div>

        {passcodeFeedback && (
          <div
            role="status"
            className={
              passcodeFeedback.kind === 'ok'
                ? 'flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900'
                : 'rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive'
            }
          >
            {passcodeFeedback.kind === 'ok' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            <span>{passcodeFeedback.text}</span>
          </div>
        )}

        {!passcodeOn ? (
          <form onSubmit={handleEnablePasscode} className="space-y-4 max-w-lg">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="setup-passcode" className="mb-1 block text-xs font-medium">
                  New Passcode (min {MIN_PASSCODE_LENGTH} chars)
                </label>
                <input
                  id="setup-passcode"
                  type="password"
                  autoComplete="new-password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className={INPUT_CLASS}
                  required
                />
              </div>
              <div>
                <label htmlFor="setup-passcode-confirm" className="mb-1 block text-xs font-medium">
                  Confirm Passcode
                </label>
                <input
                  id="setup-passcode-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  className={INPUT_CLASS}
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="setup-autolock" className="mb-1 block text-xs font-medium">
                Auto-lock after inactivity
              </label>
              <select
                id="setup-autolock"
                value={autoLock}
                onChange={(e) => setAutoLock(Number(e.target.value))}
                className={INPUT_CLASS}
              >
                <option value={0}>Immediately when leaving the app</option>
                <option value={5}>5 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={passcodeBusy}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
            >
              <Lock className="h-4 w-4" />
              <span>{passcodeBusy ? 'Encrypting…' : 'Enable Passcode'}</span>
            </button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[240px]">
                <label htmlFor="active-autolock" className="mb-1 block text-xs font-medium">
                  Auto-lock timeout
                </label>
                <select
                  id="active-autolock"
                  value={autoLock}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setAutoLock(next);
                    setAutoLockMinutes(next);
                    setPasscodeFeedback({ kind: 'ok', text: 'Auto-lock preference saved.' });
                  }}
                  className={INPUT_CLASS}
                >
                  <option value={0}>Immediately when leaving the app</option>
                  <option value={5}>5 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => lockNow()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                <Lock className="h-4 w-4 text-primary" />
                <span>Lock Now</span>
              </button>
            </div>

            <form
              onSubmit={handleChangePasscode}
              className="border-t border-border pt-4 space-y-3 max-w-lg"
            >
              <h3 className="text-sm font-semibold text-foreground">Change Passcode</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Current passcode"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  className={INPUT_CLASS}
                  required
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={`New (${MIN_PASSCODE_LENGTH}+ chars)`}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className={INPUT_CLASS}
                  required
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirm new"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  className={INPUT_CLASS}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={passcodeBusy}
                className="inline-flex min-h-[42px] items-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {passcodeBusy ? 'Updating…' : 'Update Passcode'}
              </button>
            </form>

            <form
              onSubmit={handleDisablePasscode}
              className="border-t border-border pt-4 space-y-3 max-w-lg"
            >
              <h3 className="text-sm font-semibold text-foreground">Turn Off Passcode</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter current passcode to turn off"
                  value={disablePin}
                  onChange={(e) => setDisablePin(e.target.value)}
                  className={INPUT_CLASS}
                  required
                />
                <button
                  type="submit"
                  disabled={passcodeBusy}
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-60"
                >
                  Turn Off
                </button>
              </div>
            </form>
          </div>
        )}
      </section>

      {/* Section 2: Backup & Restore */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="border-b border-border pb-3">
          <h2 className="text-base font-semibold text-foreground">Backup & Restore</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Export all profiles, notes, and vocabulary snapshots as one JSON file, or restore a previous backup.
          </p>
        </div>

        {backupFeedback && (
          <div
            role="status"
            className={
              backupFeedback.kind === 'ok'
                ? 'flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900'
                : 'rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive'
            }
          >
            {backupFeedback.kind === 'ok' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            <span>{backupFeedback.text}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={backupBusy}
            onClick={handleExportBackup}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            <span>Export All Profiles (.json)</span>
          </button>

          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            <Upload className="h-4 w-4 text-primary" />
            <span>Import Backup (.json)</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleSelectBackupFile}
              className="sr-only"
            />
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          {lastBackupAt
            ? `Last backup exported on this device: ${formatDateTime(lastBackupAt)}.`
            : 'No backup exported yet from this device.'}{' '}
          Backup files are plain JSON — store them in an approved secure folder. Imported AAC app files are never modified.
        </p>

        {pendingRestore && (
          <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 space-y-4">
            <div>
              <div className="text-sm font-semibold text-foreground">
                Review Backup Before Importing
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Exported {formatDateTime(pendingRestore.bundle.exportedAt)} ·{' '}
                <strong>{pendingRestore.profiles.length}</strong> profile
                {pendingRestore.profiles.length === 1 ? '' : 's'} ·{' '}
                <strong>{pendingRestore.totalSnapshots}</strong> vocabulary snapshot
                {pendingRestore.totalSnapshots === 1 ? '' : 's'}
                {pendingRestore.checksumVerified ? ' · Integrity verified' : ''}
              </p>
              {pendingRestore.skippedCount > 0 && (
                <p className="mt-1 text-xs text-amber-800">
                  {pendingRestore.skippedCount} unreadable record(s) in this file were skipped.
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex flex-1 items-start gap-2.5 rounded-xl border border-border bg-card p-3 cursor-pointer">
                <input
                  type="radio"
                  name="restore-mode"
                  checked={restoreMode === 'merge'}
                  onChange={() => setRestoreMode('merge')}
                  className="mt-0.5 text-primary focus:ring-ring"
                />
                <div className="text-xs">
                  <div className="font-semibold text-foreground">Merge with existing profiles</div>
                  <div className="text-muted-foreground">
                    Adds missing students and combines unique snapshots and notes.
                  </div>
                </div>
              </label>

              <label className="flex flex-1 items-start gap-2.5 rounded-xl border border-border bg-card p-3 cursor-pointer">
                <input
                  type="radio"
                  name="restore-mode"
                  checked={restoreMode === 'replace'}
                  onChange={() => setRestoreMode('replace')}
                  className="mt-0.5 text-primary focus:ring-ring"
                />
                <div className="text-xs">
                  <div className="font-semibold text-foreground">Replace all current profiles</div>
                  <div className="text-muted-foreground">
                    Overwrites this device&rsquo;s caseload with the backup contents.
                  </div>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPendingRestore(null)}
                className="min-h-[40px] rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={backupBusy}
                onClick={handleConfirmRestore}
                className="min-h-[40px] rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {backupBusy ? 'Importing…' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Section 3: Storage Usage */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 border-b border-border pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">On-Device Storage</h2>
            <p className="text-xs text-muted-foreground">
              Stored locally in IndexedDB with zero cloud upload or network sync.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-background p-3.5">
            <div className="text-xs text-muted-foreground">Student Profiles</div>
            <div className="mt-1 text-xl font-semibold text-foreground">{profiles.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-background p-3.5">
            <div className="text-xs text-muted-foreground">Saved Vocab Snapshots</div>
            <div className="mt-1 text-xl font-semibold text-foreground">{totalSnapshots}</div>
          </div>
          <div className="rounded-xl border border-border bg-background p-3.5">
            <div className="text-xs text-muted-foreground">Profile Database Size</div>
            <div className="mt-1 text-xl font-semibold text-foreground">
              {storage ? formatBytes(storage.profilesBytes) : 'Calculating…'}
            </div>
          </div>
        </div>

        {storage?.browserQuotaBytes && storage.browserUsageBytes !== null && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Browser origin usage (profiles + offline cache)</span>
              <span>
                {formatBytes(storage.browserUsageBytes)} of {formatBytes(storage.browserQuotaBytes)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(1, (storage.browserUsageBytes / storage.browserQuotaBytes) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Section 4: Delete All Data */}
      <section className="rounded-2xl border border-destructive/30 bg-card p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
            <div>
              <h2 className="text-base font-semibold text-destructive">Delete All Data</h2>
              <p className="text-xs text-muted-foreground">
                Permanently erases every student profile, note log, imported snapshot, and passcode setting on this iPad.
              </p>
            </div>
          </div>

          {!deleteStepOpen && (
            <button
              type="button"
              onClick={() => setDeleteStepOpen(true)}
              className="inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-xl border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete All Data</span>
            </button>
          )}
        </div>

        {deleteStepOpen && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <p className="text-xs font-medium text-foreground">
              Export a backup first if you want a copy. Type <strong>DELETE</strong> below to erase everything on this device.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className={INPUT_CLASS}
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteStepOpen(false);
                    setDeleteConfirmText('');
                  }}
                  className="min-h-[44px] rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE' || deleteBusy}
                  onClick={handleDeleteAll}
                  className="min-h-[44px] rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleteBusy ? 'Deleting…' : 'Confirm Erase'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
