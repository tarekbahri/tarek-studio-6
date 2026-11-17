import type { MidiNote, PatternBank, PatternData, SequencerState, SnapDivision } from '../types/sequencer';
import { mirrorKeyToIndexedDb } from './tarekIndexedDb';

const SEQUENCER_STORAGE_KEY = 'aetherwave_sequencer_v1';

export const BANKS: PatternBank[] = ['A', 'B', 'C', 'D'];
export const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

export const SNAP_OPTIONS: { id: SnapDivision; label: string; steps: number }[] = [
  { id: '1', label: '1/4', steps: 4 },
  { id: '1/2', label: '1/8', steps: 2 },
  { id: '1/4', label: '1/16', steps: 1 },
  { id: '1/8', label: '1/32', steps: 0.5 },
  { id: 'off', label: 'Free', steps: 0.125 },
];

export function snapToSteps(snap: SnapDivision): number {
  const found = SNAP_OPTIONS.find((s) => s.id === snap);
  return found ? found.steps : 1;
}

export function getPatternId(bank: PatternBank, slot: number): string {
  return `${bank}${slot}`;
}

export function createDefaultPatterns(): Record<string, PatternData> {
  const patterns: Record<string, PatternData> = {};
  for (const bank of BANKS) {
    for (const slot of SLOTS) {
      const id = getPatternId(bank, slot);
      patterns[id] = { id, bank, slot, notes: [] };
    }
  }

  // Seed A1 with a musical polyphonic electronic synth pattern
  const a1Notes: MidiNote[] = [
    // Bass root pulses (C3 = 48, G#2 = 44, A#2 = 46)
    { id: 'seed-1', midi: 48, step: 0, duration: 2, velocity: 0.92 },
    { id: 'seed-2', midi: 48, step: 3, duration: 1, velocity: 0.78 },
    { id: 'seed-3', midi: 44, step: 4, duration: 2, velocity: 0.88 },
    { id: 'seed-4', midi: 44, step: 7, duration: 1, velocity: 0.74 },
    { id: 'seed-5', midi: 46, step: 8, duration: 2, velocity: 0.9 },
    { id: 'seed-6', midi: 46, step: 11, duration: 1, velocity: 0.76 },
    { id: 'seed-7', midi: 43, step: 12, duration: 2, velocity: 0.86 },
    { id: 'seed-8', midi: 47, step: 14, duration: 2, velocity: 0.82 },
    // Chord & arpeggio top melody (C4=60, D#4=63, G4=67, A#4=70, C5=72)
    { id: 'seed-9', midi: 60, step: 0, duration: 1, velocity: 0.84 },
    { id: 'seed-10', midi: 63, step: 1, duration: 1, velocity: 0.72 },
    { id: 'seed-11', midi: 67, step: 2, duration: 1, velocity: 0.86 },
    { id: 'seed-12', midi: 72, step: 4, duration: 1, velocity: 0.9 },
    { id: 'seed-13', midi: 67, step: 5, duration: 1, velocity: 0.72 },
    { id: 'seed-14', midi: 63, step: 6, duration: 1, velocity: 0.76 },
    { id: 'seed-15', midi: 65, step: 8, duration: 1, velocity: 0.85 },
    { id: 'seed-16', midi: 70, step: 9, duration: 1, velocity: 0.78 },
    { id: 'seed-17', midi: 74, step: 10, duration: 1.5, velocity: 0.92 },
    { id: 'seed-18', midi: 72, step: 12, duration: 1, velocity: 0.84 },
    { id: 'seed-19', midi: 67, step: 13, duration: 1, velocity: 0.75 },
    { id: 'seed-20', midi: 71, step: 14, duration: 2, velocity: 0.88 },
  ];
  patterns.A1.notes = a1Notes;

  // Seed A2 with a lush polyphonic chord progression
  patterns.A2.notes = [
    { id: 'seed-a2-1', midi: 48, step: 0, duration: 4, velocity: 0.88 },
    { id: 'seed-a2-2', midi: 60, step: 0, duration: 4, velocity: 0.8 },
    { id: 'seed-a2-3', midi: 63, step: 0, duration: 4, velocity: 0.76 },
    { id: 'seed-a2-4', midi: 67, step: 0, duration: 4, velocity: 0.82 },

    { id: 'seed-a2-5', midi: 44, step: 4, duration: 4, velocity: 0.86 },
    { id: 'seed-a2-6', midi: 56, step: 4, duration: 4, velocity: 0.78 },
    { id: 'seed-a2-7', midi: 60, step: 4, duration: 4, velocity: 0.76 },
    { id: 'seed-a2-8', midi: 63, step: 4, duration: 4, velocity: 0.8 },

    { id: 'seed-a2-9', midi: 46, step: 8, duration: 4, velocity: 0.88 },
    { id: 'seed-a2-10', midi: 58, step: 8, duration: 4, velocity: 0.8 },
    { id: 'seed-a2-11', midi: 62, step: 8, duration: 4, velocity: 0.76 },
    { id: 'seed-a2-12', midi: 65, step: 8, duration: 4, velocity: 0.82 },

    { id: 'seed-a2-13', midi: 43, step: 12, duration: 4, velocity: 0.86 },
    { id: 'seed-a2-14', midi: 55, step: 12, duration: 4, velocity: 0.78 },
    { id: 'seed-a2-15', midi: 59, step: 12, duration: 4, velocity: 0.75 },
    { id: 'seed-a2-16', midi: 62, step: 12, duration: 4, velocity: 0.8 },
  ];

  return patterns;
}

export function loadSequencerState(): SequencerState {
  const defaults: SequencerState = {
    bpm: 124,
    activeBank: 'A',
    activeSlot: 1,
    loop: true,
    patterns: createDefaultPatterns(),
  };

  try {
    const raw = localStorage.getItem(SEQUENCER_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<SequencerState>;
    return {
      bpm: typeof parsed.bpm === 'number' ? Math.max(40, Math.min(240, parsed.bpm)) : 124,
      activeBank: parsed.activeBank && BANKS.includes(parsed.activeBank) ? parsed.activeBank : 'A',
      activeSlot:
        typeof parsed.activeSlot === 'number' && parsed.activeSlot >= 1 && parsed.activeSlot <= 16
          ? parsed.activeSlot
          : 1,
      loop: typeof parsed.loop === 'boolean' ? parsed.loop : true,
      patterns: parsed.patterns
        ? { ...defaults.patterns, ...parsed.patterns }
        : defaults.patterns,
    };
  } catch {
    return defaults;
  }
}

export function saveSequencerState(state: SequencerState): void {
  const serialized = JSON.stringify(state);
  try {
    localStorage.setItem(SEQUENCER_STORAGE_KEY, serialized);
  } catch {
    // ignore storage quota errors
  }
  void mirrorKeyToIndexedDb(SEQUENCER_STORAGE_KEY, serialized);
}
