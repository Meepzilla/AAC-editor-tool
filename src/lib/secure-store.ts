/**
 * Passcode gate & on-device encryption store, modeled on AscendEd-DataTool's secure-store.
 *
 * - The passcode itself is NEVER stored.
 * - A PBKDF2-SHA-256 verification hash (600,000 iterations, random salt) is stored to verify
 *   the passcode in constant time, and a separate PBKDF2-SHA-256 key wraps a random 256-bit
 *   AES-GCM Data Encryption Key (DEK) that encrypts each IndexedDB profile record at rest.
 * - Changing the passcode re-hashes the passcode and re-wraps the DEK without rewriting profiles.
 * - Locking clears the in-memory DEK immediately so student records cannot be decrypted until unlocked.
 */

import {
  clearAttempts,
  getLockoutRemainingMs,
  isLockedOut,
  recordAttempt,
  type KeyValueStorage,
} from './attempt-lockout';
import {
  deleteAllProfiles,
  readAllRawProfileRows,
  setRecordCodec,
  writeAllRawProfileRows,
  type RecordCodec,
} from './data-store';
import { SafeClinicalError } from './privacy';
import type { StudentProfile } from './types';

export const PASSCODE_CONFIG_KEY = 'aac_pm_passcode_v1';
export const AUTO_LOCK_KEY = 'aac_pm_autolock_minutes_v1';
export const PASSCODE_CHANGE_EVENT = 'aac-pm-passcode-change';
export const MIN_PASSCODE_LENGTH = 6;
export const DEFAULT_KDF_ITERATIONS = 600_000;
export const MAX_KDF_ITERATIONS = 5_000_000;

const LOCKOUT_NAMESPACE = 'passcode';
const SALT_BYTES = 16;
const IV_BYTES = 12;
const HASH_BYTES = 32;
const CHECK_TEXT = 'aac-profile-manager-passcode-check-v1';
const ENCRYPTED_FORMAT = 'enc1';

export interface StoredPasscodeConfig {
  version: 1;
  iterations: number;
  /** PBKDF2-SHA-256 verifier string: "pbkdf2:v1:<iterations>:<saltB64>:<hashB64>" */
  passcodeHash: string;
  /** Random salt used to derive the AES-256-GCM wrapping key. */
  wrapSalt: string;
  /** AES-256-GCM wrapped 256-bit DEK (`iv + ciphertext` base64). */
  wrappedDek: string;
  /** Known check string encrypted under the DEK (`iv + ciphertext` base64). */
  checkCiphertext: string;
}

export interface EncryptedPayload {
  __enc: typeof ENCRYPTED_FORMAT;
  data: string;
}

let activeDek: CryptoKey | null = null;
let kdfIterations = DEFAULT_KDF_ITERATIONS;
let customStorage: KeyValueStorage | null = null;
const memoryStorage = new Map<string, string>();

export function configureSecureStoreForTests(options: {
  storage?: KeyValueStorage | null;
  iterations?: number;
}): void {
  if ('storage' in options) {
    customStorage = options.storage ?? null;
  }
  if (typeof options.iterations === 'number') {
    kdfIterations = options.iterations;
  }
  activeDek = null;
  setRecordCodec(null);
  memoryStorage.clear();
}

function getStorage(): KeyValueStorage {
  if (customStorage) return customStorage;
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // Fall back to in-memory storage when localStorage is blocked
  }
  return {
    getItem: (k) => memoryStorage.get(k) ?? null,
    setItem: (k, v) => {
      memoryStorage.set(k, v);
    },
    removeItem: (k) => {
      memoryStorage.delete(k);
    },
  };
}

function requireCrypto(): SubtleCrypto {
  if (typeof globalThis === 'undefined' || !globalThis.crypto?.subtle) {
    throw new SafeClinicalError(
      'NO_WEB_CRYPTO',
      'Passcode encryption requires Web Crypto (HTTPS or localhost).'
    );
  }
  return globalThis.crypto.subtle;
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64, 'base64');
    const out = new Uint8Array(new ArrayBuffer(buf.length));
    out.set(buf);
    return out;
  }
  const binary = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as Partial<EncryptedPayload>).__enc === ENCRYPTED_FORMAT &&
    typeof (value as Partial<EncryptedPayload>).data === 'string'
  );
}

function emitPasscodeEvent(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PASSCODE_CHANGE_EVENT));
  }
}

