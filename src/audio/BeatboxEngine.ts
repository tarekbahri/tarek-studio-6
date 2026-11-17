import type { BeatboxState, DrumTrackConfig, DrumTrackId } from '../types/beatbox';
import { createDefaultBeatboxState } from './beatboxPresets';
import { midiBus } from './MidiBus';
import { holdAudioParamAt, studioAudio } from './StudioAudio';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const BB_DRIVE_QUANT = 20;
const bbDriveCache = new Map<number, Float32Array<ArrayBuffer>>();

function getDriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const q = Math.round(clamp(amount, 0, 1) * BB_DRIVE_QUANT);
  const cached = bbDriveCache.get(q);
  if (cached) return cached;

  const qAmt = q / BB_DRIVE_QUANT;
  const samples = 256;
  const buf = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buf);
  const k = 1 + qAmt * 18;
  const norm = Math.tanh(k * 0.7);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = Math.tanh(x * k * 0.7) / norm;
  }
  bbDriveCache.set(q, curve);
  return curve;
}

interface PersistentTrackStrip {
  inGain: GainNode;
  shaper: WaveShaperNode;
  panner: StereoPannerNode;
  routedViaShaper: boolean;
  lastDriveQ: number;
  lastPan: number;
  lastLevel: number;
}

export class BeatboxEngine {
  private state: BeatboxState = createDefaultBeatboxState();
  private noiseBuffer: AudioBuffer | null = null;
  private busDriveShaper: WaveShaperNode | null = null;
  private busBypassGain: GainNode | null = null;
  private busOutGain: GainNode | null = null;
  private busWiredBypass: boolean | null = null;
  private trackStrips = new Map<DrumTrackId, PersistentTrackStrip>();
  private fxBypass = false;
  private lastMasterDriveQ = -1;
  private autoDriveOverride: number | null = null;
  private padHitListener: ((trackId: DrumTrackId, velocity: number) => void) | null = null;
  private padHitTimers = new Set<number>();
  private cleanupTimers = new Set<number>();
  private activeVoices = new Set<{ gain: GainNode; endAt: number }>();
  private activeOhVoice: { gain: GainNode; endAt: number } | null = null;

  constructor() {
    studioAudio.onContextReset(() => this.resetForNewContext());
  }

  private resetForNewContext(): void {
    for (const id of this.cleanupTimers) {
      clearTimeout(id);
    }
    this.cleanupTimers.clear();
    this.panic();
    for (const strip of this.trackStrips.values()) {
      try {
        strip.inGain.disconnect();
        strip.shaper.disconnect();
        strip.panner.disconnect();
      } catch {
        // ignore
      }
    }
    this.trackStrips.clear();
    this.noiseBuffer = null;
    this.busDriveShaper = null;
    this.busBypassGain = null;
    this.busOutGain = null;
    this.busWiredBypass = null;
    this.lastMasterDriveQ = -1;
  }

  public setFxBypass(bypass: boolean): void {
    if (this.fxBypass === bypass) return;
    this.fxBypass = bypass;
    const ctx = studioAudio.getContext();
    if (ctx) {
      this.syncBusBypassRouting();
      this.syncAllTrackStrips(ctx.currentTime);
    }
  }

  public panic(): void {
    for (const id of this.padHitTimers) {
      clearTimeout(id);
    }
    this.padHitTimers.clear();

    const ctx = studioAudio.getContext();
    const now = ctx ? ctx.currentTime : 0;

    if (ctx) {
      for (const voice of this.activeVoices) {
        try {
          const g = voice.gain.gain;
          holdAudioParamAt(g, now, Math.max(0.0001, g.value));
          g.linearRampToValueAtTime(0.0001, now + 0.012);
        } catch {
          // ignore
        }
      }
      if (this.activeOhVoice) {
        try {
          const g = this.activeOhVoice.gain.gain;
          holdAudioParamAt(g, now, Math.max(0.0001, g.value));
          g.linearRampToValueAtTime(0.0001, now + 0.012);
        } catch {
          // ignore
        }
      }
    }
    this.activeVoices.clear();
    this.activeOhVoice = null;
  }

