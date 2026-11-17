/**
 * TAREK BASS REMIX Real-Time AudioWorklet DSP Processor & Mic Recorder
 * Runs on the dedicated Web Audio rendering thread (128-sample quanta).
 * Zero allocations inside process().
 */

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function dbToLin(db) {
  return Math.pow(10, db / 20);
}

function evalLfo(phase, shape) {
  // phase in [0, 1) -> output in [-1, 1]
  if (shape === 1) {
    // Triangle
    return phase < 0.25
      ? phase * 4
      : phase < 0.75
      ? 2 - phase * 4
      : phase * 4 - 4;
  }
  if (shape === 2) {
    // Soft-edged Square (avoids harsh Nyquist clicks)
    const edge = 0.02;
    if (phase < edge) return -1 + (2 * phase) / edge;
    if (phase < 0.5) return 1;
    if (phase < 0.5 + edge) return 1 - (2 * (phase - 0.5)) / edge;
    return -1;
  }
  if (shape === 3) {
    // Soft-edged Saw (ramp down with tiny reset slope)
    const edge = 0.02;
    if (phase > 1 - edge) return -1 + (2 * (phase - (1 - edge))) / edge;
    return 1 - (2 * phase) / (1 - edge);
  }
  // Sine
  return Math.sin(phase * Math.PI * 2);
}

class BassRemixDspProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.sr = sampleRate || 48000;
    const smoothSec = 0.012;
    this.smoothCoeff = 1 - Math.exp(-1 / (this.sr * smoothSec));

    // Target & smoothed parameters
    this.target = {
      abWet: 1, // 1 = processed, 0 = original dry
      effectMix: 1,
      // Transform
      distDrive: 0.35,
      distMode: 0, // 0=soft, 1=hard, 2=fold, 3=crush
      saturation: 0.25,
      wsAmount: 0.2,
      wsMode: 0, // 0=asym, 1=rectify, 2=fmfold
      harmonic: 0.25,
      stereoWidth: 1.15,
      subMonoHz: 110,
      // OTT
      ottBypass: 0,
      ottAmount: 0.55,
      ottDepth: 0.65,
      ottTime: 1.0,
      ottUpward: 0.55,
      ottDownward: 0.6,
      ottInGain: 1.0,
      ottOutGain: 1.0,
      ottMix: 1.0,
      // Wobble
      wobEnabled: 1,
      wobRateHz: 4.0,
      wobDepth: 0.6,
      wobShape: 0, // 0=sine, 1=tri, 2=square, 3=saw
      wobFilterType: 1, // 0=lp12, 1=lp24, 2=bp, 3=notch, 4=formant
      wobCutoffHz: 420,
      wobRes: 3.2,
      wobDrive: 0.3,
      wobStereoMod: 0.25,
      wobMix: 1.0,
      // Volume & Sidechain
      volLevel: 1.0,
      volGain: 1.0,
      volLfoEnabled: 0,
      volLfoShape: 0,
      volRateHz: 2.0,
      volSidechain: 0.25,
      volAtkMs: 8,
      volRelMs: 140,
      volDepth: 0.65,
      volMix: 1.0,
    };

    this.cur = { ...this.target };

    // Crossover states: 220 Hz LP/HP and 2600 Hz LP/HP (2 cascaded 1-pole/biquad-like TPT SVFs per channel)
    this.xLowL1 = { ic1: 0, ic2: 0 };
    this.xLowL2 = { ic1: 0, ic2: 0 };
    this.xLowR1 = { ic1: 0, ic2: 0 };
    this.xLowR2 = { ic1: 0, ic2: 0 };

    this.xMidHpL1 = { ic1: 0, ic2: 0 };
    this.xMidHpL2 = { ic1: 0, ic2: 0 };
    this.xMidHpR1 = { ic1: 0, ic2: 0 };
    this.xMidHpR2 = { ic1: 0, ic2: 0 };

    this.xHighL1 = { ic1: 0, ic2: 0 };
    this.xHighL2 = { ic1: 0, ic2: 0 };
    this.xHighR1 = { ic1: 0, ic2: 0 };
    this.xHighR2 = { ic1: 0, ic2: 0 };

    // Sub-mono crossover SVF at subMonoHz
    this.subMonoL = { ic1: 0, ic2: 0 };
    this.subMonoR = { ic1: 0, ic2: 0 };

    // Harmonic enhancer filters (sub harmonic shelf + upper-mid exciter)
    this.harmLpL = 0;
    this.harmLpR = 0;
    this.harmHpL = 0;
    this.harmHpR = 0;
    this.harmPrevL = 0;
    this.harmPrevR = 0;

    // 3-band OTT envelope followers & smoothed gains
    this.envLow = 0;
    this.envMid = 0;
    this.envHigh = 0;
    this.gainLow = 1;
    this.gainMid = 1;
    this.gainHigh = 1;

    // Dual-stage Cytomic SVF wobble filters per channel (L & R)
    this.wobL1 = { ic1: 0, ic2: 0 };
    this.wobL2 = { ic1: 0, ic2: 0 };
    this.wobR1 = { ic1: 0, ic2: 0 };
    this.wobR2 = { ic1: 0, ic2: 0 };
    // Formant parallel filter states
    this.formL = { ic1: 0, ic2: 0 };
    this.formR = { ic1: 0, ic2: 0 };

    // LFO phases
    this.wobPhase = 0;
    this.volPhase = 0;
    this.volEnv = 1;

    // DC Blocker state
    this.dcXL = 0;
    this.dcYL = 0;
    this.dcXR = 0;
    this.dcYR = 0;

    // Telemetry accumulators
    this.telemFrames = 0;
    this.peakIn = 0;
    this.peakOutL = 0;
    this.peakOutR = 0;
    this.lastLowGr = 0;
    this.lastMidGr = 0;
    this.lastHighGr = 0;

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (!msg) return;
      if (msg.type === 'params' && msg.params) {
        const p = msg.params;
        for (const k in p) {
          if (k in this.target && typeof p[k] === 'number' && Number.isFinite(p[k])) {
            this.target[k] = p[k];
          }
        }
      } else if (msg.type === 'resetPhases') {
        this.wobPhase = 0;
        this.volPhase = 0;
        this.volEnv = 1;
      }
    };
  }

  stepSvf(input, state, g, k) {
    // Cytomic TPT State-Variable Filter (unconditionally stable under fast modulation)
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = input - state.ic2;
    const v1 = a1 * state.ic1 + a2 * v3;
    const v2 = state.ic2 + a2 * state.ic1 + a3 * v3;
    state.ic1 = 2 * v1 - state.ic1;
    state.ic2 = 2 * v2 - state.ic2;
    const lp = v2;
    const bp = v1;
    const hp = input - k * v1 - v2;
    return { lp, bp, hp };
  }

  computeOttBandGain(env, timeScale, upwardAmt, downwardAmt, depth, amount) {
    // Convert linear RMS envelope to dB
    const envDb = 20 * Math.log10(Math.max(1e-5, env));
    const downThresh = -14.0;
    const upThresh = -34.0;
    const downRatio = 1 + downwardAmt * 7.5; // up to 8.5:1
    const upRatio = 1 + upwardAmt * 4.5; // up to 5.5:1

    let gainDb = 0;
    if (envDb > downThresh && downwardAmt > 0.001) {
      const over = envDb - downThresh;
      // Soft knee 4dB
      gainDb -= over * (1 - 1 / downRatio);
    } else if (envDb < upThresh && envDb > -68 && upwardAmt > 0.001) {
      const under = upThresh - envDb;
      const boost = under * (1 - 1 / upRatio);
      // Safely cap upward boost at +14 dB to avoid elevating digital silence/hiss
      gainDb += Math.min(14.0, boost);
    }

    // Subtle OTT makeup presence
    gainDb += (upwardAmt * 2.5 - downwardAmt * 0.6) * depth;
    const scaledDb = gainDb * depth * amount;
    return dbToLin(clamp(scaledDb, -24, 16));
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outL = output[0];
    const outR = output[1] || output[0];
    const inL = input && input[0] ? input[0] : null;
    const inR = input && input[1] ? input[1] : inL;
    const len = outL.length;

    const sr = this.sr;
    const sc = this.smoothCoeff;
    const tgt = this.target;
    const cur = this.cur;

    // Pre-compute static crossover coefficients (220 Hz and 2600 Hz)
    const gLow = Math.tan((Math.PI * Math.min(220, sr * 0.4)) / sr);
    const gHigh = Math.tan((Math.PI * Math.min(2600, sr * 0.4)) / sr);
    const kButter = Math.SQRT2; // Linkwitz-Riley uses cascaded 2nd-order Butterworth (Q = 0.7071 => k = sqrt(2))

    // Harmonic filter coeffs
    const harmLpC = 1 - Math.exp((-2 * Math.PI * 115) / sr);
    const harmHpC = Math.exp((-2 * Math.PI * 1800) / sr);

    const wobShape = Math.round(tgt.wobShape);
    const wobFilterType = Math.round(tgt.wobFilterType);
    const distMode = Math.round(tgt.distMode);
    const wsMode = Math.round(tgt.wsMode);
    const volLfoShape = Math.round(tgt.volLfoShape);
    const wobEnabled = tgt.wobEnabled >= 0.5;
    const ottBypass = tgt.ottBypass >= 0.5;
    const volLfoEnabled = tgt.volLfoEnabled >= 0.5;

    for (let i = 0; i < len; i++) {
      // Smooth continuous parameters per sample
      cur.abWet += (tgt.abWet - cur.abWet) * sc;
      cur.effectMix += (tgt.effectMix - cur.effectMix) * sc;
      cur.distDrive += (tgt.distDrive - cur.distDrive) * sc;
      cur.saturation += (tgt.saturation - cur.saturation) * sc;
      cur.wsAmount += (tgt.wsAmount - cur.wsAmount) * sc;
      cur.harmonic += (tgt.harmonic - cur.harmonic) * sc;
      cur.stereoWidth += (tgt.stereoWidth - cur.stereoWidth) * sc;
      cur.subMonoHz += (tgt.subMonoHz - cur.subMonoHz) * sc;

      cur.ottAmount += (tgt.ottAmount - cur.ottAmount) * sc;
      cur.ottDepth += (tgt.ottDepth - cur.ottDepth) * sc;
      cur.ottTime += (tgt.ottTime - cur.ottTime) * sc;
      cur.ottUpward += (tgt.ottUpward - cur.ottUpward) * sc;
      cur.ottDownward += (tgt.ottDownward - cur.ottDownward) * sc;
      cur.ottInGain += (tgt.ottInGain - cur.ottInGain) * sc;
      cur.ottOutGain += (tgt.ottOutGain - cur.ottOutGain) * sc;
      cur.ottMix += (tgt.ottMix - cur.ottMix) * sc;

      cur.wobRateHz += (tgt.wobRateHz - cur.wobRateHz) * sc;
      cur.wobDepth += (tgt.wobDepth - cur.wobDepth) * sc;
      cur.wobCutoffHz += (tgt.wobCutoffHz - cur.wobCutoffHz) * sc;
      cur.wobRes += (tgt.wobRes - cur.wobRes) * sc;
      cur.wobDrive += (tgt.wobDrive - cur.wobDrive) * sc;
      cur.wobStereoMod += (tgt.wobStereoMod - cur.wobStereoMod) * sc;
      cur.wobMix += (tgt.wobMix - cur.wobMix) * sc;

      cur.volLevel += (tgt.volLevel - cur.volLevel) * sc;
      cur.volGain += (tgt.volGain - cur.volGain) * sc;
      cur.volRateHz += (tgt.volRateHz - cur.volRateHz) * sc;
      cur.volSidechain += (tgt.volSidechain - cur.volSidechain) * sc;
      cur.volDepth += (tgt.volDepth - cur.volDepth) * sc;
      cur.volMix += (tgt.volMix - cur.volMix) * sc;

      let dryL = inL ? inL[i] : 0;
      let dryR = inR ? inR[i] : 0;
      if (!Number.isFinite(dryL)) dryL = 0;
      if (!Number.isFinite(dryR)) dryR = 0;

      const absIn = Math.max(Math.abs(dryL), Math.abs(dryR));
      if (absIn > this.peakIn) this.peakIn = absIn;

      // Short-circuit if strictly monitoring dry original (after smooth crossfade)
      let wetL = dryL;
      let wetR = dryR;

      // 1. DUBSTEP TRANSFORM STAGE (Distortion + Saturation + Waveshaping + Harmonic Enhance)
      if (cur.distDrive > 0.002) {
        const dAmt = cur.distDrive;
        const preGain = 1 + dAmt * 14;
        let dl = wetL * preGain;
        let dr = wetR * preGain;
        if (distMode === 1) {
          // Hard clip
          dl = clamp(dl, -0.9, 0.9);
          dr = clamp(dr, -0.9, 0.9);
        } else if (distMode === 2) {
          // Foldback
          dl = Math.sin(dl * 1.45) * 0.9;
          dr = Math.sin(dr * 1.45) * 0.9;
        } else if (distMode === 3) {
          // Grit crush / rectifier bite
          const steps = Math.max(4, Math.round(32 - dAmt * 24));
          dl = Math.round(Math.tanh(dl * 0.7) * steps) / steps;
          dr = Math.round(Math.tanh(dr * 0.7) * steps) / steps;
        } else {
          // Soft tanh overdrive
          const norm = Math.tanh(preGain * 0.45);
          dl = Math.tanh(dl * 0.45) / (norm || 1);
          dr = Math.tanh(dr * 0.45) / (norm || 1);
        }
        const blend = clamp(dAmt * 1.15, 0, 1);
        wetL = wetL * (1 - blend) + dl * blend;
        wetR = wetR * (1 - blend) + dr * blend;
      }

      if (cur.saturation > 0.002) {
        const sK = 1 + cur.saturation * 4.5;
        const bias = cur.saturation * 0.14;
        const sl = Math.tanh((wetL + bias * wetL * wetL) * sK) / Math.tanh(sK);
        const srOut = Math.tanh((wetR + bias * wetR * wetR) * sK) / Math.tanh(sK);
        wetL = wetL * (1 - cur.saturation * 0.85) + sl * (cur.saturation * 0.85);
        wetR = wetR * (1 - cur.saturation * 0.85) + srOut * (cur.saturation * 0.85);
      }

      if (cur.wsAmount > 0.002) {
        const wAmt = cur.wsAmount;
        let wl = wetL;
        let wr = wetR;
        if (wsMode === 1) {
          // Half-wave/asymmetric dubstep rectify
          wl = wl >= 0 ? Math.tanh(wl * (1 + wAmt * 5)) : Math.tanh(wl * (1 + wAmt * 1.5)) * 0.65;
          wr = wr >= 0 ? Math.tanh(wr * (1 + wAmt * 5)) : Math.tanh(wr * (1 + wAmt * 1.5)) * 0.65;
        } else if (wsMode === 2) {
          // FM-style harmonic fold
          const f = 1 + wAmt * 4.2;
          wl = Math.sin(wl * f + Math.sin(wl * f * 2.1) * wAmt * 0.75) * 0.85;
          wr = Math.sin(wr * f + Math.sin(wr * f * 2.1) * wAmt * 0.75) * 0.85;
        } else {
          // Asymmetric polynomial + tanh
          const k = 1 + wAmt * 6.5;
          wl = Math.tanh(wl * k + wAmt * 0.35 * wl * wl * wl);
          wr = Math.tanh(wr * k + wAmt * 0.35 * wr * wr * wr);
        }
        wetL = wetL * (1 - wAmt) + wl * wAmt;
        wetR = wetR * (1 - wAmt) + wr * wAmt;
      }

      if (cur.harmonic > 0.002) {
        // Sub-bass warm octave reinforce + high-mid bite exciter
        this.harmLpL += (wetL - this.harmLpL) * harmLpC;
        this.harmLpR += (wetR - this.harmLpR) * harmLpC;
        const hpL = harmHpC * (this.harmHpL + wetL - this.harmPrevL);
        const hpR = harmHpC * (this.harmHpR + wetR - this.harmPrevR);
        this.harmHpL = hpL;
        this.harmHpR = hpR;
        this.harmPrevL = wetL;
        this.harmPrevR = wetR;
        const excL = Math.tanh(hpL * 3.5) * 0.45 + Math.tanh(this.harmLpL * 2.2) * 0.35;
        const excR = Math.tanh(hpR * 3.5) * 0.45 + Math.tanh(this.harmLpR * 2.2) * 0.35;
        wetL += excL * cur.harmonic;
        wetR += excR * cur.harmonic;
      }

      // 2. 3-BAND OTT PROCESSOR
      if (!ottBypass && cur.ottAmount > 0.002 && cur.ottMix > 0.002) {
        const ottInL = wetL * cur.ottInGain;
        const ottInR = wetR * cur.ottInGain;

        // 4th-order Linkwitz-Riley 3-band split (220 Hz & 2600 Hz)
        const sL1 = this.stepSvf(ottInL, this.xLowL1, gLow, kButter);
        const sL2 = this.stepSvf(sL1.lp, this.xLowL2, gLow, kButter);
        const lowL = sL2.lp;

        const sR1 = this.stepSvf(ottInR, this.xLowR1, gLow, kButter);
        const sR2 = this.stepSvf(sR1.lp, this.xLowR2, gLow, kButter);
        const lowR = sR2.lp;

        // High-pass above 220 Hz -> Mid+High
        const mHpL1 = this.stepSvf(ottInL, this.xMidHpL1, gLow, kButter);
        const mHpL2 = this.stepSvf(mHpL1.hp, this.xMidHpL2, gLow, kButter);
        const midHighL = mHpL2.hp;

        const mHpR1 = this.stepSvf(ottInR, this.xMidHpR1, gLow, kButter);
        const mHpR2 = this.stepSvf(mHpR1.hp, this.xMidHpR2, gLow, kButter);
        const midHighR = mHpR2.hp;

        // Split Mid+High at 2600 Hz
        const hL1 = this.stepSvf(midHighL, this.xHighL1, gHigh, kButter);
        const hL2_lp = this.stepSvf(hL1.lp, this.xHighL2, gHigh, kButter);
        const midL = hL2_lp.lp;
        const highL = midHighL - midL; // Complementary LR subtraction preserves flat sum

        const hR1 = this.stepSvf(midHighR, this.xHighR1, gHigh, kButter);
        const hR2_lp = this.stepSvf(hR1.lp, this.xHighR2, gHigh, kButter);
        const midR = hR2_lp.lp;
        const highR = midHighR - midR;

        // Envelope followers scaled by OTT Time
        const tScale = clamp(cur.ottTime, 0.1, 3.0);
        const atkC = 1 - Math.exp(-1 / (sr * (0.004 * tScale)));
        const relC = 1 - Math.exp(-1 / (sr * (0.085 * tScale)));

        const absLow = Math.max(Math.abs(lowL), Math.abs(lowR));
        const absMid = Math.max(Math.abs(midL), Math.abs(midR));
        const absHigh = Math.max(Math.abs(highL), Math.abs(highR));

        this.envLow += (absLow - this.envLow) * (absLow > this.envLow ? atkC : relC);
        this.envMid += (absMid - this.envMid) * (absMid > this.envMid ? atkC : relC);
        this.envHigh += (absHigh - this.envHigh) * (absHigh > this.envHigh ? atkC : relC);

        const targetGL = this.computeOttBandGain(this.envLow, tScale, cur.ottUpward, cur.ottDownward, cur.ottDepth, cur.ottAmount);
        const targetGM = this.computeOttBandGain(this.envMid, tScale, cur.ottUpward, cur.ottDownward, cur.ottDepth, cur.ottAmount);
        const targetGH = this.computeOttBandGain(this.envHigh, tScale, cur.ottUpward, cur.ottDownward, cur.ottDepth, cur.ottAmount);

        const gSmooth = 1 - Math.exp(-1 / (sr * 0.006));
        this.gainLow += (targetGL - this.gainLow) * gSmooth;
        this.gainMid += (targetGM - this.gainMid) * gSmooth;
        this.gainHigh += (targetGH - this.gainHigh) * gSmooth;

        this.lastLowGr = this.gainLow;
        this.lastMidGr = this.gainMid;
        this.lastHighGr = this.gainHigh;

        const ottOutL = (lowL * this.gainLow + midL * this.gainMid + highL * this.gainHigh) * cur.ottOutGain;
        const ottOutR = (lowR * this.gainLow + midR * this.gainMid + highR * this.gainHigh) * cur.ottOutGain;

        const mix = cur.ottMix;
        wetL = wetL * (1 - mix) + ottOutL * mix;
        wetR = wetR * (1 - mix) + ottOutR * mix;
      } else {
        this.lastLowGr = 1;
        this.lastMidGr = 1;
        this.lastHighGr = 1;
      }

      // 3. WOBBLE ENGINE (Stereo Modulated Cytomic SVF + Filter Drive)
      this.wobPhase += cur.wobRateHz / sr;
      if (this.wobPhase >= 1) this.wobPhase -= Math.floor(this.wobPhase);

      if (wobEnabled && cur.wobMix > 0.002) {
        const phaseL = this.wobPhase;
        let phaseR = this.wobPhase + cur.wobStereoMod * 0.5;
        if (phaseR >= 1) phaseR -= 1;

        const lfoL = evalLfo(phaseL, wobShape); // -1..1
        const lfoR = evalLfo(phaseR, wobShape);

        const baseLog = Math.log2(clamp(cur.wobCutoffHz, 28, 16000));
        const modOctaves = cur.wobDepth * 3.8;
        const fcL = clamp(Math.pow(2, baseLog + lfoL * modOctaves), 28, Math.min(18000, sr * 0.44));
        const fcR = clamp(Math.pow(2, baseLog + lfoR * modOctaves), 28, Math.min(18000, sr * 0.44));

        const gWobL = Math.tan((Math.PI * fcL) / sr);
        const gWobR = Math.tan((Math.PI * fcR) / sr);
        const qVal = clamp(cur.wobRes, 0.5, 18);
        const kWob = 1 / qVal;

        // Pre-filter analog drive
        let fInL = wetL;
        let fInR = wetR;
        if (cur.wobDrive > 0.002) {
          const drv = 1 + cur.wobDrive * 6.0;
          fInL = Math.tanh(fInL * drv) / Math.tanh(drv);
          fInR = Math.tanh(fInR * drv) / Math.tanh(drv);
        }

        const wL1 = this.stepSvf(fInL, this.wobL1, gWobL, kWob);
        const wR1 = this.stepSvf(fInR, this.wobR1, gWobR, kWob);

        let fOutL = wL1.lp;
        let fOutR = wR1.lp;

        if (wobFilterType === 1) {
          // LP 24dB cascaded
          const wL2 = this.stepSvf(wL1.lp, this.wobL2, gWobL, kWob * 0.85);
          const wR2 = this.stepSvf(wR1.lp, this.wobR2, gWobR, kWob * 0.85);
          fOutL = wL2.lp;
          fOutR = wR2.lp;
        } else if (wobFilterType === 2) {
          // Bandpass
          fOutL = wL1.bp * 1.4;
          fOutR = wR1.bp * 1.4;
        } else if (wobFilterType === 3) {
          // Notch
          fOutL = wL1.lp + wL1.hp;
          fOutR = wR1.lp + wR1.hp;
        } else if (wobFilterType === 4) {
          // Formant dual-peak vowel filter
          const fcFormL = clamp(fcL * 2.35, 140, Math.min(16000, sr * 0.44));
          const fcFormR = clamp(fcR * 2.35, 140, Math.min(16000, sr * 0.44));
          const fmL = this.stepSvf(fInL, this.formL, Math.tan((Math.PI * fcFormL) / sr), 0.24);
          const fmR = this.stepSvf(fInR, this.formR, Math.tan((Math.PI * fcFormR) / sr), 0.24);
          fOutL = (wL1.bp * 1.1 + fmL.bp * 0.9 + wL1.lp * 0.45);
          fOutR = (wR1.bp * 1.1 + fmR.bp * 0.9 + wR1.lp * 0.45);
        }

        const wMix = cur.wobMix;
        wetL = wetL * (1 - wMix) + fOutL * wMix;
        wetR = wetR * (1 - wMix) + fOutR * wMix;
      }

      // 4. VOLUME & SIDECHAIN PUMPING ENGINE
      this.volPhase += cur.volRateHz / sr;
      if (this.volPhase >= 1) this.volPhase -= Math.floor(this.volPhase);

      let targetVolMod = 1.0;
      if (volLfoEnabled || cur.volSidechain > 0.002) {
        let modEnv = 1.0;
        if (volLfoEnabled) {
          const lfo01 = (evalLfo(this.volPhase, volLfoShape) + 1) * 0.5; // 0..1
          modEnv *= 1 - cur.volDepth * (1 - lfo01);
        }
        if (cur.volSidechain > 0.002) {
          // Classic beat-synced sidechain duck shape (sharp dip at phase=0, exponential recovery)
          const scDuck = Math.pow(this.volPhase, 0.55);
          const scGain = (1 - cur.volSidechain * cur.volDepth * 0.92) + scDuck * cur.volSidechain * cur.volDepth * 0.92;
          modEnv *= scGain;
        }
        const vAtkC = 1 - Math.exp(-1 / (sr * (clamp(tgt.volAtkMs, 1, 250) / 1000)));
        const vRelC = 1 - Math.exp(-1 / (sr * (clamp(tgt.volRelMs, 10, 800) / 1000)));
        this.volEnv += (modEnv - this.volEnv) * (modEnv < this.volEnv ? vAtkC : vRelC);
        targetVolMod = 1 * (1 - cur.volMix) + this.volEnv * cur.volMix;
      } else {
        this.volEnv += (1 - this.volEnv) * sc;
        targetVolMod = 1;
      }

      const totalVol = cur.volLevel * cur.volGain * targetVolMod;
      wetL *= totalVol;
      wetR *= totalVol;

      // 5. STEREO WIDTH + MONO SUB CROSSOVER
      if (Math.abs(cur.stereoWidth - 1.0) > 0.01) {
        const gSub = Math.tan((Math.PI * clamp(cur.subMonoHz, 40, 260)) / sr);
        const subL = this.stepSvf(wetL, this.subMonoL, gSub, kButter).lp;
        const subR = this.stepSvf(wetR, this.subMonoR, gSub, kButter).lp;
        const subMono = (subL + subR) * 0.5;
        const hiL = wetL - subL;
        const hiR = wetR - subR;
        const mid = (hiL + hiR) * 0.5;
        const side = (hiL - hiR) * 0.5 * cur.stereoWidth;
        wetL = subMono + (mid + side);
        wetR = subMono + (mid - side);
      }

      // 6. GLOBAL EFFECT MIX & CLICKLESS A/B COMPARISON
      const procL = dryL * (1 - cur.effectMix) + wetL * cur.effectMix;
      const procR = dryR * (1 - cur.effectMix) + wetR * cur.effectMix;

      let outSampleL = dryL * (1 - cur.abWet) + procL * cur.abWet;
      let outSampleR = dryR * (1 - cur.abWet) + procR * cur.abWet;

      // 7. DC-BLOCKER & ZERO-CLIP SOFT LIMITER
      const dcL = outSampleL - this.dcXL + 0.9992 * this.dcYL;
      this.dcXL = outSampleL;
      this.dcYL = dcL;

      const dcR = outSampleR - this.dcXR + 0.9992 * this.dcYR;
      this.dcXR = outSampleR;
      this.dcYR = dcR;

      const absL = Math.abs(dcL);
      const absR = Math.abs(dcR);
      if (absL > 0.88) {
        outSampleL = (dcL >= 0 ? 1 : -1) * (0.88 + Math.tanh((absL - 0.88) * 6.5) * 0.105);
      } else {
        outSampleL = dcL;
      }
      if (absR > 0.88) {
        outSampleR = (dcR >= 0 ? 1 : -1) * (0.88 + Math.tanh((absR - 0.88) * 6.5) * 0.105);
      } else {
        outSampleR = dcR;
      }

      outL[i] = outSampleL;
      if (outR !== outL) outR[i] = outSampleR;

      if (Math.abs(outSampleL) > this.peakOutL) this.peakOutL = Math.abs(outSampleL);
      if (Math.abs(outSampleR) > this.peakOutR) this.peakOutR = Math.abs(outSampleR);
    }

    this.telemFrames += len;
    if (this.telemFrames >= this.sr * 0.05) {
      this.port.postMessage({
        type: 'telemetry',
        lowGr: this.lastLowGr,
        midGr: this.lastMidGr,
        highGr: this.lastHighGr,
        peakIn: this.peakIn,
        peakOutL: this.peakOutL,
        peakOutR: this.peakOutR,
      });
      this.telemFrames = 0;
      this.peakIn = 0;
      this.peakOutL = 0;
      this.peakOutR = 0;
    }

    return true;
  }
}

class TarekMicRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.batchSize = 1024;
    this.buf0 = new Float32Array(this.batchSize);
    this.buf1 = new Float32Array(this.batchSize);
    this.hasStereo = false;
    this.fill = 0;

    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.active === 'boolean') {
        const nextActive = e.data.active;
        if (this.active && !nextActive && this.fill > 0) {
          this.flush();
        }
        this.active = nextActive;
      }
    };
  }

  flush() {
    if (this.fill <= 0) return;
    const len = this.fill;
    const c0 = this.buf0.slice(0, len);
    let peak = 0;
    let mn = 1;
    let mx = -1;
    for (let i = 0; i < len; i++) {
      const v = c0[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }

    if (this.hasStereo) {
      const c1 = this.buf1.slice(0, len);
      this.port.postMessage(
        { type: 'chunk', ch0: c0, ch1: c1, isMono: false, peak, min: mn, max: mx },
        [c0.buffer, c1.buffer]
      );
    } else {
      this.port.postMessage(
        { type: 'chunk', ch0: c0, isMono: true, peak, min: mn, max: mx },
        [c0.buffer]
      );
    }
    this.fill = 0;
    this.hasStereo = false;
  }

  process(inputs) {
    if (!this.active) return true;
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch0 = input[0];
    const ch1 = input[1] && input[1] !== ch0 ? input[1] : null;
    if (ch1) this.hasStereo = true;

    const len = ch0.length;
    for (let i = 0; i < len; i++) {
      const idx = this.fill;
      this.buf0[idx] = ch0[i];
      if (ch1) this.buf1[idx] = ch1[i];
      this.fill = idx + 1;
      if (this.fill >= this.batchSize) {
        this.flush();
      }
    }
    return true;
  }
}

registerProcessor('tarek-bass-remix-processor', BassRemixDspProcessor);
registerProcessor('tarek-mic-recorder-processor', TarekMicRecorderProcessor);
