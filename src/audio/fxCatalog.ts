import type {
  FxCategoryId,
  FxCategoryMeta,
  FxChainPreset,
  FxTrackId,
  ModularFxInstance,
  ProjectDeviceFxState,
} from '../types/fx';
import {
  CABINET_TYPES,
  TREMOLO_SYNC_DIVISIONS,
  TREMOLO_WAVEFORMS,
} from './cabinetAndTremolo';
import { mirrorKeyToIndexedDb } from './tarekIndexedDb';

const USER_FX_PRESETS_KEY = 'tarek_fx_chain_presets_v1';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const db = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`;
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} kHz` : `${Math.round(v)} Hz`);
const ms = (v: number) => `${Math.round(v)} ms`;

export const FX_CATEGORY_ORDER: FxCategoryId[] = [
  'distortion',
  'saturation',
  'filter',
  'eq',
  'compressor',
  'reverb',
  'delay',
  'chorus',
  'phaser',
  'flanger',
  'cabinet',
  'tremolo',
  'stereo',
  'limiter',
];

export const FX_CATEGORIES: Record<FxCategoryId, FxCategoryMeta> = {
  distortion: {
    id: 'distortion',
    name: 'Distortion',
    shortName: 'DIST',
    groupLabel: 'Drive',
    description: 'Harmonic waveshaping overdrive, foldback & tone shaping.',
    colorHex: '#F97316',
    headerBgClass: 'bg-orange-500/20 border-b border-orange-400/40 text-orange-200',
    borderClass: 'border-orange-500/45',
    activeRingClass: 'ring-1 ring-orange-400/60 shadow-[0_0_16px_rgba(249,115,22,0.18)]',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-400/50',
    params: [
      { key: 'drive', label: 'Drive', min: 0, max: 1, defaultValue: 0.42, primary: true, formatValue: pct },
      { key: 'tone', label: 'Tone', min: 350, max: 14000, defaultValue: 5200, logarithmic: true, primary: true, formatValue: hz },
      { key: 'mix', label: 'Mix', min: 0, max: 1, defaultValue: 0.65, primary: true, formatValue: pct },
      { key: 'output', label: 'Out', min: 0.2, max: 1.5, defaultValue: 0.9, formatValue: pct },
      { key: 'mode', label: 'Shape', min: 0, max: 2, step: 1, defaultValue: 0, options: ['Soft', 'Hard', 'Fold'] },
    ],
  },
  saturation: {
    id: 'saturation',
    name: 'Saturation',
    shortName: 'SAT',
    groupLabel: 'Color',
    description: 'Asymmetric analog tape & tube warmth with soft clipping.',
    colorHex: '#F59E0B',
    headerBgClass: 'bg-amber-500/20 border-b border-amber-400/40 text-amber-200',
    borderClass: 'border-amber-500/45',
    activeRingClass: 'ring-1 ring-amber-400/60 shadow-[0_0_16px_rgba(245,158,11,0.18)]',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-400/50',
    params: [
      { key: 'drive', label: 'Drive', min: 0, max: 1, defaultValue: 0.38, primary: true, formatValue: pct },
      { key: 'warmth', label: 'Warmth', min: 500, max: 16000, defaultValue: 6800, logarithmic: true, primary: true, formatValue: hz },
      { key: 'mix', label: 'Mix', min: 0, max: 1, defaultValue: 0.75, primary: true, formatValue: pct },
      { key: 'output', label: 'Output', min: 0.3, max: 1.4, defaultValue: 0.95, formatValue: pct },
    ],
  },
  filter: {
    id: 'filter',
    name: 'Filter',
    shortName: 'FILT',
    groupLabel: 'Tone',
    description: 'Multimode resonant LP / HP / BP / Notch filter.',
    colorHex: '#3B82F6',
    headerBgClass: 'bg-blue-500/20 border-b border-blue-400/40 text-blue-200',
    borderClass: 'border-blue-500/45',
    activeRingClass: 'ring-1 ring-blue-400/60 shadow-[0_0_16px_rgba(59,130,246,0.2)]',
    badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-400/50',
    params: [
      { key: 'cutoff', label: 'Cutoff', min: 35, max: 18000, defaultValue: 2600, logarithmic: true, primary: true, formatValue: hz },
      { key: 'resonance', label: 'Res', min: 0.5, max: 14, defaultValue: 2.2, primary: true, formatValue: (v) => v.toFixed(1) },
      { key: 'mix', label: 'Mix', min: 0, max: 1, defaultValue: 1.0, primary: true, formatValue: pct },
      { key: 'type', label: 'Mode', min: 0, max: 3, step: 1, defaultValue: 0, options: ['LP', 'HP', 'BP', 'Notch'] },
    ],
  },
  eq: {
    id: 'eq',
    name: 'EQ',
    shortName: 'EQ3',
    groupLabel: 'Tone',
    description: '3-Band mastering equalizer with sweepable midrange.',
    colorHex: '#14B8A6',
    headerBgClass: 'bg-teal-500/20 border-b border-teal-400/40 text-teal-200',
    borderClass: 'border-teal-500/45',
    activeRingClass: 'ring-1 ring-teal-400/60 shadow-[0_0_16px_rgba(20,184,166,0.18)]',
    badgeClass: 'bg-teal-500/20 text-teal-300 border-teal-400/50',
    params: [
      { key: 'low', label: 'Low', min: -12, max: 12, step: 0.5, defaultValue: 2, bipolar: true, primary: true, formatValue: db },
      { key: 'mid', label: 'Mid', min: -12, max: 12, step: 0.5, defaultValue: 0, bipolar: true, primary: true, formatValue: db },
      { key: 'high', label: 'High', min: -12, max: 12, step: 0.5, defaultValue: 1.5, bipolar: true, primary: true, formatValue: db },
      { key: 'midFreq', label: 'Mid Hz', min: 220, max: 5200, defaultValue: 1100, logarithmic: true, formatValue: hz },
    ],
  },
  compressor: {
    id: 'compressor',
    name: 'Compressor',
    shortName: 'COMP',
    groupLabel: 'Dynamics',
    description: 'Punchy channel bus compressor with parallel mix blend.',
    colorHex: '#10B981',
    headerBgClass: 'bg-emerald-500/20 border-b border-emerald-400/40 text-emerald-200',
    borderClass: 'border-emerald-500/45',
    activeRingClass: 'ring-1 ring-emerald-400/60 shadow-[0_0_16px_rgba(16,185,129,0.18)]',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50',
    params: [
      { key: 'threshold', label: 'Thresh', min: -42, max: -1, step: 0.5, defaultValue: -18, primary: true, formatValue: (v) => `${v.toFixed(0)} dB` },
      { key: 'ratio', label: 'Ratio', min: 1.5, max: 16, step: 0.5, defaultValue: 4, primary: true, formatValue: (v) => `${v.toFixed(1)}:1` },
      { key: 'makeup', label: 'Gain', min: 0.5, max: 2.2, defaultValue: 1.2, primary: true, formatValue: pct },
      { key: 'attack', label: 'Atk', min: 1, max: 80, defaultValue: 8, formatValue: ms },
      { key: 'release', label: 'Rel', min: 30, max: 500, defaultValue: 140, formatValue: ms },
      { key: 'mix', label: 'Mix', min: 0, max: 1, defaultValue: 1, formatValue: pct },
    ],
  },
  reverb: {
    id: 'reverb',
    name: 'Reverb',
    shortName: 'VERB',
    groupLabel: 'Space',
    description: 'Stereo studio hall & shimmer convolution reverb.',
    colorHex: '#6366F1',
    headerBgClass: 'bg-indigo-500/20 border-b border-indigo-400/40 text-indigo-200',
    borderClass: 'border-indigo-500/45',
    activeRingClass: 'ring-1 ring-indigo-400/60 shadow-[0_0_16px_rgba(99,102,241,0.2)]',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-400/50',
    params: [
      { key: 'size', label: 'Size', min: 0.25, max: 3.2, defaultValue: 1.4, primary: true, formatValue: (v) => `${v.toFixed(1)}s` },
      { key: 'damp', label: 'Damp', min: 900, max: 15000, defaultValue: 5600, logarithmic: true, primary: true, formatValue: hz },
      { key: 'mix', label: 'Mix', min: 0, max: 0.85, defaultValue: 0.26, primary: true, formatValue: pct },
      { key: 'predelay', label: 'PreDly', min: 0, max: 60, defaultValue: 14, formatValue: ms },
    ],
  },
  delay: {
    id: 'delay',
    name: 'Delay',
    shortName: 'DLY',
    groupLabel: 'Space',
    description: 'Stereo ping-pong echo delay with damped feedback.',
    colorHex: '#22C55E',
    headerBgClass: 'bg-green-500/20 border-b border-green-400/40 text-green-200',
    borderClass: 'border-green-500/45',
    activeRingClass: 'ring-1 ring-green-400/60 shadow-[0_0_16px_rgba(34,197,94,0.18)]',
    badgeClass: 'bg-green-500/20 text-green-300 border-green-400/50',
    params: [
      { key: 'timeMs', label: 'Time', min: 40, max: 750, defaultValue: 260, primary: true, formatValue: ms },
      { key: 'feedback', label: 'Fdbk', min: 0, max: 0.82, defaultValue: 0.38, primary: true, formatValue: pct },
      { key: 'mix', label: 'Mix', min: 0, max: 0.85, defaultValue: 0.28, primary: true, formatValue: pct },
      { key: 'tone', label: 'Tone', min: 700, max: 12000, defaultValue: 4200, logarithmic: true, formatValue: hz },
    ],
  },
  chorus: {
    id: 'chorus',
    name: 'Chorus',
    shortName: 'CHOR',
    groupLabel: 'Mod',
    description: 'Lush stereo dual-voice LFO ensemble thickener.',
    colorHex: '#A855F7',
    headerBgClass: 'bg-purple-500/20 border-b border-purple-400/40 text-purple-200',
    borderClass: 'border-purple-500/45',
    activeRingClass: 'ring-1 ring-purple-400/60 shadow-[0_0_16px_rgba(168,85,247,0.2)]',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-400/50',
    params: [
      { key: 'rate', label: 'Rate', min: 0.15, max: 5, defaultValue: 0.9, primary: true, formatValue: (v) => `${v.toFixed(1)} Hz` },
      { key: 'depth', label: 'Depth', min: 0, max: 1, defaultValue: 0.45, primary: true, formatValue: pct },
      { key: 'mix', label: 'Mix', min: 0, max: 0.9, defaultValue: 0.42, primary: true, formatValue: pct },
    ],
  },
  phaser: {
    id: 'phaser',
    name: 'Phaser',
    shortName: 'PHAS',
    groupLabel: 'Mod',
    description: '3-stage cascaded all-pass sweep with resonant feedback.',
    colorHex: '#EC4899',
    headerBgClass: 'bg-pink-500/20 border-b border-pink-400/40 text-pink-200',
    borderClass: 'border-pink-500/45',
    activeRingClass: 'ring-1 ring-pink-400/60 shadow-[0_0_16px_rgba(236,72,153,0.18)]',
    badgeClass: 'bg-pink-500/20 text-pink-300 border-pink-400/50',
    params: [
      { key: 'rate', label: 'Rate', min: 0.1, max: 4.5, defaultValue: 0.65, primary: true, formatValue: (v) => `${v.toFixed(1)} Hz` },
      { key: 'depth', label: 'Depth', min: 0, max: 1, defaultValue: 0.65, primary: true, formatValue: pct },
      { key: 'feedback', label: 'Fdbk', min: 0, max: 0.78, defaultValue: 0.35, primary: true, formatValue: pct },
      { key: 'mix', label: 'Mix', min: 0, max: 1, defaultValue: 0.55, formatValue: pct },
    ],
  },
  flanger: {
    id: 'flanger',
    name: 'Flanger',
    shortName: 'FLNG',
    groupLabel: 'Mod',
    description: 'Metallic jet sweep short comb-delay modulation.',
    colorHex: '#06B6D4',
    headerBgClass: 'bg-cyan-500/20 border-b border-cyan-400/40 text-cyan-200',
    borderClass: 'border-cyan-500/45',
    activeRingClass: 'ring-1 ring-cyan-400/60 shadow-[0_0_16px_rgba(6,182,212,0.18)]',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50',
    params: [
      { key: 'rate', label: 'Rate', min: 0.08, max: 3.5, defaultValue: 0.38, primary: true, formatValue: (v) => `${v.toFixed(2)} Hz` },
      { key: 'depth', label: 'Depth', min: 0, max: 1, defaultValue: 0.6, primary: true, formatValue: pct },
      { key: 'feedback', label: 'Fdbk', min: 0, max: 0.78, defaultValue: 0.45, primary: true, formatValue: pct },
      { key: 'mix', label: 'Mix', min: 0, max: 1, defaultValue: 0.5, formatValue: pct },
    ],
  },
  cabinet: {
    id: 'cabinet',
    name: 'Cabinet Simulator',
    shortName: 'CAB',
    groupLabel: 'Color',
    description: 'Realistic speaker & bass cab IR convolution with mic placement & room air.',
    colorHex: '#EAB308',
    headerBgClass: 'bg-yellow-500/20 border-b border-yellow-400/40 text-yellow-200',
    borderClass: 'border-yellow-500/45',
    activeRingClass: 'ring-1 ring-yellow-400/60 shadow-[0_0_16px_rgba(234,179,8,0.18)]',
    badgeClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/50',
    params: [
      { key: 'size', label: 'Size', min: 0, max: 1, defaultValue: 0.55, primary: true, formatValue: pct },
      { key: 'micPosition', label: 'Mic Pos', min: 0, max: 1, defaultValue: 0.35, primary: true, formatValue: pct },
      { key: 'roomAmount', label: 'Room', min: 0, max: 1, defaultValue: 0.2, primary: true, formatValue: pct },
      {
        key: 'cabinetType',
        label: 'Cab Type',
        min: 0,
        max: CABINET_TYPES.length - 1,
        step: 1,
        defaultValue: 0,
        options: CABINET_TYPES.map((c) => c.shortLabel),
      },
      { key: 'micDistance', label: 'Mic Dist', min: 0, max: 1, defaultValue: 0.25, formatValue: pct },
      { key: 'mix', label: 'Mix', min: 0, max: 1, defaultValue: 0.85, formatValue: pct },
      { key: 'outputGain', label: 'Gain', min: 0.3, max: 1.6, defaultValue: 1.0, formatValue: pct },
    ],
  },
  tremolo: {
    id: 'tremolo',
    name: 'Tremolo',
    shortName: 'TREM',
    groupLabel: 'Mod',
    description: 'Smooth click-free amplitude modulation with stereo phase & BPM sync.',
    colorHex: '#2EE59D',
    headerBgClass: 'bg-emerald-500/20 border-b border-emerald-400/40 text-emerald-200',
    borderClass: 'border-emerald-500/45',
    activeRingClass: 'ring-1 ring-emerald-400/60 shadow-[0_0_16px_rgba(46,229,157,0.18)]',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50',
    params: [
      { key: 'rate', label: 'Rate', min: 0.1, max: 20, logarithmic: true, defaultValue: 4.0, primary: true, formatValue: (v) => `${v.toFixed(1)} Hz` },
      { key: 'depth', label: 'Depth', min: 0, max: 1, defaultValue: 0.65, primary: true, formatValue: pct },
      { key: 'stereoPhase', label: 'Phase', min: 0, max: 180, step: 5, defaultValue: 90, primary: true, formatValue: (v) => `${Math.round(v)}°` },
      {
        key: 'waveform',
        label: 'Waveform',
        min: 0,
        max: TREMOLO_WAVEFORMS.length - 1,
        step: 1,
        defaultValue: 0,
        options: TREMOLO_WAVEFORMS.map((w) => w.label),
      },
      {
        key: 'sync',
        label: 'Sync',
        min: 0,
        max: 1,
        step: 1,
        defaultValue: 0,
        options: ['Free', 'BPM'],
      },
      {
        key: 'division',
        label: 'Div',
        min: 0,
        max: TREMOLO_SYNC_DIVISIONS.length - 1,
        step: 1,
        defaultValue: 5,
        options: [...TREMOLO_SYNC_DIVISIONS],
      },
      { key: 'mix', label: 'Mix', min: 0, max: 1, defaultValue: 1.0, formatValue: pct },
    ],
  },
  stereo: {
    id: 'stereo',
    name: 'Stereo',
    shortName: 'WIDE',
    groupLabel: 'Utility',
    description: 'Mid/Side stereo width shaper with mono low-end protection.',
    colorHex: '#38BDF8',
    headerBgClass: 'bg-sky-500/20 border-b border-sky-400/40 text-sky-200',
    borderClass: 'border-sky-500/45',
    activeRingClass: 'ring-1 ring-sky-400/60 shadow-[0_0_16px_rgba(56,189,248,0.18)]',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-400/50',
    params: [
      { key: 'width', label: 'Width', min: 0, max: 2.0, defaultValue: 1.35, primary: true, formatValue: pct },
      { key: 'monoHz', label: 'Sub Mono', min: 40, max: 260, defaultValue: 110, primary: true, formatValue: hz },
      { key: 'output', label: 'Out', min: 0.5, max: 1.3, defaultValue: 1.0, primary: true, formatValue: pct },
    ],
  },
  limiter: {
    id: 'limiter',
    name: 'Limiter',
    shortName: 'LIM',
    groupLabel: 'Dynamics',
    description: 'Zero-clip brickwall peak maximizer & ceiling control.',
    colorHex: '#F43F5E',
    headerBgClass: 'bg-rose-500/20 border-b border-rose-400/40 text-rose-200',
    borderClass: 'border-rose-500/45',
    activeRingClass: 'ring-1 ring-rose-400/60 shadow-[0_0_16px_rgba(244,63,94,0.18)]',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-400/50',
    params: [
      { key: 'ceiling', label: 'Ceiling', min: -16, max: -0.3, step: 0.1, defaultValue: -1.5, primary: true, formatValue: (v) => `${v.toFixed(1)} dB` },
      { key: 'inputGain', label: 'Boost', min: 0.7, max: 2.0, defaultValue: 1.12, primary: true, formatValue: pct },
      { key: 'release', label: 'Rel', min: 25, max: 300, defaultValue: 85, primary: true, formatValue: ms },
    ],
  },
};

