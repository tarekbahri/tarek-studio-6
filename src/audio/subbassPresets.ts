import type { MidiNote } from '../types/sequencer';
import { mirrorKeyToIndexedDb } from './tarekIndexedDb';
import type {
  SubbassFilterType,
  SubbassFxConfig,
  SubbassFxId,
  SubbassFxPreset,
  SubbassOctave,
  SubbassPatch,
  SubbassPattern,
  SubbassPhaseDeg,
  SubbassPreset,
  SubbassSequencerState,
  SubbassSidechainRate,
} from '../types/subbass';

const USER_PRESETS_KEY = 'tarek_subbass_user_presets_v1';

export const SUBBASS_FACTORY_PRESETS: SubbassPreset[] = [
  {
    id: 'pure_deep_sub',
    name: 'Pure Deep Sub',
    patch: {
      subLevel: 0.95,
      bassTone: 0.12,
      attack: 0.08,
      release: 0.34,
      glide: 0.14,
      saturation: 0.1,
      lowPassFilter: 0.42,
      outputVolume: 0.88,
      squareEnabled: false,
      octave: -1,
      phase: 0,
    },
  },
  {
    id: 'riddim_sub',
    name: 'Riddim Sub',
    patch: {
      subLevel: 0.9,
      bassTone: 0.56,
      attack: 0.03,
      release: 0.18,
      glide: 0.18,
      saturation: 0.46,
      lowPassFilter: 0.54,
      outputVolume: 0.88,
      squareEnabled: true,
      octave: -1,
      phase: 90,
    },
  },
  {
    id: 'dj_style_sub',
    name: 'DJ Style Sub',
    patch: {
      subLevel: 0.92,
      bassTone: 0.38,
      attack: 0.05,
      release: 0.28,
      glide: 0.32,
      saturation: 0.28,
      lowPassFilter: 0.48,
      outputVolume: 0.88,
      squareEnabled: false,
      octave: -1,
      phase: 0,
    },
  },
  {
    id: 'heavy_dubstep_sub',
    name: 'Heavy Dubstep Sub',
    patch: {
      subLevel: 0.94,
      bassTone: 0.72,
      attack: 0.04,
      release: 0.26,
      glide: 0.24,
      saturation: 0.68,
      lowPassFilter: 0.62,
      outputVolume: 0.86,
      squareEnabled: true,
      octave: -1,
      phase: 180,
    },
  },
  {
    id: 'clean_sine',
    name: 'Clean Sine',
    patch: {
      subLevel: 1.0,
      bassTone: 0.0,
      attack: 0.06,
      release: 0.32,
      glide: 0.08,
      saturation: 0.0,
      lowPassFilter: 0.68,
      outputVolume: 0.88,
      squareEnabled: false,
      octave: -1,
      phase: 0,
    },
  },
  {
    id: 'distorted_sub',
    name: 'Distorted Sub',
    patch: {
      subLevel: 0.88,
      bassTone: 0.82,
      attack: 0.03,
      release: 0.24,
      glide: 0.22,
      saturation: 0.88,
      lowPassFilter: 0.66,
      outputVolume: 0.82,
      squareEnabled: true,
      octave: -1,
      phase: 90,
    },
  },
  {
    id: 'dark_sub',
    name: 'Dark Sub',
    patch: {
      subLevel: 0.96,
      bassTone: 0.28,
      attack: 0.14,
      release: 0.48,
      glide: 0.28,
      saturation: 0.24,
      lowPassFilter: 0.28,
      outputVolume: 0.9,
      squareEnabled: false,
      octave: -2,
      phase: 180,
    },
  },
  {
    id: 'punchy_sub',
    name: 'Punchy Sub',
    patch: {
      subLevel: 0.95,
      bassTone: 0.44,
      attack: 0.01,
      release: 0.16,
      glide: 0.06,
      saturation: 0.36,
      lowPassFilter: 0.52,
      outputVolume: 0.9,
      squareEnabled: false,
      octave: -1,
      phase: 0,
    },
  },
  {
    id: 'modern_talking_low_layer',
    name: 'Modern Talking Low Layer',
    patch: {
      subLevel: 0.86,
      bassTone: 0.78,
      attack: 0.04,
      release: 0.22,
      glide: 0.36,
      saturation: 0.62,
      lowPassFilter: 0.74,
      outputVolume: 0.84,
      squareEnabled: true,
      octave: -1,
      phase: 270,
    },
  },
  {
    id: 'deep_wobble_sub',
    name: 'Deep Wobble Sub',
    patch: {
      subLevel: 0.92,
      bassTone: 0.58,
      attack: 0.1,
      release: 0.38,
      glide: 0.42,
      saturation: 0.44,
      lowPassFilter: 0.46,
      outputVolume: 0.88,
      squareEnabled: true,
      octave: -1,
      phase: 180,
    },
  },
];

