import React, { useRef, useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useModTelemetry } from '../audio/transportStore';
import {
  LFO_POINT_COUNT,
  LFO_SYNC_DIVISIONS,
  divisionToHz,
  generateLfoPoints,
} from '../audio/wavetables';
import type {
  LfoConfig,
  LfoPresetShape,
  LfoSyncDivision,
  ModRoute,
  ModSource,
  ModTarget,
} from '../types/synth';
import { useModDrag } from './ModDragContext';
import { RotaryKnob } from './RotaryKnob';
import { ToggleSwitch } from './ToggleSwitch';

interface LfoMatrixPanelProps {
  lfos: [LfoConfig, LfoConfig, LfoConfig];
  lfoPhases?: [number, number, number];
  bpm: number;
  modMatrix: ModRoute[];
  onChangeLfo: (index: 0 | 1 | 2, patch: Partial<LfoConfig>) => void;
  onChangeMatrix: (routes: ModRoute[]) => void;
}

const LFO_SHAPES: { id: LfoPresetShape; label: string }[] = [
  { id: 'wobble', label: 'Wob' },
  { id: 'riddim', label: 'Rdm' },
  { id: 'tearout', label: 'Trt' },
  { id: 'sine', label: 'Sin' },
  { id: 'triangle', label: 'Tri' },
  { id: 'saw', label: 'Saw' },
  { id: 'ramp', label: 'Rmp' },
  { id: 'square', label: 'Sqr' },
  { id: 'sh', label: 'S&H' },
];

const MOD_SOURCES: { id: ModSource; label: string }[] = [
  { id: 'LFO1', label: 'LFO 1' },
  { id: 'LFO2', label: 'LFO 2' },
  { id: 'LFO3', label: 'LFO 3' },
  { id: 'MOD_ENV', label: 'Mod Env' },
  { id: 'AMP_ENV', label: 'Amp Env' },
  { id: 'MOD_WHEEL', label: 'Mod Wheel' },
];

const MOD_TARGETS: { id: ModTarget; label: string }[] = [
  { id: 'FILTER_CUTOFF', label: 'Filter Cutoff' },
  { id: 'FILTER_RES', label: 'Filter Res' },
  { id: 'FILTER_DRIVE', label: 'Filter Drive' },
  { id: 'FILTER_MIX', label: 'Filter Mix' },
  { id: 'OSC_A_WT', label: 'OSC A WT Pos' },
  { id: 'OSC_B_WT', label: 'OSC B WT Pos' },
  { id: 'OSC_C_WT', label: 'OSC C WT Pos' },
  { id: 'OSC_A_WARP', label: 'OSC A Warp' },
  { id: 'OSC_B_WARP', label: 'OSC B Warp' },
  { id: 'OSC_C_WARP', label: 'OSC C Warp' },
  { id: 'OSC_A_PITCH', label: 'OSC A Pitch' },
  { id: 'OSC_B_PITCH', label: 'OSC B Pitch' },
  { id: 'OSC_C_PITCH', label: 'OSC C Pitch' },
  { id: 'OSC_A_LEVEL', label: 'OSC A Level' },
  { id: 'OSC_B_LEVEL', label: 'OSC B Level' },
  { id: 'OSC_C_LEVEL', label: 'OSC C Level' },
  { id: 'SUB_LEVEL', label: 'Sub Osc Level' },
  { id: 'NOISE_LEVEL', label: 'Noise Level' },
  { id: 'FX_DIST_DRIVE', label: 'FX Dist Drive' },
  { id: 'AMP_LEVEL', label: 'Master Amp' },
  { id: 'PAN', label: 'Stereo Pan' },
];

interface LfoEditorProps {
  lfo: LfoConfig;
  phase: number;
  accentColor: string;
  onChangePoints: (points: number[]) => void;
}

