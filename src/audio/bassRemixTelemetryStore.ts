import type { BassRemixMicPermission } from '../types/bassRemix';

export interface BassRemixTelemetry {
  isPlaying: boolean;
  playheadSec: number;
  playheadNorm: number; // 0..1 within full buffer
  selProgressNorm: number; // 0..1 within active selection
  lowGr: number; // linear multiplier (e.g. 1.0 = 0dB, 2.0 = +6dB, 0.5 = -6dB)
  midGr: number;
  highGr: number;
  peakIn: number;
  peakOutL: number;
  peakOutR: number;
  recState: 'idle' | 'recording' | 'paused';
  recDurationSec: number;
  recInputLevel: number;
  micPermission: BassRemixMicPermission;
  micDeviceLabel: string;
}

let telemetry: BassRemixTelemetry = {
  isPlaying: false,
  playheadSec: 0,
  playheadNorm: 0,
  selProgressNorm: 0,
  lowGr: 1,
  midGr: 1,
  highGr: 1,
  peakIn: 0,
  peakOutL: 0,
  peakOutR: 0,
  recState: 'idle',
  recDurationSec: 0,
  recInputLevel: 0,
  micPermission: 'unknown',
  micDeviceLabel: '',
};

const listeners = new Set<(t: BassRemixTelemetry) => void>();

// Live recording waveform peak history (read by 60fps canvas without React re-renders)
const MAX_LIVE_PEAKS = 420;
const livePeakMins: number[] = [];
const livePeakMaxs: number[] = [];

export function clearLiveRecPeaks(): void {
  livePeakMins.length = 0;
  livePeakMaxs.length = 0;
}

export function pushLiveRecPeak(minVal: number, maxVal: number): void {
  livePeakMins.push(minVal);
  livePeakMaxs.push(maxVal);
  if (livePeakMins.length > MAX_LIVE_PEAKS) {
    livePeakMins.shift();
    livePeakMaxs.shift();
  }
}

export function getLiveRecPeaks(): { mins: number[]; maxs: number[] } {
  return { mins: livePeakMins, maxs: livePeakMaxs };
}

export function getBassRemixTelemetry(): BassRemixTelemetry {
  return telemetry;
}

export function setBassRemixTelemetry(patch: Partial<BassRemixTelemetry>): void {
  telemetry = { ...telemetry, ...patch };
  for (const l of listeners) {
    l(telemetry);
  }
}

export function subscribeBassRemixTelemetry(
  listener: (t: BassRemixTelemetry) => void
): () => void {
  listeners.add(listener);
  listener(telemetry);
  return () => {
    listeners.delete(listener);
  };
}
