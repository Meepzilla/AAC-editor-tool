import { estimateStoredBytes } from './data-store';

export interface StorageUsageReport {
  profilesBytes: number;
  browserUsageBytes: number | null;
  browserQuotaBytes: number | null;
  source: 'estimate' | 'fallback';
}

export async function getStorageUsageReport(): Promise<StorageUsageReport> {
  const profilesBytes = await estimateStoredBytes();

  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (storage && typeof storage.estimate === 'function') {
      const est = await storage.estimate();
      if (typeof est.usage === 'number') {
        return {
          profilesBytes,
          browserUsageBytes: est.usage,
          browserQuotaBytes: typeof est.quota === 'number' ? est.quota : null,
          source: 'estimate',
        };
      }
    }
  } catch {
    // Fall back to direct profile size estimate
  }

  return {
    profilesBytes,
    browserUsageBytes: null,
    browserQuotaBytes: null,
    source: 'fallback',
  };
}
