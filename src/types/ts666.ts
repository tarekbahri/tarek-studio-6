export type Ts666Tab = 'osc' | 'mix' | 'fx' | 'matrix' | 'global';

export type Ts666SynthMode =
  | 'wavetable'
  | 'sample'
  | 'multisample'
  | 'granular'
  | 'spectral';

export type Ts666WarpMode =
  | 'none'
  | 'sync'
  | 'pwm'
  | 'bend+'
  | 'bend-'
  | 'fm'
  | 'rm'
  | 'flip'
  | 'quantize'
  | 'mirror';

export type Ts666SubShape = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'sub_pulse';

export type Ts666NoiseSampleId =
  | 'white'
  | 'pink'
  | 'brown'
  | 'tape_hiss'
  | 'vinyl_crackle'
  | 'air_breath'
  | 'metallic_dust'
  | 'custom';

export type Ts666SampleId =
  | 'finger_bass'
  | 'analog_bass_c2'
  | 'sub_808'
  | 'warm_keys'
  | 'choir_ah'
  | 'pluck_string'
  | 'custom';

export type Ts666MultisampleId =
  | 'ms_clean_bass'
  | 'ms_analog_brass'
  | 'ms_electric_piano'
  | 'ms_upright_bass';

export type Ts666FilterCategory =
  | 'Normal'
  | 'Multi'
  | 'Flanges'
  | 'Combs'
  | 'Diffuser'
  | 'Misc';

export type Ts666FilterTypeId =
  // Normal
  | 'lp12'
  | 'lp24'
  | 'hp12'
  | 'hp24'
  | 'bp12'
  | 'bp24'
  | 'notch'
  | 'low_shelf'
  | 'high_shelf'
  | 'peak'
  // Multi
  | 'multi_lp_hp'
  | 'multi_notch_lp'
  | 'multi_formant'
  | 'multi_vowel'
  // Flanges
  | 'flange_plus'
  | 'flange_minus'
  | 'flange_allpass'
  // Combs
  | 'comb_plus'
  | 'comb_minus'
  | 'comb_karplus'
  // Diffuser
  | 'diff_allpass'
  | 'diff_smear'
  // Misc
  | 'misc_sh'
  | 'misc_ring'
  | 'misc_tilt';

export type Ts666FilterRoutingMode = 'serial' | 'parallel' | 'independent';

export type Ts666BusId = 'main' | 'bus1' | 'bus2';

export type Ts666LfoSyncDivision =
  | '2/1'
  | '1/1'
  | '1/2'
  | '1/2d'
  | '1/2t'
  | '1/4'
  | '1/4d'
  | '1/4t'
  | '1/8'
  | '1/8d'
  | '1/8t'
  | '1/16'
  | '1/16t'
  | '1/32';

export type Ts666LfoMode = 'trigger' | 'envelope' | 'off';

export type Ts666FxType =
  | 'growl_engine'
  | 'hyper_dim'
  | 'distortion'
  | 'flanger'
  | 'phaser'
  | 'chorus'
  | 'delay'
  | 'compressor'
  | 'reverb'
  | 'conv_reverb'
  | 'eq'
  | 'filter'
  | 'echobode'
  | 'utility'
  | 'cabinet'
  | 'tremolo';

export type Ts666GrowlPresetId =
  | 'clean_growl'
  | 'metallic_growl'
  | 'heavy_riddim'
  | 'deep_wobble'
  | 'aggressive_dubstep';

export interface Ts666GrowlTelemetry {
  enabled: boolean;
  cutoffHz: number;
  modulatedCutoffHz: number;
  resonance: number;
  drive: number;
  gain: number;
  metal: number;
  fmMetal: number;
  wobbleRateHz: number;
  wobbleDepth: number;
  wobblePhase01: number;
  filterMode: number;
  volume: number;
}

export type Ts666ModSource =
  | 'ENV1'
  | 'ENV2'
  | 'ENV3'
  | 'ENV4'
  | 'LFO1'
  | 'LFO2'
  | 'LFO3'
  | 'LFO4'
  | 'LFO5'
  | 'LFO6'
  | 'LFO7'
  | 'LFO8'
  | 'LFO9'
  | 'LFO10'
  | 'MACRO1'
  | 'MACRO2'
  | 'MACRO3'
  | 'MACRO4'
  | 'MACRO5'
  | 'MACRO6'
  | 'MACRO7'
  | 'MACRO8'
  | 'CHAOS1'
  | 'CHAOS2'
  | 'VELOCITY'
  | 'KEYTRACK'
  | 'MODWHEEL'
  | 'PITCHBEND'
  | 'AFTERTOUCH';

