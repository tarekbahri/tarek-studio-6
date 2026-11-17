import type {
  Ts666BusId,
  Ts666FxBuses,
  Ts666FxModule,
  Ts666FxType,
  Ts666GrowlPresetId,
  Ts666GrowlTelemetry,
  Ts666LiveModOffsets,
  Ts666Oversampling,
} from '../../types/ts666';
import { TS666_LFO_SYNC_DIVISIONS, syncDivisionToHz } from './ts666Wavetables';

export interface Ts666GrowlPresetDef {
  id: Ts666GrowlPresetId;
  name: string;
  params: Record<string, number>;
}

export const TS666_GROWL_PRESETS: Ts666GrowlPresetDef[] = [
  {
    id: 'clean_growl',
    name: 'CLEAN GROWL',
    params: {
      volume: 0.88,
      drive: 0.34,
      gain: 1.0,
      metal: 0.22,
      fmMetal: 0.14,
      wobbleRate: 2.0,
      wobbleDepth: 0.52,
      wobbleSync: 1,
      wobbleDivIdx: 6, // 1/4
      cutoff: 440,
      resonance: 4.4,
      filterMode: 0,
    },
  },
  {
    id: 'metallic_growl',
    name: 'METALLIC GROWL',
    params: {
      volume: 0.86,
      drive: 0.54,
      gain: 1.18,
      metal: 0.72,
      fmMetal: 0.62,
      wobbleRate: 3.2,
      wobbleDepth: 0.64,
      wobbleSync: 1,
      wobbleDivIdx: 9, // 1/8
      cutoff: 540,
      resonance: 6.2,
      filterMode: 1,
    },
  },
  {
    id: 'heavy_riddim',
    name: 'HEAVY RIDDIM',
    params: {
      volume: 0.9,
      drive: 0.68,
      gain: 1.32,
      metal: 0.82,
      fmMetal: 0.74,
      wobbleRate: 4.5,
      wobbleDepth: 0.72,
      wobbleSync: 1,
      wobbleDivIdx: 11, // 1/16
      cutoff: 620,
      resonance: 7.4,
      filterMode: 2,
    },
  },
  {
    id: 'deep_wobble',
    name: 'DEEP WOBBLE',
    params: {
      volume: 0.92,
      drive: 0.44,
      gain: 1.15,
      metal: 0.28,
      fmMetal: 0.18,
      wobbleRate: 1.5,
      wobbleDepth: 0.84,
      wobbleSync: 1,
      wobbleDivIdx: 7, // 1/4t
      cutoff: 290,
      resonance: 5.8,
      filterMode: 0,
    },
  },
  {
    id: 'aggressive_dubstep',
    name: 'AGGRESSIVE DUBSTEP',
    params: {
      volume: 0.88,
      drive: 0.82,
      gain: 1.45,
      metal: 0.68,
      fmMetal: 0.78,
      wobbleRate: 6.0,
      wobbleDepth: 0.78,
      wobbleSync: 1,
      wobbleDivIdx: 10, // 1/8t
      cutoff: 560,
      resonance: 7.0,
      filterMode: 1,
    },
  },
];

export interface Ts666FxParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
}

export interface Ts666FxCatalogEntry {
  type: Ts666FxType;
  name: string;
  shortName: string;
  category: 'Modulation' | 'Distortion' | 'Time / Space' | 'Dynamics / EQ' | 'Spectral / Utility';
  defaultParams: Record<string, number>;
  paramDefs: Ts666FxParamDef[];
}

