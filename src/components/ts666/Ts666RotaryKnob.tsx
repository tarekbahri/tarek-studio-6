import React, { useRef, useState } from 'react';
import { useTs666ModOffset } from '../../audio/ts666/ts666TelemetryStore';
import type { Ts666ModTarget } from '../../types/ts666';
import { useTs666ModDrag } from './Ts666ModContext';

interface Ts666RotaryKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  bipolar?: boolean;
  logarithmic?: boolean;
  accent?: 'bronze' | 'copper' | 'red' | 'amber' | 'cyan' | 'emerald' | 'violet';
  size?: '2xs' | 'xs' | 'sm' | 'md';
  disabled?: boolean;
  hideLabel?: boolean;
  modOffset?: number;
  modTarget?: Ts666ModTarget;
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

function fromNorm(
  norm: number,
  min: number,
  max: number,
  step?: number,
  log?: boolean
): number {
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

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number
): string {
  const sRad = ((startDeg - 90) * Math.PI) / 180;
  const eRad = ((endDeg - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(sRad);
  const y1 = cy + r * Math.sin(sRad);
  const x2 = cx + r * Math.cos(eRad);
  const y2 = cy + r * Math.sin(eRad);
  const diff = Math.abs(endDeg - startDeg);
  const large = diff > 180 ? 1 : 0;
  const sweep = endDeg >= startDeg ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export const Ts666RotaryKnob: React.FC<Ts666RotaryKnobProps> = React.memo(({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  bipolar = false,
  logarithmic = false,
  accent = 'bronze',
  size = 'xs',
  disabled = false,
  hideLabel = false,
  modOffset = 0,
  modTarget,
  formatValue,
  onChange,
}) => {
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; norm: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const { dragState } = useTs666ModDrag();
  const liveModOffset = useTs666ModOffset(modTarget);
  const effModOffset = modTarget ? (modOffset !== 0 ? modOffset : liveModOffset) : modOffset;

  const isDropCandidate = Boolean(dragState && modTarget);
  const isDropHovered = Boolean(
    dragState && modTarget && dragState.hoverTarget === modTarget
  );

  const pxSize =
    size === '2xs' ? 18 : size === 'xs' ? 24 : size === 'sm' ? 30 : 38;
  const hitW = size === '2xs' ? 24 : size === 'xs' ? 26 : Math.max(30, pxSize);
  const hitH = size === '2xs' ? 19 : size === 'xs' ? 24 : Math.max(28, pxSize);
  const cx = pxSize / 2;
  const cy = pxSize / 2;
  const trackR = pxSize * 0.4;
  const modR = pxSize * 0.47;

  const START_DEG = -135;
  const END_DEG = 135;
  const SPAN_DEG = 270;

  const norm = toNorm(value, min, max, logarithmic);
  const angleDeg = START_DEG + norm * SPAN_DEG;
  const arcStartDeg = bipolar ? 0 : START_DEG;

  // Unified Bronze / Copper / Crimson Red Identity
  const accentColor =
    accent === 'red'
      ? '#EF4444'
      : accent === 'copper' || accent === 'amber'
      ? '#E08A3C'
      : '#CD7F32';

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
    const sensitivity = e.shiftKey ? 300 : 135;
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

  const hasMod = Math.abs(effModOffset) > 0.004;
  const modEndNorm = clamp(norm + effModOffset * 0.5, 0, 1);
  const modEndDeg = START_DEG + modEndNorm * SPAN_DEG;

  const capR = pxSize * 0.28;
  const pointerRad = ((angleDeg - 90) * Math.PI) / 180;
  const px1 = cx + capR * 0.24 * Math.cos(pointerRad);
  const py1 = cy + capR * 0.24 * Math.sin(pointerRad);
  const px2 = cx + capR * 0.88 * Math.cos(pointerRad);
  const py2 = cy + capR * 0.88 * Math.sin(pointerRad);

  return (
    <div
      data-ts666-target={modTarget}
      className={`flex flex-col items-center justify-center min-w-0 max-w-full select-none rounded transition-colors ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      } ${
        isDropHovered
          ? 'ring-2 ring-red-500 bg-red-600/20'
          : isDropCandidate
          ? 'ring-1 ring-[#D9822B]/60 bg-[#D9822B]/10'
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
          width: hitW,
          height: hitH,
          maxWidth: '100%',
          touchAction: 'none',
        }}
        className="relative flex items-center justify-center cursor-ns-resize focus:outline-none focus-visible:ring-1 focus-visible:ring-red-500 rounded-full shrink-0"
      >
        <svg
          width={pxSize}
          height={pxSize}
          viewBox={`0 0 ${pxSize} ${pxSize}`}
          className="overflow-visible"
        >
          <path
            d={describeArc(cx, cy, trackR, START_DEG, END_DEG)}
            fill="none"
            stroke="#0C0705"
            strokeWidth={size === '2xs' ? 2.3 : 2.8}
            strokeLinecap="round"
          />
          {Math.abs(angleDeg - arcStartDeg) > 0.8 && (
            <path
              d={describeArc(cx, cy, trackR, arcStartDeg, angleDeg)}
              fill="none"
              stroke={accentColor}
              strokeWidth={size === '2xs' ? 2.2 : 2.7}
              strokeLinecap="round"
            />
          )}
          {hasMod && Math.abs(modEndDeg - angleDeg) > 0.8 && (
            <path
              d={describeArc(cx, cy, modR, angleDeg, modEndDeg)}
              fill="none"
              stroke="#EF4444"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          )}
          <circle
            cx={cx}
            cy={cy}
            r={capR}
            fill={dragging ? '#422B1A' : '#26180E'}
            stroke={dragging ? '#EF4444' : '#7A512E'}
            strokeWidth={1.1}
          />
          <line
            x1={px1}
            y1={py1}
            x2={px2}
            y2={py2}
            stroke={dragging ? '#FCA5A5' : '#F2C08D'}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </svg>
      </div>
      {!hideLabel && (
        <span
          className={`${
            size === '2xs' ? 'text-[6.5px] leading-none' : 'text-[8px] leading-[1.05]'
          } text-[#D4B596] font-semibold tracking-tight whitespace-nowrap max-w-full truncate`}
        >
          {label}
        </span>
      )}
      <span
        className={`font-mono-num ${
          size === '2xs' ? 'text-[6.5px] leading-none' : 'text-[8px] leading-[1.05]'
        } text-[#FFF1E2] whitespace-nowrap max-w-full truncate`}
      >
        {displayStr}
      </span>
    </div>
  );
});
