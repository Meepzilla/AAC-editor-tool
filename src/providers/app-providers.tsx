'use client';

import React from 'react';
import { AppShell } from '@/components/AppShell';
import { PasscodeGate, usePasscode } from '@/components/PasscodeGate';
import { ProfilesProvider } from '@/hooks/use-profiles';

function UnlockedAppShell({ children }: { children: React.ReactNode }) {
  const { passcodeEnabled, lockApp } = usePasscode();
  return (
    <ProfilesProvider>
      <AppShell showLockButton={passcodeEnabled} onLockNow={lockApp}>
        {children}
      </AppShell>
    </ProfilesProvider>
  );
}

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PasscodeGate>
      <UnlockedAppShell>{children}</UnlockedAppShell>
    </PasscodeGate>
  );
}
