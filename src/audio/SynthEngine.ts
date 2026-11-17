import type {
  AdsrConfig,
  DistortionConfig,
  LiveModOffsets,
  MacroTarget,
  ModSource,
  ModTarget,
  NoiseOscConfig,
  OscillatorConfig,
  SubOscConfig,
  SynthPatch,
  WarpMode,
  WavetableId,
} from '../types/synth';
import { createBasePatch } from './presets';
import { anchorParamForLinearRamp, studioAudio } from './StudioAudio';
import {
  computeCabinetAcousticTargets,
  getCabinetImpulse,
  getTremoloLfoBuffer,
} from './cabinetAndTremolo';
import {
  createInterpolatedPeriodicWave,
  divisionToHz,
  evaluateLfoValue,
} from './wavetables';

function isTouchMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

interface OscSlotRuntime {
  subOscs: OscillatorNode[];
  subPans: StereoPannerNode[];
  slotGain: GainNode;
  lastWaveKey: string;
  lastGain: number;
  lastFreqs: number[];
  lastPans: number[];
}

interface VoiceRuntime {
  id: number;
  midiNote: number;
  baseFreq: number;
  noteOnTime: number;
  noteOffTime: number | null;
  peakAmp: number;
  releaseStartAmp: number;
  releaseStartMod: number;
  scheduledStopTime: number | null;
  isDying: boolean;
  oscSlots: [OscSlotRuntime, OscSlotRuntime, OscSlotRuntime];
  subOscNode: OscillatorNode | null;
  subGain: GainNode;
  noiseSource: AudioBufferSourceNode | null;
  noiseFilter: BiquadFilterNode | null;
  noiseGain: GainNode;
  oscMix: GainNode;
  driveShaper: WaveShaperNode;
  filter1: BiquadFilterNode;
  filter2: BiquadFilterNode;
  combDelay: DelayNode | null;
  combFeedback: GainNode | null;
  combConnected: boolean;
  subDirectOut: boolean;
  filterDryGain: GainNode;
  filterWetGain: GainNode;
  filterSum: GainNode;
  ampGain: GainNode;
  modGain: GainNode;
  panner: StereoPannerNode;
  cleanupTimer: number | null;
  // Dirty-check caches to prevent redundant AudioParam / node-state resets
  lastDriveKey: string;
  lastFilter1Type: BiquadFilterType | '';
  lastFilter2Type: BiquadFilterType | '';
  lastNoiseType: BiquadFilterType | '';
  lastNoiseBufType: NoiseOscConfig['type'];
  lastNoiseQ: number;
  lastNoiseFreq: number;
  lastNoiseGain: number;
  lastSubFreq: number;
  lastSubGain: number;
  lastDryGain: number;
  lastWetGain: number;
  lastF1Freq: number;
  lastF1Q: number;
  lastF2Freq: number;
  lastF2Q: number;
  lastF2Gain: number;
  lastCombDelay: number;
  lastCombFb: number;
  lastPan: number;
  lastAmpMod: number;
}

const QUANT_STEPS = 24;
const warmSatCurveCache = new Map<number, Float32Array<ArrayBuffer>>();
const distCurveCache = new Map<string, Float32Array<ArrayBuffer>>();

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function toSubOscType(shape: SubOscConfig['shape']): OscillatorType {
  return shape === 'saw' ? 'sawtooth' : shape;
}

function getDistortionCurve(
  mode: DistortionConfig['mode'],
  amount: number
): Float32Array<ArrayBuffer> {
  const q = Math.round(clamp(amount, 0, 1) * QUANT_STEPS);
  const key = `${mode}:${q}`;
  const cached = distCurveCache.get(key);
  if (cached) return cached;

  const qAmt = q / QUANT_STEPS;
  const samples = 512;
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  const drive = 1 + qAmt * 22;

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    switch (mode) {
      case 'hard': {
        curve[i] = clamp(x * drive * 0.7, -0.95, 0.95);
        break;
      }
      case 'fold': {
        curve[i] = Math.sin(x * drive * 1.45);
        break;
      }
      case 'bitcrush': {
        const steps = Math.max(3, Math.round(28 - qAmt * 23));
        curve[i] = Math.round(clamp(x * (1 + qAmt * 3), -1, 1) * steps) / steps;
        break;
      }
      case 'tube':
      default: {
        const norm = Math.tanh(drive * 0.7);
        curve[i] = Math.tanh(x * drive * 0.7) / norm;
        break;
      }
    }
  }
  distCurveCache.set(key, curve);
  return curve;
}

function getWarmSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const q = Math.round(clamp(amount, 0, 1) * QUANT_STEPS);
  const cached = warmSatCurveCache.get(q);
  if (cached) return cached;

  const qAmt = q / QUANT_STEPS;
  const samples = 512;
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  const k = 1 + qAmt * 14;
  const norm = Math.tanh(k);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = Math.tanh(x * k) / norm;
  }
  warmSatCurveCache.set(q, curve);
  return curve;
}

function computeAdsrLevel(
  env: AdsrConfig,
  now: number,
  noteOnTime: number,
  noteOffTime: number | null,
  releaseStartVal: number
): number {
  if (noteOffTime !== null && now >= noteOffTime) {
    const relElapsed = Math.max(0, now - noteOffTime);
    const rel = Math.max(0.005, env.release);
    if (relElapsed >= rel * 1.4) return 0;
    return releaseStartVal * Math.exp((-3.6 * relElapsed) / rel);
  }
  const elapsed = Math.max(0, now - noteOnTime);
  const atk = Math.max(0.002, env.attack);
  if (elapsed < atk) {
    return elapsed / atk;
  }
  const decElapsed = elapsed - atk;
  const dec = Math.max(0.005, env.decay);
  if (decElapsed >= dec * 2.5) {
    return env.sustain;
  }
  const k = Math.exp((-3.2 * decElapsed) / dec);
  return env.sustain + (1 - env.sustain) * k;
}

export class SynthEngine {
  private ctx: AudioContext | null = null;
  private ensureInFlight: Promise<AudioContext> | null = null;
  private patch: SynthPatch = createBasePatch();
  private bpm = 124;
  private voices: VoiceRuntime[] = [];
  private nextVoiceId = 1;
  private lastMidiNote: number | null = null;
  private sustainedNotes = new Set<number>();
  private heldKeys = new Set<number>();
  private holdMode = false;

  private pitchBend = 0;
  private modWheel = 0;

  private waveCache = new Map<string, PeriodicWave>();
  private noiseBuffers: Record<NoiseOscConfig['type'], AudioBuffer> | null = null;

  // 3 Global LFOs & Reusable Scratch Buffers (zero per-frame allocations)
  private lfoPhases: [number, number, number] = [0, 0, 0];
  private lfoValsScratch: [number, number, number] = [0, 0, 0];
  private modSumsScratch: Partial<Record<ModTarget, number>> = {};
  private macroSumsScratch: Partial<Record<MacroTarget, number>> = {};
  private automationOverrides: {
    cutoff: number | null;
    resonance: number | null;
    wtPosition: number | null;
    lfoRate: number | null;
    lfoDepth: number | null;
    volume: number | null;
  } = {
    cutoff: null,
    resonance: null,
    wtPosition: null,
    lfoRate: null,
    lfoDepth: null,
    volume: null,
  };
  private lastAutoVolumeApplied = -1;
  private lastUiTelemetryEmit = 0;
  private lastDistCurveKey = '';
  private lastDistPreGain = -1;
  private hadActiveMod = false;
  private lastRafTime = 0;
  private rafId: number | null = null;
  private modListener:
    | ((
        offsets: LiveModOffsets,
        lfoPhases: [number, number, number],
        voiceCount: number
      ) => void)
    | null = null;

  constructor() {
    studioAudio.onContextReset(() => this.resetForNewContext());
  }

