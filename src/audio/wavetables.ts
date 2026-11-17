import type {
  LfoPresetShape,
  LfoSyncDivision,
  WarpMode,
  WavetableId,
} from '../types/synth';

export interface WavetableDefinition {
  id: WavetableId;
  name: string;
  shortName: string;
  description: string;
  frames: { real: Float32Array; imag: Float32Array }[];
}

const HARMONICS = 48;
const FRAME_COUNT = 16;

function createEmptyFrame(): { real: Float32Array; imag: Float32Array } {
  return {
    real: new Float32Array(HARMONICS + 1),
    imag: new Float32Array(HARMONICS + 1),
  };
}

function normalizeFrame(frame: { real: Float32Array; imag: Float32Array }): void {
  let energy = 0;
  for (let i = 1; i <= HARMONICS; i++) {
    energy += frame.real[i] * frame.real[i] + frame.imag[i] * frame.imag[i];
  }
  const scale = energy > 0 ? 0.72 / Math.sqrt(energy) : 1;
  for (let i = 1; i <= HARMONICS; i++) {
    frame.real[i] *= scale;
    frame.imag[i] *= scale;
  }
}

function buildWavetable(
  id: WavetableId,
  name: string,
  shortName: string,
  description: string,
  builder: (frameIdx: number, t: number, imag: Float32Array, real: Float32Array) => void
): WavetableDefinition {
  const frames: { real: Float32Array; imag: Float32Array }[] = [];
  for (let f = 0; f < FRAME_COUNT; f++) {
    const frame = createEmptyFrame();
    const t = f / (FRAME_COUNT - 1);
    builder(f, t, frame.imag, frame.real);
    normalizeFrame(frame);
    frames.push(frame);
  }
  return { id, name, shortName, description, frames };
}