function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.max(0, Math.min(1, v))
    : fallback;
}

function normalizeOctave(v: unknown): SubbassOctave {
  return v === -2 || v === -1 || v === 0 ? v : -1;
}

function normalizePhase(v: unknown): SubbassPhaseDeg {
  return v === 0 || v === 90 || v === 180 || v === 270 ? v : 0;
}

export const DEFAULT_SUBBASS_FX_ORDER: SubbassFxId[] = [
  'tube',
  'diode',
  'waveshaper',
  'softClip',
  'eq',
  'lowpass',
  'compressor',
  'sidechain',
  'stereo',
];

export const WAVESHAPER_CURVE_PRESETS: Record<string, number[]> = {
  warm: [-0.96, -0.84, -0.64, -0.35, 0, 0.35, 0.64, 0.84, 0.96],
  linear: [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1],
  fold: [-0.45, -0.92, -0.35, -0.72, 0, 0.72, 0.35, 0.92, 0.45],
  crunch: [-0.88, -0.88, -0.82, -0.48, 0, 0.56, 0.85, 0.92, 0.94],
};

// Crossover normalized helper: 0..1 <-> 60..240 Hz (120 Hz = 1/3 = 0.3333)
export function crossoverHzToNorm(hz: number): number {
  return Math.max(0, Math.min(1, (hz - 60) / 180));
}

export function normToCrossoverHz(norm: number): number {
  return Math.round(60 + Math.max(0, Math.min(1, norm)) * 180);
}

export function createDefaultSubbassFxConfig(): SubbassFxConfig {
  return {
    presetId: 'clean_master',
    cleanSubEnabled: true,
    cleanSubLevel: 0.95,
    harmonicEnabled: true,
    harmonicLevel: 0.38,
    order: [...DEFAULT_SUBBASS_FX_ORDER],
    tube: { enabled: true, drive: 0.28, mix: 0.65, output: 0.55 },
    diode: { enabled: false, drive: 0.35, tone: 0.55, mix: 0.5 },
    softClip: { enabled: true, threshold: 0.65, amount: 0.42, output: 0.58 },
    waveshaper: {
      enabled: false,
      drive: 0.35,
      mix: 0.55,
      curvePoints: [...WAVESHAPER_CURVE_PRESETS.warm],
    },
    eq: {
      enabled: false,
      lowShelf: 0.56,
      midFreq: 0.42,
      midGain: 0.5,
      highShelf: 0.5,
    },
    lowpass: {
      enabled: false,
      cutoff: 0.65,
      resonance: 0.22,
      filterType: 'lp24',
    },
    compressor: {
      enabled: true,
      threshold: 0.52,
      ratio: 0.28,
      attack: 0.14,
      release: 0.28,
      makeup: 0.16,
    },
    sidechain: {
      enabled: false,
      amount: 0.65,
      attack: 0.12,
      release: 0.34,
      bpmSync: true,
      syncRate: '1/4',
    },
    stereo: {
      enabled: true,
      crossoverHz: crossoverHzToNorm(120),
      width: 0.35,
    },
  };
}

function normalizeFilterType(v: unknown): SubbassFilterType {
  return v === 'lp12' || v === 'lp24' || v === 'warm' ? v : 'lp24';
}

