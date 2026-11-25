import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '../constants';
import { migrateProfile, migrateProfiles } from '../migrations';

describe('migrations', () => {
  it('upgrades a v0 legacy record to CURRENT_SCHEMA_VERSION with privacy defaults', () => {
    const raw = {
      id: 'stu-legacy',
      initials: 'K.P.',
      aacSystem: 'TD Snap',
      modalities: ['AAC device', 'gestures', 'invalid-modality'],
      communicativeFunctions: ['requesting', 'not-a-function'],
      photoDataUrl: 'data:image/png;base64,AAAA',
    };

    const { profile, migrated } = migrateProfile(raw);
    expect(migrated).toBe(true);
    expect(profile).not.toBeNull();
    expect(profile?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(profile?.displayName).toBe('K.P.');
    expect(profile?.showFullName).toBe(false);
    expect(profile?.photoEnabled).toBe(false);
    // Photo data is omitted unless photoEnabled is explicitly true.
    expect(profile?.photoDataUrl).toBeUndefined();
    expect(profile?.modalities).toEqual(['AAC device', 'gestures']);
    expect(profile?.communicativeFunctions).toEqual(['requesting']);
  });

  it('does not flag an up-to-date profile as migrated', () => {
    const raw = {
      id: 'stu-current',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      displayName: 'M.N.',
      showFullName: false,
      photoEnabled: false,
      aacSystem: 'TouchChat',
      accessMethod: 'Direct touch',
      modalities: ['AAC device'],
      communicativeFunctions: ['commenting'],
      snapshots: [],
      modelingNotesLog: [],
    };

    const { profile, migrated } = migrateProfile(raw);
    expect(migrated).toBe(false);
    expect(profile?.id).toBe('stu-current');
  });

  it('skips corrupt or id-less records safely during batch migration', () => {
    const result = migrateProfiles([
      null,
      'corrupt-string',
      { displayName: 'Missing ID' },
      { id: 'valid-1', displayName: 'R.S.' },
    ]);

    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0].id).toBe('valid-1');
    expect(result.migratedIds).toEqual(['valid-1']);
    expect(result.skippedCount).toBe(3);
  });

  it('upgrades a v1 profile to v2 while preserving snapshot symbol assets and button grid metadata', () => {
    const rawV1 = {
      id: 'stu-v1',
      schemaVersion: 1,
      displayName: 'T.H.',
      aacSystem: 'TouchChat',
      snapshots: [
        {
          id: 'snap-1',
          importedAt: '2026-11-25T10:00:00.000Z',
          sourceSystem: 'TouchChat',
          sourceFileName: 'test.ce',
          vocabularyName: 'WordPower 60',
          gridSize: '6 x 10',
          pageCount: 1,
          buttonCount: 1,
          wordList: ['apple'],
          symbols: {
            '{IMG-1}': {
              id: '{IMG-1}',
              dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
              mimeType: 'image/png',
              width: 1,
              height: 1,
            },
          },
          pages: [
            {
              id: 'p1',
              name: 'Snacks',
              rows: 6,
              columns: 10,
              buttons: [
                {
                  id: 'b1',
                  row: 1,
                  column: 2,
                  colSpan: 2,
                  label: 'apple',
                  message: 'apple',
                  symbolImageId: '{IMG-1}',
                  backgroundColor: '#ffff6f',
                },
              ],
            },
          ],
          notes: '',
        },
      ],
    };

    const { profile, migrated } = migrateProfile(rawV1);
    expect(migrated).toBe(true);
    expect(profile?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(profile?.snapshots[0].symbols?.['{IMG-1}']?.mimeType).toBe('image/png');
    expect(profile?.snapshots[0].pages[0].buttons[0]).toMatchObject({
      colSpan: 2,
      symbolImageId: '{IMG-1}',
      backgroundColor: '#FFFF6F',
    });
  });
});
