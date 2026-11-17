import { Mp3Encoder } from '@breezystack/lamejs';
import type { BassRemixPatch } from '../types/bassRemix';
import { evaluateAutomationLane, syncDivisionToHz } from './bassRemixPresets';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function dbToLin(db: number): number {
  return Math.pow(10, db / 20);
}

function evalLfo(phase: number, shape: number): number {
  if (shape === 1) {
    return phase < 0.25
      ? phase * 4
      : phase < 0.75
      ? 2 - phase * 4
      : phase * 4 - 4;
  }
  if (shape === 2) {
    const edge = 0.02;
    if (phase < edge) return -1 + (2 * phase) / edge;
    if (phase < 0.5) return 1;
    if (phase < 0.5 + edge) return 1 - (2 * (phase - 0.5)) / edge;
    return -1;
  }
  if (shape === 3) {
    const edge = 0.02;
    if (phase > 1 - edge) return -1 + (2 * (phase - (1 - edge))) / edge;
    return 1 - (2 * phase) / (1 - edge);
  }
  return Math.sin(phase * Math.PI * 2);
}

export interface BassRemixWorkletParams {
  abWet: number;
  effectMix: number;
  distDrive: number;
  distMode: number;
  saturation: number;
  wsAmount: number;
  wsMode: number;
  harmonic: number;
  stereoWidth: number;
  subMonoHz: number;
  ottBypass: number;
  ottAmount: number;
  ottDepth: number;
  ottTime: number;
  ottUpward: number;
  ottDownward: number;
  ottInGain: number;
  ottOutGain: number;
  ottMix: number;
  wobEnabled: number;
  wobRateHz: number;
  wobDepth: number;
  wobShape: number;
  wobFilterType: number;
  wobCutoffHz: number;
  wobRes: number;
  wobDrive: number;
  wobStereoMod: number;
  wobMix: number;
  volLevel: number;
  volGain: number;
  volLfoEnabled: number;
  volLfoShape: number;
  volRateHz: number;
  volSidechain: number;
  volAtkMs: number;
  volRelMs: number;
  volDepth: number;
  volMix: number;
}

const SHAPE_MAP = { sine: 0, triangle: 1, square: 2, saw: 3 } as const;
const FILTER_MAP = { lp12: 0, lp24: 1, bp: 2, notch: 3, formant: 4 } as const;
const DIST_MAP = { soft: 0, hard: 1, fold: 2, crush: 3 } as const;
const WS_MAP = { asym: 0, rectify: 1, fmfold: 2 } as const;

export function computeAutomationCycleNorm(
  elapsedSec: number,
  selectionDurationSec: number,
  bpm: number,
  patch: BassRemixPatch
): number {
  const auto = patch.automation;
  const cycleSec = auto.bpmSync
    ? Math.max(0.25, (60 / Math.max(40, bpm)) * 4 * Math.max(1, auto.bars))
    : Math.max(0.05, selectionDurationSec);

  if (auto.loopAutomation) {
    const mod = elapsedSec % cycleSec;
    return clamp(mod / cycleSec, 0, 1);
  }
  return clamp(elapsedSec / cycleSec, 0, 1);
}

