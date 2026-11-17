import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  AudioWaveform,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Keyboard as KeyboardIcon,
  ListMusic,
  Play,
  RotateCcw,
  Settings2,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Square,
  Volume2,
} from 'lucide-react';
import {
  FACTORY_PRESETS,
  clonePatch,
  createCleanBassInitPatch,
  loadUserPresets,
  makeDefaultMacros,
  saveUserPresets,
} from '../audio/presets';
import { BANKS, SLOTS } from '../audio/sequencerStorage';
import { studioAudio } from '../audio/StudioAudio';
import { synthEngine } from '../audio/SynthEngine';
import { useIsPlaying, usePlayheadStep } from '../audio/transportStore';
import type { StudioRoutingConfig } from '../types/beatbox';
import type { MidiNote, PatternBank, SequencerState } from '../types/sequencer';
import type {
  AdsrConfig,
  EffectsConfig,
  FilterConfig,
  LfoConfig,
  LiveModOffsets,
  ModRoute,
  ModSource,
  ModTarget,
  NoiseOscConfig,
  OscillatorConfig,
  PresetCategory,
  SubOscConfig,
  SynthMacro,
  SynthPatch,
} from '../types/synth';
import type { ModularFxInstance } from '../types/fx';
import { EffectsPanel } from './EffectsPanel';
import { FxDeviceRack } from './fx/FxDeviceRack';
import { Keyboard } from './Keyboard';
import { LfoMatrixPanel } from './LfoMatrixPanel';
import { MacroBar } from './MacroBar';
import { ModDragProvider } from './ModDragContext';
import { PluginChannelStrip } from './PluginChannelStrip';
import { PresetDrawer } from './PresetDrawer';
import { SerumGlobalPanel } from './SerumGlobalPanel';
import { SerumMixPanel } from './SerumMixPanel';
import { SerumUnifiedDeck } from './SerumUnifiedDeck';
import { UnifiedPianoRoll, type RollNote } from './UnifiedPianoRoll';

type Serum2Tab = 'osc' | 'mix' | 'fx' | 'matrix' | 'global';

const TABS: {
  id: Serum2Tab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'osc', label: 'OSC', shortLabel: 'OSC', icon: AudioWaveform },
  { id: 'mix', label: 'MIX', shortLabel: 'MIX', icon: SlidersHorizontal },
  { id: 'fx', label: 'FX', shortLabel: 'FX', icon: Sparkles },
  { id: 'matrix', label: 'MATRIX', shortLabel: 'MTX', icon: Activity },
  { id: 'global', label: 'GLOBAL', shortLabel: 'GLB', icon: Settings2 },
];

type SerumViewMode = 'synth' | 'piano-roll';

interface SerumPluginProps {
  patch: SynthPatch;
  seqState: SequencerState;
  routing: StudioRoutingConfig;
  bpm: number;
  loop: boolean;
  isPlaying?: boolean;
  isRecording: boolean;
  playheadStep?: number;
  isFullscreen: boolean;
  modOffsets?: LiveModOffsets;
  lfoPhases?: [number, number, number];
  onChangePatch: (updater: (prev: SynthPatch) => SynthPatch) => void;
  onChangeSeqState: (updater: (prev: SequencerState) => SequencerState) => void;
  onChangeRouting: (patch: Partial<StudioRoutingConfig>) => void;
  onChangeBpm: (bpm: number) => void;
  onToggleLoop: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleRecord: () => void;
  onToggleFullscreen: () => void;
  onBack?: () => void;
  initialPianoRoll?: boolean;
  deviceFx?: ModularFxInstance[];
  onChangeDeviceFx?: (next: ModularFxInstance[]) => void;
  onOpenEffectsBrowser?: () => void;
}

