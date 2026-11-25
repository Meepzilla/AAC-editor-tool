/**
 * Persistent attempt counting with escalating lockout for the passcode gate.
 * Modeled on AscendEd-DataTool's attempt-lockout module.
 *
 * Escalation:
 * - Failures 1–4: no lockout
 * - 5th failure: 1 minute
 * - 6th failure: 5 minutes
 * - 7th failure: 15 minutes
 * - 8th+ failure: 60 minutes
 * Only a successful unlock resets the counter.
 */

const KEY_PREFIX = 'aac_pm_attempt_lockout_v1_';

interface AttemptRecord {
  failures: number;
  lastFailureAt: number;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let customStorage: KeyValueStorage | null = null;
const memoryFallback = new Map<string, AttemptRecord>();

export function configureLockoutStorageForTests(storage: KeyValueStorage | null): void {
  customStorage = storage;
  memoryFallback.clear();
}

function getStorage(): KeyValueStorage | null {
  if (customStorage) return customStorage;
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // Private browsing or unavailable localStorage
  }
  return null;
}

function lockoutMsForFailures(failures: number): number {
  if (failures >= 8) return 60 * 60 * 1000;
  if (failures === 7) return 15 * 60 * 1000;
  if (failures === 6) return 5 * 60 * 1000;
  if (failures === 5) return 60 * 1000;
  return 0;
}

function readRecord(namespace: string): AttemptRecord | null {
  try {
    const store = getStorage();
    const raw = store?.getItem(KEY_PREFIX + namespace);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AttemptRecord>;
    if (
      typeof parsed.failures !== 'number' ||
      !Number.isFinite(parsed.failures) ||
      typeof parsed.lastFailureAt !== 'number' ||
      !Number.isFinite(parsed.lastFailureAt)
    ) {
      return null;
    }
    return { failures: parsed.failures, lastFailureAt: parsed.lastFailureAt };
  } catch {
    return memoryFallback.get(namespace) ?? null;
  }
}

function currentRecord(namespace: string): AttemptRecord | null {
  const stored = readRecord(namespace);
  const memory = memoryFallback.get(namespace) ?? null;
  if (!memory) return stored;
  return !stored || memory.lastFailureAt >= stored.lastFailureAt ? memory : stored;
}

function writeRecord(namespace: string, record: AttemptRecord | null): void {
  const store = getStorage();
  try {
    if (store) {
      if (record) store.setItem(KEY_PREFIX + namespace, JSON.stringify(record));
      else store.removeItem(KEY_PREFIX + namespace);
      memoryFallback.delete(namespace);
      return;
    }
  } catch {
    // Fall through to in-memory record
  }
  if (record) memoryFallback.set(namespace, record);
  else memoryFallback.delete(namespace);
}

export function recordAttempt(namespace: string, success: boolean, now: number = Date.now()): void {
  if (success) {
    writeRecord(namespace, null);
    return;
  }
  const previous = currentRecord(namespace);
  writeRecord(namespace, {
    failures: (previous?.failures ?? 0) + 1,
    lastFailureAt: now,
  });
}

export function getFailureCount(namespace: string): number {
  return currentRecord(namespace)?.failures ?? 0;
}

export function getLockoutRemainingMs(namespace: string, now: number = Date.now()): number {
  const record = currentRecord(namespace);
  if (!record) return 0;
  const lockoutMs = lockoutMsForFailures(record.failures);
  if (lockoutMs <= 0) return 0;
  const effectiveLastFailure = Math.min(record.lastFailureAt, now);
  const remaining = effectiveLastFailure + lockoutMs - now;
  return remaining > 0 ? remaining : 0;
}

export function isLockedOut(namespace: string, now: number = Date.now()): boolean {
  return getLockoutRemainingMs(namespace, now) > 0;
}

export function clearAttempts(namespace: string): void {
  writeRecord(namespace, null);
}
