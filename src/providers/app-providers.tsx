'use client';

import React from 'react';
import { AppShell } from '@/components/AppShell';
import { ProfilesProvider } from '@/hooks/use-profiles';

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ProfilesProvider>
      <AppShell>{children}</AppShell>
    </ProfilesProvider>
  );
}
