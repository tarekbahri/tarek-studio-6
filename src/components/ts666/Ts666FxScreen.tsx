import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, Power, Trash2 } from 'lucide-react';
import { TS666_FX_CATALOG, createTs666FxModule } from '../../audio/ts666/ts666FxEngine';
import type { Ts666BusId, Ts666FxBuses, Ts666FxModule, Ts666FxType } from '../../types/ts666';
import { Ts666RotaryKnob } from './Ts666RotaryKnob';

interface Ts666FxScreenProps {
  fx: Ts666FxBuses;
  onChangeFx: (updater: (prev: Ts666FxBuses) => Ts666FxBuses) => void;
}

export const Ts666FxScreen: React.FC<Ts666FxScreenProps> = ({ fx, onChangeFx }) => {
  const [activeBus, setActiveBus] = useState<Ts666BusId>('main');
  const modules = fx[activeBus];
  const bypassKey =
    activeBus === 'main' ? 'mainBypass' : activeBus === 'bus1' ? 'bus1Bypass' : 'bus2Bypass';
  const isBusBypassed = fx[bypassKey];

  const updateModules = (nextList: Ts666FxModule[]) => {
    onChangeFx((prev) => ({
      ...prev,
      [activeBus]: nextList,
    }));
  };

  const handleAddFx = (type: Ts666FxType) => {
    updateModules([...modules, createTs666FxModule(type)]);
  };

  const handleMove = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= modules.length) return;
    const copy = [...modules];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    updateModules(copy);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 p-2 bg-[#0C0F15] gap-2 overflow-hidden">
      {/* Bus Switcher Bar + 15-Effect Adder Palette */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#131720] border border-[#252D3D] rounded-md px-2.5 py-1.5 shrink-0">
        <div className="flex items-center gap-1.5">
          {(['main', 'bus1', 'bus2'] as Ts666BusId[]).map((bus) => {
            const cnt = fx[bus].length;
            return (
              <button
                key={bus}
                type="button"
                onClick={() => setActiveBus(bus)}
                className={`px-3 py-1 rounded text-xs font-display font-bold cursor-pointer whitespace-nowrap border ${
                  activeBus === bus
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400'
                    : 'bg-[#0B0E14] text-slate-400 border-[#222A3A] hover:text-white'
                }`}
              >
                {bus.toUpperCase()} ({cnt})
              </button>
            );
          })}

          <button
            type="button"
            onClick={() =>
              onChangeFx((prev) => ({ ...prev, [bypassKey]: !prev[bypassKey] }))
            }
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono-num font-bold cursor-pointer border ${
              isBusBypassed
                ? 'bg-rose-500/20 text-rose-300 border-rose-400/60'
                : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/50'
            }`}
          >
            <Power className="w-3 h-3" />
            <span>{isBusBypassed ? 'BUS BYPASSED' : 'BUS ACTIVE'}</span>
          </button>
        </div>

        <div className="text-[11px] font-mono-num text-slate-400">
          3 Independent Stereo FX Paths • 15 Studio Processors
        </div>
      </div>

      {/* 15 FX Quick-Add Strip */}
      <div className="flex flex-wrap items-center gap-1 bg-[#11151E] border border-[#222938] rounded-md p-1.5 shrink-0">
        <span className="text-[10px] font-mono-num font-bold text-slate-400 mr-1">
          ADD FX:
        </span>
        {TS666_FX_CATALOG.map((entry) => (
          <button
            key={entry.type}
            type="button"
            onClick={() => handleAddFx(entry.type)}
            className="inline-flex items-center gap-0.5 px-2 py-1 rounded bg-[#181E2B] hover:bg-[#222B3E] border border-[#2C364A] hover:border-cyan-400/60 text-[10px] font-mono-num text-slate-200 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-2.5 h-2.5 text-cyan-400" />
            <span>{entry.shortName}</span>
          </button>
        ))}
      </div>

      {/* Horizontal Reorderable FX Rack */}
      <div className="flex-1 min-h-0 flex items-stretch gap-2 overflow-x-auto synth-scroll pb-1">
        {modules.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#11151E] border border-dashed border-[#263042] rounded-md text-slate-400 text-xs">
            <p className="font-display font-bold text-slate-300 mb-1">
              {activeBus.toUpperCase()} FX RACK IS EMPTY
            </p>
            <p className="text-[11px] text-slate-500">
              Select any of the 15 processors above to insert into {activeBus.toUpperCase()}.
            </p>
          </div>
        ) : (
          modules.map((mod, idx) => {
            const def = TS666_FX_CATALOG.find((c) => c.type === mod.type);
            return (
              <div
                key={mod.id}
                className={`flex flex-col justify-between min-w-[205px] max-w-[235px] rounded-md border p-2 shrink-0 ${
                  mod.enabled && !isBusBypassed
                    ? 'bg-[#131822] border-[#2C374C]'
                    : 'bg-[#0F131B] border-[#1E2432] opacity-65'
                }`}
              >
                <div className="flex items-center justify-between gap-1 border-b border-[#222A3A] pb-1.5 mb-2">
                  <div className="flex items-center gap-1 min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        updateModules(
                          modules.map((m, i) => (i === idx ? { ...m, enabled: !m.enabled } : m))
                        )
                      }
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono-num font-bold cursor-pointer ${
                        mod.enabled
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-[#1A202C] text-slate-400'
                      }`}
                    >
                      {mod.enabled ? 'ON' : 'OFF'}
                    </button>
                    <span className="font-display text-xs font-bold text-slate-100 truncate">
                      {mod.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMove(idx, -1)}
                      disabled={idx === 0}
                      title="Move Earlier"
                      className="p-0.5 rounded text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowLeft className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 1)}
                      disabled={idx === modules.length - 1}
                      title="Move Later"
                      className="p-0.5 rounded text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowRight className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateModules(modules.filter((_, i) => i !== idx))}
                      title="Remove FX"
                      className="p-0.5 rounded text-slate-400 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 flex-1 items-center">
                  {(def?.paramDefs ?? []).map((pDef) => (
                    <Ts666RotaryKnob
                      key={pDef.key}
                      label={pDef.label}
                      value={mod.params[pDef.key] ?? pDef.defaultValue}
                      min={pDef.min}
                      max={pDef.max}
                      step={pDef.step}
                      defaultValue={pDef.defaultValue}
                      size="sm"
                      accent="cyan"
                      onChange={(val) =>
                        updateModules(
                          modules.map((m, i) =>
                            i === idx ? { ...m, params: { ...m.params, [pDef.key]: val } } : m
                          )
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
