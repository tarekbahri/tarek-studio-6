import type { FxCategoryId, ModularFxInstance } from '../types/fx';
import {
  computeCabinetAcousticTargets,
  getCabinetImpulse,
  getTremoloLfoBuffer,
  indexToCabinetType,
  indexToTremoloSyncDivision,
  indexToTremoloWaveform,
} from './cabinetAndTremolo';
import { divisionToHz } from './wavetables';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Cached shared WaveShaper curves (reused across modules to prevent memory/CPU churn)
const curveCache = new Map<string, Float32Array<ArrayBuffer>>();

function getDistortionCurve(mode: number, driveNorm: number): Float32Array<ArrayBuffer> {
  const bucket = Math.round(clamp(driveNorm, 0, 1) * 20);
  const m = Math.round(clamp(mode, 0, 2));
  const key = `dist_${m}_${bucket}`;
  const cached = curveCache.get(key);
  if (cached) return cached;

  const n = 512;
  const buf = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buf);
  const k = 1.2 + (bucket / 20) * 26;

  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    if (m === 1) {
      // Hard clip
      const boost = x * (1 + k * 0.35);
      curve[i] = clamp(boost, -0.92, 0.92);
    } else if (m === 2) {
      // Foldback
      const boost = x * (1 + (bucket / 20) * 3.4);
      curve[i] = Math.sin(boost * Math.PI * 0.72) * 0.88;
    } else {
      // Smooth tanh overdrive
      curve[i] = Math.tanh(x * (1 + k * 0.25)) / Math.tanh(1 + k * 0.25);
    }
  }
  curveCache.set(key, curve);
  return curve;
}

function getSaturationCurve(driveNorm: number): Float32Array<ArrayBuffer> {
  const bucket = Math.round(clamp(driveNorm, 0, 1) * 20);
  const key = `sat_${bucket}`;
  const cached = curveCache.get(key);
  if (cached) return cached;

  const n = 512;
  const buf = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buf);
  const k = 1 + (bucket / 20) * 5.2;

  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    // Asymmetric warm tube transfer
    const pos = x >= 0 ? Math.tanh(x * (k + 0.35)) : Math.tanh(x * k * 0.88);
    curve[i] = clamp(pos * 0.96, -0.98, 0.98);
  }
  curveCache.set(key, curve);
  return curve;
}

// Cached quantized stereo exponential impulse responses for Reverb
const reverbIrCache = new Map<string, AudioBuffer>();

function getReverbImpulse(ctx: AudioContext, sizeSec: number): AudioBuffer {
  const quantizedSize = clamp(Math.round(sizeSec * 4) / 4, 0.25, 3.25);
  const key = `${ctx.sampleRate}_${quantizedSize}`;
  const existing = reverbIrCache.get(key);
  if (existing && existing.sampleRate === ctx.sampleRate) {
    return existing;
  }

  const length = Math.max(1024, Math.floor(ctx.sampleRate * quantizedSize));
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  const decay = 2.6 + quantizedSize * 1.1;

  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, decay);
      const white = Math.random() * 2 - 1;
      // Gentle smoothing on late tail + early stereo decorrelation
      lp = lp * 0.32 + white * 0.68;
      data[i] = lp * env * 0.55;
    }
  }

  // Cap cache size cleanly
  if (reverbIrCache.size > 14) {
    const first = reverbIrCache.keys().next().value;
    if (first) reverbIrCache.delete(first);
  }
  reverbIrCache.set(key, ir);
  return ir;
}

interface FxSlotHandle {
  id: string;
  type: FxCategoryId;
  input: GainNode;
  output: GainNode;
  update: (
    params: Record<string, number>,
    moduleEnabled: boolean,
    channelBypass: boolean,
    bpm: number
  ) => void;
  dispose: () => void;
}

