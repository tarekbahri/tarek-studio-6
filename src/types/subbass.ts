import type { MidiNote } from './sequencer';

export type SubbassOctave = -2 | -1 | 0;
export type SubbassPhaseDeg = 0 | 90 | 180 | 270;

export type SubbassFxId =
  | 'tube'
  | 'diode'
  | 'softClip'
  | 'waveshaper'
  | 'eq'
  | 'lowpass'
  | 'compressor'
  | 'sidechain'
  | 'stereo';

export type SubbassFilterType = 'lp12' | 'lp24' | 'warm';
export type SubbassSidechainRate = '1/4' | '1/8' | '1/2';

export interface SubbassFxConfig {
  presetId: string;
  // Section A & B parallel dual-engine levels
  cleanSubEnabled: boolean;
  cleanSubLevel: number; // 0..1 (preserves pure sine/triangle fundamental)
  harmonicEnabled: boolean;
  harmonicLevel: number; // 0..1 (parallel harmonic/distortion layer)
  // User-reorderable module order
  order: SubbassFxId[];
  // 1. Tube Saturation
  tube: {
    enabled: boolean;
    drive: number; // 0..1
    mix: number; // 0..1
    output: number; // 0..1
  };
  // 2. Diode Distortion
  diode: {
    enabled: boolean;
    drive: number; // 0..1
    tone: number; // 0..1
    mix: number; // 0..1
  };
  // 3. Soft Clipper
  softClip: {
    enabled: boolean;
    threshold: number; // 0..1
    amount: number; // 0..1
    output: number; // 0..1
  };
  // 4. Waveshaper
  waveshaper: {
    enabled: boolean;
    drive: number; // 0..1
    mix: number; // 0..1
    curvePoints: number[]; // 9 control points in -1..+1 across input -1..+1
  };
  // 5. Parametric EQ
  eq: {
    enabled: boolean;
    lowShelf: number; // 0..1 -> -12..+12 dB
    midFreq: number; // 0..1 -> 100..2500 Hz
    midGain: number; // 0..1 -> -12..+12 dB
    highShelf: number; // 0..1 -> -12..+12 dB
  };
  // 6. Low Pass Filter
  lowpass: {
    enabled: boolean;
    cutoff: number; // 0..1 -> 35..6000 Hz
    resonance: number; // 0..1
    filterType: SubbassFilterType;
  };
  // 7. Compressor
  compressor: {
    enabled: boolean;
    threshold: number; // 0..1 -> -48..0 dB
    ratio: number; // 0..1 -> 1..20:1
    attack: number; // 0..1 -> 1..150 ms
    release: number; // 0..1 -> 30..800 ms
    makeup: number; // 0..1 -> 0..+18 dB
  };
  // 8. Sidechain (synced with BEATBOX Kick + BPM)
  sidechain: {
    enabled: boolean;
    amount: number; // 0..1
    attack: number; // 0..1 -> 2..80 ms
    release: number; // 0..1 -> 40..750 ms
    bpmSync: boolean;
    syncRate: SubbassSidechainRate;
  };
  // 9. Mono / Stereo Control
  stereo: {
    enabled: boolean;
    crossoverHz: number; // 0..1 -> 60..240 Hz (default 120 Hz)
    width: number; // 0..1 -> 0%..160% stereo width above crossover
  };
}

export interface SubbassFxPreset {
  id: string;
  name: string;
  description: string;
  apply: Partial<Omit<SubbassFxConfig, 'presetId'>>;
}

export interface SubbassPatch {
  presetId: string;
  name: string;
  // 8 Main Hardware Knob Controls (normalized 0..1)
  subLevel: number; // Pure Sine Sub level
  bassTone: number; // 0 = pure Sine -> blends Triangle & harmonic warmth
  attack: number; // 0..1 -> 2ms..400ms
  release: number; // 0..1 -> 25ms..1400ms
  glide: number; // 0..1 -> 0ms..320ms portamento
  saturation: number; // 0..1 -> harmonic soft/hard sub saturation
  lowPassFilter: number; // 0..1 -> 38Hz..2400Hz LPF
  outputVolume: number; // 0..1 -> master plugin output level
  // Voice Architecture Switches
  squareEnabled: boolean; // Optional square oscillator layer
  octave: SubbassOctave; // Sub octave shift (-2, -1, 0)
  phase: SubbassPhaseDeg; // Oscillator phase offset (0, 90, 180, 270)
  // Parallel Dual-Section & 9-Module FX Rack
  fx?: SubbassFxConfig;
}

export interface SubbassPreset {
  id: string;
  name: string;
  patch: Omit<SubbassPatch, 'presetId' | 'name'>;
}

export interface SubbassPattern {
  id: string;
  name: string;
  notes: MidiNote[];
}

export interface SubbassSequencerState {
  activePatternId: string;
  patternOrder: string[];
  patterns: Record<string, SubbassPattern>;
  showKeyboard?: boolean;
}
