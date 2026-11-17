export type BassRemixDistortionMode = 'soft' | 'hard' | 'fold' | 'crush';
export type BassRemixWaveshapeMode = 'asym' | 'rectify' | 'fmfold';
export type BassRemixWobbleWaveform = 'sine' | 'triangle' | 'square' | 'saw';
export type BassRemixFilterType = 'lp12' | 'lp24' | 'bp' | 'notch' | 'formant';

export type BassRemixSyncDivision =
  | '1/1'
  | '1/2'
  | '1/2.'
  | '1/4'
  | '1/4.'
  | '1/4T'
  | '1/8'
  | '1/8.'
  | '1/8T'
  | '1/16'
  | '1/16T'
  | '1/32';

export type BassRemixAutomationTarget =
  | 'volume'
  | 'wobbleRate'
  | 'wobbleDepth'
  | 'filterCutoff'
  | 'filterResonance'
  | 'ottAmount'
  | 'effectMix';

export type BassRemixCurveMode = 'linear' | 'smooth' | 'step';

export type BassRemixSnapGrid =
  | 'off'
  | '1/1'
  | '1/2'
  | '1/4'
  | '1/8'
  | '1/16'
  | '1/32';

export interface BassRemixOttConfig {
  amount: number; // 0..1
  depth: number; // 0..1
  time: number; // 0.1..3.0 (time scale multiplier)
  upward: number; // 0..1
  downward: number; // 0..1
  inputGainDb: number; // -18..24 dB
  outputGainDb: number; // -24..18 dB
  mix: number; // 0..1
  bypass: boolean;
}

export interface BassRemixWobbleConfig {
  enabled: boolean;
  rateHz: number; // 0.1..24 Hz
  depth: number; // 0..1
  bpmSync: boolean;
  syncDivision: BassRemixSyncDivision;
  waveform: BassRemixWobbleWaveform;
  filterType: BassRemixFilterType;
  cutoffHz: number; // 30..16000 Hz
  resonance: number; // 0.5..18
  drive: number; // 0..1
  stereoMod: number; // 0..1 (L/R LFO phase offset)
  mix: number; // 0..1
}

export interface BassRemixVolumeConfig {
  volume: number; // 0..1.5
  gainDb: number; // -18..24 dB
  lfoEnabled: boolean;
  lfoWaveform: BassRemixWobbleWaveform;
  sidechainPump: number; // 0..1
  attackMs: number; // 1..250 ms
  releaseMs: number; // 10..800 ms
  depth: number; // 0..1
  bpmSync: boolean;
  syncDivision: BassRemixSyncDivision;
  rateHz: number; // 0.2..16 Hz
  mix: number; // 0..1
}

export interface BassRemixTransformConfig {
  distortionDrive: number; // 0..1
  distortionMode: BassRemixDistortionMode;
  saturation: number; // 0..1
  waveshapeAmount: number; // 0..1
  waveshapeMode: BassRemixWaveshapeMode;
  harmonicEnhance: number; // 0..1
  stereoWidth: number; // 0..2
  subMonoHz: number; // 40..240 Hz
}

export interface BassRemixAutomationPoint {
  id: string;
  timeNorm: number; // 0..1
  value: number; // 0..1
  curve: BassRemixCurveMode;
}

export interface BassRemixAutomationLane {
  target: BassRemixAutomationTarget;
  enabled: boolean;
  points: BassRemixAutomationPoint[];
}

export interface BassRemixAutomationState {
  bpmSync: boolean;
  snapGrid: BassRemixSnapGrid;
  bars: number; // 1, 2, 4, 8
  loopAutomation: boolean;
  activeTarget: BassRemixAutomationTarget;
  lanes: Record<BassRemixAutomationTarget, BassRemixAutomationLane>;
}

export interface BassRemixPatch {
  id: string;
  name: string;
  effectMix: number; // 0..1 global dry/wet
  ott: BassRemixOttConfig;
  wobble: BassRemixWobbleConfig;
  volume: BassRemixVolumeConfig;
  transform: BassRemixTransformConfig;
  automation: BassRemixAutomationState;
}

export interface BassRemixPreset {
  id: string;
  name: string;
  description: string;
  isFactory?: boolean;
  patch: BassRemixPatch;
}

export type BassRemixMicPermission =
  | 'unknown'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'insecure';

export interface BassRemixAudioMeta {
  sourceType: 'recorded' | 'imported' | 'generated';
  fileName: string;
  durationSec: number;
  sampleRate: number;
  channels: number;
}

export interface BassRemixSavedRecordingMeta {
  id: string;
  name: string;
  createdAt: number;
  durationSec: number;
  sampleRate: number;
  channels: number;
  sizeBytes: number;
}

export interface BassRemixProjectState {
  patch: BassRemixPatch;
  loopPlayback: boolean;
  abMode: 'processed' | 'original';
  selStartNorm: number;
  selEndNorm: number;
}
