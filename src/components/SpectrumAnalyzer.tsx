import React, { useEffect, useRef, useState } from 'react';
import { midiBus } from '../audio/MidiBus';
import { studioAudio } from '../audio/StudioAudio';
import { subbassEngine } from '../audio/SubbassEngine';
import { synthEngine } from '../audio/SynthEngine';
import { useIsPlaying } from '../audio/transportStore';

export type AnalyzerDisplayMode = 'spectrum' | 'wave' | 'dual';

interface SpectrumAnalyzerProps {
  source: 'serum' | 'subbass' | 'master';
  accent?: 'mint' | 'cyan' | 'amber';
  defaultMode?: AnalyzerDisplayMode;
  minHz?: number;
  maxHz?: number;
  reactiveOnly?: boolean;
  label?: string;
  compact?: boolean;
  className?: string;
}

const BAR_COUNT = 44;

export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = React.memo(({
  source,
  accent = 'mint',
  defaultMode = 'dual',
  minHz = 28,
  maxHz = 18000,
  reactiveOnly = false,
  label,
  compact = false,
  className = '',
}) => {
  const [displayMode, setDisplayMode] = useState<AnalyzerDisplayMode>(defaultMode);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothedRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));
  const wakeRef = useRef<(() => void) | null>(null);
  const isPlaying = useIsPlaying();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastDrawTs = 0;
    let silentFrames = 0;
    let freqBuf: Uint8Array<ArrayBuffer> | null = null;
    let timeBuf: Uint8Array<ArrayBuffer> | null = null;
    const smoothed = smoothedRef.current;

    const getAnalyser = (): AnalyserNode | null => {
      if (source === 'subbass') return subbassEngine.getAnalyser();
      if (source === 'master') return studioAudio.getMasterAnalyser();
      return synthEngine.getAnalyser();
    };

    const accentStroke =
      accent === 'amber'
        ? '#F59E0B'
        : accent === 'cyan'
        ? '#38BDF8'
        : '#2EE59D';
    const accentGlow =
      accent === 'amber'
        ? 'rgba(245, 158, 11, 0.22)'
        : accent === 'cyan'
        ? 'rgba(56, 189, 248, 0.22)'
        : 'rgba(46, 229, 157, 0.22)';

    const renderFrame = (ts: number) => {
      rafId = 0;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (canvas.offsetParent === null) {
        if (!reactiveOnly) rafId = requestAnimationFrame(tick);
        return;
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w <= 0 || h <= 0) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const targetW = Math.floor(w * dpr);
      const targetH = Math.floor(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const analyser = getAnalyser();
      const audioCtx = studioAudio.getContext();
      const sampleRate = audioCtx?.sampleRate ?? 48000;

      let hasLiveAudio = false;
      let maxSmoothed = 0;

      if (analyser) {
        const binCount = analyser.frequencyBinCount;
        if (!freqBuf || freqBuf.length !== binCount) {
          freqBuf = new Uint8Array(new ArrayBuffer(binCount));
        }
        if (!timeBuf || timeBuf.length !== analyser.fftSize) {
          timeBuf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        }

        analyser.getByteFrequencyData(freqBuf);
        analyser.getByteTimeDomainData(timeBuf);

        let timePeak = 0;
        for (let i = 0; i < timeBuf.length; i += 2) {
          const d = Math.abs(timeBuf[i] - 128);
          if (d > timePeak) timePeak = d;
        }

        let freqPeak = 0;
        for (let i = 0; i < freqBuf.length; i++) {
          if (freqBuf[i] > freqPeak) freqPeak = freqBuf[i];
        }

        // Strict silence threshold when reactiveOnly (SUBSYNTH): zero floor noise triggers animation
        const audioPresent = reactiveOnly
          ? timePeak > 1 || freqPeak > 2
          : timePeak > 0 || freqPeak > 0;
        if (audioPresent) {
          hasLiveAudio = true;
          silentFrames = 0;
        } else {
          silentFrames++;
        }

        const nyquist = sampleRate * 0.5;
        const safeMinHz = Math.max(16, minHz);
        const safeMaxHz = Math.min(nyquist, Math.max(safeMinHz * 2, maxHz));
        const logRatio = Math.log(safeMaxHz / safeMinHz);

        for (let b = 0; b < BAR_COUNT; b++) {
          let targetNorm = 0;
          if (audioPresent) {
            const f0 = safeMinHz * Math.exp((b / BAR_COUNT) * logRatio);
            const f1 = safeMinHz * Math.exp(((b + 1) / BAR_COUNT) * logRatio);
            const i0 = Math.max(0, Math.min(binCount - 1, Math.floor((f0 / nyquist) * binCount)));
            const i1 = Math.max(i0, Math.min(binCount - 1, Math.ceil((f1 / nyquist) * binCount)));
            let peakVal = 0;
            for (let k = i0; k <= i1; k++) {
              if (freqBuf[k] > peakVal) peakVal = freqBuf[k];
            }
            targetNorm = peakVal / 255;
          }

          if (targetNorm > smoothed[b]) {
            smoothed[b] += (targetNorm - smoothed[b]) * 0.68;
          } else {
            smoothed[b] = audioPresent
              ? smoothed[b] + (targetNorm - smoothed[b]) * 0.28
              : smoothed[b] * 0.72;
            if (smoothed[b] < 0.004) smoothed[b] = 0;
          }
          if (smoothed[b] > maxSmoothed) maxSmoothed = smoothed[b];
        }
      } else {
        smoothed.fill(0);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Deep Serum 2 OLED Scope Surface
      ctx.fillStyle = '#090B0F';
      ctx.fillRect(0, 0, w, h);

      // Subtle Frequency & dB Graticule
      ctx.strokeStyle = '#171C26';
      ctx.lineWidth = 1;
      for (let g = 1; g < 4; g++) {
        const y = (h / 4) * g;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      for (let gx = 1; gx < 4; gx++) {
        const x = (w / 4) * gx;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      const topPad = compact ? 14 : 18;
      const bottomPad = 4;
      const plotH = Math.max(12, h - topPad - bottomPad);
      const baseLineY = h - bottomPad;

      // 1. Spectrum Bars & Outline (drawn in 'spectrum' or 'dual')
      if (displayMode === 'spectrum' || displayMode === 'dual') {
        const slotW = w / BAR_COUNT;
        const barW = Math.max(1.5, slotW - 1.5);

        if (maxSmoothed > 0) {
          ctx.fillStyle = accentGlow;
          for (let b = 0; b < BAR_COUNT; b++) {
            const val = smoothed[b];
            if (val <= 0) continue;
            const barH = Math.max(1.5, val * plotH);
            const x = b * slotW + 0.75;
            ctx.fillRect(x, baseLineY - barH, barW, barH);
          }

          // Crisp spectral envelope ridge
          ctx.beginPath();
          for (let b = 0; b < BAR_COUNT; b++) {
            const x = (b + 0.5) * slotW;
            const y = baseLineY - smoothed[b] * plotH;
            if (b === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = accentStroke;
          ctx.lineWidth = 1.6;
          ctx.lineJoin = 'round';
          ctx.stroke();
        } else {
          // Stationary idle baseline at 0
          ctx.strokeStyle = '#252C3A';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(4, baseLineY - 0.5);
          ctx.lineTo(w - 4, baseLineY - 0.5);
          ctx.stroke();
        }
      }

      // 2. Real-Time Time-Domain Waveform Trace (drawn in 'wave' or 'dual')
      if (displayMode === 'wave' || displayMode === 'dual') {
        const midY = topPad + plotH * 0.5;
        ctx.strokeStyle = displayMode === 'dual' ? '#38BDF8' : accentStroke;
        ctx.lineWidth = displayMode === 'dual' ? 1.35 : 1.8;
        ctx.globalAlpha = hasLiveAudio ? 0.92 : 0.42;

        if (hasLiveAudio && timeBuf) {
          let triggerIdx = 0;
          for (let i = 1; i < timeBuf.length / 2; i++) {
            if (timeBuf[i - 1] < 128 && timeBuf[i] >= 128) {
              triggerIdx = i;
              break;
            }
          }
          const span = Math.min(240, timeBuf.length - triggerIdx);
          ctx.beginPath();
          for (let i = 0; i < span; i++) {
            const v = (timeBuf[triggerIdx + i] - 128) / 128;
            const x = (i / Math.max(1, span - 1)) * w;
            const y = midY + v * (plotH * 0.44);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        } else {
          // Completely still horizontal baseline when silent
          ctx.beginPath();
          ctx.moveTo(0, midY);
          ctx.lineTo(w, midY);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      if (!reactiveOnly) {
        rafId = requestAnimationFrame(tick);
      } else {
        // SUBSYNTH reactiveOnly mode: only continue while live audio is flowing, decaying to 0, or awaiting lookahead/transport
        const needsMoreDecay = maxSmoothed > 0.004 || silentFrames < 12;
        if (hasLiveAudio || needsMoreDecay || isPlaying) {
          rafId = requestAnimationFrame(tick);
        }
      }
    };

    const tick = (ts: number) => {
      if (ts - lastDrawTs < 32) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      lastDrawTs = ts;
      renderFrame(ts);
    };

    wakeRef.current = () => {
      silentFrames = 0;
      if (rafId === 0) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    const unsubMidi = reactiveOnly
      ? midiBus.subscribe((evt) => {
          if (!evt.target || evt.target === source) {
            wakeRef.current?.();
          }
        })
      : () => {};

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      unsubMidi();
      if (rafId !== 0) cancelAnimationFrame(rafId);
      wakeRef.current = null;
    };
  }, [source, accent, displayMode, minHz, maxHz, reactiveOnly, isPlaying, compact]);

  // Wake cleanly for reactiveOnly mode when transport playback starts (e.g. Piano Roll)
  useEffect(() => {
    if (reactiveOnly && isPlaying) {
      wakeRef.current?.();
    }
  }, [reactiveOnly, isPlaying]);

  const cycleMode = () => {
    setDisplayMode((prev) =>
      prev === 'dual' ? 'spectrum' : prev === 'spectrum' ? 'wave' : 'dual'
    );
  };

  const modeTitle =
    displayMode === 'dual'
      ? 'SPEC + WAVE'
      : displayMode === 'spectrum'
      ? 'SPECTRUM'
      : 'WAVEFORM';

  return (
    <div
      className={`relative w-full h-full rounded bg-[#090B0F] border border-[#262C37] overflow-hidden ${className}`}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        aria-label={label ?? 'Real-Time Spectrum Analyzer'}
      />

      <div className="absolute top-1 left-1.5 right-1.5 flex items-center justify-between gap-1 pointer-events-none">
        <span className="font-mono-num text-[8.5px] font-semibold tracking-wider text-slate-400 uppercase truncate">
          {label ?? (source === 'subbass' ? 'SUB SPECTRUM' : 'OUTPUT SPECTRUM')}
        </span>
        <button
          type="button"
          onClick={cycleMode}
          style={{ touchAction: 'manipulation' }}
          title="Switch Analyzer Mode (Spectrum + Wave / Spectrum / Waveform)"
          className="pointer-events-auto px-1.5 h-4 rounded bg-[#141820]/90 hover:bg-[#1E2430] border border-[#2D3545] text-[8px] font-mono-num font-bold text-[#2EE59D] cursor-pointer whitespace-nowrap"
        >
          {modeTitle}
        </button>
      </div>
    </div>
  );
});
