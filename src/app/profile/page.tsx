'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProfileView } from '@/components/ProfileView';

function ProfilePageContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  return <ProfileView profileId={id} />;
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
      }
    >
      <ProfilePageContent />
    </Suspense>
  );
}
