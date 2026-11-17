import type {
  BassRemixAutomationLane,
  BassRemixAutomationState,
  BassRemixAutomationTarget,
  BassRemixPatch,
  BassRemixPreset,
  BassRemixProjectState,
  BassRemixSyncDivision,
} from '../types/bassRemix';
import { mirrorKeyToIndexedDb } from './tarekIndexedDb';

const USER_PRESETS_KEY = 'tarek_bass_remix_user_presets_v1';

export const AUTOMATION_TARGET_META: {
  id: BassRemixAutomationTarget;
  label: string;
  shortLabel: string;
  color: string;
  formatValue: (norm: number) => string;
}[] = [
  {
    id: 'volume',
    label: 'Volume',
    shortLabel: 'VOL',
    color: '#EF4444',
    formatValue: (v) => `${Math.round(v * 150)}%`,
  },
  {
    id: 'wobbleRate',
    label: 'Wobble Rate',
    shortLabel: 'WOB RATE',
    color: '#F59E0B',
    formatValue: (v) => `${(0.2 * Math.pow(120, v)).toFixed(1)} Hz`,
  },
  {
    id: 'wobbleDepth',
    label: 'Wobble Depth',
    shortLabel: 'WOB DPTH',
    color: '#E08A3C',
    formatValue: (v) => `${Math.round(v * 100)}%`,
  },
  {
    id: 'filterCutoff',
    label: 'Filter Cutoff',
    shortLabel: 'CUTOFF',
    color: '#FCA5A5',
    formatValue: (v) => {
      const hz = 30 * Math.pow(16000 / 30, v);
      return hz >= 1000 ? `${(hz / 1000).toFixed(2)}k` : `${Math.round(hz)}Hz`;
    },
  },
  {
    id: 'filterResonance',
    label: 'Filter Resonance',
    shortLabel: 'RES',
    color: '#FB923C',
    formatValue: (v) => `${(0.5 + v * 17.5).toFixed(1)}`,
  },
  {
    id: 'ottAmount',
    label: 'OTT Amount',
    shortLabel: 'OTT',
    color: '#CD7F32',
    formatValue: (v) => `${Math.round(v * 100)}%`,
  },
  {
    id: 'effectMix',
    label: 'Effect Mix',
    shortLabel: 'FX MIX',
    color: '#F87171',
    formatValue: (v) => `${Math.round(v * 100)}%`,
  },
];

export const SYNC_DIVISIONS: BassRemixSyncDivision[] = [
  '1/1',
  '1/2',
  '1/2.',
  '1/4',
  '1/4.',
  '1/4T',
  '1/8',
  '1/8.',
  '1/8T',
  '1/16',
  '1/16T',
  '1/32',
];

export function syncDivisionToHz(division: BassRemixSyncDivision, bpm: number): number {
  const safeBpm = Math.max(40, Math.min(240, bpm));
  const quarterHz = safeBpm / 60;
  switch (division) {
    case '1/1':
      return quarterHz / 4;
    case '1/2':
      return quarterHz / 2;
    case '1/2.':
      return quarterHz / 3;
    case '1/4':
      return quarterHz;
    case '1/4.':
      return quarterHz / 1.5;
    case '1/4T':
      return quarterHz * 1.5;
    case '1/8':
      return quarterHz * 2;
    case '1/8.':
      return quarterHz * (4 / 3);
    case '1/8T':
      return quarterHz * 3;
    case '1/16':
      return quarterHz * 4;
    case '1/16T':
      return quarterHz * 6;
    case '1/32':
      return quarterHz * 8;
    default:
      return quarterHz * 2;
  }
}

export function createDefaultAutomationLane(
  target: BassRemixAutomationTarget,
  defaultVal = 0.5
): BassRemixAutomationLane {
  return {
    target,
    enabled: false,
    points: [
      { id: `${target}-p0`, timeNorm: 0, value: defaultVal, curve: 'smooth' },
      { id: `${target}-p1`, timeNorm: 1, value: defaultVal, curve: 'smooth' },
    ],
  };
}

