import type {
  BeatboxPattern,
  BeatboxPianoRollPattern,
  BeatboxPianoRollState,
  BeatboxState,
  BeatboxStep,
  DrumKitId,
  DrumTrackConfig,
  DrumTrackId,
} from '../types/beatbox';
import type { MidiNote, PatternBank } from '../types/sequencer';
import { BANKS, SLOTS } from './sequencerStorage';

export const DRUM_TRACK_ORDER: DrumTrackId[] = [
  'kick',
  'snare',
  'clap',
  'ch',
  'oh',
  'perc',
  'rim',
  'crash',
];

export const DRUM_KITS: { id: DrumKitId; name: string; description: string }[] = [
  { id: 'dubstep_heavy', name: 'Dubstep Heavy', description: 'Sub-punch 140 BPM chest kick & slam snare' },
  { id: 'riddim_trench', name: 'Riddim Trench', description: 'Tight woody kick, hollow clap & clang perc' },
  { id: 'trap_808', name: '808 Trap', description: 'Booming long 808 kick, crispy hats & snare' },
  { id: 'techno_industrial', name: 'Techno Drive', description: 'Overdriven punch kick & dark metallic hats' },
];

export function makeKitTracks(kitId: DrumKitId): Record<DrumTrackId, DrumTrackConfig> {
  const base: Record<DrumTrackId, DrumTrackConfig> = {
    kick: {
      id: 'kick',
      name: 'Kick',
      shortName: 'KICK',
      midiNote: 36,
      accentColor: 'amber',
      muted: false,
      solo: false,
      level: 0.92,
      pan: 0,
      pitch: 0,
      decay: 0.42,
      tone: 0.52,
      drive: 0.35,
    },
    snare: {
      id: 'snare',
      name: 'Snare',
      shortName: 'SNR',
      midiNote: 38,
      accentColor: 'amber',
      muted: false,
      solo: false,
      level: 0.86,
      pan: 0,
      pitch: 0,
      decay: 0.32,
      tone: 0.65,
      drive: 0.32,
    },
    clap: {
      id: 'clap',
      name: 'Clap',
      shortName: 'CLAP',
      midiNote: 39,
      accentColor: 'cyan',
      muted: false,
      solo: false,
      level: 0.78,
      pan: -0.08,
      pitch: 0,
      decay: 0.28,
      tone: 0.68,
      drive: 0.2,
    },
    ch: {
      id: 'ch',
      name: 'Closed Hat',
      shortName: 'CH',
      midiNote: 42,
      accentColor: 'cyan',
      muted: false,
      solo: false,
      level: 0.64,
      pan: 0.18,
      pitch: 0,
      decay: 0.11,
      tone: 0.72,
      drive: 0.12,
    },
    oh: {
      id: 'oh',
      name: 'Open Hat',
      shortName: 'OH',
      midiNote: 46,
      accentColor: 'cyan',
      muted: false,
      solo: false,
      level: 0.62,
      pan: -0.2,
      pitch: 0,
      decay: 0.48,
      tone: 0.7,
      drive: 0.1,
    },
    perc: {
      id: 'perc',
      name: 'Metal Perc',
      shortName: 'PERC',
      midiNote: 43,
      accentColor: 'amber',
      muted: false,
      solo: false,
      level: 0.72,
      pan: 0.28,
      pitch: 2,
      decay: 0.24,
      tone: 0.62,
      drive: 0.28,
    },
    rim: {
      id: 'rim',
      name: 'Rimshot',
      shortName: 'RIM',
      midiNote: 37,
      accentColor: 'cyan',
      muted: false,
      solo: false,
      level: 0.7,
      pan: -0.25,
      pitch: 0,
      decay: 0.14,
      tone: 0.66,
      drive: 0.22,
    },
    crash: {
      id: 'crash',
      name: 'Crash',
      shortName: 'CRSH',
      midiNote: 49,
      accentColor: 'cyan',
      muted: false,
      solo: false,
      level: 0.58,
      pan: 0.1,
      pitch: 0,
      decay: 0.95,
      tone: 0.78,
      drive: 0.1,
    },
  };

  switch (kitId) {
    case 'riddim_trench':
      base.kick.pitch = 2;
      base.kick.decay = 0.28;
      base.kick.drive = 0.55;
      base.clap.tone = 0.76;
      base.clap.drive = 0.45;
      base.perc.pitch = 5;
      base.perc.drive = 0.52;
      break;
    case 'trap_808':
      base.kick.pitch = -4;
      base.kick.decay = 0.88;
      base.kick.tone = 0.35;
      base.kick.drive = 0.25;
      base.snare.pitch = 3;
      base.snare.decay = 0.22;
      base.ch.pitch = 4;
      base.ch.decay = 0.08;
      break;
    case 'techno_industrial':
      base.kick.pitch = -1;
      base.kick.decay = 0.52;
      base.kick.drive = 0.72;
      base.snare.drive = 0.65;
      base.rim.drive = 0.55;
      base.oh.decay = 0.36;
      break;
    case 'dubstep_heavy':
    default:
      break;
  }

  return base;
}

export function createEmptySteps(): Record<DrumTrackId, BeatboxStep[]> {
  const steps = {} as Record<DrumTrackId, BeatboxStep[]>;
  for (const id of DRUM_TRACK_ORDER) {
    steps[id] = Array.from({ length: 16 }, () => ({
      active: false,
      velocity: 0.85,
      accent: false,
    }));
  }
  return steps;
}

