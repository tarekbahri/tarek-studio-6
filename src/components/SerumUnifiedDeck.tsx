import React, { useMemo, useRef, useState } from 'react';
import { GripVertical, Sliders, Sparkles } from 'lucide-react';
import { makeDefaultMacros } from '../audio/presets';
import { useModTelemetry } from '../audio/transportStore';
import {
  LFO_POINT_COUNT,
  LFO_SYNC_DIVISIONS,
  WAVETABLE_LIST,
  divisionToHz,
  generateLfoPoints,
} from '../audio/wavetables';
import type {
  AdsrConfig,
  FilterConfig,
  FilterMode,
  LfoConfig,
  LfoPresetShape,
  LfoSyncDivision,
  LiveModOffsets,
  ModSource,
  ModTarget,
  NoiseOscConfig,
  OscillatorConfig,
  SubOscConfig,
  SynthMacro,
  SynthPatch,
  WarpMode,
  WavetableId,
} from '../types/synth';
import { MacroAssignModal } from './MacroBar';
import { useModDrag } from './ModDragContext';
import { RotaryKnob } from './RotaryKnob';
import { SpectrumAnalyzer } from './SpectrumAnalyzer';
import { Wavetable3DCanvas } from './Wavetable3DCanvas';

interface SerumUnifiedDeckProps {
  patch: SynthPatch;
  bpm: number;
  modOffsets?: LiveModOffsets;
  lfoPhases?: [number, number, number];
  onChangeOsc: (index: 0 | 1 | 2, patch: Partial<OscillatorConfig>) => void;
  onChangeSubOsc: (patch: Partial<SubOscConfig>) => void;
  onChangeNoiseOsc: (patch: Partial<NoiseOscConfig>) => void;
  onChangeFilter: (patch: Partial<FilterConfig>) => void;
  onChangeAmpEnv: (patch: Partial<AdsrConfig>) => void;
  onChangeModEnv: (patch: Partial<AdsrConfig>) => void;
  onChangeLfo: (index: 0 | 1 | 2, patch: Partial<LfoConfig>) => void;
  onChangeGlideMs: (glideMs: number) => void;
  onChangeMasterVolume: (volume: number) => void;
  onChangePitchBendRange: (pitchBendRange: number) => void;
  onChangeMacro: (
    macroId: 1 | 2 | 3 | 4,
    updater: (prev: SynthMacro) => SynthMacro
  ) => void;
  onOpenMatrix: () => void;
}

const WARP_MODES: { id: WarpMode; label: string }[] = [
  { id: 'none', label: 'Off' },
  { id: 'bend+', label: 'Bend+' },
  { id: 'bend-', label: 'Bend-' },
  { id: 'sync', label: 'Sync' },
  { id: 'pwm', label: 'PWM' },
  { id: 'fm', label: 'FM' },
];

const SUB_SHAPES: { id: SubOscConfig['shape']; label: string }[] = [
  { id: 'sine', label: 'Sin' },
  { id: 'triangle', label: 'Tri' },
  { id: 'saw', label: 'Saw' },
  { id: 'square', label: 'Sqr' },
];

const NOISE_TYPES: { id: NoiseOscConfig['type']; label: string }[] = [
  { id: 'white', label: 'Wht' },
  { id: 'pink', label: 'Pnk' },
  { id: 'bright', label: 'Brt' },
  { id: 'metallic', label: 'Mtl' },
];

const FILTER_MODES: { id: FilterMode; label: string }[] = [
  { id: 'lp12', label: 'LP 12' },
  { id: 'lp24', label: 'LP 24' },
  { id: 'hp12', label: 'HP 12' },
  { id: 'hp24', label: 'HP 24' },
  { id: 'bp12', label: 'BP 12' },
  { id: 'notch', label: 'Notch' },
  { id: 'comb', label: 'Comb' },
  { id: 'formant', label: 'Formant' },
];

const LFO_SHAPES: { id: LfoPresetShape; label: string }[] = [
  { id: 'wobble', label: 'Wobble' },
  { id: 'riddim', label: 'Riddim' },
  { id: 'tearout', label: 'Tearout' },
  { id: 'sine', label: 'Sine' },
  { id: 'triangle', label: 'Tri' },
  { id: 'saw', label: 'Saw' },
  { id: 'ramp', label: 'Ramp' },
  { id: 'square', label: 'Square' },
  { id: 'sh', label: 'S&H' },
];

const TARGET_SHORT_LABEL: Record<ModTarget, string> = {
  FILTER_CUTOFF: 'Cutoff',
  FILTER_RES: 'Res',
  FILTER_DRIVE: 'Drive',
  FILTER_MIX: 'F.Mix',
  OSC_A_PITCH: 'A.Pitch',
  OSC_B_PITCH: 'B.Pitch',
  OSC_C_PITCH: 'C.Pitch',
  OSC_A_WT: 'A.WT',
  OSC_B_WT: 'B.WT',
  OSC_C_WT: 'C.WT',
  OSC_A_WARP: 'A.Warp',
  OSC_B_WARP: 'B.Warp',
  OSC_C_WARP: 'C.Warp',
  OSC_A_LEVEL: 'A.Lvl',
  OSC_B_LEVEL: 'B.Lvl',
  OSC_C_LEVEL: 'C.Lvl',
  SUB_LEVEL: 'Sub',
  NOISE_LEVEL: 'Noise',
  FX_DIST_DRIVE: 'Dist',
  AMP_LEVEL: 'Amp',
  PAN: 'Pan',
};

const MACRO_ACCENT: Record<1 | 2 | 3 | 4, string> = {
  1: 'text-[#2EE59D]',
  2: 'text-cyan-300',
  3: 'text-amber-300',
  4: 'text-rose-300',
};

const MACRO_FILL: Record<1 | 2 | 3 | 4, string> = {
  1: 'bg-[#2EE59D]',
  2: 'bg-cyan-400',
  3: 'bg-amber-400',
  4: 'bg-rose-400',
};

