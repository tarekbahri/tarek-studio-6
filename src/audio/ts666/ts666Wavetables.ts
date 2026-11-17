import type {
  Ts666CustomWavetable,
  Ts666FilterCategory,
  Ts666FilterTypeId,
  Ts666LfoSyncDivision,
  Ts666MicrotuningScaleId,
  Ts666MultisampleId,
  Ts666NoiseSampleId,
  Ts666SampleId,
  Ts666WarpMode,
  Ts666WavetableFrameData,
} from '../../types/ts666';

const HARMONICS = 48;
const TABLE_FRAMES = 16;
const DFT_SAMPLES = 256;

export interface Ts666WavetablePreset {
  id: string;
  name: string;
  category: string;
  frames: Float32Array[]; // 16 frames x DFT_SAMPLES time-domain single cycle
}

export interface Ts666FilterDef {
  id: Ts666FilterTypeId;
  category: Ts666FilterCategory;
  name: string;
  shortName: string;
}

export const TS666_FILTER_CATEGORIES: Ts666FilterCategory[] = [
  'Normal',
  'Multi',
  'Flanges',
  'Combs',
  'Diffuser',
  'Misc',
];

export const TS666_FILTER_LIBRARY: Ts666FilterDef[] = [
  // Normal
  { id: 'lp12', category: 'Normal', name: 'MG Low 12', shortName: 'LP 12' },
  { id: 'lp24', category: 'Normal', name: 'MG Low 24', shortName: 'LP 24' },
  { id: 'hp12', category: 'Normal', name: 'High 12', shortName: 'HP 12' },
  { id: 'hp24', category: 'Normal', name: 'High 24', shortName: 'HP 24' },
  { id: 'bp12', category: 'Normal', name: 'Band 12', shortName: 'BP 12' },
  { id: 'bp24', category: 'Normal', name: 'Band 24', shortName: 'BP 24' },
  { id: 'notch', category: 'Normal', name: 'Notch', shortName: 'Notch' },
  { id: 'low_shelf', category: 'Normal', name: 'Low Shelf', shortName: 'LShelf' },
  { id: 'high_shelf', category: 'Normal', name: 'High Shelf', shortName: 'HShelf' },
  { id: 'peak', category: 'Normal', name: 'Peak Bell', shortName: 'Peak' },
  // Multi
  { id: 'multi_lp_hp', category: 'Multi', name: 'Dual LP+HP', shortName: 'LP+HP' },
  { id: 'multi_notch_lp', category: 'Multi', name: 'Notch+LP', shortName: 'N+LP' },
  { id: 'multi_formant', category: 'Multi', name: 'Formant A-E-I', shortName: 'Formant' },
  { id: 'multi_vowel', category: 'Multi', name: 'Vocal O-U-A', shortName: 'Vowel' },
  // Flanges
  { id: 'flange_plus', category: 'Flanges', name: 'Flange +', shortName: 'Flg+' },
  { id: 'flange_minus', category: 'Flanges', name: 'Flange -', shortName: 'Flg-' },
  { id: 'flange_allpass', category: 'Flanges', name: 'Phase Flange', shortName: 'PhFlg' },
  // Combs
  { id: 'comb_plus', category: 'Combs', name: 'Comb +', shortName: 'Comb+' },
  { id: 'comb_minus', category: 'Combs', name: 'Comb -', shortName: 'Comb-' },
  { id: 'comb_karplus', category: 'Combs', name: 'Comb Pluck', shortName: 'Pluck' },
  // Diffuser
  { id: 'diff_allpass', category: 'Diffuser', name: 'Allpass Disperser', shortName: 'Allpass' },
  { id: 'diff_smear', category: 'Diffuser', name: 'Phase Smear', shortName: 'Smear' },
  // Misc
  { id: 'misc_sh', category: 'Misc', name: 'Sample & Hold', shortName: 'S&H' },
  { id: 'misc_ring', category: 'Misc', name: 'Ring Filter', shortName: 'Ring' },
  { id: 'misc_tilt', category: 'Misc', name: 'Tilt Spectral', shortName: 'Tilt' },
];

export const TS666_WARP_MODES: { id: Ts666WarpMode; label: string }[] = [
  { id: 'none', label: 'Off' },
  { id: 'sync', label: 'Sync' },
  { id: 'pwm', label: 'PWM' },
  { id: 'bend+', label: 'Bend +' },
  { id: 'bend-', label: 'Bend -' },
  { id: 'fm', label: 'Self FM' },
  { id: 'rm', label: 'Ring Mod' },
  { id: 'flip', label: 'Flip' },
  { id: 'quantize', label: 'Quantize' },
  { id: 'mirror', label: 'Mirror' },
];

export const TS666_SAMPLES: { id: Exclude<Ts666SampleId, 'custom'>; name: string; rootMidi: number }[] = [
  { id: 'finger_bass', name: 'Warm Finger Bass', rootMidi: 36 },
  { id: 'analog_bass_c2', name: 'Analog Poly Saw C2', rootMidi: 36 },
  { id: 'sub_808', name: 'Clean 808 Tail', rootMidi: 36 },
  { id: 'warm_keys', name: 'Warm Electric Keys', rootMidi: 60 },
  { id: 'choir_ah', name: 'Smooth Choir Ah', rootMidi: 60 },
  { id: 'pluck_string', name: 'Acoustic Pluck', rootMidi: 48 },
];

