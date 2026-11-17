import type { DrumTrackId } from './beatbox';
import type { SnapDivision } from './sequencer';

export type TimeSignatureId = '4/4' | '3/4' | '5/4' | '6/8' | '7/8';

export type DawStepLength = 16 | 32 | 64;

export type DawTrackId = string;

export type DawMidiOutputTarget = 'serum' | 'beatbox' | 'subbass' | 'ts666' | 'both' | 'all';

export type DawPlayMode = 'pattern' | 'song';

export type DawSequencerMode = 'easy' | 'pro';

export type DawSubView = 'steps' | 'pianoroll' | 'song' | 'automation';

export type AutomationParamId =
  | 'serum.cutoff'
  | 'serum.resonance'
  | 'serum.wtPosition'
  | 'serum.lfoRate'
  | 'serum.lfoDepth'
  | 'serum.volume'
  | 'beatbox.volume'
  | 'beatbox.drive';

export interface DawStep {
  active: boolean;
  velocity: number; // 0.1..1.0
  probability: number; // 0.1..1.0
  length: number; // 0.25..4.0 steps
  note: number; // MIDI note (36..84)
}

export interface DawTrackConfig {
  id: DawTrackId;
  name: string;
  shortName: string;
  target: 'beatbox' | 'serum' | 'subbass' | 'ts666';
  drumTrackId?: DrumTrackId;
  accent: 'amber' | 'cyan';
  muted: boolean;
  solo: boolean;
  volume: number; // 0..1.2
  defaultNote: number; // MIDI note
}

export interface DawMidiNote {
  id: string;
  midi: number; // 36..84
  step: number; // 0..63.875
  duration: number; // 0.25..16
  velocity: number; // 0.08..1.0
  target: DawMidiOutputTarget;
}

export interface DawPattern {
  id: string; // 'P1'..'P16' or track pattern id
  name: string;
  ownerTrackId?: DawTrackId;
  stepCount: DawStepLength;
  swing: number; // 0..0.65
  tracks: Record<DawTrackId, DawStep[]>; // 64 steps per track
  pianoRollNotes: DawMidiNote[];
}

export interface DawSongClip {
  id: string;
  lane: number; // 0-indexed lane fallback
  trackId?: DawTrackId; // Per-track binding for Caustic 3 timeline
  patternId: string;
  startBar: number; // 0-indexed bar
  lengthBars: number; // 1..16
}

export interface DawSongState {
  totalBars: number; // e.g. 16
  loopSectionEnabled: boolean;
  loopStartBar: number; // inclusive
  loopEndBar: number; // exclusive
  clips: DawSongClip[];
}

export interface AutomationPoint {
  step: number; // 0..64 (Pattern) or 0..totalBars*16 (Song normalized to 0..1 bar/pattern)
  value: number; // 0..1
}

export interface AutomationLane {
  paramId: AutomationParamId;
  enabled: boolean;
  points: AutomationPoint[];
}

export interface DawSequencerState {
  mode?: DawSequencerMode;
  playMode: DawPlayMode;
  activePatternId: string; // 'P1'..'P16'
  trackActivePattern?: Record<DawTrackId, string>;
  pianoRollTarget: DawMidiOutputTarget;
  snap: SnapDivision;
  trackOrder?: DawTrackId[];
  tracks: Record<DawTrackId, DawTrackConfig>;
  patterns: Record<string, DawPattern>;
  song: DawSongState;
  automationLanes: Record<AutomationParamId, AutomationLane>;
}