function normalizeScRate(v: unknown): SubbassSidechainRate {
  return v === '1/4' || v === '1/8' || v === '1/2' ? v : '1/4';
}

export function normalizeSubbassFxConfig(
  raw?: Partial<SubbassFxConfig>
): SubbassFxConfig {
  const def = createDefaultSubbassFxConfig();
  if (!raw) return def;

  const validSet = new Set<SubbassFxId>(DEFAULT_SUBBASS_FX_ORDER);
  const order: SubbassFxId[] = [];
  if (Array.isArray(raw.order)) {
    for (const id of raw.order) {
      if (validSet.has(id) && !order.includes(id)) {
        order.push(id);
      }
    }
  }
  for (const id of DEFAULT_SUBBASS_FX_ORDER) {
    if (!order.includes(id)) order.push(id);
  }

  const rawCurve = raw.waveshaper?.curvePoints;
  const curvePoints =
    Array.isArray(rawCurve) && rawCurve.length === 9
      ? rawCurve.map((v, i) =>
          typeof v === 'number' && Number.isFinite(v)
            ? Math.max(-1, Math.min(1, v))
            : def.waveshaper.curvePoints[i]
        )
      : [...def.waveshaper.curvePoints];

  return {
    presetId:
      typeof raw.presetId === 'string' && raw.presetId ? raw.presetId : def.presetId,
    cleanSubEnabled:
      typeof raw.cleanSubEnabled === 'boolean'
        ? raw.cleanSubEnabled
        : def.cleanSubEnabled,
    cleanSubLevel: clamp01(raw.cleanSubLevel, def.cleanSubLevel),
    harmonicEnabled:
      typeof raw.harmonicEnabled === 'boolean'
        ? raw.harmonicEnabled
        : def.harmonicEnabled,
    harmonicLevel: clamp01(raw.harmonicLevel, def.harmonicLevel),
    order,
    tube: {
      enabled:
        typeof raw.tube?.enabled === 'boolean' ? raw.tube.enabled : def.tube.enabled,
      drive: clamp01(raw.tube?.drive, def.tube.drive),
      mix: clamp01(raw.tube?.mix, def.tube.mix),
      output: clamp01(raw.tube?.output, def.tube.output),
    },
    diode: {
      enabled:
        typeof raw.diode?.enabled === 'boolean' ? raw.diode.enabled : def.diode.enabled,
      drive: clamp01(raw.diode?.drive, def.diode.drive),
      tone: clamp01(raw.diode?.tone, def.diode.tone),
      mix: clamp01(raw.diode?.mix, def.diode.mix),
    },
    softClip: {
      enabled:
        typeof raw.softClip?.enabled === 'boolean'
          ? raw.softClip.enabled
          : def.softClip.enabled,
      threshold: clamp01(raw.softClip?.threshold, def.softClip.threshold),
      amount: clamp01(raw.softClip?.amount, def.softClip.amount),
      output: clamp01(raw.softClip?.output, def.softClip.output),
    },
    waveshaper: {
      enabled:
        typeof raw.waveshaper?.enabled === 'boolean'
          ? raw.waveshaper.enabled
          : def.waveshaper.enabled,
      drive: clamp01(raw.waveshaper?.drive, def.waveshaper.drive),
      mix: clamp01(raw.waveshaper?.mix, def.waveshaper.mix),
      curvePoints,
    },
    eq: {
      enabled: typeof raw.eq?.enabled === 'boolean' ? raw.eq.enabled : def.eq.enabled,
      lowShelf: clamp01(raw.eq?.lowShelf, def.eq.lowShelf),
      midFreq: clamp01(raw.eq?.midFreq, def.eq.midFreq),
      midGain: clamp01(raw.eq?.midGain, def.eq.midGain),
      highShelf: clamp01(raw.eq?.highShelf, def.eq.highShelf),
    },
    lowpass: {
      enabled:
        typeof raw.lowpass?.enabled === 'boolean'
          ? raw.lowpass.enabled
          : def.lowpass.enabled,
      cutoff: clamp01(raw.lowpass?.cutoff, def.lowpass.cutoff),
      resonance: clamp01(raw.lowpass?.resonance, def.lowpass.resonance),
      filterType: normalizeFilterType(raw.lowpass?.filterType),
    },
    compressor: {
      enabled:
        typeof raw.compressor?.enabled === 'boolean'
          ? raw.compressor.enabled
          : def.compressor.enabled,
      threshold: clamp01(raw.compressor?.threshold, def.compressor.threshold),
      ratio: clamp01(raw.compressor?.ratio, def.compressor.ratio),
      attack: clamp01(raw.compressor?.attack, def.compressor.attack),
      release: clamp01(raw.compressor?.release, def.compressor.release),
      makeup: clamp01(raw.compressor?.makeup, def.compressor.makeup),
    },
    sidechain: {
      enabled:
        typeof raw.sidechain?.enabled === 'boolean'
          ? raw.sidechain.enabled
          : def.sidechain.enabled,
      amount: clamp01(raw.sidechain?.amount, def.sidechain.amount),
      attack: clamp01(raw.sidechain?.attack, def.sidechain.attack),
      release: clamp01(raw.sidechain?.release, def.sidechain.release),
      bpmSync:
        typeof raw.sidechain?.bpmSync === 'boolean'
          ? raw.sidechain.bpmSync
          : def.sidechain.bpmSync,
      syncRate: normalizeScRate(raw.sidechain?.syncRate),
    },
    stereo: {
      enabled:
        typeof raw.stereo?.enabled === 'boolean'
          ? raw.stereo.enabled
          : def.stereo.enabled,
      crossoverHz: clamp01(raw.stereo?.crossoverHz, def.stereo.crossoverHz),
      width: clamp01(raw.stereo?.width, def.stereo.width),
    },
  };
}

