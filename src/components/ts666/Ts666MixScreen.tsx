import React from 'react';
import type {
  Ts666BusId,
  Ts666MixChannelConfig,
  Ts666MixConfig,
} from '../../types/ts666';
import { Ts666RotaryKnob } from './Ts666RotaryKnob';

interface Ts666MixScreenProps {
  mix: Ts666MixConfig;
  onChangeMix: (updater: (prev: Ts666MixConfig) => Ts666MixConfig) => void;
}

type MixKey = 'oscA' | 'oscB' | 'oscC' | 'sub' | 'noise' | 'filter1' | 'filter2';

const CHANNEL_META: { key: MixKey; label: string; accent: string }[] = [
  { key: 'oscA', label: 'OSC A', accent: 'text-cyan-300' },
  { key: 'oscB', label: 'OSC B', accent: 'text-cyan-300' },
  { key: 'oscC', label: 'OSC C', accent: 'text-cyan-300' },
  { key: 'sub', label: 'SUB', accent: 'text-blue-300' },
  { key: 'noise', label: 'NOISE', accent: 'text-amber-300' },
  { key: 'filter1', label: 'FILTER 1', accent: 'text-emerald-300' },
  { key: 'filter2', label: 'FILTER 2', accent: 'text-emerald-300' },
];