function createFxSlot(ctx: AudioContext, module: ModularFxInstance): FxSlotHandle {
  const now = ctx.currentTime;
  const input = ctx.createGain();
  const output = ctx.createGain();
  const bypassGain = ctx.createGain();
  const wetSendGain = ctx.createGain();

  const nodesToDisconnect: AudioNode[] = [input, output, bypassGain, wetSendGain];
  const oscsToStop: OscillatorNode[] = [];
  let activeTremoloSrc: AudioBufferSourceNode | null = null;
  let cabIrDebounceTimer: number | null = null;

  input.connect(bypassGain);
  bypassGain.connect(output);
  input.connect(wetSendGain);

  let updateInner: (params: Record<string, number>, nowTime: number, bpm: number) => void = () => {};
  let lastReverbSize = -1;

  switch (module.type) {
    case 'distortion': {
      const pre = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      shaper.oversample = 'none';
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      const wet = ctx.createGain();
      const dry = ctx.createGain();
      const outGain = ctx.createGain();

      wetSendGain.connect(dry);
      dry.connect(outGain);

      wetSendGain.connect(pre);
      pre.connect(shaper);
      shaper.connect(tone);
      tone.connect(wet);
      wet.connect(outGain);
      outGain.connect(output);

      nodesToDisconnect.push(pre, shaper, tone, wet, dry, outGain);

      updateInner = (p, t) => {
        const drive = clamp(p.drive ?? 0.42, 0, 1);
        const mode = Math.round(clamp(p.mode ?? 0, 0, 2));
        const mix = clamp(p.mix ?? 0.65, 0, 1);
        const out = clamp(p.output ?? 0.9, 0.2, 1.5);
        shaper.curve = getDistortionCurve(mode, drive);
        pre.gain.setTargetAtTime(1 + drive * 2.2, t, 0.015);
        tone.frequency.setTargetAtTime(clamp(p.tone ?? 5200, 350, 14000), t, 0.015);
        wet.gain.setTargetAtTime(mix, t, 0.012);
        dry.gain.setTargetAtTime(1 - mix, t, 0.012);
        outGain.gain.setTargetAtTime(out * (1 / (1 + drive * 0.25)), t, 0.015);
      };
      break;
    }

    case 'saturation': {
      const pre = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      shaper.oversample = 'none';
      const warmth = ctx.createBiquadFilter();
      warmth.type = 'lowpass';
      const wet = ctx.createGain();
      const dry = ctx.createGain();
      const outGain = ctx.createGain();

      wetSendGain.connect(dry);
      dry.connect(outGain);

      wetSendGain.connect(pre);
      pre.connect(shaper);
      shaper.connect(warmth);
      warmth.connect(wet);
      wet.connect(outGain);
      outGain.connect(output);

      nodesToDisconnect.push(pre, shaper, warmth, wet, dry, outGain);

      updateInner = (p, t) => {
        const drive = clamp(p.drive ?? 0.38, 0, 1);
        const mix = clamp(p.mix ?? 0.75, 0, 1);
        const out = clamp(p.output ?? 0.95, 0.3, 1.4);
        shaper.curve = getSaturationCurve(drive);
        pre.gain.setTargetAtTime(1 + drive * 1.6, t, 0.015);
        warmth.frequency.setTargetAtTime(clamp(p.warmth ?? 6800, 500, 16000), t, 0.015);
        wet.gain.setTargetAtTime(mix, t, 0.012);
        dry.gain.setTargetAtTime(1 - mix, t, 0.012);
        outGain.gain.setTargetAtTime(out * (1 / (1 + drive * 0.18)), t, 0.015);
      };
      break;
    }

    case 'filter': {
      const filter = ctx.createBiquadFilter();
      const wet = ctx.createGain();
      const dry = ctx.createGain();

      wetSendGain.connect(dry);
      dry.connect(output);
      wetSendGain.connect(filter);
      filter.connect(wet);
      wet.connect(output);

      nodesToDisconnect.push(filter, wet, dry);

      const types: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch'];
      updateInner = (p, t) => {
        const idx = Math.round(clamp(p.type ?? 0, 0, 3));
        filter.type = types[idx] ?? 'lowpass';
        filter.frequency.setTargetAtTime(clamp(p.cutoff ?? 2600, 35, 18000), t, 0.014);
        filter.Q.setTargetAtTime(clamp(p.resonance ?? 2.2, 0.5, 14), t, 0.014);
        const mix = clamp(p.mix ?? 1, 0, 1);
        wet.gain.setTargetAtTime(mix, t, 0.012);
        dry.gain.setTargetAtTime(1 - mix, t, 0.012);
      };
      break;
    }

    case 'eq': {
      const low = ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.setValueAtTime(105, now);

      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.Q.setValueAtTime(1.1, now);

      const high = ctx.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.setValueAtTime(6400, now);

      wetSendGain.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(output);

      nodesToDisconnect.push(low, mid, high);

      updateInner = (p, t) => {
        low.gain.setTargetAtTime(clamp(p.low ?? 2, -12, 12), t, 0.015);
        mid.frequency.setTargetAtTime(clamp(p.midFreq ?? 1100, 220, 5200), t, 0.015);
        mid.gain.setTargetAtTime(clamp(p.mid ?? 0, -12, 12), t, 0.015);
        high.gain.setTargetAtTime(clamp(p.high ?? 1.5, -12, 12), t, 0.015);
      };
      break;
    }

    case 'compressor': {
      const comp = ctx.createDynamicsCompressor();
      comp.knee.setValueAtTime(10, now);
      const makeup = ctx.createGain();
      const wet = ctx.createGain();
      const dry = ctx.createGain();

      wetSendGain.connect(dry);
      dry.connect(output);

      wetSendGain.connect(comp);
      comp.connect(makeup);
      makeup.connect(wet);
      wet.connect(output);

      nodesToDisconnect.push(comp, makeup, wet, dry);

      updateInner = (p, t) => {
        comp.threshold.setTargetAtTime(clamp(p.threshold ?? -18, -42, -1), t, 0.015);
        comp.ratio.setTargetAtTime(clamp(p.ratio ?? 4, 1.5, 16), t, 0.015);
        comp.attack.setTargetAtTime(clamp(p.attack ?? 8, 1, 80) / 1000, t, 0.015);
        comp.release.setTargetAtTime(clamp(p.release ?? 140, 30, 500) / 1000, t, 0.015);
        makeup.gain.setTargetAtTime(clamp(p.makeup ?? 1.2, 0.5, 2.2), t, 0.015);
        const mix = clamp(p.mix ?? 1, 0, 1);
        wet.gain.setTargetAtTime(mix, t, 0.012);
        dry.gain.setTargetAtTime(1 - mix, t, 0.012);
      };
      break;
    }

    case 'reverb': {
      const dry = ctx.createGain();
      const predelay = ctx.createDelay(0.12);
      const convolver = ctx.createConvolver();
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      const wet = ctx.createGain();

      wetSendGain.connect(dry);
      dry.connect(output);

      wetSendGain.connect(predelay);
      predelay.connect(convolver);
      convolver.connect(damp);
      damp.connect(wet);
      wet.connect(output);

      nodesToDisconnect.push(dry, predelay, convolver, damp, wet);

      updateInner = (p, t) => {
        const size = clamp(p.size ?? 1.4, 0.25, 3.2);
        const qSize = Math.round(size * 4) / 4;
        if (qSize !== lastReverbSize) {
          lastReverbSize = qSize;
          convolver.buffer = getReverbImpulse(ctx, qSize);
        }
        predelay.delayTime.setTargetAtTime(clamp(p.predelay ?? 14, 0, 60) / 1000, t, 0.015);
        damp.frequency.setTargetAtTime(clamp(p.damp ?? 5600, 900, 15000), t, 0.015);
        const mix = clamp(p.mix ?? 0.26, 0, 0.85);
        wet.gain.setTargetAtTime(mix, t, 0.015);
        dry.gain.setTargetAtTime(1 - mix * 0.35, t, 0.015);
      };
      break;
    }

    case 'delay': {
      const dry = ctx.createGain();
      const delayL = ctx.createDelay(1.0);
      const delayR = ctx.createDelay(1.0);
      const feedback = ctx.createGain();
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      const merger = ctx.createChannelMerger(2);
      const wet = ctx.createGain();

      wetSendGain.connect(dry);
      dry.connect(output);

      wetSendGain.connect(delayL);
      delayL.connect(tone);
      tone.connect(delayR);
      delayR.connect(feedback);
      feedback.connect(delayL);

      delayL.connect(merger, 0, 0);
      delayR.connect(merger, 0, 1);
      merger.connect(wet);
      wet.connect(output);

      nodesToDisconnect.push(dry, delayL, delayR, feedback, tone, merger, wet);

      updateInner = (p, t) => {
        const timeSec = clamp(p.timeMs ?? 260, 40, 750) / 1000;
        delayL.delayTime.setTargetAtTime(timeSec, t, 0.02);
        delayR.delayTime.setTargetAtTime(timeSec * 0.75, t, 0.02);
        feedback.gain.setTargetAtTime(clamp(p.feedback ?? 0.38, 0, 0.82), t, 0.015);
        tone.frequency.setTargetAtTime(clamp(p.tone ?? 4200, 700, 12000), t, 0.015);
        const mix = clamp(p.mix ?? 0.28, 0, 0.85);
        wet.gain.setTargetAtTime(mix, t, 0.014);
        dry.gain.setTargetAtTime(1 - mix * 0.25, t, 0.014);
      };
      break;
    }

    case 'chorus': {
      const dry = ctx.createGain();
      const delayL = ctx.createDelay(0.05);
      const delayR = ctx.createDelay(0.05);
      delayL.delayTime.setValueAtTime(0.013, now);
      delayR.delayTime.setValueAtTime(0.018, now);

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      const lfoGainL = ctx.createGain();
      const lfoGainR = ctx.createGain();
      const merger = ctx.createChannelMerger(2);
      const wet = ctx.createGain();

      wetSendGain.connect(dry);
      dry.connect(output);

      wetSendGain.connect(delayL);
      wetSendGain.connect(delayR);
      lfo.connect(lfoGainL);
      lfo.connect(lfoGainR);
      lfoGainL.connect(delayL.delayTime);
      lfoGainR.connect(delayR.delayTime);

      delayL.connect(merger, 0, 0);
      delayR.connect(merger, 0, 1);
      merger.connect(wet);
      wet.connect(output);

      lfo.start(now);
      oscsToStop.push(lfo);
      nodesToDisconnect.push(dry, delayL, delayR, lfo, lfoGainL, lfoGainR, merger, wet);

      updateInner = (p, t) => {
        const rate = clamp(p.rate ?? 0.9, 0.15, 5);
        const depth = clamp(p.depth ?? 0.45, 0, 1);
        const mix = clamp(p.mix ?? 0.42, 0, 0.9);
        lfo.frequency.setTargetAtTime(rate, t, 0.02);
        lfoGainL.gain.setTargetAtTime(depth * 0.0055, t, 0.02);
        lfoGainR.gain.setTargetAtTime(-depth * 0.0055, t, 0.02);
        wet.gain.setTargetAtTime(mix, t, 0.014);
        dry.gain.setTargetAtTime(1 - mix * 0.45, t, 0.014);
      };
      break;
    }

    case 'phaser': {
      const dry = ctx.createGain();
      const ap1 = ctx.createBiquadFilter();
      const ap2 = ctx.createBiquadFilter();
      const ap3 = ctx.createBiquadFilter();
      ap1.type = 'allpass';
      ap2.type = 'allpass';
      ap3.type = 'allpass';
      ap1.frequency.setValueAtTime(900, now);
      ap2.frequency.setValueAtTime(1400, now);
      ap3.frequency.setValueAtTime(2100, now);

      const fb = ctx.createGain();
      const wet = ctx.createGain();
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      const lfoDepth = ctx.createGain();

      wetSendGain.connect(dry);
      dry.connect(output);

      wetSendGain.connect(ap1);
      ap1.connect(ap2);
      ap2.connect(ap3);
      ap3.connect(fb);
      fb.connect(ap1);
      ap3.connect(wet);
      wet.connect(output);

      lfo.connect(lfoDepth);
      lfoDepth.connect(ap1.frequency);
      lfoDepth.connect(ap2.frequency);
      lfoDepth.connect(ap3.frequency);

      lfo.start(now);
      oscsToStop.push(lfo);
      nodesToDisconnect.push(dry, ap1, ap2, ap3, fb, wet, lfo, lfoDepth);

      updateInner = (p, t) => {
        const rate = clamp(p.rate ?? 0.65, 0.1, 4.5);
        const depth = clamp(p.depth ?? 0.65, 0, 1);
        const fdbk = clamp(p.feedback ?? 0.35, 0, 0.78);
        const mix = clamp(p.mix ?? 0.55, 0, 1);
        lfo.frequency.setTargetAtTime(rate, t, 0.02);
        lfoDepth.gain.setTargetAtTime(depth * 780, t, 0.02);
        fb.gain.setTargetAtTime(fdbk, t, 0.015);
        wet.gain.setTargetAtTime(mix * 0.75, t, 0.014);
        dry.gain.setTargetAtTime(1 - mix * 0.35, t, 0.014);
      };
      break;
    }

    case 'flanger': {
      const dry = ctx.createGain();
      const delay = ctx.createDelay(0.03);
      delay.delayTime.setValueAtTime(0.0045, now);
      const fb = ctx.createGain();
      const wet = ctx.createGain();
      const lfo = ctx.createOscillator();
      lfo.type = 'triangle';
      const lfoDepth = ctx.createGain();

      wetSendGain.connect(dry);
      dry.connect(output);

      wetSendGain.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      wet.connect(output);

      lfo.connect(lfoDepth);
      lfoDepth.connect(delay.delayTime);
      lfo.start(now);
      oscsToStop.push(lfo);
      nodesToDisconnect.push(dry, delay, fb, wet, lfo, lfoDepth);

      updateInner = (p, t) => {
        const rate = clamp(p.rate ?? 0.38, 0.08, 3.5);
        const depth = clamp(p.depth ?? 0.6, 0, 1);
        const fdbk = clamp(p.feedback ?? 0.45, 0, 0.78);
        const mix = clamp(p.mix ?? 0.5, 0, 1);
        lfo.frequency.setTargetAtTime(rate, t, 0.02);
        lfoDepth.gain.setTargetAtTime(depth * 0.0036, t, 0.02);
        fb.gain.setTargetAtTime(fdbk, t, 0.015);
        wet.gain.setTargetAtTime(mix * 0.85, t, 0.014);
        dry.gain.setTargetAtTime(1 - mix * 0.35, t, 0.014);
      };
      break;
    }

    case 'cabinet': {
      const dry = ctx.createGain();
      const preHpf = ctx.createBiquadFilter();
      preHpf.type = 'highpass';
      const bodyPeak = ctx.createBiquadFilter();
      bodyPeak.type = 'peaking';
      const presencePeak = ctx.createBiquadFilter();
      presencePeak.type = 'peaking';
      presencePeak.Q.setValueAtTime(0.85, now);
      const coneLpf = ctx.createBiquadFilter();
      coneLpf.type = 'lowpass';
      coneLpf.Q.setValueAtTime(0.7, now);
      const convolver = ctx.createConvolver();
      convolver.normalize = false;
      const wet = ctx.createGain();
      const outGain = ctx.createGain();

      wetSendGain.connect(dry);
      dry.connect(outGain);

      wetSendGain.connect(preHpf);
      preHpf.connect(bodyPeak);
      bodyPeak.connect(presencePeak);
      presencePeak.connect(coneLpf);
      coneLpf.connect(convolver);
      convolver.connect(wet);
      wet.connect(outGain);
      outGain.connect(output);

      nodesToDisconnect.push(
        dry,
        preHpf,
        bodyPeak,
        presencePeak,
        coneLpf,
        convolver,
        wet,
        outGain
      );

      let lastCabKey = '';
      updateInner = (p, t) => {
        const cabType = indexToCabinetType(p.cabinetType ?? 0);
        const size = clamp(p.size ?? 0.55, 0, 1);
        const micPosition = clamp(p.micPosition ?? 0.35, 0, 1);
        const micDistance = clamp(p.micDistance ?? 0.25, 0, 1);
        const roomAmount = clamp(p.roomAmount ?? 0.2, 0, 1);
        const mix = clamp(p.mix ?? 0.85, 0, 1);
        const outputVal = clamp(p.outputGain ?? 1.0, 0.3, 1.6);

        dry.gain.setTargetAtTime(1 - mix, t, 0.015);
        wet.gain.setTargetAtTime(mix, t, 0.015);
        outGain.gain.setTargetAtTime(outputVal, t, 0.015);

        const ac = computeCabinetAcousticTargets(cabType, size, micPosition, micDistance);
        preHpf.frequency.setTargetAtTime(ac.hpfHz, t, 0.015);
        bodyPeak.frequency.setTargetAtTime(ac.bodyHz, t, 0.015);
        bodyPeak.Q.setTargetAtTime(ac.bodyQ, t, 0.015);
        bodyPeak.gain.setTargetAtTime(ac.bodyGainDb, t, 0.015);
        presencePeak.frequency.setTargetAtTime(ac.presenceHz, t, 0.015);
        presencePeak.gain.setTargetAtTime(ac.presenceGainDb, t, 0.015);
        coneLpf.frequency.setTargetAtTime(ac.lpfHz, t, 0.015);

        const cabKey = `${cabType}:${Math.round(size * 12)}:${Math.round(micPosition * 12)}:${Math.round(micDistance * 12)}:${Math.round(roomAmount * 12)}`;
        if (cabKey !== lastCabKey) {
          const isFirst = lastCabKey === '';
          lastCabKey = cabKey;
          if (isFirst) {
            convolver.buffer = getCabinetImpulse(
              ctx,
              cabType,
              size,
              micPosition,
              micDistance,
              roomAmount
            );
          } else {
            if (cabIrDebounceTimer !== null) {
              clearTimeout(cabIrDebounceTimer);
            }
            cabIrDebounceTimer = window.setTimeout(() => {
              cabIrDebounceTimer = null;
              try {
                convolver.buffer = getCabinetImpulse(
                  ctx,
                  cabType,
                  size,
                  micPosition,
                  micDistance,
                  roomAmount
                );
              } catch {
                // ignore if context closed
              }
            }, 35);
          }
        }
      };
      break;
    }

    case 'tremolo': {
      const splitter = ctx.createChannelSplitter(2);
      const gainL = ctx.createGain();
      const gainR = ctx.createGain();
      gainL.gain.setValueAtTime(1, now);
      gainR.gain.setValueAtTime(1, now);
      const merger = ctx.createChannelMerger(2);

      const lfoSplit = ctx.createChannelSplitter(2);
      const lfoSmoothL = ctx.createBiquadFilter();
      lfoSmoothL.type = 'lowpass';
      lfoSmoothL.frequency.setValueAtTime(160, now);
      const lfoSmoothR = ctx.createBiquadFilter();
      lfoSmoothR.type = 'lowpass';
      lfoSmoothR.frequency.setValueAtTime(160, now);
      const lfoDepthL = ctx.createGain();
      const lfoDepthR = ctx.createGain();
      lfoDepthL.gain.setValueAtTime(0, now);
      lfoDepthR.gain.setValueAtTime(0, now);

      const lfoSrc = ctx.createBufferSource();
      lfoSrc.buffer = getTremoloLfoBuffer(ctx, 'sine', 90);
      lfoSrc.loop = true;
      activeTremoloSrc = lfoSrc;

      lfoSrc.connect(lfoSplit);
      lfoSplit.connect(lfoSmoothL, 0);
      lfoSplit.connect(lfoSmoothR, 1);
      lfoSmoothL.connect(lfoDepthL);
      lfoSmoothR.connect(lfoDepthR);
      lfoDepthL.connect(gainL.gain);
      lfoDepthR.connect(gainR.gain);
      lfoSrc.start(now);

      wetSendGain.connect(splitter);
      splitter.connect(gainL, 0);
      splitter.connect(gainR, 1);
      gainL.connect(merger, 0, 0);
      gainR.connect(merger, 0, 1);
      merger.connect(output);

      nodesToDisconnect.push(
        splitter,
        gainL,
        gainR,
        merger,
        lfoSplit,
        lfoSmoothL,
        lfoSmoothR,
        lfoDepthL,
        lfoDepthR
      );

      let lastTremBufKey = `${ctx.sampleRate}:sine:90`;

      updateInner = (p, t, bpm) => {
        const depth = clamp(p.depth ?? 0.65, 0, 1);
        const mix = clamp(p.mix ?? 1.0, 0, 1);
        const effMod = depth * mix;
        const wf = indexToTremoloWaveform(p.waveform ?? 0);
        const qDeg = Math.round(clamp(p.stereoPhase ?? 90, 0, 180) / 5) * 5;
        const syncOn = Math.round(p.sync ?? 0) >= 1;
        const div = indexToTremoloSyncDivision(p.division ?? 5);
        const hz = syncOn ? divisionToHz(div, bpm) : clamp(p.rate ?? 4.0, 0.1, 20);
        const clampedHz = clamp(hz, 0.05, 25);

        const bufKey = `${ctx.sampleRate}:${wf}:${qDeg}`;
        if (bufKey !== lastTremBufKey) {
          lastTremBufKey = bufKey;
          if (activeTremoloSrc) {
            try {
              activeTremoloSrc.stop();
              activeTremoloSrc.disconnect();
            } catch {
              // ignore
            }
          }
          const nextSrc = ctx.createBufferSource();
          nextSrc.buffer = getTremoloLfoBuffer(ctx, wf, qDeg);
          nextSrc.loop = true;
          nextSrc.playbackRate.setValueAtTime(clampedHz, t);
          nextSrc.connect(lfoSplit);
          nextSrc.start(t);
          activeTremoloSrc = nextSrc;
        } else if (activeTremoloSrc) {
          activeTremoloSrc.playbackRate.setTargetAtTime(clampedHz, t, 0.015);
        }

        if (effMod > 0.004) {
          const halfMod = effMod * 0.5;
          const baseLevel = 1 - halfMod;
          gainL.gain.setTargetAtTime(baseLevel, t, 0.014);
          gainR.gain.setTargetAtTime(baseLevel, t, 0.014);
          lfoDepthL.gain.setTargetAtTime(halfMod, t, 0.014);
          lfoDepthR.gain.setTargetAtTime(halfMod, t, 0.014);
        } else {
          gainL.gain.setTargetAtTime(1, t, 0.014);
          gainR.gain.setTargetAtTime(1, t, 0.014);
          lfoDepthL.gain.setTargetAtTime(0, t, 0.014);
          lfoDepthR.gain.setTargetAtTime(0, t, 0.014);
        }
      };
      break;
    }

    case 'stereo': {
      // Mid/Side matrix + high-pass filter on side channel for mono sub foundation
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);

      const lToMid = ctx.createGain();
      const rToMid = ctx.createGain();
      lToMid.gain.setValueAtTime(0.5, now);
      rToMid.gain.setValueAtTime(0.5, now);

      const lToSide = ctx.createGain();
      const rToSide = ctx.createGain();
      lToSide.gain.setValueAtTime(0.5, now);
      rToSide.gain.setValueAtTime(-0.5, now);

      const midSum = ctx.createGain();
      const sideSum = ctx.createGain();
      const sideHpf = ctx.createBiquadFilter();
      sideHpf.type = 'highpass';

      const sidePos = ctx.createGain();
      const sideNeg = ctx.createGain();
      const outGain = ctx.createGain();

      wetSendGain.connect(splitter);
      splitter.connect(lToMid, 0);
      splitter.connect(rToMid, 1);
      lToMid.connect(midSum);
      rToMid.connect(midSum);

      splitter.connect(lToSide, 0);
      splitter.connect(rToSide, 1);
      lToSide.connect(sideSum);
      rToSide.connect(sideSum);
      sideSum.connect(sideHpf);

      sideHpf.connect(sidePos);
      sideHpf.connect(sideNeg);

      // Reconstruct L = Mid + Side, R = Mid - Side
      midSum.connect(merger, 0, 0);
      sidePos.connect(merger, 0, 0);
      midSum.connect(merger, 0, 1);
      sideNeg.connect(merger, 0, 1);

      merger.connect(outGain);
      outGain.connect(output);

      nodesToDisconnect.push(
        splitter,
        merger,
        lToMid,
        rToMid,
        lToSide,
        rToSide,
        midSum,
        sideSum,
        sideHpf,
        sidePos,
        sideNeg,
        outGain
      );

      updateInner = (p, t) => {
        const width = clamp(p.width ?? 1.35, 0, 2.0);
        const monoHz = clamp(p.monoHz ?? 110, 40, 260);
        const out = clamp(p.output ?? 1.0, 0.5, 1.3);
        sideHpf.frequency.setTargetAtTime(monoHz, t, 0.018);
        sidePos.gain.setTargetAtTime(width, t, 0.015);
        sideNeg.gain.setTargetAtTime(-width, t, 0.015);
        outGain.gain.setTargetAtTime(out, t, 0.015);
      };
      break;
    }

    case 'limiter': {
      const boost = ctx.createGain();
      const lim = ctx.createDynamicsCompressor();
      lim.ratio.setValueAtTime(18, now);
      lim.knee.setValueAtTime(1.5, now);
      lim.attack.setValueAtTime(0.001, now);

      wetSendGain.connect(boost);
      boost.connect(lim);
      lim.connect(output);

      nodesToDisconnect.push(boost, lim);

      updateInner = (p, t) => {
        boost.gain.setTargetAtTime(clamp(p.inputGain ?? 1.12, 0.7, 2.0), t, 0.015);
        lim.threshold.setTargetAtTime(clamp(p.ceiling ?? -1.5, -16, -0.3), t, 0.015);
        lim.release.setTargetAtTime(clamp(p.release ?? 85, 25, 300) / 1000, t, 0.015);
      };
      break;
    }
  }

  const update = (
    params: Record<string, number>,
    moduleEnabled: boolean,
    channelBypass: boolean,
    bpm: number
  ) => {
    const t = ctx.currentTime;
    const active = moduleEnabled && !channelBypass;
    bypassGain.gain.setTargetAtTime(active ? 0 : 1, t, 0.012);
    wetSendGain.gain.setTargetAtTime(active ? 1 : 0, t, 0.012);
    updateInner(params, t, bpm);
  };

  const dispose = () => {
    if (cabIrDebounceTimer !== null) {
      clearTimeout(cabIrDebounceTimer);
      cabIrDebounceTimer = null;
    }
    if (activeTremoloSrc) {
      try {
        activeTremoloSrc.stop();
        activeTremoloSrc.disconnect();
      } catch {
        // ignore
      }
      activeTremoloSrc = null;
    }
    for (const osc of oscsToStop) {
      try {
        osc.stop();
      } catch {
        // ignore
      }
    }
    for (const node of nodesToDisconnect) {
      try {
        node.disconnect();
      } catch {
        // ignore
      }
    }
  };

  return {
    id: module.id,
    type: module.type,
    input,
    output,
    update,
    dispose,
  };
}