function applyStepIndices(
  steps: Record<DrumTrackId, BeatboxStep[]>,
  track: DrumTrackId,
  indices: number[],
  accents: number[] = []
): void {
  const accentSet = new Set(accents);
  for (const idx of indices) {
    if (idx >= 0 && idx < 16) {
      steps[track][idx] = {
        active: true,
        velocity: accentSet.has(idx) ? 1.0 : 0.82,
        accent: accentSet.has(idx),
      };
    }
  }
}

export function createDefaultBeatboxPatterns(): Record<string, BeatboxPattern> {
  const patterns: Record<string, BeatboxPattern> = {};
  for (const bank of BANKS) {
    for (const slot of SLOTS) {
      const id = `${bank}${slot}`;
      patterns[id] = {
        id,
        bank,
        slot,
        steps: createEmptySteps(),
      };
    }
  }

  // A1: Heavy Half-Time Dubstep / Wobble Groove
  const a1 = patterns.A1.steps;
  applyStepIndices(a1, 'kick', [0, 6, 10], [0]);
  applyStepIndices(a1, 'snare', [8], [8]);
  applyStepIndices(a1, 'clap', [8], [8]);
  applyStepIndices(a1, 'ch', [0, 2, 4, 6, 8, 10, 12, 13, 14, 15], [0, 4, 8, 12]);
  applyStepIndices(a1, 'oh', [14]);
  applyStepIndices(a1, 'perc', [3, 11]);
  applyStepIndices(a1, 'crash', [0]);

  // A2: Riddim Quarter Bounce
  const a2 = patterns.A2.steps;
  applyStepIndices(a2, 'kick', [0, 4, 8, 12], [0, 8]);
  applyStepIndices(a2, 'clap', [8], [8]);
  applyStepIndices(a2, 'ch', [2, 6, 10, 14]);
  applyStepIndices(a2, 'perc', [0, 4, 8, 12, 15]);
  applyStepIndices(a2, 'rim', [3, 11]);

  // B1: Driving Four-on-the-Floor
  const b1 = patterns.B1.steps;
  applyStepIndices(b1, 'kick', [0, 4, 8, 12], [0, 8]);
  applyStepIndices(b1, 'snare', [4, 12], [4, 12]);
  applyStepIndices(b1, 'ch', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [2, 6, 10, 14]);
  applyStepIndices(b1, 'oh', [2, 10]);

  return patterns;
}

export function createDefaultBeatboxPianoRollState(): BeatboxPianoRollState {
  return {
    activePatternId: 'B1',
    patternOrder: ['B1'],
    patterns: {
      B1: {
        id: 'B1',
        name: 'Drum Roll 1',
        notes: [],
      },
    },
  };
}

export function normalizeBeatboxPianoRollState(
  raw?: Partial<BeatboxPianoRollState>
): BeatboxPianoRollState {
  const def = createDefaultBeatboxPianoRollState();
  if (!raw || !raw.patterns || typeof raw.patterns !== 'object') return def;

  const patterns: Record<string, BeatboxPianoRollPattern> = {};
  const rawOrder = Array.isArray(raw.patternOrder) ? raw.patternOrder : Object.keys(raw.patterns);
  const patternOrder: string[] = [];

  const cleanNotes = (arr: unknown): MidiNote[] =>
    Array.isArray(arr)
      ? arr
          .filter((n): n is MidiNote => Boolean(n && typeof n.midi === 'number' && typeof n.step === 'number'))
          .map((n) => ({
            id: typeof n.id === 'string' && n.id ? n.id : `bb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            midi: Math.round(n.midi),
            step: Math.max(0, Math.min(15.875, n.step)),
            duration: typeof n.duration === 'number' ? Math.max(0.25, Math.min(16, n.duration)) : 1,
            velocity: typeof n.velocity === 'number' ? Math.max(0.08, Math.min(1, n.velocity)) : 0.88,
          }))
      : [];

  for (const pid of rawOrder) {
    const p = raw.patterns[pid];
    if (!p || typeof pid !== 'string') continue;
    patterns[pid] = {
      id: pid,
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `Drum Roll ${patternOrder.length + 1}`,
      notes: cleanNotes(p.notes),
    };
    patternOrder.push(pid);
  }

  for (const [pid, p] of Object.entries(raw.patterns)) {
    if (patterns[pid] || !p) continue;
    patterns[pid] = {
      id: pid,
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : pid,
      notes: cleanNotes(p.notes),
    };
    patternOrder.push(pid);
  }

  if (patternOrder.length === 0) return def;

  const activePatternId =
    typeof raw.activePatternId === 'string' && patterns[raw.activePatternId]
      ? raw.activePatternId
      : patternOrder[0];

  return { activePatternId, patternOrder, patterns };
}

export function createDefaultBeatboxState(): BeatboxState {
  const kitId: DrumKitId = 'dubstep_heavy';
  return {
    kitId,
    activeBank: 'A' as PatternBank,
    activeSlot: 1,
    swing: 0.08,
    masterDrive: 0.25,
    tracks: makeKitTracks(kitId),
    patterns: createDefaultBeatboxPatterns(),
    pianoRoll: createDefaultBeatboxPianoRollState(),
  };
}
