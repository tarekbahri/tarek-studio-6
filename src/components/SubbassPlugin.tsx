import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  ListMusic,
  Play,
  Plus,
  Save,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import { midiBus } from '../audio/MidiBus';
import { studioAudio } from '../audio/StudioAudio';
import { subbassEngine } from '../audio/SubbassEngine';
import { useIsPlaying, usePlayheadStep } from '../audio/transportStore';
import {
  SUBBASS_FACTORY_PRESETS,
  createDefaultSubbassFxConfig,
  deleteUserSubbassPreset,
  loadUserSubbassPresets,
  presetToSubbassPatch,
  saveUserSubbassPreset,
} from '../audio/subbassPresets';
import type { StudioRoutingConfig } from '../types/beatbox';
import type { MidiNote } from '../types/sequencer';
import type {
  SubbassFxConfig,
  SubbassOctave,
  SubbassPatch,
  SubbassPhaseDeg,
  SubbassPreset,
  SubbassSequencerState,
} from '../types/subbass';
import type { ModularFxInstance } from '../types/fx';
import { FxDeviceRack } from './fx/FxDeviceRack';
import { PluginChannelStrip } from './PluginChannelStrip';
import { SpectrumAnalyzer } from './SpectrumAnalyzer';
import { SubbassFxRack } from './SubbassFxRack';
import { SubbassKnob } from './SubbassKnob';
import { SubbassWaveform } from './SubbassWaveform';
import { UnifiedPianoRoll, type RollNote } from './UnifiedPianoRoll';

