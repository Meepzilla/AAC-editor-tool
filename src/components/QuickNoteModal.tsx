'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Calendar, MessageSquarePlus, X } from 'lucide-react';
import { todayIsoDate } from '@/lib/utils';

interface QuickNoteModalProps {
  open: boolean;
  studentLabel: string;
  onClose: () => void;
  onSave: (text: string, date: string) => Promise<void>;
}

export function QuickNoteModal({
  open,
  studentLabel,
  onClose,
  onSave,
}: QuickNoteModalProps) {
  const [date, setDate] = useState(todayIsoDate());
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setDate(todayIsoDate());
      setText('');
      setError(null);
      setTimeout(() => textareaRef.current?.focus(), 40);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setError('Enter a modeling or session note before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(text.trim(), date);
      onClose();
    } catch {
      setError('Could not save note to device storage. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-note-title"
    >
      <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary">
              <MessageSquarePlus className="h-5 w-5" />
            </div>
            <div>
              <h2 id="quick-note-title" className="text-base font-semibold text-foreground">
                Quick Modeling Note
              </h2>
              <p className="text-xs text-muted-foreground">
                Appends a dated entry to {studentLabel}&rsquo;s modeling log
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick note dialog"
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="quick-note-date"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Date</span>
            </label>
            <input
              id="quick-note-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-input bg-background px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>

          <div>
            <label
              htmlFor="quick-note-text"
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
            >
              What worked, what prompting helped, or what to avoid
            </label>
            <textarea
              id="quick-note-text"
              ref={textareaRef}
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g., Responded well to 10-second expectant delay and modeling 'more + eat' without hand-over-hand prompting."
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