export const WAVETABLES: Record<WavetableId, WavetableDefinition> = {
  basic_shapes: buildWavetable(
    'basic_shapes',
    'Basic Shapes (Clean Bass)',
    'BASIC',
    'Ultra-clean Sine, Triangle, Sawtooth & Square with zero metallic ringing',
    (f, _t, imag) => {
      // Exact clean landmarks across 16 frames:
      // 0..3 -> Sine, 4..7 -> Triangle, 8..11 -> Clean Saw, 12..15 -> Clean Square
      const lanczos = (n: number): number => {
        const arg = (Math.PI * n) / (HARMONICS + 1);
        return Math.sin(arg) / arg;
      };
      const evalShape = (kind: 0 | 1 | 2 | 3, n: number): number => {
        if (kind === 0) return n === 1 ? 1 : 0; // Pure Sine
        const sigma = lanczos(n);
        if (kind === 1) {
          return n % 2 === 1 ? ((Math.pow(-1, (n - 1) / 2) * 1.15) / (n * n)) * sigma : 0;
        }
        if (kind === 2) {
          return (1 / n) * sigma;
        }
        return n % 2 === 1 ? (1 / n) * sigma : 0;
      };

      const sector = Math.min(3, Math.floor(f / 4)) as 0 | 1 | 2 | 3;
      if (f === 0) {
        // Pure fundamental Sine with zero upper harmonics
        imag[1] = 1;
        return;
      }
      if (f === 5) {
        for (let n = 1; n <= HARMONICS; n++) imag[n] = evalShape(1, n);
        return;
      }
      if (f === 10) {
        for (let n = 1; n <= HARMONICS; n++) imag[n] = evalShape(2, n);
        return;
      }
      if (f === 15) {
        for (let n = 1; n <= HARMONICS; n++) imag[n] = evalShape(3, n);
        return;
      }

      // Smooth linear morph between landmark frames: 0 -> 5 -> 10 -> 15
      let a: 0 | 1 | 2 | 3 = 0;
      let b: 0 | 1 | 2 | 3 = 1;
      let mix = 0;
      if (f < 5) {
        a = 0;
        b = 1;
        mix = f / 5;
      } else if (f < 10) {
        a = 1;
        b = 2;
        mix = (f - 5) / 5;
      } else {
        a = 2;
        b = 3;
        mix = (f - 10) / 5;
      }
      void sector;
      for (let n = 1; n <= HARMONICS; n++) {
        imag[n] = evalShape(a, n) * (1 - mix) + evalShape(b, n) * mix;
      }
    }
  ),

  analog_classic: buildWavetable(
    'analog_classic',
    'Analog Classic',
    'ANALOG',
    'Morphs Sine → Triangle → Saw → Square',
    (_f, t, imag) => {
      for (let n = 1; n <= HARMONICS; n++) {
        const arg = (Math.PI * n) / (HARMONICS + 1);
        const sigma = Math.sin(arg) / arg;
        const sine = n === 1 ? 1 : 0;
        const tri = n % 2 === 1 ? ((Math.pow(-1, (n - 1) / 2) * 1.2) / (n * n)) * sigma : 0;
        const saw = (1 / n) * sigma;
        const sq = n % 2 === 1 ? (1 / n) * sigma : 0;
        if (t < 0.333) {
          const k = t / 0.333;
          imag[n] = sine * (1 - k) + tri * k;
        } else if (t < 0.666) {
          const k = (t - 0.333) / 0.333;
          imag[n] = tri * (1 - k) + saw * k;
        } else {
          const k = (t - 0.666) / 0.334;
          imag[n] = saw * (1 - k) + sq * k;
        }
      }
    }
  ),

  monster_growl: buildWavetable(
    'monster_growl',
    'Monster Growl',
    'GROWL',
    'Heavy Dubstep dual-formant throat & harmonic growl',
    (_f, t, imag, real) => {
      const f1 = 2 + t * 8.5;
      const f2 = 6 + Math.sin(t * Math.PI * 1.5) * 10 + t * 10;
      for (let n = 1; n <= HARMONICS; n++) {
        const formant1 = Math.exp(-Math.pow((n - f1) / 2.1, 2));
        const formant2 = 0.85 * Math.exp(-Math.pow((n - f2) / 3.0, 2));
        const grit = (n % 2 === 1 ? 1 : 0.65) / Math.pow(n, 0.55);
        imag[n] = grit * (0.25 + 1.9 * formant1 + 1.4 * formant2);
        real[n] = Math.sin(n * 0.4 + t * 5) * formant2 * 0.45;
      }
    }
  ),

  tearout_screech: buildWavetable(
    'tearout_screech',
    'Tearout Screech',
    'TEAROUT',
    'Aggressive metallic FM upper harmonics & phase-folded bite',
    (_f, t, imag, real) => {
      const modIdx = 1.2 + t * 11;
      for (let n = 1; n <= HARMONICS; n++) {
        const fold = Math.sin(n * 0.85 + modIdx * 0.9);
        const upperBoost = n > 6 ? 1 + t * 1.4 : 0.9;
        imag[n] = (fold / Math.pow(n, 0.48)) * upperBoost;
        real[n] = Math.cos(n * 1.3 - modIdx) * (0.45 / Math.pow(n, 0.55));
      }
    }
  ),

  riddim_square: buildWavetable(
    'riddim_square',
    'Riddim Square',
    'RIDDIM',
    'Hollow square comb-resonant harmonics for Riddim quarter-note chops',
    (_f, t, imag) => {
      const combFreq = 2.2 + t * 16;
      for (let n = 1; n <= HARMONICS; n++) {
        const sq = n % 2 === 1 ? 1 / n : 0.28 * t / n;
        const comb = 0.35 + 0.95 * Math.abs(Math.sin((n / combFreq) * Math.PI));
        imag[n] = sq * comb;
      }
    }
  ),

  reese_crush: buildWavetable(
    'reese_crush',
    'Reese Crush',
    'REESE',
    'Phase-smeared sub-saw morphing into saturated midrange roar',
    (_f, t, imag, real) => {
      for (let n = 1; n <= HARMONICS; n++) {
        const saw = 1 / Math.pow(n, 0.85 - t * 0.25);
        const notch = 1 - 0.7 * Math.exp(-Math.pow((n - (4 + t * 14)) / 2.5, 2));
        imag[n] = saw * notch * Math.cos(t * n * 0.22);
        real[n] = saw * Math.sin(t * n * 0.35) * 0.55;
      }
    }
  ),

  pwm_sweep: buildWavetable(
    'pwm_sweep',
    'PWM Pulse Sweep',
    'PWM',
    'Pulse-width modulation from 50% square to razor thin pulse',
    (_f, t, imag) => {
      const duty = 0.5 - t * 0.43;
      for (let n = 1; n <= HARMONICS; n++) {
        imag[n] =
          (2 / (n * Math.PI)) *
          Math.sin(Math.PI * n * duty) *
          (1 - (n / (HARMONICS + 6)) * 0.35);
      }
    }
  ),

  formant_vocal: buildWavetable(
    'formant_vocal',
    'Formant Vocal',
    'VOCAL',
    'Resonant vowel formant peaks sweeping Ooo → Aah → Eee',
    (_f, t, imag) => {
      const f1 = 2.5 + t * 5.5;
      const f2 = 7 + t * 14;
      for (let n = 1; n <= HARMONICS; n++) {
        const peak1 = Math.exp(-Math.pow((n - f1) / 2.2, 2));
        const peak2 = 0.75 * Math.exp(-Math.pow((n - f2) / 3.2, 2));
        imag[n] = (1 / Math.sqrt(n)) * (0.35 + peak1 * 1.6 + peak2 * 1.2);
      }
    }
  ),

  fm_metallic: buildWavetable(
    'fm_metallic',
    'FM Metallic',
    'FM MTL',
    'Cross-modulated Bessel sidebands from warm bell to grit',
    (_f, t, imag, real) => {
      const modIndex = 0.4 + t * 7.5;
      for (let n = 1; n <= HARMONICS; n++) {
        const env = Math.exp(-n / (3 + modIndex * 3.5));
        const besselApprox = Math.cos(n * 1.15 - modIndex * 0.8) * env;
        imag[n] = besselApprox * (n % 2 === 0 ? 0.65 : 1.0);
        real[n] = Math.sin(n * 0.7 + modIndex) * env * 0.35 * t;
      }
    }
  ),

  acid_saw: buildWavetable(
    'acid_saw',
    'Acid Harmonic',
    'ACID',
    'Saturated sawtooth with resonant harmonic bump',
    (_f, t, imag) => {
      const resCenter = 3 + t * 22;
      for (let n = 1; n <= HARMONICS; n++) {
        const bump = 1 + 2.8 * Math.exp(-Math.pow((n - resCenter) / 2.5, 2));
        const rolloff = Math.exp(-n / (18 + t * 26));
        imag[n] = (1 / n) * bump * rolloff;
      }
    }
  ),

  sub_harmonic: buildWavetable(
    'sub_harmonic',
    'Sub Weight',
    'SUB WT',
    'Fundamental-heavy sub wave adding upper octave grit',
    (_f, t, imag) => {
      for (let n = 1; n <= HARMONICS; n++) {
        if (n === 1) {
          imag[n] = 1.4;
        } else if (n === 2) {
          imag[n] = 0.25 + t * 0.75;
        } else if (n === 3) {
          imag[n] = t * 0.55;
        } else {
          imag[n] = (t * t * 0.45) / n;
        }
      }
    }
  ),

  glass_bell: buildWavetable(
    'glass_bell',
    'Glass Bell',
    'BELL',
    'Crystalline odd-harmonic chime with airy shimmer',
    (_f, t, imag, real) => {
      for (let n = 1; n <= HARMONICS; n++) {
        const isBellPartial =
          n === 1 || n === 2 || n === 4 || n === 7 || n === 11 || n === 16 || n === 23;
        const base = isBellPartial ? 1 / Math.pow(n, 0.65) : (t * 0.14) / n;
        imag[n] = base * (0.4 + 0.6 * t);
        if (n === 1) imag[n] = 1.0;
        real[n] = isBellPartial && n > 2 ? 0.22 * t : 0;
      }
    }
  ),

  modern_talking: buildWavetable(
    'modern_talking',
    'Modern Talking',
    'MOD TALK',
    'Classic nasal FM vowel formant sweep (Yoi → Yah → Eee) for dubstep talking bass',
    (_f, t, imag, real) => {
      const f1 = 3.2 + Math.sin(t * Math.PI * 1.1) * 4.5 + t * 2.5;
      const f2 = 9.0 + t * 14.0;
      const f3 = 18.0 - t * 6.0;
      for (let n = 1; n <= HARMONICS; n++) {
        const p1 = 2.1 * Math.exp(-Math.pow((n - f1) / 1.8, 2));
        const p2 = 1.65 * Math.exp(-Math.pow((n - f2) / 2.4, 2));
        const p3 = 0.9 * Math.exp(-Math.pow((n - f3) / 3.0, 2));
        const fmBuzz = Math.cos(n * (0.9 + t * 1.4)) * 0.45 + 0.55;
        imag[n] = ((0.18 + p1 + p2 + p3) * fmBuzz) / Math.pow(n, 0.42);
        real[n] = Math.sin(n * 1.1 + t * 6.2) * (p1 + p2) * 0.35;
      }
    }
  ),

  riddim_clang: buildWavetable(
    'riddim_clang',
    'Riddim Clang',
    'CLANG',
    'Metallic inharmonic square/ring partials for DJ ROI style trench riddim',
    (_f, t, imag, real) => {
      const ringCenter = 4 + t * 18;
      for (let n = 1; n <= HARMONICS; n++) {
        const oddBoost = n % 2 === 1 ? 1.0 : 0.48 * t;
        const metallicRing = 0.3 + 1.4 * Math.abs(Math.sin(n * (0.65 + t * 0.85)));
        const peak = 1.2 * Math.exp(-Math.pow((n - ringCenter) / 3.2, 2));
        imag[n] = (oddBoost * metallicRing + peak) / Math.pow(n, 0.52);
        real[n] = Math.cos(n * (1.7 + t * 2.4)) * (0.42 / Math.pow(n, 0.58));
      }
    }
  ),

  robot_vowel: buildWavetable(
    'robot_vowel',
    'Robot Vowel',
    'ROBOT',
    'Hard-edged robotic throat formants with metallic FM upper sidebands',
    (_f, t, imag, real) => {
      const f1 = 2.8 + t * 6.2;
      const f2 = 10.5 + Math.cos(t * Math.PI * 2) * 4.5 + t * 6.0;
      for (let n = 1; n <= HARMONICS; n++) {
        const v1 = 1.8 * Math.exp(-Math.pow((n - f1) / 1.9, 2));
        const v2 = 1.5 * Math.exp(-Math.pow((n - f2) / 2.2, 2));
        const stepHarm = n % 3 === 0 ? 1.25 : 0.75;
        imag[n] = ((0.22 + v1 + v2) * stepHarm) / Math.pow(n, 0.46);
        real[n] = Math.sin(n * 1.65 - t * 4.5) * (0.28 + v2 * 0.25);
      }
    }
  ),

  super_harmonic: buildWavetable(
    'super_harmonic',
    'Hyper Organ',
    'HYPER',
    'Stacked octave & fifth drawbar harmonics for lush leads',
    (_f, t, imag) => {
      const drawbars = [1, 2, 3, 4, 6, 8, 12, 16, 24];
      for (let n = 1; n <= HARMONICS; n++) {
        const match = drawbars.includes(n);
        const upperFade = n <= 4 ? 1 : t;
        imag[n] = match ? (0.9 / Math.pow(n, 0.45)) * upperFade : (0.12 * t) / n;
      }
    }
  ),
};

