import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, Power, Trash2 } from 'lucide-react';
import { TS666_FX_CATALOG, createTs666FxModule } from '../../audio/ts666/ts666FxEngine';
import type {
  Ts666BusId,
  Ts666FxBuses,
  Ts666FxModule,
  Ts666FxType,
} from '../../types/ts666';
import { Ts666RotaryKnob } from './Ts666RotaryKnob';

interface Ts666InlineFxBayProps {
  fx: Ts666FxBuses;
  activeBus?: Ts666BusId;
  onChangeActiveBus?: (bus: Ts666BusId) => void;
  onChangeFx: (updater: (prev: Ts666FxBuses) => Ts666FxBuses) => void;
}

export const Ts666InlineFxBay: React.FC<Ts666InlineFxBayProps> = React.memo(({
  fx,
  activeBus: controlledBus,
  onChangeActiveBus,
  onChangeFx,
}) => {
  const [localBus, setLocalBus] = useState<Ts666BusId>('main');
  const activeBus = controlledBus ?? localBus;
  const setActiveBus = (bus: Ts666BusId) => {
    setLocalBus(bus);
    onChangeActiveBus?.(bus);
  };

  const [selectedFxId, setSelectedFxId] = useState<string | null>(null);
  const [addChoice, setAddChoice] = useState<Ts666FxType>('cabinet');

  const modules = fx[activeBus];
  const bypassKey =
    activeBus === 'main' ? 'mainBypass' : activeBus === 'bus1' ? 'bus1Bypass' : 'bus2Bypass';
  const isBusBypassed = fx[bypassKey];

  // Pick a non-growl FX to inspect/edit inline in the FX Rack if available
  const nonGrowlModules = modules.filter((m) => m.type !== 'growl_engine');
  const inspectedFx =
    modules.find((m) => m.id === selectedFxId && m.type !== 'growl_engine') ??
    nonGrowlModules[0] ??
    null;

  const updateModules = (nextList: Ts666FxModule[]) => {
    onChangeFx((prev) => ({
      ...prev,
      [activeBus]: nextList,
    }));
  };

  const handleAddFx = (type: Ts666FxType) => {
    const created = createTs666FxModule(type);
    updateModules([...modules, created]);
    if (type !== 'growl_engine') {
      setSelectedFxId(created.id);
    }
  };

  const handleMove = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= modules.length) return;
    const copy = [...modules];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    updateModules(copy);
  };

  const inspectedIdx = inspectedFx
    ? modules.findIndex((m) => m.id === inspectedFx.id)
    : -1;
  const inspectedDef = inspectedFx
    ? TS666_FX_CATALOG.find((c) => c.type === inspectedFx.type)
    : null;

  return (
    <div className="flex flex-col justify-between bg-[#17100A] border border-[#6B4829] rounded p-1 h-full min-h-0 min-w-0 overflow-hidden gap-0.5">
      {/* Header: FX Title + Bus Tabs + Bypass */}
      <div className="flex items-center justify-between gap-0.5 shrink-0 min-w-0">
        <div className="flex items-center gap-0.5 min-w-0 overflow-hidden">
          {(['main', 'bus1', 'bus2'] as Ts666BusId[]).map((bus) => (
            <button
              key={bus}
              type="button"
              onClick={() => setActiveBus(bus)}
              className={`px-1 py-[1px] rounded text-[7px] leading-tight font-display font-bold cursor-pointer border whitespace-nowrap ${
                activeBus === bus
                  ? 'bg-[#D97724] text-[#140B05] border-[#F4B073]'
                  : 'bg-[#0C0704] text-[#A68464] border-[#472E1A]'
              }`}
            >
              {bus === 'main' ? 'MN' : bus === 'bus1' ? 'B1' : 'B2'}({fx[bus].length})
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            onChangeFx((prev) => ({ ...prev, [bypassKey]: !prev[bypassKey] }))
          }
          className={`inline-flex items-center gap-0.5 px-1 py-[1px] rounded text-[7px] leading-tight font-mono-num font-bold cursor-pointer border shrink-0 ${
            isBusBypassed
              ? 'bg-[#DC2626]/30 text-[#FCA5A5] border-[#EF4444]'
              : 'bg-[#26180E] text-[#E08A3C] border-[#664328]'
          }`}
        >
          <Power className="w-2 h-2" />
          <span>{isBusBypassed ? 'BYP' : 'ON'}</span>
        </button>
      </div>

      {/* Add Any of the 16 FX */}
      <div className="flex items-center gap-0.5 shrink-0 min-w-0">
        <select
          aria-label="Select FX to Add"
          value={addChoice}
          onChange={(e) => setAddChoice(e.target.value as Ts666FxType)}
          className="flex-1 min-w-0 bg-[#090503] border border-[#543720] rounded px-1 py-[1px] text-[7.5px] font-mono-num text-[#F5D3B3] cursor-pointer"
        >
          {TS666_FX_CATALOG.map((c) => (
            <option key={c.type} value={c.type}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => handleAddFx(addChoice)}
          className="inline-flex items-center gap-0.5 px-1 py-[1px] rounded bg-[#C96B27] hover:bg-[#D97724] text-[#140B05] text-[7.5px] font-mono-num font-extrabold cursor-pointer shrink-0"
        >
          <Plus className="w-2.5 h-2.5" />
          <span>ADD</span>
        </button>
      </div>

      {/* Single-Row Active Chain Chips (strict height, zero overflow) */}
      <div className="flex items-center gap-0.5 shrink-0 h-[15px] overflow-hidden min-w-0">
        {modules.length === 0 ? (
          <span className="text-[7px] font-mono-num text-[#8A6849] truncate">
            Empty {activeBus.toUpperCase()} chain
          </span>
        ) : (
          modules.slice(0, 4).map((m, i) => {
            const isSelected = inspectedFx?.id === m.id;
            return (
              <div
                key={m.id}
                className={`inline-flex items-center rounded border text-[6.5px] font-mono-num overflow-hidden shrink-0 ${
                  isSelected
                    ? 'border-[#EF4444] bg-[#2D140E]'
                    : 'border-[#4D321D] bg-[#0C0704]'
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    updateModules(
                      modules.map((item, idx) =>
                        idx === i ? { ...item, enabled: !item.enabled } : item
                      )
                    )
                  }
                  className={`px-[3px] leading-tight font-bold cursor-pointer ${
                    m.enabled
                      ? 'bg-[#DC2626] text-white'
                      : 'bg-[#1D120B] text-[#7D6147]'
                  }`}
                >
                  ●
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFxId(m.id)}
                  className="px-1 leading-tight text-[#F5D3B3] hover:text-white cursor-pointer truncate max-w-[44px]"
                >
                  {TS666_FX_CATALOG.find((c) => c.type === m.type)?.shortName ?? m.name}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Selected FX Knob Editor */}
      {inspectedFx && inspectedDef ? (
        <div className="flex-1 min-h-0 flex flex-col justify-between bg-[#0A0503] border border-[#472E1A] rounded p-0.5 overflow-hidden">
          <div className="flex items-center justify-between gap-0.5 shrink-0 min-w-0">
            <span className="text-[7.5px] font-display font-bold text-[#FCA5A5] truncate">
              {inspectedFx.name}
            </span>
            <div className="flex items-center gap-[1px] shrink-0">
              <button
                type="button"
                disabled={inspectedIdx <= 0}
                onClick={() => handleMove(inspectedIdx, -1)}
                className="p-[1px] text-[#B89474] hover:text-white disabled:opacity-30 cursor-pointer"
              >
                <ArrowLeft className="w-2.5 h-2.5" />
              </button>
              <button
                type="button"
                disabled={inspectedIdx >= modules.length - 1}
                onClick={() => handleMove(inspectedIdx, 1)}
                className="p-[1px] text-[#B89474] hover:text-white disabled:opacity-30 cursor-pointer"
              >
                <ArrowRight className="w-2.5 h-2.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  updateModules(modules.filter((item) => item.id !== inspectedFx.id))
                }
                className="p-[1px] text-[#B89474] hover:text-[#EF4444] cursor-pointer"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-0.5 items-center flex-1 min-h-0">
            {inspectedDef.paramDefs.slice(0, 4).map((pDef) => (
              <Ts666RotaryKnob
                key={pDef.key}
                label={pDef.label.slice(0, 5)}
                value={inspectedFx.params[pDef.key] ?? pDef.defaultValue}
                min={pDef.min}
                max={pDef.max}
                step={pDef.step}
                defaultValue={pDef.defaultValue}
                size="2xs"
                accent="copper"
                onChange={(val) =>
                  updateModules(
                    modules.map((item) =>
                      item.id === inspectedFx.id
                        ? { ...item, params: { ...item.params, [pDef.key]: val } }
                        : item
                    )
                  )
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex items-center justify-center bg-[#0A0503] border border-[#472E1A] rounded text-[7.5px] font-mono-num text-[#8A6849] text-center px-1.5">
          Add Cabinet, Tremolo, Reverb or Delay
        </div>
      )}
    </div>
  );
});

