import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CopyPlus,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react';
import { getTimeSignatureInfo } from '../../audio/dawPresets';
import type {
  DawPattern,
  DawSongClip,
  DawSongState,
  TimeSignatureId,
} from '../../types/daw';

interface DawSongModeProps {
  song: DawSongState;
  patterns: Record<string, DawPattern>;
  activePatternId: string;
  timeSignature: TimeSignatureId;
  isPlaying: boolean;
  playMode: 'pattern' | 'song';
  dawStep: number;
  onUpdateSong: (updater: (prev: DawSongState) => DawSongState) => void;
  onSelectPattern: (patternId: string) => void;
  onSwitchPlayMode: (mode: 'pattern' | 'song') => void;
}

const LANE_LABELS = [
  { label: 'Track 1 · Main Groove', color: 'border-amber-400/60 bg-amber-500/20 text-amber-200' },
  { label: 'Track 2 · Bass / Low', color: 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200' },
  { label: 'Track 3 · Synth / Lead', color: 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200' },
  { label: 'Track 4 · Alt / Fill', color: 'border-violet-400/60 bg-violet-500/20 text-violet-200' },
];

export const DawSongMode: React.FC<DawSongModeProps> = ({
  song,
  patterns,
  activePatternId,
  timeSignature,
  isPlaying,
  playMode,
  dawStep,
  onUpdateSong,
  onSelectPattern,
  onSwitchPlayMode,
}) => {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [paintPatternId, setPaintPatternId] = useState<string>(activePatternId);

  const tsInfo = getTimeSignatureInfo(timeSignature);
  const currentBarPos =
    isPlaying && playMode === 'song' ? dawStep / tsInfo.stepsPerBar : -1;

  const selectedClip = song.clips.find((c) => c.id === selectedClipId) ?? null;

  const addClipAt = (lane: number, startBar: number, patternId = paintPatternId) => {
    const pat = patterns[patternId];
    const patBars = pat ? Math.max(1, Math.round(pat.stepCount / 16)) : 1;
    const newClip: DawSongClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      lane,
      patternId,
      startBar,
      lengthBars: Math.min(patBars, song.totalBars - startBar),
    };
    onUpdateSong((prev) => ({
      ...prev,
      clips: [...prev.clips, newClip],
    }));
    setSelectedClipId(newClip.id);
    if (playMode !== 'song') {
      onSwitchPlayMode('song');
    }
  };

  const updateSelectedClip = (patch: Partial<DawSongClip>) => {
    if (!selectedClip) return;
    onUpdateSong((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === selectedClip.id ? { ...c, ...patch } : c)),
    }));
  };

  const handleDuplicateClip = () => {
    if (!selectedClip) return;
    const nextStart = Math.min(
      song.totalBars - 1,
      selectedClip.startBar + selectedClip.lengthBars
    );
    const dup: DawSongClip = {
      ...selectedClip,
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startBar: nextStart,
    };
    onUpdateSong((prev) => ({
      ...prev,
      clips: [...prev.clips, dup],
    }));
    setSelectedClipId(dup.id);
  };

  const handleDeleteClip = () => {
    if (!selectedClip) return;
    onUpdateSong((prev) => ({
      ...prev,
      clips: prev.clips.filter((c) => c.id !== selectedClip.id),
    }));
    setSelectedClipId(null);
  };

  const barWidth = 56;
  const timelineWidth = song.totalBars * barWidth;

  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5">
      {/* Top Arrangement Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#111622] border border-[#242E40] shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 bg-[#090C12] px-2 h-8 rounded-md border border-[#242E40]">
            <span className="text-[10px] font-medium text-slate-400">Clip</span>
            <select
              aria-label="Pattern to Place"
              value={paintPatternId}
              onChange={(e) => {
                setPaintPatternId(e.target.value);
                onSelectPattern(e.target.value);
              }}
              className="bg-transparent text-xs font-mono-num font-semibold text-cyan-300 focus:outline-none"
            >
              {Object.keys(patterns).map((pid) => (
                <option key={pid} value={pid} className="bg-[#111622]">
                  {pid} ({patterns[pid]?.stepCount ?? 16}s)
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => addClipAt(0, 0, paintPatternId)}
            className="inline-flex items-center gap-1 px-2.5 h-8 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-[11px] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Clip</span>
          </button>

          {/* Loop Section Controls */}
          <div className="flex items-center gap-1 bg-[#090C12] px-1.5 h-8 rounded-md border border-[#242E40]">
            <button
              type="button"
              onClick={() =>
                onUpdateSong((prev) => ({
                  ...prev,
                  loopSectionEnabled: !prev.loopSectionEnabled,
                }))
              }
              aria-pressed={song.loopSectionEnabled}
              className={`inline-flex items-center gap-1 px-2 h-6 rounded text-[10px] font-semibold cursor-pointer ${
                song.loopSectionEnabled
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Repeat className="w-3 h-3" />
              <span>Loop Sec</span>
            </button>
            <span className="text-[10px] text-slate-500 font-mono-num">Bars</span>
            <select
              aria-label="Loop Start Bar"
              value={song.loopStartBar}
              onChange={(e) => {
                const start = parseInt(e.target.value, 10);
                onUpdateSong((prev) => ({
                  ...prev,
                  loopStartBar: start,
                  loopEndBar: Math.max(start + 1, prev.loopEndBar),
                }));
              }}
              className="bg-[#131822] px-1 h-6 rounded text-[11px] font-mono-num text-slate-200"
            >
              {Array.from({ length: song.totalBars }, (_, b) => (
                <option key={b} value={b}>
                  {b + 1}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-500">-</span>
            <select
              aria-label="Loop End Bar"
              value={song.loopEndBar}
              onChange={(e) => {
                const end = parseInt(e.target.value, 10);
                onUpdateSong((prev) => ({
                  ...prev,
                  loopEndBar: end,
                  loopStartBar: Math.min(prev.loopStartBar, end - 1),
                }));
              }}
              className="bg-[#131822] px-1 h-6 rounded text-[11px] font-mono-num text-slate-200"
            >
              {Array.from({ length: song.totalBars }, (_, b) => (
                <option key={b + 1} value={b + 1}>
                  {b + 1}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Clip Actions + Expand Song */}
        <div className="flex items-center gap-1 shrink-0">
          {selectedClip && (
            <>
              <button
                type="button"
                aria-label="Move Clip Left"
                onClick={() =>
                  updateSelectedClip({
                    startBar: Math.max(0, selectedClip.startBar - 1),
                  })
                }
                className="w-7 h-8 rounded bg-[#090C12] border border-[#242E40] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Move Clip Right"
                onClick={() =>
                  updateSelectedClip({
                    startBar: Math.min(
                      song.totalBars - selectedClip.lengthBars,
                      selectedClip.startBar + 1
                    ),
                  })
                }
                className="w-7 h-8 rounded bg-[#090C12] border border-[#242E40] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Move Clip Up Track"
                onClick={() =>
                  updateSelectedClip({ lane: Math.max(0, selectedClip.lane - 1) })
                }
                className="w-7 h-8 rounded bg-[#090C12] border border-[#242E40] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Move Clip Down Track"
                onClick={() =>
                  updateSelectedClip({ lane: Math.min(3, selectedClip.lane + 1) })
                }
                className="w-7 h-8 rounded bg-[#090C12] border border-[#242E40] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Shorten Clip"
                onClick={() =>
                  updateSelectedClip({
                    lengthBars: Math.max(1, selectedClip.lengthBars - 1),
                  })
                }
                className="px-2 h-8 rounded bg-[#090C12] border border-[#242E40] font-mono-num text-[11px] text-slate-300 hover:text-white cursor-pointer"
              >
                -1B
              </button>
              <button
                type="button"
                aria-label="Extend Clip"
                onClick={() =>
                  updateSelectedClip({
                    lengthBars: Math.min(
                      song.totalBars - selectedClip.startBar,
                      selectedClip.lengthBars + 1
                    ),
                  })
                }
                className="px-2 h-8 rounded bg-[#090C12] border border-[#242E40] font-mono-num text-[11px] text-slate-300 hover:text-white cursor-pointer"
              >
                +1B
              </button>
              <button
                type="button"
                aria-label="Duplicate Clip"
                onClick={handleDuplicateClip}
                className="w-8 h-8 rounded bg-[#090C12] border border-[#242E40] flex items-center justify-center text-cyan-300 hover:border-cyan-400/50 cursor-pointer"
              >
                <CopyPlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Delete Clip"
                onClick={handleDeleteClip}
                className="w-8 h-8 rounded bg-rose-500/20 border border-rose-400/50 flex items-center justify-center text-rose-300 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() =>
              onUpdateSong((prev) => ({
                ...prev,
                totalBars: Math.min(64, prev.totalBars + 4),
              }))
            }
            className="px-2 h-8 rounded bg-[#090C12] border border-[#242E40] font-mono-num text-[11px] text-slate-300 hover:text-cyan-300 cursor-pointer whitespace-nowrap"
          >
            +4 Bars
          </button>
        </div>
      </div>

      {/* Multi-Track Timeline */}
      <div className="flex-1 min-h-0 flex rounded-lg border border-[#242E40] bg-[#0B0E14] overflow-hidden">
        {/* Track Header Column */}
        <div className="w-36 sm:w-44 shrink-0 border-r border-[#242E40] bg-[#0D1119] flex flex-col">
          <div className="h-7 border-b border-[#242E40] px-2.5 flex items-center justify-between text-[10px] text-slate-400 font-mono-num shrink-0">
            <span>ARRANGEMENT</span>
            <span>{song.clips.length} Clips</span>
          </div>
          <div className="flex-1 flex flex-col">
            {LANE_LABELS.map((lane, idx) => (
              <div
                key={idx}
                className="flex-1 px-2.5 border-b last:border-b-0 border-[#1A2232] flex items-center text-[11px] font-medium text-slate-200"
              >
                <span className="truncate">{lane.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable Bars + Clips Grid */}
        <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden synth-scroll">
          <div className="h-full flex flex-col relative" style={{ width: timelineWidth }}>
            {/* Bar Ruler */}
            <div className="h-7 border-b border-[#242E40] bg-[#101521] flex relative shrink-0">
              {Array.from({ length: song.totalBars }, (_, barIdx) => {
                const inLoop =
                  song.loopSectionEnabled &&
                  barIdx >= song.loopStartBar &&
                  barIdx < song.loopEndBar;
                return (
                  <div
                    key={barIdx}
                    style={{ width: barWidth }}
                    className={`h-full border-r border-[#1F283B] px-1.5 flex items-center justify-between font-mono-num text-[10px] shrink-0 ${
                      inLoop
                        ? 'bg-amber-500/15 text-amber-200 border-b-2 border-b-amber-400'
                        : 'text-slate-400'
                    }`}
                  >
                    <span>Bar {barIdx + 1}</span>
                  </div>
                );
              })}
            </div>

            {/* 4 Arrangement Lanes */}
            <div className="flex-1 flex flex-col relative">
              {LANE_LABELS.map((laneMeta, laneIdx) => (
                <div
                  key={laneIdx}
                  className="flex-1 flex relative border-b last:border-b-0 border-[#1A2232]"
                >
                  {/* Empty Clickable Bar Cells */}
                  {Array.from({ length: song.totalBars }, (_, barIdx) => (
                    <button
                      key={barIdx}
                      type="button"
                      aria-label={`Place ${paintPatternId} at Track ${laneIdx + 1} Bar ${barIdx + 1}`}
                      onClick={() => addClipAt(laneIdx, barIdx, paintPatternId)}
                      style={{ width: barWidth }}
                      className={`h-full border-r border-[#161E2C] shrink-0 hover:bg-cyan-500/10 transition-colors cursor-pointer ${
                        barIdx % 4 === 0 ? 'bg-[#0E131D]' : 'bg-[#0B0E15]'
                      }`}
                    />
                  ))}

                  {/* Placed Pattern Clips */}
                  {song.clips
                    .filter((c) => c.lane === laneIdx)
                    .map((clip) => {
                      const isSelected = clip.id === selectedClipId;
                      return (
                        <button
                          key={clip.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedClipId(clip.id);
                            onSelectPattern(clip.patternId);
                          }}
                          style={{
                            left: clip.startBar * barWidth + 2,
                            width: clip.lengthBars * barWidth - 4,
                          }}
                          className={`absolute top-1.5 bottom-1.5 rounded-md border px-2 flex flex-col justify-center text-left overflow-hidden cursor-pointer transition-all ${
                            laneMeta.color
                          } ${isSelected ? 'ring-2 ring-white z-10' : 'hover:brightness-110'}`}
                        >
                          <div className="font-display font-bold text-xs leading-tight truncate">
                            {clip.patternId}
                          </div>
                          <div className="font-mono-num text-[9px] opacity-80 truncate">
                            {clip.lengthBars} Bar{clip.lengthBars > 1 ? 's' : ''}
                          </div>
                        </button>
                      );
                    })}
                </div>
              ))}

              {/* Song Playhead */}
              {currentBarPos >= 0 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 pointer-events-none z-20"
                  style={{ transform: `translateX(${currentBarPos * barWidth}px)` }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