async function hashPasscode(passcode: string, iterations: number): Promise<string> {
  const subtle = requireCrypto();
  const salt = randomBytes(SALT_BYTES);
  const input = new TextEncoder().encode(`aac-pm-hash:${passcode}`);
  const material = await subtle.importKey('raw', input, 'PBKDF2', false, ['deriveBits']);
  const derived = new Uint8Array(
    await subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      material,
      HASH_BYTES * 8
    )
  );
  return `pbkdf2:v1:${iterations}:${toBase64(salt)}:${toBase64(derived)}`;
}

async function verifyPasscodeHash(passcode: string, stored: string): Promise<boolean> {
  if (!stored.startsWith('pbkdf2:v1:')) return false;
  const parts = stored.split(':');
  if (parts.length !== 5) return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations <= 0 || iterations > MAX_KDF_ITERATIONS) {
    return false;
  }
  try {
    const subtle = requireCrypto();
    const salt = fromBase64(parts[3]);
    const expected = fromBase64(parts[4]);
    if (expected.length < 16 || expected.length > 64) return false;
    const input = new TextEncoder().encode(`aac-pm-hash:${passcode}`);
    const material = await subtle.importKey('raw', input, 'PBKDF2', false, ['deriveBits']);
    const derived = new Uint8Array(
      await subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
        material,
        expected.length * 8
      )
    );
    return constantTimeEqual(derived, expected);
  } catch {
    return false;
  }
}