export function createDefaultParamsForCategory(type: FxCategoryId): Record<string, number> {
  const meta = FX_CATEGORIES[type];
  const out: Record<string, number> = {};
  for (const p of meta.params) {
    out[p.key] = p.defaultValue;
  }
  return out;
}

export function createFxInstance(
  type: FxCategoryId,
  overrides?: Partial<ModularFxInstance>
): ModularFxInstance {
  const meta = FX_CATEGORIES[type];
  const defaults = createDefaultParamsForCategory(type);
  return {
    id: `fx-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    name: overrides?.name ?? meta.name,
    enabled: overrides?.enabled ?? true,
    expanded: overrides?.expanded ?? false,
    params: {
      ...defaults,
      ...(overrides?.params ?? {}),
    },
  };
}

export function createDefaultProjectDeviceFx(): ProjectDeviceFxState {
  return {
    serum: [],
    subbass: [],
    beatbox: [],
    ts666: [],
    bassremix: [],
  };
}

export function normalizeModularFxList(raw: unknown): ModularFxInstance[] {
  if (!Array.isArray(raw)) return [];
  const valid: ModularFxInstance[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Partial<ModularFxInstance>;
    if (!obj.type || !(obj.type in FX_CATEGORIES)) continue;
    const defaults = createDefaultParamsForCategory(obj.type);
    const cleanedParams: Record<string, number> = { ...defaults };
    if (obj.params && typeof obj.params === 'object') {
      for (const [k, v] of Object.entries(obj.params)) {
        if (typeof v === 'number' && Number.isFinite(v)) {
          cleanedParams[k] = v;
        }
      }
    }
    valid.push({
      id: typeof obj.id === 'string' && obj.id ? obj.id : `fx-${obj.type}-${valid.length}`,
      type: obj.type,
      name: typeof obj.name === 'string' && obj.name ? obj.name : FX_CATEGORIES[obj.type].name,
      enabled: typeof obj.enabled === 'boolean' ? obj.enabled : true,
      expanded: Boolean(obj.expanded),
      params: cleanedParams,
    });
  }
  return valid;
}

export function normalizeProjectDeviceFx(raw: unknown): ProjectDeviceFxState {
  const defaults = createDefaultProjectDeviceFx();
  if (!raw || typeof raw !== 'object') return defaults;
  const r = raw as Partial<Record<FxTrackId, unknown>>;
  return {
    serum: normalizeModularFxList(r.serum),
    subbass: normalizeModularFxList(r.subbass),
    beatbox: normalizeModularFxList(r.beatbox),
    ts666: normalizeModularFxList(r.ts666),
    bassremix: normalizeModularFxList(r.bassremix),
  };
}

export const FACTORY_FX_CHAIN_PRESETS: FxChainPreset[] = [
  {
    id: 'preset-dubstep-smash',
    name: 'Dubstep Bass Smash',
    description: 'Distortion -> Filter -> Compressor -> Limiter',
    isFactory: true,
    modules: [
      { type: 'distortion', enabled: true, params: { drive: 0.56, tone: 4800, mix: 0.7, output: 0.9, mode: 1 } },
      { type: 'filter', enabled: true, params: { cutoff: 3400, resonance: 3.4, mix: 1.0, type: 0 } },
      { type: 'compressor', enabled: true, params: { threshold: -18, ratio: 5.5, makeup: 1.25, attack: 6, release: 120, mix: 0.95 } },
      { type: 'limiter', enabled: true, params: { ceiling: -1.2, inputGain: 1.15, release: 75 } },
    ],
  },
  {
    id: 'preset-wide-ambient',
    name: 'Wide Ambient Lead',
    description: 'Chorus -> Delay -> Reverb -> Stereo',
    isFactory: true,
    modules: [
      { type: 'chorus', enabled: true, params: { rate: 0.7, depth: 0.52, mix: 0.48 } },
      { type: 'delay', enabled: true, params: { timeMs: 310, feedback: 0.42, mix: 0.3, tone: 3900 } },
      { type: 'reverb', enabled: true, params: { size: 2.1, damp: 6200, mix: 0.34, predelay: 18 } },
      { type: 'stereo', enabled: true, params: { width: 1.55, monoHz: 140, output: 1.0 } },
    ],
  },
  {
    id: 'preset-drum-glue',
    name: 'Punchy Drum Glue',
    description: 'Saturation -> EQ -> Compressor -> Limiter',
    isFactory: true,
    modules: [
      { type: 'saturation', enabled: true, params: { drive: 0.32, warmth: 8200, mix: 0.65, output: 0.96 } },
      { type: 'eq', enabled: true, params: { low: 3.0, mid: -1.5, high: 2.5, midFreq: 950 } },
      { type: 'compressor', enabled: true, params: { threshold: -16, ratio: 4.0, makeup: 1.3, attack: 12, release: 110, mix: 0.85 } },
      { type: 'limiter', enabled: true, params: { ceiling: -1.0, inputGain: 1.1, release: 65 } },
    ],
  },
  {
    id: 'preset-sub-clean',
    name: 'Sub Clean Mastering',
    description: 'Saturation -> EQ -> Stereo (120Hz Mono) -> Limiter',
    isFactory: true,
    modules: [
      { type: 'saturation', enabled: true, params: { drive: 0.24, warmth: 3200, mix: 0.45, output: 0.98 } },
      { type: 'eq', enabled: true, params: { low: 2.5, mid: 0.5, high: -1.5, midFreq: 420 } },
      { type: 'stereo', enabled: true, params: { width: 0.65, monoHz: 125, output: 1.0 } },
      { type: 'limiter', enabled: true, params: { ceiling: -0.8, inputGain: 1.08, release: 90 } },
    ],
  },
  {
    id: 'preset-motion-fx',
    name: 'Swirl & Jet Motion',
    description: 'Phaser -> Flanger -> Filter -> Delay',
    isFactory: true,
    modules: [
      { type: 'phaser', enabled: true, params: { rate: 0.55, depth: 0.72, feedback: 0.42, mix: 0.6 } },
      { type: 'flanger', enabled: true, params: { rate: 0.28, depth: 0.55, feedback: 0.38, mix: 0.42 } },
      { type: 'filter', enabled: true, params: { cutoff: 4200, resonance: 2.6, mix: 1.0, type: 0 } },
      { type: 'delay', enabled: true, params: { timeMs: 220, feedback: 0.35, mix: 0.26, tone: 4600 } },
    ],
  },
];

export function loadUserFxChainPresets(): FxChainPreset[] {
  try {
    const raw = localStorage.getItem(USER_FX_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => p && typeof p.name === 'string' && Array.isArray(p.modules));
  } catch {
    return [];
  }
}

export function saveUserFxChainPreset(name: string, modules: ModularFxInstance[]): FxChainPreset[] {
  const cleanName = name.trim() || 'Custom FX Chain';
  const existing = loadUserFxChainPresets();
  const nextPreset: FxChainPreset = {
    id: `user-fx-${Date.now()}`,
    name: cleanName,
    description: modules.map((m) => FX_CATEGORIES[m.type].shortName).join(' -> ') || 'Empty Chain',
    modules: modules.map((m) => ({
      type: m.type,
      name: m.name,
      enabled: m.enabled,
      params: { ...m.params },
    })),
  };
  const updated = [...existing, nextPreset];
  const serialized = JSON.stringify(updated);
  try {
    localStorage.setItem(USER_FX_PRESETS_KEY, serialized);
  } catch {
    // ignore quota
  }
  void mirrorKeyToIndexedDb(USER_FX_PRESETS_KEY, serialized);
  return updated;
}

export function deleteUserFxChainPreset(id: string): FxChainPreset[] {
  const updated = loadUserFxChainPresets().filter((p) => p.id !== id);
  const serialized = JSON.stringify(updated);
  try {
    localStorage.setItem(USER_FX_PRESETS_KEY, serialized);
  } catch {
    // ignore
  }
  void mirrorKeyToIndexedDb(USER_FX_PRESETS_KEY, serialized);
  return updated;
}