export type Ts666ModTarget =
  | 'OSC_A_OCT'
  | 'OSC_A_SEMI'
  | 'OSC_A_FINE'
  | 'OSC_A_COARSE'
  | 'OSC_A_UNISON'
  | 'OSC_A_DETUNE'
  | 'OSC_A_BLEND'
  | 'OSC_A_WT'
  | 'OSC_A_PHASE'
  | 'OSC_A_RANDOM'
  | 'OSC_A_WARP1'
  | 'OSC_A_WARP2'
  | 'OSC_A_PAN'
  | 'OSC_A_LEVEL'
  | 'OSC_A_GRAIN_SIZE'
  | 'OSC_A_DENSITY'
  | 'OSC_B_OCT'
  | 'OSC_B_SEMI'
  | 'OSC_B_FINE'
  | 'OSC_B_COARSE'
  | 'OSC_B_UNISON'
  | 'OSC_B_DETUNE'
  | 'OSC_B_BLEND'
  | 'OSC_B_WT'
  | 'OSC_B_PHASE'
  | 'OSC_B_RANDOM'
  | 'OSC_B_WARP1'
  | 'OSC_B_WARP2'
  | 'OSC_B_PAN'
  | 'OSC_B_LEVEL'
  | 'OSC_B_GRAIN_SIZE'
  | 'OSC_B_DENSITY'
  | 'OSC_C_OCT'
  | 'OSC_C_SEMI'
  | 'OSC_C_FINE'
  | 'OSC_C_COARSE'
  | 'OSC_C_UNISON'
  | 'OSC_C_DETUNE'
  | 'OSC_C_BLEND'
  | 'OSC_C_WT'
  | 'OSC_C_PHASE'
  | 'OSC_C_RANDOM'
  | 'OSC_C_WARP1'
  | 'OSC_C_WARP2'
  | 'OSC_C_PAN'
  | 'OSC_C_LEVEL'
  | 'OSC_C_GRAIN_SIZE'
  | 'OSC_C_DENSITY'
  | 'SUB_OCTAVE'
  | 'SUB_PAN'
  | 'SUB_LEVEL'
  | 'NOISE_PITCH'
  | 'NOISE_PHASE'
  | 'NOISE_PAN'
  | 'NOISE_LEVEL'
  | 'F1_CUTOFF'
  | 'F1_RES'
  | 'F1_PAN'
  | 'F1_DRIVE'
  | 'F1_FAT'
  | 'F1_MIX'
  | 'F2_CUTOFF'
  | 'F2_RES'
  | 'F2_PAN'
  | 'F2_DRIVE'
  | 'F2_FAT'
  | 'F2_MIX'
  | 'GROWL_CUTOFF'
  | 'GROWL_RES'
  | 'GROWL_VOL'
  | 'GROWL_DRIVE'
  | 'GROWL_GAIN'
  | 'GROWL_METAL'
  | 'GROWL_FM'
  | 'GROWL_RATE'
  | 'GROWL_DEPTH'
  | 'MASTER_VOL'
  | 'CHAOS1_RATE'
  | 'CHAOS2_RATE';

export type Ts666Oversampling = 1 | 2 | 4;

export interface Ts666WavetableFrameData {
  real: number[]; // harmonic cosine coeffs (len 33)
  imag: number[]; // harmonic sine coeffs (len 33)
}

export interface Ts666CustomWavetable {
  name: string;
  frames: Ts666WavetableFrameData[]; // 16 frames
}