function formatHz(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)}k`;
  return `${Math.round(hz)}`;
}

function formatTime(sec: number): string {
  if (sec < 1) return `${Math.round(sec * 1000)}m`;
  return `${sec.toFixed(1)}s`;
}

const LedPowerButton: React.FC<{
  enabled: boolean;
  label: string;
  accent?: 'mint' | 'cyan' | 'amber';
  onClick: () => void;
}> = ({ enabled, label, accent = 'mint', onClick }) => (
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    onClick={onClick}
    style={{ touchAction: 'manipulation' }}
    className="inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 group"
  >
    <span
      className={`w-2.5 h-2.5 rounded-xs border transition-colors ${
        enabled
          ? accent === 'amber'
            ? 'bg-amber-400 border-amber-200'
            : accent === 'cyan'
            ? 'bg-cyan-400 border-cyan-200'
            : 'bg-[#2EE59D] border-[#A7F3D0]'
          : 'bg-[#0C0E13] border-[#384050]'
      }`}
    />
    <span
      className={`font-display text-[10px] font-bold tracking-wider uppercase transition-colors ${
        enabled ? 'text-slate-100' : 'text-slate-500 group-hover:text-slate-300'
      }`}
    >
      {label}
    </span>
  </button>
);

const CompactFilterCurveSvg: React.FC<{
  filter: FilterConfig;
  cutoffOffset: number;
}> = ({ filter, cutoffOffset }) => {
  const w = 220;
  const h = 76;
  const effCutoff = Math.max(
    20,
    Math.min(20000, filter.cutoff * Math.pow(2, cutoffOffset * 3))
  );
  const normCut =
    (Math.log(effCutoff) - Math.log(20)) / (Math.log(20000) - Math.log(20));

  const points: string[] = [];
  const resPeak = Math.min(1, (filter.resonance - 0.5) / 14);
  const steps = 64;

  for (let i = 0; i <= steps; i++) {
    const xNorm = i / steps;
    const x = xNorm * w;
    const dist = xNorm - normCut;

    let mag = 0.5;
    if (!filter.enabled) {
      mag = 0.5;
    } else if (filter.mode === 'lp12' || filter.mode === 'lp24') {
      const slope = filter.mode === 'lp24' ? 28 : 16;
      const rolloff = dist > 0 ? 1 / (1 + Math.pow(dist * slope, 2)) : 1;
      const bump = resPeak * 0.42 * Math.exp(-Math.pow(dist * 16, 2));
      mag = Math.min(0.95, rolloff * 0.6 + bump);
    } else if (filter.mode === 'hp12' || filter.mode === 'hp24') {
      const slope = filter.mode === 'hp24' ? 28 : 16;
      const rolloff = dist < 0 ? 1 / (1 + Math.pow(-dist * slope, 2)) : 1;
      const bump = resPeak * 0.42 * Math.exp(-Math.pow(dist * 16, 2));
      mag = Math.min(0.95, rolloff * 0.6 + bump);
    } else if (filter.mode === 'bp12') {
      const width = 0.14 - resPeak * 0.08;
      mag = Math.min(
        0.95,
        (0.55 + resPeak * 0.35) *
          Math.exp(-Math.pow(dist / Math.max(0.03, width), 2))
      );
    } else if (filter.mode === 'comb') {
      const ripples = 0.5 + 0.45 * Math.cos((xNorm - normCut) * Math.PI * 10);
      mag = 0.2 + ripples * (0.4 + resPeak * 0.35);
    } else if (filter.mode === 'formant') {
      const p1 = Math.exp(-Math.pow((xNorm - (normCut - 0.12)) / 0.07, 2));
      const p2 = Math.exp(-Math.pow((xNorm - (normCut + 0.16)) / 0.08, 2));
      mag = Math.min(
        0.95,
        0.18 + (p1 * 0.72 + p2 * 0.62) * (0.8 + resPeak * 0.3)
      );
    } else {
      const notchWidth = 0.09 - resPeak * 0.04;
      mag =
        0.6 *
        (1 - 0.92 * Math.exp(-Math.pow(dist / Math.max(0.02, notchWidth), 2)));
    }

    const y = h - 7 - mag * (h - 14);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${w},${h} L 0,${h} Z`;
  const cutoffX = normCut * w;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-full min-h-[42px] rounded bg-[#090B0F] border border-[#262C37]"
    >
      <line x1={0} y1={h * 0.5} x2={w} y2={h * 0.5} stroke="#1B212C" strokeWidth={1} />
      <line
        x1={cutoffX}
        y1={0}
        x2={cutoffX}
        y2={h}
        stroke="#2EE59D"
        strokeOpacity={0.35}
        strokeDasharray="3 3"
      />
      <path
        d={areaPath}
        fill={
          filter.enabled ? 'rgba(46, 229, 157, 0.16)' : 'rgba(100,116,139,0.08)'
        }
      />
      <path
        d={linePath}
        fill="none"
        stroke={filter.enabled ? '#2EE59D' : '#475569'}
        strokeWidth={2}
      />
    </svg>
  );
};

const CompactAdsrSvg: React.FC<{ env: AdsrConfig; accentColor: string }> = ({
  env,
  accentColor,
}) => {
  const w = 200;
  const h = 72;
  const pad = 6;
  const uw = w - pad * 2;
  const uh = h - pad * 2;

  const total = Math.max(0.4, env.attack + env.decay + 0.55 + env.release);
  const ax = pad + (env.attack / total) * uw;
  const dx = ax + (env.decay / total) * uw;
  const sx = dx + (0.42 / total) * uw;
  const rx = Math.min(w - pad, sx + (env.release / total) * uw);

  const topY = pad + 4;
  const susY = pad + uh * (1 - env.sustain * 0.88);
  const botY = h - pad;

  const line = `M ${pad},${botY} L ${ax.toFixed(1)},${topY} Q ${(ax + dx) / 2},${susY} ${dx.toFixed(
    1
  )},${susY.toFixed(1)} L ${sx.toFixed(1)},${susY.toFixed(1)} L ${rx.toFixed(1)},${botY}`;
  const area = `${line} L ${pad},${botY} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-full min-h-[40px] rounded bg-[#090B0F] border border-[#262C37]"
    >
      <line x1={0} y1={h * 0.5} x2={w} y2={h * 0.5} stroke="#191F29" strokeWidth={1} />
      <path d={area} fill={accentColor} fillOpacity={0.16} />
      <path d={line} fill="none" stroke={accentColor} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={ax} cy={topY} r={2.4} fill={accentColor} />
      <circle cx={dx} cy={susY} r={2.4} fill={accentColor} />
      <circle cx={sx} cy={susY} r={2.4} fill={accentColor} />
    </svg>
  );
};

const CompactLfoEditor: React.FC<{
  lfo: LfoConfig;
  phase: number;
  accentColor: string;
  onChangePoints: (points: number[]) => void;
}> = ({ lfo, phase, accentColor, onChangePoints }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drawingRef = useRef(false);
  const lastIdxRef = useRef<number | null>(null);

  const w = 260;
  const h = 76;
  const pad = 6;
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

  const linePath = `M ${coords
    .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' L ')}`;
  const zeroY = lfo.bipolar ? h / 2 : h - pad;
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(
    1
  )},${zeroY} L ${coords[0].x.toFixed(1)},${zeroY} Z`;
  const playX = pad + phase * uw;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
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
      className="w-full h-full min-h-[42px] rounded bg-[#090B0F] border border-[#262C37] cursor-crosshair"
    >
      {[0.25, 0.5, 0.75].map((gx) => (
        <line
          key={gx}
          x1={pad + gx * uw}
          y1={0}
          x2={pad + gx * uw}
          y2={h}
          stroke="#1B212C"
          strokeWidth={1}
          strokeDasharray={gx === 0.5 ? undefined : '2 3'}
        />
      ))}
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#232A37" strokeWidth={1} />
      <path d={areaPath} fill={accentColor} fillOpacity={0.16} />
      <path d={linePath} fill="none" stroke={accentColor} strokeWidth={2} strokeLinejoin="round" />
      {coords.map((c, idx) => (
        <circle key={idx} cx={c.x} cy={c.y} r={2} fill={accentColor} opacity={0.85} />
      ))}
      <line
        x1={playX}
        y1={2}
        x2={playX}
        y2={h - 2}
        stroke="#FFFFFF"
        strokeOpacity={0.78}
        strokeWidth={1.5}
      />
    </svg>
  );
};

interface OscillatorBayProps {
  osc: OscillatorConfig;
  oscIndex: 0 | 1 | 2;
  wtViewMode: '3d' | '2d';
  onToggleViewMode: () => void;
  modOffsets: LiveModOffsets;
  onChangeOsc: (index: 0 | 1 | 2, patch: Partial<OscillatorConfig>) => void;
  accent?: 'mint' | 'cyan';
  className?: string;
  compactKnobGrid?: boolean;
  rightSwitcher?: {
    activeIdx: 1 | 2;
    onSelectIdx: (idx: 1 | 2) => void;
    oscBEnabled: boolean;
    oscCEnabled: boolean;
  };
}

