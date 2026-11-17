import React, { useState } from 'react';
import { Plus, RotateCcw, Sliders, Trash2, X } from 'lucide-react';
import type { MacroBinding, MacroTarget, SynthMacro } from '../types/synth';

interface MacroBarProps {
  macros: [SynthMacro, SynthMacro, SynthMacro, SynthMacro];
  onChangeMacro: (
    macroId: 1 | 2 | 3 | 4,
    updater: (prev: SynthMacro) => SynthMacro
  ) => void;
}

export const MACRO_TARGET_OPTIONS: {
  value: MacroTarget;
  label: string;
  group: string;
}[] = [
  { value: 'WOBBLE_SPEED', label: 'Wobble Speed (LFO 1 & 2)', group: 'LFO & Motion' },
  { value: 'LFO1_DEPTH', label: 'LFO 1 Depth', group: 'LFO & Motion' },
  { value: 'LFO2_DEPTH', label: 'LFO 2 Depth', group: 'LFO & Motion' },
  { value: 'FILTER_MOVEMENT', label: 'Filter Movement (Cutoff + LFO)', group: 'Filter' },
  { value: 'FILTER_CUTOFF', label: 'Filter Cutoff', group: 'Filter' },
  { value: 'FILTER_RES', label: 'Filter Resonance', group: 'Filter' },
  { value: 'FILTER_DRIVE', label: 'Filter Drive', group: 'Filter' },
  { value: 'FILTER_MIX', label: 'Filter Mix', group: 'Filter' },
  { value: 'OSC_A_WT', label: 'OSC A Wavetable Pos', group: 'Oscillators' },
  { value: 'OSC_B_WT', label: 'OSC B Wavetable Pos', group: 'Oscillators' },
  { value: 'OSC_C_WT', label: 'OSC C Wavetable Pos', group: 'Oscillators' },
  { value: 'OSC_A_WARP', label: 'OSC A Warp Amount', group: 'Oscillators' },
  { value: 'OSC_B_WARP', label: 'OSC B Warp Amount', group: 'Oscillators' },
  { value: 'OSC_C_WARP', label: 'OSC C Warp Amount', group: 'Oscillators' },
  { value: 'OSC_A_LEVEL', label: 'OSC A Level', group: 'Oscillators' },
  { value: 'OSC_B_LEVEL', label: 'OSC B Level', group: 'Oscillators' },
  { value: 'SUB_LEVEL', label: 'Sub Osc Level', group: 'Oscillators' },
  { value: 'NOISE_LEVEL', label: 'Noise Level', group: 'Oscillators' },
  { value: 'FX_DIST_DRIVE', label: 'Distortion Drive', group: 'Effects' },
  { value: 'FX_DIST_MIX', label: 'Distortion Mix', group: 'Effects' },
];

const ACCENT_BY_ID: Record<1 | 2 | 3 | 4, string> = {
  1: 'text-cyan-300',
  2: 'text-amber-300',
  3: 'text-emerald-300',
  4: 'text-rose-300',
};

const BAR_FILL_BY_ID: Record<1 | 2 | 3 | 4, string> = {
  1: 'bg-cyan-400',
  2: 'bg-amber-400',
  3: 'bg-emerald-400',
  4: 'bg-rose-400',
};

export interface MacroAssignModalProps {
  open: boolean;
  macros: [SynthMacro, SynthMacro, SynthMacro, SynthMacro];
  selectedMacroId: 1 | 2 | 3 | 4;
  onSelectMacroId: (id: 1 | 2 | 3 | 4) => void;
  onChangeMacro: (
    macroId: 1 | 2 | 3 | 4,
    updater: (prev: SynthMacro) => SynthMacro
  ) => void;
  onClose: () => void;
}

