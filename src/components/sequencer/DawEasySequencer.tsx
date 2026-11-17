import React, { useState } from 'react';
import {
  ListMusic,
  Play,
  Plus,
  Repeat,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { beatboxEngine } from '../../audio/BeatboxEngine';
import {
  DAW_TRACK_ORDER,
  DAW_TRACK_TEMPLATES,
  cloneDawPattern,
  createEmptyDawPattern,
  createGrooveTemplatePattern,
} from '../../audio/dawPresets';
import { studioAudio } from '../../audio/StudioAudio';
import { subbassEngine } from '../../audio/SubbassEngine';
import { synthEngine } from '../../audio/SynthEngine';
import { sixSixSixEngine } from '../../audio/ts666/SixSixSixEngine';
import { useDawStep, useIsPlaying } from '../../audio/transportStore';
import type { DrumTrackId } from '../../types/beatbox';
import type {
  DawPattern,
  DawStep,
  DawTrackConfig,
  DawTrackId,
} from '../../types/daw';

interface DawEasySequencerProps {
  pattern: DawPattern;
  patternIds: string[];
  activePatternId: string;
  trackOrder: DawTrackId[];
  tracks: Record<DawTrackId, DawTrackConfig>;
  bpm: number;
  loop: boolean;
  isPlaying?: boolean;
  dawStep?: number;
  onSelectPattern: (patternId: string) => void;
  onUpdatePattern: (updater: (prev: DawPattern) => DawPattern) => void;
  onUpdateTrack: (trackId: DawTrackId, patch: Partial<DawTrackConfig>) => void;
  onAddTrack: (templateId: string) => void;
  onRemoveTrack: (trackId: DawTrackId) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onChangeBpm: (bpm: number) => void;
  onOpenPianoRoll: () => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function formatMidi(midi: number): string {
  const semi = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[semi]}${oct}`;
}

export const DawEasySequencer: React.FC<DawEasySequencerProps> = React.memo(({
  pattern,
  patternIds,
  activePatternId,
  trackOrder,
  tracks,
  bpm,
  loop,
  isPlaying: isPlayingProp,
  dawStep: dawStepProp,
  onSelectPattern,
  onUpdatePattern,
  onUpdateTrack,
  onAddTrack,
  onRemoveTrack,
  onTogglePlay,
  onStop,
  onToggleLoop,
  onChangeBpm,
  onOpenPianoRoll,
}) => {
  const storeIsPlaying = useIsPlaying();
  const storeDawStep = useDawStep();
  const isPlaying = isPlayingProp ?? storeIsPlaying;
  const dawStep = dawStepProp ?? storeDawStep;
  const order = trackOrder.length > 0 ? trackOrder : DAW_TRACK_ORDER;
  const [selectedCell, setSelectedCell] = useState<{
    trackId: DawTrackId;
    stepIdx: number;
  }>({ trackId: order[0] ?? 'kick', stepIdx: 0 });
  const [addTrackOpen, setAddTrackOpen] = useState<boolean>(false);

  const safeTrackId = tracks[selectedCell.trackId] ? selectedCell.trackId : order[0];
  const safeStepIdx = Math.max(0, Math.min(15, selectedCell.stepIdx));
  const selectedTrack = safeTrackId ? tracks[safeTrackId] : undefined;
  const selectedStep =
    safeTrackId && pattern.tracks[safeTrackId]?.[safeStepIdx]
      ? pattern.tracks[safeTrackId][safeStepIdx]
      : undefined;

  const isMelodic =
    selectedTrack?.target === 'serum' ||
    selectedTrack?.target === 'subbass' ||
    selectedTrack?.target === 'ts666';

  const currentStepInt = isPlaying ? Math.floor(dawStep) % 16 : -1;

  const auditionTrackStep = (trackId: DawTrackId, step?: DawStep) => {
    const cfg = tracks[trackId];
    if (!cfg) return;
    studioAudio.unlockSync();
    const vel = step?.velocity ?? 0.9;

    if (cfg.target === 'beatbox') {
      const drumId: DrumTrackId =
        cfg.drumTrackId ??
        (trackId === 'hihat'
          ? step && step.length >= 1.5
            ? 'oh'
            : 'ch'
          : trackId === 'kick' ||
            trackId === 'snare' ||
            trackId === 'perc' ||
            trackId === 'clap' ||
            trackId === 'ch' ||
            trackId === 'oh' ||
            trackId === 'rim' ||
            trackId === 'crash'
          ? (trackId as DrumTrackId)
          : 'kick');
      void beatboxEngine.triggerTrack(drumId, vel);
      return;
    }

    const midi = step?.note ?? cfg.defaultNote;
    if (cfg.target === 'subbass') {
      void subbassEngine.ensureAudio().then((ctx) => {
        const now = ctx.currentTime;
        subbassEngine.scheduleNote(midi, vel, now, now + 0.25);
      });
    } else if (cfg.target === 'ts666') {
      void sixSixSixEngine.ensureAudio().then((ctx) => {
        if (!ctx) return;
        const now = ctx.currentTime;
        sixSixSixEngine.scheduleNote(midi, vel, now, now + 0.22);
      });
    } else {
      void synthEngine.ensureAudio().then((ctx) => {
        const now = ctx.currentTime;
        void synthEngine.scheduleNote(midi, vel, now, now + 0.22);
      });
    }
  };

  const handleToggleStep = (trackId: DawTrackId, stepIdx: number) => {
    const cfg = tracks[trackId];
    const row = pattern.tracks[trackId] ?? [];
    const curr = row[stepIdx];
    const nextActive = !curr?.active;
    setSelectedCell({ trackId, stepIdx });

    onUpdatePattern((prev) => {
      const existingRow = prev.tracks[trackId] ?? [];
      const nextRow = existingRow.map((s, idx) =>
        idx === stepIdx ? { ...s, active: nextActive } : s
      );
      return {
        ...prev,
        tracks: {
          ...prev.tracks,
          [trackId]: nextRow,
        },
      };
    });

    if (nextActive && cfg) {
      auditionTrackStep(trackId, curr);
    }
  };

  const updateSelectedNote = (delta: number) => {
    if (!safeTrackId || !selectedStep) return;
    const nextNote = Math.max(24, Math.min(84, selectedStep.note + delta));
    onUpdatePattern((prev) => {
      const existingRow = prev.tracks[safeTrackId] ?? [];
      const nextRow = existingRow.map((s, idx) =>
        idx === safeStepIdx ? { ...s, note: nextNote, active: true } : s
      );
      return {
        ...prev,
        tracks: {
          ...prev.tracks,
          [safeTrackId]: nextRow,
        },
      };
    });
    auditionTrackStep(safeTrackId, { ...selectedStep, note: nextNote });
  };

  const handleClearPattern = () => {
    onUpdatePattern((prev) =>
      createEmptyDawPattern(prev.id, prev.name, 16, tracks, order)
    );
  };

  const handleLoadGroove = () => {
    studioAudio.unlockSync();
    onUpdatePattern((prev) => {
      const g = createGrooveTemplatePattern(prev.id);
      return cloneDawPattern(
        {
          ...g,
          tracks: {
            ...prev.tracks,
            ...g.tracks,
          },
        },
        prev.id,
        prev.name
      );
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      {/* EASY MODE TOP CONTROL BAR: Transport, BPM, Pattern Selector, Add Track */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#111622] border border-[#242E40] shrink-0">
        {/* Left: Play, Stop, Loop, BPM */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={onTogglePlay}
            style={{ touchAction: 'manipulation' }}
            className={`inline-flex items-center gap-1.5 px-3.5 h-10 rounded-lg font-display font-bold text-xs tracking-wide transition-colors cursor-pointer ${
              isPlaying
                ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                : 'bg-emerald-500/20 border border-emerald-400/60 text-emerald-200 hover:bg-emerald-500/30'
            }`}
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{isPlaying ? 'PLAYING' : 'PLAY'}</span>
          </button>

          <button
            type="button"
            aria-label="Stop Sequencer"
            onClick={onStop}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1 px-3 h-10 rounded-lg bg-[#0B0E14] border border-[#263042] text-xs font-display font-bold text-slate-200 hover:text-white hover:border-slate-400 cursor-pointer"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>STOP</span>
          </button>

          <button
            type="button"
            aria-pressed={loop}
            onClick={onToggleLoop}
            style={{ touchAction: 'manipulation' }}
            className={`inline-flex items-center gap-1 px-2.5 h-10 rounded-lg border text-xs font-semibold cursor-pointer ${
              loop
                ? 'bg-cyan-500/20 border-cyan-400/70 text-cyan-200'
                : 'bg-[#0B0E14] border-[#263042] text-slate-400 hover:text-white'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>LOOP</span>
          </button>

          {/* Simple BPM Control */}
          <div className="flex items-center bg-[#090C12] rounded-lg border border-[#242E40] h-10 px-1 gap-1">
            <button
              type="button"
              aria-label="Decrease BPM"
              onClick={() => onChangeBpm(bpm - 1)}
              style={{ touchAction: 'manipulation' }}
              className="w-8 h-8 rounded bg-[#141B29] text-slate-200 hover:text-white font-bold text-sm cursor-pointer"
            >
              -
            </button>
            <div className="px-2 text-center min-w-[66px]">
              <div className="font-mono-num text-sm font-bold text-slate-100 leading-none">
                {Math.round(bpm)}
              </div>
              <div className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">
                BPM
              </div>
            </div>
            <button
              type="button"
              aria-label="Increase BPM"
              onClick={() => onChangeBpm(bpm + 1)}
              style={{ touchAction: 'manipulation' }}
              className="w-8 h-8 rounded bg-[#141B29] text-slate-200 hover:text-white font-bold text-sm cursor-pointer"
            >
              +
            </button>
          </div>
        </div>

        {/* Right: Simple Pattern Switcher, Groove, Clear, + Add Track */}
        <div className="flex items-center gap-1.5 flex-wrap relative">
          <div className="flex items-center gap-1 bg-[#090C12] px-1.5 h-10 rounded-lg border border-[#242E40]">
            <span className="text-[10px] font-semibold text-slate-400 uppercase">
              Pattern
            </span>
            <select
              aria-label="Select Pattern"
              value={activePatternId}
              onChange={(e) => onSelectPattern(e.target.value)}
              className="h-8 px-2 rounded bg-[#131A26] border border-[#263042] font-mono-num text-xs font-bold text-cyan-300 focus:outline-none cursor-pointer"
            >
              {patternIds.map((pid) => (
                <option key={pid} value={pid}>
                  {pid}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleLoadGroove}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1 px-2.5 h-10 rounded-lg bg-amber-500/15 border border-amber-400/50 text-amber-200 hover:bg-amber-500/25 text-xs font-semibold cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Groove</span>
          </button>

          <button
            type="button"
            onClick={handleClearPattern}
            title="Clear Current Pattern Steps"
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1 px-2.5 h-10 rounded-lg bg-[#0B0E14] border border-[#263042] text-xs font-medium text-slate-300 hover:text-rose-400 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>

          <button
            type="button"
            onClick={() => setAddTrackOpen((o) => !o)}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1 px-3 h-10 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs tracking-wide cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>ADD TRACK</span>
          </button>

          {addTrackOpen && (
            <div className="absolute right-0 top-12 z-30 w-64 rounded-xl border border-[#2D3B55] bg-[#131926] shadow-2xl p-2">
              <div className="flex items-center justify-between px-1.5 pb-1.5 mb-1.5 border-b border-[#232D42]">
                <span className="font-display text-xs font-bold text-slate-100">
                  Add Instrument or Drum Track
                </span>
                <button
                  type="button"
                  onClick={() => setAddTrackOpen(false)}
                  className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1 max-h-60 overflow-y-auto synth-scroll">
                {DAW_TRACK_TEMPLATES.filter((tpl) => tpl.target !== 'serum').map((tpl) => (
                  <button
                    key={tpl.templateId}
                    type="button"
                    onClick={() => {
                      onAddTrack(tpl.templateId);
                      setAddTrackOpen(false);
                    }}
                    className="flex items-center justify-between gap-1 px-2 py-2 rounded-lg bg-[#0A0E16] hover:bg-[#192234] border border-[#222B3E] text-left cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-slate-100 truncate">
                      {tpl.name}
                    </span>
                    <span
                      className={`text-[9px] font-mono-num uppercase px-1 rounded ${
                        tpl.target === 'subbass'
                          ? 'bg-blue-500/20 text-blue-300'
                          : tpl.target === 'ts666'
                          ? 'bg-rose-500/20 text-rose-300'
                          : tpl.target === 'serum'
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {tpl.target === 'subbass'
                        ? 'SUB'
                        : tpl.target === 'ts666'
                        ? '666'
                        : tpl.target === 'serum'
                        ? 'SYN'
                        : 'DRM'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* LARGE TOUCH-FRIENDLY 16-STEP GRID */}
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[#242E40] bg-[#111622] overflow-hidden">
        {/* Top 16-Step Beat Ruler */}
        <div className="flex items-center border-b border-[#242E40] bg-[#0B0F17] shrink-0">
          <div className="w-40 sm:w-52 shrink-0 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-r border-[#242E40]">
            Tracks ({order.length})
          </div>
          <div className="flex-1 min-w-0 overflow-x-auto synth-scroll px-2 py-1.5">
            <div className="grid grid-cols-16 gap-1.5 min-w-[540px]">
              {Array.from({ length: 16 }, (_, stepIdx) => {
                const isBeat = stepIdx % 4 === 0;
                const isHead = currentStepInt === stepIdx;
                return (
                  <div
                    key={stepIdx}
                    className={`text-center font-mono-num text-[10px] font-bold rounded py-0.5 ${
                      isHead
                        ? 'bg-white text-slate-950'
                        : isBeat
                        ? 'text-cyan-300'
                        : 'text-slate-500'
                    }`}
                  >
                    {isBeat ? `B${stepIdx / 4 + 1}` : stepIdx + 1}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Scrollable Track Rows */}
        <div className="flex-1 min-h-0 overflow-y-auto synth-scroll divide-y divide-[#1A2232]">
          {order.map((tid) => {
            const cfg = tracks[tid];
            if (!cfg) return null;
            const steps = pattern.tracks[tid] ?? [];
            const isSub = cfg.target === 'subbass';
            const isTs666 = cfg.target === 'ts666';
            const isCyan = cfg.accent === 'cyan';
            const rowIsMelodic =
              cfg.target === 'serum' || cfg.target === 'subbass' || cfg.target === 'ts666';

            return (
              <div
                key={tid}
                className={`flex items-stretch min-h-[52px] ${
                  cfg.muted ? 'opacity-55' : ''
                }`}
              >
                {/* Left Track Header */}
                <div className="w-40 sm:w-52 shrink-0 border-r border-[#242E40] bg-[#0D1119] px-2.5 py-1.5 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-1.5 h-7 rounded-full shrink-0 ${
                        isSub
                          ? 'bg-blue-400'
                          : isTs666
                          ? 'bg-rose-400'
                          : isCyan
                          ? 'bg-cyan-400'
                          : 'bg-amber-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCell({ trackId: tid, stepIdx: safeStepIdx });
                          auditionTrackStep(tid, steps[safeStepIdx]);
                        }}
                        className="block text-left text-xs font-bold text-slate-100 hover:text-cyan-200 truncate cursor-pointer"
                      >
                        {cfg.name}
                      </button>
                      {rowIsMelodic ? (
                        <button
                          type="button"
                          title="Tap to cycle output between SUBBASS and 666TS"
                          onClick={() =>
                            onUpdateTrack(tid, {
                              target:
                                cfg.target === 'subbass'
                                  ? 'ts666'
                                  : 'subbass',
                            })
                          }
                          className={`mt-0.5 text-[9px] font-mono-num uppercase px-1.5 py-0.5 rounded border cursor-pointer ${
                            cfg.target === 'subbass'
                              ? 'bg-blue-500/20 text-blue-200 border-blue-400/60'
                              : cfg.target === 'ts666'
                              ? 'bg-rose-500/20 text-rose-200 border-rose-400/60'
                              : 'bg-cyan-500/15 text-cyan-300 border-cyan-400/40'
                          }`}
                        >
                          {cfg.target === 'ts666' ? '666TS' : cfg.target}
                        </button>
                      ) : (
                        <span className="block text-[9px] font-mono-num text-slate-400 uppercase">
                          BEATBOX
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Track M, S, Remove */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label={`Mute ${cfg.name}`}
                      onClick={() => onUpdateTrack(tid, { muted: !cfg.muted })}
                      style={{ touchAction: 'manipulation' }}
                      className={`w-7 h-7 rounded text-[10px] font-bold cursor-pointer ${
                        cfg.muted
                          ? 'bg-rose-500 text-white'
                          : 'bg-[#141B29] text-slate-300 hover:text-white'
                      }`}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      aria-label={`Solo ${cfg.name}`}
                      onClick={() => onUpdateTrack(tid, { solo: !cfg.solo })}
                      style={{ touchAction: 'manipulation' }}
                      className={`w-7 h-7 rounded text-[10px] font-bold cursor-pointer ${
                        cfg.solo
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-[#141B29] text-slate-300 hover:text-white'
                      }`}
                    >
                      S
                    </button>
                    {order.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove ${cfg.name}`}
                        title={`Remove ${cfg.name}`}
                        onClick={() => onRemoveTrack(tid)}
                        style={{ touchAction: 'manipulation' }}
                        className="w-7 h-7 rounded bg-[#141B29] text-slate-500 hover:text-rose-400 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Right 16 Large Touch Step Pads */}
                <div className="flex-1 min-w-0 overflow-x-auto synth-scroll px-2 py-1.5">
                  <div className="grid grid-cols-16 gap-1.5 h-full min-w-[540px]">
                    {Array.from({ length: 16 }, (_, stepIdx) => {
                      const cell = steps[stepIdx] ?? {
                        active: false,
                        velocity: 0.88,
                        probability: 1,
                        length: 1,
                        note: cfg.defaultNote,
                      };
                      const isBeatStart = stepIdx % 4 === 0;
                      const isHead = currentStepInt === stepIdx;
                      const isSelected =
                        safeTrackId === tid && safeStepIdx === stepIdx;
                      const altGroup = Math.floor(stepIdx / 4) % 2 === 1;

                      return (
                        <button
                          key={stepIdx}
                          type="button"
                          aria-label={`${cfg.name} Step ${stepIdx + 1}`}
                          aria-pressed={cell.active}
                          onClick={() => handleToggleStep(tid, stepIdx)}
                          style={{ touchAction: 'manipulation' }}
                          className={`relative min-h-[42px] rounded-lg border font-mono-num text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center ${
                            isHead
                              ? 'ring-2 ring-white border-white'
                              : isSelected
                              ? 'border-cyan-300'
                              : isBeatStart
                              ? 'border-[#334360]'
                              : 'border-[#20293B]'
                          } ${
                            cell.active
                              ? isSub
                                ? 'bg-gradient-to-b from-blue-500 to-violet-600 text-white shadow-[0_0_10px_rgba(59,130,246,0.35)]'
                                : isCyan
                                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(34,211,238,0.3)]'
                                : 'bg-amber-400 text-slate-950 shadow-[0_0_10px_rgba(251,191,36,0.3)]'
                              : altGroup
                              ? 'bg-[#121826] text-slate-500 hover:bg-[#192236]'
                              : 'bg-[#0B0F17] text-slate-500 hover:bg-[#151D2E]'
                          }`}
                        >
                          {rowIsMelodic && cell.active
                            ? formatMidi(cell.note)
                            : stepIdx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* BOTTOM SIMPLE NOTE & PIANO ROLL BAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#111622] border border-[#242E40] shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="font-display text-xs font-bold text-slate-100">
            {selectedTrack ? `${selectedTrack.name} · Step ${safeStepIdx + 1}` : 'Tap any step'}
          </span>
          {selectedStep && (
            <span className="text-xs text-slate-400">
              {selectedStep.active ? 'ON' : 'OFF'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isMelodic && selectedStep && (
            <div className="flex items-center gap-1 bg-[#090C12] px-1.5 h-9 rounded-lg border border-[#263042]">
              <button
                type="button"
                onClick={() => updateSelectedNote(-12)}
                style={{ touchAction: 'manipulation' }}
                className="px-2 h-7 rounded bg-[#141B29] text-[11px] font-mono-num text-slate-200 hover:text-white cursor-pointer"
              >
                -Oct
              </button>
              <button
                type="button"
                onClick={() => updateSelectedNote(-1)}
                style={{ touchAction: 'manipulation' }}
                className="w-7 h-7 rounded bg-[#141B29] text-sm font-bold text-slate-200 hover:text-white cursor-pointer"
              >
                -
              </button>
              <span className="font-mono-num text-xs font-bold text-cyan-300 w-9 text-center">
                {formatMidi(selectedStep.note)}
              </span>
              <button
                type="button"
                onClick={() => updateSelectedNote(1)}
                style={{ touchAction: 'manipulation' }}
                className="w-7 h-7 rounded bg-[#141B29] text-sm font-bold text-slate-200 hover:text-white cursor-pointer"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => updateSelectedNote(12)}
                style={{ touchAction: 'manipulation' }}
                className="px-2 h-7 rounded bg-[#141B29] text-[11px] font-mono-num text-slate-200 hover:text-white cursor-pointer"
              >
                +Oct
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenPianoRoll}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/50 text-cyan-200 font-display font-bold text-xs cursor-pointer"
          >
            <ListMusic className="w-4 h-4" />
            <span>PIANO ROLL</span>
          </button>
        </div>
      </div>
    </div>
  );
});
