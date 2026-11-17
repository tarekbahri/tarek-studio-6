import type {
  CabinetType,
  LfoSyncDivision,
  TremoloWaveform,
} from '../types/synth';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export const CABINET_TYPES: { id: CabinetType; label: string; shortLabel: string }[] = [
  { id: '1x15_bass', label: '1x15 Bass', shortLabel: '1x15' },
  { id: '4x10_bass', label: '4x10 Bass', shortLabel: '4x10' },
  { id: '8x10_ampeg', label: '8x10 Fridge', shortLabel: '8x10' },
  { id: '2x12_clean', label: '2x12 Clean', shortLabel: '2x12' },
  { id: '4x12_modern', label: '4x12 Modern', shortLabel: '4x12' },
];

export const TREMOLO_WAVEFORMS: { id: TremoloWaveform; label: string }[] = [
  { id: 'sine', label: 'Sine' },
  { id: 'triangle', label: 'Tri' },
  { id: 'square', label: 'Sqr' },
  { id: 'sawtooth', label: 'Saw' },
];

export const TREMOLO_SYNC_DIVISIONS: LfoSyncDivision[] = [
  '1/1',
  '1/2',
  '1/4',
  '1/4d',
  '1/4t',
  '1/8',
  '1/8d',
  '1/8t',
  '1/16',
  '1/32',
];

export function indexToCabinetType(idx: number): CabinetType {
  const i = Math.round(clamp(idx, 0, CABINET_TYPES.length - 1));
  return CABINET_TYPES[i]?.id ?? '1x15_bass';
}

export function cabinetTypeToIndex(type: CabinetType): number {
  const idx = CABINET_TYPES.findIndex((c) => c.id === type);
  return idx >= 0 ? idx : 0;
}

export function indexToTremoloWaveform(idx: number): TremoloWaveform {
  const i = Math.round(clamp(idx, 0, TREMOLO_WAVEFORMS.length - 1));
  return TREMOLO_WAVEFORMS[i]?.id ?? 'sine';
}

export function tremoloWaveformToIndex(wf: TremoloWaveform): number {
  const idx = TREMOLO_WAVEFORMS.findIndex((w) => w.id === wf);
  return idx >= 0 ? idx : 0;
}

export function indexToTremoloSyncDivision(idx: number): LfoSyncDivision {
  const i = Math.round(clamp(idx, 0, TREMOLO_SYNC_DIVISIONS.length - 1));
  return TREMOLO_SYNC_DIVISIONS[i] ?? '1/8';
}

export function tremoloSyncDivisionToIndex(div: LfoSyncDivision): number {
  const idx = TREMOLO_SYNC_DIVISIONS.indexOf(div);
  return idx >= 0 ? idx : 5; // default '1/8'
}

interface CabinetSpec {
  hpfHz: number;
  bodyHz: number;
  bodyGainDb: number;
  bodyQ: number;
  coneHz: number;
  presenceHz: number;
  presenceGainDb: number;
  dampingHz: number;
  irBaseDecayMs: number;
  speakerMass: number;
}

const CABINET_SPECS: Record<CabinetType, CabinetSpec> = {
  '1x15_bass': {
    hpfHz: 36,
    bodyHz: 92,
    bodyGainDb: 3.4,
    bodyQ: 0.9,
    coneHz: 2900,
    presenceHz: 780,
    presenceGainDb: 1.4,
    dampingHz: 3400,
    irBaseDecayMs: 24,
    speakerMass: 0.72,
  },
  '4x10_bass': {
    hpfHz: 46,
    bodyHz: 118,
    bodyGainDb: 2.8,
    bodyQ: 1.0,
    coneHz: 4300,
    presenceHz: 1550,
    presenceGainDb: 2.2,
    dampingHz: 5200,
    irBaseDecayMs: 20,
    speakerMass: 0.56,
  },
  '8x10_ampeg': {
    hpfHz: 40,
    bodyHz: 105,
    bodyGainDb: 3.8,
    bodyQ: 1.05,
    coneHz: 3600,
    presenceHz: 1150,
    presenceGainDb: 2.4,
    dampingHz: 4200,
    irBaseDecayMs: 26,
    speakerMass: 0.68,
  },
  '2x12_clean': {
    hpfHz: 65,
    bodyHz: 145,
    bodyGainDb: 2.0,
    bodyQ: 0.85,
    coneHz: 5600,
    presenceHz: 2200,
    presenceGainDb: 2.0,
    dampingHz: 6200,
    irBaseDecayMs: 18,
    speakerMass: 0.44,
  },
  '4x12_modern': {
    hpfHz: 62,
    bodyHz: 130,
    bodyGainDb: 3.0,
    bodyQ: 0.95,
    coneHz: 4800,
    presenceHz: 2400,
    presenceGainDb: 2.8,
    dampingHz: 5000,
    irBaseDecayMs: 22,
    speakerMass: 0.54,
  },
};

