import type {
  SubbassFxConfig,
  SubbassFxId,
  SubbassPatch,
  SubbassPhaseDeg,
} from '../types/subbass';
import { anchorParamForLinearRamp, holdAudioParamAt, studioAudio } from './StudioAudio';
import {
  createDefaultSubbassFxConfig,
  createDefaultSubbassPatch,
  normToCrossoverHz,
} from './subbassPresets';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function isTouchMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

const satCurveCache = new Map<number, Float32Array<ArrayBuffer>>();
const tubeCurveCache = new Map<number, Float32Array<ArrayBuffer>>();
const diodeCurveCache = new Map<number, Float32Array<ArrayBuffer>>();
const softClipCurveCache = new Map<string, Float32Array<ArrayBuffer>>();
const waveCache = new Map<string, PeriodicWave>();

const HARMONIC_FX_SET = new Set<SubbassFxId>([
  'tube',
  'diode',
  'softClip',
  'waveshaper',
]);

const MASTER_FX_SET = new Set<SubbassFxId>([
  'eq',
  'lowpass',
  'compressor',
  'sidechain',
  'stereo',
]);

function getSubSaturationCurve(amount01: number): Float32Array<ArrayBuffer> {
  const q = Math.round(clamp(amount01, 0, 1) * 32);
  const cached = satCurveCache.get(q);
  if (cached) return cached;

  const amt = q / 32;
  const samples = 512;
  const buf = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buf);
  const drive = 1 + amt * 9.5;

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    const asym = x + amt * 0.12 * x * x;
    const driven = Math.tanh(asym * drive) / Math.tanh(drive);
    curve[i] = clamp(driven, -1, 1);
  }
  satCurveCache.set(q, curve);
  return curve;
}

function getTubeSaturationCurve(drive01: number): Float32Array<ArrayBuffer> {
  const q = Math.round(clamp(drive01, 0, 1) * 32);
  const cached = tubeCurveCache.get(q);
  if (cached) return cached;

  const amt = q / 32;
  const samples = 512;
  const buf = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buf);
  const k = 1.4 + amt * 6.8;

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    // Asymmetric warm vacuum-tube bias creates rich 2nd + 3rd order harmonics
    const biased = x + 0.16 * amt * (x * x - 0.15);
    const y = Math.tanh(biased * k) / Math.tanh(k * 1.05);
    curve[i] = clamp(y, -1, 1);
  }
  tubeCurveCache.set(q, curve);
  return curve;
}

function getDiodeDistortionCurve(drive01: number): Float32Array<ArrayBuffer> {
  const q = Math.round(clamp(drive01, 0, 1) * 32);
  const cached = diodeCurveCache.get(q);
  if (cached) return cached;

  const amt = q / 32;
  const samples = 512;
  const buf = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buf);
  const gain = 1.5 + amt * 12;

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    const v = x * gain;
    // Asymmetric silicon/germanium diode clipping curve
    const shaped =
      v >= 0
        ? (1 - Math.exp(-v * 1.35)) * 0.92
        : -(1 - Math.exp(v * 0.95)) * 0.86;
    curve[i] = clamp(shaped, -1, 1);
  }
  diodeCurveCache.set(q, curve);
  return curve;
}

function getSoftClipperCurve(
  threshold01: number,
  amount01: number
): Float32Array<ArrayBuffer> {
  const tq = Math.round(clamp(threshold01, 0, 1) * 24);
  const aq = Math.round(clamp(amount01, 0, 1) * 24);
  const key = `${tq}:${aq}`;
  const cached = softClipCurveCache.get(key);
  if (cached) return cached;

  const thresh = 0.92 - (tq / 24) * 0.68; // 0.92 down to 0.24
  const hardness = 1.4 + (aq / 24) * 8.5;
  const samples = 512;
  const buf = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buf);

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    const absX = Math.abs(x);
    if (absX <= thresh) {
      curve[i] = x;
    } else {
      const sign = x >= 0 ? 1 : -1;
      const excess = (absX - thresh) / Math.max(0.08, 1 - thresh);
      const knee = Math.tanh(excess * hardness) * (1 - thresh);
      curve[i] = clamp(sign * (thresh + knee), -1, 1);
    }
  }
  softClipCurveCache.set(key, curve);
  return curve;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function buildWaveshaperCustomCurve(points: number[]): Float32Array<ArrayBuffer> {
  const safe =
    points.length === 9
      ? points.map((v) => clamp(v, -1, 1))
      : [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  const samples = 512;
  const buf = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buf);
  const segCount = safe.length - 1;

  for (let i = 0; i < samples; i++) {
    const u = (i / (samples - 1)) * segCount;
    const idx = Math.min(segCount - 1, Math.floor(u));
    const localT = u - idx;
    const p0 = safe[Math.max(0, idx - 1)];
    const p1 = safe[idx];
    const p2 = safe[Math.min(segCount, idx + 1)];
    const p3 = safe[Math.min(segCount, idx + 2)];
    curve[i] = clamp(catmullRom(p0, p1, p2, p3, localT), -1, 1);
  }
  return curve;
}

function buildPhasedWave(
  ctx: AudioContext,
  shape: 'sine' | 'triangle' | 'square',
  phaseDeg: SubbassPhaseDeg
): PeriodicWave {
  const key = `${ctx.sampleRate}:${shape}:${phaseDeg}`;
  const cached = waveCache.get(key);
  if (cached) return cached;

  const harmonics = shape === 'sine' ? 2 : 24;
  const real = new Float32Array(harmonics);
  const imag = new Float32Array(harmonics);
  const phaseRad = (phaseDeg * Math.PI) / 180;

  for (let n = 1; n < harmonics; n++) {
    let amp = 0;
    if (shape === 'sine') {
      amp = n === 1 ? 1 : 0;
    } else if (shape === 'triangle') {
      if (n % 2 === 1) {
        const sign = ((n - 1) / 2) % 2 === 0 ? 1 : -1;
        amp = sign * (8 / (Math.PI * Math.PI * n * n));
      }
    } else {
      if (n % 2 === 1) {
        amp = 4 / (Math.PI * n);
      }
    }
    if (amp !== 0) {
      const p = n * phaseRad;
      real[n] = amp * Math.sin(p);
      imag[n] = amp * Math.cos(p);
    }
  }

  const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  waveCache.set(key, wave);
  return wave;
}

export class SubbassEngine {
  private ctx: AudioContext | null = null;
  private ensureInFlight: Promise<AudioContext> | null = null;
  private patch: SubbassPatch = createDefaultSubbassPatch();
  private bpm = 124;
  private fxBypass = false;
  private isMuted = false;

  // Persistent zero-allocation monophonic oscillators
  private sineOsc: OscillatorNode | null = null;
  private triOsc: OscillatorNode | null = null;
  private sqrOsc: OscillatorNode | null = null;

  // Section A: Clean Sub Path (preserves pure sine/triangle fundamental)
  private cleanSineGain: GainNode | null = null;
  private cleanTriGain: GainNode | null = null;
  private cleanEnvGain: GainNode | null = null;
  private cleanDcBlocker: BiquadFilterNode | null = null;
  private cleanBlendGain: GainNode | null = null;

