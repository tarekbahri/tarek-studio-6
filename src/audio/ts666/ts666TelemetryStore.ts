import { useSyncExternalStore } from 'react';
import type {
  Ts666GrowlTelemetry,
  Ts666LiveModOffsets,
  Ts666ModTarget,
} from '../../types/ts666';
import type { Ts666TelemetrySnapshot } from './SixSixSixEngine';

const EMPTY_SNAPSHOT: Ts666TelemetrySnapshot = {
  offsets: {},
  lfoPhases: Array(10).fill(0),
  envValues: [0, 0, 0, 0],
  chaosXY: [0, 0],
  activeVoices: 0,
  activeArpStep: 0,
  activeClipStep: 0,
  growl: null,
};

let currentSnap: Ts666TelemetrySnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

export function publishTs666Telemetry(snap: Ts666TelemetrySnapshot): void {
  currentSnap = snap;
  listeners.forEach((cb) => cb());
}

export function getTs666TelemetrySnapshot(): Ts666TelemetrySnapshot {
  return currentSnap;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Granular selector hooks with equality quantization so unmodulated knobs
 * and idle sections do not re-render at 25fps during playback.
 */
export function useTs666ModOffset(target?: Ts666ModTarget): number {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!target) return 0;
      const v = currentSnap.offsets[target] ?? 0;
      return Math.abs(v) < 0.004 ? 0 : Math.round(v * 200) / 200;
    },
    () => 0
  );
}

export function useTs666TargetModOffsets(
  keys: readonly Ts666ModTarget[]
): Ts666LiveModOffsets {
  const sig = useSyncExternalStore(
    subscribe,
    () => {
      const off = currentSnap.offsets;
      let out = '';
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = off[k] ?? 0;
        const q = Math.abs(v) < 0.004 ? 0 : Math.round(v * 150) / 150;
        out += `${q}|`;
      }
      return out;
    },
    () => keys.map(() => '0').join('|')
  );

  // Parse deterministic subset object only when any watched key changed
  const res: Ts666LiveModOffsets = {};
  const parts = sig.split('|');
  for (let i = 0; i < keys.length; i++) {
    const num = Number(parts[i] || 0);
    if (num !== 0) res[keys[i]] = num;
  }
  return res;
}

export function useTs666EnvValues(): [number, number, number, number] {
  const sig = useSyncExternalStore(
    subscribe,
    () => {
      const e = currentSnap.envValues;
      return `${Math.round(e[0] * 50)},${Math.round(e[1] * 50)},${Math.round(e[2] * 50)},${Math.round(e[3] * 50)}`;
    },
    () => '0,0,0,0'
  );
  const [a, b, c, d] = sig.split(',').map((n) => Number(n) / 50);
  return [a, b, c, d];
}

export function useTs666LfoPhase(lfoIdx: number): number {
  return useSyncExternalStore(
    subscribe,
    () => Math.round((currentSnap.lfoPhases[lfoIdx] ?? 0) * 100) / 100,
    () => 0
  );
}

export function useTs666ChaosXY(): [number, number] {
  const sig = useSyncExternalStore(
    subscribe,
    () =>
      `${Math.round(currentSnap.chaosXY[0] * 40)},${Math.round(currentSnap.chaosXY[1] * 40)}`,
    () => '0,0'
  );
  const [x, y] = sig.split(',').map((n) => Number(n) / 40);
  return [x, y];
}

export function useTs666GrowlTelemetry(): Ts666GrowlTelemetry | null {
  const sig = useSyncExternalStore(
    subscribe,
    () => {
      const g = currentSnap.growl;
      if (!g) return 'null';
      return `${g.enabled ? 1 : 0}|${Math.round(g.modulatedCutoffHz)}|${g.resonance.toFixed(1)}`;
    },
    () => 'null'
  );
  if (sig === 'null') return null;
  return currentSnap.growl;
}
