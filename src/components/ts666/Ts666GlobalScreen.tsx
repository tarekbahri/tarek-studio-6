import React from 'react';
import { GripVertical } from 'lucide-react';
import { TS666_MICROTUNING_SCALES } from '../../audio/ts666/ts666Wavetables';
import type {
  Ts666GlobalConfig,
  Ts666MicrotuningScaleId,
  Ts666ModSource,
  Ts666ModTarget,
  Ts666Oversampling,
} from '../../types/ts666';
import { useTs666ModDrag } from './Ts666ModContext';
import { Ts666RotaryKnob } from './Ts666RotaryKnob';

interface Ts666GlobalScreenProps {
  global: Ts666GlobalConfig;
  chaosXY: [number, number];
  onChangeGlobal: (updater: (prev: Ts666GlobalConfig) => Ts666GlobalConfig) => void;
  onAssignMod: (src: Ts666ModSource, target: Ts666ModTarget) => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const Ts666GlobalScreen: React.FC<Ts666GlobalScreenProps> = ({
  global,
  chaosXY,
  onChangeGlobal,
  onAssignMod,
}) => {
  const { startDrag } = useTs666ModDrag();

  const handleScaleChange = (scaleId: Ts666MicrotuningScaleId) => {
    const found = TS666_MICROTUNING_SCALES.find((s) => s.id === scaleId);
    onChangeGlobal((prev) => ({
      ...prev,
      microtuningScale: scaleId,
      microtuningCents: found ? [...found.cents] : prev.microtuningCents,
    }));
  };

  return (
    <div className="grid grid-cols-12 gap-2 flex-1 min-h-0 p-2 bg-[#0C0F15] overflow-y-auto synth-scroll">
      {/* Left: Audio Quality / Oversampling + Voice Polyphony + Tuning */}
      <div className="col-span-12 md:col-span-4 flex flex-col gap-2 bg-[#131720] border border-[#252D3D] rounded-md p-2.5">
        <h3 className="font-display text-xs font-bold text-cyan-300 border-b border-[#232B3A] pb-1">
          AUDIO QUALITY & VOICING
        </h3>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-mono-num text-slate-400">
            WAVESHAPER OVERSAMPLING (1x / 2x / 4x)
          </span>
          <div className="grid grid-cols-3 gap-1">
            {([1, 2, 4] as Ts666Oversampling[]).map((os) => (
              <button
                key={os}
                type="button"
                onClick={() =>
                  onChangeGlobal((prev) => ({ ...prev, oversampling: os }))
                }
                className={`py-1.5 rounded text-xs font-mono-num font-bold cursor-pointer border ${
                  global.oversampling === os
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400'
                    : 'bg-[#0B0E14] text-slate-400 border-[#222938]'
                }`}
              >
                {os}x {os === 1 ? 'DRAFT' : os === 2 ? 'STD' : 'ULTRA'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex flex-col gap-0.5 flex-1">
            <span className="text-[10px] font-mono-num text-slate-400">
              POLYPHONY VOICES (1–16)
            </span>
            <div className="flex items-center gap-2">
              <input
                aria-label="Polyphony Limit"
                type="range"
                min={1}
                max={16}
                step={1}
                value={global.polyphony}
                onChange={(e) =>
                  onChangeGlobal((prev) => ({
                    ...prev,
                    polyphony: Number(e.target.value),
                  }))
                }
                className="flex-1 accent-cyan-400 cursor-pointer"
              />
              <span className="font-mono-num text-xs font-bold text-cyan-200 w-6 text-right">
                {global.polyphony}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              onChangeGlobal((prev) => ({ ...prev, monoLegato: !prev.monoLegato }))
            }
            className={`px-3 py-1.5 rounded text-xs font-mono-num font-bold cursor-pointer border ${
              global.monoLegato
                ? 'bg-amber-400 text-slate-950 border-amber-300'
                : 'bg-[#0B0E14] text-slate-400 border-[#222938]'
            }`}
          >
            {global.monoLegato ? 'MONO ON' : 'POLY'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[#202736] pt-2">
          <div>
            <div className="text-[10px] font-mono-num text-slate-400">
              MASTER CONCERT TUNING (A4)
            </div>
            <div className="font-mono-num text-sm font-bold text-emerald-300">
              {global.masterTuningHz.toFixed(1)} Hz
            </div>
          </div>
          <Ts666RotaryKnob
            label="A4 HZ"
            value={global.masterTuningHz}
            min={415}
            max={466}
            step={0.5}
            defaultValue={440}
            accent="emerald"
            size="md"
            formatValue={(v) => `${v.toFixed(1)}`}
            onChange={(masterTuningHz) =>
              onChangeGlobal((prev) => ({ ...prev, masterTuningHz }))
            }
          />
        </div>
      </div>

      {/* Middle: Chaos 1 & Chaos 2 Modulation Attractors */}
      <div className="col-span-12 md:col-span-4 flex flex-col gap-2 bg-[#131720] border border-[#252D3D] rounded-md p-2.5">
        <div className="flex items-center justify-between border-b border-[#232B3A] pb-1">
          <h3 className="font-display text-xs font-bold text-amber-300">
            CHAOS 1 & CHAOS 2 MODULATORS
          </h3>
          <div className="flex items-center gap-1">
            {(['CHAOS1', 'CHAOS2'] as const).map((src) => (
              <button
                key={src}
                type="button"
                onPointerDown={(e) => startDrag(src, e, onAssignMod)}
                style={{ touchAction: 'none' }}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/50 text-amber-200 text-[9px] font-mono-num font-bold cursor-grab"
              >
                <GripVertical className="w-2.5 h-2.5" />
                <span>{src === 'CHAOS1' ? 'C1' : 'C2'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Live Attractor Plot */}
        <div className="h-28 bg-[#090C11] border border-[#1E2534] rounded overflow-hidden flex items-center justify-center relative">
          <svg viewBox="-1.2 -1.2 2.4 2.4" className="w-full h-full">
            <line x1={-1.1} y1={0} x2={1.1} y2={0} stroke="#1B2230" strokeWidth={0.02} />
            <line x1={0} y1={-1.1} x2={0} y2={1.1} stroke="#1B2230" strokeWidth={0.02} />
            <circle cx={0} cy={0} r={0.85} fill="none" stroke="#1E2738" strokeWidth={0.02} />
            <circle cx={chaosXY[0]} cy={-chaosXY[1]} r={0.09} fill="#F59E0B" />
          </svg>
          <span className="absolute bottom-1 right-1.5 font-mono-num text-[9px] text-slate-400">
            X:{chaosXY[0].toFixed(2)} Y:{chaosXY[1].toFixed(2)}
          </span>
        </div>

        {/* Chaos 1 & Chaos 2 Params */}
        <div className="grid grid-cols-2 gap-2">
          {(['chaos1', 'chaos2'] as const).map((cKey, idx) => {
            const cfg = global[cKey];
            return (
              <div
                key={cKey}
                className="bg-[#0E1219] border border-[#222938] rounded p-1.5 flex flex-col gap-1"
              >
                <div className="flex items-center justify-between text-[10px] font-mono-num font-bold text-amber-200">
                  <span>CHAOS {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeGlobal((prev) => ({
                        ...prev,
                        [cKey]: { ...prev[cKey], bipolar: !prev[cKey].bipolar },
                      }))
                    }
                    className="px-1 py-0.5 rounded bg-[#182030] text-[8.5px] cursor-pointer"
                  >
                    {cfg.bipolar ? 'BI' : 'UNI'}
                  </button>
                </div>
                <div className="flex items-center justify-around">
                  <Ts666RotaryKnob
                    label="RATE"
                    value={cfg.rateHz}
                    min={0.05}
                    max={20}
                    defaultValue={1.4}
                    logarithmic
                    accent="amber"
                    onChange={(rateHz) =>
                      onChangeGlobal((prev) => ({
                        ...prev,
                        [cKey]: { ...prev[cKey], rateHz },
                      }))
                    }
                  />
                  <Ts666RotaryKnob
                    label="SMOOTH"
                    value={cfg.smooth}
                    min={0}
                    max={1}
                    defaultValue={0.5}
                    accent="amber"
                    onChange={(smooth) =>
                      onChangeGlobal((prev) => ({
                        ...prev,
                        [cKey]: { ...prev[cKey], smooth },
                      }))
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Microtuning Scale & 12-Note Cent Offsets */}
      <div className="col-span-12 md:col-span-4 flex flex-col gap-2 bg-[#131720] border border-[#252D3D] rounded-md p-2.5">
        <div className="flex items-center justify-between border-b border-[#232B3A] pb-1">
          <h3 className="font-display text-xs font-bold text-emerald-300">
            MICROTUNING SCALE TABLE
          </h3>
          <select
            aria-label="Microtuning Scale"
            value={global.microtuningScale}
            onChange={(e) =>
              handleScaleChange(e.target.value as Ts666MicrotuningScaleId)
            }
            className="bg-[#0B0E14] border border-[#263145] rounded px-1.5 py-0.5 text-[10px] font-mono-num text-emerald-200 cursor-pointer"
          >
            {TS666_MICROTUNING_SCALES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-1 flex-1">
          {NOTE_NAMES.map((note, idx) => {
            const centVal = global.microtuningCents[idx] ?? 0;
            return (
              <div
                key={note}
                className="flex items-center gap-1.5 bg-[#0E1219] border border-[#202736] rounded px-1.5 py-0.5 text-[10px] font-mono-num"
              >
                <span className="w-5 font-bold text-slate-300">{note}</span>
                <input
                  aria-label={`${note} Microtuning Cents`}
                  type="range"
                  min={-100}
                  max={100}
                  step={0.5}
                  value={centVal}
                  onChange={(e) => {
                    const nextCents = [...global.microtuningCents];
                    nextCents[idx] = parseFloat(e.target.value);
                    onChangeGlobal((prev) => ({
                      ...prev,
                      microtuningScale: 'custom',
                      microtuningCents: nextCents,
                    }));
                  }}
                  className="flex-1 accent-emerald-400 cursor-pointer"
                />
                <span className="w-10 text-right text-emerald-200">
                  {centVal > 0 ? `+${centVal.toFixed(0)}` : centVal.toFixed(0)}c
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
