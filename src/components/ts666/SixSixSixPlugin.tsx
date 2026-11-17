import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  FolderOpen,
  Keyboard,
  ListMusic,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Square,
  VolumeX,
  X,
} from 'lucide-react';
import { midiBus } from '../../audio/MidiBus';
import { studioAudio } from '../../audio/StudioAudio';
import { useIsPlaying, usePlayheadStep } from '../../audio/transportStore';
import {
  SixSixSixEngine,
  sixSixSixEngine,
} from '../../audio/ts666/SixSixSixEngine';
import { publishTs666Telemetry } from '../../audio/ts666/ts666TelemetryStore';
import {
  createCleanBassInit666,
  createDefaultTs666SequencerState,
  createFactoryPresets666,
  loadTs666ActivePatch,
  loadTs666UserPresets,
  saveTs666ActivePatch,
  saveTs666UserPresets,
} from '../../audio/ts666/ts666Presets';
import type { StudioRoutingConfig } from '../../types/beatbox';
import type { ModularFxInstance } from '../../types/fx';
import type { MidiNote } from '../../types/sequencer';
import type {
  Ts666BusId,
  Ts666CustomWavetable,
  Ts666ModSource,
  Ts666ModTarget,
  Ts666Patch,
  Ts666SequencerState,
} from '../../types/ts666';
import { FxDeviceRack } from '../fx/FxDeviceRack';
import { PluginChannelStrip } from '../PluginChannelStrip';
import { UnifiedPianoRoll, type RollNote } from '../UnifiedPianoRoll';
import { Ts666DualFilterPanel } from './Ts666DualFilterPanel';
import { Ts666EnvEditor } from './Ts666EnvEditor';
import { Ts666GrowlPanel } from './Ts666GrowlPanel';
import { Ts666InlineFxBay } from './Ts666InlineFxBay';
import {
  Ts666InlineMacrosPanel,
  Ts666PerformancePanel,
} from './Ts666InlineMacrosAndMaster';
import { Ts666InlineMixer } from './Ts666InlineMixer';
import {
  Ts666GlobalSettingsPanel,
  Ts666ModMatrixPanel,
} from './Ts666InlineModAndGlobal';
import { Ts666Keyboard } from './Ts666Keyboard';
import { Ts666LfoEditor } from './Ts666LfoEditor';
import { Ts666ModProvider } from './Ts666ModContext';
import { Ts666NoisePanel, Ts666OscPanel, Ts666SubPanel } from './Ts666OscPanel';
import { Ts666PresetDrawer } from './Ts666PresetDrawer';
import { Ts666WavetableEditor } from './Ts666WavetableEditor';

interface SixSixSixPluginProps {
  bpm: number;
  isFullscreen: boolean;
  patch?: Ts666Patch;
  initialPatch?: Ts666Patch;
  seqState?: Ts666SequencerState;
  routing?: StudioRoutingConfig;
  loop?: boolean;
  isPlaying?: boolean;
  isRecording?: boolean;
  playheadStep?: number;
  initialPianoRoll?: boolean;
  deviceFx?: ModularFxInstance[];
  onChangePatch?: (patch: Ts666Patch) => void;
  onChangeSeqState?: (
    updater: (prev: Ts666SequencerState) => Ts666SequencerState
  ) => void;
  onChangeRouting?: (patch: Partial<StudioRoutingConfig>) => void;
  onTogglePlay?: () => void;
  onStop?: () => void;
  onToggleLoop?: () => void;
  onToggleRecord?: () => void;
  onChangeBpm?: (bpm: number) => void;
  onChangeDeviceFx?: (next: ModularFxInstance[]) => void;
  onOpenEffectsBrowser?: () => void;
  onToggleFullscreen: () => void;
  onBack: () => void;
}

