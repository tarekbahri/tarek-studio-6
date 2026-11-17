import React, { useEffect, useRef } from 'react';
import { studioAudio } from '../audio/StudioAudio';
import { synthEngine } from '../audio/SynthEngine';

export const Oscilloscope: React.FC<{
  className?: string;
  source?: 'serum' | 'master';
}> = ({ className = '', source = 'serum' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastDrawTs = 0;
    const buffer = new Uint8Array(512);

    const draw = (ts: number) => {
      rafId = requestAnimationFrame(draw);
      if (document.hidden || canvas.offsetParent === null || ts - lastDrawTs < 40) return;
      lastDrawTs = ts;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w <= 0 || h <= 0) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#090B0F';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#1B212C';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      const analyser =
        source === 'master'
          ? studioAudio.getMasterAnalyser()
          : synthEngine.getAnalyser();

      let hasSignal = false;
      if (analyser) {
        analyser.getByteTimeDomainData(buffer);
        let peak = 0;
        for (let i = 0; i < buffer.length; i += 2) {
          const d = Math.abs(buffer[i] - 128);
          if (d > peak) peak = d;
        }
        hasSignal = peak > 1;
      }

      if (analyser && hasSignal) {
        let triggerIdx = 0;
        for (let i = 1; i < buffer.length / 2; i++) {
          if (buffer[i - 1] < 128 && buffer[i] >= 128) {
            triggerIdx = i;
            break;
          }
        }

        ctx.strokeStyle = '#2EE59D';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const span = Math.min(220, buffer.length - triggerIdx);
        for (let i = 0; i < span; i++) {
          const v = (buffer[triggerIdx + i] - 128) / 128;
          const x = (i / (span - 1)) * w;
          const y = h / 2 + v * (h * 0.42);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#2EE59D';
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
      }

      ctx.restore();
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [source]);

  return (
    <canvas
      ref={canvasRef}
      className={`rounded border border-[#262C37] bg-[#090B0F] ${className}`}
      aria-label="Live audio oscilloscope"
    />
  );
};
