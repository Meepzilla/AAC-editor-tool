'use client';

import React from 'react';
import type { StudentProfile } from '@/lib/types';
import { cn, getProfileInitialsBadge } from '@/lib/utils';

export function StudentAvatar({
  profile,
  size = 'md',
}: {
  profile: Pick<StudentProfile, 'displayName' | 'fullName' | 'photoEnabled' | 'photoDataUrl'>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass =
    size === 'lg'
      ? 'h-14 w-14 text-lg'
      : size === 'sm'
      ? 'h-9 w-9 text-xs'
      : 'h-11 w-11 text-sm';

  if (profile.photoEnabled && profile.photoDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.photoDataUrl}
        alt="Student avatar"
        className={cn(
          'shrink-0 rounded-full object-cover border border-border bg-secondary',
          sizeClass
        )}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        'shrink-0 rounded-full flex items-center justify-center font-semibold tracking-tight bg-teal-700/10 text-teal-900 border border-teal-700/20',
        sizeClass
      )}
    >
      {getProfileInitialsBadge(profile)}
    </div>
  );
}