  // Section B: Harmonic Layer Path (parallel saturation & distortion)
  private harmSineGain: GainNode | null = null;
  private harmTriGain: GainNode | null = null;
  private harmSqrGain: GainNode | null = null;
  private harmOscSum: GainNode | null = null;
  private coreShaper: WaveShaperNode | null = null;
  private coreShaperBypassed = false;
  private coreShaperMakeup: GainNode | null = null;
  private coreDcBlocker: BiquadFilterNode | null = null;
  private coreLowpass: BiquadFilterNode | null = null;
  private harmEnvGain: GainNode | null = null;
  private harmBlendGain: GainNode | null = null;

  // Summing & Master Safety Stage
  private fxSumBus: GainNode | null = null;
  private masterDcBlocker: BiquadFilterNode | null = null;
  private masterSafetyLimiter: DynamicsCompressorNode | null = null;
  private outputGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  // FX Module 1: Tube Saturation
  private tubeIn: GainNode | null = null;
  private tubeDryGain: GainNode | null = null;
  private tubeDriveGain: GainNode | null = null;
  private tubeShaper: WaveShaperNode | null = null;
  private tubeDcBlock: BiquadFilterNode | null = null;
  private tubeWetGain: GainNode | null = null;
  private tubeOut: GainNode | null = null;

  // FX Module 2: Diode Distortion
  private diodeIn: GainNode | null = null;
  private diodeDryGain: GainNode | null = null;
  private diodeDriveGain: GainNode | null = null;
  private diodeShaper: WaveShaperNode | null = null;
  private diodeToneFilter: BiquadFilterNode | null = null;
  private diodeDcBlock: BiquadFilterNode | null = null;
  private diodeWetGain: GainNode | null = null;
  private diodeOut: GainNode | null = null;

  // FX Module 3: Soft Clipper
  private softClipIn: GainNode | null = null;
  private softClipShaper: WaveShaperNode | null = null;
  private softClipDcBlock: BiquadFilterNode | null = null;
  private softClipOutGain: GainNode | null = null;
  private softClipOut: GainNode | null = null;

  // FX Module 4: Waveshaper (Editable Curve)
  private wsIn: GainNode | null = null;
  private wsDryGain: GainNode | null = null;
  private wsDriveGain: GainNode | null = null;
  private wsShaper: WaveShaperNode | null = null;
  private wsDcBlock: BiquadFilterNode | null = null;
  private wsWetGain: GainNode | null = null;
  private wsOut: GainNode | null = null;

  // FX Module 5: Parametric EQ
  private eqIn: GainNode | null = null;
  private eqLowShelf: BiquadFilterNode | null = null;
  private eqMidPeak: BiquadFilterNode | null = null;
  private eqHighShelf: BiquadFilterNode | null = null;
  private eqOut: GainNode | null = null;

  // FX Module 6: Low Pass Filter
  private lpfIn: GainNode | null = null;
  private lpfStage1: BiquadFilterNode | null = null;
  private lpfStage2: BiquadFilterNode | null = null;
  private lpfOut: GainNode | null = null;

  // FX Module 7: Compressor
  private compIn: GainNode | null = null;
  private compNode: DynamicsCompressorNode | null = null;
  private compMakeupGain: GainNode | null = null;
  private compOut: GainNode | null = null;

  // FX Module 8: Sidechain (BEATBOX Kick + BPM)
  private scIn: GainNode | null = null;
  private scDuckGain: GainNode | null = null;
  private scOut: GainNode | null = null;

  // FX Module 9: Mono / Stereo Control
  private stereoIn: GainNode | null = null;
  private stereoLow1: BiquadFilterNode | null = null;
  private stereoLow2: BiquadFilterNode | null = null;
  private stereoLowMono: GainNode | null = null;
  private stereoHigh1: BiquadFilterNode | null = null;
  private stereoHigh2: BiquadFilterNode | null = null;
  private stereoHighMidGain: GainNode | null = null;
  private stereoHighAllpassL: BiquadFilterNode | null = null;
  private stereoHighAllpassR: BiquadFilterNode | null = null;
  private stereoSideLPos: GainNode | null = null;
  private stereoSideLNeg: GainNode | null = null;
  private stereoSideRPos: GainNode | null = null;
  private stereoSideRNeg: GainNode | null = null;
  private stereoMerger: ChannelMergerNode | null = null;
  private stereoOut: GainNode | null = null;

  // Monophonic last-note priority stack
  private heldMidis: number[] = [];
  private activeMidi: number | null = null;
  private hasPlayedNote = false;
  private lastPhase: SubbassPhaseDeg | null = null;
  private lastSatQuant = -1;
  private lastTubeQuant = -1;
  private lastDiodeQuant = -1;
  private lastSoftClipKey = '';
  private lastWaveshaperKey = '';
  private lastRoutingKey = '';
  private paramCache: Record<string, number> = {};

  // Telemetry for live UI meters
  private lastScTriggerMs = 0;
  private lastScDurationMs = 240;
  private lastScDepth = 0;

  constructor() {
    studioAudio.onContextReset(() => {
      this.teardownGraph();
    });
    studioAudio.onKickTrigger((when, vel) => {
      this.triggerSidechainDuck(when, vel);
    });
  }

  private getFxConfig(): SubbassFxConfig {
    return this.patch.fx ?? createDefaultSubbassFxConfig();
  }

  private teardownGraph(): void {
    const oscs = [this.sineOsc, this.triOsc, this.sqrOsc];
    for (const o of oscs) {
      if (o) {
        try {
          o.stop();
          o.disconnect();
        } catch {
          // ignore
        }
      }
    }
    this.sineOsc = null;
    this.triOsc = null;
    this.sqrOsc = null;

    this.cleanSineGain = null;
    this.cleanTriGain = null;
    this.cleanEnvGain = null;
    this.cleanDcBlocker = null;
    this.cleanBlendGain = null;

    this.harmSineGain = null;
    this.harmTriGain = null;
    this.harmSqrGain = null;
    this.harmOscSum = null;
    this.coreShaper = null;
    this.coreShaperBypassed = false;
    this.coreShaperMakeup = null;
    this.coreDcBlocker = null;
    this.coreLowpass = null;
    this.harmEnvGain = null;
    this.harmBlendGain = null;

    this.fxSumBus = null;
    this.masterDcBlocker = null;
    this.masterSafetyLimiter = null;
    this.outputGain = null;
    this.analyser = null;

    this.tubeIn = null;
    this.tubeDryGain = null;
    this.tubeDriveGain = null;
    this.tubeShaper = null;
    this.tubeDcBlock = null;
    this.tubeWetGain = null;
    this.tubeOut = null;

    this.diodeIn = null;
    this.diodeDryGain = null;
    this.diodeDriveGain = null;
    this.diodeShaper = null;
    this.diodeToneFilter = null;
    this.diodeDcBlock = null;
    this.diodeWetGain = null;
    this.diodeOut = null;

    this.softClipIn = null;
    this.softClipShaper = null;
    this.softClipDcBlock = null;
    this.softClipOutGain = null;
    this.softClipOut = null;

    this.wsIn = null;
    this.wsDryGain = null;
    this.wsDriveGain = null;
    this.wsShaper = null;
    this.wsDcBlock = null;
    this.wsWetGain = null;
    this.wsOut = null;

    this.eqIn = null;
    this.eqLowShelf = null;
    this.eqMidPeak = null;
    this.eqHighShelf = null;
    this.eqOut = null;

    this.lpfIn = null;
    this.lpfStage1 = null;
    this.lpfStage2 = null;
    this.lpfOut = null;

    this.compIn = null;
    this.compNode = null;
    this.compMakeupGain = null;
    this.compOut = null;

    this.scIn = null;
    this.scDuckGain = null;
    this.scOut = null;

    this.stereoIn = null;
    this.stereoLow1 = null;
    this.stereoLow2 = null;
    this.stereoLowMono = null;
    this.stereoHigh1 = null;
    this.stereoHigh2 = null;
    this.stereoHighMidGain = null;
    this.stereoHighAllpassL = null;
    this.stereoHighAllpassR = null;
    this.stereoSideLPos = null;
    this.stereoSideLNeg = null;
    this.stereoSideRPos = null;
    this.stereoSideRNeg = null;
    this.stereoMerger = null;
    this.stereoOut = null;

    this.ctx = null;
    this.heldMidis = [];
    this.activeMidi = null;
    this.hasPlayedNote = false;
    this.lastPhase = null;
    this.lastSatQuant = -1;
    this.lastTubeQuant = -1;
    this.lastDiodeQuant = -1;
    this.lastSoftClipKey = '';
    this.lastWaveshaperKey = '';
    this.lastRoutingKey = '';
    this.paramCache = {};
    waveCache.clear();
  }