export const TS666_MULTISAMPLES: { id: Ts666MultisampleId; name: string }[] = [
  { id: 'ms_clean_bass', name: 'Clean Studio Bass (5-Zone)' },
  { id: 'ms_analog_brass', name: 'Warm Brass Stack (5-Zone)' },
  { id: 'ms_electric_piano', name: 'Tine Electric Piano (5-Zone)' },
  { id: 'ms_upright_bass', name: 'Upright Double Bass (5-Zone)' },
];

export const TS666_NOISE_SAMPLES: { id: Exclude<Ts666NoiseSampleId, 'custom'>; name: string }[] = [
  { id: 'white', name: 'Pure White' },
  { id: 'pink', name: 'Analog Pink' },
  { id: 'brown', name: 'Deep Brown' },
  { id: 'tape_hiss', name: 'Studio Tape Hiss' },
  { id: 'vinyl_crackle', name: 'Warm Vinyl Dust' },
  { id: 'air_breath', name: 'Flute Air Breath' },
  { id: 'metallic_dust', name: 'High Air Shimmer' },
];

export const TS666_LFO_SYNC_DIVISIONS: { id: Ts666LfoSyncDivision; beats: number }[] = [
  { id: '2/1', beats: 8 },
  { id: '1/1', beats: 4 },
  { id: '1/2d', beats: 3 },
  { id: '1/2', beats: 2 },
  { id: '1/2t', beats: 4 / 3 },
  { id: '1/4d', beats: 1.5 },
  { id: '1/4', beats: 1 },
  { id: '1/4t', beats: 2 / 3 },
  { id: '1/8d', beats: 0.75 },
  { id: '1/8', beats: 0.5 },
  { id: '1/8t', beats: 1 / 3 },
  { id: '1/16', beats: 0.25 },
  { id: '1/16t', beats: 1 / 6 },
  { id: '1/32', beats: 0.125 },
];

export function syncDivisionToHz(division: Ts666LfoSyncDivision, bpm: number): number {
  const item = TS666_LFO_SYNC_DIVISIONS.find((d) => d.id === division);
  const beats = item ? item.beats : 1;
  const safeBpm = Math.max(40, Math.min(260, bpm));
  return safeBpm / (60 * beats);
}

export const TS666_MICROTUNING_SCALES: {
  id: Ts666MicrotuningScaleId;
  name: string;
  cents: number[];
}[] = [
  { id: 'equal_12', name: '12-TET Standard', cents: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  {
    id: 'just_intonation',
    name: '5-Limit Just Intonation',
    cents: [0, 11.73, 3.91, 15.64, -13.69, -1.96, -9.78, 1.96, 13.69, -15.64, 17.6, -11.73],
  },
  {
    id: 'pythagorean',
    name: 'Pythagorean',
    cents: [0, -9.78, 3.91, -5.87, 7.82, -1.96, 11.73, 1.96, -7.82, 5.87, -3.91, 9.78],
  },
  {
    id: 'meantone',
    name: 'Quarter-Comma Meantone',
    cents: [0, -24.0, -6.8, 10.3, -13.7, 3.4, -20.5, -3.4, -27.4, -10.3, 6.8, -17.1],
  },
  {
    id: 'carlos_alpha',
    name: 'Wendy Carlos Alpha (Subtle)',
    cents: [0, -22, -44, 14, -8, -30, 28, 6, -16, -38, 20, -2],
  },
  {
    id: 'arabic_rast',
    name: 'Maqam Rast (Quarter-Tone)',
    cents: [0, 0, 0, 0, -50, 0, 0, 0, 0, 0, 0, -50],
  },
  { id: 'custom', name: 'Custom User Scale', cents: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
];

export function midiToMicrotunedFreq(
  midiFloat: number,
  masterTuningHz: number,
  cents12: number[]
): number {
  const safeA4 = Math.max(415, Math.min(466, masterTuningHz || 440));
  const floorMidi = Math.floor(midiFloat);
  const frac = midiFloat - floorMidi;
  const pc0 = ((floorMidi % 12) + 12) % 12;
  const pc1 = (pc0 + 1) % 12;
  const c0 = cents12[pc0] ?? 0;
  const c1 = cents12[pc1] ?? 0;
  const interpolatedCents = c0 + (c1 - c0) * frac;
  const effectiveMidi = midiFloat + interpolatedCents / 100;
  return safeA4 * Math.pow(2, (effectiveMidi - 69) / 12);
}

// =========================================================================
// FACTORY WAVETABLES (16 frames x 256 samples)
// =========================================================================

function normalizeCycle(samples: Float32Array): Float32Array {
  let maxAbs = 0;
  let mean = 0;
  for (let i = 0; i < samples.length; i++) {
    mean += samples[i];
  }
  mean /= samples.length;
  for (let i = 0; i < samples.length; i++) {
    samples[i] -= mean;
    const a = Math.abs(samples[i]);
    if (a > maxAbs) maxAbs = a;
  }
  if (maxAbs > 1e-6) {
    const scale = 0.96 / maxAbs;
    for (let i = 0; i < samples.length; i++) {
      samples[i] *= scale;
    }
  }
  return samples;
}

function makeFrame(fn: (t: number) => number): Float32Array {
  const arr = new Float32Array(DFT_SAMPLES);
  for (let i = 0; i < DFT_SAMPLES; i++) {
    arr[i] = fn(i / DFT_SAMPLES);
  }
  return normalizeCycle(arr);
}

function bandlimitedSaw(t: number, maxH = 36): number {
  let s = 0;
  for (let h = 1; h <= maxH; h++) {
    const gibbs = Math.cos(((h - 1) / maxH) * Math.PI * 0.45);
    s += (gibbs / h) * Math.sin(2 * Math.PI * h * t);
  }
  return s * (2 / Math.PI);
}

function bandlimitedSquare(t: number, maxH = 35): number {
  let s = 0;
  for (let h = 1; h <= maxH; h += 2) {
    const gibbs = Math.cos(((h - 1) / maxH) * Math.PI * 0.45);
    s += (gibbs / h) * Math.sin(2 * Math.PI * h * t);
  }
  return s * (4 / Math.PI);
}

function bandlimitedTriangle(t: number, maxH = 25): number {
  let s = 0;
  for (let h = 1; h <= maxH; h += 2) {
    const sign = ((h - 1) / 2) % 2 === 0 ? 1 : -1;
    s += (sign / (h * h)) * Math.sin(2 * Math.PI * h * t);
  }
  return s * (8 / (Math.PI * Math.PI));
}

function lerpFrames(a: Float32Array, b: Float32Array, mix: number): Float32Array {
  const out = new Float32Array(a.length);
  const inv = 1 - mix;
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] * inv + b[i] * mix;
  }
  return out;
}

