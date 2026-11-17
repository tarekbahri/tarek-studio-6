import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useTs666ChaosXY } from '../../audio/ts666/ts666TelemetryStore';
import { TS666_LFO_SYNC_DIVISIONS, TS666_MICROTUNING_SCALES } from '../../audio/ts666/ts666Wavetables';
import type {
  Ts666ArpConfig,
  Ts666ArpMode,
  Ts666GlobalConfig,
  Ts666LfoSyncDivision,
  Ts666MicrotuningScaleId,
  Ts666ModRoute,
  Ts666ModSource,
  Ts666ModTarget,
  Ts666Oversampling,
} from '../../types/ts666';
import { useTs666ModDrag } from './Ts666ModContext';
import { Ts666RotaryKnob } from './Ts666RotaryKnob';

interface Ts666ModMatrixPanelProps {
  routes: Ts666ModRoute[];
  onChangeRoutes: (next: Ts666ModRoute[]) => void;
}

interface Ts666GlobalSettingsPanelProps {
  global: Ts666GlobalConfig;
  arp: Ts666ArpConfig;
  chaosXY?: [number, number];
  onChangeGlobal: (updater: (prev: Ts666GlobalConfig) => Ts666GlobalConfig) => void;
  onChangeArp: (sub: Partial<Ts666ArpConfig>) => void;
  onAssignMod: (src: Ts666ModSource, target: Ts666ModTarget) => void;
}

interface Ts666InlineModAndGlobalProps {
  routes: Ts666ModRoute[];
  global: Ts666GlobalConfig;
  arp: Ts666ArpConfig;
  chaosXY?: [number, number];
  onChangeRoutes: (next: Ts666ModRoute[]) => void;
  onChangeGlobal: (updater: (prev: Ts666GlobalConfig) => Ts666GlobalConfig) => void;
  onChangeArp: (sub: Partial<Ts666ArpConfig>) => void;
  onAssignMod: (src: Ts666ModSource, target: Ts666ModTarget) => void;
}

const MOD_SOURCES: Ts666ModSource[] = [
  'ENV1', 'ENV2', 'ENV3', 'ENV4',
  'LFO1', 'LFO2', 'LFO3', 'LFO4', 'LFO5',
  'LFO6', 'LFO7', 'LFO8', 'LFO9', 'LFO10',
  'MACRO1', 'MACRO2', 'MACRO3', 'MACRO4',
  'MACRO5', 'MACRO6', 'MACRO7', 'MACRO8',
  'CHAOS1', 'CHAOS2', 'VELOCITY', 'KEYTRACK',
  'MODWHEEL', 'PITCHBEND', 'AFTERTOUCH',
];

const MOD_TARGETS: Ts666ModTarget[] = [
  'F1_CUTOFF', 'F1_RES', 'F1_DRIVE', 'F1_FAT', 'F1_PAN', 'F1_MIX',
  'F2_CUTOFF', 'F2_RES', 'F2_DRIVE', 'F2_FAT', 'F2_PAN', 'F2_MIX',
  'GROWL_CUTOFF', 'GROWL_RES', 'GROWL_DRIVE', 'GROWL_METAL',
  'GROWL_FM', 'GROWL_RATE', 'GROWL_DEPTH', 'GROWL_VOL', 'GROWL_GAIN',
  'OSC_A_WT', 'OSC_A_WARP1', 'OSC_A_WARP2', 'OSC_A_DETUNE', 'OSC_A_PAN', 'OSC_A_LEVEL',
  'OSC_B_WT', 'OSC_B_WARP1', 'OSC_B_DETUNE', 'OSC_B_LEVEL',
  'OSC_C_WT', 'OSC_C_WARP1', 'OSC_C_LEVEL',
  'SUB_LEVEL', 'NOISE_LEVEL', 'NOISE_PITCH', 'MASTER_VOL', 'CHAOS1_RATE', 'CHAOS2_RATE',
];

const MATRIX_PAGE_SIZE = 3;

function formatModTargetLabel(target: Ts666ModTarget): string {
  return target.startsWith('GROWL_') ? target.replace('GROWL_', 'WONKEY_') : target;
}

