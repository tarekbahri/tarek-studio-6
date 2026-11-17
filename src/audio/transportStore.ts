import { useSyncExternalStore } from 'react';
import type { LiveModOffsets } from '../types/synth';

export interface TransportSnapshot {
  isPlaying: boolean;
  isPaused: boolean;
  playheadStep: number;
  dawStep: number;
  midiActive: boolean;
}

export interface ModTelemetrySnapshot {
  modOffsets: LiveModOffsets;
  lfoPhases: [number, number, number];
}

let transportState: TransportSnapshot = {
  isPlaying: false,
  isPaused: false,
  playheadStep: 0,
  dawStep: 0,
  midiActive: false,
};

let modState: ModTelemetrySnapshot = {
  modOffsets: {},
  lfoPhases: [0, 0, 0],
};

const transportListeners = new Set<() => void>();
const modListeners = new Set<() => void>();

function emitTransport(): void {
  for (const listener of transportListeners) {
    listener();
  }
}

function emitMod(): void {
  for (const listener of modListeners) {
    listener();
  }
}

export function subscribeTransport(listener: () => void): () => void {
  transportListeners.add(listener);
  return () => {
    transportListeners.delete(listener);
  };
}

export function getTransportSnapshot(): TransportSnapshot {
  return transportState;
}

export function setTransportState(patch: Partial<TransportSnapshot>): void {
  let changed = false;
  if (patch.isPlaying !== undefined && patch.isPlaying !== transportState.isPlaying) {
    changed = true;
  } else if (patch.isPaused !== undefined && patch.isPaused !== transportState.isPaused) {
    changed = true;
  } else if (
    patch.playheadStep !== undefined &&
    patch.playheadStep !== transportState.playheadStep
  ) {
    changed = true;
  } else if (patch.dawStep !== undefined && patch.dawStep !== transportState.dawStep) {
    changed = true;
  } else if (patch.midiActive !== undefined && patch.midiActive !== transportState.midiActive) {
    changed = true;
  }
  if (!changed) return;
  transportState = { ...transportState, ...patch };
  emitTransport();
}

export function setMidiActiveState(midiActive: boolean): void {
  if (transportState.midiActive === midiActive) return;
  transportState = { ...transportState, midiActive };
  emitTransport();
}

export function subscribeModTelemetry(listener: () => void): () => void {
  modListeners.add(listener);
  return () => {
    modListeners.delete(listener);
  };
}

export function getModTelemetrySnapshot(): ModTelemetrySnapshot {
  return modState;
}

export function setModTelemetryState(
  modOffsets: LiveModOffsets,
  lfoPhases: [number, number, number]
): void {
  modState = { modOffsets, lfoPhases };
  emitMod();
}

// Fine-grained React hooks using useSyncExternalStore so components only
// re-render for the exact slice of real-time telemetry they actually render.
export function useIsPlaying(): boolean {
  return useSyncExternalStore(
    subscribeTransport,
    () => transportState.isPlaying,
    () => false
  );
}

export function useIsPaused(): boolean {
  return useSyncExternalStore(
    subscribeTransport,
    () => transportState.isPaused,
    () => false
  );
}

export function usePlayheadStep(): number {
  return useSyncExternalStore(
    subscribeTransport,
    () => transportState.playheadStep,
    () => 0
  );
}

export function useDawStep(): number {
  return useSyncExternalStore(
    subscribeTransport,
    () => transportState.dawStep,
    () => 0
  );
}

export function useMidiActive(): boolean {
  return useSyncExternalStore(
    subscribeTransport,
    () => transportState.midiActive,
    () => false
  );
}

export function useModTelemetry(): ModTelemetrySnapshot {
  return useSyncExternalStore(
    subscribeModTelemetry,
    getModTelemetrySnapshot,
    getModTelemetrySnapshot
  );
}