const SerumQuickPlayButton: React.FC<{
  isPlayingProp?: boolean;
  onTogglePlay: () => void;
}> = React.memo(({ isPlayingProp, onTogglePlay }) => {
  const storeIsPlaying = useIsPlaying();
  const isPlaying = isPlayingProp ?? storeIsPlaying;
  return (
    <button
      type="button"
      title={isPlaying ? 'Stop Pattern' : 'Play Active Pattern'}
      aria-label={isPlaying ? 'Stop Pattern' : 'Play Active Pattern'}
      onClick={onTogglePlay}
      className={`hidden sm:flex w-8 h-8 rounded-md border items-center justify-center transition-colors cursor-pointer shrink-0 ${
        isPlaying
          ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
          : 'bg-[#0B0E14] border-[#242E40] text-slate-400 hover:text-emerald-300'
      }`}
    >
      {isPlaying ? (
        <Square className="w-3.5 h-3.5 fill-current" />
      ) : (
        <Play className="w-3.5 h-3.5 fill-current" />
      )}
    </button>
  );
});

const SerumPianoRollView: React.FC<{
  notes: RollNote[];
  bpm: number;
  loop: boolean;
  isPlayingProp?: boolean;
  isRecording: boolean;
  playheadStepProp?: number;
  isFullscreen: boolean;
  seqState: SequencerState;
  onBack: () => void;
  onToggleFullscreen: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onToggleRecord: () => void;
  onChangeBpm: (bpm: number) => void;
  onUpdateNotes: (updater: RollNote[] | ((prev: RollNote[]) => RollNote[])) => void;
  onCreatePattern: () => void;
  onDuplicatePattern: () => void;
  onDeletePattern: () => void;
  onSelectSerumBank: (bank: PatternBank) => void;
  onSelectSerumSlot: (slot: number) => void;
}> = React.memo((props) => {
  const storeIsPlaying = useIsPlaying();
  const storePlayheadStep = usePlayheadStep();
  return (
    <UnifiedPianoRoll
      mode="serum"
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
      onCreatePattern={props.onCreatePattern}
      onDuplicatePattern={props.onDuplicatePattern}
      onDeletePattern={props.onDeletePattern}
      serumActiveBank={props.seqState.activeBank}
      serumActiveSlot={props.seqState.activeSlot}
      serumPatterns={props.seqState.patterns}
      onSelectSerumBank={props.onSelectSerumBank}
      onSelectSerumSlot={props.onSelectSerumSlot}
    />
  );
});

