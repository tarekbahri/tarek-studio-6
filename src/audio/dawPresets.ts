import type { DrumTrackId } from '../types/beatbox';
import type {
  AutomationLane,
  AutomationParamId,
  AutomationPoint,
  DawPattern,
  DawSequencerState,
  DawStep,
  DawTrackConfig,
  DawTrackId,
  TimeSignatureId,
} from '../types/daw';

export const DAW_TRACK_ORDER: DawTrackId[] = [
  'kick',
  'snare',
  'hihat',
  'perc',
  'subbass',
  'synth',
];

export const DAW_PATTERN_IDS: string[] = Array.from(
  { length: 16 },
  (_, i) => `P${i + 1}`
);

export const TIME_SIGNATURES: {
  id: TimeSignatureId;
  label: string;
  beatsPerBar: number;
  stepsPerBeat: number;
  stepsPerBar: number;
  accentBeats: number[];
}[] = [
  { id: '4/4', label: '4/4', beatsPerBar: 4, stepsPerBeat: 4, stepsPerBar: 16, accentBeats: [0] },
  { id: '3/4', label: '3/4', beatsPerBar: 3, stepsPerBeat: 4, stepsPerBar: 12, accentBeats: [0] },
  { id: '5/4', label: '5/4', beatsPerBar: 5, stepsPerBeat: 4, stepsPerBar: 20, accentBeats: [0, 3] },
  { id: '6/8', label: '6/8', beatsPerBar: 6, stepsPerBeat: 2, stepsPerBar: 12, accentBeats: [0, 3] },
  { id: '7/8', label: '7/8', beatsPerBar: 7, stepsPerBeat: 2, stepsPerBar: 14, accentBeats: [0, 4] },
];

export function getTimeSignatureInfo(id: TimeSignatureId) {
  return TIME_SIGNATURES.find((t) => t.id === id) ?? TIME_SIGNATURES[0];
}

export const AUTOMATION_PARAMS: {
  paramId: AutomationParamId;
  label: string;
  shortLabel: string;
  group: 'SERUM' | 'BEATBOX';
  color: string;
  defaultValue: number;
}[] = [
  {
    paramId: 'serum.cutoff',
    label: 'SERUM Filter Cutoff',
    shortLabel: 'Cutoff',
    group: 'SERUM',
    color: '#22D3EE',
    defaultValue: 0.5,
  },
  {
    paramId: 'serum.resonance',
    label: 'SERUM Filter Resonance',
    shortLabel: 'Res',
    group: 'SERUM',
    color: '#38BDF8',
    defaultValue: 0.35,
  },
  {
    paramId: 'serum.wtPosition',
    label: 'SERUM Wavetable Pos',
    shortLabel: 'WT Pos',
    group: 'SERUM',
    color: '#34D399',
    defaultValue: 0.5,
  },
  {
    paramId: 'serum.lfoRate',
    label: 'SERUM LFO Speed',
    shortLabel: 'LFO Spd',
    group: 'SERUM',
    color: '#A78BFA',
    defaultValue: 0.5,
  },
  {
    paramId: 'serum.lfoDepth',
    label: 'SERUM LFO Depth',
    shortLabel: 'LFO Dpth',
    group: 'SERUM',
    color: '#C084FC',
    defaultValue: 0.5,
  },
  {
    paramId: 'serum.volume',
    label: 'SERUM Master Volume',
    shortLabel: 'Synth Vol',
    group: 'SERUM',
    color: '#2DD4BF',
    defaultValue: 0.85,
  },
  {
    paramId: 'beatbox.volume',
    label: 'BEATBOX Channel Volume',
    shortLabel: 'Drum Vol',
    group: 'BEATBOX',
    color: '#F59E0B',
    defaultValue: 0.85,
  },
  {
    paramId: 'beatbox.drive',
    label: 'BEATBOX Master Drive FX',
    shortLabel: 'Drum FX',
    group: 'BEATBOX',
    color: '#FB7185',
    defaultValue: 0.25,
  },
];

export interface DawTrackTemplate {
  templateId: string;
  name: string;
  shortName: string;
  target: 'beatbox' | 'serum' | 'subbass' | 'ts666';
  drumTrackId?: DrumTrackId;
  accent: 'amber' | 'cyan';
  defaultNote: number;
  volume: number;
}

