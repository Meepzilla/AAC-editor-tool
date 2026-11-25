'use client';

import React from 'react';
import { ProfilesProvider } from '@/hooks/use-profiles';

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return <ProfilesProvider>{children}</ProfilesProvider>;
}
