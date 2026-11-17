import React, { useMemo, useState } from 'react';
import {
  Check,
  FolderOpen,
  Layers,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  FACTORY_FX_CHAIN_PRESETS,
  FX_CATEGORIES,
  FX_CATEGORY_ORDER,
} from '../../audio/fxCatalog';
import type {
  FxCategoryId,
  FxChainPreset,
  FxTrackId,
  ModularFxInstance,
} from '../../types/fx';

interface FxBrowserModalProps {
  open: boolean;
  targetTrack: FxTrackId;
  activeModules: ModularFxInstance[];
  userPresets: FxChainPreset[];
  onClose: () => void;
  onChangeTargetTrack: (track: FxTrackId) => void;
  onAddEffect: (type: FxCategoryId) => void;
  onLoadPreset: (preset: FxChainPreset) => void;
  onDeleteUserPreset: (id: string) => void;
}

const GROUPS = ['All', 'Drive', 'Color', 'Tone', 'Dynamics', 'Space', 'Mod', 'Utility'] as const;

const TRACK_META: { id: FxTrackId; label: string; activeClass: string }[] = [
  {
    id: 'subbass',
    label: 'SUBSYNTH',
    activeClass: 'bg-blue-500/25 border-violet-400 text-blue-100',
  },
  {
    id: 'ts666',
    label: '666TS',
    activeClass: 'bg-rose-500/20 border-rose-400 text-rose-200',
  },
  {
    id: 'beatbox',
    label: 'BEATBOX',
    activeClass: 'bg-amber-500/20 border-amber-400 text-amber-200',
  },
  {
    id: 'bassremix',
    label: 'BASS REMIX',
    activeClass: 'bg-red-500/20 border-red-400 text-amber-200',
  },
];