function buildBasicShapes(): Float32Array[] {
  const sine = makeFrame((t) => Math.sin(2 * Math.PI * t));
  const tri = makeFrame((t) => bandlimitedTriangle(t));
  const saw = makeFrame((t) => bandlimitedSaw(t));
  const sq = makeFrame((t) => bandlimitedSquare(t));
  const frames: Float32Array[] = [];
  for (let f = 0; f < TABLE_FRAMES; f++) {
    const pos = f / (TABLE_FRAMES - 1);
    if (pos <= 1 / 3) {
      frames.push(lerpFrames(sine, tri, pos * 3));
    } else if (pos <= 2 / 3) {
      frames.push(lerpFrames(tri, saw, (pos - 1 / 3) * 3));
    } else {
      frames.push(lerpFrames(saw, sq, (pos - 2 / 3) * 3));
    }
  }
  return frames;
}

function buildAnalogBass(): Float32Array[] {
  const frames: Float32Array[] = [];
  for (let f = 0; f < TABLE_FRAMES; f++) {
    const p = f / (TABLE_FRAMES - 1);
    frames.push(
      makeFrame((t) => {
        const sub = Math.sin(2 * Math.PI * t) * 0.65;
        const harm2 = Math.sin(4 * Math.PI * t) * (0.2 + p * 0.35);
        const saw = bandlimitedSaw(t, Math.round(6 + p * 26)) * (0.35 + p * 0.65);
        return Math.tanh((sub + harm2 + saw) * (1 + p * 0.7));
      })
    );
  }
  return frames;
}

function buildSpectralGlass(): Float32Array[] {
  const frames: Float32Array[] = [];
  for (let f = 0; f < TABLE_FRAMES; f++) {
    const p = f / (TABLE_FRAMES - 1);
    frames.push(
      makeFrame((t) => {
        let sum = Math.sin(2 * Math.PI * t) * 0.8;
        const peak = 2 + p * 18;
        for (let h = 2; h <= 24; h++) {
          const dist = Math.abs(h - peak);
          const env = Math.exp(-(dist * dist) / (5 + p * 12));
          sum += (env / Math.sqrt(h)) * Math.sin(2 * Math.PI * h * t + h * p * 0.5);
        }
        return sum;
      })
    );
  }
  return frames;
}

function buildVocalFormant(): Float32Array[] {
  const formants = [
    [3.2, 6.4, 11.0], // Ah
    [2.5, 8.2, 13.5], // Eh
    [1.8, 11.0, 16.0], // Ee
    [2.2, 4.5, 11.2], // Oh
    [1.6, 3.3, 9.8], // Oo
  ];
  const frames: Float32Array[] = [];
  for (let f = 0; f < TABLE_FRAMES; f++) {
    const pos = (f / (TABLE_FRAMES - 1)) * (formants.length - 1);
    const i0 = Math.floor(pos);
    const i1 = Math.min(formants.length - 1, i0 + 1);
    const frac = pos - i0;
    const f1 = formants[i0][0] * (1 - frac) + formants[i1][0] * frac;
    const f2 = formants[i0][1] * (1 - frac) + formants[i1][1] * frac;
    const f3 = formants[i0][2] * (1 - frac) + formants[i1][2] * frac;
    frames.push(
      makeFrame((t) => {
        let sum = Math.sin(2 * Math.PI * t) * 0.9;
        for (let h = 2; h <= 26; h++) {
          const a1 = Math.exp(-Math.pow((h - f1) / 1.4, 2)) * 0.75;
          const a2 = Math.exp(-Math.pow((h - f2) / 1.8, 2)) * 0.55;
          const a3 = Math.exp(-Math.pow((h - f3) / 2.2, 2)) * 0.35;
          sum += (a1 + a2 + a3) * Math.sin(2 * Math.PI * h * t);
        }
        return sum;
      })
    );
  }
  return frames;
}

