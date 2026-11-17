import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CopyPlus,
  ListMusic,
  Play,
  Plus,
  Repeat,
  Square,
  Trash2,
} from 'lucide-react';
import { beatboxEngine } from '../../audio/BeatboxEngine';
import { DRUM_TRACK_ORDER, makeKitTracks } from '../../audio/beatboxPresets';
import { createEmptyDawStep } from '../../audio/dawPresets';
import { studioAudio } from '../../audio/StudioAudio';
import { useDawStep, useIsPlaying } from '../../audio/transportStore';
import type { DrumTrackId } from '../../types/beatbox';
import type {
  DawPattern,
  DawPlayMode,
  DawStep,
  DawTrackConfig,
  DawTrackId,
} from '../../types/daw';

interface DawDrumPatternEditorProps {
  track: DawTrackConfig;
  pattern: DawPattern;
  patternOptions: { id: string; label: string }[];
  playMode: DawPlayMode;
  bpm: number;
  loop: boolean;
  isPlaying?: boolean;
  dawStep?: number;
  onBack: () => void;
  onOpenPianoRoll: () => void;
  onSelectPattern: (patternId: string) => void;
  onCreatePattern: () => void;
  onDuplicatePattern: () => void;
  onClearPattern: () => void;
  onUpdatePattern: (updater: (prev: DawPattern) => DawPattern) => void;
  onChangePlayMode: (mode: DawPlayMode) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onChangeBpm: (bpm: number) => void;
}

