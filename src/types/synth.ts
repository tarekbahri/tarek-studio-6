export type WavetableId =
  | 'basic_shapes'
  | 'analog_classic'
  | 'pwm_sweep'
  | 'formant_vocal'
  | 'modern_talking'
  | 'riddim_clang'
  | 'robot_vowel'
  | 'fm_metallic'
  | 'acid_saw'
  | 'sub_harmonic'
  | 'glass_bell'
  | 'super_harmonic'
  | 'monster_growl'
  | 'tearout_screech'
  | 'riddim_square'
  | 'reese_crush';

export type WarpMode = 'none' | 'bend+' | 'bend-' | 'sync' | 'pwm' | 'fm';

export type FilterMode =
  | 'lp12'
  | 'lp24'
  | 'hp12'
  | 'hp24'
  | 'bp12'
  | 'notch'
  | 'comb'
  | 'formant';

export type LfoPresetShape =
  | 'sine'
  | 'triangle'
  | 'saw'
  | 'ramp'
  | 'square'
  | 'wobble'
  | 'riddim'
  | 'tearout'
  | 'sh'
  | 'custom';

export type LfoSyncDivision =
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

export type ModSource =
  | 'LFO1'
  | 'LFO2'
  | 'LFO3'
  | 'AMP_ENV'
  | 'MOD_ENV'
  | 'MOD_WHEEL';

export type ModTarget =
  | 'FILTER_CUTOFF'
  | 'FILTER_RES'
  | 'FILTER_DRIVE'
  | 'FILTER_MIX'
  | 'OSC_A_PITCH'
  | 'OSC_B_PITCH'
  | 'OSC_C_PITCH'
  | 'OSC_A_WT'
  | 'OSC_B_WT'
  | 'OSC_C_WT'
  | 'OSC_A_WARP'
  | 'OSC_B_WARP'
  | 'OSC_C_WARP'
  | 'OSC_A_LEVEL'
  | 'OSC_B_LEVEL'
  | 'OSC_C_LEVEL'
  | 'SUB_LEVEL'
  | 'NOISE_LEVEL'
  | 'FX_DIST_DRIVE'
  | 'AMP_LEVEL'
  | 'PAN';

export type MacroTarget =
  | 'WOBBLE_SPEED'
  | 'FILTER_MOVEMENT'
  | 'FILTER_CUTOFF'
  | 'FILTER_RES'
  | 'FILTER_DRIVE'
  | 'FILTER_MIX'
  | 'OSC_A_WT'
  | 'OSC_B_WT'
  | 'OSC_C_WT'
  | 'OSC_A_WARP'
  | 'OSC_B_WARP'
  | 'OSC_C_WARP'
  | 'OSC_A_LEVEL'
  | 'OSC_B_LEVEL'
  | 'SUB_LEVEL'
  | 'NOISE_LEVEL'
  | 'LFO1_DEPTH'
  | 'LFO2_DEPTH'
  | 'FX_DIST_DRIVE'
  | 'FX_DIST_MIX';

export interface MacroBinding {
  target: MacroTarget;
  amount: number; // -1..1
}

export interface SynthMacro {
  id: 1 | 2 | 3 | 4;
  name: string;
  value: number; // 0..1 (0.5 = neutral center)
  bindings: MacroBinding[];
}

export type PresetCategory =
  | 'Riddim'
  | 'DJ ROI Inspired'
  | 'Modern Talking'
  | 'Skrillex Inspired'
  | 'Heavy Dubstep'
  | 'Tearout'
  | 'Growls'
  | 'Sub Bass'
  | 'Dubstep'
  | 'Bass'
  | 'Lead'
  | 'Pad'
  | 'Pluck'
  | 'Keys'
  | 'FX';

export type ModuleTab = 'osc' | 'filter' | 'lfo' | 'fx';

export interface OscillatorConfig {
  id: 'A' | 'B' | 'C';
  enabled: boolean;
  wavetableId: WavetableId;
  wtPosition: number; // 0..1
  warpMode: WarpMode;
  warpAmount: number; // 0..1
  octave: number; // -3..3
  semitone: number; // -12..12
  detune: number; // -100..100 cents
  unisonVoices: number; // 1..4
  unisonDetune: number; // 0..1
  level: number; // 0..1
  pan: number; // -1..1
}

export interface SubOscConfig {
  enabled: boolean;
  shape: 'sine' | 'triangle' | 'saw' | 'square';
  octave: -2 | -1 | 0;
  level: number; // 0..1
  directOut: boolean;
}

export interface NoiseOscConfig {
  enabled: boolean;
  type: 'white' | 'pink' | 'metallic' | 'bright';
  pitch: number; // 0..1 (filter cutoff of noise)
  level: number; // 0..1
}

export interface FilterConfig {
  enabled: boolean;
  mode: FilterMode;
  cutoff: number; // 20..20000 Hz
  resonance: number; // 0.1..20
  drive: number; // 0..1
  mix: number; // 0..1
  envAmount: number; // -1..1
}

