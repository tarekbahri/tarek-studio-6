import React, { useMemo, useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { evaluateLfoShapePoint } from '../../audio/ts666/SixSixSixEngine';
import { useTs666LfoPhase } from '../../audio/ts666/ts666TelemetryStore';
import { TS666_LFO_SYNC_DIVISIONS } from '../../audio/ts666/ts666Wavetables';
import type {
  Ts666LfoConfig,
  Ts666LfoMode,
  Ts666LfoSyncDivision,
  Ts666ModSource,
  Ts666ModTarget,
} from '../../types/ts666';
import { useTs666ModDrag } from './Ts666ModContext';
import { Ts666RotaryKnob } from './Ts666RotaryKnob';

interface Ts666LfoEditorProps {
  lfos: Ts666LfoConfig[];
  selectedLfoIdx: number;
  livePhases?: number[];
  onSelectLfo: (idx: number) => void;
  onChangeLfo: (idx: number, patch: Partial<Ts666LfoConfig>) => void;
  onAssignMod: (src: Ts666ModSource, target: Ts666ModTarget) => void;
}

const PRESET_SHAPES: { label: string; points: number[] }[] = [
  { label: 'TRI', points: [-1, 1, -1] },
  { label: 'SAW', points: [-1, 1, -1, 1, -1] },
  { label: 'SIN', points: [0, 0.7, 1, 0.7, 0, -0.7, -1, -0.7, 0] },
  { label: 'PLK', points: [1, 0.1, -0.6, -1, -1] },
  { label: 'STP', points: [1, 1, -1, -1, 0.5, 0.5, -0.5, -0.5, 1] },
];

export const Ts666LfoEditor: React.FC<Ts666LfoEditorProps> = React.memo(({
  lfos,
  selectedLfoIdx,
  livePhases,
  onSelectLfo,
  onChangeLfo,
  onAssignMod,
}) => {
  const { startDrag } = useTs666ModDrag();
  const storePhase = useTs666LfoPhase(selectedLfoIdx);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const active = lfos[selectedLfoIdx] ?? lfos[0];
  const srcId = (`LFO${selectedLfoIdx + 1}`) as Ts666ModSource;
  const livePhase = livePhases?.[selectedLfoIdx] ?? storePhase;

  const W = 260;
  const H = 64;
  const PAD = 5;
  const iW = W - PAD * 2;
  const iH = H - PAD * 2;

  const { pathD, fillD } = useMemo(() => {
    const samples = 56;
    const parts: string[] = [];
    for (let i = 0; i <= samples; i++) {
      const p = i / samples;
      const yVal = evaluateLfoShapePoint(active, p);
      const x = PAD + p * iW;
      const y = PAD + ((1 - yVal) * 0.5) * iH;
      parts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    const baseY = PAD + iH * 0.5;
    return {
      pathD: parts.join(' '),
      fillD: `${parts.join(' ')} L ${(PAD + iW).toFixed(1)} ${baseY.toFixed(1)} L ${PAD.toFixed(1)} ${baseY.toFixed(1)} Z`,
    };
  }, [active, iH, iW]);

  const handleDrawPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    e.preventDefault();
    const updateAtPoint = (clientX: number, clientY: number) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      const ny = Math.max(-1, Math.min(1, 1 - ((clientY - rect.top) / Math.max(1, rect.height)) * 2));
      const pts = [...active.points];
      const idx = Math.round(nx * (pts.length - 1));
      pts[idx] = Math.round(ny * 20) / 20;
      onChangeLfo(selectedLfoIdx, { points: pts });
    };
    updateAtPoint(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => updateAtPoint(ev.clientX, ev.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleSetGridSize = (gridSize: 4 | 8 | 16 | 32) => {
    const newPts = Array.from({ length: gridSize + 1 }, (_, i) =>
      evaluateLfoShapePoint(active, i / gridSize)
    );
    onChangeLfo(selectedLfoIdx, {
      gridSize,
      points: newPts,
      bends: Array(gridSize).fill(0),
    });
  };

  const cursorX = PAD + livePhase * iW;
  const cursorY = PAD + ((1 - evaluateLfoShapePoint(active, livePhase)) * 0.5) * iH;

  return (
    <div className="flex flex-col bg-[#17100A] border border-[#6B4829] rounded p-1 h-full min-h-0 min-w-0 overflow-hidden">
      {/* 10 LFO Selector Buttons + Drag Handle */}
      <div className="flex items-center justify-between gap-0.5 mb-0.5 shrink-0 min-w-0">
        <div className="grid grid-cols-10 gap-0.5 flex-1 min-w-0">
          {lfos.map((lfo, idx) => (
            <button
              key={lfo.id}
              type="button"
              onClick={() => onSelectLfo(idx)}
              style={{ touchAction: 'manipulation' }}
              className={`py-0.5 rounded text-[7.5px] font-mono-num font-bold cursor-pointer border text-center ${
                selectedLfoIdx === idx
                  ? 'bg-[#DC2626]/30 text-[#FCA5A5] border-[#EF4444]'
                  : 'bg-[#0C0704] text-[#A68464] hover:text-[#FFE7CE] border-[#472E1A]'
              }`}
            >
              L{lfo.id}
            </button>
          ))}
        </div>

        <button
          type="button"
          title={`Drag ${srcId} onto any knob to modulate`}
          onPointerDown={(e) => startDrag(srcId, e, onAssignMod)}
          style={{ touchAction: 'none' }}
          className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-[#DC2626]/20 border border-[#EF4444]/70 text-[#FCA5A5] text-[8px] font-mono-num font-bold cursor-grab active:cursor-grabbing whitespace-nowrap shrink-0"
        >
          <GripVertical className="w-2.5 h-2.5" />
          <span>{srcId}</span>
        </button>
      </div>

      {/* Mode / Grid / Shapes Single-Line Bar (never wraps) */}
      <div className="flex flex-nowrap items-center justify-between gap-0.5 mb-0.5 shrink-0 min-w-0 overflow-hidden">
        <div className="flex items-center gap-0.5 shrink-0">
          {(['trigger', 'envelope', 'off'] as Ts666LfoMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChangeLfo(selectedLfoIdx, { mode: m })}
              className={`px-1 py-[1px] rounded text-[7px] leading-none font-mono-num uppercase cursor-pointer border ${
                active.mode === m
                  ? 'bg-[#DC2626]/30 text-[#FCA5A5] border-[#EF4444]'
                  : 'bg-[#0C0704] text-[#9A7858] border-[#422B1A]'
              }`}
            >
              {m === 'trigger' ? 'TRG' : m === 'envelope' ? 'ENV' : 'OFF'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChangeLfo(selectedLfoIdx, { anchored: !active.anchored })}
            className={`px-1 py-[1px] rounded text-[7px] leading-none font-mono-num cursor-pointer border ${
              active.anchored
                ? 'bg-[#D97724]/30 text-[#F6DFC4] border-[#E08A3C]'
                : 'bg-[#0C0704] text-[#9A7858] border-[#422B1A]'
            }`}
          >
            ANC
          </button>
          <button
            type="button"
            onClick={() => onChangeLfo(selectedLfoIdx, { pathMode: !active.pathMode })}
            className={`px-1 py-[1px] rounded text-[7px] leading-none font-mono-num cursor-pointer border ${
              active.pathMode
                ? 'bg-[#D97724]/30 text-[#F6DFC4] border-[#E08A3C]'
                : 'bg-[#0C0704] text-[#9A7858] border-[#422B1A]'
            }`}
          >
            PTH
          </button>
        </div>

        <div className="flex items-center gap-0.5 shrink-0 min-w-0">
          <select
            aria-label="LFO Grid Size"
            value={active.gridSize}
            onChange={(e) => handleSetGridSize(Number(e.target.value) as 4 | 8 | 16 | 32)}
            className="bg-[#0B0604] border border-[#543720] rounded px-0.5 text-[7px] font-mono-num text-[#F5D3B3] cursor-pointer"
          >
            <option value={4}>G4</option>
            <option value={8}>G8</option>
            <option value={16}>G16</option>
            <option value={32}>G32</option>
          </select>
          <select
            aria-label="LFO Preset Shape"
            value=""
            onChange={(e) => {
              const found = PRESET_SHAPES.find((s) => s.label === e.target.value);
              if (found) {
                onChangeLfo(selectedLfoIdx, {
                  points: [...found.points],
                  bends: Array(Math.max(1, found.points.length - 1)).fill(0),
                });
              }
            }}
            className="bg-[#0B0604] border border-[#543720] rounded px-0.5 text-[7px] font-mono-num text-[#E08A3C] cursor-pointer"
          >
            <option value="" disabled>
              SHP
            </option>
            {PRESET_SHAPES.map((s) => (
              <option key={s.label} value={s.label}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Drawable RED LFO Graph */}
      <div className="flex-1 min-h-[18px] bg-[#070303] border border-[#6B231C] rounded overflow-hidden relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onPointerDown={handleDrawPointer}
          style={{ touchAction: 'none' }}
          className="w-full h-full block cursor-crosshair"
        >
          {Array.from({ length: Math.min(8, active.gridSize) + 1 }, (_, i) => {
            const x = PAD + (i / Math.min(8, active.gridSize)) * iW;
            return (
              <line
                key={i}
                x1={x}
                y1={PAD}
                x2={x}
                y2={H - PAD}
                stroke="#2E1311"
                strokeWidth={0.75}
              />
            );
          })}
          <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="#3E1915" strokeWidth={0.8} />
          <path d={fillD} fill="rgba(220, 38, 38, 0.2)" />
          <path d={pathD} fill="none" stroke="#EF4444" strokeWidth="1.9" />
          <circle cx={cursorX} cy={cursorY} r={3.4} fill="#FCA5A5" stroke="#DC2626" strokeWidth={1.1} />
        </svg>
      </div>

      {/* Rate / Sync / Rise / Delay / Smooth Underneath */}
      <div className="grid grid-cols-[minmax(38px,auto)_repeat(4,minmax(0,1fr))] items-center gap-0.5 pt-0.5 shrink-0">
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onChangeLfo(selectedLfoIdx, { sync: !active.sync })}
            className={`px-1 py-0.5 rounded text-[7.5px] font-mono-num font-bold cursor-pointer whitespace-nowrap border ${
              active.sync
                ? 'bg-[#DC2626]/25 text-[#FCA5A5] border-[#EF4444]'
                : 'bg-[#0C0704] text-[#A68464] border-[#472E1A]'
            }`}
          >
            {active.sync ? 'SYNC' : 'FREE'}
          </button>
          {active.sync ? (
            <select
              aria-label="LFO Sync Division"
              value={active.division}
              onChange={(e) =>
                onChangeLfo(selectedLfoIdx, {
                  division: e.target.value as Ts666LfoSyncDivision,
                })
              }
              className="bg-[#0B0604] border border-[#543720] rounded px-0.5 py-0.2 text-[8px] font-mono-num text-[#F5D3B3] cursor-pointer"
            >
              {TS666_LFO_SYNC_DIVISIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[8px] font-mono-num text-[#F5D3B3] text-center">
              {active.rateHz.toFixed(1)}Hz
            </span>
          )}
        </div>

        <Ts666RotaryKnob
          label="RATE"
          value={active.rateHz}
          min={0.05}
          max={25}
          defaultValue={1.5}
          logarithmic
          disabled={active.sync}
          size="2xs"
          accent="red"
          formatValue={(v) => `${v.toFixed(1)}`}
          onChange={(rateHz) => onChangeLfo(selectedLfoIdx, { rateHz })}
        />
        <Ts666RotaryKnob
          label="RISE"
          value={active.rise}
          min={0}
          max={4}
          defaultValue={0}
          size="2xs"
          accent="copper"
          formatValue={(v) => `${v.toFixed(1)}s`}
          onChange={(rise) => onChangeLfo(selectedLfoIdx, { rise })}
        />
        <Ts666RotaryKnob
          label="DLY"
          value={active.delay}
          min={0}
          max={4}
          defaultValue={0}
          size="2xs"
          accent="copper"
          formatValue={(v) => `${v.toFixed(1)}s`}
          onChange={(delay) => onChangeLfo(selectedLfoIdx, { delay })}
        />
        <Ts666RotaryKnob
          label="SMTH"
          value={active.smooth}
          min={0}
          max={1}
          defaultValue={0.05}
          size="2xs"
          accent="bronze"
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(smooth) => onChangeLfo(selectedLfoIdx, { smooth })}
        />
      </div>
    </div>
  );
});
