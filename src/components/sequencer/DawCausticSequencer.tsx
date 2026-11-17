import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clipboard,
  Copy,
  CopyPlus,
  Edit3,
  ListMusic,
  Play,
  Plus,
  Repeat,
  SlidersHorizontal,
  Square,
  Trash2,
} from 'lucide-react';
import { beatboxEngine } from '../../audio/BeatboxEngine';
import {
  DAW_TRACK_ORDER,
  DAW_TRACK_TEMPLATES,
  getTimeSignatureInfo,
} from '../../audio/dawPresets';
import { studioAudio } from '../../audio/StudioAudio';
import { subbassEngine } from '../../audio/SubbassEngine';
import { synthEngine } from '../../audio/SynthEngine';
import { sixSixSixEngine } from '../../audio/ts666/SixSixSixEngine';
import { useDawStep, useIsPlaying } from '../../audio/transportStore';
import type { DrumTrackId } from '../../types/beatbox';
import type {
  DawPattern,
  DawPlayMode,
  DawSequencerState,
  DawSongClip,
  DawTrackConfig,
  DawTrackId,
  TimeSignatureId,
} from '../../types/daw';

interface DawCausticSequencerProps {
  daw: DawSequencerState;
  timeSignature: TimeSignatureId;
  bpm: number;
  loop: boolean;
  isPlaying?: boolean;
  dawStep?: number;
  selectedTrackId: DawTrackId;
  selectedClipId: string | null;
  onSelectTrack: (trackId: DawTrackId) => void;
  onSelectClip: (clipId: string | null) => void;
  onUpdateTrack: (trackId: DawTrackId, patch: Partial<DawTrackConfig>) => void;
  onAddTrack: (templateId: string) => void;
  onRemoveTrack: (trackId: DawTrackId) => void;
  onPlaceOrSelectTrackClip: (trackId: DawTrackId, barIdx: number) => void;
  onUpdateClip: (clipId: string, patch: Partial<DawSongClip>) => void;
  onDuplicateClipAsNewPattern: (clipId: string) => void;
  onPasteClipToBar: (clipToPaste: DawSongClip, targetTrackId: DawTrackId, startBar: number) => void;
  onDeleteClip: (clipId: string) => void;
  onCreateTrackPattern: (trackId: DawTrackId) => void;
  onAssignTrackPattern: (trackId: DawTrackId, patternId: string, clipId?: string | null) => void;
  onEditClipPattern: (trackId: DawTrackId, patternId: string, forcePianoRoll?: boolean) => void;
  onExtendBars: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onChangeBpm: (bpm: number) => void;
  onSwitchPlayMode: (mode: DawPlayMode) => void;
  onOpenAdvanced: () => void;
}

const BAR_WIDTH = 78;
const ROW_HEIGHT = 68;

const TimelinePosReadout: React.FC<{
  stepsPerBar: number;
  stepsPerBeat: number;
  isPlayingProp?: boolean;
  dawStepProp?: number;
}> = React.memo(({ stepsPerBar, stepsPerBeat, isPlayingProp, dawStepProp }) => {
  const storePlaying = useIsPlaying();
  const storeStep = useDawStep();
  const isPlaying = isPlayingProp ?? storePlaying;
  const step = dawStepProp ?? storeStep;

  const bar = Math.floor(step / stepsPerBar) + 1;
  const beat = Math.floor((step % stepsPerBar) / stepsPerBeat) + 1;

  return (
    <div className="flex items-center px-2.5 h-9 rounded-lg bg-[#090C12] border border-[#242E40] font-mono-num text-xs font-bold shrink-0">
      <span className={isPlaying ? 'text-emerald-300' : 'text-slate-300'}>
        {bar}.{beat}
      </span>
    </div>
  );
});

const TimelinePlayheadOverlay: React.FC<{
  stepsPerBar: number;
  isSongMode: boolean;
  isPlayingProp?: boolean;
  dawStepProp?: number;
  variant: 'ruler' | 'grid';
}> = React.memo(({ stepsPerBar, isSongMode, isPlayingProp, dawStepProp, variant }) => {
  const storePlaying = useIsPlaying();
  const storeStep = useDawStep();
  const isPlaying = isPlayingProp ?? storePlaying;
  const step = dawStepProp ?? storeStep;

  if (!isPlaying && step <= 0.01) return null;
  const barPos = isSongMode ? step / stepsPerBar : (step % stepsPerBar) / stepsPerBar;
  const x = Math.max(0, barPos * BAR_WIDTH);

  if (variant === 'ruler') {
    return (
      <div
        style={{ transform: `translateX(${x}px)` }}
        className="absolute top-0 bottom-0 left-0 w-0.5 bg-emerald-400 pointer-events-none z-20"
      >
        <div className="w-2.5 h-2.5 -ml-1 rotate-45 -mt-1 bg-emerald-400" />
      </div>
    );
  }

  return (
    <div
      style={{ transform: `translateX(${x}px)` }}
      className="absolute top-0 bottom-0 left-0 w-0.5 bg-emerald-400/90 pointer-events-none z-30"
    />
  );
});