export const SUBBASS_FX_PRESETS: SubbassFxPreset[] = [
  {
    id: 'clean_master',
    name: 'Clean Mastering Sub',
    description: 'Deep untouched fundamental + subtle harmonic glue & mono <120Hz control',
    apply: {},
  },
  {
    id: 'warm_tube',
    name: 'Warm Tube Sub',
    description: 'Rich even-harmonic analog tube warmth blended under pure clean sub',
    apply: {
      cleanSubEnabled: true,
      cleanSubLevel: 0.95,
      harmonicEnabled: true,
      harmonicLevel: 0.62,
      tube: { enabled: true, drive: 0.56, mix: 0.85, output: 0.58 },
      diode: { enabled: false, drive: 0.25, tone: 0.5, mix: 0.4 },
      softClip: { enabled: true, threshold: 0.6, amount: 0.55, output: 0.56 },
      eq: { enabled: true, lowShelf: 0.58, midFreq: 0.38, midGain: 0.55, highShelf: 0.46 },
      stereo: { enabled: true, crossoverHz: crossoverHzToNorm(120), width: 0.42 },
    },
  },
  {
    id: 'dubstep_shredder',
    name: 'Dubstep Shredder',
    description: 'Heavy diode + tube upper harmonic grit over an unbreakable clean 40Hz core',
    apply: {
      cleanSubEnabled: true,
      cleanSubLevel: 0.92,
      harmonicEnabled: true,
      harmonicLevel: 0.78,
      order: ['tube', 'diode', 'waveshaper', 'softClip', 'eq', 'lowpass', 'compressor', 'sidechain', 'stereo'],
      tube: { enabled: true, drive: 0.68, mix: 0.82, output: 0.54 },
      diode: { enabled: true, drive: 0.64, tone: 0.68, mix: 0.74 },
      softClip: { enabled: true, threshold: 0.48, amount: 0.72, output: 0.55 },
      waveshaper: { enabled: true, drive: 0.42, mix: 0.48, curvePoints: [...WAVESHAPER_CURVE_PRESETS.crunch] },
      eq: { enabled: true, lowShelf: 0.54, midFreq: 0.48, midGain: 0.62, highShelf: 0.58 },
      lowpass: { enabled: true, cutoff: 0.78, resonance: 0.32, filterType: 'lp24' },
      compressor: { enabled: true, threshold: 0.45, ratio: 0.36, attack: 0.1, release: 0.24, makeup: 0.22 },
      stereo: { enabled: true, crossoverHz: crossoverHzToNorm(135), width: 0.68 },
    },
  },
  {
    id: 'riddim_diode',
    name: 'Riddim Diode Grind',
    description: 'Tight aggressive mid-grit & crisp resonant LPF for riddim basslines',
    apply: {
      cleanSubEnabled: true,
      cleanSubLevel: 0.9,
      harmonicEnabled: true,
      harmonicLevel: 0.74,
      order: ['diode', 'tube', 'softClip', 'waveshaper', 'eq', 'lowpass', 'compressor', 'sidechain', 'stereo'],
      tube: { enabled: true, drive: 0.5, mix: 0.65, output: 0.55 },
      diode: { enabled: true, drive: 0.78, tone: 0.62, mix: 0.88 },
      softClip: { enabled: true, threshold: 0.52, amount: 0.65, output: 0.56 },
      eq: { enabled: true, lowShelf: 0.52, midFreq: 0.56, midGain: 0.66, highShelf: 0.48 },
      lowpass: { enabled: true, cutoff: 0.68, resonance: 0.44, filterType: 'warm' },
      compressor: { enabled: true, threshold: 0.46, ratio: 0.42, attack: 0.08, release: 0.22, makeup: 0.24 },
      sidechain: { enabled: true, amount: 0.58, attack: 0.1, release: 0.28, bpmSync: true, syncRate: '1/4' },
      stereo: { enabled: true, crossoverHz: crossoverHzToNorm(125), width: 0.55 },
    },
  },
  {
    id: 'wide_808',
    name: 'Wide Harmonic 808',
    description: 'Mono locked sub below 110Hz with spacious stereo harmonic saturation above',
    apply: {
      cleanSubEnabled: true,
      cleanSubLevel: 0.96,
      harmonicEnabled: true,
      harmonicLevel: 0.66,
      tube: { enabled: true, drive: 0.46, mix: 0.75, output: 0.56 },
      softClip: { enabled: true, threshold: 0.58, amount: 0.52, output: 0.58 },
      eq: { enabled: true, lowShelf: 0.6, midFreq: 0.34, midGain: 0.54, highShelf: 0.56 },
      compressor: { enabled: true, threshold: 0.5, ratio: 0.26, attack: 0.18, release: 0.34, makeup: 0.18 },
      stereo: { enabled: true, crossoverHz: crossoverHzToNorm(110), width: 0.88 },
    },
  },
  {
    id: 'kick_sidechain',
    name: 'Tight Kick Sidechain',
    description: 'BPM-synced Beatbox Kick ducking for chest-slamming club headroom',
    apply: {
      cleanSubEnabled: true,
      cleanSubLevel: 0.95,
      harmonicEnabled: true,
      harmonicLevel: 0.48,
      tube: { enabled: true, drive: 0.34, mix: 0.65, output: 0.55 },
      softClip: { enabled: true, threshold: 0.62, amount: 0.45, output: 0.58 },
      compressor: { enabled: true, threshold: 0.5, ratio: 0.32, attack: 0.12, release: 0.26, makeup: 0.2 },
      sidechain: { enabled: true, amount: 0.82, attack: 0.08, release: 0.32, bpmSync: true, syncRate: '1/4' },
      stereo: { enabled: true, crossoverHz: crossoverHzToNorm(120), width: 0.35 },
    },
  },
  {
    id: 'wavefold_monster',
    name: 'Wavefold Monster',
    description: 'Custom folded waveshaper harmonics over a solid clean sub anchor',
    apply: {
      cleanSubEnabled: true,
      cleanSubLevel: 0.88,
      harmonicEnabled: true,
      harmonicLevel: 0.82,
      order: ['waveshaper', 'tube', 'softClip', 'diode', 'lowpass', 'eq', 'compressor', 'sidechain', 'stereo'],
      waveshaper: { enabled: true, drive: 0.68, mix: 0.9, curvePoints: [...WAVESHAPER_CURVE_PRESETS.fold] },
      tube: { enabled: true, drive: 0.4, mix: 0.6, output: 0.52 },
      softClip: { enabled: true, threshold: 0.5, amount: 0.6, output: 0.54 },
      lowpass: { enabled: true, cutoff: 0.72, resonance: 0.35, filterType: 'lp12' },
      stereo: { enabled: true, crossoverHz: crossoverHzToNorm(130), width: 0.72 },
    },
  },
  {
    id: 'bypass_all',
    name: 'Raw Clean (FX Bypass)',
    description: 'Pure dry Subbass synthesizer with all FX modules bypassed',
    apply: {
      cleanSubEnabled: true,
      cleanSubLevel: 1.0,
      harmonicEnabled: false,
      harmonicLevel: 0.0,
      tube: { enabled: false, drive: 0.25, mix: 0.5, output: 0.5 },
      diode: { enabled: false, drive: 0.25, tone: 0.5, mix: 0.5 },
      softClip: { enabled: false, threshold: 0.7, amount: 0.3, output: 0.5 },
      waveshaper: { enabled: false, drive: 0.3, mix: 0.5, curvePoints: [...WAVESHAPER_CURVE_PRESETS.linear] },
      eq: { enabled: false, lowShelf: 0.5, midFreq: 0.45, midGain: 0.5, highShelf: 0.5 },
      lowpass: { enabled: false, cutoff: 0.8, resonance: 0.15, filterType: 'lp24' },
      compressor: { enabled: false, threshold: 0.6, ratio: 0.2, attack: 0.15, release: 0.3, makeup: 0 },
      sidechain: { enabled: false, amount: 0.5, attack: 0.1, release: 0.3, bpmSync: true, syncRate: '1/4' },
      stereo: { enabled: false, crossoverHz: crossoverHzToNorm(120), width: 0 },
    },
  },
];

