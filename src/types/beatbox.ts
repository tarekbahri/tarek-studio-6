import type { BassRemixProjectState } from './bassRemix';
import type { DawSequencerState, TimeSignatureId } from './daw';
import type { ProjectDeviceFxState } from './fx';
import type { MidiNote, PatternBank, SequencerState } from './sequencer';
import type { SubbassPatch, SubbassSequencerState } from './subbass';
import type { SynthPatch } from './synth';
import type { Ts666Patch, Ts666SequencerState } from './ts666';

export type DrumTrackId =
  | 'kick'
  | 'snare'
  | 'clap'
  | 'ch'
  | 'oh'
  | 'perc'
  | 'rim'
  | 'crash';

export type DrumKitId =
  | 'dubstep_heavy'
  | 'riddim_trench'
  | 'trap_808'
  | 'techno_industrial';

export type TarekPluginId = 'home' | 'serum' | 'beatbox' | 'sequencer' | 'subbass' | 'ts666' | 'bassremix';

export interface DrumTrackConfig {
  id: DrumTrackId;
  name: string;
  shortName: string;
  midiNote: number; // GM Drum note e.g. 36=Kick, 38=Snare
  accentColor: 'cyan' | 'amber';
  muted: boolean;
  solo: boolean;
  level: number; // 0..1
  pan: number; // -1..1
  pitch: number; // -12..12 semitones
  decay: number; // 0.05..1.5
  tone: number; // 0..1
  drive: number; // 0..1
}

export interface BeatboxStep {
  active: boolean;
  velocity: number; // 0.2..1.0
  accent: boolean;
}

export interface BeatboxPattern {
  id: string; // e.g. 'A1'
  bank: PatternBank;
  slot: number; // 1..16
  steps: Record<DrumTrackId, BeatboxStep[]>; // 16 steps per track
}

export interface BeatboxPianoRollPattern {
  id: string;
  name: string;
  notes: MidiNote[];
}

export interface BeatboxPianoRollState {
  activePatternId: string;
  patternOrder: string[];
  patterns: Record<string, BeatboxPianoRollPattern>;
}

export interface BeatboxState {
  kitId: DrumKitId;
  activeBank: PatternBank;
  activeSlot: number; // 1..16
  swing: number; // 0..0.65
  masterDrive: number; // 0..1
  tracks: Record<DrumTrackId, DrumTrackConfig>;
  patterns: Record<string, BeatboxPattern>;
  pianoRoll?: BeatboxPianoRollState;
}

export interface StudioRoutingConfig {
  masterVolume: number; // 0..1
  serumLevel: number; // 0..1.2
  beatboxLevel: number; // 0..1.2
  subbassLevel: number; // 0..1.2
  ts666Level?: number; // 0..1.2
  bassremixLevel?: number; // 0..1.2
  serumMuted: boolean;
  serumSolo: boolean;
  serumFxBypass: boolean;
  beatboxMuted: boolean;
  beatboxSolo: boolean;
  beatboxFxBypass: boolean;
  subbassMuted: boolean;
  subbassSolo: boolean;
  subbassFxBypass: boolean;
  ts666Muted?: boolean;
  ts666Solo?: boolean;
  ts666FxBypass?: boolean;
  bassremixMuted?: boolean;
  bassremixSolo?: boolean;
  bassremixFxBypass?: boolean;
  beatboxToSerumFx: boolean; // Route Beatbox audio through Serum's 9-unit FX chain
  sidechainAmount: number; // 0..1 ducking of Serum when Beatbox Kick triggers
  midiBeatboxToSerum: boolean; // Send MIDI note triggers from Beatbox Perc/Kick to Serum
  midiKeyboardToBeatbox: boolean; // Notes 36..43 on MIDI / Keyboard also trigger Beatbox pads
}

export interface TarekProjectSummary {
  id: string;
  name: string;
  bpm: number;
  timeSignature: TimeSignatureId;
  createdAt: number;
  updatedAt: number;
}

export interface TarekProject {
  id: string;
  version: 1;
  name: string;
  createdAt?: number;
  updatedAt?: number;
  bpm: number; // 40..240
  timeSignature: TimeSignatureId;
  metronomeEnabled: boolean;
  loop: boolean;
  routing: StudioRoutingConfig;
  serumPatch: SynthPatch;
  serumSequencer: SequencerState;
  beatbox: BeatboxState;
  daw: DawSequencerState;
  subbass: SubbassPatch;
  subbassSequencer?: SubbassSequencerState;
  ts666Patch?: Ts666Patch;
  ts666Sequencer?: Ts666SequencerState;
  bassRemix?: BassRemixProjectState;
  deviceFx?: ProjectDeviceFxState;
}
