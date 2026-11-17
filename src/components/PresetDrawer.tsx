import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { PresetCategory, SynthPatch } from '../types/synth';
import { clonePatch, createBasePatch } from '../audio/presets';

interface PresetDrawerProps {
  open: boolean;
  activePatch: SynthPatch;
  presets: SynthPatch[];
  previewingId?: string | null;
  onClose: () => void;
  onSelectPreset: (patch: SynthPatch) => void;
  onPreviewPreset: (patch: SynthPatch) => void;
  onSaveNewPreset: (name: string, category: PresetCategory, sourcePatch?: SynthPatch) => void;
  onUpdateActivePreset: () => void;
  onRenamePreset: (id: string, name: string, category: PresetCategory) => void;
  onDeletePreset: (id: string) => void;
  onImportPresets: (imported: SynthPatch[]) => void;
}

const CATEGORIES: ('All' | PresetCategory)[] = [
  'All',
  'DJ ROI Inspired',
  'Skrillex Inspired',
  'Modern Talking',
  'Riddim',
  'Heavy Dubstep',
  'Tearout',
  'Growls',
  'Sub Bass',
  'Dubstep',
  'Bass',
  'Lead',
  'Pad',
  'Pluck',
  'Keys',
  'FX',
];

export const PresetDrawer: React.FC<PresetDrawerProps> = ({
  open,
  activePatch,
  presets,
  previewingId = null,
  onClose,
  onSelectPreset,
  onPreviewPreset,
  onSaveNewPreset,
  onUpdateActivePreset,
  onRenamePreset,
  onDeletePreset,
  onImportPresets,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'All' | PresetCategory>('All');
  const [search, setSearch] = useState('');
  const [saveName, setSaveName] = useState('');
  const [saveCat, setSaveCat] = useState<PresetCategory>(activePatch.category);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCat, setEditCat] = useState<PresetCategory>('Riddim');
  const [feedback, setFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setSaveCat(activePatch.category);
  }, [activePatch.id, activePatch.category]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const showFeedback = (msg: string, ms = 2200) => {
    setFeedback(msg);
    if (feedbackTimerRef.current !== null) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => {
      feedbackTimerRef.current = null;
      setFeedback(null);
    }, ms);
  };

  if (!open) return null;

  const filtered = presets.filter((p) => {
    const matchCat = categoryFilter === 'All' || p.category === categoryFilter;
    const matchText =
      !search.trim() ||
      p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      p.category.toLowerCase().includes(search.trim().toLowerCase());
    return matchCat && matchText;
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = saveName.trim() || `${activePatch.name} Custom`;
    onSaveNewPreset(trimmed, saveCat);
    setSaveName('');
    showFeedback(`Saved "${trimmed}"`);
  };

  const handleStartEdit = (preset: SynthPatch) => {
    setEditingId(preset.id);
    setEditName(preset.name);
    setEditCat(preset.category);
  };

  const handleCommitEdit = (presetId: string) => {
    const clean = editName.trim();
    if (!clean) return;
    onRenamePreset(presetId, clean, editCat);
    setEditingId(null);
    showFeedback(`Updated "${clean}"`);
  };

  const handleExport = () => {
    const userOnly = presets.filter((p) => !p.isFactory);
    const payload = userOnly.length > 0 ? userOnly : [activePatch];
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tarek-serum-presets.json';
    a.click();
    URL.revokeObjectURL(url);
    showFeedback('Exported JSON preset bank');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const valid: SynthPatch[] = list.map((item, i) =>
        createBasePatch({
          ...item,
          id: `user-${Date.now()}-${i}`,
          isFactory: false,
        })
      );
      if (valid.length > 0) {
        onImportPresets(valid);
        showFeedback(`Imported ${valid.length} preset(s)`, 2500);
      }
    } catch {
      showFeedback('Invalid JSON preset file', 2500);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="SERUM Preset Library"
        className="w-full max-w-lg h-full bg-[#111622] border-l border-[#263042] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#242E40] shrink-0">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Preset Library
            </h2>
            <p className="text-[11px] text-slate-400">
              {presets.length} sounds · {filtered.length} shown
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExport}
              title="Export User Bank JSON"
              className="w-9 h-9 rounded-md border border-[#263042] bg-[#0C1018] flex items-center justify-center text-slate-300 hover:text-cyan-300 hover:border-cyan-400/40 cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Import Preset JSON"
              className="w-9 h-9 rounded-md border border-[#263042] bg-[#0C1018] flex items-center justify-center text-slate-300 hover:text-cyan-300 hover:border-cyan-400/40 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preset library"
              className="w-9 h-9 rounded-md border border-[#263042] bg-[#0C1018] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Save / Update Current Sound Form */}
        <form
          onSubmit={handleSave}
          className="p-3 bg-[#0D1119] border-b border-[#242E40] space-y-2 shrink-0"
        >
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
            <input
              type="text"
              placeholder={`Save "${activePatch.name}" as...`}
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="flex-1 min-w-[140px] h-9 px-2.5 rounded-md bg-[#131822] border border-[#263042] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <select
              aria-label="Preset Category"
              value={saveCat}
              onChange={(e) => setSaveCat(e.target.value as PresetCategory)}
              className="h-9 px-2 rounded-md bg-[#131822] border border-[#263042] text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
            >
              {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="inline-flex items-center gap-1 h-9 px-3 rounded-md bg-cyan-500 text-slate-950 font-semibold text-xs hover:bg-cyan-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save New</span>
            </button>
            {!activePatch.isFactory && (
              <button
                type="button"
                onClick={() => {
                  onUpdateActivePreset();
                  showFeedback(`Updated "${activePatch.name}"`);
                }}
                title="Overwrite active user preset with current synth & macro edits"
                className="inline-flex items-center gap-1 h-9 px-2.5 rounded-md bg-amber-500/20 border border-amber-400/50 text-amber-200 font-semibold text-xs hover:bg-amber-500/30 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Update</span>
              </button>
            )}
          </div>
          {feedback && (
            <p className="text-[11px] text-cyan-300 font-medium">{feedback}</p>
          )}
        </form>

        {/* Search + Category Filter */}
        <div className="p-3 border-b border-[#242E40] space-y-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search presets or genres..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-2.5 rounded-md bg-[#0C1018] border border-[#263042] text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 synth-scroll">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  categoryFilter === cat
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                    : 'bg-[#0C1018] text-slate-400 border border-[#242E40] hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Preset List */}
        <div className="flex-1 overflow-y-auto synth-scroll p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              No matching presets found.
            </div>
          ) : (
            filtered.map((preset) => {
              const isSelected = preset.id === activePatch.id;
              const isPreviewing = previewingId === preset.id;
              const isEditing = editingId === preset.id;
              const activeMacrosCount = (preset.macros ?? []).filter(
                (m) => m.bindings.length > 0
              ).length;

              if (isEditing) {
                return (
                  <div
                    key={preset.id}
                    className="flex flex-wrap items-center gap-1.5 rounded-lg border border-cyan-400/60 bg-[#0D1420] px-2.5 py-2"
                  >
                    <input
                      type="text"
                      aria-label="Edit preset name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCommitEdit(preset.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                      className="flex-1 min-w-[130px] h-8 px-2 rounded bg-[#131822] border border-[#263042] text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                    />
                    <select
                      aria-label="Edit preset category"
                      value={editCat}
                      onChange={(e) => setEditCat(e.target.value as PresetCategory)}
                      className="h-8 px-2 rounded bg-[#131822] border border-[#263042] text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                    >
                      {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label="Confirm rename"
                      onClick={() => handleCommitEdit(preset.id)}
                      className="w-8 h-8 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 flex items-center justify-center cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Cancel rename"
                      onClick={() => setEditingId(null)}
                      className="w-8 h-8 rounded bg-[#131822] border border-[#263042] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={preset.id}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                    isSelected
                      ? 'bg-cyan-500/10 border-cyan-400/50'
                      : 'bg-[#0D1119] border-[#222B3C] hover:border-[#334155]'
                  }`}
                >
                  <button
                    type="button"
                    title={`Preview "${preset.name}" via live synthesis`}
                    aria-label={`Preview ${preset.name}`}
                    onClick={() => onPreviewPreset(preset)}
                    className={`w-8 h-8 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      isPreviewing
                        ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300'
                        : 'bg-[#131926] border-[#263042] text-cyan-300 hover:border-cyan-400/60 hover:bg-[#192335]'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectPreset(clonePatch(preset));
                    }}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div className="text-xs font-medium text-slate-100 truncate">
                      {preset.name}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5 truncate">
                      <span>{preset.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{preset.isFactory ? 'Factory' : 'User Patch'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeMacrosCount} Macros</span>
                    </div>
                  </button>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {!preset.isFactory && (
                      <button
                        type="button"
                        title="Rename or Change Category"
                        aria-label={`Edit ${preset.name}`}
                        onClick={() => handleStartEdit(preset)}
                        className="w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:text-amber-300 hover:bg-[#182030] cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Duplicate to User Presets"
                      aria-label={`Duplicate ${preset.name}`}
                      onClick={() => {
                        onSaveNewPreset(`${preset.name} Copy`, preset.category, preset);
                        showFeedback(`Duplicated "${preset.name}"`);
                      }}
                      className="w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:text-cyan-300 hover:bg-[#182030] cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {!preset.isFactory && (
                      <button
                        type="button"
                        title="Delete User Preset"
                        aria-label={`Delete ${preset.name}`}
                        onClick={() => onDeletePreset(preset.id)}
                        className="w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
};

