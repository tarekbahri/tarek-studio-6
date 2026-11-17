import React, { useEffect, useRef, useState } from 'react';
import {
  ClipboardPaste,
  Copy,
  CopyPlus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { beatboxEngine } from '../../audio/BeatboxEngine';
import {
  DAW_TRACK_ORDER,
  cloneDawPattern,
  createEmptyDawPattern,
  createGrooveTemplatePattern,
} from '../../audio/dawPresets';
import { studioAudio } from '../../audio/StudioAudio';
import { subbassEngine } from '../../audio/SubbassEngine';
import { synthEngine } from '../../audio/SynthEngine';
import { sixSixSixEngine } from '../../audio/ts666/SixSixSixEngine';
import type { DrumTrackId } from '../../types/beatbox';
import type {
  DawPattern,
  DawStep,
  DawStepLength,
  DawTrackConfig,
  DawTrackId,
} from '../../types/daw';

interface DawStepSequencerProps {
  pattern: DawPattern;
  trackOrder: DawTrackId[];
  tracks: Record<DawTrackId, DawTrackConfig>;
  isPlaying: boolean;
  playMode: 'pattern' | 'song';
  dawStep: number;
  clipboardPattern: DawPattern | null;
  onUpdatePattern: (updater: (prev: DawPattern) => DawPattern) => void;
  onUpdateTrack: (trackId: DawTrackId, patch: Partial<DawTrackConfig>) => void;
  onCopyPattern: () => void;
  onPastePattern: () => void;
  onDuplicateToNextSlot: () => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function formatMidi(midi: number): string {
  const semi = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[semi]}${oct}`;
}

export const DawStepSequencer: React.FC<DawStepSequencerProps> = ({
  pattern,
  trackOrder,
  tracks,
  isPlaying,
  playMode,
  dawStep,
  clipboardPattern,
  onUpdatePattern,
  onUpdateTrack,
  onCopyPattern,
  onPastePattern,
  onDuplicateToNextSlot,
}) => {
  const order = trackOrder.length > 0 ? trackOrder : DAW_TRACK_ORDER;
  const [selectedCell, setSelectedCell] = useState<{
    trackId: DawTrackId;
    stepIdx: number;
  }>({ trackId: order[0] ?? 'kick', stepIdx: 0 });
  const [pageOffset, setPageOffset] = useState<number>(0);
  const gridScrollRef = useRef<HTMLDivElement | null>(null);

  const safeTrackId = tracks[selectedCell.trackId] ? selectedCell.trackId : order[0];

  useEffect(() => {
    if (selectedCell.stepIdx >= pattern.stepCount) {
      setSelectedCell((prev) => ({
        ...prev,
        stepIdx: Math.min(prev.stepIdx, pattern.stepCount - 1),
      }));
    }
    if (pageOffset >= pattern.stepCount) {
      setPageOffset(0);
    }
  }, [pattern.stepCount, pageOffset, selectedCell.stepIdx]);

  const currentStepInt =
    isPlaying && playMode === 'pattern'
      ? Math.floor(dawStep) % pattern.stepCount
      : -1;

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
    } else {
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
    }
  };

  const handleToggleStep = (trackId: DawTrackId, stepIdx: number) => {
    const row = pattern.tracks[trackId] ?? [];
    const curr = row[stepIdx];
    const nextActive = !curr?.active;
    setSelectedCell({ trackId, stepIdx });
    onUpdatePattern((prev) => {
      const nextTrackSteps = [...(prev.tracks[trackId] ?? [])];
      if (!nextTrackSteps[stepIdx]) return prev;
      nextTrackSteps[stepIdx] = { ...nextTrackSteps[stepIdx], active: nextActive };
      return {
        ...prev,
        tracks: { ...prev.tracks, [trackId]: nextTrackSteps },
      };
    });
    if (nextActive) {
      auditionTrackStep(trackId, curr);
    }
  };

  const updateSelectedStep = (patch: Partial<DawStep>) => {
    const stepIdx = selectedCell.stepIdx;
    onUpdatePattern((prev) => {
      const nextTrackSteps = [...(prev.tracks[safeTrackId] ?? [])];
      if (!nextTrackSteps[stepIdx]) return prev;
      nextTrackSteps[stepIdx] = { ...nextTrackSteps[stepIdx], ...patch };
      return {
        ...prev,
        tracks: { ...prev.tracks, [safeTrackId]: nextTrackSteps },
      };
    });
  };

  const handleJumpPage = (startStep: number) => {
    setPageOffset(startStep);
    const el = gridScrollRef.current;
    if (el) {
      const pageIdx = startStep / 16;
      const targetLeft = (el.scrollWidth / (pattern.stepCount / 16)) * pageIdx;
      el.scrollTo({ left: targetLeft, behavior: 'smooth' });
    }
  };

  const selectedTrack = tracks[safeTrackId];
  const selectedStep = pattern.tracks[safeTrackId]?.[selectedCell.stepIdx];
  const isMelodic =
    selectedTrack?.target === 'serum' ||
    selectedTrack?.target === 'subbass' ||
    selectedTrack?.target === 'ts666';

  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5">
      {/* Top Action Strip: Step Mode (16/32/64), Swing, Copy/Paste/Duplicate/Clear/Groove */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#111622] border border-[#242E40] shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-0.5 bg-[#090C12] p-0.5 rounded-md border border-[#242E40]">
            {([16, 32, 64] as DawStepLength[]).map((len) => (
              <button
                key={len}
                type="button"
                onClick={() =>
                  onUpdatePattern((prev) => ({ ...prev, stepCount: len }))
                }
                className={`px-2.5 h-7 rounded font-mono-num text-[11px] font-semibold transition-colors cursor-pointer ${
                  pattern.stepCount === len
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {len} Steps
              </button>
            ))}
          </div>

          {pattern.stepCount > 16 && (
            <div className="flex items-center gap-0.5 bg-[#090C12] p-0.5 rounded-md border border-[#242E40]">
              {Array.from({ length: pattern.stepCount / 16 }, (_, p) => {
                const start = p * 16;
                return (
                  <button
                    key={start}
                    type="button"
                    onClick={() => handleJumpPage(start)}
                    className={`px-2 h-7 rounded font-mono-num text-[10px] font-semibold cursor-pointer ${
                      pageOffset === start
                        ? 'bg-[#1D283B] text-cyan-300 border border-cyan-400/50'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {start + 1}-{start + 16}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-1.5 px-2 h-7 rounded-md bg-[#090C12] border border-[#242E40]">
            <span className="text-[10px] font-medium text-slate-400">Swing</span>
            <input
              aria-label="Pattern Swing"
              type="range"
              min={0}
              max={0.65}
              step={0.01}
              value={pattern.swing}
              onChange={(e) =>
                onUpdatePattern((prev) => ({
                  ...prev,
                  swing: parseFloat(e.target.value),
                }))
              }
              className="w-16 h-1.5 accent-amber-400 cursor-pointer"
            />
            <span className="font-mono-num text-[10px] text-amber-300 w-7 text-right">
              {Math.round(pattern.swing * 100)}%
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              studioAudio.unlockSync();
              onUpdatePattern((prev) =>
                cloneDawPattern(createGrooveTemplatePattern(prev.id), prev.id, prev.name)
              );
            }}
            title="Load Dubstep/Riddim Groove Template into Active Pattern"
            className="inline-flex items-center gap-1 px-2.5 h-7 rounded-md bg-amber-500/15 border border-amber-400/50 text-amber-200 hover:bg-amber-500/25 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Load Groove</span>
          </button>

          <button
            type="button"
            onClick={onCopyPattern}
            title="Copy Pattern"
            className="inline-flex items-center gap-1 px-2 h-7 rounded-md bg-[#0B0E14] border border-[#263042] text-[11px] text-slate-200 hover:text-cyan-300 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Copy</span>
          </button>

          <button
            type="button"
            onClick={onPastePattern}
            disabled={!clipboardPattern}
            title="Paste Copied Pattern"
            className={`inline-flex items-center gap-1 px-2 h-7 rounded-md border text-[11px] ${
              clipboardPattern
                ? 'bg-[#0B0E14] border-[#263042] text-slate-200 hover:text-cyan-300 cursor-pointer'
                : 'bg-[#0B0E14] border-[#1B2230] text-slate-600 cursor-not-allowed'
            }`}
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Paste</span>
          </button>

          <button
            type="button"
            onClick={onDuplicateToNextSlot}
            title="Duplicate Pattern to Next Slot"
            className="inline-flex items-center gap-1 px-2 h-7 rounded-md bg-[#0B0E14] border border-[#263042] text-[11px] text-slate-200 hover:text-cyan-300 cursor-pointer"
          >
            <CopyPlus className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Duplicate</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdatePattern((prev) =>
                createEmptyDawPattern(prev.id, prev.name, prev.stepCount, tracks, order)
              )
            }
            title="Clear Active Pattern"
            className="inline-flex items-center gap-1 px-2 h-7 rounded-md bg-[#0B0E14] border border-[#263042] text-[11px] text-slate-300 hover:text-rose-400 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Clear</span>
          </button>
        </div>
      </div>

      {/* Main 6-Track Step Matrix */}
      <div className="flex-1 min-h-0 flex rounded-lg border border-[#242E40] bg-[#111622] overflow-hidden">
        {/* Left Track Controls Column */}
        <div className="w-36 sm:w-44 shrink-0 border-r border-[#242E40] bg-[#0D1119] flex flex-col justify-between py-1 overflow-y-auto synth-scroll">
          {order.map((tid) => {
            const cfg = tracks[tid];
            if (!cfg) return null;
            const isCyan = cfg.accent === 'cyan';
            const rowIsMelodic =
              cfg.target === 'serum' || cfg.target === 'subbass' || cfg.target === 'ts666';
            return (
              <div
                key={tid}
                className="flex items-center justify-between gap-1 px-2 flex-1 min-h-[34px] border-b last:border-b-0 border-[#1A2232]"
              >
                <div className="flex items-center gap-1.5 min-w-0 text-left">
                  <span
                    className={`w-1.5 h-5 rounded-full shrink-0 ${
                      cfg.target === 'ts666'
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
                        setSelectedCell((prev) => ({ ...prev, trackId: tid }));
                        auditionTrackStep(tid, pattern.tracks[tid]?.[selectedCell.stepIdx]);
                      }}
                      className="block text-left text-[11px] font-semibold text-slate-100 hover:text-cyan-200 truncate cursor-pointer"
                    >
                      {cfg.name}
                    </button>
                    <div className="flex items-center gap-1">
                      {rowIsMelodic ? (
                        <button
                          type="button"
                          title="Switch Track Output between SERUM, SUBBASS, and 666TS"
                          onClick={() =>
                            onUpdateTrack(tid, {
                              target:
                                cfg.target === 'serum'
                                  ? 'subbass'
                                  : cfg.target === 'subbass'
                                  ? 'ts666'
                                  : 'serum',
                            })
                          }
                          className={`text-[9px] font-mono-num uppercase px-1 rounded cursor-pointer border ${
                            cfg.target === 'subbass'
                              ? 'text-blue-200 bg-blue-500/20 border-blue-400/50'
                              : cfg.target === 'ts666'
                              ? 'text-rose-200 bg-rose-500/20 border-rose-400/50'
                              : 'text-cyan-300 bg-cyan-500/10 border-cyan-400/30'
                          }`}
                        >
                          {cfg.target === 'ts666' ? '666TS' : cfg.target}
                        </button>
                      ) : (
                        <div className="text-[9px] font-mono-num text-slate-500 uppercase">
                          {cfg.target}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    aria-label={`Mute ${cfg.name}`}
                    onClick={() => onUpdateTrack(tid, { muted: !cfg.muted })}
                    className={`w-6 h-6 rounded text-[10px] font-bold cursor-pointer ${
                      cfg.muted
                        ? 'bg-rose-500/25 text-rose-300 border border-rose-400/50'
                        : 'bg-[#141B29] text-slate-400 hover:text-white'
                    }`}
                  >
                    M
                  </button>
                  <button
                    type="button"
                    aria-label={`Solo ${cfg.name}`}
                    onClick={() => onUpdateTrack(tid, { solo: !cfg.solo })}
                    className={`w-6 h-6 rounded text-[10px] font-bold cursor-pointer ${
                      cfg.solo
                        ? 'bg-amber-500/25 text-amber-300 border border-amber-400/50'
                        : 'bg-[#141B29] text-slate-400 hover:text-white'
                    }`}
                  >
                    S
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Scrollable Step Grid (16 / 32 / 64 steps) */}
        <div
          ref={gridScrollRef}
          className="flex-1 min-w-0 overflow-x-auto overflow-y-auto synth-scroll"
        >
          <div
            className="h-full flex flex-col justify-between py-1 px-1.5"
            style={{
              minWidth:
                pattern.stepCount === 16
                  ? '100%'
                  : `${(pattern.stepCount / 16) * 100}%`,
            }}
          >
            {order.map((tid) => {
              const cfg = tracks[tid];
              if (!cfg) return null;
              const steps = pattern.tracks[tid] ?? [];
              const isCyan = cfg.accent === 'cyan';
              const rowIsMelodic =
                cfg.target === 'serum' || cfg.target === 'subbass' || cfg.target === 'ts666';

              return (
                <div
                  key={tid}
                  className="grid gap-1 flex-1 min-h-[34px] items-center border-b last:border-b-0 border-[#1A2232]/80 py-0.5"
                  style={{
                    gridTemplateColumns: `repeat(${pattern.stepCount}, minmax(26px, 1fr))`,
                  }}
                >
                  {steps.slice(0, pattern.stepCount).map((cell, stepIdx) => {
                    const isBeatStart = stepIdx % 4 === 0;
                    const isHead = currentStepInt === stepIdx;
                    const isSelected =
                      safeTrackId === tid && selectedCell.stepIdx === stepIdx;
                    const groupShade = Math.floor(stepIdx / 4) % 2 === 1;

                    return (
                      <button
                        key={stepIdx}
                        type="button"
                        aria-label={`${cfg.name} Step ${stepIdx + 1}`}
                        aria-pressed={cell.active}
                        onClick={() => handleToggleStep(tid, stepIdx)}
                        style={{ touchAction: 'manipulation' }}
                        className={`relative h-full min-h-[28px] rounded border overflow-hidden transition-colors cursor-pointer ${
                          isHead
                            ? 'ring-1 ring-white border-white/80'
                            : isSelected
                            ? 'border-cyan-300'
                            : isBeatStart
                            ? 'border-[#32415B]'
                            : 'border-[#20293B]'
                        } ${
                          cell.active
                            ? isCyan
                              ? 'bg-cyan-500/20'
                              : 'bg-amber-500/20'
                            : groupShade
                            ? 'bg-[#0F141F]'
                            : 'bg-[#0A0E16]'
                        }`}
                      >
                        {cell.active && (
                          <div
                            className={`absolute inset-x-0 bottom-0 transition-all ${
                              isCyan ? 'bg-cyan-400/80' : 'bg-amber-400/80'
                            }`}
                            style={{
                              height: `${Math.round(cell.velocity * 100)}%`,
                              opacity: 0.45 + cell.probability * 0.55,
                            }}
                          />
                        )}
                        <span className="relative z-10 font-mono-num text-[9px] text-slate-300/80">
                          {rowIsMelodic && cell.active ? formatMidi(cell.note) : stepIdx + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Step Parameter Inspector (Velocity, Probability, Length, Note Pitch) */}
      {selectedTrack && selectedStep && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#111622] border border-[#242E40] text-xs shrink-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-display font-semibold text-slate-100">
              {selectedTrack.name} · Step {selectedCell.stepIdx + 1}
            </span>
            <span className="text-[11px] text-slate-400">
              {selectedStep.active ? 'Active' : 'Muted Step'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 flex-1 justify-end">
            <label className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Velocity</span>
              <input
                aria-label="Step Velocity"
                type="range"
                min={0.1}
                max={1}
                step={0.01}
                value={selectedStep.velocity}
                onChange={(e) =>
                  updateSelectedStep({ velocity: parseFloat(e.target.value) })
                }
                className="w-16 sm:w-20 accent-cyan-400 cursor-pointer"
              />
              <span className="font-mono-num text-[11px] text-cyan-300 w-8 text-right">
                {Math.round(selectedStep.velocity * 100)}%
              </span>
            </label>

            <label className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Prob</span>
              <input
                aria-label="Step Probability"
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={selectedStep.probability}
                onChange={(e) =>
                  updateSelectedStep({ probability: parseFloat(e.target.value) })
                }
                className="w-14 sm:w-16 accent-emerald-400 cursor-pointer"
              />
              <span className="font-mono-num text-[11px] text-emerald-300 w-8 text-right">
                {Math.round(selectedStep.probability * 100)}%
              </span>
            </label>

            <label className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Length</span>
              <input
                aria-label="Step Length"
                type="range"
                min={0.25}
                max={4}
                step={0.25}
                value={selectedStep.length}
                onChange={(e) =>
                  updateSelectedStep({ length: parseFloat(e.target.value) })
                }
                className="w-14 sm:w-16 accent-amber-400 cursor-pointer"
              />
              <span className="font-mono-num text-[11px] text-amber-300 w-8 text-right">
                {selectedStep.length.toFixed(2).replace(/\.00$/, '')}
              </span>
            </label>

            {isMelodic && (
              <div className="flex items-center gap-1 bg-[#090C12] border border-[#242E40] rounded-md px-1.5 h-7">
                <span className="text-[10px] text-slate-400">Note</span>
                <button
                  type="button"
                  aria-label="Note Pitch Down"
                  onClick={() =>
                    updateSelectedStep({ note: Math.max(24, selectedStep.note - 1) })
                  }
                  className="w-5 h-5 rounded text-slate-300 hover:bg-[#1B2436] cursor-pointer"
                >
                  -
                </button>
                <span className="font-mono-num text-[11px] text-cyan-300 w-7 text-center">
                  {formatMidi(selectedStep.note)}
                </span>
                <button
                  type="button"
                  aria-label="Note Pitch Up"
                  onClick={() =>
                    updateSelectedStep({ note: Math.min(84, selectedStep.note + 1) })
                  }
                  className="w-5 h-5 rounded text-slate-300 hover:bg-[#1B2436] cursor-pointer"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
