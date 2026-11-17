import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ListMusic, Play, Sparkles, Square, Trash2, Zap } from 'lucide-react';
import { beatboxEngine } from '../audio/BeatboxEngine';
import {
  DRUM_KITS,
  DRUM_TRACK_ORDER,
  createDefaultBeatboxPianoRollState,
  createEmptySteps,
  makeKitTracks,
} from '../audio/beatboxPresets';
import { sequencerEngine } from '../audio/SequencerEngine';
import { BANKS, getPatternId } from '../audio/sequencerStorage';
import { useIsPlaying, usePlayheadStep } from '../audio/transportStore';
import type {
  BeatboxPianoRollState,
  BeatboxState,
  BeatboxStep,
  DrumKitId,
  DrumTrackConfig,
  DrumTrackId,
  StudioRoutingConfig,
} from '../types/beatbox';
import type { MidiNote, PatternBank } from '../types/sequencer';
import type { ModularFxInstance } from '../types/fx';
import { FxDeviceRack } from './fx/FxDeviceRack';
import { PluginChannelStrip } from './PluginChannelStrip';
import { RotaryKnob } from './RotaryKnob';
import { ToggleSwitch } from './ToggleSwitch';
import { UnifiedPianoRoll, type RollNote } from './UnifiedPianoRoll';

interface BeatboxPluginProps {
  beatbox: BeatboxState;
  routing: StudioRoutingConfig;
  bpm: number;
  loop: boolean;
  isPlaying?: boolean;
  isRecording: boolean;
  playheadStep?: number;
  isFullscreen: boolean;
  onChangeBeatbox: (
    patch: Partial<BeatboxState> | ((prev: BeatboxState) => BeatboxState)
  ) => void;
  onChangeRouting: (patch: Partial<StudioRoutingConfig>) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onToggleRecord: () => void;
  onChangeBpm: (bpm: number) => void;
  onToggleFullscreen: () => void;
  onBack?: () => void;
  initialPianoRoll?: boolean;
  deviceFx?: ModularFxInstance[];
  onChangeDeviceFx?: (next: ModularFxInstance[]) => void;
  onOpenEffectsBrowser?: () => void;
}