export interface CabinetAcousticTargets {
  hpfHz: number;
  bodyHz: number;
  bodyGainDb: number;
  bodyQ: number;
  presenceHz: number;
  presenceGainDb: number;
  lpfHz: number;
}

export function computeCabinetAcousticTargets(
  cabinetType: CabinetType,
  size: number,
  micPosition: number,
  micDistance: number
): CabinetAcousticTargets {
  const spec = CABINET_SPECS[cabinetType] ?? CABINET_SPECS['1x15_bass'];
  const s = clamp(size, 0, 1);
  const pos = clamp(micPosition, 0, 1); // 0 = center dust cap, 1 = cone edge
  const dist = clamp(micDistance, 0, 1); // 0 = close mic, 1 = far mic

  // Larger cabinet lowers bass resonance and HPF slightly
  const sizeScale = Math.pow(2, (0.5 - s) * 0.48);
  const hpfHz = clamp(spec.hpfHz * sizeScale, 26, 110);
  const bodyHz = clamp(spec.bodyHz * sizeScale, 60, 240);

  // Close-center mic increases proximity low-end slightly and highs
  const proximityBoost = (1 - dist) * 1.4;
  const bodyGainDb = spec.bodyGainDb + proximityBoost + (s - 0.5) * 1.2;

  // Off-axis cone edge & far mic distance warm up top end smoothly
  const lpfHz = clamp(
    spec.coneHz * (1 - pos * 0.46) * (1 - dist * 0.34),
    1200,
    8500
  );
  const presenceHz = clamp(spec.presenceHz * (1 - pos * 0.28), 450, 3600);
  const presenceGainDb = spec.presenceGainDb * (1 - pos * 0.65) * (1 - dist * 0.3);

  return {
    hpfHz,
    bodyHz,
    bodyGainDb,
    bodyQ: spec.bodyQ,
    presenceHz,
    presenceGainDb,
    lpfHz,
  };
}

const cabinetIrCache = new Map<string, AudioBuffer>();

function seededNoise(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return (state / 0x100000000) * 2 - 1;
  };
}

/**
 * Generates a deterministic, natural, non-metallic speaker cabinet + early-room
 * stereo impulse response buffer suitable for Web Audio ConvolverNode.
 */
