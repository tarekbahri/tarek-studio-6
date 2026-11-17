import React, { useMemo, useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { useTs666EnvValues } from '../../audio/ts666/ts666TelemetryStore';
import type {
  Ts666EnvelopeConfig,
  Ts666ModSource,
  Ts666ModTarget,
} from '../../types/ts666';
import { useTs666ModDrag } from './Ts666ModContext';
import { Ts666RotaryKnob } from './Ts666RotaryKnob';

interface Ts666EnvEditorProps {
  envelopes: [
    Ts666EnvelopeConfig,
    Ts666EnvelopeConfig,
    Ts666EnvelopeConfig,
    Ts666EnvelopeConfig
  ];
  selectedEnvIdx: 0 | 1 | 2 | 3;
  liveEnvValues?: [number, number, number, number];
  onSelectEnv: (idx: 0 | 1 | 2 | 3) => void;
  onChangeEnv: (idx: 0 | 1 | 2 | 3, patch: Partial<Ts666EnvelopeConfig>) => void;
  onAssignMod: (src: Ts666ModSource, target: Ts666ModTarget) => void;
}

function powerVal(t: number, curve: number): number {
  return Math.pow(Math.max(0, Math.min(1, t)), Math.pow(3.5, curve));
}

export const Ts666EnvEditor: React.FC<Ts666EnvEditorProps> = React.memo(({
  envelopes,
  selectedEnvIdx,
  liveEnvValues,
  onSelectEnv,
  onChangeEnv,
  onAssignMod,
}) => {
  const { startDrag } = useTs666ModDrag();
  const storeEnvValues = useTs666EnvValues();
  const envVals = liveEnvValues ?? storeEnvValues;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const active = envelopes[selectedEnvIdx];
  const srcId = (`ENV${selectedEnvIdx + 1}`) as Ts666ModSource;

  const W = 260;
  const H = 68;
  const PAD_X = 8;
  const PAD_Y = 7;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;

  const points = useMemo(() => {
    const aW = Math.max(0.05, Math.min(0.28, active.attack / 2.2));
    const hW = Math.max(0, Math.min(0.22, active.hold / 2.0));
    const dW = Math.max(0.06, Math.min(0.32, active.decay / 2.5));
    const rW = Math.max(0.06, Math.min(0.28, active.release / 2.8));
    const total = Math.max(1, aW + hW + dW + 0.16 + rW);

    const x0 = PAD_X;
    const xA = x0 + (aW / total) * innerW;
    const xH = xA + (hW / total) * innerW;
    const xD = xH + (dW / total) * innerW;
    const xS = xD + (0.16 / total) * innerW;
    const xR = xS + (rW / total) * innerW;

    const yBottom = PAD_Y + innerH;
    const yTop = PAD_Y;
    const ySus = yBottom - active.sustain * innerH;

    const segs: string[] = [`M ${x0.toFixed(1)} ${yBottom.toFixed(1)}`];
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const y = yBottom - powerVal(t, active.attackCurve) * innerH;
      segs.push(`L ${(x0 + (xA - x0) * t).toFixed(1)} ${y.toFixed(1)}`);
    }
    segs.push(`L ${xH.toFixed(1)} ${yTop.toFixed(1)}`);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const y = yTop + powerVal(t, active.decayCurve) * (ySus - yTop);
      segs.push(`L ${(xH + (xD - xH) * t).toFixed(1)} ${y.toFixed(1)}`);
    }
    segs.push(`L ${xS.toFixed(1)} ${ySus.toFixed(1)}`);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const y = ySus + powerVal(t, active.releaseCurve) * (yBottom - ySus);
      segs.push(`L ${(xS + (xR - xS) * t).toFixed(1)} ${y.toFixed(1)}`);
    }

    return {
      pathD: segs.join(' '),
      fillD: `${segs.join(' ')} L ${xR.toFixed(1)} ${yBottom.toFixed(1)} L ${x0.toFixed(1)} ${yBottom.toFixed(1)} Z`,
      xA,
      xH,
      xD,
      xS,
      xR,
      yTop,
      ySus,
      yBottom,
    };
  }, [active, innerH, innerW]);

  const dragNode = (
    node: 'attack' | 'hold' | 'decay' | 'release' | 'atkCurve' | 'decCurve' | 'relCurve',
    e: React.PointerEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const snap = { ...active };

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / 140;
      const dy = (startY - ev.clientY) / 90;
      if (node === 'attack') {
        onChangeEnv(selectedEnvIdx, {
          attack: Math.max(0.002, Math.min(5, snap.attack + dx * 2.0)),
        });
      } else if (node === 'hold') {
        onChangeEnv(selectedEnvIdx, {
          hold: Math.max(0, Math.min(4, snap.hold + dx * 1.8)),
        });
      } else if (node === 'decay') {
        onChangeEnv(selectedEnvIdx, {
          decay: Math.max(0.005, Math.min(5, snap.decay + dx * 2.2)),
          sustain: Math.max(0, Math.min(1, snap.sustain + dy)),
        });
      } else if (node === 'release') {
        onChangeEnv(selectedEnvIdx, {
          release: Math.max(0.005, Math.min(6, snap.release + dx * 2.4)),
        });
      } else if (node === 'atkCurve') {
        onChangeEnv(selectedEnvIdx, {
          attackCurve: Math.max(-1, Math.min(1, snap.attackCurve - dy * 1.5)),
        });
      } else if (node === 'decCurve') {
        onChangeEnv(selectedEnvIdx, {
          decayCurve: Math.max(-1, Math.min(1, snap.decayCurve - dy * 1.5)),
        });
      } else if (node === 'relCurve') {
        onChangeEnv(selectedEnvIdx, {
          releaseCurve: Math.max(-1, Math.min(1, snap.releaseCurve - dy * 1.5)),
        });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <div className="flex flex-col bg-[#17100A] border border-[#6B4829] rounded p-1 h-full min-h-0 min-w-0 overflow-hidden">
      {/* ENV 1..4 Selector Tabs + Drag Handle */}
      <div className="flex items-center justify-between gap-1 mb-0.5 shrink-0 min-w-0">
        <div className="flex items-center gap-0.5">
          <span className="text-[8.5px] font-display font-bold text-[#E08A3C] mr-0.5">
            ENV
          </span>
          {([0, 1, 2, 3] as const).map((idx) => {
            const val = envVals[idx];
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectEnv(idx)}
                style={{ touchAction: 'manipulation' }}
                className={`relative px-2 py-0.5 rounded text-[9px] font-mono-num font-bold cursor-pointer whitespace-nowrap transition-colors border ${
                  selectedEnvIdx === idx
                    ? 'bg-[#DC2626]/30 text-[#FCA5A5] border-[#EF4444]'
                    : 'bg-[#0C0704] text-[#A68464] hover:text-[#FFE7CE] border-[#472E1A]'
                }`}
              >
                {idx + 1}
                {val > 0.02 && (
                  <span
                    className="absolute bottom-0 left-0 h-[2px] bg-[#EF4444] rounded-b"
                    style={{ width: `${Math.round(val * 100)}%` }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          title={`Drag ${srcId} onto any knob to modulate`}
          onPointerDown={(e) => startDrag(srcId, e, onAssignMod)}
          style={{ touchAction: 'none' }}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#DC2626]/20 border border-[#EF4444]/70 text-[#FCA5A5] text-[8.5px] font-mono-num font-bold cursor-grab active:cursor-grabbing whitespace-nowrap"
        >
          <GripVertical className="w-2.5 h-2.5" />
          <span>{srcId}</span>
        </button>
      </div>

      {/* Interactive RED AHDSR + Curve Canvas */}
      <div className="flex-1 min-h-[24px] bg-[#070303] border border-[#6B231C] rounded overflow-hidden relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-full block"
        >
          <path d={points.fillD} fill="rgba(220, 38, 38, 0.2)" />
          <path d={points.pathD} fill="none" stroke="#EF4444" strokeWidth="1.9" />
          <circle
            cx={points.xA}
            cy={points.yTop}
            r={3.8}
            fill="#EF4444"
            stroke="#070303"
            strokeWidth={1.1}
            className="cursor-ew-resize"
            onPointerDown={(e) => dragNode('attack', e)}
          />
          <circle
            cx={points.xH}
            cy={points.yTop}
            r={3.3}
            fill="#E08A3C"
            stroke="#070303"
            strokeWidth={1}
            className="cursor-ew-resize"
            onPointerDown={(e) => dragNode('hold', e)}
          />
          <circle
            cx={points.xD}
            cy={points.ySus}
            r={4}
            fill="#EF4444"
            stroke="#070303"
            strokeWidth={1.1}
            className="cursor-move"
            onPointerDown={(e) => dragNode('decay', e)}
          />
          <circle
            cx={points.xR}
            cy={points.yBottom}
            r={3.8}
            fill="#EF4444"
            stroke="#070303"
            strokeWidth={1.1}
            className="cursor-ew-resize"
            onPointerDown={(e) => dragNode('release', e)}
          />
          <circle
            cx={(8 + points.xA) / 2}
            cy={(points.yTop + points.yBottom) / 2}
            r={2.5}
            fill="#F59E0B"
            className="cursor-ns-resize"
            onPointerDown={(e) => dragNode('atkCurve', e)}
          />
          <circle
            cx={(points.xH + points.xD) / 2}
            cy={(points.yTop + points.ySus) / 2}
            r={2.5}
            fill="#F59E0B"
            className="cursor-ns-resize"
            onPointerDown={(e) => dragNode('decCurve', e)}
          />
          <circle
            cx={(points.xS + points.xR) / 2}
            cy={(points.ySus + points.yBottom) / 2}
            r={2.5}
            fill="#F59E0B"
            className="cursor-ns-resize"
            onPointerDown={(e) => dragNode('relCurve', e)}
          />
        </svg>
      </div>

      {/* AHDSR + Curve Knobs Directly Underneath */}
      <div className="grid grid-cols-7 gap-0.5 pt-1 items-center shrink-0">
        <Ts666RotaryKnob
          label="ATK"
          value={active.attack}
          min={0.002}
          max={5}
          defaultValue={0.01}
          logarithmic
          size="xs"
          accent="red"
          formatValue={(v) => (v < 0.1 ? `${Math.round(v * 1000)}m` : `${v.toFixed(1)}s`)}
          onChange={(attack) => onChangeEnv(selectedEnvIdx, { attack })}
        />
        <Ts666RotaryKnob
          label="HLD"
          value={active.hold}
          min={0}
          max={4}
          defaultValue={0}
          size="xs"
          accent="copper"
          formatValue={(v) => (v < 0.1 ? `${Math.round(v * 1000)}m` : `${v.toFixed(1)}s`)}
          onChange={(hold) => onChangeEnv(selectedEnvIdx, { hold })}
        />
        <Ts666RotaryKnob
          label="DEC"
          value={active.decay}
          min={0.005}
          max={5}
          defaultValue={0.45}
          logarithmic
          size="xs"
          accent="red"
          formatValue={(v) => (v < 0.1 ? `${Math.round(v * 1000)}m` : `${v.toFixed(1)}s`)}
          onChange={(decay) => onChangeEnv(selectedEnvIdx, { decay })}
        />
        <Ts666RotaryKnob
          label="SUS"
          value={active.sustain}
          min={0}
          max={1}
          defaultValue={1}
          size="xs"
          accent="red"
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(sustain) => onChangeEnv(selectedEnvIdx, { sustain })}
        />
        <Ts666RotaryKnob
          label="REL"
          value={active.release}
          min={0.005}
          max={6}
          defaultValue={0.16}
          logarithmic
          size="xs"
          accent="red"
          formatValue={(v) => (v < 0.1 ? `${Math.round(v * 1000)}m` : `${v.toFixed(1)}s`)}
          onChange={(release) => onChangeEnv(selectedEnvIdx, { release })}
        />
        <Ts666RotaryKnob
          label="CRV A"
          value={active.attackCurve}
          min={-1}
          max={1}
          defaultValue={0}
          bipolar
          size="xs"
          accent="bronze"
          onChange={(attackCurve) => onChangeEnv(selectedEnvIdx, { attackCurve })}
        />
        <Ts666RotaryKnob
          label="CRV D"
          value={active.decayCurve}
          min={-1}
          max={1}
          defaultValue={-0.25}
          bipolar
          size="xs"
          accent="bronze"
          onChange={(decayCurve) => onChangeEnv(selectedEnvIdx, { decayCurve })}
        />
      </div>
    </div>
  );
});