export const WAVETABLE_LIST: WavetableDefinition[] = Object.values(WAVETABLES);

function applyPhaseWarp(phase01: number, mode: WarpMode, amount: number): number {
  const a = Math.max(0, Math.min(1, amount));
  if (mode === 'none' || a < 0.005) return phase01;

  switch (mode) {
    case 'bend+': {
      const exp = 1 + a * 3.2;
      return Math.pow(phase01, exp);
    }
    case 'bend-': {
      const exp = 1 / (1 + a * 3.2);
      return Math.pow(phase01, exp);
    }
    case 'sync': {
      const mult = 1 + a * 5.0;
      return (phase01 * mult) % 1;
    }
    case 'pwm': {
      const split = 0.5 - a * 0.42;
      if (phase01 < split) return (phase01 / Math.max(0.05, split)) * 0.5;
      return 0.5 + ((phase01 - split) / Math.max(0.05, 1 - split)) * 0.5;
    }
    case 'fm': {
      const mod = Math.sin(phase01 * Math.PI * 2 * 2) * a * 0.35;
      return ((phase01 + mod) % 1 + 1) % 1;
    }
    default:
      return phase01;
  }
}

const DFT_N = 256;
const DFT_HARMONICS = 48;
const DFT_COS_LUT = new Float32Array((DFT_HARMONICS + 1) * DFT_N);
const DFT_SIN_LUT = new Float32Array((DFT_HARMONICS + 1) * DFT_N);
const EVAL_SAMPLE_LUT = new Map<number, { cos: Float32Array; sin: Float32Array }>();
const cycleEvalCache = new Map<string, Float32Array>();

