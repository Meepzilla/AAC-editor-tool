'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { canRegisterServiceWorker, isOfflineBrowser } from '@/lib/pwa';

/**
 * Registers /sw.js for full offline PWA support and shows unobtrusive banners when:
 * 1. The iPad is offline (confirming everything continues working locally).
 * 2. A newer offline build is waiting to activate (never forcing a surprise mid-session reload).
 */
export function ServiceWorkerRegistration() {
  const [offline, setOffline] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    setOffline(isOfflineBrowser());
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    let active = true;
    const onControllerChange = () => {
      window.location.reload();
    };

    if (canRegisterServiceWorker()) {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          if (!active) return;
          if (reg.waiting) {
            setWaitingWorker(reg.waiting);
          }
          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                setWaitingWorker(installing);
              }
            });
          });
        })
        .catch(() => {
          // Local dev server without out/sw.js is expected.
        });
    }

    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      }
    };
  }, []);

  const applyUpdate = () => {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  };

  if (!offline && !waitingWorker) return null;

  return (
    <div className="fixed bottom-16 md:bottom-4 right-4 z-40 flex flex-col items-end gap-2 max-w-sm">
      {offline && (
        <div
          role="status"
          className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50/95 px-3.5 py-1.5 text-xs font-medium text-teal-900 shadow-sm backdrop-blur"
        >
          <WifiOff className="h-3.5 w-3.5 text-primary" />
          <span>Offline mode · All profiles &amp; parsers work locally</span>
        </div>
      )}

      {waitingWorker && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-xs text-foreground shadow-lg"
        >
          <span>A newer offline version is ready.</span>
          <button
            type="button"
            onClick={applyUpdate}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-primary px-3 py-1 font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reload</span>
          </button>
        </div>
      )}
    </div>
  );
}
