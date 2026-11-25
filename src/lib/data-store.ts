/**
 * Student profile data store — the sole read/write boundary over IndexedDB.
 *
 * Components and hooks call only the functions in this module and never touch IndexedDB directly.
 */

import { CURRENT_SCHEMA_VERSION } from './constants';
import * as idb from './indexed-db-store';
import { migrateProfile } from './migrations';
import { SafeClinicalError } from './privacy';
import type { ModelingNote, StudentProfile, VocabSnapshot } from './types';
import { byDisplayName, generateId, todayIsoDate } from './utils';

export interface RecordCodec {
  encode(profile: StudentProfile): Promise<unknown>;
  decode(payload: unknown): Promise<unknown>;
}

const plainCodec: RecordCodec = {
  async encode(profile) {
    return profile;
  },
  async decode(payload) {
    return payload;
  },
};

let activeCodec: RecordCodec = plainCodec;

/**
 * Registers an optional record codec (used by secure-store in Phase 3 to encrypt/decrypt
 * each IndexedDB profile record at rest when a passcode is enabled).
 */
export function setRecordCodec(codec: RecordCodec | null): void {
  activeCodec = codec ?? plainCodec;
}

async function encodeRecord(profile: StudentProfile): Promise<idb.StoredProfileRecord> {
  const payload = await activeCodec.encode(profile);
  return { id: profile.id, payload };
}

async function decodeRecord(record: idb.StoredProfileRecord): Promise<unknown> {
  return activeCodec.decode(record.payload);
}

/** Loads all student profiles, runs migrations if needed, and sorts alphabetically. */
export async function listProfiles(): Promise<StudentProfile[]> {
  const rows = await idb.getAllRawRecords();
  const profiles: StudentProfile[] = [];
  const toPersist: StudentProfile[] = [];

  for (const row of rows) {
    const raw = await decodeRecord(row);
    const { profile, migrated } = migrateProfile(raw);
    if (!profile) continue;
    profiles.push(profile);
    if (migrated) {
      toPersist.push(profile);
    }
  }

  for (const upgraded of toPersist) {
    await idb.putRawRecord(await encodeRecord(upgraded));
  }

  return profiles.sort(byDisplayName);
}

/** Reads a single student profile by ID, returning null if not found. */
export async function getProfile(id: string): Promise<StudentProfile | null> {
  const row = await idb.getRawRecord(id);
  if (!row) return null;
  const raw = await decodeRecord(row);
  const { profile, migrated } = migrateProfile(raw);
  if (!profile) return null;
  if (migrated) {
    await idb.putRawRecord(await encodeRecord(profile));
  }
  return profile;
}

/** Saves (creates or updates) a single student profile record in IndexedDB. */
export async function saveProfile(profile: StudentProfile): Promise<StudentProfile> {
  if (!profile.id || !profile.id.trim()) {
    throw new SafeClinicalError('INVALID_PROFILE_ID', 'Profile record is missing a valid identifier.');
  }
  const now = new Date().toISOString();
  const normalized: StudentProfile = {
    ...profile,
    id: profile.id.trim(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    displayName: profile.displayName.trim(),
    fullName: profile.fullName?.trim() || undefined,
    showFullName: Boolean(profile.showFullName),
    photoEnabled: Boolean(profile.photoEnabled),
    photoDataUrl: profile.photoEnabled ? profile.photoDataUrl : undefined,
    createdAt: profile.createdAt || now,
    updatedAt: now,
  };
  await idb.putRawRecord(await encodeRecord(normalized));
  return normalized;
}

/** Deletes a single student profile by ID. */
export async function deleteProfile(id: string): Promise<void> {
  await idb.deleteRawRecord(id);
}

/** Appends a dated note to the student's modelingNotesLog without modifying other fields. */
export async function appendModelingNote(
  profileId: string,
  text: string,
  date: string = todayIsoDate()
): Promise<StudentProfile> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new SafeClinicalError('EMPTY_NOTE', 'Quick note cannot be empty.');
  }
  const existing = await getProfile(profileId);
  if (!existing) {
    throw new SafeClinicalError('PROFILE_NOT_FOUND', 'Student profile could not be found.');
  }
  const entry: ModelingNote = {
    id: generateId(),
    date: date.trim() || todayIsoDate(),
    text: trimmed,
    createdAt: new Date().toISOString(),
  };
  const updated: StudentProfile = {
    ...existing,
    modelingNotesLog: [entry, ...existing.modelingNotesLog],
    updatedAt: new Date().toISOString(),
  };
  return saveProfile(updated);
}

/**
 * Adds a newly confirmed VocabSnapshot to an existing student profile.
 * Never overwrites existing profile clinical notes or filled metadata fields;
 * only fills vocabularyName / gridSize if they are currently blank.
 */
export async function addSnapshotToProfile(
  profileId: string,
  snapshot: VocabSnapshot
): Promise<StudentProfile> {
  const existing = await getProfile(profileId);
  if (!existing) {
    throw new SafeClinicalError('PROFILE_NOT_FOUND', 'Student profile could not be found.');
  }
  const updated: StudentProfile = {
    ...existing,
    vocabularyName: existing.vocabularyName.trim() ? existing.vocabularyName : snapshot.vocabularyName,
    gridSize: existing.gridSize.trim() ? existing.gridSize : snapshot.gridSize,
    snapshots: [snapshot, ...existing.snapshots],
    updatedAt: new Date().toISOString(),
  };
  return saveProfile(updated);
}

/** Replaces all stored profiles (used for full backup restore or re-encryption). */
export async function replaceAllProfiles(profiles: StudentProfile[]): Promise<StudentProfile[]> {
  const now = new Date().toISOString();
  const normalized: StudentProfile[] = [];
  const records: idb.StoredProfileRecord[] = [];
  for (const item of profiles) {
    const { profile } = migrateProfile(item);
    if (!profile) continue;
    const ready: StudentProfile = {
      ...profile,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: profile.createdAt || now,
      updatedAt: profile.updatedAt || now,
    };
    normalized.push(ready);
    records.push(await encodeRecord(ready));
  }
  await idb.replaceAllRawRecords(records);
  return normalized.sort(byDisplayName);
}

/** Removes all student profiles from IndexedDB. */
export async function deleteAllProfiles(): Promise<void> {
  await idb.clearAllRawRecords();
}

/** Returns all raw IndexedDB rows (used only by secure-store during passcode enable/disable re-encryption). */
export async function readAllRawProfileRows(): Promise<idb.StoredProfileRecord[]> {
  return idb.getAllRawRecords();
}

/** Overwrites raw IndexedDB rows (used only by secure-store during passcode enable/disable re-encryption). */
export async function writeAllRawProfileRows(rows: idb.StoredProfileRecord[]): Promise<void> {
  await idb.replaceAllRawRecords(rows);
}

/** Estimates UTF-8 byte size of all stored records in IndexedDB. */
export async function estimateStoredBytes(): Promise<number> {
  const rows = await idb.getAllRawRecords();
  const encoder = new TextEncoder();
  return rows.reduce((sum, row) => sum + encoder.encode(JSON.stringify(row)).length, 0);
}