const Ts666QuickTransport: React.FC<{
  bpm: number;
  isPlayingProp?: boolean;
  onTogglePlay: () => void;
}> = React.memo(({ bpm, isPlayingProp, onTogglePlay }) => {
  const storeIsPlaying = useIsPlaying();
  const isPlaying = isPlayingProp ?? storeIsPlaying;
  return (
    <div className="flex items-center gap-1 bg-[#0C0704] p-0.5 rounded border border-[#543720] shrink-0">
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={isPlaying ? 'Stop Playback' : 'Play Playback'}
        style={{ touchAction: 'manipulation' }}
        className={`w-6 h-6 rounded flex items-center justify-center cursor-pointer transition-colors ${
          isPlaying
            ? 'bg-[#DC2626] text-white'
            : 'bg-[#26180E] text-[#FCA5A5] hover:bg-[#DC2626]/30'
        }`}
      >
        {isPlaying ? <Square className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 fill-current" />}
      </button>
      <span className="px-1 font-mono-num text-[9.5px] text-[#E08A3C] font-bold whitespace-nowrap">
        {bpm} BPM
      </span>
    </div>
  );
});

const Ts666PianoRollView: React.FC<{
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
      mode="ts666"
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

export const SixSixSixPlugin: React.FC<SixSixSixPluginProps> = ({
  bpm,
  isFullscreen,
  patch: controlledPatch,
  initialPatch,
  seqState: controlledSeqState,
  routing,
  loop = true,
  isPlaying: isPlayingProp,
  isRecording = false,
  playheadStep: playheadStepProp,
  initialPianoRoll = false,
  deviceFx = [],
  onChangePatch,
  onChangeSeqState,
  onChangeRouting,
  onTogglePlay,
  onStop,
  onToggleLoop,
  onToggleRecord,
  onChangeBpm,
  onChangeDeviceFx,
  onOpenEffectsBrowser,
  onToggleFullscreen,
  onBack,
}) => {
  const [localPatch, setLocalPatch] = useState<Ts666Patch>(
    () => controlledPatch ?? initialPatch ?? loadTs666ActivePatch()
  );
  const patch = controlledPatch ?? localPatch;

  const [localSeqState, setLocalSeqState] = useState<Ts666SequencerState>(() =>
    controlledSeqState ?? createDefaultTs666SequencerState()
  );
  const seqState = controlledSeqState ?? localSeqState;

  const [activeScreen, setActiveScreen] = useState<'synthesis' | 'control'>('synthesis');
  const [selectedEnvIdx, setSelectedEnvIdx] = useState<0 | 1 | 2 | 3>(0);
  const [selectedLfoIdx, setSelectedLfoIdx] = useState<number>(0);
  const [activeFxBus, setActiveFxBus] = useState<Ts666BusId>('main');
  const [localShowKeyboard, setLocalShowKeyboard] = useState<boolean>(true);
  const [showPianoRoll, setShowPianoRoll] = useState<boolean>(initialPianoRoll);
  const [showDeviceRack, setShowDeviceRack] = useState<boolean>(false);
  const [wtEditorOscIdx, setWtEditorOscIdx] = useState<0 | 1 | 2 | null>(null);
  const [presetsOpen, setPresetsOpen] = useState<boolean>(false);
  const [userPresets, setUserPresets] = useState<Ts666Patch[]>(() =>
    loadTs666UserPresets()
  );

  useEffect(() => {
    if (initialPianoRoll) {
      setShowPianoRoll(true);
    }
  }, [initialPianoRoll]);

  const keyboardVisible = onChangeSeqState
    ? seqState.showKeyboard !== false
    : localShowKeyboard;

  const factoryPresets = useMemo(() => createFactoryPresets666(), []);

  const updatePatch = useCallback(
    (updater: Ts666Patch | ((prev: Ts666Patch) => Ts666Patch)) => {
      if (controlledPatch !== undefined) {
        const next = typeof updater === 'function' ? updater(controlledPatch) : updater;
        saveTs666ActivePatch(next);
        onChangePatch?.(next);
      } else {
        setLocalPatch((prev) => {
          const next = typeof updater === 'function' ? updater(prev) : updater;
          saveTs666ActivePatch(next);
          onChangePatch?.(next);
          return next;
        });
      }
    },
    [controlledPatch, onChangePatch]
  );

  const updateSeqState = useCallback(
    (updater: (prev: Ts666SequencerState) => Ts666SequencerState) => {
      if (onChangeSeqState) {
        onChangeSeqState(updater);
      } else {
        setLocalSeqState(updater);
      }
    },
    [onChangeSeqState]
  );

  const handleToggleKeyboard = useCallback(() => {
    if (onChangeSeqState) {
      onChangeSeqState((prev) => ({
        ...prev,
        showKeyboard: prev.showKeyboard === false ? true : false,
      }));
    } else {
      setLocalShowKeyboard((k) => !k);
    }
  }, [onChangeSeqState]);

  useEffect(() => {
    if (controlledPatch === undefined) {
      sixSixSixEngine.setPatch(patch);
    }
  }, [controlledPatch, patch]);

  useEffect(() => {
    if (!onChangeRouting) {
      sixSixSixEngine.setBpm(bpm);
    }
  }, [bpm, onChangeRouting]);

  useEffect(() => {
    void sixSixSixEngine.ensureAudio();
    sixSixSixEngine.setTelemetryListener(publishTs666Telemetry);
    const unsubMidi = onChangeRouting
      ? () => {}
      : midiBus.subscribe((evt) => {
          if (evt.source === 'external_midi' || evt.target === undefined) {
            if (evt.type === 'noteOn') void sixSixSixEngine.noteOn(evt.midi, evt.velocity);
            else if (evt.type === 'noteOff') sixSixSixEngine.noteOff(evt.midi);
          }
        });
    return () => {
      sixSixSixEngine.setTelemetryListener(null);
      unsubMidi();
    };
  }, [onChangeRouting]);

  const handleAssignMod = useCallback(
    (source: Ts666ModSource, target: Ts666ModTarget) => {
      updatePatch((prev) => {
        if (source.startsWith('MACRO')) {
          const macroNum = Number(source.replace('MACRO', ''));
          const nextMacros = prev.macros.map((m) =>
            m.id === macroNum
              ? {
                  ...m,
                  bindings: [
                    ...m.bindings.filter((b) => b.target !== target),
                    { target, amount: 0.35 },
                  ],
                }
              : m
          );
          return { ...prev, macros: nextMacros };
        }
        if (prev.modMatrix.length >= 64) return prev;
        return {
          ...prev,
          modMatrix: [
            ...prev.modMatrix,
            {
              id: `mat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
              enabled: true,
              source,
              target,
              amount: 0.35,
              direction: 'uni',
              curve: 0,
              auxSource: 'NONE',
            },
          ],
        };
      });
    },
    [updatePatch]
  );

  const handleLoadCustomSample = useCallback(
    async (oscId: 'A' | 'B' | 'C', file: File) => {
      const buf = await file.arrayBuffer();
      const ok = await sixSixSixEngine.decodeAndLoadCustomSample(oscId, buf);
      if (ok) {
        const idx = oscId === 'A' ? 0 : oscId === 'B' ? 1 : 2;
        updatePatch((prev) => {
          const nextOscs = [...prev.oscillators] as Ts666Patch['oscillators'];
          nextOscs[idx] = {
            ...nextOscs[idx],
            sampleId: 'custom',
            customSampleName: file.name,
          };
          return { ...prev, oscillators: nextOscs };
        });
      }
    },
    [updatePatch]
  );

  const handleLoadCustomNoise = useCallback(
    async (file: File) => {
      const buf = await file.arrayBuffer();
      const ok = await sixSixSixEngine.decodeAndLoadCustomNoise(buf);
      if (ok) {
        updatePatch((prev) => ({
          ...prev,
          noise: {
            ...prev.noise,
            enabled: true,
            sampleId: 'custom',
            customSampleName: file.name,
          },
        }));
      }
    },
    [updatePatch]
  );

  const handleApplyCustomWavetable = useCallback(
    (oscIdx: 0 | 1 | 2, customWavetable: Ts666CustomWavetable) => {
      updatePatch((prev) => {
        const nextOscs = [...prev.oscillators] as Ts666Patch['oscillators'];
        nextOscs[oscIdx] = {
          ...nextOscs[oscIdx],
          wavetableId: 'custom',
          customWavetable,
        };
        return { ...prev, oscillators: nextOscs };
      });
    },
    [updatePatch]
  );

  const handleSaveUserPreset = useCallback(
    (name: string) => {
      const saved: Ts666Patch = {
        ...patch,
        id: `usr666_${Date.now().toString(36)}`,
        name,
        category: 'User',
        isFactory: false,
      };
      const next = [saved, ...userPresets];
      setUserPresets(next);
      saveTs666UserPresets(next);
      updatePatch(saved);
    },
    [patch, updatePatch, userPresets]
  );

  const handleDeleteUserPreset = useCallback(
    (id: string) => {
      const next = userPresets.filter((p) => p.id !== id);
      setUserPresets(next);
      saveTs666UserPresets(next);
    },
    [userPresets]
  );

  void SixSixSixEngine;

  const activePattern =
    seqState.patterns[seqState.activePatternId] ??
    seqState.patterns[seqState.patternOrder[0]] ?? {
      id: 'T1',
      name: '666TS Pattern 1',
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
      updateSeqState((prev) => {
        const pid = prev.activePatternId;
        const curr = prev.patterns[pid] ?? {
          id: pid,
          name: `666TS Pattern ${prev.patternOrder.length + 1}`,
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
    [updateSeqState]
  );

  const handleCreatePattern = useCallback(() => {
    updateSeqState((prev) => {
      let num = prev.patternOrder.length + 1;
      while (prev.patterns[`T${num}`]) num++;
      const newId = `T${num}`;
      return {
        ...prev,
        activePatternId: newId,
        patternOrder: [...prev.patternOrder, newId],
        patterns: {
          ...prev.patterns,
          [newId]: {
            id: newId,
            name: `666TS Pattern ${num}`,
            notes: [],
          },
        },
      };
    });
  }, [updateSeqState]);

  const handleDuplicatePattern = useCallback(() => {
    updateSeqState((prev) => {
      const src = prev.patterns[prev.activePatternId];
      let num = prev.patternOrder.length + 1;
      while (prev.patterns[`T${num}`]) num++;
      const newId = `T${num}`;
      const clonedNotes: MidiNote[] = (src?.notes ?? []).map((n, i) => ({
        ...n,
        id: `t6-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      }));
      return {
        ...prev,
        activePatternId: newId,
        patternOrder: [...prev.patternOrder, newId],
        patterns: {
          ...prev.patterns,
          [newId]: {
            id: newId,
            name: src ? `${src.name} Copy` : `666TS Pattern ${num}`,
            notes: clonedNotes,
          },
        },
      };
    });
  }, [updateSeqState]);

  const handleDeletePattern = useCallback(() => {
    updateSeqState((prev) => {
      if (prev.patternOrder.length <= 1) {
        const pid = prev.activePatternId;
        const curr = prev.patterns[pid];
        return {
          ...prev,
          patterns: {
            ...prev.patterns,
            [pid]: { ...(curr ?? { id: pid, name: '666TS Pattern 1' }), notes: [] },
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
  }, [updateSeqState]);

  const updateOscAt = (idx: 0 | 1 | 2, sub: Partial<Ts666Patch['oscillators'][0]>) => {
    updatePatch((prev) => {
      const nextOscs = [...prev.oscillators] as Ts666Patch['oscillators'];
      nextOscs[idx] = { ...nextOscs[idx], ...sub };
      return { ...prev, oscillators: nextOscs };
    });
  };

  return (
    <Ts666ModProvider>
      <div className="flex flex-col h-full w-full bg-[#0A0604] text-[#F5E6D3] overflow-hidden select-none">
        {/* TOP TOOLBAR (Compact Responsive Single-Line Header with Instant Screen Switcher) */}
        <header className="flex items-center justify-between gap-1 px-1.5 h-9 bg-[#150E09] border-b border-[#5C3E24] shrink-0 overflow-hidden">
          <div className="flex items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={onBack}
              title="Back to Studio"
              className="inline-flex items-center gap-1 px-1.5 h-6 rounded bg-[#26180E] hover:bg-[#362215] border border-[#6B4829] text-[10px] font-display font-bold text-[#F5D3B3] cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3 h-3 text-[#EF4444]" />
              <span className="hidden lg:inline">BACK</span>
            </button>

            <span className="font-display text-xs lg:text-sm font-black tracking-widest text-[#EF4444] drop-shadow whitespace-nowrap shrink-0">
              666TS
            </span>

            {onTogglePlay && (
              <Ts666QuickTransport
                bpm={bpm}
                isPlayingProp={isPlayingProp}
                onTogglePlay={onTogglePlay}
              />
            )}

            {routing && onChangeRouting && (
              <PluginChannelStrip
                plugin="ts666"
                routing={routing}
                onChangeRouting={onChangeRouting}
                variant="header"
                accent="rose"
              />
            )}
          </div>

          {/* Segmented Screen Switcher: SYNTHESIS | CONTROL & FX */}
          <nav
            aria-label="666TS Screen Navigation"
            className="flex items-center bg-[#0B0604] border border-[#6B4829] rounded p-[2px] shrink-0 shadow-inner"
          >
            <button
              type="button"
              aria-pressed={activeScreen === 'synthesis'}
              onClick={() => setActiveScreen('synthesis')}
              style={{ touchAction: 'manipulation' }}
              className={`px-2 md:px-3 h-6 rounded text-[9.5px] font-display font-extrabold tracking-wider cursor-pointer whitespace-nowrap transition-colors ${
                activeScreen === 'synthesis'
                  ? 'bg-gradient-to-b from-[#EF4444] to-[#B91C1C] text-white shadow'
                  : 'text-[#C6A17D] hover:text-[#F5D3B3]'
              }`}
            >
              SYNTHESIS
            </button>
            <span className="text-[#5C3E24] px-0.5 text-[10px] select-none">|</span>
            <button
              type="button"
              aria-pressed={activeScreen === 'control'}
              onClick={() => setActiveScreen('control')}
              style={{ touchAction: 'manipulation' }}
              className={`px-2 md:px-3 h-6 rounded text-[9.5px] font-display font-extrabold tracking-wider cursor-pointer whitespace-nowrap transition-colors ${
                activeScreen === 'control'
                  ? 'bg-gradient-to-b from-[#EF4444] to-[#B91C1C] text-white shadow'
                  : 'text-[#C6A17D] hover:text-[#F5D3B3]'
              }`}
            >
              CONTROL & FX
            </button>
          </nav>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setWtEditorOscIdx(0)}
              title="Open Wavetable Editor"
              className="inline-flex items-center gap-1 px-1.5 h-6 rounded bg-[#26180E] hover:bg-[#362215] border border-[#6B4829] text-[9.5px] font-display font-bold text-[#E08A3C] cursor-pointer whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="w-3 h-3 text-[#EF4444]" />
              <span className="hidden xl:inline">WT EDIT</span>
              <span className="xl:hidden">WT</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPianoRoll(true)}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1 px-1.5 h-6 rounded bg-[#D97724] hover:bg-[#E08A3C] text-[#140B05] font-display font-bold text-[9.5px] cursor-pointer whitespace-nowrap shrink-0"
            >
              <ListMusic className="w-3 h-3 shrink-0" />
              <span className="hidden lg:inline">PIANO ROLL</span>
              <span className="lg:hidden">ROLL</span>
            </button>

            {onChangeDeviceFx && (
              <button
                type="button"
                aria-pressed={showDeviceRack}
                onClick={() => setShowDeviceRack((s) => !s)}
                style={{ touchAction: 'manipulation' }}
                className={`inline-flex items-center gap-1 px-1.5 h-6 rounded border font-display font-bold text-[9.5px] cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  showDeviceRack
                    ? 'bg-[#DC2626]/25 border-[#EF4444] text-[#FCA5A5]'
                    : 'bg-[#26180E] border-[#6B4829] text-[#F5D3B3]'
                }`}
              >
                <Sparkles className="w-3 h-3 text-[#EF4444] shrink-0" />
                <span className="hidden lg:inline">BUS FX</span>
                <span className="lg:hidden">BUS</span>
                {deviceFx.length > 0 ? `(${deviceFx.length})` : ''}
              </button>
            )}

            <button
              type="button"
              onClick={() => setPresetsOpen(true)}
              className="inline-flex items-center gap-1 px-1.5 h-6 rounded bg-[#26180E] hover:bg-[#362215] border border-[#6B4829] text-[9.5px] font-mono-num text-[#F5D3B3] cursor-pointer whitespace-nowrap shrink-0"
            >
              <FolderOpen className="w-3 h-3 text-[#EF4444] shrink-0" />
              <span className="max-w-[60px] md:max-w-[84px] lg:max-w-[116px] truncate">
                {patch.name}
              </span>
            </button>

            <button
              type="button"
              onClick={() => updatePatch(createCleanBassInit666())}
              title="Reset to CLEAN BASS INIT"
              className="inline-flex items-center gap-0.5 px-1.5 h-6 rounded bg-[#26180E] hover:bg-[#362215] border border-[#6B4829] text-[9px] font-mono-num text-[#E08A3C] cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span className="hidden xl:inline">INIT</span>
            </button>

            <button
              type="button"
              onClick={handleToggleKeyboard}
              title="Toggle Bottom Piano Keyboard"
              className={`inline-flex items-center gap-1 px-1.5 h-6 rounded border text-[9px] font-mono-num font-bold cursor-pointer whitespace-nowrap shrink-0 ${
                keyboardVisible
                  ? 'bg-[#DC2626]/25 border-[#EF4444] text-[#FCA5A5]'
                  : 'bg-[#1D120B] border-[#543720] text-[#9A7858]'
              }`}
            >
              <Keyboard className="w-3 h-3" />
              <span className="hidden xl:inline">{keyboardVisible ? 'KEYS' : 'NO KEYS'}</span>
            </button>

            <button
              type="button"
              onClick={() => sixSixSixEngine.panic()}
              title="666TS Panic (All Notes Off)"
              className="w-6 h-6 rounded bg-[#26180E] border border-[#6B4829] flex items-center justify-center text-[#F5D3B3] hover:text-[#EF4444] cursor-pointer shrink-0"
            >
              <VolumeX className="w-3 h-3" />
            </button>

            <button
              type="button"
              onClick={onToggleFullscreen}
              title="Toggle Fullscreen Landscape"
              className="w-6 h-6 rounded bg-[#26180E] border border-[#6B4829] flex items-center justify-center text-[#F5D3B3] hover:text-[#E08A3C] cursor-pointer shrink-0"
            >
              {isFullscreen ? (
                <Minimize2 className="w-3 h-3" />
              ) : (
                <Maximize2 className="w-3 h-3" />
              )}
            </button>
          </div>
        </header>

        {/* PERSISTENT DUAL-SCREEN WORKSPACE (Instant switch, zero engine reload, zero audio interruption) */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* SCREEN 1 — SYNTHESIS: ONLY OSC A/B/C, FILTER 1/2, ENVELOPES (ENV 1–4) + Fixed Bottom Piano Keyboard */}
          <div
            aria-label="666TS Synthesis Screen"
            className={
              activeScreen === 'synthesis'
                ? 'flex-1 min-h-0 flex flex-col overflow-hidden'
                : 'hidden'
            }
          >
            <main className="flex-1 min-h-0 p-1.5 grid grid-rows-[minmax(0,1.08fr)_minmax(0,0.92fr)] gap-1.5 overflow-hidden">
              {/* Row 1: OSC A | OSC B | OSC C */}
              <section
                aria-label="Oscillators A B C"
                className="grid grid-cols-3 gap-1.5 min-h-0 min-w-0 overflow-hidden"
              >
                <div className="min-h-0 min-w-0 overflow-hidden">
                  <Ts666OscPanel
                    osc={patch.oscillators[0]}
                    onChangeOsc={(sub) => updateOscAt(0, sub)}
                    onLoadCustomSample={(f) => handleLoadCustomSample('A', f)}
                    onOpenWavetableEditor={() => setWtEditorOscIdx(0)}
                  />
                </div>
                <div className="min-h-0 min-w-0 overflow-hidden">
                  <Ts666OscPanel
                    osc={patch.oscillators[1]}
                    onChangeOsc={(sub) => updateOscAt(1, sub)}
                    onLoadCustomSample={(f) => handleLoadCustomSample('B', f)}
                    onOpenWavetableEditor={() => setWtEditorOscIdx(1)}
                  />
                </div>
                <div className="min-h-0 min-w-0 overflow-hidden">
                  <Ts666OscPanel
                    osc={patch.oscillators[2]}
                    onChangeOsc={(sub) => updateOscAt(2, sub)}
                    onLoadCustomSample={(f) => handleLoadCustomSample('C', f)}
                    onOpenWavetableEditor={() => setWtEditorOscIdx(2)}
                  />
                </div>
              </section>

              {/* Row 2: FILTER 1 + FILTER 2 | ENVELOPES (ENV 1–4) */}
              <section
                aria-label="Filters and Envelopes"
                className="grid grid-cols-12 gap-1.5 min-h-0 min-w-0 overflow-hidden"
              >
                <div className="col-span-7 min-h-0 min-w-0 overflow-hidden">
                  <Ts666DualFilterPanel
                    filters={patch.filters}
                    filterRouting={patch.filterRouting}
                    filterLink={patch.filterLink}
                    onChangeFilter={(idx, sub) =>
                      updatePatch((prev) => {
                        const nextF = [...prev.filters] as Ts666Patch['filters'];
                        nextF[idx] = { ...nextF[idx], ...sub };
                        return { ...prev, filters: nextF };
                      })
                    }
                    onChangeRouting={(filterRouting) =>
                      updatePatch((prev) => ({ ...prev, filterRouting }))
                    }
                    onToggleLink={() =>
                      updatePatch((prev) => ({ ...prev, filterLink: !prev.filterLink }))
                    }
                  />
                </div>

                <div className="col-span-5 min-h-0 min-w-0 overflow-hidden">
                  <Ts666EnvEditor
                    envelopes={patch.envelopes}
                    selectedEnvIdx={selectedEnvIdx}
                    onSelectEnv={setSelectedEnvIdx}
                    onChangeEnv={(idx, sub) =>
                      updatePatch((prev) => {
                        const nextEnvs = [...prev.envelopes] as Ts666Patch['envelopes'];
                        nextEnvs[idx] = { ...nextEnvs[idx], ...sub };
                        return { ...prev, envelopes: nextEnvs };
                      })
                    }
                    onAssignMod={handleAssignMod}
                  />
                </div>
              </section>
            </main>

            {/* Fixed Bottom Piano Keyboard strictly separated from Synthesis panels */}
            <Ts666Keyboard
              keyboardOnly
              pitchBendValue={patch.performance.pitchBendValue}
              modWheelValue={patch.performance.modWheelValue}
              keyboardVisible={keyboardVisible}
              onChangePitchBend={(pitchBendValue) =>
                updatePatch((prev) => ({
                  ...prev,
                  performance: { ...prev.performance, pitchBendValue },
                }))
              }
              onChangeModWheel={(modWheelValue) =>
                updatePatch((prev) => ({
                  ...prev,
                  performance: { ...prev.performance, modWheelValue },
                }))
              }
              onNoteOn={(midi, vel) => {
                studioAudio.unlockSync();
                void sixSixSixEngine.noteOn(midi, vel);
                midiBus.emit({
                  type: 'noteOn',
                  source: 'keyboard',
                  midi,
                  velocity: vel,
                  target: 'ts666',
                });
              }}
              onNoteOff={(midi) => {
                sixSixSixEngine.noteOff(midi);
                midiBus.emit({
                  type: 'noteOff',
                  source: 'keyboard',
                  midi,
                  target: 'ts666',
                });
              }}
            />
          </div>

          {/* SCREEN 2 — CONTROL & FX: SUB, NOISE, MIXER, LFO 1–10, WONKEY, FX, MOD MATRIX, MACROS, GLOBAL, PERFORMANCE */}
          <main
            aria-label="666TS Control and FX Screen"
            className={
              activeScreen === 'control'
                ? 'flex-1 min-h-0 p-1.5 grid grid-rows-[minmax(0,0.95fr)_minmax(0,1.25fr)_minmax(0,0.80fr)] gap-1.5 overflow-hidden'
                : 'hidden'
            }
          >
            {/* Row 1: SUB | NOISE | MIXER | LFO 1–10 */}
            <section
              aria-label="Sub Noise Mixer and LFOs"
              className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,2.2fr)_minmax(0,3.8fr)_minmax(0,4.3fr)] gap-1.5 min-h-0 min-w-0 overflow-hidden"
            >
              <div className="min-h-0 min-w-0 overflow-hidden">
                <Ts666SubPanel
                  sub={patch.sub}
                  onChangeSub={(sub) =>
                    updatePatch((prev) => ({ ...prev, sub: { ...prev.sub, ...sub } }))
                  }
                />
              </div>

              <div className="min-h-0 min-w-0 overflow-hidden">
                <Ts666NoisePanel
                  noise={patch.noise}
                  onChangeNoise={(noise) =>
                    updatePatch((prev) => ({ ...prev, noise: { ...prev.noise, ...noise } }))
                  }
                  onLoadCustomNoise={handleLoadCustomNoise}
                />
              </div>

              <div className="min-h-0 min-w-0 overflow-hidden">
                <Ts666InlineMixer
                  mix={patch.mix}
                  onChangeMix={(updater) =>
                    updatePatch((prev) => ({ ...prev, mix: updater(prev.mix) }))
                  }
                />
              </div>

              <div className="min-h-0 min-w-0 overflow-hidden">
                <Ts666LfoEditor
                  lfos={patch.lfos}
                  selectedLfoIdx={selectedLfoIdx}
                  onSelectLfo={setSelectedLfoIdx}
                  onChangeLfo={(idx, sub) =>
                    updatePatch((prev) => {
                      const nextLfos = [...prev.lfos];
                      nextLfos[idx] = { ...nextLfos[idx], ...sub };
                      return { ...prev, lfos: nextLfos };
                    })
                  }
                  onAssignMod={handleAssignMod}
                />
              </div>
            </section>

            {/* Row 2: WONKEY | FX | MODULATION MATRIX | MACROS */}
            <section
              aria-label="Wonkey FX Mod Matrix and Macros"
              className="grid grid-cols-[minmax(0,3.6fr)_minmax(0,2.6fr)_minmax(0,3.2fr)_minmax(0,2.6fr)] gap-1.5 min-h-0 min-w-0 overflow-hidden"
            >
              <div className="min-h-0 min-w-0 overflow-hidden">
                <Ts666GrowlPanel
                  fx={patch.fx}
                  activeBus={activeFxBus}
                  bpm={bpm}
                  onChangeFx={(updater) =>
                    updatePatch((prev) => ({ ...prev, fx: updater(prev.fx) }))
                  }
                />
              </div>

              <div className="min-h-0 min-w-0 overflow-hidden">
                <Ts666InlineFxBay
                  fx={patch.fx}
                  activeBus={activeFxBus}
                  onChangeActiveBus={setActiveFxBus}
                  onChangeFx={(updater) =>
                    updatePatch((prev) => ({ ...prev, fx: updater(prev.fx) }))
                  }
                />
              </div>

              <div className="min-h-0 min-w-0 overflow-hidden">
                <Ts666ModMatrixPanel
                  routes={patch.modMatrix}
                  onChangeRoutes={(modMatrix) =>
                    updatePatch((prev) => ({ ...prev, modMatrix }))
                  }
                />
              </div>

              <div className="min-h-0 min-w-0 overflow-hidden">
                <Ts666InlineMacrosPanel
                  macros={patch.macros}
                  onChangeMacro={(idx, sub) =>
                    updatePatch((prev) => ({
                      ...prev,
                      macros: prev.macros.map((m, i) => (i === idx ? { ...m, ...sub } : m)),
                    }))
                  }
                  onAssignMod={handleAssignMod}
                />
              </div>
            </section>

            {/* Row 3: GLOBAL SETTINGS | PERFORMANCE CONTROLS */}
            <section
              aria-label="Global Settings and Performance Controls"
              className="grid grid-cols-2 gap-1.5 min-h-0 min-w-0 overflow-hidden"
            >
              <div className="min-h-0 min-w-0 overflow-hidden">
                <Ts666GlobalSettingsPanel
                  global={patch.global}
                  arp={patch.arp}
                  onChangeGlobal={(updater) =>
                    updatePatch((prev) => ({ ...prev, global: updater(prev.global) }))
                  }
                  onChangeArp={(sub) =>
                    updatePatch((prev) => ({ ...prev, arp: { ...prev.arp, ...sub } }))
                  }
                  onAssignMod={handleAssignMod}
                />
              </div>

              <div className="min-h-0 min-w-0 overflow-hidden">
                <Ts666PerformancePanel
                  performance={patch.performance}
                  onChangePerformance={(sub) =>
                    updatePatch((prev) => ({
                      ...prev,
                      performance: { ...prev.performance, ...sub },
                    }))
                  }
                />
              </div>
            </section>
          </main>
        </div>

        {/* Isolated BUS FX Overlay Drawer (never crushes main synth or overlaps WONKEY) */}
        {showDeviceRack && onChangeDeviceFx && routing && onChangeRouting && (
          <div
            role="dialog"
            aria-label="666TS Bus FX Rack"
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[1px] flex flex-col justify-end"
          >
            <div className="bg-[#150E09] border-t-2 border-[#D97724] shadow-2xl">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#5C3E24] bg-[#1C120B]">
                <span className="font-display text-xs font-extrabold tracking-widest text-[#E08A3C]">
                  666TS STUDIO BUS FX RACK
                </span>
                <button
                  type="button"
                  onClick={() => setShowDeviceRack(false)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#DC2626] hover:bg-[#EF4444] text-white text-[10px] font-display font-bold cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>CLOSE</span>
                </button>
              </div>
              <FxDeviceRack
                activeTrack="ts666"
                modules={deviceFx}
                channelBypass={Boolean(routing.ts666FxBypass)}
                hideTrackTabs
                onChangeModules={(_, next) => onChangeDeviceFx(next)}
                onToggleChannelBypass={() =>
                  onChangeRouting({ ts666FxBypass: !routing.ts666FxBypass })
                }
                onOpenBrowser={() => onOpenEffectsBrowser?.()}
              />
            </div>
          </div>
        )}

        {wtEditorOscIdx !== null && (
          <Ts666WavetableEditor
            oscillators={patch.oscillators}
            initialOscIdx={wtEditorOscIdx}
            onApplyCustomWavetable={handleApplyCustomWavetable}
            onClose={() => setWtEditorOscIdx(null)}
          />
        )}

        <Ts666PresetDrawer
          open={presetsOpen}
          currentPatch={patch}
          factoryPresets={factoryPresets}
          userPresets={userPresets}
          onSelectPreset={(p) => updatePatch(p)}
          onSaveUserPreset={handleSaveUserPreset}
          onDeleteUserPreset={handleDeleteUserPreset}
          onClose={() => setPresetsOpen(false)}
        />

        {showPianoRoll && (
          <Ts666PianoRollView
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
            onTogglePlay={onTogglePlay ?? (() => {})}
            onStop={onStop ?? (() => {})}
            onToggleLoop={onToggleLoop ?? (() => {})}
            onToggleRecord={onToggleRecord ?? (() => {})}
            onChangeBpm={onChangeBpm ?? (() => {})}
            onUpdateNotes={handleUpdateNotes}
            onSelectPattern={(activePatternId) =>
              updateSeqState((prev) => ({ ...prev, activePatternId }))
            }
            onCreatePattern={handleCreatePattern}
            onDuplicatePattern={handleDuplicatePattern}
            onDeletePattern={handleDeletePattern}
          />
        )}
      </div>
    </Ts666ModProvider>
  );
};
