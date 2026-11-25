import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { StudentProfile } from './types';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Local calendar date formatted as YYYY-MM-DD (avoids UTC midnight off-by-one west of UTC). */
export function todayIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Formats a YYYY-MM-DD date string safely in local time without UTC day shift. */
export function formatLocalDate(dateStr: string): string {
  if (!dateStr) return 'Not set';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (match) {
    const [, y, m, d] = match;
    const localDate = new Date(Number(y), Number(m) - 1, Number(d));
    return localDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(isoStr: string): string {
  if (!isoStr) return 'Unknown';
  const parsed = new Date(isoStr);
  if (Number.isNaN(parsed.getTime())) return isoStr;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Returns the student's visible display name respecting privacy defaults:
 * initials (`displayName`) by default; `fullName` only if opted in on the profile.
 */
export function getProfileDisplayLabel(
  profile: Pick<StudentProfile, 'displayName' | 'fullName' | 'showFullName'>
): string {
  if (profile.showFullName && profile.fullName && profile.fullName.trim()) {
    return profile.fullName.trim();
  }
  return profile.displayName.trim() || 'Unnamed';
}

export function getProfileInitialsBadge(
  profile: Pick<StudentProfile, 'displayName' | 'fullName'>
): string {
  const raw = (profile.displayName || profile.fullName || '?').trim();
  const letters = raw
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (letters.length === 0) return '?';
  if (letters.length === 1) return letters[0].slice(0, 2).toUpperCase();
  return (letters[0][0] + letters[letters.length - 1][0]).toUpperCase();
}

export function formatGridSize(rows: number, columns: number): string {
  if (!Number.isFinite(rows) || !Number.isFinite(columns) || rows <= 0 || columns <= 0) {
    return '';
  }
  return `${Math.round(rows)} x ${Math.round(columns)}`;
}

export function parseGridSize(value: string): { rows: number; columns: number } | null {
  const match = /^\s*(\d+)\s*[x×]\s*(\d+)\s*$/i.exec(value || '');
  if (!match) return null;
  const rows = Number(match[1]);
  const columns = Number(match[2]);
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows <= 0 || columns <= 0) {
    return null;
  }
  return { rows, columns };
}

export function byDisplayName(a: StudentProfile, b: StudentProfile): number {
  return getProfileDisplayLabel(a).localeCompare(getProfileDisplayLabel(b), undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function reviewDateStatus(reviewDate: string, today: string = todayIsoDate()): 'unset' | 'overdue' | 'soon' | 'ok' {
  if (!reviewDate) return 'unset';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reviewDate.trim());
  const todayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!match || !todayMatch) return 'ok';
  const targetMs = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  const todayMs = new Date(Number(todayMatch[1]), Number(todayMatch[2]) - 1, Number(todayMatch[3])).getTime();
  const diffDays = Math.round((targetMs - todayMs) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 14) return 'soon';
  return 'ok';
}
