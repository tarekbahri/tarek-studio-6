import React, { useEffect, useRef, useState } from 'react';
import { Repeat, ZoomIn, ZoomOut } from 'lucide-react';
import { bassRemixEngine } from '../../audio/BassRemixEngine';
import {
  getBassRemixTelemetry,
  getLiveRecPeaks,
  subscribeBassRemixTelemetry,
} from '../../audio/bassRemixTelemetryStore';
import { studioAudio } from '../../audio/StudioAudio';
import type { BassRemixAudioMeta } from '../../types/bassRemix';

interface BassRemixWaveformPanelProps {
  audioMeta: BassRemixAudioMeta | null;
  selStartNorm: number;
  selEndNorm: number;
  loopPlayback: boolean;
  onChangeSelection: (startNorm: number, endNorm: number) => void;
  onToggleLoop: () => void;
  onSeekPlay?: (norm: number) => void;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

const SPEC_BARS = 48;

export const BassRemixWaveformPanel: React.FC<BassRemixWaveformPanelProps> = React.memo(({
  audioMeta,
  selStartNorm,
  selEndNorm,
  loopPlayback,
  onChangeSelection,
  onToggleLoop,
  onSeekPlay,
}) => {
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const specCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [zoom, setZoom] = useState<number>(1);
  const [viewOffsetNorm, setViewOffsetNorm] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'split' | 'wave' | 'spec'>('split');

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const viewOffsetRef = useRef(viewOffsetNorm);
  viewOffsetRef.current = viewOffsetNorm;
  const selRef = useRef({ start: selStartNorm, end: selEndNorm });
  selRef.current = { start: selStartNorm, end: selEndNorm };

  const dragModeRef = useRef<
    | { kind: 'startHandle' }
    | { kind: 'endHandle' }
    | { kind: 'region'; anchorNorm: number }
    | null
  >(null);

  const smoothedSpecRef = useRef<Float32Array>(new Float32Array(SPEC_BARS));
  const playheadTextRef = useRef<HTMLSpanElement | null>(null);

  // Clamp view offset when zoom changes or new audio loads
  useEffect(() => {
    const visibleSpan = 1 / Math.max(1, zoom);
    setViewOffsetNorm((prev) => clamp(prev, 0, Math.max(0, 1 - visibleSpan)));
  }, [zoom]);

  useEffect(() => {
    setZoom(1);
    setViewOffsetNorm(0);
  }, [audioMeta?.fileName, audioMeta?.durationSec]);

  // Waveform & Spectrum 60fps Renderer (zero React re-renders during playback)
  useEffect(() => {
    let rafId = 0;
    let freqBuf: Uint8Array<ArrayBuffer> | null = null;
    let timeBuf: Uint8Array<ArrayBuffer> | null = null;

    const drawWaveform = () => {
      const canvas = waveCanvasRef.current;
      if (!canvas || canvas.offsetParent === null) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w <= 0 || h <= 0) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const tw = Math.floor(w * dpr);
      const th = Math.floor(h * dpr);
      if (canvas.width !== tw || canvas.height !== th) {
        canvas.width = tw;
        canvas.height = th;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Deep OLED dark bronze-black backdrop
      ctx.fillStyle = '#070403';
      ctx.fillRect(0, 0, w, h);

      // Subtle copper-red coordinate graticule
      ctx.strokeStyle = '#25140D';
      ctx.lineWidth = 1;
      for (let g = 1; g < 4; g++) {
        const y = (h / 4) * g;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.strokeStyle = '#3A1E13';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.5);
      ctx.lineTo(w, h * 0.5);
      ctx.stroke();

      const buffer = bassRemixEngine.getOriginalBuffer();
      const mipmap = bassRemixEngine.getWaveformMipmap();
      const telem = getBassRemixTelemetry();

      const z = zoomRef.current;
      const visSpan = 1 / Math.max(1, z);
      const vStart = clamp(viewOffsetRef.current, 0, Math.max(0, 1 - visSpan));
      const vEnd = vStart + visSpan;

      if (telem.recState !== 'idle') {
        const { mins, maxs } = getLiveRecPeaks();
        const midY = h * 0.5;
        const amp = h * 0.44;
        const count = mins.length;
        const barSlot = Math.max(2, w / 220);
        const visibleCount = Math.min(count, Math.floor(w / barSlot));
        const startIdx = Math.max(0, count - visibleCount);

        // Draw real scrolling mic waveform in Crimson Red
        if (visibleCount > 1) {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.36)';
          ctx.beginPath();
          for (let i = 0; i < visibleCount; i++) {
            const idx = startIdx + i;
            const x = w - (visibleCount - i) * barSlot;
            const yTop = midY - clamp(maxs[idx], -1, 1) * amp;
            const yBot = midY - clamp(mins[idx], -1, 1) * amp;
            const bh = Math.max(2, yBot - yTop);
            ctx.fillRect(x, yTop, Math.max(1.2, barSlot - 0.6), bh);
            if (i === 0) ctx.moveTo(x, yTop);
            else ctx.lineTo(x, yTop);
          }
          ctx.strokeStyle = '#EF4444';
          ctx.lineWidth = 1.4;
          ctx.stroke();

          ctx.beginPath();
          for (let i = 0; i < visibleCount; i++) {
            const idx = startIdx + i;
            const x = w - (visibleCount - i) * barSlot;
            const yBot = midY - clamp(mins[idx], -1, 1) * amp;
            if (i === 0) ctx.moveTo(x, yBot);
            else ctx.lineTo(x, yBot);
          }
          ctx.strokeStyle = '#DC2626';
          ctx.lineWidth = 1.1;
          ctx.stroke();
        }

        // Recording cursor line on right edge
        ctx.strokeStyle = telem.recState === 'recording' ? '#EF4444' : '#F59E0B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w - 2, 0);
        ctx.lineTo(w - 2, h);
        ctx.stroke();

        // Real-time status + level label
        const db =
          telem.recInputLevel > 0.0005
            ? `${Math.max(-60, Math.round(20 * Math.log10(telem.recInputLevel)))} dB`
            : '-inf dB';
        ctx.fillStyle = 'rgba(12, 7, 4, 0.82)';
        ctx.fillRect(8, 8, 250, 22);
        ctx.strokeStyle = telem.recState === 'recording' ? '#EF4444' : '#E08A3C';
        ctx.lineWidth = 1;
        ctx.strokeRect(8, 8, 250, 22);
        ctx.fillStyle = telem.recState === 'recording' ? '#FCA5A5' : '#FDE68A';
        ctx.font = '700 10.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(
          telem.recState === 'recording'
            ? `LIVE MIC · ${fmtSec(telem.recDurationSec)} · ${db}`
            : `PAUSED · ${fmtSec(telem.recDurationSec)}`,
          16,
          22
        );
      } else if (buffer && mipmap) {
        const midY = h * 0.5;
        const amp = h * 0.44;
        const ch0 = buffer.getChannelData(0);
        const totalSamples = buffer.length;
        const visibleSamples = Math.max(1, Math.floor(visSpan * totalSamples));

        // Draw selection shaded outside regions
        const selS = selRef.current.start;
        const selE = selRef.current.end;
        const xSelS = ((selS - vStart) / visSpan) * w;
        const xSelE = ((selE - vStart) / visSpan) * w;

        // Highlight active selection band
        const cS = clamp(xSelS, 0, w);
        const cE = clamp(xSelE, 0, w);
        if (cE > cS) {
          ctx.fillStyle = 'rgba(220, 38, 38, 0.09)';
          ctx.fillRect(cS, 0, cE - cS, h);
        }
        // Dim out-of-selection zones
        ctx.fillStyle = 'rgba(7, 4, 3, 0.58)';
        if (cS > 0) ctx.fillRect(0, 0, cS, h);
        if (cE < w) ctx.fillRect(cE, 0, w - cE, h);

        // Draw actual audio waveform in vivid Crimson Red
        const pxCols = Math.max(16, Math.floor(w));
        const useRaw = visibleSamples < pxCols * 32;

        ctx.fillStyle = 'rgba(239, 68, 68, 0.34)';
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 1.15;

        ctx.beginPath();
        for (let x = 0; x < pxCols; x++) {
          const n0 = vStart + (x / pxCols) * visSpan;
          const n1 = vStart + ((x + 1) / pxCols) * visSpan;
          let mn = 0;
          let mx = 0;

          if (useRaw) {
            const s0 = clamp(Math.floor(n0 * totalSamples), 0, totalSamples - 1);
            const s1 = clamp(Math.ceil(n1 * totalSamples), s0 + 1, totalSamples);
            mn = 1;
            mx = -1;
            for (let s = s0; s < s1; s++) {
              const v = ch0[s];
              if (v < mn) mn = v;
              if (v > mx) mx = v;
            }
          } else {
            const b0 = clamp(Math.floor(n0 * mipmap.bucketCount), 0, mipmap.bucketCount - 1);
            const b1 = clamp(Math.ceil(n1 * mipmap.bucketCount), b0 + 1, mipmap.bucketCount);
            mn = 1;
            mx = -1;
            for (let b = b0; b < b1; b++) {
              if (mipmap.mins[b] < mn) mn = mipmap.mins[b];
              if (mipmap.maxs[b] > mx) mx = mipmap.maxs[b];
            }
          }

          const yTop = midY - mx * amp;
          const yBot = midY - mn * amp;
          const barH = Math.max(1.2, yBot - yTop);
          ctx.fillRect(x, yTop, 1.1, barH);
          if (x === 0) ctx.moveTo(x, yTop);
          else ctx.lineTo(x, yTop);
        }
        ctx.stroke();

        // Lower ridge line for crisp definition
        ctx.beginPath();
        for (let x = 0; x < pxCols; x++) {
          const n0 = vStart + (x / pxCols) * visSpan;
          const n1 = vStart + ((x + 1) / pxCols) * visSpan;
          let mn = 0;
          if (useRaw) {
            const s0 = clamp(Math.floor(n0 * totalSamples), 0, totalSamples - 1);
            const s1 = clamp(Math.ceil(n1 * totalSamples), s0 + 1, totalSamples);
            mn = 1;
            for (let s = s0; s < s1; s++) {
              if (ch0[s] < mn) mn = ch0[s];
            }
          } else {
            const b0 = clamp(Math.floor(n0 * mipmap.bucketCount), 0, mipmap.bucketCount - 1);
            const b1 = clamp(Math.ceil(n1 * mipmap.bucketCount), b0 + 1, mipmap.bucketCount);
            mn = 1;
            for (let b = b0; b < b1; b++) {
              if (mipmap.mins[b] < mn) mn = mipmap.mins[b];
            }
          }
          const yBot = midY - mn * amp;
          if (x === 0) ctx.moveTo(x, yBot);
          else ctx.lineTo(x, yBot);
        }
        ctx.strokeStyle = '#DC2626';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Selection Start & End Handles
        if (xSelS >= -2 && xSelS <= w + 2) {
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(xSelS, 0);
          ctx.lineTo(xSelS, h);
          ctx.stroke();
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(xSelS, 0, 10, 14);
        }
        if (xSelE >= -2 && xSelE <= w + 2) {
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(xSelE, 0);
          ctx.lineTo(xSelE, h);
          ctx.stroke();
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(xSelE - 10, 0, 10, 14);
        }

        // Real-time Playhead Cursor
        if (telem.playheadNorm >= vStart && telem.playheadNorm <= vEnd) {
          const px = ((telem.playheadNorm - vStart) / visSpan) * w;
          ctx.strokeStyle = '#FCA5A5';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px, 0);
          ctx.lineTo(px, h);
          ctx.stroke();
          ctx.fillStyle = '#FCA5A5';
          ctx.beginPath();
          ctx.moveTo(px - 5, 0);
          ctx.lineTo(px + 5, 0);
          ctx.lineTo(px, 7);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.fillStyle = '#9A6F4E';
        ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          'Record phone microphone or import an MP3 / WAV file to transform',
          w * 0.5,
          h * 0.5 + 4
        );
      }

      if (playheadTextRef.current && buffer) {
        playheadTextRef.current.textContent = `${fmtSec(telem.playheadSec)} / ${fmtSec(buffer.duration)}`;
      }

      ctx.restore();
    };

    const drawSpectrum = () => {
      const canvas = specCanvasRef.current;
      if (!canvas || canvas.offsetParent === null) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w <= 0 || h <= 0) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const tw = Math.floor(w * dpr);
      const th = Math.floor(h * dpr);
      if (canvas.width !== tw || canvas.height !== th) {
        canvas.width = tw;
        canvas.height = th;
      }

      const analyser = bassRemixEngine.getAnalyser();
      const audioCtx = studioAudio.getContext();
      const sr = audioCtx?.sampleRate ?? 48000;
      const smoothed = smoothedSpecRef.current;

      let maxSmoothed = 0;
      let hasAudio = false;

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

        let fPeak = 0;
        for (let i = 0; i < freqBuf.length; i++) {
          if (freqBuf[i] > fPeak) fPeak = freqBuf[i];
        }
        hasAudio = fPeak > 1;

        const minHz = 26;
        const maxHz = Math.min(18000, sr * 0.5);
        const logRatio = Math.log(maxHz / minHz);
        const nyquist = sr * 0.5;

        for (let b = 0; b < SPEC_BARS; b++) {
          let targetNorm = 0;
          if (hasAudio) {
            const f0 = minHz * Math.exp((b / SPEC_BARS) * logRatio);
            const f1 = minHz * Math.exp(((b + 1) / SPEC_BARS) * logRatio);
            const i0 = clamp(Math.floor((f0 / nyquist) * binCount), 0, binCount - 1);
            const i1 = clamp(Math.ceil((f1 / nyquist) * binCount), i0, binCount - 1);
            let pk = 0;
            for (let k = i0; k <= i1; k++) {
              if (freqBuf[k] > pk) pk = freqBuf[k];
            }
            targetNorm = pk / 255;
          }
          if (targetNorm > smoothed[b]) {
            smoothed[b] += (targetNorm - smoothed[b]) * 0.7;
          } else {
            smoothed[b] = hasAudio
              ? smoothed[b] + (targetNorm - smoothed[b]) * 0.25
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

      ctx.fillStyle = '#070403';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#25140D';
      ctx.lineWidth = 1;
      for (let g = 1; g < 4; g++) {
        const y = (h / 4) * g;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const plotH = Math.max(10, h - 18);
      const baseLine = h - 4;
      const slotW = w / SPEC_BARS;
      const barW = Math.max(1.5, slotW - 1.5);

      if (maxSmoothed > 0) {
        ctx.fillStyle = 'rgba(220, 38, 38, 0.34)';
        for (let b = 0; b < SPEC_BARS; b++) {
          const val = smoothed[b];
          if (val <= 0) continue;
          const bh = Math.max(1.5, val * plotH);
          ctx.fillRect(b * slotW + 0.75, baseLine - bh, barW, bh);
        }

        ctx.beginPath();
        for (let b = 0; b < SPEC_BARS; b++) {
          const x = (b + 0.5) * slotW;
          const y = baseLine - smoothed[b] * plotH;
          if (b === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 1.6;
        ctx.lineJoin = 'round';
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#3B1D14';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(4, baseLine);
        ctx.lineTo(w - 4, baseLine);
        ctx.stroke();
      }

      // Live frequency landmarks
      ctx.fillStyle = '#8C6242';
      ctx.font = '500 8.5px "JetBrains Mono", monospace';
      ctx.fillText('30Hz', 4, h - 6);
      ctx.fillText('250Hz', w * 0.33, h - 6);
      ctx.fillText('2kHz', w * 0.66, h - 6);
      ctx.fillText('16kHz', w - 32, h - 6);

      ctx.restore();
    };

    const loop = () => {
      if (typeof document === 'undefined' || !document.hidden) {
        drawWaveform();
        drawSpectrum();
      }
      rafId = requestAnimationFrame(loop);
    };

    const unsubTelem = subscribeBassRemixTelemetry(() => {
      // Trigger handled by rAF loop
    });

    rafId = requestAnimationFrame(loop);
    return () => {
      unsubTelem();
      cancelAnimationFrame(rafId);
    };
  }, [viewMode]);

  const normFromPointer = (clientX: number): number => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const xRatio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const visSpan = 1 / Math.max(1, zoomRef.current);
    const vStart = clamp(viewOffsetRef.current, 0, Math.max(0, 1 - visSpan));
    return clamp(vStart + xRatio * visSpan, 0, 1);
  };

  const handleWavePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!audioMeta) return;
    e.preventDefault();
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const visSpan = 1 / Math.max(1, zoomRef.current);
    const vStart = clamp(viewOffsetRef.current, 0, Math.max(0, 1 - visSpan));
    const px = e.clientX - rect.left;
    const xSelS = ((selStartNorm - vStart) / visSpan) * rect.width;
    const xSelE = ((selEndNorm - vStart) / visSpan) * rect.width;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (Math.abs(px - xSelS) <= 14) {
      dragModeRef.current = { kind: 'startHandle' };
    } else if (Math.abs(px - xSelE) <= 14) {
      dragModeRef.current = { kind: 'endHandle' };
    } else {
      const anchor = normFromPointer(e.clientX);
      dragModeRef.current = { kind: 'region', anchorNorm: anchor };
    }
  };

