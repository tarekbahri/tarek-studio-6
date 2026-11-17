import React, { useId, useRef, useState } from 'react';

interface SubbassKnobProps {
  label: string;
  value: number; // normalized 0..1
  defaultValue: number;
  accent?: 'blue' | 'purple' | 'dual' | 'mint' | 'cyan' | 'amber';
  compact?: boolean;
  muted?: boolean;
  borderless?: boolean;
  formatValue: (val: number) => string;
  onChange: (val: number) => void;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
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
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  const sweep = endDeg >= startDeg ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export const SubbassKnob: React.FC<SubbassKnobProps> = ({
  label,
  value,
  defaultValue,
  accent = 'mint',
  compact = false,
  muted = false,
  borderless = false,
  formatValue,
  onChange,
}) => {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ y: number; startVal: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const gradId = useId();

  const norm = clamp01(value);
  const START_DEG = -135;
  const END_DEG = 135;
  const SPAN_DEG = 270;
  const angleDeg = START_DEG + norm * SPAN_DEG;

  const size = 64;
  const cx = size / 2;
  const cy = size / 2;
  const trackR = 25;
  const capR = 18.5;

  const ptrRad = ((angleDeg - 90) * Math.PI) / 180;
  const px1 = cx + capR * 0.28 * Math.cos(ptrRad);
  const py1 = cy + capR * 0.28 * Math.sin(ptrRad);
  const px2 = cx + capR * 0.86 * Math.cos(ptrRad);
  const py2 = cy + capR * 0.86 * Math.sin(ptrRad);

  // Serum 2 color mapping (preserving semantic accents for FX modules)
  const solidStroke =
    accent === 'purple' || accent === 'amber'
      ? '#F59E0B'
      : accent === 'dual'
      ? `url(#${gradId})`
      : accent === 'cyan' || accent === 'blue'
      ? '#2EE59D'
      : '#2EE59D';
  const glowColor =
    accent === 'purple' || accent === 'amber'
      ? '#F59E0B'
      : accent === 'dual'
      ? '#38BDF8'
      : '#2EE59D';
  const valueTextColor =
    accent === 'purple' || accent === 'amber'
      ? 'text-amber-300'
      : accent === 'dual'
      ? 'text-cyan-300'
      : 'text-[#2EE59D]';

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const now = performance.now();
    if (now - lastTapRef.current < 260) {
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
    dragRef.current = { y: e.clientY, startVal: norm };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const dy = dragRef.current.y - e.clientY;
    const sensitivity = e.shiftKey ? 320 : 140;
    onChange(clamp01(dragRef.current.startVal + dy / sensitivity));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
    }
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div
      className={`flex flex-col items-center justify-center select-none transition-opacity ${
        borderless
          ? 'px-0.5 py-0.5'
          : `rounded-lg bg-[#15181F] border border-[#262C38] ${
              compact ? 'px-1.5 py-1.5' : 'px-2 py-1.5'
            }`
      } ${muted ? 'opacity-45' : 'opacity-100'}`}
    >
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(norm * 100)}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={(e) => {
          const step =
            e.key === 'ArrowUp' || e.key === 'ArrowRight'
              ? 0.04
              : e.key === 'ArrowDown' || e.key === 'ArrowLeft'
              ? -0.04
              : 0;
          if (step !== 0) {
            e.preventDefault();
            onChange(clamp01(norm + step));
          }
        }}
        style={{ touchAction: 'none' }}
        className={`relative flex items-center justify-center cursor-ns-resize rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2EE59D] ${
          compact
            ? 'w-[46px] h-[46px] sm:w-[50px] sm:h-[50px]'
            : 'w-[50px] h-[50px] sm:w-[56px] sm:h-[56px]'
        }`}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible"
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2EE59D" />
              <stop offset="100%" stopColor="#38BDF8" />
            </linearGradient>
          </defs>

          {/* Recessed Serum 2 Track Groove */}
          <path
            d={describeArc(cx, cy, trackR, START_DEG, END_DEG)}
            fill="none"
            stroke="#10131A"
            strokeWidth={4.2}
            strokeLinecap="round"
          />

          {/* Active Value Arc */}
          {norm > 0.008 && (
            <path
              d={describeArc(cx, cy, trackR, START_DEG, angleDeg)}
              fill="none"
              stroke={solidStroke}
              strokeWidth={4}
              strokeLinecap="round"
            />
          )}

          {/* Machined Charcoal Dial Cap */}
          <circle
            cx={cx}
            cy={cy}
            r={capR}
            fill={dragging ? '#2A303B' : '#1E232C'}
            stroke={dragging ? glowColor : '#3A4252'}
            strokeWidth={1.3}
          />

          {/* Subtle Inner Bevel */}
          <circle
            cx={cx}
            cy={cy}
            r={capR - 4}
            fill="#161A21"
            stroke="#29303D"
            strokeWidth={0.9}
          />

          {/* Glowing Pointer Line */}
          <line
            x1={px1}
            y1={py1}
            x2={px2}
            y2={py2}
            stroke={dragging ? '#FFFFFF' : glowColor}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        </svg>
      </div>

      <span className="mt-0.5 font-display text-[9.5px] sm:text-[10px] font-bold tracking-wider text-slate-300 text-center whitespace-nowrap leading-tight">
        {label}
      </span>
      <span
        className={`font-mono-num text-[9.5px] sm:text-[10px] font-semibold whitespace-nowrap leading-tight ${valueTextColor}`}
      >
        {formatValue(norm)}
      </span>
    </div>
  );
};