export function getCabinetImpulse(
  ctx: BaseAudioContext,
  cabinetType: CabinetType,
  size: number,
  micPosition: number,
  micDistance: number,
  roomAmount: number
): AudioBuffer {
  const qSize = Math.round(clamp(size, 0, 1) * 12);
  const qPos = Math.round(clamp(micPosition, 0, 1) * 12);
  const qDist = Math.round(clamp(micDistance, 0, 1) * 12);
  const qRoom = Math.round(clamp(roomAmount, 0, 1) * 12);
  const key = `${ctx.sampleRate}:${cabinetType}:${qSize}:${qPos}:${qDist}:${qRoom}`;

  const cached = cabinetIrCache.get(key);
  if (cached && cached.sampleRate === ctx.sampleRate) {
    return cached;
  }

  const sr = ctx.sampleRate;
  const spec = CABINET_SPECS[cabinetType] ?? CABINET_SPECS['1x15_bass'];
  const s = qSize / 12;
  const pos = qPos / 12;
  const dist = qDist / 12;
  const room = qRoom / 12;

  const durationSec = 0.045 + room * 0.11 + dist * 0.035;
  const length = Math.max(1024, Math.floor(sr * durationSec));
  const ir = ctx.createBuffer(2, length, sr);

  const directDelaySamples = Math.round((0.0005 + dist * 0.0032) * sr);
  const cabDecaySamples = Math.max(48, ((spec.irBaseDecayMs * (0.75 + s * 0.5)) / 1000) * sr);

  // First-order speaker cone damping cutoff based on cabinet + mic position + distance
  const coneCutoffHz = clamp(
    spec.dampingHz * (1 - pos * 0.44) * (1 - dist * 0.25),
    1100,
    8000
  );
  const lpAlpha = clamp(1 - Math.exp((-2 * Math.PI * coneCutoffHz) / sr), 0.05, 0.92);

  // Subtle DC/sub-sonic HPF so cabinet convolution stays tight at low notes
  const hpfCutoffHz = clamp(spec.hpfHz * Math.pow(2, (0.5 - s) * 0.4), 24, 95);
  const hpR = clamp(Math.exp((-2 * Math.PI * hpfCutoffHz) / sr), 0.95, 0.998);

  // Acoustic enclosure resonance frequency (smooth damped transient impulse, not harsh comb)
  const boxResHz = clamp(spec.bodyHz * Math.pow(2, (0.5 - s) * 0.45), 62, 220);

  // Subtle studio room early-reflection taps (in ms), slightly asymmetric L/R for stereo depth
  const earlyTapMsL = [6.8, 12.1, 18.7, 26.4, 35.9, 48.2, 62.5];
  const earlyTapMsR = [7.4, 13.3, 19.9, 28.1, 37.8, 51.4, 66.1];

  const randL = seededNoise(0x13572468 + qSize * 17 + qPos * 31);
  const randR = seededNoise(0x24681357 + qDist * 19 + qRoom * 37);

  let maxEnergy = 0;

  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    const taps = ch === 0 ? earlyTapMsL : earlyTapMsR;
    const rng = ch === 0 ? randL : randR;

    // 1. Direct speaker cone transient + natural box impulse
    for (let i = 0; i < length; i++) {
      let sample = 0;
      const dt = i - directDelaySamples;

      if (dt === 0) {
        sample += 0.95;
      } else if (dt > 0 && dt < cabDecaySamples * 3) {
        // Minimum-phase style speaker cone impulse: smooth exponentially damped low-mid body
        const env = Math.exp(-dt / (cabDecaySamples * 0.42));
        const bodyCycle = Math.sin((2 * Math.PI * boxResHz * dt) / sr);
        // Subtle cone breakup dispersion (non-periodic, smooth noise scaled down heavily)
        const coneTex = rng() * 0.045 * Math.exp(-dt / (cabDecaySamples * 0.2));
        sample += (0.28 * spec.speakerMass * bodyCycle * env) + coneTex;
      }

      data[i] = sample;
    }

    // 2. Natural room early reflections + soft diffused air tail (when roomAmount > 0)
    if (room > 0.005) {
      const roomScale = room * (0.22 + dist * 0.25);
      for (let t = 0; t < taps.length; t++) {
        const tapIdx = directDelaySamples + Math.round((taps[t] / 1000) * sr);
        if (tapIdx < length) {
          const polarity = t % 2 === 0 ? 1 : -0.82;
          const tapGain = roomScale * polarity * Math.pow(0.76, t);
          data[tapIdx] += tapGain;
          // Smear each reflection slightly across neighboring samples so no metallic flutter occurs
          if (tapIdx + 1 < length) data[tapIdx + 1] += tapGain * 0.55;
          if (tapIdx + 2 < length) data[tapIdx + 2] += tapGain * 0.25;
        }
      }

      const tailStart = directDelaySamples + Math.round(0.008 * sr);
      for (let i = tailStart; i < length; i++) {
        const normT = (i - tailStart) / Math.max(1, length - tailStart);
        const tailEnv = Math.pow(1 - normT, 2.8);
        data[i] += rng() * roomScale * 0.032 * tailEnv;
      }
    }

    // 3. Apply speaker damping LPF + DC-safe cabinet HPF across the impulse
    let lpState = 0;
    let hpPrevIn = 0;
    let hpPrevOut = 0;
    let energy = 0;
    for (let i = 0; i < length; i++) {
      lpState = lpState + lpAlpha * (data[i] - lpState);
      const hpOut = lpState - hpPrevIn + hpR * hpPrevOut;
      hpPrevIn = lpState;
      hpPrevOut = hpOut;
      data[i] = hpOut;
      energy += hpOut * hpOut;
    }
    if (energy > maxEnergy) maxEnergy = energy;
  }

  // Normalize RMS energy cleanly so switching cabinet types maintains consistent loudness
  const normGain = maxEnergy > 1e-6 ? 0.92 / Math.sqrt(maxEnergy) : 1;
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] *= normGain;
    }
  }

  if (cabinetIrCache.size >= 24) {
    const oldest = cabinetIrCache.keys().next().value;
    if (oldest) cabinetIrCache.delete(oldest);
  }
  cabinetIrCache.set(key, ir);
  return ir;
}