export interface Ts666OscillatorConfig {
  id: 'A' | 'B' | 'C';
  enabled: boolean;
  mode: Ts666SynthMode;
  wavetableId: string; // factory wavetable id or 'custom'
  customWavetable?: Ts666CustomWavetable;
  sampleId: Ts666SampleId;
  multisampleId: Ts666MultisampleId;
  customSampleName?: string;
  // Exact 14 requested controls:
  octave: number; // -4..4 (1)
  semitone: number; // -12..12 (2)
  fine: number; // -100..100 cents (3)
  coarse: number; // -64..64 semitones (4)
  unison: number; // 1..8 (5)
  detune: number; // 0..1 (6)
  blend: number; // 0..1 (7)
  wtPosition: number; // 0..1 (8)
  phase: number; // 0..360 deg (9)
  random: number; // 0..1 (10)
  warp1Mode: Ts666WarpMode;
  warp1Amount: number; // 0..1 (11)
  warp2Mode: Ts666WarpMode;
  warp2Amount: number; // 0..1 (12)
  pan: number; // -1..1 (13)
  level: number; // 0..1 (14)
  // Granular & Spectral extra controls:
  grainSize: number; // 0.01..0.3 s (also controls Spectral bandwidth)
  density: number; // 0..1 (grains/sec or Spectral density)
}

export interface Ts666SubConfig {
  enabled: boolean;
  shape: Ts666SubShape;
  octave: number; // -3..2
  pan: number; // -1..1
  level: number; // 0..1
  directOut: boolean;
}

export interface Ts666NoiseConfig {
  enabled: boolean;
  sampleId: Ts666NoiseSampleId;
  customSampleName?: string;
  pitch: number; // 0..1
  phase: number; // 0..360
  pan: number; // -1..1
  level: number; // 0..1
  keyboardTracking: boolean;
  oneShot: boolean;
  phaseRandomization: number; // 0..1
  directOut: boolean;
}

export interface Ts666FilterConfig {
  id: 1 | 2;
  enabled: boolean;
  category: Ts666FilterCategory;
  type: Ts666FilterTypeId;
  cutoff: number; // 20..20000 Hz
  resonance: number; // 0.1..20
  pan: number; // -1..1
  drive: number; // 0..1
  fat: number; // 0..1 (Fat / Variation)
  mix: number; // 0..1
  routeA: boolean;
  routeB: boolean;
  routeC: boolean;
  routeN: boolean;
  routeS: boolean;
}

export interface Ts666EnvelopeConfig {
  id: 1 | 2 | 3 | 4;
  attack: number; // 0.002..5 s
  hold: number; // 0..4 s
  decay: number; // 0.005..5 s
  sustain: number; // 0..1
  release: number; // 0.005..6 s
  attackCurve: number; // -1..1
  decayCurve: number; // -1..1
  releaseCurve: number; // -1..1
}

export interface Ts666LfoConfig {
  id: number; // 1..10
  points: number[]; // editable waveform Y values -1..1
  bends: number[]; // path curve bends per segment -1..1
  gridSize: 4 | 8 | 16 | 32;
  pathMode: boolean; // smooth spline / curve vs linear/step
  rateHz: number; // 0.05..30 Hz
  sync: boolean;
  division: Ts666LfoSyncDivision;
  rise: number; // 0..4 s
  delay: number; // 0..4 s
  smooth: number; // 0..1
  mode: Ts666LfoMode; // 'trigger' | 'envelope' | 'off'
  anchored: boolean;
  bipolar: boolean;
}

export type Ts666ArpMode = 'up' | 'down' | 'up_down' | 'random' | 'chord' | 'order';

export interface Ts666ArpConfig {
  enabled: boolean;
  mode: Ts666ArpMode;
  division: Ts666LfoSyncDivision;
  sync: boolean;
  rateHz: number;
  gate: number; // 0.1..1.5
  swing: number; // 0..0.65
  octaves: number; // 1..4
}

export interface Ts666ClipStep {
  active: boolean;
  midi: number;
  velocity: number; // 0.1..1
  lengthSteps: number; // 1..4
}

export interface Ts666ClipSequencerConfig {
  enabled: boolean;
  stepCount: 8 | 16 | 32;
  division: '1/8' | '1/16' | '1/32';
  swing: number; // 0..0.65
  steps: Ts666ClipStep[];
}

export interface Ts666MacroBinding {
  target: Ts666ModTarget;
  amount: number; // -1..1
}

export interface Ts666MacroConfig {
  id: number; // 1..8
  name: string;
  value: number; // 0..1
  bindings: Ts666MacroBinding[];
}

