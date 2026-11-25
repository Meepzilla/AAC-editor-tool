'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileUp, Lock, Settings, ShieldCheck, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
  onLockNow?: () => void;
  showLockButton?: boolean;
}

const NAV_ITEMS = [
  { href: '/', label: 'Caseload', icon: Users, match: (p: string) => p === '/' || p.startsWith('/profile') || p.startsWith('/compare') },
  { href: '/import/', label: 'Import File', icon: FileUp, match: (p: string) => p.startsWith('/import') },
  { href: '/settings/', label: 'Settings', icon: Settings, match: (p: string) => p.startsWith('/settings') },
];

export function AppShell({ children, onLockNow, showLockButton = false }: AppShellProps) {
  const pathname = usePathname() || '/';

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <span className="text-sm font-bold tracking-tight">AAC</span>
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold tracking-tight text-foreground">
                AAC Profile Manager
              </div>
              <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-primary" />
                <span>On-device only · Offline ready</span>
              </div>
            </div>
          </Link>

          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            {showLockButton && onLockNow && (
              <button
                type="button"
                onClick={onLockNow}
                className="ml-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                title="Lock AAC Profile Manager"
              >
                <Lock className="h-4 w-4 text-primary" />
                <span>Lock</span>
              </button>
            )}
          </nav>

          {showLockButton && onLockNow && (
            <button
              type="button"
              onClick={onLockNow}
              className="md:hidden inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              aria-label="Lock app"
            >
              <Lock className="h-4 w-4 text-primary" />
              <span>Lock</span>
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      {/* Bottom tab bar for iPad portrait / phone touch ergonomics */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur"
      >
        <div className="grid grid-cols-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
