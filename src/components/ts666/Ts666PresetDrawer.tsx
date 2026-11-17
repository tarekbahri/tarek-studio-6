import React, { useState } from 'react';
import { Save, Trash2, X } from 'lucide-react';
import type { Ts666Patch } from '../../types/ts666';

interface Ts666PresetDrawerProps {
  open: boolean;
  currentPatch: Ts666Patch;
  factoryPresets: Ts666Patch[];
  userPresets: Ts666Patch[];
  onSelectPreset: (preset: Ts666Patch) => void;
  onSaveUserPreset: (name: string) => void;
  onDeleteUserPreset: (id: string) => void;
  onClose: () => void;
}

export const Ts666PresetDrawer: React.FC<Ts666PresetDrawerProps> = ({
  open,
  currentPatch,
  factoryPresets,
  userPresets,
  onSelectPreset,
  onSaveUserPreset,
  onDeleteUserPreset,
  onClose,
}) => {
  const [newName, setNewName] = useState('');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3">
      <div className="w-full max-w-xl bg-[#160F0A] border border-[#6B4829] rounded-lg shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-[#1D130C] border-b border-[#5C3E24]">
          <span className="font-display text-sm font-bold text-[#FCA5A5]">
            666TS SOUND BANK & PRESETS
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[#D9B694] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Save New Preset */}
        <div className="flex items-center gap-2 p-2.5 border-b border-[#4D321D] bg-[#110A06]">
          <input
            aria-label="New Preset Name"
            type="text"
            placeholder="Save current 666TS patch as..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 bg-[#0A0503] border border-[#5C3E24] rounded px-2.5 py-1 text-xs text-[#F5E6D3]"
          />
          <button
            type="button"
            onClick={() => {
              onSaveUserPreset(newName.trim() || `${currentPatch.name} Copy`);
              setNewName('');
            }}
            className="inline-flex items-center gap-1 px-3 py-1 rounded bg-[#DC2626] hover:bg-[#EF4444] text-white font-display text-xs font-bold cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>SAVE</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto synth-scroll p-2.5 space-y-3">
          <div>
            <div className="text-[10px] font-mono-num font-bold text-[#E08A3C] mb-1.5">
              FACTORY PATCHES ({factoryPresets.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {factoryPresets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectPreset(p);
                    onClose();
                  }}
                  className={`flex items-center justify-between px-2.5 py-2 rounded border text-left cursor-pointer ${
                    currentPatch.id === p.id
                      ? 'bg-[#DC2626]/25 border-[#EF4444] text-[#FFF1E6]'
                      : 'bg-[#1D130C] border-[#543720] text-[#F5D3B3] hover:border-[#E08A3C]'
                  }`}
                >
                  <span className="font-display text-xs font-bold">{p.name}</span>
                  <span className="text-[9.5px] font-mono-num text-[#BFA080]">
                    {p.category}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono-num font-bold text-[#E08A3C] mb-1.5">
              USER PATCHES ({userPresets.length})
            </div>
            {userPresets.length === 0 ? (
              <p className="text-xs text-[#9A7858]">No saved user presets yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {userPresets.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded border bg-[#1D130C] border-[#543720]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectPreset(p);
                        onClose();
                      }}
                      className="flex-1 text-left font-display text-xs font-bold text-[#F5E6D3] hover:text-[#FCA5A5] cursor-pointer"
                    >
                      {p.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteUserPreset(p.id)}
                      className="p-1 text-[#BFA080] hover:text-[#EF4444] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
