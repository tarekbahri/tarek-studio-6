import React, { useState } from 'react';
import { useModTelemetry } from '../audio/transportStore';
import { WAVETABLE_LIST } from '../audio/wavetables';
import type {
  LiveModOffsets,
  ModSource,
  ModTarget,
  NoiseOscConfig,
  OscillatorConfig,
  SubOscConfig,
  WarpMode,
  WavetableId,
} from '../types/synth';
import { useModDrag } from './ModDragContext';
import { RotaryKnob } from './RotaryKnob';
import { ToggleSwitch } from './ToggleSwitch';
import { Wavetable3DCanvas } from './Wavetable3DCanvas';

interface OscillatorsPanelProps {
  oscillators: [OscillatorConfig, OscillatorConfig, OscillatorConfig];
  subOsc: SubOscConfig;
  noiseOsc: NoiseOscConfig;
  modOffsets?: LiveModOffsets;
  onChangeOsc: (index: 0 | 1 | 2, patch: Partial<OscillatorConfig>) => void;
  onChangeSubOsc: (patch: Partial<SubOscConfig>) => void;
  onChangeNoiseOsc: (patch: Partial<NoiseOscConfig>) => void;
}

const WARP_MODES: { id: WarpMode; label: string }[] = [
  { id: 'none', label: 'Off' },
  { id: 'bend+', label: 'Bend +' },
  { id: 'bend-', label: 'Bend -' },
  { id: 'sync', label: 'Sync' },
  { id: 'pwm', label: 'PWM' },
  { id: 'fm', label: 'FM Warp' },
];

const SUB_SHAPES: { id: SubOscConfig['shape']; label: string }[] = [
  { id: 'sine', label: 'Sin' },
  { id: 'triangle', label: 'Tri' },
  { id: 'saw', label: 'Saw' },
  { id: 'square', label: 'Sqr' },
];

const NOISE_TYPES: { id: NoiseOscConfig['type']; label: string }[] = [
  { id: 'white', label: 'White' },
  { id: 'pink', label: 'Pink' },
  { id: 'bright', label: 'Bright' },
  { id: 'metallic', label: 'Metal' },
];

const DRAG_SOURCES: { id: ModSource; label: string }[] = [
  { id: 'LFO1', label: 'LFO 1' },
  { id: 'LFO2', label: 'LFO 2' },
  { id: 'LFO3', label: 'LFO 3' },
  { id: 'MOD_ENV', label: 'ENV 2' },
];

