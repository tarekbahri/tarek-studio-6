import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Grid3X3,
  Layers,
  ListMusic,
} from 'lucide-react';
import {
  DAW_PATTERN_IDS,
  DAW_TRACK_ORDER,
  cloneDawPattern,
  createDawTrackFromTemplate,
  createEmptyDawPattern,
  createEmptyDawStep,
  getTimeSignatureInfo,
} from '../audio/dawPresets';
import { useDawStep, useIsPlaying } from '../audio/transportStore';
import type {
  AutomationLane,
  AutomationParamId,
  DawMidiNote,
  DawMidiOutputTarget,
  DawPattern,
  DawPlayMode,
  DawSequencerMode,
  DawSequencerState,
  DawSongClip,
  DawSongState,
  DawSubView,
  DawTrackConfig,
  DawTrackId,
  TimeSignatureId,
} from '../types/daw';
import type { SnapDivision } from '../types/sequencer';
import { DawAutomationEditor } from './sequencer/DawAutomationEditor';
import { DawCausticSequencer } from './sequencer/DawCausticSequencer';
import { DawDrumPatternEditor } from './sequencer/DawDrumPatternEditor';
import { DawSongMode } from './sequencer/DawSongMode';
import { DawStepSequencer } from './sequencer/DawStepSequencer';
import { UnifiedPianoRoll, type RollNote } from './UnifiedPianoRoll';

interface SequencerPluginProps {
  daw: DawSequencerState;
  timeSignature: TimeSignatureId;
  bpm: number;
  loop: boolean;
  isPlaying?: boolean;
  isRecording: boolean;
  dawStep?: number;
  isFullscreen: boolean;
  onChangeDaw: (updater: (prev: DawSequencerState) => DawSequencerState) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onToggleRecord: () => void;
  onChangeBpm: (bpm: number) => void;
  onToggleFullscreen: () => void;
}

const SUB_VIEWS: {
  id: DawSubView;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'steps', label: 'Step Sequencer', shortLabel: 'STEP SEQ', icon: Grid3X3 },
  { id: 'pianoroll', label: 'Piano Roll', shortLabel: 'PIANO ROLL', icon: ListMusic },
  { id: 'song', label: 'Song Mode', shortLabel: 'SONG MODE', icon: Layers },
  { id: 'automation', label: 'Automation', shortLabel: 'AUTOMATION', icon: Activity },
];

const SequencerPosBadge: React.FC<{
  timeSignature: TimeSignatureId;
  isPlayingProp?: boolean;
  dawStepProp?: number;
}> = React.memo(({ timeSignature, isPlayingProp, dawStepProp }) => {
  const storeIsPlaying = useIsPlaying();
  const storeDawStep = useDawStep();
  const isPlaying = isPlayingProp ?? storeIsPlaying;
  const dawStep = dawStepProp ?? storeDawStep;
  const tsInfo = getTimeSignatureInfo(timeSignature);

  const currentBar = Math.floor(dawStep / tsInfo.stepsPerBar) + 1;
  const currentBeat = Math.floor((dawStep % tsInfo.stepsPerBar) / tsInfo.stepsPerBeat) + 1;
  const currentStepInBeat = (Math.floor(dawStep) % tsInfo.stepsPerBeat) + 1;

  return (
    <div className="hidden sm:flex items-center gap-1 px-2 h-8 rounded-md bg-[#090C12] border border-[#242E40] font-mono-num text-[11px] text-slate-200">
      <span className={isPlaying ? 'text-emerald-300 font-semibold' : 'text-slate-400'}>
        {currentBar}.{currentBeat}.{currentStepInBeat}
      </span>
    </div>
  );
});

const SequencerPianoRollView: React.FC<{
  notes: RollNote[];
  totalSteps: number;
  bpm: number;
  loop: boolean;
  isPlayingProp?: boolean;
  isRecording: boolean;
  dawStepProp?: number;
  isFullscreen: boolean;
  patternOptions: { id: string; label: string; noteCount: number }[];
  activePatternId: string;
  dawOutputTarget: DawMidiOutputTarget;
  dawStepCount: 16 | 32 | 64;
  snapOverride: SnapDivision;
  dawPlayMode?: DawPlayMode;
  onChangeDawPlayMode?: (mode: DawPlayMode) => void;
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
  onChangeDawOutputTarget: (target: DawMidiOutputTarget) => void;
  onChangeDawStepCount: (steps: 16 | 32 | 64) => void;
  onChangeSnapOverride: (snap: SnapDivision) => void;
}> = React.memo((props) => {
  const storeIsPlaying = useIsPlaying();
  const storeDawStep = useDawStep();
  const isPlaying = props.isPlayingProp ?? storeIsPlaying;
  const dawStep = props.dawStepProp ?? storeDawStep;
  return (
    <UnifiedPianoRoll
      mode="sequencer"
      notes={props.notes}
      totalSteps={props.totalSteps}
      bpm={props.bpm}
      loop={props.loop}
      isPlaying={isPlaying}
      isRecording={props.isRecording}
      playheadStep={dawStep % props.totalSteps}
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
      dawOutputTarget={props.dawOutputTarget}
      onChangeDawOutputTarget={props.onChangeDawOutputTarget}
      dawStepCount={props.dawStepCount}
      onChangeDawStepCount={props.onChangeDawStepCount}
      snapOverride={props.snapOverride}
      onChangeSnapOverride={props.onChangeSnapOverride}
      dawPlayMode={props.dawPlayMode}
      onChangeDawPlayMode={props.onChangeDawPlayMode}
    />
  );
});