for (let k = 1; k <= DFT_HARMONICS; k++) {
  const rowOffset = k * DFT_N;
  const stepAngle = (2 * Math.PI * k) / DFT_N;
  for (let n = 0; n < DFT_N; n++) {
    const ang = stepAngle * n;
    DFT_COS_LUT[rowOffset + n] = Math.cos(ang);
    DFT_SIN_LUT[rowOffset + n] = Math.sin(ang);
  }
}

function getUnwarpedSampleLut(sampleCount: number): { cos: Float32Array; sin: Float32Array } {
  let entry = EVAL_SAMPLE_LUT.get(sampleCount);
  if (entry) return entry;
  const cos = new Float32Array((HARMONICS + 1) * sampleCount);
  const sin = new Float32Array((HARMONICS + 1) * sampleCount);
  for (let n = 1; n <= HARMONICS; n++) {
    const rowOff = n * sampleCount;
    const step = (2 * Math.PI * n) / sampleCount;
    for (let s = 0; s < sampleCount; s++) {
      const ang = step * s;
      cos[rowOff + s] = Math.cos(ang);
      sin[rowOff + s] = Math.sin(ang);
    }
  }
  entry = { cos, sin };
  EVAL_SAMPLE_LUT.set(sampleCount, entry);
  return entry;
}

