import React, { useState } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Power,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  FACTORY_FX_CHAIN_PRESETS,
  FX_CATEGORIES,
  createFxInstance,
  saveUserFxChainPreset,
} from '../../audio/fxCatalog';
import type {
  FxCategoryId,
  FxChainPreset,
  FxTrackId,
  ModularFxInstance,
} from '../../types/fx';
import { RotaryKnob } from '../RotaryKnob';

interface FxDeviceRackProps {
  activeTrack: FxTrackId;
  modules: ModularFxInstance[];
  channelBypass: boolean;
  hideTrackTabs?: boolean;
  onSelectTrack?: (track: FxTrackId) => void;
  onChangeModules: (track: FxTrackId, next: ModularFxInstance[]) => void;
  onToggleChannelBypass: (track: FxTrackId) => void;
  onOpenBrowser: (track: FxTrackId) => void;
  onPresetsUpdated?: (presets: FxChainPreset[]) => void;
}

const TRACK_TABS: { id: FxTrackId; label: string; activeClass: string }[] = [
  { id: 'subbass', label: 'SUBSYNTH', activeClass: 'bg-blue-500/25 text-blue-100 border-violet-400' },
  { id: 'ts666', label: '666TS', activeClass: 'bg-rose-500/20 text-rose-200 border-rose-400' },
  { id: 'beatbox', label: 'BEATBOX', activeClass: 'bg-amber-500/20 text-amber-200 border-amber-400' },
  { id: 'bassremix', label: 'BASS REMIX', activeClass: 'bg-red-500/20 text-amber-200 border-red-400' },
];

const QUICK_ADD_TYPES: FxCategoryId[] = [
  'distortion',
  'filter',
  'cabinet',
  'tremolo',
  'chorus',
  'delay',
  'reverb',
  'limiter',
];