export const DAW_TRACK_TEMPLATES: DawTrackTemplate[] = [
  { templateId: 'beatbox_kit', name: 'Beatbox Drums', shortName: 'DRM', target: 'beatbox', accent: 'amber', defaultNote: 36, volume: 0.95 },
  { templateId: 'subbass', name: 'Subbass', shortName: 'SUB', target: 'subbass', accent: 'cyan', defaultNote: 36, volume: 0.95 },
  { templateId: 'ts666', name: '666TS Synth', shortName: '666', target: 'ts666', accent: 'cyan', defaultNote: 48, volume: 0.95 },
  { templateId: 'serum_lead', name: 'Serum Synth', shortName: 'SYN', target: 'serum', accent: 'cyan', defaultNote: 53, volume: 0.9 },
  { templateId: 'serum_bass', name: 'Serum Bass', shortName: 'BAS', target: 'serum', accent: 'cyan', defaultNote: 41, volume: 0.95 },
  { templateId: 'kick', name: 'Kick', shortName: 'KCK', target: 'beatbox', drumTrackId: 'kick', accent: 'amber', defaultNote: 36, volume: 1.0 },
  { templateId: 'snare', name: 'Snare', shortName: 'SNR', target: 'beatbox', drumTrackId: 'snare', accent: 'amber', defaultNote: 38, volume: 0.95 },
  { templateId: 'clap', name: 'Clap', shortName: 'CLP', target: 'beatbox', drumTrackId: 'clap', accent: 'amber', defaultNote: 39, volume: 0.9 },
  { templateId: 'ch', name: 'Hi-Hat', shortName: 'HAT', target: 'beatbox', drumTrackId: 'ch', accent: 'amber', defaultNote: 42, volume: 0.85 },
  { templateId: 'oh', name: 'Open Hat', shortName: 'OHH', target: 'beatbox', drumTrackId: 'oh', accent: 'amber', defaultNote: 46, volume: 0.85 },
  { templateId: 'perc', name: 'Percussion', shortName: 'PRC', target: 'beatbox', drumTrackId: 'perc', accent: 'amber', defaultNote: 45, volume: 0.85 },
  { templateId: 'rim', name: 'Rimshot', shortName: 'RIM', target: 'beatbox', drumTrackId: 'rim', accent: 'amber', defaultNote: 37, volume: 0.85 },
  { templateId: 'crash', name: 'Crash', shortName: 'CRS', target: 'beatbox', drumTrackId: 'crash', accent: 'amber', defaultNote: 49, volume: 0.8 },
];

export function createDawTrackFromTemplate(
  templateId: string,
  existingIds: string[]
): DawTrackConfig {
  const tpl =
    DAW_TRACK_TEMPLATES.find((t) => t.templateId === templateId) ??
    DAW_TRACK_TEMPLATES[0];
  let idx = 1;
  let id = tpl.templateId;
  const used = new Set(existingIds);
  while (used.has(id)) {
    idx++;
    id = `${tpl.templateId}_${idx}`;
  }
  const suffix = idx > 1 ? ` ${idx}` : '';
  return {
    id,
    name: `${tpl.name}${suffix}`,
    shortName: tpl.shortName,
    target: tpl.target,
    drumTrackId: tpl.drumTrackId,
    accent: tpl.accent,
    muted: false,
    solo: false,
    volume: tpl.volume,
    defaultNote: tpl.defaultNote,
  };
}

export function createDefaultDawTracks(): Record<DawTrackId, DawTrackConfig> {
  return {
    kick: {
      id: 'kick',
      name: 'Kick',
      shortName: 'KCK',
      target: 'beatbox',
      drumTrackId: 'kick',
      accent: 'amber',
      muted: false,
      solo: false,
      volume: 1.0,
      defaultNote: 36,
    },
    snare: {
      id: 'snare',
      name: 'Snare',
      shortName: 'SNR',
      target: 'beatbox',
      drumTrackId: 'snare',
      accent: 'amber',
      muted: false,
      solo: false,
      volume: 0.95,
      defaultNote: 38,
    },
    hihat: {
      id: 'hihat',
      name: 'Hi-Hat',
      shortName: 'HAT',
      target: 'beatbox',
      drumTrackId: 'ch',
      accent: 'amber',
      muted: false,
      solo: false,
      volume: 0.85,
      defaultNote: 42,
    },
    perc: {
      id: 'perc',
      name: 'Percussion',
      shortName: 'PRC',
      target: 'beatbox',
      drumTrackId: 'perc',
      accent: 'amber',
      muted: false,
      solo: false,
      volume: 0.85,
      defaultNote: 45,
    },
    subbass: {
      id: 'subbass',
      name: 'Subbass',
      shortName: 'SUB',
      target: 'subbass',
      accent: 'cyan',
      muted: false,
      solo: false,
      volume: 0.95,
      defaultNote: 36, // C1
    },
    bass: {
      id: 'bass',
      name: 'Bass',
      shortName: 'BAS',
      target: 'serum',
      accent: 'cyan',
      muted: false,
      solo: false,
      volume: 0.95,
      defaultNote: 41, // F1
    },
    synth: {
      id: 'synth',
      name: 'Serum Synth',
      shortName: 'SYN',
      target: 'serum',
      accent: 'cyan',
      muted: false,
      solo: false,
      volume: 0.9,
      defaultNote: 53, // F2
    },
  };
}

