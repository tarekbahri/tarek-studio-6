import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  Ts666ModRoute,
  Ts666ModSource,
  Ts666ModTarget,
} from '../../types/ts666';

interface Ts666MatrixScreenProps {
  routes: Ts666ModRoute[];
  onChangeRoutes: (next: Ts666ModRoute[]) => void;
}

const MOD_SOURCES: Ts666ModSource[] = [
  'ENV1',
  'ENV2',
  'ENV3',
  'ENV4',
  'LFO1',
  'LFO2',
  'LFO3',
  'LFO4',
  'LFO5',
  'LFO6',
  'LFO7',
  'LFO8',
  'LFO9',
  'LFO10',
  'MACRO1',
  'MACRO2',
  'MACRO3',
  'MACRO4',
  'MACRO5',
  'MACRO6',
  'MACRO7',
  'MACRO8',
  'CHAOS1',
  'CHAOS2',
  'VELOCITY',
  'KEYTRACK',
  'MODWHEEL',
  'PITCHBEND',
  'AFTERTOUCH',
];

const MOD_TARGETS: Ts666ModTarget[] = [
  'F1_CUTOFF',
  'F1_RES',
  'F1_DRIVE',
  'F1_FAT',
  'F1_PAN',
  'F1_MIX',
  'F2_CUTOFF',
  'F2_RES',
  'F2_DRIVE',
  'F2_FAT',
  'F2_PAN',
  'F2_MIX',
  'OSC_A_WT',
  'OSC_A_WARP1',
  'OSC_A_WARP2',
  'OSC_A_DETUNE',
  'OSC_A_BLEND',
  'OSC_A_PAN',
  'OSC_A_LEVEL',
  'OSC_A_OCT',
  'OSC_A_SEMI',
  'OSC_A_FINE',
  'OSC_A_COARSE',
  'OSC_A_PHASE',
  'OSC_A_GRAIN_SIZE',
  'OSC_A_DENSITY',
  'OSC_B_WT',
  'OSC_B_WARP1',
  'OSC_B_WARP2',
  'OSC_B_DETUNE',
  'OSC_B_PAN',
  'OSC_B_LEVEL',
  'OSC_B_FINE',
  'OSC_C_WT',
  'OSC_C_WARP1',
  'OSC_C_LEVEL',
  'OSC_C_PAN',
  'SUB_LEVEL',
  'SUB_PAN',
  'NOISE_LEVEL',
  'NOISE_PITCH',
  'NOISE_PAN',
  'MASTER_VOL',
  'CHAOS1_RATE',
  'CHAOS2_RATE',
];