/**
 * Evaluates a single waveform cycle [-1..1] at phase [0..1] including real-time Warp deformation.
 */
export function evaluateWavetableCycle(
  id: WavetableId,
  wtPosition: number,
  sampleCount = 96,
  warpMode: WarpMode = 'none',
  warpAmount = 0
): Float32Array {
  const clampedPos = Math.max(0, Math.min(1, wtPosition));
  const clampedWarp = Math.max(0, Math.min(1, warpAmount));
  const isUnwarped = warpMode === 'none' || clampedWarp < 0.005;

  const qPos = Math.round(clampedPos * 64);
  const qWarp = isUnwarped ? 0 : Math.round(clampedWarp * 40);
  const cacheKey = `${id}:${sampleCount}:${qPos}:${isUnwarped ? 'none' : warpMode}:${qWarp}`;
  const cached = cycleEvalCache.get(cacheKey);
  if (cached) return cached;

  const def = WAVETABLES[id] ?? WAVETABLES.analog_classic;
  const evalPos = qPos / 64;
  const evalWarp = qWarp / 40;
  const scaled = evalPos * (def.frames.length - 1);
  const idx0 = Math.floor(scaled);
  const idx1 = Math.min(def.frames.length - 1, idx0 + 1);
  const frac = scaled - idx0;
  const invFrac = 1 - frac;

  const f0 = def.frames[idx0];
  const f1 = def.frames[idx1];
  const out = new Float32Array(sampleCount);

  // Pre-interpolate active harmonics once per call instead of inner sampleCount * harmonics loop
  const activeN: number[] = [];
  const activeR = new Float32Array(HARMONICS + 1);
  const activeIm = new Float32Array(HARMONICS + 1);
  for (let n = 1; n <= HARMONICS; n++) {
    const r = f0.real[n] * invFrac + f1.real[n] * frac;
    const im = f0.imag[n] * invFrac + f1.imag[n] * frac;
    if (Math.abs(r) > 0.0005 || Math.abs(im) > 0.0005) {
      activeN.push(n);
      activeR[n] = r;
      activeIm[n] = im;
    }
  }

  let maxAbs = 0.001;
  if (isUnwarped) {
    const lut = getUnwarpedSampleLut(sampleCount);
    for (let s = 0; s < sampleCount; s++) {
      let sum = 0;
      for (let idx = 0; idx < activeN.length; idx++) {
        const n = activeN[idx];
        const lutIdx = n * sampleCount + s;
        sum += activeR[n] * lut.cos[lutIdx] + activeIm[n] * lut.sin[lutIdx];
      }
      out[s] = sum;
      const a = Math.abs(sum);
      if (a > maxAbs) maxAbs = a;
    }
  } else {
    for (let s = 0; s < sampleCount; s++) {
      const rawPhase01 = s / sampleCount;
      const warped01 = applyPhaseWarp(rawPhase01, warpMode, evalWarp);
      const phase = warped01 * Math.PI * 2;
      let sum = 0;
      for (let idx = 0; idx < activeN.length; idx++) {
        const n = activeN[idx];
        sum += activeR[n] * Math.cos(n * phase) + activeIm[n] * Math.sin(n * phase);
      }
      out[s] = sum;
      const a = Math.abs(sum);
      if (a > maxAbs) maxAbs = a;
    }
  }

  const invMax = 1 / maxAbs;
  for (let s = 0; s < sampleCount; s++) {
    out[s] *= invMax;
  }

  if (cycleEvalCache.size > 512) {
    const first = cycleEvalCache.keys().next().value;
    if (first) cycleEvalCache.delete(first);
  }
  cycleEvalCache.set(cacheKey, out);
  return out;
}