const ConnectedDawStepSequencer: React.FC<{
  pattern: DawPattern;
  trackOrder: DawTrackId[];
  tracks: Record<DawTrackId, DawTrackConfig>;
  isPlayingProp?: boolean;
  playMode: DawPlayMode;
  dawStepProp?: number;
  clipboardPattern: DawPattern | null;
  onUpdatePattern: (updater: (prev: DawPattern) => DawPattern) => void;
  onUpdateTrack: (trackId: DawTrackId, patch: Partial<DawTrackConfig>) => void;
  onCopyPattern: () => void;
  onPastePattern: () => void;
  onDuplicateToNextSlot: () => void;
}> = React.memo((props) => {
  const storeIsPlaying = useIsPlaying();
  const storeDawStep = useDawStep();
  return (
    <DawStepSequencer
      pattern={props.pattern}
      trackOrder={props.trackOrder}
      tracks={props.tracks}
      isPlaying={props.isPlayingProp ?? storeIsPlaying}
      playMode={props.playMode}
      dawStep={props.dawStepProp ?? storeDawStep}
      clipboardPattern={props.clipboardPattern}
      onUpdatePattern={props.onUpdatePattern}
      onUpdateTrack={props.onUpdateTrack}
      onCopyPattern={props.onCopyPattern}
      onPastePattern={props.onPastePattern}
      onDuplicateToNextSlot={props.onDuplicateToNextSlot}
    />
  );
});

const ConnectedDawSongMode: React.FC<{
  song: DawSongState;
  patterns: Record<string, DawPattern>;
  activePatternId: string;
  timeSignature: TimeSignatureId;
  isPlayingProp?: boolean;
  playMode: DawPlayMode;
  dawStepProp?: number;
  onUpdateSong: (updater: (prev: DawSongState) => DawSongState) => void;
  onSelectPattern: (patternId: string) => void;
  onSwitchPlayMode: (mode: DawPlayMode) => void;
}> = React.memo((props) => {
  const storeIsPlaying = useIsPlaying();
  const storeDawStep = useDawStep();
  return (
    <DawSongMode
      song={props.song}
      patterns={props.patterns}
      activePatternId={props.activePatternId}
      timeSignature={props.timeSignature}
      isPlaying={props.isPlayingProp ?? storeIsPlaying}
      playMode={props.playMode}
      dawStep={props.dawStepProp ?? storeDawStep}
      onUpdateSong={props.onUpdateSong}
      onSelectPattern={props.onSelectPattern}
      onSwitchPlayMode={props.onSwitchPlayMode}
    />
  );
});

const ConnectedDawAutomationEditor: React.FC<{
  lanes: Record<AutomationParamId, AutomationLane>;
  patternStepCount: number;
  songLengthSteps: number;
  songStartStep: number;
  playMode: DawPlayMode;
  isPlayingProp?: boolean;
  dawStepProp?: number;
  onUpdateLane: (
    paramId: AutomationParamId,
    updater: (prev: AutomationLane) => AutomationLane
  ) => void;
}> = React.memo((props) => {
  const storeIsPlaying = useIsPlaying();
  const storeDawStep = useDawStep();
  return (
    <DawAutomationEditor
      lanes={props.lanes}
      patternStepCount={props.patternStepCount}
      songLengthSteps={props.songLengthSteps}
      songStartStep={props.songStartStep}
      playMode={props.playMode}
      isPlaying={props.isPlayingProp ?? storeIsPlaying}
      dawStep={props.dawStepProp ?? storeDawStep}
      onUpdateLane={props.onUpdateLane}
    />
  );
});

function allocateTrackPattern(
  prev: DawSequencerState,
  trackId: DawTrackId,
  stepCount: 16 | 32 | 64 = 16
): { nextState: DawSequencerState; patternId: string } {
  const order =
    prev.trackOrder && prev.trackOrder.length > 0 ? prev.trackOrder : DAW_TRACK_ORDER;
  const track = prev.tracks[trackId];
  const short = track?.shortName ?? trackId.slice(0, 3).toUpperCase();
  const ownedCount = Object.values(prev.patterns).filter(
    (p) => p.ownerTrackId === trackId
  ).length;
  let num = ownedCount + 1;
  let newId = `${trackId}_P${num}`;
  while (prev.patterns[newId]) {
    num++;
    newId = `${trackId}_P${num}`;
  }
  const newPat = createEmptyDawPattern(
    newId,
    `${short} ${num}`,
    stepCount,
    prev.tracks,
    order
  );
  newPat.ownerTrackId = trackId;

  const nextState: DawSequencerState = {
    ...prev,
    activePatternId: newId,
    trackActivePattern: {
      ...(prev.trackActivePattern ?? {}),
      [trackId]: newId,
    },
    patterns: {
      ...prev.patterns,
      [newId]: newPat,
    },
  };
  return { nextState, patternId: newId };
}

