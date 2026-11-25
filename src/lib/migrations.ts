import {
  AAC_SYSTEMS,
  ACCESS_METHODS,
  COMMUNICATIVE_FUNCTIONS,
  CURRENT_SCHEMA_VERSION,
  MODALITIES,
} from './constants';
import type {
  AacSystem,
  AccessMethod,
  CommunicativeFunction,
  Modality,
  ModelingNote,
  StudentProfile,
  VocabButton,
  VocabPage,
  VocabSnapshot,
} from './types';
import { formatGridSize, generateId, todayIsoDate } from './utils';

type RecordObject = Record<string, unknown>;

type MigrationStep = (record: RecordObject) => RecordObject;

/**
 * Versioned schema upgrade registry.
 * Key N migrates a raw profile object from schemaVersion N to N + 1.
 */
const MIGRATION_STEPS: Record<number, MigrationStep> = {
  // v0 (unversioned / legacy manual shape) -> v1
  0: (record) => {
    const next: RecordObject = { ...record };
    // Support legacy `initials` or `name` keys if an older export used them.
    if (typeof next.displayName !== 'string' || !next.displayName.trim()) {
      const legacyInitials = typeof next.initials === 'string' ? next.initials : '';
      const legacyName = typeof next.name === 'string' ? next.name : '';
      next.displayName = legacyInitials || legacyName || '';
    }
    if (typeof next.showFullName !== 'boolean') {
      next.showFullName = false;
    }
    if (typeof next.photoEnabled !== 'boolean') {
      next.photoEnabled = false;
    }
    if (!Array.isArray(next.modelingNotesLog)) {
      next.modelingNotesLog = [];
    }
    if (!Array.isArray(next.snapshots)) {
      next.snapshots = [];
    }
    next.schemaVersion = 1;
    return next;
  },
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asAacSystem(value: unknown): AacSystem {
  return typeof value === 'string' && (AAC_SYSTEMS as readonly string[]).includes(value)
    ? (value as AacSystem)
    : 'Other';
}

function asAccessMethod(value: unknown): AccessMethod {
  return typeof value === 'string' && (ACCESS_METHODS as readonly string[]).includes(value)
    ? (value as AccessMethod)
    : 'Direct touch';
}

function asModalities(value: unknown): Modality[] {
  if (!Array.isArray(value)) return [];
  const valid = new Set<string>(MODALITIES);
  const unique = new Set<Modality>();
  for (const item of value) {
    if (typeof item === 'string' && valid.has(item)) {
      unique.add(item as Modality);
    }
  }
  return Array.from(unique);
}

function asFunctions(value: unknown): CommunicativeFunction[] {
  if (!Array.isArray(value)) return [];
  const valid = new Set<string>(COMMUNICATIVE_FUNCTIONS);
  const unique = new Set<CommunicativeFunction>();
  for (const item of value) {
    if (typeof item === 'string' && valid.has(item)) {
      unique.add(item as CommunicativeFunction);
    }
  }
  return Array.from(unique);
}

function normalizeModelingNotesLog(value: unknown): ModelingNote[] {
  if (!Array.isArray(value)) return [];
  const result: ModelingNote[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as RecordObject;
    const text = asString(obj.text).trim();
    if (!text) continue;
    const createdAt = asString(obj.createdAt) || new Date().toISOString();
    result.push({
      id: asString(obj.id) || generateId(),
      date: asString(obj.date) || todayIsoDate(),
      text,
      createdAt,
    });
  }
  return result;
}

function normalizeButton(raw: unknown): VocabButton | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as RecordObject;
  const label = asString(obj.label).trim();
  const message = asString(obj.message).trim();
  const linkTargetPageName = asString(obj.linkTargetPageName).trim() || undefined;
  const linkTargetPageId = asString(obj.linkTargetPageId).trim() || undefined;
  return {
    id: asString(obj.id) || generateId(),
    row: typeof obj.row === 'number' && Number.isFinite(obj.row) ? obj.row : 0,
    column: typeof obj.column === 'number' && Number.isFinite(obj.column) ? obj.column : 0,
    label,
    message,
    ...(linkTargetPageName ? { linkTargetPageName } : {}),
    ...(linkTargetPageId ? { linkTargetPageId } : {}),
  };
}

function normalizePage(raw: unknown): VocabPage | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as RecordObject;
  const buttonsRaw = Array.isArray(obj.buttons) ? obj.buttons : [];
  const buttons: VocabButton[] = [];
  for (const btn of buttonsRaw) {
    const normalized = normalizeButton(btn);
    if (normalized) buttons.push(normalized);
  }
  return {
    id: asString(obj.id) || generateId(),
    name: asString(obj.name).trim() || 'Untitled Page',
    rows: typeof obj.rows === 'number' && obj.rows > 0 ? Math.round(obj.rows) : 1,
    columns: typeof obj.columns === 'number' && obj.columns > 0 ? Math.round(obj.columns) : 1,
    buttons,
  };
}