/**
 * Manages an ordered horizontal Modular FX chain for a single instrument channel.
 * Zero-node overhead when empty; click-free updates when active.
 */
export class ModularFxChannelChain {
  private ctx: AudioContext | null = null;
  private inputNode: GainNode | null = null;
  private outputNode: GainNode | null = null;
  private slots: FxSlotHandle[] = [];
  private modules: ModularFxInstance[] = [];
  private channelBypass = false;
  private bpm = 124;

  public attach(ctx: AudioContext, inputNode: GainNode, outputNode: GainNode): void {
    this.ctx = ctx;
    this.inputNode = inputNode;
    this.outputNode = outputNode;
    this.rebuildGraph();
  }

  public detach(): void {
    this.disposeSlots();
    this.ctx = null;
    this.inputNode = null;
    this.outputNode = null;
  }

  public setBpm(bpm: number): void {
    const nextBpm = clamp(bpm, 30, 300);
    if (this.bpm === nextBpm) return;
    this.bpm = nextBpm;
    this.syncSlotParams();
  }

  public setModules(modules: ModularFxInstance[], channelBypass: boolean): void {
    this.channelBypass = channelBypass;
    const prevSignature = this.slots.map((s) => `${s.id}:${s.type}`).join('|');
    const nextSignature = modules.map((m) => `${m.id}:${m.type}`).join('|');
    this.modules = modules;

    if (!this.ctx || !this.inputNode || !this.outputNode) {
      return;
    }

    if (prevSignature !== nextSignature) {
      this.rebuildGraph();
    } else {
      this.syncSlotParams();
    }
  }

  public setChannelBypass(bypass: boolean): void {
    if (this.channelBypass === bypass) return;
    this.channelBypass = bypass;
    this.syncSlotParams();
  }

  private syncSlotParams(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const mod = this.modules[i];
      if (slot && mod) {
        slot.update(mod.params, mod.enabled, this.channelBypass, this.bpm);
      }
    }
  }

  private disposeSlots(): void {
    for (const s of this.slots) {
      s.dispose();
    }
    this.slots = [];
    try {
      this.inputNode?.disconnect();
    } catch {
      // ignore
    }
  }

  private rebuildGraph(): void {
    if (!this.ctx || !this.inputNode || !this.outputNode) return;
    this.disposeSlots();

    if (this.modules.length === 0) {
      this.inputNode.connect(this.outputNode);
      return;
    }

    const built: FxSlotHandle[] = [];
    for (const mod of this.modules) {
      const slot = createFxSlot(this.ctx, mod);
      slot.update(mod.params, mod.enabled, this.channelBypass, this.bpm);
      built.push(slot);
    }

    let cursor: AudioNode = this.inputNode;
    for (const slot of built) {
      cursor.connect(slot.input);
      cursor = slot.output;
    }
    cursor.connect(this.outputNode);
    this.slots = built;
  }
}
