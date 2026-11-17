import React, { useMemo, useRef, useState } from 'react';
import { WAVESHAPER_CURVE_PRESETS } from '../audio/subbassPresets';

interface SubbassWaveshaperCanvasProps {
  curvePoints: number[];
  enabled: boolean;
  onChangeCurve: (points: number[]) => void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

const W = 260;
const H = 122;
const PAD_X = 14;
const PAD_Y = 12;

export const SubbassWaveshaperCanvas: React.FC<SubbassWaveshaperCanvasProps> = ({
  curvePoints,
  enabled,
  onChangeCurve,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const safePoints = useMemo(
    () =>
      curvePoints.length === 9
        ? curvePoints.map((v) => clamp(v, -1, 1))
        : [...WAVESHAPER_CURVE_PRESETS.warm],
    [curvePoints]
  );

  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_Y * 2;

  const curvePath = useMemo(() => {
    const segCount = safePoints.length - 1;
    const samples = 72;
    const cmds: string[] = [];
    for (let i = 0; i <= samples; i++) {
      const u = (i / samples) * segCount;
      const idx = Math.min(segCount - 1, Math.floor(u));
      const localT = u - idx;
      const p0 = safePoints[Math.max(0, idx - 1)];
      const p1 = safePoints[idx];
      const p2 = safePoints[Math.min(segCount, idx + 1)];
      const p3 = safePoints[Math.min(segCount, idx + 2)];
      const yVal = clamp(catmullRom(p0, p1, p2, p3, localT), -1, 1);
      const x = PAD_X + (i / samples) * plotW;
      const y = PAD_Y + ((1 - yVal) * 0.5) * plotH;
      cmds.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return cmds.join(' ');
  }, [safePoints, plotW, plotH]);

  const updatePointFromClient = (idx: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.height <= 0) return;
    const normY = ((clientY - rect.top) / rect.height) * H;
    const val = clamp(1 - ((normY - PAD_Y) / plotH) * 2, -1, 1);
    const next = [...safePoints];
    next[idx] = Math.round(val * 100) / 100;
    onChangeCurve(next);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * W;
    const u = clamp((relX - PAD_X) / plotW, 0, 1);
    const nearestIdx = Math.round(u * (safePoints.length - 1));
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setActiveIdx(nearestIdx);
    updatePointFromClient(nearestIdx, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activeIdx === null) return;
    e.preventDefault();
    updatePointFromClient(activeIdx, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activeIdx !== null) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
      setActiveIdx(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <span className="text-[10px] font-mono-num text-slate-400">
          Transfer Curve (Drag Nodes)
        </span>
        <div className="flex items-center gap-1">
          {(
            [
              ['warm', 'Warm'],
              ['fold', 'Fold'],
              ['crunch', 'Crunch'],
              ['linear', 'Linear'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onChangeCurve([...WAVESHAPER_CURVE_PRESETS[key]])}
              className="px-2 py-0.5 rounded bg-[#0E1116] hover:bg-[#222731] border border-[#2D3442] text-[10px] font-semibold text-[#2EE59D] cursor-pointer"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`w-full h-[100px] rounded bg-[#090B0F] border border-[#262C37] cursor-crosshair select-none transition-opacity ${
          enabled ? 'opacity-100' : 'opacity-50'
        }`}
        aria-label="Editable Waveshaper Curve"
      >
        <defs>
          <linearGradient id="subWsCurveGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2EE59D" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
        </defs>

        {/* Grid Crosshair */}
        <line
          x1={PAD_X}
          y1={PAD_Y + plotH / 2}
          x2={PAD_X + plotW}
          y2={PAD_Y + plotH / 2}
          stroke="#1B212C"
          strokeWidth={1}
        />
        <line
          x1={PAD_X + plotW / 2}
          y1={PAD_Y}
          x2={PAD_X + plotW / 2}
          y2={PAD_Y + plotH}
          stroke="#1B212C"
          strokeWidth={1}
        />
        {/* Linear reference diagonal */}
        <line
          x1={PAD_X}
          y1={PAD_Y + plotH}
          x2={PAD_X + plotW}
          y2={PAD_Y}
          stroke="#252C39"
          strokeDasharray="3 3"
          strokeWidth={1}
        />

        {/* Spline transfer curve */}
        <path
          d={curvePath}
          fill="none"
          stroke="url(#subWsCurveGrad)"
          strokeWidth={2.4}
          strokeLinecap="round"
        />

        {/* 9 Interactive Spline Control Nodes */}
        {safePoints.map((val, idx) => {
          const x = PAD_X + (idx / (safePoints.length - 1)) * plotW;
          const y = PAD_Y + ((1 - val) * 0.5) * plotH;
          const isHot = activeIdx === idx;
          return (
            <g key={idx}>
              <circle
                cx={x}
                cy={y}
                r={isHot ? 6 : 4}
                fill={isHot ? '#FFFFFF' : '#141820'}
                stroke={idx === 4 ? '#F59E0B' : '#2EE59D'}
                strokeWidth={2}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