const LfoWaveformEditor: React.FC<LfoEditorProps> = ({
  lfo,
  phase,
  accentColor,
  onChangePoints,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drawingRef = useRef(false);
  const lastIdxRef = useRef<number | null>(null);

  const w = 320;
  const h = 104;
  const pad = 7;
  const uw = w - pad * 2;
  const uh = h - pad * 2;

  const updatePointFromEvent = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const rx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const ry = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const idx = Math.round(rx * (LFO_POINT_COUNT - 1));
    const val = 1 - ry * 2;

    const next = [...lfo.points];
    if (lastIdxRef.current !== null && Math.abs(idx - lastIdxRef.current) > 1) {
      const start = lastIdxRef.current;
      const startVal = next[start];
      const steps = Math.abs(idx - start);
      const dir = idx > start ? 1 : -1;
      for (let s = 1; s <= steps; s++) {
        const i = start + s * dir;
        next[i] = startVal + ((val - startVal) * s) / steps;
      }
    } else {
      next[idx] = val;
    }
    lastIdxRef.current = idx;
    onChangePoints(next);
  };

  const coords = lfo.points.map((v, i) => {
    const x = pad + (i / (LFO_POINT_COUNT - 1)) * uw;
    const y = pad + ((1 - v) / 2) * uh;
    return { x, y };
  });

  const linePath = `M ${coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' L ')}`;
  const zeroY = lfo.bipolar ? h / 2 : h - pad;
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)},${zeroY} L ${coords[0].x.toFixed(1)},${zeroY} Z`;
  const playX = pad + phase * uw;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`}
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drawingRef.current = true;
        lastIdxRef.current = null;
        updatePointFromEvent(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!drawingRef.current) return;
        e.preventDefault();
        updatePointFromEvent(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (drawingRef.current) {
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        }
        drawingRef.current = false;
        lastIdxRef.current = null;
      }}
      onPointerCancel={() => {
        drawingRef.current = false;
        lastIdxRef.current = null;
      }}
      className="w-full flex-1 min-h-[88px] max-h-[140px] rounded-md bg-[#090B0F] border border-[#262C37] cursor-crosshair"
    >
      {/* Beat Subdivision Grid */}
      {[0.25, 0.5, 0.75].map((gx) => (
        <line
          key={gx}
          x1={pad + gx * uw}
          y1={0}
          x2={pad + gx * uw}
          y2={h}
          stroke="#1B2333"
          strokeWidth={1}
          strokeDasharray={gx === 0.5 ? undefined : '2 3'}
        />
      ))}
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#1E293B" strokeWidth={1} />

      {/* Waveform Fill & Line */}
      <path d={areaPath} fill={accentColor} fillOpacity={0.16} />
      <path d={linePath} fill="none" stroke={accentColor} strokeWidth={2.2} strokeLinejoin="round" />

      {/* Breakpoints */}
      {coords.map((c, idx) => (
        <circle key={idx} cx={c.x} cy={c.y} r={2.3} fill={accentColor} opacity={0.8} />
      ))}

      {/* Live sweeping phase cursor */}
      <line
        x1={playX}
        y1={2}
        x2={playX}
        y2={h - 2}
        stroke="#FFFFFF"
        strokeOpacity={0.75}
        strokeWidth={1.6}
      />
    </svg>
  );
};

