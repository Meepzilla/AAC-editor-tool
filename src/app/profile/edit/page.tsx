'use client';

import React, { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ProfileForm } from '@/components/ProfileForm';
import { useProfiles } from '@/hooks/use-profiles';

function EditProfileContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const { profiles, loading } = useProfiles();

  const profile = useMemo(() => profiles.find((p) => p.id === id), [profiles, id]);

  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />;
  }

  if (!profile) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
        <h1 className="text-lg font-semibold text-foreground">Profile not found</h1>
        <p className="text-sm text-muted-foreground">
          The profile you tried to edit could not be found on this device.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Caseload</span>
        </Link>
      </div>
    );
  }

  return <ProfileForm mode="edit" initialProfile={profile} />;
}

export default function EditProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
      }
    >
      <EditProfileContent />
    </Suspense>
  );
}
