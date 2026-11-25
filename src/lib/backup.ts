import { migrateProfiles } from './migrations';
import { SafeClinicalError } from './privacy';
import type { BackupBundle, StudentProfile } from './types';
import { byDisplayName, todayIsoDate } from './utils';

export const BACKUP_APP_NAME = 'AAC Profile Manager' as const;
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_FILE_BYTES = 50 * 1024 * 1024;
export const LAST_BACKUP_AT_KEY = 'aac_pm_last_backup_at_v1';

export interface SignedBackupBundle extends BackupBundle {
  /** SHA-256 hex digest of the canonical profiles JSON array. */
  checksum?: string;
}

export interface ParsedBackupResult {
  bundle: SignedBackupBundle;
  profiles: StudentProfile[];
  skippedCount: number;
  checksumVerified: boolean;
  totalSnapshots: number;
}

export type RestoreMode = 'merge' | 'replace';

async function sha256Hex(text: string): Promise<string | undefined> {
  if (typeof globalThis === 'undefined' || !globalThis.crypto?.subtle) {
    return undefined;
  }
  const bytes = new TextEncoder().encode(text);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buildBackupBundle(
  profiles: StudentProfile[],
  exportedAt: string = new Date().toISOString()
): Promise<SignedBackupBundle> {
  const ordered = [...profiles].sort(byDisplayName);
  const checksum = await sha256Hex(JSON.stringify(ordered));
  return {
    app: BACKUP_APP_NAME,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt,
    profileCount: ordered.length,
    ...(checksum ? { checksum } : {}),
    profiles: ordered,
  };
}

export function serializeBackupBundle(bundle: SignedBackupBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function backupFileName(now: Date = new Date()): string {
  return `aac-profiles-backup-${todayIsoDate(now)}.json`;
}

/**
 * Validates and parses a JSON backup file without revealing any student data in error messages.
 */
export async function parseAndValidateBackup(rawText: string): Promise<ParsedBackupResult> {
  const byteSize = new TextEncoder().encode(rawText).length;
  if (byteSize > MAX_BACKUP_FILE_BYTES) {
    throw new SafeClinicalError(
      'BACKUP_TOO_LARGE',
      'This backup file exceeds the 50 MB size limit and cannot be imported.'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new SafeClinicalError(
      'BACKUP_INVALID_JSON',
      'This file is not valid JSON. Choose a JSON backup exported from AAC Profile Manager.'
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SafeClinicalError(
      'BACKUP_INVALID_SHAPE',
      'This file is not a valid AAC Profile Manager backup.'
    );
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.app !== BACKUP_APP_NAME) {
    throw new SafeClinicalError(
      'BACKUP_WRONG_APP',
      'This JSON file was not exported by AAC Profile Manager.'
    );
  }

  if (typeof obj.formatVersion !== 'number' || obj.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new SafeClinicalError(
      'BACKUP_UNSUPPORTED_VERSION',
      'This backup uses a newer format version than this copy of AAC Profile Manager supports.'
    );
  }

  if (!Array.isArray(obj.profiles)) {
    throw new SafeClinicalError(
      'BACKUP_MISSING_PROFILES',
      'This backup file does not contain a profiles list.'
    );
  }

  let checksumVerified = false;
  if (typeof obj.checksum === 'string' && obj.checksum.trim()) {
    const computed = await sha256Hex(JSON.stringify(obj.profiles));
    if (computed && computed !== obj.checksum.trim().toLowerCase()) {
      throw new SafeClinicalError(
        'BACKUP_CHECKSUM_MISMATCH',
        'Backup integrity check failed. The file appears damaged or modified.'
      );
    }
    checksumVerified = Boolean(computed);
  }

  const { profiles, skippedCount } = migrateProfiles(obj.profiles);
  const totalSnapshots = profiles.reduce((sum, p) => sum + p.snapshots.length, 0);

  const bundle: SignedBackupBundle = {
    app: BACKUP_APP_NAME,
    formatVersion: obj.formatVersion,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
    profileCount: profiles.length,
    ...(typeof obj.checksum === 'string' ? { checksum: obj.checksum } : {}),
    profiles,
  };

  return {
    bundle,
    profiles: profiles.sort(byDisplayName),
    skippedCount,
    checksumVerified,
    totalSnapshots,
  };
}

/**
 * Merges incoming backup profiles with existing profiles by ID:
 * - New profiles are added.
 * - Existing profiles keep whichever copy has the newer `updatedAt`, while preserving
 *   all unique vocabulary snapshots and modeling notes from both copies.
 */
export function mergeBackupProfiles(
  existing: StudentProfile[],
  incoming: StudentProfile[]
): StudentProfile[] {
  const byId = new Map<string, StudentProfile>();
  for (const profile of existing) {
    byId.set(profile.id, profile);
  }

  for (const next of incoming) {
    const prev = byId.get(next.id);
    if (!prev) {
      byId.set(next.id, next);
      continue;
    }

    const prevTime = Date.parse(prev.updatedAt) || 0;
    const nextTime = Date.parse(next.updatedAt) || 0;
    const winner = nextTime >= prevTime ? next : prev;
    const other = nextTime >= prevTime ? prev : next;

    // Combine snapshots by unique ID, newest importedAt first.
    const snapMap = new Map(winner.snapshots.map((s) => [s.id, s]));
    for (const s of other.snapshots) {
      if (!snapMap.has(s.id)) snapMap.set(s.id, s);
    }
    const mergedSnapshots = Array.from(snapMap.values()).sort(
      (a, b) => (Date.parse(b.importedAt) || 0) - (Date.parse(a.importedAt) || 0)
    );

    // Combine modeling notes by unique ID, newest date/createdAt first.
    const noteMap = new Map(winner.modelingNotesLog.map((n) => [n.id, n]));
    for (const n of other.modelingNotesLog) {
      if (!noteMap.has(n.id)) noteMap.set(n.id, n);
    }
    const mergedNotes = Array.from(noteMap.values()).sort((a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    );

    byId.set(next.id, {
      ...winner,
      snapshots: mergedSnapshots,
      modelingNotesLog: mergedNotes,
    });
  }

  return Array.from(byId.values()).sort(byDisplayName);
}

export function getLastBackupTimestamp(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_BACKUP_AT_KEY) : null;
  } catch {
    return null;
  }
}

export function recordLastBackupTimestamp(iso: string = new Date().toISOString()): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_BACKUP_AT_KEY, iso);
    }
  } catch {
    // ignore
  }
}

export function downloadJsonFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
