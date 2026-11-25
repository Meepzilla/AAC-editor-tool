/**
 * Low-level IndexedDB persistence adapter.
 *
 * Stores one record per student profile in the `profiles` object store.
 * Only `src/lib/data-store.ts` should call this module; UI components never touch IndexedDB directly.
 */

export const DB_NAME = 'aac_profile_manager_db';
export const DB_VERSION = 1;
export const PROFILES_STORE = 'profiles';
export const META_STORE = 'meta';

export interface StoredProfileRecord {
  id: string;
  /** Either a plain StudentProfile payload or an encrypted envelope written by secure-store. */
  payload: unknown;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

let customFactory: IDBFactory | null = null;
let customDbName: string | null = null;

/** Allows unit tests to inject an isolated fake-indexeddb instance and database name. */
export function configureIndexedDbForTests(
  factory: IDBFactory | null,
  dbName: string | null = null
): void {
  customFactory = factory;
  customDbName = dbName;
}

function getFactory(): IDBFactory {
  if (customFactory) return customFactory;
  if (typeof globalThis !== 'undefined' && 'indexedDB' in globalThis && globalThis.indexedDB) {
    return globalThis.indexedDB;
  }
  throw new Error('IndexedDB is not available in this environment.');
}

function activeDbName(): string {
  return customDbName ?? DB_NAME;
}

export function isIndexedDbAvailable(): boolean {
  try {
    return Boolean(customFactory || (typeof globalThis !== 'undefined' && globalThis.indexedDB));
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const factory = getFactory();
    const request = factory.open(activeDbName(), DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROFILES_STORE)) {
        db.createObjectStore(PROFILES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another open tab.'));
  });
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, mode);
    const completion = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted.'));
    });
    const result = await fn(tx.objectStore(storeName));
    await completion;
    return result;
  } finally {
    db.close();
  }
}

export async function getAllRawRecords(): Promise<StoredProfileRecord[]> {
  return withStore(PROFILES_STORE, 'readonly', async (store) => {
    const rows = await runRequest<StoredProfileRecord[]>(store.getAll());
    return rows ?? [];
  });
}

export async function getRawRecord(id: string): Promise<StoredProfileRecord | null> {
  return withStore(PROFILES_STORE, 'readonly', async (store) => {
    const row = await runRequest<StoredProfileRecord | undefined>(store.get(id));
    return row ?? null;
  });
}

export async function putRawRecord(record: StoredProfileRecord): Promise<void> {
  await withStore(PROFILES_STORE, 'readwrite', async (store) => {
    await runRequest(store.put(record));
  });
}

export async function deleteRawRecord(id: string): Promise<void> {
  await withStore(PROFILES_STORE, 'readwrite', async (store) => {
    await runRequest(store.delete(id));
  });
}

export async function clearAllRawRecords(): Promise<void> {
  await withStore(PROFILES_STORE, 'readwrite', async (store) => {
    await runRequest(store.clear());
  });
}

export async function replaceAllRawRecords(records: StoredProfileRecord[]): Promise<void> {
  await withStore(PROFILES_STORE, 'readwrite', async (store) => {
    await runRequest(store.clear());
    for (const record of records) {
      await runRequest(store.put(record));
    }
  });
}

export async function getMetaValue<T = unknown>(key: string): Promise<T | null> {
  return withStore(META_STORE, 'readonly', async (store) => {
    const row = await runRequest<MetaRecord | undefined>(store.get(key));
    return row ? (row.value as T) : null;
  });
}

export async function setMetaValue(key: string, value: unknown): Promise<void> {
  await withStore(META_STORE, 'readwrite', async (store) => {
    await runRequest(store.put({ key, value }));
  });
}

export async function deleteMetaValue(key: string): Promise<void> {
  await withStore(META_STORE, 'readwrite', async (store) => {
    await runRequest(store.delete(key));
  });
}
