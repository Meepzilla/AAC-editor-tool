'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  addSnapshotToProfile,
  appendModelingNote,
  deleteAllProfiles,
  deleteProfile,
  listProfiles,
  replaceAllProfiles,
  saveProfile,
} from '@/lib/data-store';
import { toSafeErrorMessage } from '@/lib/privacy';
import type { StudentProfile, VocabSnapshot } from '@/lib/types';

interface ProfilesContextValue {
  profiles: StudentProfile[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (profile: StudentProfile) => Promise<StudentProfile>;
  remove: (id: string) => Promise<void>;
  addNote: (profileId: string, text: string, date?: string) => Promise<StudentProfile>;
  attachSnapshot: (profileId: string, snapshot: VocabSnapshot) => Promise<StudentProfile>;
  replaceAll: (profiles: StudentProfile[]) => Promise<StudentProfile[]>;
  clearAll: () => Promise<void>;
}

const ProfilesContext = createContext<ProfilesContextValue | null>(null);

export function ProfilesProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await listProfiles();
      setProfiles(loaded);
    } catch (err) {
      setError(toSafeErrorMessage(err, 'Could not load student profiles from device storage.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (profile: StudentProfile) => {
    const saved = await saveProfile(profile);
    const reloaded = await listProfiles();
    setProfiles(reloaded);
    return saved;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteProfile(id);
    const reloaded = await listProfiles();
    setProfiles(reloaded);
  }, []);

  const addNote = useCallback(async (profileId: string, text: string, date?: string) => {
    const updated = await appendModelingNote(profileId, text, date);
    const reloaded = await listProfiles();
    setProfiles(reloaded);
    return updated;
  }, []);

  const attachSnapshot = useCallback(async (profileId: string, snapshot: VocabSnapshot) => {
    const updated = await addSnapshotToProfile(profileId, snapshot);
    const reloaded = await listProfiles();
    setProfiles(reloaded);
    return updated;
  }, []);

  const replaceAll = useCallback(async (nextProfiles: StudentProfile[]) => {
    const saved = await replaceAllProfiles(nextProfiles);
    setProfiles(saved);
    return saved;
  }, []);

  const clearAll = useCallback(async () => {
    await deleteAllProfiles();
    setProfiles([]);
  }, []);

  return (
    <ProfilesContext.Provider
      value={{
        profiles,
        loading,
        error,
        refresh,
        save,
        remove,
        addNote,
        attachSnapshot,
        replaceAll,
        clearAll,
      }}
    >
      {children}
    </ProfilesContext.Provider>
  );
}

export function useProfiles(): ProfilesContextValue {
  const ctx = useContext(ProfilesContext);
  if (!ctx) {
    throw new Error('useProfiles must be used within ProfilesProvider');
  }
  return ctx;
}