export function applySubbassFxPreset(preset: SubbassFxPreset): SubbassFxConfig {
  const base = createDefaultSubbassFxConfig();
  return normalizeSubbassFxConfig({
    ...base,
    ...preset.apply,
    presetId: preset.id,
  });
}

export function presetToSubbassPatch(
  preset: SubbassPreset,
  preserveFx?: SubbassFxConfig
): SubbassPatch {
  const resolvedFx = preset.patch.fx
    ? normalizeSubbassFxConfig(preset.patch.fx)
    : preserveFx
    ? normalizeSubbassFxConfig(preserveFx)
    : createDefaultSubbassFxConfig();
  return {
    presetId: preset.id,
    name: preset.name,
    ...preset.patch,
    fx: resolvedFx,
  };
}

export function createDefaultSubbassPatch(): SubbassPatch {
  return presetToSubbassPatch(SUBBASS_FACTORY_PRESETS[0]);
}

export function normalizeSubbassPatch(raw?: Partial<SubbassPatch>): SubbassPatch {
  const def = createDefaultSubbassPatch();
  if (!raw) return def;
  return {
    presetId: typeof raw.presetId === 'string' && raw.presetId ? raw.presetId : def.presetId,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : def.name,
    subLevel: clamp01(raw.subLevel, def.subLevel),
    bassTone: clamp01(raw.bassTone, def.bassTone),
    attack: clamp01(raw.attack, def.attack),
    release: clamp01(raw.release, def.release),
    glide: clamp01(raw.glide, def.glide),
    saturation: clamp01(raw.saturation, def.saturation),
    lowPassFilter: clamp01(raw.lowPassFilter, def.lowPassFilter),
    outputVolume: clamp01(raw.outputVolume, def.outputVolume),
    squareEnabled:
      typeof raw.squareEnabled === 'boolean' ? raw.squareEnabled : def.squareEnabled,
    octave: normalizeOctave(raw.octave),
    phase: normalizePhase(raw.phase),
    fx: normalizeSubbassFxConfig(raw.fx),
  };
}

