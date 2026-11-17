import React from 'react';
import { useModTelemetry } from '../audio/transportStore';
import type { AdsrConfig, FilterConfig, FilterMode, LiveModOffsets } from '../types/synth';
import { useModDrag } from './ModDragContext';
import { RotaryKnob } from './RotaryKnob';
import { ToggleSwitch } from './ToggleSwitch';

interface FilterEnvPanelProps {
  filter: FilterConfig;
  ampEnv: AdsrConfig;
  modEnv: AdsrConfig;
  modOffsets?: LiveModOffsets;
  onChangeFilter: (patch: Partial<FilterConfig>) => void;
  onChangeAmpEnv: (patch: Partial<AdsrConfig>) => void;
  onChangeModEnv: (patch: Partial<AdsrConfig>) => void;
}

const FILTER_MODES: { id: FilterMode; label: string }[] = [
  { id: 'lp12', label: 'LP12' },
  { id: 'lp24', label: 'LP24' },
  { id: 'hp12', label: 'HP12' },
  { id: 'hp24', label: 'HP24' },
  { id: 'bp12', label: 'BP12' },
  { id: 'notch', label: 'Notch' },
  { id: 'comb', label: 'Comb' },
  { id: 'formant', label: 'Formant' },
];

function formatHz(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)}k`;
  return `${Math.round(hz)}Hz`;
}

function formatTime(sec: number): string {
  if (sec < 1) return `${Math.round(sec * 1000)}ms`;
  return `${sec.toFixed(2)}s`;
}

const FilterCurveSvg: React.FC<{ filter: FilterConfig; cutoffOffset: number }> = ({
  filter,
  cutoffOffset,
}) => {
  const w = 260;
  const h = 76;
  const effCutoff = Math.max(20, Math.min(20000, filter.cutoff * Math.pow(2, cutoffOffset * 3)));
  const normCut = (Math.log(effCutoff) - Math.log(20)) / (Math.log(20000) - Math.log(20));

  const points: string[] = [];
  const resPeak = Math.min(1, (filter.resonance - 0.5) / 14);
  const steps = 72;

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
        (0.55 + resPeak * 0.35) * Math.exp(-Math.pow(dist / Math.max(0.03, width), 2))
      );
    } else if (filter.mode === 'comb') {
      const ripples = 0.5 + 0.45 * Math.cos((xNorm - normCut) * Math.PI * 10);
      mag = 0.2 + ripples * (0.4 + resPeak * 0.35);
    } else if (filter.mode === 'formant') {
      const p1 = Math.exp(-Math.pow((xNorm - (normCut - 0.12)) / 0.07, 2));
      const p2 = Math.exp(-Math.pow((xNorm - (normCut + 0.16)) / 0.08, 2));
      mag = Math.min(0.95, 0.18 + (p1 * 0.72 + p2 * 0.62) * (0.8 + resPeak * 0.3));
    } else {
      const notchWidth = 0.09 - resPeak * 0.04;
      mag = 0.6 * (1 - 0.92 * Math.exp(-Math.pow(dist / Math.max(0.02, notchWidth), 2)));
    }

    const y = h - 8 - mag * (h - 16);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${w},${h} L 0,${h} Z`;
  const cutoffX = normCut * w;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-16 lg:h-24 rounded-md bg-[#0A0E15] border border-[#242E40]"
    >
      <line x1={0} y1={h * 0.4} x2={w} y2={h * 0.4} stroke="#1B2333" strokeWidth={1} />
      <line
        x1={cutoffX}
        y1={0}
        x2={cutoffX}
        y2={h}
        stroke="#22D3EE"
        strokeOpacity={0.28}
        strokeDasharray="3 3"
      />
      <path
        d={areaPath}
        fill={filter.enabled ? 'rgba(34, 211, 238, 0.14)' : 'rgba(100,116,139,0.08)'}
      />
      <path
        d={linePath}
        fill="none"
        stroke={filter.enabled ? '#22D3EE' : '#475569'}
        strokeWidth={2}
      />
    </svg>
  );
};