export const FxBrowserModal: React.FC<FxBrowserModalProps> = ({
  open,
  targetTrack,
  activeModules,
  userPresets,
  onClose,
  onChangeTargetTrack,
  onAddEffect,
  onLoadPreset,
  onDeleteUserPreset,
}) => {
  const [tab, setTab] = useState<'effects' | 'presets'>('effects');
  const [groupFilter, setGroupFilter] = useState<(typeof GROUPS)[number]>('All');
  const [justAdded, setJustAdded] = useState<FxCategoryId | null>(null);

  const filteredCategories = useMemo(() => {
    return FX_CATEGORY_ORDER.map((id) => FX_CATEGORIES[id]).filter(
      (cat) => groupFilter === 'All' || cat.groupLabel === groupFilter
    );
  }, [groupFilter]);

  if (!open) return null;

  const handleAdd = (type: FxCategoryId) => {
    onAddEffect(type);
    setJustAdded(type);
    window.setTimeout(() => {
      setJustAdded((curr) => (curr === type ? null : curr));
    }, 650);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Modular Effects Browser"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl max-h-[90dvh] flex flex-col rounded-2xl border border-[#2A374E] bg-[#0D121C] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 bg-[#121926] border-b border-[#253147] shrink-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
              <h2 className="font-display text-sm sm:text-base font-bold text-white tracking-wide">
                EFFECTS BROWSER
              </h2>
            </div>

            {/* Target Instrument Selector */}
            <div className="flex items-center gap-1 bg-[#080B12] p-0.5 rounded-lg border border-[#243045]">
              {TRACK_META.map((tr) => (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() => onChangeTargetTrack(tr.id)}
                  style={{ touchAction: 'manipulation' }}
                  className={`px-2.5 h-7 rounded-md font-display font-bold text-[11px] border transition-colors cursor-pointer whitespace-nowrap ${
                    targetTrack === tr.id
                      ? tr.activeClass
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  {tr.label}
                </button>
              ))}
            </div>

            <span className="font-mono-num text-[11px] px-2 py-0.5 rounded bg-[#080B12] border border-[#243045] text-slate-300 whitespace-nowrap">
              Rack: {activeModules.length} FX
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 bg-[#080B12] p-0.5 rounded-lg border border-[#243045]">
              <button
                type="button"
                onClick={() => setTab('effects')}
                style={{ touchAction: 'manipulation' }}
                className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  tab === 'effects'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/50'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{FX_CATEGORY_ORDER.length} FX Categories</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('presets')}
                style={{ touchAction: 'manipulation' }}
                className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  tab === 'presets'
                    ? 'bg-violet-500/20 text-violet-200 border border-violet-400/50'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Chain Presets</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Effects Browser"
              style={{ touchAction: 'manipulation' }}
              className="w-8 h-8 rounded-lg bg-[#080B12] border border-[#2A374E] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Chips for Categories */}
        {tab === 'effects' && (
          <div className="flex items-center gap-1 px-3 sm:px-4 py-2 bg-[#0A0E16] border-b border-[#1E2738] overflow-x-auto synth-scroll shrink-0">
            {GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupFilter(g)}
                style={{ touchAction: 'manipulation' }}
                className={`px-2.5 h-7 rounded-md text-[11px] font-semibold border cursor-pointer whitespace-nowrap transition-colors ${
                  groupFilter === g
                    ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                    : 'bg-[#121826] border-[#253147] text-slate-300 hover:text-white'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 min-h-0 overflow-y-auto synth-scroll p-3 sm:p-4">
          {tab === 'effects' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {filteredCategories.map((cat) => {
                const countInChain = activeModules.filter((m) => m.type === cat.id).length;
                const addedNow = justAdded === cat.id;
                return (
                  <div
                    key={cat.id}
                    className={`rounded-xl border bg-[#121927] flex flex-col justify-between overflow-hidden transition-all ${cat.borderClass}`}
                  >
                    <div>
                      <div className={`flex items-center justify-between px-3 py-2 ${cat.headerBgClass}`}>
                        <span className="font-display font-bold text-xs tracking-wide">
                          {cat.name}
                        </span>
                        <span className="font-mono-num text-[10px] uppercase opacity-85">
                          {cat.groupLabel}
                        </span>
                      </div>
                      <p className="px-3 py-2 text-[11px] text-slate-300 leading-snug min-h-[46px]">
                        {cat.description}
                      </p>
                    </div>

                    <div className="px-3 pb-2.5 pt-1 flex items-center justify-between gap-2">
                      <span className="font-mono-num text-[10px] text-slate-400">
                        {countInChain > 0 ? `${countInChain} active` : `${cat.params.length} params`}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAdd(cat.id)}
                        style={{ touchAction: 'manipulation' }}
                        className={`inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border text-xs font-display font-bold cursor-pointer whitespace-nowrap transition-colors ${
                          addedNow
                            ? 'bg-emerald-500 border-emerald-300 text-slate-950'
                            : 'bg-[#090D16] hover:bg-[#192438] border-[#2E3C56] text-white'
                        }`}
                      >
                        {addedNow ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>ADDED</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5 text-cyan-300" />
                            <span>ADD</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-[11px] font-display font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Factory Chain Presets (4-Module Racks)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FACTORY_FX_CHAIN_PRESETS.map((preset) => (
                    <div
                      key={preset.id}
                      className="rounded-xl border border-[#28354D] bg-[#121927] p-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-display font-bold text-xs sm:text-sm text-white truncate">
                          {preset.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          {preset.description}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onLoadPreset(preset);
                          onClose();
                        }}
                        style={{ touchAction: 'manipulation' }}
                        className="px-3 h-8 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
                      >
                        LOAD
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {userPresets.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-display font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Saved Custom Chains
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {userPresets.map((preset) => (
                      <div
                        key={preset.id}
                        className="rounded-xl border border-violet-500/40 bg-[#121927] p-3 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-display font-bold text-xs sm:text-sm text-violet-100 truncate">
                            {preset.name}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {preset.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onLoadPreset(preset);
                              onClose();
                            }}
                            style={{ touchAction: 'manipulation' }}
                            className="px-2.5 h-8 rounded-lg bg-violet-500 hover:bg-violet-400 text-white font-display font-bold text-xs cursor-pointer whitespace-nowrap"
                          >
                            LOAD
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${preset.name}`}
                            onClick={() => onDeleteUserPreset(preset.id)}
                            className="w-8 h-8 rounded-lg bg-[#090D16] border border-[#2A374E] flex items-center justify-center text-slate-400 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-[#121926] border-t border-[#253147] shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto synth-scroll min-w-0">
            {activeModules.length === 0 ? (
              <span className="text-[11px] text-slate-400">
                No modules yet — tap + ADD on any category above
              </span>
            ) : (
              activeModules.map((mod, idx) => (
                <span
                  key={mod.id}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-display font-bold whitespace-nowrap ${
                    FX_CATEGORIES[mod.type].badgeClass
                  } ${!mod.enabled ? 'opacity-45 line-through' : ''}`}
                >
                  <span>{idx + 1}.</span>
                  <span>{FX_CATEGORIES[mod.type].shortName}</span>
                </span>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ touchAction: 'manipulation' }}
            className="px-4 h-8 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
};