function normalizeSnapshots(value: unknown): VocabSnapshot[] {
  if (!Array.isArray(value)) return [];
  const snapshots: VocabSnapshot[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as RecordObject;
    const pagesRaw = Array.isArray(obj.pages) ? obj.pages : [];
    const pages: VocabPage[] = [];
    for (const p of pagesRaw) {
      const normalized = normalizePage(p);
      if (normalized) pages.push(normalized);
    }
    const wordList = Array.isArray(obj.wordList)
      ? obj.wordList.filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
      : Array.from(
          new Set(
            pages.flatMap((p) => p.buttons.map((b) => b.label.trim()).filter(Boolean))
          )
        ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const buttonCount =
      typeof obj.buttonCount === 'number' && Number.isFinite(obj.buttonCount)
        ? obj.buttonCount
        : pages.reduce((sum, p) => sum + p.buttons.length, 0);
    const pageCount =
      typeof obj.pageCount === 'number' && Number.isFinite(obj.pageCount)
        ? obj.pageCount
        : pages.length;
    const fallbackGrid =
      pages.length > 0 ? formatGridSize(pages[0].rows, pages[0].columns) : '';
    snapshots.push({
      id: asString(obj.id) || generateId(),
      importedAt: asString(obj.importedAt) || new Date().toISOString(),
      sourceSystem: asAacSystem(obj.sourceSystem),
      sourceFileName: asString(obj.sourceFileName),
      vocabularyName: asString(obj.vocabularyName),
      gridSize: asString(obj.gridSize) || fallbackGrid,
      pageCount,
      buttonCount,
      wordList,
      pages,
      notes: asString(obj.notes),
    });
  }
  return snapshots;
}

export interface MigrateProfileResult {
  profile: StudentProfile | null;
  migrated: boolean;
}

/**
 * Migrates any raw stored record forward to `CURRENT_SCHEMA_VERSION`.
 * Returns `{ profile: null, migrated: false }` if the record is unreadable or lacks an id.
 */
export function migrateProfile(raw: unknown): MigrateProfileResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { profile: null, migrated: false };
  }
  let working: RecordObject = { ...(raw as RecordObject) };
  const id = asString(working.id).trim();
  if (!id) {
    return { profile: null, migrated: false };
  }

  const rawVersion =
    typeof working.schemaVersion === 'number' &&
    Number.isInteger(working.schemaVersion) &&
    working.schemaVersion >= 0
      ? working.schemaVersion
      : 0;

  let version = rawVersion;
  let migrated = rawVersion < CURRENT_SCHEMA_VERSION;

  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATION_STEPS[version];
    if (!step) {
      version += 1;
      working.schemaVersion = version;
      migrated = true;
      continue;
    }
    working = step(working);
    version += 1;
    migrated = true;
  }

  const now = new Date().toISOString();
  const photoEnabled = working.photoEnabled === true;
  const profile: StudentProfile = {
    id,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    displayName: asString(working.displayName).trim(),
    fullName: asString(working.fullName).trim() || undefined,
    showFullName: working.showFullName === true,
    photoEnabled,
    photoDataUrl:
      photoEnabled && typeof working.photoDataUrl === 'string' && working.photoDataUrl.startsWith('data:image/')
        ? working.photoDataUrl
        : undefined,
    school: asString(working.school),
    classroom: asString(working.classroom),
    teacher: asString(working.teacher),
    aacSystem: asAacSystem(working.aacSystem),
    vocabularyName: asString(working.vocabularyName),
    gridSize: asString(working.gridSize),
    accessMethod: asAccessMethod(working.accessMethod),
    accessNotes: asString(working.accessNotes),
    motorNotes: asString(working.motorNotes),
    visualNotes: asString(working.visualNotes),
    modalities: asModalities(working.modalities),
    communicativeFunctions: asFunctions(working.communicativeFunctions),
    independenceLevel: asString(working.independenceLevel),
    navigationNotes: asString(working.navigationNotes),
    environmentalSupports: asString(working.environmentalSupports),
    modelingNotes: asString(working.modelingNotes),
    modelingNotesLog: normalizeModelingNotesLog(working.modelingNotesLog),
    snapshots: normalizeSnapshots(working.snapshots),
    reviewDate: asString(working.reviewDate),
    createdAt: asString(working.createdAt) || now,
    updatedAt: asString(working.updatedAt) || now,
  };

  return { profile, migrated };
}

export interface MigrateProfilesResult {
  profiles: StudentProfile[];
  migratedIds: string[];
  skippedCount: number;
}

export function migrateProfiles(rawItems: unknown[]): MigrateProfilesResult {
  const profiles: StudentProfile[] = [];
  const migratedIds: string[] = [];
  let skippedCount = 0;

  for (const item of rawItems) {
    const { profile, migrated } = migrateProfile(item);
    if (!profile) {
      skippedCount += 1;
      continue;
    }
    profiles.push(profile);
    if (migrated) {
      migratedIds.push(profile.id);
    }
  }

  return { profiles, migratedIds, skippedCount };
}
