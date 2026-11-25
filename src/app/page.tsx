'use client';

import React from 'react';
import { useProfiles } from '@/hooks/use-profiles';

export default function HomePage() {
  const { profiles, loading } = useProfiles();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        AAC Profile Manager
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {loading
          ? 'Loading local caseload storage...'
          : `${profiles.length} student profile${profiles.length === 1 ? '' : 's'} stored on this device.`}
      </p>
    </main>
  );
}
