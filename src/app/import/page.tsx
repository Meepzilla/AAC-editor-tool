'use client';

import React from 'react';

export default function ImportPlaceholderPage() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-foreground">Import AAC Vocabulary File</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        File format parsers (.ce, .sps/.spb, .p2gbk/.p2g) will be wired in Phases 5–8.
      </p>
    </div>
  );
}
