import type { StudioRoutingConfig } from '../types/beatbox';
import type { FxTrackId, ModularFxInstance, ProjectDeviceFxState } from '../types/fx';
import { createDefaultProjectDeviceFx } from './fxCatalog';
import { ModularFxChannelChain } from './ModularFxEngine';

export type LatencyProfile = 'playback' | 'balanced' | 'interactive';
export type WorkletMode = 'pending' | 'audioworklet' | 'fallback';

export interface AudioDiagnostics {
  state: AudioContextState | 'uninitialized' | 'interrupted';
  sampleRate: number;
  baseLatencyMs: number;
  outputLatencyMs: number;
  latencyProfile: LatencyProfile;
  workletMode: WorkletMode;
  cpuLoadPct: number;
  peakLevel: number;
  activeVoices: number;
  maxVoices: number;
  underruns: number;
  interruptions: number;
  lastError: string | null;
  errorCount: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Safely preserves the current AudioParam trajectory before scheduling new automation,
 * avoiding abrupt gain/frequency jumps that cause clicks or audio cuts.
 */
export function holdAudioParamAt(param: AudioParam, time: number, fallbackValue: number): void {
  const p = param as AudioParam & { cancelAndHoldAtTime?: (cancelTime: number) => AudioParam };
  if (typeof p.cancelAndHoldAtTime === 'function') {
    p.cancelAndHoldAtTime(time);
  } else {
    param.cancelScheduledValues(time);
    param.setValueAtTime(fallbackValue, time);
  }
}

/**
 * Anchors an AudioParam explicitly with setValueAtTime before calling linearRampToValueAtTime.
 * Prevents empty-timeline or WebKit/Chromium cancelAndHoldAtTime quirks where linearRamp can
 * ramp slowly from t=0 and leave notes silent.
 */
export function anchorParamForLinearRamp(param: AudioParam, time: number, value: number): void {
  param.cancelScheduledValues(time);
  param.setValueAtTime(value, time);
}

function isTouchMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

class StudioAudioHub {
  private ctx: AudioContext | null = null;
  private preLimiterTrim: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private workletNode: AudioWorkletNode | null = null;

  private serumBusInput: GainNode | null = null;
  private serumDuckGain: GainNode | null = null;

  private beatboxBusInput: GainNode | null = null;
  private beatboxToMasterGain: GainNode | null = null;
  private beatboxToSerumFxGain: GainNode | null = null;
  private subbassBusInput: GainNode | null = null;
  private ts666BusInput: GainNode | null = null;
  private bassremixBusInput: GainNode | null = null;
  private registeredSerumFxInput: AudioNode | null = null;

  private bpm = 124;
  private deviceFxState: ProjectDeviceFxState = createDefaultProjectDeviceFx();
  private modularFxChains: Record<FxTrackId, ModularFxChannelChain> = {
    serum: new ModularFxChannelChain(),
    subbass: new ModularFxChannelChain(),
    beatbox: new ModularFxChannelChain(),
    ts666: new ModularFxChannelChain(),
    bassremix: new ModularFxChannelChain(),
  };

  private watchdogInstalled = false;
  private resumeInFlight: Promise<void> | null = null;
  private workletLoadStarted = false;
  private workletWatchdogTimer: number | null = null;
  private workletReceivedTelemetry = false;
  private iosSilentUnlocked = false;
  private contextResetCallbacks = new Set<() => void>();
  private kickTriggerListeners = new Set<(when: number, velocity: number) => void>();

  private diagListeners = new Set<(diag: AudioDiagnostics) => void>();
  private lastDiagEmit = 0;

  private diagnostics: AudioDiagnostics = {
    state: 'uninitialized',
    sampleRate: 48000,
    baseLatencyMs: 0,
    outputLatencyMs: 0,
    // Default to 'balanced' across desktop and mobile (~32ms buffer hint on mobile) for responsive
    // real-time playing while avoiding tiny 128-sample starvation crackles; 'playback' remains selectable.
    latencyProfile: 'balanced',
    workletMode: 'pending',
    cpuLoadPct: 0,
    peakLevel: 0,
    activeVoices: 0,
    maxVoices: isTouchMobile() ? 8 : 10,
    underruns: 0,
    interruptions: 0,
    lastError: null,
    errorCount: 0,
  };