export function loadUserSubbassPresets(): SubbassPreset[] {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.patch)
      .map((p) => {
        const norm = normalizeSubbassPatch({ ...p.patch, presetId: p.id, name: p.name });
        const { presetId, name, ...rest } = norm;
        return { id: presetId, name, patch: rest };
      });
  } catch {
    return [];
  }
}

export function saveUserSubbassPreset(name: string, patch: SubbassPatch): SubbassPreset[] {
  const cleanName = name.trim() || 'Custom Sub';
  const id = `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const { presetId: _ignoreId, name: _ignoreName, ...rest } = normalizeSubbassPatch(patch);
  const next: SubbassPreset[] = [
    ...loadUserSubbassPresets(),
    { id, name: cleanName, patch: rest },
  ];
  const serialized = JSON.stringify(next);
  try {
    localStorage.setItem(USER_PRESETS_KEY, serialized);
  } catch {
    // ignore storage quota errors
  }
  void mirrorKeyToIndexedDb(USER_PRESETS_KEY, serialized);
  return next;
}

export function deleteUserSubbassPreset(id: string): SubbassPreset[] {
  const next = loadUserSubbassPresets().filter((p) => p.id !== id);
  const serialized = JSON.stringify(next);
  try {
    localStorage.setItem(USER_PRESETS_KEY, serialized);
  } catch {
    // ignore
  }
  void mirrorKeyToIndexedDb(USER_PRESETS_KEY, serialized);
  return next;
}

function normalizeMidiNote(raw: Partial<MidiNote>): MidiNote | null {
  if (typeof raw.midi !== 'number' || typeof raw.step !== 'number') return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `sb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    midi: Math.max(12, Math.min(84, Math.round(raw.midi))),
    step: Math.max(0, Math.min(15.875, raw.step)),
    duration: typeof raw.duration === 'number' ? Math.max(0.25, Math.min(16, raw.duration)) : 1,
    velocity: typeof raw.velocity === 'number' ? Math.max(0.08, Math.min(1, raw.velocity)) : 0.88,
  };
}