  public setAutomationDriveOverride(drive01: number | null): void {
    this.autoDriveOverride = drive01 === null ? null : clamp(drive01, 0, 1);
    const effective = this.autoDriveOverride ?? this.state.masterDrive;
    const ctx = studioAudio.getContext();
    const q = Math.round(clamp(effective, 0, 1) * BB_DRIVE_QUANT);
    if (ctx && this.busDriveShaper && q !== this.lastMasterDriveQ) {
      this.busDriveShaper.curve = getDriveCurve(effective);
      this.lastMasterDriveQ = q;
    }
  }

  public setState(next: BeatboxState): void {
    this.state = next;
    const effective = this.autoDriveOverride ?? next.masterDrive;
    const ctx = studioAudio.getContext();
    const q = Math.round(clamp(effective, 0, 1) * BB_DRIVE_QUANT);
    if (ctx && this.busDriveShaper && q !== this.lastMasterDriveQ) {
      this.busDriveShaper.curve = getDriveCurve(effective);
      this.lastMasterDriveQ = q;
    }
    if (ctx) {
      this.syncAllTrackStrips(ctx.currentTime);
    }
  }

  public setPadHitListener(
    listener: ((trackId: DrumTrackId, velocity: number) => void) | null
  ): void {
    this.padHitListener = listener;
  }

  private syncBusBypassRouting(): void {
    if (!this.busDriveShaper || !this.busBypassGain) return;
    if (this.busWiredBypass === this.fxBypass) return;
    const nextTarget = this.fxBypass ? this.busBypassGain : this.busDriveShaper;
    for (const strip of this.trackStrips.values()) {
      try {
        strip.panner.disconnect();
        strip.panner.connect(nextTarget);
      } catch {
        // ignore
      }
    }
    this.busWiredBypass = this.fxBypass;
  }

  private syncStripParams(strip: PersistentTrackStrip, track: DrumTrackConfig, when: number): void {
    const pan = clamp(track.pan, -1, 1);
    if (Math.abs(pan - strip.lastPan) > 0.005) {
      strip.panner.pan.setTargetAtTime(pan, when, 0.008);
      strip.lastPan = pan;
    }
    const level = clamp(track.level, 0, 1.2);
    if (Math.abs(level - strip.lastLevel) > 0.004) {
      strip.inGain.gain.setTargetAtTime(level, when, 0.008);
      strip.lastLevel = level;
    }
    const wantShaper = !this.fxBypass && track.drive > 0.04;
    if (wantShaper) {
      const q = Math.round(clamp(track.drive, 0, 1) * BB_DRIVE_QUANT);
      if (q !== strip.lastDriveQ) {
        strip.shaper.curve = getDriveCurve(track.drive);
        strip.lastDriveQ = q;
      }
    }
    if (wantShaper !== strip.routedViaShaper) {
      try {
        strip.inGain.disconnect();
        strip.shaper.disconnect();
      } catch {
        // ignore
      }
      if (wantShaper) {
        strip.inGain.connect(strip.shaper);
        strip.shaper.connect(strip.panner);
      } else {
        strip.inGain.connect(strip.panner);
      }
      strip.routedViaShaper = wantShaper;
    }
  }

  private syncAllTrackStrips(when: number): void {
    for (const [tid, strip] of this.trackStrips.entries()) {
      const track = this.state.tracks[tid];
      if (track) {
        this.syncStripParams(strip, track, when);
      }
    }
  }