function buildSubHarmonics(): Float32Array[] {
  const frames: Float32Array[] = [];
  for (let f = 0; f < TABLE_FRAMES; f++) {
    const p = f / (TABLE_FRAMES - 1);
    frames.push(
      makeFrame((t) => {
        const f1 = Math.sin(2 * Math.PI * t);
        const f2 = Math.sin(4 * Math.PI * t) * 0.45 * p;
        const f3 = Math.sin(6 * Math.PI * t) * 0.35 * p;
        const f4 = Math.sin(8 * Math.PI * t) * 0.25 * Math.pow(p, 1.4);
        return Math.tanh((f1 + f2 + f3 + f4) * (1 + p * 0.6));
      })
    );
  }
  return frames;
}

function buildAcidPwm(): Float32Array[] {
  const frames: Float32Array[] = [];
  for (let f = 0; f < TABLE_FRAMES; f++) {
    const pw = 0.08 + (f / (TABLE_FRAMES - 1)) * 0.42;
    frames.push(
      makeFrame((t) => {
        let sum = 0;
        for (let h = 1; h <= 30; h++) {
          const coef = (2 / (Math.PI * h)) * Math.sin(Math.PI * h * pw);
          sum += coef * Math.cos(2 * Math.PI * h * t);
        }
        return sum;
      })
    );
  }
  return frames;
}

export const TS666_WAVETABLE_LIST: Ts666WavetablePreset[] = [
  { id: 'basic_shapes', name: 'Basic Shapes', category: 'Clean', frames: buildBasicShapes() },
  { id: 'analog_bass', name: 'Analog Bass', category: 'Bass', frames: buildAnalogBass() },
  { id: 'sub_harmonics', name: 'Sub Harmonics', category: 'Bass', frames: buildSubHarmonics() },
  { id: 'acid_pwm', name: 'PWM Pulse', category: 'Analog', frames: buildAcidPwm() },
  { id: 'vocal_formant', name: 'Vocal Formant', category: 'Vocal', frames: buildVocalFormant() },
  { id: 'spectral_glass', name: 'Spectral Glass', category: 'Digital', frames: buildSpectralGlass() },
];

export function evaluateCustomFrameCycle(frame: Ts666WavetableFrameData): Float32Array {
  const arr = new Float32Array(DFT_SAMPLES);
  const maxH = Math.min(32, frame.real.length - 1, frame.imag.length - 1);
  for (let i = 0; i < DFT_SAMPLES; i++) {
    const phase = (2 * Math.PI * i) / DFT_SAMPLES;
    let sum = 0;
    for (let h = 1; h <= maxH; h++) {
      const r = frame.real[h] ?? 0;
      const im = frame.imag[h] ?? 0;
      if (r !== 0) sum += r * Math.cos(h * phase);
      if (im !== 0) sum += im * Math.sin(h * phase);
    }
    arr[i] = sum;
  }
  return normalizeCycle(arr);
}

export function getWavetableFrames(
  wtId: string,
  customWt?: Ts666CustomWavetable
): Float32Array[] {
  if (wtId === 'custom' && customWt && customWt.frames.length > 0) {
    return customWt.frames.map((fr) => evaluateCustomFrameCycle(fr));
  }
  const found = TS666_WAVETABLE_LIST.find((w) => w.id === wtId);
  return found ? found.frames : TS666_WAVETABLE_LIST[0].frames;
}

function sampleLinearFrame(frame: Float32Array, phase01: number): number {
  const p = ((phase01 % 1) + 1) % 1;
  const idx = p * frame.length;
  const i0 = Math.floor(idx) % frame.length;
  const i1 = (i0 + 1) % frame.length;
  const frac = idx - Math.floor(idx);
  return frame[i0] * (1 - frac) + frame[i1] * frac;
}

export function applyWarpToPhaseAndSample(
  phase01: number,
  sampleFn: (p: number) => number,
  mode: Ts666WarpMode,
  amount: number
): number {
  const p = ((phase01 % 1) + 1) % 1;
  const amt = Math.max(0, Math.min(1, amount));
  if (mode === 'none' || amt <= 0.002) {
    return sampleFn(p);
  }
  switch (mode) {
    case 'sync': {
      const mult = 1 + amt * 5.0;
      return sampleFn((p * mult) % 1);
    }
    case 'pwm': {
      const duty = 0.5 - amt * 0.42;
      const warped = p < duty ? (p / Math.max(0.05, duty)) * 0.5 : 0.5 + ((p - duty) / Math.max(0.05, 1 - duty)) * 0.5;
      return sampleFn(warped);
    }
    case 'bend+': {
      const exp = 1 + amt * 3.0;
      return sampleFn(Math.pow(p, exp));
    }
    case 'bend-': {
      const exp = 1 / (1 + amt * 3.0);
      return sampleFn(Math.pow(p, exp));
    }
    case 'fm': {
      const mod = Math.sin(2 * Math.PI * p * 2) * amt * 0.25;
      return sampleFn(p + mod);
    }
    case 'rm': {
      const base = sampleFn(p);
      const ring = Math.sin(2 * Math.PI * p * (1 + Math.round(amt * 5)));
      return base * (1 - amt + amt * ring);
    }
    case 'flip': {
      const base = sampleFn(p);
      return p > 1 - amt ? -base : base;
    }
    case 'quantize': {
      const steps = Math.max(3, Math.round(32 - amt * 28));
      const val = sampleFn(p);
      return Math.round(val * steps) / steps;
    }
    case 'mirror': {
      const folded = p < 0.5 ? p * 2 : (1 - p) * 2;
      return sampleFn(p * (1 - amt) + folded * amt);
    }
    default:
      return sampleFn(p);
  }
}

