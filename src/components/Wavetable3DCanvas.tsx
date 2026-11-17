import React, { useEffect, useRef } from 'react';
import { evaluateWavetableCycle } from '../audio/wavetables';
import type { WarpMode, WavetableId } from '../types/synth';

interface Wavetable3DCanvasProps {
  wavetableId: WavetableId;
  wtPosition: number;
  warpMode: WarpMode;
  warpAmount: number;
  wtModOffset: number;
  warpModOffset: number;
  enabled: boolean;
  viewMode: '3d' | '2d';
  onScrubPosition: (pos: number) => void;
  onScrubWarp?: (warp: number) => void;
  accentColor?: 'mint' | 'cyan' | 'amber';
  className?: string;
}

export const Wavetable3DCanvas: React.FC<Wavetable3DCanvasProps> = ({
  wavetableId,
  wtPosition,
  warpMode,
  warpAmount,
  wtModOffset,
  warpModOffset,
  enabled,
  viewMode,
  onScrubPosition,
  onScrubWarp,
  accentColor = 'mint',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCacheRef = useRef<{ canvas: HTMLCanvasElement; key: string } | null>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    startPos: number;
    startWarp: number;
  } | null>(null);

  const effPos = Math.max(0, Math.min(1, wtPosition + wtModOffset));
  const effWarp = Math.max(0, Math.min(1, warpAmount + warpModOffset));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;

    const targetW = Math.floor(w * dpr);
    const targetH = Math.floor(h * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const strokeMain =
      accentColor === 'amber'
        ? '#F59E0B'
        : accentColor === 'cyan'
        ? '#38BDF8'
        : '#2EE59D';
    const strokeBright =
      accentColor === 'amber'
        ? '#FCD34D'
        : accentColor === 'cyan'
        ? '#7DD3FC'
        : '#6EE7B7';
    const fillRgba =
      accentColor === 'amber'
        ? 'rgba(245, 158, 11, 0.16)'
        : accentColor === 'cyan'
        ? 'rgba(56, 189, 248, 0.16)'
        : 'rgba(46, 229, 157, 0.15)';
    const meshRgb =
      accentColor === 'amber'
        ? '245, 158, 11'
        : accentColor === 'cyan'
        ? '56, 189, 248'
        : '46, 229, 157';

    if (viewMode === '2d') {
      // Deep Serum 2 obsidian display background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#090B0F');
      bgGrad.addColorStop(1, '#10141B');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(47, 54, 67, 0.45)';
      ctx.lineWidth = 1;
      for (let g = 1; g < 4; g++) {
        const gy = (h / 4) * g;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      const samples = evaluateWavetableCycle(
        wavetableId,
        effPos,
        128,
        warpMode,
        effWarp
      );
      const midY = h * 0.5;
      const amp = h * 0.38;

      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const x = 8 + (i / (samples.length - 1)) * (w - 16);
        const y = midY - samples[i] * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.strokeStyle = enabled ? strokeMain : '#475569';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      ctx.lineTo(w - 8, midY);
      ctx.lineTo(8, midY);
      ctx.closePath();
      ctx.fillStyle = enabled
        ? fillRgba
        : 'rgba(71, 85, 105, 0.08)';
      ctx.fill();
    } else {
      // Cache expensive 16-slice 3D background mesh offscreen so moving WT Pos
      // or LFO modulation blits instantaneously without recalculating 16 slices.
      const qWarp = warpMode === 'none' ? 0 : Math.round(effWarp * 40);
      const cacheKey = `${wavetableId}:${warpMode}:${qWarp}:${w}:${h}:${dpr}:${enabled ? 1 : 0}:${accentColor}`;

      if (!bgCacheRef.current || bgCacheRef.current.key !== cacheKey) {
        const off = bgCacheRef.current?.canvas ?? document.createElement('canvas');
        off.width = targetW;
        off.height = targetH;
        const offCtx = off.getContext('2d');
        if (offCtx) {
          offCtx.save();
          offCtx.scale(dpr, dpr);

          const bgGrad = offCtx.createLinearGradient(0, 0, 0, h);
          bgGrad.addColorStop(0, '#090B0F');
          bgGrad.addColorStop(1, '#10141B');
          offCtx.fillStyle = bgGrad;
          offCtx.fillRect(0, 0, w, h);

          offCtx.strokeStyle = 'rgba(47, 54, 67, 0.4)';
          offCtx.lineWidth = 1;
          for (let g = 1; g < 4; g++) {
            const gy = (h / 4) * g;
            offCtx.beginPath();
            offCtx.moveTo(0, gy);
            offCtx.lineTo(w, gy);
            offCtx.stroke();
          }

          const sliceCount = 16;
          const padX = w * 0.08;
          const baseBottom = h * 0.84;
          const depthRise = h * 0.56;
          const perspectiveSkewX = w * 0.085;

          for (let s = sliceCount - 1; s >= 0; s--) {
            const depthT = s / (sliceCount - 1);
            const samples = evaluateWavetableCycle(
              wavetableId,
              depthT,
              64,
              warpMode,
              effWarp
            );

            const xStart = padX + depthT * perspectiveSkewX;
            const sliceWidth = (w - padX * 2) * (1 - depthT * 0.16);
            const baselineY = baseBottom - depthT * depthRise;
            const amp = h * 0.17 * (1 - depthT * 0.24);

            offCtx.beginPath();
            for (let i = 0; i < samples.length; i++) {
              const x = xStart + (i / (samples.length - 1)) * sliceWidth;
              const y = baselineY - samples[i] * amp;
              if (i === 0) offCtx.moveTo(x, y);
              else offCtx.lineTo(x, y);
            }

            offCtx.save();
            offCtx.lineTo(xStart + sliceWidth, baselineY + 12);
            offCtx.lineTo(xStart, baselineY + 12);
            offCtx.closePath();
            offCtx.fillStyle = 'rgba(10, 12, 17, 0.86)';
            offCtx.fill();
            offCtx.restore();

            offCtx.beginPath();
            for (let i = 0; i < samples.length; i++) {
              const x = xStart + (i / (samples.length - 1)) * sliceWidth;
              const y = baselineY - samples[i] * amp;
              if (i === 0) offCtx.moveTo(x, y);
              else offCtx.lineTo(x, y);
            }
            const alpha = 0.22 + (1 - depthT) * 0.36;
            offCtx.strokeStyle = enabled
              ? `rgba(${meshRgb}, ${alpha.toFixed(2)})`
              : `rgba(100, 116, 139, ${(alpha * 0.5).toFixed(2)})`;
            offCtx.lineWidth = 1.1;
            offCtx.stroke();
          }

          offCtx.restore();
          bgCacheRef.current = { canvas: off, key: cacheKey };
        }
      }

      if (bgCacheRef.current) {
        ctx.drawImage(bgCacheRef.current.canvas, 0, 0, w, h);
      }

      // Draw ONLY the active interpolated wavetable slice on top
      const padX = w * 0.08;
      const baseBottom = h * 0.84;
      const depthRise = h * 0.56;
      const perspectiveSkewX = w * 0.085;

      const activeSamples = evaluateWavetableCycle(
        wavetableId,
        effPos,
        72,
        warpMode,
        effWarp
      );
      const xStart = padX + effPos * perspectiveSkewX;
      const sliceWidth = (w - padX * 2) * (1 - effPos * 0.16);
      const baselineY = baseBottom - effPos * depthRise;
      const amp = h * 0.17 * (1 - effPos * 0.24);

      ctx.beginPath();
      for (let i = 0; i < activeSamples.length; i++) {
        const x = xStart + (i / (activeSamples.length - 1)) * sliceWidth;
        const y = baselineY - activeSamples[i] * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.save();
      ctx.lineTo(xStart + sliceWidth, baselineY + 10);
      ctx.lineTo(xStart, baselineY + 10);
      ctx.closePath();
      ctx.fillStyle = enabled
        ? fillRgba
        : 'rgba(100, 116, 139, 0.12)';
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      for (let i = 0; i < activeSamples.length; i++) {
        const x = xStart + (i / (activeSamples.length - 1)) * sliceWidth;
        const y = baselineY - activeSamples[i] * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = enabled ? strokeBright : '#94A3B8';
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    // Bottom WT Position bar
    ctx.fillStyle = '#1E232E';
    ctx.fillRect(8, h - 5, w - 16, 2.5);
    ctx.fillStyle = enabled ? strokeMain : '#475569';
    ctx.fillRect(8, h - 5, (w - 16) * effPos, 2.5);

    ctx.restore();
  }, [wavetableId, effPos, warpMode, effWarp, enabled, viewMode, accentColor]);

  return (
    <canvas
      ref={canvasRef}
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        if (!enabled) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
          x: e.clientX,
          y: e.clientY,
          startPos: wtPosition,
          startWarp: warpAmount,
        };
      }}
      onPointerMove={(e) => {
        if (!dragRef.current || !enabled) return;
        const dy = dragRef.current.y - e.clientY;
        const nextPos = Math.max(0, Math.min(1, dragRef.current.startPos + dy / 110));
        onScrubPosition(nextPos);
        if (onScrubWarp && warpMode !== 'none') {
          const dx = e.clientX - dragRef.current.x;
          const nextWarp = Math.max(0, Math.min(1, dragRef.current.startWarp + dx / 130));
          onScrubWarp(nextWarp);
        }
      }}
      onPointerUp={(e) => {
        if (dragRef.current) {
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        }
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
      title="Drag vertically to scan WT Pos · Drag horizontally to adjust Warp"
      className={`rounded border border-[#2A303B] bg-[#0A0C10] cursor-ns-resize ${className}`}
    />
  );
};