function getTrackTheme(cfg: DawTrackConfig) {
  if (cfg.target === 'subbass') {
    return {
      stripe: 'bg-blue-500',
      badge: 'text-blue-300 bg-blue-500/15 border-blue-400/40',
      block: 'bg-gradient-to-br from-blue-600/45 to-violet-600/35 border-blue-400/75 text-blue-100',
      blockSelected: 'bg-gradient-to-br from-blue-500/65 to-violet-500/55 border-white ring-2 ring-blue-300 text-white',
      miniFill: 'bg-blue-300',
      shortBadge: 'SUB',
    };
  }
  if (cfg.target === 'ts666') {
    return {
      stripe: 'bg-rose-500',
      badge: 'text-rose-300 bg-rose-500/15 border-rose-400/40',
      block: 'bg-gradient-to-br from-rose-600/45 to-orange-600/30 border-rose-400/75 text-rose-100',
      blockSelected: 'bg-gradient-to-br from-rose-500/65 to-orange-500/50 border-white ring-2 ring-rose-300 text-white',
      miniFill: 'bg-rose-300',
      shortBadge: '666',
    };
  }
  if (cfg.target === 'beatbox') {
    return {
      stripe: 'bg-amber-500',
      badge: 'text-amber-300 bg-amber-500/15 border-amber-400/40',
      block: 'bg-amber-500/30 border-amber-400/75 text-amber-100',
      blockSelected: 'bg-amber-500/50 border-white ring-2 ring-amber-300 text-white',
      miniFill: 'bg-amber-300',
      shortBadge: cfg.drumTrackId ? 'DRM' : 'KIT',
    };
  }
  return {
    stripe: 'bg-cyan-400',
    badge: 'text-cyan-300 bg-cyan-500/15 border-cyan-400/40',
    block: 'bg-cyan-500/30 border-cyan-400/75 text-cyan-100',
    blockSelected: 'bg-cyan-500/50 border-white ring-2 ring-cyan-200 text-white',
    miniFill: 'bg-cyan-300',
    shortBadge: 'SYN',
  };
}

function summarizePatternForTrack(pat: DawPattern | undefined, track: DawTrackConfig): {
  noteCount: number;
  stepPositions: number[];
} {
  if (!pat) return { noteCount: 0, stepPositions: [] };

  const positions: number[] = [];
  if (track.target === 'beatbox' && !track.drumTrackId) {
    // Beatbox Drums kit track: sample hits across all kit rows
    const prefix = `${track.id}:`;
    let total = 0;
    for (let s = 0; s < Math.min(16, pat.stepCount); s++) {
      let hasHit = false;
      for (const [k, row] of Object.entries(pat.tracks)) {
        if (k.startsWith(prefix) && row[s]?.active) {
          hasHit = true;
          total++;
        }
      }
      if (hasHit) positions.push(s / 16);
    }
    total += pat.pianoRollNotes.length;
    for (const n of pat.pianoRollNotes) {
      if (n.step < pat.stepCount) positions.push(n.step / pat.stepCount);
    }
    return { noteCount: total, stepPositions: positions.slice(0, 16) };
  }

  const row = pat.tracks[track.id] ?? [];
  let activeCount = 0;
  for (let s = 0; s < Math.min(pat.stepCount, row.length); s++) {
    if (row[s]?.active) {
      activeCount++;
      positions.push(s / pat.stepCount);
    }
  }
  for (const n of pat.pianoRollNotes) {
    if (n.step < pat.stepCount) {
      activeCount++;
      positions.push(n.step / pat.stepCount);
    }
  }
  return { noteCount: activeCount, stepPositions: positions.slice(0, 16) };
}

type ClipDragState =
  | {
      kind: 'move';
      clipId: string;
      pointerId: number;
      startX: number;
      originStartBar: number;
      lengthBars: number;
      moved: boolean;
    }
  | {
      kind: 'resize';
      clipId: string;
      pointerId: number;
      startX: number;
      startBar: number;
      originLengthBars: number;
    };

