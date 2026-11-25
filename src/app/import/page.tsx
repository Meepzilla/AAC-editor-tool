'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ImportView } from '@/components/ImportView';

function ImportPageContent() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get('studentId') || undefined;
  return <ImportView preselectedStudentId={studentId} />;
}

export default function ImportPage() {
  return (
    <Suspense
      fallback={
        <div className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
      }
    >
      <ImportPageContent />
    </Suspense>
  );
}