export const Ts666MatrixScreen: React.FC<Ts666MatrixScreenProps> = ({
  routes,
  onChangeRoutes,
}) => {
  const handleAdd = () => {
    if (routes.length >= 64) return;
    const next: Ts666ModRoute = {
      id: `mat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      enabled: true,
      source: 'LFO1',
      target: 'F1_CUTOFF',
      amount: 0.3,
      direction: 'uni',
      curve: 0,
      auxSource: 'NONE',
    };
    onChangeRoutes([...routes, next]);
  };

  const updateAt = (idx: number, patch: Partial<Ts666ModRoute>) => {
    onChangeRoutes(routes.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 p-2 bg-[#0C0F15] gap-2">
      <div className="flex items-center justify-between gap-2 bg-[#131720] border border-[#252D3D] rounded-md px-3 py-1.5 shrink-0">
        <div>
          <h2 className="font-display text-sm font-bold text-slate-100">
            MODULATION MATRIX ({routes.length} / 64 SLOTS)
          </h2>
          <p className="text-[11px] text-slate-400">
            Route Envelopes 1–4, LFOs 1–10, Macros 1–8, Chaos 1–2, and MIDI sources to any synth parameter.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleAdd}
            disabled={routes.length >= 64}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500 text-slate-950 font-display text-xs font-bold cursor-pointer disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ADD SLOT</span>
          </button>
          {routes.length > 0 && (
            <button
              type="button"
              onClick={() => onChangeRoutes([])}
              className="px-2.5 py-1 rounded bg-[#1A202D] border border-[#2D384D] text-xs font-mono-num text-slate-300 hover:text-rose-300 cursor-pointer"
            >
              CLEAR ALL
            </button>
          )}
        </div>
      </div>

      {/* Table of Modulation Routes */}
      <div className="flex-1 min-h-0 overflow-y-auto synth-scroll bg-[#11151E] border border-[#222938] rounded-md">
        <table className="w-full text-left border-collapse text-[11px] font-mono-num">
          <thead className="sticky top-0 bg-[#161B26] border-b border-[#283246] text-[10px] text-slate-400">
            <tr>
              <th className="p-2 w-10">#</th>
              <th className="p-2 w-14">ON</th>
              <th className="p-2">SOURCE</th>
              <th className="p-2">TARGET</th>
              <th className="p-2 w-44">AMOUNT</th>
              <th className="p-2 w-16">DIR</th>
              <th className="p-2 w-32">CURVE</th>
              <th className="p-2">AUX SRC</th>
              <th className="p-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {routes.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-500">
                  No modulation slots active. Click ADD SLOT or drag any ENV / LFO / MACRO / CHAOS badge onto a knob.
                </td>
              </tr>
            ) : (
              routes.map((r, idx) => (
                <tr
                  key={r.id}
                  className="border-b border-[#1C2230] hover:bg-[#171D2A]"
                >
                  <td className="p-1.5 text-slate-500">{idx + 1}</td>
                  <td className="p-1.5">
                    <button
                      type="button"
                      onClick={() => updateAt(idx, { enabled: !r.enabled })}
                      className={`px-2 py-0.5 rounded text-[9.5px] font-bold cursor-pointer ${
                        r.enabled
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-[#1B2230] text-slate-400'
                      }`}
                    >
                      {r.enabled ? 'ON' : 'OFF'}
                    </button>
                  </td>
                  <td className="p-1.5">
                    <select
                      aria-label={`Slot ${idx + 1} Source`}
                      value={r.source}
                      onChange={(e) =>
                        updateAt(idx, { source: e.target.value as Ts666ModSource })
                      }
                      className="bg-[#0B0E14] border border-[#263145] rounded px-1.5 py-0.5 text-cyan-200 cursor-pointer"
                    >
                      {MOD_SOURCES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-1.5">
                    <select
                      aria-label={`Slot ${idx + 1} Target`}
                      value={r.target}
                      onChange={(e) =>
                        updateAt(idx, { target: e.target.value as Ts666ModTarget })
                      }
                      className="bg-[#0B0E14] border border-[#263145] rounded px-1.5 py-0.5 text-amber-200 cursor-pointer"
                    >
                      {MOD_TARGETS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-1.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        aria-label={`Slot ${idx + 1} Amount`}
                        type="range"
                        min={-1}
                        max={1}
                        step={0.01}
                        value={r.amount}
                        onChange={(e) =>
                          updateAt(idx, { amount: parseFloat(e.target.value) })
                        }
                        className="w-24 accent-cyan-400 cursor-pointer"
                      />
                      <span className="w-10 text-right text-slate-200">
                        {Math.round(r.amount * 100)}%
                      </span>
                    </div>
                  </td>
                  <td className="p-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateAt(idx, {
                          direction: r.direction === 'uni' ? 'bi' : 'uni',
                        })
                      }
                      className="px-2 py-0.5 rounded bg-[#0B0E14] border border-[#263145] text-slate-200 uppercase cursor-pointer"
                    >
                      {r.direction}
                    </button>
                  </td>
                  <td className="p-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        aria-label={`Slot ${idx + 1} Curve`}
                        type="range"
                        min={-1}
                        max={1}
                        step={0.05}
                        value={r.curve}
                        onChange={(e) =>
                          updateAt(idx, { curve: parseFloat(e.target.value) })
                        }
                        className="w-16 accent-amber-400 cursor-pointer"
                      />
                      <span className="text-[10px] text-slate-400">
                        {r.curve.toFixed(1)}
                      </span>
                    </div>
                  </td>
                  <td className="p-1.5">
                    <select
                      aria-label={`Slot ${idx + 1} Aux Source`}
                      value={r.auxSource}
                      onChange={(e) =>
                        updateAt(idx, {
                          auxSource: e.target.value as 'NONE' | Ts666ModSource,
                        })
                      }
                      className="bg-[#0B0E14] border border-[#263145] rounded px-1.5 py-0.5 text-slate-300 cursor-pointer"
                    >
                      <option value="NONE">NONE</option>
                      {MOD_SOURCES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onChangeRoutes(routes.filter((_, i) => i !== idx))
                      }
                      className="p-1 rounded text-slate-400 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