export function computeEffectiveWorkletParams(
  patch: BassRemixPatch,
  bpm: number,
  abMode: 'processed' | 'original',
  autoNormTime: number | null
): BassRemixWorkletParams {
  let effectMix = patch.effectMix;
  let ottAmount = patch.ott.amount;
  let wobRateHz = patch.wobble.bpmSync
    ? syncDivisionToHz(patch.wobble.syncDivision, bpm)
    : patch.wobble.rateHz;
  let wobDepth = patch.wobble.depth;
  let wobCutoffHz = patch.wobble.cutoffHz;
  let wobRes = patch.wobble.resonance;
  let volLevel = patch.volume.volume;

  if (autoNormTime !== null) {
    const lanes = patch.automation.lanes;
    if (lanes.volume?.enabled && lanes.volume.points.length > 0) {
      volLevel = evaluateAutomationLane(lanes.volume, autoNormTime) * 1.5;
    }
    if (lanes.wobbleRate?.enabled && lanes.wobbleRate.points.length > 0) {
      const v = evaluateAutomationLane(lanes.wobbleRate, autoNormTime);
      wobRateHz = 0.2 * Math.pow(120, v);
    }
    if (lanes.wobbleDepth?.enabled && lanes.wobbleDepth.points.length > 0) {
      wobDepth = evaluateAutomationLane(lanes.wobbleDepth, autoNormTime);
    }
    if (lanes.filterCutoff?.enabled && lanes.filterCutoff.points.length > 0) {
      const v = evaluateAutomationLane(lanes.filterCutoff, autoNormTime);
      wobCutoffHz = 30 * Math.pow(16000 / 30, v);
    }
    if (lanes.filterResonance?.enabled && lanes.filterResonance.points.length > 0) {
      const v = evaluateAutomationLane(lanes.filterResonance, autoNormTime);
      wobRes = 0.5 + v * 17.5;
    }
    if (lanes.ottAmount?.enabled && lanes.ottAmount.points.length > 0) {
      ottAmount = evaluateAutomationLane(lanes.ottAmount, autoNormTime);
    }
    if (lanes.effectMix?.enabled && lanes.effectMix.points.length > 0) {
      effectMix = evaluateAutomationLane(lanes.effectMix, autoNormTime);
    }
  }

  const volRateHz = patch.volume.bpmSync
    ? syncDivisionToHz(patch.volume.syncDivision, bpm)
    : patch.volume.rateHz;

  return {
    abWet: abMode === 'original' ? 0 : 1,
    effectMix: clamp(effectMix, 0, 1),
    distDrive: clamp(patch.transform.distortionDrive, 0, 1),
    distMode: DIST_MAP[patch.transform.distortionMode] ?? 0,
    saturation: clamp(patch.transform.saturation, 0, 1),
    wsAmount: clamp(patch.transform.waveshapeAmount, 0, 1),
    wsMode: WS_MAP[patch.transform.waveshapeMode] ?? 0,
    harmonic: clamp(patch.transform.harmonicEnhance, 0, 1),
    stereoWidth: clamp(patch.transform.stereoWidth, 0, 2),
    subMonoHz: clamp(patch.transform.subMonoHz, 40, 260),
    ottBypass: patch.ott.bypass ? 1 : 0,
    ottAmount: clamp(ottAmount, 0, 1),
    ottDepth: clamp(patch.ott.depth, 0, 1),
    ottTime: clamp(patch.ott.time, 0.1, 3.0),
    ottUpward: clamp(patch.ott.upward, 0, 1),
    ottDownward: clamp(patch.ott.downward, 0, 1),
    ottInGain: dbToLin(clamp(patch.ott.inputGainDb, -18, 24)),
    ottOutGain: dbToLin(clamp(patch.ott.outputGainDb, -24, 18)),
    ottMix: clamp(patch.ott.mix, 0, 1),
    wobEnabled: patch.wobble.enabled ? 1 : 0,
    wobRateHz: clamp(wobRateHz, 0.1, 24),
    wobDepth: clamp(wobDepth, 0, 1),
    wobShape: SHAPE_MAP[patch.wobble.waveform] ?? 0,
    wobFilterType: FILTER_MAP[patch.wobble.filterType] ?? 1,
    wobCutoffHz: clamp(wobCutoffHz, 28, 16000),
    wobRes: clamp(wobRes, 0.5, 18),
    wobDrive: clamp(patch.wobble.drive, 0, 1),
    wobStereoMod: clamp(patch.wobble.stereoMod, 0, 1),
    wobMix: clamp(patch.wobble.mix, 0, 1),
    volLevel: clamp(volLevel, 0, 1.5),
    volGain: dbToLin(clamp(patch.volume.gainDb, -18, 24)),
    volLfoEnabled: patch.volume.lfoEnabled ? 1 : 0,
    volLfoShape: SHAPE_MAP[patch.volume.lfoWaveform] ?? 0,
    volRateHz: clamp(volRateHz, 0.1, 20),
    volSidechain: clamp(patch.volume.sidechainPump, 0, 1),
    volAtkMs: clamp(patch.volume.attackMs, 1, 250),
    volRelMs: clamp(patch.volume.releaseMs, 10, 800),
    volDepth: clamp(patch.volume.depth, 0, 1),
    volMix: clamp(patch.volume.mix, 0, 1),
  };
}

interface SvfState {
  ic1: number;
  ic2: number;
}

