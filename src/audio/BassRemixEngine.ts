import type {
  BassRemixAudioMeta,
  BassRemixMicPermission,
  BassRemixPatch,
  BassRemixSavedRecordingMeta,
} from '../types/bassRemix';
import {
  computeAutomationCycleNorm,
  computeEffectiveWorkletParams,
  encodeStereoMp3BlobChunked,
  encodeStereoWavBlob,
  renderBassRemixSelectionChunked,
} from './BassRemixDspCore';
import { createBasePatch } from './bassRemixPresets';
import {
  clearActiveBassRemixSource,
  deleteLocalRecording,
  getLocalRecordingWavBlob,
  listLocalRecordings,
  loadActiveBassRemixSource,
  loadLocalRecordingBuffer,
  saveActiveBassRemixBuffer,
  saveActiveBassRemixSource,
  saveLocalRecording,
} from './bassRemixStorage';
import {
  clearLiveRecPeaks,
  pushLiveRecPeak,
  setBassRemixTelemetry,
} from './bassRemixTelemetryStore';
import { studioAudio } from './StudioAudio';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export interface WaveformMipmap {
  bucketCount: number;
  mins: Float32Array;
  maxs: Float32Array;
}

function buildWaveformMipmap(buffer: AudioBuffer, bucketCount = 2048): WaveformMipmap {
  const len = buffer.length;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const actualBuckets = Math.min(bucketCount, Math.max(64, len));
  const mins = new Float32Array(actualBuckets);
  const maxs = new Float32Array(actualBuckets);

  const samplesPerBucket = len / actualBuckets;
  for (let b = 0; b < actualBuckets; b++) {
    const s0 = Math.floor(b * samplesPerBucket);
    const s1 = Math.min(len, Math.max(s0 + 1, Math.floor((b + 1) * samplesPerBucket)));
    // Stride if huge file (>1M samples) so mipmap build stays <5ms
    const stride = Math.max(1, Math.floor((s1 - s0) / 128));
    let mn = 1;
    let mx = -1;
    for (let i = s0; i < s1; i += stride) {
      const v = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    mins[b] = mn;
    maxs[b] = mx;
  }

  return { bucketCount: actualBuckets, mins, maxs };
}

class BassRemixEngineClass {
  private ctx: AudioContext | null = null;
  private busReady = false;
  private workletLoaded = false;
  private workletLoading: Promise<void> | null = null;

  private inputGain: GainNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private fallbackDryGain: GainNode | null = null;
  private fallbackWetGain: GainNode | null = null;
  private fallbackFilter: BiquadFilterNode | null = null;
  private fallbackDrive: WaveShaperNode | null = null;
  private fallbackLfo: OscillatorNode | null = null;
  private fallbackLfoGain: GainNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;

  private originalBuffer: AudioBuffer | null = null;
  private mipmap: WaveformMipmap | null = null;
  private audioMeta: BassRemixAudioMeta | null = null;
  private bufferListeners = new Set<() => void>();

  // Patch & playback state
  private patch: BassRemixPatch = createBasePatch();
  private bpm = 124;
  private abMode: 'processed' | 'original' = 'processed';
  private loopPlayback = true;
  private selStartNorm = 0;
  private selEndNorm = 1;

  // Active playback transport
  private activeSource: AudioBufferSourceNode | null = null;
  private activeSrcGain: GainNode | null = null;
  private isPlaying = false;
  private playAnchorCtxTime = 0;
  private playStartOffsetSec = 0;
  private playEndOffsetSec = 0;
  private rafId: number | null = null;
  private lastParamSendTs = 0;

  // Mic Recording state
  private recState: 'idle' | 'recording' | 'paused' = 'idle';
  private recStream: MediaStream | null = null;
  private recSource: MediaStreamAudioSourceNode | null = null;
  private recAnalyser: AnalyserNode | null = null;
  private recWorklet: AudioWorkletNode | null = null;
  private recScriptNode: ScriptProcessorNode | null = null;
  private recMuteGain: GainNode | null = null;
  private recChunksL: Float32Array[] = [];
  private recChunksR: Float32Array[] = [];
  private recTotalSamples = 0;
  private recSampleRate = 48000;
  private micPermission: BassRemixMicPermission = 'unknown';
  private micDeviceLabel = '';
  private permListenerAttached = false;

  constructor() {
    studioAudio.onContextReset(() => {
      this.teardownAudioGraph();
    });
  }

  private teardownAudioGraph(): void {
    this.stop();
    try {
      this.fallbackLfo?.stop();
    } catch {
      // ignore
    }
    try {
      this.workletNode?.port.close();
      this.workletNode?.disconnect();
      this.inputGain?.disconnect();
      this.outputAnalyser?.disconnect();
      this.fallbackDryGain?.disconnect();
      this.fallbackWetGain?.disconnect();
      this.fallbackFilter?.disconnect();
      this.fallbackDrive?.disconnect();
      this.fallbackLfo?.disconnect();
      this.fallbackLfoGain?.disconnect();
    } catch {
      // ignore
    }
    this.ctx = null;
    this.busReady = false;
    this.workletLoaded = false;
    this.workletLoading = null;
    this.inputGain = null;
    this.workletNode = null;
    this.fallbackDryGain = null;
    this.fallbackWetGain = null;
    this.fallbackFilter = null;
    this.fallbackDrive = null;
    this.fallbackLfo = null;
    this.fallbackLfoGain = null;
    this.outputAnalyser = null;
  }

  public async ensureAudio(): Promise<AudioContext> {
    const ctx = await studioAudio.ensureAudio();
    if (this.ctx !== ctx) {
      this.teardownAudioGraph();
      this.ctx = ctx;
    }

    if (!this.busReady) {
      this.buildGraph(ctx);
    }

    if (!this.workletLoaded && !this.workletLoading) {
      this.workletLoading = this.loadWorklet(ctx);
    }
    if (this.workletLoading) {
      await this.workletLoading;
    }
    return ctx;
  }

  private buildGraph(ctx: AudioContext): void {
    const busInput = studioAudio.getBassRemixBusInput();
    if (!busInput) return;

    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = 1.0;

    this.outputAnalyser = ctx.createAnalyser();
    this.outputAnalyser.fftSize = 1024;
    this.outputAnalyser.smoothingTimeConstant = 0.78;
    this.outputAnalyser.connect(busInput);

    // Fallback native Web Audio graph (active until AudioWorklet attaches)
    this.fallbackDryGain = ctx.createGain();
    this.fallbackWetGain = ctx.createGain();
    this.fallbackFilter = ctx.createBiquadFilter();
    this.fallbackFilter.type = 'lowpass';
    this.fallbackFilter.frequency.value = 420;
    this.fallbackFilter.Q.value = 3.2;

    this.fallbackDrive = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 255 - 1;
      curve[i] = Math.tanh(x * 2.5);
    }
    this.fallbackDrive.curve = curve;

    this.fallbackLfo = ctx.createOscillator();
    this.fallbackLfoGain = ctx.createGain();
    this.fallbackLfoGain.gain.value = 600;
    this.fallbackLfo.connect(this.fallbackLfoGain);
    this.fallbackLfoGain.connect(this.fallbackFilter.frequency);
    this.fallbackLfo.start();

    this.inputGain.connect(this.fallbackDryGain);
    this.fallbackDryGain.connect(this.outputAnalyser);

    this.inputGain.connect(this.fallbackDrive);
    this.fallbackDrive.connect(this.fallbackFilter);
    this.fallbackFilter.connect(this.fallbackWetGain);
    this.fallbackWetGain.connect(this.outputAnalyser);

    this.busReady = true;
    this.syncParamsToGraph(null);
  }

  private async loadWorklet(ctx: AudioContext): Promise<void> {
    if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') {
      return;
    }
    try {
      await ctx.audioWorklet.addModule('/worklets/tarek-bass-remix-processor.js');
      if (this.ctx !== ctx || !this.inputGain || !this.outputAnalyser) return;

      const node = new AudioWorkletNode(ctx, 'tarek-bass-remix-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });

      node.port.onmessage = (e: MessageEvent<{
        type?: string;
        lowGr?: number;
        midGr?: number;
        highGr?: number;
        peakIn?: number;
        peakOutL?: number;
        peakOutR?: number;
      }>) => {
        const d = e.data;
        if (!d || d.type !== 'telemetry') return;
        setBassRemixTelemetry({
          lowGr: d.lowGr ?? 1,
          midGr: d.midGr ?? 1,
          highGr: d.highGr ?? 1,
          peakIn: d.peakIn ?? 0,
          peakOutL: d.peakOutL ?? 0,
          peakOutR: d.peakOutR ?? 0,
        });
      };

      node.onprocessorerror = () => {
        // Safely fall back to native Web Audio nodes
        try {
          node.disconnect();
        } catch {
          // ignore
        }
        this.workletNode = null;
        this.syncParamsToGraph(null);
      };

      // Disconnect fallback path from inputGain and splice worklet in cleanly
      try {
        if (this.fallbackDryGain) this.inputGain.disconnect(this.fallbackDryGain);
        if (this.fallbackDrive) this.inputGain.disconnect(this.fallbackDrive);
      } catch {
        // ignore
      }

      this.inputGain.connect(node);
      node.connect(this.outputAnalyser);
      this.workletNode = node;
      this.workletLoaded = true;
      this.syncParamsToGraph(null);
    } catch {
      // Fallback graph stays active
    } finally {
      this.workletLoading = null;
    }
  }

  public getAnalyser(): AnalyserNode | null {
    if (this.recState !== 'idle' && this.recAnalyser) {
      return this.recAnalyser;
    }
    return this.outputAnalyser;
  }

  public subscribeBuffer(cb: () => void): () => void {
    this.bufferListeners.add(cb);
    return () => {
      this.bufferListeners.delete(cb);
    };
  }

  private emitBufferChange(): void {
    for (const cb of this.bufferListeners) {
      cb();
    }
  }

  public getOriginalBuffer(): AudioBuffer | null {
    return this.originalBuffer;
  }

  public getWaveformMipmap(): WaveformMipmap | null {
    return this.mipmap;
  }

  public getAudioMeta(): BassRemixAudioMeta | null {
    return this.audioMeta;
  }

  public setPatch(patch: BassRemixPatch): void {
    this.patch = patch;
    this.syncParamsToGraph(this.getCurrentAutoNormTime());
  }

  public setBpm(bpm: number): void {
    this.bpm = clamp(bpm, 40, 240);
    this.syncParamsToGraph(this.getCurrentAutoNormTime());
  }

  public setAbMode(mode: 'processed' | 'original'): void {
    this.abMode = mode;
    this.syncParamsToGraph(this.getCurrentAutoNormTime());
  }

  public setSelectionAndLoop(
    selStartNorm: number,
    selEndNorm: number,
    loop: boolean
  ): void {
    this.selStartNorm = clamp(selStartNorm, 0, 0.98);
    this.selEndNorm = clamp(selEndNorm, this.selStartNorm + 0.01, 1);
    const loopChanged = this.loopPlayback !== loop;
    this.loopPlayback = loop;
    if (this.activeSource && this.originalBuffer) {
      const dur = this.originalBuffer.duration;
      const startSec = this.selStartNorm * dur;
      const endSec = Math.max(startSec + 0.03, this.selEndNorm * dur);
      this.activeSource.loop = loop;
      this.activeSource.loopStart = startSec;
      this.activeSource.loopEnd = endSec;
      this.playStartOffsetSec = startSec;
      this.playEndOffsetSec = endSec;
      if (loopChanged && !loop) {
        // Keep playing cleanly until end
      }
    }
  }

  private getCurrentAutoNormTime(): number | null {
    if (!this.isPlaying || !this.originalBuffer || !this.ctx) return null;
    const selDur = Math.max(0.03, this.playEndOffsetSec - this.playStartOffsetSec);
    const elapsed = Math.max(0, this.ctx.currentTime - this.playAnchorCtxTime);
    return computeAutomationCycleNorm(elapsed, selDur, this.bpm, this.patch);
  }

  private syncParamsToGraph(autoNormTime: number | null): void {
    const p = computeEffectiveWorkletParams(
      this.patch,
      this.bpm,
      this.abMode,
      autoNormTime
    );

    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'params', params: p });
      return;
    }

    // Fallback native node updates
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.fallbackDryGain && this.fallbackWetGain) {
      const wet = p.abWet * p.effectMix;
      this.fallbackDryGain.gain.setTargetAtTime(1 - wet, now, 0.015);
      this.fallbackWetGain.gain.setTargetAtTime(wet * p.volLevel, now, 0.015);
    }
    if (this.fallbackFilter) {
      this.fallbackFilter.frequency.setTargetAtTime(p.wobCutoffHz, now, 0.015);
      this.fallbackFilter.Q.setTargetAtTime(clamp(p.wobRes, 0.5, 16), now, 0.015);
    }
    if (this.fallbackLfo && this.fallbackLfoGain) {
      this.fallbackLfo.frequency.setTargetAtTime(p.wobRateHz, now, 0.015);
      this.fallbackLfoGain.gain.setTargetAtTime(
        p.wobEnabled >= 0.5 ? p.wobDepth * p.wobCutoffHz * 1.4 : 0,
        now,
        0.015
      );
    }
  }

  public async play(fromNorm?: number): Promise<void> {
    if (!this.originalBuffer) return;
    const ctx = await this.ensureAudio();

    this.stopSourceOnly();

    const dur = this.originalBuffer.duration;
    const startSec = clamp(this.selStartNorm, 0, 0.98) * dur;
    const endSec = Math.max(startSec + 0.03, clamp(this.selEndNorm, 0.01, 1) * dur);
    const offsetSec =
      typeof fromNorm === 'number'
        ? clamp(fromNorm * dur, startSec, Math.max(startSec, endSec - 0.02))
        : startSec;

    const src = ctx.createBufferSource();
    src.buffer = this.originalBuffer;
    src.loop = this.loopPlayback;
    src.loopStart = startSec;
    src.loopEnd = endSec;

    const srcGain = ctx.createGain();
    const now = ctx.currentTime;
    srcGain.gain.setValueAtTime(0.0001, now);
    srcGain.gain.linearRampToValueAtTime(1.0, now + 0.006); // 6ms anti-click fade in

    src.connect(srcGain);
    if (this.inputGain) {
      srcGain.connect(this.inputGain);
    }

    this.workletNode?.port.postMessage({ type: 'resetPhases' });

    if (this.loopPlayback) {
      src.start(now, offsetSec);
    } else {
      src.start(now, offsetSec, Math.max(0.02, endSec - offsetSec));
    }

    src.onended = () => {
      if (this.activeSource === src) {
        this.stop();
      }
    };

    this.activeSource = src;
    this.activeSrcGain = srcGain;
    this.isPlaying = true;
    this.playAnchorCtxTime = now - (offsetSec - startSec);
    this.playStartOffsetSec = startSec;
    this.playEndOffsetSec = endSec;

    setBassRemixTelemetry({
      isPlaying: true,
      playheadSec: offsetSec,
      playheadNorm: offsetSec / Math.max(0.001, dur),
      selProgressNorm: (offsetSec - startSec) / Math.max(0.001, endSec - startSec),
    });

    this.startPlayheadLoop();
  }

  private stopSourceOnly(): void {
    if (this.activeSource && this.ctx && this.activeSrcGain) {
      const src = this.activeSource;
      const g = this.activeSrcGain;
      const now = this.ctx.currentTime;
      try {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value || 1), now);
        g.gain.linearRampToValueAtTime(0.0001, now + 0.008);
        src.stop(now + 0.01);
      } catch {
        try {
          src.stop();
        } catch {
          // ignore
        }
      }
    }
    this.activeSource = null;
    this.activeSrcGain = null;
  }

  public stop(): void {
    this.stopSourceOnly();
    this.isPlaying = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    const dur = this.originalBuffer?.duration ?? 0;
    const startSec = this.selStartNorm * dur;
    setBassRemixTelemetry({
      isPlaying: false,
      playheadSec: startSec,
      playheadNorm: this.selStartNorm,
      selProgressNorm: 0,
      lowGr: 1,
      midGr: 1,
      highGr: 1,
    });
  }

  public panic(): void {
    this.stop();
  }

  private startPlayheadLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    const tick = (ts: number) => {
      if (!this.isPlaying || !this.ctx || !this.originalBuffer) {
        this.rafId = null;
        return;
      }

      const dur = Math.max(0.001, this.originalBuffer.duration);
      const startSec = this.playStartOffsetSec;
      const endSec = Math.max(startSec + 0.02, this.playEndOffsetSec);
      const selDur = endSec - startSec;
      const elapsed = Math.max(0, this.ctx.currentTime - this.playAnchorCtxTime);

      let posInSel = elapsed;
      if (this.loopPlayback) {
        posInSel = elapsed % selDur;
      } else if (elapsed >= selDur) {
        this.stop();
        return;
      }

      const playheadSec = startSec + posInSel;
      const playheadNorm = clamp(playheadSec / dur, 0, 1);
      const selProgressNorm = clamp(posInSel / selDur, 0, 1);

      setBassRemixTelemetry({
        isPlaying: true,
        playheadSec,
        playheadNorm,
        selProgressNorm,
      });

      // Evaluate automation lanes smoothly at ~60Hz
      if (ts - this.lastParamSendTs >= 15) {
        this.lastParamSendTs = ts;
        const autoNorm = computeAutomationCycleNorm(elapsed, selDur, this.bpm, this.patch);
        this.syncParamsToGraph(autoNorm);
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  public async importAudioFile(file: File): Promise<BassRemixAudioMeta> {
    const ctx = await this.ensureAudio();
    this.stop();

    const arrayBuf = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));

    this.originalBuffer = decoded;
    this.mipmap = buildWaveformMipmap(decoded);
    this.audioMeta = {
      sourceType: 'imported',
      fileName: file.name,
      durationSec: decoded.duration,
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
    };
    setBassRemixTelemetry({
      isPlaying: false,
      playheadSec: 0,
      playheadNorm: 0,
      selProgressNorm: 0,
    });
    this.emitBufferChange();
    void saveActiveBassRemixSource(this.audioMeta, arrayBuf);
    return this.audioMeta;
  }

  public async restoreLastAudioIfEmpty(): Promise<BassRemixAudioMeta | null> {
    if (this.originalBuffer) return this.audioMeta;
    try {
      const ctx = await this.ensureAudio();
      if (this.originalBuffer) return this.audioMeta;
      const restored = await loadActiveBassRemixSource(ctx);
      if (!restored || this.originalBuffer) return null;
      this.originalBuffer = restored.buffer;
      this.mipmap = buildWaveformMipmap(restored.buffer);
      this.audioMeta = restored.meta;
      setBassRemixTelemetry({
        isPlaying: false,
        playheadSec: 0,
        playheadNorm: 0,
        selProgressNorm: 0,
      });
      this.emitBufferChange();
      return this.audioMeta;
    } catch {
      return null;
    }
  }

  public clearAudio(): void {
    this.stop();
    this.originalBuffer = null;
    this.mipmap = null;
    this.audioMeta = null;
    setBassRemixTelemetry({
      isPlaying: false,
      playheadSec: 0,
      playheadNorm: 0,
      selProgressNorm: 0,
    });
    this.emitBufferChange();
    void clearActiveBassRemixSource();
  }

  // MICROPHONE PERMISSION & REAL ANDROID CAPTURE
  private mapMicError(err: unknown): { status: BassRemixMicPermission; message: string } {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      return {
        status: 'insecure',
        message: 'Microphone recording requires a secure HTTPS connection.',
      };
    }
    const name = err instanceof Error ? err.name : '';
    const msg = err instanceof Error ? err.message : '';

    if (
      name === 'NotAllowedError' ||
      name === 'PermissionDeniedError' ||
      /denied|permission/i.test(msg)
    ) {
      return {
        status: 'denied',
        message:
          'Microphone permission was denied. Tap the browser Lock/Settings icon, allow Microphone access for this HTTPS site, and try again.',
      };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        status: 'unavailable',
        message: 'No microphone hardware was found on this device.',
      };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        status: 'unavailable',
        message:
          'Microphone is busy or blocked by another app. Close other audio apps and retry.',
      };
    }
    if (name === 'SecurityError') {
      return {
        status: 'insecure',
        message: 'Microphone access was blocked by browser security policy.',
      };
    }
    return {
      status: 'unavailable',
      message: msg || 'Unable to access the device microphone.',
    };
  }

  public async checkMicPermission(): Promise<BassRemixMicPermission> {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      this.micPermission = 'insecure';
      setBassRemixTelemetry({ micPermission: 'insecure' });
      return 'insecure';
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      this.micPermission = 'unavailable';
      setBassRemixTelemetry({ micPermission: 'unavailable' });
      return 'unavailable';
    }

    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      try {
        const perm = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        });
        const mapped: BassRemixMicPermission =
          perm.state === 'granted'
            ? 'granted'
            : perm.state === 'denied'
            ? 'denied'
            : 'prompt';
        this.micPermission = mapped;
        setBassRemixTelemetry({ micPermission: mapped });
        if (!this.permListenerAttached) {
          this.permListenerAttached = true;
          perm.onchange = () => {
            const nextState: BassRemixMicPermission =
              perm.state === 'granted'
                ? 'granted'
                : perm.state === 'denied'
                ? 'denied'
                : 'prompt';
            this.micPermission = nextState;
            setBassRemixTelemetry({ micPermission: nextState });
          };
        }
        return mapped;
      } catch {
        // Android WebViews/Safari may throw on permissions.query('microphone')
      }
    }

    if (this.micPermission === 'unknown') {
      this.micPermission = 'prompt';
      setBassRemixTelemetry({ micPermission: 'prompt' });
    }
    return this.micPermission;
  }

  private async openMicrophoneStream(): Promise<MediaStream> {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      throw Object.assign(new Error('HTTPS is required for microphone access.'), {
        name: 'SecurityError',
      });
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      throw Object.assign(
        new Error('Microphone API (getUserMedia) is unavailable in this browser.'),
        { name: 'NotFoundError' }
      );
    }

    let stream: MediaStream;
    try {
      // Request raw unprocessed instrument/bass/voice audio first on Android/desktop
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
    } catch (firstErr) {
      // If user explicitly denied permission, do not re-prompt twice
      const firstName = firstErr instanceof Error ? firstErr.name : '';
      if (firstName === 'NotAllowedError' || firstName === 'PermissionDeniedError') {
        throw firstErr;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            autoGainControl: false,
          },
          video: false,
        });
      } catch (secondErr) {
        const secondName = secondErr instanceof Error ? secondErr.name : '';
        if (secondName === 'NotAllowedError' || secondName === 'PermissionDeniedError') {
          throw secondErr;
        }
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
    }

    const tracks = stream.getAudioTracks();
    if (!tracks.length || tracks[0].readyState !== 'live') {
      for (const t of stream.getTracks()) t.stop();
      throw Object.assign(new Error('No live audio input track from microphone.'), {
        name: 'NotFoundError',
      });
    }

    this.micPermission = 'granted';
    this.micDeviceLabel = tracks[0].label || 'Phone Microphone';
    setBassRemixTelemetry({
      micPermission: 'granted',
      micDeviceLabel: this.micDeviceLabel,
    });
    return stream;
  }

  public async requestMicPermission(): Promise<{
    status: BassRemixMicPermission;
    deviceLabel: string;
  }> {
    try {
      const stream = await this.openMicrophoneStream();
      const label = stream.getAudioTracks()[0]?.label || 'Device Microphone';
      for (const t of stream.getTracks()) {
        t.stop();
      }
      return { status: 'granted', deviceLabel: label };
    } catch (err) {
      const mapped = this.mapMicError(err);
      this.micPermission = mapped.status;
      setBassRemixTelemetry({ micPermission: mapped.status });
      throw new Error(mapped.message);
    }
  }

  public async startRecording(): Promise<void> {
    if (this.recState !== 'idle') return;
    this.stop();

    let stream: MediaStream;
    try {
      stream = await this.openMicrophoneStream();
    } catch (err) {
      const mapped = this.mapMicError(err);
      this.micPermission = mapped.status;
      setBassRemixTelemetry({ micPermission: mapped.status });
      throw new Error(mapped.message);
    }

    let ctx: AudioContext;
    try {
      ctx = await this.ensureAudio();
      // Android Chrome may suspend AudioContext while permission dialog was visible
      if (ctx.state !== 'running') {
        await ctx.resume();
      }
    } catch (err) {
      for (const t of stream.getTracks()) t.stop();
      throw err;
    }

    clearLiveRecPeaks();
    this.recStream = stream;
    this.recChunksL = [];
    this.recChunksR = [];
    this.recTotalSamples = 0;
    this.recSampleRate = ctx.sampleRate;

    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;
    // Connect src -> analyser (NO destination connection to prevent mic speaker feedback!)
    src.connect(analyser);

    const muteGain = ctx.createGain();
    muteGain.gain.value = 0;
    muteGain.connect(ctx.destination);

    this.recSource = src;
    this.recAnalyser = analyser;
    this.recMuteGain = muteGain;

    // Handle unexpected OS track end (phone call / mic revoked on Android)
    const primaryTrack = stream.getAudioTracks()[0];
    if (primaryTrack) {
      primaryTrack.onended = () => {
        if (this.recState !== 'idle') {
          this.stopRecording();
        }
      };
    }

    if (this.workletLoaded && typeof AudioWorkletNode !== 'undefined') {
      try {
        const recNode = new AudioWorkletNode(ctx, 'tarek-mic-recorder-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        recNode.port.onmessage = (e: MessageEvent<{
          type?: string;
          ch0?: Float32Array;
          ch1?: Float32Array;
          isMono?: boolean;
          peak?: number;
          min?: number;
          max?: number;
        }>) => {
          if (this.recState !== 'recording' || !e.data || e.data.type !== 'chunk') return;
          const { ch0, ch1, isMono, peak, min, max } = e.data;
          if (!ch0 || ch0.length === 0) return;
          const right = !isMono && ch1 ? ch1 : ch0;
          this.recChunksL.push(ch0);
          this.recChunksR.push(right);
          this.recTotalSamples += ch0.length;

          const p = peak ?? 0;
          pushLiveRecPeak(min ?? -p, max ?? p);
          setBassRemixTelemetry({
            recState: 'recording',
            recDurationSec: this.recTotalSamples / this.recSampleRate,
            recInputLevel: p,
          });
        };
        src.connect(recNode);
        recNode.connect(muteGain);
        recNode.port.postMessage({ active: true });
        this.recWorklet = recNode;
        this.recState = 'recording';
        setBassRemixTelemetry({ recState: 'recording', recDurationSec: 0, recInputLevel: 0 });
        return;
      } catch {
        // Fall through to ScriptProcessorNode fallback
      }
    }

    // Fallback for restricted Android WebViews
    const proc = ctx.createScriptProcessor(2048, 2, 2);
    proc.onaudioprocess = (ev) => {
      if (this.recState !== 'recording') return;
      const in0 = ev.inputBuffer.getChannelData(0);
      const hasSecond = ev.inputBuffer.numberOfChannels > 1;
      const in1 = hasSecond ? ev.inputBuffer.getChannelData(1) : in0;
      const c0 = new Float32Array(in0.length);
      c0.set(in0);
      const c1 = hasSecond && in1 !== in0 ? new Float32Array(in1) : c0;

      let peak = 0;
      let mn = 1;
      let mx = -1;
      for (let i = 0; i < c0.length; i++) {
        const v = c0[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
        const a = Math.abs(v);
        if (a > peak) peak = a;
      }
      this.recChunksL.push(c0);
      this.recChunksR.push(c1);
      this.recTotalSamples += c0.length;
      pushLiveRecPeak(mn, mx);
      setBassRemixTelemetry({
        recState: 'recording',
        recDurationSec: this.recTotalSamples / this.recSampleRate,
        recInputLevel: peak,
      });
    };
    src.connect(proc);
    proc.connect(muteGain);
    this.recScriptNode = proc;
    this.recState = 'recording';
    setBassRemixTelemetry({ recState: 'recording', recDurationSec: 0, recInputLevel: 0 });
  }

  public pauseRecording(): void {
    if (this.recState !== 'recording') return;
    this.recState = 'paused';
    this.recWorklet?.port.postMessage({ active: false });
    setBassRemixTelemetry({ recState: 'paused', recInputLevel: 0 });
  }

  public resumeRecording(): void {
    if (this.recState !== 'paused') return;
    if (this.ctx && this.ctx.state !== 'running') {
      void this.ctx.resume();
    }
    this.recState = 'recording';
    this.recWorklet?.port.postMessage({ active: true });
    setBassRemixTelemetry({ recState: 'recording' });
  }

  private cleanupRecorderNodes(): void {
    try {
      this.recWorklet?.port.postMessage({ active: false });
      this.recWorklet?.disconnect();
      this.recScriptNode?.disconnect();
      this.recAnalyser?.disconnect();
      this.recSource?.disconnect();
      this.recMuteGain?.disconnect();
    } catch {
      // ignore
    }
    if (this.recStream) {
      for (const t of this.recStream.getTracks()) {
        t.onended = null;
        t.stop();
      }
    }
    this.recWorklet = null;
    this.recScriptNode = null;
    this.recAnalyser = null;
    this.recSource = null;
    this.recMuteGain = null;
    this.recStream = null;
  }

  public stopRecording(): BassRemixAudioMeta | null {
    if (this.recState === 'idle') return null;
    this.recState = 'idle';
    this.cleanupRecorderNodes();

    const total = this.recTotalSamples;
    const chunksL = this.recChunksL;
    const chunksR = this.recChunksR;
    this.recChunksL = [];
    this.recChunksR = [];
    this.recTotalSamples = 0;

    setBassRemixTelemetry({ recState: 'idle', recDurationSec: 0, recInputLevel: 0 });

    if (total < 128 || !this.ctx) {
      clearLiveRecPeaks();
      return null;
    }

    const buf = this.ctx.createBuffer(2, total, this.recSampleRate);
    const outL = buf.getChannelData(0);
    const outR = buf.getChannelData(1);

    let offset = 0;
    for (let i = 0; i < chunksL.length; i++) {
      outL.set(chunksL[i], offset);
      outR.set(chunksR[i], offset);
      offset += chunksL[i].length;
    }

    // 4ms fade at start/end to prevent mic pop
    const fadeLen = Math.min(Math.floor(this.recSampleRate * 0.004), Math.floor(total / 4));
    for (let i = 0; i < fadeLen; i++) {
      const g = i / Math.max(1, fadeLen);
      outL[i] *= g;
      outR[i] *= g;
      outL[total - 1 - i] *= g;
      outR[total - 1 - i] *= g;
    }

    clearLiveRecPeaks();
    this.originalBuffer = buf;
    this.mipmap = buildWaveformMipmap(buf);
    const now = new Date();
    const stamp = `${String(now.getHours()).padStart(2, '0')}${String(
      now.getMinutes()
    ).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    this.audioMeta = {
      sourceType: 'recorded',
      fileName: `Mic Recording ${stamp}.wav`,
      durationSec: buf.duration,
      sampleRate: buf.sampleRate,
      channels: 2,
    };
    setBassRemixTelemetry({
      isPlaying: false,
      playheadSec: 0,
      playheadNorm: 0,
      selProgressNorm: 0,
    });
    this.emitBufferChange();
    void saveActiveBassRemixBuffer(this.audioMeta, buf);
    return this.audioMeta;
  }

  public cancelRecording(): void {
    this.recState = 'idle';
    this.cleanupRecorderNodes();
    this.recChunksL = [];
    this.recChunksR = [];
    this.recTotalSamples = 0;
    clearLiveRecPeaks();
    setBassRemixTelemetry({ recState: 'idle', recDurationSec: 0, recInputLevel: 0 });
  }

  // LOCAL RECORDINGS LIBRARY (IndexedDB)
  public async saveCurrentBufferLocally(customName?: string): Promise<BassRemixSavedRecordingMeta> {
    if (!this.originalBuffer) {
      throw new Error('No recorded audio available to save.');
    }
    const name = customName?.trim() || this.audioMeta?.fileName || 'Mic Recording.wav';
    return saveLocalRecording(this.originalBuffer, name);
  }

  public async listSavedRecordings(): Promise<BassRemixSavedRecordingMeta[]> {
    return listLocalRecordings();
  }

  public async loadSavedRecording(id: string): Promise<BassRemixAudioMeta> {
    const ctx = await this.ensureAudio();
    this.stop();
    const { buffer, meta } = await loadLocalRecordingBuffer(id, ctx);
    this.originalBuffer = buffer;
    this.mipmap = buildWaveformMipmap(buffer);
    this.audioMeta = {
      sourceType: 'recorded',
      fileName: meta.name,
      durationSec: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
    };
    setBassRemixTelemetry({
      isPlaying: false,
      playheadSec: 0,
      playheadNorm: 0,
      selProgressNorm: 0,
    });
    this.emitBufferChange();
    return this.audioMeta;
  }

  public async exportSavedRecordingRawWav(
    id: string
  ): Promise<{ blob: Blob; filename: string }> {
    return getLocalRecordingWavBlob(id);
  }

  public async deleteSavedRecording(id: string): Promise<void> {
    return deleteLocalRecording(id);
  }

  public async exportProcessedAudio(
    format: 'wav' | 'mp3',
    onProgress?: (pct: number) => void
  ): Promise<{ blob: Blob; filename: string }> {
    if (!this.originalBuffer) {
      throw new Error('No audio loaded to export.');
    }

    const rendered = await renderBassRemixSelectionChunked(
      this.originalBuffer,
      this.selStartNorm,
      this.selEndNorm,
      this.patch,
      this.bpm,
      this.abMode,
      onProgress
    );

    const baseName = (this.audioMeta?.fileName || 'bass-remix')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9_-]+/gi, '_');

    if (format === 'mp3') {
      const blob = await encodeStereoMp3BlobChunked(rendered, 256, onProgress);
      return { blob, filename: `${baseName}_bass_remix.mp3` };
    }

    const blob = encodeStereoWavBlob(rendered);
    onProgress?.(1);
    return { blob, filename: `${baseName}_bass_remix.wav` };
  }
}

export const bassRemixEngine = new BassRemixEngineClass();