export interface Ts666MixChannelConfig {
  volume: number; // 0..1.2
  pan: number; // -1..1
  mute: boolean;
  solo: boolean;
  bus: Ts666BusId;
}

export interface Ts666MixConfig {
  oscA: Ts666MixChannelConfig;
  oscB: Ts666MixChannelConfig;
  oscC: Ts666MixChannelConfig;
  sub: Ts666MixChannelConfig;
  noise: Ts666MixChannelConfig;
  filter1: Ts666MixChannelConfig;
  filter2: Ts666MixChannelConfig;
  bus1Return: { volume: number; pan: number; mute: boolean };
  bus2Return: { volume: number; pan: number; mute: boolean };
  mainLevel: number;
}

export interface Ts666FxModule {
  id: string;
  type: Ts666FxType;
  name: string;
  enabled: boolean;
  params: Record<string, number>;
}

export interface Ts666FxBuses {
  main: Ts666FxModule[];
  bus1: Ts666FxModule[];
  bus2: Ts666FxModule[];
  mainBypass: boolean;
  bus1Bypass: boolean;
  bus2Bypass: boolean;
}

export interface Ts666ModRoute {
  id: string;
  enabled: boolean;
  source: Ts666ModSource;
  target: Ts666ModTarget;
  amount: number; // -1..1
  direction: 'uni' | 'bi';
  curve: number; // -1..1
  auxSource: 'NONE' | Ts666ModSource;
}

export interface Ts666ChaosConfig {
  rateHz: number; // 0.05..20 Hz
  smooth: number; // 0..1
  bipolar: boolean;
  mono: boolean;
}

export type Ts666MicrotuningScaleId =
  | 'equal_12'
  | 'just_intonation'
  | 'pythagorean'
  | 'meantone'
  | 'carlos_alpha'
  | 'arabic_rast'
  | 'custom';

export interface Ts666GlobalConfig {
  oversampling: Ts666Oversampling; // 1 | 2 | 4
  polyphony: number; // 1..16
  monoLegato: boolean;
  masterTuningHz: number; // 415..466 (default 440)
  microtuningScale: Ts666MicrotuningScaleId;
  microtuningCents: number[]; // 12 pitch-class cent offsets C..B
  chaos1: Ts666ChaosConfig;
  chaos2: Ts666ChaosConfig;
}

export interface Ts666PerformanceConfig {
  portamentoTimeMs: number; // 0..1000
  portamentoCurve: number; // -1..1
  pitchBendUp: number; // 1..24 semitones
  pitchBendDown: number; // 1..24 semitones
  masterVolume: number; // 0..1
  pitchBendValue: number; // -1..1 live wheel
  modWheelValue: number; // 0..1 live wheel
}

export interface Ts666Patch {
  id: string;
  name: string;
  category: string;
  isFactory?: boolean;
  oscillators: [Ts666OscillatorConfig, Ts666OscillatorConfig, Ts666OscillatorConfig];
  sub: Ts666SubConfig;
  noise: Ts666NoiseConfig;
  filters: [Ts666FilterConfig, Ts666FilterConfig];
  filterRouting: Ts666FilterRoutingMode;
  filterLink: boolean;
  envelopes: [
    Ts666EnvelopeConfig,
    Ts666EnvelopeConfig,
    Ts666EnvelopeConfig,
    Ts666EnvelopeConfig
  ];
  lfos: Ts666LfoConfig[]; // length 10 (LFO 1..10)
  arp: Ts666ArpConfig;
  clipSeq: Ts666ClipSequencerConfig;
  macros: Ts666MacroConfig[]; // length 8 (Macro 1..8)
  performance: Ts666PerformanceConfig;
  mix: Ts666MixConfig;
  fx: Ts666FxBuses;
  modMatrix: Ts666ModRoute[]; // up to 64 active/defined slots
  global: Ts666GlobalConfig;
}

export type Ts666LiveModOffsets = Partial<Record<Ts666ModTarget, number>>;

export interface Ts666Pattern {
  id: string;
  name: string;
  notes: import('./sequencer').MidiNote[];
}

export interface Ts666SequencerState {
  activePatternId: string;
  patternOrder: string[];
  patterns: Record<string, Ts666Pattern>;
  showKeyboard?: boolean;
}