export const LfoMatrixPanel: React.FC<LfoMatrixPanelProps> = React.memo(({
  lfos,
  lfoPhases: lfoPhasesProp,
  bpm,
  modMatrix,
  onChangeLfo,
  onChangeMatrix,
}) => {
  const { lfoPhases: storeLfoPhases } = useModTelemetry();
  const lfoPhases = lfoPhasesProp ?? storeLfoPhases;
  const [selectedIdx, setSelectedIdx] = useState<0 | 1 | 2>(0);
  const { startModDrag } = useModDrag();

  const lfo = lfos[selectedIdx];
  const accent: 'cyan' | 'amber' = lfo.id === 2 ? 'amber' : 'cyan';
  const strokeColor =
    lfo.id === 1 ? '#2EE59D' : lfo.id === 2 ? '#F59E0B' : '#38BDF8';
  const activeHz = lfo.sync ? divisionToHz(lfo.division, bpm) : lfo.rateHz;

  const addRoute = () => {
    const source: ModSource = (`LFO${lfo.id}` as ModSource);
    const newRoute: ModRoute = {
      id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      enabled: true,
      source,
      target: 'FILTER_CUTOFF',
      amount: 0.45,
    };
    onChangeMatrix([...modMatrix, newRoute]);
  };

  const updateRoute = (id: string, patch: Partial<ModRoute>) => {
    onChangeMatrix(modMatrix.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRoute = (id: string) => {
    onChangeMatrix(modMatrix.filter((r) => r.id !== id));
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 lg:gap-3.5 h-full">
      {/* LEFT: SERUM-STYLE LFO 1 / 2 / 3 WOBBLE DESIGNER */}
      <section className="sm:col-span-7 flex flex-col justify-between rounded-xl border border-[#263042] bg-[#131822] p-2.5 lg:p-3.5 min-h-0">
        {/* Top Row: LFO 1/2/3 Selector Tabs + Drag-to-Mod Handle + Shape Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5 bg-[#0B0E14] p-0.5 rounded-lg border border-[#242E40]">
              {lfos.map((item, idx) => {
                const i = idx as 0 | 1 | 2;
                const isActive = selectedIdx === i;
                const dotColor =
                  item.id === 1
                    ? 'bg-cyan-400'
                    : item.id === 2
                    ? 'bg-amber-400'
                    : 'bg-emerald-400';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedIdx(i)}
                    className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[11px] font-display font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-[#1D283B] text-slate-100 border border-cyan-400/50'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                    <span>LFO {item.id}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                e.preventDefault();
                startModDrag(`LFO${lfo.id}` as ModSource, e.clientX, e.clientY);
              }}
              title={`Drag LFO ${lfo.id} onto any knob to route modulation`}
              className="inline-flex items-center gap-1 px-2 h-7 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-300 text-[10px] font-mono-num font-semibold hover:bg-amber-500/25 cursor-grab active:cursor-grabbing whitespace-nowrap"
            >
              <GripVertical className="w-3 h-3" />
              <span>Drag LFO {lfo.id}</span>
            </button>
          </div>

          <div className="flex items-center gap-0.5 bg-[#0B0E14] p-0.5 rounded-md border border-[#242E40] overflow-x-auto max-w-full">
            {LFO_SHAPES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  onChangeLfo(selectedIdx, {
                    presetShape: s.id,
                    points: generateLfoPoints(s.id),
                  })
                }
                className={`px-2 py-1 text-[10px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  lfo.presetShape === s.id
                    ? lfo.id === 2
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Drawable LFO Waveform Canvas */}
        <LfoWaveformEditor
          lfo={lfo}
          phase={lfoPhases[selectedIdx]}
          accentColor={strokeColor}
          onChangePoints={(points) =>
            onChangeLfo(selectedIdx, { presetShape: 'custom', points })
          }
        />

        {/* Bottom Controls: BPM Sync + Division/Rate + Depth + Bipolar + Retrigger */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 mt-2 border-t border-[#1E2736]">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <ToggleSwitch
                checked={lfo.sync}
                onChange={(sync) => onChangeLfo(selectedIdx, { sync })}
                label="BPM Sync"
                accent={accent}
                compact
              />
              <span className="font-mono-num text-[10px] text-slate-400">
                {activeHz < 1 ? activeHz.toFixed(2) : activeHz.toFixed(1)}Hz @ {bpm}
              </span>
            </div>

            {lfo.sync ? (
              <div className="flex flex-col items-center">
                <select
                  aria-label={`LFO ${lfo.id} Tempo Division`}
                  value={lfo.division}
                  onChange={(e) =>
                    onChangeLfo(selectedIdx, {
                      division: e.target.value as LfoSyncDivision,
                    })
                  }
                  className="h-8 px-2 rounded-md bg-[#0B0E14] border border-cyan-400/40 text-xs font-mono-num font-semibold text-cyan-300 focus:outline-none focus:border-cyan-400 cursor-pointer"
                >
                  {LFO_SYNC_DIVISIONS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 mt-1">Wobble Div</span>
              </div>
            ) : (
              <RotaryKnob
                label="Rate"
                size="sm"
                accent={accent}
                value={lfo.rateHz}
                min={0.05}
                max={20}
                logarithmic
                defaultValue={2.0}
                formatValue={(v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)}Hz`}
                onChange={(rateHz) => onChangeLfo(selectedIdx, { rateHz })}
              />
            )}

            <RotaryKnob
              label="Depth"
              size="sm"
              accent={accent}
              value={lfo.depth}
              min={0}
              max={1}
              defaultValue={0.75}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(depth) => onChangeLfo(selectedIdx, { depth })}
            />
          </div>

          <div className="flex items-center gap-2">
            <ToggleSwitch
              checked={lfo.bipolar}
              onChange={(bipolar) => onChangeLfo(selectedIdx, { bipolar })}
              label="Bipolar"
              accent={accent}
              compact
            />
            <ToggleSwitch
              checked={lfo.retrigger}
              onChange={(retrigger) => onChangeLfo(selectedIdx, { retrigger })}
              label="Retrig"
              accent={accent}
              compact
            />
          </div>
        </div>
      </section>

      {/* RIGHT: MODULATION MATRIX + QUICK DRAG SOURCES */}
      <section className="sm:col-span-5 flex flex-col rounded-xl border border-[#263042] bg-[#131822] p-2.5 lg:p-3.5 min-h-[170px]">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div>
            <h3 className="font-display text-xs font-semibold text-slate-100">
              Modulation Matrix
            </h3>
            <p className="text-[10px] text-slate-400">
              {modMatrix.filter((r) => r.enabled).length} active links
            </p>
          </div>
          <button
            type="button"
            onClick={addRoute}
            className="inline-flex items-center gap-1 px-2.5 min-h-[32px] rounded-md bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-[11px] font-medium hover:bg-cyan-500/25 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Route</span>
          </button>
        </div>

        {/* Draggable Sources Strip */}
        <div className="flex items-center gap-1 mb-2 overflow-x-auto pb-0.5">
          <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">Drag:</span>
          {MOD_SOURCES.map((src) => (
            <button
              key={src.id}
              type="button"
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                e.preventDefault();
                startModDrag(src.id, e.clientX, e.clientY);
              }}
              className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-amber-400/35 text-[10px] font-mono-num text-amber-300 hover:bg-amber-500/15 cursor-grab active:cursor-grabbing whitespace-nowrap shrink-0"
            >
              {src.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto synth-scroll space-y-1.5 pr-0.5 max-h-[210px] lg:max-h-[280px]">
          {modMatrix.length === 0 ? (
            <div className="h-full min-h-[100px] flex flex-col items-center justify-center text-center px-3 rounded-lg border border-dashed border-[#263042] bg-[#0D1119]">
              <p className="text-xs text-slate-400">No modulation routes active.</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Tap Add Route or drag any source onto a knob.
              </p>
            </div>
          ) : (
            modMatrix.map((route) => (
              <div
                key={route.id}
                className="flex flex-col gap-1.5 rounded-lg bg-[#12151B] border border-[#262C38] p-2"
              >
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={route.enabled ? 'Disable route' : 'Enable route'}
                    onClick={() => updateRoute(route.id, { enabled: !route.enabled })}
                    className={`w-6 h-6 rounded flex items-center justify-center border shrink-0 cursor-pointer ${
                      route.enabled
                        ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                        : 'bg-[#191D24] border-[#2E3543] text-slate-600'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-sm ${
                        route.enabled ? 'bg-cyan-400' : 'bg-slate-600'
                      }`}
                    />
                  </button>

                  <select
                    aria-label="Modulation source"
                    value={route.source}
                    onChange={(e) =>
                      updateRoute(route.id, { source: e.target.value as ModSource })
                    }
                    className="flex-1 min-w-0 h-7 px-1.5 rounded bg-[#131822] border border-[#263042] text-[11px] text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
                  >
                    {MOD_SOURCES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>

                  <span className="text-[10px] text-slate-500">→</span>

                  <select
                    aria-label="Modulation target"
                    value={route.target}
                    onChange={(e) =>
                      updateRoute(route.id, { target: e.target.value as ModTarget })
                    }
                    className="flex-[1.3] min-w-0 h-7 px-1.5 rounded bg-[#131822] border border-[#263042] text-[11px] text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
                  >
                    {MOD_TARGETS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    aria-label="Remove route"
                    onClick={() => removeRoute(route.id)}
                    className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2 px-0.5">
                  <span className="text-[10px] text-slate-400">Amt</span>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={route.amount}
                    style={{ touchAction: 'none' }}
                    onChange={(e) =>
                      updateRoute(route.id, { amount: parseFloat(e.target.value) })
                    }
                    className="flex-1 accent-amber-400 h-1.5 bg-[#1B2434] rounded-lg cursor-pointer"
                  />
                  <span className="font-mono-num text-[10px] text-amber-300 w-10 text-right">
                    {route.amount > 0 ? '+' : ''}
                    {Math.round(route.amount * 100)}%
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
});