export function createDefaultSubbassSequencerState(): SubbassSequencerState {
  return {
    activePatternId: 'S1',
    patternOrder: ['S1'],
    patterns: {
      S1: {
        id: 'S1',
        name: 'Sub Pattern 1',
        notes: [],
      },
    },
    showKeyboard: true,
  };
}

export function normalizeSubbassSequencerState(
  raw?: Partial<SubbassSequencerState>
): SubbassSequencerState {
  const def = createDefaultSubbassSequencerState();
  if (!raw || !raw.patterns || typeof raw.patterns !== 'object') return def;

  const patterns: Record<string, SubbassPattern> = {};
  const rawOrder = Array.isArray(raw.patternOrder) ? raw.patternOrder : Object.keys(raw.patterns);
  const patternOrder: string[] = [];

  for (const pid of rawOrder) {
    const p = raw.patterns[pid];
    if (!p || typeof pid !== 'string') continue;
    const notes = Array.isArray(p.notes)
      ? p.notes.map(normalizeMidiNote).filter((n): n is MidiNote => n !== null)
      : [];
    patterns[pid] = {
      id: pid,
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `Sub Pattern ${patternOrder.length + 1}`,
      notes,
    };
    patternOrder.push(pid);
  }

  for (const [pid, p] of Object.entries(raw.patterns)) {
    if (patterns[pid] || !p) continue;
    const notes = Array.isArray(p.notes)
      ? p.notes.map(normalizeMidiNote).filter((n): n is MidiNote => n !== null)
      : [];
    patterns[pid] = {
      id: pid,
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : pid,
      notes,
    };
    patternOrder.push(pid);
  }

  if (patternOrder.length === 0) return def;

  const activePatternId =
    typeof raw.activePatternId === 'string' && patterns[raw.activePatternId]
      ? raw.activePatternId
      : patternOrder[0];

  return {
    activePatternId,
    patternOrder,
    patterns,
    showKeyboard: typeof raw.showKeyboard === 'boolean' ? raw.showKeyboard : true,
  };
}
