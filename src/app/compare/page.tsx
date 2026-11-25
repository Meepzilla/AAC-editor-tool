'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SnapshotCompareView } from '@/components/SnapshotCompareView';

function ComparePageContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  return <SnapshotCompareView profileId={id} />;
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
      }
    >
      <ComparePageContent />
    </Suspense>
  );
}