export const DawDrumPatternEditor: React.FC<DawDrumPatternEditorProps> = React.memo(({
  track,
  pattern,
  patternOptions,
  playMode,
  bpm,
  loop,
  isPlaying: isPlayingProp,
  dawStep: dawStepProp,
  onBack,
  onOpenPianoRoll,
  onSelectPattern,
  onCreatePattern,
  onDuplicatePattern,
  onClearPattern,
  onUpdatePattern,
  onChangePlayMode,
  onTogglePlay,
  onStop,
  onToggleLoop,
  onChangeBpm,
}) => {
  const storeIsPlaying = useIsPlaying();
  const storeDawStep = useDawStep();
  const isPlaying = isPlayingProp ?? storeIsPlaying;
  const dawStep = dawStepProp ?? storeDawStep;

  const [activeBarPage, setActiveBarPage] = useState<number>(0);

  const isKitTrack = track.target === 'beatbox' && !track.drumTrackId;
  const stepCount = pattern.stepCount ?? 16;
  const totalPages = Math.max(1, Math.ceil(stepCount / 16));
  const safePage = Math.min(activeBarPage, totalPages - 1);
  const pageOffset = safePage * 16;
  const currentStepInt = isPlaying ? Math.floor(dawStep) % stepCount : -1;

  const drumRows = useMemo<{
    storageKey: string;
    drumId: DrumTrackId;
    label: string;
    shortLabel: string;
    accentColor: string;
  }[]>(() => {
    if (isKitTrack) {
      const kitMeta = makeKitTracks('dubstep_heavy');
      return DRUM_TRACK_ORDER.map((drumId) => {
        const meta = kitMeta[drumId];
        return {
          storageKey: `${track.id}:${drumId}`,
          drumId,
          label: meta?.name ?? drumId.toUpperCase(),
          shortLabel: meta?.shortName ?? drumId.toUpperCase(),
          accentColor: meta?.accentColor ?? 'amber',
        };
      });
    }
    const singleDrumId: DrumTrackId =
      track.drumTrackId ??
      (track.id === 'hihat'
        ? 'ch'
        : track.id === 'kick' ||
          track.id === 'snare' ||
          track.id === 'perc' ||
          track.id === 'clap' ||
          track.id === 'ch' ||
          track.id === 'oh' ||
          track.id === 'rim' ||
          track.id === 'crash'
        ? (track.id as DrumTrackId)
        : 'kick');

    return [
      {
        storageKey: track.id,
        drumId: singleDrumId,
        label: track.name,
        shortLabel: track.shortName,
        accentColor: 'amber',
      },
    ];
  }, [isKitTrack, track]);

  const getRowSteps = (storageKey: string, drumId: DrumTrackId): DawStep[] => {
    const direct = pattern.tracks[storageKey];
    if (direct) return direct;
    if (isKitTrack && pattern.tracks[drumId]) return pattern.tracks[drumId];
    return Array.from({ length: 64 }, () => createEmptyDawStep(track.defaultNote));
  };

  const auditionDrum = (drumId: DrumTrackId, vel = 0.92) => {
    studioAudio.unlockSync();
    void beatboxEngine.triggerTrack(drumId, vel);
  };

  const toggleStep = (storageKey: string, drumId: DrumTrackId, stepIdx: number) => {
    const currRow = getRowSteps(storageKey, drumId);
    const currCell = currRow[stepIdx] ?? createEmptyDawStep(track.defaultNote);
    const nextActive = !currCell.active;

    onUpdatePattern((prev) => {
      const baseRow =
        prev.tracks[storageKey] ??
        (isKitTrack ? prev.tracks[drumId] : undefined) ??
        Array.from({ length: 64 }, () => createEmptyDawStep(track.defaultNote));
      const nextRow = Array.from({ length: 64 }, (_, i) => {
        const item = baseRow[i] ?? createEmptyDawStep(track.defaultNote);
        return i === stepIdx ? { ...item, active: nextActive } : item;
      });
      return {
        ...prev,
        tracks: {
          ...prev.tracks,
          [storageKey]: nextRow,
        },
      };
    });

    if (nextActive) {
      auditionDrum(drumId, currCell.velocity);
    }
  };

  const handleToggleVelocityAccent = (
    storageKey: string,
    drumId: DrumTrackId,
    stepIdx: number
  ) => {
    const currRow = getRowSteps(storageKey, drumId);
    const currCell = currRow[stepIdx];
    if (!currCell?.active) return;
    const nextVel = currCell.velocity > 0.92 ? 0.65 : currCell.velocity < 0.78 ? 0.88 : 1.0;
    onUpdatePattern((prev) => {
      const baseRow =
        prev.tracks[storageKey] ??
        (isKitTrack ? prev.tracks[drumId] : undefined) ??
        [];
      const nextRow = baseRow.map((item, i) =>
        i === stepIdx ? { ...item, velocity: nextVel } : item
      );
      return {
        ...prev,
        tracks: {
          ...prev.tracks,
          [storageKey]: nextRow,
        },
      };
    });
    auditionDrum(drumId, nextVel);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#080B11] text-slate-100 rounded-xl border border-[#242E40] overflow-hidden">
      {/* HEADER TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 sm:px-3.5 py-2 bg-[#111622] border-b border-[#242E40] shrink-0">
        {/* Left: Back, Track Badge, Pattern Switcher & CRUD */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={onBack}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-[#182234] hover:bg-[#22304A] border border-amber-400/50 text-amber-200 font-display font-bold text-xs tracking-wide cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>TIMELINE</span>
          </button>

          <div className="flex items-center gap-1.5 px-2.5 h-9 rounded-lg bg-amber-500/15 border border-amber-400/40">
            <span className="font-display font-bold text-xs text-amber-300 uppercase whitespace-nowrap">
              {track.name}
            </span>
          </div>

          <select
            aria-label="Drum Pattern"
            value={pattern.id}
            onChange={(e) => onSelectPattern(e.target.value)}
            className="h-9 px-2.5 rounded-lg bg-[#090C12] border border-[#2C3A52] text-xs font-semibold text-amber-200 focus:outline-none focus:border-amber-400 cursor-pointer"
          >
            {patternOptions.map((opt) => (
              <option key={opt.id} value={opt.id} className="bg-[#111622]">
                {opt.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-[#090C12] p-0.5 rounded-lg border border-[#242E40]">
            <button
              type="button"
              onClick={onCreatePattern}
              title="New Pattern"
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1 px-2 h-8 rounded text-[11px] font-semibold text-emerald-300 hover:bg-[#172133] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New</span>
            </button>
            <button
              type="button"
              onClick={onDuplicatePattern}
              title="Duplicate Pattern"
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1 px-2 h-8 rounded text-[11px] font-semibold text-cyan-300 hover:bg-[#172133] cursor-pointer"
            >
              <CopyPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Dup</span>
            </button>
            <button
              type="button"
              onClick={onClearPattern}
              title="Clear Pattern Steps"
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1 px-2 h-8 rounded text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </div>

        {/* Center/Right: Step Length, Piano Roll, Loop Scope & Transport */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center bg-[#090C12] p-0.5 rounded-lg border border-[#242E40]">
            {([16, 32, 64] as const).map((len) => (
              <button
                key={len}
                type="button"
                onClick={() => {
                  onUpdatePattern((prev) => ({ ...prev, stepCount: len }));
                  if (safePage * 16 >= len) setActiveBarPage(0);
                }}
                className={`px-2 h-8 rounded text-[11px] font-mono-num font-bold cursor-pointer transition-colors ${
                  stepCount === len
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {len}s
              </button>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-0.5 bg-[#090C12] p-0.5 rounded-lg border border-[#242E40]">
              {Array.from({ length: totalPages }, (_, pg) => (
                <button
                  key={pg}
                  type="button"
                  onClick={() => setActiveBarPage(pg)}
                  className={`px-2 h-8 rounded text-[11px] font-mono-num font-bold cursor-pointer ${
                    safePage === pg
                      ? 'bg-cyan-500/25 border border-cyan-400/60 text-cyan-200'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  B{pg + 1}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onOpenPianoRoll}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-[#172033] hover:bg-[#1E2B45] border border-cyan-400/50 text-cyan-200 font-display font-bold text-xs cursor-pointer whitespace-nowrap"
          >
            <ListMusic className="w-4 h-4" />
            <span>PIANO ROLL</span>
          </button>

          {/* PAT / SONG Playback Scope */}
          <div className="flex items-center bg-[#090C12] p-0.5 rounded-lg border border-[#242E40]">
            {(['pattern', 'song'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={playMode === m}
                onClick={() => onChangePlayMode(m)}
                className={`px-2 h-8 rounded text-[11px] font-display font-bold uppercase cursor-pointer transition-colors ${
                  playMode === m
                    ? m === 'song'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'pattern' ? 'PAT' : 'SONG'}
              </button>
            ))}
          </div>

          {/* Transport */}
          <button
            type="button"
            onClick={onTogglePlay}
            style={{ touchAction: 'manipulation' }}
            className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg font-display font-bold text-xs cursor-pointer transition-colors ${
              isPlaying
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-[#172033] border border-emerald-400/50 text-emerald-200'
            }`}
          >
            {isPlaying ? (
              <Square className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isPlaying ? 'STOP' : 'PLAY'}</span>
          </button>

          <button
            type="button"
            onClick={onStop}
            aria-label="Stop and Reset"
            className="w-9 h-9 rounded-lg bg-[#090C12] border border-[#242E40] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggleLoop}
            aria-pressed={loop}
            className={`w-9 h-9 rounded-lg border flex items-center justify-center cursor-pointer ${
              loop
                ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300'
                : 'bg-[#090C12] border-[#242E40] text-slate-400'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center bg-[#090C12] rounded-lg border border-[#242E40] h-9">
            <button
              type="button"
              onClick={() => onChangeBpm(bpm - 1)}
              className="w-7 h-full text-slate-300 hover:text-white cursor-pointer font-bold"
            >
              −
            </button>
            <span className="px-2 font-mono-num text-xs font-bold text-amber-200 whitespace-nowrap">
              {bpm}
            </span>
            <button
              type="button"
              onClick={() => onChangeBpm(bpm + 1)}
              className="w-7 h-full text-slate-300 hover:text-white cursor-pointer font-bold"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* LARGE TOUCH STEP MATRIX */}
      <div className="flex-1 min-h-0 overflow-y-auto synth-scroll p-2.5 sm:p-4 flex flex-col gap-2">
        {/* Step Beat Header */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-24 sm:w-32 shrink-0 text-[11px] font-display font-bold text-slate-400 uppercase tracking-wider pl-1">
            DRUM VOICE
          </div>
          <div className="flex-1 grid grid-cols-16 gap-1">
            {Array.from({ length: 16 }, (_, i) => {
              const absStep = pageOffset + i;
              const isHead = currentStepInt === absStep;
              const isBeat = i % 4 === 0;
              return (
                <div
                  key={absStep}
                  className={`h-5 rounded flex items-center justify-center font-mono-num text-[10px] font-bold ${
                    isHead
                      ? 'bg-emerald-500 text-slate-950'
                      : isBeat
                      ? 'bg-[#171E2E] text-amber-300'
                      : 'text-slate-500'
                  }`}
                >
                  {absStep + 1}
                </div>
              );
            })}
          </div>
        </div>

        {/* Drum Rows */}
        {drumRows.map((row) => {
          const steps = getRowSteps(row.storageKey, row.drumId);
          return (
            <div
              key={row.storageKey}
              className="flex items-center gap-2 bg-[#0E131D] border border-[#1E273A] rounded-xl p-1.5 sm:p-2"
            >
              {/* Voice Pad / Audition */}
              <button
                type="button"
                onClick={() => auditionDrum(row.drumId, 0.95)}
                style={{ touchAction: 'manipulation' }}
                className="w-24 sm:w-32 min-h-[48px] px-2.5 rounded-lg bg-[#161D2C] hover:bg-[#1E283D] active:bg-amber-500/30 border border-amber-500/35 flex flex-col justify-center items-start shrink-0 cursor-pointer transition-colors"
              >
                <span className="font-display font-bold text-xs sm:text-sm text-amber-200 truncate w-full text-left">
                  {row.label}
                </span>
                <span className="font-mono-num text-[10px] text-slate-400">
                  TAP HIT
                </span>
              </button>

              {/* 16 Touch Pads */}
              <div className="flex-1 grid grid-cols-16 gap-1">
                {Array.from({ length: 16 }, (_, i) => {
                  const absStep = pageOffset + i;
                  const cell = steps[absStep];
                  const active = Boolean(cell?.active);
                  const isHead = currentStepInt === absStep;
                  const isBeatGroupAlt = Math.floor(i / 4) % 2 === 1;
                  const velPct = Math.round((cell?.velocity ?? 0.88) * 100);

                  return (
                    <button
                      key={absStep}
                      type="button"
                      onClick={() => toggleStep(row.storageKey, row.drumId, absStep)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        handleToggleVelocityAccent(row.storageKey, row.drumId, absStep);
                      }}
                      style={{ touchAction: 'manipulation' }}
                      aria-label={`${row.label} Step ${absStep + 1}`}
                      aria-pressed={active}
                      className={`relative min-h-[48px] sm:min-h-[54px] rounded-lg border flex flex-col items-center justify-end pb-1 cursor-pointer transition-colors ${
                        active
                          ? 'bg-gradient-to-b from-amber-400 to-amber-500 border-amber-200 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                          : isBeatGroupAlt
                          ? 'bg-[#131926] border-[#253047] hover:border-amber-400/50'
                          : 'bg-[#0C1019] border-[#1E273A] hover:border-amber-400/50'
                      } ${isHead ? 'ring-2 ring-emerald-400 z-10' : ''}`}
                    >
                      {active && (
                        <div
                          style={{ height: `${Math.max(25, velPct * 0.55)}%` }}
                          className="w-1.5 rounded-full bg-slate-950/35 pointer-events-none"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Single-track helpful quick tip */}
        {!isKitTrack && (
          <div className="mt-1 px-3 py-2.5 rounded-xl bg-[#0D121C] border border-[#1D273B] flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
            <span>
              Tap pads to program <strong className="text-amber-300">{track.name}</strong> hits in{' '}
              <strong className="text-white">{pattern.name}</strong>.
            </span>
            <span className="text-slate-400">
              Need rolls, pitch slides, or multiple drum hits? Tap{' '}
              <strong className="text-cyan-300">PIANO ROLL</strong> above.
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