  private getOrCreateTrackStrip(
    ctx: AudioContext,
    track: DrumTrackConfig,
    busIn: AudioNode,
    when: number
  ): PersistentTrackStrip {
    let strip = this.trackStrips.get(track.id);
    if (!strip) {
      const inGain = ctx.createGain();
      const level = clamp(track.level, 0, 1.2);
      inGain.gain.setValueAtTime(level, when);

      const shaper = ctx.createWaveShaper();
      shaper.oversample = 'none';
      const driveQ = Math.round(clamp(track.drive, 0, 1) * BB_DRIVE_QUANT);
      shaper.curve = getDriveCurve(track.drive);

      const panner = ctx.createStereoPanner();
      const pan = clamp(track.pan, -1, 1);
      panner.pan.setValueAtTime(pan, when);

      const wantShaper = !this.fxBypass && track.drive > 0.04;
      if (wantShaper) {
        inGain.connect(shaper);
        shaper.connect(panner);
      } else {
        inGain.connect(panner);
      }
      panner.connect(busIn);

      strip = {
        inGain,
        shaper,
        panner,
        routedViaShaper: wantShaper,
        lastDriveQ: driveQ,
        lastPan: pan,
        lastLevel: level,
      };
      this.trackStrips.set(track.id, strip);
    } else {
      this.syncStripParams(strip, track, when);
    }
    return strip;
  }

  private ensureGraph(ctx: AudioContext): AudioNode | null {
    if (!this.noiseBuffer) {
      const len = ctx.sampleRate; // 1s stereo/mono noise is plenty and saves memory
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }

    if (!this.busDriveShaper || !this.busBypassGain || !this.busOutGain) {
      const targetBus = studioAudio.getBeatboxBusInput();
      if (!targetBus) return null;

      this.busDriveShaper = ctx.createWaveShaper();
      this.busDriveShaper.oversample = 'none';
      this.busDriveShaper.curve = getDriveCurve(this.state.masterDrive);
      this.lastMasterDriveQ = Math.round(clamp(this.state.masterDrive, 0, 1) * BB_DRIVE_QUANT);

      this.busBypassGain = ctx.createGain();
      this.busBypassGain.gain.setValueAtTime(1, ctx.currentTime);

      this.busOutGain = ctx.createGain();
      this.busOutGain.gain.setValueAtTime(0.9, ctx.currentTime);

      this.busDriveShaper.connect(this.busOutGain);
      this.busBypassGain.connect(this.busOutGain);
      this.busOutGain.connect(targetBus);
      this.busWiredBypass = this.fxBypass;
    }

    return this.fxBypass ? this.busBypassGain : this.busDriveShaper;
  }

  public async triggerTrack(trackId: DrumTrackId, velocity = 0.9): Promise<void> {
    studioAudio.unlockSync();
    const ctx = await studioAudio.ensureAudio();
    this.scheduleTrack(trackId, velocity, ctx.currentTime);
  }

  public async triggerByMidiNote(midi: number, velocity = 0.9): Promise<boolean> {
    const entry = Object.values(this.state.tracks).find((t) => t.midiNote === midi);
    if (!entry) return false;
    await this.triggerTrack(entry.id, velocity);
    return true;
  }

  public scheduleByMidiNote(midi: number, velocity: number, when: number): void {
    const tracks = Object.values(this.state.tracks);
    const exact = tracks.find((t) => t.midiNote === midi);
    if (exact) {
      this.scheduleTrack(exact.id, velocity, when);
      return;
    }
    // Map chromatic Piano Roll MIDI notes cleanly onto the 8 drum voices
    const drumOrder: DrumTrackId[] = [
      'kick',
      'rim',
      'snare',
      'clap',
      'ch',
      'perc',
      'oh',
      'crash',
    ];
    const idx = ((Math.round(midi) % drumOrder.length) + drumOrder.length) % drumOrder.length;
    this.scheduleTrack(drumOrder[idx], velocity, when);
  }

