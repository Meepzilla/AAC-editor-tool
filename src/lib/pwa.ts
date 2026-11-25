/**
 * Helpers for PWA offline status detection and service worker lifecycle.
 */

export function isOfflineBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

export function canRegisterServiceWorker(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    (window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1')
  );
}
