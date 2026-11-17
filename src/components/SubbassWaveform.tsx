import React, { useEffect, useRef } from 'react';
import { midiBus } from '../audio/MidiBus';
import { subbassEngine } from '../audio/SubbassEngine';
import { useIsPlaying } from '../audio/transportStore';
import type { SubbassPatch } from '../types/subbass';

interface SubbassWaveformProps {
  patch: SubbassPatch;
  activeMidi: number | null;
  expanded?: boolean;
  className?: string;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function formatNoteAndHz(midi: number, octaveShift: number): string {
  const shifted = Math.max(12, Math.min(96, midi + octaveShift * 12));
  const semi = ((shifted % 12) + 12) % 12;
  const oct = Math.floor(shifted / 12) - 1;
  const hz = 440 * Math.pow(2, (shifted - 69) / 12);
  return `${NOTE_NAMES[semi]}${oct} · ${hz.toFixed(1)} Hz`;
}

export const SubbassWaveform: React.FC<SubbassWaveformProps> = React.memo(({
  patch,
  activeMidi,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const patchRef = useRef<SubbassPatch>(patch);
  patchRef.current = patch;
  const activeMidiRef = useRef<number | null>(activeMidi);
  activeMidiRef.current = activeMidi;
  const wakeDrawRef = useRef<(() => void) | null>(null);
  const isPlaying = useIsPlaying();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTs = 0;
    let silentFrames = 0;
    const buffer = new Uint8Array(512);

    const drawFrame = () => {
      rafId = 0;
      if (typeof document !== 'undefined' && document.hidden) return;

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

      ctx.save();
      ctx.scale(dpr, dpr);

      // Deep Serum 2 OLED oscilloscope screen
      ctx.fillStyle = '#090B0F';
      ctx.fillRect(0, 0, w, h);

      // Subtle hardware graticule
      ctx.strokeStyle = '#171C26';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.moveTo(w * 0.25, 0);
      ctx.lineTo(w * 0.25, h);
      ctx.moveTo(w * 0.5, 0);
      ctx.lineTo(w * 0.5, h);
      ctx.moveTo(w * 0.75, 0);
      ctx.lineTo(w * 0.75, h);
      ctx.stroke();

      const analyser = subbassEngine.getAnalyser();
      let hasSignal = false;
      let peak = 0;

      if (analyser) {
        analyser.getByteTimeDomainData(buffer);
        for (let i = 0; i < buffer.length; i++) {
          const d = Math.abs(buffer[i] - 128);
          if (d > peak) peak = d;
        }
        hasSignal = peak > 2;
      }

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#2EE59D');
      grad.addColorStop(0.55, '#38BDF8');
      grad.addColorStop(1, '#2EE59D');

      ctx.strokeStyle = grad;
      ctx.lineWidth = hasSignal ? 2.4 : 1.7;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (hasSignal && analyser) {
        silentFrames = 0;
        let triggerIdx = 0;
        for (let i = 1; i < buffer.length / 2; i++) {
          if (buffer[i - 1] < 128 && buffer[i] >= 128) {
            triggerIdx = i;
            break;
          }
        }
        const span = Math.min(256, buffer.length - triggerIdx);
        ctx.beginPath();
        for (let i = 0; i < span; i++) {
          const v = (buffer[triggerIdx + i] - 128) / 128;
          const x = (i / (span - 1)) * w;
          const y = h / 2 + v * (h * 0.42);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        silentFrames++;
        // Static geometric preview reflecting current patch knobs (zero idle animation)
        const p = patchRef.current;
        const phaseRad = (p.phase * Math.PI) / 180;
        const cycles = 2.5;
        const drive = 1 + p.saturation * 5.2;
        const lpfSmooth = 0.25 + p.lowPassFilter * 0.75;
        const ampScale = (0.28 + p.subLevel * 0.46) * (0.4 + p.outputVolume * 0.6);

        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        const steps = 140;
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const theta = u * Math.PI * 2 * cycles + phaseRad;
          const sine = Math.sin(theta) * p.subLevel;
          const tri = (2 / Math.PI) * Math.asin(Math.sin(theta)) * p.bassTone * 0.8;
          const sqrRaw = Math.sin(theta) >= 0 ? 1 : -1;
          const sqr = p.squareEnabled ? sqrRaw * (0.14 + p.bassTone * 0.34) * lpfSmooth : 0;

          let sample = (sine + tri + sqr) / Math.max(0.6, p.subLevel + p.bassTone * 0.5);
          sample = Math.tanh(sample * drive) / Math.tanh(drive);

          const x = u * w;
          const y = h / 2 - sample * (h * 0.34 * ampScale);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      ctx.restore();

      // Stop RAF completely when audio & held notes settle to silence (no idle timer or polling)
      if (hasSignal || activeMidiRef.current !== null || silentFrames < 12 || isPlaying) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const tick = (ts: number) => {
      if (ts - lastTs < 32) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      lastTs = ts;
      drawFrame();
    };

    wakeDrawRef.current = () => {
      silentFrames = 0;
      if (rafId === 0) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    const unsubMidi = midiBus.subscribe((evt) => {
      if (!evt.target || evt.target === 'subbass') {
        wakeDrawRef.current?.();
      }
    });

    rafId = requestAnimationFrame(drawFrame);
    return () => {
      unsubMidi();
      if (rafId !== 0) cancelAnimationFrame(rafId);
      wakeDrawRef.current = null;
    };
  }, [isPlaying]);

  useEffect(() => {
    wakeDrawRef.current?.();
  }, [patch, activeMidi, isPlaying]);

  const lpfHz = Math.round(38 * Math.pow(63.15, Math.max(0, Math.min(1, patch.lowPassFilter))));

  return (
    <div
      className={`relative rounded bg-[#090B0F] border border-[#262C37] overflow-hidden w-full h-full ${className}`}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        aria-label="SUBSYNTH Live Waveform Display"
      />
      <div className="pointer-events-none absolute top-1 left-2 right-2 flex items-center justify-between text-[9.5px] font-mono-num">
        <span className="text-[#2EE59D] font-semibold">
          {activeMidi !== null
            ? formatNoteAndHz(activeMidi, patch.octave)
            : `Sine + Tri${patch.squareEnabled ? ' + Sqr' : ''} · ${patch.phase}°`}
        </span>
        <span className="text-cyan-300 font-semibold">
          LPF {lpfHz} Hz
        </span>
      </div>
    </div>
  );
});
