import { studioAudio } from '../StudioAudio';
import type {
  Ts666BusId,
  Ts666EnvelopeConfig,
  Ts666FilterCategory,
  Ts666FilterConfig,
  Ts666GrowlTelemetry,
  Ts666LfoConfig,
  Ts666LiveModOffsets,
  Ts666ModSource,
  Ts666ModTarget,
  Ts666Oversampling,
  Ts666Patch,
} from '../../types/ts666';
import { createCleanBassInit666 } from './ts666Presets';
import { Ts666ThreeBusFxEngine } from './ts666FxEngine';
import {
  getMultisampleZones,
  getOrBuildTs666NoiseBuffer,
  getOrBuildTs666SampleBuffer,
  getOrCreateTs666PeriodicWave,
  getSpectralPeriodicWave,
  midiToMicrotunedFreq,
  pickMultisampleZone,
  syncDivisionToHz,
} from './ts666Wavetables';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// =========================================================================
// PURE MATHEMATICAL EVALUATORS (ENV WITH HOLD+CURVE, 10 LFOs, MATRIX CURVES)
// =========================================================================

function applyPowerCurve(t01: number, curve: number): number {
  const x = clamp(t01, 0, 1);
  const exp = Math.pow(3.5, clamp(curve, -1, 1));
  return Math.pow(x, exp);
}

export function evaluateEnvelope666(
  env: Ts666EnvelopeConfig,
  elapsedSec: number,
  released: boolean,
  releaseElapsedSec: number,
  releaseStartLevel: number
): number {
  if (released) {
    const rel = Math.max(0.005, env.release);
    if (releaseElapsedSec >= rel) return 0;
    const norm = applyPowerCurve(releaseElapsedSec / rel, env.releaseCurve);
    return Math.max(0, releaseStartLevel * (1 - norm));
  }
  const atk = Math.max(0.002, env.attack);
  if (elapsedSec < atk) {
    return applyPowerCurve(elapsedSec / atk, env.attackCurve);
  }
  const hold = Math.max(0, env.hold);
  if (elapsedSec < atk + hold) {
    return 1;
  }
  const dec = Math.max(0.005, env.decay);
  const decElapsed = elapsedSec - atk - hold;
  if (decElapsed < dec) {
    const norm = applyPowerCurve(decElapsed / dec, env.decayCurve);
    return 1 - norm * (1 - clamp(env.sustain, 0, 1));
  }
  return clamp(env.sustain, 0, 1);
}

export function evaluateLfoShapePoint(lfo: Ts666LfoConfig, phase01: number): number {
  const pts = lfo.points;
  if (!pts || pts.length === 0) return 0;
  if (pts.length === 1) return pts[0];
  const p = ((phase01 % 1) + 1) % 1;
  const segCount = pts.length - 1;
  const scaled = p * segCount;
  const idx = Math.min(segCount - 1, Math.floor(scaled));
  const localT = scaled - idx;
  const y0 = pts[idx];
  const y1 = pts[idx + 1];
  const bend = lfo.bends?.[idx] ?? 0;

  let curvedT = localT;
  if (lfo.pathMode) {
    // Smooth tension + optional quadratic bend
    const smoothT = localT * localT * (3 - 2 * localT);
    const exp = Math.pow(3, clamp(bend, -1, 1));
    curvedT = Math.pow(smoothT, exp);
  } else {
    const exp = Math.pow(3, clamp(bend, -1, 1));
    curvedT = Math.pow(localT, exp);
  }
  return y0 + (y1 - y0) * curvedT;
}

export function applyModCurve666(val: number, curve: number): number {
  if (Math.abs(curve) < 0.01) return val;
  const sign = val < 0 ? -1 : 1;
  const abs = Math.min(1, Math.abs(val));
  const exp = Math.pow(3.0, clamp(-curve, -1, 1));
  return sign * Math.pow(abs, exp);
}

function computeFilterSaturationCurve(drive: number, isSH = false): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const amt = 1 + drive * 14;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    if (isSH) {
      const q = Math.max(3, Math.round(14 - drive * 10));
      curve[i] = Math.round(x * q) / q;
    } else {
      curve[i] = Math.tanh(x * amt) / Math.tanh(amt);
    }
  }
  return curve;
}

