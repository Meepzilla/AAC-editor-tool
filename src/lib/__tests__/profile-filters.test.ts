import { describe, expect, it } from 'vitest';
import { createEmptyProfile } from '../constants';
import { countProfilesBySystem, filterAndSortProfiles } from '../profile-filters';

describe('profile-filters', () => {
  const samples = [
    createEmptyProfile({
      id: '1',
      displayName: 'M.K.',
      school: 'Cedar Elementary',
      aacSystem: 'TouchChat',
      vocabularyName: 'WordPower 60 Basic',
    }),
    createEmptyProfile({
      id: '2',
      displayName: 'A.J.',
      fullName: 'Alex Jordan',
      showFullName: false,
      school: 'Oak Elementary',
      aacSystem: 'TD Snap',
      vocabularyName: 'Core First 6x6',
    }),
    createEmptyProfile({
      id: '3',
      displayName: 'S.T.',
      school: 'Cedar Elementary',
      aacSystem: 'LAMP Words for Life',
      vocabularyName: 'LAMP WFL Full',
    }),
  ];

  it('sorts alphabetically by visible display name ascending and descending', () => {
    const asc = filterAndSortProfiles(samples, {
      search: '',
      system: 'All',
      sortDirection: 'asc',
    });
    expect(asc.map((p) => p.displayName)).toEqual(['A.J.', 'M.K.', 'S.T.']);

    const desc = filterAndSortProfiles(samples, {
      search: '',
      system: 'All',
      sortDirection: 'desc',
    });
    expect(desc.map((p) => p.displayName)).toEqual(['S.T.', 'M.K.', 'A.J.']);
  });

  it('filters by AAC system', () => {
    const result = filterAndSortProfiles(samples, {
      search: '',
      system: 'TouchChat',
      sortDirection: 'asc',
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('searches by initials, full name, school, or vocabulary name', () => {
    expect(
      filterAndSortProfiles(samples, { search: 'm.k', system: 'All', sortDirection: 'asc' }).map(
        (p) => p.id
      )
    ).toEqual(['1']);

    expect(
      filterAndSortProfiles(samples, { search: 'core first', system: 'All', sortDirection: 'asc' }).map(
        (p) => p.id
      )
    ).toEqual(['2']);

    expect(
      filterAndSortProfiles(samples, { search: 'cedar', system: 'All', sortDirection: 'asc' }).map(
        (p) => p.id
      )
    ).toEqual(['1', '3']);
  });

  it('computes accurate counts per AAC system', () => {
    const counts = countProfilesBySystem(samples);
    expect(counts.All).toBe(3);
    expect(counts.TouchChat).toBe(1);
    expect(counts['TD Snap']).toBe(1);
    expect(counts['LAMP Words for Life']).toBe(1);
    expect(counts.Proloquo2Go).toBe(0);
  });
});