function makeSvf(): SvfState {
  return { ic1: 0, ic2: 0 };
}

function stepSvf(
  input: number,
  state: SvfState,
  g: number,
  k: number
): { lp: number; bp: number; hp: number } {
  const a1 = 1 / (1 + g * (g + k));
  const a2 = g * a1;
  const a3 = g * a2;
  const v3 = input - state.ic2;
  const v1 = a1 * state.ic1 + a2 * v3;
  const v2 = state.ic2 + a2 * state.ic1 + a3 * v3;
  state.ic1 = 2 * v1 - state.ic1;
  state.ic2 = 2 * v2 - state.ic2;
  return {
    lp: v2,
    bp: v1,
    hp: input - k * v1 - v2,
  };
}

function computeOttBandGain(
  env: number,
  upwardAmt: number,
  downwardAmt: number,
  depth: number,
  amount: number
): number {
  const envDb = 20 * Math.log10(Math.max(1e-5, env));
  const downThresh = -14.0;
  const upThresh = -34.0;
  const downRatio = 1 + downwardAmt * 7.5;
  const upRatio = 1 + upwardAmt * 4.5;

  let gainDb = 0;
  if (envDb > downThresh && downwardAmt > 0.001) {
    const over = envDb - downThresh;
    gainDb -= over * (1 - 1 / downRatio);
  } else if (envDb < upThresh && envDb > -68 && upwardAmt > 0.001) {
    const under = upThresh - envDb;
    const boost = under * (1 - 1 / upRatio);
    gainDb += Math.min(14.0, boost);
  }
  gainDb += (upwardAmt * 2.5 - downwardAmt * 0.6) * depth;
  return dbToLin(clamp(gainDb * depth * amount, -24, 16));
}

function yieldFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

export interface RenderedStereoData {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  length: number;
}

/**
 * Non-blocking chunked offline DSP renderer mirroring tarek-bass-remix-processor.js
 * with sample-accurate automation evaluation across the selected audio region.
 */