export function evaluateTs666Cycle(
  frames: Float32Array[],
  wtPos: number,
  warp1Mode: Ts666WarpMode,
  warp1Amt: number,
  warp2Mode: Ts666WarpMode,
  warp2Amt: number,
  phaseOffsetDeg = 0,
  numSamples = DFT_SAMPLES
): Float32Array {
  const pos = Math.max(0, Math.min(1, wtPos)) * (frames.length - 1);
  const f0 = Math.floor(pos);
  const f1 = Math.min(frames.length - 1, f0 + 1);
  const frac = pos - f0;
  const frameA = frames[f0];
  const frameB = frames[f1];

  const baseFn = (p: number) => {
    const sA = sampleLinearFrame(frameA, p);
    const sB = sampleLinearFrame(frameB, p);
    return sA * (1 - frac) + sB * frac;
  };

  const afterW1 = (p: number) => applyWarpToPhaseAndSample(p, baseFn, warp1Mode, warp1Amt);
  const afterW2 = (p: number) => applyWarpToPhaseAndSample(p, afterW1, warp2Mode, warp2Amt);

  const phShift = (((phaseOffsetDeg % 360) + 360) % 360) / 360;
  const out = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    out[i] = afterW2(i / numSamples + phShift);
  }
  return out;
}

function buildPeriodicWaveFromCycle(
  ctx: BaseAudioContext,
  cycle: Float32Array
): PeriodicWave {
  const N = cycle.length;
  const real = new Float32Array(HARMONICS + 1);
  const imag = new Float32Array(HARMONICS + 1);
  real[0] = 0;
  imag[0] = 0;

  for (let k = 1; k <= HARMONICS; k++) {
    let sumCos = 0;
    let sumSin = 0;
    const step = (2 * Math.PI * k) / N;
    for (let n = 0; n < N; n++) {
      const ang = step * n;
      sumCos += cycle[n] * Math.cos(ang);
      sumSin += cycle[n] * Math.sin(ang);
    }
    const gibbs = k > HARMONICS * 0.8 ? Math.cos(((k - HARMONICS * 0.8) / (HARMONICS * 0.2)) * (Math.PI / 2)) : 1;
    real[k] = ((2 * sumCos) / N) * gibbs;
    imag[k] = ((2 * sumSin) / N) * gibbs;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

const periodicCache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();

export function getOrCreateTs666PeriodicWave(
  ctx: BaseAudioContext,
  wtId: string,
  customWt: Ts666CustomWavetable | undefined,
  wtPos: number,
  warp1Mode: Ts666WarpMode,
  warp1Amt: number,
  warp2Mode: Ts666WarpMode,
  warp2Amt: number,
  phaseDeg: number
): PeriodicWave {
  let map = periodicCache.get(ctx);
  if (!map) {
    map = new Map();
    periodicCache.set(ctx, map);
  }
  const qPos = Math.round(wtPos * 40);
  const qW1 = Math.round(warp1Amt * 32);
  const qW2 = Math.round(warp2Amt * 32);
  const qPh = Math.round((((phaseDeg % 360) + 360) % 360) / 8);
  const customSig =
    wtId === 'custom' && customWt
      ? `${customWt.name}-${Math.round((customWt.frames[0]?.imag?.[1] ?? 1) * 100)}`
      : '';
  const key = `${wtId}:${customSig}:${qPos}:${warp1Mode}:${qW1}:${warp2Mode}:${qW2}:${qPh}`;

  const hit = map.get(key);
  if (hit) return hit;

  const frames = getWavetableFrames(wtId, customWt);
  const cycle = evaluateTs666Cycle(
    frames,
    qPos / 40,
    warp1Mode,
    qW1 / 32,
    warp2Mode,
    qW2 / 32,
    qPh * 8
  );
  const pw = buildPeriodicWaveFromCycle(ctx, cycle);

  if (map.size > 350) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
  map.set(key, pw);
  return pw;
}

/**
 * Compile a PeriodicWave for Spectral mode with formant smear (grainSize),
 * harmonic comb sparsity (density), and spectral harmonic stretching (warps).
 */
export function getSpectralPeriodicWave(
  ctx: BaseAudioContext,
  wtId: string,
  customWt: Ts666CustomWavetable | undefined,
  wtPos: number,
  grainSize: number,
  density: number,
  warp1Mode: Ts666WarpMode,
  warp1Amt: number,
  phaseDeg: number
): PeriodicWave {
  let map = periodicCache.get(ctx);
  if (!map) {
    map = new Map();
    periodicCache.set(ctx, map);
  }
  const qPos = Math.round(wtPos * 32);
  const qGs = Math.round(grainSize * 60);
  const qDen = Math.round(density * 24);
  const qW1 = Math.round(warp1Amt * 24);
  const qPh = Math.round((((phaseDeg % 360) + 360) % 360) / 12);
  const key = `spec:${wtId}:${qPos}:${qGs}:${qDen}:${warp1Mode}:${qW1}:${qPh}`;
  const hit = map.get(key);
  if (hit) return hit;

  const frames = getWavetableFrames(wtId, customWt);
  const baseCycle = evaluateTs666Cycle(
    frames,
    qPos / 32,
    warp1Mode,
    qW1 / 24,
    'none',
    0,
    qPh * 12
  );

  // Extract base spectrum then apply spectral blurring & comb filtering
  const N = baseCycle.length;
  const mags = new Float32Array(HARMONICS + 1);
  const phases = new Float32Array(HARMONICS + 1);

  for (let k = 1; k <= HARMONICS; k++) {
    let re = 0;
    let im = 0;
    const step = (2 * Math.PI * k) / N;
    for (let n = 0; n < N; n++) {
      re += baseCycle[n] * Math.cos(step * n);
      im += baseCycle[n] * Math.sin(step * n);
    }
    re = (2 * re) / N;
    im = (2 * im) / N;
    mags[k] = Math.hypot(re, im);
    phases[k] = Math.atan2(im, re);
  }

  const smearRadius = 0.5 + (grainSize / 0.3) * 4.5;
  const combFreq = 0.25 + density * 2.4;
  const real = new Float32Array(HARMONICS + 1);
  const imag = new Float32Array(HARMONICS + 1);

  for (let k = 1; k <= HARMONICS; k++) {
    let blurred = 0;
    let wSum = 0;
    for (let j = Math.max(1, k - 4); j <= Math.min(HARMONICS, k + 4); j++) {
      const w = Math.exp(-Math.pow((j - k) / smearRadius, 2));
      blurred += mags[j] * w;
      wSum += w;
    }
    const amp = (blurred / Math.max(1e-5, wSum)) * (0.45 + 0.55 * Math.cos(k * combFreq));
    real[k] = amp * Math.cos(phases[k]);
    imag[k] = amp * Math.sin(phases[k]);
  }
  // Always keep strong clean fundamental in spectral mode for solid low end
  real[1] = Math.max(real[1], 0.35);

  const pw = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  if (map.size > 350) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
  map.set(key, pw);
  return pw;
}

// =========================================================================
// SAMPLE, MULTISAMPLE, & NOISE AUDIO BUFFER GENERATORS
// =========================================================================

const sampleCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

function seededNoise(seed: number): () => number {
  let s = seed | 0 || 1234567;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296 - 0.5;
  };
}

export function getOrBuildTs666SampleBuffer(
  ctx: BaseAudioContext,
  sampleId: Exclude<Ts666SampleId, 'custom'>,
  pitchOverrideMidi?: number
): AudioBuffer {
  let map = sampleCache.get(ctx);
  if (!map) {
    map = new Map();
    sampleCache.set(ctx, map);
  }
  const key = `smp:${sampleId}:${pitchOverrideMidi ?? 0}`;
  const hit = map.get(key);
  if (hit) return hit;

  const sr = ctx.sampleRate;
  const dur = 2.4;
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(2, len, sr);
  const left = buf.getChannelData(0);
  const right = buf.getChannelData(1);

  const rootMidi =
    pitchOverrideMidi ??
    (TS666_SAMPLES.find((s) => s.id === sampleId)?.rootMidi ?? 36);
  const f0 = 440 * Math.pow(2, (rootMidi - 69) / 12);

  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let l = 0;
    let r = 0;

    if (sampleId === 'finger_bass') {
      const bright = Math.exp(-t * 3.8);
      const decay = Math.exp(-t * 0.55);
      const body = Math.sin(2 * Math.PI * f0 * t);
      const harm2 = Math.sin(4 * Math.PI * f0 * t) * (0.45 * bright + 0.15);
      const harm3 = Math.sin(6 * Math.PI * f0 * t) * 0.25 * bright;
      const pluck = Math.sin(8 * Math.PI * f0 * t) * 0.15 * Math.exp(-t * 18);
      l = Math.tanh((body + harm2 + harm3 + pluck) * 1.15) * decay * 0.85;
      r = l;
    } else if (sampleId === 'analog_bass_c2') {
      const sawL =
        bandlimitedSaw((f0 * t) % 1, 20) * 0.5 +
        bandlimitedSaw((f0 * 1.004 * t) % 1, 18) * 0.5;
      const sawR =
        bandlimitedSaw((f0 * t) % 1, 20) * 0.5 +
        bandlimitedSaw((f0 * 0.996 * t) % 1, 18) * 0.5;
      const sub = Math.sin(2 * Math.PI * f0 * t) * 0.45;
      l = (sawL * 0.55 + sub) * 0.75;
      r = (sawR * 0.55 + sub) * 0.75;
    } else if (sampleId === 'sub_808') {
      const pitchSweep = f0 * (1 + 1.8 * Math.exp(-t * 34));
      const phase = 2 * Math.PI * (f0 * t + (f0 * 1.8 * (1 - Math.exp(-t * 34))) / 34);
      const amp = Math.exp(-t * 0.85);
      void pitchSweep;
      l = Math.tanh(Math.sin(phase) * 1.25) * amp * 0.9;
      r = l;
    } else if (sampleId === 'warm_keys') {
      const env = Math.exp(-t * 1.1);
      const tine = Math.sin(2 * Math.PI * f0 * 7 * t) * 0.22 * Math.exp(-t * 16);
      l =
        (Math.sin(2 * Math.PI * f0 * t) * 0.7 +
          Math.sin(2 * Math.PI * f0 * 2 * t) * 0.25 +
          tine) *
        env;
      r =
        (Math.sin(2 * Math.PI * f0 * t + 0.08) * 0.7 +
          Math.sin(2 * Math.PI * f0 * 2 * t) * 0.25 +
          tine) *
        env;
    } else if (sampleId === 'choir_ah') {
      const swell = Math.min(1, t * 6);
      l =
        (Math.sin(2 * Math.PI * f0 * t) * 0.65 +
          Math.sin(2 * Math.PI * f0 * 3 * t) * 0.28 +
          Math.sin(2 * Math.PI * f0 * 5 * t) * 0.16) *
        swell *
        0.75;
      r =
        (Math.sin(2 * Math.PI * f0 * 1.002 * t) * 0.65 +
          Math.sin(2 * Math.PI * f0 * 3.003 * t) * 0.28 +
          Math.sin(2 * Math.PI * f0 * 4.996 * t) * 0.16) *
        swell *
        0.75;
    } else {
      // pluck_string
      const env = Math.exp(-t * 1.9);
      const damp = Math.exp(-t * 7);
      l =
        (Math.sin(2 * Math.PI * f0 * t) * 0.6 +
          bandlimitedTriangle((f0 * t) % 1, 14) * 0.45 * damp) *
        env;
      r = l * 0.96;
    }

    // Smooth loop boundaries near end so looping sounds clean
    if (len - i < 256) {
      const fade = (len - i) / 256;
      l *= fade;
      r *= fade;
    }
    if (i < 64) {
      const fadeIn = i / 64;
      l *= fadeIn;
      r *= fadeIn;
    }

    left[i] = l;
    right[i] = r;
  }

  map.set(key, buf);
  return buf;
}

