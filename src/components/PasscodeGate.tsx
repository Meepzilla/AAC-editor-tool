'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import {
  eraseAllDeviceData,
  getAutoLockMinutes,
  getPasscodeLockoutMs,
  isPasscodeConfigDamaged,
  isPasscodeEnabled,
  isUnlocked,
  lockNow,
  PASSCODE_CHANGE_EVENT,
  unlockWithPasscode,
} from '@/lib/secure-store';

interface PasscodeContextValue {
  passcodeEnabled: boolean;
  lockApp: () => void;
}

const PasscodeContext = createContext<PasscodeContextValue>({
  passcodeEnabled: false,
  lockApp: () => {},
});

export function usePasscode(): PasscodeContextValue {
  return useContext(PasscodeContext);
}

function formatRemainingTime(ms: number): string {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function PasscodeGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [unlocked, setUnlocked] = useState(true);

  const syncState = useCallback(() => {
    const on = isPasscodeEnabled();
    setEnabled(on);
    setUnlocked(!on || isUnlocked());
    setReady(true);
  }, []);

  useEffect(() => {
    syncState();
    window.addEventListener(PASSCODE_CHANGE_EVENT, syncState);
    return () => window.removeEventListener(PASSCODE_CHANGE_EVENT, syncState);
  }, [syncState]);

  // Auto-lock timer while unlocked and passcode protection is enabled.
  const lastActiveRef = useRef<number>(Date.now());
  useEffect(() => {
    if (!ready || !enabled || !unlocked) return;

    const touch = () => {
      lastActiveRef.current = Date.now();
    };
    const checkIdle = () => {
      const configured = getAutoLockMinutes();
      const idleMinutes = configured === 0 ? 5 : configured;
      if (Date.now() - lastActiveRef.current > idleMinutes * 60_000) {
        lockNow();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && getAutoLockMinutes() === 0) {
        lockNow();
      } else {
        checkIdle();
      }
    };

    touch();
    window.addEventListener('pointerdown', touch, { passive: true });
    window.addEventListener('keydown', touch);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const interval = window.setInterval(checkIdle, 30_000);

    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(interval);
    };
  }, [ready, enabled, unlocked]);

  const lockApp = useCallback(() => {
    lockNow();
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading AAC Profile Manager…
      </div>
    );
  }

  if (enabled && !unlocked) {
    return <LockScreen onUnlocked={syncState} />;
  }

  return (
    <PasscodeContext.Provider value={{ passcodeEnabled: enabled, lockApp }}>
      {children}
    </PasscodeContext.Provider>
  );
}

function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockoutMs, setLockoutMs] = useState<number>(() => getPasscodeLockoutMs());
  const [showReset, setShowReset] = useState(false);
  const [confirmWord, setConfirmWord] = useState('');
  const [erasing, setErasing] = useState(false);
  const damaged = isPasscodeConfigDamaged();

  useEffect(() => {
    if (lockoutMs <= 0) return;
    const timer = window.setInterval(() => {
      const remaining = getPasscodeLockoutMs();
      setLockoutMs(remaining);
      if (remaining <= 0) setError(null);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockoutMs]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode || submitting || lockoutMs > 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await unlockWithPasscode(passcode);
      if (result.ok) {
        setPasscode('');
        onUnlocked();
        return;
      }
      if (result.damaged) {
        setError(
          'Passcode settings on this device appear damaged. Erase device data below and restore from a backup.'
        );
      } else if (result.lockedOutMs && result.lockedOutMs > 0) {
        setLockoutMs(result.lockedOutMs);
        setError('Too many incorrect passcodes. Wait before trying again.');
      } else {
        setError('Incorrect passcode. Please try again.');
      }
      setPasscode('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleErase = async () => {
    if (confirmWord.trim().toUpperCase() !== 'ERASE') return;
    setErasing(true);
    try {
      await eraseAllDeviceData();
      onUnlocked();
    } finally {
      setErasing(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Lock className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            AAC Profile Manager
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your passcode to unlock student AAC profiles on this device.
          </p>
        </div>

        {damaged && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
            Stored passcode settings are damaged. Use &ldquo;Forgot passcode?&rdquo; below to reset this device and restore your backup.
          </div>
        )}

        {lockoutMs > 0 && (
          <div
            role="status"
            className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-center text-sm font-medium text-amber-900"
          >
            Locked for {formatRemainingTime(lockoutMs)} after repeated failed attempts.
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-4">
          <div className="relative">
            <label htmlFor="unlock-passcode" className="sr-only">
              Passcode
            </label>
            <input
              id="unlock-passcode"
              type={showPasscode ? 'text' : 'password'}
              autoComplete="current-password"
              autoFocus
              disabled={submitting || lockoutMs > 0 || damaged}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              className="w-full min-h-[48px] rounded-xl border border-input bg-background pl-4 pr-12 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowPasscode((prev) => !prev)}
              aria-label={showPasscode ? 'Hide passcode' : 'Show passcode'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !passcode || lockoutMs > 0 || damaged}
            className="w-full min-h-[48px] rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {submitting ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>

        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span>Data stays encrypted on this device only</span>
        </div>

        <div className="border-t border-border pt-4 text-center">
          <button
            type="button"
            onClick={() => setShowReset((prev) => !prev)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            Forgot passcode?
          </button>

          {showReset && (
            <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-left space-y-3">
              <div className="flex items-start gap-2 text-xs text-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                <p>
                  Passcodes are never stored and cannot be recovered. If you have a JSON backup,
                  you can erase this device&rsquo;s data and import your backup afterward.
                </p>
              </div>
              <input
                type="text"
                value={confirmWord}
                onChange={(e) => setConfirmWord(e.target.value)}
                placeholder='Type ERASE to confirm'
                className="w-full min-h-[40px] rounded-lg border border-input bg-background px-3 text-sm text-foreground"
              />
              <button
                type="button"
                disabled={confirmWord.trim().toUpperCase() !== 'ERASE' || erasing}
                onClick={handleErase}
                className="w-full min-h-[40px] rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {erasing ? 'Erasing…' : 'Erase All Data & Start Over'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