  private routing: StudioRoutingConfig = {
    masterVolume: 0.85,
    serumLevel: 1.0,
    beatboxLevel: 0.95,
    subbassLevel: 1.0,
    ts666Level: 1.0,
    bassremixLevel: 1.0,
    serumMuted: false,
    serumSolo: false,
    serumFxBypass: false,
    beatboxMuted: false,
    beatboxSolo: false,
    beatboxFxBypass: false,
    subbassMuted: false,
    subbassSolo: false,
    subbassFxBypass: false,
    ts666Muted: false,
    ts666Solo: false,
    ts666FxBypass: false,
    bassremixMuted: false,
    bassremixSolo: false,
    bassremixFxBypass: false,
    beatboxToSerumFx: false,
    sidechainAmount: 0.35,
    midiBeatboxToSerum: false,
    midiKeyboardToBeatbox: true,
  };

  public onContextReset(cb: () => void): () => void {
    this.contextResetCallbacks.add(cb);
    return () => {
      this.contextResetCallbacks.delete(cb);
    };
  }

  public onKickTrigger(cb: (when: number, velocity: number) => void): () => void {
    this.kickTriggerListeners.add(cb);
    return () => {
      this.kickTriggerListeners.delete(cb);
    };
  }

  public getMaxVoices(): number {
    return this.diagnostics.maxVoices;
  }

  public getDiagnostics(): AudioDiagnostics {
    return this.diagnostics;
  }

  public subscribeDiagnostics(listener: (diag: AudioDiagnostics) => void): () => void {
    this.diagListeners.add(listener);
    listener(this.diagnostics);
    return () => {
      this.diagListeners.delete(listener);
    };
  }

  private emitDiagnostics(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastDiagEmit < 140) return;
    this.lastDiagEmit = now;

    if (this.ctx) {
      const extCtx = this.ctx as AudioContext & { outputLatency?: number };
      this.diagnostics = {
        ...this.diagnostics,
        state: this.ctx.state as AudioDiagnostics['state'],
        sampleRate: this.ctx.sampleRate,
        baseLatencyMs: Math.round((this.ctx.baseLatency || 0) * 10000) / 10,
        outputLatencyMs: Math.round((extCtx.outputLatency || 0) * 10000) / 10,
      };
    }

    for (const listener of this.diagListeners) {
      listener(this.diagnostics);
    }
  }

  public setActiveVoiceCount(count: number): void {
    if (this.diagnostics.activeVoices === count) return;
    this.diagnostics = { ...this.diagnostics, activeVoices: count };
    this.emitDiagnostics(false);
  }

  public reportError(message: string): void {
    this.diagnostics = {
      ...this.diagnostics,
      lastError: message,
      errorCount: this.diagnostics.errorCount + 1,
    };
    this.emitDiagnostics(true);
  }

  public clearErrors(): void {
    this.diagnostics = {
      ...this.diagnostics,
      lastError: null,
      errorCount: 0,
      underruns: 0,
      interruptions: 0,
    };
    this.emitDiagnostics(true);
  }

  public async setLatencyProfile(profile: LatencyProfile, applyImmediately = false): Promise<void> {
    if (this.diagnostics.latencyProfile === profile && !applyImmediately) return;
    const changed = this.diagnostics.latencyProfile !== profile;
    this.diagnostics = { ...this.diagnostics, latencyProfile: profile };
    this.emitDiagnostics(true);

    if (applyImmediately && changed && this.ctx) {
      await this.rebuildAudioContext();
    }
  }

  private async rebuildAudioContext(): Promise<void> {
    const oldCtx = this.ctx;
    for (const cb of this.contextResetCallbacks) {
      try {
        cb();
      } catch {
        // ignore
      }
    }
    if (this.workletWatchdogTimer !== null) {
      clearTimeout(this.workletWatchdogTimer);
      this.workletWatchdogTimer = null;
    }
    this.workletReceivedTelemetry = false;
    try {
      this.workletNode?.port.close();
      this.workletNode?.disconnect();
    } catch {
      // ignore
    }
    this.workletNode = null;
    this.workletLoadStarted = false;
    this.iosSilentUnlocked = false;
    this.preLimiterTrim = null;
    this.masterGain = null;
    this.masterLimiter = null;
    this.masterAnalyser = null;
    this.serumBusInput = null;
    this.serumDuckGain = null;
    this.beatboxBusInput = null;
    this.beatboxToMasterGain = null;
    this.beatboxToSerumFxGain = null;
    this.subbassBusInput = null;
    this.ts666BusInput = null;
    this.bassremixBusInput = null;
    this.registeredSerumFxInput = null;
    this.modularFxChains.serum.detach();
    this.modularFxChains.beatbox.detach();
    this.modularFxChains.subbass.detach();
    this.modularFxChains.ts666.detach();
    this.modularFxChains.bassremix.detach();
    this.ctx = null;

    if (oldCtx) {
      oldCtx.onstatechange = null;
      try {
        await oldCtx.close();
      } catch {
        // ignore
      }
    }

    this.diagnostics = {
      ...this.diagnostics,
      state: 'uninitialized',
      workletMode: 'pending',
      activeVoices: 0,
    };
    this.emitDiagnostics(true);
  }

