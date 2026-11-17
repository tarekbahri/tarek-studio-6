export type PatternBank = 'A' | 'B' | 'C' | 'D';

export type SnapDivision = '1' | '1/2' | '1/4' | '1/8' | 'off';

export type PianoRollTool = 'draw' | 'select' | 'erase';

export interface MidiNote {
  id: string;
  midi: number; // 36 (C2) .. 84 (C6)
  step: number; // 0 .. 15.875 (in 16th-note steps)
  duration: number; // 0.25 .. 16 (in 16th-note steps)
  velocity: number; // 0.08 .. 1.0
}

export interface PatternData {
  id: string; // e.g. 'A1'
  bank: PatternBank;
  slot: number; // 1..16
  notes: MidiNote[];
}

export interface SequencerState {
  bpm: number; // 40..240
  activeBank: PatternBank;
  activeSlot: number; // 1..16
  loop: boolean;
  patterns: Record<string, PatternData>;
}