export const TS666_FX_CATALOG: Ts666FxCatalogEntry[] = [
  {
    type: 'growl_engine',
    name: 'WONKEY',
    shortName: 'WONKEY',
    category: 'Distortion',
    defaultParams: { ...TS666_GROWL_PRESETS[0].params },
    paramDefs: [
      { key: 'volume', label: 'Volume', min: 0, max: 1.2, step: 0.01, defaultValue: 0.88 },
      { key: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01, defaultValue: 0.34 },
      { key: 'gain', label: 'Gain', min: 0.2, max: 2.2, step: 0.01, defaultValue: 1.0 },
      { key: 'metal', label: 'Metal', min: 0, max: 1, step: 0.01, defaultValue: 0.22 },
      { key: 'fmMetal', label: 'FM Metal', min: 0, max: 1, step: 0.01, defaultValue: 0.14 },
      { key: 'wobbleRate', label: 'Wob Rate', min: 0.1, max: 20, step: 0.05, defaultValue: 2.0, unit: 'Hz' },
      { key: 'wobbleDepth', label: 'Wob Depth', min: 0, max: 1, step: 0.01, defaultValue: 0.52 },
      { key: 'cutoff', label: 'Cutoff', min: 50, max: 5500, step: 5, defaultValue: 440, unit: 'Hz' },
      { key: 'resonance', label: 'Res', min: 0.5, max: 12, step: 0.1, defaultValue: 4.4 },
    ],
  },
  {
    type: 'hyper_dim',
    name: 'Hyper / Dimension',
    shortName: 'HyperDim',
    category: 'Modulation',
    defaultParams: { rate: 0.45, detune: 0.35, hyperMix: 0.4, dimSize: 0.35, dimMix: 0.35 },
    paramDefs: [
      { key: 'rate', label: 'Rate', min: 0.05, max: 5, step: 0.01, defaultValue: 0.45, unit: 'Hz' },
      { key: 'detune', label: 'Detune', min: 0, max: 1, step: 0.01, defaultValue: 0.35 },
      { key: 'hyperMix', label: 'Hyper Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.4 },
      { key: 'dimSize', label: 'Dim Size', min: 0, max: 1, step: 0.01, defaultValue: 0.35 },
      { key: 'dimMix', label: 'Dim Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.35 },
    ],
  },
  {
    type: 'distortion',
    name: 'Distortion',
    shortName: 'Distort',
    category: 'Distortion',
    defaultParams: { mode: 0, drive: 0.35, tone: 0.72, mix: 0.6 },
    paramDefs: [
      { key: 'mode', label: 'Mode (0-3)', min: 0, max: 3, step: 1, defaultValue: 0 },
      { key: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01, defaultValue: 0.35 },
      { key: 'tone', label: 'Tone', min: 0, max: 1, step: 0.01, defaultValue: 0.72 },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.6 },
    ],
  },
  {
    type: 'flanger',
    name: 'Flanger',
    shortName: 'Flanger',
    category: 'Modulation',
    defaultParams: { rate: 0.35, depth: 0.55, feedback: 0.45, mix: 0.5 },
    paramDefs: [
      { key: 'rate', label: 'Rate', min: 0.05, max: 6, step: 0.01, defaultValue: 0.35, unit: 'Hz' },
      { key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, defaultValue: 0.55 },
      { key: 'feedback', label: 'Feedback', min: 0, max: 0.9, step: 0.01, defaultValue: 0.45 },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
    ],
  },
  {
    type: 'phaser',
    name: 'Phaser',
    shortName: 'Phaser',
    category: 'Modulation',
    defaultParams: { rate: 0.5, freq: 700, feedback: 0.45, mix: 0.5 },
    paramDefs: [
      { key: 'rate', label: 'Rate', min: 0.05, max: 6, step: 0.01, defaultValue: 0.5, unit: 'Hz' },
      { key: 'freq', label: 'Freq', min: 150, max: 3500, step: 10, defaultValue: 700, unit: 'Hz' },
      { key: 'feedback', label: 'Feed', min: 0, max: 0.85, step: 0.01, defaultValue: 0.45 },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
    ],
  },
  {
    type: 'chorus',
    name: 'Chorus',
    shortName: 'Chorus',
    category: 'Modulation',
    defaultParams: { rate: 0.6, depth: 0.45, feedback: 0.2, mix: 0.45 },
    paramDefs: [
      { key: 'rate', label: 'Rate', min: 0.05, max: 5, step: 0.01, defaultValue: 0.6, unit: 'Hz' },
      { key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, defaultValue: 0.45 },
      { key: 'feedback', label: 'Feedback', min: 0, max: 0.7, step: 0.01, defaultValue: 0.2 },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.45 },
    ],
  },
  {
    type: 'delay',
    name: 'Delay',
    shortName: 'Delay',
    category: 'Time / Space',
    defaultParams: { sync: 1, divIndex: 8, timeMs: 320, feedback: 0.4, tone: 0.65, mix: 0.35 },
    paramDefs: [
      { key: 'sync', label: 'Sync', min: 0, max: 1, step: 1, defaultValue: 1 },
      { key: 'divIndex', label: 'Div', min: 0, max: TS666_LFO_SYNC_DIVISIONS.length - 1, step: 1, defaultValue: 8 },
      { key: 'timeMs', label: 'Time', min: 20, max: 1200, step: 1, defaultValue: 320, unit: 'ms' },
      { key: 'feedback', label: 'Feed', min: 0, max: 0.88, step: 0.01, defaultValue: 0.4 },
      { key: 'tone', label: 'Tone', min: 0.1, max: 1, step: 0.01, defaultValue: 0.65 },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.35 },
    ],
  },
  {
    type: 'compressor',
    name: 'Compressor',
    shortName: 'Comp',
    category: 'Dynamics / EQ',
    defaultParams: { threshold: -18, ratio: 4, attack: 0.01, release: 0.15, gain: 2 },
    paramDefs: [
      { key: 'threshold', label: 'Thresh', min: -48, max: 0, step: 0.5, defaultValue: -18, unit: 'dB' },
      { key: 'ratio', label: 'Ratio', min: 1, max: 16, step: 0.2, defaultValue: 4 },
      { key: 'attack', label: 'Attack', min: 0.002, max: 0.2, step: 0.002, defaultValue: 0.01, unit: 's' },
      { key: 'release', label: 'Release', min: 0.02, max: 0.8, step: 0.01, defaultValue: 0.15, unit: 's' },
      { key: 'gain', label: 'Gain', min: -6, max: 18, step: 0.2, defaultValue: 2, unit: 'dB' },
    ],
  },
  {
    type: 'reverb',
    name: 'Reverb',
    shortName: 'Reverb',
    category: 'Time / Space',
    defaultParams: { size: 0.55, damping: 0.65, mix: 0.3 },
    paramDefs: [
      { key: 'size', label: 'Size', min: 0.1, max: 1, step: 0.01, defaultValue: 0.55 },
      { key: 'damping', label: 'Damp', min: 0.1, max: 1, step: 0.01, defaultValue: 0.65 },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.3 },
    ],
  },
  {
    type: 'conv_reverb',
    name: 'Convolution Reverb',
    shortName: 'ConvRev',
    category: 'Time / Space',
    defaultParams: { irIndex: 0, decay: 0.68, preDelayMs: 18, damping: 0.65, mix: 0.38 },
    paramDefs: [
      { key: 'irIndex', label: 'IR (0-3)', min: 0, max: 3, step: 1, defaultValue: 0 },
      { key: 'decay', label: 'Decay', min: 0.15, max: 1, step: 0.01, defaultValue: 0.68 },
      { key: 'preDelayMs', label: 'PreDly', min: 0, max: 120, step: 1, defaultValue: 18, unit: 'ms' },
      { key: 'damping', label: 'Damp', min: 0.1, max: 1, step: 0.01, defaultValue: 0.65 },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.38 },
    ],
  },
  {
    type: 'eq',
    name: 'EQ (3-Band)',
    shortName: 'EQ',
    category: 'Dynamics / EQ',
    defaultParams: { lowGain: 0, midFreq: 1200, midGain: 0, midQ: 1.2, highGain: 0 },
    paramDefs: [
      { key: 'lowGain', label: 'Low', min: -12, max: 12, step: 0.2, defaultValue: 0, unit: 'dB' },
      { key: 'midFreq', label: 'Mid Hz', min: 150, max: 6000, step: 10, defaultValue: 1200, unit: 'Hz' },
      { key: 'midGain', label: 'Mid', min: -12, max: 12, step: 0.2, defaultValue: 0, unit: 'dB' },
      { key: 'midQ', label: 'Mid Q', min: 0.3, max: 8, step: 0.1, defaultValue: 1.2 },
      { key: 'highGain', label: 'High', min: -12, max: 12, step: 0.2, defaultValue: 0, unit: 'dB' },
    ],
  },
  {
    type: 'filter',
    name: 'Filter FX',
    shortName: 'Filter',
    category: 'Dynamics / EQ',
    defaultParams: { mode: 0, cutoff: 1800, res: 1.4, drive: 0.1, mix: 1 },
    paramDefs: [
      { key: 'mode', label: 'Type (0-3)', min: 0, max: 3, step: 1, defaultValue: 0 },
      { key: 'cutoff', label: 'Cutoff', min: 40, max: 18000, step: 10, defaultValue: 1800, unit: 'Hz' },
      { key: 'res', label: 'Res', min: 0.3, max: 16, step: 0.1, defaultValue: 1.4 },
      { key: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01, defaultValue: 0.1 },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 1 },
    ],
  },
  {
    type: 'echobode',
    name: 'Echobode (Freq Shifter)',
    shortName: 'Echobode',
    category: 'Spectral / Utility',
    defaultParams: { freqShiftHz: 8, delayMs: 240, feedback: 0.42, tone: 0.72, mix: 0.45 },
    paramDefs: [
      { key: 'freqShiftHz', label: 'Shift Hz', min: -250, max: 250, step: 1, defaultValue: 8, unit: 'Hz' },
      { key: 'delayMs', label: 'Delay', min: 10, max: 900, step: 2, defaultValue: 240, unit: 'ms' },
      { key: 'feedback', label: 'Feed', min: 0, max: 0.85, step: 0.01, defaultValue: 0.42 },
      { key: 'tone', label: 'Tone', min: 0.1, max: 1, step: 0.01, defaultValue: 0.72 },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.45 },
    ],
  },
  {
    type: 'utility',
    name: 'Utility / Splitter',
    shortName: 'Utility',
    category: 'Spectral / Utility',
    defaultParams: { gainDb: 0, width: 1, lowMonoHz: 110, pan: 0 },
    paramDefs: [
      { key: 'gainDb', label: 'Gain', min: -18, max: 12, step: 0.2, defaultValue: 0, unit: 'dB' },
      { key: 'width', label: 'Width', min: 0, max: 2, step: 0.02, defaultValue: 1 },
      { key: 'lowMonoHz', label: 'LoMono', min: 20, max: 320, step: 5, defaultValue: 110, unit: 'Hz' },
      { key: 'pan', label: 'Pan', min: -1, max: 1, step: 0.02, defaultValue: 0 },
    ],
  },
  {
    type: 'cabinet',
    name: 'Cabinet Simulator',
    shortName: 'Cabinet',
    category: 'Distortion',
    defaultParams: { size: 0.52, tone: 0.62, drive: 0.12, mix: 0.45 },
    paramDefs: [
      { key: 'size', label: 'Cab Size', min: 0.1, max: 1, step: 0.01, defaultValue: 0.52 },
      { key: 'tone', label: 'Mic Tone', min: 0.1, max: 1, step: 0.01, defaultValue: 0.62 },
      { key: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01, defaultValue: 0.12 },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.45 },
    ],
  },
  {
    type: 'tremolo',
    name: 'Tremolo',
    shortName: 'Tremolo',
    category: 'Modulation',
    defaultParams: { rateHz: 4, depth: 0.5, stereo: 0.5, sync: 1, divisionIndex: 10, mix: 0.85 },
    paramDefs: [
      { key: 'rateHz', label: 'Rate', min: 0.2, max: 18, step: 0.1, defaultValue: 4, unit: 'Hz' },
      { key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
      { key: 'stereo', label: 'Stereo', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
      { key: 'sync', label: 'Sync', min: 0, max: 1, step: 1, defaultValue: 1 },
      { key: 'divisionIndex', label: 'Div', min: 0, max: TS666_LFO_SYNC_DIVISIONS.length - 1, step: 1, defaultValue: 10 },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.85 },
    ],
  },
];