  private smoothParam(
    key: string,
    param: AudioParam,
    val: number,
    now: number,
    tau: number,
    force = false,
    eps = 0.0005
  ): void {
    const prev = this.paramCache[key];
    if (!force && prev !== undefined && Math.abs(prev - val) <= eps) return;
    this.paramCache[key] = val;
    param.setTargetAtTime(val, now, tau);
  }

  public async ensureAudio(): Promise<AudioContext> {
    if (this.ctx && this.cleanEnvGain && (this.ctx.state as string) === 'running') {
      return this.ctx;
    }
    if (this.ensureInFlight) return this.ensureInFlight;

    this.ensureInFlight = (async () => {
      try {
        const ctx = await studioAudio.ensureAudio();
        if (this.ctx !== ctx || !this.cleanEnvGain) {
          this.buildGraph(ctx);
        }
        return ctx;
      } finally {
        this.ensureInFlight = null;
      }
    })();

    return this.ensureInFlight;
  }

  private createDcBlocker(ctx: AudioContext): BiquadFilterNode {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 18;
    f.Q.value = 0.707;
    return f;
  }

  private buildGraph(ctx: AudioContext): void {
    this.teardownGraph();
    this.ctx = ctx;
    const now = ctx.currentTime;
    const shaperOversample: OverSampleType = isTouchMobileDevice() ? 'none' : '2x';

    this.sineOsc = ctx.createOscillator();
    this.triOsc = ctx.createOscillator();
    this.sqrOsc = ctx.createOscillator();

    // --- Section A: Clean Sub Path (pure fundamental) ---
    this.cleanSineGain = ctx.createGain();
    this.cleanTriGain = ctx.createGain();
    const cleanOscSum = ctx.createGain();
    cleanOscSum.gain.setValueAtTime(0.85, now);
    this.cleanEnvGain = ctx.createGain();
    this.cleanEnvGain.gain.setValueAtTime(0.00001, now);
    this.cleanDcBlocker = this.createDcBlocker(ctx);
    this.cleanBlendGain = ctx.createGain();

    this.sineOsc.connect(this.cleanSineGain);
    this.triOsc.connect(this.cleanTriGain);
    this.cleanSineGain.connect(cleanOscSum);
    this.cleanTriGain.connect(cleanOscSum);
    cleanOscSum.connect(this.cleanEnvGain);
    this.cleanEnvGain.connect(this.cleanDcBlocker);
    this.cleanDcBlocker.connect(this.cleanBlendGain);

    // --- Section B: Harmonic Layer Path ---
    this.harmSineGain = ctx.createGain();
    this.harmTriGain = ctx.createGain();
    this.harmSqrGain = ctx.createGain();
    const harmOscSum = ctx.createGain();
    harmOscSum.gain.setValueAtTime(0.85, now);
    this.harmOscSum = harmOscSum;

    this.coreShaper = ctx.createWaveShaper();
    this.coreShaper.oversample = shaperOversample;
    this.coreShaperMakeup = ctx.createGain();
    this.coreDcBlocker = this.createDcBlocker(ctx);
    this.coreLowpass = ctx.createBiquadFilter();
    this.coreLowpass.type = 'lowpass';
    this.coreLowpass.Q.value = 1.25;
    this.harmEnvGain = ctx.createGain();
    this.harmEnvGain.gain.setValueAtTime(0.00001, now);
    this.harmBlendGain = ctx.createGain();

    this.sineOsc.connect(this.harmSineGain);
    this.triOsc.connect(this.harmTriGain);
    this.sqrOsc.connect(this.harmSqrGain);
    this.harmSineGain.connect(harmOscSum);
    this.harmTriGain.connect(harmOscSum);
    this.harmSqrGain.connect(harmOscSum);
    this.coreShaperBypassed = this.patch.saturation < 0.015;
    if (this.coreShaperBypassed) {
      harmOscSum.connect(this.coreShaperMakeup);
    } else {
      harmOscSum.connect(this.coreShaper);
      this.coreShaper.connect(this.coreShaperMakeup);
    }
    this.coreShaperMakeup.connect(this.coreDcBlocker);
    this.coreDcBlocker.connect(this.coreLowpass);
    this.coreLowpass.connect(this.harmEnvGain);
    this.harmEnvGain.connect(this.harmBlendGain);

    // --- 9 FX Subgraphs ---
    // 1. Tube Saturation
    this.tubeIn = ctx.createGain();
    this.tubeDryGain = ctx.createGain();
    this.tubeDriveGain = ctx.createGain();
    this.tubeShaper = ctx.createWaveShaper();
    this.tubeShaper.oversample = shaperOversample;
    this.tubeDcBlock = this.createDcBlocker(ctx);
    this.tubeWetGain = ctx.createGain();
    this.tubeOut = ctx.createGain();
    this.tubeIn.connect(this.tubeDryGain);
    this.tubeDryGain.connect(this.tubeOut);
    this.tubeIn.connect(this.tubeDriveGain);
    this.tubeDriveGain.connect(this.tubeShaper);
    this.tubeShaper.connect(this.tubeDcBlock);
    this.tubeDcBlock.connect(this.tubeWetGain);
    this.tubeWetGain.connect(this.tubeOut);

    // 2. Diode Distortion
    this.diodeIn = ctx.createGain();
    this.diodeDryGain = ctx.createGain();
    this.diodeDriveGain = ctx.createGain();
    this.diodeShaper = ctx.createWaveShaper();
    this.diodeShaper.oversample = shaperOversample;
    this.diodeToneFilter = ctx.createBiquadFilter();
    this.diodeToneFilter.type = 'lowpass';
    this.diodeToneFilter.Q.value = 0.85;
    this.diodeDcBlock = this.createDcBlocker(ctx);
    this.diodeWetGain = ctx.createGain();
    this.diodeOut = ctx.createGain();
    this.diodeIn.connect(this.diodeDryGain);
    this.diodeDryGain.connect(this.diodeOut);
    this.diodeIn.connect(this.diodeDriveGain);
    this.diodeDriveGain.connect(this.diodeShaper);
    this.diodeShaper.connect(this.diodeToneFilter);
    this.diodeToneFilter.connect(this.diodeDcBlock);
    this.diodeDcBlock.connect(this.diodeWetGain);
    this.diodeWetGain.connect(this.diodeOut);

    // 3. Soft Clipper
    this.softClipIn = ctx.createGain();
    this.softClipShaper = ctx.createWaveShaper();
    this.softClipShaper.oversample = shaperOversample;
    this.softClipDcBlock = this.createDcBlocker(ctx);
    this.softClipOutGain = ctx.createGain();
    this.softClipOut = ctx.createGain();
    this.softClipIn.connect(this.softClipShaper);
    this.softClipShaper.connect(this.softClipDcBlock);
    this.softClipDcBlock.connect(this.softClipOutGain);
    this.softClipOutGain.connect(this.softClipOut);

    // 4. Waveshaper (Editable Curve)
    this.wsIn = ctx.createGain();
    this.wsDryGain = ctx.createGain();
    this.wsDriveGain = ctx.createGain();
    this.wsShaper = ctx.createWaveShaper();
    this.wsShaper.oversample = shaperOversample;
    this.wsDcBlock = this.createDcBlocker(ctx);
    this.wsWetGain = ctx.createGain();
    this.wsOut = ctx.createGain();
    this.wsIn.connect(this.wsDryGain);
    this.wsDryGain.connect(this.wsOut);
    this.wsIn.connect(this.wsDriveGain);
    this.wsDriveGain.connect(this.wsShaper);
    this.wsShaper.connect(this.wsDcBlock);
    this.wsDcBlock.connect(this.wsWetGain);
    this.wsWetGain.connect(this.wsOut);

    // 5. Parametric EQ
    this.eqIn = ctx.createGain();
    this.eqLowShelf = ctx.createBiquadFilter();
    this.eqLowShelf.type = 'lowshelf';
    this.eqLowShelf.frequency.value = 75;
    this.eqMidPeak = ctx.createBiquadFilter();
    this.eqMidPeak.type = 'peaking';
    this.eqMidPeak.Q.value = 1.35;
    this.eqHighShelf = ctx.createBiquadFilter();
    this.eqHighShelf.type = 'highshelf';
    this.eqHighShelf.frequency.value = 1800;
    this.eqOut = ctx.createGain();
    this.eqIn.connect(this.eqLowShelf);
    this.eqLowShelf.connect(this.eqMidPeak);
    this.eqMidPeak.connect(this.eqHighShelf);
    this.eqHighShelf.connect(this.eqOut);

    // 6. Low Pass Filter
    this.lpfIn = ctx.createGain();
    this.lpfStage1 = ctx.createBiquadFilter();
    this.lpfStage1.type = 'lowpass';
    this.lpfStage2 = ctx.createBiquadFilter();
    this.lpfStage2.type = 'lowpass';
    this.lpfOut = ctx.createGain();
    this.lpfIn.connect(this.lpfStage1);
    this.lpfStage1.connect(this.lpfStage2);
    this.lpfStage2.connect(this.lpfOut);

    // 7. Compressor
    this.compIn = ctx.createGain();
    this.compNode = ctx.createDynamicsCompressor();
    this.compNode.knee.value = 6;
    this.compMakeupGain = ctx.createGain();
    this.compOut = ctx.createGain();
    this.compIn.connect(this.compNode);
    this.compNode.connect(this.compMakeupGain);
    this.compMakeupGain.connect(this.compOut);

    // 8. Sidechain Ducking
    this.scIn = ctx.createGain();
    this.scDuckGain = ctx.createGain();
    this.scDuckGain.gain.setValueAtTime(1, now);
    this.scOut = ctx.createGain();
    this.scIn.connect(this.scDuckGain);
    this.scDuckGain.connect(this.scOut);

    // 9. Mono / Stereo Control
    this.stereoIn = ctx.createGain();
    this.stereoLow1 = ctx.createBiquadFilter();
    this.stereoLow1.type = 'lowpass';
    this.stereoLow1.Q.value = 0.707;
    this.stereoLow2 = ctx.createBiquadFilter();
    this.stereoLow2.type = 'lowpass';
    this.stereoLow2.Q.value = 0.707;
    this.stereoLowMono = ctx.createGain();
    this.stereoLowMono.channelCount = 1;
    this.stereoLowMono.channelCountMode = 'explicit';
    this.stereoLowMono.channelInterpretation = 'speakers';

    this.stereoHigh1 = ctx.createBiquadFilter();
    this.stereoHigh1.type = 'highpass';
    this.stereoHigh1.Q.value = 0.707;
    this.stereoHigh2 = ctx.createBiquadFilter();
    this.stereoHigh2.type = 'highpass';
    this.stereoHigh2.Q.value = 0.707;

    this.stereoHighMidGain = ctx.createGain();
    this.stereoHighAllpassL = ctx.createBiquadFilter();
    this.stereoHighAllpassL.type = 'allpass';
    this.stereoHighAllpassL.frequency.value = 420;
    this.stereoHighAllpassL.Q.value = 0.8;

    this.stereoHighAllpassR = ctx.createBiquadFilter();
    this.stereoHighAllpassR.type = 'allpass';
    this.stereoHighAllpassR.frequency.value = 1380;
    this.stereoHighAllpassR.Q.value = 0.8;

    this.stereoSideLPos = ctx.createGain();
    this.stereoSideLNeg = ctx.createGain();
    this.stereoSideRPos = ctx.createGain();
    this.stereoSideRNeg = ctx.createGain();
    this.stereoMerger = ctx.createChannelMerger(2);
    this.stereoOut = ctx.createGain();

    // Sub band -> strict mono collapse -> stereo output (L == R)
    this.stereoIn.connect(this.stereoLow1);
    this.stereoLow1.connect(this.stereoLow2);
    this.stereoLow2.connect(this.stereoLowMono);
    this.stereoLowMono.connect(this.stereoOut);

    // High harmonics band -> phase-decorrelated Mid/Side width matrix
    this.stereoIn.connect(this.stereoHigh1);
    this.stereoHigh1.connect(this.stereoHigh2);

    // Mid stays equal on both L & R
    this.stereoHigh2.connect(this.stereoHighMidGain);
    this.stereoHighMidGain.connect(this.stereoMerger, 0, 0);
    this.stereoHighMidGain.connect(this.stereoMerger, 0, 1);

    // Side = k * (apL - apR) added to L, subtracted from R
    this.stereoHigh2.connect(this.stereoHighAllpassL);
    this.stereoHigh2.connect(this.stereoHighAllpassR);

    this.stereoHighAllpassL.connect(this.stereoSideLPos); // +apL -> L
    this.stereoSideLPos.connect(this.stereoMerger, 0, 0);
    this.stereoHighAllpassL.connect(this.stereoSideLNeg); // -apL -> R
    this.stereoSideLNeg.connect(this.stereoMerger, 0, 1);

    this.stereoHighAllpassR.connect(this.stereoSideRNeg); // -apR -> L
    this.stereoSideRNeg.connect(this.stereoMerger, 0, 0);
    this.stereoHighAllpassR.connect(this.stereoSideRPos); // +apR -> R
    this.stereoSideRPos.connect(this.stereoMerger, 0, 1);

    this.stereoMerger.connect(this.stereoOut);

    // --- Summing Bus, Final DC Blocker, Safety Limiter & Master Output ---
    this.fxSumBus = ctx.createGain();
    this.masterDcBlocker = this.createDcBlocker(ctx);

    this.masterSafetyLimiter = ctx.createDynamicsCompressor();
    this.masterSafetyLimiter.threshold.value = -0.8;
    this.masterSafetyLimiter.knee.value = 1.5;
    this.masterSafetyLimiter.ratio.value = 12;
    this.masterSafetyLimiter.attack.value = 0.002;
    this.masterSafetyLimiter.release.value = 0.06;

    this.outputGain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.72;

    this.masterDcBlocker.connect(this.masterSafetyLimiter);
    this.masterSafetyLimiter.connect(this.outputGain);
    this.outputGain.connect(this.analyser);

    const busInput = studioAudio.getSubbassBusInput();
    if (busInput) {
      this.outputGain.connect(busInput);
    }

    const baseFreq = midiToFreq(36 + this.patch.octave * 12);
    this.sineOsc.frequency.value = baseFreq;
    this.triOsc.frequency.value = baseFreq;
    this.sqrOsc.frequency.value = baseFreq;

    this.applyParams(ctx.currentTime, true);

    this.sineOsc.start();
    this.triOsc.start();
    this.sqrOsc.start();
  }