const AdsrCurveSvg: React.FC<{ env: AdsrConfig; accentColor: string }> = ({
  env,
  accentColor,
}) => {
  const w = 240;
  const h = 68;
  const pad = 6;
  const uw = w - pad * 2;
  const uh = h - pad * 2;

  const total = Math.max(0.4, env.attack + env.decay + 0.6 + env.release);
  const ax = pad + (env.attack / total) * uw;
  const dx = ax + (env.decay / total) * uw;
  const sx = dx + (0.45 / total) * uw;
  const rx = Math.min(w - pad, sx + (env.release / total) * uw);

  const topY = pad + 4;
  const susY = pad + uh * (1 - env.sustain * 0.9);
  const botY = h - pad;

  const line = `M ${pad},${botY} L ${ax.toFixed(1)},${topY} Q ${(ax + dx) / 2},${susY} ${dx.toFixed(
    1
  )},${susY.toFixed(1)} L ${sx.toFixed(1)},${susY.toFixed(1)} L ${rx.toFixed(1)},${botY}`;
  const area = `${line} L ${pad},${botY} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-14 lg:h-20 rounded-md bg-[#0A0E15] border border-[#242E40]"
    >
      <path d={area} fill={accentColor} fillOpacity={0.14} />
      <path d={line} fill="none" stroke={accentColor} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={ax} cy={topY} r={2.5} fill={accentColor} />
      <circle cx={dx} cy={susY} r={2.5} fill={accentColor} />
      <circle cx={sx} cy={susY} r={2.5} fill={accentColor} />
    </svg>
  );
};

export const FilterEnvPanel: React.FC<FilterEnvPanelProps> = React.memo(({
  filter,
  ampEnv,
  modEnv,
  modOffsets: modOffsetsProp,
  onChangeFilter,
  onChangeAmpEnv,
  onChangeModEnv,
}) => {
  const { modOffsets: storeModOffsets } = useModTelemetry();
  const modOffsets = modOffsetsProp ?? storeModOffsets;
  const { startModDrag } = useModDrag();
  const cutoffMod = modOffsets.FILTER_CUTOFF ?? 0;
  const resMod = modOffsets.FILTER_RES ?? 0;
  const driveMod = modOffsets.FILTER_DRIVE ?? 0;
  const mixMod = modOffsets.FILTER_MIX ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:gap-4 h-full">
      {/* Multimode Filter Module */}
      <section className="flex flex-col justify-between rounded-xl border border-[#263042] bg-[#131822] p-2.5 lg:p-3.5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <ToggleSwitch
            checked={filter.enabled}
            onChange={(enabled) => onChangeFilter({ enabled })}
            label="Filter"
            compact
          />
          <select
            aria-label="Filter Mode"
            value={filter.mode}
            disabled={!filter.enabled}
            onChange={(e) => onChangeFilter({ mode: e.target.value as FilterMode })}
            className="h-8 px-2 rounded-md bg-[#0B0E14] border border-[#263042] text-xs font-medium text-cyan-300 focus:outline-none focus:border-cyan-400 cursor-pointer"
          >
            {FILTER_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <FilterCurveSvg filter={filter} cutoffOffset={cutoffMod} />

        <div className="grid grid-cols-5 gap-0.5 pt-2 mt-2 border-t border-[#1E2736]">
          <RotaryKnob
            label="Cutoff"
            size="sm"
            value={filter.cutoff}
            min={24}
            max={19000}
            logarithmic
            defaultValue={8500}
            disabled={!filter.enabled}
            modOffset={cutoffMod}
            modTarget="FILTER_CUTOFF"
            formatValue={formatHz}
            onChange={(cutoff) => onChangeFilter({ cutoff })}
          />
          <RotaryKnob
            label="Res"
            size="sm"
            value={filter.resonance}
            min={0.1}
            max={20}
            defaultValue={1.5}
            disabled={!filter.enabled}
            modOffset={resMod}
            modTarget="FILTER_RES"
            formatValue={(v) => v.toFixed(1)}
            onChange={(resonance) => onChangeFilter({ resonance })}
          />
          <RotaryKnob
            label="Drive"
            size="sm"
            accent="amber"
            value={filter.drive}
            min={0}
            max={1}
            defaultValue={0.1}
            disabled={!filter.enabled}
            modOffset={driveMod}
            modTarget="FILTER_DRIVE"
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(drive) => onChangeFilter({ drive })}
          />
          <RotaryKnob
            label="Mix"
            size="sm"
            value={filter.mix}
            min={0}
            max={1}
            defaultValue={1.0}
            disabled={!filter.enabled}
            modOffset={mixMod}
            modTarget="FILTER_MIX"
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(mix) => onChangeFilter({ mix })}
          />
          <RotaryKnob
            label="Env Amt"
            size="sm"
            accent="amber"
            bipolar
            value={filter.envAmount}
            min={-1}
            max={1}
            defaultValue={0.25}
            disabled={!filter.enabled}
            formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`}
            onChange={(envAmount) => onChangeFilter({ envAmount })}
          />
        </div>
      </section>

      {/* Amp Envelope (Volume ADSR) */}
      <section className="flex flex-col justify-between rounded-xl border border-[#263042] bg-[#131822] p-2.5 lg:p-3.5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-xs font-semibold tracking-wide text-slate-200">
            Amp Envelope
          </h3>
          <button
            type="button"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => {
              e.preventDefault();
              startModDrag('AMP_ENV', e.clientX, e.clientY);
            }}
            className="px-2 py-0.5 rounded bg-[#0B0E14] border border-cyan-400/40 text-[10px] font-mono-num text-cyan-300 cursor-grab active:cursor-grabbing"
            title="Drag Amp Env onto any knob"
          >
            Drag ENV 1
          </button>
        </div>

        <AdsrCurveSvg env={ampEnv} accentColor="#22D3EE" />

        <div className="grid grid-cols-4 gap-1 pt-2 mt-2 border-t border-[#1E2736]">
          <RotaryKnob
            label="Attack"
            size="md"
            value={ampEnv.attack}
            min={0.002}
            max={3.5}
            logarithmic
            defaultValue={0.01}
            formatValue={formatTime}
            onChange={(attack) => onChangeAmpEnv({ attack })}
          />
          <RotaryKnob
            label="Decay"
            size="md"
            value={ampEnv.decay}
            min={0.005}
            max={4.0}
            logarithmic
            defaultValue={0.28}
            formatValue={formatTime}
            onChange={(decay) => onChangeAmpEnv({ decay })}
          />
          <RotaryKnob
            label="Sustain"
            size="md"
            value={ampEnv.sustain}
            min={0}
            max={1}
            defaultValue={0.78}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(sustain) => onChangeAmpEnv({ sustain })}
          />
          <RotaryKnob
            label="Release"
            size="md"
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

      {/* Mod Envelope */}
      <section className="flex flex-col justify-between rounded-xl border border-[#263042] bg-[#131822] p-2.5 lg:p-3.5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-xs font-semibold tracking-wide text-slate-200">
            Mod Envelope
          </h3>
          <button
            type="button"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => {
              e.preventDefault();
              startModDrag('MOD_ENV', e.clientX, e.clientY);
            }}
            className="px-2 py-0.5 rounded bg-[#0B0E14] border border-amber-400/40 text-[10px] font-mono-num text-amber-300 cursor-grab active:cursor-grabbing"
            title="Drag Mod Env onto any knob"
          >
            Drag ENV 2
          </button>
        </div>

        <AdsrCurveSvg env={modEnv} accentColor="#F59E0B" />

        <div className="grid grid-cols-4 gap-1 pt-2 mt-2 border-t border-[#1E2736]">
          <RotaryKnob
            label="Attack"
            size="md"
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
            label="Decay"
            size="md"
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
            label="Sustain"
            size="md"
            accent="amber"
            value={modEnv.sustain}
            min={0}
            max={1}
            defaultValue={0.2}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(sustain) => onChangeModEnv({ sustain })}
          />
          <RotaryKnob
            label="Release"
            size="md"
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
    </div>
  );
});