export interface MultisampleZone {
  rootMidi: number;
  buffer: AudioBuffer;
}

const MULTISAMPLE_ROOTS = [24, 36, 48, 60, 72];

export function getMultisampleZones(
  ctx: BaseAudioContext,
  msId: Ts666MultisampleId
): MultisampleZone[] {
  const sampleMap: Record<Ts666MultisampleId, Exclude<Ts666SampleId, 'custom'>> = {
    ms_clean_bass: 'finger_bass',
    ms_analog_brass: 'analog_bass_c2',
    ms_electric_piano: 'warm_keys',
    ms_upright_bass: 'pluck_string',
  };
  const baseSample = sampleMap[msId] ?? 'finger_bass';
  return MULTISAMPLE_ROOTS.map((rootMidi) => ({
    rootMidi,
    buffer: getOrBuildTs666SampleBuffer(ctx, baseSample, rootMidi),
  }));
}

export function pickMultisampleZone(
  zones: MultisampleZone[],
  targetMidi: number
): MultisampleZone {
  let best = zones[0];
  let bestDist = Infinity;
  for (const z of zones) {
    const d = Math.abs(z.rootMidi - targetMidi);
    if (d < bestDist) {
      bestDist = d;
      best = z;
    }
  }
  return best;
}

export function getOrBuildTs666NoiseBuffer(
  ctx: BaseAudioContext,
  noiseId: Exclude<Ts666NoiseSampleId, 'custom'>
): AudioBuffer {
  let map = sampleCache.get(ctx);
  if (!map) {
    map = new Map();
    sampleCache.set(ctx, map);
  }
  const key = `noise:${noiseId}`;
  const hit = map.get(key);
  if (hit) return hit;

  const sr = ctx.sampleRate;
  const len = sr * 3;
  const buf = ctx.createBuffer(2, len, sr);
  const randL = seededNoise(1337 + noiseId.length * 97);
  const randR = seededNoise(9973 + noiseId.length * 53);

  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const rnd = ch === 0 ? randL : randR;
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let lastBrown = 0;
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd() * 2;
      let val = w;
      if (noiseId === 'pink') {
        b0 = 0.997 * b0 + w * 0.029;
        b1 = 0.985 * b1 + w * 0.032;
        b2 = 0.950 * b2 + w * 0.048;
        val = (b0 + b1 + b2 + w * 0.18) * 1.4;
      } else if (noiseId === 'brown') {
        lastBrown = (lastBrown + 0.025 * w) / 1.025;
        val = lastBrown * 3.2;
      } else if (noiseId === 'tape_hiss') {
        const hp = w - prev * 0.65;
        prev = w;
        val = hp * 0.38;
      } else if (noiseId === 'vinyl_crackle') {
        const dust = Math.abs(w) > 0.97 ? w * 2.2 : w * 0.06;
        lastBrown = (lastBrown + 0.04 * w) / 1.04;
        val = dust + lastBrown * 0.65;
      } else if (noiseId === 'air_breath') {
        b0 = 0.88 * b0 + w * 0.14;
        val = (w * 0.45 - b0 * 0.3) * 0.9;
      } else if (noiseId === 'metallic_dust') {
        const hp = w - prev * 0.9;
        prev = w;
        const t = i / sr;
        val = hp * 0.45 + Math.sin(2 * Math.PI * (3400 + (i % 13) * 190) * t) * 0.08;
      }
      data[i] = Math.max(-0.95, Math.min(0.95, val * 0.55));
    }
  }
  map.set(key, buf);
  return buf;
}