export interface AdsrConfig {
  attack: number; // 0.002..4.0 s
  decay: number; // 0.005..4.0 s
  sustain: number; // 0..1
  release: number; // 0.005..5.0 s
}

export interface LfoConfig {
  id: 1 | 2 | 3;
  presetShape: LfoPresetShape;
  points: number[]; // 17 points across 1 cycle [0..1] where values are -1..1
  rateHz: number; // 0.05..20 Hz (used when sync === false)
  sync: boolean;
  division: LfoSyncDivision;
  depth: number; // 0..1
  bipolar: boolean;
  retrigger: boolean;
}

export interface ModRoute {
  id: string;
  enabled: boolean;
  source: ModSource;
  target: ModTarget;
  amount: number; // -1..1
}

export interface DistortionConfig {
  enabled: boolean;
  mode: 'tube' | 'hard' | 'fold' | 'bitcrush';
  drive: number; // 0..1
  tone: number; // 400..16000 Hz
  mix: number; // 0..1
}

export interface HyperDimensionConfig {
  enabled: boolean;
  unisonMix: number; // 0..1
  detune: number; // 0..1
  dimSize: number; // 0..1
  dimMix: number; // 0..1
}

export interface PhaserConfig {
  enabled: boolean;
  rate: number; // 0.05..6 Hz
  depth: number; // 0..1
  feedback: number; // 0..0.85
  mix: number; // 0..1
}

export interface FlangerConfig {
  enabled: boolean;
  rate: number; // 0.05..6 Hz
  depth: number; // 0..1
  feedback: number; // 0..0.85
  mix: number; // 0..1
}

export interface ChorusConfig {
  enabled: boolean;
  rate: number; // 0.1..5 Hz
  depth: number; // 0..1
  mix: number; // 0..1
}

export interface DelayConfig {
  enabled: boolean;
  time: number; // 0.04..1.0 s
  feedback: number; // 0..0.88
  mix: number; // 0..1
}

export interface ReverbConfig {
  enabled: boolean;
  size: number; // 0.1..1.0
  damping: number; // 0..1
  mix: number; // 0..1
}

export interface EqConfig {
  enabled: boolean;
  lowGain: number; // -12..12 dB
  midFreq: number; // 200..5000 Hz
  midGain: number; // -12..12 dB
  highGain: number; // -12..12 dB
}

export interface CompressorConfig {
  enabled: boolean;
  multiband: boolean; // OTT-style 3-band punch
  threshold: number; // -50..0 dB
  ratio: number; // 1..20
  attack: number; // 0.001..0.2 s
  release: number; // 0.02..1.0 s
  makeup: number; // 0..14 dB
}

export type CabinetType =
  | '1x15_bass'
  | '4x10_bass'
  | '8x10_ampeg'
  | '2x12_clean'
  | '4x12_modern';

export interface CabinetConfig {
  enabled: boolean;
  cabinetType: CabinetType;
  size: number; // 0..1
  micPosition: number; // 0..1 (center -> cone edge)
  micDistance: number; // 0..1 (close -> far)
  roomAmount: number; // 0..1
  mix: number; // 0..1
  outputGain: number; // 0.3..1.6
}

export type TremoloWaveform = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface TremoloConfig {
  enabled: boolean;
  rate: number; // 0.1..20 Hz
  depth: number; // 0..1
  waveform: TremoloWaveform;
  stereoPhase: number; // 0..180 degrees L/R offset
  sync: boolean;
  division: LfoSyncDivision;
  mix: number; // 0..1
}

export interface EffectsConfig {
  distortion: DistortionConfig;
  hyperDimension: HyperDimensionConfig;
  phaser: PhaserConfig;
  flanger: FlangerConfig;
  chorus: ChorusConfig;
  delay: DelayConfig;
  reverb: ReverbConfig;
  eq: EqConfig;
  compressor: CompressorConfig;
  cabinet: CabinetConfig;
  tremolo: TremoloConfig;
}

export interface MasterConfig {
  volume: number; // 0..1
  glideMs: number; // 0..400 ms
  pitchBendRange: number; // 1..12 semitones
}

export interface SynthPatch {
  id: string;
  name: string;
  category: PresetCategory;
  isFactory?: boolean;
  oscillators: [OscillatorConfig, OscillatorConfig, OscillatorConfig];
  subOsc: SubOscConfig;
  noiseOsc: NoiseOscConfig;
  filter: FilterConfig;
  ampEnv: AdsrConfig;
  modEnv: AdsrConfig;
  lfos: [LfoConfig, LfoConfig, LfoConfig];
  modMatrix: ModRoute[];
  macros: [SynthMacro, SynthMacro, SynthMacro, SynthMacro];
  effects: EffectsConfig;
  master: MasterConfig;
}

export type LiveModOffsets = Partial<Record<ModTarget, number>>;