export function createEmptyDawStep(defaultNote: number): DawStep {
  return {
    active: false,
    velocity: 0.88,
    probability: 1.0,
    length: 1.0,
    note: defaultNote,
  };
}

export function createEmptyDawPattern(
  id: string,
  name?: string,
  stepCount: 16 | 32 | 64 = 16,
  tracksConfig?: Record<DawTrackId, DawTrackConfig>,
  trackIds?: DawTrackId[]
): DawPattern {
  const trackDefaults = tracksConfig ?? createDefaultDawTracks();
  const order = trackIds ?? Object.keys(trackDefaults);
  const tracks = {} as Record<DawTrackId, DawStep[]>;
  for (const tid of order) {
    const defNote = trackDefaults[tid]?.defaultNote ?? 48;
    tracks[tid] = Array.from({ length: 64 }, () => createEmptyDawStep(defNote));
  }
  return {
    id,
    name: name ?? `Pattern ${id.replace('P', '')}`,
    stepCount,
    swing: 0.08,
    tracks,
    pianoRollNotes: [],
  };
}

export function cloneDawPattern(
  src: DawPattern,
  newId?: string,
  newName?: string,
  ownerTrackId?: DawTrackId
): DawPattern {
  const tracks = {} as Record<DawTrackId, DawStep[]>;
  for (const tid of Object.keys(src.tracks)) {
    tracks[tid] = (src.tracks[tid] ?? []).map((s) => ({ ...s }));
  }
  return {
    id: newId ?? src.id,
    name: newName ?? src.name,
    ownerTrackId: ownerTrackId ?? src.ownerTrackId,
    stepCount: src.stepCount,
    swing: src.swing,
    tracks,
    pianoRollNotes: src.pianoRollNotes.map((n, idx) => ({
      ...n,
      id: `${n.id}-c-${Date.now()}-${idx}`,
    })),
  };
}

export function createGrooveTemplatePattern(id: string): DawPattern {
  const pat = createEmptyDawPattern(id, `Riddim Groove ${id.replace('P', '')}`, 16);
  // Kick on 0, 10
  for (const s of [0, 10]) {
    pat.tracks.kick[s] = { active: true, velocity: 1.0, probability: 1, length: 1, note: 36 };
  }
  // Snare half-time on 8
  pat.tracks.snare[8] = { active: true, velocity: 0.98, probability: 1, length: 1, note: 38 };
  // Hi-hat on 2, 6, 12, 14
  for (const s of [2, 6, 12, 14]) {
    pat.tracks.hihat[s] = {
      active: true,
      velocity: s === 14 ? 0.9 : 0.72,
      probability: s === 14 ? 0.85 : 1,
      length: s === 14 ? 1.8 : 0.75,
      note: 42,
    };
  }
  // Perc syncopation
  for (const s of [4, 15]) {
    pat.tracks.perc[s] = { active: true, velocity: 0.78, probability: 0.9, length: 1, note: 45 };
  }
  // Bass wobble steps
  pat.tracks.bass[0] = { active: true, velocity: 0.95, probability: 1, length: 3.5, note: 41 };
  pat.tracks.bass[4] = { active: true, velocity: 0.9, probability: 1, length: 2.5, note: 41 };
  pat.tracks.bass[12] = { active: true, velocity: 0.92, probability: 1, length: 2.5, note: 44 };
  // Synth top stab
  pat.tracks.synth[8] = { active: true, velocity: 0.82, probability: 1, length: 1.5, note: 65 };
  return pat;
}

export function createDefaultAutomationLanes(): Record<AutomationParamId, AutomationLane> {
  const lanes = {} as Record<AutomationParamId, AutomationLane>;
  for (const meta of AUTOMATION_PARAMS) {
    lanes[meta.paramId] = {
      paramId: meta.paramId,
      enabled: false,
      points: [
        { step: 0, value: meta.defaultValue },
        { step: 16, value: meta.defaultValue },
      ],
    };
  }
  return lanes;
}

export function evaluateAutomationValue(
  lane: AutomationLane | undefined,
  stepInRange: number,
  maxRangeSteps = 16
): number | null {
  if (!lane || !lane.enabled || lane.points.length === 0) return null;
  const pts = lane.points;
  const clampedStep = Math.max(0, Math.min(maxRangeSteps, stepInRange));

  if (pts.length === 1) return pts[0].value;
  if (clampedStep <= pts[0].step) return pts[0].value;
  const last = pts[pts.length - 1];
  if (clampedStep >= last.step) return last.value;

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (clampedStep >= a.step && clampedStep <= b.step) {
      const span = b.step - a.step;
      if (span <= 0.0001) return b.value;
      const frac = (clampedStep - a.step) / span;
      return a.value + (b.value - a.value) * frac;
    }
  }
  return last.value;
}

