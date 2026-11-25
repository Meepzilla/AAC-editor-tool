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
});