  private resolveLatencyHint(profile: LatencyProfile): AudioContextLatencyCategory | number {
    if (profile === 'playback') return 'playback';
    if (profile === 'balanced') return isTouchMobile() ? 0.032 : 'balanced';
    return 'interactive';
  }

  private createOrGetContextSync(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const latencyHint = this.resolveLatencyHint(this.diagnostics.latencyProfile);
      this.ctx = new AudioCtx({ latencyHint });
      this.buildMasterGraph(this.ctx);
      this.applyRoutingParams();
      this.attachContextWatchdog(this.ctx);
      void this.initAudioWorklet(this.ctx);
    }
    return this.ctx;
  }

  /**
   * Synchronously unlocks Web Audio inside a direct user touch/pointer gesture.
   * Essential on iOS Safari where async resumes or missing zero-buffer triggers remain muted.
   */
  public unlockSync(): void {
    try {
      if (this.ctx && (this.ctx.state as string) === 'running' && this.iosSilentUnlocked) {
        return;
      }
      const ctx = this.createOrGetContextSync();
      if ((ctx.state as string) !== 'running') {
        void ctx.resume().catch(() => {});
      }
      if (!this.iosSilentUnlocked) {
        this.iosSilentUnlocked = true;
        const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        src.onended = () => {
          try {
            src.disconnect();
          } catch {
            // ignore
          }
        };
      }
    } catch {
      // ignore unlock errors outside gesture
    }
  }

  public async ensureAudio(): Promise<AudioContext> {
    try {
      this.createOrGetContextSync();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create AudioContext';
      this.reportError(msg);
      throw err;
    }

    const ctx = this.ctx!;
    if ((ctx.state as string) === 'suspended' || (ctx.state as string) === 'interrupted') {
      await this.recoverIfSuspended();
    }

    this.emitDiagnostics(true);
    return ctx;
  }

  public async recoverIfSuspended(): Promise<void> {
    if (!this.ctx) return;
    const state = this.ctx.state as string;
    if (state === 'running') return;
    if (this.resumeInFlight) return this.resumeInFlight;

    this.resumeInFlight = (async () => {
      try {
        await this.ctx!.resume();
      } catch (err) {
        this.reportError(err instanceof Error ? err.message : 'AudioContext resume failed');
      } finally {
        this.resumeInFlight = null;
        this.emitDiagnostics(true);
      }
    })();

    return this.resumeInFlight;
  }

  private attachContextWatchdog(ctx: AudioContext): void {
    ctx.onstatechange = () => {
      if (this.ctx !== ctx) return;
      const state = ctx.state as string;
      if (state === 'interrupted' || (state === 'suspended' && !document.hidden)) {
        this.diagnostics = {
          ...this.diagnostics,
          interruptions: this.diagnostics.interruptions + 1,
        };
        // Attempt clean immediate recovery if page is foregrounded
        if (!document.hidden) {
          void this.recoverIfSuspended();
        }
      }
      this.emitDiagnostics(true);
    };

    if (!this.watchdogInstalled && typeof document !== 'undefined') {
      this.watchdogInstalled = true;
      const tryResume = () => {
        if (!document.hidden && this.ctx && (this.ctx.state as string) !== 'running') {
          void this.recoverIfSuspended();
        }
      };
      document.addEventListener('visibilitychange', tryResume);
      window.addEventListener('pageshow', tryResume);
      window.addEventListener('focus', tryResume);
      window.addEventListener('touchend', tryResume, { passive: true });
    }
  }

  private async initAudioWorklet(ctx: AudioContext): Promise<void> {
    if (this.workletLoadStarted) return;
    this.workletLoadStarted = true;

    if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') {
      this.diagnostics = { ...this.diagnostics, workletMode: 'fallback' };
      this.emitDiagnostics(true);
      return;
    }

    try {
      await ctx.audioWorklet.addModule('/worklets/tarek-dsp-processor.js');
      if (this.ctx !== ctx || !this.masterLimiter || !this.masterAnalyser) {
        return;
      }

      const worklet = new AudioWorkletNode(ctx, 'tarek-dsp-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });

      this.workletReceivedTelemetry = false;
      worklet.port.onmessage = (evt: MessageEvent<{
        cpuLoadPct?: number;
        peakLevel?: number;
        underruns?: number;
      }>) => {
        this.workletReceivedTelemetry = true;
        if (this.workletWatchdogTimer !== null) {
          clearTimeout(this.workletWatchdogTimer);
          this.workletWatchdogTimer = null;
        }
        const d = evt.data;
        if (!d) return;
        this.diagnostics = {
          ...this.diagnostics,
          cpuLoadPct: typeof d.cpuLoadPct === 'number' ? Math.round(d.cpuLoadPct * 10) / 10 : this.diagnostics.cpuLoadPct,
          peakLevel: typeof d.peakLevel === 'number' ? d.peakLevel : this.diagnostics.peakLevel,
          underruns: this.diagnostics.underruns + (d.underruns || 0),
        };
        this.emitDiagnostics(false);
      };

      const bypassWorkletToFallback = (reason: string) => {
        if (this.workletWatchdogTimer !== null) {
          clearTimeout(this.workletWatchdogTimer);
          this.workletWatchdogTimer = null;
        }
        if (this.ctx !== ctx || this.workletNode !== worklet) return;
        try {
          this.masterLimiter?.disconnect(worklet);
        } catch {
          // ignore
        }
        try {
          worklet.disconnect();
        } catch {
          // ignore
        }
        try {
          if (this.masterLimiter && this.masterAnalyser) {
            this.masterLimiter.connect(this.masterAnalyser);
          }
        } catch {
          // ignore
        }
        this.workletNode = null;
        this.diagnostics = {
          ...this.diagnostics,
          workletMode: 'fallback',
          lastError: reason,
          errorCount: this.diagnostics.errorCount + 1,
        };
        this.emitDiagnostics(true);
      };

      worklet.onprocessorerror = () => {
        // Safely bypass AudioWorklet if processor faults so audio never dies
        bypassWorkletToFallback('AudioWorklet processor bypassed safely to fallback');
      };

      // Seamlessly splice AudioWorklet between masterLimiter and masterAnalyser
      try {
        this.masterLimiter.disconnect(this.masterAnalyser);
      } catch {
        // ignore if already disconnected
      }
      this.masterLimiter.connect(worklet);
      worklet.connect(this.masterAnalyser);
      this.workletNode = worklet;
      this.diagnostics = { ...this.diagnostics, workletMode: 'audioworklet' };
      this.emitDiagnostics(true);

      // Watchdog: if AudioWorklet thread fails to deliver telemetry while AudioContext runs, bypass safely
      if (this.workletWatchdogTimer !== null) {
        clearTimeout(this.workletWatchdogTimer);
      }
      const checkStall = () => {
        this.workletWatchdogTimer = null;
        if (this.ctx !== ctx || this.workletNode !== worklet || this.workletReceivedTelemetry) {
          return;
        }
        if ((ctx.state as string) === 'running') {
          bypassWorkletToFallback('AudioWorklet telemetry stalled; bypassed safely to native output');
        } else {
          // AudioContext wasn't running yet; re-check once context starts running
          this.workletWatchdogTimer = window.setTimeout(checkStall, 1500);
        }
      };
      this.workletWatchdogTimer = window.setTimeout(checkStall, 1500);
    } catch {
      // Safe fallback when AudioWorklet cannot load (e.g., restricted WebView)
      this.diagnostics = { ...this.diagnostics, workletMode: 'fallback' };
      this.emitDiagnostics(true);
    }
  }

  private buildMasterGraph(ctx: AudioContext): void {
    const now = ctx.currentTime;
    this.preLimiterTrim = ctx.createGain();
    this.preLimiterTrim.gain.setValueAtTime(0.72, now);

    this.masterLimiter = ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -1.2;
    this.masterLimiter.knee.value = 8;
    this.masterLimiter.ratio.value = 6;
    this.masterLimiter.attack.value = 0.005;
    this.masterLimiter.release.value = 0.14;

    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 1024;
    this.masterAnalyser.smoothingTimeConstant = 0.8;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(clamp(this.routing.masterVolume, 0, 1.2) * 1.25, now);

    this.serumBusInput = ctx.createGain();
    this.serumBusInput.gain.setValueAtTime(1, now);
    this.serumDuckGain = ctx.createGain();
    this.serumDuckGain.gain.setValueAtTime(1, now);

    this.beatboxBusInput = ctx.createGain();
    this.beatboxBusInput.gain.setValueAtTime(1, now);
    this.beatboxToMasterGain = ctx.createGain();
    this.beatboxToMasterGain.gain.setValueAtTime(1, now);
    this.beatboxToSerumFxGain = ctx.createGain();
    this.beatboxToSerumFxGain.gain.setValueAtTime(0, now);
    this.subbassBusInput = ctx.createGain();
    this.subbassBusInput.gain.setValueAtTime(1, now);
    this.ts666BusInput = ctx.createGain();
    this.ts666BusInput.gain.setValueAtTime(1, now);
    this.bassremixBusInput = ctx.createGain();
    this.bassremixBusInput.gain.setValueAtTime(1, now);

    this.serumBusInput.connect(this.serumDuckGain);
    this.modularFxChains.serum.setBpm(this.bpm);
    this.modularFxChains.serum.setModules(
      this.deviceFxState.serum,
      Boolean(this.routing.serumFxBypass)
    );
    this.modularFxChains.serum.attach(ctx, this.serumDuckGain, this.preLimiterTrim);

    this.beatboxBusInput.connect(this.beatboxToMasterGain);
    this.modularFxChains.beatbox.setBpm(this.bpm);
    this.modularFxChains.beatbox.setModules(
      this.deviceFxState.beatbox,
      Boolean(this.routing.beatboxFxBypass)
    );
    this.modularFxChains.beatbox.attach(ctx, this.beatboxToMasterGain, this.preLimiterTrim);

    this.beatboxBusInput.connect(this.beatboxToSerumFxGain);

    this.modularFxChains.subbass.setBpm(this.bpm);
    this.modularFxChains.subbass.setModules(
      this.deviceFxState.subbass,
      Boolean(this.routing.subbassFxBypass)
    );
    this.modularFxChains.subbass.attach(ctx, this.subbassBusInput, this.preLimiterTrim);

    this.modularFxChains.ts666.setBpm(this.bpm);
    this.modularFxChains.ts666.setModules(
      this.deviceFxState.ts666 ?? [],
      Boolean(this.routing.ts666FxBypass)
    );
    this.modularFxChains.ts666.attach(ctx, this.ts666BusInput, this.preLimiterTrim);

    this.modularFxChains.bassremix.setBpm(this.bpm);
    this.modularFxChains.bassremix.setModules(
      this.deviceFxState.bassremix ?? [],
      Boolean(this.routing.bassremixFxBypass)
    );
    this.modularFxChains.bassremix.attach(ctx, this.bassremixBusInput, this.preLimiterTrim);

    this.preLimiterTrim.connect(this.masterLimiter);

    // Default native connection; AudioWorklet splices in once loaded
    this.masterLimiter.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public getCurrentTime(): number | null {
    return this.ctx ? this.ctx.currentTime : null;
  }

  public getMasterAnalyser(): AnalyserNode | null {
    return this.masterAnalyser;
  }

  public getSerumBusInput(): GainNode | null {
    return this.serumBusInput;
  }

  public getBeatboxBusInput(): GainNode | null {
    return this.beatboxBusInput;
  }

  public getSubbassBusInput(): GainNode | null {
    return this.subbassBusInput;
  }

  public getTs666BusInput(): GainNode | null {
    return this.ts666BusInput;
  }

  public getBassRemixBusInput(): GainNode | null {
    return this.bassremixBusInput;
  }

  public registerSerumFxInput(node: AudioNode): void {
    this.registeredSerumFxInput = node;
    if (this.beatboxToSerumFxGain) {
      try {
        this.beatboxToSerumFxGain.disconnect();
      } catch {
        // ignore if not connected
      }
      this.beatboxToSerumFxGain.connect(node);
    }
    this.applyRoutingParams();
  }

  private autoSerumLevel: number | null = null;
  private autoBeatboxLevel: number | null = null;

  public getPluginAuditability(): {
    anySolo: boolean;
    serum: boolean;
    beatbox: boolean;
    subbass: boolean;
    ts666: boolean;
    bassremix: boolean;
  } {
    const anySolo = Boolean(
      this.routing.serumSolo ||
        this.routing.beatboxSolo ||
        this.routing.subbassSolo ||
        this.routing.ts666Solo ||
        this.routing.bassremixSolo
    );
    return {
      anySolo,
      serum: !this.routing.serumMuted && (!anySolo || Boolean(this.routing.serumSolo)),
      beatbox:
        !this.routing.beatboxMuted && (!anySolo || Boolean(this.routing.beatboxSolo)),
      subbass:
        !this.routing.subbassMuted && (!anySolo || Boolean(this.routing.subbassSolo)),
      ts666:
        !this.routing.ts666Muted && (!anySolo || Boolean(this.routing.ts666Solo)),
      bassremix:
        !this.routing.bassremixMuted && (!anySolo || Boolean(this.routing.bassremixSolo)),
    };
  }

  public isPluginAudible(
    plugin: 'serum' | 'beatbox' | 'subbass' | 'ts666' | 'bassremix'
  ): boolean {
    return this.getPluginAuditability()[plugin];
  }

  public setRouting(next: StudioRoutingConfig): void {
    this.routing = next;
    this.modularFxChains.serum.setChannelBypass(Boolean(next.serumFxBypass));
    this.modularFxChains.beatbox.setChannelBypass(Boolean(next.beatboxFxBypass));
    this.modularFxChains.subbass.setChannelBypass(Boolean(next.subbassFxBypass));
    this.modularFxChains.ts666.setChannelBypass(Boolean(next.ts666FxBypass));
    this.modularFxChains.bassremix.setChannelBypass(Boolean(next.bassremixFxBypass));
    this.applyRoutingParams();
  }

  public setBpm(bpm: number): void {
    const nextBpm = clamp(bpm, 30, 300);
    this.bpm = nextBpm;
    this.modularFxChains.serum.setBpm(nextBpm);
    this.modularFxChains.subbass.setBpm(nextBpm);
    this.modularFxChains.beatbox.setBpm(nextBpm);
    this.modularFxChains.ts666.setBpm(nextBpm);
    this.modularFxChains.bassremix.setBpm(nextBpm);
  }

  public setDeviceFx(next: ProjectDeviceFxState): void {
    this.deviceFxState = next;
    this.modularFxChains.serum.setBpm(this.bpm);
    this.modularFxChains.subbass.setBpm(this.bpm);
    this.modularFxChains.beatbox.setBpm(this.bpm);
    this.modularFxChains.ts666.setBpm(this.bpm);
    this.modularFxChains.bassremix.setBpm(this.bpm);
    this.modularFxChains.serum.setModules(next.serum, Boolean(this.routing.serumFxBypass));
    this.modularFxChains.subbass.setModules(next.subbass, Boolean(this.routing.subbassFxBypass));
    this.modularFxChains.beatbox.setModules(next.beatbox, Boolean(this.routing.beatboxFxBypass));
    this.modularFxChains.ts666.setModules(next.ts666 ?? [], Boolean(this.routing.ts666FxBypass));
    this.modularFxChains.bassremix.setModules(next.bassremix ?? [], Boolean(this.routing.bassremixFxBypass));
  }

  public setTrackDeviceFx(track: FxTrackId, modules: ModularFxInstance[]): void {
    this.deviceFxState = { ...this.deviceFxState, [track]: modules };
    const bypass =
      track === 'serum'
        ? Boolean(this.routing.serumFxBypass)
        : track === 'beatbox'
        ? Boolean(this.routing.beatboxFxBypass)
        : track === 'subbass'
        ? Boolean(this.routing.subbassFxBypass)
        : track === 'ts666'
        ? Boolean(this.routing.ts666FxBypass)
        : Boolean(this.routing.bassremixFxBypass);
    this.modularFxChains[track].setModules(modules, bypass);
  }

  public getRouting(): StudioRoutingConfig {
    return this.routing;
  }

  public setAutomationBusLevels(
    serumLevel01: number | null,
    beatboxLevel01: number | null
  ): void {
    if (
      this.autoSerumLevel === serumLevel01 &&
      this.autoBeatboxLevel === beatboxLevel01
    ) {
      return;
    }
    this.autoSerumLevel = serumLevel01;
    this.autoBeatboxLevel = beatboxLevel01;
    this.applyRoutingParams();
  }

  private applyRoutingParams(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const audible = this.getPluginAuditability();

    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(clamp(this.routing.masterVolume, 0, 1.2) * 1.25, now, 0.015);
    }
    if (this.serumBusInput) {
      const targetSerum = audible.serum
        ? this.autoSerumLevel !== null
          ? clamp(this.autoSerumLevel * 1.2, 0, 1.4)
          : clamp(this.routing.serumLevel, 0, 1.4)
        : 0;
      this.serumBusInput.gain.setTargetAtTime(targetSerum, now, 0.01);
    }
    if (this.beatboxBusInput) {
      const targetBeatbox = audible.beatbox
        ? this.autoBeatboxLevel !== null
          ? clamp(this.autoBeatboxLevel * 1.2, 0, 1.4)
          : clamp(this.routing.beatboxLevel, 0, 1.4)
        : 0;
      this.beatboxBusInput.gain.setTargetAtTime(targetBeatbox, now, 0.01);
    }
    if (this.subbassBusInput) {
      const targetSub = audible.subbass
        ? clamp(this.routing.subbassLevel ?? 1.0, 0, 1.4)
        : 0;
      this.subbassBusInput.gain.setTargetAtTime(targetSub, now, 0.01);
    }
    if (this.ts666BusInput) {
      const targetTs666 = audible.ts666
        ? clamp(this.routing.ts666Level ?? 1.0, 0, 1.4)
        : 0;
      this.ts666BusInput.gain.setTargetAtTime(targetTs666, now, 0.01);
    }
    if (this.bassremixBusInput) {
      const targetBassRemix = audible.bassremix
        ? clamp(this.routing.bassremixLevel ?? 1.0, 0, 1.4)
        : 0;
      this.bassremixBusInput.gain.setTargetAtTime(targetBassRemix, now, 0.01);
    }

    const routeToSerum = Boolean(this.routing.beatboxToSerumFx && this.registeredSerumFxInput);
    if (this.beatboxToMasterGain && this.beatboxToSerumFxGain) {
      this.beatboxToMasterGain.gain.setTargetAtTime(routeToSerum ? 0 : 1, now, 0.015);
      this.beatboxToSerumFxGain.gain.setTargetAtTime(routeToSerum ? 0.85 : 0, now, 0.015);
    }
  }

  /**
   * Schedules a sample-accurate synthesized metronome click directly on the master limiter.
   */
  public scheduleMetronomeClick(when: number, isAccent: boolean): void {
    if (!this.ctx || !this.masterLimiter) return;
    const t = Math.max(this.ctx.currentTime, when);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isAccent ? 1560 : 980, t);
    osc.frequency.exponentialRampToValueAtTime(isAccent ? 1040 : 680, t + 0.028);

    const peak = isAccent ? 0.34 : 0.2;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.038);

    osc.connect(gain);
    gain.connect(this.masterLimiter);
    osc.start(t);
    osc.stop(t + 0.045);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
    };
  }

  /**
   * Triggers real-time sidechain compression/ducking on SERUM and notifies SUBBASS when BEATBOX Kick fires.
   */
  public triggerSidechainDuck(when: number, velocity = 1): void {
    for (const cb of this.kickTriggerListeners) {
      try {
        cb(when, velocity);
      } catch {
        // ignore listener errors
      }
    }

    if (!this.ctx || !this.serumDuckGain) return;
    const amount = clamp(this.routing.sidechainAmount, 0, 1);
    if (amount < 0.02) return;

    const g = this.serumDuckGain.gain;
    const t = Math.max(this.ctx.currentTime, when);
    const minLevel = clamp(1 - amount * 0.82 * velocity, 0.12, 1);

    anchorParamForLinearRamp(g, t, Math.max(0.12, g.value || 1));
    g.linearRampToValueAtTime(minLevel, t + 0.008);
    g.setTargetAtTime(1, t + 0.025, 0.065);
  }
}

export const studioAudio = new StudioAudioHub();
