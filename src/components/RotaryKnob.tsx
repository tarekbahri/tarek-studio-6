import React, { useRef, useState } from 'react';
import type { ModTarget } from '../types/synth';
import { useModDrag } from './ModDragContext';

interface RotaryKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  bipolar?: boolean;
  logarithmic?: boolean;
  accent?: 'cyan' | 'amber' | 'mint';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  disabled?: boolean;
  modOffset?: number; // normalized -1..1 live modulation offset
  modTarget?: ModTarget;
  formatValue?: (val: number) => string;
  onChange: (val: number) => void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function toNorm(val: number, min: number, max: number, log?: boolean): number {
  if (max <= min) return 0;
  if (log && min > 0) {
    const minL = Math.log(min);
    const maxL = Math.log(max);
    return clamp((Math.log(Math.max(min, val)) - minL) / (maxL - minL), 0, 1);
  }
  return clamp((val - min) / (max - min), 0, 1);
}

function fromNorm(norm: number, min: number, max: number, step?: number, log?: boolean): number {
  const n = clamp(norm, 0, 1);
  let v: number;
  if (log && min > 0) {
    const minL = Math.log(min);
    const maxL = Math.log(max);
    v = Math.exp(minL + n * (maxL - minL));
  } else {
    v = min + n * (max - min);
  }
  if (step && step > 0) {
    v = Math.round(v / step) * step;
  }
  return clamp(v, min, max);
}

function describeArc(cx: number, cy: number, r: number, startAngleDeg: number, endAngleDeg: number): string {
  const startRad = ((startAngleDeg - 90) * Math.PI) / 180;
  const endRad = ((endAngleDeg - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const diff = Math.abs(endAngleDeg - startAngleDeg);
  const largeArc = diff > 180 ? 1 : 0;
  const sweep = endAngleDeg >= startAngleDeg ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  bipolar = false,
  logarithmic = false,
  accent = 'cyan',
  size = 'md',
  disabled = false,
  modOffset = 0,
  modTarget,
  formatValue,
  onChange,
}) => {
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; norm: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const { dragState } = useModDrag();

  const isDropCandidate = Boolean(dragState && modTarget);
  const isDropHovered = Boolean(dragState && modTarget && dragState.hoverTarget === modTarget);

  const isCompact = size === 'xs';
  const pxSize =
    size === 'xs' ? 30 : size === 'sm' ? 40 : size === 'lg' ? 54 : 46;
  const cx = pxSize / 2;
  const cy = pxSize / 2;
  const trackR = pxSize * 0.39;
  const modR = pxSize * 0.455;

  const START_DEG = -135;
  const END_DEG = 135;
  const SPAN_DEG = 270;

  const norm = toNorm(value, min, max, logarithmic);
  const angleDeg = START_DEG + norm * SPAN_DEG;

  const arcStartDeg = bipolar ? 0 : START_DEG;
  const accentColor =
    accent === 'amber'
      ? '#F59E0B'
      : accent === 'mint'
      ? '#2EE59D'
      : '#22D3EE';

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();

    const now = performance.now();
    if (defaultValue !== undefined && now - lastTapRef.current < 260) {
      onChange(defaultValue);
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { y: e.clientY, norm };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || disabled) return;
    e.preventDefault();
    const dy = dragStartRef.current.y - e.clientY;
    const sensitivity = e.shiftKey ? 340 : 145;
    const nextNorm = clamp(dragStartRef.current.norm + dy / sensitivity, 0, 1);
    onChange(fromNorm(nextNorm, min, max, step, logarithmic));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    dragStartRef.current = null;
    setDragging(false);
  };

  const displayStr = formatValue
    ? formatValue(value)
    : step && step >= 1
    ? `${Math.round(value)}`
    : value.toFixed(2);

  const hasMod = Math.abs(modOffset) > 0.004;
  const modEndNorm = clamp(norm + modOffset * 0.5, 0, 1);
  const modEndDeg = START_DEG + modEndNorm * SPAN_DEG;

  const capR = pxSize * 0.27;
  const pointerRad = ((angleDeg - 90) * Math.PI) / 180;
  const px1 = cx + capR * 0.28 * Math.cos(pointerRad);
  const py1 = cy + capR * 0.28 * Math.sin(pointerRad);
  const px2 = cx + capR * 0.88 * Math.cos(pointerRad);
  const py2 = cy + capR * 0.88 * Math.sin(pointerRad);

  return (
    <div
      data-mod-target={modTarget}
      className={`flex flex-col items-center justify-center select-none rounded-md transition-colors ${
        isCompact ? 'p-0' : 'p-0.5'
      } ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      } ${
        isDropHovered
          ? 'ring-2 ring-emerald-400 bg-emerald-500/15'
          : isDropCandidate
          ? 'ring-1 ring-amber-400/50 bg-amber-500/5'
          : ''
      }`}
    >
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={(e) => {
          if (disabled) return;
          const delta =
            e.key === 'ArrowUp' || e.key === 'ArrowRight'
              ? 0.04
              : e.key === 'ArrowDown' || e.key === 'ArrowLeft'
              ? -0.04
              : 0;
          if (delta !== 0) {
            e.preventDefault();
            onChange(fromNorm(norm + delta, min, max, step, logarithmic));
          }
        }}
        style={{
          width: isCompact ? 34 : Math.max(44, pxSize),
          height: isCompact ? 32 : Math.max(44, pxSize),
          touchAction: 'none',
        }}
        className="relative flex items-center justify-center cursor-ns-resize focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 rounded-full"
      >
        <svg width={pxSize} height={pxSize} viewBox={`0 0 ${pxSize} ${pxSize}`} className="overflow-visible">
          <path
            d={describeArc(cx, cy, trackR, START_DEG, END_DEG)}
            fill="none"
            stroke="#11141B"
            strokeWidth={3.2}
            strokeLinecap="round"
          />

          {Math.abs(angleDeg - arcStartDeg) > 0.8 && (
            <path
              d={describeArc(cx, cy, trackR, arcStartDeg, angleDeg)}
              fill="none"
              stroke={accentColor}
              strokeWidth={3}
              strokeLinecap="round"
            />
          )}

          {hasMod && Math.abs(modEndDeg - angleDeg) > 0.8 && (
            <path
              d={describeArc(cx, cy, modR, angleDeg, modEndDeg)}
              fill="none"
              stroke="#F59E0B"
              strokeWidth={2}
              strokeLinecap="round"
              opacity={0.95}
            />
          )}

          <circle
            cx={cx}
            cy={cy}
            r={capR}
            fill={dragging ? '#2A303B' : '#1E232C'}
            stroke={dragging ? accentColor : '#3A4252'}
            strokeWidth={1.25}
          />

          <line
            x1={px1}
            y1={py1}
            x2={px2}
            y2={py2}
            stroke={dragging ? '#FFFFFF' : accentColor}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      </div>

      <span
        className={`${
          isCompact ? 'text-[8.5px] leading-none mt-0' : 'text-[10px] leading-none mt-0.5'
        } font-medium text-slate-400 whitespace-nowrap`}
      >
        {label}
      </span>
      <span
        className={`font-mono-num ${
          isCompact ? 'text-[8.5px] leading-none mt-0.5' : 'text-[10px] leading-tight mt-0.5'
        } text-slate-200 whitespace-nowrap`}
      >
        {displayStr}
      </span>
    </div>
  );
};