  private getModuleIo(id: SubbassFxId): { inNode: AudioNode; outNode: AudioNode } | null {
    switch (id) {
      case 'tube':
        return this.tubeIn && this.tubeOut ? { inNode: this.tubeIn, outNode: this.tubeOut } : null;
      case 'diode':
        return this.diodeIn && this.diodeOut ? { inNode: this.diodeIn, outNode: this.diodeOut } : null;
      case 'softClip':
        return this.softClipIn && this.softClipOut ? { inNode: this.softClipIn, outNode: this.softClipOut } : null;
      case 'waveshaper':
        return this.wsIn && this.wsOut ? { inNode: this.wsIn, outNode: this.wsOut } : null;
      case 'eq':
        return this.eqIn && this.eqOut ? { inNode: this.eqIn, outNode: this.eqOut } : null;
      case 'lowpass':
        return this.lpfIn && this.lpfOut ? { inNode: this.lpfIn, outNode: this.lpfOut } : null;
      case 'compressor':
        return this.compIn && this.compOut ? { inNode: this.compIn, outNode: this.compOut } : null;
      case 'sidechain':
        return this.scIn && this.scOut ? { inNode: this.scIn, outNode: this.scOut } : null;
      case 'stereo':
        return this.stereoIn && this.stereoOut ? { inNode: this.stereoIn, outNode: this.stereoOut } : null;
    }
  }