interface SubbassPluginProps {
  patch: SubbassPatch;
  seqState: SubbassSequencerState;
  routing: StudioRoutingConfig;
  bpm: number;
  loop: boolean;
  isPlaying?: boolean;
  isRecording: boolean;
  playheadStep?: number;
  isFullscreen: boolean;
  onChangePatch: (updater: (prev: SubbassPatch) => SubbassPatch) => void;
  onChangeSeqState: (
    updater: (prev: SubbassSequencerState) => SubbassSequencerState
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

const SubbassQuickTransport: React.FC<{
  bpm: number;
  isPlayingProp?: boolean;
  onTogglePlay: () => void;
}> = React.memo(({ bpm, isPlayingProp, onTogglePlay }) => {
  const storeIsPlaying = useIsPlaying();
  const isPlaying = isPlayingProp ?? storeIsPlaying;
  return (
    <div className="flex items-center gap-1 bg-[#0E1116] p-0.5 rounded-md border border-[#2D3442] shrink-0">
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={isPlaying ? 'Stop Playback' : 'Play Playback'}
        style={{ touchAction: 'manipulation' }}
        className={`w-7 h-7 rounded flex items-center justify-center cursor-pointer transition-colors ${
          isPlaying
            ? 'bg-[#2EE59D] text-slate-950'
            : 'bg-[#191D24] text-[#2EE59D] hover:bg-[#2EE59D]/20'
        }`}
      >
        {isPlaying ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
      </button>
      <span className="px-1.5 font-mono-num text-[10.5px] text-amber-300 font-semibold whitespace-nowrap">
        {bpm} BPM
      </span>
    </div>
  );
});

const SubbassPianoRollView: React.FC<{
  notes: RollNote[];
  bpm: number;
  loop: boolean;
  isPlayingProp?: boolean;
  isRecording: boolean;
  playheadStepProp?: number;
  isFullscreen: boolean;
  showKeyboard: boolean;
  patternOptions: { id: string; label: string; noteCount: number }[];
  activePatternId: string;
  onBack: () => void;
  onToggleFullscreen: () => void;
  onToggleKeyboard: () => void;
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
}> = React.memo((props) => {
  const storeIsPlaying = useIsPlaying();
  const storePlayheadStep = usePlayheadStep();
  return (
    <UnifiedPianoRoll
      mode="subbass"
      notes={props.notes}
      totalSteps={16}
      bpm={props.bpm}
      loop={props.loop}
      isPlaying={props.isPlayingProp ?? storeIsPlaying}
      isRecording={props.isRecording}
      playheadStep={props.playheadStepProp ?? storePlayheadStep}
      isFullscreen={props.isFullscreen}
      showKeyboardColumn={props.showKeyboard}
      onToggleKeyboardColumn={props.onToggleKeyboard}
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
    />
  );
});

interface KeyDef {
  midi: number;
  noteName: string;
  isBlack: boolean;
  whiteIndex: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

const QWERTY_MAP: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, ',': 12,
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23, i: 24,
};

export const SubbassPlugin: React.FC<SubbassPluginProps> = React.memo(({
  patch,
  seqState,
  routing,
  bpm,
  loop,
  isPlaying: isPlayingProp,
  isRecording,
  playheadStep: playheadStepProp,
  isFullscreen,
  onChangePatch,
  onChangeSeqState,
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
  const [activeSubView, setActiveSubView] = useState<'synth' | 'fx'>('synth');
  const [showPianoRoll, setShowPianoRoll] = useState<boolean>(initialPianoRoll);
  const [showDeviceRack, setShowDeviceRack] = useState<boolean>(false);
  const [userPresets, setUserPresets] = useState<SubbassPreset[]>(() =>
    loadUserSubbassPresets()
  );

  useEffect(() => {
    if (initialPianoRoll) {
      setShowPianoRoll(true);
    }
  }, [initialPianoRoll]);
  const [savingOpen, setSavingOpen] = useState<boolean>(false);
  const [presetNameInput, setPresetNameInput] = useState<string>('');

  // Persistable SUBSYNTH piano keyboard visibility (hides/shows without stopping audio)
  const keyboardVisible = seqState.showKeyboard !== false;
  const handleToggleKeyboard = useCallback(() => {
    onChangeSeqState((prev) => ({
      ...prev,
      showKeyboard: prev.showKeyboard === false ? true : false,
    }));
  }, [onChangeSeqState]);

  // 2-octave keyboard state (default C1..C3, ideal bass range)
  const [baseOctave, setBaseOctave] = useState<number>(1);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [seqLitMidi, setSeqLitMidi] = useState<number | null>(null);

  const pointerNotesRef = useRef<Map<number, number>>(new Map());
  const qwertyNotesRef = useRef<Map<string, number>>(new Map());
  const seqFlashTimerRef = useRef<number | null>(null);

  const allPresets = useMemo(
    () => [...SUBBASS_FACTORY_PRESETS, ...userPresets],
    [userPresets]
  );

  const isUserPreset = useMemo(
    () => userPresets.some((p) => p.id === patch.presetId),
    [userPresets, patch.presetId]
  );

  const currentPresetIdx = useMemo(() => {
    const idx = allPresets.findIndex((p) => p.id === patch.presetId);
    return idx >= 0 ? idx : 0;
  }, [allPresets, patch.presetId]);

  const activeFx = useMemo(
    () => patch.fx ?? createDefaultSubbassFxConfig(),
    [patch.fx]
  );

  const enabledFxCount = useMemo(
    () => activeFx.order.filter((id) => activeFx[id].enabled).length,
    [activeFx]
  );

  const handleChangeFx = useCallback(
    (updater: (prev: SubbassFxConfig) => SubbassFxConfig) => {
      onChangePatch((prev) => ({
        ...prev,
        fx: updater(prev.fx ?? createDefaultSubbassFxConfig()),
      }));
    },
    [onChangePatch]
  );

  const handleSelectPreset = (preset: SubbassPreset) => {
    studioAudio.unlockSync();
    void subbassEngine.ensureAudio();
    onChangePatch((prev) => presetToSubbassPatch(preset, prev.fx));
  };

  const handleStepPreset = (dir: -1 | 1) => {
    const nextIdx = (currentPresetIdx + dir + allPresets.length) % allPresets.length;
    handleSelectPreset(allPresets[nextIdx]);
  };

  const handleSavePreset = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = presetNameInput.trim() || `${patch.name} Custom`;
    const updated = saveUserSubbassPreset(clean, patch);
    setUserPresets(updated);
    const saved = updated[updated.length - 1];
    if (saved) {
      onChangePatch(() => presetToSubbassPatch(saved));
    }
    setPresetNameInput('');
    setSavingOpen(false);
  };

  const handleDeleteUserPreset = () => {
    if (!isUserPreset) return;
    const updated = deleteUserSubbassPreset(patch.presetId);
    setUserPresets(updated);
    onChangePatch((prev) => presetToSubbassPatch(SUBBASS_FACTORY_PRESETS[0], prev.fx));
  };

  // Subscribe to sequencer MIDI events strictly targeting SUBBASS for key illumination
  useEffect(() => {
    const unsub = midiBus.subscribe((evt) => {
      if (evt.source === 'piano_roll' && evt.type === 'noteOn' && evt.target === 'subbass') {
        setSeqLitMidi(evt.midi);
        if (seqFlashTimerRef.current !== null) {
          window.clearTimeout(seqFlashTimerRef.current);
        }
        seqFlashTimerRef.current = window.setTimeout(() => {
          setSeqLitMidi(null);
        }, 180);
      }
    });
    return () => {
      unsub();
      if (seqFlashTimerRef.current !== null) {
        window.clearTimeout(seqFlashTimerRef.current);
      }
    };
  }, []);

  // Build 2-octave playable keybed (25 keys: C..C two octaves up)
  const keys = useMemo<KeyDef[]>(() => {
    const startMidi = (baseOctave + 1) * 12;
    const result: KeyDef[] = [];
    let whiteCounter = 0;
    for (let i = 0; i <= 24; i++) {
      const midi = startMidi + i;
      const semi = midi % 12;
      const oct = Math.floor(midi / 12) - 1;
      const isBlack = BLACK_SEMITONES.has(semi);
      const noteName = `${NOTE_NAMES[semi]}${oct}`;
      if (!isBlack) {
        result.push({ midi, noteName, isBlack: false, whiteIndex: whiteCounter });
        whiteCounter++;
      } else {
        result.push({ midi, noteName, isBlack: true, whiteIndex: whiteCounter - 1 });
      }
    }
    return result;
  }, [baseOctave]);

  const whiteKeys = useMemo(() => keys.filter((k) => !k.isBlack), [keys]);
  const blackKeys = useMemo(() => keys.filter((k) => k.isBlack), [keys]);

  const syncActiveNotes = useCallback(() => {
    const next = new Set<number>();
    pointerNotesRef.current.forEach((m) => next.add(m));
    qwertyNotesRef.current.forEach((m) => next.add(m));
    setActiveNotes(next);
  }, []);

  const triggerOn = useCallback((midi: number, velocity = 0.9) => {
    studioAudio.unlockSync();
    void subbassEngine.noteOn(midi, velocity);
    midiBus.emit({ type: 'noteOn', source: 'keyboard', midi, velocity, target: 'subbass' });
  }, []);

  const triggerOff = useCallback((midi: number) => {
    let stillHeld = false;
    pointerNotesRef.current.forEach((m) => {
      if (m === midi) stillHeld = true;
    });
    qwertyNotesRef.current.forEach((m) => {
      if (m === midi) stillHeld = true;
    });
    if (!stillHeld) {
      subbassEngine.noteOff(midi);
      midiBus.emit({ type: 'noteOff', source: 'keyboard', midi, target: 'subbass' });
    }
  }, []);

  const resolveKeyAtPoint = (
    clientX: number,
    clientY: number
  ): { midi: number; velocity: number } | null => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!el) return null;
    const keyEl = el.closest('[data-sub-midi]') as HTMLElement | null;
    if (!keyEl) return null;
    const midi = Number(keyEl.dataset.subMidi);
    if (!Number.isFinite(midi)) return null;
    const rect = keyEl.getBoundingClientRect();
    const relY =
      rect.height > 0 ? Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) : 0.7;
    return { midi, velocity: 0.72 + relY * 0.28 };
  };

  const handleKeysPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const hit = resolveKeyAtPoint(e.clientX, e.clientY);
    if (!hit) return;
    pointerNotesRef.current.set(e.pointerId, hit.midi);
    triggerOn(hit.midi, hit.velocity);
    syncActiveNotes();
  };