export const SequencerPlugin: React.FC<SequencerPluginProps> = React.memo(({
  daw,
  timeSignature,
  bpm,
  loop,
  isPlaying: isPlayingProp,
  isRecording,
  dawStep: dawStepProp,
  isFullscreen,
  onChangeDaw,
  onTogglePlay,
  onStop,
  onToggleLoop,
  onToggleRecord,
  onChangeBpm,
  onToggleFullscreen,
}) => {
  const [subView, setSubView] = useState<DawSubView>('steps');
  const [clipboardPattern, setClipboardPattern] = useState<DawPattern | null>(null);

  const trackOrder =
    daw.trackOrder && daw.trackOrder.length > 0 ? daw.trackOrder : DAW_TRACK_ORDER;

  // Caustic 3 Easy-mode UI state (selected track, selected block, and active inline editor)
  const [selectedTrackId, setSelectedTrackId] = useState<DawTrackId>(
    () => trackOrder[0] ?? 'kick'
  );
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [editingContext, setEditingContext] = useState<{
    type: 'drum' | 'pianoroll';
    trackId: DawTrackId;
  } | null>(null);

  const seqMode: DawSequencerMode = daw.mode ?? 'easy';
  const safeSelectedTrackId = daw.tracks[selectedTrackId]
    ? selectedTrackId
    : trackOrder[0] ?? 'kick';
  const activePattern = daw.patterns[daw.activePatternId] ?? daw.patterns.P1;
  const tsInfo = getTimeSignatureInfo(timeSignature);

  const songLengthSteps = daw.song.loopSectionEnabled
    ? Math.max(1, daw.song.loopEndBar - daw.song.loopStartBar) * tsInfo.stepsPerBar
    : Math.max(1, daw.song.totalBars) * tsInfo.stepsPerBar;
  const songStartStep = daw.song.loopSectionEnabled
    ? daw.song.loopStartBar * tsInfo.stepsPerBar
    : 0;

  const handleUpdateActivePattern = (updater: (prev: DawPattern) => DawPattern) => {
    onChangeDaw((prev) => {
      const curr = prev.patterns[prev.activePatternId] ?? prev.patterns.P1;
      const updated = updater(curr);
      return {
        ...prev,
        patterns: {
          ...prev.patterns,
          [prev.activePatternId]: updated,
        },
      };
    });
  };

  const handleUpdateTrack = (trackId: DawTrackId, patch: Partial<DawTrackConfig>) => {
    onChangeDaw((prev) => ({
      ...prev,
      tracks: {
        ...prev.tracks,
        [trackId]: { ...prev.tracks[trackId], ...patch },
      },
    }));
  };

  const handleCopyPattern = () => {
    setClipboardPattern(cloneDawPattern(activePattern));
  };

  const handlePastePattern = () => {
    if (!clipboardPattern) return;
    handleUpdateActivePattern((prev) =>
      cloneDawPattern(clipboardPattern, prev.id, prev.name, prev.ownerTrackId)
    );
  };

  const handleDuplicateToNextSlot = () => {
    const currIdx = DAW_PATTERN_IDS.indexOf(daw.activePatternId);
    const nextIdx = (currIdx + 1) % DAW_PATTERN_IDS.length;
    const nextId = DAW_PATTERN_IDS[nextIdx];
    onChangeDaw((prev) => ({
      ...prev,
      activePatternId: nextId,
      patterns: {
        ...prev.patterns,
        [nextId]: cloneDawPattern(activePattern, nextId, `Pattern ${nextId.replace('P', '')}`),
      },
    }));
  };

  const handleUpdatePianoNotes = (
    updater: RollNote[] | ((prev: RollNote[]) => RollNote[])
  ) => {
    handleUpdateActivePattern((prev) => {
      const rawNext =
        typeof updater === 'function' ? updater(prev.pianoRollNotes) : updater;
      const dawNotes: DawMidiNote[] = rawNext.map((n) => ({
        id: n.id,
        midi: n.midi,
        step: n.step,
        duration: n.duration,
        velocity: n.velocity,
        target: n.target ?? daw.pianoRollTarget,
      }));
      return {
        ...prev,
        pianoRollNotes: dawNotes,
      };
    });
  };

  const allPatternKeys = useMemo(() => Object.keys(daw.patterns), [daw.patterns]);

  // Put track-owned patterns first when editing a specific track, followed by shared patterns
  const patternOptions = useMemo(() => {
    const editTid = editingContext?.trackId;
    const entries = allPatternKeys.map((pid) => ({
      id: pid,
      pat: daw.patterns[pid],
      label: daw.patterns[pid]?.name ?? pid,
      noteCount: daw.patterns[pid]?.pianoRollNotes.length ?? 0,
    }));

    if (!editTid) {
      return entries.map((e) => ({
        id: e.id,
        label: `${e.id} · ${e.pat?.stepCount ?? 16}s`,
        noteCount: e.noteCount,
      }));
    }

    const owned = entries.filter((e) => e.pat?.ownerTrackId === editTid);
    const shared = entries.filter((e) => !e.pat?.ownerTrackId);
    const rest = entries.filter(
      (e) => e.pat?.ownerTrackId && e.pat.ownerTrackId !== editTid
    );
    return [...owned, ...shared, ...rest].map((e) => ({
      id: e.id,
      label: `${e.label} (${e.pat?.stepCount ?? 16}s)`,
      noteCount: e.noteCount,
    }));
  }, [allPatternKeys, daw.patterns, editingContext]);

  const handleCreatePattern = () => {
    onChangeDaw((prev) => {
      if (editingContext?.trackId) {
        return allocateTrackPattern(prev, editingContext.trackId, 16).nextState;
      }
      const emptyExisting = Object.keys(prev.patterns).find((pid) => {
        const p = prev.patterns[pid];
        if (!p) return false;
        const hasRoll = p.pianoRollNotes.length > 0;
        const hasSteps = Object.values(p.tracks).some((row) => row.some((s) => s.active));
        return !hasRoll && !hasSteps;
      });
      if (emptyExisting) {
        return { ...prev, activePatternId: emptyExisting };
      }
      let num = Object.keys(prev.patterns).length + 1;
      while (prev.patterns[`P${num}`]) num++;
      const newId = `P${num}`;
      return {
        ...prev,
        activePatternId: newId,
        patterns: {
          ...prev.patterns,
          [newId]: createEmptyDawPattern(
            newId,
            `Pattern ${num}`,
            16,
            prev.tracks,
            prev.trackOrder ?? DAW_TRACK_ORDER
          ),
        },
      };
    });
  };

  const handleAddTrack = (templateId: string) => {
    let createdId: DawTrackId = templateId;
    onChangeDaw((prev) => {
      const currentOrder =
        prev.trackOrder && prev.trackOrder.length > 0 ? prev.trackOrder : DAW_TRACK_ORDER;
      const newTrack = createDawTrackFromTemplate(templateId, currentOrder);
      createdId = newTrack.id;
      const nextTracks: Record<DawTrackId, DawTrackConfig> = {
        ...prev.tracks,
        [newTrack.id]: newTrack,
      };
      const nextOrder = [...currentOrder, newTrack.id];
      const nextPatterns: Record<string, DawPattern> = {};
      for (const [pid, pat] of Object.entries(prev.patterns)) {
        nextPatterns[pid] = {
          ...pat,
          tracks: {
            ...pat.tracks,
            [newTrack.id]: Array.from({ length: 64 }, () =>
              createEmptyDawStep(newTrack.defaultNote)
            ),
          },
        };
      }
      return {
        ...prev,
        trackOrder: nextOrder,
        tracks: nextTracks,
        patterns: nextPatterns,
      };
    });
    setSelectedTrackId(createdId);
  };

  const handleRemoveTrack = (trackId: DawTrackId) => {
    onChangeDaw((prev) => {
      const currentOrder =
        prev.trackOrder && prev.trackOrder.length > 0 ? prev.trackOrder : DAW_TRACK_ORDER;
      if (currentOrder.length <= 1) return prev;
      const nextOrder = currentOrder.filter((id) => id !== trackId);
      const nextTracks = { ...prev.tracks };
      delete nextTracks[trackId];
      const nextPatterns: Record<string, DawPattern> = {};
      for (const [pid, pat] of Object.entries(prev.patterns)) {
        const pt = { ...pat.tracks };
        delete pt[trackId];
        nextPatterns[pid] = { ...pat, tracks: pt };
      }
      const nextClips = prev.song.clips.filter((c) => c.trackId !== trackId);
      return {
        ...prev,
        trackOrder: nextOrder,
        tracks: nextTracks,
        patterns: nextPatterns,
        song: {
          ...prev.song,
          clips: nextClips,
        },
      };
    });
    if (safeSelectedTrackId === trackId) {
      const fallback = trackOrder.find((id) => id !== trackId) ?? 'kick';
      setSelectedTrackId(fallback);
    }
    setSelectedClipId(null);
  };

  // Caustic Timeline Handlers
  const handlePlaceOrSelectTrackClip = (trackId: DawTrackId, barIdx: number) => {
    const newClipId = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onChangeDaw((prev) => {
      const order =
        prev.trackOrder && prev.trackOrder.length > 0 ? prev.trackOrder : DAW_TRACK_ORDER;
      const existingAtBar = prev.song.clips.find(
        (c) =>
          (c.trackId ?? order[c.lane]) === trackId &&
          barIdx >= c.startBar &&
          barIdx < c.startBar + c.lengthBars
      );
      if (existingAtBar) {
        return prev;
      }

      let nextState = prev;
      let patId = prev.trackActivePattern?.[trackId];
      if (!patId || !prev.patterns[patId]) {
        const owned = Object.values(prev.patterns).find((p) => p.ownerTrackId === trackId);
        if (owned) {
          patId = owned.id;
        } else {
          const allocated = allocateTrackPattern(prev, trackId, 16);
          nextState = allocated.nextState;
          patId = allocated.patternId;
        }
      }

      const pat = nextState.patterns[patId];
      const patBars = pat ? Math.max(1, Math.round(pat.stepCount / 16)) : 1;
      const laneIdx = Math.max(0, order.indexOf(trackId));
      const newClip: DawSongClip = {
        id: newClipId,
        lane: laneIdx,
        trackId,
        patternId: patId,
        startBar: barIdx,
        lengthBars: Math.min(patBars, Math.max(1, nextState.song.totalBars - barIdx)),
      };

      return {
        ...nextState,
        playMode: 'song',
        activePatternId: patId,
        trackActivePattern: {
          ...(nextState.trackActivePattern ?? {}),
          [trackId]: patId,
        },
        song: {
          ...nextState.song,
          clips: [...nextState.song.clips, newClip],
        },
      };
    });
    setSelectedTrackId(trackId);
    setSelectedClipId(newClipId);
  };

  const handleUpdateClip = (clipId: string, patch: Partial<DawSongClip>) => {
    onChangeDaw((prev) => ({
      ...prev,
      song: {
        ...prev.song,
        clips: prev.song.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
      },
    }));
  };

  const handleDuplicateClipAsNewPattern = (clipId: string) => {
    const newClipId = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onChangeDaw((prev) => {
      const order =
        prev.trackOrder && prev.trackOrder.length > 0 ? prev.trackOrder : DAW_TRACK_ORDER;
      const srcClip = prev.song.clips.find((c) => c.id === clipId);
      if (!srcClip) return prev;
      const resolvedTid = srcClip.trackId ?? order[srcClip.lane] ?? order[0];
      const srcPat = prev.patterns[srcClip.patternId] ?? prev.patterns.P1;
      const track = prev.tracks[resolvedTid];
      const short = track?.shortName ?? resolvedTid.slice(0, 3).toUpperCase();

      let num =
        Object.values(prev.patterns).filter((p) => p.ownerTrackId === resolvedTid).length + 1;
      let newPatId = `${resolvedTid}_P${num}`;
      while (prev.patterns[newPatId]) {
        num++;
        newPatId = `${resolvedTid}_P${num}`;
      }
      const clonedPat = cloneDawPattern(srcPat, newPatId, `${short} ${num}`, resolvedTid);

      // Place duplicated variation immediately after source clip (or wrap cleanly)
      let targetBar = srcClip.startBar + srcClip.lengthBars;
      let nextTotalBars = prev.song.totalBars;
      if (targetBar + srcClip.lengthBars > nextTotalBars) {
        nextTotalBars = Math.min(64, targetBar + srcClip.lengthBars);
      }
      if (targetBar >= nextTotalBars) {
        targetBar = Math.max(0, nextTotalBars - srcClip.lengthBars);
      }

      const dupClip: DawSongClip = {
        id: newClipId,
        lane: Math.max(0, order.indexOf(resolvedTid)),
        trackId: resolvedTid,
        patternId: newPatId,
        startBar: targetBar,
        lengthBars: srcClip.lengthBars,
      };

      return {
        ...prev,
        activePatternId: newPatId,
        trackActivePattern: {
          ...(prev.trackActivePattern ?? {}),
          [resolvedTid]: newPatId,
        },
        patterns: {
          ...prev.patterns,
          [newPatId]: clonedPat,
        },
        song: {
          ...prev.song,
          totalBars: nextTotalBars,
          clips: [...prev.song.clips, dupClip],
        },
      };
    });
    setSelectedClipId(newClipId);
  };

  const handlePasteClipToBar = (
    clipToPaste: DawSongClip,
    targetTrackId: DawTrackId,
    startBar: number
  ) => {
    const newClipId = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onChangeDaw((prev) => {
      const order =
        prev.trackOrder && prev.trackOrder.length > 0 ? prev.trackOrder : DAW_TRACK_ORDER;
      const safeBar = Math.max(0, Math.min(prev.song.totalBars - 1, startBar));
      const newClip: DawSongClip = {
        id: newClipId,
        lane: Math.max(0, order.indexOf(targetTrackId)),
        trackId: targetTrackId,
        patternId: clipToPaste.patternId,
        startBar: safeBar,
        lengthBars: Math.min(clipToPaste.lengthBars, prev.song.totalBars - safeBar),
      };
      return {
        ...prev,
        playMode: 'song',
        song: {
          ...prev.song,
          clips: [...prev.song.clips, newClip],
        },
      };
    });
    setSelectedClipId(newClipId);
  };

  const handleDeleteClip = (clipId: string) => {
    onChangeDaw((prev) => ({
      ...prev,
      song: {
        ...prev.song,
        clips: prev.song.clips.filter((c) => c.id !== clipId),
      },
    }));
    if (selectedClipId === clipId) {
      setSelectedClipId(null);
    }
  };

  const handleCreateTrackPattern = (trackId: DawTrackId) => {
    onChangeDaw((prev) => {
      const allocated = allocateTrackPattern(prev, trackId, 16);
      // If a clip on this track is selected, assign the newly created pattern to it too
      if (selectedClipId) {
        const clip = prev.song.clips.find((c) => c.id === selectedClipId);
        if (clip && (clip.trackId ?? trackOrder[clip.lane]) === trackId) {
          return {
            ...allocated.nextState,
            song: {
              ...allocated.nextState.song,
              clips: allocated.nextState.song.clips.map((c) =>
                c.id === selectedClipId ? { ...c, patternId: allocated.patternId } : c
              ),
            },
          };
        }
      }
      return allocated.nextState;
    });
  };

  const handleAssignTrackPattern = (
    trackId: DawTrackId,
    patternId: string,
    clipId?: string | null
  ) => {
    onChangeDaw((prev) => ({
      ...prev,
      activePatternId: patternId,
      trackActivePattern: {
        ...(prev.trackActivePattern ?? {}),
        [trackId]: patternId,
      },
      song: clipId
        ? {
            ...prev.song,
            clips: prev.song.clips.map((c) =>
              c.id === clipId ? { ...c, patternId } : c
            ),
          }
        : prev.song,
    }));
  };

  const handleEditClipPattern = (
    trackId: DawTrackId,
    patternId: string,
    forcePianoRoll = false
  ) => {
    const cfg = daw.tracks[trackId];
    const target: DawMidiOutputTarget = cfg?.target ?? 'serum';
    onChangeDaw((prev) => ({
      ...prev,
      activePatternId: prev.patterns[patternId] ? patternId : prev.activePatternId,
      pianoRollTarget: target,
      playMode: 'pattern',
      trackActivePattern: {
        ...(prev.trackActivePattern ?? {}),
        [trackId]: patternId,
      },
    }));
    setSelectedTrackId(trackId);
    setEditingContext({
      type: !forcePianoRoll && target === 'beatbox' ? 'drum' : 'pianoroll',
      trackId,
    });
  };

  const handleBackToCausticTimeline = () => {
    setEditingContext(null);
    onChangeDaw((prev) => ({
      ...prev,
      playMode: prev.song.clips.length > 0 ? 'song' : prev.playMode,
    }));
  };

  const handleExtendBars = () => {
    onChangeDaw((prev) => ({
      ...prev,
      song: {
        ...prev.song,
        totalBars: Math.min(64, prev.song.totalBars + 4),
      },
    }));
  };

  const handleSetMode = (mode: DawSequencerMode) => {
    setEditingContext(null);
    onChangeDaw((prev) => ({
      ...prev,
      mode,
      playMode:
        mode === 'easy' && prev.song.clips.length > 0 ? 'song' : prev.playMode,
    }));
    if (mode === 'easy' && subView !== 'steps' && subView !== 'pianoroll') {
      setSubView('steps');
    }
  };

  const handleDuplicateRollPattern = () => {
    onChangeDaw((prev) => {
      const src = prev.patterns[prev.activePatternId] ?? prev.patterns.P1;
      if (editingContext?.trackId) {
        const tid = editingContext.trackId;
        const track = prev.tracks[tid];
        const short = track?.shortName ?? tid.slice(0, 3).toUpperCase();
        let num = Object.values(prev.patterns).filter((p) => p.ownerTrackId === tid).length + 1;
        let nextId = `${tid}_P${num}`;
        while (prev.patterns[nextId]) {
          num++;
          nextId = `${tid}_P${num}`;
        }
        return {
          ...prev,
          activePatternId: nextId,
          trackActivePattern: {
            ...(prev.trackActivePattern ?? {}),
            [tid]: nextId,
          },
          patterns: {
            ...prev.patterns,
            [nextId]: cloneDawPattern(src, nextId, `${short} ${num}`, tid),
          },
        };
      }
      let num = Object.keys(prev.patterns).length + 1;
      while (prev.patterns[`P${num}`]) num++;
      const nextId = `P${num}`;
      return {
        ...prev,
        activePatternId: nextId,
        patterns: {
          ...prev.patterns,
          [nextId]: cloneDawPattern(src, nextId, `Pattern ${num}`),
        },
      };
    });
  };

  const handleDeleteRollPattern = () => {
    onChangeDaw((prev) => {
      const keys = Object.keys(prev.patterns);
      const isBaseSlot = DAW_PATTERN_IDS.includes(prev.activePatternId);
      if (keys.length <= 1 || isBaseSlot) {
        const curr = prev.patterns[prev.activePatternId];
        if (!curr) return prev;
        return {
          ...prev,
          patterns: {
            ...prev.patterns,
            [prev.activePatternId]: { ...curr, pianoRollNotes: [] },
          },
        };
      }
      const nextPatterns = { ...prev.patterns };
      delete nextPatterns[prev.activePatternId];
      const remaining = Object.keys(nextPatterns);
      const fallbackId = remaining[0] ?? 'P1';
      return {
        ...prev,
        activePatternId: fallbackId,
        patterns: nextPatterns,
        song: {
          ...prev.song,
          clips: prev.song.clips.filter((c) => c.patternId !== prev.activePatternId),
        },
      };
    });
  };

  const handleClearDrumPattern = () => {
    if (!editingContext) return;
    const tid = editingContext.trackId;
    handleUpdateActivePattern((prev) => {
      const nextTracks = { ...prev.tracks };
      for (const k of Object.keys(nextTracks)) {
        if (k === tid || k.startsWith(`${tid}:`)) {
          nextTracks[k] = Array.from({ length: 64 }, () =>
            createEmptyDawStep(daw.tracks[tid]?.defaultNote ?? 36)
          );
        }
      }
      return { ...prev, tracks: nextTracks };
    });
  };

  const handleUpdateSong = (updater: (prev: DawSongState) => DawSongState) => {
    onChangeDaw((prev) => ({
      ...prev,
      song: updater(prev.song),
    }));
  };

  const handleUpdateAutomation = (
    paramId: AutomationParamId,
    updater: (prev: AutomationLane) => AutomationLane
  ) => {
    onChangeDaw((prev) => ({
      ...prev,
      automationLanes: {
        ...prev.automationLanes,
        [paramId]: updater(prev.automationLanes[paramId]),
      },
    }));
  };

  const handleSwitchPlayMode = (playMode: DawPlayMode) => {
    onChangeDaw((prev) => ({ ...prev, playMode }));
  };

  // In Caustic Easy Mode when editing a melodic pattern -> show fullscreen Piano Roll cleanly
  if (seqMode === 'easy' && editingContext?.type === 'pianoroll') {
    return (
      <SequencerPianoRollView
        notes={activePattern.pianoRollNotes}
        totalSteps={activePattern.stepCount}
        bpm={bpm}
        loop={loop}
        isPlayingProp={isPlayingProp}
        isRecording={isRecording}
        dawStepProp={dawStepProp}
        isFullscreen={isFullscreen}
        onBack={handleBackToCausticTimeline}
        onToggleFullscreen={onToggleFullscreen}
        onTogglePlay={onTogglePlay}
        onStop={onStop}
        onToggleLoop={onToggleLoop}
        onToggleRecord={onToggleRecord}
        onChangeBpm={onChangeBpm}
        onUpdateNotes={handleUpdatePianoNotes}
        patternOptions={patternOptions}
        activePatternId={activePattern.id}
        onSelectPattern={(pid) =>
          handleAssignTrackPattern(editingContext.trackId, pid, selectedClipId)
        }
        onCreatePattern={handleCreatePattern}
        onDuplicatePattern={handleDuplicateRollPattern}
        onDeletePattern={handleDeleteRollPattern}
        dawOutputTarget={daw.pianoRollTarget}
        onChangeDawOutputTarget={(pianoRollTarget: DawMidiOutputTarget) =>
          onChangeDaw((prev) => ({ ...prev, pianoRollTarget }))
        }
        dawStepCount={activePattern.stepCount}
        onChangeDawStepCount={(stepCount) =>
          handleUpdateActivePattern((prev) => ({ ...prev, stepCount }))
        }
        snapOverride={daw.snap}
        onChangeSnapOverride={(snap: SnapDivision) =>
          onChangeDaw((prev) => ({ ...prev, snap }))
        }
        dawPlayMode={daw.playMode}
        onChangeDawPlayMode={handleSwitchPlayMode}
      />
    );
  }

  // In Caustic Easy Mode -> clean workspace without redundant outer chrome
  if (seqMode === 'easy') {
    const editingTrack = editingContext
      ? daw.tracks[editingContext.trackId] ?? daw.tracks[safeSelectedTrackId]
      : undefined;

    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[#0B0E14] p-1.5 sm:p-2.5">
        <div className="max-w-[1600px] mx-auto w-full h-full flex flex-col min-h-0">
          {editingContext?.type === 'drum' && editingTrack ? (
            <DawDrumPatternEditor
              track={editingTrack}
              pattern={activePattern}
              patternOptions={patternOptions.map((o) => ({ id: o.id, label: o.label }))}
              playMode={daw.playMode}
              bpm={bpm}
              loop={loop}
              isPlaying={isPlayingProp}
              dawStep={dawStepProp}
              onBack={handleBackToCausticTimeline}
              onOpenPianoRoll={() =>
                setEditingContext({ type: 'pianoroll', trackId: editingTrack.id })
              }
              onSelectPattern={(pid) =>
                handleAssignTrackPattern(editingTrack.id, pid, selectedClipId)
              }
              onCreatePattern={handleCreatePattern}
              onDuplicatePattern={handleDuplicateRollPattern}
              onClearPattern={handleClearDrumPattern}
              onUpdatePattern={handleUpdateActivePattern}
              onChangePlayMode={handleSwitchPlayMode}
              onTogglePlay={onTogglePlay}
              onStop={onStop}
              onToggleLoop={onToggleLoop}
              onChangeBpm={onChangeBpm}
            />
          ) : (
            <DawCausticSequencer
              daw={daw}
              timeSignature={timeSignature}
              bpm={bpm}
              loop={loop}
              isPlaying={isPlayingProp}
              dawStep={dawStepProp}
              selectedTrackId={safeSelectedTrackId}
              selectedClipId={selectedClipId}
              onSelectTrack={setSelectedTrackId}
              onSelectClip={setSelectedClipId}
              onUpdateTrack={handleUpdateTrack}
              onAddTrack={handleAddTrack}
              onRemoveTrack={handleRemoveTrack}
              onPlaceOrSelectTrackClip={handlePlaceOrSelectTrackClip}
              onUpdateClip={handleUpdateClip}
              onDuplicateClipAsNewPattern={handleDuplicateClipAsNewPattern}
              onPasteClipToBar={handlePasteClipToBar}
              onDeleteClip={handleDeleteClip}
              onCreateTrackPattern={handleCreateTrackPattern}
              onAssignTrackPattern={handleAssignTrackPattern}
              onEditClipPattern={handleEditClipPattern}
              onExtendBars={handleExtendBars}
              onTogglePlay={onTogglePlay}
              onStop={onStop}
              onToggleLoop={onToggleLoop}
              onChangeBpm={onChangeBpm}
              onSwitchPlayMode={handleSwitchPlayMode}
              onOpenAdvanced={() => handleSetMode('pro')}
            />
          )}
        </div>
      </div>
    );
  }

  // PRO / ADVANCED MODE (16/32/64 step grid, Swing/Prob, Pro Song Markers, Automation)
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[#0B0E14]">
      {subView !== 'pianoroll' && (
        <div className="flex items-center justify-between gap-1.5 sm:gap-2.5 px-2 sm:px-3.5 h-11 bg-[#111622] border-b border-[#242E40] shrink-0 overflow-x-auto synth-scroll">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleSetMode('easy')}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/60 text-emerald-200 font-display font-bold text-[11px] cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>CAUSTIC VIEW</span>
            </button>

            <span className="font-display text-xs font-bold tracking-tight text-cyan-300 whitespace-nowrap">
              ADVANCED
            </span>

            <nav
              aria-label="Sequencer Views"
              className="flex items-center gap-1 bg-[#090C12] p-0.5 rounded-lg border border-[#2C3A52]"
            >
              {SUB_VIEWS.map((view) => {
                const active = subView === view.id;
                const Icon = view.icon;
                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setSubView(view.id)}
                    aria-pressed={active}
                    style={{ touchAction: 'manipulation' }}
                    className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-emerald-500/20 text-white border border-emerald-400/70'
                        : 'text-slate-300 hover:text-white border border-transparent'
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        active ? 'text-emerald-300' : 'text-slate-400'
                      }`}
                    />
                    <span className="lg:hidden">{view.shortLabel}</span>
                    <span className="hidden lg:inline">{view.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <select
              aria-label="Active Sequencer Pattern"
              value={daw.activePatternId}
              onChange={(e) =>
                onChangeDaw((prev) => ({ ...prev, activePatternId: e.target.value }))
              }
              className="h-8 px-2 rounded-md bg-[#090C12] border border-[#263042] text-xs font-mono-num font-semibold text-cyan-300 focus:outline-none focus:border-cyan-400"
            >
              {allPatternKeys.map((pid) => (
                <option key={pid} value={pid}>
                  {daw.patterns[pid]?.name ?? pid} · {daw.patterns[pid]?.stepCount ?? 16}s
                </option>
              ))}
            </select>

            <div className="flex items-center gap-0.5 bg-[#090C12] p-0.5 rounded-md border border-[#263042]">
              {(['pattern', 'song'] as DawPlayMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={daw.playMode === mode}
                  onClick={() => handleSwitchPlayMode(mode)}
                  className={`px-2.5 h-7 rounded text-[11px] font-display font-bold uppercase cursor-pointer transition-colors ${
                    daw.playMode === mode
                      ? mode === 'song'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <SequencerPosBadge
              timeSignature={timeSignature}
              isPlayingProp={isPlayingProp}
              dawStepProp={dawStepProp}
            />
          </div>
        </div>
      )}

      <main
        className={`flex-1 min-h-0 overflow-hidden ${
          subView === 'pianoroll' ? '' : 'p-1.5 sm:p-2.5'
        }`}
      >
        <div className={`${subView === 'pianoroll' ? 'h-full' : 'max-w-[1600px] mx-auto h-full'}`}>
          {subView === 'pianoroll' ? (
            <SequencerPianoRollView
              notes={activePattern.pianoRollNotes}
              totalSteps={activePattern.stepCount}
              bpm={bpm}
              loop={loop}
              isPlayingProp={isPlayingProp}
              isRecording={isRecording}
              dawStepProp={dawStepProp}
              isFullscreen={isFullscreen}
              onBack={() => setSubView('steps')}
              onToggleFullscreen={onToggleFullscreen}
              onTogglePlay={onTogglePlay}
              onStop={onStop}
              onToggleLoop={onToggleLoop}
              onToggleRecord={onToggleRecord}
              onChangeBpm={onChangeBpm}
              onUpdateNotes={handleUpdatePianoNotes}
              patternOptions={patternOptions}
              activePatternId={activePattern.id}
              onSelectPattern={(activePatternId) =>
                onChangeDaw((prev) => ({ ...prev, activePatternId }))
              }
              onCreatePattern={handleCreatePattern}
              onDuplicatePattern={handleDuplicateRollPattern}
              onDeletePattern={handleDeleteRollPattern}
              dawOutputTarget={daw.pianoRollTarget}
              onChangeDawOutputTarget={(pianoRollTarget: DawMidiOutputTarget) =>
                onChangeDaw((prev) => ({ ...prev, pianoRollTarget }))
              }
              dawStepCount={activePattern.stepCount}
              onChangeDawStepCount={(stepCount) =>
                handleUpdateActivePattern((prev) => ({ ...prev, stepCount }))
              }
              snapOverride={daw.snap}
              onChangeSnapOverride={(snap: SnapDivision) =>
                onChangeDaw((prev) => ({ ...prev, snap }))
              }
              dawPlayMode={daw.playMode}
              onChangeDawPlayMode={handleSwitchPlayMode}
            />
          ) : (
            <>
              {subView === 'steps' && (
                <ConnectedDawStepSequencer
                  pattern={activePattern}
                  trackOrder={trackOrder}
                  tracks={daw.tracks}
                  isPlayingProp={isPlayingProp}
                  playMode={daw.playMode}
                  dawStepProp={dawStepProp}
                  clipboardPattern={clipboardPattern}
                  onUpdatePattern={handleUpdateActivePattern}
                  onUpdateTrack={handleUpdateTrack}
                  onCopyPattern={handleCopyPattern}
                  onPastePattern={handlePastePattern}
                  onDuplicateToNextSlot={handleDuplicateToNextSlot}
                />
              )}

              {subView === 'song' && (
                <ConnectedDawSongMode
                  song={daw.song}
                  patterns={daw.patterns}
                  activePatternId={daw.activePatternId}
                  timeSignature={timeSignature}
                  isPlayingProp={isPlayingProp}
                  playMode={daw.playMode}
                  dawStepProp={dawStepProp}
                  onUpdateSong={handleUpdateSong}
                  onSelectPattern={(activePatternId: string) =>
                    onChangeDaw((prev) => ({ ...prev, activePatternId }))
                  }
                  onSwitchPlayMode={handleSwitchPlayMode}
                />
              )}

              {subView === 'automation' && (
                <ConnectedDawAutomationEditor
                  lanes={daw.automationLanes}
                  patternStepCount={activePattern.stepCount}
                  songLengthSteps={songLengthSteps}
                  songStartStep={songStartStep}
                  playMode={daw.playMode}
                  isPlayingProp={isPlayingProp}
                  dawStepProp={dawStepProp}
                  onUpdateLane={handleUpdateAutomation}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
});
