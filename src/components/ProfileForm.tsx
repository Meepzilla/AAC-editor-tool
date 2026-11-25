'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Save, Trash2 } from 'lucide-react';
import { useProfiles } from '@/hooks/use-profiles';
import {
  AAC_SYSTEMS,
  ACCESS_METHODS,
  COMMUNICATIVE_FUNCTIONS,
  createEmptyProfile,
  INDEPENDENCE_LEVELS,
  MODALITIES,
} from '@/lib/constants';
import type {
  AacSystem,
  AccessMethod,
  CommunicativeFunction,
  Modality,
  StudentProfile,
} from '@/lib/types';
import { cn } from '@/lib/utils';

interface ProfileFormProps {
  initialProfile?: StudentProfile;
  mode: 'create' | 'edit';
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="border-b border-border pb-3">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const INPUT_CLASS =
  'w-full min-h-[44px] rounded-xl border border-input bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';
const TEXTAREA_CLASS =
  'w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';
const LABEL_CLASS = 'mb-1.5 block text-xs font-medium text-foreground';

export function ProfileForm({ initialProfile, mode }: ProfileFormProps) {
  const router = useRouter();
  const { save } = useProfiles();
  const [form, setForm] = useState<StudentProfile>(() =>
    initialProfile ? { ...initialProfile } : createEmptyProfile()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = <K extends keyof StudentProfile>(key: K, value: StudentProfile[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleModality = (modality: Modality) => {
    setForm((prev) => {
      const exists = prev.modalities.includes(modality);
      return {
        ...prev,
        modalities: exists
          ? prev.modalities.filter((m) => m !== modality)
          : [...prev.modalities, modality],
      };
    });
  };

  const toggleFunction = (fn: CommunicativeFunction) => {
    setForm((prev) => {
      const exists = prev.communicativeFunctions.includes(fn);
      return {
        ...prev,
        communicativeFunctions: exists
          ? prev.communicativeFunctions.filter((f) => f !== fn)
          : [...prev.communicativeFunctions, fn],
      };
    });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please pick an image file for the optional photo.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Please choose an image smaller than 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
        setForm((prev) => ({
          ...prev,
          photoEnabled: true,
          photoDataUrl: reader.result as string,
        }));
        setError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.displayName.trim()) {
      setError('Please enter student initials or a display label.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await save(form);
      router.push(`/profile/?id=${encodeURIComponent(saved.id)}`);
    } catch {
      setError('Could not save profile to device storage. Please check available space.');
    } finally {
      setSaving(false);
    }
  };

  const backHref =
    mode === 'edit' && initialProfile
      ? `/profile/?id=${encodeURIComponent(initialProfile.id)}`
      : '/';

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{mode === 'edit' ? 'Back to Profile' : 'Back to Caseload'}</span>
          </Link>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">
            {mode === 'edit' ? 'Edit Student Profile' : 'New Student Profile'}
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href={backHref}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Saving...' : 'Save Profile'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {/* Section 1: Student & Placement */}
      <FormSection
        title="Student & Placement"
        description="Initials are used by default for classroom privacy. Full name and photo are optional."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="field-displayName" className={LABEL_CLASS}>
              Initials / Display Name *
            </label>
            <input
              id="field-displayName"
              type="text"
              required
              value={form.displayName}
              onChange={(e) => updateField('displayName', e.target.value)}
              placeholder="e.g., J.M."
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="field-fullName" className={LABEL_CLASS}>
              Full Name (Optional)
            </label>
            <input
              id="field-fullName"
              type="text"
              value={form.fullName ?? ''}
              onChange={(e) => updateField('fullName', e.target.value)}
              placeholder="Leave blank to keep initials only"
              className={INPUT_CLASS}
            />
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={form.showFullName}
                onChange={(e) => updateField('showFullName', e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              <span>Show full name instead of initials on caseload list</span>
            </label>
          </div>

          <div>
            <label htmlFor="field-school" className={LABEL_CLASS}>
              School
            </label>
            <input
              id="field-school"
              type="text"
              value={form.school}
              onChange={(e) => updateField('school', e.target.value)}
              placeholder="e.g., Oak Elementary"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="field-classroom" className={LABEL_CLASS}>
              Classroom / Room
            </label>
            <input
              id="field-classroom"
              type="text"
              value={form.classroom}
              onChange={(e) => updateField('classroom', e.target.value)}
              placeholder="e.g., Room 104 / Pre-K"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="field-teacher" className={LABEL_CLASS}>
              Teacher
            </label>
            <input
              id="field-teacher"
              type="text"
              value={form.teacher}
              onChange={(e) => updateField('teacher', e.target.value)}
              placeholder="e.g., Ms. Alvarez"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="field-reviewDate" className={LABEL_CLASS}>
              Next Review Date
            </label>
            <input
              id="field-reviewDate"
              type="date"
              value={form.reviewDate}
              onChange={(e) => updateField('reviewDate', e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        {/* Optional Photo field (off by default) */}
        <div className="rounded-xl border border-border bg-background p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-foreground">
                Student Photo (Optional — Off by Default)
              </div>
              <p className="text-xs text-muted-foreground">
                Stored locally on this iPad only. Leave off to show initials badge.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={form.photoEnabled}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    photoEnabled: e.target.checked,
                    photoDataUrl: e.target.checked ? prev.photoDataUrl : undefined,
                  }))
                }
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              <span>Enable photo</span>
            </label>
          </div>

          {form.photoEnabled && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {form.photoDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.photoDataUrl}
                  alt="Selected student preview"
                  className="h-14 w-14 rounded-full object-cover border border-border"
                />
              )}
              <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground hover:bg-secondary">
                <Camera className="h-4 w-4 text-primary" />
                <span>{form.photoDataUrl ? 'Change Photo' : 'Choose Photo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="sr-only"
                />
              </label>
              {form.photoDataUrl && (
                <button
                  type="button"
                  onClick={() => updateField('photoDataUrl', undefined)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Remove</span>
                </button>
              )}
            </div>
          )}
        </div>
      </FormSection>

      {/* Section 2: AAC System & Layout */}
      <FormSection title="AAC System & Layout">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="field-aacSystem" className={LABEL_CLASS}>
              AAC System
            </label>
            <select
              id="field-aacSystem"
              value={form.aacSystem}
              onChange={(e) => updateField('aacSystem', e.target.value as AacSystem)}
              className={INPUT_CLASS}
            >
              {AAC_SYSTEMS.map((sys) => (
                <option key={sys} value={sys}>
                  {sys}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="field-vocabularyName" className={LABEL_CLASS}>
              Vocabulary / Page Set Name
            </label>
            <input
              id="field-vocabularyName"
              type="text"
              value={form.vocabularyName}
              onChange={(e) => updateField('vocabularyName', e.target.value)}
              placeholder="e.g., WordPower 60 Basic"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="field-gridSize" className={LABEL_CLASS}>
              Grid Size (Rows × Columns)
            </label>
            <input
              id="field-gridSize"
              type="text"
              value={form.gridSize}
              onChange={(e) => updateField('gridSize', e.target.value)}
              placeholder="e.g., 6 x 10"
              className={INPUT_CLASS}
            />
          </div>
        </div>
      </FormSection>

      {/* Section 3: Access, Motor & Visual */}
      <FormSection title="Access, Motor & Visual Considerations">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="field-accessMethod" className={LABEL_CLASS}>
              Access Method
            </label>
            <select
              id="field-accessMethod"
              value={form.accessMethod}
              onChange={(e) => updateField('accessMethod', e.target.value as AccessMethod)}
              className={INPUT_CLASS}
            >
              {ACCESS_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="field-accessNotes" className={LABEL_CLASS}>
              Access Notes
            </label>
            <textarea
              id="field-accessNotes"
              rows={2}
              value={form.accessNotes}
              onChange={(e) => updateField('accessNotes', e.target.value)}
              placeholder="Switch placement, dwell time, release vs press, scanning pattern..."
              className={TEXTAREA_CLASS}
            />
          </div>

          <div>
            <label htmlFor="field-motorNotes" className={LABEL_CLASS}>
              Motor Notes
            </label>
            <textarea
              id="field-motorNotes"
              rows={3}
              value={form.motorNotes}
              onChange={(e) => updateField('motorNotes', e.target.value)}
              placeholder="Seating/mount angle, dominant hand, keyguard, fatigue considerations..."
              className={TEXTAREA_CLASS}
            />
          </div>

          <div>
            <label htmlFor="field-visualNotes" className={LABEL_CLASS}>
              Visual Notes
            </label>
            <textarea
              id="field-visualNotes"
              rows={3}
              value={form.visualNotes}
              onChange={(e) => updateField('visualNotes', e.target.value)}
              placeholder="Visual field preferences, CVI considerations, contrast, symbol size..."
              className={TEXTAREA_CLASS}
            />
          </div>
        </div>
      </FormSection>

      {/* Section 4: Communication Profile */}
      <FormSection title="Communication Profile">
        <div className="space-y-5">
          <div>
            <div className={LABEL_CLASS}>How the student communicates now (Modalities)</div>
            <div className="flex flex-wrap gap-2">
              {MODALITIES.map((mod) => {
                const selected = form.modalities.includes(mod);
                return (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => toggleModality(mod)}
                    aria-pressed={selected}
                    className={cn(
                      'min-h-[40px] rounded-full border px-3.5 py-1.5 text-xs font-medium capitalize transition-colors',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:bg-secondary'
                    )}
                  >
                    {mod}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className={LABEL_CLASS}>Communicative Functions</div>
            <div className="flex flex-wrap gap-2">
              {COMMUNICATIVE_FUNCTIONS.map((fn) => {
                const selected = form.communicativeFunctions.includes(fn);
                return (
                  <button
                    key={fn}
                    type="button"
                    onClick={() => toggleFunction(fn)}
                    aria-pressed={selected}
                    className={cn(
                      'min-h-[40px] rounded-full border px-3.5 py-1.5 text-xs font-medium capitalize transition-colors',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:bg-secondary'
                    )}
                  >
                    {fn}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="field-independenceLevel" className={LABEL_CLASS}>
                Independence Level
              </label>
              <input
                id="field-independenceLevel"
                type="text"
                value={form.independenceLevel}
                onChange={(e) => updateField('independenceLevel', e.target.value)}
                placeholder="Choose a preset below or enter custom description"
                className={INPUT_CLASS}
              />
              <div className="flex flex-wrap gap-1.5">
                {INDEPENDENCE_LEVELS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => updateField('independenceLevel', preset)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-[11px] transition-colors',
                      form.independenceLevel === preset
                        ? 'border-primary bg-accent text-accent-foreground font-medium'
                        : 'border-border bg-background text-muted-foreground hover:bg-secondary'
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="field-navigationNotes" className={LABEL_CLASS}>
                Navigation Notes
              </label>
              <textarea
                id="field-navigationNotes"
                rows={4}
                value={form.navigationNotes}
                onChange={(e) => updateField('navigationNotes', e.target.value)}
                placeholder="How they move between pages, which folders/words they find independently..."
                className={TEXTAREA_CLASS}
              />
            </div>
          </div>
        </div>
      </FormSection>

      {/* Section 5: Environmental Supports & Modeling */}
      <FormSection title="Environmental Supports & Modeling">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="field-environmentalSupports" className={LABEL_CLASS}>
              Environmental Supports
            </label>
            <textarea
              id="field-environmentalSupports"
              rows={4}
              value={form.environmentalSupports}
              onChange={(e) => updateField('environmentalSupports', e.target.value)}
              placeholder="Core boards on wall, charging routine, device availability during recess/lunch..."
              className={TEXTAREA_CLASS}
            />
          </div>

          <div>
            <label htmlFor="field-modelingNotes" className={LABEL_CLASS}>
              Modeling & Prompting Notes
            </label>
            <textarea
              id="field-modelingNotes"
              rows={4}
              value={form.modelingNotes}
              onChange={(e) => updateField('modelingNotes', e.target.value)}
              placeholder="What modeling and prompting works well, wait time, what to avoid..."
              className={TEXTAREA_CLASS}
            />
          </div>
        </div>
      </FormSection>

      {/* Bottom Save Bar */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href={backHref}
          className="inline-flex min-h-[44px] items-center rounded-xl border border-border bg-card px-5 py-2 text-sm font-medium text-foreground hover:bg-secondary"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-6 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? 'Saving...' : 'Save Profile'}</span>
        </button>
      </div>
    </form>
  );
}
