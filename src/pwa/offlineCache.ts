import { useEffect, useState } from 'react';

export type OfflineCacheStatus = 'checking' | 'caching' | 'ready' | 'unsupported';

export interface OfflineCacheSnapshot {
  status: OfflineCacheStatus;
  cachedCount: number;
  totalEssential: number;
}

const RUNTIME_CORE_CACHE = 'tarek-core-offline-v1';

export const ESSENTIAL_OFFLINE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/worklets/tarek-dsp-processor.js',
  '/worklets/tarek-bass-remix-processor.js',
] as const;

let currentSnapshot: OfflineCacheSnapshot = {
  status: 'checking',
  cachedCount: 0,
  totalEssential: ESSENTIAL_OFFLINE_URLS.length,
};

const listeners = new Set<(snap: OfflineCacheSnapshot) => void>();
let warmPromise: Promise<OfflineCacheSnapshot> | null = null;

function notify(next: OfflineCacheSnapshot): void {
  currentSnapshot = next;
  for (const fn of listeners) {
    fn(next);
  }
}

async function isUrlCachedAnywhere(url: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  const hit = await caches.match(url, { ignoreSearch: true });
  return Boolean(hit);
}

export async function warmEssentialOfflineCache(): Promise<OfflineCacheSnapshot> {
  if (warmPromise) return warmPromise;

  warmPromise = (async () => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      typeof caches === 'undefined'
    ) {
      const snap: OfflineCacheSnapshot = {
        status: 'unsupported',
        cachedCount: 0,
        totalEssential: ESSENTIAL_OFFLINE_URLS.length,
      };
      notify(snap);
      return snap;
    }

    try {
      notify({
        status: 'caching',
        cachedCount: 0,
        totalEssential: ESSENTIAL_OFFLINE_URLS.length,
      });

      // Wait briefly for Service Worker activation
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve) => window.setTimeout(resolve, 4500)),
      ]);

      const coreCache = await caches.open(RUNTIME_CORE_CACHE);
      let cachedCount = 0;

      for (const url of ESSENTIAL_OFFLINE_URLS) {
        const already = await isUrlCachedAnywhere(url);
        if (already) {
          cachedCount += 1;
          continue;
        }
        try {
          const resp = await fetch(url, { cache: 'reload' });
          if (resp.ok) {
            await coreCache.put(url, resp.clone());
            cachedCount += 1;
          }
        } catch {
          // Offline right now — check if present in cache from previous visit
          if (await isUrlCachedAnywhere(url)) {
            cachedCount += 1;
          }
        }
      }

      const snap: OfflineCacheSnapshot = {
        status: cachedCount >= ESSENTIAL_OFFLINE_URLS.length - 1 ? 'ready' : 'caching',
        cachedCount,
        totalEssential: ESSENTIAL_OFFLINE_URLS.length,
      };
      notify(snap);
      return snap;
    } catch {
      const snap: OfflineCacheSnapshot = {
        status: 'unsupported',
        cachedCount: 0,
        totalEssential: ESSENTIAL_OFFLINE_URLS.length,
      };
      notify(snap);
      return snap;
    }
  })();

  return warmPromise;
}

export function useOfflineCacheStatus(): OfflineCacheSnapshot {
  const [snap, setSnap] = useState<OfflineCacheSnapshot>(currentSnapshot);

  useEffect(() => {
    listeners.add(setSnap);
    void warmEssentialOfflineCache();
    return () => {
      listeners.delete(setSnap);
    };
  }, []);

  return snap;
}