export const FxDeviceRack: React.FC<FxDeviceRackProps> = ({
  activeTrack,
  modules,
  channelBypass,
  hideTrackTabs = false,
  onSelectTrack,
  onChangeModules,
  onToggleChannelBypass,
  onOpenBrowser,
  onPresetsUpdated,
}) => {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  const handleToggleModule = (id: string) => {
    onChangeModules(
      activeTrack,
      modules.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m))
    );
  };

  const handleToggleExpand = (id: string) => {
    onChangeModules(
      activeTrack,
      modules.map((m) => (m.id === id ? { ...m, expanded: !m.expanded } : m))
    );
  };

  const handleRemoveModule = (id: string) => {
    onChangeModules(
      activeTrack,
      modules.filter((m) => m.id !== id)
    );
  };

  const handleParamChange = (id: string, key: string, val: number) => {
    onChangeModules(
      activeTrack,
      modules.map((m) =>
        m.id === id
          ? {
              ...m,
              params: { ...m.params, [key]: val },
            }
          : m
      )
    );
  };

  const handleMoveModule = (fromIdx: number, toIdx: number) => {
    if (
      fromIdx === toIdx ||
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= modules.length ||
      toIdx >= modules.length
    ) {
      return;
    }
    const next = [...modules];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onChangeModules(activeTrack, next);
  };

  const handleQuickAdd = (type: FxCategoryId) => {
    onChangeModules(activeTrack, [...modules, createFxInstance(type)]);
  };

  const handleSaveChain = (e: React.FormEvent) => {
    e.preventDefault();
    if (modules.length === 0) return;
    const updated = saveUserFxChainPreset(saveName || `${activeTrack.toUpperCase()} Chain`, modules);
    onPresetsUpdated?.(updated);
    setSaveName('');
    setSaveOpen(false);
  };

  return (
    <section
      aria-label="Modular Effects Device View"
      className="flex flex-col bg-[#0A0E16] border-t border-[#242F44] shrink-0"
    >
      {/* Device Rack Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 sm:px-3 py-1.5 bg-[#101624] border-b border-[#1E283C]">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="font-display font-bold text-[11px] sm:text-xs tracking-wider text-slate-100 whitespace-nowrap">
              DEVICE VIEW
            </span>
          </div>

          {!hideTrackTabs && onSelectTrack && (
            <div className="flex items-center gap-0.5 bg-[#080B12] p-0.5 rounded-md border border-[#232F44]">
              {TRACK_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTrack(tab.id)}
                  style={{ touchAction: 'manipulation' }}
                  className={`px-2 h-7 rounded font-display font-bold text-[10px] border transition-colors cursor-pointer whitespace-nowrap ${
                    activeTrack === tab.id
                      ? tab.activeClass
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => onOpenBrowser(activeTrack)}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-display font-bold text-[11px] tracking-wide cursor-pointer whitespace-nowrap shadow-[0_0_12px_rgba(34,211,238,0.28)]"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>EFFECTS</span>
          </button>

          <button
            type="button"
            aria-pressed={channelBypass}
            onClick={() => onToggleChannelBypass(activeTrack)}
            style={{ touchAction: 'manipulation' }}
            className={`px-2.5 h-8 rounded-lg border font-display font-bold text-[11px] cursor-pointer whitespace-nowrap transition-colors ${
              channelBypass
                ? 'bg-orange-500/20 border-orange-400 text-orange-300'
                : 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300'
            }`}
          >
            {channelBypass ? 'RACK BYPASSED' : `RACK ON (${modules.filter((m) => m.enabled).length}/${modules.length})`}
          </button>
        </div>

        {/* Save / Clear / Quick Preset */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {saveOpen ? (
            <form onSubmit={handleSaveChain} className="flex items-center gap-1">
              <input
                type="text"
                autoFocus
                placeholder="Chain name..."
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="h-7 w-28 sm:w-36 px-2 rounded bg-[#070A10] border border-cyan-500 text-xs text-white focus:outline-none"
              />
              <button
                type="submit"
                className="px-2 h-7 rounded bg-cyan-500 text-slate-950 font-bold text-[11px] cursor-pointer"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setSaveOpen(false)}
                className="px-2 h-7 rounded bg-[#182032] text-slate-300 text-[11px] cursor-pointer"
              >
                Cancel
              </button>
            </form>
          ) : (
            modules.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setSaveOpen(true)}
                  style={{ touchAction: 'manipulation' }}
                  className="inline-flex items-center gap-1 px-2 h-7 rounded bg-[#080B12] border border-[#243045] text-[11px] font-medium text-slate-200 hover:border-cyan-400/60 cursor-pointer whitespace-nowrap"
                >
                  <Save className="w-3 h-3 text-cyan-400" />
                  <span>Save Chain</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeModules(activeTrack, [])}
                  style={{ touchAction: 'manipulation' }}
                  className="inline-flex items-center gap-1 px-2 h-7 rounded bg-[#080B12] border border-[#243045] text-[11px] font-medium text-slate-300 hover:text-rose-300 hover:border-rose-400/60 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </>
            )
          )}
        </div>
      </div>

      {/* Horizontal Compact Multi-Effect Strip (4+ modules side-by-side) */}
      <div className="px-2.5 sm:px-3 py-2 overflow-x-auto synth-scroll">
        {modules.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-[#2A374E] bg-[#0D131F]/80 px-3 py-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-300 font-medium">
                No active FX on{' '}
                <strong className="text-white uppercase">
                  {activeTrack === 'subbass' ? 'SUBSYNTH' : activeTrack}
                </strong>
                . Quick-add modules:
              </span>
              {QUICK_ADD_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleQuickAdd(t)}
                  style={{ touchAction: 'manipulation' }}
                  className={`inline-flex items-center gap-1 px-2 h-7 rounded-md border text-[11px] font-display font-bold cursor-pointer whitespace-nowrap ${FX_CATEGORIES[t].badgeClass}`}
                >
                  <Plus className="w-3 h-3" />
                  <span>{FX_CATEGORIES[t].name}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const preset = FACTORY_FX_CHAIN_PRESETS[0];
                onChangeModules(
                  activeTrack,
                  preset.modules.map((m) =>
                    createFxInstance(m.type, {
                      name: m.name,
                      enabled: m.enabled,
                      params: m.params,
                    })
                  )
                );
              }}
              style={{ touchAction: 'manipulation' }}
              className="px-2.5 h-7 rounded-md bg-[#182236] hover:bg-[#21304C] border border-cyan-400/40 text-cyan-200 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
            >
              Load 4-FX Starter Chain
            </button>
          </div>
        ) : (
          <div className="flex items-stretch gap-1.5 min-w-max">
            {modules.map((mod, idx) => {
              const meta = FX_CATEGORIES[mod.type];
              const isActive = mod.enabled && !channelBypass;
              const primaryParams = meta.params.filter((p) => p.primary);
              const detailParams = meta.params.filter((p) => !p.primary);
              const isDropTarget = dropIdx === idx && dragIdx !== null && dragIdx !== idx;

              return (
                <React.Fragment key={mod.id}>
                  <div
                    draggable
                    onDragStart={() => {
                      setDragIdx(idx);
                      setDropIdx(idx);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dropIdx !== idx) setDropIdx(idx);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIdx !== null) handleMoveModule(dragIdx, idx);
                      setDragIdx(null);
                      setDropIdx(null);
                    }}
                    onDragEnd={() => {
                      setDragIdx(null);
                      setDropIdx(null);
                    }}
                    className={`rounded-xl border bg-[#111724] flex flex-col justify-between transition-all shrink-0 ${
                      mod.expanded ? 'w-[258px] sm:w-[280px]' : 'w-[178px] sm:w-[196px]'
                    } ${
                      isDropTarget
                        ? 'border-cyan-300 ring-2 ring-cyan-400/70'
                        : isActive
                        ? `${meta.borderClass} ${meta.activeRingClass}`
                        : 'border-[#232D3F] opacity-65'
                    }`}
                  >
                    {/* Module Header */}
                    <div
                      className={`flex items-center justify-between gap-1 px-2 py-1.5 rounded-t-[11px] ${meta.headerBgClass}`}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <span
                          title="Drag to reorder"
                          className="cursor-grab active:cursor-grabbing text-current/70 hover:text-white shrink-0"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </span>
                        <span className="font-display font-bold text-[11px] tracking-wide truncate">
                          {mod.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        {/* Power / Bypass Toggle */}
                        <button
                          type="button"
                          aria-pressed={mod.enabled}
                          aria-label={mod.enabled ? `Bypass ${mod.name}` : `Enable ${mod.name}`}
                          title={mod.enabled ? 'Module Active (click to bypass)' : 'Module Bypassed (click to enable)'}
                          onClick={() => handleToggleModule(mod.id)}
                          style={{ touchAction: 'manipulation' }}
                          className={`w-7 h-7 rounded-md flex items-center justify-center border cursor-pointer transition-colors ${
                            mod.enabled
                              ? 'bg-emerald-500 text-slate-950 border-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.45)]'
                              : 'bg-[#0A0E16] text-slate-400 border-[#2B374F] hover:text-white'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>

                        {/* Detail Expand */}
                        {detailParams.length > 0 && (
                          <button
                            type="button"
                            aria-pressed={Boolean(mod.expanded)}
                            aria-label={`Toggle details for ${mod.name}`}
                            title="Expand Detailed Parameters"
                            onClick={() => handleToggleExpand(mod.id)}
                            style={{ touchAction: 'manipulation' }}
                            className={`w-7 h-7 rounded-md flex items-center justify-center border cursor-pointer transition-colors ${
                              mod.expanded
                                ? 'bg-white/20 text-white border-white/50'
                                : 'bg-[#0A0E16]/70 text-slate-200 border-[#2B374F] hover:text-white'
                            }`}
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Remove */}
                        <button
                          type="button"
                          aria-label={`Remove ${mod.name}`}
                          title="Remove Module"
                          onClick={() => handleRemoveModule(mod.id)}
                          style={{ touchAction: 'manipulation' }}
                          className="w-7 h-7 rounded-md bg-[#0A0E16]/70 border border-[#2B374F] flex items-center justify-center text-slate-300 hover:text-rose-400 hover:border-rose-400/50 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Primary Compact Knobs Row */}
                    <div className="px-2 py-2 flex items-center justify-around gap-1">
                      {primaryParams.map((param) => {
                        const val = mod.params[param.key] ?? param.defaultValue;
                        return (
                          <RotaryKnob
                            key={param.key}
                            label={param.label}
                            value={val}
                            min={param.min}
                            max={param.max}
                            step={param.step}
                            defaultValue={param.defaultValue}
                            bipolar={param.bipolar}
                            logarithmic={param.logarithmic}
                            size="sm"
                            accent={mod.type === 'distortion' || mod.type === 'saturation' ? 'amber' : 'cyan'}
                            formatValue={param.formatValue}
                            onChange={(v) => handleParamChange(mod.id, param.key, v)}
                          />
                        );
                      })}
                    </div>

                    {/* Expandable Detail View Inside Module (keeps horizontal chain visible) */}
                    {mod.expanded && detailParams.length > 0 && (
                      <div className="px-2.5 pb-2 pt-1.5 border-t border-[#202A3D] bg-[#0B101A] flex flex-wrap items-center justify-around gap-2">
                        {detailParams.map((param) => {
                          const val = mod.params[param.key] ?? param.defaultValue;
                          if (param.options && param.options.length > 0) {
                            return (
                              <div key={param.key} className="flex flex-col items-center gap-1">
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                                  {param.label}
                                </span>
                                <div className="flex flex-wrap items-center justify-center gap-0.5 bg-[#060910] p-0.5 rounded border border-[#253147]">
                                  {param.options.map((opt, optIdx) => (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() => handleParamChange(mod.id, param.key, optIdx)}
                                      style={{ touchAction: 'manipulation' }}
                                      className={`px-1.5 h-6 rounded text-[10px] font-display font-bold cursor-pointer ${
                                        Math.round(val) === optIdx
                                          ? 'bg-cyan-500 text-slate-950'
                                          : 'text-slate-400 hover:text-white'
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <RotaryKnob
                              key={param.key}
                              label={param.label}
                              value={val}
                              min={param.min}
                              max={param.max}
                              step={param.step}
                              defaultValue={param.defaultValue}
                              bipolar={param.bipolar}
                              logarithmic={param.logarithmic}
                              size="sm"
                              accent="cyan"
                              formatValue={param.formatValue}
                              onChange={(v) => handleParamChange(mod.id, param.key, v)}
                            />
                          );
                        })}
                      </div>
                    )}

                    {/* Bottom Order Nudge Strip (Touch-Friendly Reorder + Signal Slot Index) */}
                    <div className="flex items-center justify-between px-2 py-1 border-t border-[#1C2536] bg-[#0C111C] rounded-b-[11px] text-[10px]">
                      <button
                        type="button"
                        disabled={idx === 0}
                        aria-label={`Move ${mod.name} left`}
                        onClick={() => handleMoveModule(idx, idx - 1)}
                        className="w-6 h-5 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#192235] disabled:opacity-25 cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-mono-num text-[10px] text-slate-400">
                        #{idx + 1} · {mod.enabled ? (channelBypass ? 'CH BYP' : 'ACTIVE') : 'BYPASS'}
                      </span>
                      <button
                        type="button"
                        disabled={idx === modules.length - 1}
                        aria-label={`Move ${mod.name} right`}
                        onClick={() => handleMoveModule(idx, idx + 1)}
                        className="w-6 h-5 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#192235] disabled:opacity-25 cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {idx < modules.length - 1 && (
                    <div className="flex items-center justify-center text-slate-500 shrink-0">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {/* Add More Button at end of horizontal chain */}
            <button
              type="button"
              onClick={() => onOpenBrowser(activeTrack)}
              style={{ touchAction: 'manipulation' }}
              className="w-[72px] shrink-0 rounded-xl border border-dashed border-[#2C3B56] hover:border-cyan-400/70 bg-[#0D131F] hover:bg-[#131C2E] flex flex-col items-center justify-center gap-1 text-slate-300 hover:text-cyan-200 cursor-pointer transition-colors"
            >
              <Plus className="w-5 h-5 text-cyan-400" />
              <span className="font-display font-bold text-[10px] tracking-wide">ADD FX</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
