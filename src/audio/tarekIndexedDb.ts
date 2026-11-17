const STUDIO_IDB_NAME = 'tarek_studio_idb_v1';
const STUDIO_IDB_VERSION = 1;
const KV_STORE = 'kv_mirror';

const MIRROR_PREFIXES = ['tarek_', 'aetherwave_'];

function shouldMirrorKey(key: string): boolean {
  return MIRROR_PREFIXES.some((p) => key.startsWith(p));
}

function openStudioIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(STUDIO_IDB_NAME, STUDIO_IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open studio IndexedDB'));
  });
}

interface KvEntry {
  key: string;
  value: string;
  updatedAt: number;
}

export async function mirrorKeyToIndexedDb(key: string, value: string): Promise<void> {
  if (!shouldMirrorKey(key) || typeof indexedDB === 'undefined') return;
  try {
    const db = await openStudioIdb();
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(KV_STORE, 'readwrite');
        tx.objectStore(KV_STORE).put({
          key,
          value,
          updatedAt: Date.now(),
        } satisfies KvEntry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } finally {
      db.close();
    }
  } catch {
    // Non-fatal fallback to localStorage
  }
}

export async function removeKeyFromIndexedDb(key: string): Promise<void> {
  if (!shouldMirrorKey(key) || typeof indexedDB === 'undefined') return;
  try {
    const db = await openStudioIdb();
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(KV_STORE, 'readwrite');
        tx.objectStore(KV_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } finally {
      db.close();
    }
  } catch {
    // ignore
  }
}

/**
 * Mirrors all existing localStorage projects, presets, sequencer patterns, and settings
 * into IndexedDB without deleting any existing data, and restores any missing keys
 * back into localStorage if Android evicted localStorage under storage pressure.
 */
export async function syncAndRestoreStudioIndexedDb(): Promise<boolean> {
  if (typeof indexedDB === 'undefined' || typeof localStorage === 'undefined') {
    return false;
  }

  let restoredAny = false;
  try {
    const db = await openStudioIdb();
    try {
      const idbEntries = await new Promise<KvEntry[]>((resolve) => {
        const tx = db.transaction(KV_STORE, 'readonly');
        const req = tx.objectStore(KV_STORE).getAll();
        req.onsuccess = () => resolve((req.result as KvEntry[]) ?? []);
        req.onerror = () => resolve([]);
      });

      const idbMap = new Map<string, string>();
      for (const entry of idbEntries) {
        if (entry && typeof entry.key === 'string' && typeof entry.value === 'string') {
          idbMap.set(entry.key, entry.value);
          // Restore into localStorage ONLY if missing so we never overwrite newer user data
          if (shouldMirrorKey(entry.key) && localStorage.getItem(entry.key) === null) {
            try {
              localStorage.setItem(entry.key, entry.value);
              restoredAny = true;
            } catch {
              // storage quota exceeded
            }
          }
        }
      }

      // Snapshot localStorage keys to IndexedDB
      const toPut: KvEntry[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !shouldMirrorKey(k)) continue;
        const val = localStorage.getItem(k);
        if (val !== null && idbMap.get(k) !== val) {
          toPut.push({ key: k, value: val, updatedAt: Date.now() });
        }
      }

      if (toPut.length > 0) {
        await new Promise<void>((resolve) => {
          const tx = db.transaction(KV_STORE, 'readwrite');
          const store = tx.objectStore(KV_STORE);
          for (const item of toPut) {
            store.put(item);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
      }
    } finally {
      db.close();
    }
  } catch {
    // ignore IndexedDB failures on restricted private tabs
  }

  return restoredAny;
}