/**
 * Generates an interpolated (and optionally phase-warped via DFT) PeriodicWave for Web Audio OscillatorNode.
 */
export function createInterpolatedPeriodicWave(
  ctx: BaseAudioContext,
  id: WavetableId,
  wtPosition: number,
  warpMode: WarpMode = 'none',
  warpAmount = 0
): PeriodicWave {
  const def = WAVETABLES[id] ?? WAVETABLES.analog_classic;
  const clampedPos = Math.max(0, Math.min(1, wtPosition));

  if (warpMode === 'none' || warpAmount < 0.02) {
    const scaled = clampedPos * (def.frames.length - 1);
    const idx0 = Math.floor(scaled);
    const idx1 = Math.min(def.frames.length - 1, idx0 + 1);
    const frac = scaled - idx0;

    const f0 = def.frames[idx0];
    const f1 = def.frames[idx1];
    const real = new Float32Array(HARMONICS + 1);
    const imag = new Float32Array(HARMONICS + 1);

    for (let n = 1; n <= HARMONICS; n++) {
      real[n] = f0.real[n] * (1 - frac) + f1.real[n] * frac;
      imag[n] = f0.imag[n] * (1 - frac) + f1.imag[n] * frac;
    }
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  // Compute DFT from warped time-domain cycle using precomputed trig LUTs
  const samples = evaluateWavetableCycle(id, clampedPos, DFT_N, warpMode, warpAmount);
  const real = new Float32Array(HARMONICS + 1);
  const imag = new Float32Array(HARMONICS + 1);
  const invHalfN = 2 / DFT_N;

  for (let k = 1; k <= DFT_HARMONICS; k++) {
    let re = 0;
    let im = 0;
    const rowOffset = k * DFT_N;
    for (let n = 0; n < DFT_N; n++) {
      const sample = samples[n];
      re += sample * DFT_COS_LUT[rowOffset + n];
      im += sample * DFT_SIN_LUT[rowOffset + n];
    }
    // Mild raised-cosine taper on top partials eliminates Gibbs ringing & foldback hiss
    const taper =
      k > 34 ? 0.5 + 0.5 * Math.cos(((k - 34) / (DFT_HARMONICS - 34)) * Math.PI) : 1;
    real[k] = re * invHalfN * taper;
    imag[k] = im * invHalfN * taper;
  }

  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

export const LFO_POINT_COUNT = 17;

export const LFO_SYNC_DIVISIONS: { id: LfoSyncDivision; label: string; beatsPerCycle: number }[] = [
  { id: '2/1', label: '2 Bars', beatsPerCycle: 8 },
  { id: '1/1', label: '1 Bar', beatsPerCycle: 4 },
  { id: '1/2', label: '1/2', beatsPerCycle: 2 },
  { id: '1/2d', label: '1/2D', beatsPerCycle: 3 },
  { id: '1/2t', label: '1/2T', beatsPerCycle: 4 / 3 },
  { id: '1/4', label: '1/4', beatsPerCycle: 1 },
  { id: '1/4d', label: '1/4D', beatsPerCycle: 1.5 },
  { id: '1/4t', label: '1/4T', beatsPerCycle: 2 / 3 },
  { id: '1/8', label: '1/8', beatsPerCycle: 0.5 },
  { id: '1/8d', label: '1/8D', beatsPerCycle: 0.75 },
  { id: '1/8t', label: '1/8T', beatsPerCycle: 1 / 3 },
  { id: '1/16', label: '1/16', beatsPerCycle: 0.25 },
  { id: '1/16t', label: '1/16T', beatsPerCycle: 1 / 6 },
  { id: '1/32', label: '1/32', beatsPerCycle: 0.125 },
];

export function divisionToHz(division: LfoSyncDivision, bpm: number): number {
  const found = LFO_SYNC_DIVISIONS.find((d) => d.id === division);
  const beats = found ? found.beatsPerCycle : 1;
  return (bpm / 60) / beats;
}

export function generateLfoPoints(shape: LfoPresetShape): number[] {
  const pts: number[] = [];
  for (let i = 0; i < LFO_POINT_COUNT; i++) {
    const t = i / (LFO_POINT_COUNT - 1); // 0..1
    switch (shape) {
      case 'sine':
        pts.push(Math.sin(t * Math.PI * 2));
        break;
      case 'triangle':
        pts.push(t < 0.25 ? t * 4 : t < 0.75 ? 2 - t * 4 : t * 4 - 4);
        break;
      case 'saw':
        pts.push(i === LFO_POINT_COUNT - 1 ? 1 : 1 - t * 2);
        break;
      case 'ramp':
        pts.push(i === LFO_POINT_COUNT - 1 ? -1 : -1 + t * 2);
        break;
      case 'square':
        pts.push(t < 0.5 ? 1 : -1);
        break;
      case 'wobble': {
        // Classic Dubstep bell wobble curve: smooth swell up, sharp punchy drop
        const bell = Math.sin(Math.pow(t, 0.75) * Math.PI);
        pts.push(bell * 2 - 1);
        break;
      }
      case 'riddim': {
        // Punchy Riddim chop envelope: instant peak, curved decay, silence tail
        if (t < 0.08) pts.push(t / 0.08 * 2 - 1);
        else if (t < 0.72) pts.push((1 - Math.pow((t - 0.08) / 0.64, 0.65)) * 2 - 1);
        else pts.push(-1);
        break;
      }
      case 'tearout': {
        // Double-peak tearout machine-gun LFO
        const subT = (t * 2) % 1;
        pts.push(Math.pow(1 - subT, 1.4) * 2 - 1);
        break;
      }
      case 'sh': {
        const steps = [0.8, 0.8, -0.5, -0.5, 0.35, 0.35, -0.9, -0.9, 0.95, 0.95, -0.2, -0.2, 0.55, 0.55, -0.65, -0.65, 0.8];
        pts.push(steps[i] ?? 0);
        break;
      }
      case 'custom':
      default:
        pts.push(Math.sin(t * Math.PI * 2));
        break;
    }
  }
  return pts;
}

export function evaluateLfoValue(points: number[], phase01: number, bipolar: boolean): number {
  const len = points.length;
  if (len === 0) return 0;
  const wrapped = ((phase01 % 1) + 1) % 1;
  const pos = wrapped * (len - 1);
  const idx0 = Math.floor(pos);
  const idx1 = Math.min(len - 1, idx0 + 1);
  const frac = pos - idx0;
  const val = points[idx0] * (1 - frac) + points[idx1] * frac; // -1..1
  return bipolar ? val : (val + 1) * 0.5;
}
