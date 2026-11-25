import type { AacSystem, StudentProfile } from './types';
import { byDisplayName, getProfileDisplayLabel } from './utils';

export type SortDirection = 'asc' | 'desc';

export interface ProfileFilterOptions {
  search: string;
  system: AacSystem | 'All';
  sortDirection: SortDirection;
}

/**
 * Filters and sorts caseload profiles by search text (initials, optional full name,
 * school, classroom, teacher, vocabulary name) and AAC system, sorted by display name.
 */
export function filterAndSortProfiles(
  profiles: StudentProfile[],
  options: ProfileFilterOptions
): StudentProfile[] {
  const query = options.search.trim().toLowerCase();

  const filtered = profiles.filter((profile) => {
    if (options.system !== 'All' && profile.aacSystem !== options.system) {
      return false;
    }
    if (!query) return true;

    const haystacks = [
      profile.displayName,
      getProfileDisplayLabel(profile),
      profile.fullName ?? '',
      profile.vocabularyName,
      profile.school,
      profile.classroom,
      profile.teacher,
      profile.aacSystem,
    ];
    return haystacks.some((field) => field.toLowerCase().includes(query));
  });

  const sorted = [...filtered].sort(byDisplayName);
  return options.sortDirection === 'desc' ? sorted.reverse() : sorted;
}

export function countProfilesBySystem(
  profiles: StudentProfile[]
): Record<AacSystem | 'All', number> {
  const counts: Record<AacSystem | 'All', number> = {
    All: profiles.length,
    TouchChat: 0,
    'LAMP Words for Life': 0,
    Proloquo2Go: 0,
    'TD Snap': 0,
    'Grid 3': 0,
    Other: 0,
  };
  for (const profile of profiles) {
    counts[profile.aacSystem] = (counts[profile.aacSystem] ?? 0) + 1;
  }
  return counts;
}