  private resetForNewContext(): void {
    this.panic(true);
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.reverbDebounceTimer !== null) {
      clearTimeout(this.reverbDebounceTimer);
      this.reverbDebounceTimer = null;
    }
    if (this.cabDebounceTimer !== null) {
      clearTimeout(this.cabDebounceTimer);
      this.cabDebounceTimer = null;
    }
    for (const lfo of [this.hyperLfo, this.phaserLfo, this.flangerLfo, this.chorusLfo]) {
      if (lfo) {
        try {
          lfo.stop();
          lfo.disconnect();
        } catch {
          // ignore
        }
      }
    }
    if (this.tremLfoSrc) {
      try {
        this.tremLfoSrc.stop();
        this.tremLfoSrc.disconnect();
      } catch {
        // ignore
      }
    }
    this.waveCache.clear();
    this.noiseBuffers = null;
    this.fxInput = null;
    this.distDry = null;
    this.distWet = null;
    this.distPre = null;
    this.distShaper = null;
    this.distTone = null;
    this.distOut = null;
    this.hyperDry = null;
    this.hyperWet = null;
    this.hyperDelayL = null;
    this.hyperDelayR = null;
    this.hyperLfo = null;
    this.hyperLfoGainL = null;
    this.hyperLfoGainR = null;
    this.dimDelayL = null;
    this.dimDelayR = null;
    this.dimWet = null;
    this.hyperOut = null;
    this.phaserDry = null;
    this.phaserWet = null;
    this.phaserStages = [];
    this.phaserFb = null;
    this.phaserLfo = null;
    this.phaserLfoGain = null;
    this.phaserOut = null;
    this.flangerDry = null;
    this.flangerWet = null;
    this.flangerDelay = null;
    this.flangerFb = null;
    this.flangerLfo = null;
    this.flangerLfoGain = null;
    this.flangerOut = null;
    this.chorusDry = null;
    this.chorusWet = null;
    this.chorusDelayL = null;
    this.chorusDelayR = null;
    this.chorusLfo = null;
    this.chorusLfoGainL = null;
    this.chorusLfoGainR = null;
    this.chorusOut = null;
    this.delayDry = null;
    this.delayWet = null;
    this.delayNodeL = null;
    this.delayNodeR = null;
    this.delayFbL = null;
    this.delayFbR = null;
    this.delayDamp = null;
    this.delayOut = null;
    this.reverbDry = null;
    this.reverbWet = null;
    this.reverbConvolver = null;
    this.reverbOut = null;
    this.eqLow = null;
    this.eqMid = null;
    this.eqHigh = null;
    this.compDry = null;
    this.compSingleWet = null;
    this.compressor = null;
    this.compMakeup = null;
    this.ottWet = null;
    this.ottLowSplit = null;
    this.ottMidSplit1 = null;
    this.ottHighSplit = null;
    this.ottLowComp = null;
    this.ottMidComp = null;
    this.ottHighComp = null;
    this.ottMakeup = null;
    this.compOut = null;
    this.cabDry = null;
    this.cabWet = null;
    this.cabPreHpf = null;
    this.cabBodyPeak = null;
    this.cabPresencePeak = null;
    this.cabConeLpf = null;
    this.cabConvolver = null;
    this.cabOut = null;
    this.tremSplitter = null;
    this.tremGainL = null;
    this.tremGainR = null;
    this.tremMerger = null;
    this.tremLfoSrc = null;
    this.tremLfoSplit = null;
    this.tremLfoSmoothL = null;
    this.tremLfoSmoothR = null;
    this.tremLfoDepthL = null;
    this.tremLfoDepthR = null;
    this.fxChainOut = null;
    this.fxBypassGain = null;
    this.safetyLimiter = null;
    this.analyser = null;
    this.masterGain = null;
    this.distBranchConnected = true;
    this.reverbBranchConnected = true;
    this.cabBranchConnected = true;
    this.compBranchMode = 'dry';
    this.lastReverbKey = '';
    this.lastCabKey = '';
    this.lastTremBufKey = '';
    this.lastDistCurveKey = '';
    this.lastDistPreGain = -1;
    this.ctx = null;
  }

  // Master & FX chain
  private fxBypass = false;
  private fxInput: GainNode | null = null;
  private fxChainOut: GainNode | null = null;
  private fxBypassGain: GainNode | null = null;

  // 1. Distortion
  private distDry: GainNode | null = null;
  private distWet: GainNode | null = null;
  private distPre: GainNode | null = null;
  private distShaper: WaveShaperNode | null = null;
  private distTone: BiquadFilterNode | null = null;
  private distOut: GainNode | null = null;

  // 2. Hyper & Dimension
  private hyperDry: GainNode | null = null;
  private hyperWet: GainNode | null = null;
  private hyperDelayL: DelayNode | null = null;
  private hyperDelayR: DelayNode | null = null;
  private hyperLfo: OscillatorNode | null = null;
  private hyperLfoGainL: GainNode | null = null;
  private hyperLfoGainR: GainNode | null = null;
  private dimDelayL: DelayNode | null = null;
  private dimDelayR: DelayNode | null = null;
  private dimWet: GainNode | null = null;
  private hyperOut: GainNode | null = null;

  // 3. Phaser
  private phaserDry: GainNode | null = null;
  private phaserWet: GainNode | null = null;
  private phaserStages: BiquadFilterNode[] = [];
  private phaserFb: GainNode | null = null;
  private phaserLfo: OscillatorNode | null = null;
  private phaserLfoGain: GainNode | null = null;
  private phaserOut: GainNode | null = null;

  // 4. Flanger
  private flangerDry: GainNode | null = null;
  private flangerWet: GainNode | null = null;
  private flangerDelay: DelayNode | null = null;
  private flangerFb: GainNode | null = null;
  private flangerLfo: OscillatorNode | null = null;
  private flangerLfoGain: GainNode | null = null;
  private flangerOut: GainNode | null = null;

  // 5. Chorus
  private chorusDry: GainNode | null = null;
  private chorusWet: GainNode | null = null;
  private chorusDelayL: DelayNode | null = null;
  private chorusDelayR: DelayNode | null = null;
  private chorusLfo: OscillatorNode | null = null;
  private chorusLfoGainL: GainNode | null = null;
  private chorusLfoGainR: GainNode | null = null;
  private chorusOut: GainNode | null = null;

  // 6. Delay
  private delayDry: GainNode | null = null;
  private delayWet: GainNode | null = null;
  private delayNodeL: DelayNode | null = null;
  private delayNodeR: DelayNode | null = null;
  private delayFbL: GainNode | null = null;
  private delayFbR: GainNode | null = null;
  private delayDamp: BiquadFilterNode | null = null;
  private delayOut: GainNode | null = null;

  // 7. Reverb
  private reverbDry: GainNode | null = null;
  private reverbWet: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbOut: GainNode | null = null;
  private lastReverbKey = '';
  private reverbDebounceTimer: number | null = null;

  // 8. 3-Band EQ
  private eqLow: BiquadFilterNode | null = null;
  private eqMid: BiquadFilterNode | null = null;
  private eqHigh: BiquadFilterNode | null = null;

  // 9. Compressor & Multiband (OTT) + Master
  private compDry: GainNode | null = null;
  private compSingleWet: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private compMakeup: GainNode | null = null;

  private ottWet: GainNode | null = null;
  private ottLowSplit: BiquadFilterNode | null = null;
  private ottMidSplit1: BiquadFilterNode | null = null;
  private ottHighSplit: BiquadFilterNode | null = null;
  private ottLowComp: DynamicsCompressorNode | null = null;
  private ottMidComp: DynamicsCompressorNode | null = null;
  private ottHighComp: DynamicsCompressorNode | null = null;
  private ottMakeup: GainNode | null = null;
  private compOut: GainNode | null = null;

  // 10. Cabinet Simulator
  private cabDry: GainNode | null = null;
  private cabWet: GainNode | null = null;
  private cabPreHpf: BiquadFilterNode | null = null;
  private cabBodyPeak: BiquadFilterNode | null = null;
  private cabPresencePeak: BiquadFilterNode | null = null;
  private cabConeLpf: BiquadFilterNode | null = null;
  private cabConvolver: ConvolverNode | null = null;
  private cabOut: GainNode | null = null;
  private cabBranchConnected = true;
  private lastCabKey = '';
  private cabDebounceTimer: number | null = null;

  // 11. Stereo Tremolo
  private tremSplitter: ChannelSplitterNode | null = null;
  private tremGainL: GainNode | null = null;
  private tremGainR: GainNode | null = null;
  private tremMerger: ChannelMergerNode | null = null;
  private tremLfoSrc: AudioBufferSourceNode | null = null;
  private tremLfoSplit: ChannelSplitterNode | null = null;
  private tremLfoSmoothL: BiquadFilterNode | null = null;
  private tremLfoSmoothR: BiquadFilterNode | null = null;
  private tremLfoDepthL: GainNode | null = null;
  private tremLfoDepthR: GainNode | null = null;
  private lastTremBufKey = '';

  private distBranchConnected = true;
  private reverbBranchConnected = true;
  private compBranchMode: 'dry' | 'single' | 'ott' = 'dry';

  private safetyLimiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;

  public async ensureAudio(): Promise<AudioContext> {
    if (this.ctx && this.fxInput && (this.ctx.state as string) === 'running') {
      return this.ctx;
    }
    if (this.ensureInFlight) return this.ensureInFlight;

    this.ensureInFlight = (async () => {
      try {
        if (!this.ctx) {
          const ctx = await studioAudio.ensureAudio();
          this.ctx = ctx;
          this.noiseBuffers = this.buildNoiseBuffers(this.ctx);
          this.buildMasterChain(this.ctx);
          if (this.fxInput) {
            studioAudio.registerSerumFxInput(this.fxInput);
          }
          this.applyEffectsParams();
          if (this.modListener || this.voices.length > 0) {
            this.startModLoop();
          }
        } else if ((this.ctx.state as string) !== 'running') {
          await studioAudio.recoverIfSuspended();
        }
        return this.ctx;
      } catch (err) {
        studioAudio.reportError(err instanceof Error ? err.message : 'SynthEngine ensureAudio failed');
        throw err;
      } finally {
        this.ensureInFlight = null;
      }
    })();

    return this.ensureInFlight;
  }

  public setBpm(bpm: number): void {
    this.bpm = clamp(bpm, 40, 240);
    if (this.ctx && this.tremLfoSrc && this.patch.effects.tremolo?.enabled && this.patch.effects.tremolo.sync) {
      const hz = divisionToHz(this.patch.effects.tremolo.division, this.bpm);
      this.tremLfoSrc.playbackRate.setTargetAtTime(clamp(hz, 0.05, 25), this.ctx.currentTime, 0.015);
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public getActiveVoiceCount(): number {
    return this.voices.length;
  }

  public getCurrentTime(): number | null {
    return this.ctx ? this.ctx.currentTime : null;
  }

  public setModTelemetryListener(
    listener:
      | ((
          offsets: LiveModOffsets,
          lfoPhases: [number, number, number],
          voiceCount: number
        ) => void)
      | null
  ): void {
    this.modListener = listener;
    if (listener && this.ctx) {
      this.startModLoop();
    }
  }

  public setAutomationOverrides(
    next: Partial<{
      cutoff: number | null;
      resonance: number | null;
      wtPosition: number | null;
      lfoRate: number | null;
      lfoDepth: number | null;
      volume: number | null;
    }>
  ): void {
    if (next.cutoff !== undefined) this.automationOverrides.cutoff = next.cutoff;
    if (next.resonance !== undefined) this.automationOverrides.resonance = next.resonance;
    if (next.wtPosition !== undefined) this.automationOverrides.wtPosition = next.wtPosition;
    if (next.lfoRate !== undefined) this.automationOverrides.lfoRate = next.lfoRate;
    if (next.lfoDepth !== undefined) this.automationOverrides.lfoDepth = next.lfoDepth;
    if (next.volume !== undefined) this.automationOverrides.volume = next.volume;

    if (this.ctx && this.masterGain) {
      const targetVol =
        this.automationOverrides.volume !== null
          ? clamp(this.automationOverrides.volume, 0, 1)
          : this.patch.master.volume;
      if (Math.abs(targetVol - this.lastAutoVolumeApplied) > 0.004) {
        this.lastAutoVolumeApplied = targetVol;
        this.masterGain.gain.setTargetAtTime(targetVol * 0.72, this.ctx.currentTime, 0.012);
      }
    }
  }

  public clearAutomationOverrides(): void {
    this.automationOverrides.cutoff = null;
    this.automationOverrides.resonance = null;
    this.automationOverrides.wtPosition = null;
    this.automationOverrides.lfoRate = null;
    this.automationOverrides.lfoDepth = null;
    this.automationOverrides.volume = null;
    if (this.ctx && this.masterGain) {
      this.lastAutoVolumeApplied = this.patch.master.volume;
      this.masterGain.gain.setTargetAtTime(
        this.patch.master.volume * 0.72,
        this.ctx.currentTime,
        0.015
      );
    }
  }

  public setPatch(nextPatch: SynthPatch): void {
    const prev = this.patch;
    this.patch = nextPatch;

    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (
      prev.effects !== nextPatch.effects ||
      prev.modMatrix !== nextPatch.modMatrix ||
      prev.macros !== nextPatch.macros
    ) {
      this.applyEffectsParams();
    }

    if (this.masterGain && prev.master.volume !== nextPatch.master.volume) {
      const targetVol =
        this.automationOverrides.volume !== null
          ? clamp(this.automationOverrides.volume, 0, 1)
          : nextPatch.master.volume;
      this.lastAutoVolumeApplied = targetVol;
      this.masterGain.gain.setTargetAtTime(targetVol * 0.72, now, 0.015);
    }

    const hasRoutes = nextPatch.modMatrix.some((r) => r.enabled);
    const hasMacros = this.computeMacroSums();
    for (const voice of this.voices) {
      if (voice.isDying) continue;
      if (voice.subDirectOut !== nextPatch.subOsc.directOut) {
        try {
          voice.subGain.disconnect();
        } catch {
          // ignore
        }
        if (nextPatch.subOsc.directOut) {
          voice.subGain.connect(voice.ampGain);
        } else {
          voice.subGain.connect(voice.driveShaper);
        }
        voice.subDirectOut = nextPatch.subOsc.directOut;
      }

      for (let i = 0; i < 3; i++) {
        const oscCfg = nextPatch.oscillators[i];
        const slot = voice.oscSlots[i];
        if (oscCfg.enabled && slot.subOscs.length !== oscCfg.unisonVoices) {
          this.populateOscSlot(voice, i, oscCfg, now);
        }
        this.updateOscSlotPitchAndWave(voice, i, oscCfg, 0, 0, 0, 0, now);
      }

      this.updateVoiceSubAndNoise(voice, nextPatch, 0, 0, now);
      this.applyVoiceFilterConfig(voice, nextPatch, 0, 0, 0, 0, now);

      if (!hasRoutes && !hasMacros) {
        if (voice.lastPan !== 0) {
          voice.panner.pan.setTargetAtTime(0, now, 0.015);
          voice.lastPan = 0;
        }
        if (voice.lastAmpMod !== 1) {
          voice.modGain.gain.setTargetAtTime(1, now, 0.012);
          voice.lastAmpMod = 1;
        }
      }
    }
  }

  private computeMacroSums(): boolean {
    const mSums = this.macroSumsScratch;
    for (const k in mSums) {
      delete mSums[k as MacroTarget];
    }
    const macros = this.patch.macros;
    if (!macros) return false;
    let hasOffset = false;
    for (let i = 0; i < macros.length; i++) {
      const m = macros[i];
      const delta = (m.value - 0.5) * 2; // -1 .. +1, 0 at center 0.5
      if (Math.abs(delta) < 0.005) continue;
      for (let b = 0; b < m.bindings.length; b++) {
        const bind = m.bindings[b];
        if (Math.abs(bind.amount) < 0.005) continue;
        mSums[bind.target] = (mSums[bind.target] ?? 0) + delta * bind.amount;
        hasOffset = true;
      }
    }
    return hasOffset;
  }

  public setPitchBend(value: number): void {
    this.pitchBend = clamp(value, -1, 1);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of this.voices) {
      for (let i = 0; i < 3; i++) {
        this.updateOscSlotPitchAndWave(voice, i, this.patch.oscillators[i], 0, 0, 0, 0, now);
      }
      this.updateVoiceSubAndNoise(voice, this.patch, 0, 0, now);
    }
  }

  public setModWheel(value: number): void {
    this.modWheel = clamp(value, 0, 1);
  }

  public setHoldMode(enabled: boolean): void {
    this.holdMode = enabled;
    if (!enabled) {
      for (const midi of Array.from(this.sustainedNotes)) {
        if (!this.heldKeys.has(midi)) {
          this.sustainedNotes.delete(midi);
          this.releaseVoiceForNote(midi);
        }
      }
    }
  }

  private scheduleVoiceSourcesStop(voice: VoiceRuntime, stopAt: number): void {
    voice.scheduledStopTime = stopAt;
    for (const slot of voice.oscSlots) {
      for (const osc of slot.subOscs) {
        try {
          osc.stop(stopAt);
        } catch {
          // ignore if already stopped
        }
      }
    }
    if (voice.subOscNode) {
      try {
        voice.subOscNode.stop(stopAt);
      } catch {
        // ignore
      }
    }
    if (voice.noiseSource) {
      try {
        voice.noiseSource.stop(stopAt);
      } catch {
        // ignore
      }
    }
  }

  public scheduleNote(
    midiNote: number,
    velocity: number,
    startTime: number,
    endTime: number
  ): void {
    if (this.ctx && this.fxInput && (this.ctx.state as string) === 'running') {
      this.scheduleNoteOnCtx(this.ctx, midiNote, velocity, startTime, endTime);
      return;
    }
    void this.ensureAudio().then((ctx) => {
      this.scheduleNoteOnCtx(ctx, midiNote, velocity, startTime, endTime);
    });
  }

  private scheduleNoteOnCtx(
    ctx: AudioContext,
    midiNote: number,
    velocity: number,
    startTime: number,
    endTime: number
  ): void {
    const when = Math.max(ctx.currentTime, startTime);
    const offWhen = Math.max(when + 0.02, endTime);

    const voice = this.spawnVoice(ctx, midiNote, velocity, when, offWhen);
    if (!voice) return;

    const env = this.patch.ampEnv;
    const atk = Math.max(0.002, env.attack);
    const dec = Math.max(0.005, env.decay);
    const sus = clamp(env.sustain, 0.0001, 1);
    const rel = Math.max(0.012, env.release);
    const peak = clamp(velocity, 0.05, 1);
    const relStartAmp = peak * computeAdsrLevel(env, offWhen, when, null, 1);

    const g = voice.ampGain.gain;
    anchorParamForLinearRamp(g, when, 0.0001);
    if (offWhen >= when + atk) {
      g.linearRampToValueAtTime(peak, when + atk);
      g.setTargetAtTime(Math.max(0.0001, peak * sus), when + atk, dec / 3.2);
      anchorParamForLinearRamp(g, offWhen, Math.max(0.0001, relStartAmp));
    } else {
      g.linearRampToValueAtTime(Math.max(0.0001, relStartAmp), offWhen);
    }

    const tailSec = Math.max(0.08, rel * 2.4);
    const stopAt = offWhen + tailSec;
    g.setTargetAtTime(0.00001, offWhen, rel / 3.5);
    g.setValueAtTime(0, stopAt - 0.0015);

    this.scheduleVoiceSourcesStop(voice, stopAt);

    const cleanupDelayMs = Math.max(120, Math.round((stopAt - ctx.currentTime + 0.06) * 1000));
    voice.cleanupTimer = window.setTimeout(() => {
      this.destroyVoice(voice);
    }, cleanupDelayMs);
  }

  public async noteOn(midiNote: number, velocity = 0.85): Promise<void> {
    studioAudio.unlockSync();
    const ctx =
      this.ctx && this.fxInput && (this.ctx.state as string) === 'running'
        ? this.ctx
        : await this.ensureAudio();
    const now = ctx.currentTime;

    this.heldKeys.add(midiNote);
    this.sustainedNotes.delete(midiNote);

    const existing = this.voices.find((v) => v.midiNote === midiNote && v.noteOffTime === null);
    if (existing) {
      this.triggerVoiceOff(existing, now);
    }

    const voice = this.spawnVoice(ctx, midiNote, velocity, now, null);
    if (!voice) return;

    const env = this.patch.ampEnv;
    const atk = Math.max(0.002, env.attack);
    const dec = Math.max(0.005, env.decay);
    const sus = clamp(env.sustain, 0.0001, 1);
    const peak = clamp(velocity, 0.1, 1);

    const g = voice.ampGain.gain;
    anchorParamForLinearRamp(g, now, 0.0001);
    g.linearRampToValueAtTime(peak, now + atk);
    g.setTargetAtTime(Math.max(0.0001, peak * sus), now + atk, dec / 3.2);
  }

  private stealVoiceSmoothly(victim: VoiceRuntime, now: number): void {
    if (victim.cleanupTimer !== null) {
      clearTimeout(victim.cleanupTimer);
      victim.cleanupTimer = null;
    }
    const idx = this.voices.indexOf(victim);
    if (idx !== -1) this.voices.splice(idx, 1);
    studioAudio.setActiveVoiceCount(this.voices.length);
    victim.isDying = true;

    const stopAt = now + 0.02;
    try {
      const g = victim.ampGain.gain;
      const fallbackAmp =
        victim.noteOffTime !== null
          ? computeAdsrLevel(
              this.patch.ampEnv,
              now,
              victim.noteOnTime,
              victim.noteOffTime,
              victim.releaseStartAmp
            )
          : victim.peakAmp * computeAdsrLevel(this.patch.ampEnv, now, victim.noteOnTime, null, 1);
      anchorParamForLinearRamp(g, now, Math.max(0.0001, fallbackAmp));
      g.linearRampToValueAtTime(0, now + 0.016);
      this.scheduleVoiceSourcesStop(victim, stopAt);
    } catch {
      // ignore
    }

    victim.cleanupTimer = window.setTimeout(() => {
      this.destroyVoice(victim);
    }, 36);
  }

  private spawnVoice(
    ctx: AudioContext,
    midiNote: number,
    velocity: number,
    when: number,
    offWhen: number | null
  ): VoiceRuntime | null {
    const maxVoices = studioAudio.getMaxVoices();
    if (this.voices.length >= maxVoices) {
      let oldestReleasing: VoiceRuntime | null = null;
      for (const v of this.voices) {
        if (v.noteOffTime !== null) {
          if (!oldestReleasing || v.noteOffTime < (oldestReleasing.noteOffTime ?? Infinity)) {
            oldestReleasing = v;
          }
        }
      }
      const victim = oldestReleasing ?? this.voices[0];
      if (victim) {
        this.stealVoiceSmoothly(victim, ctx.currentTime);
      }
    }

    for (let l = 0; l < 3; l++) {
      if (this.patch.lfos[l].retrigger) {
        this.lfoPhases[l] = 0;
      }
    }

    const targetFreq = midiToFreq(midiNote);
    const startFreq =
      this.patch.master.glideMs > 0 && this.lastMidiNote !== null
        ? midiToFreq(this.lastMidiNote)
        : targetFreq;
    this.lastMidiNote = midiNote;

    const oscMix = ctx.createGain();
    oscMix.gain.value = 1;

    const subGain = ctx.createGain();
    subGain.gain.value = 0;

    let noiseFilter: BiquadFilterNode | null = null;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;

    const driveShaper = ctx.createWaveShaper();
    driveShaper.oversample = 'none';
    const initDriveAmt = this.patch.filter.enabled ? clamp(this.patch.filter.drive, 0, 1) : 0;
    const useDriveShaper = initDriveAmt > 0.004;
    const initialDriveQ = Math.round(initDriveAmt * QUANT_STEPS);
    const initialDriveKey = useDriveShaper ? `w:${initialDriveQ}` : 'w:bypass';
    driveShaper.curve = useDriveShaper ? getWarmSaturationCurve(initDriveAmt) : null;

    const filter1 = ctx.createBiquadFilter();
    const filter2 = ctx.createBiquadFilter();

    const useComb = this.patch.filter.mode === 'comb';
    let combDelay: DelayNode | null = null;
    let combFeedback: GainNode | null = null;
    if (useComb) {
      combDelay = ctx.createDelay(0.06);
      combDelay.delayTime.value = 0.004;
      combFeedback = ctx.createGain();
      combFeedback.gain.value = 0;
    }

    const filterDryGain = ctx.createGain();
    const filterWetGain = ctx.createGain();
    const filterSum = ctx.createGain();

    const ampGain = ctx.createGain();
    const modGain = ctx.createGain();
    modGain.gain.value = 1;

    const panner = ctx.createStereoPanner();
    panner.pan.value = 0;

    // Signal routing inside voice (comb delay and noise filter created lazily only when active)
    oscMix.connect(driveShaper);
    noiseGain.connect(driveShaper);

    driveShaper.connect(filterDryGain);
    driveShaper.connect(filter1);
    filter1.connect(filter2);

    if (useComb && combDelay && combFeedback) {
      filter2.connect(combDelay);
      combDelay.connect(combFeedback);
      combFeedback.connect(combDelay);
      combDelay.connect(filterWetGain);
    } else {
      filter2.connect(filterWetGain);
    }

    filterDryGain.connect(filterSum);
    filterWetGain.connect(filterSum);

    // Sub osc routes either directOut (post-filter) or pre-filter
    if (this.patch.subOsc.directOut) {
      subGain.connect(ampGain);
    } else {
      subGain.connect(driveShaper);
    }

    filterSum.connect(ampGain);
    ampGain.connect(modGain);
    modGain.connect(panner);
    panner.connect(this.fxInput!);

    const createEmptySlot = (): OscSlotRuntime => {
      const slotGain = ctx.createGain();
      slotGain.connect(oscMix);
      return {
        subOscs: [],
        subPans: [],
        slotGain,
        lastWaveKey: '',
        lastGain: -1,
        lastFreqs: [],
        lastPans: [],
      };
    };

    const peak = clamp(velocity, 0.05, 1);
    const relStartAmp =
      offWhen !== null ? peak * computeAdsrLevel(this.patch.ampEnv, offWhen, when, null, 1) : peak;
    const relStartMod =
      offWhen !== null ? computeAdsrLevel(this.patch.modEnv, offWhen, when, null, 1) : 0;

    // Sub Oscillator Node
    let subOscNode: OscillatorNode | null = null;
    if (this.patch.subOsc.enabled) {
      subOscNode = ctx.createOscillator();
      subOscNode.type = toSubOscType(this.patch.subOsc.shape);
      const subRatio = Math.pow(2, this.patch.subOsc.octave);
      subOscNode.frequency.setValueAtTime(clamp(targetFreq * subRatio, 18, 8000), when);
      subOscNode.connect(subGain);
      subOscNode.start(when);
    }

    // Noise Oscillator Source & Filter (created lazily only if enabled)
    let noiseSource: AudioBufferSourceNode | null = null;
    if (this.patch.noiseOsc.enabled && this.noiseBuffers) {
      noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.Q.value = 0.8;
      noiseFilter.connect(noiseGain);

      noiseSource = ctx.createBufferSource();
      noiseSource.buffer = this.noiseBuffers[this.patch.noiseOsc.type];
      noiseSource.loop = true;
      noiseSource.connect(noiseFilter);
      noiseSource.start(when);
    }

    const voice: VoiceRuntime = {
      id: this.nextVoiceId++,
      midiNote,
      baseFreq: targetFreq,
      noteOnTime: when,
      noteOffTime: offWhen,
      peakAmp: peak,
      releaseStartAmp: relStartAmp,
      releaseStartMod: relStartMod,
      scheduledStopTime: null,
      isDying: false,
      oscSlots: [createEmptySlot(), createEmptySlot(), createEmptySlot()],
      subOscNode,
      subGain,
      noiseSource,
      noiseFilter,
      noiseGain,
      oscMix,
      driveShaper,
      filter1,
      filter2,
      combDelay,
      combFeedback,
      combConnected: useComb,
      subDirectOut: this.patch.subOsc.directOut,
      filterDryGain,
      filterWetGain,
      filterSum,
      ampGain,
      modGain,
      panner,
      cleanupTimer: null,
      lastDriveKey: initialDriveKey,
      lastFilter1Type: '',
      lastFilter2Type: '',
      lastNoiseType: 'bandpass',
      lastNoiseBufType: this.patch.noiseOsc.type,
      lastNoiseQ: 0.8,
      lastNoiseFreq: -1,
      lastNoiseGain: 0,
      lastSubFreq: -1,
      lastSubGain: 0,
      lastDryGain: -1,
      lastWetGain: -1,
      lastF1Freq: -1,
      lastF1Q: -1,
      lastF2Freq: -1,
      lastF2Q: -1,
      lastF2Gain: -1,
      lastCombDelay: 0.004,
      lastCombFb: 0,
      lastPan: 0,
      lastAmpMod: 1,
    };

    for (let i = 0; i < 3; i++) {
      const cfg = this.patch.oscillators[i];
      if (cfg.enabled) {
        this.populateOscSlot(voice, i, cfg, when, startFreq, targetFreq);
      } else {
        voice.oscSlots[i].slotGain.gain.setValueAtTime(0, when);
        voice.oscSlots[i].lastGain = 0;
      }
    }

    this.updateVoiceSubAndNoise(voice, this.patch, 0, 0, when);
    this.applyVoiceFilterConfig(voice, this.patch, 0, 0, 0, 0, when);

    this.voices.push(voice);
    studioAudio.setActiveVoiceCount(this.voices.length);
    this.startModLoop();
    return voice;
  }

  public noteOff(midiNote: number): void {
    this.heldKeys.delete(midiNote);
    if (this.holdMode) {
      this.sustainedNotes.add(midiNote);
      return;
    }
    this.releaseVoiceForNote(midiNote);
  }

  public panic(immediate = false): void {
    this.heldKeys.clear();
    this.sustainedNotes.clear();
    if (!immediate && this.ctx && (this.ctx.state as string) === 'running') {
      const now = this.ctx.currentTime;
      for (const voice of [...this.voices]) {
        this.stealVoiceSmoothly(voice, now);
      }
      return;
    }
    for (const voice of [...this.voices]) {
      this.destroyVoice(voice);
    }
  }

  private releaseVoiceForNote(midiNote: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of this.voices) {
      if (voice.midiNote === midiNote && voice.noteOffTime === null) {
        this.triggerVoiceOff(voice, now);
      }
    }
  }

  private triggerVoiceOff(voice: VoiceRuntime, now: number): void {
    if (voice.noteOffTime !== null) return;
    const currentAmp =
      voice.peakAmp * computeAdsrLevel(this.patch.ampEnv, now, voice.noteOnTime, null, 1);
    const currentMod = computeAdsrLevel(this.patch.modEnv, now, voice.noteOnTime, null, 1);
    voice.noteOffTime = now;
    voice.releaseStartAmp = currentAmp;
    voice.releaseStartMod = currentMod;

    const rel = Math.max(0.012, this.patch.ampEnv.release);
    const tailSec = Math.max(0.08, rel * 2.4);
    const stopAt = now + tailSec;

    const g = voice.ampGain.gain;
    anchorParamForLinearRamp(g, now, Math.max(0.0001, currentAmp));
    g.setTargetAtTime(0.00001, now, rel / 3.5);
    g.setValueAtTime(0, stopAt - 0.0015);

    this.scheduleVoiceSourcesStop(voice, stopAt);

    const cleanupDelayMs = Math.max(120, Math.round((tailSec + 0.06) * 1000));
    voice.cleanupTimer = window.setTimeout(() => {
      this.destroyVoice(voice);
    }, cleanupDelayMs);
  }

  private destroyVoice(voice: VoiceRuntime): void {
    if (voice.cleanupTimer !== null) {
      clearTimeout(voice.cleanupTimer);
      voice.cleanupTimer = null;
    }
    const idx = this.voices.indexOf(voice);
    if (idx !== -1) this.voices.splice(idx, 1);
    studioAudio.setActiveVoiceCount(this.voices.length);

    for (const slot of voice.oscSlots) {
      for (const osc of slot.subOscs) {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // ignore
        }
      }
      slot.slotGain.disconnect();
    }
    if (voice.subOscNode) {
      try {
        voice.subOscNode.stop();
        voice.subOscNode.disconnect();
      } catch {
        // ignore
      }
    }
    if (voice.noiseSource) {
      try {
        voice.noiseSource.stop();
        voice.noiseSource.disconnect();
      } catch {
        // ignore
      }
    }
    try {
      voice.subGain.disconnect();
      voice.noiseFilter?.disconnect();
      voice.noiseGain.disconnect();
      voice.oscMix.disconnect();
      voice.driveShaper.disconnect();
      voice.filter1.disconnect();
      voice.filter2.disconnect();
      voice.combDelay?.disconnect();
      voice.combFeedback?.disconnect();
      voice.filterDryGain.disconnect();
      voice.filterWetGain.disconnect();
      voice.filterSum.disconnect();
      voice.ampGain.disconnect();
      voice.modGain.disconnect();
      voice.panner.disconnect();
    } catch {
      // ignore
    }
  }

  private getPeriodicWave(
    id: WavetableId,
    wtPos: number,
    warpMode: WarpMode,
    warpAmount: number
  ): PeriodicWave {
    const qPos = Math.round(clamp(wtPos, 0, 1) * 32) / 32;
    const qWarp = warpMode === 'none' ? 0 : Math.round(clamp(warpAmount, 0, 1) * 20) / 20;
    const key = `${id}:${qPos.toFixed(4)}:${warpMode}:${qWarp.toFixed(2)}`;
    let wave = this.waveCache.get(key);
    if (!wave && this.ctx) {
      wave = createInterpolatedPeriodicWave(this.ctx, id, qPos, warpMode, qWarp);
      if (this.waveCache.size > 450) {
        const firstKey = this.waveCache.keys().next().value;
        if (firstKey) this.waveCache.delete(firstKey);
      }
      this.waveCache.set(key, wave);
    }
    return wave!;
  }

  private populateOscSlot(
    voice: VoiceRuntime,
    slotIndex: number,
    cfg: OscillatorConfig,
    now: number,
    startBaseFreq?: number,
    targetBaseFreq?: number
  ): void {
    if (!this.ctx) return;
    const slot = voice.oscSlots[slotIndex];

    for (const osc of slot.subOscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // ignore
      }
    }
    for (const pan of slot.subPans) {
      pan.disconnect();
    }
    slot.subOscs = [];
    slot.subPans = [];
    slot.lastFreqs = [];
    slot.lastPans = [];

    const count = clamp(Math.round(cfg.unisonVoices), 1, 4);
    const wave = this.getPeriodicWave(cfg.wavetableId, cfg.wtPosition, cfg.warpMode, cfg.warpAmount);
    const qPos = Math.round(clamp(cfg.wtPosition, 0, 1) * 32) / 32;
    const qWarp = cfg.warpMode === 'none' ? 0 : Math.round(clamp(cfg.warpAmount, 0, 1) * 20) / 20;
    slot.lastWaveKey = `${cfg.wavetableId}:${qPos.toFixed(4)}:${cfg.warpMode}:${qWarp.toFixed(2)}`;

    const glideSec = this.patch.master.glideMs / 1000;
    const initFreq = startBaseFreq ?? voice.baseFreq;
    const destFreq = targetBaseFreq ?? voice.baseFreq;

    for (let u = 0; u < count; u++) {
      const osc = this.ctx.createOscillator();
      const panner = this.ctx.createStereoPanner();
      osc.setPeriodicWave(wave);

      let spread = 0;
      if (count === 2) spread = u === 0 ? -1 : 1;
      else if (count === 3) spread = u - 1;
      else if (count === 4) spread = -1 + (u / 3) * 2;

      const unisonCents = spread * cfg.unisonDetune * 32;
      const bendSemis = this.pitchBend * this.patch.master.pitchBendRange;
      const totalSemis = cfg.octave * 12 + cfg.semitone + bendSemis;
      const ratio = Math.pow(2, (totalSemis * 100 + cfg.detune + unisonCents) / 1200);
      const targetVoiceFreq = clamp(destFreq * ratio, 12, 18000);

      if (glideSec > 0.002 && startBaseFreq !== undefined && initFreq !== destFreq) {
        osc.frequency.setValueAtTime(clamp(initFreq * ratio, 12, 18000), now);
        osc.frequency.exponentialRampToValueAtTime(targetVoiceFreq, now + glideSec);
      } else {
        osc.frequency.setValueAtTime(targetVoiceFreq, now);
      }

      const targetPan = clamp(cfg.pan + spread * cfg.unisonDetune * 0.65, -1, 1);
      panner.pan.setValueAtTime(targetPan, now);

      osc.connect(panner);
      panner.connect(slot.slotGain);
      osc.start(now);

      slot.subOscs.push(osc);
      slot.subPans.push(panner);
      slot.lastFreqs.push(targetVoiceFreq);
      slot.lastPans.push(targetPan);
    }

    const unisonGainScale = 1 / Math.sqrt(count);
    const targetGain = cfg.enabled ? cfg.level * 0.34 * unisonGainScale : 0;
    if (slot.lastGain < 0) {
      slot.slotGain.gain.setValueAtTime(targetGain, now);
    } else {
      slot.slotGain.gain.setTargetAtTime(targetGain, now, 0.012);
    }
    slot.lastGain = targetGain;
  }

  private updateOscSlotPitchAndWave(
    voice: VoiceRuntime,
    slotIndex: number,
    cfg: OscillatorConfig,
    pitchModSemis: number,
    wtModOffset: number,
    warpModOffset: number,
    levelMod: number,
    now: number
  ): void {
    const slot = voice.oscSlots[slotIndex];
    if (!cfg.enabled) {
      if (slot.lastGain !== 0) {
        slot.slotGain.gain.setTargetAtTime(0, now, 0.015);
        slot.lastGain = 0;
      }
      return;
    }

    const count = slot.subOscs.length;
    if (count === 0) return;

    const effWtPos = clamp(cfg.wtPosition + wtModOffset, 0, 1);
    const effWarpAmt = clamp(cfg.warpAmount + warpModOffset, 0, 1);
    const qPos = Math.round(effWtPos * 32) / 32;
    const qWarp = cfg.warpMode === 'none' ? 0 : Math.round(effWarpAmt * 20) / 20;
    const waveKey = `${cfg.wavetableId}:${qPos.toFixed(4)}:${cfg.warpMode}:${qWarp.toFixed(2)}`;

    if (waveKey !== slot.lastWaveKey) {
      const wave = this.getPeriodicWave(cfg.wavetableId, effWtPos, cfg.warpMode, effWarpAmt);
      for (const osc of slot.subOscs) {
        osc.setPeriodicWave(wave);
      }
      slot.lastWaveKey = waveKey;
    }

    const bendSemis = this.pitchBend * this.patch.master.pitchBendRange;
    const totalSemis = cfg.octave * 12 + cfg.semitone + bendSemis + pitchModSemis;
    const skipFreqUpdate =
      this.patch.master.glideMs > 0 && now - voice.noteOnTime < this.patch.master.glideMs / 1000;

    for (let u = 0; u < count; u++) {
      let spread = 0;
      if (count === 2) spread = u === 0 ? -1 : 1;
      else if (count === 3) spread = u - 1;
      else if (count === 4) spread = -1 + (u / 3) * 2;

      if (!skipFreqUpdate) {
        const unisonCents = spread * cfg.unisonDetune * 32;
        const freq = clamp(
          voice.baseFreq * Math.pow(2, (totalSemis * 100 + cfg.detune + unisonCents) / 1200),
          12,
          18000
        );
        if (Math.abs(freq - (slot.lastFreqs[u] ?? -1)) > 0.15) {
          slot.subOscs[u].frequency.setTargetAtTime(freq, now, 0.01);
          slot.lastFreqs[u] = freq;
        }
      }

      const panVal = clamp(cfg.pan + spread * cfg.unisonDetune * 0.65, -1, 1);
      if (Math.abs(panVal - (slot.lastPans[u] ?? -99)) > 0.008) {
        slot.subPans[u].pan.setTargetAtTime(panVal, now, 0.015);
        slot.lastPans[u] = panVal;
      }
    }

    const unisonGainScale = 1 / Math.sqrt(count);
    const effLevel = clamp(cfg.level + levelMod, 0, 1);
    const targetGain = effLevel * 0.34 * unisonGainScale;
    if (Math.abs(targetGain - slot.lastGain) > 0.003) {
      slot.slotGain.gain.setTargetAtTime(targetGain, now, 0.012);
      slot.lastGain = targetGain;
    }
  }

  private updateVoiceSubAndNoise(
    voice: VoiceRuntime,
    patch: SynthPatch,
    subMod: number,
    noiseMod: number,
    now: number
  ): void {
    const sub = patch.subOsc;
    if (sub.enabled) {
      const subType = toSubOscType(sub.shape);
      if (!voice.subOscNode && this.ctx) {
        const osc = this.ctx.createOscillator();
        osc.type = subType;
        osc.connect(voice.subGain);
        osc.start(now);
        voice.subOscNode = osc;
      }
      if (voice.subOscNode) {
        if (voice.subOscNode.type !== subType) {
          voice.subOscNode.type = subType;
        }
        const bendSemis = this.pitchBend * patch.master.pitchBendRange;
        const subFreq = clamp(
          voice.baseFreq * Math.pow(2, sub.octave + bendSemis / 12),
          18,
          8000
        );
        if (Math.abs(subFreq - voice.lastSubFreq) > 0.15) {
          voice.subOscNode.frequency.setTargetAtTime(subFreq, now, 0.012);
          voice.lastSubFreq = subFreq;
        }
      }
      const nextSubGain = clamp(sub.level + subMod, 0, 1) * 0.42;
      if (Math.abs(nextSubGain - voice.lastSubGain) > 0.003) {
        voice.subGain.gain.setTargetAtTime(nextSubGain, now, 0.012);
        voice.lastSubGain = nextSubGain;
      }
    } else if (voice.lastSubGain !== 0) {
      voice.subGain.gain.setTargetAtTime(0, now, 0.012);
      voice.lastSubGain = 0;
    }

    const n = patch.noiseOsc;
    if (n.enabled) {
      if (!voice.noiseFilter && this.ctx) {
        const nf = this.ctx.createBiquadFilter();
        nf.type = 'bandpass';
        nf.Q.value = 0.8;
        nf.connect(voice.noiseGain);
        voice.noiseFilter = nf;
      }
      if (voice.noiseSource && voice.lastNoiseBufType !== n.type) {
        try {
          voice.noiseSource.stop();
          voice.noiseSource.disconnect();
        } catch {
          // ignore
        }
        voice.noiseSource = null;
      }
      if (!voice.noiseSource && this.ctx && this.noiseBuffers && voice.noiseFilter) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffers[n.type];
        src.loop = true;
        src.connect(voice.noiseFilter);
        src.start(now);
        voice.noiseSource = src;
        voice.lastNoiseBufType = n.type;
      }
      if (voice.noiseFilter) {
        const nextType: BiquadFilterType = n.type === 'bright' ? 'highpass' : 'bandpass';
        if (voice.lastNoiseType !== nextType) {
          voice.noiseFilter.type = nextType;
          voice.lastNoiseType = nextType;
        }
        const cutoff = clamp(280 * Math.pow(55, clamp(n.pitch, 0, 1)), 120, 16000);
        if (Math.abs(cutoff - voice.lastNoiseFreq) > 1) {
          voice.noiseFilter.frequency.setTargetAtTime(cutoff, now, 0.015);
          voice.lastNoiseFreq = cutoff;
        }
        const nextQ = n.type === 'metallic' ? 6.5 : 0.9;
        if (Math.abs(nextQ - voice.lastNoiseQ) > 0.05) {
          voice.noiseFilter.Q.setTargetAtTime(nextQ, now, 0.015);
          voice.lastNoiseQ = nextQ;
        }
      }
      const nextNoiseGain = clamp(n.level + noiseMod, 0, 1) * 0.32;
      if (Math.abs(nextNoiseGain - voice.lastNoiseGain) > 0.003) {
        voice.noiseGain.gain.setTargetAtTime(nextNoiseGain, now, 0.012);
        voice.lastNoiseGain = nextNoiseGain;
      }
    } else if (voice.lastNoiseGain !== 0) {
      voice.noiseGain.gain.setTargetAtTime(0, now, 0.012);
      voice.lastNoiseGain = 0;
    }
  }

  private syncCombRouting(voice: VoiceRuntime, wantComb: boolean): void {
    if (voice.combConnected === wantComb) return;
    if (wantComb && (!voice.combDelay || !voice.combFeedback) && this.ctx) {
      const cd = this.ctx.createDelay(0.06);
      cd.delayTime.value = 0.004;
      const fb = this.ctx.createGain();
      fb.gain.value = 0;
      voice.combDelay = cd;
      voice.combFeedback = fb;
    }
    try {
      voice.filter2.disconnect();
      voice.combDelay?.disconnect();
      voice.combFeedback?.disconnect();
    } catch {
      // ignore
    }
    if (wantComb && voice.combDelay && voice.combFeedback) {
      voice.filter2.connect(voice.combDelay);
      voice.combDelay.connect(voice.combFeedback);
      voice.combFeedback.connect(voice.combDelay);
      voice.combDelay.connect(voice.filterWetGain);
      voice.combConnected = true;
    } else {
      voice.filter2.connect(voice.filterWetGain);
      voice.combConnected = false;
    }
  }

  private applyVoiceFilterConfig(
    voice: VoiceRuntime,
    patch: SynthPatch,
    cutoffModOctaves: number,
    resMod: number,
    driveMod: number,
    mixMod: number,
    now: number
  ): void {
    const f = patch.filter;
    if (!f.enabled) {
      if (voice.lastDryGain !== 1) {
        voice.filterDryGain.gain.setTargetAtTime(1, now, 0.015);
        voice.lastDryGain = 1;
      }
      if (voice.lastWetGain !== 0) {
        voice.filterWetGain.gain.setTargetAtTime(0, now, 0.015);
        voice.lastWetGain = 0;
      }
      if (voice.lastDriveKey !== 'w:bypass') {
        voice.driveShaper.curve = null;
        voice.lastDriveKey = 'w:bypass';
      }
      return;
    }

    const effMix = clamp(f.mix + mixMod, 0, 1);
    const dryTarget = 1 - effMix;
    if (Math.abs(dryTarget - voice.lastDryGain) > 0.006) {
      voice.filterDryGain.gain.setTargetAtTime(dryTarget, now, 0.012);
      voice.lastDryGain = dryTarget;
    }
    if (Math.abs(effMix - voice.lastWetGain) > 0.006) {
      voice.filterWetGain.gain.setTargetAtTime(effMix, now, 0.012);
      voice.lastWetGain = effMix;
    }

    const baseCutoff =
      this.automationOverrides.cutoff !== null
        ? 35 * Math.pow(520, clamp(this.automationOverrides.cutoff, 0, 1))
        : f.cutoff;
    const baseRes =
      this.automationOverrides.resonance !== null
        ? 0.5 + clamp(this.automationOverrides.resonance, 0, 1) * 18
        : f.resonance;

    const effCutoff = clamp(baseCutoff * Math.pow(2, cutoffModOctaves), 24, 19500);
    const effQ = clamp(baseRes + resMod, 0.1, 22);
    const effDrive = clamp(f.drive + driveMod, 0, 1);

    const driveQ = Math.round(effDrive * QUANT_STEPS);
    const driveKey = effDrive > 0.004 ? `w:${driveQ}` : 'w:bypass';
    if (driveKey !== voice.lastDriveKey) {
      voice.driveShaper.curve =
        effDrive > 0.004 ? getWarmSaturationCurve(effDrive) : null;
      voice.lastDriveKey = driveKey;
    }

    if (f.mode === 'comb') {
      this.syncCombRouting(voice, true);
      if (voice.lastFilter1Type !== 'lowpass') {
        voice.filter1.type = 'lowpass';
        voice.lastFilter1Type = 'lowpass';
      }
      if (Math.abs(14000 - voice.lastF1Freq) > 5) {
        voice.filter1.frequency.setTargetAtTime(14000, now, 0.015);
        voice.lastF1Freq = 14000;
      }
      if (Math.abs(0.5 - voice.lastF1Q) > 0.02) {
        voice.filter1.Q.setTargetAtTime(0.5, now, 0.015);
        voice.lastF1Q = 0.5;
      }
      if (voice.lastFilter2Type !== 'lowpass') {
        voice.filter2.type = 'lowpass';
        voice.lastFilter2Type = 'lowpass';
      }
      if (Math.abs(14000 - voice.lastF2Freq) > 5) {
        voice.filter2.frequency.setTargetAtTime(14000, now, 0.015);
        voice.lastF2Freq = 14000;
      }
      if (Math.abs(0.5 - voice.lastF2Q) > 0.02) {
        voice.filter2.Q.setTargetAtTime(0.5, now, 0.015);
        voice.lastF2Q = 0.5;
      }
      const combPeriod = clamp(1 / Math.max(45, effCutoff), 0.0008, 0.04);
      if (voice.combDelay && Math.abs(combPeriod - voice.lastCombDelay) > 0.00004) {
        voice.combDelay.delayTime.setTargetAtTime(combPeriod, now, 0.01);
        voice.lastCombDelay = combPeriod;
      }
      const combFb = clamp(effQ / 22, 0.1, 0.88);
      if (voice.combFeedback && Math.abs(combFb - voice.lastCombFb) > 0.008) {
        voice.combFeedback.gain.setTargetAtTime(combFb, now, 0.012);
        voice.lastCombFb = combFb;
      }
      return;
    }

    this.syncCombRouting(voice, false);

    if (f.mode === 'formant') {
      if (voice.lastFilter1Type !== 'bandpass') {
        voice.filter1.type = 'bandpass';
        voice.lastFilter1Type = 'bandpass';
      }
      const f1Freq = clamp(effCutoff * 0.65, 90, 4200);
      const f1Q = clamp(effQ * 0.55 + 1.5, 1.5, 12);
      if (Math.abs(f1Freq - voice.lastF1Freq) > 0.5) {
        voice.filter1.frequency.setTargetAtTime(f1Freq, now, 0.01);
        voice.lastF1Freq = f1Freq;
      }
      if (Math.abs(f1Q - voice.lastF1Q) > 0.03) {
        voice.filter1.Q.setTargetAtTime(f1Q, now, 0.01);
        voice.lastF1Q = f1Q;
      }

      if (voice.lastFilter2Type !== 'peaking') {
        voice.filter2.type = 'peaking';
        voice.lastFilter2Type = 'peaking';
      }
      const f2Freq = clamp(effCutoff * 1.9, 250, 9000);
      const f2Q = clamp(effQ * 0.45 + 1.2, 1.2, 10);
      const f2Gain = 8 + effDrive * 8;
      if (Math.abs(f2Freq - voice.lastF2Freq) > 0.8) {
        voice.filter2.frequency.setTargetAtTime(f2Freq, now, 0.01);
        voice.lastF2Freq = f2Freq;
      }
      if (Math.abs(f2Q - voice.lastF2Q) > 0.03) {
        voice.filter2.Q.setTargetAtTime(f2Q, now, 0.01);
        voice.lastF2Q = f2Q;
      }
      if (Math.abs(f2Gain - voice.lastF2Gain) > 0.05) {
        voice.filter2.gain.setTargetAtTime(f2Gain, now, 0.012);
        voice.lastF2Gain = f2Gain;
      }
      return;
    }

    const isDual24 = f.mode === 'lp24' || f.mode === 'hp24';
    const biquadType: BiquadFilterType =
      f.mode === 'lp12' || f.mode === 'lp24'
        ? 'lowpass'
        : f.mode === 'hp12' || f.mode === 'hp24'
        ? 'highpass'
        : f.mode === 'bp12'
        ? 'bandpass'
        : 'notch';

    if (voice.lastFilter1Type !== biquadType) {
      voice.filter1.type = biquadType;
      voice.lastFilter1Type = biquadType;
    }
    if (Math.abs(effCutoff - voice.lastF1Freq) > 0.5) {
      voice.filter1.frequency.setTargetAtTime(effCutoff, now, 0.01);
      voice.lastF1Freq = effCutoff;
    }
    const f1Q = isDual24 ? effQ * 0.65 : effQ;
    if (Math.abs(f1Q - voice.lastF1Q) > 0.03) {
      voice.filter1.Q.setTargetAtTime(f1Q, now, 0.01);
      voice.lastF1Q = f1Q;
    }

    if (isDual24) {
      if (voice.lastFilter2Type !== biquadType) {
        voice.filter2.type = biquadType;
        voice.lastFilter2Type = biquadType;
      }
      if (Math.abs(effCutoff - voice.lastF2Freq) > 0.5) {
        voice.filter2.frequency.setTargetAtTime(effCutoff, now, 0.01);
        voice.lastF2Freq = effCutoff;
      }
      if (Math.abs(f1Q - voice.lastF2Q) > 0.03) {
        voice.filter2.Q.setTargetAtTime(f1Q, now, 0.01);
        voice.lastF2Q = f1Q;
      }
    } else {
      if (voice.lastFilter2Type !== 'lowpass') {
        voice.filter2.type = 'lowpass';
        voice.lastFilter2Type = 'lowpass';
      }
      if (Math.abs(19500 - voice.lastF2Freq) > 5) {
        voice.filter2.frequency.setTargetAtTime(19500, now, 0.015);
        voice.lastF2Freq = 19500;
      }
      if (Math.abs(0.1 - voice.lastF2Q) > 0.02) {
        voice.filter2.Q.setTargetAtTime(0.1, now, 0.015);
        voice.lastF2Q = 0.1;
      }
    }
  }

  private startModLoop(): void {
    if (this.rafId !== null) return;
    this.lastRafTime = performance.now();

    const tick = (ts: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (ts - this.lastRafTime) / 1000));
      this.lastRafTime = ts;

      // Skip heavy work when browser tab is backgrounded
      if (typeof document !== 'undefined' && document.hidden) {
        this.rafId = requestAnimationFrame(tick);
        return;
      }

      const activeVoiceCount = this.voices.length;
      const hasModRoutes = this.patch.modMatrix.some((r) => r.enabled);
      const hasActiveMacros = this.computeMacroSums();
      const auto = this.automationOverrides;
      const hasAutomation =
        auto.cutoff !== null ||
        auto.resonance !== null ||
        auto.wtPosition !== null ||
        auto.lfoRate !== null ||
        auto.lfoDepth !== null;
      const mSums = this.macroSumsScratch;

      const wobbleOffset = clamp(mSums.WOBBLE_SPEED ?? 0, -1, 1);
      const lfoRateAutoMul =
        auto.lfoRate !== null ? Math.pow(4, (clamp(auto.lfoRate, 0, 1) - 0.5) * 2) : 1;

      // Advance LFO phases only when voices are sounding or telemetry UI is subscribed
      if (activeVoiceCount > 0 || this.modListener) {
        const SYNC_SPEED_RATIOS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
        for (let i = 0; i < 3; i++) {
          const lfo = this.patch.lfos[i];
          let hz = lfo.sync ? divisionToHz(lfo.division, this.bpm) : lfo.rateHz;
          if (i < 2 && Math.abs(wobbleOffset) > 0.005) {
            if (lfo.sync) {
              const ratioIdx =
                wobbleOffset < 0
                  ? Math.max(0, Math.round((wobbleOffset + 1) * 3))
                  : Math.min(7, 3 + Math.round(wobbleOffset * 4));
              hz *= SYNC_SPEED_RATIOS[ratioIdx];
            } else {
              hz *= Math.pow(4, wobbleOffset);
            }
          }
          if (i < 2 && auto.lfoRate !== null) {
            hz *= lfoRateAutoMul;
          }
          this.lfoPhases[i] = (this.lfoPhases[i] + dt * hz) % 1;
        }
      }

      if (activeVoiceCount === 0 && !this.modListener) {
        this.rafId = null;
        return;
      }

      for (let i = 0; i < 3; i++) {
        const lfo = this.patch.lfos[i];
        const depthMacro =
          i === 0 ? mSums.LFO1_DEPTH ?? 0 : i === 1 ? mSums.LFO2_DEPTH ?? 0 : 0;
        const baseDepth = i === 0 && auto.lfoDepth !== null ? clamp(auto.lfoDepth, 0, 1) * 1.2 : lfo.depth;
        const effDepth = clamp(baseDepth + depthMacro * 0.65, 0, 1.35);
        this.lfoValsScratch[i] =
          evaluateLfoValue(lfo.points, this.lfoPhases[i], lfo.bipolar) * effDepth;
      }

      const ctx = this.ctx;
      const now = ctx ? ctx.currentTime : 0;

      const getSourceVal = (src: ModSource, modEnvVal: number, ampEnvVal: number): number => {
        switch (src) {
          case 'LFO1':
            return this.lfoValsScratch[0];
          case 'LFO2':
            return this.lfoValsScratch[1];
          case 'LFO3':
            return this.lfoValsScratch[2];
          case 'MOD_ENV':
            return modEnvVal;
          case 'AMP_ENV':
            return ampEnvVal;
          case 'MOD_WHEEL':
            return this.modWheel;
        }
      };

      // Live Distortion Drive & Mix modulation on master distortion unit (LFOs + Macros)
      const distDriveMacro = (mSums.FX_DIST_DRIVE ?? 0) * 0.55;
      const distMixMacro = (mSums.FX_DIST_MIX ?? 0) * 0.5;
      if (
        ctx &&
        (hasModRoutes || hasActiveMacros) &&
        this.distPre &&
        this.distShaper &&
        this.distWet &&
        this.distDry &&
        (this.patch.effects.distortion.enabled || distDriveMacro > 0.03 || distMixMacro > 0.03)
      ) {
        let distMod = 0;
        if (hasModRoutes) {
          const latest = activeVoiceCount > 0 ? this.voices[activeVoiceCount - 1] : null;
          const mEnv = latest
            ? computeAdsrLevel(this.patch.modEnv, now, latest.noteOnTime, latest.noteOffTime, latest.releaseStartMod)
            : 0;
          const aEnv = latest
            ? computeAdsrLevel(this.patch.ampEnv, now, latest.noteOnTime, latest.noteOffTime, latest.releaseStartAmp)
            : 0;
          for (const route of this.patch.modMatrix) {
            if (route.enabled && route.target === 'FX_DIST_DRIVE') {
              distMod += getSourceVal(route.source, mEnv, aEnv) * route.amount;
            }
          }
        }
        const baseMix = this.patch.effects.distortion.enabled
          ? clamp(this.patch.effects.distortion.mix, 0, 1)
          : 0;
        const effMix = clamp(baseMix + distMixMacro, 0, 1);
        this.distDry.gain.setTargetAtTime(1 - effMix * 0.65, now, 0.015);
        this.distWet.gain.setTargetAtTime(effMix, now, 0.015);

        const effDrive = clamp(this.patch.effects.distortion.drive + distMod + distDriveMacro, 0, 1);
        const preGain = 1 + effDrive * 4;
        if (Math.abs(preGain - this.lastDistPreGain) > 0.02) {
          this.distPre.gain.setTargetAtTime(preGain, now, 0.015);
          this.lastDistPreGain = preGain;
        }
        const dKey = `${this.patch.effects.distortion.mode}:${Math.round(effDrive * QUANT_STEPS)}`;
        if (dKey !== this.lastDistCurveKey) {
          this.distShaper.curve = getDistortionCurve(this.patch.effects.distortion.mode, effDrive);
          this.lastDistCurveKey = dKey;
        }
      }

      const activeMod =
        hasModRoutes || hasActiveMacros || hasAutomation || this.patch.filter.envAmount !== 0;
      const filterMoveScale = clamp(1 + (mSums.FILTER_MOVEMENT ?? 0) * 0.9, 0.05, 2.1);
      const autoWtDeltaA =
        auto.wtPosition !== null
          ? clamp(auto.wtPosition, 0, 1) - this.patch.oscillators[0].wtPosition
          : 0;
      const autoWtDeltaB =
        auto.wtPosition !== null
          ? clamp(auto.wtPosition, 0, 1) - this.patch.oscillators[1].wtPosition
          : 0;
      const autoWtDeltaC =
        auto.wtPosition !== null
          ? clamp(auto.wtPosition, 0, 1) - this.patch.oscillators[2].wtPosition
          : 0;

      if (ctx && activeVoiceCount > 0 && (activeMod || this.hadActiveMod)) {
        const sums = this.modSumsScratch;
        for (let v = 0; v < activeVoiceCount; v++) {
          const voice = this.voices[v];
          if (voice.isDying) continue;

          const voiceModEnv = activeMod
            ? computeAdsrLevel(
                this.patch.modEnv,
                now,
                voice.noteOnTime,
                voice.noteOffTime,
                voice.releaseStartMod
              )
            : 0;
          const voiceAmpEnv = activeMod
            ? computeAdsrLevel(
                this.patch.ampEnv,
                now,
                voice.noteOnTime,
                voice.noteOffTime,
                voice.releaseStartAmp
              )
            : 0;

          // Reset reusable sums object in-place (zero allocation)
          for (const k in sums) {
            delete sums[k as ModTarget];
          }
          if (hasModRoutes) {
            for (const route of this.patch.modMatrix) {
              if (!route.enabled) continue;
              const contrib = getSourceVal(route.source, voiceModEnv, voiceAmpEnv) * route.amount;
              sums[route.target] = (sums[route.target] ?? 0) + contrib;
            }
          }

          const cutoffOctaves =
            (this.patch.filter.envAmount * voiceModEnv * 5.2 + (sums.FILTER_CUTOFF ?? 0) * 5.2) *
              filterMoveScale +
            (mSums.FILTER_CUTOFF ?? 0) * 3.2 +
            (mSums.FILTER_MOVEMENT ?? 0) * 0.55;
          const resOffset = (sums.FILTER_RES ?? 0) * 12 + (mSums.FILTER_RES ?? 0) * 7.5;
          const driveOffset = (sums.FILTER_DRIVE ?? 0) + (mSums.FILTER_DRIVE ?? 0) * 0.55;
          const mixOffset = (sums.FILTER_MIX ?? 0) + (mSums.FILTER_MIX ?? 0) * 0.5;
          this.applyVoiceFilterConfig(
            voice,
            this.patch,
            cutoffOctaves,
            resOffset,
            driveOffset,
            mixOffset,
            now
          );

          this.updateOscSlotPitchAndWave(
            voice,
            0,
            this.patch.oscillators[0],
            (sums.OSC_A_PITCH ?? 0) * 12,
            (sums.OSC_A_WT ?? 0) + (mSums.OSC_A_WT ?? 0) * 0.55 + autoWtDeltaA,
            (sums.OSC_A_WARP ?? 0) + (mSums.OSC_A_WARP ?? 0) * 0.55,
            (sums.OSC_A_LEVEL ?? 0) + (mSums.OSC_A_LEVEL ?? 0) * 0.45,
            now
          );
          this.updateOscSlotPitchAndWave(
            voice,
            1,
            this.patch.oscillators[1],
            (sums.OSC_B_PITCH ?? 0) * 12,
            (sums.OSC_B_WT ?? 0) + (mSums.OSC_B_WT ?? 0) * 0.55 + autoWtDeltaB,
            (sums.OSC_B_WARP ?? 0) + (mSums.OSC_B_WARP ?? 0) * 0.55,
            (sums.OSC_B_LEVEL ?? 0) + (mSums.OSC_B_LEVEL ?? 0) * 0.45,
            now
          );
          this.updateOscSlotPitchAndWave(
            voice,
            2,
            this.patch.oscillators[2],
            (sums.OSC_C_PITCH ?? 0) * 12,
            (sums.OSC_C_WT ?? 0) + (mSums.OSC_C_WT ?? 0) * 0.55 + autoWtDeltaC,
            (sums.OSC_C_WARP ?? 0) + (mSums.OSC_C_WARP ?? 0) * 0.55,
            sums.OSC_C_LEVEL ?? 0,
            now
          );

          this.updateVoiceSubAndNoise(
            voice,
            this.patch,
            (sums.SUB_LEVEL ?? 0) + (mSums.SUB_LEVEL ?? 0) * 0.45,
            (sums.NOISE_LEVEL ?? 0) + (mSums.NOISE_LEVEL ?? 0) * 0.4,
            now
          );

          const panVal = clamp(sums.PAN ?? 0, -1, 1);
          if (Math.abs(panVal - voice.lastPan) > 0.008) {
            voice.panner.pan.setTargetAtTime(panVal, now, 0.015);
            voice.lastPan = panVal;
          }
          const ampMod = clamp(1 + (sums.AMP_LEVEL ?? 0), 0.04, 1.5);
          if (Math.abs(ampMod - voice.lastAmpMod) > 0.006) {
            voice.modGain.gain.setTargetAtTime(ampMod, now, 0.012);
            voice.lastAmpMod = ampMod;
          }
        }
      }
      this.hadActiveMod = activeMod;

      // Emit UI telemetry at ~20fps only when active or routes/macros exist
      if (this.modListener && ts - this.lastUiTelemetryEmit >= 48) {
        this.lastUiTelemetryEmit = ts;
        const uiOffsets: LiveModOffsets = {};
        if (hasModRoutes || hasActiveMacros) {
          let latestModEnv = 0;
          let latestAmpEnv = 0;
          if (activeVoiceCount > 0) {
            const latest = this.voices[activeVoiceCount - 1];
            latestModEnv = computeAdsrLevel(
              this.patch.modEnv,
              now,
              latest.noteOnTime,
              latest.noteOffTime,
              latest.releaseStartMod
            );
            latestAmpEnv = computeAdsrLevel(
              this.patch.ampEnv,
              now,
              latest.noteOnTime,
              latest.noteOffTime,
              latest.releaseStartAmp
            );
          }
          for (const route of this.patch.modMatrix) {
            if (!route.enabled) continue;
            const rawVal = getSourceVal(route.source, latestModEnv, latestAmpEnv) * route.amount;
            const val = route.target === 'FILTER_CUTOFF' ? rawVal * filterMoveScale : rawVal;
            uiOffsets[route.target] = (uiOffsets[route.target] ?? 0) + val;
          }
          if (hasActiveMacros) {
            if (mSums.OSC_A_WT) uiOffsets.OSC_A_WT = (uiOffsets.OSC_A_WT ?? 0) + mSums.OSC_A_WT * 0.55;
            if (mSums.OSC_B_WT) uiOffsets.OSC_B_WT = (uiOffsets.OSC_B_WT ?? 0) + mSums.OSC_B_WT * 0.55;
            if (mSums.OSC_C_WT) uiOffsets.OSC_C_WT = (uiOffsets.OSC_C_WT ?? 0) + mSums.OSC_C_WT * 0.55;
            if (mSums.OSC_A_WARP) uiOffsets.OSC_A_WARP = (uiOffsets.OSC_A_WARP ?? 0) + mSums.OSC_A_WARP * 0.55;
            if (mSums.OSC_B_WARP) uiOffsets.OSC_B_WARP = (uiOffsets.OSC_B_WARP ?? 0) + mSums.OSC_B_WARP * 0.55;
            if (mSums.OSC_C_WARP) uiOffsets.OSC_C_WARP = (uiOffsets.OSC_C_WARP ?? 0) + mSums.OSC_C_WARP * 0.55;
            if (mSums.FILTER_CUTOFF || mSums.FILTER_MOVEMENT) {
              uiOffsets.FILTER_CUTOFF =
                (uiOffsets.FILTER_CUTOFF ?? 0) +
                (mSums.FILTER_CUTOFF ?? 0) * 0.65 +
                (mSums.FILTER_MOVEMENT ?? 0) * 0.12;
            }
            if (mSums.FILTER_RES) uiOffsets.FILTER_RES = (uiOffsets.FILTER_RES ?? 0) + mSums.FILTER_RES * 0.6;
            if (mSums.FILTER_DRIVE) uiOffsets.FILTER_DRIVE = (uiOffsets.FILTER_DRIVE ?? 0) + mSums.FILTER_DRIVE * 0.55;
            if (mSums.FX_DIST_DRIVE) uiOffsets.FX_DIST_DRIVE = (uiOffsets.FX_DIST_DRIVE ?? 0) + mSums.FX_DIST_DRIVE * 0.55;
          }
        }
        this.modListener(
          uiOffsets,
          [this.lfoPhases[0], this.lfoPhases[1], this.lfoPhases[2]],
          activeVoiceCount
        );
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private buildNoiseBuffers(ctx: AudioContext): Record<NoiseOscConfig['type'], AudioBuffer> {
    const length = ctx.sampleRate; // 1s stereo buffer saves mobile RAM & GC pressure
    const makeBuf = (fill: (data: Float32Array, ch: number) => void): AudioBuffer => {
      const buf = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        fill(buf.getChannelData(ch), ch);
      }
      return buf;
    };

    return {
      white: makeBuf((d) => {
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }),
      pink: makeBuf((d) => {
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < d.length; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99765 * b0 + w * 0.099046;
          b1 = 0.963 * b1 + w * 0.2965164;
          b2 = 0.57 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
        }
      }),
      bright: makeBuf((d) => {
        let prev = 0;
        for (let i = 0; i < d.length; i++) {
          const w = Math.random() * 2 - 1;
          d[i] = (w - prev * 0.65) * 0.6;
          prev = w;
        }
      }),
      metallic: makeBuf((d, ch) => {
        const baseFreq = ch === 0 ? 310 : 347;
        for (let i = 0; i < d.length; i++) {
          const t = i / ctx.sampleRate;
          const ring = Math.sin(t * baseFreq * Math.PI * 2) * Math.sin(t * 741 * Math.PI * 2);
          d[i] = ring * 0.6 + (Math.random() * 2 - 1) * 0.4;
        }
      }),
    };
  }

  private buildMasterChain(ctx: AudioContext): void {
    this.fxInput = ctx.createGain();
    this.fxInput.gain.setValueAtTime(1, ctx.currentTime);

    // 1. Distortion
    this.distDry = ctx.createGain();
    this.distWet = ctx.createGain();
    this.distPre = ctx.createGain();
    this.distShaper = ctx.createWaveShaper();
    this.distShaper.oversample = isTouchMobileDevice() ? 'none' : '2x';
    this.distTone = ctx.createBiquadFilter();
    this.distTone.type = 'lowpass';
    this.distOut = ctx.createGain();
    this.distBranchConnected = true;

    this.fxInput.connect(this.distDry);
    this.fxInput.connect(this.distPre);
    this.distPre.connect(this.distShaper);
    this.distShaper.connect(this.distTone);
    this.distTone.connect(this.distWet);
    this.distDry.connect(this.distOut);
    this.distWet.connect(this.distOut);

    // 2. Hyper & Dimension
    this.hyperDry = ctx.createGain();
    this.hyperWet = ctx.createGain();
    this.hyperDelayL = ctx.createDelay(0.06);
    this.hyperDelayR = ctx.createDelay(0.06);
    this.hyperDelayL.delayTime.value = 0.011;
    this.hyperDelayR.delayTime.value = 0.016;
    this.hyperLfo = ctx.createOscillator();
    this.hyperLfo.frequency.value = 1.8;
    this.hyperLfoGainL = ctx.createGain();
    this.hyperLfoGainR = ctx.createGain();
    this.hyperLfo.connect(this.hyperLfoGainL);
    this.hyperLfo.connect(this.hyperLfoGainR);
    this.hyperLfoGainL.connect(this.hyperDelayL.delayTime);
    this.hyperLfoGainR.connect(this.hyperDelayR.delayTime);
    this.hyperLfo.start();

    const hyperMerger = ctx.createChannelMerger(2);
    this.dimDelayL = ctx.createDelay(0.06);
    this.dimDelayR = ctx.createDelay(0.06);
    this.dimWet = ctx.createGain();
    const dimMerger = ctx.createChannelMerger(2);
    this.hyperOut = ctx.createGain();

    this.distOut.connect(this.hyperDry);
    this.distOut.connect(this.hyperDelayL);
    this.distOut.connect(this.hyperDelayR);
    this.hyperDelayL.connect(hyperMerger, 0, 0);
    this.hyperDelayR.connect(hyperMerger, 0, 1);
    hyperMerger.connect(this.hyperWet);

    this.distOut.connect(this.dimDelayL);
    this.distOut.connect(this.dimDelayR);
    this.dimDelayL.connect(dimMerger, 0, 0);
    this.dimDelayR.connect(dimMerger, 0, 1);
    dimMerger.connect(this.dimWet);

    this.hyperDry.connect(this.hyperOut);
    this.hyperWet.connect(this.hyperOut);
    this.dimWet.connect(this.hyperOut);

    // 3. Phaser (4-stage allpass)
    this.phaserDry = ctx.createGain();
    this.phaserWet = ctx.createGain();
    this.phaserFb = ctx.createGain();
    this.phaserLfo = ctx.createOscillator();
    this.phaserLfoGain = ctx.createGain();
    this.phaserOut = ctx.createGain();

    this.phaserStages = [0, 1, 2, 3].map(() => {
      const f = ctx.createBiquadFilter();
      f.type = 'allpass';
      f.frequency.value = 800;
      f.Q.value = 0.7;
      this.phaserLfoGain!.connect(f.frequency);
      return f;
    });
    this.phaserLfo.connect(this.phaserLfoGain);
    this.phaserLfo.start();

    this.hyperOut.connect(this.phaserDry);
    this.hyperOut.connect(this.phaserStages[0]);
    for (let i = 0; i < this.phaserStages.length - 1; i++) {
      this.phaserStages[i].connect(this.phaserStages[i + 1]);
    }
    const lastStage = this.phaserStages[this.phaserStages.length - 1];
    lastStage.connect(this.phaserFb);
    this.phaserFb.connect(this.phaserStages[0]);
    lastStage.connect(this.phaserWet);
    this.phaserDry.connect(this.phaserOut);
    this.phaserWet.connect(this.phaserOut);

    // 4. Flanger
    this.flangerDry = ctx.createGain();
    this.flangerWet = ctx.createGain();
    this.flangerDelay = ctx.createDelay(0.03);
    this.flangerDelay.delayTime.value = 0.004;
    this.flangerFb = ctx.createGain();
    this.flangerLfo = ctx.createOscillator();
    this.flangerLfoGain = ctx.createGain();
    this.flangerOut = ctx.createGain();

    this.flangerLfo.connect(this.flangerLfoGain);
    this.flangerLfoGain.connect(this.flangerDelay.delayTime);
    this.flangerLfo.start();

    this.phaserOut.connect(this.flangerDry);
    this.phaserOut.connect(this.flangerDelay);
    this.flangerDelay.connect(this.flangerFb);
    this.flangerFb.connect(this.flangerDelay);
    this.flangerDelay.connect(this.flangerWet);
    this.flangerDry.connect(this.flangerOut);
    this.flangerWet.connect(this.flangerOut);

    // 5. Chorus
    this.chorusDry = ctx.createGain();
    this.chorusWet = ctx.createGain();
    this.chorusDelayL = ctx.createDelay(0.08);
    this.chorusDelayR = ctx.createDelay(0.08);
    this.chorusDelayL.delayTime.value = 0.018;
    this.chorusDelayR.delayTime.value = 0.022;
    this.chorusLfo = ctx.createOscillator();
    this.chorusLfoGainL = ctx.createGain();
    this.chorusLfoGainR = ctx.createGain();
    const chorusMerger = ctx.createChannelMerger(2);
    this.chorusOut = ctx.createGain();

    this.chorusLfo.connect(this.chorusLfoGainL);
    this.chorusLfo.connect(this.chorusLfoGainR);
    this.chorusLfoGainL.connect(this.chorusDelayL.delayTime);
    this.chorusLfoGainR.connect(this.chorusDelayR.delayTime);
    this.chorusLfo.start();

    this.flangerOut.connect(this.chorusDry);
    this.flangerOut.connect(this.chorusDelayL);
    this.flangerOut.connect(this.chorusDelayR);
    this.chorusDelayL.connect(chorusMerger, 0, 0);
    this.chorusDelayR.connect(chorusMerger, 0, 1);
    chorusMerger.connect(this.chorusWet);
    this.chorusDry.connect(this.chorusOut);
    this.chorusWet.connect(this.chorusOut);

    // 6. Stereo Delay
    this.delayDry = ctx.createGain();
    this.delayWet = ctx.createGain();
    this.delayNodeL = ctx.createDelay(1.5);
    this.delayNodeR = ctx.createDelay(1.5);
    this.delayFbL = ctx.createGain();
    this.delayFbR = ctx.createGain();
    this.delayDamp = ctx.createBiquadFilter();
    this.delayDamp.type = 'lowpass';
    this.delayDamp.frequency.value = 5200;
    const delayMerger = ctx.createChannelMerger(2);
    this.delayOut = ctx.createGain();

    this.chorusOut.connect(this.delayDry);
    this.chorusOut.connect(this.delayNodeL);
    this.delayNodeL.connect(this.delayDamp);
    this.delayDamp.connect(this.delayFbL);
    this.delayFbL.connect(this.delayNodeR);
    this.delayNodeR.connect(this.delayFbR);
    this.delayFbR.connect(this.delayNodeL);
    this.delayNodeL.connect(delayMerger, 0, 0);
    this.delayNodeR.connect(delayMerger, 0, 1);
    delayMerger.connect(this.delayWet);
    this.delayDry.connect(this.delayOut);
    this.delayWet.connect(this.delayOut);

    // 7. Reverb
    this.reverbDry = ctx.createGain();
    this.reverbWet = ctx.createGain();
    this.reverbConvolver = ctx.createConvolver();
    this.reverbOut = ctx.createGain();

    this.delayOut.connect(this.reverbDry);
    this.delayOut.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.reverbWet);
    this.reverbDry.connect(this.reverbOut);
    this.reverbWet.connect(this.reverbOut);
    this.reverbBranchConnected = true;

    // 8. 3-Band EQ
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 140;
    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.Q.value = 1.1;
    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 4200;

    this.reverbOut.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);

    // 9. Compressor (Single + OTT 3-Band Multiband)
    this.compDry = ctx.createGain();
    this.compSingleWet = ctx.createGain();
    this.compressor = ctx.createDynamicsCompressor();
    this.compMakeup = ctx.createGain();

    this.ottWet = ctx.createGain();
    this.ottMakeup = ctx.createGain();
    const ottLowSplit = ctx.createBiquadFilter();
    ottLowSplit.type = 'lowpass';
    ottLowSplit.frequency.value = 180;
    const ottMidSplit1 = ctx.createBiquadFilter();
    ottMidSplit1.type = 'highpass';
    ottMidSplit1.frequency.value = 180;
    const ottMidSplit2 = ctx.createBiquadFilter();
    ottMidSplit2.type = 'lowpass';
    ottMidSplit2.frequency.value = 2600;
    const ottHighSplit = ctx.createBiquadFilter();
    ottHighSplit.type = 'highpass';
    ottHighSplit.frequency.value = 2600;

    this.ottLowSplit = ottLowSplit;
    this.ottMidSplit1 = ottMidSplit1;
    this.ottHighSplit = ottHighSplit;

    this.ottLowComp = ctx.createDynamicsCompressor();
    this.ottMidComp = ctx.createDynamicsCompressor();
    this.ottHighComp = ctx.createDynamicsCompressor();
    for (const c of [this.ottLowComp, this.ottMidComp, this.ottHighComp]) {
      c.threshold.value = -24;
      c.ratio.value = 10;
      c.attack.value = 0.003;
      c.release.value = 0.09;
    }

    this.eqHigh.connect(this.compDry);
    this.compressor.connect(this.compMakeup);
    this.compMakeup.connect(this.compSingleWet);

    ottLowSplit.connect(this.ottLowComp);
    this.ottLowComp.connect(this.ottMakeup);

    ottMidSplit1.connect(ottMidSplit2);
    ottMidSplit2.connect(this.ottMidComp);
    this.ottMidComp.connect(this.ottMakeup);

    ottHighSplit.connect(this.ottHighComp);
    this.ottHighComp.connect(this.ottMakeup);

    this.ottMakeup.connect(this.ottWet);
    this.compBranchMode = 'dry';

    // FX Bypass Routing vs Full 11-Unit FX Chain Output
    this.compOut = ctx.createGain();
    this.compDry.connect(this.compOut);
    this.compSingleWet.connect(this.compOut);
    this.ottWet.connect(this.compOut);

    // 10. Cabinet Simulator (Acoustic EQ + Convolution IR + Room Reflections)
    this.cabDry = ctx.createGain();
    this.cabDry.gain.setValueAtTime(1, ctx.currentTime);
    this.cabWet = ctx.createGain();
    this.cabWet.gain.setValueAtTime(0, ctx.currentTime);

    this.cabPreHpf = ctx.createBiquadFilter();
    this.cabPreHpf.type = 'highpass';
    this.cabPreHpf.frequency.setValueAtTime(38, ctx.currentTime);

    this.cabBodyPeak = ctx.createBiquadFilter();
    this.cabBodyPeak.type = 'peaking';
    this.cabBodyPeak.frequency.setValueAtTime(100, ctx.currentTime);
    this.cabBodyPeak.Q.setValueAtTime(0.9, ctx.currentTime);
    this.cabBodyPeak.gain.setValueAtTime(0, ctx.currentTime);

    this.cabPresencePeak = ctx.createBiquadFilter();
    this.cabPresencePeak.type = 'peaking';
    this.cabPresencePeak.frequency.setValueAtTime(1100, ctx.currentTime);
    this.cabPresencePeak.Q.setValueAtTime(0.85, ctx.currentTime);
    this.cabPresencePeak.gain.setValueAtTime(0, ctx.currentTime);

    this.cabConeLpf = ctx.createBiquadFilter();
    this.cabConeLpf.type = 'lowpass';
    this.cabConeLpf.frequency.setValueAtTime(3600, ctx.currentTime);
    this.cabConeLpf.Q.setValueAtTime(0.7, ctx.currentTime);

    this.cabConvolver = ctx.createConvolver();
    this.cabConvolver.normalize = false;
    this.cabOut = ctx.createGain();
    this.cabOut.gain.setValueAtTime(1, ctx.currentTime);

    this.compOut.connect(this.cabDry);
    this.cabDry.connect(this.cabOut);
    this.compOut.connect(this.cabPreHpf);
    this.cabPreHpf.connect(this.cabBodyPeak);
    this.cabBodyPeak.connect(this.cabPresencePeak);
    this.cabPresencePeak.connect(this.cabConeLpf);
    this.cabConeLpf.connect(this.cabConvolver);
    this.cabConvolver.connect(this.cabWet);
    this.cabWet.connect(this.cabOut);
    this.cabBranchConnected = true;

    // 11. Stereo Tremolo (Phase-Locked Dual-Channel Amplitude Modulation)
    this.tremSplitter = ctx.createChannelSplitter(2);
    this.tremGainL = ctx.createGain();
    this.tremGainL.gain.setValueAtTime(1, ctx.currentTime);
    this.tremGainR = ctx.createGain();
    this.tremGainR.gain.setValueAtTime(1, ctx.currentTime);
    this.tremMerger = ctx.createChannelMerger(2);

    this.tremLfoSplit = ctx.createChannelSplitter(2);
    this.tremLfoSmoothL = ctx.createBiquadFilter();
    this.tremLfoSmoothL.type = 'lowpass';
    this.tremLfoSmoothL.frequency.setValueAtTime(160, ctx.currentTime);
    this.tremLfoSmoothR = ctx.createBiquadFilter();
    this.tremLfoSmoothR.type = 'lowpass';
    this.tremLfoSmoothR.frequency.setValueAtTime(160, ctx.currentTime);
    this.tremLfoDepthL = ctx.createGain();
    this.tremLfoDepthL.gain.setValueAtTime(0, ctx.currentTime);
    this.tremLfoDepthR = ctx.createGain();
    this.tremLfoDepthR.gain.setValueAtTime(0, ctx.currentTime);

    this.tremLfoSrc = ctx.createBufferSource();
    this.tremLfoSrc.buffer = getTremoloLfoBuffer(ctx, 'sine', 90);
    this.tremLfoSrc.loop = true;
    this.lastTremBufKey = `${ctx.sampleRate}:sine:90`;
    this.tremLfoSrc.connect(this.tremLfoSplit);
    this.tremLfoSplit.connect(this.tremLfoSmoothL, 0);
    this.tremLfoSplit.connect(this.tremLfoSmoothR, 1);
    this.tremLfoSmoothL.connect(this.tremLfoDepthL);
    this.tremLfoSmoothR.connect(this.tremLfoDepthR);
    this.tremLfoDepthL.connect(this.tremGainL.gain);
    this.tremLfoDepthR.connect(this.tremGainR.gain);
    this.tremLfoSrc.start(ctx.currentTime);

    this.cabOut.connect(this.tremSplitter);
    this.tremSplitter.connect(this.tremGainL, 0);
    this.tremSplitter.connect(this.tremGainR, 1);
    this.tremGainL.connect(this.tremMerger, 0, 0);
    this.tremGainR.connect(this.tremMerger, 0, 1);

    this.fxChainOut = ctx.createGain();
    this.fxChainOut.gain.setValueAtTime(this.fxBypass ? 0 : 1, ctx.currentTime);

    this.fxBypassGain = ctx.createGain();
    this.fxBypassGain.gain.setValueAtTime(this.fxBypass ? 1 : 0, ctx.currentTime);

    // Safety Limiter (clean headroom without fast-attack low-end cycle ripple) + Analyser + Master Gain
    this.safetyLimiter = ctx.createDynamicsCompressor();
    this.safetyLimiter.threshold.value = -1.0;
    this.safetyLimiter.knee.value = 6;
    this.safetyLimiter.ratio.value = 8;
    this.safetyLimiter.attack.value = 0.005;
    this.safetyLimiter.release.value = 0.14;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.8;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.patch.master.volume * 0.72, ctx.currentTime);

    this.tremMerger.connect(this.fxChainOut);
    this.fxChainOut.connect(this.safetyLimiter);

    this.fxInput.connect(this.fxBypassGain);
    this.fxBypassGain.connect(this.safetyLimiter);

    this.safetyLimiter.connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(studioAudio.getSerumBusInput() ?? ctx.destination);
    this.applyFxBypassRouting();
  }

  public setFxBypass(bypass: boolean): void {
    if (this.fxBypass === bypass) return;
    this.fxBypass = bypass;
    this.applyFxBypassRouting();
  }

  private applyFxBypassRouting(): void {
    if (!this.ctx || !this.fxChainOut || !this.fxBypassGain) {
      return;
    }
    const now = this.ctx.currentTime;
    if (this.fxBypass) {
      this.fxBypassGain.gain.setTargetAtTime(1, now, 0.008);
      this.fxChainOut.gain.setTargetAtTime(0, now, 0.008);
    } else {
      this.fxBypassGain.gain.setTargetAtTime(0, now, 0.008);
      this.fxChainOut.gain.setTargetAtTime(1, now, 0.008);
    }
  }

  private rebuildReverbImpulse(size: number, damping: number): void {
    if (!this.ctx || !this.reverbConvolver) return;
    const rate = this.ctx.sampleRate;
    const duration = 0.4 + clamp(size, 0.05, 1) * 3.2;
    const length = Math.floor(rate * duration);
    const buffer = this.ctx.createBuffer(2, length, rate);
    const decayExp = 2.4 + (1 - size) * 2.5;
    const dampCoeff = clamp(damping, 0, 0.95) * 0.72;

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, decayExp);
        const white = Math.random() * 2 - 1;
        lp = lp * dampCoeff + white * (1 - dampCoeff);
        data[i] = lp * env * 0.6;
      }
    }
    this.reverbConvolver.buffer = buffer;
  }

  private applyEffectsParams(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const fx = this.patch.effects;
    this.computeMacroSums();
    const distDriveMacro = (this.macroSumsScratch.FX_DIST_DRIVE ?? 0) * 0.55;
    const distMixMacro = (this.macroSumsScratch.FX_DIST_MIX ?? 0) * 0.5;

    // 1. Distortion
    if (
      this.fxInput &&
      this.distDry &&
      this.distWet &&
      this.distPre &&
      this.distShaper &&
      this.distTone &&
      this.distOut
    ) {
      const baseMix = fx.distortion.enabled ? clamp(fx.distortion.mix, 0, 1) : 0;
      const mix = clamp(baseMix + distMixMacro, 0, 1);
      const wantDist = mix > 0.005 || distDriveMacro > 0.03;
      if (wantDist !== this.distBranchConnected) {
        if (wantDist) {
          this.fxInput.connect(this.distPre);
          this.distWet.connect(this.distOut);
        } else {
          try {
            this.fxInput.disconnect(this.distPre);
            this.distWet.disconnect(this.distOut);
          } catch {
            // ignore
          }
        }
        this.distBranchConnected = wantDist;
      }
      const effDrive = clamp(fx.distortion.drive + distDriveMacro, 0, 1);
      this.distDry.gain.setTargetAtTime(1 - mix * 0.65, now, 0.015);
      this.distWet.gain.setTargetAtTime(mix, now, 0.015);
      const preGain = 1 + effDrive * 4;
      this.distPre.gain.setTargetAtTime(preGain, now, 0.015);
      this.lastDistPreGain = preGain;
      const dKey = `${fx.distortion.mode}:${Math.round(effDrive * QUANT_STEPS)}`;
      if (dKey !== this.lastDistCurveKey) {
        this.distShaper.curve = getDistortionCurve(fx.distortion.mode, effDrive);
        this.lastDistCurveKey = dKey;
      }
      this.distTone.frequency.setTargetAtTime(clamp(fx.distortion.tone, 400, 18000), now, 0.015);
    }

    // 2. Hyper & Dimension
    if (
      this.hyperDry &&
      this.hyperWet &&
      this.hyperLfoGainL &&
      this.hyperLfoGainR &&
      this.dimDelayL &&
      this.dimDelayR &&
      this.dimWet
    ) {
      const uMix = fx.hyperDimension.enabled ? clamp(fx.hyperDimension.unisonMix, 0, 1) : 0;
      const dMix = fx.hyperDimension.enabled ? clamp(fx.hyperDimension.dimMix, 0, 1) : 0;
      this.hyperDry.gain.setTargetAtTime(1 - uMix * 0.25, now, 0.015);
      this.hyperWet.gain.setTargetAtTime(uMix * 0.65, now, 0.015);
      const detSec = fx.hyperDimension.enabled ? fx.hyperDimension.detune * 0.0045 : 0;
      this.hyperLfoGainL.gain.setTargetAtTime(detSec, now, 0.02);
      this.hyperLfoGainR.gain.setTargetAtTime(-detSec, now, 0.02);
      this.dimDelayL.delayTime.setTargetAtTime(0.004 + fx.hyperDimension.dimSize * 0.022, now, 0.02);
      this.dimDelayR.delayTime.setTargetAtTime(0.007 + fx.hyperDimension.dimSize * 0.031, now, 0.02);
      this.dimWet.gain.setTargetAtTime(dMix * 0.6, now, 0.015);
    }

    // 3. Phaser
    if (this.phaserDry && this.phaserWet && this.phaserFb && this.phaserLfo && this.phaserLfoGain) {
      const mix = fx.phaser.enabled ? clamp(fx.phaser.mix, 0, 1) : 0;
      this.phaserDry.gain.setTargetAtTime(1 - mix * 0.35, now, 0.015);
      this.phaserWet.gain.setTargetAtTime(mix * 0.75, now, 0.015);
      this.phaserFb.gain.setTargetAtTime(fx.phaser.enabled ? clamp(fx.phaser.feedback, 0, 0.85) : 0, now, 0.015);
      this.phaserLfo.frequency.setTargetAtTime(clamp(fx.phaser.rate, 0.05, 6), now, 0.02);
      this.phaserLfoGain.gain.setTargetAtTime(fx.phaser.enabled ? fx.phaser.depth * 1400 : 0, now, 0.02);
    }

    // 4. Flanger
    if (
      this.flangerDry &&
      this.flangerWet &&
      this.flangerFb &&
      this.flangerLfo &&
      this.flangerLfoGain
    ) {
      const mix = fx.flanger.enabled ? clamp(fx.flanger.mix, 0, 1) : 0;
      this.flangerDry.gain.setTargetAtTime(1 - mix * 0.35, now, 0.015);
      this.flangerWet.gain.setTargetAtTime(mix * 0.75, now, 0.015);
      this.flangerFb.gain.setTargetAtTime(fx.flanger.enabled ? clamp(fx.flanger.feedback, 0, 0.82) : 0, now, 0.015);
      this.flangerLfo.frequency.setTargetAtTime(clamp(fx.flanger.rate, 0.05, 6), now, 0.02);
      this.flangerLfoGain.gain.setTargetAtTime(fx.flanger.enabled ? fx.flanger.depth * 0.0032 : 0, now, 0.02);
    }

    // 5. Chorus
    if (this.chorusDry && this.chorusWet && this.chorusLfo && this.chorusLfoGainL && this.chorusLfoGainR) {
      const mix = fx.chorus.enabled ? clamp(fx.chorus.mix, 0, 1) : 0;
      this.chorusDry.gain.setTargetAtTime(1 - mix * 0.35, now, 0.015);
      this.chorusWet.gain.setTargetAtTime(mix * 0.7, now, 0.015);
      this.chorusLfo.frequency.setTargetAtTime(clamp(fx.chorus.rate, 0.1, 8), now, 0.02);
      const depthSec = fx.chorus.enabled ? fx.chorus.depth * 0.008 : 0;
      this.chorusLfoGainL.gain.setTargetAtTime(depthSec, now, 0.02);
      this.chorusLfoGainR.gain.setTargetAtTime(-depthSec, now, 0.02);
    }

    // 6. Delay
    if (this.delayDry && this.delayWet && this.delayNodeL && this.delayNodeR && this.delayFbL && this.delayFbR) {
      const mix = fx.delay.enabled ? clamp(fx.delay.mix, 0, 1) : 0;
      this.delayDry.gain.setTargetAtTime(1, now, 0.015);
      this.delayWet.gain.setTargetAtTime(mix * 0.85, now, 0.015);
      const t = clamp(fx.delay.time, 0.04, 1.2);
      this.delayNodeL.delayTime.setTargetAtTime(t, now, 0.03);
      this.delayNodeR.delayTime.setTargetAtTime(t * 0.75, now, 0.03);
      const fb = fx.delay.enabled ? clamp(fx.delay.feedback, 0, 0.86) : 0;
      this.delayFbL.gain.setTargetAtTime(fb, now, 0.02);
      this.delayFbR.gain.setTargetAtTime(fb, now, 0.02);
    }

    // 7. Reverb (disconnect heavy ConvolverNode completely when disabled or mix=0)
    if (this.delayOut && this.reverbDry && this.reverbWet && this.reverbConvolver && this.reverbOut) {
      const mix = fx.reverb.enabled ? clamp(fx.reverb.mix, 0, 1) : 0;
      const wantReverb = mix > 0.005;
      if (wantReverb !== this.reverbBranchConnected) {
        if (wantReverb) {
          this.delayOut.connect(this.reverbConvolver);
          this.reverbWet.connect(this.reverbOut);
        } else {
          try {
            this.delayOut.disconnect(this.reverbConvolver);
            this.reverbWet.disconnect(this.reverbOut);
          } catch {
            // ignore
          }
        }
        this.reverbBranchConnected = wantReverb;
      }
      this.reverbDry.gain.setTargetAtTime(1 - mix * 0.2, now, 0.02);
      this.reverbWet.gain.setTargetAtTime(mix * 0.95, now, 0.02);
      if (wantReverb) {
        const revKey = `${Math.round(fx.reverb.size * 20)}:${Math.round(fx.reverb.damping * 20)}`;
        if (revKey !== this.lastReverbKey) {
          this.lastReverbKey = revKey;
          if (this.reverbDebounceTimer) clearTimeout(this.reverbDebounceTimer);
          this.reverbDebounceTimer = window.setTimeout(() => {
            this.reverbDebounceTimer = null;
            const liveRev = this.patch.effects.reverb;
            this.rebuildReverbImpulse(liveRev.size, liveRev.damping);
          }, 60);
        }
      }
    }

    // 8. 3-Band EQ
    if (this.eqLow && this.eqMid && this.eqHigh) {
      if (fx.eq.enabled) {
        this.eqLow.gain.setTargetAtTime(clamp(fx.eq.lowGain, -12, 12), now, 0.015);
        this.eqMid.frequency.setTargetAtTime(clamp(fx.eq.midFreq, 200, 6000), now, 0.015);
        this.eqMid.gain.setTargetAtTime(clamp(fx.eq.midGain, -12, 12), now, 0.015);
        this.eqHigh.gain.setTargetAtTime(clamp(fx.eq.highGain, -12, 12), now, 0.015);
      } else {
        this.eqLow.gain.setTargetAtTime(0, now, 0.015);
        this.eqMid.gain.setTargetAtTime(0, now, 0.015);
        this.eqHigh.gain.setTargetAtTime(0, now, 0.015);
      }
    }

    // 9. Compressor / Multiband OTT (connect ONLY the active DynamicsCompressor branch)
    if (
      this.eqHigh &&
      this.compDry &&
      this.compSingleWet &&
      this.ottWet &&
      this.compressor &&
      this.compMakeup &&
      this.ottMakeup &&
      this.ottLowSplit &&
      this.ottMidSplit1 &&
      this.ottHighSplit &&
      this.ottLowComp &&
      this.ottMidComp &&
      this.ottHighComp
    ) {
      const targetMode: 'dry' | 'single' | 'ott' = !fx.compressor.enabled
        ? 'dry'
        : fx.compressor.multiband
        ? 'ott'
        : 'single';

      if (targetMode !== this.compBranchMode) {
        try {
          this.eqHigh.disconnect();
        } catch {
          // ignore
        }
        if (targetMode === 'dry') {
          this.eqHigh.connect(this.compDry);
        } else if (targetMode === 'single') {
          this.eqHigh.connect(this.compressor);
        } else {
          this.eqHigh.connect(this.ottLowSplit);
          this.eqHigh.connect(this.ottMidSplit1);
          this.eqHigh.connect(this.ottHighSplit);
        }
        this.compBranchMode = targetMode;
      }

      if (targetMode === 'dry') {
        this.compDry.gain.setTargetAtTime(1, now, 0.015);
        this.compSingleWet.gain.setTargetAtTime(0, now, 0.015);
        this.ottWet.gain.setTargetAtTime(0, now, 0.015);
      } else if (targetMode === 'ott') {
        this.compDry.gain.setTargetAtTime(0, now, 0.015);
        this.compSingleWet.gain.setTargetAtTime(0, now, 0.015);
        this.ottWet.gain.setTargetAtTime(1, now, 0.015);
        for (const c of [this.ottLowComp, this.ottMidComp, this.ottHighComp]) {
          c.threshold.setTargetAtTime(clamp(fx.compressor.threshold, -50, 0), now, 0.015);
          c.ratio.setTargetAtTime(clamp(fx.compressor.ratio, 1, 20), now, 0.015);
          c.attack.setTargetAtTime(clamp(fx.compressor.attack, 0.001, 0.2), now, 0.015);
          c.release.setTargetAtTime(clamp(fx.compressor.release, 0.02, 1), now, 0.015);
        }
        const linearOttMakeup = Math.pow(10, clamp(fx.compressor.makeup, 0, 14) / 20);
        this.ottMakeup.gain.setTargetAtTime(linearOttMakeup, now, 0.015);
      } else {
        this.compDry.gain.setTargetAtTime(0, now, 0.015);
        this.compSingleWet.gain.setTargetAtTime(1, now, 0.015);
        this.ottWet.gain.setTargetAtTime(0, now, 0.015);
        this.compressor.threshold.setTargetAtTime(clamp(fx.compressor.threshold, -60, 0), now, 0.015);
        this.compressor.ratio.setTargetAtTime(clamp(fx.compressor.ratio, 1, 20), now, 0.015);
        this.compressor.attack.setTargetAtTime(clamp(fx.compressor.attack, 0.001, 0.5), now, 0.015);
        this.compressor.release.setTargetAtTime(clamp(fx.compressor.release, 0.01, 1), now, 0.015);
        const linearMakeup = Math.pow(10, clamp(fx.compressor.makeup, 0, 14) / 20);
        this.compMakeup.gain.setTargetAtTime(linearMakeup, now, 0.015);
      }
    }

    // 10. Cabinet Simulator
    if (
      fx.cabinet &&
      this.compOut &&
      this.cabDry &&
      this.cabWet &&
      this.cabPreHpf &&
      this.cabBodyPeak &&
      this.cabPresencePeak &&
      this.cabConeLpf &&
      this.cabConvolver &&
      this.cabOut
    ) {
      const mix = fx.cabinet.enabled ? clamp(fx.cabinet.mix, 0, 1) : 0;
      const wantCab = mix > 0.005;
      if (wantCab !== this.cabBranchConnected) {
        if (wantCab) {
          this.compOut.connect(this.cabPreHpf);
          this.cabWet.connect(this.cabOut);
        } else {
          try {
            this.compOut.disconnect(this.cabPreHpf);
            this.cabWet.disconnect(this.cabOut);
          } catch {
            // ignore
          }
        }
        this.cabBranchConnected = wantCab;
      }

      this.cabDry.gain.setTargetAtTime(1 - mix, now, 0.015);
      this.cabWet.gain.setTargetAtTime(mix, now, 0.015);
      this.cabOut.gain.setTargetAtTime(
        fx.cabinet.enabled ? clamp(fx.cabinet.outputGain, 0.3, 1.6) : 1,
        now,
        0.015
      );

      if (wantCab) {
        const ac = computeCabinetAcousticTargets(
          fx.cabinet.cabinetType,
          fx.cabinet.size,
          fx.cabinet.micPosition,
          fx.cabinet.micDistance
        );
        this.cabPreHpf.frequency.setTargetAtTime(ac.hpfHz, now, 0.015);
        this.cabBodyPeak.frequency.setTargetAtTime(ac.bodyHz, now, 0.015);
        this.cabBodyPeak.Q.setTargetAtTime(ac.bodyQ, now, 0.015);
        this.cabBodyPeak.gain.setTargetAtTime(ac.bodyGainDb, now, 0.015);
        this.cabPresencePeak.frequency.setTargetAtTime(ac.presenceHz, now, 0.015);
        this.cabPresencePeak.gain.setTargetAtTime(ac.presenceGainDb, now, 0.015);
        this.cabConeLpf.frequency.setTargetAtTime(ac.lpfHz, now, 0.015);

        const cabKey = `${fx.cabinet.cabinetType}:${Math.round(fx.cabinet.size * 12)}:${Math.round(fx.cabinet.micPosition * 12)}:${Math.round(fx.cabinet.micDistance * 12)}:${Math.round(fx.cabinet.roomAmount * 12)}`;
        if (cabKey !== this.lastCabKey) {
          const isFirstCab = this.lastCabKey === '';
          this.lastCabKey = cabKey;
          if (isFirstCab) {
            this.cabConvolver.buffer = getCabinetImpulse(
              this.ctx,
              fx.cabinet.cabinetType,
              fx.cabinet.size,
              fx.cabinet.micPosition,
              fx.cabinet.micDistance,
              fx.cabinet.roomAmount
            );
          } else {
            if (this.cabDebounceTimer) clearTimeout(this.cabDebounceTimer);
            this.cabDebounceTimer = window.setTimeout(() => {
              this.cabDebounceTimer = null;
              const liveCab = this.patch.effects.cabinet;
              if (this.ctx && this.cabConvolver && liveCab) {
                this.cabConvolver.buffer = getCabinetImpulse(
                  this.ctx,
                  liveCab.cabinetType,
                  liveCab.size,
                  liveCab.micPosition,
                  liveCab.micDistance,
                  liveCab.roomAmount
                );
              }
            }, 35);
          }
        }
      }
    }

    // 11. Stereo Tremolo
    if (
      fx.tremolo &&
      this.tremGainL &&
      this.tremGainR &&
      this.tremLfoDepthL &&
      this.tremLfoDepthR &&
      this.tremLfoSrc &&
      this.tremLfoSplit &&
      this.tremLfoSmoothL &&
      this.tremLfoSmoothR
    ) {
      const effMod = fx.tremolo.enabled
        ? clamp(fx.tremolo.depth, 0, 1) * clamp(fx.tremolo.mix, 0, 1)
        : 0;
      const activeTrem = fx.tremolo.enabled && effMod > 0.004;

      if (activeTrem) {
        const hz = fx.tremolo.sync
          ? divisionToHz(fx.tremolo.division, this.bpm)
          : clamp(fx.tremolo.rate, 0.1, 20);
        const qDeg = Math.round(clamp(fx.tremolo.stereoPhase, 0, 180) / 5) * 5;
        const bufKey = `${this.ctx.sampleRate}:${fx.tremolo.waveform}:${qDeg}`;

        if (bufKey !== this.lastTremBufKey) {
          this.lastTremBufKey = bufKey;
          try {
            this.tremLfoSrc.stop();
            this.tremLfoSrc.disconnect();
          } catch {
            // ignore
          }
          const nextSrc = this.ctx.createBufferSource();
          nextSrc.buffer = getTremoloLfoBuffer(this.ctx, fx.tremolo.waveform, qDeg);
          nextSrc.loop = true;
          nextSrc.playbackRate.setValueAtTime(clamp(hz, 0.05, 25), now);
          nextSrc.connect(this.tremLfoSplit);
          nextSrc.start(now);
          this.tremLfoSrc = nextSrc;
        } else {
          this.tremLfoSrc.playbackRate.setTargetAtTime(clamp(hz, 0.05, 25), now, 0.015);
        }

        const halfMod = effMod * 0.5;
        const baseLevel = 1 - halfMod;
        this.tremGainL.gain.setTargetAtTime(baseLevel, now, 0.014);
        this.tremGainR.gain.setTargetAtTime(baseLevel, now, 0.014);
        this.tremLfoDepthL.gain.setTargetAtTime(halfMod, now, 0.014);
        this.tremLfoDepthR.gain.setTargetAtTime(halfMod, now, 0.014);
      } else {
        this.tremGainL.gain.setTargetAtTime(1, now, 0.014);
        this.tremGainR.gain.setTargetAtTime(1, now, 0.014);
        this.tremLfoDepthL.gain.setTargetAtTime(0, now, 0.014);
        this.tremLfoDepthR.gain.setTargetAtTime(0, now, 0.014);
      }
    }
  }

  public dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.panic(true);
  }
}

export const synthEngine = new SynthEngine();