function createSubPulseWave(ctx: AudioContext): PeriodicWave {
  const harmonics = 24;
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  const pw = 0.28;
  for (let h = 1; h <= harmonics; h++) {
    imag[h] = (2 / (Math.PI * h)) * Math.sin(Math.PI * h * pw);
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

interface FilterUnitNodes {
  input: GainNode;
  output: GainNode;
  dryGain: GainNode;
  wetGain: GainNode;
  shaper: WaveShaperNode;
  bq1: BiquadFilterNode;
  bq2: BiquadFilterNode;
  delay: DelayNode;
  delayFb: GainNode;
  delayOut: GainNode;
  ap1: BiquadFilterNode;
  ap2: BiquadFilterNode;
  apOut: GainNode;
  bqChainOut: GainNode;
  panner: StereoPannerNode;
  lastModeSig: string;
  lastOs: OverSampleType;
  lastBq1Type: BiquadFilterType;
  lastBq2Type: BiquadFilterType;
  numCache: Record<string, number>;
}

function setTargetCached(
  cache: Record<string, number>,
  key: string,
  param: AudioParam,
  val: number,
  now: number,
  tau: number,
  eps = 0.0005
): void {
  const prev = cache[key];
  if (prev !== undefined && Math.abs(prev - val) <= eps) return;
  cache[key] = val;
  param.setTargetAtTime(val, now, tau);
}

function buildFilterUnitNodes(ctx: AudioContext, os: Ts666Oversampling): FilterUnitNodes {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.oversample = 'none';

  const bq1 = ctx.createBiquadFilter();
  const bq2 = ctx.createBiquadFilter();
  const bqChainOut = ctx.createGain();

  const delay = ctx.createDelay(0.08);
  const delayFb = ctx.createGain();
  const delayOut = ctx.createGain();
  delayOut.gain.value = 0;

  const ap1 = ctx.createBiquadFilter();
  const ap2 = ctx.createBiquadFilter();
  ap1.type = 'allpass';
  ap2.type = 'allpass';
  const apOut = ctx.createGain();
  apOut.gain.value = 0;

  const panner = ctx.createStereoPanner();

  input.connect(dryGain).connect(output);
  input.connect(shaper);
  shaper.connect(bq1).connect(bq2).connect(bqChainOut).connect(wetGain);
  shaper.connect(delay).connect(delayOut).connect(wetGain);
  delay.connect(delayFb).connect(delay);
  shaper.connect(ap1).connect(ap2).connect(apOut).connect(wetGain);
  wetGain.connect(panner).connect(output);

  void os;
  return {
    input,
    output,
    dryGain,
    wetGain,
    shaper,
    bq1,
    bq2,
    delay,
    delayFb,
    delayOut,
    ap1,
    ap2,
    apOut,
    bqChainOut,
    panner,
    lastModeSig: '',
    lastOs: 'none',
    lastBq1Type: 'lowpass',
    lastBq2Type: 'lowpass',
    numCache: {},
  };
}

function disconnectFilterUnitNodes(u: FilterUnitNodes): void {
  try {
    u.input.disconnect();
    u.dryGain.disconnect();
    u.shaper.disconnect();
    u.bq1.disconnect();
    u.bq2.disconnect();
    u.bqChainOut.disconnect();
    u.delay.disconnect();
    u.delayFb.disconnect();
    u.delayOut.disconnect();
    u.ap1.disconnect();
    u.ap2.disconnect();
    u.apOut.disconnect();
    u.wetGain.disconnect();
    u.panner.disconnect();
    u.output.disconnect();
  } catch {
    // ignore
  }
}

function updateFilterUnitNodes(
  unit: FilterUnitNodes,
  cfg: Ts666FilterConfig,
  cutoffHz: number,
  resonance: number,
  pan: number,
  drive: number,
  fat: number,
  mix: number,
  os: Ts666Oversampling,
  now: number
): void {
  const c = unit.numCache;
  if (!cfg.enabled) {
    setTargetCached(c, 'dry', unit.dryGain.gain, 1, now, 0.012);
    setTargetCached(c, 'wet', unit.wetGain.gain, 0, now, 0.012);
    if (unit.lastOs !== 'none') {
      unit.lastOs = 'none';
      unit.shaper.oversample = 'none';
    }
    return;
  }

  const cut = clamp(cutoffHz, 24, 19500);
  const res = clamp(resonance, 0.2, 18);
  const effectiveMix = clamp(mix, 0, 1);

  setTargetCached(c, 'dry', unit.dryGain.gain, 1 - effectiveMix, now, 0.012);
  setTargetCached(c, 'wet', unit.wetGain.gain, effectiveMix, now, 0.012);
  setTargetCached(c, 'pan', unit.panner.pan, clamp(pan, -1, 1), now, 0.015);

  const isSH = cfg.type === 'misc_sh';
  const nextOs: OverSampleType =
    drive <= 0.004 && !isSH ? 'none' : os === 4 ? '4x' : os === 2 ? '2x' : 'none';
  if (unit.lastOs !== nextOs) {
    unit.lastOs = nextOs;
    unit.shaper.oversample = nextOs;
  }

  const qDrive = Math.round(clamp(drive, 0, 1) * 30);
  const sig = `${cfg.type}:${qDrive}`;
  if (sig !== unit.lastModeSig) {
    unit.lastModeSig = sig;
    if (drive <= 0.004 && !isSH) {
      unit.shaper.curve = null;
    } else {
      unit.shaper.curve = computeFilterSaturationCurve(drive, isSH);
    }
  }

  const cat: Ts666FilterCategory = cfg.category;
  const isCombOrFlange = cat === 'Combs' || cat === 'Flanges';
  const isDiffuser = cat === 'Diffuser';
  const setBq1Type = (t: BiquadFilterType) => {
    if (unit.lastBq1Type !== t) {
      unit.lastBq1Type = t;
      unit.bq1.type = t;
    }
  };
  const setBq2Type = (t: BiquadFilterType) => {
    if (unit.lastBq2Type !== t) {
      unit.lastBq2Type = t;
      unit.bq2.type = t;
    }
  };

  if (isCombOrFlange) {
    setTargetCached(c, 'bqOut', unit.bqChainOut.gain, 0.35, now, 0.015);
    setTargetCached(c, 'dlyOut', unit.delayOut.gain, 0.9, now, 0.015);
    setTargetCached(c, 'apOut', unit.apOut.gain, 0, now, 0.015);
    setBq1Type('lowpass');
    setTargetCached(c, 'bq1F', unit.bq1.frequency, clamp(1800 + fat * 12000, 400, 18000), now, 0.02, 0.5);
    setTargetCached(c, 'bq1Q', unit.bq1.Q, 0.7, now, 0.02);
    setBq2Type('lowpass');
    setTargetCached(c, 'bq2F', unit.bq2.frequency, 18500, now, 0.02, 1);
    const delayTime = clamp(1 / Math.max(45, cut * (cat === 'Combs' ? 0.35 : 0.7)), 0.0005, 0.045);
    setTargetCached(c, 'dlyT', unit.delay.delayTime, delayTime, now, 0.02, 0.00002);
    const sign = cfg.type === 'comb_minus' || cfg.type === 'flange_minus' ? -1 : 1;
    const fbMag = clamp(0.2 + (res / 20) * 0.72, 0.05, 0.92);
    setTargetCached(c, 'dlyFb', unit.delayFb.gain, sign * fbMag, now, 0.02);
  } else if (isDiffuser) {
    setTargetCached(c, 'bqOut', unit.bqChainOut.gain, 0.25, now, 0.015);
    setTargetCached(c, 'dlyOut', unit.delayOut.gain, 0, now, 0.015);
    setTargetCached(c, 'apOut', unit.apOut.gain, 0.95, now, 0.015);
    setTargetCached(c, 'ap1F', unit.ap1.frequency, cut, now, 0.02, 0.5);
    setTargetCached(c, 'ap1Q', unit.ap1.Q, 0.7 + res * 0.25, now, 0.02);
    setTargetCached(c, 'ap2F', unit.ap2.frequency, clamp(cut * (1.35 + fat), 40, 18000), now, 0.02, 0.5);
    setTargetCached(c, 'ap2Q', unit.ap2.Q, 0.7 + res * 0.25, now, 0.02);
  } else {
    setTargetCached(c, 'bqOut', unit.bqChainOut.gain, 1, now, 0.015);
    setTargetCached(c, 'dlyOut', unit.delayOut.gain, 0, now, 0.015);
    setTargetCached(c, 'apOut', unit.apOut.gain, 0, now, 0.015);

    switch (cfg.type) {
      case 'lp12':
        setBq1Type('lowpass');
        setTargetCached(c, 'bq1F', unit.bq1.frequency, cut, now, 0.015, 0.4);
        setTargetCached(c, 'bq1Q', unit.bq1.Q, res, now, 0.015, 0.01);
        setBq2Type('lowpass');
        setTargetCached(c, 'bq2F', unit.bq2.frequency, 19500, now, 0.02, 1);
        setTargetCached(c, 'bq2Q', unit.bq2.Q, 0.5, now, 0.02, 0.01);
        break;
      case 'lp24':
        setBq1Type('lowpass');
        setTargetCached(c, 'bq1F', unit.bq1.frequency, cut, now, 0.015, 0.4);
        setTargetCached(c, 'bq1Q', unit.bq1.Q, Math.max(0.5, res * 0.7), now, 0.015, 0.01);
        setBq2Type('lowpass');
        setTargetCached(c, 'bq2F', unit.bq2.frequency, clamp(cut * (1 + fat * 0.12), 24, 19500), now, 0.015, 0.4);
        setTargetCached(c, 'bq2Q', unit.bq2.Q, Math.max(0.5, res * 0.7), now, 0.015, 0.01);
        break;
      case 'hp12':
        setBq1Type('highpass');
        setTargetCached(c, 'bq1F', unit.bq1.frequency, cut, now, 0.015, 0.4);
        setTargetCached(c, 'bq1Q', unit.bq1.Q, res, now, 0.015, 0.01);
        setBq2Type('lowpass');
        setTargetCached(c, 'bq2F', unit.bq2.frequency, 19500, now, 0.02, 1);
        setTargetCached(c, 'bq2Q', unit.bq2.Q, 0.5, now, 0.02, 0.01);
        break;
      case 'hp24':
        setBq1Type('highpass');
        setTargetCached(c, 'bq1F', unit.bq1.frequency, cut, now, 0.015, 0.4);
        setTargetCached(c, 'bq1Q', unit.bq1.Q, res * 0.75, now, 0.015, 0.01);
        setBq2Type('highpass');
        setTargetCached(c, 'bq2F', unit.bq2.frequency, clamp(cut * (1 - fat * 0.1), 24, 19500), now, 0.015, 0.4);
        setTargetCached(c, 'bq2Q', unit.bq2.Q, res * 0.75, now, 0.015, 0.01);
        break;
      case 'bp12':
      case 'bp24':
        setBq1Type('bandpass');
        setTargetCached(c, 'bq1F', unit.bq1.frequency, cut, now, 0.015, 0.4);
        setTargetCached(c, 'bq1Q', unit.bq1.Q, res, now, 0.015, 0.01);
        setBq2Type(cfg.type === 'bp24' ? 'bandpass' : 'lowpass');
        setTargetCached(c, 'bq2F', unit.bq2.frequency, cfg.type === 'bp24' ? cut : 19500, now, 0.015, 0.4);
        setTargetCached(c, 'bq2Q', unit.bq2.Q, cfg.type === 'bp24' ? res : 0.5, now, 0.015, 0.01);
        break;
      case 'notch':
        setBq1Type('notch');
        setTargetCached(c, 'bq1F', unit.bq1.frequency, cut, now, 0.015, 0.4);
        setTargetCached(c, 'bq1Q', unit.bq1.Q, res, now, 0.015, 0.01);
        setBq2Type('lowpass');
        setTargetCached(c, 'bq2F', unit.bq2.frequency, 19500, now, 0.02, 1);
        break;
      case 'low_shelf':
      case 'high_shelf':
      case 'peak':
        setBq1Type(cfg.type === 'low_shelf' ? 'lowshelf' : cfg.type === 'high_shelf' ? 'highshelf' : 'peaking');
        setTargetCached(c, 'bq1F', unit.bq1.frequency, cut, now, 0.015, 0.4);
        setTargetCached(c, 'bq1Q', unit.bq1.Q, res, now, 0.015, 0.01);
        setTargetCached(c, 'bq1G', unit.bq1.gain, 6 + fat * 9, now, 0.015, 0.02);
        setBq2Type('lowpass');
        setTargetCached(c, 'bq2F', unit.bq2.frequency, 19500, now, 0.02, 1);
        break;
      case 'multi_lp_hp':
        setBq1Type('lowpass');
        setTargetCached(c, 'bq1F', unit.bq1.frequency, cut, now, 0.015, 0.4);
        setTargetCached(c, 'bq1Q', unit.bq1.Q, res * 0.8, now, 0.015, 0.01);
        setBq2Type('highpass');
        setTargetCached(c, 'bq2F', unit.bq2.frequency, clamp(cut * (0.2 + fat * 0.5), 24, 16000), now, 0.015, 0.4);
        setTargetCached(c, 'bq2Q', unit.bq2.Q, res * 0.7, now, 0.015, 0.01);
        break;
      case 'multi_notch_lp':
        setBq1Type('notch');
        setTargetCached(c, 'bq1F', unit.bq1.frequency, clamp(cut * (0.55 + fat * 0.4), 30, 18000), now, 0.015, 0.4);
        setTargetCached(c, 'bq1Q', unit.bq1.Q, res, now, 0.015, 0.01);
        setBq2Type('lowpass');
        setTargetCached(c, 'bq2F', unit.bq2.frequency, cut, now, 0.015, 0.4);
        setTargetCached(c, 'bq2Q', unit.bq2.Q, res * 0.7, now, 0.015, 0.01);
        break;
      case 'multi_formant':
      case 'multi_vowel':
        setBq1Type('bandpass');
        setTargetCached(c, 'bq1F', unit.bq1.frequency, clamp(cut * 0.75, 80, 5500), now, 0.015, 0.4);
        setTargetCached(c, 'bq1Q', unit.bq1.Q, 2.5 + res * 0.5, now, 0.015, 0.01);
        setBq2Type('peaking');
        setTargetCached(c, 'bq2F', unit.bq2.frequency, clamp(cut * (1.8 + fat * 1.1), 220, 9000), now, 0.015, 0.4);
        setTargetCached(c, 'bq2Q', unit.bq2.Q, 3.0, now, 0.015, 0.01);
        setTargetCached(c, 'bq2G', unit.bq2.gain, 10 + fat * 8, now, 0.015, 0.02);
        break;
      case 'misc_tilt':
        setBq1Type('lowshelf');
        setTargetCached(c, 'bq1F', unit.bq1.frequency, cut, now, 0.015, 0.4);
        setTargetCached(c, 'bq1G', unit.bq1.gain, (0.5 - fat) * 14, now, 0.015, 0.02);
        setBq2Type('highshelf');
        setTargetCached(c, 'bq2F', unit.bq2.frequency, cut, now, 0.015, 0.4);
        setTargetCached(c, 'bq2G', unit.bq2.gain, (fat - 0.5) * 14, now, 0.015, 0.02);
        break;
      default:
        setBq1Type('lowpass');
        setTargetCached(c, 'bq1F', unit.bq1.frequency, cut, now, 0.015, 0.4);
        setTargetCached(c, 'bq1Q', unit.bq1.Q, res, now, 0.015, 0.01);
        setBq2Type('lowpass');
        setTargetCached(c, 'bq2F', unit.bq2.frequency, 19500, now, 0.02, 1);
        break;
    }
  }
}

interface OscVoiceHandle {
  index: 0 | 1 | 2;
  gainNode: GainNode;
  pannerNode: StereoPannerNode;
  periodicOscs: OscillatorNode[];
  bufferSource: AudioBufferSourceNode | null;
  grainTimer: number | null;
  activeGains: GainNode[];
  unisonPans: StereoPannerNode[];
  chosenRootMidi: number;
  lastPw: PeriodicWave | null;
  numCache: Record<string, number>;
}

interface ActiveVoice666 {
  id: string;
  midi: number;
  velocity: number;
  startTime: number;
  released: boolean;
  releaseTime: number;
  releaseStartEnvs: [number, number, number, number];
  envValues: [number, number, number, number];
  ampEnvGain: GainNode;
  voiceRoot: GainNode;
  oscVoices: OscVoiceHandle[];
  subOsc: OscillatorNode | null;
  subGain: GainNode;
  subPanner: StereoPannerNode;
  noiseSrc: AudioBufferSourceNode | null;
  noiseGain: GainNode;
  noisePanner: StereoPannerNode;
  f1: FilterUnitNodes;
  f2: FilterUnitNodes;
  srcToF1: GainNode[]; // 5 [A,B,C,N,S]
  srcToF2: GainNode[]; // 5 [A,B,C,N,S]
  srcToMixBus: Record<'oscA' | 'oscB' | 'oscC' | 'sub' | 'noise', Record<Ts666BusId, GainNode>>;
  f1ToBus: Record<Ts666BusId, GainNode>;
  f2ToBus: Record<Ts666BusId, GainNode>;
  f1ToF2Serial: GainNode;
  lfoPhases: number[];
  lfoSmoothVals: number[];
  grainNodes: Set<AudioNode>;
  numCache: Record<string, number>;
  releaseCleanupTimer: number | null;
}

export interface Ts666TelemetrySnapshot {
  offsets: Ts666LiveModOffsets;
  lfoPhases: number[];
  envValues: [number, number, number, number];
  chaosXY: [number, number];
  activeVoices: number;
  activeArpStep: number;
  activeClipStep: number;
  growl: Ts666GrowlTelemetry | null;
}

export class SixSixSixEngine {
  private ctx: AudioContext | null = null;
  private busFx: Ts666ThreeBusFxEngine | null = null;
  private bus1ReturnGain: GainNode | null = null;
  private bus1ReturnPanner: StereoPannerNode | null = null;
  private bus2ReturnGain: GainNode | null = null;
  private bus2ReturnPanner: StereoPannerNode | null = null;
  private masterTrim: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;

  private customSampleBuffers: Partial<Record<'A' | 'B' | 'C', AudioBuffer>> = {};
  private customNoiseBuffer: AudioBuffer | null = null;

  private patch: Ts666Patch = createCleanBassInit666();
  private bpm = 124;
  private voices: ActiveVoice666[] = [];
  private lastPlayedMidi: number | null = null;

  // Chaos state
  private chaos1Val = 0;
  private chaos2Val = 0;
  private chaos1Target = 0.25;
  private chaos2Target = -0.35;
  private chaosTimer = 0;

  // Mod / Clock loop
  private modInterval: number | null = null;
  private lastTickTime = 0;
  private telemetryListener: ((snap: Ts666TelemetrySnapshot) => void) | null = null;
  private lastTelemetryEmit = 0;
  private lastIdleBroadcasted = false;
  private fxDirty = true;
  private busSyncCache: Record<string, number> = {};

  // Arpeggiator & Clip Sequencer state
  private heldArpNotes: number[] = [];
  private arpActiveMidi: number | null = null;
  private arpStepIdx = 0;
  private arpDirectionSign = 1;
  private nextArpTime = 0;
  private clipStepIdx = 0;
  private nextClipTime = 0;
  private activeClipMidi: number | null = null;
  private seqTimer: number | null = null;
  private muted = false;
  private scheduledTimers = new Set<number>();

  constructor() {
    studioAudio.onContextReset(() => {
      this.teardownNodes();
    });
  }

  private teardownNodes(): void {
    this.panic();
    this.busFx?.dispose();
    this.busFx = null;
    this.ctx = null;
    this.masterGain = null;
    this.masterTrim = null;
    this.limiter = null;
    this.analyser = null;
    this.bus1ReturnGain = null;
    this.bus2ReturnGain = null;
  }

  async ensureAudio(): Promise<AudioContext | null> {
    const ctx = await studioAudio.ensureAudio();
    if (!ctx) return null;

    if (this.ctx !== ctx) {
      this.ctx = ctx;
      this.busFx = new Ts666ThreeBusFxEngine(ctx);

      this.masterTrim = ctx.createGain();
      this.masterTrim.gain.value = 0.72;

      this.bus1ReturnGain = ctx.createGain();
      this.bus1ReturnPanner = ctx.createStereoPanner();
      this.bus2ReturnGain = ctx.createGain();
      this.bus2ReturnPanner = ctx.createStereoPanner();

      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -2.0;
      this.limiter.knee.value = 3.0;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.002;
      this.limiter.release.value = 0.08;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.patch.performance.masterVolume;

      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.78;

      this.busFx.getBusOutput('main').connect(this.masterTrim);
      this.busFx
        .getBusOutput('bus1')
        .connect(this.bus1ReturnPanner)
        .connect(this.bus1ReturnGain)
        .connect(this.masterTrim);
      this.busFx
        .getBusOutput('bus2')
        .connect(this.bus2ReturnPanner)
        .connect(this.bus2ReturnGain)
        .connect(this.masterTrim);

      const destination = studioAudio.getTs666BusInput() ?? ctx.destination;
      this.masterTrim
        .connect(this.limiter)
        .connect(this.masterGain)
        .connect(this.analyser)
        .connect(destination);

      this.syncMixAndFx();
    }
    this.startTimers();
    return ctx;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  setTelemetryListener(cb: ((snap: Ts666TelemetrySnapshot) => void) | null): void {
    this.telemetryListener = cb;
  }

  setBpm(bpm: number): void {
    this.bpm = clamp(bpm, 40, 260);
    if (this.ctx && this.busFx) {
      this.busFx.sync(this.patch.fx, this.bpm, this.patch.global.oversampling);
    }
  }

  setPatch(next: Ts666Patch): void {
    const prevWasClipOn = this.patch.clipSeq.enabled;
    const prevWasArpOn = this.patch.arp.enabled;
    this.patch = next;

    if (prevWasClipOn && !next.clipSeq.enabled && this.activeClipMidi !== null) {
      this.internalNoteOff(this.activeClipMidi);
      this.activeClipMidi = null;
    }
    if (prevWasArpOn && !next.arp.enabled && this.arpActiveMidi !== null) {
      this.internalNoteOff(this.arpActiveMidi);
      this.arpActiveMidi = null;
    }

    this.syncMixAndFx();
  }

  async decodeAndLoadCustomSample(
    oscId: 'A' | 'B' | 'C',
    arrayBuffer: ArrayBuffer
  ): Promise<boolean> {
    const ctx = await this.ensureAudio();
    if (!ctx) return false;
    try {
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      this.customSampleBuffers[oscId] = decoded;
      return true;
    } catch {
      return false;
    }
  }

  async decodeAndLoadCustomNoise(arrayBuffer: ArrayBuffer): Promise<boolean> {
    const ctx = await this.ensureAudio();
    if (!ctx) return false;
    try {
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      this.customNoiseBuffer = decoded;
      return true;
    } catch {
      return false;
    }
  }

  private syncMixAndFx(): void {
    this.fxDirty = true;
    if (!this.ctx || !this.busFx) return;
    const now = this.ctx.currentTime;
    const mix = this.patch.mix;
    if (this.bus1ReturnGain && this.bus1ReturnPanner) {
      setTargetCached(
        this.busSyncCache,
        'b1v',
        this.bus1ReturnGain.gain,
        mix.bus1Return.mute ? 0 : mix.bus1Return.volume,
        now,
        0.015
      );
      setTargetCached(this.busSyncCache, 'b1p', this.bus1ReturnPanner.pan, mix.bus1Return.pan, now, 0.015);
    }
    if (this.bus2ReturnGain && this.bus2ReturnPanner) {
      setTargetCached(
        this.busSyncCache,
        'b2v',
        this.bus2ReturnGain.gain,
        mix.bus2Return.mute ? 0 : mix.bus2Return.volume,
        now,
        0.015
      );
      setTargetCached(this.busSyncCache, 'b2p', this.bus2ReturnPanner.pan, mix.bus2Return.pan, now, 0.015);
    }
    if (this.masterGain) {
      setTargetCached(
        this.busSyncCache,
        'mstr',
        this.masterGain.gain,
        clamp(this.patch.performance.masterVolume * mix.mainLevel, 0, 1.4),
        now,
        0.015
      );
    }
    this.busFx.sync(this.patch.fx, this.bpm, this.patch.global.oversampling);
    this.fxDirty = false;
  }

  private startTimers(): void {
    if (this.modInterval === null) {
      this.lastTickTime = performance.now();
      this.modInterval = window.setInterval(() => {
        this.tickModulation();
      }, 24);
    }
    if (this.seqTimer === null) {
      this.seqTimer = window.setInterval(() => {
        this.tickArpAndClipSeq();
      }, 16);
    }
  }

  // =========================================================================
  // PUBLIC NOTE INPUT (ROUTES THROUGH ARP WHEN ENABLED)
  // =========================================================================

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.panic();
    }
  }

  async noteOn(midi: number, velocity = 0.85): Promise<void> {
    studioAudio.unlockSync();
    await this.ensureAudio();
    if (this.muted) return;
    if (this.patch.arp.enabled) {
      if (!this.heldArpNotes.includes(midi)) {
        this.heldArpNotes.push(midi);
      }
      if (this.heldArpNotes.length === 1) {
        this.arpStepIdx = 0;
        this.arpDirectionSign = 1;
        this.nextArpTime = this.ctx ? this.ctx.currentTime : 0;
      }
      return;
    }
    this.internalNoteOn(midi, velocity);
  }

  noteOff(midi: number): void {
    if (this.patch.arp.enabled) {
      this.heldArpNotes = this.heldArpNotes.filter((m) => m !== midi);
      if (this.heldArpNotes.length === 0 && this.arpActiveMidi !== null) {
        this.internalNoteOff(this.arpActiveMidi);
        this.arpActiveMidi = null;
      }
      return;
    }
    this.internalNoteOff(midi);
  }

  scheduleNote(
    midi: number,
    velocity: number,
    startTime: number,
    endTime: number
  ): void {
    if (this.muted) return;
    if (!this.ctx) {
      void this.ensureAudio();
      return;
    }
    const now = this.ctx.currentTime;
    const startAt = Math.max(now, startTime);
    const endAt = Math.max(startAt + 0.025, endTime);
    // Sample-accurate WebAudio scheduling directly onto AudioContext time!
    this.internalNoteOn(midi, velocity, startAt, endAt);
  }

  panic(): void {
    this.scheduledTimers.forEach((t) => window.clearTimeout(t));
    this.scheduledTimers.clear();
    this.heldArpNotes = [];
    this.arpActiveMidi = null;
    this.activeClipMidi = null;
    for (const v of this.voices) {
      this.killVoiceImmediately(v);
    }
    this.voices = [];
  }

  // =========================================================================
  // VOICE SPAWNING & MULTI-MODE OSCILLATOR GRAPH
  // =========================================================================

  private internalNoteOn(
    midi: number,
    velocity = 0.85,
    when?: number,
    scheduledEndAt?: number
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.busFx) return;

    const now = Math.max(ctx.currentTime, when ?? ctx.currentTime);
    const isMono = this.patch.global.monoLegato || this.patch.global.polyphony <= 1;

    // Mono / Legato or Polyphony Cap
    if (isMono) {
      for (const existing of this.voices) {
        if (existing.startTime <= now + 0.002) {
          this.releaseOrTrimVoice(existing, now, true);
        }
      }
    } else if (this.voices.length >= this.patch.global.polyphony) {
      const oldest = this.voices.shift();
      if (oldest) this.killVoiceImmediately(oldest);
    }

    const startMidi =
      this.patch.performance.portamentoTimeMs > 2 && this.lastPlayedMidi !== null
        ? this.lastPlayedMidi
        : midi;
    this.lastPlayedMidi = midi;

    const voiceId = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const voiceRoot = ctx.createGain();
    voiceRoot.gain.value = 1;

    const ampEnvGain = ctx.createGain();
    ampEnvGain.gain.setValueAtTime(0.0001, now);
    ampEnvGain.connect(voiceRoot);

    const busNames: Ts666BusId[] = ['main', 'bus1', 'bus2'];
    const makeChannelRoutes = (): Record<Ts666BusId, GainNode> => {
      const rec = {} as Record<Ts666BusId, GainNode>;
      for (const b of busNames) {
        const g = ctx.createGain();
        g.gain.value = 0;
        g.connect(this.busFx!.getBusInput(b));
        rec[b] = g;
      }
      return rec;
    };

    const f1 = buildFilterUnitNodes(ctx, this.patch.global.oversampling);
    const f2 = buildFilterUnitNodes(ctx, this.patch.global.oversampling);
    const f1ToBus = makeChannelRoutes();
    const f2ToBus = makeChannelRoutes();
    const f1ToF2Serial = ctx.createGain();
    f1ToF2Serial.gain.value = 0;

    busNames.forEach((b) => {
      f1.output.connect(f1ToBus[b]);
      f2.output.connect(f2ToBus[b]);
    });
    f1.output.connect(f1ToF2Serial);
    f1ToF2Serial.connect(f2.input);

    const srcToF1 = Array.from({ length: 5 }, () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(f1.input);
      return g;
    });
    const srcToF2 = Array.from({ length: 5 }, () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(f2.input);
      return g;
    });

    const srcToMixBus = {
      oscA: makeChannelRoutes(),
      oscB: makeChannelRoutes(),
      oscC: makeChannelRoutes(),
      sub: makeChannelRoutes(),
      noise: makeChannelRoutes(),
    };

    const grainNodes = new Set<AudioNode>();

    // Build OSC A/B/C
    const oscVoices: OscVoiceHandle[] = ([0, 1, 2] as const).map((idx) => {
      const cfg = this.patch.oscillators[idx];
      const gainNode = ctx.createGain();
      gainNode.gain.value = cfg.enabled ? cfg.level * 0.45 : 0;
      const pannerNode = ctx.createStereoPanner();
      pannerNode.pan.value = cfg.pan;
      gainNode.connect(pannerNode);

      const channelKey = idx === 0 ? 'oscA' : idx === 1 ? 'oscB' : 'oscC';
      pannerNode.connect(srcToF1[idx]);
      pannerNode.connect(srcToF2[idx]);
      busNames.forEach((b) => pannerNode.connect(srcToMixBus[channelKey][b]));

      const handle: OscVoiceHandle = {
        index: idx,
        gainNode,
        pannerNode,
        periodicOscs: [],
        bufferSource: null,
        grainTimer: null,
        activeGains: [],
        unisonPans: [],
        chosenRootMidi: 36,
        lastPw: null,
        numCache: {},
      };

      this.populateOscVoiceNodes(ctx, handle, idx, startMidi, midi, now, grainNodes);
      return handle;
    });

    // Build SUB oscillator
    const subGain = ctx.createGain();
    subGain.gain.value = this.patch.sub.enabled ? this.patch.sub.level * 0.48 : 0;
    const subPanner = ctx.createStereoPanner();
    subPanner.pan.value = this.patch.sub.pan;
    subGain.connect(subPanner);
    subPanner.connect(srcToF1[4]);
    subPanner.connect(srcToF2[4]);
    busNames.forEach((b) => subPanner.connect(srcToMixBus.sub[b]));

    const subOsc = ctx.createOscillator();
    if (this.patch.sub.shape === 'sub_pulse') {
      subOsc.setPeriodicWave(createSubPulseWave(ctx));
    } else {
      subOsc.type = this.patch.sub.shape;
    }
    const subFreq = midiToMicrotunedFreq(
      startMidi + this.patch.sub.octave * 12,
      this.patch.global.masterTuningHz,
      this.patch.global.microtuningCents
    );
    subOsc.frequency.setValueAtTime(subFreq, now);
    subOsc.connect(subGain);
    subOsc.start(now);

    // Build NOISE generator
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = this.patch.noise.enabled ? this.patch.noise.level * 0.42 : 0;
    const noisePanner = ctx.createStereoPanner();
    noisePanner.pan.value = this.patch.noise.pan;
    noiseGain.connect(noisePanner);
    noisePanner.connect(srcToF1[3]);
    noisePanner.connect(srcToF2[3]);
    busNames.forEach((b) => noisePanner.connect(srcToMixBus.noise[b]));

    const noiseBuf =
      this.patch.noise.sampleId === 'custom' && this.customNoiseBuffer
        ? this.customNoiseBuffer
        : getOrBuildTs666NoiseBuffer(
            ctx,
            this.patch.noise.sampleId === 'custom' ? 'pink' : this.patch.noise.sampleId
          );
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = !this.patch.noise.oneShot;
    const baseRate = 0.5 + this.patch.noise.pitch * 1.5;
    const kbdFactor = this.patch.noise.keyboardTracking ? Math.pow(2, (midi - 60) / 12) : 1;
    noiseSrc.playbackRate.setValueAtTime(clamp(baseRate * kbdFactor, 0.25, 4), now);
    const phaseRandOffset =
      (this.patch.noise.phase / 360 +
        Math.random() * this.patch.noise.phaseRandomization) *
      Math.max(0.1, noiseBuf.duration - 0.1);
    noiseSrc.connect(noiseGain);
    noiseSrc.start(now, phaseRandOffset % Math.max(0.1, noiseBuf.duration));

    // Attach voice-level amplitude envelope output to all active source channel outputs
    // Notice: Routing via ampEnvGain scaling inside updateVoiceParameters & WebAudio Gain modulation
    // Instead of connecting sources BEFORE filters only, let's insert ampEnvGain cleanly as master VCA or per-voice gain
    // Let's scale voice source inputs cleanly via a VCA connected AFTER panner or before filter/mix!
    // Even cleaner: reconnect panner -> vcaGain -> filters/mix so Amp Env1 shapes every sound cleanly in audio rate!
    // Let's wire a per-voice VCA on f1/f2/src gains right via AudioNode graph:
    // Actually: let's modulate oscVoices[i].gainNode.gain, subGain.gain, noiseGain.gain OR place a stereo voiceVca!
    // Rewire src->panners -> voiceVca is unnecessary if each osc/sub/noise feeds a shared `preVca`? No, because independent direct routing exists per source!
    // Instead, schedule ENV 1 curve onto a dedicated ConstantSourceNode (or modulate ampEnvGain connected directly into GainNode.gain params? Wait: ConstantSource/Gain summing works cleanly!).
    // Even simpler and exact at sample-rate:
    const vcaGainNodes: GainNode[] = [
      ...oscVoices.map((ov) => ov.gainNode),
      subGain,
      noiseGain,
    ];
    // Connect each source's amplitude env multiplier via a secondary VCA gain stage? Yes! Let's create a dedicated `envVca` multiplier per source OR schedule ampEnvelope cleanly at audio-rate!
    const oscVcas = oscVoices.map((ov) => {
      const vca = ctx.createGain();
      vca.gain.setValueAtTime(0.0001, now);
      ov.gainNode.disconnect();
      ov.gainNode.connect(vca).connect(ov.pannerNode);
      return vca;
    });
    const subVca = ctx.createGain();
    subVca.gain.setValueAtTime(0.0001, now);
    subGain.disconnect();
    subGain.connect(subVca).connect(subPanner);

    const noiseVca = ctx.createGain();
    noiseVca.gain.setValueAtTime(0.0001, now);
    noiseGain.disconnect();
    noiseGain.connect(noiseVca).connect(noisePanner);

    void vcaGainNodes;

    // Schedule sample-accurate AHDSR Attack + Hold + Decay on all VCA nodes (ENV 1)
    const env1 = this.patch.envelopes[0];
    const peakGain = clamp(velocity, 0.1, 1);
    const susGain = Math.max(0.0001, peakGain * clamp(env1.sustain, 0, 1));
    const atkEnd = now + Math.max(0.003, env1.attack);
    const holdEnd = atkEnd + Math.max(0, env1.hold);
    const decEnd = holdEnd + Math.max(0.008, env1.decay);

    [...oscVcas, subVca, noiseVca].forEach((vca) => {
      vca.gain.cancelScheduledValues(now);
      vca.gain.setValueAtTime(0.0001, now);
      vca.gain.linearRampToValueAtTime(peakGain, atkEnd);
      if (env1.hold > 0.001) {
        vca.gain.setValueAtTime(peakGain, holdEnd);
      }
      vca.gain.exponentialRampToValueAtTime(susGain, decEnd);
      // Store reference on ampEnvGain? Let's keep them in voice object cleanly:
    });

    // Tie ampEnvGain.gain mirror for release reference + attach VCAs to voiceRoot cleanup
    (ampEnvGain as GainNode & { _vcas?: GainNode[] })._vcas = [...oscVcas, subVca, noiseVca];

    const voice: ActiveVoice666 = {
      id: voiceId,
      midi,
      velocity,
      startTime: now,
      released: false,
      releaseTime: 0,
      releaseStartEnvs: [0, 0, 0, 0],
      envValues: [0, 0, 0, 0],
      ampEnvGain,
      voiceRoot,
      oscVoices,
      subOsc,
      subGain,
      subPanner,
      noiseSrc,
      noiseGain,
      noisePanner,
      f1,
      f2,
      srcToF1,
      srcToF2,
      srcToMixBus,
      f1ToBus,
      f2ToBus,
      f1ToF2Serial,
      lfoPhases: this.patch.lfos.map(() => 0),
      lfoSmoothVals: this.patch.lfos.map((l) => l.points[0] ?? 0),
      grainNodes,
      numCache: {},
      releaseCleanupTimer: null,
    };

    this.voices.push(voice);
    this.updateVoiceRealTime(voice, {}, now);

    // If pre-scheduled (e.g., from Sequencer / Piano Roll), schedule hardware VCA release directly at endAt
    if (scheduledEndAt !== undefined && scheduledEndAt > now) {
      this.scheduleScheduledVoiceRelease(voice, scheduledEndAt, peakGain, susGain, atkEnd, decEnd);
    }
  }

  private scheduleScheduledVoiceRelease(
    voice: ActiveVoice666,
    endAt: number,
    peakGain: number,
    susGain: number,
    atkEnd: number,
    decEnd: number
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const relSec = Math.max(0.008, this.patch.envelopes[0].release);
    const vcas = (voice.ampEnvGain as GainNode & { _vcas?: GainNode[] })._vcas ?? [];
    const relStartLevel = endAt <= atkEnd ? peakGain : endAt >= decEnd ? susGain : Math.max(susGain, peakGain * 0.85);

    vcas.forEach((vca) => {
      try {
        vca.gain.setValueAtTime(Math.max(0.0001, relStartLevel), endAt);
        vca.gain.exponentialRampToValueAtTime(0.0001, endAt + relSec);
      } catch {
        // ignore
      }
    });

    const cleanupDelayMs = Math.max(30, Math.round((endAt - ctx.currentTime + relSec + 0.05) * 1000));
    const tid = window.setTimeout(() => {
      this.scheduledTimers.delete(tid);
      voice.releaseCleanupTimer = null;
      this.killVoiceImmediately(voice);
      this.voices = this.voices.filter((v) => v.id !== voice.id);
    }, cleanupDelayMs);
    voice.releaseCleanupTimer = tid;
    this.scheduledTimers.add(tid);
  }

  private populateOscVoiceNodes(
    ctx: AudioContext,
    handle: OscVoiceHandle,
    idx: 0 | 1 | 2,
    startMidi: number,
    targetMidi: number,
    now: number,
    grainNodes: Set<AudioNode>
  ): void {
    const cfg = this.patch.oscillators[idx];
    const mode = cfg.mode;
    const count = clamp(Math.round(cfg.unison), 1, 8);
    const totalPitchOffset =
      cfg.octave * 12 + cfg.semitone + cfg.coarse + cfg.fine / 100;
    const startFreq = midiToMicrotunedFreq(
      startMidi + totalPitchOffset,
      this.patch.global.masterTuningHz,
      this.patch.global.microtuningCents
    );

    if (mode === 'wavetable' || mode === 'spectral') {
      const pw =
        mode === 'spectral'
          ? getSpectralPeriodicWave(
              ctx,
              cfg.wavetableId,
              cfg.customWavetable,
              cfg.wtPosition,
              cfg.grainSize,
              cfg.density,
              cfg.warp1Mode,
              cfg.warp1Amount,
              cfg.phase
            )
          : getOrCreateTs666PeriodicWave(
              ctx,
              cfg.wavetableId,
              cfg.customWavetable,
              cfg.wtPosition,
              cfg.warp1Mode,
              cfg.warp1Amount,
              cfg.warp2Mode,
              cfg.warp2Amount,
              cfg.phase
            );

      handle.lastPw = pw;
      for (let u = 0; u < count; u++) {
        const spreadNorm = count === 1 ? 0 : (u / (count - 1)) * 2 - 1;
        const detuneCents = spreadNorm * cfg.detune * 42 + (Math.random() - 0.5) * cfg.random * 4;
        const osc = ctx.createOscillator();
        osc.setPeriodicWave(pw);
        osc.frequency.setValueAtTime(startFreq, now);
        osc.detune.setValueAtTime(detuneCents, now);

        const uGain = ctx.createGain();
        const isCenter = count === 1 || Math.abs(spreadNorm) < 0.05;
        const gainVal = isCenter ? 1 / Math.sqrt(count) : (cfg.blend * 0.9 + 0.1) / Math.sqrt(count);
        uGain.gain.value = gainVal;

        const uPan = ctx.createStereoPanner();
        uPan.pan.value = count === 1 ? 0 : spreadNorm * 0.72;

        osc.connect(uGain).connect(uPan).connect(handle.gainNode);
        osc.start(now);

        handle.periodicOscs.push(osc);
        handle.activeGains.push(uGain);
        handle.unisonPans.push(uPan);
      }

      if (startMidi !== targetMidi && this.patch.performance.portamentoTimeMs > 2) {
        const targetFreq = midiToMicrotunedFreq(
          targetMidi + totalPitchOffset,
          this.patch.global.masterTuningHz,
          this.patch.global.microtuningCents
        );
        const glideSec = this.patch.performance.portamentoTimeMs / 1000;
        handle.periodicOscs.forEach((o) => {
          o.frequency.exponentialRampToValueAtTime(Math.max(12, targetFreq), now + glideSec);
        });
      }
    } else if (mode === 'sample' || mode === 'multisample') {
      let buf: AudioBuffer;
      let rootMidi = 36;
      if (mode === 'multisample') {
        const zones = getMultisampleZones(ctx, cfg.multisampleId);
        const picked = pickMultisampleZone(zones, targetMidi + cfg.octave * 12);
        buf = picked.buffer;
        rootMidi = picked.rootMidi;
      } else {
        buf =
          cfg.sampleId === 'custom' && this.customSampleBuffers[cfg.id]
            ? this.customSampleBuffers[cfg.id]!
            : getOrBuildTs666SampleBuffer(
                ctx,
                cfg.sampleId === 'custom' ? 'finger_bass' : cfg.sampleId
              );
        rootMidi = 36;
      }
      handle.chosenRootMidi = rootMidi;

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = 0.05;
      src.loopEnd = Math.max(0.4, buf.duration - 0.12);
      const rate = Math.pow(2, (targetMidi + totalPitchOffset - rootMidi) / 12);
      src.playbackRate.setValueAtTime(clamp(rate, 0.1, 8), now);
      src.connect(handle.gainNode);
      const offset = clamp(cfg.wtPosition * (buf.duration * 0.4), 0, Math.max(0, buf.duration - 0.2));
      src.start(now, offset);
      handle.bufferSource = src;
    } else if (mode === 'granular') {
      // Asynchronous stereo micro-grain cloud scheduler
      const buf =
        cfg.sampleId === 'custom' && this.customSampleBuffers[cfg.id]
          ? this.customSampleBuffers[cfg.id]!
          : getOrBuildTs666SampleBuffer(
              ctx,
              cfg.sampleId === 'custom' ? 'warm_keys' : cfg.sampleId
            );

      const spawnGrain = () => {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const liveCfg = this.patch.oscillators[idx];
        if (!liveCfg.enabled) return;

        const gDur = clamp(liveCfg.grainSize, 0.015, 0.28);
        const gSrc = this.ctx.createBufferSource();
        gSrc.buffer = buf;
        const pitchShift =
          targetMidi + liveCfg.octave * 12 + liveCfg.semitone + liveCfg.coarse + liveCfg.fine / 100 - 48;
        const scatter = (Math.random() - 0.5) * liveCfg.detune * 0.15;
        gSrc.playbackRate.value = clamp(Math.pow(2, pitchShift / 12) * (1 + scatter), 0.2, 6);

        const gEnv = this.ctx.createGain();
        gEnv.gain.setValueAtTime(0.0001, t);
        gEnv.gain.linearRampToValueAtTime(0.55, t + gDur * 0.45);
        gEnv.gain.linearRampToValueAtTime(0.0001, t + gDur);

        const gPan = this.ctx.createStereoPanner();
        gPan.pan.value = (Math.random() * 2 - 1) * clamp(liveCfg.detune * 1.1, 0, 0.85);

        const posBase = clamp(liveCfg.wtPosition, 0, 0.88) * Math.max(0.1, buf.duration - gDur);
        const posRand = (Math.random() - 0.5) * liveCfg.random * 0.25;
        const startOffset = clamp(posBase + posRand, 0, Math.max(0.01, buf.duration - gDur - 0.02));

        gSrc.connect(gEnv).connect(gPan).connect(handle.gainNode);
        grainNodes.add(gSrc);
        gSrc.onended = () => {
          grainNodes.delete(gSrc);
          try {
            gSrc.disconnect();
            gEnv.disconnect();
            gPan.disconnect();
          } catch {}
        };
        gSrc.start(t, startOffset, gDur + 0.01);
      };

      spawnGrain();
      const intervalMs = clamp(Math.round(95 - cfg.density * 75), 22, 110);
      handle.grainTimer = window.setInterval(spawnGrain, intervalMs);
    }
  }

  private internalNoteOff(midi: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of this.voices) {
      if (voice.midi === midi && !voice.released) {
        this.releaseOrTrimVoice(voice, now, false);
      }
    }
  }

  private releaseOrTrimVoice(voice: ActiveVoice666, now: number, fastMonoKill: boolean): void {
    if (voice.released) return;
    voice.released = true;
    voice.releaseTime = now;
    voice.releaseStartEnvs = [...voice.envValues];

    if (voice.releaseCleanupTimer !== null) {
      window.clearTimeout(voice.releaseCleanupTimer);
      this.scheduledTimers.delete(voice.releaseCleanupTimer);
      voice.releaseCleanupTimer = null;
    }

    const relSec = fastMonoKill ? 0.018 : Math.max(0.008, this.patch.envelopes[0].release);
    const vcas = (voice.ampEnvGain as GainNode & { _vcas?: GainNode[] })._vcas ?? [];

    vcas.forEach((vca) => {
      try {
        vca.gain.cancelScheduledValues(now);
        const curr = Math.max(0.0001, vca.gain.value);
        vca.gain.setValueAtTime(curr, now);
        vca.gain.exponentialRampToValueAtTime(0.0001, now + relSec);
      } catch {
        // ignore
      }
    });

    const tid = window.setTimeout(() => {
      this.scheduledTimers.delete(tid);
      voice.releaseCleanupTimer = null;
      this.killVoiceImmediately(voice);
      this.voices = this.voices.filter((v) => v.id !== voice.id);
    }, Math.round((relSec + 0.04) * 1000));
    voice.releaseCleanupTimer = tid;
    this.scheduledTimers.add(tid);
  }

  private killVoiceImmediately(voice: ActiveVoice666): void {
    if (voice.releaseCleanupTimer !== null) {
      window.clearTimeout(voice.releaseCleanupTimer);
      this.scheduledTimers.delete(voice.releaseCleanupTimer);
      voice.releaseCleanupTimer = null;
    }

    voice.oscVoices.forEach((ov) => {
      if (ov.grainTimer !== null) window.clearInterval(ov.grainTimer);
      ov.periodicOscs.forEach((o) => {
        try { o.stop(); o.disconnect(); } catch {}
      });
      ov.activeGains.forEach((g) => { try { g.disconnect(); } catch {} });
      ov.unisonPans.forEach((p) => { try { p.disconnect(); } catch {} });
      if (ov.bufferSource) {
        try { ov.bufferSource.stop(); ov.bufferSource.disconnect(); } catch {}
      }
      try { ov.gainNode.disconnect(); ov.pannerNode.disconnect(); } catch {}
    });

    if (voice.subOsc) {
      try { voice.subOsc.stop(); voice.subOsc.disconnect(); } catch {}
    }
    if (voice.noiseSrc) {
      try { voice.noiseSrc.stop(); voice.noiseSrc.disconnect(); } catch {}
    }
    voice.grainNodes.forEach((n) => {
      try {
        (n as AudioBufferSourceNode).stop?.();
        n.disconnect();
      } catch {}
    });
    voice.grainNodes.clear();

    const vcas = (voice.ampEnvGain as GainNode & { _vcas?: GainNode[] })._vcas ?? [];
    vcas.forEach((vca) => { try { vca.disconnect(); } catch {} });

    disconnectFilterUnitNodes(voice.f1);
    disconnectFilterUnitNodes(voice.f2);

    try {
      voice.subGain.disconnect();
      voice.subPanner.disconnect();
      voice.noiseGain.disconnect();
      voice.noisePanner.disconnect();
      voice.srcToF1.forEach((g) => g.disconnect());
      voice.srcToF2.forEach((g) => g.disconnect());
      (['oscA', 'oscB', 'oscC', 'sub', 'noise'] as const).forEach((k) => {
        (['main', 'bus1', 'bus2'] as const).forEach((b) => {
          voice.srcToMixBus[k][b].disconnect();
        });
      });
      (['main', 'bus1', 'bus2'] as const).forEach((b) => {
        voice.f1ToBus[b].disconnect();
        voice.f2ToBus[b].disconnect();
      });
      voice.f1ToF2Serial.disconnect();
      voice.ampEnvGain.disconnect();
      voice.voiceRoot.disconnect();
    } catch {}
  }

  // =========================================================================
  // REAL-TIME MODULATION MATRIX + ENVELOPES + 10 LFOs + 2 CHAOS + 8 MACROS
  // =========================================================================

  private tickModulation(): void {
    const hasVoices = Boolean(this.ctx && this.voices.length > 0);
    const hasTelemetry = Boolean(this.telemetryListener);
    // Idle CPU sleep: when no voices are ringing and no UI listener or FX dirty update is pending, do zero work.
    if (!hasVoices && !hasTelemetry && !this.fxDirty) return;

    const nowPerf = performance.now();
    const dt = Math.min(0.08, Math.max(0.004, (nowPerf - this.lastTickTime) / 1000));
    this.lastTickTime = nowPerf;

    if (!hasVoices && !this.fxDirty) {
      // Only emit low-rate chaos/LFO visual telemetry at ~16fps when voices are silent
      if (hasTelemetry && nowPerf - this.lastTelemetryEmit >= 65) {
        this.lastTelemetryEmit = nowPerf;
        this.chaosTimer += dt;
        const c1Rate = Math.max(0.05, this.patch.global.chaos1.rateHz);
        const c2Rate = Math.max(0.05, this.patch.global.chaos2.rateHz);
        if (Math.random() < dt * c1Rate * 2.2) this.chaos1Target = Math.random() * 2 - 1;
        if (Math.random() < dt * c2Rate * 2.2) this.chaos2Target = Math.random() * 2 - 1;
        const c1Smooth = clamp(1 - this.patch.global.chaos1.smooth * 0.92, 0.04, 0.95);
        const c2Smooth = clamp(1 - this.patch.global.chaos2.smooth * 0.92, 0.04, 0.95);
        this.chaos1Val += (this.chaos1Target - this.chaos1Val) * c1Smooth * dt * 10;
        this.chaos2Val += (this.chaos2Target - this.chaos2Val) * c2Smooth * dt * 10;

        const macroOffsets: Ts666LiveModOffsets = {};
        for (const macro of this.patch.macros) {
          for (const b of macro.bindings) {
            macroOffsets[b.target] = (macroOffsets[b.target] ?? 0) + macro.value * b.amount;
          }
        }
        const displayPhases = this.patch.lfos.map((l) => {
          const hz = l.sync ? syncDivisionToHz(l.division, this.bpm) : l.rateHz;
          return ((nowPerf / 1000) * hz) % 1;
        });
        this.lastIdleBroadcasted = true;
        this.telemetryListener?.({
          offsets: macroOffsets,
          lfoPhases: displayPhases,
          envValues: [0, 0, 0, 0],
          chaosXY: [this.chaos1Val, this.chaos2Val],
          activeVoices: 0,
          activeArpStep: this.arpStepIdx,
          activeClipStep: this.clipStepIdx,
          growl: this.busFx?.getGrowlTelemetry() ?? null,
        });
      }
      return;
    }

    this.lastIdleBroadcasted = false;

    // 1. Update Global Chaos Attractors 1 & 2
    this.chaosTimer += dt;
    const c1Rate = Math.max(0.05, this.patch.global.chaos1.rateHz);
    const c2Rate = Math.max(0.05, this.patch.global.chaos2.rateHz);
    if (Math.random() < dt * c1Rate * 2.2) {
      this.chaos1Target = Math.random() * 2 - 1;
    }
    if (Math.random() < dt * c2Rate * 2.2) {
      this.chaos2Target = Math.random() * 2 - 1;
    }
    const c1Smooth = clamp(1 - this.patch.global.chaos1.smooth * 0.92, 0.04, 0.95);
    const c2Smooth = clamp(1 - this.patch.global.chaos2.smooth * 0.92, 0.04, 0.95);
    this.chaos1Val += (this.chaos1Target - this.chaos1Val) * c1Smooth * dt * 10;
    this.chaos2Val += (this.chaos2Target - this.chaos2Val) * c2Smooth * dt * 10;

    // Evaluate base macro offsets
    const macroOffsets: Ts666LiveModOffsets = {};
    for (const macro of this.patch.macros) {
      for (const b of macro.bindings) {
        macroOffsets[b.target] = (macroOffsets[b.target] ?? 0) + macro.value * b.amount;
      }
    }

    let firstVoiceOffsets: Ts666LiveModOffsets = { ...macroOffsets };
    let displayPhases = this.patch.lfos.map((l) => {
      const hz = l.sync ? syncDivisionToHz(l.division, this.bpm) : l.rateHz;
      return ((nowPerf / 1000) * hz) % 1;
    });
    let displayEnvs: [number, number, number, number] = [0, 0, 0, 0];

    if (this.ctx && this.voices.length > 0) {
      const now = this.ctx.currentTime;
      for (let vi = 0; vi < this.voices.length; vi++) {
        const v = this.voices[vi];
        const elapsed = Math.max(0, now - v.startTime);
        const relElapsed = v.released ? Math.max(0, now - v.releaseTime) : 0;

        // Envelopes 1..4
        for (let e = 0; e < 4; e++) {
          v.envValues[e] = evaluateEnvelope666(
            this.patch.envelopes[e],
            elapsed,
            v.released,
            relElapsed,
            v.releaseStartEnvs[e]
          );
        }

        // LFOs 1..10
        const lfoValues: number[] = [];
        for (let l = 0; l < this.patch.lfos.length; l++) {
          const cfg = this.patch.lfos[l];
          const hz = cfg.sync ? syncDivisionToHz(cfg.division, this.bpm) : cfg.rateHz;
          let phase = 0;
          if (cfg.anchored || cfg.mode === 'off') {
            phase = ((now * hz) % 1 + 1) % 1;
          } else {
            const delayElapsed = Math.max(0, elapsed - cfg.delay);
            if (cfg.mode === 'envelope') {
              phase = Math.min(1, delayElapsed * hz);
            } else {
              phase = ((delayElapsed * hz) % 1 + 1) % 1;
            }
          }
          v.lfoPhases[l] = phase;
          let rawVal = evaluateLfoShapePoint(cfg, phase);

          if (elapsed < cfg.delay && cfg.mode !== 'off' && !cfg.anchored) {
            rawVal = 0;
          } else if (cfg.rise > 0.005 && !cfg.anchored && cfg.mode !== 'off') {
            const riseGain = clamp((elapsed - cfg.delay) / cfg.rise, 0, 1);
            rawVal *= riseGain;
          }

          const smoothAlpha = clamp(1 - cfg.smooth * 0.9, 0.05, 1);
          v.lfoSmoothVals[l] += (rawVal - v.lfoSmoothVals[l]) * smoothAlpha;

          const outVal = cfg.bipolar ? v.lfoSmoothVals[l] : (v.lfoSmoothVals[l] + 1) * 0.5;
          lfoValues.push(outVal);
        }

        const getSourceVal = (src: Ts666ModSource): number => {
          switch (src) {
            case 'ENV1': return v.envValues[0];
            case 'ENV2': return v.envValues[1];
            case 'ENV3': return v.envValues[2];
            case 'ENV4': return v.envValues[3];
            case 'LFO1': return lfoValues[0] ?? 0;
            case 'LFO2': return lfoValues[1] ?? 0;
            case 'LFO3': return lfoValues[2] ?? 0;
            case 'LFO4': return lfoValues[3] ?? 0;
            case 'LFO5': return lfoValues[4] ?? 0;
            case 'LFO6': return lfoValues[5] ?? 0;
            case 'LFO7': return lfoValues[6] ?? 0;
            case 'LFO8': return lfoValues[7] ?? 0;
            case 'LFO9': return lfoValues[8] ?? 0;
            case 'LFO10': return lfoValues[9] ?? 0;
            case 'MACRO1': return this.patch.macros[0]?.value ?? 0;
            case 'MACRO2': return this.patch.macros[1]?.value ?? 0;
            case 'MACRO3': return this.patch.macros[2]?.value ?? 0;
            case 'MACRO4': return this.patch.macros[3]?.value ?? 0;
            case 'MACRO5': return this.patch.macros[4]?.value ?? 0;
            case 'MACRO6': return this.patch.macros[5]?.value ?? 0;
            case 'MACRO7': return this.patch.macros[6]?.value ?? 0;
            case 'MACRO8': return this.patch.macros[7]?.value ?? 0;
            case 'CHAOS1':
              return this.patch.global.chaos1.bipolar
                ? this.chaos1Val
                : (this.chaos1Val + 1) * 0.5;
            case 'CHAOS2':
              return this.patch.global.chaos2.bipolar
                ? this.chaos2Val
                : (this.chaos2Val + 1) * 0.5;
            case 'VELOCITY':
              return v.velocity;
            case 'KEYTRACK':
              return clamp((v.midi - 60) / 36, -1, 1);
            case 'MODWHEEL':
              return this.patch.performance.modWheelValue;
            case 'PITCHBEND':
              return this.patch.performance.pitchBendValue;
            case 'AFTERTOUCH':
              return v.velocity * 0.8;
            default:
              return 0;
          }
        };

        const offsets: Ts666LiveModOffsets = { ...macroOffsets };
        for (const route of this.patch.modMatrix) {
          if (!route.enabled) continue;
          let srcVal = getSourceVal(route.source);
          if (route.direction === 'bi' && route.source.startsWith('ENV')) {
            srcVal = srcVal * 2 - 1;
          }
          srcVal = applyModCurve666(srcVal, route.curve);
          const auxMul = route.auxSource === 'NONE' ? 1 : getSourceVal(route.auxSource);
          const contrib = srcVal * auxMul * route.amount;
          offsets[route.target] = (offsets[route.target] ?? 0) + contrib;
        }

        this.updateVoiceRealTime(v, offsets);

        if (vi === 0) {
          firstVoiceOffsets = offsets;
          displayPhases = [...v.lfoPhases];
          displayEnvs = [...v.envValues];
        }
      }
    }

    if (this.ctx && this.busFx) {
      this.busFx.sync(
        this.patch.fx,
        this.bpm,
        this.patch.global.oversampling,
        firstVoiceOffsets
      );
      this.fxDirty = false;
    }

    if (this.telemetryListener && nowPerf - this.lastTelemetryEmit >= 40) {
      this.lastTelemetryEmit = nowPerf;
      this.telemetryListener({
        offsets: firstVoiceOffsets,
        lfoPhases: displayPhases,
        envValues: displayEnvs,
        chaosXY: [this.chaos1Val, this.chaos2Val],
        activeVoices: this.voices.length,
        activeArpStep: this.arpStepIdx,
        activeClipStep: this.clipStepIdx,
        growl: this.busFx?.getGrowlTelemetry() ?? null,
      });
    }
  }

  private updateVoiceRealTime(
    voice: ActiveVoice666,
    off: Ts666LiveModOffsets,
    scheduleAt?: number
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = scheduleAt ?? ctx.currentTime;
    const vc = voice.numCache;
    const perf = this.patch.performance;
    const pbSemis =
      perf.pitchBendValue >= 0
        ? perf.pitchBendValue * perf.pitchBendUp
        : perf.pitchBendValue * perf.pitchBendDown;

    // 1. Oscillators A, B, C
    for (const ov of voice.oscVoices) {
      const idx = ov.index;
      const oc = ov.numCache;
      const cfg = this.patch.oscillators[idx];
      const prefix = idx === 0 ? 'OSC_A' : idx === 1 ? 'OSC_B' : 'OSC_C';
      const modOct = Math.round((off[`${prefix}_OCT` as Ts666ModTarget] ?? 0) * 4);
      const modSemi = (off[`${prefix}_SEMI` as Ts666ModTarget] ?? 0) * 12;
      const modFine = (off[`${prefix}_FINE` as Ts666ModTarget] ?? 0) * 100;
      const modCoarse = (off[`${prefix}_COARSE` as Ts666ModTarget] ?? 0) * 64;
      const modWt = clamp(cfg.wtPosition + (off[`${prefix}_WT` as Ts666ModTarget] ?? 0), 0, 1);
      const modWarp1 = clamp(cfg.warp1Amount + (off[`${prefix}_WARP1` as Ts666ModTarget] ?? 0), 0, 1);
      const modWarp2 = clamp(cfg.warp2Amount + (off[`${prefix}_WARP2` as Ts666ModTarget] ?? 0), 0, 1);
      const modPan = clamp(cfg.pan + (off[`${prefix}_PAN` as Ts666ModTarget] ?? 0), -1, 1);
      const modLvl = clamp(cfg.level + (off[`${prefix}_LEVEL` as Ts666ModTarget] ?? 0), 0, 1);
      const modDetune = clamp(cfg.detune + (off[`${prefix}_DETUNE` as Ts666ModTarget] ?? 0) * 0.5, 0, 1);
      const modPhase = (cfg.phase + (off[`${prefix}_PHASE` as Ts666ModTarget] ?? 0) * 360) % 360;

      setTargetCached(oc, 'lvl', ov.gainNode.gain, cfg.enabled ? modLvl * 0.45 : 0, now, 0.015);
      setTargetCached(oc, 'pan', ov.pannerNode.pan, modPan, now, 0.015);

      const totalSemis =
        (cfg.octave + modOct) * 12 +
        cfg.semitone +
        modSemi +
        cfg.coarse +
        modCoarse +
        (cfg.fine + modFine) / 100 +
        pbSemis;

      const targetFreq = midiToMicrotunedFreq(
        voice.midi + totalSemis,
        this.patch.global.masterTuningHz,
        this.patch.global.microtuningCents
      );

      if (ov.periodicOscs.length > 0 && (cfg.mode === 'wavetable' || cfg.mode === 'spectral')) {
        const pw =
          cfg.mode === 'spectral'
            ? getSpectralPeriodicWave(
                ctx,
                cfg.wavetableId,
                cfg.customWavetable,
                modWt,
                clamp(cfg.grainSize + (off[`${prefix}_GRAIN_SIZE` as Ts666ModTarget] ?? 0) * 0.2, 0.01, 0.3),
                clamp(cfg.density + (off[`${prefix}_DENSITY` as Ts666ModTarget] ?? 0), 0, 1),
                cfg.warp1Mode,
                modWarp1,
                modPhase
              )
            : getOrCreateTs666PeriodicWave(
                ctx,
                cfg.wavetableId,
                cfg.customWavetable,
                modWt,
                cfg.warp1Mode,
                modWarp1,
                cfg.warp2Mode,
                modWarp2,
                modPhase
              );

        const waveChanged = ov.lastPw !== pw;
        if (waveChanged) ov.lastPw = pw;
        const count = ov.periodicOscs.length;
        for (let u = 0; u < count; u++) {
          const osc = ov.periodicOscs[u];
          if (waveChanged) osc.setPeriodicWave(pw);
          setTargetCached(oc, `f${u}`, osc.frequency, targetFreq, now, 0.018, 0.02);
          const spreadNorm = count === 1 ? 0 : (u / (count - 1)) * 2 - 1;
          setTargetCached(oc, `d${u}`, osc.detune, spreadNorm * modDetune * 42, now, 0.02, 0.05);
        }
      } else if (ov.bufferSource) {
        const rate = clamp(Math.pow(2, (voice.midi + totalSemis - ov.chosenRootMidi) / 12), 0.1, 8);
        setTargetCached(oc, 'rate', ov.bufferSource.playbackRate, rate, now, 0.02, 0.0005);
      }
    }

    // 2. SUB
    const subLvl = clamp(this.patch.sub.level + (off.SUB_LEVEL ?? 0), 0, 1);
    const subPan = clamp(this.patch.sub.pan + (off.SUB_PAN ?? 0), -1, 1);
    const subOct = Math.round(this.patch.sub.octave + (off.SUB_OCTAVE ?? 0) * 2);
    setTargetCached(vc, 'subL', voice.subGain.gain, this.patch.sub.enabled ? subLvl * 0.48 : 0, now, 0.015);
    setTargetCached(vc, 'subP', voice.subPanner.pan, subPan, now, 0.015);
    if (voice.subOsc) {
      const subFreq = midiToMicrotunedFreq(
        voice.midi + subOct * 12 + pbSemis,
        this.patch.global.masterTuningHz,
        this.patch.global.microtuningCents
      );
      setTargetCached(vc, 'subF', voice.subOsc.frequency, subFreq, now, 0.018, 0.02);
    }

    // 3. NOISE
    const nLvl = clamp(this.patch.noise.level + (off.NOISE_LEVEL ?? 0), 0, 1);
    const nPan = clamp(this.patch.noise.pan + (off.NOISE_PAN ?? 0), -1, 1);
    setTargetCached(vc, 'nL', voice.noiseGain.gain, this.patch.noise.enabled ? nLvl * 0.42 : 0, now, 0.015);
    setTargetCached(vc, 'nP', voice.noisePanner.pan, nPan, now, 0.015);

    // 4. DUAL FILTER + LINK + SERIAL/PARALLEL/INDEPENDENT + MIX BUS ROUTING
    const f1Cfg = this.patch.filters[0];
    const f2Cfg = this.patch.filters[1];
    const f1Cut = f1Cfg.cutoff * Math.pow(2, (off.F1_CUTOFF ?? 0) * 5.5);
    const f1Res = f1Cfg.resonance + (off.F1_RES ?? 0) * 10;
    const f1Pan = f1Cfg.pan + (off.F1_PAN ?? 0);
    const f1Drive = f1Cfg.drive + (off.F1_DRIVE ?? 0);
    const f1Fat = f1Cfg.fat + (off.F1_FAT ?? 0);
    const f1Mix = f1Cfg.mix + (off.F1_MIX ?? 0);

    const f2BaseCut = this.patch.filterLink ? f1Cfg.cutoff : f2Cfg.cutoff;
    const f2Cut = f2BaseCut * Math.pow(2, ((this.patch.filterLink ? off.F1_CUTOFF : off.F2_CUTOFF) ?? 0) * 5.5);
    const f2Res = f2Cfg.resonance + (off.F2_RES ?? 0) * 10;
    const f2Pan = f2Cfg.pan + (off.F2_PAN ?? 0);
    const f2Drive = f2Cfg.drive + (off.F2_DRIVE ?? 0);
    const f2Fat = f2Cfg.fat + (off.F2_FAT ?? 0);
    const f2Mix = f2Cfg.mix + (off.F2_MIX ?? 0);

    updateFilterUnitNodes(
      voice.f1,
      f1Cfg,
      f1Cut,
      f1Res,
      f1Pan,
      f1Drive,
      f1Fat,
      f1Mix,
      this.patch.global.oversampling,
      now
    );
    updateFilterUnitNodes(
      voice.f2,
      f2Cfg,
      f2Cut,
      f2Res,
      f2Pan,
      f2Drive,
      f2Fat,
      f2Mix,
      this.patch.global.oversampling,
      now
    );

    const mix = this.patch.mix;
    const anySolo =
      mix.oscA.solo ||
      mix.oscB.solo ||
      mix.oscC.solo ||
      mix.sub.solo ||
      mix.noise.solo ||
      mix.filter1.solo ||
      mix.filter2.solo;

    const chanAudible = (ch: { mute: boolean; solo: boolean; volume: number }) =>
      ch.mute ? 0 : anySolo && !ch.solo ? 0 : ch.volume;

    const rF1Flags = [f1Cfg.routeA, f1Cfg.routeB, f1Cfg.routeC, f1Cfg.routeN, f1Cfg.routeS];
    const rF2Flags = [f2Cfg.routeA, f2Cfg.routeB, f2Cfg.routeC, f2Cfg.routeN, f2Cfg.routeS];
    const srcChannels = [mix.oscA, mix.oscB, mix.oscC, mix.noise, mix.sub];
    const srcKeys: ('oscA' | 'oscB' | 'oscC' | 'noise' | 'sub')[] = [
      'oscA',
      'oscB',
      'oscC',
      'noise',
      'sub',
    ];
    const isDirectOut = [false, false, false, this.patch.noise.directOut, this.patch.sub.directOut];

    const buses: Ts666BusId[] = ['main', 'bus1', 'bus2'];
    const routingMode = this.patch.filterRouting;

    for (let s = 0; s < 5; s++) {
      const chGain = chanAudible(srcChannels[s]);
      const goF1 = f1Cfg.enabled && rF1Flags[s] && !isDirectOut[s];
      const goF2 =
        f2Cfg.enabled &&
        rF2Flags[s] &&
        !isDirectOut[s] &&
        (routingMode === 'parallel' || routingMode === 'independent' || !goF1);

      setTargetCached(vc, `s1_${s}`, voice.srcToF1[s].gain, goF1 ? chGain : 0, now, 0.012);
      setTargetCached(vc, `s2_${s}`, voice.srcToF2[s].gain, goF2 ? chGain : 0, now, 0.012);

      const directDry = !goF1 && !goF2 ? chGain : 0;
      const targetBus = srcChannels[s].bus;
      const key = srcKeys[s];
      for (let bi = 0; bi < buses.length; bi++) {
        const b = buses[bi];
        setTargetCached(
          vc,
          `sb_${s}_${b}`,
          voice.srcToMixBus[key][b].gain,
          b === targetBus ? directDry : 0,
          now,
          0.012
        );
      }
    }

    const isSerial = routingMode === 'serial' && f1Cfg.enabled && f2Cfg.enabled;
    setTargetCached(vc, 'f12ser', voice.f1ToF2Serial.gain, isSerial ? 1 : 0, now, 0.012);

    const f1Gain = f1Cfg.enabled && !isSerial ? chanAudible(mix.filter1) : 0;
    const f2Gain = f2Cfg.enabled ? chanAudible(mix.filter2) : 0;

    for (let bi = 0; bi < buses.length; bi++) {
      const b = buses[bi];
      setTargetCached(vc, `f1b_${b}`, voice.f1ToBus[b].gain, b === mix.filter1.bus ? f1Gain : 0, now, 0.012);
      setTargetCached(vc, `f2b_${b}`, voice.f2ToBus[b].gain, b === mix.filter2.bus ? f2Gain : 0, now, 0.012);
    }
  }

  // =========================================================================
  // ARPEGGIATOR & CLIP SEQUENCER REAL-TIME AUDIO CLOCK
  // =========================================================================

  private tickArpAndClipSeq(): void {
    if (!this.ctx) return;
    if (!this.patch.clipSeq.enabled && !(this.patch.arp.enabled && this.heldArpNotes.length > 0)) {
      return;
    }
    const now = this.ctx.currentTime;

    // 1. Clip Sequencer
    if (this.patch.clipSeq.enabled) {
      const seq = this.patch.clipSeq;
      const divBeats = seq.division === '1/8' ? 0.5 : seq.division === '1/32' ? 0.125 : 0.25;
      const stepDur = (60 / this.bpm) * divBeats;

      if (this.nextClipTime < now - 0.5 || this.nextClipTime === 0) {
        this.nextClipTime = now;
      }
      if (now >= this.nextClipTime) {
        const idx = this.clipStepIdx % seq.stepCount;
        const step = seq.steps[idx];
        if (this.activeClipMidi !== null) {
          this.internalNoteOff(this.activeClipMidi);
          this.activeClipMidi = null;
        }
        if (step && step.active) {
          this.internalNoteOn(step.midi, step.velocity);
          this.activeClipMidi = step.midi;
        }
        const swingOffset = idx % 2 === 1 ? seq.swing * stepDur * 0.5 : 0;
        this.clipStepIdx = (idx + 1) % seq.stepCount;
        this.nextClipTime = now + stepDur + swingOffset;
      }
    }

    // 2. Arpeggiator
    if (this.patch.arp.enabled && this.heldArpNotes.length > 0) {
      const arp = this.patch.arp;
      const hz = arp.sync ? syncDivisionToHz(arp.division, this.bpm) : arp.rateHz;
      const stepDur = 1 / Math.max(0.25, hz);

      if (this.nextArpTime < now - 0.5 || this.nextArpTime === 0) {
        this.nextArpTime = now;
      }
      if (now >= this.nextArpTime) {
        // Build expanded octave pool
        const baseNotes =
          arp.mode === 'order' ? [...this.heldArpNotes] : [...this.heldArpNotes].sort((a, b) => a - b);
        const pool: number[] = [];
        for (let oct = 0; oct < arp.octaves; oct++) {
          for (const n of baseNotes) pool.push(n + oct * 12);
        }

        if (this.arpActiveMidi !== null) {
          this.internalNoteOff(this.arpActiveMidi);
          this.arpActiveMidi = null;
        }

        if (arp.mode === 'chord') {
          for (const n of baseNotes) {
            this.internalNoteOn(n, 0.85);
            window.setTimeout(() => this.internalNoteOff(n), Math.round(stepDur * clamp(arp.gate, 0.1, 1.2) * 1000));
          }
        } else if (pool.length > 0) {
          let chosenIdx = this.arpStepIdx % pool.length;
          if (arp.mode === 'down') {
            chosenIdx = pool.length - 1 - (this.arpStepIdx % pool.length);
          } else if (arp.mode === 'random') {
            chosenIdx = Math.floor(Math.random() * pool.length);
          } else if (arp.mode === 'up_down' && pool.length > 1) {
            if (this.arpStepIdx >= pool.length - 1) this.arpDirectionSign = -1;
            if (this.arpStepIdx <= 0) this.arpDirectionSign = 1;
            chosenIdx = clamp(this.arpStepIdx, 0, pool.length - 1);
          }
          const noteToPlay = pool[chosenIdx];
          this.internalNoteOn(noteToPlay, 0.85);
          this.arpActiveMidi = noteToPlay;
          const gateMs = Math.max(25, Math.round(stepDur * clamp(arp.gate, 0.1, 0.98) * 1000));
          window.setTimeout(() => {
            if (this.arpActiveMidi === noteToPlay) {
              this.internalNoteOff(noteToPlay);
              this.arpActiveMidi = null;
            }
          }, gateMs);

          if (arp.mode === 'up_down' && pool.length > 1) {
            this.arpStepIdx += this.arpDirectionSign;
          } else {
            this.arpStepIdx = (this.arpStepIdx + 1) % pool.length;
          }
        }

        const swingMs = (this.arpStepIdx % 2 === 1 ? arp.swing * stepDur * 0.45 : 0);
        this.nextArpTime = now + stepDur + swingMs;
      }
    }
  }
}

export const sixSixSixEngine = new SixSixSixEngine();