export function sortAndDedupeAutomationPoints(points: AutomationPoint[]): AutomationPoint[] {
  const sorted = [...points]
    .map((p) => ({
      step: Math.max(0, Math.min(64, Math.round(p.step * 4) / 4)),
      value: Math.max(0, Math.min(1, p.value)),
    }))
    .sort((a, b) => a.step - b.step);

  const deduped: AutomationPoint[] = [];
  for (const p of sorted) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(prev.step - p.step) < 0.05) {
      prev.value = p.value;
    } else {
      deduped.push(p);
    }
  }
  return deduped;
}

export function createDefaultDawState(): DawSequencerState {
  const patterns: Record<string, DawPattern> = {};
  for (const pid of DAW_PATTERN_IDS) {
    patterns[pid] = createEmptyDawPattern(pid);
  }
  return {
    mode: 'easy',
    playMode: 'pattern',
    activePatternId: 'P1',
    pianoRollTarget: 'serum',
    snap: '1/4',
    trackOrder: [...DAW_TRACK_ORDER],
    tracks: createDefaultDawTracks(),
    patterns,
    song: {
      totalBars: 16,
      loopSectionEnabled: false,
      loopStartBar: 0,
      loopEndBar: 4,
      clips: [],
    },
    automationLanes: createDefaultAutomationLanes(),
  };
}

export function normalizeDawState(raw?: Partial<DawSequencerState>): DawSequencerState {
  const defaults = createDefaultDawState();
  if (!raw) return defaults;

  const tracks: Record<DawTrackId, DawTrackConfig> = {
    ...defaults.tracks,
    ...(raw.tracks ?? {}),
  };
  // Ensure default drumTrackId mappings exist on upgraded saved projects
  for (const tid of ['kick', 'snare', 'hihat', 'perc'] as const) {
    if (tracks[tid] && !tracks[tid].drumTrackId) {
      tracks[tid] = {
        ...tracks[tid],
        drumTrackId: tid === 'hihat' ? 'ch' : tid,
      };
    }
  }

  const trackOrder =
    Array.isArray(raw.trackOrder) && raw.trackOrder.length > 0
      ? raw.trackOrder.filter((tid) => Boolean(tracks[tid]))
      : [...DAW_TRACK_ORDER];
  if (trackOrder.length === 0) {
    trackOrder.push(...Object.keys(tracks));
  }

  const patterns: Record<string, DawPattern> = { ...defaults.patterns };
  if (raw.patterns) {
    for (const [pid, pat] of Object.entries(raw.patterns)) {
      const base = createEmptyDawPattern(
        pid,
        pat.name,
        pat.stepCount ?? 16,
        tracks,
        trackOrder
      );
      const patTracks = {} as Record<DawTrackId, DawStep[]>;
      const allKeys = new Set([...trackOrder, ...Object.keys(pat.tracks ?? {})]);
      for (const tid of allKeys) {
        const defNote = tracks[tid]?.defaultNote ?? 48;
        const srcTrack = pat.tracks?.[tid];
        patTracks[tid] = Array.from({ length: 64 }, (_, idx) => {
          const empty = createEmptyDawStep(defNote);
          return srcTrack?.[idx] ? { ...empty, ...srcTrack[idx] } : empty;
        });
      }
      patterns[pid] = {
        ...base,
        ...pat,
        tracks: patTracks,
        pianoRollNotes: Array.isArray(pat.pianoRollNotes) ? pat.pianoRollNotes : [],
      };
    }
  }

  return {
    mode: raw.mode === 'pro' ? 'pro' : 'easy',
    playMode: raw.playMode === 'song' ? 'song' : 'pattern',
    activePatternId:
      typeof raw.activePatternId === 'string' && patterns[raw.activePatternId]
        ? raw.activePatternId
        : 'P1',
    trackActivePattern:
      raw.trackActivePattern && typeof raw.trackActivePattern === 'object'
        ? raw.trackActivePattern
        : undefined,
    pianoRollTarget:
      raw.pianoRollTarget === 'beatbox' ||
      raw.pianoRollTarget === 'subbass' ||
      raw.pianoRollTarget === 'both' ||
      raw.pianoRollTarget === 'all'
        ? raw.pianoRollTarget
        : 'serum',
    snap: raw.snap ?? '1/4',
    trackOrder,
    tracks,
    patterns,
    song: {
      ...defaults.song,
      ...(raw.song ?? {}),
      clips: Array.isArray(raw.song?.clips) ? raw.song.clips : [],
    },
    automationLanes: {
      ...defaults.automationLanes,
      ...(raw.automationLanes ?? {}),
    },
  };
}