export async function renderBassRemixSelectionChunked(
  source: AudioBuffer,
  selStartNorm: number,
  selEndNorm: number,
  patch: BassRemixPatch,
  bpm: number,
  abMode: 'processed' | 'original',
  onProgress?: (pct: number) => void
): Promise<RenderedStereoData> {
  const sr = source.sampleRate;
  const totalSamples = source.length;
  const startSample = clamp(Math.floor(selStartNorm * totalSamples), 0, Math.max(0, totalSamples - 1));
  const endSample = clamp(Math.ceil(selEndNorm * totalSamples), startSample + 1, totalSamples);
  const length = endSample - startSample;
  const selDurationSec = length / sr;

  const srcL = source.getChannelData(0);
  const srcR = source.numberOfChannels > 1 ? source.getChannelData(1) : srcL;

  const outL = new Float32Array(length);
  const outR = new Float32Array(length);

  if (abMode === 'original') {
    for (let i = 0; i < length; i++) {
      outL[i] = srcL[startSample + i];
      outR[i] = srcR[startSample + i];
    }
    onProgress?.(1);
    return { left: outL, right: outR, sampleRate: sr, length };
  }

  // States
  const xLowL1 = makeSvf();
  const xLowL2 = makeSvf();
  const xLowR1 = makeSvf();
  const xLowR2 = makeSvf();
  const xMidHpL1 = makeSvf();
  const xMidHpL2 = makeSvf();
  const xMidHpR1 = makeSvf();
  const xMidHpR2 = makeSvf();
  const xHighL1 = makeSvf();
  const xHighL2 = makeSvf();
  const xHighR1 = makeSvf();
  const xHighR2 = makeSvf();
  const subMonoL = makeSvf();
  const subMonoR = makeSvf();
  const wobL1 = makeSvf();
  const wobL2 = makeSvf();
  const wobR1 = makeSvf();
  const wobR2 = makeSvf();
  const formL = makeSvf();
  const formR = makeSvf();

  let harmLpL = 0;
  let harmLpR = 0;
  let harmHpL = 0;
  let harmHpR = 0;
  let harmPrevL = 0;
  let harmPrevR = 0;

  let envLow = 0;
  let envMid = 0;
  let envHigh = 0;
  let gainLow = 1;
  let gainMid = 1;
  let gainHigh = 1;

  let wobPhase = 0;
  let volPhase = 0;
  let volEnv = 1;
  let dcXL = 0;
  let dcYL = 0;
  let dcXR = 0;
  let dcYR = 0;

  const gLow = Math.tan((Math.PI * Math.min(220, sr * 0.4)) / sr);
  const gHigh = Math.tan((Math.PI * Math.min(2600, sr * 0.4)) / sr);
  const kButter = Math.SQRT2;
  const harmLpC = 1 - Math.exp((-2 * Math.PI * 115) / sr);
  const harmHpC = Math.exp((-2 * Math.PI * 1800) / sr);
  const gSmooth = 1 - Math.exp(-1 / (sr * 0.006));

  const CHUNK = 4096;
  const CONTROL_STEP = 64;
  let p = computeEffectiveWorkletParams(patch, bpm, 'processed', 0);
  let maxPeak = 0;

  for (let offset = 0; offset < length; offset += CHUNK) {
    const chunkEnd = Math.min(length, offset + CHUNK);

    for (let i = offset; i < chunkEnd; i++) {
      if ((i & (CONTROL_STEP - 1)) === 0) {
        const autoNorm = computeAutomationCycleNorm(
          i / sr,
          selDurationSec,
          bpm,
          patch
        );
        p = computeEffectiveWorkletParams(patch, bpm, 'processed', autoNorm);
      }

      const dryL = srcL[startSample + i];
      const dryR = srcR[startSample + i];
      let wetL = dryL;
      let wetR = dryR;

      // 1. Transform
      if (p.distDrive > 0.002) {
        const dAmt = p.distDrive;
        const preGain = 1 + dAmt * 14;
        let dl = wetL * preGain;
        let dr = wetR * preGain;
        if (p.distMode === 1) {
          dl = clamp(dl, -0.9, 0.9);
          dr = clamp(dr, -0.9, 0.9);
        } else if (p.distMode === 2) {
          dl = Math.sin(dl * 1.45) * 0.9;
          dr = Math.sin(dr * 1.45) * 0.9;
        } else if (p.distMode === 3) {
          const steps = Math.max(4, Math.round(32 - dAmt * 24));
          dl = Math.round(Math.tanh(dl * 0.7) * steps) / steps;
          dr = Math.round(Math.tanh(dr * 0.7) * steps) / steps;
        } else {
          const norm = Math.tanh(preGain * 0.45) || 1;
          dl = Math.tanh(dl * 0.45) / norm;
          dr = Math.tanh(dr * 0.45) / norm;
        }
        const blend = clamp(dAmt * 1.15, 0, 1);
        wetL = wetL * (1 - blend) + dl * blend;
        wetR = wetR * (1 - blend) + dr * blend;
      }

      if (p.saturation > 0.002) {
        const sK = 1 + p.saturation * 4.5;
        const bias = p.saturation * 0.14;
        const sl = Math.tanh((wetL + bias * wetL * wetL) * sK) / Math.tanh(sK);
        const srOut = Math.tanh((wetR + bias * wetR * wetR) * sK) / Math.tanh(sK);
        wetL = wetL * (1 - p.saturation * 0.85) + sl * (p.saturation * 0.85);
        wetR = wetR * (1 - p.saturation * 0.85) + srOut * (p.saturation * 0.85);
      }

      if (p.wsAmount > 0.002) {
        const wAmt = p.wsAmount;
        let wl = wetL;
        let wr = wetR;
        if (p.wsMode === 1) {
          wl = wl >= 0 ? Math.tanh(wl * (1 + wAmt * 5)) : Math.tanh(wl * (1 + wAmt * 1.5)) * 0.65;
          wr = wr >= 0 ? Math.tanh(wr * (1 + wAmt * 5)) : Math.tanh(wr * (1 + wAmt * 1.5)) * 0.65;
        } else if (p.wsMode === 2) {
          const f = 1 + wAmt * 4.2;
          wl = Math.sin(wl * f + Math.sin(wl * f * 2.1) * wAmt * 0.75) * 0.85;
          wr = Math.sin(wr * f + Math.sin(wr * f * 2.1) * wAmt * 0.75) * 0.85;
        } else {
          const k = 1 + wAmt * 6.5;
          wl = Math.tanh(wl * k + wAmt * 0.35 * wl * wl * wl);
          wr = Math.tanh(wr * k + wAmt * 0.35 * wr * wr * wr);
        }
        wetL = wetL * (1 - wAmt) + wl * wAmt;
        wetR = wetR * (1 - wAmt) + wr * wAmt;
      }

      if (p.harmonic > 0.002) {
        harmLpL += (wetL - harmLpL) * harmLpC;
        harmLpR += (wetR - harmLpR) * harmLpC;
        const hpL = harmHpC * (harmHpL + wetL - harmPrevL);
        const hpR = harmHpC * (harmHpR + wetR - harmPrevR);
        harmHpL = hpL;
        harmHpR = hpR;
        harmPrevL = wetL;
        harmPrevR = wetR;
        wetL += (Math.tanh(hpL * 3.5) * 0.45 + Math.tanh(harmLpL * 2.2) * 0.35) * p.harmonic;
        wetR += (Math.tanh(hpR * 3.5) * 0.45 + Math.tanh(harmLpR * 2.2) * 0.35) * p.harmonic;
      }

      // 2. OTT 3-band
      if (p.ottBypass < 0.5 && p.ottAmount > 0.002 && p.ottMix > 0.002) {
        const ottInL = wetL * p.ottInGain;
        const ottInR = wetR * p.ottInGain;

        const lowL = stepSvf(stepSvf(ottInL, xLowL1, gLow, kButter).lp, xLowL2, gLow, kButter).lp;
        const lowR = stepSvf(stepSvf(ottInR, xLowR1, gLow, kButter).lp, xLowR2, gLow, kButter).lp;

        const midHighL = stepSvf(stepSvf(ottInL, xMidHpL1, gLow, kButter).hp, xMidHpL2, gLow, kButter).hp;
        const midHighR = stepSvf(stepSvf(ottInR, xMidHpR1, gLow, kButter).hp, xMidHpR2, gLow, kButter).hp;

        const midL = stepSvf(stepSvf(midHighL, xHighL1, gHigh, kButter).lp, xHighL2, gHigh, kButter).lp;
        const highL = midHighL - midL;
        const midR = stepSvf(stepSvf(midHighR, xHighR1, gHigh, kButter).lp, xHighR2, gHigh, kButter).lp;
        const highR = midHighR - midR;

        const tScale = clamp(p.ottTime, 0.1, 3.0);
        const atkC = 1 - Math.exp(-1 / (sr * (0.004 * tScale)));
        const relC = 1 - Math.exp(-1 / (sr * (0.085 * tScale)));

        const absLow = Math.max(Math.abs(lowL), Math.abs(lowR));
        const absMid = Math.max(Math.abs(midL), Math.abs(midR));
        const absHigh = Math.max(Math.abs(highL), Math.abs(highR));

        envLow += (absLow - envLow) * (absLow > envLow ? atkC : relC);
        envMid += (absMid - envMid) * (absMid > envMid ? atkC : relC);
        envHigh += (absHigh - envHigh) * (absHigh > envHigh ? atkC : relC);

        gainLow += (computeOttBandGain(envLow, p.ottUpward, p.ottDownward, p.ottDepth, p.ottAmount) - gainLow) * gSmooth;
        gainMid += (computeOttBandGain(envMid, p.ottUpward, p.ottDownward, p.ottDepth, p.ottAmount) - gainMid) * gSmooth;
        gainHigh += (computeOttBandGain(envHigh, p.ottUpward, p.ottDownward, p.ottDepth, p.ottAmount) - gainHigh) * gSmooth;

        const ottOutL = (lowL * gainLow + midL * gainMid + highL * gainHigh) * p.ottOutGain;
        const ottOutR = (lowR * gainLow + midR * gainMid + highR * gainHigh) * p.ottOutGain;
        wetL = wetL * (1 - p.ottMix) + ottOutL * p.ottMix;
        wetR = wetR * (1 - p.ottMix) + ottOutR * p.ottMix;
      }

      // 3. Wobble
      wobPhase += p.wobRateHz / sr;
      if (wobPhase >= 1) wobPhase -= Math.floor(wobPhase);

      if (p.wobEnabled >= 0.5 && p.wobMix > 0.002) {
        const phaseL = wobPhase;
        let phaseR = wobPhase + p.wobStereoMod * 0.5;
        if (phaseR >= 1) phaseR -= 1;

        const lfoL = evalLfo(phaseL, p.wobShape);
        const lfoR = evalLfo(phaseR, p.wobShape);

        const baseLog = Math.log2(clamp(p.wobCutoffHz, 28, 16000));
        const modOct = p.wobDepth * 3.8;
        const fcL = clamp(Math.pow(2, baseLog + lfoL * modOct), 28, Math.min(18000, sr * 0.44));
        const fcR = clamp(Math.pow(2, baseLog + lfoR * modOct), 28, Math.min(18000, sr * 0.44));

        const gWobL = Math.tan((Math.PI * fcL) / sr);
        const gWobR = Math.tan((Math.PI * fcR) / sr);
        const kWob = 1 / clamp(p.wobRes, 0.5, 18);

        let fInL = wetL;
        let fInR = wetR;
        if (p.wobDrive > 0.002) {
          const drv = 1 + p.wobDrive * 6.0;
          fInL = Math.tanh(fInL * drv) / Math.tanh(drv);
          fInR = Math.tanh(fInR * drv) / Math.tanh(drv);
        }

        const wL1 = stepSvf(fInL, wobL1, gWobL, kWob);
        const wR1 = stepSvf(fInR, wobR1, gWobR, kWob);
        let fOutL = wL1.lp;
        let fOutR = wR1.lp;

        if (p.wobFilterType === 1) {
          fOutL = stepSvf(wL1.lp, wobL2, gWobL, kWob * 0.85).lp;
          fOutR = stepSvf(wR1.lp, wobR2, gWobR, kWob * 0.85).lp;
        } else if (p.wobFilterType === 2) {
          fOutL = wL1.bp * 1.4;
          fOutR = wR1.bp * 1.4;
        } else if (p.wobFilterType === 3) {
          fOutL = wL1.lp + wL1.hp;
          fOutR = wR1.lp + wR1.hp;
        } else if (p.wobFilterType === 4) {
          const fcFormL = clamp(fcL * 2.35, 140, Math.min(16000, sr * 0.44));
          const fcFormR = clamp(fcR * 2.35, 140, Math.min(16000, sr * 0.44));
          const fmL = stepSvf(fInL, formL, Math.tan((Math.PI * fcFormL) / sr), 0.24);
          const fmR = stepSvf(fInR, formR, Math.tan((Math.PI * fcFormR) / sr), 0.24);
          fOutL = wL1.bp * 1.1 + fmL.bp * 0.9 + wL1.lp * 0.45;
          fOutR = wR1.bp * 1.1 + fmR.bp * 0.9 + wR1.lp * 0.45;
        }

        wetL = wetL * (1 - p.wobMix) + fOutL * p.wobMix;
        wetR = wetR * (1 - p.wobMix) + fOutR * p.wobMix;
      }

      // 4. Volume & Sidechain
      volPhase += p.volRateHz / sr;
      if (volPhase >= 1) volPhase -= Math.floor(volPhase);

      let targetVolMod = 1.0;
      if (p.volLfoEnabled >= 0.5 || p.volSidechain > 0.002) {
        let modEnv = 1.0;
        if (p.volLfoEnabled >= 0.5) {
          const lfo01 = (evalLfo(volPhase, p.volLfoShape) + 1) * 0.5;
          modEnv *= 1 - p.volDepth * (1 - lfo01);
        }
        if (p.volSidechain > 0.002) {
          const scDuck = Math.pow(volPhase, 0.55);
          const scGain =
            1 - p.volSidechain * p.volDepth * 0.92 + scDuck * p.volSidechain * p.volDepth * 0.92;
          modEnv *= scGain;
        }
        const vAtkC = 1 - Math.exp(-1 / (sr * (clamp(p.volAtkMs, 1, 250) / 1000)));
        const vRelC = 1 - Math.exp(-1 / (sr * (clamp(p.volRelMs, 10, 800) / 1000)));
        volEnv += (modEnv - volEnv) * (modEnv < volEnv ? vAtkC : vRelC);
        targetVolMod = 1 * (1 - p.volMix) + volEnv * p.volMix;
      }

      const totalVol = p.volLevel * p.volGain * targetVolMod;
      wetL *= totalVol;
      wetR *= totalVol;

      // 5. Stereo width + sub mono
      if (Math.abs(p.stereoWidth - 1.0) > 0.01) {
        const gSub = Math.tan((Math.PI * clamp(p.subMonoHz, 40, 260)) / sr);
        const subL = stepSvf(wetL, subMonoL, gSub, kButter).lp;
        const subR = stepSvf(wetR, subMonoR, gSub, kButter).lp;
        const subMono = (subL + subR) * 0.5;
        const hiL = wetL - subL;
        const hiR = wetR - subR;
        const mid = (hiL + hiR) * 0.5;
        const side = (hiL - hiR) * 0.5 * p.stereoWidth;
        wetL = subMono + (mid + side);
        wetR = subMono + (mid - side);
      }

      // 6. Mix + DC Block + Soft Limiter
      const procL = dryL * (1 - p.effectMix) + wetL * p.effectMix;
      const procR = dryR * (1 - p.effectMix) + wetR * p.effectMix;

      const dcL = procL - dcXL + 0.9992 * dcYL;
      dcXL = procL;
      dcYL = dcL;
      const dcR = procR - dcXR + 0.9992 * dcYR;
      dcXR = procR;
      dcYR = dcR;

      const absL = Math.abs(dcL);
      const absR = Math.abs(dcR);
      const sL =
        absL > 0.88
          ? (dcL >= 0 ? 1 : -1) * (0.88 + Math.tanh((absL - 0.88) * 6.5) * 0.105)
          : dcL;
      const sR =
        absR > 0.88
          ? (dcR >= 0 ? 1 : -1) * (0.88 + Math.tanh((absR - 0.88) * 6.5) * 0.105)
          : dcR;

      outL[i] = sL;
      outR[i] = sR;
      const pk = Math.max(Math.abs(sL), Math.abs(sR));
      if (pk > maxPeak) maxPeak = pk;
    }

    onProgress?.((chunkEnd / length) * 0.85);
    await yieldFrame();
  }

  // Prevent clipping via transparent headroom scaling if peak exceeds 0.96
  if (maxPeak > 0.96) {
    const scale = 0.95 / maxPeak;
    for (let i = 0; i < length; i++) {
      outL[i] *= scale;
      outR[i] *= scale;
    }
  }

  onProgress?.(0.9);
  return { left: outL, right: outR, sampleRate: sr, length };
}