  private rebuildFxRouting(): void {
    if (
      !this.cleanBlendGain ||
      !this.harmBlendGain ||
      !this.fxSumBus ||
      !this.masterDcBlocker
    ) {
      return;
    }

    const fx = this.getFxConfig();
    const safeDisconnect = (n: AudioNode | null) => {
      if (!n) return;
      try {
        n.disconnect();
      } catch {
        // ignore
      }
    };

    safeDisconnect(this.cleanBlendGain);
    safeDisconnect(this.harmBlendGain);
    safeDisconnect(this.fxSumBus);
    for (const id of fx.order) {
      const io = this.getModuleIo(id);
      if (io) safeDisconnect(io.outNode);
    }

    // Bypass entire SUBBASS FX Rack cleanly when global channel FX Bypass is active
    if (this.fxBypass) {
      this.cleanBlendGain.connect(this.masterDcBlocker);
      this.harmBlendGain.connect(this.masterDcBlocker);
      return;
    }

    // Section A: Clean Sub routes directly to fxSumBus (untouched by distortion)
    this.cleanBlendGain.connect(this.fxSumBus);

    // Section B: Harmonic Layer routes through enabled distortion/saturation modules in user order
    let harmCursor: AudioNode = this.harmBlendGain;
    for (const id of fx.order) {
      if (!HARMONIC_FX_SET.has(id)) continue;
      const mod = fx[id];
      if (!mod.enabled) continue;
      const io = this.getModuleIo(id);
      if (!io) continue;
      harmCursor.connect(io.inNode);
      harmCursor = io.outNode;
    }
    harmCursor.connect(this.fxSumBus);

    // Master Bus FX chain routes through enabled shaping/dynamics/spatial modules in user order
    let masterCursor: AudioNode = this.fxSumBus;
    for (const id of fx.order) {
      if (!MASTER_FX_SET.has(id)) continue;
      const mod = fx[id];
      if (!mod.enabled) continue;
      const io = this.getModuleIo(id);
      if (!io) continue;
      masterCursor.connect(io.inNode);
      masterCursor = io.outNode;
    }
    masterCursor.connect(this.masterDcBlocker);
  }

  public setFxBypass(bypass: boolean): void {
    if (this.fxBypass === bypass) return;
    this.fxBypass = bypass;
    if (this.ctx) {
      this.applyParams(this.ctx.currentTime, true);
    }
  }

