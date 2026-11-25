'use client';

import React from 'react';
import type { AacSystem } from '@/lib/types';
import { cn } from '@/lib/utils';

const SYSTEM_STYLES: Record<AacSystem, string> = {
  TouchChat: 'bg-teal-50 text-teal-800 border-teal-200',
  'LAMP Words for Life': 'bg-sky-50 text-sky-800 border-sky-200',
  Proloquo2Go: 'bg-amber-50 text-amber-800 border-amber-200',
  'TD Snap': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Grid 3': 'bg-indigo-50 text-indigo-800 border-indigo-200',
  Other: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function SystemBadge({
  system,
  className,
}: {
  system: AacSystem;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        SYSTEM_STYLES[system] ?? SYSTEM_STYLES.Other,
        className
      )}
    >
      {system}
    </span>
  );
}