export const Ts666MixScreen: React.FC<Ts666MixScreenProps> = ({ mix, onChangeMix }) => {
  const updateCh = (key: MixKey, patch: Partial<Ts666MixChannelConfig>) => {
    onChangeMix((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 p-2 bg-[#0C0F15] gap-2 overflow-x-auto synth-scroll">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-display text-sm font-bold text-slate-100">
            MIXER & SIGNAL ROUTING CONSOLE
          </h2>
          <p className="text-[11px] text-slate-400">
            Route OSC A/B/C, SUB, NOISE, and Filter outputs independently into MAIN, BUS 1, or BUS 2 FX paths.
          </p>
        </div>
      </div>

      <div className="flex items-stretch gap-2 flex-1 min-h-0">
        {CHANNEL_META.map(({ key, label, accent }) => {
          const ch = mix[key];
          return (
            <div
              key={key}
              className="flex flex-col items-center justify-between bg-[#131720] border border-[#252D3D] rounded-md p-2 min-w-[92px] flex-1"
            >
              <span className={`font-display text-xs font-bold ${accent}`}>{label}</span>

              {/* Bus Output Selector */}
              <div className="flex flex-col gap-0.5 w-full">
                {(['main', 'bus1', 'bus2'] as Ts666BusId[]).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => updateCh(key, { bus: b })}
                    className={`w-full py-0.5 rounded text-[9px] font-mono-num uppercase cursor-pointer border ${
                      ch.bus === b
                        ? b === 'main'
                          ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/60'
                          : b === 'bus1'
                          ? 'bg-amber-500/20 text-amber-200 border-amber-400/60'
                          : 'bg-violet-500/20 text-violet-200 border-violet-400/60'
                        : 'bg-[#0B0E14] text-slate-400 border-[#202736]'
                    }`}
                  >
                    {b === 'main' ? 'MAIN' : b === 'bus1' ? 'BUS 1' : 'BUS 2'}
                  </button>
                ))}
              </div>

              <Ts666RotaryKnob
                label="PAN"
                value={ch.pan}
                min={-1}
                max={1}
                defaultValue={0}
                bipolar
                size="sm"
                onChange={(pan) => updateCh(key, { pan })}
              />

              {/* Volume Fader */}
              <div className="flex flex-col items-center gap-1 w-full flex-1 justify-center">
                <input
                  aria-label={`${label} Volume`}
                  type="range"
                  min={0}
                  max={1.2}
                  step={0.01}
                  value={ch.volume}
                  style={{
                    writingMode: 'vertical-lr',
                    direction: 'rtl',
                    touchAction: 'none',
                  }}
                  onChange={(e) => updateCh(key, { volume: parseFloat(e.target.value) })}
                  className="h-28 w-5 accent-cyan-400 cursor-pointer"
                />
                <span className="font-mono-num text-[10px] text-slate-200">
                  {Math.round(ch.volume * 100)}%
                </span>
              </div>

              {/* Mute / Solo */}
              <div className="flex items-center gap-1 w-full">
                <button
                  type="button"
                  onClick={() => updateCh(key, { mute: !ch.mute })}
                  className={`flex-1 py-1 rounded text-[10px] font-mono-num font-bold cursor-pointer ${
                    ch.mute
                      ? 'bg-rose-500 text-slate-950'
                      : 'bg-[#0B0E14] text-slate-400 border border-[#222938]'
                  }`}
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => updateCh(key, { solo: !ch.solo })}
                  className={`flex-1 py-1 rounded text-[10px] font-mono-num font-bold cursor-pointer ${
                    ch.solo
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-[#0B0E14] text-slate-400 border border-[#222938]'
                  }`}
                >
                  S
                </button>
              </div>
            </div>
          );
        })}

        {/* BUS 1 RETURN, BUS 2 RETURN, MAIN MASTER */}
        {(
          [
            ['bus1Return', 'BUS 1 RET', 'text-amber-300'],
            ['bus2Return', 'BUS 2 RET', 'text-violet-300'],
          ] as const
        ).map(([bKey, title, color]) => {
          const ret = mix[bKey];
          return (
            <div
              key={bKey}
              className="flex flex-col items-center justify-between bg-[#151A25] border border-[#2C364A] rounded-md p-2 min-w-[94px] flex-1"
            >
              <span className={`font-display text-xs font-bold ${color}`}>{title}</span>
              <span className="text-[9px] font-mono-num text-slate-400">FX RETURN</span>
              <Ts666RotaryKnob
                label="PAN"
                value={ret.pan}
                min={-1}
                max={1}
                defaultValue={0}
                bipolar
                accent="amber"
                size="sm"
                onChange={(pan) =>
                  onChangeMix((prev) => ({ ...prev, [bKey]: { ...prev[bKey], pan } }))
                }
              />
              <div className="flex flex-col items-center gap-1 flex-1 justify-center">
                <input
                  aria-label={`${title} Volume`}
                  type="range"
                  min={0}
                  max={1.2}
                  step={0.01}
                  value={ret.volume}
                  style={{
                    writingMode: 'vertical-lr',
                    direction: 'rtl',
                    touchAction: 'none',
                  }}
                  onChange={(e) =>
                    onChangeMix((prev) => ({
                      ...prev,
                      [bKey]: { ...prev[bKey], volume: parseFloat(e.target.value) },
                    }))
                  }
                  className="h-28 w-5 accent-amber-400 cursor-pointer"
                />
                <span className="font-mono-num text-[10px] text-slate-200">
                  {Math.round(ret.volume * 100)}%
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  onChangeMix((prev) => ({
                    ...prev,
                    [bKey]: { ...prev[bKey], mute: !prev[bKey].mute },
                  }))
                }
                className={`w-full py-1 rounded text-[10px] font-mono-num font-bold cursor-pointer ${
                  ret.mute
                    ? 'bg-rose-500 text-slate-950'
                    : 'bg-[#0B0E14] text-slate-400 border border-[#222938]'
                }`}
              >
                {ret.mute ? 'MUTED' : 'ACTIVE'}
              </button>
            </div>
          );
        })}

        {/* MAIN OUT */}
        <div className="flex flex-col items-center justify-between bg-[#161D29] border border-emerald-500/40 rounded-md p-2 min-w-[96px] flex-1">
          <span className="font-display text-xs font-bold text-emerald-300">MAIN OUT</span>
          <span className="text-[9px] font-mono-num text-slate-400">MASTER SUM</span>
          <div className="flex flex-col items-center gap-1 flex-1 justify-center">
            <input
              aria-label="Main Mix Level"
              type="range"
              min={0}
              max={1.4}
              step={0.01}
              value={mix.mainLevel}
              style={{
                writingMode: 'vertical-lr',
                direction: 'rtl',
                touchAction: 'none',
              }}
              onChange={(e) =>
                onChangeMix((prev) => ({
                  ...prev,
                  mainLevel: parseFloat(e.target.value),
                }))
              }
              className="h-32 w-5 accent-emerald-400 cursor-pointer"
            />
            <span className="font-mono-num text-[11px] font-bold text-emerald-200">
              {Math.round(mix.mainLevel * 100)}%
            </span>
          </div>
          <span className="text-[9px] font-mono-num text-emerald-300/80">LIMITER ON</span>
        </div>
      </div>
    </div>
  );
};