export function createDefaultAutomationState(): BassRemixAutomationState {
  return {
    bpmSync: true,
    snapGrid: '1/16',
    bars: 2,
    loopAutomation: true,
    activeTarget: 'filterCutoff',
    lanes: {
      volume: createDefaultAutomationLane('volume', 0.67),
      wobbleRate: createDefaultAutomationLane('wobbleRate', 0.45),
      wobbleDepth: createDefaultAutomationLane('wobbleDepth', 0.7),
      filterCutoff: {
        target: 'filterCutoff',
        enabled: false,
        points: [
          { id: 'fc-0', timeNorm: 0, value: 0.28, curve: 'smooth' },
          { id: 'fc-1', timeNorm: 0.25, value: 0.76, curve: 'smooth' },
          { id: 'fc-2', timeNorm: 0.5, value: 0.35, curve: 'smooth' },
          { id: 'fc-3', timeNorm: 0.75, value: 0.88, curve: 'smooth' },
          { id: 'fc-4', timeNorm: 1, value: 0.3, curve: 'smooth' },
        ],
      },
      filterResonance: createDefaultAutomationLane('filterResonance', 0.35),
      ottAmount: createDefaultAutomationLane('ottAmount', 0.65),
      effectMix: createDefaultAutomationLane('effectMix', 1.0),
    },
  };
}

export function evaluateAutomationLane(
  lane: BassRemixAutomationLane,
  timeNorm01: number
): number {
  const pts = lane.points;
  if (!pts || pts.length === 0) return 0.5;
  if (pts.length === 1) return Math.max(0, Math.min(1, pts[0].value));

  const t = Math.max(0, Math.min(1, timeNorm01));
  if (t <= pts[0].timeNorm) return Math.max(0, Math.min(1, pts[0].value));
  if (t >= pts[pts.length - 1].timeNorm) {
    return Math.max(0, Math.min(1, pts[pts.length - 1].value));
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (t >= a.timeNorm && t <= b.timeNorm) {
      const span = b.timeNorm - a.timeNorm;
      if (span <= 1e-6) return Math.max(0, Math.min(1, b.value));
      const u = (t - a.timeNorm) / span;
      if (a.curve === 'step') {
        return Math.max(0, Math.min(1, a.value));
      }
      if (a.curve === 'smooth') {
        // Cosine S-curve for fluid musical modulation
        const smoothU = 0.5 - 0.5 * Math.cos(u * Math.PI);
        return Math.max(0, Math.min(1, a.value + (b.value - a.value) * smoothU));
      }
      return Math.max(0, Math.min(1, a.value + (b.value - a.value) * u));
    }
  }
  return Math.max(0, Math.min(1, pts[pts.length - 1].value));
}

export function createBasePatch(
  overrides?: Partial<BassRemixPatch>
): BassRemixPatch {
  const base: BassRemixPatch = {
    id: 'heavy-riddim',
    name: 'HEAVY RIDDIM',
    effectMix: 1.0,
    ott: {
      amount: 0.72,
      depth: 0.78,
      time: 0.85,
      upward: 0.72,
      downward: 0.74,
      inputGainDb: 2.5,
      outputGainDb: -1.5,
      mix: 0.92,
      bypass: false,
    },
    wobble: {
      enabled: true,
      rateHz: 4.5,
      depth: 0.78,
      bpmSync: true,
      syncDivision: '1/8',
      waveform: 'square',
      filterType: 'lp24',
      cutoffHz: 320,
      resonance: 6.2,
      drive: 0.48,
      stereoMod: 0.38,
      mix: 1.0,
    },
    volume: {
      volume: 1.0,
      gainDb: 1.0,
      lfoEnabled: true,
      lfoWaveform: 'saw',
      sidechainPump: 0.45,
      attackMs: 6,
      releaseMs: 110,
      depth: 0.55,
      bpmSync: true,
      syncDivision: '1/4',
      rateHz: 2.0,
      mix: 0.85,
    },
    transform: {
      distortionDrive: 0.46,
      distortionMode: 'hard',
      saturation: 0.42,
      waveshapeAmount: 0.48,
      waveshapeMode: 'asym',
      harmonicEnhance: 0.52,
      stereoWidth: 1.28,
      subMonoHz: 115,
    },
    automation: createDefaultAutomationState(),
  };

  if (!overrides) return base;
  return {
    ...base,
    ...overrides,
    ott: { ...base.ott, ...(overrides.ott ?? {}) },
    wobble: { ...base.wobble, ...(overrides.wobble ?? {}) },
    volume: { ...base.volume, ...(overrides.volume ?? {}) },
    transform: { ...base.transform, ...(overrides.transform ?? {}) },
    automation: overrides.automation
      ? {
          ...base.automation,
          ...overrides.automation,
          lanes: {
            ...base.automation.lanes,
            ...(overrides.automation.lanes ?? {}),
          },
        }
      : base.automation,
  };
}

