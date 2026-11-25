'use client';

import React from 'react';

export default function SettingsPlaceholderPage() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Passcode, backup export/import, storage usage, and erase controls will be added in Phase 3.
      </p>
    </div>
  );
}