  const handleKeysPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerNotesRef.current.has(e.pointerId)) return;
    e.preventDefault();
    const prevMidi = pointerNotesRef.current.get(e.pointerId)!;
    const hit = resolveKeyAtPoint(e.clientX, e.clientY);
    if (!hit) return;
    if (hit.midi !== prevMidi) {
      pointerNotesRef.current.delete(e.pointerId);
      triggerOff(prevMidi);
      pointerNotesRef.current.set(e.pointerId, hit.midi);
      triggerOn(hit.midi, hit.velocity);
      syncActiveNotes();
    }
  };

  const handleKeysPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const prevMidi = pointerNotesRef.current.get(e.pointerId);
    if (prevMidi !== undefined) {
      pointerNotesRef.current.delete(e.pointerId);
      triggerOff(prevMidi);
      syncActiveNotes();
    }
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
  };

  // Computer QWERTY keyboard playability
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key.toLowerCase();
      if (key in QWERTY_MAP) {
        const midi = (baseOctave + 1) * 12 + QWERTY_MAP[key];
        if (!qwertyNotesRef.current.has(key)) {
          qwertyNotesRef.current.set(key, midi);
          triggerOn(midi, 0.9);
          syncActiveNotes();
        }
      } else if (e.key === 'ArrowLeft') {
        setBaseOctave((o) => Math.max(0, o - 1));
      } else if (e.key === 'ArrowRight') {
        setBaseOctave((o) => Math.min(3, o + 1));
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const midi = qwertyNotesRef.current.get(key);
      if (midi !== undefined) {
        qwertyNotesRef.current.delete(key);
        triggerOff(midi);
        syncActiveNotes();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [baseOctave, triggerOn, triggerOff, syncActiveNotes]);

  const activeNoteForReadout = useMemo(() => {
    if (activeNotes.size > 0) {
      const arr = Array.from(activeNotes);
      return arr[arr.length - 1];
    }
    return seqLitMidi;
  }, [activeNotes, seqLitMidi]);

  const updateKnob = (key: keyof SubbassPatch, val: number) => {
    onChangePatch((prev) => ({
      ...prev,
      [key]: val,
    }));
  };

  const activePattern =
    seqState.patterns[seqState.activePatternId] ??
    seqState.patterns[seqState.patternOrder[0]] ?? {
      id: 'S1',
      name: 'Sub Pattern 1',
      notes: [],
    };

  const patternOptions = useMemo(
    () =>
      seqState.patternOrder
        .filter((pid) => Boolean(seqState.patterns[pid]))
        .map((pid) => ({
          id: pid,
          label: seqState.patterns[pid].name,
          noteCount: seqState.patterns[pid].notes.length,
        })),
    [seqState]
  );

  const handleUpdateNotes = useCallback(
    (updater: RollNote[] | ((prev: RollNote[]) => RollNote[])) => {
      onChangeSeqState((prev) => {
        const pid = prev.activePatternId;
        const curr = prev.patterns[pid] ?? {
          id: pid,
          name: `Sub Pattern ${prev.patternOrder.length + 1}`,
          notes: [],
        };
        const rawNext =
          typeof updater === 'function' ? updater(curr.notes) : updater;
        const cleanNotes: MidiNote[] = rawNext.map((n) => ({
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
    [onChangeSeqState]
  );

  const handleCreatePattern = useCallback(() => {
    onChangeSeqState((prev) => {
      let num = prev.patternOrder.length + 1;
      while (prev.patterns[`S${num}`]) num++;
      const newId = `S${num}`;
      return {
        ...prev,
        activePatternId: newId,
        patternOrder: [...prev.patternOrder, newId],
        patterns: {
          ...prev.patterns,
          [newId]: {
            id: newId,
            name: `Sub Pattern ${num}`,
            notes: [],
          },
        },
      };
    });
  }, [onChangeSeqState]);

  const handleDuplicatePattern = useCallback(() => {
    onChangeSeqState((prev) => {
      const src = prev.patterns[prev.activePatternId];
      let num = prev.patternOrder.length + 1;
      while (prev.patterns[`S${num}`]) num++;
      const newId = `S${num}`;
      const clonedNotes: MidiNote[] = (src?.notes ?? []).map((n, i) => ({
        ...n,
        id: `sb-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      }));
      return {
        ...prev,
        activePatternId: newId,
        patternOrder: [...prev.patternOrder, newId],
        patterns: {
          ...prev.patterns,
          [newId]: {
            id: newId,
            name: src ? `${src.name} Copy` : `Sub Pattern ${num}`,
            notes: clonedNotes,
          },
        },
      };
    });
  }, [onChangeSeqState]);

  const handleDeletePattern = useCallback(() => {
    onChangeSeqState((prev) => {
      if (prev.patternOrder.length <= 1) {
        const pid = prev.activePatternId;
        const curr = prev.patterns[pid];
        return {
          ...prev,
          patterns: {
            ...prev.patterns,
            [pid]: { ...(curr ?? { id: pid, name: 'Sub Pattern 1' }), notes: [] },
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
  }, [onChangeSeqState]);

  const lpfHz = Math.round(
    38 * Math.pow(63.15, Math.max(0, Math.min(1, patch.lowPassFilter)))
  );
  const attackMs = Math.round(2 + Math.pow(patch.attack, 1.6) * 380);
  const releaseMs = Math.round(20 + Math.pow(patch.release, 1.7) * 1250);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#12151B] text-slate-100 overflow-hidden">
      {/* SERUM 2 UNIFIED HEADER BAR */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-2 px-2 h-10 bg-[#181B22] border-b border-[#2D3442] shrink-0 overflow-x-auto synth-scroll">
        {/* Left: Back, Wordmark, Quick Transport, Channel Strip */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1 px-2.5 h-8 rounded-md bg-[#222731] hover:bg-[#2B3240] border border-[#384050] text-slate-100 font-display font-bold text-[11px] tracking-wide cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#2EE59D] shrink-0" />
              <span>BACK</span>
            </button>
          )}

          <span className="hidden md:inline font-display text-sm font-extrabold tracking-tight text-slate-100 whitespace-nowrap">
            SUB<span className="text-[#2EE59D]">SYNTH</span>
          </span>

          <SubbassQuickTransport
            bpm={bpm}
            isPlayingProp={isPlayingProp}
            onTogglePlay={onTogglePlay}
          />

          <PluginChannelStrip
            plugin="subbass"
            routing={routing}
            onChangeRouting={onChangeRouting}
            variant="header"
            accent="cyan"
          />
        </div>

        {/* Center: Serum 2 Tabs (SYNTH | FX RACK) */}
        <nav
          aria-label="SUBSYNTH Views"
          className="flex items-center gap-0.5 bg-[#0E1116] p-0.5 rounded-md border border-[#2D3442] shrink-0"
        >
          <button
            type="button"
            onClick={() => setActiveSubView('synth')}
            aria-pressed={activeSubView === 'synth'}
            style={{ touchAction: 'manipulation' }}
            className={`relative px-2.5 h-7.5 rounded font-display font-bold text-[11px] tracking-wider cursor-pointer transition-colors whitespace-nowrap ${
              activeSubView === 'synth'
                ? 'bg-[#252B36] text-[#2EE59D] border border-[#2EE59D]/50'
                : 'text-slate-300 border border-transparent hover:bg-[#1C2029] hover:text-white'
            }`}
          >
            SYNTH
            {activeSubView === 'synth' && (
              <span
                aria-hidden="true"
                className="absolute bottom-0.5 left-2 right-2 h-0.5 rounded-full bg-[#2EE59D]"
              />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveSubView('fx')}
            aria-pressed={activeSubView === 'fx'}
            style={{ touchAction: 'manipulation' }}
            className={`relative inline-flex items-center gap-1 px-2.5 h-7.5 rounded font-display font-bold text-[11px] tracking-wider cursor-pointer transition-colors whitespace-nowrap ${
              activeSubView === 'fx'
                ? 'bg-[#252B36] text-[#2EE59D] border border-[#2EE59D]/50'
                : 'text-slate-300 border border-transparent hover:bg-[#1C2029] hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span>FX RACK ({enabledFxCount}/9)</span>
            {activeSubView === 'fx' && (
              <span
                aria-hidden="true"
                className="absolute bottom-0.5 left-2 right-2 h-0.5 rounded-full bg-[#2EE59D]"
              />
            )}
          </button>
        </nav>

        {/* Right: Keyboard Toggle, Piano Roll, Effects, Presets */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            aria-pressed={keyboardVisible}
            onClick={handleToggleKeyboard}
            style={{ touchAction: 'manipulation' }}
            title={keyboardVisible ? 'Hide Piano Keyboard' : 'Show Piano Keyboard'}
            className={`inline-flex items-center gap-1 px-2 sm:px-2.5 h-8 rounded-md border text-[11px] font-display font-bold tracking-wide cursor-pointer whitespace-nowrap transition-colors shrink-0 ${
              keyboardVisible
                ? 'bg-[#2EE59D]/15 border-[#2EE59D]/55 text-[#2EE59D]'
                : 'bg-[#0E1116] border-[#2D3442] text-slate-300 hover:text-white hover:border-slate-500'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5 shrink-0" />
            <span>{keyboardVisible ? 'KEYBOARD ON' : 'KEYBOARD OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPianoRoll(true)}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-[11px] tracking-wide cursor-pointer whitespace-nowrap shrink-0"
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
              className={`inline-flex items-center gap-1 px-2 h-8 rounded-md border font-display font-bold text-[11px] tracking-wide cursor-pointer whitespace-nowrap transition-colors shrink-0 ${
                showDeviceRack
                  ? 'bg-[#2EE59D]/18 border-[#2EE59D]/60 text-[#2EE59D]'
                  : 'bg-[#0E1116] border-[#2D3442] text-slate-200 hover:border-[#2EE59D]/45'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#2EE59D] shrink-0" />
              <span>EFFECTS{deviceFx.length > 0 ? ` (${deviceFx.length})` : ''}</span>
            </button>
          )}

          <div className="flex items-center rounded-md bg-[#0E1116] border border-[#2D3442] overflow-hidden h-8 shrink-0">
            <button
              type="button"
              aria-label="Previous Subbass Preset"
              onClick={() => handleStepPreset(-1)}
              className="w-6 sm:w-7 h-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#1C2029] cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <select
              aria-label="SUBBASS Preset"
              value={patch.presetId}
              onChange={(e) => {
                const found = allPresets.find((p) => p.id === e.target.value);
                if (found) handleSelectPreset(found);
              }}
              className="h-full px-2 bg-[#0E1116] text-[11px] sm:text-xs font-medium text-slate-100 focus:outline-none cursor-pointer max-w-[140px] sm:max-w-[190px]"
            >
              <optgroup label="Factory Presets">
                {SUBBASS_FACTORY_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              {userPresets.length > 0 && (
                <optgroup label="User Presets">
                  {userPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              type="button"
              aria-label="Next Subbass Preset"
              onClick={() => handleStepPreset(1)}
              className="w-6 sm:w-7 h-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#1C2029] cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {savingOpen ? (
            <form onSubmit={handleSavePreset} className="flex items-center gap-1 shrink-0">
              <input
                type="text"
                autoFocus
                placeholder="Preset name..."
                value={presetNameInput}
                onChange={(e) => setPresetNameInput(e.target.value)}
                className="h-8 w-28 sm:w-36 px-2 rounded-md bg-[#0E1116] border border-[#2EE59D] text-xs text-white focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md bg-[#2EE59D] hover:bg-[#49EEA9] text-slate-950 text-[11px] font-bold cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={() => setSavingOpen(false)}
                className="h-8 px-2 rounded-md bg-[#222731] border border-[#384050] text-[11px] text-slate-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPresetNameInput(`${patch.name} Mix`);
                setSavingOpen(true);
              }}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md bg-[#0E1116] hover:bg-[#1C2029] border border-[#2D3442] text-[11px] font-medium text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-[#2EE59D]" />
              <span className="hidden lg:inline">Save Preset</span>
              <span className="lg:hidden">Save</span>
            </button>
          )}

          {isUserPreset && (
            <button
              type="button"
              aria-label="Delete User Preset"
              onClick={handleDeleteUserPreset}
              className="w-8 h-8 rounded-md bg-[#0E1116] border border-[#2D3442] flex items-center justify-center text-slate-400 hover:text-rose-400 cursor-pointer shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Active Sub-View: Main Serum-2-Styled SUBSYNTH Workspace OR Dedicated FX Rack */}
      {activeSubView === 'fx' ? (
        <SubbassFxRack fx={activeFx} bpm={bpm} onChangeFx={handleChangeFx} />
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden p-1.5 flex flex-col gap-1.5 max-w-[1600px] w-full mx-auto">
          {/* UPPER MODULE BAY: 2 Organized Serum-2 Hardware Modules Fitting Single Screen */}
          <div className="flex-[1.12] min-h-0 grid grid-cols-1 md:grid-cols-12 gap-1.5">
            {/* Module 1: SUB OSCILLATOR & VOICE ARCHITECTURE */}
            <section className="md:col-span-6 rounded-md bg-[#191D24] border border-[#2E3543] overflow-hidden flex flex-col min-h-0">
              <div className="px-2.5 py-1 bg-[#222731] border-b border-[#2E3543] flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2EE59D] shrink-0" />
                  <h2 className="font-display text-[10.5px] font-bold tracking-wider text-slate-100 truncate">
                    SUB OSCILLATOR · VOICE
                  </h2>
                </div>
                <span className="font-mono-num text-[10px] text-slate-300 whitespace-nowrap">
                  OCT {patch.octave === 0 ? '0' : patch.octave} · {patch.phase}° ·{' '}
                  <span className={patch.squareEnabled ? 'text-amber-300' : 'text-slate-500'}>
                    {patch.squareEnabled ? 'SQR ON' : 'SQR OFF'}
                  </span>
                </span>
              </div>

              <div className="flex-1 min-h-0 p-1.5 sm:p-2 flex flex-col justify-between gap-1.5">
                {/* Oscillator Switches Strip: Octave, Phase, Square Layer */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 bg-[#12151B] px-1.5 py-1 rounded border border-[#262C38] shrink-0">
                  {/* Octave Switch */}
                  <div className="flex items-center gap-0.5">
                    <span className="text-[9.5px] font-display font-bold text-slate-400 pr-1">
                      OCT
                    </span>
                    {([-2, -1, 0] as SubbassOctave[]).map((oct) => (
                      <button
                        key={oct}
                        type="button"
                        onClick={() => onChangePatch((prev) => ({ ...prev, octave: oct }))}
                        style={{ touchAction: 'manipulation' }}
                        className={`px-2 h-6 rounded font-mono-num text-[10.5px] font-bold cursor-pointer transition-colors ${
                          patch.octave === oct
                            ? 'bg-[#2EE59D] text-slate-950'
                            : 'bg-[#191D24] text-slate-400 hover:text-white'
                        }`}
                      >
                        {oct === 0 ? '0' : oct}
                      </button>
                    ))}
                  </div>

                  {/* Phase Switch */}
                  <div className="flex items-center gap-0.5">
                    <span className="text-[9.5px] font-display font-bold text-slate-400 pr-1">
                      PHASE
                    </span>
                    {([0, 90, 180, 270] as SubbassPhaseDeg[]).map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        onClick={() => onChangePatch((prev) => ({ ...prev, phase: deg }))}
                        style={{ touchAction: 'manipulation' }}
                        className={`px-1.5 h-6 rounded font-mono-num text-[10px] font-bold cursor-pointer transition-colors ${
                          patch.phase === deg
                            ? 'bg-cyan-400 text-slate-950'
                            : 'bg-[#191D24] text-slate-400 hover:text-white'
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>

                  {/* Square Harmonic Layer Toggle */}
                  <button
                    type="button"
                    aria-pressed={patch.squareEnabled}
                    onClick={() =>
                      onChangePatch((prev) => ({
                        ...prev,
                        squareEnabled: !prev.squareEnabled,
                      }))
                    }
                    style={{ touchAction: 'manipulation' }}
                    className={`px-2.5 h-6 rounded border text-[10px] font-display font-bold cursor-pointer transition-colors whitespace-nowrap ${
                      patch.squareEnabled
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                        : 'bg-[#191D24] border-[#2E3543] text-slate-400 hover:text-white'
                    }`}
                  >
                    Square {patch.squareEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* 4 Sub Oscillator Knobs Directly Underneath */}
                <div className="flex-1 min-h-0 grid grid-cols-4 gap-1 sm:gap-2 items-center bg-[#141820] border border-[#262C38] rounded px-1.5 py-1">
                  <SubbassKnob
                    compact
                    borderless
                    label="SUB LEVEL"
                    value={patch.subLevel}
                    defaultValue={0.95}
                    accent="mint"
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => updateKnob('subLevel', v)}
                  />
                  <SubbassKnob
                    compact
                    borderless
                    label="BASS TONE"
                    value={patch.bassTone}
                    defaultValue={0.25}
                    accent="dual"
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => updateKnob('bassTone', v)}
                  />
                  <SubbassKnob
                    compact
                    borderless
                    label="GLIDE"
                    value={patch.glide}
                    defaultValue={0.14}
                    accent="amber"
                    formatValue={(v) =>
                      v < 0.02 ? 'OFF' : `${Math.round(5 + Math.pow(v, 1.5) * 300)} ms`
                    }
                    onChange={(v) => updateKnob('glide', v)}
                  />
                  <SubbassKnob
                    compact
                    borderless
                    label="SATURATION"
                    value={patch.saturation}
                    defaultValue={0.18}
                    accent="amber"
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => updateKnob('saturation', v)}
                  />
                </div>
              </div>
            </section>

            {/* Module 2: ENVELOPE · LOW PASS FILTER · OUTPUT */}
            <section className="md:col-span-6 rounded-md bg-[#191D24] border border-[#2E3543] overflow-hidden flex flex-col min-h-0">
              <div className="px-2.5 py-1 bg-[#222731] border-b border-[#2E3543] flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                  <h2 className="font-display text-[10.5px] font-bold tracking-wider text-slate-100 truncate">
                    ENVELOPE · FILTER · OUTPUT
                  </h2>
                </div>
                <span className="font-mono-num text-[10px] text-cyan-300 font-semibold whitespace-nowrap">
                  LPF {lpfHz} Hz
                </span>
              </div>

              <div className="flex-1 min-h-0 p-1.5 sm:p-2 flex flex-col justify-between gap-1.5">
                {/* OLED Telemetry Strip */}
                <div className="h-8 px-2.5 rounded bg-[#090B0F] border border-[#262C38] flex items-center justify-between gap-2 text-[10px] font-mono-num shrink-0">
                  <span className="text-slate-400">
                    ATK <strong className="text-[#2EE59D]">{attackMs} ms</strong>
                  </span>
                  <span className="text-slate-400">
                    REL <strong className="text-[#2EE59D]">{releaseMs} ms</strong>
                  </span>
                  <span className="text-slate-400">
                    CUT <strong className="text-cyan-300">{lpfHz} Hz</strong>
                  </span>
                  <span className="text-slate-400">
                    OUT <strong className="text-amber-300">{Math.round(patch.outputVolume * 100)}%</strong>
                  </span>
                </div>

                {/* 4 Envelope / Filter / Output Knobs Directly Underneath */}
                <div className="flex-1 min-h-0 grid grid-cols-4 gap-1 sm:gap-2 items-center bg-[#141820] border border-[#262C38] rounded px-1.5 py-1">
                  <SubbassKnob
                    compact
                    borderless
                    label="ATTACK"
                    value={patch.attack}
                    defaultValue={0.08}
                    accent="mint"
                    formatValue={(v) => `${Math.round(2 + Math.pow(v, 1.6) * 380)} ms`}
                    onChange={(v) => updateKnob('attack', v)}
                  />
                  <SubbassKnob
                    compact
                    borderless
                    label="RELEASE"
                    value={patch.release}
                    defaultValue={0.34}
                    accent="mint"
                    formatValue={(v) => `${Math.round(20 + Math.pow(v, 1.7) * 1250)} ms`}
                    onChange={(v) => updateKnob('release', v)}
                  />
                  <SubbassKnob
                    compact
                    borderless
                    label="LOW PASS"
                    value={patch.lowPassFilter}
                    defaultValue={0.48}
                    accent="cyan"
                    formatValue={(v) => `${Math.round(38 * Math.pow(63.15, v))} Hz`}
                    onChange={(v) => updateKnob('lowPassFilter', v)}
                  />
                  <SubbassKnob
                    compact
                    borderless
                    label="OUTPUT"
                    value={patch.outputVolume}
                    defaultValue={0.88}
                    accent="dual"
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => updateKnob('outputVolume', v)}
                  />
                </div>
              </div>
            </section>
          </div>

          {/* BOTTOM VISUAL DISPLAY BAY: Live Waveform + Real-Audio Spectrum Analyzer */}
          <div className="flex-[0.88] min-h-[78px] grid grid-cols-1 md:grid-cols-12 gap-1.5">
            <section className="md:col-span-7 rounded-md bg-[#191D24] border border-[#2E3543] overflow-hidden flex flex-col min-h-0">
              <div className="px-2.5 py-0.5 bg-[#222731] border-b border-[#2E3543] flex items-center justify-between shrink-0">
                <span className="font-display text-[10px] font-bold tracking-wider text-slate-200">
                  SUB WAVEFORM MONITOR
                </span>
                <span className="font-mono-num text-[9.5px] text-slate-400">
                  {patch.name}
                </span>
              </div>
              <div className="flex-1 min-h-0 p-1">
                <SubbassWaveform
                  patch={patch}
                  activeMidi={activeNoteForReadout}
                  expanded={!keyboardVisible}
                />
              </div>
            </section>

            <section className="md:col-span-5 rounded-md bg-[#191D24] border border-[#2E3543] overflow-hidden flex flex-col min-h-0">
              <div className="px-2.5 py-0.5 bg-[#222731] border-b border-[#2E3543] flex items-center justify-between shrink-0">
                <span className="font-display text-[10px] font-bold tracking-wider text-slate-200">
                  SUB SPECTRUM ANALYZER
                </span>
                <span className="font-mono-num text-[9.5px] text-[#2EE59D]">
                  20 Hz – 1.4 kHz
                </span>
              </div>
              <div className="flex-1 min-h-0 p-1">
                <SpectrumAnalyzer
                  source="subbass"
                  accent="cyan"
                  defaultMode="spectrum"
                  minHz={20}
                  maxHz={1400}
                  reactiveOnly
                  compact
                />
              </div>
            </section>
          </div>
        </div>
      )}

      {showDeviceRack && onChangeDeviceFx && (
        <FxDeviceRack
          activeTrack="subbass"
          modules={deviceFx}
          channelBypass={Boolean(routing.subbassFxBypass)}
          hideTrackTabs
          onChangeModules={(_, next) => onChangeDeviceFx(next)}
          onToggleChannelBypass={() =>
            onChangeRouting({ subbassFxBypass: !routing.subbassFxBypass })
          }
          onOpenBrowser={() => onOpenEffectsBrowser?.()}
        />
      )}

      {/* Playable 2-Octave Touch Piano Keyboard (hidden cleanly when KEYBOARD OFF) */}
      {keyboardVisible && (
        <div className="shrink-0 bg-[#15181F] border-t border-[#2D3442]">
          <div className="flex items-center justify-between px-3 py-0.5 bg-[#181B22] border-b border-[#282F3C] text-[11px]">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold tracking-wider text-[#2EE59D]">
                SUB KEYBOARD
              </span>
              <span className="text-slate-400 hidden sm:inline">
                · Monophonic Bass Mode · Touch Slide Enabled
              </span>
            </div>

            <div className="flex items-center rounded bg-[#0E1116] border border-[#2D3442] overflow-hidden">
              <button
                type="button"
                aria-label="Keyboard Octave Down"
                disabled={baseOctave <= 0}
                onClick={() => setBaseOctave((o) => Math.max(0, o - 1))}
                className="w-7 h-6 flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#1E2430] disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono-num text-[10.5px] font-semibold text-[#2EE59D] whitespace-nowrap">
                C{baseOctave}–C{baseOctave + 2}
              </span>
              <button
                type="button"
                aria-label="Keyboard Octave Up"
                disabled={baseOctave >= 3}
                onClick={() => setBaseOctave((o) => Math.min(3, o + 1))}
                className="w-7 h-6 flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#1E2430] disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div
            style={{ touchAction: 'none' }}
            onPointerDown={handleKeysPointerDown}
            onPointerMove={handleKeysPointerMove}
            onPointerUp={handleKeysPointerUp}
            onPointerCancel={handleKeysPointerUp}
            className="relative flex h-[68px] sm:h-[82px] lg:h-[96px] w-full bg-[#090B0F] select-none"
          >
            {whiteKeys.map((k) => {
              const isDown = activeNotes.has(k.midi) || seqLitMidi === k.midi;
              const isC = k.midi % 12 === 0;
              return (
                <div
                  key={k.midi}
                  data-sub-midi={k.midi}
                  className={`relative flex-1 h-full border-r border-[#242A36] last:border-r-0 flex flex-col justify-end items-center pb-1 transition-colors duration-75 ${
                    isDown
                      ? 'bg-[#2EE59D] text-slate-950'
                      : 'bg-gradient-to-b from-[#1D222C] to-[#141820] text-slate-400'
                  }`}
                >
                  {isC && (
                    <span
                      className={`font-mono-num text-[9.5px] font-semibold pointer-events-none ${
                        isDown ? 'text-slate-950' : 'text-[#2EE59D]/80'
                      }`}
                    >
                      {k.noteName}
                    </span>
                  )}
                </div>
              );
            })}

            {blackKeys.map((k) => {
              const isDown = activeNotes.has(k.midi) || seqLitMidi === k.midi;
              const whiteW = 100 / whiteKeys.length;
              const blackW = whiteW * 0.64;
              const leftPct = (k.whiteIndex + 1) * whiteW - blackW / 2;
              return (
                <div
                  key={k.midi}
                  data-sub-midi={k.midi}
                  style={{ left: `${leftPct}%`, width: `${blackW}%` }}
                  className={`absolute top-0 h-[58%] z-10 rounded-b-md border transition-colors duration-75 shadow-lg ${
                    isDown
                      ? 'bg-cyan-400 border-white'
                      : 'bg-gradient-to-b from-[#0E1116] to-[#06080B] border-[#2C3340]'
                  }`}
                />
              );
            })}
          </div>
        </div>
      )}

      {showPianoRoll && (
        <SubbassPianoRollView
          notes={activePattern.notes}
          bpm={bpm}
          loop={loop}
          isPlayingProp={isPlayingProp}
          isRecording={isRecording}
          playheadStepProp={playheadStepProp}
          isFullscreen={isFullscreen}
          showKeyboard={keyboardVisible}
          patternOptions={patternOptions}
          activePatternId={activePattern.id}
          onBack={() => setShowPianoRoll(false)}
          onToggleFullscreen={onToggleFullscreen}
          onToggleKeyboard={handleToggleKeyboard}
          onTogglePlay={onTogglePlay}
          onStop={onStop}
          onToggleLoop={onToggleLoop}
          onToggleRecord={onToggleRecord}
          onChangeBpm={onChangeBpm}
          onUpdateNotes={handleUpdateNotes}
          onSelectPattern={(activePatternId) =>
            onChangeSeqState((prev) => ({ ...prev, activePatternId }))
          }
          onCreatePattern={handleCreatePattern}
          onDuplicatePattern={handleDuplicatePattern}
          onDeletePattern={handleDeletePattern}
        />
      )}
    </div>
  );
});