export const OscillatorsPanel: React.FC<OscillatorsPanelProps> = React.memo(({
  oscillators,
  subOsc,
  noiseOsc,
  modOffsets: modOffsetsProp,
  onChangeOsc,
  onChangeSubOsc,
  onChangeNoiseOsc,
}) => {
  const { modOffsets: storeModOffsets } = useModTelemetry();
  const modOffsets = modOffsetsProp ?? storeModOffsets;
  const [focusedIdx, setFocusedIdx] = useState<0 | 1 | 2>(0);
  const [wtViewMode, setWtViewMode] = useState<'3d' | '2d'>('3d');
  const { startModDrag } = useModDrag();

  const osc = oscillators[focusedIdx];
  const getModKey = (id: 'A' | 'B' | 'C', field: 'WT' | 'WARP' | 'PITCH' | 'LEVEL'): ModTarget =>
    `OSC_${id}_${field}` as ModTarget;

  const wtMod = modOffsets[getModKey(osc.id, 'WT')] ?? 0;
  const warpMod = modOffsets[getModKey(osc.id, 'WARP')] ?? 0;
  const pitchMod = modOffsets[getModKey(osc.id, 'PITCH')] ?? 0;
  const lvlMod = modOffsets[getModKey(osc.id, 'LEVEL')] ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 lg:gap-3.5 h-full">
      {/* LEFT / CENTER: LARGE SERUM 3D WAVETABLE EDITOR & FOCUSED OSC DECK */}
      <section className="sm:col-span-8 flex flex-col justify-between rounded-xl border border-[#263042] bg-[#131822] p-2.5 lg:p-3.5 min-h-0">
        {/* Top Selector Strip: OSC A / B / C tabs + Power + Wavetable + 3D/2D */}
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-1 bg-[#0B0E14] p-0.5 rounded-lg border border-[#242E40] shrink-0">
            {oscillators.map((o, idx) => {
              const i = idx as 0 | 1 | 2;
              const isFocus = focusedIdx === i;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setFocusedIdx(i)}
                  className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[11px] font-display font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    isFocus
                      ? 'bg-[#1D283B] text-cyan-300 border border-cyan-400/50'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-sm ${
                      o.enabled ? 'bg-cyan-400' : 'bg-slate-700'
                    }`}
                  />
                  <span>OSC {o.id}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <ToggleSwitch
              checked={osc.enabled}
              onChange={(enabled) => onChangeOsc(focusedIdx, { enabled })}
              label={osc.enabled ? 'On' : 'Off'}
              compact
            />

            <select
              aria-label={`Oscillator ${osc.id} Wavetable`}
              value={osc.wavetableId}
              disabled={!osc.enabled}
              onChange={(e) =>
                onChangeOsc(focusedIdx, { wavetableId: e.target.value as WavetableId })
              }
              className="flex-1 min-w-0 h-[34px] px-2.5 rounded-md bg-[#0B0E14] border border-[#263042] text-xs font-medium text-slate-100 focus:outline-none focus:border-cyan-400 truncate cursor-pointer"
            >
              {WAVETABLE_LIST.map((wt) => (
                <option key={wt.id} value={wt.id}>
                  {wt.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setWtViewMode((m) => (m === '3d' ? '2d' : '3d'))}
              className="px-2.5 h-[34px] rounded-md bg-[#0B0E14] border border-[#263042] text-[11px] font-mono-num font-semibold text-cyan-300 hover:border-cyan-400/50 cursor-pointer shrink-0"
              title="Toggle 3D Wavetable Stack / 2D Waveform"
            >
              {wtViewMode.toUpperCase()}
            </button>
          </div>
        </div>

        {/* Central 3D Animated Wavetable Display */}
        <div className="relative flex-1 min-h-[110px] mb-2 flex flex-col">
          <Wavetable3DCanvas
            wavetableId={osc.wavetableId}
            wtPosition={osc.wtPosition}
            warpMode={osc.warpMode}
            warpAmount={osc.warpAmount}
            wtModOffset={wtMod}
            warpModOffset={warpMod}
            enabled={osc.enabled}
            viewMode={wtViewMode}
            onScrubPosition={(wtPosition) => onChangeOsc(focusedIdx, { wtPosition })}
            onScrubWarp={(warpAmount) => onChangeOsc(focusedIdx, { warpAmount })}
            className="w-full flex-1 min-h-[104px]"
          />

          {/* Overlay hint + Unison quick selector */}
          <div className="flex items-center justify-between gap-2 mt-1.5 px-0.5">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                Drag Mod:
              </span>
              {DRAG_SOURCES.map((src) => (
                <button
                  key={src.id}
                  type="button"
                  style={{ touchAction: 'none' }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    startModDrag(src.id, e.clientX, e.clientY);
                  }}
                  title={`Drag ${src.label} onto any knob to modulate`}
                  className="px-2 py-0.5 rounded bg-[#0B0E14] border border-amber-400/40 text-[10px] font-mono-num font-semibold text-amber-300 hover:bg-amber-500/15 cursor-grab active:cursor-grabbing whitespace-nowrap shrink-0"
                >
                  {src.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-slate-400 hidden sm:inline">Unison</span>
              <div className="inline-flex rounded-md bg-[#0B0E14] p-0.5 border border-[#242E40]">
                {[1, 2, 3, 4].map((u) => (
                  <button
                    key={u}
                    type="button"
                    disabled={!osc.enabled}
                    onClick={() => onChangeOsc(focusedIdx, { unisonVoices: u })}
                    className={`px-2 py-0.5 text-[10px] font-mono-num rounded transition-colors cursor-pointer ${
                      osc.unisonVoices === u
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {u}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Focused Oscillator Knobs + Warp Controls */}
        <div className="grid grid-cols-5 sm:grid-cols-9 gap-1 pt-2 border-t border-[#1E2736] items-center">
          <RotaryKnob
            label="WT Pos"
            size="sm"
            value={osc.wtPosition}
            min={0}
            max={1}
            defaultValue={0.5}
            disabled={!osc.enabled}
            modOffset={wtMod}
            modTarget={getModKey(osc.id, 'WT')}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(wtPosition) => onChangeOsc(focusedIdx, { wtPosition })}
          />

          <div className="flex flex-col items-center justify-center col-span-1">
            <select
              aria-label="Warp Mode"
              value={osc.warpMode}
              disabled={!osc.enabled}
              onChange={(e) =>
                onChangeOsc(focusedIdx, { warpMode: e.target.value as WarpMode })
              }
              className="w-full h-8 px-1 rounded bg-[#0B0E14] border border-[#263042] text-[10px] font-medium text-amber-300 focus:outline-none focus:border-amber-400 cursor-pointer"
            >
              {WARP_MODES.map((wm) => (
                <option key={wm.id} value={wm.id}>
                  {wm.label}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-400 mt-1">Warp</span>
          </div>

          <RotaryKnob
            label="Warp Amt"
            size="sm"
            accent="amber"
            value={osc.warpAmount}
            min={0}
            max={1}
            defaultValue={0}
            disabled={!osc.enabled || osc.warpMode === 'none'}
            modOffset={warpMod}
            modTarget={getModKey(osc.id, 'WARP')}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(warpAmount) => onChangeOsc(focusedIdx, { warpAmount })}
          />

          <RotaryKnob
            label="Octave"
            size="sm"
            value={osc.octave}
            min={-3}
            max={3}
            step={1}
            defaultValue={0}
            bipolar
            disabled={!osc.enabled}
            formatValue={(v) => (v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`)}
            onChange={(octave) => onChangeOsc(focusedIdx, { octave: Math.round(octave) })}
          />

          <RotaryKnob
            label="Semi"
            size="sm"
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
            onChange={(semitone) => onChangeOsc(focusedIdx, { semitone: Math.round(semitone) })}
          />

          <RotaryKnob
            label="Detune"
            size="sm"
            value={osc.detune}
            min={-100}
            max={100}
            step={1}
            defaultValue={0}
            bipolar
            disabled={!osc.enabled}
            formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}c`}
            onChange={(detune) => onChangeOsc(focusedIdx, { detune: Math.round(detune) })}
          />

          <RotaryKnob
            label="Uni Det"
            size="sm"
            value={osc.unisonDetune}
            min={0}
            max={1}
            defaultValue={0.25}
            disabled={!osc.enabled || osc.unisonVoices === 1}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(unisonDetune) => onChangeOsc(focusedIdx, { unisonDetune })}
          />

          <RotaryKnob
            label="Pan"
            size="sm"
            value={osc.pan}
            min={-1}
            max={1}
            defaultValue={0}
            bipolar
            disabled={!osc.enabled}
            formatValue={(v) =>
              Math.abs(v) < 0.03 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`
            }
            onChange={(pan) => onChangeOsc(focusedIdx, { pan })}
          />

          <RotaryKnob
            label="Level"
            size="sm"
            accent="amber"
            value={osc.level}
            min={0}
            max={1}
            defaultValue={0.8}
            disabled={!osc.enabled}
            modOffset={lvlMod}
            modTarget={getModKey(osc.id, 'LEVEL')}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(level) => onChangeOsc(focusedIdx, { level })}
          />
        </div>
      </section>

      {/* RIGHT: SUB OSCILLATOR + NOISE OSCILLATOR + QUICK 3-OSC MIX */}
      <div className="sm:col-span-4 flex flex-col gap-2.5 lg:gap-3.5 min-h-0">
        {/* Sub Oscillator */}
        <section
          className={`flex flex-col justify-between rounded-xl border p-2.5 lg:p-3 transition-colors ${
            subOsc.enabled
              ? 'bg-[#131822] border-[#263042]'
              : 'bg-[#10141D] border-[#1D2432] opacity-85'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <ToggleSwitch
              checked={subOsc.enabled}
              onChange={(enabled) => onChangeSubOsc({ enabled })}
              label="SUB OSC"
              compact
            />
            <button
              type="button"
              disabled={!subOsc.enabled}
              onClick={() => onChangeSubOsc({ directOut: !subOsc.directOut })}
              className={`px-2 h-7 rounded text-[10px] font-medium border cursor-pointer whitespace-nowrap ${
                subOsc.directOut
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                  : 'bg-[#0B0E14] border-[#242E40] text-slate-400'
              }`}
              title="Route Sub direct past filter for clean sub weight"
            >
              Direct Out
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-1.5 flex-1">
              <div className="flex items-center gap-0.5 bg-[#0B0E14] p-0.5 rounded border border-[#242E40]">
                {SUB_SHAPES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!subOsc.enabled}
                    onClick={() => onChangeSubOsc({ shape: s.id })}
                    className={`flex-1 py-1 text-[10px] font-medium rounded cursor-pointer ${
                      subOsc.shape === s.id
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                        : 'text-slate-400 border border-transparent'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-0.5 bg-[#0B0E14] p-0.5 rounded border border-[#242E40]">
                {([-2, -1, 0] as const).map((oct) => (
                  <button
                    key={oct}
                    type="button"
                    disabled={!subOsc.enabled}
                    onClick={() => onChangeSubOsc({ octave: oct })}
                    className={`flex-1 py-1 text-[10px] font-mono-num rounded cursor-pointer ${
                      subOsc.octave === oct
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                        : 'text-slate-400 border border-transparent'
                    }`}
                  >
                    {oct === 0 ? '0 Oct' : `${oct} Oct`}
                  </button>
                ))}
              </div>
            </div>

            <RotaryKnob
              label="Sub Lvl"
              size="sm"
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

        {/* Noise Oscillator */}
        <section
          className={`flex flex-col justify-between rounded-xl border p-2.5 lg:p-3 transition-colors ${
            noiseOsc.enabled
              ? 'bg-[#131822] border-[#263042]'
              : 'bg-[#10141D] border-[#1D2432] opacity-85'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <ToggleSwitch
              checked={noiseOsc.enabled}
              onChange={(enabled) => onChangeNoiseOsc({ enabled })}
              label="NOISE"
              accent="amber"
              compact
            />
            <div className="flex items-center gap-0.5 bg-[#0B0E14] p-0.5 rounded border border-[#242E40]">
              {NOISE_TYPES.map((nt) => (
                <button
                  key={nt.id}
                  type="button"
                  disabled={!noiseOsc.enabled}
                  onClick={() => onChangeNoiseOsc({ type: nt.id })}
                  className={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer ${
                    noiseOsc.type === nt.id
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                      : 'text-slate-400 border border-transparent'
                  }`}
                >
                  {nt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-around pt-1 border-t border-[#1E2736]">
            <RotaryKnob
              label="Pitch"
              size="sm"
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
              size="sm"
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

        {/* Quick 3-Oscillator Layer Mixer */}
        <section className="rounded-xl border border-[#263042] bg-[#131822] p-2.5 flex flex-col gap-1.5">
          <span className="text-[10px] font-medium text-slate-400">
            Oscillator Mix Overview
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {oscillators.map((o, idx) => {
              const i = idx as 0 | 1 | 2;
              return (
                <div
                  key={o.id}
                  className={`rounded-md border p-1.5 flex flex-col gap-1 ${
                    focusedIdx === i
                      ? 'bg-[#1A2436] border-cyan-400/50'
                      : 'bg-[#0C1018] border-[#222B3B]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setFocusedIdx(i)}
                      className="text-[10px] font-display font-semibold text-slate-200 hover:text-cyan-300 cursor-pointer"
                    >
                      OSC {o.id}
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeOsc(i, { enabled: !o.enabled })}
                      className={`w-4 h-4 rounded-sm border flex items-center justify-center cursor-pointer ${
                        o.enabled
                          ? 'bg-cyan-400/20 border-cyan-400'
                          : 'bg-[#10151F] border-slate-700'
                      }`}
                      aria-label={`Toggle OSC ${o.id}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-xs ${
                          o.enabled ? 'bg-cyan-300' : 'bg-slate-600'
                        }`}
                      />
                    </button>
                  </div>
                  <input
                    aria-label={`OSC ${o.id} quick level`}
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={o.level}
                    disabled={!o.enabled}
                    style={{ touchAction: 'none' }}
                    onChange={(e) => onChangeOsc(i, { level: parseFloat(e.target.value) })}
                    className="w-full h-1 accent-cyan-400 bg-[#1C2536] rounded cursor-pointer"
                  />
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
});