export function encodeStereoWavBlob(data: RenderedStereoData): Blob {
  const numChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = data.sampleRate * blockAlign;
  const dataSize = data.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true); // linear PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, data.sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let pos = 44;
  for (let i = 0; i < data.length; i++) {
    const l = clamp(data.left[i], -1, 1);
    const r = clamp(data.right[i], -1, 1);
    view.setInt16(pos, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    view.setInt16(pos + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    pos += 4;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export async function encodeStereoMp3BlobChunked(
  data: RenderedStereoData,
  kbps = 256,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const encoder = new Mp3Encoder(2, data.sampleRate, kbps);
  const chunks: Uint8Array[] = [];
  const blockSize = 1152 * 8; // multiple of MP3 frame size (1152)

  const leftI16 = new Int16Array(blockSize);
  const rightI16 = new Int16Array(blockSize);

  for (let offset = 0; offset < data.length; offset += blockSize) {
    const count = Math.min(blockSize, data.length - offset);
    for (let i = 0; i < count; i++) {
      const l = clamp(data.left[offset + i], -1, 1);
      const r = clamp(data.right[offset + i], -1, 1);
      leftI16[i] = l < 0 ? l * 0x8000 : l * 0x7fff;
      rightI16[i] = r < 0 ? r * 0x8000 : r * 0x7fff;
    }
    const lSlice = count === blockSize ? leftI16 : leftI16.subarray(0, count);
    const rSlice = count === blockSize ? rightI16 : rightI16.subarray(0, count);
    const encoded = encoder.encodeBuffer(lSlice, rSlice);
    if (encoded.length > 0) {
      chunks.push(new Uint8Array(encoded));
    }
    onProgress?.(0.9 + (offset / data.length) * 0.09);
    await yieldFrame();
  }

  const tail = encoder.flush();
  if (tail.length > 0) {
    chunks.push(new Uint8Array(tail));
  }
  onProgress?.(1);
  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' });
}