/**
 * Pure math filter frequency response plotter for Dual Filter SVG canvas.
 */
export function computeFilterCurveGain(
  type: Ts666FilterTypeId,
  cutoffHz: number,
  resonance: number,
  fat: number,
  freqHz: number
): number {
  const ratio = freqHz / Math.max(20, cutoffHz);
  const q = Math.max(0.5, resonance);
  const logR = Math.log2(Math.max(0.01, ratio));

  switch (type) {
    case 'lp12': {
      const denom = Math.sqrt(Math.pow(1 - ratio * ratio, 2) + Math.pow(ratio / q, 2));
      return Math.min(3.5, 1 / Math.max(0.08, denom));
    }
    case 'lp24': {
      const single = 1 / Math.max(0.08, Math.sqrt(Math.pow(1 - ratio * ratio, 2) + Math.pow(ratio / q, 2)));
      return Math.min(4.0, single * single * 0.85 + 0.15 * single);
    }
    case 'hp12': {
      const denom = Math.sqrt(Math.pow(1 - ratio * ratio, 2) + Math.pow(ratio / q, 2));
      return Math.min(3.5, (ratio * ratio) / Math.max(0.08, denom));
    }
    case 'hp24': {
      const s = (ratio * ratio) / Math.max(0.08, Math.sqrt(Math.pow(1 - ratio * ratio, 2) + Math.pow(ratio / q, 2)));
      return Math.min(4.0, s * s);
    }
    case 'bp12':
    case 'bp24': {
      const num = ratio / q;
      const denom = Math.sqrt(Math.pow(1 - ratio * ratio, 2) + Math.pow(num, 2));
      const mag = (ratio / Math.max(0.2, denom)) * Math.min(2.5, Math.sqrt(q));
      return type === 'bp24' ? mag * mag * 0.7 : mag;
    }
    case 'notch': {
      const num = Math.abs(1 - ratio * ratio);
      const denom = Math.sqrt(num * num + Math.pow(ratio / q, 2));
      return Math.max(0.08, num / Math.max(0.08, denom));
    }
    case 'low_shelf':
      return 1 + (ratio < 1 ? 0.65 * (1 - ratio) : 0);
    case 'high_shelf':
      return 1 + (ratio > 1 ? 0.65 * Math.min(1, ratio - 1) : 0);
    case 'peak':
      return 1 + Math.exp(-Math.pow(logR * q * 0.45, 2)) * 1.4;
    case 'multi_lp_hp': {
      const lp = computeFilterCurveGain('lp12', cutoffHz * 1.6, q * 0.7, fat, freqHz);
      const hp = computeFilterCurveGain('hp12', Math.max(25, cutoffHz * (0.28 + fat * 0.4)), q * 0.7, fat, freqHz);
      return lp * hp;
    }
    case 'multi_notch_lp': {
      const n = computeFilterCurveGain('notch', Math.max(40, cutoffHz * (0.5 + fat * 0.4)), q, fat, freqHz);
      const lp = computeFilterCurveGain('lp12', cutoffHz, q * 0.8, fat, freqHz);
      return n * lp;
    }
    case 'multi_formant':
    case 'multi_vowel': {
      const p1 = Math.exp(-Math.pow((logR + 0.5) * 2.2, 2)) * (0.9 + q * 0.12);
      const p2 = Math.exp(-Math.pow((logR - 0.6) * 2.5, 2)) * (0.8 + fat * 0.6);
      return 0.45 + p1 + p2;
    }
    case 'flange_plus':
    case 'flange_minus':
    case 'flange_allpass': {
      const period = (freqHz / Math.max(60, cutoffHz * 0.35)) * Math.PI * 2;
      const sign = type === 'flange_minus' ? -1 : 1;
      const depth = 0.45 + Math.min(0.45, q * 0.04);
      return Math.max(0.15, 1 + sign * depth * Math.cos(period));
    }
    case 'comb_plus':
    case 'comb_minus':
    case 'comb_karplus': {
      const combPeriod = (freqHz / Math.max(40, cutoffHz * 0.25)) * Math.PI * 2;
      const fb = Math.min(0.85, 0.35 + q * 0.04);
      const sign = type === 'comb_minus' ? -1 : 1;
      return Math.min(2.8, 0.65 / Math.max(0.25, 1 - sign * fb * Math.cos(combPeriod)));
    }
    case 'diff_allpass':
    case 'diff_smear':
      return 0.92 + 0.2 * Math.sin(logR * (3 + fat * 5));
    case 'misc_sh':
      return (ratio < 1 ? 1.0 : Math.max(0.15, 1 / Math.pow(ratio, 1.4))) * (0.85 + 0.25 * Math.sin(freqHz / 180));
    case 'misc_ring':
      return 0.7 + 0.55 * Math.cos(logR * Math.PI * (1 + fat * 2));
    case 'misc_tilt':
      return Math.max(0.25, Math.min(2.2, 1 + (fat - 0.5) * 1.4 * Math.tanh(logR)));
    default:
      return 1;
  }
}