export function createTs666FxModule(type: Ts666FxType): Ts666FxModule {
  const entry = TS666_FX_CATALOG.find((c) => c.type === type) ?? TS666_FX_CATALOG[0];
  return {
    id: `fx666_${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type: entry.type,
    name: entry.name,
    enabled: true,
    params: { ...entry.defaultParams },
  };
}

function makeDistortionCurve(drive: number, mode: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const amt = 1 + drive * 26;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    if (mode === 1) {
      // Hard Clip
      curve[i] = Math.max(-0.85, Math.min(0.85, x * (1 + drive * 6)));
    } else if (mode === 2) {
      // Foldback / Sine Fold
      curve[i] = Math.sin(x * Math.PI * (0.5 + drive * 3.5));
    } else if (mode === 3) {
      // Quantized Bitcrush
      const steps = Math.max(3, Math.round(28 - drive * 24));
      curve[i] = Math.round(x * steps) / steps;
    } else {
      // Soft Tube Saturation
      curve[i] = Math.tanh(x * amt) / Math.tanh(amt);
    }
  }
  return curve;
}

function makeGrowlSatFoldCurve(drive: number, metal: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const amt = 1 + drive * 14;
  const norm = Math.tanh(amt);
  const foldAmt = Math.min(0.45, metal * 0.42);
  const foldCycles = 0.55 + metal * 2.1 + drive * 0.65;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    const sat = Math.tanh(x * amt) / norm;
    const folded = Math.sin(x * Math.PI * foldCycles);
    const mixed = sat * (1 - foldAmt) + folded * foldAmt;
    curve[i] = Math.max(-0.95, Math.min(0.95, mixed));
  }
  return curve;
}

function makeSafetyLimiterCurve(): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(x * 1.15) * 0.94;
  }
  return curve;
}

function createReverbIR(
  ctx: AudioContext,
  durationSec: number,
  damping: number,
  preDelaySec = 0,
  irStyle = 0
): AudioBuffer {
  const sr = ctx.sampleRate;
  const totalSec = Math.min(4.2, Math.max(0.25, durationSec + preDelaySec));
  const len = Math.floor(sr * totalSec);
  const preSamples = Math.floor(sr * Math.min(0.14, Math.max(0, preDelaySec)));
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    const dampAlpha = 0.08 + damping * 0.72;
    for (let i = preSamples; i < len; i++) {
      const t = (i - preSamples) / Math.max(1, len - preSamples);
      const decayExp = irStyle === 1 ? 2.2 : irStyle === 2 ? 4.4 : 3.1;
      const env = Math.pow(1 - t, decayExp);
      const white = (Math.random() * 2 - 1) * (irStyle === 3 ? 0.65 + 0.35 * Math.sin(i * 0.04) : 1);
      lp = lp + dampAlpha * (white - lp);
      data[i] = lp * env * 0.55;
    }
  }
  return buf;
}

function createCabinetIR(ctx: AudioContext, size: number, tone: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(64, Math.floor(sr * (0.012 + size * 0.022)));
  const buf = ctx.createBuffer(2, len, sr);
  const resFreq = 110 + (1 - size) * 240;
  const rolloffFreq = 1800 + tone * 6800;
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    const alpha = Math.min(0.92, (2 * Math.PI * rolloffFreq) / sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const impulse = i === 0 ? 1 : 0;
      const body = Math.sin(2 * Math.PI * resFreq * t + ch * 0.12) * Math.exp(-t * 140) * 0.35;
      const box = Math.sin(2 * Math.PI * (resFreq * 3.1) * t) * Math.exp(-t * 280) * 0.16;
      const raw = impulse * 0.65 + body + box;
      lp = lp + alpha * (raw - lp);
      data[i] = lp;
    }
  }
  return buf;
}

interface BuiltFxInstance {
  id: string;
  type: Ts666FxType;
  input: GainNode;
  output: GainNode;
  updateParams: (
    params: Record<string, number>,
    bpm: number,
    os: Ts666Oversampling,
    modOffsets?: Ts666LiveModOffsets
  ) => void;
  getGrowlTelemetry?: () => Ts666GrowlTelemetry;
  dispose: () => void;
}

function clampfx(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function setFxTarget(
  cache: Record<string, number>,
  key: string,
  param: AudioParam,
  val: number,
  now: number,
  tau: number,
  eps = 0.0005
): void {
  const prev = cache[key];
  if (prev !== undefined && Math.abs(prev - val) <= eps) return;
  cache[key] = val;
  param.setTargetAtTime(val, now, tau);
}

function buildFxNode(
  ctx: AudioContext,
  mod: Ts666FxModule,
  bpm: number,
  oversampling: Ts666Oversampling
): BuiltFxInstance {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const cleanups: Array<() => void> = [];
  const nc: Record<string, number> = {};

  const osType: OverSampleType = oversampling === 4 ? '4x' : oversampling === 2 ? '2x' : 'none';

  let updateParams: BuiltFxInstance['updateParams'] = () => {};
  let getGrowlTelemetry: BuiltFxInstance['getGrowlTelemetry'] | undefined;

  switch (mod.type) {
    case 'growl_engine': {
      // 1. Input DC-Block + Preamp Gain
      const dcIn = ctx.createBiquadFilter();
      dcIn.type = 'highpass';
      dcIn.frequency.value = 24;
      dcIn.Q.value = 0.707;

      const preGain = ctx.createGain();
      preGain.gain.value = 1.0;

      // 2. Oversampled Nonlinear Saturation + Wavefolder
      const satFoldShaper = ctx.createWaveShaper();
      satFoldShaper.oversample = oversampling === 4 ? '4x' : '2x';

      // 3. Three parallel harmonic paths before Growl Filter:
      //    (a) Core saturated/wavefolded through-path
      const throughGain = ctx.createGain();

      //    (b) Metallic Comb Resonator (controlled feedback + damped HF)
      const combDelay = ctx.createDelay(0.05);
      combDelay.delayTime.value = 0.0042;
      const combLp = ctx.createBiquadFilter();
      combLp.type = 'lowpass';
      combLp.frequency.value = 7400;
      const combFb = ctx.createGain();
      combFb.gain.value = 0.25;
      const combMix = ctx.createGain();
      combMix.gain.value = 0.15;

      //    (c) Audio-rate FM Metallic Stage (smooth Sine carrier -> short Delay phase modulation)
      const fmDelay = ctx.createDelay(0.05);
      fmDelay.delayTime.value = 0.0028;
      const fmOsc = ctx.createOscillator();
      fmOsc.type = 'sine';
      fmOsc.frequency.value = 185;
      const fmModDepth = ctx.createGain();
      fmModDepth.gain.value = 0.0002;
      const fmSafetyLp = ctx.createBiquadFilter();
      fmSafetyLp.type = 'lowpass';
      fmSafetyLp.frequency.value = 11500;
      const fmDcBlock = ctx.createBiquadFilter();
      fmDcBlock.type = 'highpass';
      fmDcBlock.frequency.value = 34;
      const fmMix = ctx.createGain();
      fmMix.gain.value = 0.2;

      fmOsc.connect(fmModDepth).connect(fmDelay.delayTime);
      fmOsc.start();

      const preFilterSum = ctx.createGain();
      preFilterSum.gain.value = 0.9;

      // 4. Dual Resonant Growl Filter + Formant Enhancer
      const growlBq1 = ctx.createBiquadFilter();
      growlBq1.type = 'lowpass';
      growlBq1.frequency.value = 440;
      growlBq1.Q.value = 4.4;

      const growlBq2 = ctx.createBiquadFilter();
      growlBq2.type = 'peaking';
      growlBq2.frequency.value = 840;
      growlBq2.Q.value = 2.8;
      growlBq2.gain.value = 9;

      //    Real Wobble LFO driving filter detune smoothly in cents (±3200c exponential sweep)
      const wobbleOsc = ctx.createOscillator();
      wobbleOsc.type = 'sine';
      wobbleOsc.frequency.value = 2.0;
      const wobbleDepthG1 = ctx.createGain();
      wobbleDepthG1.gain.value = 1600;
      const wobbleDepthG2 = ctx.createGain();
      wobbleDepthG2.gain.value = 1400;
      wobbleOsc.connect(wobbleDepthG1).connect(growlBq1.detune);
      wobbleOsc.connect(wobbleDepthG2).connect(growlBq2.detune);
      wobbleOsc.start();

      // 5. Harmonic Presence Enhancer + Soft Safety Limiter + Volume
      const enhancerShelf = ctx.createBiquadFilter();
      enhancerShelf.type = 'highshelf';
      enhancerShelf.frequency.value = 2600;
      enhancerShelf.gain.value = 1.5;

      const safetyLimiter = ctx.createWaveShaper();
      safetyLimiter.oversample = '2x';
      safetyLimiter.curve = makeSafetyLimiterCurve();

      const wetVol = ctx.createGain();
      wetVol.gain.value = 0.88;

      // Connect graph
      input.connect(dcIn).connect(preGain).connect(satFoldShaper);

      satFoldShaper.connect(throughGain).connect(preFilterSum);

      satFoldShaper.connect(combDelay).connect(combLp).connect(combMix).connect(preFilterSum);
      combLp.connect(combFb).connect(combDelay);

      satFoldShaper
        .connect(fmDelay)
        .connect(fmSafetyLp)
        .connect(fmDcBlock)
        .connect(fmMix)
        .connect(preFilterSum);

      preFilterSum
        .connect(growlBq1)
        .connect(growlBq2)
        .connect(enhancerShelf)
        .connect(safetyLimiter)
        .connect(wetVol)
        .connect(output);

      cleanups.push(() => {
        try {
          fmOsc.stop();
          wobbleOsc.stop();
        } catch {}
      });

      let lastCurveSig = '';
      let lastFilterMode = -1;
      let lastOs: OverSampleType = '2x';
      let cachedRateHz = 2.0;
      let cachedBaseCut = 440;
      let cachedSpanCents = 0.52 * 3000;
      let liveState: Ts666GrowlTelemetry = {
        enabled: true,
        cutoffHz: 440,
        modulatedCutoffHz: 440,
        resonance: 4.4,
        drive: 0.34,
        gain: 1.0,
        metal: 0.22,
        fmMetal: 0.14,
        wobbleRateHz: 2.0,
        wobbleDepth: 0.52,
        wobblePhase01: 0,
        filterMode: 0,
        volume: 0.88,
      };

      updateParams = (p, currentBpm, os, modOff) => {
        const now = ctx.currentTime;

        const volume = clampfx((p.volume ?? 0.88) + (modOff?.GROWL_VOL ?? 0), 0, 1.2);
        const drive = clampfx((p.drive ?? 0.34) + (modOff?.GROWL_DRIVE ?? 0), 0, 1);
        const gain = clampfx((p.gain ?? 1.0) + (modOff?.GROWL_GAIN ?? 0), 0.2, 2.2);
        const metal = clampfx((p.metal ?? 0.22) + (modOff?.GROWL_METAL ?? 0), 0, 1);
        const fmMetal = clampfx((p.fmMetal ?? 0.14) + (modOff?.GROWL_FM ?? 0), 0, 1);
        const wobbleDepth = clampfx(
          (p.wobbleDepth ?? 0.52) + (modOff?.GROWL_DEPTH ?? 0),
          0,
          1
        );
        const baseCut = clampfx(
          (p.cutoff ?? 440) * Math.pow(2, (modOff?.GROWL_CUTOFF ?? 0) * 3.5),
          50,
          5500
        );
        const res = clampfx((p.resonance ?? 4.4) + (modOff?.GROWL_RES ?? 0) * 6, 0.5, 12);
        const filterMode = Math.max(0, Math.min(2, Math.round(p.filterMode ?? 0)));

        const sync = (p.wobbleSync ?? 1) >= 0.5;
        let rateHz = clampfx(
          (p.wobbleRate ?? 2.0) * Math.pow(2, (modOff?.GROWL_RATE ?? 0) * 2.5),
          0.08,
          22
        );
        if (sync) {
          const idx = clampfx(Math.round(p.wobbleDivIdx ?? 9), 0, TS666_LFO_SYNC_DIVISIONS.length - 1);
          rateHz = syncDivisionToHz(TS666_LFO_SYNC_DIVISIONS[idx].id, currentBpm);
        }

        cachedRateHz = rateHz;
        cachedBaseCut = baseCut;

        setFxTarget(nc, 'preG', preGain.gain, gain, now, 0.018);
        const targetOs: OverSampleType = os === 4 ? '4x' : '2x';
        if (targetOs !== lastOs) {
          lastOs = targetOs;
          satFoldShaper.oversample = targetOs;
        }
        const sig = `${Math.round(drive * 40)}:${Math.round(metal * 40)}`;
        if (sig !== lastCurveSig) {
          lastCurveSig = sig;
          satFoldShaper.curve = makeGrowlSatFoldCurve(drive, metal);
        }

        // Metallic comb delay & damping
        setFxTarget(nc, 'cDel', combDelay.delayTime, 0.0024 + (1 - metal) * 0.0052, now, 0.02, 0.00002);
        setFxTarget(nc, 'cFb', combFb.gain, metal * 0.64, now, 0.02);
        setFxTarget(nc, 'cMix', combMix.gain, metal * 0.42, now, 0.02);

        // Controlled audio-rate FM metallic carrier
        setFxTarget(nc, 'thru', throughGain.gain, clampfx(1 - fmMetal * 0.3, 0.35, 1), now, 0.02);
        setFxTarget(nc, 'fmF', fmOsc.frequency, 125 + metal * 195 + fmMetal * 210, now, 0.02, 0.1);
        setFxTarget(nc, 'fmD', fmModDepth.gain, fmMetal * 0.00115, now, 0.02, 0.00001);
        setFxTarget(nc, 'fmM', fmMix.gain, fmMetal * 0.78, now, 0.02);

        // Resonant Growl Filter Modes
        const modeChanged = filterMode !== lastFilterMode;
        lastFilterMode = filterMode;
        if (filterMode === 1) {
          if (modeChanged) {
            growlBq1.type = 'bandpass';
            growlBq2.type = 'peaking';
          }
          setFxTarget(nc, 'bq1F', growlBq1.frequency, baseCut, now, 0.015, 0.25);
          setFxTarget(nc, 'bq1Q', growlBq1.Q, Math.max(1.2, res * 0.72), now, 0.015, 0.01);
          setFxTarget(nc, 'bq2F', growlBq2.frequency, clampfx(baseCut * 2.15, 120, 9500), now, 0.015, 0.5);
          setFxTarget(nc, 'bq2Q', growlBq2.Q, 2.6 + res * 0.2, now, 0.015, 0.01);
          setFxTarget(nc, 'bq2G', growlBq2.gain, 8 + metal * 5, now, 0.015, 0.02);
        } else if (filterMode === 2) {
          if (modeChanged) {
            growlBq1.type = 'notch';
            growlBq2.type = 'lowpass';
          }
          setFxTarget(nc, 'bq1F', growlBq1.frequency, clampfx(baseCut * 0.88, 60, 7000), now, 0.015, 0.25);
          setFxTarget(nc, 'bq1Q', growlBq1.Q, Math.max(1.0, res * 0.65), now, 0.015, 0.01);
          setFxTarget(nc, 'bq2F', growlBq2.frequency, clampfx(baseCut * 1.9, 100, 14000), now, 0.015, 0.5);
          setFxTarget(nc, 'bq2Q', growlBq2.Q, res * 0.85, now, 0.015, 0.01);
        } else {
          if (modeChanged) {
            growlBq1.type = 'lowpass';
            growlBq2.type = 'peaking';
          }
          setFxTarget(nc, 'bq1F', growlBq1.frequency, baseCut, now, 0.015, 0.25);
          setFxTarget(nc, 'bq1Q', growlBq1.Q, res * 0.82, now, 0.015, 0.01);
          setFxTarget(nc, 'bq2F', growlBq2.frequency, clampfx(baseCut * 1.85, 100, 9500), now, 0.015, 0.5);
          setFxTarget(nc, 'bq2Q', growlBq2.Q, 2.8, now, 0.015, 0.01);
          setFxTarget(nc, 'bq2G', growlBq2.gain, 7.5 + drive * 4.5, now, 0.015, 0.02);
        }

        // Smooth exponential wobble sweep via detune cents
        setFxTarget(nc, 'wobF', wobbleOsc.frequency, rateHz, now, 0.02, 0.002);
        const spanCents = wobbleDepth * 3000;
        cachedSpanCents = spanCents;
        setFxTarget(nc, 'wobD1', wobbleDepthG1.gain, spanCents, now, 0.02, 1);
        setFxTarget(nc, 'wobD2', wobbleDepthG2.gain, spanCents * 0.88, now, 0.02, 1);

        setFxTarget(nc, 'enhG', enhancerShelf.gain, 1.0 + drive * 2.2 + metal * 2.2, now, 0.02, 0.01);
        setFxTarget(nc, 'vol', wetVol.gain, volume, now, 0.015);

        liveState = {
          enabled: true,
          cutoffHz: baseCut,
          modulatedCutoffHz: baseCut,
          resonance: res,
          drive,
          gain,
          metal,
          fmMetal,
          wobbleRateHz: rateHz,
          wobbleDepth,
          wobblePhase01: 0,
          filterMode,
          volume,
        };
      };

      getGrowlTelemetry = () => {
        const phase01 = ((performance.now() / 1000) * cachedRateHz) % 1;
        const wobbleWave = Math.sin(phase01 * Math.PI * 2);
        const modCutoff = clampfx(
          cachedBaseCut * Math.pow(2, (wobbleWave * cachedSpanCents) / 1200),
          35,
          17000
        );
        return {
          ...liveState,
          wobblePhase01: phase01,
          modulatedCutoffHz: modCutoff,
        };
      };
      break;
    }

    case 'hyper_dim': {
      const dry = ctx.createGain();
      const wetH = ctx.createGain();
      const wetD = ctx.createGain();
      const d1 = ctx.createDelay(0.05);
      const d2 = ctx.createDelay(0.05);
      const dDim = ctx.createDelay(0.08);
      d1.delayTime.value = 0.008;
      d2.delayTime.value = 0.013;
      dDim.delayTime.value = 0.022;
      const p1 = ctx.createStereoPanner();
      const p2 = ctx.createStereoPanner();
      const pDim = ctx.createStereoPanner();
      p1.pan.value = -0.75;
      p2.pan.value = 0.75;
      pDim.pan.value = 0.65;
      const lfo1 = ctx.createOscillator();
      const lfo2 = ctx.createOscillator();
      const g1 = ctx.createGain();
      const g2 = ctx.createGain();
      lfo1.connect(g1).connect(d1.delayTime);
      lfo2.connect(g2).connect(d2.delayTime);
      lfo1.start();
      lfo2.start();
      cleanups.push(() => {
        try { lfo1.stop(); lfo2.stop(); } catch {}
      });
      input.connect(dry).connect(output);
      input.connect(d1).connect(p1).connect(wetH).connect(output);
      input.connect(d2).connect(p2).connect(wetH);
      input.connect(dDim).connect(pDim).connect(wetD).connect(output);

      updateParams = (p) => {
        const now = ctx.currentTime;
        const rate = Math.max(0.05, p.rate ?? 0.45);
        const detune = Math.max(0, p.detune ?? 0.35);
        const hMix = Math.max(0, Math.min(1, p.hyperMix ?? 0.4));
        const dimSize = Math.max(0, Math.min(1, p.dimSize ?? 0.35));
        const dMix = Math.max(0, Math.min(1, p.dimMix ?? 0.35));
        setFxTarget(nc, 'l1', lfo1.frequency, rate, now, 0.02);
        setFxTarget(nc, 'l2', lfo2.frequency, rate * 1.13, now, 0.02);
        setFxTarget(nc, 'g1', g1.gain, 0.001 + detune * 0.005, now, 0.02, 0.00002);
        setFxTarget(nc, 'g2', g2.gain, 0.001 + detune * 0.005, now, 0.02, 0.00002);
        setFxTarget(nc, 'dd', dDim.delayTime, 0.009 + dimSize * 0.032, now, 0.02, 0.00005);
        setFxTarget(nc, 'dry', dry.gain, 1 - Math.max(hMix, dMix) * 0.35, now, 0.02);
        setFxTarget(nc, 'wh', wetH.gain, hMix * 0.65, now, 0.02);
        setFxTarget(nc, 'wd', wetD.gain, dMix * 0.55, now, 0.02);
      };
      break;
    }

    case 'distortion': {
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      const toneLp = ctx.createBiquadFilter();
      toneLp.type = 'lowpass';
      input.connect(dry).connect(output);
      input.connect(shaper).connect(toneLp).connect(wet).connect(output);
      let lastSig = '';
      let lastOs: OverSampleType = 'none';
      updateParams = (p, _b, os) => {
        const now = ctx.currentTime;
        const mode = Math.round(p.mode ?? 0);
        const drive = Math.max(0, Math.min(1, p.drive ?? 0.35));
        const tone = Math.max(0, Math.min(1, p.tone ?? 0.72));
        const mix = Math.max(0, Math.min(1, p.mix ?? 0.6));
        const targetOs: OverSampleType = drive <= 0.004 ? 'none' : os === 4 ? '4x' : os === 2 ? '2x' : 'none';
        if (targetOs !== lastOs) {
          lastOs = targetOs;
          shaper.oversample = targetOs;
        }
        const sig = `${mode}:${Math.round(drive * 50)}`;
        if (sig !== lastSig) {
          lastSig = sig;
          shaper.curve = drive <= 0.004 ? null : makeDistortionCurve(drive, mode);
        }
        setFxTarget(nc, 'tf', toneLp.frequency, 800 + Math.pow(tone, 1.8) * 16000, now, 0.02, 1);
        setFxTarget(nc, 'dry', dry.gain, 1 - mix, now, 0.02);
        setFxTarget(nc, 'wet', wet.gain, mix, now, 0.02);
      };
      break;
    }

    case 'flanger':
    case 'chorus': {
      const isFlange = mod.type === 'flanger';
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const d = ctx.createDelay(0.06);
      const fb = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      d.delayTime.value = isFlange ? 0.004 : 0.016;
      lfo.connect(lfoG).connect(d.delayTime);
      lfo.start();
      cleanups.push(() => { try { lfo.stop(); } catch {} });
      input.connect(dry).connect(output);
      input.connect(d).connect(wet).connect(output);
      d.connect(fb).connect(d);
      updateParams = (p) => {
        const now = ctx.currentTime;
        const rate = Math.max(0.05, p.rate ?? 0.45);
        const depth = Math.max(0, Math.min(1, p.depth ?? 0.5));
        const feedback = Math.max(0, Math.min(0.9, p.feedback ?? (isFlange ? 0.45 : 0.2)));
        const mix = Math.max(0, Math.min(1, p.mix ?? 0.5));
        setFxTarget(nc, 'r', lfo.frequency, rate, now, 0.02);
        setFxTarget(nc, 'd', lfoG.gain, (isFlange ? 0.003 : 0.008) * depth, now, 0.02, 0.00001);
        setFxTarget(nc, 'fb', fb.gain, feedback, now, 0.02);
        setFxTarget(nc, 'dry', dry.gain, 1 - mix * 0.45, now, 0.02);
        setFxTarget(nc, 'wet', wet.gain, mix * 0.8, now, 0.02);
      };
      break;
    }

    case 'phaser': {
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const stages = Array.from({ length: 4 }, () => {
        const ap = ctx.createBiquadFilter();
        ap.type = 'allpass';
        ap.Q.value = 0.8;
        return ap;
      });
      const fb = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      stages.forEach((s) => lfoG.connect(s.frequency));
      lfo.connect(lfoG);
      lfo.start();
      cleanups.push(() => { try { lfo.stop(); } catch {} });
      input.connect(dry).connect(output);
      input.connect(stages[0]);
      for (let i = 0; i < stages.length - 1; i++) stages[i].connect(stages[i + 1]);
      stages[stages.length - 1].connect(wet).connect(output);
      stages[stages.length - 1].connect(fb).connect(stages[0]);
      updateParams = (p) => {
        const now = ctx.currentTime;
        const rate = Math.max(0.05, p.rate ?? 0.5);
        const freq = Math.max(120, p.freq ?? 700);
        const feed = Math.max(0, Math.min(0.85, p.feedback ?? 0.45));
        const mix = Math.max(0, Math.min(1, p.mix ?? 0.5));
        setFxTarget(nc, 'r', lfo.frequency, rate, now, 0.02);
        stages.forEach((s, si) => setFxTarget(nc, `f${si}`, s.frequency, freq, now, 0.02, 0.5));
        setFxTarget(nc, 'd', lfoG.gain, freq * 0.65, now, 0.02, 0.5);
        setFxTarget(nc, 'fb', fb.gain, feed, now, 0.02);
        setFxTarget(nc, 'dry', dry.gain, 1 - mix * 0.45, now, 0.02);
        setFxTarget(nc, 'wet', wet.gain, mix * 0.85, now, 0.02);
      };
      break;
    }

    case 'delay': {
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const dL = ctx.createDelay(2.0);
      const dR = ctx.createDelay(2.0);
      const fbL = ctx.createGain();
      const fbR = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      const panL = ctx.createStereoPanner();
      const panR = ctx.createStereoPanner();
      panL.pan.value = -0.65;
      panR.pan.value = 0.65;

      input.connect(dry).connect(output);
      input.connect(lp);
      lp.connect(dL).connect(panL).connect(wet).connect(output);
      dL.connect(fbR).connect(dR).connect(panR).connect(wet);
      dR.connect(fbL).connect(dL);

      updateParams = (p, currentBpm) => {
        const now = ctx.currentTime;
        const sync = (p.sync ?? 1) >= 0.5;
        let delaySec = Math.max(0.015, Math.min(1.8, (p.timeMs ?? 320) / 1000));
        if (sync) {
          const idx = Math.max(0, Math.min(TS666_LFO_SYNC_DIVISIONS.length - 1, Math.round(p.divIndex ?? 8)));
          const hz = syncDivisionToHz(TS666_LFO_SYNC_DIVISIONS[idx].id, currentBpm);
          delaySec = Math.max(0.02, Math.min(1.8, 1 / Math.max(0.25, hz)));
        }
        const feed = Math.max(0, Math.min(0.88, p.feedback ?? 0.4));
        const tone = Math.max(0.1, Math.min(1, p.tone ?? 0.65));
        const mix = Math.max(0, Math.min(1, p.mix ?? 0.35));
        setFxTarget(nc, 'dL', dL.delayTime, delaySec, now, 0.03, 0.0002);
        setFxTarget(nc, 'dR', dR.delayTime, delaySec * 0.75, now, 0.03, 0.0002);
        setFxTarget(nc, 'fbL', fbL.gain, feed, now, 0.02);
        setFxTarget(nc, 'fbR', fbR.gain, feed * 0.9, now, 0.02);
        setFxTarget(nc, 'lp', lp.frequency, 900 + tone * 11000, now, 0.02, 1);
        setFxTarget(nc, 'dry', dry.gain, 1, now, 0.02);
        setFxTarget(nc, 'wet', wet.gain, mix * 0.75, now, 0.02);
      };
      break;
    }

    case 'compressor': {
      const comp = ctx.createDynamicsCompressor();
      const makeup = ctx.createGain();
      input.connect(comp).connect(makeup).connect(output);
      updateParams = (p) => {
        const now = ctx.currentTime;
        setFxTarget(nc, 'th', comp.threshold, p.threshold ?? -18, now, 0.02, 0.02);
        setFxTarget(nc, 'ra', comp.ratio, Math.max(1, p.ratio ?? 4), now, 0.02, 0.02);
        setFxTarget(nc, 'at', comp.attack, Math.max(0.001, p.attack ?? 0.01), now, 0.02, 0.0002);
        setFxTarget(nc, 're', comp.release, Math.max(0.01, p.release ?? 0.15), now, 0.02, 0.0005);
        const gainLin = Math.pow(10, (p.gain ?? 2) / 20);
        setFxTarget(nc, 'mk', makeup.gain, gainLin, now, 0.02);
      };
      break;
    }

    case 'reverb':
    case 'conv_reverb': {
      const isConv = mod.type === 'conv_reverb';
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const conv = ctx.createConvolver();
      input.connect(dry).connect(output);
      input.connect(conv).connect(wet).connect(output);
      let irTimer: number | null = null;
      let lastSig = '';
      cleanups.push(() => {
        if (irTimer !== null) window.clearTimeout(irTimer);
      });
      const applyIr = (p: Record<string, number>) => {
        const irIdx = isConv ? Math.round(p.irIndex ?? 0) : 0;
        const sizeOrDecay = isConv ? (p.decay ?? 0.68) : (p.size ?? 0.55);
        const damp = p.damping ?? 0.65;
        const preMs = isConv ? (p.preDelayMs ?? 18) : 0;
        const sig = `${irIdx}:${Math.round(sizeOrDecay * 25)}:${Math.round(damp * 20)}:${Math.round(preMs / 5)}`;
        if (sig === lastSig) return;
        lastSig = sig;
        if (irTimer !== null) window.clearTimeout(irTimer);
        irTimer = window.setTimeout(() => {
          conv.buffer = createReverbIR(ctx, 0.4 + sizeOrDecay * 3.0, damp, preMs / 1000, irIdx);
        }, 60);
      };
      conv.buffer = createReverbIR(ctx, 1.8, 0.65, isConv ? 0.018 : 0, 0);
      updateParams = (p) => {
        const now = ctx.currentTime;
        const mix = Math.max(0, Math.min(1, p.mix ?? 0.35));
        setFxTarget(nc, 'dry', dry.gain, 1 - mix * 0.35, now, 0.02);
        setFxTarget(nc, 'wet', wet.gain, mix * 0.85, now, 0.02);
        applyIr(p);
      };
      break;
    }

    case 'eq': {
      const low = ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 140;
      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      const high = ctx.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = 5200;
      input.connect(low).connect(mid).connect(high).connect(output);
      updateParams = (p) => {
        const now = ctx.currentTime;
        setFxTarget(nc, 'lg', low.gain, p.lowGain ?? 0, now, 0.02, 0.02);
        setFxTarget(nc, 'mf', mid.frequency, Math.max(100, p.midFreq ?? 1200), now, 0.02, 0.5);
        setFxTarget(nc, 'mg', mid.gain, p.midGain ?? 0, now, 0.02, 0.02);
        setFxTarget(nc, 'mq', mid.Q, Math.max(0.2, p.midQ ?? 1.2), now, 0.02, 0.01);
        setFxTarget(nc, 'hg', high.gain, p.highGain ?? 0, now, 0.02, 0.02);
      };
      break;
    }

    case 'filter': {
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      shaper.oversample = 'none';
      const bq = ctx.createBiquadFilter();
      input.connect(dry).connect(output);
      input.connect(shaper).connect(bq).connect(wet).connect(output);
      const types: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch'];
      let lastD = -1;
      let lastMode = -1;
      let lastOs: OverSampleType = 'none';
      updateParams = (p, _b, os) => {
        const now = ctx.currentTime;
        const mode = Math.max(0, Math.min(3, Math.round(p.mode ?? 0)));
        if (mode !== lastMode) {
          lastMode = mode;
          bq.type = types[mode];
        }
        setFxTarget(nc, 'f', bq.frequency, Math.max(30, Math.min(19000, p.cutoff ?? 1800)), now, 0.02, 0.5);
        setFxTarget(nc, 'q', bq.Q, Math.max(0.2, p.res ?? 1.4), now, 0.02, 0.01);
        const drive = Math.max(0, Math.min(1, p.drive ?? 0.1));
        const targetOs: OverSampleType = drive <= 0.004 ? 'none' : os === 4 ? '4x' : os === 2 ? '2x' : 'none';
        if (targetOs !== lastOs) {
          lastOs = targetOs;
          shaper.oversample = targetOs;
        }
        const qD = Math.round(drive * 40);
        if (qD !== lastD) {
          lastD = qD;
          shaper.curve = drive <= 0.004 ? null : makeDistortionCurve(drive, 0);
        }
        const mix = Math.max(0, Math.min(1, p.mix ?? 1));
        setFxTarget(nc, 'dry', dry.gain, 1 - mix, now, 0.02);
        setFxTarget(nc, 'wet', wet.gain, mix, now, 0.02);
      };
      break;
    }

    case 'echobode': {
      // Bode Frequency Shifter (Hilbert allpass quadrature network + SSB mod) + Feedback Delay
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const delay = ctx.createDelay(1.5);
      const feedback = ctx.createGain();
      const toneLp = ctx.createBiquadFilter();
      toneLp.type = 'lowpass';

      const apI1 = ctx.createBiquadFilter();
      const apI2 = ctx.createBiquadFilter();
      const apQ1 = ctx.createBiquadFilter();
      const apQ2 = ctx.createBiquadFilter();
      [apI1, apI2, apQ1, apQ2].forEach((n) => { n.type = 'allpass'; n.Q.value = 0.707; });
      apI1.frequency.value = 380;
      apI2.frequency.value = 2400;
      apQ1.frequency.value = 780;
      apQ2.frequency.value = 4800;

      const ringCos = ctx.createGain();
      const ringSin = ctx.createGain();
      ringCos.gain.value = 0;
      ringSin.gain.value = 0;
      const sideSign = ctx.createGain();
      sideSign.gain.value = 1;

      const oscCos = ctx.createOscillator();
      const oscSin = ctx.createOscillator();
      const cosWave = ctx.createPeriodicWave(new Float32Array([0, 1]), new Float32Array([0, 0]));
      const sinWave = ctx.createPeriodicWave(new Float32Array([0, 0]), new Float32Array([0, 1]));
      oscCos.setPeriodicWave(cosWave);
      oscSin.setPeriodicWave(sinWave);
      oscCos.start();
      oscSin.start();
      oscCos.connect(ringCos.gain);
      oscSin.connect(sideSign).connect(ringSin.gain);
      cleanups.push(() => { try { oscCos.stop(); oscSin.stop(); } catch {} });

      const ssbSum = ctx.createGain();
      ssbSum.gain.value = 0.75;

      input.connect(dry).connect(output);
      input.connect(apI1).connect(apI2).connect(ringCos).connect(ssbSum);
      input.connect(apQ1).connect(apQ2).connect(ringSin).connect(ssbSum);
      ssbSum.connect(toneLp).connect(delay).connect(wet).connect(output);
      delay.connect(feedback).connect(apI1);
      delay.connect(feedback);

      updateParams = (p) => {
        const now = ctx.currentTime;
        const shiftHz = p.freqShiftHz ?? 8;
        const absHz = Math.max(0.05, Math.min(400, Math.abs(shiftHz)));
        setFxTarget(nc, 'fC', oscCos.frequency, absHz, now, 0.02, 0.01);
        setFxTarget(nc, 'fS', oscSin.frequency, absHz, now, 0.02, 0.01);
        setFxTarget(nc, 'ss', sideSign.gain, shiftHz < 0 ? -1 : 1, now, 0.01);
        const dSec = Math.max(0.01, Math.min(1.4, (p.delayMs ?? 240) / 1000));
        setFxTarget(nc, 'del', delay.delayTime, dSec, now, 0.02, 0.0002);
        setFxTarget(nc, 'fb', feedback.gain, Math.max(0, Math.min(0.84, p.feedback ?? 0.42)), now, 0.02);
        setFxTarget(nc, 'tlp', toneLp.frequency, 700 + (p.tone ?? 0.72) * 14000, now, 0.02, 1);
        const mix = Math.max(0, Math.min(1, p.mix ?? 0.45));
        setFxTarget(nc, 'dry', dry.gain, 1 - mix * 0.35, now, 0.02);
        setFxTarget(nc, 'wet', wet.gain, mix * 0.85, now, 0.02);
      };
      break;
    }

    case 'utility': {
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      const lpL = ctx.createBiquadFilter();
      const lpR = ctx.createBiquadFilter();
      const hpL = ctx.createBiquadFilter();
      const hpR = ctx.createBiquadFilter();
      lpL.type = lpR.type = 'lowpass';
      hpL.type = hpR.type = 'highpass';

      const gLL = ctx.createGain();
      const gRL = ctx.createGain();
      const gLR = ctx.createGain();
      const gRR = ctx.createGain();

      input.connect(splitter);
      splitter.connect(lpL, 0);
      splitter.connect(lpR, 1);
      const lowMonoSum = ctx.createGain();
      lowMonoSum.gain.value = 0.5;
      lpL.connect(lowMonoSum);
      lpR.connect(lowMonoSum);
      lowMonoSum.connect(merger, 0, 0);
      lowMonoSum.connect(merger, 0, 1);

      splitter.connect(hpL, 0);
      splitter.connect(hpR, 1);
      hpL.connect(gLL).connect(merger, 0, 0);
      hpR.connect(gRL).connect(merger, 0, 0);
      hpL.connect(gLR).connect(merger, 0, 1);
      hpR.connect(gRR).connect(merger, 0, 1);
      merger.connect(panner).connect(gain).connect(output);

      updateParams = (p) => {
        const now = ctx.currentTime;
        const db = p.gainDb ?? 0;
        const lin = Math.pow(10, db / 20);
        setFxTarget(nc, 'g', gain.gain, lin, now, 0.02);
        setFxTarget(nc, 'pan', panner.pan, Math.max(-1, Math.min(1, p.pan ?? 0)), now, 0.02);
        const splitHz = Math.max(20, Math.min(400, p.lowMonoHz ?? 110));
        setFxTarget(nc, 'lpL', lpL.frequency, splitHz, now, 0.02, 0.2);
        setFxTarget(nc, 'lpR', lpR.frequency, splitHz, now, 0.02, 0.2);
        setFxTarget(nc, 'hpL', hpL.frequency, splitHz, now, 0.02, 0.2);
        setFxTarget(nc, 'hpR', hpR.frequency, splitHz, now, 0.02, 0.2);
        const w = Math.max(0, Math.min(2, p.width ?? 1));
        const same = 0.5 * (1 + w);
        const cross = 0.5 * (1 - w);
        setFxTarget(nc, 'll', gLL.gain, same, now, 0.02);
        setFxTarget(nc, 'rr', gRR.gain, same, now, 0.02);
        setFxTarget(nc, 'rl', gRL.gain, cross, now, 0.02);
        setFxTarget(nc, 'lr', gLR.gain, cross, now, 0.02);
      };
      break;
    }

    case 'cabinet': {
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      const conv = ctx.createConvolver();
      conv.buffer = createCabinetIR(ctx, 0.52, 0.62);
      input.connect(dry).connect(output);
      input.connect(shaper).connect(conv).connect(wet).connect(output);
      let cabTimer: number | null = null;
      let lastSig = '';
      let lastDriveQ = -1;
      let lastOs: OverSampleType = 'none';
      cleanups.push(() => { if (cabTimer !== null) window.clearTimeout(cabTimer); });
      updateParams = (p, _b, os) => {
        const now = ctx.currentTime;
        const size = Math.max(0.1, Math.min(1, p.size ?? 0.52));
        const tone = Math.max(0.1, Math.min(1, p.tone ?? 0.62));
        const drive = Math.max(0, Math.min(1, p.drive ?? 0.12));
        const mix = Math.max(0, Math.min(1, p.mix ?? 0.45));
        const targetOs: OverSampleType = drive <= 0.004 ? 'none' : os === 4 ? '4x' : os === 2 ? '2x' : 'none';
        if (targetOs !== lastOs) {
          lastOs = targetOs;
          shaper.oversample = targetOs;
        }
        const dq = Math.round(drive * 40);
        if (dq !== lastDriveQ) {
          lastDriveQ = dq;
          shaper.curve = drive <= 0.004 ? null : makeDistortionCurve(drive * 0.6, 0);
        }
        setFxTarget(nc, 'dry', dry.gain, 1 - mix, now, 0.02);
        setFxTarget(nc, 'wet', wet.gain, mix * 1.1, now, 0.02);
        const sig = `${Math.round(size * 25)}:${Math.round(tone * 25)}`;
        if (sig !== lastSig) {
          lastSig = sig;
          if (cabTimer !== null) window.clearTimeout(cabTimer);
          cabTimer = window.setTimeout(() => {
            conv.buffer = createCabinetIR(ctx, size, tone);
          }, 50);
        }
      };
      break;
    }

    case 'tremolo': {
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const baseG = ctx.createGain();
      const panner = ctx.createStereoPanner();
      const lfo = ctx.createOscillator();
      const depthG = ctx.createGain();
      const panLfoG = ctx.createGain();
      baseG.gain.value = 0.75;
      lfo.connect(depthG).connect(baseG.gain);
      lfo.connect(panLfoG).connect(panner.pan);
      lfo.start();
      cleanups.push(() => { try { lfo.stop(); } catch {} });
      input.connect(dry).connect(output);
      input.connect(baseG).connect(panner).connect(wet).connect(output);
      updateParams = (p, currentBpm) => {
        const now = ctx.currentTime;
        const sync = (p.sync ?? 1) >= 0.5;
        let hz = Math.max(0.1, p.rateHz ?? 4);
        if (sync) {
          const idx = Math.max(0, Math.min(TS666_LFO_SYNC_DIVISIONS.length - 1, Math.round(p.divisionIndex ?? 10)));
          hz = syncDivisionToHz(TS666_LFO_SYNC_DIVISIONS[idx].id, currentBpm);
        }
        const depth = Math.max(0, Math.min(1, p.depth ?? 0.5));
        const stereo = Math.max(0, Math.min(1, p.stereo ?? 0.5));
        const mix = Math.max(0, Math.min(1, p.mix ?? 0.85));
        setFxTarget(nc, 'hz', lfo.frequency, hz, now, 0.02, 0.002);
        setFxTarget(nc, 'bg', baseG.gain, 1 - depth * 0.5, now, 0.02);
        setFxTarget(nc, 'dg', depthG.gain, depth * 0.5, now, 0.02);
        setFxTarget(nc, 'pl', panLfoG.gain, stereo * depth * 0.7, now, 0.02);
        setFxTarget(nc, 'dry', dry.gain, 1 - mix, now, 0.02);
        setFxTarget(nc, 'wet', wet.gain, mix, now, 0.02);
      };
      break;
    }
  }

  updateParams(mod.params, bpm, oversampling);

  return {
    id: mod.id,
    type: mod.type,
    input,
    output,
    updateParams,
    getGrowlTelemetry,
    dispose: () => {
      cleanups.forEach((c) => c());
      try {
        input.disconnect();
        output.disconnect();
      } catch {
        // ignore
      }
    },
  };
}

class SingleBusFxChain {
  private input: GainNode;
  private output: GainNode;
  private instances: BuiltFxInstance[] = [];
  private lastStructureSig = '';
  private bypassed = false;

  constructor(private ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.input.connect(this.output);
  }

  getInput(): GainNode {
    return this.input;
  }

  getOutput(): GainNode {
    return this.output;
  }

  sync(
    modules: Ts666FxModule[],
    bypassed: boolean,
    bpm: number,
    oversampling: Ts666Oversampling,
    modOffsets?: Ts666LiveModOffsets
  ): void {
    const activeMods = bypassed ? [] : modules.filter((m) => m.enabled);
    const sig = activeMods.map((m) => `${m.id}:${m.type}`).join('|');

    if (sig !== this.lastStructureSig || this.bypassed !== bypassed) {
      this.bypassed = bypassed;
      this.lastStructureSig = sig;
      this.rebuild(activeMods, bpm, oversampling);
    } else {
      for (let i = 0; i < activeMods.length; i++) {
        this.instances[i]?.updateParams(
          activeMods[i].params,
          bpm,
          oversampling,
          modOffsets
        );
      }
    }
  }

  getGrowlTelemetry(): Ts666GrowlTelemetry | null {
    const found = this.instances.find((inst) => inst.type === 'growl_engine');
    return found?.getGrowlTelemetry?.() ?? null;
  }

  private rebuild(
    activeMods: Ts666FxModule[],
    bpm: number,
    oversampling: Ts666Oversampling
  ): void {
    try {
      this.input.disconnect();
    } catch {
      // ignore
    }
    this.instances.forEach((inst) => inst.dispose());
    this.instances = [];

    if (activeMods.length === 0) {
      this.input.connect(this.output);
      return;
    }

    let cursor: AudioNode = this.input;
    for (const mod of activeMods) {
      const built = buildFxNode(this.ctx, mod, bpm, oversampling);
      this.instances.push(built);
      cursor.connect(built.input);
      cursor = built.output;
    }
    cursor.connect(this.output);
  }

  dispose(): void {
    this.instances.forEach((i) => i.dispose());
    this.instances = [];
    try {
      this.input.disconnect();
      this.output.disconnect();
    } catch {
      // ignore
    }
  }
}

export class Ts666ThreeBusFxEngine {
  private chains: Record<Ts666BusId, SingleBusFxChain>;

  constructor(ctx: AudioContext) {
    this.chains = {
      main: new SingleBusFxChain(ctx),
      bus1: new SingleBusFxChain(ctx),
      bus2: new SingleBusFxChain(ctx),
    };
  }

  getBusInput(bus: Ts666BusId): GainNode {
    return this.chains[bus].getInput();
  }

  getBusOutput(bus: Ts666BusId): GainNode {
    return this.chains[bus].getOutput();
  }

  sync(
    fx: Ts666FxBuses,
    bpm: number,
    oversampling: Ts666Oversampling,
    modOffsets?: Ts666LiveModOffsets
  ): void {
    this.chains.main.sync(fx.main, fx.mainBypass, bpm, oversampling, modOffsets);
    this.chains.bus1.sync(fx.bus1, fx.bus1Bypass, bpm, oversampling, modOffsets);
    this.chains.bus2.sync(fx.bus2, fx.bus2Bypass, bpm, oversampling, modOffsets);
  }

  getGrowlTelemetry(): Ts666GrowlTelemetry | null {
    return (
      this.chains.main.getGrowlTelemetry() ??
      this.chains.bus1.getGrowlTelemetry() ??
      this.chains.bus2.getGrowlTelemetry()
    );
  }

  dispose(): void {
    this.chains.main.dispose();
    this.chains.bus1.dispose();
    this.chains.bus2.dispose();
  }
}