const BeatboxQuickTransport: React.FC<{
  bpm: number;
  isPlayingProp?: boolean;
  onTogglePlay: () => void;
}> = React.memo(({ bpm, isPlayingProp, onTogglePlay }) => {
  const storeIsPlaying = useIsPlaying();
  const isPlaying = isPlayingProp ?? storeIsPlaying;
  return (
    <div className="flex items-center gap-1 bg-[#0A0E15] p-0.5 rounded border border-[#242E40]">
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={isPlaying ? 'Stop Playback' : 'Play Playback'}
        style={{ touchAction: 'manipulation' }}
        className={`w-7 h-7 rounded flex items-center justify-center cursor-pointer transition-colors ${
          isPlaying
            ? 'bg-emerald-500 text-slate-950'
            : 'bg-[#141C2B] text-emerald-300 hover:bg-emerald-500/20'
        }`}
      >
        {isPlaying ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
      </button>
      <span className="px-1 font-mono-num text-[11px] text-amber-300 font-semibold whitespace-nowrap">
        {bpm}
      </span>
    </div>
  );
});

const SLOTS_16 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

const BeatboxPadRecLabel: React.FC<{ isRecording: boolean; isPlayingProp?: boolean }> = React.memo(
  ({ isRecording, isPlayingProp }) => {
    const storeIsPlaying = useIsPlaying();
    const isPlaying = isPlayingProp ?? storeIsPlaying;
    return (
      <span className="text-[11px] font-display font-semibold text-slate-200">
        Drum Pads {isRecording && isPlaying ? '· REC LIVE' : ''}
      </span>
    );
  }
);

const BeatboxStepGrid: React.FC<{
  beatboxTracks: Record<DrumTrackId, DrumTrackConfig>;
  stepsMap: Record<DrumTrackId, BeatboxStep[]>;
  selectedTrack: DrumTrackId;
  isPlayingProp?: boolean;
  playheadStepProp?: number;
  onSelectTrack: (tid: DrumTrackId) => void;
  onSetStepActive: (tid: DrumTrackId, stepIdx: number, active: boolean) => void;
}> = React.memo(
  ({
    beatboxTracks,
    stepsMap,
    selectedTrack,
    isPlayingProp,
    playheadStepProp,
    onSelectTrack,
    onSetStepActive,
  }) => {
    const storeIsPlaying = useIsPlaying();
    const storePlayheadStep = usePlayheadStep();
    const isPlaying = isPlayingProp ?? storeIsPlaying;
    const playheadStep = playheadStepProp ?? storePlayheadStep;
    const currentStepInt = isPlaying ? Math.floor(playheadStep) % 16 : -1;

    const paintModeRef = useRef<boolean | null>(null);
    const paintPointerIdRef = useRef<number | null>(null);
    const lastPaintedCellRef = useRef<string | null>(null);
    const stepsGridRef = useRef<HTMLDivElement | null>(null);

    return (
      <section
        ref={stepsGridRef}
        className="sm:col-span-7 rounded-xl border border-[#263042] bg-[#131822] p-2.5 flex flex-col justify-between min-h-[250px]"
        onPointerMove={(e) => {
          if (paintModeRef.current === null || paintPointerIdRef.current !== e.pointerId) return;
          const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
          const cellEl = el?.closest('[data-bb-track][data-bb-step]') as HTMLElement | null;
          if (!cellEl) return;
          const tid = cellEl.dataset.bbTrack as DrumTrackId | undefined;
          const stepIdx = Number(cellEl.dataset.bbStep);
          if (!tid || !Number.isFinite(stepIdx)) return;
          const key = `${tid}:${stepIdx}`;
          if (lastPaintedCellRef.current !== key) {
            lastPaintedCellRef.current = key;
            onSetStepActive(tid, stepIdx, paintModeRef.current);
          }
        }}
        onPointerUp={(e) => {
          paintModeRef.current = null;
          paintPointerIdRef.current = null;
          lastPaintedCellRef.current = null;
          try {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          } catch {
            // ignore
          }
        }}
        onPointerCancel={(e) => {
          paintModeRef.current = null;
          paintPointerIdRef.current = null;
          lastPaintedCellRef.current = null;
          try {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          } catch {
            // ignore
          }
        }}
      >
        {/* Beat Number Header */}
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-12 shrink-0 text-[10px] font-mono-num text-slate-400">
            STEP
          </div>
          <div className="grid grid-cols-16 gap-1 flex-1">
            {Array.from({ length: 16 }, (_, s) => {
              const isHead = currentStepInt === s;
              return (
                <div
                  key={s}
                  className={`text-center font-mono-num text-[9px] rounded py-0.5 ${
                    isHead
                      ? 'bg-emerald-400 text-slate-950 font-bold'
                      : s % 4 === 0
                      ? 'text-cyan-300 font-semibold'
                      : 'text-slate-500'
                  }`}
                >
                  {s + 1}
                </div>
              );
            })}
          </div>
        </div>

        {/* 8 Drum Track Step Rows */}
        <div className="flex-1 flex flex-col justify-between gap-1">
          {DRUM_TRACK_ORDER.map((tid) => {
            const tr = beatboxTracks[tid];
            const rowSteps = stepsMap[tid] ?? createEmptySteps()[tid];
            const isSelected = selectedTrack === tid;
            const isAmber = tr.accentColor === 'amber';

            return (
              <div key={tid} className="flex items-center gap-1.5 flex-1 min-h-[26px]">
                <button
                  type="button"
                  onClick={() => {
                    onSelectTrack(tid);
                    void beatboxEngine.triggerTrack(tid, 0.9);
                  }}
                  className={`w-12 h-full min-h-[26px] rounded px-1 text-left font-display text-[10px] font-bold truncate border transition-colors cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-[#1D283B] border-cyan-400 text-cyan-200'
                      : 'bg-[#0B0E14] border-[#242E40] text-slate-300 hover:text-white'
                  } ${tr.muted ? 'opacity-45 line-through' : ''}`}
                >
                  {tr.shortName}
                </button>

                <div className="grid grid-cols-16 gap-1 flex-1 h-full">
                  {rowSteps.map((cell, stepIdx) => {
                    const isHead = currentStepInt === stepIdx;
                    const isBeatStart = Math.floor(stepIdx / 4) % 2 === 0;

                    return (
                      <button
                        key={stepIdx}
                        type="button"
                        data-bb-track={tid}
                        data-bb-step={stepIdx}
                        aria-label={`${tr.name} Step ${stepIdx + 1}`}
                        style={{ touchAction: 'none' }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          onSelectTrack(tid);
                          const nextActive = !cell.active;
                          paintModeRef.current = nextActive;
                          paintPointerIdRef.current = e.pointerId;
                          lastPaintedCellRef.current = `${tid}:${stepIdx}`;
                          try {
                            stepsGridRef.current?.setPointerCapture(e.pointerId);
                          } catch {
                            // ignore
                          }
                          onSetStepActive(tid, stepIdx, nextActive);
                        }}
                        className={`h-full min-h-[24px] rounded-sm border transition-colors cursor-pointer ${
                          cell.active
                            ? isAmber
                              ? cell.accent
                                ? 'bg-amber-400 border-amber-200'
                                : 'bg-amber-500/80 border-amber-300/80'
                              : cell.accent
                              ? 'bg-cyan-400 border-cyan-200'
                              : 'bg-cyan-500/80 border-cyan-300/80'
                            : isBeatStart
                            ? 'bg-[#161E2C] border-[#263247] hover:border-slate-500'
                            : 'bg-[#0E131D] border-[#1F293B] hover:border-slate-500'
                        } ${isHead ? 'ring-1 ring-white brightness-125' : ''}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }
);

const BeatboxPianoRollView: React.FC<{
  notes: RollNote[];
  bpm: number;
  loop: boolean;
  isPlayingProp?: boolean;
  isRecording: boolean;
  playheadStepProp?: number;
  isFullscreen: boolean;
  patternOptions: { id: string; label: string; noteCount: number }[];
  activePatternId: string;
  beatboxTracks: BeatboxState['tracks'];
  onBack: () => void;
  onToggleFullscreen: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onToggleRecord: () => void;
  onChangeBpm: (bpm: number) => void;
  onUpdateNotes: (updater: RollNote[] | ((prev: RollNote[]) => RollNote[])) => void;
  onSelectPattern: (id: string) => void;
  onCreatePattern: () => void;
  onDuplicatePattern: () => void;
  onDeletePattern: () => void;
  onImportBeatboxSteps: () => void;
}> = React.memo((props) => {
  const storeIsPlaying = useIsPlaying();
  const storePlayheadStep = usePlayheadStep();
  return (
    <UnifiedPianoRoll
      mode="beatbox"
      notes={props.notes}
      totalSteps={16}
      bpm={props.bpm}
      loop={props.loop}
      isPlaying={props.isPlayingProp ?? storeIsPlaying}
      isRecording={props.isRecording}
      playheadStep={props.playheadStepProp ?? storePlayheadStep}
      isFullscreen={props.isFullscreen}
      onBack={props.onBack}
      onToggleFullscreen={props.onToggleFullscreen}
      onTogglePlay={props.onTogglePlay}
      onStop={props.onStop}
      onToggleLoop={props.onToggleLoop}
      onToggleRecord={props.onToggleRecord}
      onChangeBpm={props.onChangeBpm}
      onUpdateNotes={props.onUpdateNotes}
      patternOptions={props.patternOptions}
      activePatternId={props.activePatternId}
      onSelectPattern={props.onSelectPattern}
      onCreatePattern={props.onCreatePattern}
      onDuplicatePattern={props.onDuplicatePattern}
      onDeletePattern={props.onDeletePattern}
      beatboxTracks={props.beatboxTracks}
      onImportBeatboxSteps={props.onImportBeatboxSteps}
    />
  );
});

export const BeatboxPlugin: React.FC<BeatboxPluginProps> = React.memo(({
  beatbox,
  routing,
  bpm,
  loop,
  isPlaying: isPlayingProp,
  isRecording,
  playheadStep: playheadStepProp,
  isFullscreen,
  onChangeBeatbox,
  onChangeRouting,
  onTogglePlay,
  onStop,
  onToggleLoop,
  onToggleRecord,
  onChangeBpm,
  onToggleFullscreen,
  onBack,
  initialPianoRoll = false,
  deviceFx = [],
  onChangeDeviceFx,
  onOpenEffectsBrowser,
}) => {
  const [showPianoRoll, setShowPianoRoll] = useState<boolean>(initialPianoRoll);
  const [showDeviceRack, setShowDeviceRack] = useState<boolean>(false);
  const [selectedTrack, setSelectedTrack] = useState<DrumTrackId>('kick');
  const [accentBrush, setAccentBrush] = useState<boolean>(false);
  const [litPads, setLitPads] = useState<Partial<Record<DrumTrackId, number>>>({});
  const litTimersRef = useRef<Partial<Record<DrumTrackId, number>>>({});

  useEffect(() => {
    if (initialPianoRoll) {
      setShowPianoRoll(true);
    }
  }, [initialPianoRoll]);

  const activePid = getPatternId(beatbox.activeBank, beatbox.activeSlot);
  const activePattern = beatbox.patterns[activePid] ?? {
    id: activePid,
    bank: beatbox.activeBank,
    slot: beatbox.activeSlot,
    steps: createEmptySteps(),
  };

  // Illuminate drum pads in real time whenever BeatboxEngine plays a voice
  useEffect(() => {
    beatboxEngine.setPadHitListener((trackId) => {
      setLitPads((prev) => ({ ...prev, [trackId]: Date.now() }));
      const existingTimer = litTimersRef.current[trackId];
      if (existingTimer !== undefined) {
        clearTimeout(existingTimer);
      }
      litTimersRef.current[trackId] = window.setTimeout(() => {
        delete litTimersRef.current[trackId];
        setLitPads((prev) => {
          const ts = prev[trackId];
          if (!ts || Date.now() - ts >= 110) {
            const next = { ...prev };
            delete next[trackId];
            return next;
          }
          return prev;
        });
      }, 125);
    });
    return () => {
      beatboxEngine.setPadHitListener(null);
      for (const tid of Object.keys(litTimersRef.current) as DrumTrackId[]) {
        const timerId = litTimersRef.current[tid];
        if (timerId !== undefined) clearTimeout(timerId);
      }
      litTimersRef.current = {};
    };
  }, []);

  const updateTrack = (trackId: DrumTrackId, patch: Partial<DrumTrackConfig>) => {
    onChangeBeatbox((prev) => ({
      ...prev,
      tracks: {
        ...prev.tracks,
        [trackId]: {
          ...prev.tracks[trackId],
          ...patch,
        },
      },
    }));
  };

  const setPatternSteps = (nextSteps: Record<DrumTrackId, BeatboxStep[]>) => {
    onChangeBeatbox((prev) => {
      const pid = getPatternId(prev.activeBank, prev.activeSlot);
      const currPat = prev.patterns[pid] ?? {
        id: pid,
        bank: prev.activeBank,
        slot: prev.activeSlot,
        steps: createEmptySteps(),
      };
      return {
        ...prev,
        patterns: {
          ...prev.patterns,
          [pid]: {
            ...currPat,
            steps: nextSteps,
          },
        },
      };
    });
  };

  const setStepActive = useCallback(
    (trackId: DrumTrackId, stepIdx: number, active: boolean) => {
      onChangeBeatbox((prev) => {
        const pid = getPatternId(prev.activeBank, prev.activeSlot);
        const currPat = prev.patterns[pid] ?? {
          id: pid,
          bank: prev.activeBank,
          slot: prev.activeSlot,
          steps: createEmptySteps(),
        };
        const row = currPat.steps[trackId] ?? createEmptySteps()[trackId];
        if (
          row[stepIdx]?.active === active &&
          row[stepIdx]?.accent === (active ? accentBrush : false)
        ) {
          return prev;
        }
        const nextRow = row.map((s, idx) =>
          idx === stepIdx
            ? {
                active,
                velocity: accentBrush ? 1.0 : 0.84,
                accent: active ? accentBrush : false,
              }
            : s
        );
        return {
          ...prev,
          patterns: {
            ...prev.patterns,
            [pid]: {
              ...currPat,
              steps: {
                ...currPat.steps,
                [trackId]: nextRow,
              },
            },
          },
        };
      });
    },
    [accentBrush, onChangeBeatbox]
  );

  const handlePadTap = (trackId: DrumTrackId) => {
    setSelectedTrack(trackId);
    void beatboxEngine.triggerTrack(trackId, accentBrush ? 1.0 : 0.92);

    // Real-time quantized drum recording when global transport Record is armed
    if (isRecording && sequencerEngine.getIsPlaying()) {
      const quantizedStep = Math.round(sequencerEngine.getCurrentStep()) % 16;
      setStepActive(trackId, quantizedStep, true);
    }
  };

  const handleKitChange = (kitId: DrumKitId) => {
    const freshTracks = makeKitTracks(kitId);
    onChangeBeatbox({ kitId, tracks: freshTracks });
  };

  const applyQuickGroove = (preset: 'halftime' | 'fourfloor' | 'riddim' | 'clear') => {
    const next = createEmptySteps();
    const fill = (t: DrumTrackId, idxs: number[], accents: number[] = []) => {
      const acc = new Set(accents);
      for (const i of idxs) {
        next[t][i] = { active: true, velocity: acc.has(i) ? 1 : 0.84, accent: acc.has(i) };
      }
    };

    if (preset === 'halftime') {
      fill('kick', [0, 6, 10], [0]);
      fill('snare', [8], [8]);
      fill('clap', [8], [8]);
      fill('ch', [0, 2, 4, 6, 8, 10, 12, 13, 14, 15], [0, 8]);
      fill('oh', [14]);
      fill('perc', [3, 11]);
    } else if (preset === 'fourfloor') {
      fill('kick', [0, 4, 8, 12], [0, 4, 8, 12]);
      fill('snare', [4, 12], [4, 12]);
      fill('ch', [2, 6, 10, 14]);
      fill('oh', [2, 10]);
      fill('clap', [4, 12]);
    } else if (preset === 'riddim') {
      fill('kick', [0, 4, 8, 12], [0, 8]);
      fill('clap', [8], [8]);
      fill('ch', [2, 6, 10, 14]);
      fill('perc', [0, 4, 8, 12, 15]);
      fill('rim', [3, 11]);
    }

    setPatternSteps(next);
  };

  const track = beatbox.tracks[selectedTrack];

  const pianoRollState: BeatboxPianoRollState = useMemo(
    () => beatbox.pianoRoll ?? createDefaultBeatboxPianoRollState(),
    [beatbox.pianoRoll]
  );

  const activeRollPattern =
    pianoRollState.patterns[pianoRollState.activePatternId] ??
    pianoRollState.patterns[pianoRollState.patternOrder[0]] ?? {
      id: 'B1',
      name: 'Drum Roll 1',
      notes: [],
    };

  const rollPatternOptions = useMemo(
    () =>
      pianoRollState.patternOrder
        .filter((pid) => Boolean(pianoRollState.patterns[pid]))
        .map((pid) => ({
          id: pid,
          label: pianoRollState.patterns[pid].name,
          noteCount: pianoRollState.patterns[pid].notes.length,
        })),
    [pianoRollState]
  );

  const updatePianoRollState = useCallback(
    (updater: (prev: BeatboxPianoRollState) => BeatboxPianoRollState) => {
      onChangeBeatbox((prev) => {
        const currPr = prev.pianoRoll ?? createDefaultBeatboxPianoRollState();
        return {
          ...prev,
          pianoRoll: updater(currPr),
        };
      });
    },
    [onChangeBeatbox]
  );

  const handleUpdateRollNotes = useCallback(
    (updater: RollNote[] | ((prev: RollNote[]) => RollNote[])) => {
      updatePianoRollState((prev) => {
        const pid = prev.activePatternId;
        const curr = prev.patterns[pid] ?? {
          id: pid,
          name: `Drum Roll ${prev.patternOrder.length + 1}`,
          notes: [],
        };
        const nextRaw = typeof updater === 'function' ? updater(curr.notes) : updater;
        const cleanNotes: MidiNote[] = nextRaw.map((n) => ({
          id: n.id,
          midi: n.midi,
          step: n.step,
          duration: n.duration,
          velocity: n.velocity,
        }));
        return {
          ...prev,
          patterns: {
            ...prev.patterns,
            [pid]: { ...curr, notes: cleanNotes },
          },
        };
      });
    },
    [updatePianoRollState]
  );

  const handleCreateRollPattern = useCallback(() => {
    updatePianoRollState((prev) => {
      let num = prev.patternOrder.length + 1;
      while (prev.patterns[`B${num}`]) num++;
      const newId = `B${num}`;
      return {
        ...prev,
        activePatternId: newId,
        patternOrder: [...prev.patternOrder, newId],
        patterns: {
          ...prev.patterns,
          [newId]: { id: newId, name: `Drum Roll ${num}`, notes: [] },
        },
      };
    });
  }, [updatePianoRollState]);

  const handleDuplicateRollPattern = useCallback(() => {
    updatePianoRollState((prev) => {
      const src = prev.patterns[prev.activePatternId];
      let num = prev.patternOrder.length + 1;
      while (prev.patterns[`B${num}`]) num++;
      const newId = `B${num}`;
      const cloned: MidiNote[] = (src?.notes ?? []).map((n, i) => ({
        ...n,
        id: `bb-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      }));
      return {
        ...prev,
        activePatternId: newId,
        patternOrder: [...prev.patternOrder, newId],
        patterns: {
          ...prev.patterns,
          [newId]: {
            id: newId,
            name: src ? `${src.name} Copy` : `Drum Roll ${num}`,
            notes: cloned,
          },
        },
      };
    });
  }, [updatePianoRollState]);

  const handleDeleteRollPattern = useCallback(() => {
    updatePianoRollState((prev) => {
      if (prev.patternOrder.length <= 1) {
        const pid = prev.activePatternId;
        const curr = prev.patterns[pid];
        return {
          ...prev,
          patterns: {
            ...prev.patterns,
            [pid]: { ...(curr ?? { id: pid, name: 'Drum Roll 1' }), notes: [] },
          },
        };
      }
      const nextOrder = prev.patternOrder.filter((id) => id !== prev.activePatternId);
      const nextPatterns = { ...prev.patterns };
      delete nextPatterns[prev.activePatternId];
      return {
        ...prev,
        activePatternId: nextOrder[0],
        patternOrder: nextOrder,
        patterns: nextPatterns,
      };
    });
  }, [updatePianoRollState]);

  const handleImportStepsToPianoRoll = useCallback(() => {
    const imported: MidiNote[] = [];
    for (const tid of DRUM_TRACK_ORDER) {
      const tr = beatbox.tracks[tid];
      const row = activePattern.steps[tid];
      if (!tr || !row) continue;
      row.forEach((cell, stepIdx) => {
        if (cell.active) {
          imported.push({
            id: `bb-imp-${tid}-${stepIdx}-${Date.now()}`,
            midi: tr.midiNote,
            step: stepIdx,
            duration: 0.5,
            velocity: cell.accent ? 1.0 : cell.velocity,
          });
        }
      });
    }
    handleUpdateRollNotes(imported);
  }, [beatbox.tracks, activePattern, handleUpdateRollNotes]);

  return (
    <div className="flex flex-col gap-2 h-full p-2 sm:p-3 overflow-hidden">
      {/* BEATBOX TOP TOOLBAR: Kit, Bank, Pattern, Piano Roll, Swing, Drive, Audio Routing */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#263042] bg-[#131822] px-2.5 py-1.5 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg bg-[#1A2438] hover:bg-[#24324E] border border-amber-400/50 text-amber-200 font-display font-bold text-[11px] tracking-wide cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span>BACK</span>
            </button>
          )}

          <span className="font-display text-xs font-bold tracking-wide text-amber-300">
            BEATBOX
          </span>

          <BeatboxQuickTransport
            bpm={bpm}
            isPlayingProp={isPlayingProp}
            onTogglePlay={onTogglePlay}
          />

          <PluginChannelStrip
            plugin="beatbox"
            routing={routing}
            onChangeRouting={onChangeRouting}
            variant="header"
            accent="amber"
          />

          <button
            type="button"
            onClick={() => setShowPianoRoll(true)}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1 px-2.5 h-8 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-[11px] tracking-wide cursor-pointer whitespace-nowrap"
          >
            <ListMusic className="w-3.5 h-3.5 shrink-0" />
            <span>PIANO ROLL</span>
          </button>

          {onChangeDeviceFx && (
            <button
              type="button"
              aria-pressed={showDeviceRack}
              onClick={() => setShowDeviceRack((s) => !s)}
              style={{ touchAction: 'manipulation' }}
              className={`inline-flex items-center gap-1 px-2.5 h-8 rounded border font-display font-bold text-[11px] tracking-wide cursor-pointer whitespace-nowrap transition-colors ${
                showDeviceRack
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                  : 'bg-[#0A0E15] border-[#263042] text-slate-200 hover:border-cyan-400/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              <span>EFFECTS{deviceFx.length > 0 ? ` (${deviceFx.length})` : ''}</span>
            </button>
          )}

          <select
            aria-label="Drum Kit"
            value={beatbox.kitId}
            onChange={(e) => handleKitChange(e.target.value as DrumKitId)}
            className="h-7 px-2 rounded bg-[#0A0E15] border border-[#263042] text-xs font-medium text-slate-100 focus:outline-none focus:border-amber-400 cursor-pointer"
          >
            {DRUM_KITS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>

          {/* Bank A-D */}
          <div className="flex items-center gap-0.5 bg-[#0A0E15] p-0.5 rounded border border-[#242E40]">
            {BANKS.map((bank: PatternBank) => (
              <button
                key={bank}
                type="button"
                onClick={() => onChangeBeatbox({ activeBank: bank })}
                className={`w-6 h-6 rounded text-[11px] font-display font-bold cursor-pointer ${
                  beatbox.activeBank === bank
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {bank}
              </button>
            ))}
          </div>

          {/* Pattern Slot 1..16 */}
          <select
            aria-label="Beatbox Pattern Slot"
            value={beatbox.activeSlot}
            onChange={(e) => onChangeBeatbox({ activeSlot: Number(e.target.value) })}
            className="h-7 px-2 rounded bg-[#0A0E15] border border-[#263042] font-mono-num text-xs text-amber-300 focus:outline-none focus:border-amber-400 cursor-pointer"
          >
            {SLOTS_16.map((slot) => (
              <option key={slot} value={slot}>
                Pat {beatbox.activeBank}
                {slot}
              </option>
            ))}
          </select>
        </div>

        {/* Swing, Master Drive, Thru Serum FX, Groove Fill */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400">Swing</span>
            <input
              aria-label="Swing"
              type="range"
              min={0}
              max={0.65}
              step={0.01}
              value={beatbox.swing}
              style={{ touchAction: 'none' }}
              onChange={(e) => onChangeBeatbox({ swing: parseFloat(e.target.value) })}
              className="w-16 accent-amber-400 h-1.5 bg-[#1B2434] rounded cursor-pointer"
            />
            <span className="font-mono-num text-[10px] text-amber-300 w-7">
              {Math.round(beatbox.swing * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400">Punch</span>
            <input
              aria-label="Drum Master Drive"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={beatbox.masterDrive}
              style={{ touchAction: 'none' }}
              onChange={(e) =>
                onChangeBeatbox({ masterDrive: parseFloat(e.target.value) })
              }
              className="w-14 accent-amber-400 h-1.5 bg-[#1B2434] rounded cursor-pointer"
            />
          </div>

          <ToggleSwitch
            checked={routing.beatboxToSerumFx}
            onChange={(beatboxToSerumFx) => onChangeRouting({ beatboxToSerumFx })}
            label="Thru Serum FX"
            accent="amber"
            compact
          />

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => applyQuickGroove('halftime')}
              className="px-2 h-7 rounded bg-[#0A0E15] border border-[#263042] text-[10px] font-medium text-slate-200 hover:border-amber-400/50 hover:text-amber-300 cursor-pointer"
            >
              1/2 Time
            </button>
            <button
              type="button"
              onClick={() => applyQuickGroove('fourfloor')}
              className="px-2 h-7 rounded bg-[#0A0E15] border border-[#263042] text-[10px] font-medium text-slate-200 hover:border-cyan-400/50 hover:text-cyan-300 cursor-pointer"
            >
              4/4
            </button>
            <button
              type="button"
              onClick={() => applyQuickGroove('riddim')}
              className="hidden lg:inline-flex items-center px-2 h-7 rounded bg-[#0A0E15] border border-[#263042] text-[10px] font-medium text-slate-200 hover:border-amber-400/50 hover:text-amber-300 cursor-pointer"
            >
              Riddim
            </button>
            <button
              type="button"
              title="Clear Current Drum Pattern"
              onClick={() => applyQuickGroove('clear')}
              className="w-7 h-7 rounded bg-[#0A0E15] border border-[#263042] flex items-center justify-center text-slate-400 hover:text-rose-400 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* MAIN LANDSCAPE WORKSPACE: LEFT PADS & VOICE DESIGNER + RIGHT 16-STEP SEQUENCER */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 flex-1 min-h-0 overflow-y-auto sm:overflow-hidden synth-scroll">
        {/* LEFT: 8 TOUCH PADS + VOICE SYNTH KNOBS */}
        <div className="sm:col-span-5 flex flex-col gap-2 min-h-0">
          {/* 8 Drum Pads (4x2) */}
          <section className="rounded-xl border border-[#263042] bg-[#131822] p-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-0.5">
              <BeatboxPadRecLabel isRecording={isRecording} isPlayingProp={isPlayingProp} />
              <button
                type="button"
                onClick={() => setAccentBrush((a) => !a)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${
                  accentBrush
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-[#0A0E15] border-[#263042] text-slate-400'
                }`}
              >
                <Zap className="w-3 h-3" />
                <span>Accent</span>
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {DRUM_TRACK_ORDER.map((tid) => {
                const tr = beatbox.tracks[tid];
                const isSelected = selectedTrack === tid;
                const isLit = Boolean(litPads[tid]);
                const isAmber = tr.accentColor === 'amber';

                return (
                  <div
                    key={tid}
                    className={`relative rounded-lg border transition-colors duration-75 flex flex-col justify-between p-1.5 min-h-[58px] ${
                      isLit
                        ? isAmber
                          ? 'bg-amber-500/35 border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.35)]'
                          : 'bg-cyan-500/35 border-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.35)]'
                        : isSelected
                        ? 'bg-[#1A2436] border-cyan-400/70'
                        : 'bg-[#0C1018] border-[#242E40] hover:border-slate-500'
                    } ${tr.muted ? 'opacity-50' : ''}`}
                  >
                    <button
                      type="button"
                      style={{ touchAction: 'manipulation' }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        handlePadTap(tid);
                      }}
                      className="flex-1 w-full text-left flex flex-col justify-between cursor-pointer"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-display text-[11px] font-bold text-slate-100">
                          {tr.shortName}
                        </span>
                        <span className="font-mono-num text-[9px] text-slate-400">
                          {tr.midiNote}
                        </span>
                      </div>
                    </button>

                    <div className="flex items-center justify-end gap-1 mt-1">
                      <button
                        type="button"
                        onClick={() => updateTrack(tid, { muted: !tr.muted })}
                        className={`px-1 rounded text-[9px] font-bold cursor-pointer ${
                          tr.muted
                            ? 'bg-rose-500/30 text-rose-300'
                            : 'bg-[#151D2B] text-slate-400 hover:text-white'
                        }`}
                      >
                        M
                      </button>
                      <button
                        type="button"
                        onClick={() => updateTrack(tid, { solo: !tr.solo })}
                        className={`px-1 rounded text-[9px] font-bold cursor-pointer ${
                          tr.solo
                            ? 'bg-amber-500/30 text-amber-300'
                            : 'bg-[#151D2B] text-slate-400 hover:text-white'
                        }`}
                      >
                        S
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Selected Track Sound Designer */}
          <section className="flex-1 rounded-xl border border-[#263042] bg-[#131822] p-2.5 flex flex-col justify-between min-h-0">
            <div className="flex items-center justify-between mb-1">
              <span className="font-display text-xs font-semibold text-slate-100">
                Voice: <span className="text-amber-300">{track.name}</span>
              </span>
              <span className="font-mono-num text-[10px] text-slate-400">
                MIDI Note {track.midiNote}
              </span>
            </div>

            <div className="grid grid-cols-6 gap-1 items-center pt-1 border-t border-[#1E2736]">
              <RotaryKnob
                label="Pitch"
                size="sm"
                accent="cyan"
                value={track.pitch}
                min={-12}
                max={12}
                step={0.5}
                defaultValue={0}
                bipolar
                formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}st`}
                onChange={(pitch) => updateTrack(selectedTrack, { pitch })}
              />
              <RotaryKnob
                label="Decay"
                size="sm"
                accent="amber"
                value={track.decay}
                min={0.05}
                max={1.4}
                logarithmic
                defaultValue={0.35}
                formatValue={(v) => `${Math.round(v * 1000)}ms`}
                onChange={(decay) => updateTrack(selectedTrack, { decay })}
              />
              <RotaryKnob
                label="Tone"
                size="sm"
                accent="cyan"
                value={track.tone}
                min={0}
                max={1}
                defaultValue={0.6}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(tone) => updateTrack(selectedTrack, { tone })}
              />
              <RotaryKnob
                label="Drive"
                size="sm"
                accent="amber"
                value={track.drive}
                min={0}
                max={1}
                defaultValue={0.25}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(drive) => updateTrack(selectedTrack, { drive })}
              />
              <RotaryKnob
                label="Pan"
                size="sm"
                value={track.pan}
                min={-1}
                max={1}
                defaultValue={0}
                bipolar
                formatValue={(v) =>
                  Math.abs(v) < 0.04 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`
                }
                onChange={(pan) => updateTrack(selectedTrack, { pan })}
              />
              <RotaryKnob
                label="Level"
                size="sm"
                accent="amber"
                value={track.level}
                min={0}
                max={1.2}
                defaultValue={0.85}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(level) => updateTrack(selectedTrack, { level })}
              />
            </div>
          </section>
        </div>

        {/* RIGHT: 16-STEP × 8-TRACK DRUM SEQUENCER GRID */}
        <BeatboxStepGrid
          beatboxTracks={beatbox.tracks}
          stepsMap={activePattern.steps}
          selectedTrack={selectedTrack}
          isPlayingProp={isPlayingProp}
          playheadStepProp={playheadStepProp}
          onSelectTrack={setSelectedTrack}
          onSetStepActive={setStepActive}
        />
      </div>

      {showDeviceRack && onChangeDeviceFx && (
        <div className="-mx-2 sm:-mx-3 -mb-2 sm:-mb-3 shrink-0">
          <FxDeviceRack
            activeTrack="beatbox"
            modules={deviceFx}
            channelBypass={Boolean(routing.beatboxFxBypass)}
            hideTrackTabs
            onChangeModules={(_, next) => onChangeDeviceFx(next)}
            onToggleChannelBypass={() =>
              onChangeRouting({ beatboxFxBypass: !routing.beatboxFxBypass })
            }
            onOpenBrowser={() => onOpenEffectsBrowser?.()}
          />
        </div>
      )}

      {showPianoRoll && (
        <BeatboxPianoRollView
          notes={activeRollPattern.notes}
          bpm={bpm}
          loop={loop}
          isPlayingProp={isPlayingProp}
          isRecording={isRecording}
          playheadStepProp={playheadStepProp}
          isFullscreen={isFullscreen}
          patternOptions={rollPatternOptions}
          activePatternId={activeRollPattern.id}
          beatboxTracks={beatbox.tracks}
          onBack={() => setShowPianoRoll(false)}
          onToggleFullscreen={onToggleFullscreen}
          onTogglePlay={onTogglePlay}
          onStop={onStop}
          onToggleLoop={onToggleLoop}
          onToggleRecord={onToggleRecord}
          onChangeBpm={onChangeBpm}
          onUpdateNotes={handleUpdateRollNotes}
          onSelectPattern={(activePatternId) =>
            updatePianoRollState((prev) => ({ ...prev, activePatternId }))
          }
          onCreatePattern={handleCreateRollPattern}
          onDuplicatePattern={handleDuplicateRollPattern}
          onDeletePattern={handleDeleteRollPattern}
          onImportBeatboxSteps={handleImportStepsToPianoRoll}
        />
      )}
    </div>
  );
});