  public scheduleTrack(trackId: DrumTrackId, velocity: number, when: number): void {
    const ctx = studioAudio.getContext();
    if (!ctx) return;

    const track = this.state.tracks[trackId];
    if (!track) return;

    // Respect Mute / Solo
    const anySolo = Object.values(this.state.tracks).some((t) => t.solo);
    if (track.muted || (anySolo && !track.solo)) return;

    const busIn = this.ensureGraph(ctx);
    if (!busIn) return;

    const t = Math.max(ctx.currentTime, when);
    const vel = clamp(velocity, 0.08, 1.0);

    // Visual hit callback (scheduled close to audio time and tracked for clean Stop/Panic cancellation)
    const delayMs = Math.max(0, (t - ctx.currentTime) * 1000);
    if (this.padHitListener) {
      const listener = this.padHitListener;
      const timerId = window.setTimeout(() => {
        this.padHitTimers.delete(timerId);
        listener(trackId, vel);
      }, delayMs);
      this.padHitTimers.add(timerId);
    }

    // Sidechain duck SERUM on Kick hits only when Beatbox channel is audible
    if (trackId === 'kick' && studioAudio.isPluginAudible('beatbox')) {
      studioAudio.triggerSidechainDuck(t, vel);
    }

    // Emit MIDI communication on Beatbox hits
    midiBus.emit({
      type: 'noteOn',
      source: 'beatbox',
      midi: track.midiNote,
      velocity: vel,
      time: t,
    });

    // Persistent per-track strip + single lightweight per-hit velocity GainNode
    const strip = this.getOrCreateTrackStrip(ctx, track, busIn, t);
    const hitVelGain = ctx.createGain();
    hitVelGain.gain.setValueAtTime(vel, t);
    hitVelGain.connect(strip.inGain);

    const decaySec = clamp(track.decay, 0.05, 1.6);
    const voiceRecord = { gain: hitVelGain, endAt: t + decaySec + 0.14 };
    this.activeVoices.add(voiceRecord);

    this.synthesizeDrumVoice(ctx, track, t, hitVelGain);

    const cleanupMs = Math.max(120, (t - ctx.currentTime + decaySec + 0.18) * 1000);
    const cleanupId = window.setTimeout(() => {
      this.cleanupTimers.delete(cleanupId);
      this.activeVoices.delete(voiceRecord);
      try {
        hitVelGain.disconnect();
      } catch {
        // ignore
      }
    }, cleanupMs);
    this.cleanupTimers.add(cleanupId);
  }

  private synthesizeDrumVoice(
    ctx: AudioContext,
    track: DrumTrackConfig,
    t: number,
    out: AudioNode
  ): void {
    const pitchMult = Math.pow(2, track.pitch / 12);
    const dec = clamp(track.decay, 0.05, 1.6);
    const tone = clamp(track.tone, 0, 1);

    switch (track.id) {
      case 'kick': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const baseHz = 46 * pitchMult;
        const punchHz = (135 + tone * 140) * pitchMult;
        osc.frequency.setValueAtTime(punchHz, t);
        osc.frequency.exponentialRampToValueAtTime(baseHz * 1.35, t + 0.032);
        osc.frequency.exponentialRampToValueAtTime(Math.max(24, baseHz), t + Math.min(0.28, dec * 0.55));

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(1.05, t + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dec);

        let bodyLp: BiquadFilterNode | null = null;
        if (tone < 0.95) {
          bodyLp = ctx.createBiquadFilter();
          bodyLp.type = 'lowpass';
          bodyLp.frequency.setValueAtTime(360 + tone * 3400, t);
          osc.connect(bodyLp);
          bodyLp.connect(gain);
        } else {
          osc.connect(gain);
        }
        gain.connect(out);
        osc.onended = () => {
          try {
            osc.disconnect();
            bodyLp?.disconnect();
            gain.disconnect();
          } catch {
            // ignore
          }
        };
        osc.start(t);
        osc.stop(t + dec + 0.04);

        // Click transient
        if (tone > 0.15 && this.noiseBuffer) {
          const clickSrc = ctx.createBufferSource();
          clickSrc.buffer = this.noiseBuffer;
          const clickFilter = ctx.createBiquadFilter();
          clickFilter.type = 'bandpass';
          clickFilter.frequency.setValueAtTime(1800 + tone * 2600, t);
          const clickGain = ctx.createGain();
          clickGain.gain.setValueAtTime(0.35 * tone, t);
          clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);
          clickSrc.connect(clickFilter);
          clickFilter.connect(clickGain);
          clickGain.connect(out);
          clickSrc.onended = () => {
            try {
              clickSrc.disconnect();
              clickFilter.disconnect();
              clickGain.disconnect();
            } catch {
              // ignore
            }
          };
          clickSrc.start(t);
          clickSrc.stop(t + 0.025);
        }
        break;
      }

