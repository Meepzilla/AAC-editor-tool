import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createEmptyProfile } from '../constants';
import {
  addSnapshotToProfile,
  appendModelingNote,
  deleteAllProfiles,
  deleteProfile,
  estimateStoredBytes,
  getProfile,
  listProfiles,
  replaceAllProfiles,
  saveProfile,
} from '../data-store';
import { configureIndexedDbForTests, putRawRecord } from '../indexed-db-store';
import type { VocabSnapshot } from '../types';

let dbCounter = 0;

beforeEach(() => {
  dbCounter += 1;
  configureIndexedDbForTests(new IDBFactory(), `test_aac_profiles_${dbCounter}`);
});

describe('data-store (IndexedDB persistence)', () => {
  it('saves and loads student profiles sorted alphabetically by display label', async () => {
    const p1 = createEmptyProfile({ id: 'p-1', displayName: 'Z.K.', aacSystem: 'TouchChat' });
    const p2 = createEmptyProfile({ id: 'p-2', displayName: 'A.M.', aacSystem: 'TD Snap' });

    await saveProfile(p1);
    await saveProfile(p2);

    const loaded = await listProfiles();
    expect(loaded).toHaveLength(2);
    expect(loaded.map((p) => p.displayName)).toEqual(['A.M.', 'Z.K.']);

    const single = await getProfile('p-1');
    expect(single?.aacSystem).toBe('TouchChat');
    expect(single?.displayName).toBe('Z.K.');
  });

  it('updates an existing profile without duplicating records', async () => {
    const profile = createEmptyProfile({
      id: 'p-edit',
      displayName: 'B.R.',
      vocabularyName: 'WordPower 42',
    });
    await saveProfile(profile);

    await saveProfile({
      ...profile,
      vocabularyName: 'WordPower 60',
      gridSize: '6 x 10',
    });

    const all = await listProfiles();
    expect(all).toHaveLength(1);
    expect(all[0].vocabularyName).toBe('WordPower 60');
    expect(all[0].gridSize).toBe('6 x 10');
  });

  it('appends dated quick notes to modelingNotesLog without disturbing other fields', async () => {
    const profile = createEmptyProfile({
      id: 'p-notes',
      displayName: 'C.L.',
      modelingNotes: 'Model 2-word combinations on core words.',
    });
    await saveProfile(profile);

    const updated = await appendModelingNote(
      'p-notes',
      'Responded well to aided language input during snack.',
      '2026-11-25'
    );

    expect(updated.modelingNotes).toBe('Model 2-word combinations on core words.');
    expect(updated.modelingNotesLog).toHaveLength(1);
    expect(updated.modelingNotesLog[0].date).toBe('2026-11-25');
    expect(updated.modelingNotesLog[0].text).toContain('aided language input');
  });

  it('adds a vocab snapshot to an existing student without overwriting filled profile fields', async () => {
    const profile = createEmptyProfile({
      id: 'p-snap',
      displayName: 'D.W.',
      school: 'Oak Elementary',
      vocabularyName: 'Custom Core',
      gridSize: '6 x 10',
      motorNotes: 'Uses keyguard.',
    });
    await saveProfile(profile);

    const snapshot: VocabSnapshot = {
      id: 'snap-1',
      importedAt: '2026-11-25T10:00:00.000Z',
      sourceSystem: 'TouchChat',
      sourceFileName: 'sample.ce',
      vocabularyName: 'WordPower 60 Basic',
      gridSize: '6 x 10',
      pageCount: 2,
      buttonCount: 8,
      wordList: ['go', 'more', 'stop'],
      pages: [],
      notes: 'Fall baseline export',
    };

    const updated = await addSnapshotToProfile('p-snap', snapshot);
    expect(updated.snapshots).toHaveLength(1);
    expect(updated.snapshots[0].id).toBe('snap-1');
    // Existing manual fields are preserved untouched.
    expect(updated.vocabularyName).toBe('Custom Core');
    expect(updated.school).toBe('Oak Elementary');
    expect(updated.motorNotes).toBe('Uses keyguard.');
  });

  it('migrates legacy unversioned records automatically on load and persists the upgraded version', async () => {
    await putRawRecord({
      id: 'legacy-1',
      payload: {
        id: 'legacy-1',
        initials: 'E.T.',
        aacSystem: 'LAMP Words for Life',
        school: 'Pine School',
      },
    });

    const loaded = await getProfile('legacy-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.schemaVersion).toBe(1);
    expect(loaded?.displayName).toBe('E.T.');
    expect(loaded?.showFullName).toBe(false);
    expect(loaded?.photoEnabled).toBe(false);
    expect(loaded?.snapshots).toEqual([]);
    expect(loaded?.modelingNotesLog).toEqual([]);
  });

  it('supports delete, replaceAll, deleteAll, and storage size estimation', async () => {
    const a = createEmptyProfile({ id: 'id-a', displayName: 'A.A.' });
    const b = createEmptyProfile({ id: 'id-b', displayName: 'B.B.' });
    await saveProfile(a);
    await saveProfile(b);

    expect(await estimateStoredBytes()).toBeGreaterThan(100);

    await deleteProfile('id-a');
    expect((await listProfiles()).map((p) => p.id)).toEqual(['id-b']);

    const c = createEmptyProfile({ id: 'id-c', displayName: 'C.C.' });
    await replaceAllProfiles([c]);
    expect((await listProfiles()).map((p) => p.id)).toEqual(['id-c']);

    await deleteAllProfiles();
    expect(await listProfiles()).toEqual([]);
    expect(await estimateStoredBytes()).toBe(0);
  });
});
