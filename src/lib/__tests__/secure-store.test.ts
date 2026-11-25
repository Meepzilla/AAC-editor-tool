import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  clearAttempts,
  configureLockoutStorageForTests,
  type KeyValueStorage,
} from '../attempt-lockout';
import { createEmptyProfile } from '../constants';
import {
  listProfiles,
  readAllRawProfileRows,
  saveProfile,
} from '../data-store';
import { configureIndexedDbForTests } from '../indexed-db-store';
import {
  changePasscode,
  configureSecureStoreForTests,
  disablePasscode,
  enablePasscode,
  eraseAllDeviceData,
  isPasscodeEnabled,
  isUnlocked,
  lockNow,
  PASSCODE_CONFIG_KEY,
  unlockWithPasscode,
} from '../secure-store';

function createMemoryStorage(): KeyValueStorage & { dump: () => Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    dump: () => Object.fromEntries(map.entries()),
  };
}

let dbIndex = 0;
let storage: ReturnType<typeof createMemoryStorage>;

beforeEach(() => {
  dbIndex += 1;
  storage = createMemoryStorage();
  configureIndexedDbForTests(new IDBFactory(), `test_secure_aac_${dbIndex}`);
  configureLockoutStorageForTests(storage);
  configureSecureStoreForTests({ storage, iterations: 1000 });
  clearAttempts('passcode');
});

describe('secure-store (passcode gate & encryption at rest)', () => {
  it('stores only a salted PBKDF2 hash (never plaintext passcode) and encrypts IndexedDB records', async () => {
    await saveProfile(
      createEmptyProfile({
        id: 'stu-1',
        displayName: 'J.M.',
        school: 'Maple Elementary',
        modelingNotes: 'Model 2-word core phrases',
      })
    );

    await enablePasscode('246810');
    expect(isPasscodeEnabled()).toBe(true);
    expect(isUnlocked()).toBe(true);

    // Stored config must never contain the plaintext passcode.
    const rawConfig = storage.getItem(PASSCODE_CONFIG_KEY) ?? '';
    expect(rawConfig).not.toContain('246810');
    expect(rawConfig).toContain('pbkdf2:v1:');

    // Raw IndexedDB row must be encrypted and not expose student data.
    const rawRows = await readAllRawProfileRows();
    expect(rawRows).toHaveLength(1);
    const serializedRow = JSON.stringify(rawRows[0].payload);
    expect(serializedRow).toContain('"__enc":"enc1"');
    expect(serializedRow).not.toContain('J.M.');
    expect(serializedRow).not.toContain('Maple Elementary');

    // Locking clears the key; unlocking with correct passcode restores readable profiles.
    lockNow();
    expect(isUnlocked()).toBe(false);

    const wrong = await unlockWithPasscode('999999');
    expect(wrong.ok).toBe(false);
    expect(isUnlocked()).toBe(false);

    const right = await unlockWithPasscode('246810');
    expect(right.ok).toBe(true);
    expect(isUnlocked()).toBe(true);

    const profiles = await listProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].displayName).toBe('J.M.');
    expect(profiles[0].school).toBe('Maple Elementary');
  });

  it('escalates lockout after 5 failed passcode attempts and resets on success', async () => {
    await enablePasscode('correct-pin');
    lockNow();

    const baseTime = 1_700_000_000_000;
    for (let i = 0; i < 4; i++) {
      const attempt = await unlockWithPasscode('wrong-pin', baseTime + i * 1000);
      expect(attempt.ok).toBe(false);
      expect(attempt.lockedOutMs ?? 0).toBe(0);
    }

    // 5th failure triggers 1-minute lockout.
    const fifth = await unlockWithPasscode('wrong-pin', baseTime + 5000);
    expect(fifth.ok).toBe(false);
    expect(fifth.lockedOutMs).toBe(60_000);

    // Even the right passcode is blocked during lockout.
    const duringLockout = await unlockWithPasscode('correct-pin', baseTime + 10_000);
    expect(duringLockout.ok).toBe(false);
    expect(duringLockout.lockedOutMs).toBeGreaterThan(0);

    // After lockout expires, correct passcode succeeds.
    const afterExpiry = await unlockWithPasscode('correct-pin', baseTime + 70_000);
    expect(afterExpiry.ok).toBe(true);
  });

  it('changes passcode without losing encrypted profiles, supports disable and full erase', async () => {
    await enablePasscode('first-pass');
    await saveProfile(createEmptyProfile({ id: 'stu-2', displayName: 'A.K.' }));

    await changePasscode('first-pass', 'second-pass');
    lockNow();

    expect((await unlockWithPasscode('first-pass')).ok).toBe(false);
    expect((await unlockWithPasscode('second-pass')).ok).toBe(true);
    expect((await listProfiles())[0].displayName).toBe('A.K.');

    await disablePasscode('second-pass');
    expect(isPasscodeEnabled()).toBe(false);
    const plainRows = await readAllRawProfileRows();
    expect(JSON.stringify(plainRows[0].payload)).toContain('A.K.');

    await eraseAllDeviceData();
    expect(await listProfiles()).toEqual([]);
    expect(isPasscodeEnabled()).toBe(false);
  });
});