const tremoloLfoCache = new Map<string, AudioBuffer>();

/**
 * Evaluates a single smoothed periodic Tremolo waveform in [-1..+1].
 * Square & Sawtooth use smooth raised-cosine edge transitions to guarantee
 * zero clicks or zipper transients even at fast rates and full depth.
 */
function evalSmoothTremoloSample(waveform: TremoloWaveform, phase01: number): number {
  const p = ((phase01 % 1) + 1) % 1;
  switch (waveform) {
    case 'triangle':
      return p < 0.25 ? p * 4 : p < 0.75 ? 2 - p * 4 : p * 4 - 4;
    case 'square': {
      // Smooth ~4% raised-cosine transition edges -> silky punch without clicks
      const edge = 0.04;
      if (p < edge) {
        return -Math.cos((p / edge) * Math.PI);
      }
      if (p < 0.5 - edge) return 1;
      if (p < 0.5 + edge) {
        return Math.cos(((p - (0.5 - edge)) / (2 * edge)) * Math.PI);
      }
      if (p < 1 - edge) return -1;
      return -Math.cos(((p - (1 - edge)) / edge) * Math.PI);
    }
    case 'sawtooth': {
      // Smooth fall/ramp with 4.5% soft reset edge
      const edge = 0.045;
      if (p < 1 - edge) {
        return 1 - (p / (1 - edge)) * 2;
      }
      const k = (p - (1 - edge)) / edge;
      return -1 + (0.5 - 0.5 * Math.cos(k * Math.PI)) * 2;
    }
    case 'sine':
    default:
      return Math.sin(p * Math.PI * 2);
  }
}

/**
 * Builds and caches a 1-second stereo AudioBuffer for Tremolo LFO modulation.
 * Playing this buffer looped with `playbackRate = hz` locks Left & Right phase
 * offset accurately to 1 sample with zero drift.
 */
export function getTremoloLfoBuffer(
  ctx: BaseAudioContext,
  waveform: TremoloWaveform,
  stereoPhaseDeg: number
): AudioBuffer {
  const qDeg = Math.round(clamp(stereoPhaseDeg, 0, 180) / 5) * 5;
  const key = `${ctx.sampleRate}:${waveform}:${qDeg}`;
  const cached = tremoloLfoCache.get(key);
  if (cached && cached.sampleRate === ctx.sampleRate) {
    return cached;
  }

  const len = Math.max(4096, Math.round(ctx.sampleRate));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const chL = buf.getChannelData(0);
  const chR = buf.getChannelData(1);
  const phaseOffset01 = qDeg / 360;

  for (let i = 0; i < len; i++) {
    const p = i / len;
    chL[i] = evalSmoothTremoloSample(waveform, p);
    chR[i] = evalSmoothTremoloSample(waveform, p + phaseOffset01);
  }

  if (tremoloLfoCache.size >= 24) {
    const oldest = tremoloLfoCache.keys().next().value;
    if (oldest) tremoloLfoCache.delete(oldest);
  }
  tremoloLfoCache.set(key, buf);
  return buf;
}