export const MacroAssignModal: React.FC<MacroAssignModalProps> = ({
  open,
  macros,
  selectedMacroId,
  onSelectMacroId,
  onChangeMacro,
  onClose,
}) => {
  if (!open) return null;

  const activeMacro = macros.find((m) => m.id === selectedMacroId) ?? macros[0];

  const handleResetAll = () => {
    for (const m of macros) {
      if (Math.abs(m.value - 0.5) > 0.001) {
        onChangeMacro(m.id, (prev) => ({ ...prev, value: 0.5 }));
      }
    }
  };

  const handleAddBinding = (macroId: 1 | 2 | 3 | 4) => {
    onChangeMacro(macroId, (prev) => {
      const used = new Set(prev.bindings.map((b) => b.target));
      const nextTarget =
        MACRO_TARGET_OPTIONS.find((opt) => !used.has(opt.value))?.value ??
        'FILTER_CUTOFF';
      const nextBinding: MacroBinding = { target: nextTarget, amount: 0.5 };
      return {
        ...prev,
        bindings: [...prev.bindings, nextBinding],
      };
    });
  };

  const handleUpdateBinding = (
    macroId: 1 | 2 | 3 | 4,
    index: number,
    patch: Partial<MacroBinding>
  ) => {
    onChangeMacro(macroId, (prev) => {
      const next = [...prev.bindings];
      if (!next[index]) return prev;
      next[index] = { ...next[index], ...patch };
      return { ...prev, bindings: next };
    });
  };

  const handleRemoveBinding = (macroId: 1 | 2 | 3 | 4, index: number) => {
    onChangeMacro(macroId, (prev) => ({
      ...prev,
      bindings: prev.bindings.filter((_, idx) => idx !== index),
    }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Macro Assignments"
        className="w-full max-w-xl max-h-[92dvh] flex flex-col rounded-xl bg-[#111622] border border-[#2A364B] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#242E40] shrink-0">
          <div>
            <h2 className="font-display text-sm font-bold text-slate-100">
              Macro Controller Matrix
            </h2>
            <p className="text-[11px] text-slate-400">
              50% is the preset center · Route each macro to multiple synth targets
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleResetAll}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-[#263042] bg-[#0C1018] text-[11px] text-slate-300 hover:text-cyan-300 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Center All</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close macro matrix"
              className="w-8 h-8 rounded-md border border-[#263042] bg-[#0C1018] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5 p-2.5 bg-[#0D1119] border-b border-[#242E40] shrink-0">
          {macros.map((m) => {
            const selected = m.id === activeMacro.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectMacroId(m.id)}
                className={`flex flex-col items-start px-2.5 py-1.5 rounded-md border text-left transition-colors cursor-pointer min-w-0 ${
                  selected
                    ? 'bg-cyan-500/15 border-cyan-400/60 text-white'
                    : 'bg-[#131822] border-[#263042] text-slate-300 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center justify-between w-full gap-1">
                  <span className={`font-mono-num text-[10px] font-bold ${ACCENT_BY_ID[m.id]}`}>
                    MACRO {m.id}
                  </span>
                  <span className="font-mono-num text-[10px] text-slate-400">
                    {Math.round(m.value * 100)}%
                  </span>
                </div>
                <span className="text-[11px] font-medium truncate w-full mt-0.5">
                  {m.name}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto synth-scroll p-3.5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#0D1119] border border-[#222B3C] rounded-lg p-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Macro {activeMacro.id} Label
              </span>
              <input
                type="text"
                value={activeMacro.name}
                maxLength={28}
                onChange={(e) =>
                  onChangeMacro(activeMacro.id, (prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                className="h-9 px-2.5 rounded-md bg-[#131822] border border-[#263042] text-xs font-medium text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </label>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Position
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChangeMacro(activeMacro.id, (prev) => ({ ...prev, value: 0.5 }))
                  }
                  className="font-mono-num text-[11px] text-cyan-300 hover:underline cursor-pointer"
                >
                  {Math.round(activeMacro.value * 100)}% (Reset 50%)
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={activeMacro.value}
                aria-label={`Macro ${activeMacro.id} position`}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  onChangeMacro(activeMacro.id, (prev) => ({
                    ...prev,
                    value: Number.isFinite(val) ? val : 0.5,
                  }));
                }}
                className="w-full h-9 accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200">
              Assigned Parameter Bindings ({activeMacro.bindings.length})
            </h3>
            <button
              type="button"
              onClick={() => handleAddBinding(activeMacro.id)}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Target</span>
            </button>
          </div>

          {activeMacro.bindings.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-[#242E40] rounded-lg">
              No targets assigned to Macro {activeMacro.id}. Tap &ldquo;Add Target&rdquo; to map a parameter.
            </div>
          ) : (
            <div className="space-y-2">
              {activeMacro.bindings.map((binding, idx) => {
                const amountPct = Math.round(binding.amount * 100);
                return (
                  <div
                    key={`${binding.target}-${idx}`}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-[#0D1119] border border-[#222B3C] rounded-lg p-2.5"
                  >
                    <select
                      aria-label={`Target ${idx + 1}`}
                      value={binding.target}
                      onChange={(e) =>
                        handleUpdateBinding(activeMacro.id, idx, {
                          target: e.target.value as MacroTarget,
                        })
                      }
                      className="flex-1 min-w-[170px] h-9 px-2 rounded-md bg-[#131822] border border-[#263042] text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                    >
                      {MACRO_TARGET_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.group}: {opt.label}
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                      <input
                        type="range"
                        min={-1}
                        max={1}
                        step={0.01}
                        value={binding.amount}
                        aria-label={`Amount for target ${idx + 1}`}
                        onChange={(e) =>
                          handleUpdateBinding(activeMacro.id, idx, {
                            amount: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="flex-1 accent-amber-400 cursor-pointer"
                      />
                      <span className="font-mono-num text-[11px] w-12 text-right text-slate-200 shrink-0">
                        {amountPct > 0 ? `+${amountPct}%` : `${amountPct}%`}
                      </span>
                    </div>

                    <button
                      type="button"
                      title="Remove binding"
                      aria-label={`Remove target ${idx + 1}`}
                      onClick={() => handleRemoveBinding(activeMacro.id, idx)}
                      className="w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const MacroBar: React.FC<MacroBarProps> = ({ macros, onChangeMacro }) => {
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedMacroId, setSelectedMacroId] = useState<1 | 2 | 3 | 4>(1);

  return (
    <>
      <section
        aria-label="Synth Performance Macros"
        className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 bg-[#0E131D] border-t border-[#242E40] shrink-0"
      >
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2 flex-1 min-w-0">
          {macros.map((macro) => {
            const pct = Math.round(macro.value * 100);
            const isNeutral = Math.abs(macro.value - 0.5) < 0.015;
            return (
              <div
                key={macro.id}
                className="flex flex-col justify-center bg-[#131926] border border-[#242F44] rounded-md px-2 py-1 min-w-0"
              >
                <div className="flex items-center justify-between gap-1 leading-none mb-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMacroId(macro.id);
                      setAssignOpen(true);
                    }}
                    title={`Configure MACRO ${macro.id}: ${macro.name} (${macro.bindings.length} target${macro.bindings.length === 1 ? '' : 's'})`}
                    className="flex items-center gap-1 min-w-0 text-left cursor-pointer hover:opacity-90"
                  >
                    <span
                      className={`font-mono-num text-[9px] font-bold shrink-0 ${ACCENT_BY_ID[macro.id]}`}
                    >
                      M{macro.id}
                    </span>
                    <span className="text-[10px] font-semibold tracking-wide text-slate-200 truncate uppercase">
                      {macro.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeMacro(macro.id, (prev) => ({ ...prev, value: 0.5 }))
                    }
                    title="Reset macro to 50% neutral center"
                    className={`font-mono-num text-[10px] shrink-0 cursor-pointer ${
                      isNeutral
                        ? 'text-slate-400'
                        : `${ACCENT_BY_ID[macro.id]} font-semibold`
                    }`}
                  >
                    {pct}%
                  </button>
                </div>

                <div className="relative h-4 flex items-center">
                  <div className="w-full h-1.5 rounded-full bg-[#090C12] border border-[#242E40] overflow-hidden relative pointer-events-none">
                    <div
                      aria-hidden="true"
                      className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500/70 -translate-x-1/2 z-10"
                    />
                    <div
                      className={`h-full transition-[width] duration-75 ${BAR_FILL_BY_ID[macro.id]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={macro.value}
                    aria-label={`MACRO ${macro.id}: ${macro.name}`}
                    onDoubleClick={() =>
                      onChangeMacro(macro.id, (prev) => ({ ...prev, value: 0.5 }))
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

        <button
          type="button"
          onClick={() => setAssignOpen(true)}
          title="Assign Macro Routing & Labels"
          className="inline-flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-md bg-[#141B29] hover:bg-[#1B2538] border border-[#2C3A52] text-slate-200 hover:text-cyan-300 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Sliders className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="hidden sm:inline">Assign</span>
        </button>
      </section>

      <MacroAssignModal
        open={assignOpen}
        macros={macros}
        selectedMacroId={selectedMacroId}
        onSelectMacroId={setSelectedMacroId}
        onChangeMacro={onChangeMacro}
        onClose={() => setAssignOpen(false)}
      />
    </>
  );
};
