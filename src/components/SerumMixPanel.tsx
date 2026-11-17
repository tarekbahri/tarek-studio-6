import React from 'react';
import type {
  FilterConfig,
  FilterMode,
  LiveModOffsets,
  ModTarget,
  NoiseOscConfig,
  OscillatorConfig,
  SubOscConfig,
  SynthPatch,
} from '../types/synth';
import { RotaryKnob } from './RotaryKnob';

interface SerumMixPanelProps {
  patch: SynthPatch;
  modOffsets?: LiveModOffsets;
  onChangeOsc: (index: 0 | 1 | 2, patch: Partial<OscillatorConfig>) => void;
  onChangeSubOsc: (patch: Partial<SubOscConfig>) => void;
  onChangeNoiseOsc: (patch: Partial<NoiseOscConfig>) => void;
  onChangeFilter: (patch: Partial<FilterConfig>) => void;
  onChangeMasterVolume: (volume: number) => void;
  onChangeGlideMs: (glideMs: number) => void;
  onChangePitchBendRange: (pitchBendRange: number) => void;
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

interface VerticalFaderProps {
  label: string;
  value: number;
  disabled?: boolean;
  accent?: 'mint' | 'cyan' | 'amber';
  modTarget?: ModTarget;
  modOffset?: number;
  onChange: (val: number) => void;
}

const VerticalFader: React.FC<VerticalFaderProps> = ({
  label,
  value,
  disabled = false,
  accent = 'mint',
  modTarget,
  modOffset = 0,
  onChange,
}) => {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const fillColor =
    accent === 'amber'
      ? 'bg-amber-400'
      : accent === 'cyan'
      ? 'bg-cyan-400'
      : 'bg-[#2EE59D]';
  const modPct = Math.max(
    0,
    Math.min(100, Math.round((value + modOffset * 0.5) * 100))
  );

  return (
    <div
      data-mod-target={modTarget}
      className={`flex-1 min-h-[110px] flex flex-col items-center justify-between gap-1 py-1 ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      }`}
    >
      <div className="relative flex-1 w-8 flex items-center justify-center">
        {/* Track */}
        <div className="w-2.5 h-full rounded-full bg-[#0A0C10] border border-[#2B3240] relative overflow-hidden">
          {/* Scale Ticks */}
          {[25, 50, 75].map((tick) => (
            <div
              key={tick}
              className="absolute inset-x-0 h-px bg-[#262D3A]"
              style={{ bottom: `${tick}%` }}
            />
          ))}
          <div
            className={`absolute bottom-0 inset-x-0 transition-[height] duration-75 ${fillColor}`}
            style={{ height: `${pct}%`, opacity: 0.35 }}
          />
          {Math.abs(modOffset) > 0.005 && (
            <div
              className="absolute inset-x-0 h-0.5 bg-amber-400"
              style={{ bottom: `${modPct}%` }}
            />
          )}
        </div>

        {/* Fader Cap */}
        <div
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 w-7 h-3.5 rounded-sm bg-[#2D3340] border border-[#4A5568] shadow pointer-events-none flex items-center justify-center"
          style={{ bottom: `calc(${pct}% - 7px)` }}
        >
          <span className={`w-4 h-0.5 rounded-full ${fillColor}`} />
        </div>

        {/* Vertical Input */}
        <input
          type="range"
          aria-label={label}
          min={0}
          max={1}
          step={0.01}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            touchAction: 'none',
            writingMode: 'vertical-lr',
            direction: 'rtl',
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-ns-resize"
        />
      </div>

      <span className="font-mono-num text-[10px] text-slate-200 leading-none">
        {pct}%
      </span>
    </div>
  );
};

export const SerumMixPanel: React.FC<SerumMixPanelProps> = React.memo(
  ({
    patch,
    modOffsets = {},
    onChangeOsc,
    onChangeSubOsc,
    onChangeNoiseOsc,
    onChangeFilter,
    onChangeMasterVolume,
    onChangeGlideMs,
    onChangePitchBendRange,
  }) => {
    const { oscillators, subOsc, noiseOsc, filter, master } = patch;

    const getModKey = (
      id: 'A' | 'B' | 'C',
      field: 'LEVEL' | 'PITCH'
    ): ModTarget => `OSC_${id}_${field}` as ModTarget;

    return (
      <div className="h-full w-full overflow-x-auto overflow-y-hidden synth-scroll select-none">
        <div className="h-full min-w-[680px] w-full grid grid-cols-7 gap-1.5">
        {/* OSC A, B, C CHANNEL STRIPS */}
        {oscillators.map((osc, idx) => {
          const i = idx as 0 | 1 | 2;
          const accent: 'mint' | 'cyan' = idx === 0 ? 'mint' : 'cyan';
          const badgeColor =
            idx === 0
              ? 'text-[#2EE59D]'
              : idx === 1
              ? 'text-cyan-300'
              : 'text-sky-300';
          return (
            <section
              key={osc.id}
              className={`flex flex-col justify-between rounded-lg border overflow-hidden transition-colors ${
                osc.enabled
                  ? 'bg-[#191D24] border-[#2E3543]'
                  : 'bg-[#13161C] border-[#232833] opacity-75'
              }`}
            >
              <div className="flex items-center justify-between px-2 h-7 bg-[#222731] border-b border-[#2E3543] shrink-0">
                <span
                  className={`font-display text-[11px] font-bold tracking-wider ${badgeColor}`}
                >
                  OSC {osc.id}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={osc.enabled}
                  onClick={() => onChangeOsc(i, { enabled: !osc.enabled })}
                  style={{ touchAction: 'manipulation' }}
                  className={`px-2 h-5 rounded text-[9px] font-bold border cursor-pointer ${
                    osc.enabled
                      ? 'bg-[#2EE59D]/15 border-[#2EE59D]/60 text-[#2EE59D]'
                      : 'bg-[#11141A] border-[#2C3340] text-slate-500'
                  }`}
                >
                  {osc.enabled ? 'ON' : 'MUTE'}
                </button>
              </div>

              <div className="px-1.5 pt-1.5 text-center shrink-0">
                <div className="text-[9.5px] font-medium text-slate-300 truncate bg-[#101319] border border-[#262C38] rounded px-1.5 py-0.5">
                  {osc.wavetableId.replace(/_/g, ' ')}
                </div>
                <div className="flex items-center justify-between text-[9px] font-mono-num text-slate-400 mt-1 px-0.5">
                  <span>Oct {osc.octave > 0 ? `+${osc.octave}` : osc.octave}</span>
                  <span>{osc.unisonVoices}x Uni</span>
                </div>
              </div>

              <div className="flex justify-center py-1 shrink-0">
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
                  onChange={(pan) => onChangeOsc(i, { pan })}
                />
              </div>

              <VerticalFader
                label={`OSC ${osc.id} Level`}
                value={osc.level}
                disabled={!osc.enabled}
                accent={accent}
                modTarget={getModKey(osc.id, 'LEVEL')}
                modOffset={modOffsets[getModKey(osc.id, 'LEVEL')] ?? 0}
                onChange={(level) => onChangeOsc(i, { level })}
              />

              <div className="px-1.5 py-1 bg-[#14171D] border-t border-[#262C38] text-center shrink-0">
                <span className="text-[9px] font-mono-num text-slate-400">
                  → Filter Bus
                </span>
              </div>
            </section>
          );
        })}

        {/* SUB CHANNEL STRIP */}
        <section
          className={`flex flex-col justify-between rounded-lg border overflow-hidden transition-colors ${
            subOsc.enabled
              ? 'bg-[#191D24] border-[#2E3543]'
              : 'bg-[#13161C] border-[#232833] opacity-75'
          }`}
        >
          <div className="flex items-center justify-between px-2 h-7 bg-[#222731] border-b border-[#2E3543] shrink-0">
            <span className="font-display text-[11px] font-bold tracking-wider text-[#2EE59D]">
              SUB
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={subOsc.enabled}
              onClick={() => onChangeSubOsc({ enabled: !subOsc.enabled })}
              style={{ touchAction: 'manipulation' }}
              className={`px-2 h-5 rounded text-[9px] font-bold border cursor-pointer ${
                subOsc.enabled
                  ? 'bg-[#2EE59D]/15 border-[#2EE59D]/60 text-[#2EE59D]'
                  : 'bg-[#11141A] border-[#2C3340] text-slate-500'
              }`}
            >
              {subOsc.enabled ? 'ON' : 'MUTE'}
            </button>
          </div>

          <div className="px-1.5 pt-1.5 space-y-1 shrink-0">
            <div className="grid grid-cols-2 gap-0.5 bg-[#101319] p-0.5 rounded border border-[#262C38]">
              {(['sine', 'triangle', 'saw', 'square'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!subOsc.enabled}
                  onClick={() => onChangeSubOsc({ shape: s })}
                  className={`py-0.5 text-[9px] rounded-xs capitalize cursor-pointer ${
                    subOsc.shape === s
                      ? 'bg-[#2EE59D]/20 text-[#2EE59D]'
                      : 'text-slate-400'
                  }`}
                >
                  {s === 'triangle' ? 'tri' : s === 'square' ? 'sqr' : s}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-0.5 bg-[#101319] p-0.5 rounded border border-[#262C38]">
              {([-2, -1, 0] as const).map((oct) => (
                <button
                  key={oct}
                  type="button"
                  disabled={!subOsc.enabled}
                  onClick={() => onChangeSubOsc({ octave: oct })}
                  className={`py-0.5 text-[9px] font-mono-num rounded-xs cursor-pointer ${
                    subOsc.octave === oct
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-400'
                  }`}
                >
                  {oct}
                </button>
              ))}
            </div>
          </div>

          <VerticalFader
            label="Sub Level"
            value={subOsc.level}
            disabled={!subOsc.enabled}
            accent="amber"
            modTarget="SUB_LEVEL"
            modOffset={modOffsets.SUB_LEVEL ?? 0}
            onChange={(level) => onChangeSubOsc({ level })}
          />

          <div className="p-1 bg-[#14171D] border-t border-[#262C38] shrink-0">
            <button
              type="button"
              disabled={!subOsc.enabled}
              onClick={() => onChangeSubOsc({ directOut: !subOsc.directOut })}
              style={{ touchAction: 'manipulation' }}
              className={`w-full py-1 rounded text-[9px] font-semibold border cursor-pointer ${
                subOsc.directOut
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-[#101319] border-[#262C38] text-slate-400'
              }`}
            >
              {subOsc.directOut ? 'Direct Out' : '→ Filter'}
            </button>
          </div>
        </section>

        {/* NOISE CHANNEL STRIP */}
        <section
          className={`flex flex-col justify-between rounded-lg border overflow-hidden transition-colors ${
            noiseOsc.enabled
              ? 'bg-[#191D24] border-[#2E3543]'
              : 'bg-[#13161C] border-[#232833] opacity-75'
          }`}
        >
          <div className="flex items-center justify-between px-2 h-7 bg-[#222731] border-b border-[#2E3543] shrink-0">
            <span className="font-display text-[11px] font-bold tracking-wider text-amber-300">
              NOISE
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={noiseOsc.enabled}
              onClick={() => onChangeNoiseOsc({ enabled: !noiseOsc.enabled })}
              style={{ touchAction: 'manipulation' }}
              className={`px-2 h-5 rounded text-[9px] font-bold border cursor-pointer ${
                noiseOsc.enabled
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                  : 'bg-[#11141A] border-[#2C3340] text-slate-500'
              }`}
            >
              {noiseOsc.enabled ? 'ON' : 'MUTE'}
            </button>
          </div>

          <div className="px-1.5 pt-1.5 shrink-0">
            <div className="grid grid-cols-2 gap-0.5 bg-[#101319] p-0.5 rounded border border-[#262C38]">
              {(['white', 'pink', 'bright', 'metallic'] as const).map((nt) => (
                <button
                  key={nt}
                  type="button"
                  disabled={!noiseOsc.enabled}
                  onClick={() => onChangeNoiseOsc({ type: nt })}
                  className={`py-0.5 text-[9px] rounded-xs capitalize cursor-pointer ${
                    noiseOsc.type === nt
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-400'
                  }`}
                >
                  {nt === 'metallic' ? 'metal' : nt}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-center py-1 shrink-0">
            <RotaryKnob
              label="Pitch"
              size="xs"
              accent="amber"
              value={noiseOsc.pitch}
              min={0}
              max={1}
              defaultValue={0.75}
              disabled={!noiseOsc.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(pitch) => onChangeNoiseOsc({ pitch })}
            />
          </div>

          <VerticalFader
            label="Noise Level"
            value={noiseOsc.level}
            disabled={!noiseOsc.enabled}
            accent="amber"
            modTarget="NOISE_LEVEL"
            modOffset={modOffsets.NOISE_LEVEL ?? 0}
            onChange={(level) => onChangeNoiseOsc({ level })}
          />

          <div className="px-1.5 py-1 bg-[#14171D] border-t border-[#262C38] text-center shrink-0">
            <span className="text-[9px] font-mono-num text-slate-400">
              → Filter Bus
            </span>
          </div>
        </section>

        {/* FILTER BUS STRIP */}
        <section
          className={`flex flex-col justify-between rounded-lg border overflow-hidden transition-colors ${
            filter.enabled
              ? 'bg-[#191D24] border-[#2E3543]'
              : 'bg-[#13161C] border-[#232833] opacity-75'
          }`}
        >
          <div className="flex items-center justify-between px-2 h-7 bg-[#222731] border-b border-[#2E3543] shrink-0">
            <span className="font-display text-[11px] font-bold tracking-wider text-cyan-300">
              FILTER
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={filter.enabled}
              onClick={() => onChangeFilter({ enabled: !filter.enabled })}
              style={{ touchAction: 'manipulation' }}
              className={`px-2 h-5 rounded text-[9px] font-bold border cursor-pointer ${
                filter.enabled
                  ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300'
                  : 'bg-[#11141A] border-[#2C3340] text-slate-500'
              }`}
            >
              {filter.enabled ? 'ON' : 'BYP'}
            </button>
          </div>

          <div className="px-1.5 pt-1.5 shrink-0">
            <select
              aria-label="Filter Mode"
              value={filter.mode}
              disabled={!filter.enabled}
              onChange={(e) =>
                onChangeFilter({ mode: e.target.value as FilterMode })
              }
              className="w-full h-6 px-1.5 rounded bg-[#101319] border border-[#2C3340] text-[10px] font-medium text-cyan-300"
            >
              {FILTER_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-0.5 px-1 py-1 shrink-0">
            <RotaryKnob
              label="Cutoff"
              size="xs"
              accent="cyan"
              value={filter.cutoff}
              min={24}
              max={19000}
              logarithmic
              defaultValue={8500}
              disabled={!filter.enabled}
              modOffset={modOffsets.FILTER_CUTOFF ?? 0}
              modTarget="FILTER_CUTOFF"
              formatValue={(hz) =>
                hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${Math.round(hz)}`
              }
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
          </div>

          <VerticalFader
            label="Filter Wet Mix"
            value={filter.mix}
            disabled={!filter.enabled}
            accent="cyan"
            modTarget="FILTER_MIX"
            modOffset={modOffsets.FILTER_MIX ?? 0}
            onChange={(mix) => onChangeFilter({ mix })}
          />

          <div className="px-1.5 py-1 bg-[#14171D] border-t border-[#262C38] text-center shrink-0">
            <span className="text-[9px] font-mono-num text-slate-400">
              Drive {Math.round(filter.drive * 100)}%
            </span>
          </div>
        </section>

        {/* MASTER OUT STRIP */}
        <section className="flex flex-col justify-between rounded-lg border border-[#323B4B] bg-[#1C212A] overflow-hidden">
          <div className="flex items-center justify-between px-2 h-7 bg-[#252B37] border-b border-[#323B4B] shrink-0">
            <span className="font-display text-[11px] font-bold tracking-wider text-slate-100">
              MASTER
            </span>
            <span className="text-[9px] font-mono-num text-[#2EE59D]">OUT</span>
          </div>

          <div className="grid grid-cols-2 gap-0.5 px-1 pt-1.5 shrink-0">
            <RotaryKnob
              label="Glide"
              size="xs"
              accent="mint"
              value={master.glideMs}
              min={0}
              max={400}
              step={5}
              defaultValue={0}
              formatValue={(v) => `${Math.round(v)}ms`}
              onChange={(v) => onChangeGlideMs(Math.round(v))}
            />
            <RotaryKnob
              label="PB"
              size="xs"
              accent="mint"
              value={master.pitchBendRange}
              min={1}
              max={12}
              step={1}
              defaultValue={2}
              formatValue={(v) => `${Math.round(v)}st`}
              onChange={(v) => onChangePitchBendRange(Math.round(v))}
            />
          </div>

          <VerticalFader
            label="Master Volume"
            value={master.volume}
            accent="mint"
            modTarget="AMP_LEVEL"
            modOffset={modOffsets.AMP_LEVEL ?? 0}
            onChange={onChangeMasterVolume}
          />

          <div className="px-1.5 py-1 bg-[#14171D] border-t border-[#262C38] text-center shrink-0">
            <span className="text-[9px] font-mono-num text-slate-300">
              Main Stereo
            </span>
          </div>
        </section>
        </div>
      </div>
    );
  }
);
