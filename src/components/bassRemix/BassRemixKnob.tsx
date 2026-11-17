import React, { useRef, useState } from 'react';

interface BassRemixKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  bipolar?: boolean;
  logarithmic?: boolean;
  accent?: 'red' | 'copper' | 'bronze' | 'amber';
  size?: 'xs' | 'sm' | 'md';
  disabled?: boolean;
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

export const BassRemixKnob: React.FC<BassRemixKnobProps> = React.memo(({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  bipolar = false,
  logarithmic = false,
  accent = 'copper',
  size = 'sm',
  disabled = false,
  formatValue,
  onChange,
}) => {
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; norm: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  const pxSize = size === 'xs' ? 28 : size === 'md' ? 40 : 34;
  const hitSize = size === 'xs' ? 36 : 42;
  const cx = pxSize / 2;
  const cy = pxSize / 2;
  const trackR = pxSize * 0.4;
  const capR = pxSize * 0.28;

  const START_DEG = -135;
  const END_DEG = 135;
  const SPAN_DEG = 270;

  const norm = toNorm(value, min, max, logarithmic);
  const angleDeg = START_DEG + norm * SPAN_DEG;
  const arcStartDeg = bipolar ? 0 : START_DEG;

  const accentColor =
    accent === 'red'
      ? '#EF4444'
      : accent === 'amber'
      ? '#F59E0B'
      : accent === 'bronze'
      ? '#CD7F32'
      : '#E08A3C';

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

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
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
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
    }
    dragStartRef.current = null;
    setDragging(false);
  };

  const pointerRad = ((angleDeg - 90) * Math.PI) / 180;
  const px1 = cx + capR * 0.28 * Math.cos(pointerRad);
  const py1 = cy + capR * 0.28 * Math.sin(pointerRad);
  const px2 = cx + capR * 0.88 * Math.cos(pointerRad);
  const py2 = cy + capR * 0.88 * Math.sin(pointerRad);

  const displayStr = formatValue
    ? formatValue(value)
    : step && step >= 1
    ? `${Math.round(value)}`
    : value.toFixed(2);

  return (
    <div
      className={`flex flex-col items-center justify-center select-none ${
        disabled ? 'opacity-40 pointer-events-none' : ''
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
        style={{ width: hitSize, height: hitSize - 4, touchAction: 'none' }}
        className="relative flex items-center justify-center cursor-ns-resize rounded-full focus:outline-none focus-visible:ring-1 focus-visible:ring-[#E08A3C]"
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
            stroke="#1A1009"
            strokeWidth={3.1}
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
          <circle
            cx={cx}
            cy={cy}
            r={capR}
            fill={dragging ? '#342014' : '#24160D'}
            stroke={dragging ? accentColor : '#6B4427'}
            strokeWidth={1.2}
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

      <span className="text-[8.5px] leading-none font-semibold tracking-wide text-[#D7B899] whitespace-nowrap">
        {label}
      </span>
      <span className="font-mono-num text-[9px] leading-tight text-[#F6E2CE] whitespace-nowrap mt-0.5">
        {displayStr}
      </span>
    </div>
  );
});