export const BASS_REMIX_FACTORY_PRESETS: BassRemixPreset[] = [
  {
    id: 'clean-audio',
    name: 'CLEAN AUDIO',
    description: 'Transparent uncolored signal path with gentle safety headroom.',
    isFactory: true,
    patch: createBasePatch({
      id: 'clean-audio',
      name: 'CLEAN AUDIO',
      effectMix: 1.0,
      ott: {
        amount: 0.0,
        depth: 0.2,
        time: 1.0,
        upward: 0.0,
        downward: 0.0,
        inputGainDb: 0,
        outputGainDb: 0,
        mix: 0,
        bypass: true,
      },
      wobble: {
        enabled: false,
        rateHz: 2.0,
        depth: 0,
        bpmSync: true,
        syncDivision: '1/4',
        waveform: 'sine',
        filterType: 'lp24',
        cutoffHz: 14000,
        resonance: 0.7,
        drive: 0,
        stereoMod: 0,
        mix: 0,
      },
      volume: {
        volume: 1.0,
        gainDb: 0,
        lfoEnabled: false,
        lfoWaveform: 'sine',
        sidechainPump: 0,
        attackMs: 8,
        releaseMs: 120,
        depth: 0,
        bpmSync: true,
        syncDivision: '1/4',
        rateHz: 2.0,
        mix: 0,
      },
      transform: {
        distortionDrive: 0,
        distortionMode: 'soft',
        saturation: 0,
        waveshapeAmount: 0,
        waveshapeMode: 'asym',
        harmonicEnhance: 0,
        stereoWidth: 1.0,
        subMonoHz: 90,
      },
    }),
  },
  {
    id: 'deep-wobble',
    name: 'DEEP WOBBLE',
    description: 'Sub-heavy 1/8 sine wobble with warm tube saturation and smooth OTT.',
    isFactory: true,
    patch: createBasePatch({
      id: 'deep-wobble',
      name: 'DEEP WOBBLE',
      effectMix: 1.0,
      ott: {
        amount: 0.45,
        depth: 0.55,
        time: 1.15,
        upward: 0.45,
        downward: 0.52,
        inputGainDb: 1.5,
        outputGainDb: 0,
        mix: 0.75,
        bypass: false,
      },
      wobble: {
        enabled: true,
        rateHz: 4.0,
        depth: 0.72,
        bpmSync: true,
        syncDivision: '1/8',
        waveform: 'sine',
        filterType: 'lp24',
        cutoffHz: 190,
        resonance: 4.4,
        drive: 0.34,
        stereoMod: 0.18,
        mix: 1.0,
      },
      volume: {
        volume: 1.05,
        gainDb: 0.5,
        lfoEnabled: false,
        lfoWaveform: 'sine',
        sidechainPump: 0.28,
        attackMs: 10,
        releaseMs: 140,
        depth: 0.45,
        bpmSync: true,
        syncDivision: '1/4',
        rateHz: 2.0,
        mix: 0.75,
      },
      transform: {
        distortionDrive: 0.18,
        distortionMode: 'soft',
        saturation: 0.48,
        waveshapeAmount: 0.18,
        waveshapeMode: 'asym',
        harmonicEnhance: 0.58,
        stereoWidth: 1.08,
        subMonoHz: 130,
      },
    }),
  },
  {
    id: 'heavy-riddim',
    name: 'HEAVY RIDDIM',
    description: 'Snappy 1/8 square wobble, high resonance LP24 bite, slammed OTT & sidechain.',
    isFactory: true,
    patch: createBasePatch({
      id: 'heavy-riddim',
      name: 'HEAVY RIDDIM',
    }),
  },
  {
    id: 'metallic-growl',
    name: 'METALLIC GROWL',
    description: 'Vowel formant filter sweep + FM-fold waveshaping + high-band OTT.',
    isFactory: true,
    patch: createBasePatch({
      id: 'metallic-growl',
      name: 'METALLIC GROWL',
      effectMix: 1.0,
      ott: {
        amount: 0.84,
        depth: 0.85,
        time: 0.65,
        upward: 0.82,
        downward: 0.76,
        inputGainDb: 3.5,
        outputGainDb: -2.0,
        mix: 1.0,
        bypass: false,
      },
      wobble: {
        enabled: true,
        rateHz: 6.0,
        depth: 0.84,
        bpmSync: true,
        syncDivision: '1/8T',
        waveform: 'triangle',
        filterType: 'formant',
        cutoffHz: 460,
        resonance: 7.5,
        drive: 0.64,
        stereoMod: 0.52,
        mix: 1.0,
      },
      volume: {
        volume: 1.0,
        gainDb: 1.5,
        lfoEnabled: true,
        lfoWaveform: 'triangle',
        sidechainPump: 0.35,
        attackMs: 5,
        releaseMs: 95,
        depth: 0.42,
        bpmSync: true,
        syncDivision: '1/8',
        rateHz: 4.0,
        mix: 0.8,
      },
      transform: {
        distortionDrive: 0.52,
        distortionMode: 'fold',
        saturation: 0.45,
        waveshapeAmount: 0.68,
        waveshapeMode: 'fmfold',
        harmonicEnhance: 0.66,
        stereoWidth: 1.45,
        subMonoHz: 115,
      },
    }),
  },
  {
    id: 'aggressive-dubstep',
    name: 'AGGRESSIVE DUBSTEP',
    description: 'Extreme foldback distortion, 1/16 saw wobble, max OTT compression.',
    isFactory: true,
    patch: createBasePatch({
      id: 'aggressive-dubstep',
      name: 'AGGRESSIVE DUBSTEP',
      effectMix: 1.0,
      ott: {
        amount: 0.94,
        depth: 0.92,
        time: 0.5,
        upward: 0.88,
        downward: 0.86,
        inputGainDb: 5.0,
        outputGainDb: -2.5,
        mix: 1.0,
        bypass: false,
      },
      wobble: {
        enabled: true,
        rateHz: 8.5,
        depth: 0.9,
        bpmSync: true,
        syncDivision: '1/16',
        waveform: 'saw',
        filterType: 'bp',
        cutoffHz: 540,
        resonance: 8.8,
        drive: 0.78,
        stereoMod: 0.55,
        mix: 0.94,
      },
      volume: {
        volume: 1.05,
        gainDb: 2.0,
        lfoEnabled: true,
        lfoWaveform: 'square',
        sidechainPump: 0.52,
        attackMs: 4,
        releaseMs: 85,
        depth: 0.6,
        bpmSync: true,
        syncDivision: '1/8',
        rateHz: 4.0,
        mix: 0.85,
      },
      transform: {
        distortionDrive: 0.74,
        distortionMode: 'fold',
        saturation: 0.62,
        waveshapeAmount: 0.72,
        waveshapeMode: 'rectify',
        harmonicEnhance: 0.75,
        stereoWidth: 1.5,
        subMonoHz: 120,
      },
    }),
  },
  {
    id: 'skrillex-style-bass',
    name: 'SKRILLEX-STYLE BASS',
    description: 'Bright FM-metallic screech & choppy 1/8T modulation with crisp OTT punch.',
    isFactory: true,
    patch: createBasePatch({
      id: 'skrillex-style-bass',
      name: 'SKRILLEX-STYLE BASS',
      effectMix: 1.0,
      ott: {
        amount: 0.9,
        depth: 0.88,
        time: 0.42,
        upward: 0.86,
        downward: 0.82,
        inputGainDb: 4.0,
        outputGainDb: -2.0,
        mix: 1.0,
        bypass: false,
      },
      wobble: {
        enabled: true,
        rateHz: 7.0,
        depth: 0.88,
        bpmSync: true,
        syncDivision: '1/8T',
        waveform: 'saw',
        filterType: 'formant',
        cutoffHz: 680,
        resonance: 9.2,
        drive: 0.68,
        stereoMod: 0.68,
        mix: 1.0,
      },
      volume: {
        volume: 1.05,
        gainDb: 2.0,
        lfoEnabled: true,
        lfoWaveform: 'saw',
        sidechainPump: 0.6,
        attackMs: 3,
        releaseMs: 75,
        depth: 0.72,
        bpmSync: true,
        syncDivision: '1/16',
        rateHz: 8.0,
        mix: 0.9,
      },
      transform: {
        distortionDrive: 0.62,
        distortionMode: 'crush',
        saturation: 0.55,
        waveshapeAmount: 0.82,
        waveshapeMode: 'fmfold',
        harmonicEnhance: 0.8,
        stereoWidth: 1.65,
        subMonoHz: 125,
      },
    }),
  },
  {
    id: 'uk-bass',
    name: 'UK BASS',
    description: 'Tight sub-driven 1/8 wobble, warm analog saturation, and 1/4 pump groove.',
    isFactory: true,
    patch: createBasePatch({
      id: 'uk-bass',
      name: 'UK BASS',
      effectMix: 1.0,
      ott: {
        amount: 0.58,
        depth: 0.62,
        time: 0.9,
        upward: 0.52,
        downward: 0.65,
        inputGainDb: 2.0,
        outputGainDb: -0.5,
        mix: 0.82,
        bypass: false,
      },
      wobble: {
        enabled: true,
        rateHz: 4.0,
        depth: 0.66,
        bpmSync: true,
        syncDivision: '1/8',
        waveform: 'triangle',
        filterType: 'lp12',
        cutoffHz: 260,
        resonance: 3.6,
        drive: 0.38,
        stereoMod: 0.22,
        mix: 0.92,
      },
      volume: {
        volume: 1.08,
        gainDb: 1.5,
        lfoEnabled: false,
        lfoWaveform: 'sine',
        sidechainPump: 0.68,
        attackMs: 6,
        releaseMs: 125,
        depth: 0.74,
        bpmSync: true,
        syncDivision: '1/4',
        rateHz: 2.0,
        mix: 0.9,
      },
      transform: {
        distortionDrive: 0.28,
        distortionMode: 'soft',
        saturation: 0.56,
        waveshapeAmount: 0.28,
        waveshapeMode: 'asym',
        harmonicEnhance: 0.48,
        stereoWidth: 1.15,
        subMonoHz: 140,
      },
    }),
  },
  {
    id: 'wonkey-wobble',
    name: 'WONKEY WOBBLE',
    description: 'Triplet formant wobble + asymmetric fold + sidechain punch for wonky bass.',
    isFactory: true,
    patch: createBasePatch({
      id: 'wonkey-wobble',
      name: 'WONKEY WOBBLE',
      effectMix: 1.0,
      ott: {
        amount: 0.78,
        depth: 0.76,
        time: 0.62,
        upward: 0.72,
        downward: 0.74,
        inputGainDb: 3.0,
        outputGainDb: -1.0,
        mix: 0.92,
        bypass: false,
      },
      wobble: {
        enabled: true,
        rateHz: 5.5,
        depth: 0.9,
        bpmSync: true,
        syncDivision: '1/4T',
        waveform: 'triangle',
        filterType: 'formant',
        cutoffHz: 460,
        resonance: 7.4,
        drive: 0.62,
        stereoMod: 0.46,
        mix: 1.0,
      },
      volume: {
        volume: 1.06,
        gainDb: 1.5,
        lfoEnabled: true,
        lfoWaveform: 'sine',
        sidechainPump: 0.52,
        attackMs: 5,
        releaseMs: 95,
        depth: 0.68,
        bpmSync: true,
        syncDivision: '1/8T',
        rateHz: 6.0,
        mix: 0.88,
      },
      transform: {
        distortionDrive: 0.54,
        distortionMode: 'fold',
        saturation: 0.52,
        waveshapeAmount: 0.66,
        waveshapeMode: 'asym',
        harmonicEnhance: 0.68,
        stereoWidth: 1.44,
        subMonoHz: 118,
      },
    }),
  },
];