export const DawCausticSequencer: React.FC<DawCausticSequencerProps> = React.memo(({
  daw,
  timeSignature,
  bpm,
  loop,
  isPlaying: isPlayingProp,
  dawStep: dawStepProp,
  selectedTrackId,
  selectedClipId,
  onSelectTrack,
  onSelectClip,
  onUpdateTrack,
  onAddTrack,
  onRemoveTrack,
  onPlaceOrSelectTrackClip,
  onUpdateClip,
  onDuplicateClipAsNewPattern,
  onPasteClipToBar,
  onDeleteClip,
  onCreateTrackPattern,
  onAssignTrackPattern,
  onEditClipPattern,
  onExtendBars,
  onTogglePlay,
  onStop,
  onToggleLoop,
  onChangeBpm,
  onSwitchPlayMode,
  onOpenAdvanced,
}) => {
  const [addTrackOpen, setAddTrackOpen] = useState<boolean>(false);
  const [copiedClip, setCopiedClip] = useState<DawSongClip | null>(null);

  const trackListRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const clipDragRef = useRef<ClipDragState | null>(null);

  const trackOrder =
    daw.trackOrder && daw.trackOrder.length > 0 ? daw.trackOrder : DAW_TRACK_ORDER;
  const tsInfo = getTimeSignatureInfo(timeSignature);
  const totalBars = Math.max(8, daw.song.totalBars);
  const timelineWidth = totalBars * BAR_WIDTH;
  const timelineHeight = trackOrder.length * ROW_HEIGHT;

  const selectedTrack =
    daw.tracks[selectedTrackId] ?? daw.tracks[trackOrder[0]];
  const selectedClip = useMemo(
    () => daw.song.clips.find((c) => c.id === selectedClipId) ?? null,
    [daw.song.clips, selectedClipId]
  );

  // Sync ruler X and track header Y with timeline grid scroll
  const handleTimelineScroll = () => {
    const t = timelineRef.current;
    if (!t) return;
    if (rulerRef.current) rulerRef.current.scrollLeft = t.scrollLeft;
    if (trackListRef.current) trackListRef.current.scrollTop = t.scrollTop;
  };

  // Auto-calculated song end bar for visual loop indicator
  const songEndBar = useMemo(() => {
    if (daw.song.clips.length === 0) return 4;
    let maxB = 1;
    for (const c of daw.song.clips) {
      maxB = Math.max(maxB, c.startBar + c.lengthBars);
    }
    return Math.min(totalBars, maxB);
  }, [daw.song.clips, totalBars]);

  // Audition track sound on tap
  const auditionTrack = (trackId: DawTrackId) => {
    const cfg = daw.tracks[trackId];
    if (!cfg) return;
    studioAudio.unlockSync();
    if (cfg.target === 'beatbox') {
      const drumId: DrumTrackId =
        cfg.drumTrackId ??
        (trackId === 'hihat'
          ? 'ch'
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
      void beatboxEngine.triggerTrack(drumId, 0.9);
    } else if (cfg.target === 'subbass') {
      void subbassEngine.ensureAudio().then((ctx) => {
        const now = ctx.currentTime;
        subbassEngine.scheduleNote(cfg.defaultNote, 0.9, now, now + 0.25);
      });
    } else if (cfg.target === 'ts666') {
      void sixSixSixEngine.ensureAudio().then((ctx) => {
        if (!ctx) return;
        const now = ctx.currentTime;
        sixSixSixEngine.scheduleNote(cfg.defaultNote, 0.88, now, now + 0.22);
      });
    } else {
      void synthEngine.ensureAudio().then((ctx) => {
        const now = ctx.currentTime;
        void synthEngine.scheduleNote(cfg.defaultNote, 0.85, now, now + 0.22);
      });
    }
  };

  // Available pattern options for currently active track (owned first, then legacy)
  const trackPatternOptions = useMemo(() => {
    const tid = selectedClip?.trackId ?? selectedTrack?.id;
    const entries = Object.values(daw.patterns);
    const owned = entries.filter((p) => p.ownerTrackId === tid);
    const shared = entries.filter((p) => !p.ownerTrackId);
    return [...owned, ...shared];
  }, [daw.patterns, selectedClip, selectedTrack]);

  const activePatternForTrack = useMemo(() => {
    if (selectedClip) return selectedClip.patternId;
    if (selectedTrack && daw.trackActivePattern?.[selectedTrack.id]) {
      const pid = daw.trackActivePattern[selectedTrack.id];
      if (daw.patterns[pid]) return pid;
    }
    const firstOwned = trackPatternOptions[0];
    return firstOwned?.id ?? daw.activePatternId;
  }, [selectedClip, selectedTrack, daw.trackActivePattern, daw.patterns, trackPatternOptions, daw.activePatternId]);

  const handleClipPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    clip: DawSongClip,
    isResize: boolean
  ) => {
    e.stopPropagation();
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (isResize) {
      clipDragRef.current = {
        kind: 'resize',
        clipId: clip.id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startBar: clip.startBar,
        originLengthBars: clip.lengthBars,
      };
    } else {
      clipDragRef.current = {
        kind: 'move',
        clipId: clip.id,
        pointerId: e.pointerId,
        startX: e.clientX,
        originStartBar: clip.startBar,
        lengthBars: clip.lengthBars,
        moved: false,
      };
    }
  };

  const handleClipPointerMove = (
    e: React.PointerEvent<HTMLDivElement>,
    clip: DawSongClip
  ) => {
    const drag = clipDragRef.current;
    if (!drag || drag.clipId !== clip.id || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startX;
    if (drag.kind === 'move') {
      if (Math.abs(dx) > 10) {
        drag.moved = true;
      }
      if (drag.moved) {
        const deltaBars = Math.round(dx / BAR_WIDTH);
        const nextStart = Math.max(
          0,
          Math.min(totalBars - drag.lengthBars, drag.originStartBar + deltaBars)
        );
        if (nextStart !== clip.startBar) {
          onUpdateClip(clip.id, { startBar: nextStart });
        }
      }
    } else if (drag.kind === 'resize') {
      const deltaBars = Math.round(dx / BAR_WIDTH);
      const maxLen = Math.min(16, totalBars - drag.startBar);
      const nextLen = Math.max(1, Math.min(maxLen, drag.originLengthBars + deltaBars));
      if (nextLen !== clip.lengthBars) {
        onUpdateClip(clip.id, { lengthBars: nextLen });
      }
    }
  };

  const handleClipPointerUp = (
    e: React.PointerEvent<HTMLDivElement>,
    clip: DawSongClip,
    resolvedTrackId: DawTrackId
  ) => {
    const drag = clipDragRef.current;
    clipDragRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    if (!drag || drag.clipId !== clip.id) return;
    if (drag.kind === 'move' && !drag.moved) {
      // Single tap selects clip; second tap on already-selected clip opens its editor immediately!
      if (selectedClipId === clip.id) {
        onEditClipPattern(resolvedTrackId, clip.patternId);
      } else {
        onSelectTrack(resolvedTrackId);
        onSelectClip(clip.id);
      }
    } else {
      onSelectTrack(resolvedTrackId);
      onSelectClip(clip.id);
    }
  };

  const handleTrackPlayToggle = () => {
    if (daw.song.clips.length > 0 && daw.playMode !== 'song') {
      onSwitchPlayMode('song');
    }
    onTogglePlay();
  };

  const hasClips = daw.song.clips.length > 0;
  const isSongEffective = daw.playMode === 'song' && hasClips;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#080B11] text-slate-100 rounded-xl border border-[#242E40] overflow-hidden select-none">
      {/* CAUSTIC TOP TRANSPORT & TRACK BAR */}
      <div className="flex items-center justify-between gap-2 px-2.5 sm:px-3.5 py-2 bg-[#111622] border-b border-[#242E40] shrink-0 overflow-x-auto synth-scroll">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-display text-xs sm:text-sm font-bold tracking-wider text-emerald-300 mr-1 whitespace-nowrap">
            SEQUENCER
          </span>

          <button
            type="button"
            onClick={handleTrackPlayToggle}
            style={{ touchAction: 'manipulation' }}
            className={`inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg font-display font-bold text-xs cursor-pointer transition-colors whitespace-nowrap ${
              isPlayingProp
                ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                : 'bg-[#172235] hover:bg-[#1E2E47] border border-emerald-400/60 text-emerald-200'
            }`}
          >
            {isPlayingProp ? (
              <Square className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isPlayingProp ? 'PAUSE' : 'PLAY'}</span>
          </button>

          <button
            type="button"
            onClick={onStop}
            aria-label="Stop and Reset Playhead"
            style={{ touchAction: 'manipulation' }}
            className="w-9 h-9 rounded-lg bg-[#090C12] border border-[#2A364F] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer shrink-0"
          >
            <Square className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            aria-pressed={loop}
            onClick={onToggleLoop}
            style={{ touchAction: 'manipulation' }}
            className={`inline-flex items-center gap-1 px-2.5 h-9 rounded-lg border text-xs font-display font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
              loop
                ? 'bg-cyan-500/20 border-cyan-400/70 text-cyan-200'
                : 'bg-[#090C12] border-[#2A364F] text-slate-400 hover:text-white'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{loop ? 'LOOP ON' : 'LOOP'}</span>
          </button>

          <div className="flex items-center bg-[#090C12] rounded-lg border border-[#2A364F] h-9 shrink-0">
            <button
              type="button"
              aria-label="Decrease BPM"
              onClick={() => onChangeBpm(bpm - 1)}
              className="w-7 h-full text-slate-300 hover:text-white cursor-pointer font-bold"
            >
              −
            </button>
            <span className="px-2 font-mono-num text-xs font-bold text-cyan-200 whitespace-nowrap">
              {bpm} BPM
            </span>
            <button
              type="button"
              aria-label="Increase BPM"
              onClick={() => onChangeBpm(bpm + 1)}
              className="w-7 h-full text-slate-300 hover:text-white cursor-pointer font-bold"
            >
              +
            </button>
          </div>

          <TimelinePosReadout
            stepsPerBar={tsInfo.stepsPerBar}
            stepsPerBeat={tsInfo.stepsPerBeat}
            isPlayingProp={isPlayingProp}
            dawStepProp={dawStepProp}
          />
        </div>

        {/* Right: + ADD TRACK, +4 BARS, ADVANCED */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setAddTrackOpen((v) => !v)}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>ADD TRACK</span>
          </button>

          <button
            type="button"
            onClick={onExtendBars}
            title="Add 4 more bars to timeline"
            style={{ touchAction: 'manipulation' }}
            className="px-2.5 h-9 rounded-lg bg-[#090C12] hover:bg-[#172133] border border-[#2A364F] font-mono-num text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
          >
            +4 BARS
          </button>

          <button
            type="button"
            onClick={onOpenAdvanced}
            style={{ touchAction: 'manipulation' }}
            title="Open Advanced DAW Modes (64-Step Grid, Loop Markers, Automation)"
            className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg bg-[#090C12] hover:bg-[#172133] border border-[#2A364F] text-xs font-display font-bold text-slate-300 hover:text-cyan-200 cursor-pointer whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>ADVANCED</span>
          </button>
        </div>
      </div>

      {/* ADD TRACK INSTRUMENT PICKER DRAWER */}
      {addTrackOpen && (
        <div className="px-3 py-2 bg-[#0D1320] border-b border-emerald-500/40 flex flex-wrap items-center gap-1.5 shrink-0">
          <span className="text-[11px] font-display font-bold text-emerald-300 mr-1 whitespace-nowrap">
            ADD INSTRUMENT TRACK:
          </span>
          {DAW_TRACK_TEMPLATES.filter((tpl) => tpl.target !== 'serum').map((tpl) => {
            const accentCls =
              tpl.target === 'subbass'
                ? 'border-blue-400/50 text-blue-200 hover:bg-blue-500/20'
                : tpl.target === 'ts666'
                ? 'border-rose-400/50 text-rose-200 hover:bg-rose-500/20'
                : tpl.target === 'beatbox'
                ? 'border-amber-400/50 text-amber-200 hover:bg-amber-500/20'
                : 'border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/20';
            return (
              <button
                key={tpl.templateId}
                type="button"
                onClick={() => {
                  onAddTrack(tpl.templateId);
                  setAddTrackOpen(false);
                }}
                style={{ touchAction: 'manipulation' }}
                className={`px-2.5 h-8 rounded-lg bg-[#141B29] border text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${accentCls}`}
              >
                + {tpl.name}
              </button>
            );
          })}
        </div>
      )}

      {/* MAIN CAUSTIC TIMELINE: PINNED TRACK ROWS (LEFT) + BAR GRID & PATTERN BLOCKS (RIGHT) */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* LEFT COLUMN: TRACK STACK */}
        <div className="w-[144px] sm:w-[188px] flex flex-col border-r border-[#242E40] bg-[#0D121C] shrink-0">
          {/* Corner Header */}
          <div className="h-8 px-2.5 border-b border-[#242E40] bg-[#121826] flex items-center justify-between shrink-0">
            <span className="font-display text-[11px] font-bold text-slate-300 tracking-wider">
              TRACKS ({trackOrder.length})
            </span>
            <span className="font-mono-num text-[10px] text-slate-400">
              {hasClips ? `${songEndBar}B` : 'EMPTY'}
            </span>
          </div>

          {/* Synchronized Vertical Track Headers */}
          <div
            ref={trackListRef}
            className="flex-1 overflow-hidden relative"
          >
            <div style={{ height: timelineHeight }} className="relative">
              {trackOrder.map((tid) => {
                const cfg = daw.tracks[tid];
                if (!cfg) return null;
                const theme = getTrackTheme(cfg);
                const isSelected = selectedTrack?.id === tid;

                return (
                  <div
                    key={tid}
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => {
                      onSelectTrack(tid);
                      auditionTrack(tid);
                    }}
                    className={`relative flex items-center justify-between gap-1.5 pl-2.5 pr-1.5 border-b border-[#1D2638] cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#182235]' : 'bg-[#0E131D] hover:bg-[#141B29]'
                    }`}
                  >
                    {/* Left Colored Accent Stripe */}
                    <div
                      className={`absolute left-0 top-1 bottom-1 w-1 rounded-r ${theme.stripe}`}
                    />

                    {/* Track Name & Instrument Badge */}
                    <div className="min-w-0 flex-1 pl-1">
                      <div className="font-display font-bold text-xs sm:text-[13px] text-slate-100 truncate">
                        {cfg.name}
                      </div>
                      <span
                        className={`inline-block mt-0.5 px-1.5 py-0.2 rounded border font-mono-num text-[9px] font-bold ${theme.badge}`}
                      >
                        {theme.shortBadge}
                      </span>
                    </div>

                    {/* M / S / Del */}
                    <div
                      className="flex items-center gap-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        aria-label={`Mute ${cfg.name}`}
                        aria-pressed={cfg.muted}
                        onClick={() => onUpdateTrack(tid, { muted: !cfg.muted })}
                        style={{ touchAction: 'manipulation' }}
                        className={`w-7 h-7 rounded font-display font-bold text-[10px] cursor-pointer transition-colors ${
                          cfg.muted
                            ? 'bg-rose-500 text-white'
                            : 'bg-[#171E2E] text-slate-400 hover:text-white'
                        }`}
                      >
                        M
                      </button>
                      <button
                        type="button"
                        aria-label={`Solo ${cfg.name}`}
                        aria-pressed={cfg.solo}
                        onClick={() => onUpdateTrack(tid, { solo: !cfg.solo })}
                        style={{ touchAction: 'manipulation' }}
                        className={`w-7 h-7 rounded font-display font-bold text-[10px] cursor-pointer transition-colors ${
                          cfg.solo
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-[#171E2E] text-slate-400 hover:text-white'
                        }`}
                      >
                        S
                      </button>
                      {trackOrder.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Delete ${cfg.name}`}
                          onClick={() => onRemoveTrack(tid)}
                          style={{ touchAction: 'manipulation' }}
                          className="w-6 h-7 rounded flex items-center justify-center text-slate-500 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT HORIZONTAL BAR TIMELINE & PATTERN BLOCKS */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-[#070A10]">
          {/* Bar Ruler */}
          <div
            ref={rulerRef}
            className="h-8 border-b border-[#242E40] bg-[#121826] overflow-hidden shrink-0"
          >
            <div style={{ width: timelineWidth }} className="relative h-full flex">
              {Array.from({ length: totalBars }, (_, barIdx) => {
                const isActiveEnd = hasClips && barIdx + 1 === songEndBar;
                return (
                  <div
                    key={barIdx}
                    style={{ width: BAR_WIDTH }}
                    className={`relative h-full border-r px-2 flex items-center justify-between font-mono-num text-[11px] shrink-0 ${
                      isActiveEnd
                        ? 'border-r-emerald-400/70 bg-emerald-500/10 text-emerald-200 font-bold'
                        : 'border-r-[#26324A] text-slate-300 font-semibold'
                    }`}
                  >
                    <span>Bar {barIdx + 1}</span>
                    {isActiveEnd && (
                      <span className="text-[9px] text-emerald-300">END</span>
                    )}
                    {/* Subtle beat tick markers */}
                    <div className="absolute bottom-0 left-[25%] w-px h-1.5 bg-[#2A364F]" />
                    <div className="absolute bottom-0 left-[50%] w-px h-2 bg-[#374666]" />
                    <div className="absolute bottom-0 left-[75%] w-px h-1.5 bg-[#2A364F]" />
                  </div>
                );
              })}

              <TimelinePlayheadOverlay
                variant="ruler"
                stepsPerBar={tsInfo.stepsPerBar}
                isSongMode={isSongEffective}
                isPlayingProp={isPlayingProp}
                dawStepProp={dawStepProp}
              />
            </div>
          </div>

          {/* Scrollable Track Rows + Bar Slots + Pattern Blocks */}
          <div
            ref={timelineRef}
            onScroll={handleTimelineScroll}
            className="flex-1 overflow-auto synth-scroll relative"
          >
            <div
              style={{ width: timelineWidth, height: timelineHeight }}
              className="relative"
            >
              {/* Empty Bar Grid Cells (1-tap places track pattern or opens paste) */}
              {trackOrder.map((tid, rowIdx) => {
                const cfg = daw.tracks[tid];
                if (!cfg) return null;
                const isSelectedRow = selectedTrack?.id === tid;
                return (
                  <div
                    key={tid}
                    style={{ top: rowIdx * ROW_HEIGHT, height: ROW_HEIGHT }}
                    className={`absolute left-0 right-0 flex border-b border-[#1A2334] ${
                      isSelectedRow ? 'bg-[#0C121D]' : 'bg-[#080B12]'
                    }`}
                  >
                    {Array.from({ length: totalBars }, (_, barIdx) => (
                      <button
                        key={barIdx}
                        type="button"
                        aria-label={`Place ${cfg.name} pattern at Bar ${barIdx + 1}`}
                        onClick={() => {
                          onSelectTrack(tid);
                          onPlaceOrSelectTrackClip(tid, barIdx);
                        }}
                        style={{ width: BAR_WIDTH, touchAction: 'manipulation' }}
                        className="relative h-full border-r border-[#182131] hover:bg-[#131C2D] shrink-0 cursor-pointer transition-colors group"
                      >
                        <div className="pointer-events-none absolute inset-y-0 left-[25%] w-px bg-[#121825]" />
                        <div className="pointer-events-none absolute inset-y-0 left-[50%] w-px bg-[#161E2E]" />
                        <div className="pointer-events-none absolute inset-y-0 left-[75%] w-px bg-[#121825]" />
                        <span className="pointer-events-none opacity-0 group-hover:opacity-60 font-mono-num text-sm font-bold text-slate-400">
                          +
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}

              {/* Pattern Blocks on Track Lanes */}
              {daw.song.clips.map((clip) => {
                const resolvedTid = clip.trackId ?? trackOrder[clip.lane] ?? trackOrder[0];
                const rowIdx = trackOrder.indexOf(resolvedTid);
                if (rowIdx < 0) return null;
                const cfg = daw.tracks[resolvedTid];
                if (!cfg) return null;
                const pat = daw.patterns[clip.patternId];
                const theme = getTrackTheme(cfg);
                const isSel = selectedClipId === clip.id;
                const summary = summarizePatternForTrack(pat, cfg);
                const left = clip.startBar * BAR_WIDTH + 2;
                const width = Math.max(BAR_WIDTH - 4, clip.lengthBars * BAR_WIDTH - 4);
                const top = rowIdx * ROW_HEIGHT + 5;
                const height = ROW_HEIGHT - 10;

                return (
                  <div
                    key={clip.id}
                    onPointerDown={(e) => handleClipPointerDown(e, clip, false)}
                    onPointerMove={(e) => handleClipPointerMove(e, clip)}
                    onPointerUp={(e) => handleClipPointerUp(e, clip, resolvedTid)}
                    onPointerCancel={(e) => handleClipPointerUp(e, clip, resolvedTid)}
                    style={{
                      left,
                      top,
                      width,
                      height,
                      touchAction: 'none',
                    }}
                    className={`absolute rounded-lg border flex items-stretch overflow-hidden cursor-grab active:cursor-grabbing z-10 shadow-md transition-colors ${
                      isSel ? theme.blockSelected : theme.block
                    } ${cfg.muted ? 'opacity-45' : ''}`}
                  >
                    {/* Main Pattern Block Content */}
                    <div className="flex-1 min-w-0 px-2 py-1 flex flex-col justify-between pointer-events-none">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-display font-bold text-[11px] truncate">
                          {pat?.name ?? clip.patternId}
                        </span>
                        {clip.lengthBars > 1 && (
                          <span className="font-mono-num text-[9px] px-1 rounded bg-black/35 shrink-0">
                            {clip.lengthBars}B
                          </span>
                        )}
                      </div>

                      {/* Mini Pattern Activity Preview */}
                      <div className="relative h-3.5 w-full rounded bg-black/30 overflow-hidden">
                        {summary.stepPositions.length === 0 ? (
                          <span className="block px-1 text-[9px] opacity-65 leading-3.5 truncate">
                            {isSel ? 'Tap again to edit' : 'Empty'}
                          </span>
                        ) : (
                          summary.stepPositions.map((frac, idx) => (
                            <span
                              key={idx}
                              style={{ left: `${Math.min(92, frac * 100)}%` }}
                              className={`absolute top-0.5 bottom-0.5 w-1.5 rounded-sm opacity-90 ${theme.miniFill}`}
                            />
                          ))
                        )}
                      </div>
                    </div>

                    {/* Right Edge Resize Grip */}
                    <div
                      onPointerDown={(e) => handleClipPointerDown(e, clip, true)}
                      onPointerMove={(e) => handleClipPointerMove(e, clip)}
                      onPointerUp={(e) => handleClipPointerUp(e, clip, resolvedTid)}
                      title="Drag horizontally to resize block length"
                      style={{ touchAction: 'none' }}
                      className="w-5 sm:w-6 bg-black/30 hover:bg-black/50 border-l border-white/15 cursor-ew-resize shrink-0 flex items-center justify-center"
                    >
                      <span className="w-0.5 h-5 rounded-full bg-white/75 pointer-events-none" />
                    </div>
                  </div>
                );
              })}

              {/* Auto-loop end guide line */}
              {hasClips && (
                <div
                  style={{ left: songEndBar * BAR_WIDTH }}
                  className="absolute top-0 bottom-0 w-0.5 bg-emerald-400/35 pointer-events-none z-20"
                />
              )}

              <TimelinePlayheadOverlay
                variant="grid"
                stepsPerBar={tsInfo.stepsPerBar}
                isSongMode={isSongEffective}
                isPlayingProp={isPlayingProp}
                dawStepProp={dawStepProp}
              />
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM CAUSTIC ACTION DOCK (Pattern Selection, Block Edit, Move, Resize, Dup, Copy/Paste, Delete) */}
      <div className="shrink-0 bg-[#111622] border-t border-[#242E40] px-2.5 sm:px-3.5 py-2 flex flex-wrap items-center justify-between gap-2">
        {/* Left: Active Track Pattern Selector + New Pattern */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {selectedTrack && (
            <span className="font-display font-bold text-xs text-slate-200 whitespace-nowrap">
              {selectedTrack.name}:
            </span>
          )}

          <select
            aria-label="Track Pattern"
            value={activePatternForTrack}
            onChange={(e) => {
              if (!selectedTrack) return;
              onAssignTrackPattern(
                selectedTrack.id,
                e.target.value,
                selectedClip?.id ?? null
              );
            }}
            className="h-10 px-2.5 rounded-lg bg-[#090C12] border border-[#2C3A52] text-xs font-semibold text-cyan-200 focus:outline-none focus:border-cyan-400 cursor-pointer max-w-[165px]"
          >
            {trackPatternOptions.map((pat) => (
              <option key={pat.id} value={pat.id} className="bg-[#111622]">
                {pat.name} ({pat.stepCount}s)
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => selectedTrack && onCreateTrackPattern(selectedTrack.id)}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1 px-2.5 h-10 rounded-lg bg-[#172033] hover:bg-[#1E2B45] border border-[#2D3B56] text-xs font-semibold text-emerald-300 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Pat</span>
          </button>

          {copiedClip && (
            <button
              type="button"
              onClick={() => {
                if (!selectedTrack) return;
                const nextBar = selectedClip
                  ? Math.min(totalBars - 1, selectedClip.startBar + selectedClip.lengthBars)
                  : 0;
                onPasteClipToBar(copiedClip, selectedTrack.id, nextBar);
              }}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1 px-2.5 h-10 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/60 text-xs font-bold text-cyan-200 cursor-pointer whitespace-nowrap"
            >
              <Clipboard className="w-3.5 h-3.5" />
              <span>Paste</span>
            </button>
          )}
        </div>

        {/* Right: Selected Pattern Block Controls OR Quick Guide */}
        {selectedClip ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                const tid = selectedClip.trackId ?? selectedTrack?.id ?? trackOrder[0];
                onEditClipPattern(tid, selectedClip.patternId, false);
              }}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs cursor-pointer whitespace-nowrap shadow-[0_0_12px_rgba(16,185,129,0.25)]"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>EDIT BLOCK</span>
            </button>

            {daw.tracks[selectedClip.trackId ?? selectedTrack?.id ?? '']?.target === 'beatbox' && (
              <button
                type="button"
                onClick={() => {
                  const tid = selectedClip.trackId ?? selectedTrack?.id ?? trackOrder[0];
                  onEditClipPattern(tid, selectedClip.patternId, true);
                }}
                style={{ touchAction: 'manipulation' }}
                className="inline-flex items-center gap-1 px-2.5 h-10 rounded-lg bg-[#172033] border border-cyan-400/50 text-xs font-semibold text-cyan-200 cursor-pointer whitespace-nowrap"
              >
                <ListMusic className="w-3.5 h-3.5" />
                <span>Roll</span>
              </button>
            )}

            {/* Move Left / Right */}
            <div className="flex items-center bg-[#090C12] rounded-lg border border-[#2A364F] h-10 overflow-hidden">
              <button
                type="button"
                title="Move block 1 bar earlier"
                disabled={selectedClip.startBar <= 0}
                onClick={() =>
                  onUpdateClip(selectedClip.id, {
                    startBar: Math.max(0, selectedClip.startBar - 1),
                  })
                }
                className="w-9 h-full flex items-center justify-center text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="px-1.5 font-mono-num text-[11px] text-slate-300 border-x border-[#1E273A]">
                B{selectedClip.startBar + 1}
              </span>
              <button
                type="button"
                title="Move block 1 bar later"
                disabled={selectedClip.startBar + selectedClip.lengthBars >= totalBars}
                onClick={() =>
                  onUpdateClip(selectedClip.id, {
                    startBar: Math.min(
                      totalBars - selectedClip.lengthBars,
                      selectedClip.startBar + 1
                    ),
                  })
                }
                className="w-9 h-full flex items-center justify-center text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Resize Length */}
            <div className="flex items-center bg-[#090C12] rounded-lg border border-[#2A364F] h-10 overflow-hidden">
              <button
                type="button"
                title="Shorten block by 1 bar"
                disabled={selectedClip.lengthBars <= 1}
                onClick={() =>
                  onUpdateClip(selectedClip.id, {
                    lengthBars: Math.max(1, selectedClip.lengthBars - 1),
                  })
                }
                className="px-2 h-full font-mono-num text-xs font-bold text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
              >
                -1B
              </button>
              <button
                type="button"
                title="Extend block by 1 bar"
                disabled={
                  selectedClip.startBar + selectedClip.lengthBars >= totalBars ||
                  selectedClip.lengthBars >= 16
                }
                onClick={() =>
                  onUpdateClip(selectedClip.id, {
                    lengthBars: Math.min(
                      Math.min(16, totalBars - selectedClip.startBar),
                      selectedClip.lengthBars + 1
                    ),
                  })
                }
                className="px-2 h-full font-mono-num text-xs font-bold text-slate-300 hover:text-white border-l border-[#1E273A] disabled:opacity-30 cursor-pointer"
              >
                +1B
              </button>
            </div>

            <button
              type="button"
              title="Duplicate block as a new independent pattern variation"
              onClick={() => onDuplicateClipAsNewPattern(selectedClip.id)}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1 px-2.5 h-10 rounded-lg bg-[#172033] hover:bg-[#1E2B45] border border-[#2D3B56] text-xs font-semibold text-cyan-200 cursor-pointer whitespace-nowrap"
            >
              <CopyPlus className="w-3.5 h-3.5" />
              <span>Dup</span>
            </button>

            <button
              type="button"
              title="Copy block to paste elsewhere"
              onClick={() => setCopiedClip(selectedClip)}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1 px-2.5 h-10 rounded-lg bg-[#172033] hover:bg-[#1E2B45] border border-[#2D3B56] text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </button>

            <button
              type="button"
              title="Delete pattern block"
              onClick={() => onDeleteClip(selectedClip.id)}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1 px-2.5 h-10 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/50 text-xs font-semibold text-rose-200 cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Del</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>
              Tap any bar cell to place a pattern block · Tap a block twice or press{' '}
              <strong className="text-emerald-300">EDIT BLOCK</strong> to compose.
            </span>
            {selectedTrack && (
              <button
                type="button"
                onClick={() => onEditClipPattern(selectedTrack.id, activePatternForTrack, false)}
                style={{ touchAction: 'manipulation' }}
                className="inline-flex items-center gap-1 px-3 h-9 rounded-lg bg-[#172033] border border-emerald-400/50 text-xs font-display font-bold text-emerald-200 cursor-pointer whitespace-nowrap"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>EDIT {selectedTrack.shortName}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