const OscillatorBay: React.FC<OscillatorBayProps> = ({
  osc,
  oscIndex,
  wtViewMode,
  onToggleViewMode,
  modOffsets,
  onChangeOsc,
  accent = 'mint',
  className = '',
  compactKnobGrid = false,
  rightSwitcher,
}) => {
  const getModKey = (
    id: 'A' | 'B' | 'C',
    field: 'WT' | 'WARP' | 'PITCH' | 'LEVEL'
  ): ModTarget => `OSC_${id}_${field}` as ModTarget;

  const wtMod = modOffsets[getModKey(osc.id, 'WT')] ?? 0;
  const warpMod = modOffsets[getModKey(osc.id, 'WARP')] ?? 0;
  const pitchMod = modOffsets[getModKey(osc.id, 'PITCH')] ?? 0;
  const lvlMod = modOffsets[getModKey(osc.id, 'LEVEL')] ?? 0;

  return (
    <section
      className={`flex flex-col min-h-0 rounded-lg border overflow-hidden transition-colors ${
        osc.enabled
          ? 'bg-[#191D24] border-[#2E3543]'
          : 'bg-[#13161C] border-[#232833] opacity-85'
      } ${className}`}
    >
      {/* Serum 2 Header Bar */}
      <div className="flex items-center justify-between gap-1 px-1.5 h-6.5 bg-[#222731] border-b border-[#2E3543] shrink-0">
        <div className="flex items-center gap-1 min-w-0">
          <LedPowerButton
            enabled={osc.enabled}
            label={`OSC ${osc.id}`}
            accent={accent}
            onClick={() => onChangeOsc(oscIndex, { enabled: !osc.enabled })}
          />
          {rightSwitcher && (
            <div className="inline-flex rounded bg-[#101318] p-0.5 border border-[#2B3240] shrink-0 ml-0.5">
              {([1, 2] as const).map((idx) => {
                const label = idx === 1 ? 'B' : 'C';
                const active = rightSwitcher.activeIdx === idx;
                const on =
                  idx === 1
                    ? rightSwitcher.oscBEnabled
                    : rightSwitcher.oscCEnabled;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => rightSwitcher.onSelectIdx(idx)}
                    style={{ touchAction: 'manipulation' }}
                    className={`px-1.5 h-4 text-[9px] font-mono-num font-bold rounded-xs cursor-pointer flex items-center gap-1 ${
                      active
                        ? 'bg-[#2EE59D]/20 text-[#2EE59D]'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        on ? 'bg-[#2EE59D]' : 'bg-slate-700'
                      }`}
                    />
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <select
          aria-label={`Oscillator ${osc.id} Wavetable`}
          value={osc.wavetableId}
          disabled={!osc.enabled}
          onChange={(e) =>
            onChangeOsc(oscIndex, { wavetableId: e.target.value as WavetableId })
          }
          className="flex-1 min-w-0 max-w-[130px] h-5 px-1.5 rounded bg-[#0E1116] border border-[#2E3543] text-[10px] font-medium text-slate-100 focus:outline-none focus:border-[#2EE59D] truncate cursor-pointer"
        >
          {WAVETABLE_LIST.map((wt) => (
            <option key={wt.id} value={wt.id}>
              {wt.name}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 shrink-0">
          <div className="inline-flex rounded bg-[#0E1116] p-0.5 border border-[#2E3543]">
            {[1, 2, 3, 4].map((u) => (
              <button
                key={u}
                type="button"
                disabled={!osc.enabled}
                onClick={() => onChangeOsc(oscIndex, { unisonVoices: u })}
                style={{ touchAction: 'manipulation' }}
                className={`px-1 h-4 text-[9px] font-mono-num rounded-xs cursor-pointer ${
                  osc.unisonVoices === u
                    ? 'bg-[#2EE59D]/20 text-[#2EE59D]'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {u}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onToggleViewMode}
            style={{ touchAction: 'manipulation' }}
            className="px-1.5 h-5 rounded bg-[#0E1116] border border-[#2E3543] text-[9px] font-mono-num font-bold text-[#2EE59D] hover:border-[#2EE59D]/60 cursor-pointer shrink-0"
            title="Toggle 3D / 2D Wavetable Display"
          >
            {wtViewMode.toUpperCase()}
          </button>
        </div>
      </div>

      {/* Wavetable Display on Top */}
      <div className="flex-1 min-h-[44px] p-1 pb-0.5 flex flex-col">
        <Wavetable3DCanvas
          wavetableId={osc.wavetableId}
          wtPosition={osc.wtPosition}
          warpMode={osc.warpMode}
          warpAmount={osc.warpAmount}
          wtModOffset={wtMod}
          warpModOffset={warpMod}
          enabled={osc.enabled}
          viewMode={wtViewMode}
          accentColor={accent}
          onScrubPosition={(wtPosition) => onChangeOsc(oscIndex, { wtPosition })}
          onScrubWarp={(warpAmount) => onChangeOsc(oscIndex, { warpAmount })}
          className="w-full flex-1 min-h-[42px]"
        />
      </div>

      {/* Oscillator Knobs Directly Underneath */}
      <div
        className={`grid gap-x-0.5 gap-y-0.5 px-1 py-1 bg-[#15181F] border-t border-[#262C38] shrink-0 items-center ${
          compactKnobGrid ? 'grid-cols-5' : 'grid-cols-5 xl:grid-cols-9'
        }`}
      >
        <RotaryKnob
          label="WT Pos"
          size="xs"
          accent={accent}
          value={osc.wtPosition}
          min={0}
          max={1}
          defaultValue={0.5}
          disabled={!osc.enabled}
          modOffset={wtMod}
          modTarget={getModKey(osc.id, 'WT')}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(wtPosition) => onChangeOsc(oscIndex, { wtPosition })}
        />

        <div className="flex flex-col items-center justify-center px-0.5">
          <select
            aria-label={`OSC ${osc.id} Warp Mode`}
            value={osc.warpMode}
            disabled={!osc.enabled}
            onChange={(e) =>
              onChangeOsc(oscIndex, { warpMode: e.target.value as WarpMode })
            }
            className="w-full h-6 px-0.5 rounded bg-[#0E1116] border border-[#2E3543] text-[9px] font-medium text-amber-300 focus:outline-none focus:border-amber-400 cursor-pointer"
          >
            {WARP_MODES.map((wm) => (
              <option key={wm.id} value={wm.id}>
                {wm.label}
              </option>
            ))}
          </select>
          <span className="text-[8.5px] text-slate-400 leading-none mt-1">
            Warp
          </span>
        </div>

        <RotaryKnob
          label="W.Amt"
          size="xs"
          accent="amber"
          value={osc.warpAmount}
          min={0}
          max={1}
          defaultValue={0}
          disabled={!osc.enabled || osc.warpMode === 'none'}
          modOffset={warpMod}
          modTarget={getModKey(osc.id, 'WARP')}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(warpAmount) => onChangeOsc(oscIndex, { warpAmount })}
        />

        <RotaryKnob
          label="Oct"
          size="xs"
          accent={accent}
          value={osc.octave}
          min={-3}
          max={3}
          step={1}
          defaultValue={0}
          bipolar
          disabled={!osc.enabled}
          formatValue={(v) => (v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`)}
          onChange={(octave) =>
            onChangeOsc(oscIndex, { octave: Math.round(octave) })
          }
        />

        <RotaryKnob
          label="Semi"
          size="xs"
          accent={accent}
          value={osc.semitone}
          min={-12}
          max={12}
          step={1}
          defaultValue={0}
          bipolar
          disabled={!osc.enabled}
          modOffset={pitchMod}
          modTarget={getModKey(osc.id, 'PITCH')}
          formatValue={(v) => (v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`)}
          onChange={(semitone) =>
            onChangeOsc(oscIndex, { semitone: Math.round(semitone) })
          }
        />

        <RotaryKnob
          label="Detune"
          size="xs"
          accent={accent}
          value={osc.detune}
          min={-100}
          max={100}
          step={1}
          defaultValue={0}
          bipolar
          disabled={!osc.enabled}
          formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}`}
          onChange={(detune) =>
            onChangeOsc(oscIndex, { detune: Math.round(detune) })
          }
        />

        <RotaryKnob
          label="UniDet"
          size="xs"
          accent={accent}
          value={osc.unisonDetune}
          min={0}
          max={1}
          defaultValue={0.25}
          disabled={!osc.enabled || osc.unisonVoices === 1}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(unisonDetune) => onChangeOsc(oscIndex, { unisonDetune })}
        />

        <RotaryKnob
          label="Pan"
          size="xs"
          accent={accent}
          value={osc.pan}
          min={-1}
          max={1}
          defaultValue={0}
          bipolar
          disabled={!osc.enabled}
          formatValue={(v) =>
            Math.abs(v) < 0.03
              ? 'C'
              : v < 0
              ? `L${Math.round(-v * 100)}`
              : `R${Math.round(v * 100)}`
          }
          onChange={(pan) => onChangeOsc(oscIndex, { pan })}
        />

        <RotaryKnob
          label="Level"
          size="xs"
          accent="amber"
          value={osc.level}
          min={0}
          max={1}
          defaultValue={0.8}
          disabled={!osc.enabled}
          modOffset={lvlMod}
          modTarget={getModKey(osc.id, 'LEVEL')}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(level) => onChangeOsc(oscIndex, { level })}
        />
      </div>
    </section>
  );
};

interface LfoModuleCardProps {
  lfo: LfoConfig;
  lfoIndex: 0 | 1 | 2;
  phase: number;
  bpm: number;
  assignedSummary: string;
  className?: string;
  onChangeLfo: (index: 0 | 1 | 2, patch: Partial<LfoConfig>) => void;
  switcher?: {
    activeIdx: 1 | 2;
    onSelectIdx: (idx: 1 | 2) => void;
  };
}

const LfoModuleCard: React.FC<LfoModuleCardProps> = ({
  lfo,
  lfoIndex,
  phase,
  bpm,
  assignedSummary,
  className = '',
  onChangeLfo,
  switcher,
}) => {
  const { startModDrag } = useModDrag();
  const accent: 'mint' | 'amber' | 'cyan' =
    lfo.id === 1 ? 'mint' : lfo.id === 2 ? 'amber' : 'cyan';
  const strokeColor =
    lfo.id === 1 ? '#2EE59D' : lfo.id === 2 ? '#F59E0B' : '#38BDF8';
  const activeHz = lfo.sync ? divisionToHz(lfo.division, bpm) : lfo.rateHz;

  return (
    <section className={`flex flex-col min-h-0 rounded-lg border border-[#2E3543] bg-[#191D24] overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-1 px-1.5 h-6.5 bg-[#222731] border-b border-[#2E3543] shrink-0">
        <div className="flex items-center gap-1 min-w-0">
          {switcher ? (
            <div className="inline-flex rounded bg-[#0E1116] p-0.5 border border-[#2E3543] shrink-0">
              {([1, 2] as const).map((idx) => {
                const num = idx === 1 ? 2 : 3;
                const active = switcher.activeIdx === idx;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => switcher.onSelectIdx(idx)}
                    style={{ touchAction: 'manipulation' }}
                    className={`px-1.5 h-4 text-[9px] font-display font-bold rounded-xs cursor-pointer flex items-center gap-1 ${
                      active
                        ? idx === 1
                          ? 'bg-amber-500/20 text-amber-200'
                          : 'bg-cyan-500/20 text-cyan-200'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    LFO {num}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="font-display text-[10px] font-bold tracking-wider text-[#2EE59D] shrink-0">
              LFO {lfo.id}
            </span>
          )}

          <select
            aria-label={`LFO ${lfo.id} Shape`}
            value={lfo.presetShape}
            onChange={(e) => {
              const shape = e.target.value as LfoPresetShape;
              if (shape === 'custom') return;
              onChangeLfo(lfoIndex, {
                presetShape: shape,
                points: generateLfoPoints(shape),
              });
            }}
            className="h-5 px-1 rounded bg-[#0E1116] border border-[#2E3543] text-[9.5px] font-medium text-slate-200 focus:outline-none focus:border-[#2EE59D] cursor-pointer max-w-[70px]"
          >
            {lfo.presetShape === 'custom' && <option value="custom">Custom</option>}
            {LFO_SHAPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          {assignedSummary && (
            <span
              className="hidden xl:inline text-[9px] font-mono-num text-amber-300/90 truncate"
              title={`Modulating: ${assignedSummary}`}
            >
              → {assignedSummary}
            </span>
          )}
        </div>

        <button
          type="button"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            e.preventDefault();
            startModDrag(`LFO${lfo.id}` as ModSource, e.clientX, e.clientY);
          }}
          title={`Drag LFO ${lfo.id} onto any knob`}
          className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded bg-amber-500/15 border border-amber-400/45 text-amber-300 text-[9px] font-mono-num font-semibold hover:bg-amber-500/25 cursor-grab active:cursor-grabbing whitespace-nowrap shrink-0"
        >
          <GripVertical className="w-2.5 h-2.5" />
          <span>Drag</span>
        </button>
      </div>

      {/* Drawable LFO Graph on Top */}
      <div className="flex-1 min-h-[42px] p-1 pb-0.5 flex flex-col">
        <CompactLfoEditor
          lfo={lfo}
          phase={phase}
          accentColor={strokeColor}
          onChangePoints={(points) =>
            onChangeLfo(lfoIndex, { presetShape: 'custom', points })
          }
        />
      </div>

      {/* LFO Controls Directly Underneath */}
      <div className="flex items-center justify-between gap-1 px-1.5 py-1 bg-[#15181F] border-t border-[#262C38] shrink-0">
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={lfo.sync}
            onClick={() => onChangeLfo(lfoIndex, { sync: !lfo.sync })}
            style={{ touchAction: 'manipulation' }}
            className={`px-1.5 h-5 rounded border text-[9px] font-semibold cursor-pointer whitespace-nowrap ${
              lfo.sync
                ? accent === 'amber'
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                  : accent === 'cyan'
                  ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                  : 'bg-[#2EE59D]/20 border-[#2EE59D]/60 text-[#2EE59D]'
                : 'bg-[#0E1116] border-[#2E3543] text-slate-400'
            }`}
          >
            SYNC
          </button>
          <span className="font-mono-num text-[8.5px] text-slate-400 text-center leading-none">
            {activeHz < 1 ? activeHz.toFixed(2) : activeHz.toFixed(1)}Hz
          </span>
        </div>

        {lfo.sync ? (
          <div className="flex flex-col items-center justify-center min-w-[54px]">
            <select
              aria-label={`LFO ${lfo.id} Tempo Division`}
              value={lfo.division}
              onChange={(e) =>
                onChangeLfo(lfoIndex, {
                  division: e.target.value as LfoSyncDivision,
                })
              }
              className="h-6 px-1 rounded bg-[#0E1116] border border-[#2EE59D]/45 text-[10px] font-mono-num font-semibold text-[#2EE59D] focus:outline-none cursor-pointer"
            >
              {LFO_SYNC_DIVISIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            <span className="text-[8.5px] text-slate-400 leading-none mt-1">
              Rate
            </span>
          </div>
        ) : (
          <RotaryKnob
            label="Rate"
            size="xs"
            accent={accent}
            value={lfo.rateHz}
            min={0.05}
            max={20}
            logarithmic
            defaultValue={2.0}
            formatValue={(v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)}`}
            onChange={(rateHz) => onChangeLfo(lfoIndex, { rateHz })}
          />
        )}

        <RotaryKnob
          label="Depth"
          size="xs"
          accent={accent}
          value={lfo.depth}
          min={0}
          max={1}
          defaultValue={0.75}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(depth) => onChangeLfo(lfoIndex, { depth })}
        />

        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={lfo.bipolar}
            onClick={() => onChangeLfo(lfoIndex, { bipolar: !lfo.bipolar })}
            style={{ touchAction: 'manipulation' }}
            className={`px-1.5 h-5 rounded border text-[9px] font-semibold cursor-pointer whitespace-nowrap ${
              lfo.bipolar
                ? 'bg-[#2EE59D]/18 border-[#2EE59D]/55 text-[#2EE59D]'
                : 'bg-[#0E1116] border-[#2E3543] text-slate-400'
            }`}
          >
            BIP
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={lfo.retrigger}
            onClick={() => onChangeLfo(lfoIndex, { retrigger: !lfo.retrigger })}
            style={{ touchAction: 'manipulation' }}
            className={`px-1.5 h-5 rounded border text-[9px] font-semibold cursor-pointer whitespace-nowrap ${
              lfo.retrigger
                ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                : 'bg-[#0E1116] border-[#2E3543] text-slate-400'
            }`}
          >
            TRIG
          </button>
        </div>
      </div>
    </section>
  );
};

export const SerumUnifiedDeck: React.FC<SerumUnifiedDeckProps> = React.memo(
  ({
    patch,
    bpm,
    modOffsets: modOffsetsProp,
    lfoPhases: lfoPhasesProp,
    onChangeOsc,
    onChangeSubOsc,
    onChangeNoiseOsc,
    onChangeFilter,
    onChangeAmpEnv,
    onChangeModEnv,
    onChangeLfo,
    onChangeGlideMs,
    onChangeMasterVolume,
    onChangePitchBendRange,
    onChangeMacro,
    onOpenMatrix,
  }) => {
    const { modOffsets: storeModOffsets, lfoPhases: storeLfoPhases } =
      useModTelemetry();
    const modOffsets = modOffsetsProp ?? storeModOffsets;
    const lfoPhases = lfoPhasesProp ?? storeLfoPhases;

    const { startModDrag } = useModDrag();

    const [rightOscIdx, setRightOscIdx] = useState<1 | 2>(1);
    const [wtViewA, setWtViewA] = useState<'3d' | '2d'>('3d');
    const [wtViewB, setWtViewB] = useState<'3d' | '2d'>('3d');
    const [wtViewC, setWtViewC] = useState<'3d' | '2d'>('3d');
    const [rightLfoIdx, setRightLfoIdx] = useState<1 | 2>(1);

    const [macroAssignOpen, setMacroAssignOpen] = useState(false);
    const [selectedMacroId, setSelectedMacroId] = useState<1 | 2 | 3 | 4>(1);

    const oscA = patch.oscillators[0];
    const oscB = patch.oscillators[1];
    const oscC = patch.oscillators[2];
    const oscRight = patch.oscillators[rightOscIdx];
    const { subOsc, noiseOsc, filter, ampEnv, modEnv } = patch;
    const lfo1 = patch.lfos[0];
    const lfoRight = patch.lfos[rightLfoIdx];
    const macros = patch.macros ?? makeDefaultMacros();
    const activeRoutes = useMemo(
      () => patch.modMatrix.filter((r) => r.enabled),
      [patch.modMatrix]
    );

    const sourceSummary = useMemo(() => {
      const map: Partial<Record<ModSource, string>> = {};
      for (const src of ['LFO1', 'LFO2', 'LFO3', 'AMP_ENV', 'MOD_ENV'] as ModSource[]) {
        const list = activeRoutes
          .filter((r) => r.source === src)
          .map((r) => TARGET_SHORT_LABEL[r.target] ?? r.target);
        if (list.length > 0) {
          map[src] = list.slice(0, 2).join(', ') + (list.length > 2 ? ` +${list.length - 2}` : '');
        }
      }
      return map;
    }, [activeRoutes]);

    return (
      <>
        <div className="h-full w-full flex flex-col gap-1.5 overflow-hidden select-none">
          {/* UPPER SOUND BAY: SERUM 2 MULTI-OSCILLATOR + SUB/NOISE + FILTER */}
          <div className="flex-[1.14] min-h-0 grid gap-1.5 grid-cols-[1.32fr_1.32fr_0.9fr_1.06fr] lg:grid-cols-[1.22fr_1.22fr_1.22fr_0.88fr_1.08fr]">
            {/* OSC A (Always Visible) */}
            <OscillatorBay
              osc={oscA}
              oscIndex={0}
              wtViewMode={wtViewA}
              onToggleViewMode={() => setWtViewA((m) => (m === '3d' ? '2d' : '3d'))}
              modOffsets={modOffsets}
              onChangeOsc={onChangeOsc}
              accent="mint"
              compactKnobGrid
              className="lg:hidden"
            />
            <OscillatorBay
              osc={oscA}
              oscIndex={0}
              wtViewMode={wtViewA}
              onToggleViewMode={() => setWtViewA((m) => (m === '3d' ? '2d' : '3d'))}
              modOffsets={modOffsets}
              onChangeOsc={onChangeOsc}
              accent="mint"
              compactKnobGrid
              className="hidden lg:flex"
            />

            {/* Compact <1024px: OSC B/C Switchable */}
            <OscillatorBay
              osc={oscRight}
              oscIndex={rightOscIdx}
              wtViewMode={wtViewB}
              onToggleViewMode={() => setWtViewB((m) => (m === '3d' ? '2d' : '3d'))}
              modOffsets={modOffsets}
              onChangeOsc={onChangeOsc}
              accent="cyan"
              compactKnobGrid
              className="lg:hidden"
              rightSwitcher={{
                activeIdx: rightOscIdx,
                onSelectIdx: setRightOscIdx,
                oscBEnabled: oscB.enabled,
                oscCEnabled: oscC.enabled,
              }}
            />

            {/* Wide >=1024px: OSC B & OSC C BOTH VISIBLE AT ONCE (Serum 2 Signature 3-Osc!) */}
            <OscillatorBay
              osc={oscB}
              oscIndex={1}
              wtViewMode={wtViewB}
              onToggleViewMode={() => setWtViewB((m) => (m === '3d' ? '2d' : '3d'))}
              modOffsets={modOffsets}
              onChangeOsc={onChangeOsc}
              accent="cyan"
              compactKnobGrid
              className="hidden lg:flex"
            />
            <OscillatorBay
              osc={oscC}
              oscIndex={2}
              wtViewMode={wtViewC}
              onToggleViewMode={() => setWtViewC((m) => (m === '3d' ? '2d' : '3d'))}
              modOffsets={modOffsets}
              onChangeOsc={onChangeOsc}
              accent="mint"
              compactKnobGrid
              className="hidden lg:flex"
            />

            {/* SUB + NOISE STACK */}
            <div className="flex flex-col gap-1.5 min-h-0">
              {/* SUB OSC */}
              <section
                className={`flex-1 min-h-0 flex flex-col justify-between rounded-lg border overflow-hidden ${
                  subOsc.enabled
                    ? 'bg-[#191D24] border-[#2E3543]'
                    : 'bg-[#13161C] border-[#232833] opacity-85'
                }`}
              >
                <div className="flex items-center justify-between gap-1 px-1.5 h-6 bg-[#222731] border-b border-[#2E3543] shrink-0">
                  <LedPowerButton
                    enabled={subOsc.enabled}
                    label="SUB"
                    accent="mint"
                    onClick={() => onChangeSubOsc({ enabled: !subOsc.enabled })}
                  />
                  <button
                    type="button"
                    disabled={!subOsc.enabled}
                    onClick={() => onChangeSubOsc({ directOut: !subOsc.directOut })}
                    style={{ touchAction: 'manipulation' }}
                    className={`px-1.5 h-4.5 rounded text-[8.5px] font-semibold border cursor-pointer whitespace-nowrap ${
                      subOsc.directOut
                        ? 'bg-[#2EE59D]/20 border-[#2EE59D]/55 text-[#2EE59D]'
                        : 'bg-[#0E1116] border-[#2E3543] text-slate-400'
                    }`}
                    title="Direct Out (bypass filter)"
                  >
                    DIR
                  </button>
                </div>

                <div className="flex-1 min-h-0 flex items-center justify-between gap-1 px-1.5 py-1 bg-[#15181F]">
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <div className="grid grid-cols-4 gap-0.5 bg-[#0E1116] p-0.5 rounded border border-[#2B3240]">
                      {SUB_SHAPES.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          disabled={!subOsc.enabled}
                          onClick={() => onChangeSubOsc({ shape: s.id })}
                          style={{ touchAction: 'manipulation' }}
                          className={`py-0.5 text-[8.5px] font-semibold rounded-xs cursor-pointer ${
                            subOsc.shape === s.id
                              ? 'bg-[#2EE59D]/20 text-[#2EE59D]'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-0.5 bg-[#0E1116] p-0.5 rounded border border-[#2B3240]">
                      {([-2, -1, 0] as const).map((oct) => (
                        <button
                          key={oct}
                          type="button"
                          disabled={!subOsc.enabled}
                          onClick={() => onChangeSubOsc({ octave: oct })}
                          style={{ touchAction: 'manipulation' }}
                          className={`py-0.5 text-[8.5px] font-mono-num font-semibold rounded-xs cursor-pointer ${
                            subOsc.octave === oct
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {oct}
                        </button>
                      ))}
                    </div>
                  </div>

                  <RotaryKnob
                    label="Level"
                    size="xs"
                    accent="amber"
                    value={subOsc.level}
                    min={0}
                    max={1}
                    defaultValue={0.75}
                    disabled={!subOsc.enabled}
                    modOffset={modOffsets.SUB_LEVEL ?? 0}
                    modTarget="SUB_LEVEL"
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    onChange={(level) => onChangeSubOsc({ level })}
                  />
                </div>
              </section>

              {/* NOISE OSC */}
              <section
                className={`flex-1 min-h-0 flex flex-col justify-between rounded-lg border overflow-hidden ${
                  noiseOsc.enabled
                    ? 'bg-[#191D24] border-[#2E3543]'
                    : 'bg-[#13161C] border-[#232833] opacity-85'
                }`}
              >
                <div className="flex items-center justify-between gap-1 px-1.5 h-6 bg-[#222731] border-b border-[#2E3543] shrink-0">
                  <LedPowerButton
                    enabled={noiseOsc.enabled}
                    label="NOISE"
                    accent="amber"
                    onClick={() =>
                      onChangeNoiseOsc({ enabled: !noiseOsc.enabled })
                    }
                  />
                  <div className="grid grid-cols-4 gap-0.5 bg-[#0E1116] p-0.5 rounded border border-[#2B3240]">
                    {NOISE_TYPES.map((nt) => (
                      <button
                        key={nt.id}
                        type="button"
                        disabled={!noiseOsc.enabled}
                        onClick={() => onChangeNoiseOsc({ type: nt.id })}
                        style={{ touchAction: 'manipulation' }}
                        className={`px-1 text-[8px] font-semibold rounded-xs cursor-pointer ${
                          noiseOsc.type === nt.id
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {nt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 min-h-0 flex items-center justify-around px-1.5 py-0.5 bg-[#15181F]">
                  <RotaryKnob
                    label="Pitch"
                    size="xs"
                    accent="cyan"
                    value={noiseOsc.pitch}
                    min={0}
                    max={1}
                    defaultValue={0.75}
                    disabled={!noiseOsc.enabled}
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    onChange={(pitch) => onChangeNoiseOsc({ pitch })}
                  />
                  <RotaryKnob
                    label="Level"
                    size="xs"
                    accent="amber"
                    value={noiseOsc.level}
                    min={0}
                    max={1}
                    defaultValue={0.2}
                    disabled={!noiseOsc.enabled}
                    modOffset={modOffsets.NOISE_LEVEL ?? 0}
                    modTarget="NOISE_LEVEL"
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    onChange={(level) => onChangeNoiseOsc({ level })}
                  />
                </div>
              </section>
            </div>

            {/* FILTER MODULE */}
            <section
              className={`flex flex-col min-h-0 rounded-lg border overflow-hidden ${
                filter.enabled
                  ? 'bg-[#191D24] border-[#2E3543]'
                  : 'bg-[#13161C] border-[#232833] opacity-85'
              }`}
            >
              <div className="flex items-center justify-between gap-1 px-1.5 h-6.5 bg-[#222731] border-b border-[#2E3543] shrink-0">
                <LedPowerButton
                  enabled={filter.enabled}
                  label="FILTER"
                  accent="mint"
                  onClick={() => onChangeFilter({ enabled: !filter.enabled })}
                />
                <select
                  aria-label="Filter Mode"
                  value={filter.mode}
                  disabled={!filter.enabled}
                  onChange={(e) =>
                    onChangeFilter({ mode: e.target.value as FilterMode })
                  }
                  className="h-5 px-1 rounded bg-[#0E1116] border border-[#2E3543] text-[9.5px] font-semibold text-[#2EE59D] focus:outline-none focus:border-[#2EE59D] cursor-pointer max-w-[82px]"
                >
                  {FILTER_MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter Display on Top */}
              <div className="flex-1 min-h-[42px] p-1 pb-0.5 flex flex-col">
                <CompactFilterCurveSvg
                  filter={filter}
                  cutoffOffset={modOffsets.FILTER_CUTOFF ?? 0}
                />
              </div>

              {/* Filter Knobs Directly Underneath */}
              <div className="grid grid-cols-3 xl:grid-cols-5 gap-x-0.5 gap-y-0.5 px-1 py-1 bg-[#15181F] border-t border-[#262C38] shrink-0 items-center">
                <RotaryKnob
                  label="Cutoff"
                  size="xs"
                  accent="mint"
                  value={filter.cutoff}
                  min={24}
                  max={19000}
                  logarithmic
                  defaultValue={8500}
                  disabled={!filter.enabled}
                  modOffset={modOffsets.FILTER_CUTOFF ?? 0}
                  modTarget="FILTER_CUTOFF"
                  formatValue={formatHz}
                  onChange={(cutoff) => onChangeFilter({ cutoff })}
                />
                <RotaryKnob
                  label="Res"
                  size="xs"
                  accent="cyan"
                  value={filter.resonance}
                  min={0.1}
                  max={20}
                  defaultValue={1.5}
                  disabled={!filter.enabled}
                  modOffset={modOffsets.FILTER_RES ?? 0}
                  modTarget="FILTER_RES"
                  formatValue={(v) => v.toFixed(1)}
                  onChange={(resonance) => onChangeFilter({ resonance })}
                />
                <RotaryKnob
                  label="Drive"
                  size="xs"
                  accent="amber"
                  value={filter.drive}
                  min={0}
                  max={1}
                  defaultValue={0.1}
                  disabled={!filter.enabled}
                  modOffset={modOffsets.FILTER_DRIVE ?? 0}
                  modTarget="FILTER_DRIVE"
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  onChange={(drive) => onChangeFilter({ drive })}
                />
                <RotaryKnob
                  label="Mix"
                  size="xs"
                  accent="cyan"
                  value={filter.mix}
                  min={0}
                  max={1}
                  defaultValue={1.0}
                  disabled={!filter.enabled}
                  modOffset={modOffsets.FILTER_MIX ?? 0}
                  modTarget="FILTER_MIX"
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  onChange={(mix) => onChangeFilter({ mix })}
                />
                <RotaryKnob
                  label="Env"
                  size="xs"
                  accent="amber"
                  bipolar
                  value={filter.envAmount}
                  min={-1}
                  max={1}
                  defaultValue={0.25}
                  disabled={!filter.enabled}
                  formatValue={(v) =>
                    `${v > 0 ? '+' : ''}${Math.round(v * 100)}`
                  }
                  onChange={(envAmount) => onChangeFilter({ envAmount })}
                />
              </div>
            </section>
          </div>

          {/* LOWER VISUAL DISPLAY, SPECTRUM & MODULATION BAY (KEPT AT BOTTOM) */}
          <div className="flex-[0.98] min-h-0 grid gap-1.5 grid-cols-[1.05fr_1.05fr_1.35fr_1.35fr_1.35fr_1.1fr]">
            {/* ENV 1 (AMP) */}
            <section className="flex flex-col min-h-0 rounded-lg border border-[#2E3543] bg-[#191D24] overflow-hidden">
              <div className="flex items-center justify-between gap-1 px-1.5 h-6.5 bg-[#222731] border-b border-[#2E3543] shrink-0">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="font-display text-[10px] font-bold tracking-wider text-[#2EE59D]">
                    ENV 1
                  </span>
                  {sourceSummary.AMP_ENV && (
                    <span className="hidden xl:inline text-[8.5px] font-mono-num text-slate-400 truncate">
                      → {sourceSummary.AMP_ENV}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  style={{ touchAction: 'none' }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    startModDrag('AMP_ENV', e.clientX, e.clientY);
                  }}
                  title="Drag ENV 1 onto any knob"
                  className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded bg-[#2EE59D]/15 border border-[#2EE59D]/45 text-[#2EE59D] text-[9px] font-mono-num font-semibold cursor-grab active:cursor-grabbing whitespace-nowrap shrink-0"
                >
                  <GripVertical className="w-2.5 h-2.5" />
                  <span>Drag</span>
                </button>
              </div>

              <div className="flex-1 min-h-[38px] p-1 pb-0.5 flex flex-col">
                <CompactAdsrSvg env={ampEnv} accentColor="#2EE59D" />
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 px-0.5 py-1 bg-[#15181F] border-t border-[#262C38] shrink-0 items-center">
                <RotaryKnob
                  label="Atk"
                  size="xs"
                  accent="mint"
                  value={ampEnv.attack}
                  min={0.002}
                  max={3.5}
                  logarithmic
                  defaultValue={0.01}
                  formatValue={formatTime}
                  onChange={(attack) => onChangeAmpEnv({ attack })}
                />
                <RotaryKnob
                  label="Dec"
                  size="xs"
                  accent="mint"
                  value={ampEnv.decay}
                  min={0.005}
                  max={4.0}
                  logarithmic
                  defaultValue={0.28}
                  formatValue={formatTime}
                  onChange={(decay) => onChangeAmpEnv({ decay })}
                />
                <RotaryKnob
                  label="Sus"
                  size="xs"
                  accent="mint"
                  value={ampEnv.sustain}
                  min={0}
                  max={1}
                  defaultValue={0.78}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  onChange={(sustain) => onChangeAmpEnv({ sustain })}
                />
                <RotaryKnob
                  label="Rel"
                  size="xs"
                  accent="mint"
                  value={ampEnv.release}
                  min={0.005}
                  max={5.0}
                  logarithmic
                  defaultValue={0.32}
                  formatValue={formatTime}
                  onChange={(release) => onChangeAmpEnv({ release })}
                />
              </div>
            </section>

            {/* ENV 2 (MOD) */}
            <section className="flex flex-col min-h-0 rounded-lg border border-[#2E3543] bg-[#191D24] overflow-hidden">
              <div className="flex items-center justify-between gap-1 px-1.5 h-6.5 bg-[#222731] border-b border-[#2E3543] shrink-0">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="font-display text-[10px] font-bold tracking-wider text-amber-300">
                    ENV 2
                  </span>
                  {sourceSummary.MOD_ENV && (
                    <span className="hidden xl:inline text-[8.5px] font-mono-num text-amber-300/80 truncate">
                      → {sourceSummary.MOD_ENV}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  style={{ touchAction: 'none' }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    startModDrag('MOD_ENV', e.clientX, e.clientY);
                  }}
                  title="Drag ENV 2 onto any knob"
                  className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded bg-amber-500/15 border border-amber-400/45 text-amber-300 text-[9px] font-mono-num font-semibold cursor-grab active:cursor-grabbing whitespace-nowrap shrink-0"
                >
                  <GripVertical className="w-2.5 h-2.5" />
                  <span>Drag</span>
                </button>
              </div>

              <div className="flex-1 min-h-[38px] p-1 pb-0.5 flex flex-col">
                <CompactAdsrSvg env={modEnv} accentColor="#F59E0B" />
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 px-0.5 py-1 bg-[#15181F] border-t border-[#262C38] shrink-0 items-center">
                <RotaryKnob
                  label="Atk"
                  size="xs"
                  accent="amber"
                  value={modEnv.attack}
                  min={0.002}
                  max={3.5}
                  logarithmic
                  defaultValue={0.015}
                  formatValue={formatTime}
                  onChange={(attack) => onChangeModEnv({ attack })}
                />
                <RotaryKnob
                  label="Dec"
                  size="xs"
                  accent="amber"
                  value={modEnv.decay}
                  min={0.005}
                  max={4.0}
                  logarithmic
                  defaultValue={0.35}
                  formatValue={formatTime}
                  onChange={(decay) => onChangeModEnv({ decay })}
                />
                <RotaryKnob
                  label="Sus"
                  size="xs"
                  accent="amber"
                  value={modEnv.sustain}
                  min={0}
                  max={1}
                  defaultValue={0.2}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  onChange={(sustain) => onChangeModEnv({ sustain })}
                />
                <RotaryKnob
                  label="Rel"
                  size="xs"
                  accent="amber"
                  value={modEnv.release}
                  min={0.005}
                  max={5.0}
                  logarithmic
                  defaultValue={0.25}
                  formatValue={formatTime}
                  onChange={(release) => onChangeModEnv({ release })}
                />
              </div>
            </section>

            {/* LFO 1 */}
            <LfoModuleCard
              lfo={lfo1}
              lfoIndex={0}
              phase={lfoPhases[0]}
              bpm={bpm}
              assignedSummary={sourceSummary.LFO1 ?? ''}
              onChangeLfo={onChangeLfo}
            />

            {/* LFO 2 / 3 */}
            <LfoModuleCard
              lfo={lfoRight}
              lfoIndex={rightLfoIdx}
              phase={lfoPhases[rightLfoIdx]}
              bpm={bpm}
              assignedSummary={
                sourceSummary[`LFO${lfoRight.id}` as ModSource] ?? ''
              }
              onChangeLfo={onChangeLfo}
              switcher={{
                activeIdx: rightLfoIdx,
                onSelectIdx: setRightLfoIdx,
              }}
            />

            {/* REAL-TIME SPECTRUM ANALYZER, WAVEFORM & OUTPUT VOICING (AT BOTTOM) */}
            <section className="flex flex-col min-h-0 rounded-lg border border-[#2E3543] bg-[#191D24] overflow-hidden">
              <div className="flex items-center justify-between gap-1 px-1.5 h-6.5 bg-[#222731] border-b border-[#2E3543] shrink-0">
                <span className="font-display text-[10px] font-bold tracking-wider text-[#2EE59D] uppercase truncate">
                  Output · Spectrum
                </span>
                <span className="font-mono-num text-[8.5px] text-slate-400 shrink-0">
                  FFT
                </span>
              </div>

              <div className="flex-1 min-h-[44px] p-1 pb-0.5 flex flex-col">
                <SpectrumAnalyzer
                  source="serum"
                  accent="mint"
                  defaultMode="dual"
                  minHz={28}
                  maxHz={18000}
                  label="SERUM OUT"
                  compact
                />
              </div>

              <div className="grid grid-cols-3 gap-0.5 px-1 py-1 bg-[#15181F] border-t border-[#262C38] shrink-0 items-center">
                <RotaryKnob
                  label="Vol"
                  size="xs"
                  accent="mint"
                  value={patch.master.volume}
                  min={0}
                  max={1}
                  defaultValue={0.85}
                  modOffset={modOffsets.AMP_LEVEL ?? 0}
                  modTarget="AMP_LEVEL"
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  onChange={onChangeMasterVolume}
                />
                <RotaryKnob
                  label="Glide"
                  size="xs"
                  accent="cyan"
                  value={patch.master.glideMs}
                  min={0}
                  max={400}
                  step={5}
                  defaultValue={0}
                  formatValue={(v) => `${Math.round(v)}m`}
                  onChange={(v) => onChangeGlideMs(Math.round(v))}
                />
                <RotaryKnob
                  label="PB"
                  size="xs"
                  accent="amber"
                  value={patch.master.pitchBendRange}
                  min={1}
                  max={12}
                  step={1}
                  defaultValue={2}
                  formatValue={(v) => `${Math.round(v)}st`}
                  onChange={(v) => onChangePitchBendRange(Math.round(v))}
                />
              </div>
            </section>

            {/* MODULATION MATRIX LINK & MACROS 1-4 */}
            <section className="flex flex-col min-h-0 rounded-lg border border-[#2E3543] bg-[#191D24] overflow-hidden">
              <div className="flex items-center justify-between gap-1 px-1.5 h-6.5 bg-[#222731] border-b border-[#2E3543] shrink-0">
                <span className="font-display text-[10px] font-bold tracking-wider text-slate-100 uppercase truncate">
                  Mod · Macros
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={onOpenMatrix}
                    title="Open Modulation Matrix"
                    style={{ touchAction: 'manipulation' }}
                    className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded bg-[#0E1116] border border-[#2E3543] text-[9px] font-mono-num text-[#2EE59D] hover:border-[#2EE59D]/55 cursor-pointer whitespace-nowrap"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>{activeRoutes.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMacroAssignOpen(true)}
                    title="Assign Macro Targets"
                    style={{ touchAction: 'manipulation' }}
                    className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded bg-[#0E1116] border border-[#2E3543] text-[9px] font-semibold text-slate-200 hover:text-[#2EE59D] hover:border-[#2EE59D]/55 cursor-pointer whitespace-nowrap"
                  >
                    <Sliders className="w-2.5 h-2.5 text-[#2EE59D]" />
                    <span>M</span>
                  </button>
                </div>
              </div>

              {/* Macros 1-4 */}
              <div className="flex-1 min-h-0 flex flex-col justify-evenly px-1.5 py-1 gap-0.5 bg-[#12151B]">
                {macros.map((macro) => {
                  const pct = Math.round(macro.value * 100);
                  const isNeutral = Math.abs(macro.value - 0.5) < 0.015;
                  return (
                    <div key={macro.id} className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center justify-between gap-1 leading-none">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMacroId(macro.id);
                            setMacroAssignOpen(true);
                          }}
                          className="flex items-center gap-1 min-w-0 text-left cursor-pointer hover:opacity-85"
                        >
                          <span
                            className={`font-mono-num text-[8.5px] font-bold shrink-0 ${MACRO_ACCENT[macro.id]}`}
                          >
                            M{macro.id}
                          </span>
                          <span className="text-[8.5px] font-semibold text-slate-300 truncate uppercase">
                            {macro.name}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onChangeMacro(macro.id, (prev) => ({
                              ...prev,
                              value: 0.5,
                            }))
                          }
                          title="Reset to 50% center"
                          className={`font-mono-num text-[8.5px] shrink-0 cursor-pointer ${
                            isNeutral
                              ? 'text-slate-500'
                              : `${MACRO_ACCENT[macro.id]} font-bold`
                          }`}
                        >
                          {pct}%
                        </button>
                      </div>
                      <div className="relative h-3 flex items-center">
                        <div className="w-full h-1.5 rounded-full bg-[#090B0F] border border-[#262C37] overflow-hidden relative pointer-events-none">
                          <div
                            aria-hidden="true"
                            className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500/70 -translate-x-1/2 z-10"
                          />
                          <div
                            className={`h-full ${MACRO_FILL[macro.id]}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={macro.value}
                          style={{ touchAction: 'none' }}
                          aria-label={`MACRO ${macro.id}: ${macro.name}`}
                          onDoubleClick={() =>
                            onChangeMacro(macro.id, (prev) => ({
                              ...prev,
                              value: 0.5,
                            }))
                          }
                          onChange={(e) => {
                            const nextVal = parseFloat(e.target.value);
                            onChangeMacro(macro.id, (prev) => ({
                              ...prev,
                              value: Number.isFinite(nextVal) ? nextVal : 0.5,
                            }));
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        <MacroAssignModal
          open={macroAssignOpen}
          macros={macros}
          selectedMacroId={selectedMacroId}
          onSelectMacroId={setSelectedMacroId}
          onChangeMacro={onChangeMacro}
          onClose={() => setMacroAssignOpen(false)}
        />
      </>
    );
  }
);