export function createDefaultBassRemixProjectState(): BassRemixProjectState {
  return {
    patch: createBasePatch(),
    loopPlayback: true,
    abMode: 'processed',
    selStartNorm: 0,
    selEndNorm: 1,
  };
}

export function normalizeBassRemixProjectState(
  raw?: Partial<BassRemixProjectState> | null
): BassRemixProjectState {
  const def = createDefaultBassRemixProjectState();
  if (!raw || typeof raw !== 'object') return def;
  const selStartNorm =
    typeof raw.selStartNorm === 'number' && Number.isFinite(raw.selStartNorm)
      ? Math.max(0, Math.min(0.98, raw.selStartNorm))
      : 0;
  const selEndNorm =
    typeof raw.selEndNorm === 'number' && Number.isFinite(raw.selEndNorm)
      ? Math.max(selStartNorm + 0.01, Math.min(1, raw.selEndNorm))
      : 1;
  return {
    patch: raw.patch ? createBasePatch(raw.patch) : def.patch,
    loopPlayback: typeof raw.loopPlayback === 'boolean' ? raw.loopPlayback : true,
    abMode: raw.abMode === 'original' ? 'original' : 'processed',
    selStartNorm,
    selEndNorm,
  };
}

export function loadUserBassRemixPresets(): BassRemixPreset[] {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.name === 'string' && p.patch)
      .map((p) => ({
        id: String(p.id || `user-${Date.now()}`),
        name: p.name,
        description: String(p.description || 'User Preset'),
        isFactory: false,
        patch: createBasePatch(p.patch),
      }));
  } catch {
    return [];
  }
}

export function saveUserBassRemixPreset(
  name: string,
  patch: BassRemixPatch
): BassRemixPreset[] {
  const cleanName = name.trim().toUpperCase() || 'CUSTOM BASS REMIX';
  const existing = loadUserBassRemixPresets();
  const next: BassRemixPreset = {
    id: `br-user-${Date.now()}`,
    name: cleanName,
    description: 'Custom Bass Remix preset',
    isFactory: false,
    patch: createBasePatch({ ...patch, name: cleanName }),
  };
  const updated = [...existing, next];
  const serialized = JSON.stringify(updated);
  try {
    localStorage.setItem(USER_PRESETS_KEY, serialized);
  } catch {
    // ignore storage quota errors
  }
  void mirrorKeyToIndexedDb(USER_PRESETS_KEY, serialized);
  return updated;
}

export function deleteUserBassRemixPreset(id: string): BassRemixPreset[] {
  const updated = loadUserBassRemixPresets().filter((p) => p.id !== id);
  const serialized = JSON.stringify(updated);
  try {
    localStorage.setItem(USER_PRESETS_KEY, serialized);
  } catch {
    // ignore
  }
  void mirrorKeyToIndexedDb(USER_PRESETS_KEY, serialized);
  return updated;
}
