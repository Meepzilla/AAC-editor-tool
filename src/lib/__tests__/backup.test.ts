import { describe, expect, it } from 'vitest';
import {
  buildBackupBundle,
  mergeBackupProfiles,
  parseAndValidateBackup,
  serializeBackupBundle,
} from '../backup';
import { createEmptyProfile } from '../constants';
import type { VocabSnapshot } from '../types';

function makeSnapshot(id: string, importedAt: string): VocabSnapshot {
  return {
    id,
    importedAt,
    sourceSystem: 'TouchChat',
    sourceFileName: `${id}.ce`,
    vocabularyName: 'WordPower 60',
    gridSize: '6 x 10',
    pageCount: 1,
    buttonCount: 2,
    wordList: ['more', 'stop'],
    pages: [],
    notes: '',
  };
}

describe('backup export and restore', () => {
  it('exports all profiles with SHA-256 checksum and validates cleanly on import', async () => {
    const p1 = createEmptyProfile({
      id: 'stu-a',
      displayName: 'A.B.',
      aacSystem: 'TouchChat',
      snapshots: [makeSnapshot('s1', '2026-10-01T12:00:00.000Z')],
    });
    const p2 = createEmptyProfile({
      id: 'stu-b',
      displayName: 'C.D.',
      aacSystem: 'TD Snap',
    });

    const bundle = await buildBackupBundle([p2, p1]);
    const json = serializeBackupBundle(bundle);
    const restored = await parseAndValidateBackup(json);

    expect(restored.checksumVerified).toBe(true);
    expect(restored.profiles).toHaveLength(2);
    expect(restored.profiles.map((p) => p.displayName)).toEqual(['A.B.', 'C.D.']);
    expect(restored.totalSnapshots).toBe(1);
    expect(restored.skippedCount).toBe(0);
  });

  it('rejects tampered backup files when checksum does not match', async () => {
    const p1 = createEmptyProfile({ id: 'stu-1', displayName: 'M.L.' });
    const bundle = await buildBackupBundle([p1]);
    const tampered = {
      ...bundle,
      profiles: [{ ...p1, displayName: 'TAMPERED' }],
    };

    await expect(parseAndValidateBackup(JSON.stringify(tampered))).rejects.toThrow(
      /integrity check failed/i
    );
  });

  it('rejects non-backup JSON files with a safe generic message', async () => {
    await expect(parseAndValidateBackup('{"hello":"world"}')).rejects.toThrow(
      /not exported by AAC Profile Manager/i
    );
    await expect(parseAndValidateBackup('{not json')).rejects.toThrow(/not valid JSON/i);
  });

  it('merges profiles keeping newer fields while preserving unique snapshots and modeling notes', () => {
    const existing = [
      createEmptyProfile({
        id: 'stu-1',
        displayName: 'E.R.',
        school: 'Old School',
        updatedAt: '2026-10-01T00:00:00.000Z',
        snapshots: [makeSnapshot('snap-old', '2026-10-01T00:00:00.000Z')],
        modelingNotesLog: [
          {
            id: 'note-1',
            date: '2026-10-01',
            text: 'Local note',
            createdAt: '2026-10-01T10:00:00.000Z',
          },
        ],
      }),
    ];

    const incoming = [
      createEmptyProfile({
        id: 'stu-1',
        displayName: 'E.R.',
        school: 'Updated School',
        updatedAt: '2026-11-01T00:00:00.000Z',
        snapshots: [makeSnapshot('snap-new', '2026-11-01T00:00:00.000Z')],
        modelingNotesLog: [
          {
            id: 'note-2',
            date: '2026-11-01',
            text: 'Backup note',
            createdAt: '2026-11-01T10:00:00.000Z',
          },
        ],
      }),
      createEmptyProfile({
        id: 'stu-2',
        displayName: 'F.G.',
      }),
    ];

    const merged = mergeBackupProfiles(existing, incoming);
    expect(merged).toHaveLength(2);
    const stu1 = merged.find((p) => p.id === 'stu-1')!;
    expect(stu1.school).toBe('Updated School');
    expect(stu1.snapshots.map((s) => s.id)).toEqual(['snap-new', 'snap-old']);
    expect(stu1.modelingNotesLog.map((n) => n.id)).toEqual(['note-2', 'note-1']);
  });
});