      case 'snare': {
        // Punchy tonal body
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'triangle';
        const bodyHz = 175 * pitchMult;
        osc.frequency.setValueAtTime(bodyHz * 1.6, t);
        osc.frequency.exponentialRampToValueAtTime(bodyHz, t + 0.04);
        oscGain.gain.setValueAtTime(0.75, t);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.18, dec * 0.6));
        osc.connect(oscGain);
        oscGain.connect(out);
        osc.onended = () => {
          try {
            osc.disconnect();
            oscGain.disconnect();
          } catch {
            // ignore
          }
        };
        osc.start(t);
        osc.stop(t + 0.22);

        // Snare wire noise burst
        if (this.noiseBuffer) {
          const noise = ctx.createBufferSource();
          noise.buffer = this.noiseBuffer;
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.setValueAtTime(750 + tone * 1400, t);
          const nGain = ctx.createGain();
          nGain.gain.setValueAtTime(0.82, t);
          nGain.gain.exponentialRampToValueAtTime(0.0001, t + dec);
          noise.connect(hp);
          hp.connect(nGain);
          nGain.connect(out);
          noise.onended = () => {
            try {
              noise.disconnect();
              hp.disconnect();
              nGain.disconnect();
            } catch {
              // ignore
            }
          };
          noise.start(t);
          noise.stop(t + dec + 0.04);
        }
        break;
      }

      case 'clap': {
        if (this.noiseBuffer) {
          const offsets = [0, 0.011, 0.022, 0.034];
          offsets.forEach((off, idx) => {
            const noise = ctx.createBufferSource();
            noise.buffer = this.noiseBuffer!;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime((1150 + tone * 1400) * pitchMult, t + off);
            bp.Q.setValueAtTime(1.4, t + off);

            const g = ctx.createGain();
            const isTail = idx === offsets.length - 1;
            const dur = isTail ? dec : 0.024;
            g.gain.setValueAtTime(isTail ? 0.72 : 0.55, t + off);
            g.gain.exponentialRampToValueAtTime(0.0001, t + off + dur);

            noise.connect(bp);
            bp.connect(g);
            g.connect(out);
            noise.onended = () => {
              try {
                noise.disconnect();
                bp.disconnect();
                g.disconnect();
              } catch {
                // ignore
              }
            };
            noise.start(t + off);
            noise.stop(t + off + dur + 0.03);
          });
        }
        break;
      }

      case 'ch':
      case 'oh': {
        const isOpen = track.id === 'oh';
        const ratios = [1, 1.34, 1.67, 2.02, 2.54, 3.12];
        const base = (isOpen ? 310 : 370) * pitchMult;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(5200 + tone * 3800, t);

        const hatGain = ctx.createGain();
        const hatDecay = isOpen ? dec : Math.min(0.24, dec);
        hatGain.gain.setValueAtTime(0.45, t);
        hatGain.gain.exponentialRampToValueAtTime(0.0001, t + hatDecay);

        // Classic drum machine choke: closed hat chokes sounding open hat cleanly
        if (!isOpen && this.activeOhVoice && t < this.activeOhVoice.endAt) {
          try {
            const g = this.activeOhVoice.gain.gain;
            holdAudioParamAt(g, t, Math.max(0.0001, g.value));
            g.setTargetAtTime(0.0001, t, 0.008);
          } catch {
            // ignore
          }
          this.activeOhVoice = null;
        }
        if (isOpen) {
          this.activeOhVoice = { gain: hatGain, endAt: t + hatDecay };
        }

        for (const r of ratios) {
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.setValueAtTime(base * r, t);
          osc.connect(hp);
          osc.onended = () => {
            try {
              osc.disconnect();
            } catch {
              // ignore
            }
          };
          osc.start(t);
          osc.stop(t + hatDecay + 0.03);
        }

        if (this.noiseBuffer) {
          const n = ctx.createBufferSource();
          n.buffer = this.noiseBuffer;
          const nG = ctx.createGain();
          nG.gain.setValueAtTime(0.35, t);
          n.connect(nG);
          nG.connect(hp);
          n.onended = () => {
            try {
              n.disconnect();
              nG.disconnect();
              hp.disconnect();
              hatGain.disconnect();
            } catch {
              // ignore
            }
          };
          n.start(t);
          n.stop(t + hatDecay + 0.03);
        }

        hp.connect(hatGain);
        hatGain.connect(out);
        break;
      }

      case 'perc': {
        const car = ctx.createOscillator();
        const mod = ctx.createOscillator();
        const modGain = ctx.createGain();
        const env = ctx.createGain();

        const baseHz = 320 * pitchMult;
        car.type = 'triangle';
        car.frequency.setValueAtTime(baseHz * 1.45, t);
        car.frequency.exponentialRampToValueAtTime(baseHz, t + 0.05);

        mod.type = 'sine';
        mod.frequency.setValueAtTime(baseHz * (1.4 + tone * 1.8), t);
        modGain.gain.setValueAtTime(220 * tone + 80, t);
        modGain.gain.exponentialRampToValueAtTime(10, t + dec * 0.6);

        env.gain.setValueAtTime(0.7, t);
        env.gain.exponentialRampToValueAtTime(0.0001, t + dec);

        mod.connect(modGain);
        modGain.connect(car.frequency);
        car.connect(env);
        env.connect(out);

        car.onended = () => {
          try {
            car.disconnect();
            mod.disconnect();
            modGain.disconnect();
            env.disconnect();
          } catch {
            // ignore
          }
        };
        mod.start(t);
        car.start(t);
        mod.stop(t + dec + 0.03);
        car.stop(t + dec + 0.03);
        break;
      }

      case 'rim': {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const bp = ctx.createBiquadFilter();
        const env = ctx.createGain();

        osc1.type = 'triangle';
        osc2.type = 'square';
        osc1.frequency.setValueAtTime(480 * pitchMult, t);
        osc2.frequency.setValueAtTime(1680 * pitchMult, t);

        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1250 + tone * 1800, t);
        bp.Q.setValueAtTime(2.2, t);

        env.gain.setValueAtTime(0.75, t);
        env.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.22, dec));

        osc1.connect(bp);
        osc2.connect(bp);
        bp.connect(env);
        env.connect(out);

        osc2.onended = () => {
          try {
            osc1.disconnect();
            osc2.disconnect();
            bp.disconnect();
            env.disconnect();
          } catch {
            // ignore
          }
        };
        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 0.25);
        osc2.stop(t + 0.25);
        break;
      }

      case 'crash': {
        if (this.noiseBuffer) {
          const n = ctx.createBufferSource();
          n.buffer = this.noiseBuffer;
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.setValueAtTime(3400 + tone * 3000, t);
          const env = ctx.createGain();
          env.gain.setValueAtTime(0.6, t);
          env.gain.exponentialRampToValueAtTime(0.0001, t + dec);

          n.connect(hp);
          hp.connect(env);
          env.connect(out);
          n.onended = () => {
            try {
              n.disconnect();
              hp.disconnect();
              env.disconnect();
            } catch {
              // ignore
            }
          };
          n.start(t);
          n.stop(t + dec + 0.04);
        }
        break;
      }
    }
  }
}

export const beatboxEngine = new BeatboxEngine();