async function deriveWrappingKey(
  passcode: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<CryptoKey> {
  const subtle = requireCrypto();
  const input = new TextEncoder().encode(`aac-pm-wrap:${passcode}`);
  const material = await subtle.importKey('raw', input, 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptBytes(key: CryptoKey, plaintext: Uint8Array<ArrayBuffer>): Promise<string> {
  const subtle = requireCrypto();
  const iv = randomBytes(IV_BYTES);
  const cipher = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv, 0);
  combined.set(cipher, iv.length);
  return toBase64(combined);
}

async function decryptBytes(key: CryptoKey, encoded: string): Promise<Uint8Array> {
  const subtle = requireCrypto();
  const combined = fromBase64(encoded);
  if (combined.length <= IV_BYTES) {
    throw new SafeClinicalError('CORRUPT_CIPHERTEXT', 'Stored encrypted data is damaged.');
  }
  const iv = combined.slice(0, IV_BYTES);
  const cipher = combined.slice(IV_BYTES);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new Uint8Array(plain);
}

async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedPayload> {
  const utf8 = new TextEncoder().encode(JSON.stringify(value));
  const copy = new Uint8Array(new ArrayBuffer(utf8.length));
  copy.set(utf8);
  return {
    __enc: ENCRYPTED_FORMAT,
    data: await encryptBytes(key, copy),
  };
}

async function decryptJson(key: CryptoKey, payload: EncryptedPayload): Promise<unknown> {
  const plainBytes = await decryptBytes(key, payload.data);
  const text = new TextDecoder().decode(plainBytes);
  return JSON.parse(text);
}

async function generateDek(): Promise<CryptoKey> {
  const subtle = requireCrypto();
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function exportDekRaw(dek: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  const subtle = requireCrypto();
  const raw = new Uint8Array(await subtle.exportKey('raw', dek));
  const copy = new Uint8Array(new ArrayBuffer(raw.length));
  copy.set(raw);
  return copy;
}

async function importDekRaw(raw: Uint8Array): Promise<CryptoKey> {
  const subtle = requireCrypto();
  const copy = new Uint8Array(new ArrayBuffer(raw.length));
  copy.set(raw);
  return subtle.importKey('raw', copy, { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

function buildCodec(dek: CryptoKey): RecordCodec {
  return {
    async encode(profile: StudentProfile): Promise<EncryptedPayload> {
      return encryptJson(dek, profile);
    },
    async decode(payload: unknown): Promise<unknown> {
      if (isEncryptedPayload(payload)) {
        return decryptJson(dek, payload);
      }
      return payload;
    },
  };
}

function readConfig(): StoredPasscodeConfig | null {
  try {
    const raw = getStorage().getItem(PASSCODE_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPasscodeConfig>;
    if (
      parsed.version !== 1 ||
      typeof parsed.iterations !== 'number' ||
      !Number.isInteger(parsed.iterations) ||
      parsed.iterations <= 0 ||
      parsed.iterations > MAX_KDF_ITERATIONS ||
      typeof parsed.passcodeHash !== 'string' ||
      typeof parsed.wrapSalt !== 'string' ||
      typeof parsed.wrappedDek !== 'string' ||
      typeof parsed.checkCiphertext !== 'string'
    ) {
      return null;
    }
    return parsed as StoredPasscodeConfig;
  } catch {
    return null;
  }
}

export function isPasscodeEnabled(): boolean {
  return Boolean(getStorage().getItem(PASSCODE_CONFIG_KEY));
}

export function isPasscodeConfigDamaged(): boolean {
  return isPasscodeEnabled() && readConfig() === null;
}

export function isUnlocked(): boolean {
  if (!isPasscodeEnabled()) return true;
  return activeDek !== null;
}

export function getPasscodeLockoutMs(now: number = Date.now()): number {
  return getLockoutRemainingMs(LOCKOUT_NAMESPACE, now);
}

export function getAutoLockMinutes(): number {
  try {
    const raw = getStorage().getItem(AUTO_LOCK_KEY);
    if (raw === null) return 15;
    const n = Number(raw);
    if ([0, 5, 15, 30].includes(n)) return n;
  } catch {
    // ignore
  }
  return 15;
}

export function setAutoLockMinutes(minutes: number): void {
  const safe = [0, 5, 15, 30].includes(minutes) ? minutes : 15;
  getStorage().setItem(AUTO_LOCK_KEY, String(safe));
}

/**
 * Enables passcode protection:
 * 1. Hashes the passcode with PBKDF2-SHA-256 (never stores plaintext).
 * 2. Generates a random 256-bit AES-GCM DEK and wraps it with the passcode.
 * 3. Encrypts every existing IndexedDB profile record at rest.
 */
export async function enablePasscode(passcode: string): Promise<void> {
  if (passcode.length < MIN_PASSCODE_LENGTH) {
    throw new SafeClinicalError(
      'PASSCODE_TOO_SHORT',
      `Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`
    );
  }
  const iterations = kdfIterations;
  const dek = await generateDek();
  const rawDek = await exportDekRaw(dek);
  const wrapSalt = randomBytes(SALT_BYTES);
  const kek = await deriveWrappingKey(passcode, wrapSalt, iterations);
  const wrappedDek = await encryptBytes(kek, rawDek);

  const checkBytes = new TextEncoder().encode(CHECK_TEXT);
  const checkCopy = new Uint8Array(new ArrayBuffer(checkBytes.length));
  checkCopy.set(checkBytes);
  const checkCiphertext = await encryptBytes(dek, checkCopy);
  const passcodeHash = await hashPasscode(passcode, iterations);

  // Encrypt all existing records in IndexedDB before writing config.
  const rows = await readAllRawProfileRows();
  const encryptedRows = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      payload: isEncryptedPayload(row.payload)
        ? row.payload
        : await encryptJson(dek, row.payload),
    }))
  );
  await writeAllRawProfileRows(encryptedRows);

  const config: StoredPasscodeConfig = {
    version: 1,
    iterations,
    passcodeHash,
    wrapSalt: toBase64(wrapSalt),
    wrappedDek,
    checkCiphertext,
  };
  getStorage().setItem(PASSCODE_CONFIG_KEY, JSON.stringify(config));
  clearAttempts(LOCKOUT_NAMESPACE);

  activeDek = dek;
  setRecordCodec(buildCodec(dek));
  emitPasscodeEvent();
}

export interface UnlockResult {
  ok: boolean;
  lockedOutMs?: number;
  damaged?: boolean;
}

/**
 * Verifies a passcode against the stored PBKDF2 hash and unwraps the DEK into memory.
 */
export async function unlockWithPasscode(
  passcode: string,
  now: number = Date.now()
): Promise<UnlockResult> {
  if (!isPasscodeEnabled()) {
    return { ok: true };
  }
  if (isLockedOut(LOCKOUT_NAMESPACE, now)) {
    return { ok: false, lockedOutMs: getLockoutRemainingMs(LOCKOUT_NAMESPACE, now) };
  }
  const config = readConfig();
  if (!config) {
    return { ok: false, damaged: true };
  }

  const hashValid = await verifyPasscodeHash(passcode, config.passcodeHash);
  if (!hashValid) {
    recordAttempt(LOCKOUT_NAMESPACE, false, now);
    return { ok: false, lockedOutMs: getLockoutRemainingMs(LOCKOUT_NAMESPACE, now) };
  }

  try {
    const kek = await deriveWrappingKey(passcode, fromBase64(config.wrapSalt), config.iterations);
    const rawDek = await decryptBytes(kek, config.wrappedDek);
    const dek = await importDekRaw(rawDek);
    const checkPlain = new TextDecoder().decode(await decryptBytes(dek, config.checkCiphertext));
    if (checkPlain !== CHECK_TEXT) {
      recordAttempt(LOCKOUT_NAMESPACE, false, now);
      return { ok: false, lockedOutMs: getLockoutRemainingMs(LOCKOUT_NAMESPACE, now) };
    }
    recordAttempt(LOCKOUT_NAMESPACE, true, now);
    activeDek = dek;
    setRecordCodec(buildCodec(dek));
    emitPasscodeEvent();
    return { ok: true };
  } catch {
    recordAttempt(LOCKOUT_NAMESPACE, false, now);
    return { ok: false, lockedOutMs: getLockoutRemainingMs(LOCKOUT_NAMESPACE, now) };
  }
}

/**
 * Changes the passcode by verifying the current passcode and re-wrapping the same DEK.
 */
export async function changePasscode(
  currentPasscode: string,
  newPasscode: string
): Promise<void> {
  if (newPasscode.length < MIN_PASSCODE_LENGTH) {
    throw new SafeClinicalError(
      'PASSCODE_TOO_SHORT',
      `New passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`
    );
  }
  const config = readConfig();
  if (!config) {
    throw new SafeClinicalError('NO_PASSCODE', 'Passcode protection is not currently enabled.');
  }
  const unlocked = await unlockWithPasscode(currentPasscode);
  if (!unlocked.ok || !activeDek) {
    throw new SafeClinicalError('WRONG_PASSCODE', 'Current passcode is incorrect.');
  }

  const iterations = kdfIterations;
  const rawDek = await exportDekRaw(activeDek);
  const wrapSalt = randomBytes(SALT_BYTES);
  const newKek = await deriveWrappingKey(newPasscode, wrapSalt, iterations);
  const wrappedDek = await encryptBytes(newKek, rawDek);
  const passcodeHash = await hashPasscode(newPasscode, iterations);

  const nextConfig: StoredPasscodeConfig = {
    version: 1,
    iterations,
    passcodeHash,
    wrapSalt: toBase64(wrapSalt),
    wrappedDek,
    checkCiphertext: config.checkCiphertext,
  };
  getStorage().setItem(PASSCODE_CONFIG_KEY, JSON.stringify(nextConfig));
  emitPasscodeEvent();
}

/**
 * Disables passcode protection after verifying the current passcode, decrypting stored profiles
 * back to plain IndexedDB records.
 */
export async function disablePasscode(currentPasscode: string): Promise<void> {
  const unlocked = await unlockWithPasscode(currentPasscode);
  if (!unlocked.ok || !activeDek) {
    throw new SafeClinicalError('WRONG_PASSCODE', 'Current passcode is incorrect.');
  }

  const dek = activeDek;
  const rows = await readAllRawProfileRows();
  const decryptedRows = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      payload: isEncryptedPayload(row.payload)
        ? await decryptJson(dek, row.payload)
        : row.payload,
    }))
  );
  await writeAllRawProfileRows(decryptedRows);

  getStorage().removeItem(PASSCODE_CONFIG_KEY);
  clearAttempts(LOCKOUT_NAMESPACE);
  activeDek = null;
  setRecordCodec(null);
  emitPasscodeEvent();
}

/** Locks immediately by wiping the in-memory DEK and notifying the passcode gate. */
export function lockNow(): void {
  if (!isPasscodeEnabled()) return;
  activeDek = null;
  setRecordCodec(null);
  emitPasscodeEvent();
}

/** Erases all stored profiles, passcode configuration, and lockout records on this device. */
export async function eraseAllDeviceData(): Promise<void> {
  await deleteAllProfiles();
  getStorage().removeItem(PASSCODE_CONFIG_KEY);
  getStorage().removeItem(AUTO_LOCK_KEY);
  clearAttempts(LOCKOUT_NAMESPACE);
  activeDek = null;
  setRecordCodec(null);
  emitPasscodeEvent();
}