  public setMuted(muted: boolean): void {
    if (this.isMuted === muted) return;
    this.isMuted = muted;
    if (muted) {
      this.panic();
    }
    if (this.ctx) {
      this.applyParams(this.ctx.currentTime, false);
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public getCompressorReduction(): number {
    if (!this.compNode || !this.getFxConfig().compressor.enabled) return 0;
    return clamp(this.compNode.reduction || 0, -24, 0);
  }

  public getSidechainTelemetry(): { active: boolean; level: number } {
    const fx = this.getFxConfig();
    if (!fx.sidechain.enabled || fx.sidechain.amount < 0.02) {
      return { active: false, level: 0 };
    }
    const elapsed = performance.now() - this.lastScTriggerMs;
    if (elapsed < 0 || elapsed > this.lastScDurationMs) {
      return { active: true, level: 0 };
    }
    const norm = Math.max(0, 1 - elapsed / Math.max(40, this.lastScDurationMs));
    return { active: true, level: this.lastScDepth * norm * norm };
  }

  public getPatch(): SubbassPatch {
    return this.patch;
  }

  public setBpm(bpm: number): void {
    this.bpm = clamp(bpm, 40, 240);
  }

  public setPatch(next: SubbassPatch): void {
    const prevOctave = this.patch.octave;
    this.patch = next;
    if (!this.ctx || !this.cleanEnvGain) return;
    const now = this.ctx.currentTime;
    this.applyParams(now, false);

    if (prevOctave !== next.octave && this.activeMidi !== null) {
      this.setFrequencyAt(this.activeMidi, now, false);
    }
  }

  private applyParams(now: number, force: boolean): void {
    if (
      !this.ctx ||
      !this.cleanSineGain ||
      !this.cleanTriGain ||
      !this.cleanBlendGain ||
      !this.harmSineGain ||
      !this.harmTriGain ||
      !this.harmSqrGain ||
      !this.coreShaper ||
      !this.coreShaperMakeup ||
      !this.coreLowpass ||
      !this.harmBlendGain ||
      !this.outputGain
    ) {
      return;
    }

    const p = this.patch;
    const fx = this.getFxConfig();

    // Update phased periodic waves only when phase changes (zero click)
    if (force || this.lastPhase !== p.phase) {
      this.lastPhase = p.phase;
      this.sineOsc?.setPeriodicWave(buildPhasedWave(this.ctx, 'sine', p.phase));
      this.triOsc?.setPeriodicWave(buildPhasedWave(this.ctx, 'triangle', p.phase));
      this.sqrOsc?.setPeriodicWave(buildPhasedWave(this.ctx, 'square', p.phase));
    }

    const muteScale = this.isMuted ? 0 : 1;

    // Section A: Clean Sub Fundamental Oscillator Feed
    const cleanSineLvl = clamp(p.subLevel, 0, 1) * 0.92 * muteScale;
    const cleanTriLvl = clamp(p.bassTone, 0, 1) * 0.18 * muteScale;
    this.smoothParam('cSine', this.cleanSineGain.gain, cleanSineLvl, now, 0.012, force);
    this.smoothParam('cTri', this.cleanTriGain.gain, cleanTriLvl, now, 0.012, force);
    this.smoothParam(
      'cBlend',
      this.cleanBlendGain.gain,
      fx.cleanSubEnabled ? clamp(fx.cleanSubLevel, 0, 1) : 0,
      now,
      0.012,
      force
    );

    // Section B: Harmonic Layer Oscillator Feed
    const harmSineLvl = clamp(p.subLevel, 0, 1) * 0.72 * muteScale;
    const harmTriLvl = clamp(p.bassTone, 0, 1) * 0.8 * muteScale;
    const harmSqrLvl = (p.squareEnabled ? 0.14 + clamp(p.bassTone, 0, 1) * 0.38 : 0) * muteScale;
    this.smoothParam('hSine', this.harmSineGain.gain, harmSineLvl, now, 0.012, force);
    this.smoothParam('hTri', this.harmTriGain.gain, harmTriLvl, now, 0.012, force);
    this.smoothParam('hSqr', this.harmSqrGain.gain, harmSqrLvl, now, 0.012, force);

    const bypassSat = p.saturation < 0.015;
    if (this.harmOscSum && bypassSat !== this.coreShaperBypassed) {
      this.coreShaperBypassed = bypassSat;
      try {
        this.harmOscSum.disconnect();
        this.coreShaper.disconnect();
      } catch {
        // ignore
      }
      if (bypassSat) {
        this.harmOscSum.connect(this.coreShaperMakeup);
      } else {
        this.harmOscSum.connect(this.coreShaper);
        this.coreShaper.connect(this.coreShaperMakeup);
      }
    }

    const satQuant = Math.round(clamp(p.saturation, 0, 1) * 32);
    if (!bypassSat && (force || this.lastSatQuant !== satQuant)) {
      this.lastSatQuant = satQuant;
      this.coreShaper.curve = getSubSaturationCurve(p.saturation);
    }
    this.smoothParam('cShpMk', this.coreShaperMakeup.gain, 1 - p.saturation * 0.18, now, 0.015, force);

    const lpfHz = 38 * Math.pow(63.15, clamp(p.lowPassFilter, 0, 1));
    this.smoothParam('cLpF', this.coreLowpass.frequency, lpfHz, now, 0.014, force, 0.1);
    this.smoothParam('cLpQ', this.coreLowpass.Q, 0.9 + p.bassTone * 1.4, now, 0.014, force, 0.005);
    this.smoothParam(
      'hBlend',
      this.harmBlendGain.gain,
      fx.harmonicEnabled ? clamp(fx.harmonicLevel, 0, 1) : 0,
      now,
      0.012,
      force
    );

    // Rebuild dynamic FX routing only when order, module bypass, or global FX bypass changes
    const routingKey = `${this.fxBypass ? 'BP1' : 'BP0'}|${fx.order.join(',')}|${fx.order.map((id) => (fx[id].enabled ? '1' : '0')).join('')}`;
    if (force || this.lastRoutingKey !== routingKey) {
      this.lastRoutingKey = routingKey;
      this.rebuildFxRouting();
    }

    // 1. Tube Saturation Params
    if (
      this.tubeDryGain &&
      this.tubeDriveGain &&
      this.tubeShaper &&
      this.tubeWetGain
    ) {
      const tMix = clamp(fx.tube.mix, 0, 1);
      const tOut = 0.25 + clamp(fx.tube.output, 0, 1) * 1.35;
      const tDriveQuant = Math.round(clamp(fx.tube.drive, 0, 1) * 32);
      if (force || this.lastTubeQuant !== tDriveQuant) {
        this.lastTubeQuant = tDriveQuant;
        this.tubeShaper.curve = getTubeSaturationCurve(fx.tube.drive);
      }
      this.smoothParam('tDrv', this.tubeDriveGain.gain, 1 + fx.tube.drive * 2.8, now, 0.012, force);
      this.smoothParam('tDry', this.tubeDryGain.gain, 1 - tMix, now, 0.012, force);
      this.smoothParam('tWet', this.tubeWetGain.gain, tMix * tOut, now, 0.012, force);
    }

    // 2. Diode Distortion Params
    if (
      this.diodeDryGain &&
      this.diodeDriveGain &&
      this.diodeShaper &&
      this.diodeToneFilter &&
      this.diodeWetGain
    ) {
      const dMix = clamp(fx.diode.mix, 0, 1);
      const dDriveQuant = Math.round(clamp(fx.diode.drive, 0, 1) * 32);
      if (force || this.lastDiodeQuant !== dDriveQuant) {
        this.lastDiodeQuant = dDriveQuant;
        this.diodeShaper.curve = getDiodeDistortionCurve(fx.diode.drive);
      }
      const dToneHz = 260 * Math.pow(18, clamp(fx.diode.tone, 0, 1));
      this.smoothParam('dDrv', this.diodeDriveGain.gain, 1 + fx.diode.drive * 3.2, now, 0.012, force);
      this.smoothParam('dTon', this.diodeToneFilter.frequency, dToneHz, now, 0.014, force, 0.5);
      this.smoothParam('dDry', this.diodeDryGain.gain, 1 - dMix, now, 0.012, force);
      this.smoothParam('dWet', this.diodeWetGain.gain, dMix * 0.9, now, 0.012, force);
    }

    // 3. Soft Clipper Params
    if (this.softClipShaper && this.softClipOutGain) {
      const tq = Math.round(clamp(fx.softClip.threshold, 0, 1) * 24);
      const aq = Math.round(clamp(fx.softClip.amount, 0, 1) * 24);
      const key = `${tq}:${aq}`;
      if (force || this.lastSoftClipKey !== key) {
        this.lastSoftClipKey = key;
        this.softClipShaper.curve = getSoftClipperCurve(
          fx.softClip.threshold,
          fx.softClip.amount
        );
      }
      const outGain = 0.35 + clamp(fx.softClip.output, 0, 1) * 1.15;
      this.smoothParam('scOut', this.softClipOutGain.gain, outGain, now, 0.012, force);
    }

    // 4. Waveshaper Params
    if (
      this.wsDryGain &&
      this.wsDriveGain &&
      this.wsShaper &&
      this.wsWetGain
    ) {
      const wKey = fx.waveshaper.curvePoints.map((v) => v.toFixed(2)).join(',');
      if (force || this.lastWaveshaperKey !== wKey) {
        this.lastWaveshaperKey = wKey;
        this.wsShaper.curve = buildWaveshaperCustomCurve(fx.waveshaper.curvePoints);
      }
      const wMix = clamp(fx.waveshaper.mix, 0, 1);
      this.smoothParam('wsDrv', this.wsDriveGain.gain, 0.8 + fx.waveshaper.drive * 4.5, now, 0.012, force);
      this.smoothParam('wsDry', this.wsDryGain.gain, 1 - wMix, now, 0.012, force);
      this.smoothParam('wsWet', this.wsWetGain.gain, wMix * 0.85, now, 0.012, force);
    }

    // 5. Parametric EQ Params
    if (this.eqLowShelf && this.eqMidPeak && this.eqHighShelf) {
      const lowDb = (clamp(fx.eq.lowShelf, 0, 1) - 0.5) * 24;
      const midHz = 100 * Math.pow(25, clamp(fx.eq.midFreq, 0, 1));
      const midDb = (clamp(fx.eq.midGain, 0, 1) - 0.5) * 24;
      const highDb = (clamp(fx.eq.highShelf, 0, 1) - 0.5) * 24;
      this.smoothParam('eqL', this.eqLowShelf.gain, lowDb, now, 0.015, force, 0.02);
      this.smoothParam('eqMF', this.eqMidPeak.frequency, midHz, now, 0.015, force, 0.5);
      this.smoothParam('eqMG', this.eqMidPeak.gain, midDb, now, 0.015, force, 0.02);
      this.smoothParam('eqH', this.eqHighShelf.gain, highDb, now, 0.015, force, 0.02);
    }

    // 6. Low Pass Filter Params
    if (this.lpfStage1 && this.lpfStage2) {
      const cutHz = 35 * Math.pow(171.4, clamp(fx.lowpass.cutoff, 0, 1));
      const resQ = 0.707 + clamp(fx.lowpass.resonance, 0, 1) * 9.5;
      const ft = fx.lowpass.filterType;
      if (this.lpfStage1.type !== 'lowpass') this.lpfStage1.type = 'lowpass';
      if (this.lpfStage2.type !== 'lowpass') this.lpfStage2.type = 'lowpass';
      if (ft === 'lp12') {
        this.smoothParam('lp1F', this.lpfStage1.frequency, cutHz, now, 0.014, force, 0.2);
        this.smoothParam('lp1Q', this.lpfStage1.Q, resQ, now, 0.014, force, 0.005);
        this.smoothParam('lp2F', this.lpfStage2.frequency, 19500, now, 0.014, force, 1);
        this.smoothParam('lp2Q', this.lpfStage2.Q, 0.5, now, 0.014, force, 0.005);
      } else if (ft === 'warm') {
        this.smoothParam('lp1F', this.lpfStage1.frequency, cutHz, now, 0.014, force, 0.2);
        this.smoothParam('lp1Q', this.lpfStage1.Q, Math.max(0.6, resQ * 0.65), now, 0.014, force, 0.005);
        this.smoothParam('lp2F', this.lpfStage2.frequency, Math.min(18000, cutHz * 1.35), now, 0.014, force, 0.5);
        this.smoothParam('lp2Q', this.lpfStage2.Q, 0.55, now, 0.014, force, 0.005);
      } else {
        this.smoothParam('lp1F', this.lpfStage1.frequency, cutHz, now, 0.014, force, 0.2);
        this.smoothParam('lp1Q', this.lpfStage1.Q, resQ * 0.82, now, 0.014, force, 0.005);
        this.smoothParam('lp2F', this.lpfStage2.frequency, cutHz, now, 0.014, force, 0.2);
        this.smoothParam('lp2Q', this.lpfStage2.Q, 0.707 + fx.lowpass.resonance * 2.2, now, 0.014, force, 0.005);
      }
    }

    // 7. Compressor Params
    if (this.compNode && this.compMakeupGain) {
      const threshDb = -48 + clamp(fx.compressor.threshold, 0, 1) * 48;
      const ratio = 1 + clamp(fx.compressor.ratio, 0, 1) * 19;
      const atkSec = 0.001 + Math.pow(clamp(fx.compressor.attack, 0, 1), 1.5) * 0.149;
      const relSec = 0.03 + Math.pow(clamp(fx.compressor.release, 0, 1), 1.4) * 0.77;
      const makeupDb = clamp(fx.compressor.makeup, 0, 1) * 18;
      const makeupGain = Math.pow(10, makeupDb / 20);

      this.smoothParam('cTh', this.compNode.threshold, threshDb, now, 0.015, force, 0.02);
      this.smoothParam('cRa', this.compNode.ratio, ratio, now, 0.015, force, 0.02);
      this.smoothParam('cAt', this.compNode.attack, atkSec, now, 0.015, force, 0.0002);
      this.smoothParam('cRe', this.compNode.release, relSec, now, 0.015, force, 0.0005);
      this.smoothParam('cMk', this.compMakeupGain.gain, makeupGain, now, 0.015, force);
    }

    // 9. Mono / Stereo Crossover Control Params
    if (
      this.stereoLow1 &&
      this.stereoLow2 &&
      this.stereoHigh1 &&
      this.stereoHigh2 &&
      this.stereoSideLPos &&
      this.stereoSideLNeg &&
      this.stereoSideRPos &&
      this.stereoSideRNeg
    ) {
      const xoHz = normToCrossoverHz(fx.stereo.crossoverHz);
      this.smoothParam('stL1', this.stereoLow1.frequency, xoHz, now, 0.015, force, 0.2);
      this.smoothParam('stL2', this.stereoLow2.frequency, xoHz, now, 0.015, force, 0.2);
      this.smoothParam('stH1', this.stereoHigh1.frequency, xoHz, now, 0.015, force, 0.2);
      this.smoothParam('stH2', this.stereoHigh2.frequency, xoHz, now, 0.015, force, 0.2);

      const widthGain = clamp(fx.stereo.width, 0, 1) * 0.65;
      this.smoothParam('stSL1', this.stereoSideLPos.gain, widthGain, now, 0.015, force);
      this.smoothParam('stSL2', this.stereoSideLNeg.gain, -widthGain, now, 0.015, force);
      this.smoothParam('stSR1', this.stereoSideRPos.gain, widthGain, now, 0.015, force);
      this.smoothParam('stSR2', this.stereoSideRNeg.gain, -widthGain, now, 0.015, force);
    }

    this.smoothParam('outG', this.outputGain.gain, clamp(p.outputVolume, 0, 1) * 0.95, now, 0.014, force);
  }

  public triggerSidechainDuck(when: number, velocity = 1): void {
    const sc = this.getFxConfig().sidechain;
    if (!sc.enabled || !this.ctx || !this.scDuckGain) return;
    const amt = clamp(sc.amount, 0, 1);
    if (amt < 0.02) return;

    const atkSec = 0.002 + clamp(sc.attack, 0, 1) * 0.075;
    let relSec: number;
    if (sc.bpmSync) {
      const beatSec = 60 / clamp(this.bpm, 40, 240);
      relSec =
        sc.syncRate === '1/8'
          ? beatSec * 0.42
          : sc.syncRate === '1/2'
          ? beatSec * 1.55
          : beatSec * 0.85;
    } else {
      relSec = 0.04 + clamp(sc.release, 0, 1) * 0.71;
    }

    const t = Math.max(this.ctx.currentTime, when);
    const velScale = clamp(velocity, 0.4, 1.1);
    const minLevel = clamp(1 - amt * 0.9 * velScale, 0.04, 1);

    const g = this.scDuckGain.gain;
    anchorParamForLinearRamp(g, t, Math.max(0.05, g.value || 1));
    g.linearRampToValueAtTime(minLevel, t + atkSec);
    g.setTargetAtTime(1, t + atkSec + 0.008, Math.max(0.018, relSec / 3.2));

    this.lastScTriggerMs = performance.now();
    this.lastScDurationMs = (atkSec + relSec) * 1000;
    this.lastScDepth = 1 - minLevel;
  }

  private getAttackSec(): number {
    return 0.002 + Math.pow(clamp(this.patch.attack, 0, 1), 1.6) * 0.38;
  }

  private getReleaseSec(): number {
    return 0.02 + Math.pow(clamp(this.patch.release, 0, 1), 1.7) * 1.25;
  }

  private getGlideTauSec(): number {
    const g = clamp(this.patch.glide, 0, 1);
    return g < 0.02 ? 0.001 : 0.005 + Math.pow(g, 1.5) * 0.12;
  }

  private setFrequencyAt(midi: number, when: number, useGlide: boolean): void {
    if (!this.sineOsc || !this.triOsc || !this.sqrOsc) return;
    const shiftedMidi = clamp(midi + this.patch.octave * 12, 12, 96);
    const freq = midiToFreq(shiftedMidi);
    const tau = useGlide ? this.getGlideTauSec() : 0.001;

    for (const osc of [this.sineOsc, this.triOsc, this.sqrOsc]) {
      holdAudioParamAt(osc.frequency, when, osc.frequency.value || freq);
      if (useGlide && tau > 0.003) {
        osc.frequency.setTargetAtTime(freq, when, tau);
      } else {
        osc.frequency.setValueAtTime(freq, when);
      }
    }
  }

  public async noteOn(midi: number, velocity = 0.88): Promise<void> {
    studioAudio.unlockSync();
    const ctx =
      this.ctx && this.cleanEnvGain && this.harmEnvGain && (this.ctx.state as string) === 'running'
        ? this.ctx
        : await this.ensureAudio();
    if (!this.cleanEnvGain || !this.harmEnvGain) return;

    const wasEmpty = this.heldMidis.length === 0;
    this.heldMidis = this.heldMidis.filter((m) => m !== midi);
    this.heldMidis.push(midi);
    this.activeMidi = midi;

    const now = ctx.currentTime;
    const isLegato = !wasEmpty;
    const shouldGlide = this.hasPlayedNote && this.patch.glide >= 0.02;
    this.hasPlayedNote = true;
    this.setFrequencyAt(midi, now, shouldGlide);

    const targetAmp = clamp(velocity, 0.12, 1);
    const atk = this.getAttackSec();

    for (const env of [this.cleanEnvGain, this.harmEnvGain]) {
      const g = env.gain;
      if (isLegato) {
        holdAudioParamAt(g, now, Math.max(0.0001, g.value || 0.0001));
        g.setTargetAtTime(targetAmp, now, Math.max(0.004, atk * 0.35));
      } else {
        const startAmp = clamp(g.value || 0.0001, 0.0001, targetAmp);
        anchorParamForLinearRamp(g, now, startAmp);
        g.linearRampToValueAtTime(targetAmp, now + atk);
      }
    }
  }

  public noteOff(midi: number): void {
    this.heldMidis = this.heldMidis.filter((m) => m !== midi);
    if (!this.ctx || !this.cleanEnvGain || !this.harmEnvGain) return;

    const now = this.ctx.currentTime;
    if (this.heldMidis.length > 0) {
      const fallbackMidi = this.heldMidis[this.heldMidis.length - 1];
      this.activeMidi = fallbackMidi;
      this.setFrequencyAt(fallbackMidi, now, true);
      return;
    }

    this.activeMidi = null;
    const rel = this.getReleaseSec();
    for (const env of [this.cleanEnvGain, this.harmEnvGain]) {
      const g = env.gain;
      holdAudioParamAt(g, now, Math.max(0.0001, g.value));
      g.setTargetAtTime(0.00001, now, Math.max(0.008, rel / 3.2));
    }
  }

  public scheduleNote(
    midi: number,
    velocity: number,
    startTime: number,
    endTime: number
  ): void {
    if (!this.ctx) {
      const existingCtx = studioAudio.getContext();
      if (existingCtx) {
        this.buildGraph(existingCtx);
      } else {
        void this.ensureAudio();
        return;
      }
    }
    if (
      !this.ctx ||
      !this.cleanEnvGain ||
      !this.harmEnvGain ||
      !this.sineOsc ||
      !this.triOsc ||
      !this.sqrOsc
    ) {
      return;
    }

    const tStart = Math.max(this.ctx.currentTime, startTime);
    const safeEnd = Math.max(tStart + 0.02, endTime);
    const shiftedMidi = clamp(midi + this.patch.octave * 12, 12, 96);
    const freq = midiToFreq(shiftedMidi);
    const tau = this.getGlideTauSec();
    const shouldGlide = this.hasPlayedNote && tau > 0.003;
    this.hasPlayedNote = true;
    this.activeMidi = midi;

    for (const osc of [this.sineOsc, this.triOsc, this.sqrOsc]) {
      holdAudioParamAt(osc.frequency, tStart, osc.frequency.value || freq);
      if (shouldGlide) {
        osc.frequency.setTargetAtTime(freq, tStart, tau);
      } else {
        osc.frequency.setValueAtTime(freq, tStart);
      }
    }

    const atk = this.getAttackSec();
    const rel = this.getReleaseSec();
    const amp = clamp(velocity, 0.12, 1);
    const maxPeakTime = Math.max(tStart + 0.003, safeEnd - 0.003);
    const peakTime = Math.min(maxPeakTime, tStart + atk);
    const holdEndTime = Math.max(peakTime, safeEnd - 0.002);
    const peakAmp =
      tStart + atk <= maxPeakTime
        ? amp
        : amp * clamp((peakTime - tStart) / Math.max(0.002, atk), 0.18, 1);

    for (const env of [this.cleanEnvGain, this.harmEnvGain]) {
      const g = env.gain;
      anchorParamForLinearRamp(g, tStart, 0.0001);
      g.linearRampToValueAtTime(peakAmp, peakTime);
      if (holdEndTime > peakTime) {
        g.setValueAtTime(peakAmp, holdEndTime);
      }
      g.setTargetAtTime(0.00001, safeEnd, Math.max(0.008, rel / 3.2));
    }
  }

  public panic(): void {
    this.heldMidis = [];
    this.activeMidi = null;
    if (!this.ctx || !this.cleanEnvGain || !this.harmEnvGain) return;
    const now = this.ctx.currentTime;
    for (const env of [this.cleanEnvGain, this.harmEnvGain]) {
      const g = env.gain;
      holdAudioParamAt(g, now, Math.max(0.0001, g.value));
      g.setTargetAtTime(0.00001, now, 0.008);
    }
  }
}

export const subbassEngine = new SubbassEngine();