export const Ts666ModMatrixPanel: React.FC<Ts666ModMatrixPanelProps> = React.memo(({
  routes,
  onChangeRoutes,
}) => {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(routes.length / MATRIX_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const sliceStart = safePage * MATRIX_PAGE_SIZE;
  const visibleRoutes = routes.slice(sliceStart, sliceStart + MATRIX_PAGE_SIZE);

  const handleAddSlot = () => {
    if (routes.length >= 64) return;
    const next: Ts666ModRoute = {
      id: `mat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      enabled: true,
      source: 'LFO1',
      target: 'GROWL_CUTOFF',
      amount: 0.35,
      direction: 'uni',
      curve: 0,
      auxSource: 'NONE',
    };
    const nextAll = [...routes, next];
    onChangeRoutes(nextAll);
    setPage(Math.max(0, Math.ceil(nextAll.length / MATRIX_PAGE_SIZE) - 1));
  };

  const updateAt = (absIdx: number, patch: Partial<Ts666ModRoute>) => {
    onChangeRoutes(routes.map((r, i) => (i === absIdx ? { ...r, ...patch } : r)));
  };

  return (
    <div className="flex flex-col justify-between bg-[#17100A] border border-[#6B4829] rounded p-1.5 h-full min-h-0 min-w-0 overflow-hidden gap-1">
      <div className="flex items-center justify-between gap-1 shrink-0 min-w-0">
        <span className="text-[8.5px] font-display font-extrabold text-[#E08A3C] tracking-wider truncate">
          MOD MATRIX ({routes.length}/64)
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="p-0.5 rounded bg-[#0C0704] border border-[#472E1A] text-[#D9B694] disabled:opacity-30 cursor-pointer"
          >
            <ChevronLeft className="w-2.5 h-2.5" />
          </button>
          <span className="text-[7.5px] font-mono-num text-[#BFA080]">
            {safePage + 1}/{totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="p-0.5 rounded bg-[#0C0704] border border-[#472E1A] text-[#D9B694] disabled:opacity-30 cursor-pointer"
          >
            <ChevronRight className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={handleAddSlot}
            disabled={routes.length >= 64}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#DC2626] hover:bg-[#EF4444] text-white text-[7.5px] font-mono-num font-bold cursor-pointer disabled:opacity-40"
          >
            <Plus className="w-2.5 h-2.5" />
            <span>SLOT</span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col justify-start gap-1 overflow-hidden">
        {visibleRoutes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[8.5px] font-mono-num text-[#8A6849] text-center px-2 bg-[#100905] border border-[#3F2918] rounded">
            Drag ENV / LFO / MACRO / CHAOS onto a knob or tap +SLOT
          </div>
        ) : (
          visibleRoutes.map((r, relIdx) => {
            const absIdx = sliceStart + relIdx;
            return (
              <div
                key={r.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_38px_auto_auto] items-center gap-1 bg-[#0D0704] border border-[#472E1B] rounded px-1 py-0.5 text-[7.5px] font-mono-num"
              >
                <button
                  type="button"
                  onClick={() => updateAt(absIdx, { enabled: !r.enabled })}
                  className={`px-1 rounded font-bold cursor-pointer ${
                    r.enabled
                      ? 'bg-[#DC2626] text-white'
                      : 'bg-[#1D120B] text-[#7D6147]'
                  }`}
                >
                  {absIdx + 1}
                </button>
                <select
                  aria-label={`Mod Slot ${absIdx + 1} Source`}
                  value={r.source}
                  onChange={(e) =>
                    updateAt(absIdx, { source: e.target.value as Ts666ModSource })
                  }
                  className="w-full min-w-0 bg-[#140B06] border border-[#4D321D] rounded px-0.5 py-0.5 text-[#FCA5A5] cursor-pointer"
                >
                  {MOD_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Mod Slot ${absIdx + 1} Target`}
                  value={r.target}
                  onChange={(e) =>
                    updateAt(absIdx, { target: e.target.value as Ts666ModTarget })
                  }
                  className="w-full min-w-0 bg-[#140B06] border border-[#4D321D] rounded px-0.5 py-0.5 text-[#F5D3B3] cursor-pointer"
                >
                  {MOD_TARGETS.map((t) => (
                    <option key={t} value={t}>
                      {formatModTargetLabel(t)}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Mod Slot ${absIdx + 1} Amount`}
                  type="range"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={r.amount}
                  onChange={(e) =>
                    updateAt(absIdx, { amount: parseFloat(e.target.value) })
                  }
                  className="w-full min-w-0 accent-red-500 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateAt(absIdx, {
                      direction: r.direction === 'uni' ? 'bi' : 'uni',
                    })
                  }
                  className="px-1 rounded bg-[#1A100A] border border-[#4D321D] text-[#E08A3C] uppercase cursor-pointer"
                >
                  {r.direction === 'uni' ? 'U' : 'B'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChangeRoutes(routes.filter((_, i) => i !== absIdx))
                  }
                  className="text-[#9A7858] hover:text-[#EF4444] cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});

export const Ts666GlobalSettingsPanel: React.FC<Ts666GlobalSettingsPanelProps> = React.memo(({
  global,
  arp,
  chaosXY: chaosXYProp,
  onChangeGlobal,
  onChangeArp,
  onAssignMod,
}) => {
  const { startDrag } = useTs666ModDrag();
  const storeChaosXY = useTs666ChaosXY();
  const chaosXY = chaosXYProp ?? storeChaosXY;

  return (
    <div className="flex flex-col justify-between bg-[#17100A] border border-[#6B4829] rounded p-1.5 h-full min-h-0 min-w-0 overflow-hidden gap-1">
      {/* Header Row: Global Settings + Oversampling + Poly/Mono + Chaos Drag Handles */}
      <div className="flex items-center justify-between gap-1 shrink-0 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[8.5px] font-display font-extrabold text-[#E08A3C] tracking-wider whitespace-nowrap">
            GLOBAL SETTINGS
          </span>
          <div className="flex items-center gap-0.5">
            {([1, 2, 4] as Ts666Oversampling[]).map((os) => (
              <button
                key={os}
                type="button"
                onClick={() =>
                  onChangeGlobal((prev) => ({ ...prev, oversampling: os }))
                }
                className={`px-1 py-0.5 rounded text-[7px] leading-none font-mono-num font-bold cursor-pointer border ${
                  global.oversampling === os
                    ? 'bg-[#D97724] text-[#140B05] border-[#F4B073]'
                    : 'bg-[#0C0704] text-[#9A7858] border-[#422B1A]'
                }`}
              >
                {os}x
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              onChangeGlobal((prev) => ({ ...prev, monoLegato: !prev.monoLegato }))
            }
            className={`px-1.5 py-0.5 rounded text-[7px] leading-none font-mono-num font-bold cursor-pointer border ${
              global.monoLegato
                ? 'bg-[#DC2626] text-white border-[#FCA5A5]'
                : 'bg-[#0C0704] text-[#E08A3C] border-[#422B1A]'
            }`}
          >
            {global.monoLegato ? 'MONO' : 'POLY'}
          </button>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {(['CHAOS1', 'CHAOS2'] as const).map((src) => (
            <button
              key={src}
              type="button"
              onPointerDown={(e) => startDrag(src, e, onAssignMod)}
              style={{ touchAction: 'none' }}
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-[#DC2626]/20 border border-[#EF4444]/60 text-[#FCA5A5] text-[7px] leading-none font-mono-num font-bold cursor-grab"
            >
              <GripVertical className="w-2 h-2" />
              <span>{src === 'CHAOS1' ? 'C1' : 'C2'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Grid: Voice/Tuning + Chaos XY + Arp */}
      <div className="flex-1 min-h-0 grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-1.5 items-center overflow-hidden">
        {/* Global Knobs: Polyphony, A4 Tuning, Chaos 1 Rate, Chaos 2 Rate */}
        <div className="flex items-center gap-1 shrink-0 bg-[#100905] border border-[#472E1B] rounded px-1.5 py-0.5">
          <Ts666RotaryKnob
            label="POLY"
            value={global.polyphony}
            min={1}
            max={16}
            step={1}
            defaultValue={12}
            size="2xs"
            accent="bronze"
            onChange={(polyphony) =>
              onChangeGlobal((prev) => ({ ...prev, polyphony }))
            }
          />
          <Ts666RotaryKnob
            label="A4 HZ"
            value={global.masterTuningHz}
            min={415}
            max={466}
            step={0.5}
            defaultValue={440}
            size="2xs"
            accent="copper"
            formatValue={(v) => `${Math.round(v)}`}
            onChange={(masterTuningHz) =>
              onChangeGlobal((prev) => ({ ...prev, masterTuningHz }))
            }
          />
          <Ts666RotaryKnob
            label="C1 HZ"
            value={global.chaos1.rateHz}
            min={0.05}
            max={20}
            defaultValue={1.2}
            size="2xs"
            accent="red"
            modTarget="CHAOS1_RATE"
            formatValue={(v) => `${v.toFixed(1)}`}
            onChange={(rateHz) =>
              onChangeGlobal((prev) => ({
                ...prev,
                chaos1: { ...prev.chaos1, rateHz },
              }))
            }
          />
          <Ts666RotaryKnob
            label="C2 HZ"
            value={global.chaos2.rateHz}
            min={0.05}
            max={20}
            defaultValue={2.8}
            size="2xs"
            accent="red"
            modTarget="CHAOS2_RATE"
            formatValue={(v) => `${v.toFixed(1)}`}
            onChange={(rateHz) =>
              onChangeGlobal((prev) => ({
                ...prev,
                chaos2: { ...prev.chaos2, rateHz },
              }))
            }
          />
        </div>

        {/* Microtuning Scale + Chaos XY Vector Scope */}
        <div className="flex items-center gap-1.5 min-w-0 bg-[#100905] border border-[#472E1B] rounded p-1 h-full">
          <div className="w-10 h-10 bg-[#070303] border border-[#6B231C] rounded overflow-hidden shrink-0">
            <svg viewBox="-1.2 -1.2 2.4 2.4" className="w-full h-full">
              <line x1={-1.1} y1={0} x2={1.1} y2={0} stroke="#3B1512" strokeWidth={0.05} />
              <line x1={0} y1={-1.1} x2={0} y2={1.1} stroke="#3B1512" strokeWidth={0.05} />
              <circle cx={chaosXY[0]} cy={-chaosXY[1]} r={0.18} fill="#EF4444" />
            </svg>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-[7px] font-mono-num text-[#BFA080] uppercase">
              Microtuning
            </span>
            <select
              aria-label="Microtuning Scale"
              value={global.microtuningScale}
              onChange={(e) => {
                const id = e.target.value as Ts666MicrotuningScaleId;
                const found = TS666_MICROTUNING_SCALES.find((s) => s.id === id);
                onChangeGlobal((prev) => ({
                  ...prev,
                  microtuningScale: id,
                  microtuningCents: found ? [...found.cents] : prev.microtuningCents,
                }));
              }}
              className="w-full bg-[#090503] border border-[#543720] rounded px-1 py-0.5 text-[8px] font-mono-num text-[#F5D3B3] cursor-pointer"
            >
              {TS666_MICROTUNING_SCALES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Arpeggiator Control Block */}
        <div className="flex flex-col justify-center gap-1 min-w-0 bg-[#100905] border border-[#472E1B] rounded p-1 h-full">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[7px] font-mono-num text-[#BFA080] uppercase">
              ARPEGGIATOR
            </span>
            <button
              type="button"
              onClick={() => onChangeArp({ enabled: !arp.enabled })}
              className={`px-1.5 py-0.5 rounded text-[7px] leading-none font-mono-num font-bold cursor-pointer border ${
                arp.enabled
                  ? 'bg-[#DC2626] text-white border-[#FCA5A5]'
                  : 'bg-[#0C0704] text-[#A68464] border-[#472E1A]'
              }`}
            >
              {arp.enabled ? 'ARP ON' : 'ARP OFF'}
            </button>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <select
              aria-label="Arp Mode"
              value={arp.mode}
              onChange={(e) => onChangeArp({ mode: e.target.value as Ts666ArpMode })}
              className="flex-1 min-w-0 bg-[#090503] border border-[#543720] rounded px-1 py-0.5 text-[8px] font-mono-num text-[#F5D3B3] cursor-pointer"
            >
              <option value="up">Up</option>
              <option value="down">Down</option>
              <option value="up_down">Up/Dn</option>
              <option value="random">Rand</option>
              <option value="chord">Chord</option>
              <option value="order">Order</option>
            </select>
            <select
              aria-label="Arp Division"
              value={arp.division}
              onChange={(e) =>
                onChangeArp({ division: e.target.value as Ts666LfoSyncDivision })
              }
              className="bg-[#090503] border border-[#543720] rounded px-1 py-0.5 text-[8px] font-mono-num text-[#FCA5A5] cursor-pointer shrink-0"
            >
              {TS666_LFO_SYNC_DIVISIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
});

export const Ts666InlineModAndGlobal: React.FC<Ts666InlineModAndGlobalProps> = React.memo(({
  routes,
  global,
  arp,
  chaosXY,
  onChangeRoutes,
  onChangeGlobal,
  onChangeArp,
  onAssignMod,
}) => {
  return (
    <div className="grid grid-rows-[minmax(0,1fr)_auto] gap-1 h-full min-h-0 min-w-0 overflow-hidden">
      <Ts666ModMatrixPanel routes={routes} onChangeRoutes={onChangeRoutes} />
      <Ts666GlobalSettingsPanel
        global={global}
        arp={arp}
        chaosXY={chaosXY}
        onChangeGlobal={onChangeGlobal}
        onChangeArp={onChangeArp}
        onAssignMod={onAssignMod}
      />
    </div>
  );
});

