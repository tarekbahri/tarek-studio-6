import type { BassRemixAudioMeta, BassRemixSavedRecordingMeta } from '../types/bassRemix';
import { encodeStereoWavBlob } from './BassRemixDspCore';

const DB_NAME = 'tarek_bass_remix_db_v1';
const DB_VERSION = 2;
const STORE_NAME = 'recordings';
const ACTIVE_SOURCE_STORE = 'active_source';
const ACTIVE_SOURCE_KEY = 'current';
const MAX_STORED_RECORDINGS = 32;

interface StoredRecordingRecord extends BassRemixSavedRecordingMeta {
  wavBytes: ArrayBuffer;
}

interface StoredActiveSourceRecord {
  id: string;
  sourceType: BassRemixAudioMeta['sourceType'];
  fileName: string;
  durationSec: number;
  sampleRate: number;
  channels: number;
  rawBytes: ArrayBuffer;
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB local storage is unavailable in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(ACTIVE_SOURCE_STORE)) {
        db.createObjectStore(ACTIVE_SOURCE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open recordings database.'));
  });
}

export async function saveLocalRecording(
  buffer: AudioBuffer,
  name: string
): Promise<BassRemixSavedRecordingMeta> {
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const wavBlob = encodeStereoWavBlob({
    left,
    right,
    sampleRate: buffer.sampleRate,
    length: buffer.length,
  });
  const wavBytes = await wavBlob.arrayBuffer();
  const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const meta: BassRemixSavedRecordingMeta = {
    id,
    name: name.trim() || `Mic Recording ${new Date().toLocaleTimeString()}`,
    createdAt: Date.now(),
    durationSec: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    sizeBytes: wavBytes.byteLength,
  };
  const record: StoredRecordingRecord = { ...meta, wavBytes };

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save recording locally.'));
    });

    // Enforce bounded storage cap by pruning oldest if > MAX_STORED_RECORDINGS
    const all = await listLocalRecordings();
    if (all.length > MAX_STORED_RECORDINGS) {
      const toDelete = all.slice(MAX_STORED_RECORDINGS);
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const item of toDelete) {
          store.delete(item.id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  } finally {
    db.close();
  }

  return meta;
}

export async function listLocalRecordings(): Promise<BassRemixSavedRecordingMeta[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDb();
  try {
    return await new Promise<BassRemixSavedRecordingMeta[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredRecordingRecord[]) ?? [];
        const metas: BassRemixSavedRecordingMeta[] = rows
          .map(({ id, name, createdAt, durationSec, sampleRate, channels, sizeBytes }) => ({
            id,
            name,
            createdAt,
            durationSec,
            sampleRate,
            channels,
            sizeBytes,
          }))
          .sort((a, b) => b.createdAt - a.createdAt);
        resolve(metas);
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to read local recordings.'));
    });
  } finally {
    db.close();
  }
}

export async function loadLocalRecordingBuffer(
  id: string,
  ctx: AudioContext
): Promise<{ buffer: AudioBuffer; meta: BassRemixSavedRecordingMeta }> {
  const db = await openDb();
  let record: StoredRecordingRecord | undefined;
  try {
    record = await new Promise<StoredRecordingRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as StoredRecordingRecord | undefined);
      req.onerror = () => reject(req.error ?? new Error('Failed to load local recording.'));
    });
  } finally {
    db.close();
  }

  if (!record) {
    throw new Error('Saved recording was not found.');
  }

  const copy = record.wavBytes.slice(0);
  const decoded = await ctx.decodeAudioData(copy);
  return {
    buffer: decoded,
    meta: {
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      durationSec: record.durationSec,
      sampleRate: record.sampleRate,
      channels: record.channels,
      sizeBytes: record.sizeBytes,
    },
  };
}

export async function getLocalRecordingWavBlob(
  id: string
): Promise<{ blob: Blob; filename: string }> {
  const db = await openDb();
  let record: StoredRecordingRecord | undefined;
  try {
    record = await new Promise<StoredRecordingRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as StoredRecordingRecord | undefined);
      req.onerror = () => reject(req.error ?? new Error('Failed to read WAV data.'));
    });
  } finally {
    db.close();
  }

  if (!record) {
    throw new Error('Saved recording was not found.');
  }
  const safeName = record.name.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'recording';
  const filename = safeName.toLowerCase().endsWith('.wav') ? safeName : `${safeName}.wav`;
  return {
    blob: new Blob([record.wavBytes], { type: 'audio/wav' }),
    filename,
  };
}

export async function deleteLocalRecording(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to delete local recording.'));
    });
  } finally {
    db.close();
  }
}

export async function saveActiveBassRemixSource(
  meta: BassRemixAudioMeta,
  rawBytes: ArrayBuffer
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    try {
      const record: StoredActiveSourceRecord = {
        id: ACTIVE_SOURCE_KEY,
        sourceType: meta.sourceType,
        fileName: meta.fileName,
        durationSec: meta.durationSec,
        sampleRate: meta.sampleRate,
        channels: meta.channels,
        rawBytes: rawBytes.slice(0),
        updatedAt: Date.now(),
      };
      await new Promise<void>((resolve) => {
        const tx = db.transaction(ACTIVE_SOURCE_STORE, 'readwrite');
        tx.objectStore(ACTIVE_SOURCE_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } finally {
      db.close();
    }
  } catch {
    // ignore storage quota errors
  }
}

export async function saveActiveBassRemixBuffer(
  meta: BassRemixAudioMeta,
  buffer: AudioBuffer
): Promise<void> {
  try {
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
    const wavBlob = encodeStereoWavBlob({
      left,
      right,
      sampleRate: buffer.sampleRate,
      length: buffer.length,
    });
    const rawBytes = await wavBlob.arrayBuffer();
    await saveActiveBassRemixSource(meta, rawBytes);
  } catch {
    // ignore
  }
}

export async function loadActiveBassRemixSource(
  ctx: BaseAudioContext
): Promise<{ buffer: AudioBuffer; meta: BassRemixAudioMeta } | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDb();
    let record: StoredActiveSourceRecord | undefined;
    try {
      record = await new Promise<StoredActiveSourceRecord | undefined>((resolve) => {
        const tx = db.transaction(ACTIVE_SOURCE_STORE, 'readonly');
        const req = tx.objectStore(ACTIVE_SOURCE_STORE).get(ACTIVE_SOURCE_KEY);
        req.onsuccess = () => resolve(req.result as StoredActiveSourceRecord | undefined);
        req.onerror = () => resolve(undefined);
      });
    } finally {
      db.close();
    }
    if (!record || !record.rawBytes) return null;
    const decoded = await ctx.decodeAudioData(record.rawBytes.slice(0));
    return {
      buffer: decoded,
      meta: {
        sourceType: record.sourceType,
        fileName: record.fileName,
        durationSec: decoded.duration,
        sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels,
      },
    };
  } catch {
    return null;
  }
}

export async function clearActiveBassRemixSource(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(ACTIVE_SOURCE_STORE, 'readwrite');
        tx.objectStore(ACTIVE_SOURCE_STORE).delete(ACTIVE_SOURCE_KEY);
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