  const handleWavePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mode = dragModeRef.current;
    if (!mode || !audioMeta) return;
    const n = normFromPointer(e.clientX);
    if (mode.kind === 'startHandle') {
      onChangeSelection(clamp(n, 0, selEndNorm - 0.015), selEndNorm);
    } else if (mode.kind === 'endHandle') {
      onChangeSelection(selStartNorm, clamp(n, selStartNorm + 0.015, 1));
    } else {
      const s = Math.min(mode.anchorNorm, n);
      const end = Math.max(mode.anchorNorm, n);
      if (end - s > 0.015) {
        onChangeSelection(s, end);
      }
    }
  };

  const handleWavePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mode = dragModeRef.current;
    if (!mode) return;
    dragModeRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    // If user tapped without dragging a region, seek playhead if playing
    if (mode.kind === 'region' && onSeekPlay) {
      const n = normFromPointer(e.clientX);
      if (Math.abs(n - mode.anchorNorm) < 0.006 && n >= selStartNorm && n <= selEndNorm) {
        onSeekPlay(n);
      }
    }
  };

  const dur = audioMeta?.durationSec ?? 0;
  const selStartSec = selStartNorm * dur;
  const selEndSec = selEndNorm * dur;
  const selLenSec = Math.max(0, selEndSec - selStartSec);

  return (
    <div className="flex flex-col rounded-lg border border-[#5B3A22] bg-[#140C07] overflow-hidden min-h-0 flex-1">
      {/* Display Sub-Header */}
      <div className="flex items-center justify-between gap-2 px-2.5 py-1 bg-[#1D120B] border-b border-[#4A2E1B] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-[10.5px] font-bold tracking-wider text-[#FCA5A5] whitespace-nowrap">
            WAVEFORM & SPECTRUM
          </span>
          {audioMeta ? (
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono-num text-[#D7B899] truncate">
              <span className="text-[#F6E2CE] truncate max-w-[160px]">{audioMeta.fileName}</span>
              <span aria-hidden="true">·</span>
              <span>{fmtSec(audioMeta.durationSec)}</span>
              <span aria-hidden="true">·</span>
              <span>{audioMeta.sampleRate} Hz</span>
              <span aria-hidden="true">·</span>
              <span>Sel {fmtSec(selLenSec)}</span>
            </div>
          ) : (
            <span className="text-[10px] text-[#9A7455] truncate">No audio loaded</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            ref={playheadTextRef}
            className="font-mono-num text-[10px] text-[#FCA5A5] whitespace-nowrap hidden md:inline"
          >
            {fmtSec(selStartSec)} / {fmtSec(dur)}
          </span>

          {/* View Mode Segmented Switch */}
          <div className="flex items-center bg-[#0D0704] p-0.5 rounded border border-[#462B19]">
            {(['split', 'wave', 'spec'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                style={{ touchAction: 'manipulation' }}
                className={`px-1.5 h-6 rounded text-[9.5px] font-display font-bold uppercase cursor-pointer transition-colors ${
                  viewMode === m
                    ? 'bg-[#DC2626] text-white'
                    : 'text-[#C6A282] hover:text-white'
                }`}
              >
                {m === 'split' ? 'SPLIT' : m === 'wave' ? 'WAVE' : 'SPEC'}
              </button>
            ))}
          </div>

          {/* Selection Loop & Zoom */}
          <button
            type="button"
            onClick={onToggleLoop}
            aria-pressed={loopPlayback}
            title="Loop Selected Audio Region"
            style={{ touchAction: 'manipulation' }}
            className={`inline-flex items-center gap-1 px-2 h-7 rounded border text-[9.5px] font-display font-bold cursor-pointer transition-colors ${
              loopPlayback
                ? 'bg-[#DC2626]/25 border-[#EF4444] text-[#FCA5A5]'
                : 'bg-[#0D0704] border-[#462B19] text-[#B79374] hover:text-white'
            }`}
          >
            <Repeat className="w-3 h-3" />
            <span>LOOP</span>
          </button>

          <div className="flex items-center bg-[#0D0704] rounded border border-[#462B19] h-7 overflow-hidden">
            <button
              type="button"
              aria-label="Zoom Out"
              onClick={() => setZoom((z) => Math.max(1, Number((z / 1.5).toFixed(2))))}
              className="w-6 h-full flex items-center justify-center text-[#D7B899] hover:text-white hover:bg-[#2A190F] cursor-pointer"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setViewOffsetNorm(0);
              }}
              title="Reset Zoom & Select Full"
              className="px-1.5 h-full font-mono-num text-[9.5px] text-[#E08A3C] hover:text-white cursor-pointer"
            >
              {zoom.toFixed(1)}x
            </button>
            <button
              type="button"
              aria-label="Zoom In"
              onClick={() => setZoom((z) => Math.min(24, Number((z * 1.5).toFixed(2))))}
              className="w-6 h-full flex items-center justify-center text-[#D7B899] hover:text-white hover:bg-[#2A190F] cursor-pointer"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>

          {audioMeta && (selStartNorm > 0.005 || selEndNorm < 0.995) && (
            <button
              type="button"
              onClick={() => onChangeSelection(0, 1)}
              className="px-1.5 h-7 rounded bg-[#0D0704] border border-[#462B19] text-[9.5px] font-display font-bold text-[#E08A3C] hover:text-white cursor-pointer"
            >
              ALL
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas Stage */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-1 p-1 bg-[#0B0604]">
        {viewMode !== 'spec' && (
          <div
            className={`${
              viewMode === 'split' ? 'col-span-8' : 'col-span-12'
            } relative min-h-[84px] h-full rounded border border-[#452819] overflow-hidden`}
          >
            <canvas
              ref={waveCanvasRef}
              onPointerDown={handleWavePointerDown}
              onPointerMove={handleWavePointerMove}
              onPointerUp={handleWavePointerUp}
              onPointerCancel={handleWavePointerUp}
              style={{ touchAction: 'none' }}
              className="w-full h-full block cursor-crosshair"
              aria-label="Audio Waveform & Selection Display"
            />
            {audioMeta && zoom > 1.05 && (
              <div className="absolute bottom-1 left-2 right-2 flex items-center gap-2 bg-[#0D0704]/85 px-2 py-0.5 rounded border border-[#462B19]">
                <span className="text-[8.5px] font-mono-num text-[#B79374]">PAN</span>
                <input
                  type="range"
                  aria-label="Waveform Horizontal Pan"
                  min={0}
                  max={Math.max(0.001, 1 - 1 / zoom)}
                  step={0.002}
                  value={viewOffsetNorm}
                  onChange={(e) => setViewOffsetNorm(parseFloat(e.target.value))}
                  className="flex-1 h-1 accent-[#EF4444] cursor-pointer"
                />
              </div>
            )}
          </div>
        )}

        {viewMode !== 'wave' && (
          <div
            className={`${
              viewMode === 'split' ? 'col-span-4' : 'col-span-12'
            } relative min-h-[84px] h-full rounded border border-[#452819] overflow-hidden`}
          >
            <canvas
              ref={specCanvasRef}
              className="w-full h-full block"
              aria-label="Real-Time Red Spectrum Analyzer"
            />
            <span className="absolute top-1 left-1.5 font-mono-num text-[8.5px] font-bold tracking-wider text-[#EF4444] pointer-events-none">
              FFT SPECTRUM
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