export const SerumPlugin: React.FC<SerumPluginProps> = React.memo(({
  patch,
  seqState,
  routing,
  bpm,
  loop,
  isPlaying: isPlayingProp,
  isRecording,
  playheadStep: playheadStepProp,
  isFullscreen,
  modOffsets,
  lfoPhases,
  onChangePatch,
  onChangeSeqState,
  onChangeRouting,
  onChangeBpm,
  onToggleLoop,
  onTogglePlay,
  onStop,
  onToggleRecord,
  onToggleFullscreen,
  onBack,
  initialPianoRoll = false,
  deviceFx = [],
  onChangeDeviceFx,
  onOpenEffectsBrowser,
}) => {
  const [userPresets, setUserPresets] = useState<SynthPatch[]>(() => loadUserPresets());
  const [viewMode, setViewMode] = useState<SerumViewMode>(() =>
    initialPianoRoll ? 'piano-roll' : 'synth'
  );
  const [activeTab, setActiveTab] = useState<Serum2Tab>('osc');
  const [showKeyboard, setShowKeyboard] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerHeight >= 680 : false
  );
  const [showMacros, setShowMacros] = useState<boolean>(true);
  const [showDeviceRack, setShowDeviceRack] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialPianoRoll) {
      setViewMode('piano-roll');
    }
  }, [initialPianoRoll]);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current !== null) {
        clearTimeout(previewTimerRef.current);
      }
    };
  }, []);

  const allPresets = useMemo(
    () => [...FACTORY_PRESETS, ...userPresets],
    [userPresets]
  );

  const updateOscillator = useCallback(
    (index: 0 | 1 | 2, oscPatch: Partial<OscillatorConfig>) => {
      onChangePatch((prev) => {
        const nextOscs: [OscillatorConfig, OscillatorConfig, OscillatorConfig] = [
          ...prev.oscillators,
        ] as [OscillatorConfig, OscillatorConfig, OscillatorConfig];
        nextOscs[index] = { ...nextOscs[index], ...oscPatch };
        return { ...prev, oscillators: nextOscs };
      });
    },
    [onChangePatch]
  );

  const updateSubOsc = useCallback(
    (subPatch: Partial<SubOscConfig>) => {
      onChangePatch((prev) => ({
        ...prev,
        subOsc: { ...prev.subOsc, ...subPatch },
      }));
    },
    [onChangePatch]
  );

  const updateNoiseOsc = useCallback(
    (noisePatch: Partial<NoiseOscConfig>) => {
      onChangePatch((prev) => ({
        ...prev,
        noiseOsc: { ...prev.noiseOsc, ...noisePatch },
      }));
    },
    [onChangePatch]
  );

  const updateFilter = useCallback(
    (filterPatch: Partial<FilterConfig>) => {
      onChangePatch((prev) => ({
        ...prev,
        filter: { ...prev.filter, ...filterPatch },
      }));
    },
    [onChangePatch]
  );

  const updateAmpEnv = useCallback(
    (envPatch: Partial<AdsrConfig>) => {
      onChangePatch((prev) => ({
        ...prev,
        ampEnv: { ...prev.ampEnv, ...envPatch },
      }));
    },
    [onChangePatch]
  );

  const updateModEnv = useCallback(
    (envPatch: Partial<AdsrConfig>) => {
      onChangePatch((prev) => ({
        ...prev,
        modEnv: { ...prev.modEnv, ...envPatch },
      }));
    },
    [onChangePatch]
  );

  const updateLfo = useCallback(
    (index: 0 | 1 | 2, lfoPatch: Partial<LfoConfig>) => {
      onChangePatch((prev) => {
        const nextLfos: [LfoConfig, LfoConfig, LfoConfig] = [
          ...prev.lfos,
        ] as [LfoConfig, LfoConfig, LfoConfig];
        nextLfos[index] = { ...nextLfos[index], ...lfoPatch };
        return { ...prev, lfos: nextLfos };
      });
    },
    [onChangePatch]
  );

  const updateModMatrix = useCallback(
    (routes: ModRoute[]) => {
      onChangePatch((prev) => ({ ...prev, modMatrix: routes }));
    },
    [onChangePatch]
  );

  const handleAssignModRoute = useCallback(
    (source: ModSource, target: ModTarget) => {
      onChangePatch((prev) => {
        const existingIdx = prev.modMatrix.findIndex(
          (r) => r.source === source && r.target === target
        );
        if (existingIdx !== -1) {
          const next = [...prev.modMatrix];
          const curr = next[existingIdx];
          next[existingIdx] = {
            ...curr,
            enabled: true,
            amount: Math.abs(curr.amount) < 0.05 ? 0.5 : curr.amount,
          };
          return { ...prev, modMatrix: next };
        }
        const newRoute: ModRoute = {
          id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          enabled: true,
          source,
          target,
          amount: 0.5,
        };
        return { ...prev, modMatrix: [...prev.modMatrix, newRoute] };
      });
    },
    [onChangePatch]
  );

  const updateEffects = useCallback(
    (fxPatch: Partial<EffectsConfig>) => {
      onChangePatch((prev) => ({
        ...prev,
        effects: { ...prev.effects, ...fxPatch },
      }));
    },
    [onChangePatch]
  );

  const updateMasterVolume = useCallback(
    (volume: number) => {
      onChangePatch((prev) => ({
        ...prev,
        master: { ...prev.master, volume },
      }));
    },
    [onChangePatch]
  );

  const updateGlideMs = useCallback(
    (glideMs: number) => {
      onChangePatch((prev) => ({
        ...prev,
        master: { ...prev.master, glideMs },
      }));
    },
    [onChangePatch]
  );

  const updatePitchBendRange = useCallback(
    (pitchBendRange: number) => {
      onChangePatch((prev) => ({
        ...prev,
        master: { ...prev.master, pitchBendRange },
      }));
    },
    [onChangePatch]
  );

  const handleUpdateMacro = useCallback(
    (macroId: 1 | 2 | 3 | 4, updater: (prev: SynthMacro) => SynthMacro) => {
      onChangePatch((prev) => {
        const baseMacros = prev.macros ?? makeDefaultMacros();
        const nextMacros = baseMacros.map((m) =>
          m.id === macroId ? updater(m) : m
        ) as [SynthMacro, SynthMacro, SynthMacro, SynthMacro];
        return { ...prev, macros: nextMacros };
      });
    },
    [onChangePatch]
  );

  const stepPreset = (dir: -1 | 1) => {
    const idx = allPresets.findIndex((p) => p.id === patch.id);
    const currentIdx = idx === -1 ? 0 : idx;
    const nextIdx = (currentIdx + dir + allPresets.length) % allPresets.length;
    onChangePatch(() => clonePatch(allPresets[nextIdx]));
  };

  const handlePreviewPreset = useCallback(
    async (targetPatch?: SynthPatch) => {
      studioAudio.unlockSync();
      if (previewTimerRef.current !== null) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      synthEngine.panic();

      let auditionPatch = patch;
      if (targetPatch) {
        auditionPatch = clonePatch(targetPatch);
        synthEngine.setPatch(auditionPatch);
        onChangePatch(() => auditionPatch);
      }

      setPreviewingId(auditionPatch.id);

      try {
        const ctx = await synthEngine.ensureAudio();
        const stepSec = Math.max(0.11, Math.min(0.18, 60 / Math.max(80, bpm) / 4));
        const t0 = ctx.currentTime + 0.015;
        const rootMidi = auditionPatch.category === 'Lead' || auditionPatch.category === 'Keys' ? 60 : 41;
        const secondMidi = rootMidi + 3;

        await synthEngine.scheduleNote(rootMidi, 0.94, t0, t0 + stepSec * 3.2);
        await synthEngine.scheduleNote(secondMidi, 0.9, t0 + stepSec * 3.6, t0 + stepSec * 7.2);

        const totalMs = Math.round(stepSec * 7.6 * 1000);
        previewTimerRef.current = window.setTimeout(() => {
          previewTimerRef.current = null;
          setPreviewingId(null);
        }, totalMs);
      } catch {
        setPreviewingId(null);
      }
    },
    [bpm, onChangePatch, patch]
  );

  const handleSaveNewPreset = (
    name: string,
    category: PresetCategory,
    sourcePatch?: SynthPatch
  ) => {
    const baseSource = sourcePatch ?? patch;
    const newPreset: SynthPatch = clonePatch({
      ...baseSource,
      id: `user-${Date.now()}`,
      name,
      category,
      isFactory: false,
    });
    const nextUser = [newPreset, ...userPresets];
    setUserPresets(nextUser);
    saveUserPresets(nextUser);
    onChangePatch(() => newPreset);
  };

  const handleUpdateActivePreset = () => {
    if (patch.isFactory) return;
    const updated = clonePatch({ ...patch, isFactory: false });
    const exists = userPresets.some((p) => p.id === updated.id);
    const nextUser = exists
      ? userPresets.map((p) => (p.id === updated.id ? updated : p))
      : [updated, ...userPresets];
    setUserPresets(nextUser);
    saveUserPresets(nextUser);
    onChangePatch(() => updated);
  };

  const handleRenamePreset = (
    id: string,
    name: string,
    category: PresetCategory
  ) => {
    const nextUser = userPresets.map((p) =>
      p.id === id ? clonePatch({ ...p, name, category, isFactory: false }) : p
    );
    setUserPresets(nextUser);
    saveUserPresets(nextUser);
    if (patch.id === id) {
      onChangePatch((prev) => ({ ...prev, name, category }));
    }
  };

  const handleDeletePreset = (id: string) => {
    const nextUser = userPresets.filter((p) => p.id !== id);
    setUserPresets(nextUser);
    saveUserPresets(nextUser);
    if (patch.id === id) {
      onChangePatch(() => clonePatch(FACTORY_PRESETS[0]));
    }
  };

  const handleImportPresets = (imported: SynthPatch[]) => {
    const nextUser = [...imported, ...userPresets];
    setUserPresets(nextUser);
    saveUserPresets(nextUser);
    onChangePatch(() => clonePatch(imported[0]));
  };

  const handleInitPatch = () => {
    synthEngine.panic();
    onChangePatch(() =>
      createCleanBassInitPatch({
        id: `init-${Date.now()}`,
        name: 'CLEAN BASS INIT',
        isFactory: false,
      })
    );
  };

  const handleSelectBank = useCallback(
    (activeBank: PatternBank) => {
      onChangeSeqState((prev) => ({ ...prev, activeBank }));
    },
    [onChangeSeqState]
  );

  const handleSelectSlot = useCallback(
    (activeSlot: number) => {
      onChangeSeqState((prev) => ({ ...prev, activeSlot }));
    },
    [onChangeSeqState]
  );

  const handleUpdateNotes = useCallback(
    (updater: RollNote[] | ((prev: RollNote[]) => RollNote[])) => {
      onChangeSeqState((prev) => {
        const pid = `${prev.activeBank}${prev.activeSlot}`;
        const existing = prev.patterns[pid] ?? {
          id: pid,
          bank: prev.activeBank,
          slot: prev.activeSlot,
          notes: [],
        };
        const rawNext =
          typeof updater === 'function' ? updater(existing.notes) : updater;
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
            [pid]: { ...existing, notes: cleanNotes },
          },
        };
      });
    },
    [onChangeSeqState]
  );

  const handleCreateSerumPattern = useCallback(() => {
    onChangeSeqState((prev) => {
      // Find first empty slot in active bank, then across all banks
      for (const s of SLOTS) {
        const pid = `${prev.activeBank}${s}`;
        if ((prev.patterns[pid]?.notes.length ?? 0) === 0) {
          return { ...prev, activeSlot: s };
        }
      }
      for (const b of BANKS) {
        for (const s of SLOTS) {
          const pid = `${b}${s}`;
          if ((prev.patterns[pid]?.notes.length ?? 0) === 0) {
            return { ...prev, activeBank: b, activeSlot: s };
          }
        }
      }
      const nextSlot = (prev.activeSlot % 16) + 1;
      const pid = `${prev.activeBank}${nextSlot}`;
      return {
        ...prev,
        activeSlot: nextSlot,
        patterns: {
          ...prev.patterns,
          [pid]: { id: pid, bank: prev.activeBank, slot: nextSlot, notes: [] },
        },
      };
    });
  }, [onChangeSeqState]);

  const handleDuplicateSerumPattern = useCallback(() => {
    onChangeSeqState((prev) => {
      const srcPid = `${prev.activeBank}${prev.activeSlot}`;
      const srcNotes = prev.patterns[srcPid]?.notes ?? [];
      let targetBank = prev.activeBank;
      let targetSlot = (prev.activeSlot % 16) + 1;

      let found = false;
      for (const s of SLOTS) {
        const pid = `${prev.activeBank}${s}`;
        if ((prev.patterns[pid]?.notes.length ?? 0) === 0) {
          targetBank = prev.activeBank;
          targetSlot = s;
          found = true;
          break;
        }
      }
      if (!found) {
        for (const b of BANKS) {
          for (const s of SLOTS) {
            const pid = `${b}${s}`;
            if ((prev.patterns[pid]?.notes.length ?? 0) === 0) {
              targetBank = b;
              targetSlot = s;
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }

      const dstPid = `${targetBank}${targetSlot}`;
      const cloned: MidiNote[] = srcNotes.map((n, i) => ({
        ...n,
        id: `sr-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      }));
      return {
        ...prev,
        activeBank: targetBank,
        activeSlot: targetSlot,
        patterns: {
          ...prev.patterns,
          [dstPid]: { id: dstPid, bank: targetBank, slot: targetSlot, notes: cloned },
        },
      };
    });
  }, [onChangeSeqState]);

  const handleDeleteSerumPattern = useCallback(() => {
    handleUpdateNotes([]);
  }, [handleUpdateNotes]);

  const activeSerumPid = `${seqState.activeBank}${seqState.activeSlot}`;
  const activeSerumNotes = seqState.patterns[activeSerumPid]?.notes ?? [];

  return (
    <ModDragProvider onAssignModRoute={handleAssignModRoute}>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[#12151B]">
        {/* SERUM 2 HEADER BAR */}
        {viewMode === 'synth' && (
          <div className="flex items-center justify-between gap-1.5 sm:gap-2 px-2 h-10 bg-[#181B22] border-b border-[#2D3442] shrink-0 overflow-x-auto synth-scroll">
            <div className="flex items-center gap-2 shrink-0">
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
                SERUM <span className="text-[#2EE59D]">2</span>
              </span>
              <PluginChannelStrip
                plugin="serum"
                routing={routing}
                onChangeRouting={onChangeRouting}
                variant="header"
                accent="cyan"
              />
            </div>

            {/* Serum 2 Navigation Tabs: OSC | MIX | FX | MATRIX | GLOBAL */}
            <nav
              aria-label="Serum 2 Modules"
              className="flex items-center gap-0.5 bg-[#0E1116] p-0.5 rounded-md border border-[#2D3442] shrink-0 relative z-10"
            >
              {TABS.map((tab) => {
                const active = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    aria-pressed={active}
                    aria-current={active ? 'page' : undefined}
                    title={`Switch to ${tab.label}`}
                    style={{ touchAction: 'manipulation' }}
                    className={`relative inline-flex items-center justify-center gap-1 px-2 sm:px-2.5 h-7.5 rounded text-[10.5px] sm:text-[11px] font-display font-bold tracking-wider transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#252B36] text-[#2EE59D] border border-[#2EE59D]/50'
                        : 'text-slate-300 border border-transparent hover:bg-[#1C2029] hover:text-white'
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        active ? 'text-[#2EE59D]' : 'text-slate-400'
                      }`}
                    />
                    <span className="md:hidden">{tab.shortLabel}</span>
                    <span className="hidden md:inline">{tab.label}</span>
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-0.5 left-2 right-2 h-0.5 rounded-full bg-[#2EE59D]"
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Keys Toggle, Piano Roll, Presets, Quick Play */}
            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 shrink">
              {activeTab !== 'osc' && (
                <button
                  type="button"
                  onClick={() => setShowMacros((m) => !m)}
                  aria-pressed={showMacros}
                  title={showMacros ? 'Hide Macro Strip' : 'Show Macro Strip'}
                  className={`inline-flex items-center gap-1 px-2 h-8 rounded-md border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    showMacros
                      ? 'bg-[#2EE59D]/15 border-[#2EE59D]/55 text-[#2EE59D]'
                      : 'bg-[#0E1116] border-[#2D3442] text-slate-300 hover:text-white hover:border-slate-500'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden lg:inline">Macros</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowKeyboard((s) => !s)}
                aria-pressed={showKeyboard}
                title={showKeyboard ? 'Hide Piano Keyboard' : 'Show Piano Keyboard'}
                className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 h-8 rounded-md border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  showKeyboard
                    ? 'bg-[#2EE59D]/15 border-[#2EE59D]/55 text-[#2EE59D]'
                    : 'bg-[#0E1116] border-[#2D3442] text-slate-300 hover:text-white hover:border-slate-500'
                }`}
              >
                <KeyboardIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">
                  {showKeyboard ? 'Hide Keys' : 'Show Keys'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('piano-roll')}
                className="inline-flex items-center gap-1.5 px-2 sm:px-3 h-8 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-[11px] tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0"
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
                  className={`inline-flex items-center gap-1 px-2 sm:px-2.5 h-8 rounded-md border text-[11px] font-display font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    showDeviceRack
                      ? 'bg-[#2EE59D]/18 border-[#2EE59D]/60 text-[#2EE59D]'
                      : 'bg-[#0E1116] border-[#2D3442] text-slate-200 hover:border-[#2EE59D]/45'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#2EE59D] shrink-0" />
                  <span>EFFECTS{deviceFx.length > 0 ? ` (${deviceFx.length})` : ''}</span>
                </button>
              )}

              <div className="flex items-center rounded-md bg-[#0E1116] border border-[#2D3442] overflow-hidden min-w-0 shrink">
                <button
                  type="button"
                  aria-label="Previous preset"
                  onClick={() => stepPreset(-1)}
                  className="w-6 sm:w-7 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#1C2029] cursor-pointer shrink-0"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="flex items-center gap-1 px-1.5 sm:px-2 h-8 text-[11px] sm:text-xs font-medium text-slate-100 hover:text-[#2EE59D] max-w-[68px] sm:max-w-[115px] md:max-w-[140px] cursor-pointer min-w-0"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[#2EE59D] shrink-0" />
                  <span className="truncate">{patch.name}</span>
                </button>
                <button
                  type="button"
                  aria-label="Next preset"
                  onClick={() => stepPreset(1)}
                  className="w-6 sm:w-7 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#1C2029] cursor-pointer shrink-0"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handlePreviewPreset()}
                title="Preview active preset via live synthesis"
                aria-label="Preview active preset"
                className={`inline-flex items-center gap-1 px-2 h-8 rounded-md border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  previewingId === patch.id
                    ? 'bg-[#2EE59D]/20 border-[#2EE59D] text-[#2EE59D]'
                    : 'bg-[#0E1116] border-[#2D3442] text-slate-200 hover:border-[#2EE59D]/55 hover:text-[#2EE59D]'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden lg:inline">Preview</span>
              </button>

              <SerumQuickPlayButton
                isPlayingProp={isPlayingProp}
                onTogglePlay={onTogglePlay}
              />

              <button
                type="button"
                title="Reset to CLEAN BASS INIT"
                aria-label="Reset to CLEAN BASS INIT"
                onClick={handleInitPatch}
                className="hidden xl:flex w-8 h-8 rounded-md bg-[#0E1116] border border-[#2D3442] items-center justify-center text-slate-400 hover:text-slate-100 hover:border-slate-500 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* SERUM 2 WORKSPACE OR TRUE-FULLSCREEN PIANO ROLL */}
        {viewMode === 'synth' ? (
          <>
            <main
              className={`flex-1 min-h-0 ${
                activeTab === 'osc' || activeTab === 'mix'
                  ? 'overflow-hidden p-1.5'
                  : 'overflow-y-auto synth-scroll p-2 sm:p-3'
              }`}
            >
              <div
                className={`h-full ${
                  activeTab === 'osc' || activeTab === 'mix'
                    ? 'w-full'
                    : 'max-w-[1600px] mx-auto'
                }`}
              >
                {activeTab === 'osc' && (
                  <SerumUnifiedDeck
                    patch={patch}
                    bpm={bpm}
                    modOffsets={modOffsets}
                    lfoPhases={lfoPhases}
                    onChangeOsc={updateOscillator}
                    onChangeSubOsc={updateSubOsc}
                    onChangeNoiseOsc={updateNoiseOsc}
                    onChangeFilter={updateFilter}
                    onChangeAmpEnv={updateAmpEnv}
                    onChangeModEnv={updateModEnv}
                    onChangeLfo={updateLfo}
                    onChangeGlideMs={updateGlideMs}
                    onChangeMasterVolume={updateMasterVolume}
                    onChangePitchBendRange={updatePitchBendRange}
                    onChangeMacro={handleUpdateMacro}
                    onOpenMatrix={() => setActiveTab('matrix')}
                  />
                )}

                {activeTab === 'mix' && (
                  <SerumMixPanel
                    patch={patch}
                    modOffsets={modOffsets}
                    onChangeOsc={updateOscillator}
                    onChangeSubOsc={updateSubOsc}
                    onChangeNoiseOsc={updateNoiseOsc}
                    onChangeFilter={updateFilter}
                    onChangeMasterVolume={updateMasterVolume}
                    onChangeGlideMs={updateGlideMs}
                    onChangePitchBendRange={updatePitchBendRange}
                  />
                )}

                {activeTab === 'fx' && (
                  <EffectsPanel
                    effects={patch.effects}
                    bpm={bpm}
                    modOffsets={modOffsets}
                    onChangeEffects={updateEffects}
                  />
                )}

                {activeTab === 'matrix' && (
                  <LfoMatrixPanel
                    lfos={patch.lfos}
                    lfoPhases={lfoPhases}
                    bpm={bpm}
                    modMatrix={patch.modMatrix}
                    onChangeLfo={updateLfo}
                    onChangeMatrix={updateModMatrix}
                  />
                )}

                {activeTab === 'global' && (
                  <SerumGlobalPanel
                    patch={patch}
                    onChangeOsc={updateOscillator}
                    onChangeMasterVolume={updateMasterVolume}
                    onChangeGlideMs={updateGlideMs}
                    onChangePitchBendRange={updatePitchBendRange}
                    onOpenPresets={() => setDrawerOpen(true)}
                    onInitPatch={handleInitPatch}
                    onOpenMatrix={() => setActiveTab('matrix')}
                  />
                )}
              </div>
            </main>

            {showDeviceRack && onChangeDeviceFx && (
              <FxDeviceRack
                activeTrack="serum"
                modules={deviceFx}
                channelBypass={Boolean(routing.serumFxBypass)}
                hideTrackTabs
                onChangeModules={(_, next) => onChangeDeviceFx(next)}
                onToggleChannelBypass={() =>
                  onChangeRouting({ serumFxBypass: !routing.serumFxBypass })
                }
                onOpenBrowser={() => onOpenEffectsBrowser?.()}
              />
            )}

            {showMacros && activeTab !== 'osc' && (
              <MacroBar
                macros={patch.macros ?? makeDefaultMacros()}
                onChangeMacro={handleUpdateMacro}
              />
            )}

            {showKeyboard && (
              <Keyboard
                compact
                glideMs={patch.master.glideMs}
                masterVolume={patch.master.volume}
                onChangeGlideMs={updateGlideMs}
                onChangeMasterVolume={updateMasterVolume}
              />
            )}
          </>
        ) : (
          <SerumPianoRollView
            notes={activeSerumNotes}
            bpm={bpm}
            loop={loop}
            isPlayingProp={isPlayingProp}
            isRecording={isRecording}
            playheadStepProp={playheadStepProp}
            isFullscreen={isFullscreen}
            seqState={seqState}
            onBack={() => setViewMode('synth')}
            onToggleFullscreen={onToggleFullscreen}
            onTogglePlay={onTogglePlay}
            onStop={onStop}
            onToggleLoop={onToggleLoop}
            onToggleRecord={onToggleRecord}
            onChangeBpm={onChangeBpm}
            onUpdateNotes={handleUpdateNotes}
            onCreatePattern={handleCreateSerumPattern}
            onDuplicatePattern={handleDuplicateSerumPattern}
            onDeletePattern={handleDeleteSerumPattern}
            onSelectSerumBank={handleSelectBank}
            onSelectSerumSlot={handleSelectSlot}
          />
        )}

        <PresetDrawer
          open={drawerOpen}
          activePatch={patch}
          presets={allPresets}
          previewingId={previewingId}
          onClose={() => setDrawerOpen(false)}
          onSelectPreset={(selected) => {
            onChangePatch(() => selected);
          }}
          onPreviewPreset={(target) => {
            void handlePreviewPreset(target);
          }}
          onSaveNewPreset={handleSaveNewPreset}
          onUpdateActivePreset={handleUpdateActivePreset}
          onRenamePreset={handleRenamePreset}
          onDeletePreset={handleDeletePreset}
          onImportPresets={handleImportPresets}
        />
      </div>
    </ModDragProvider>
  );
});
