import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw, X } from 'lucide-react';
import { bassRemixEngine } from './audio/BassRemixEngine';
import { createDefaultBassRemixProjectState } from './audio/bassRemixPresets';
import { beatboxEngine } from './audio/BeatboxEngine';
import { createDefaultBeatboxPianoRollState } from './audio/beatboxPresets';
import {
  createDefaultProjectDeviceFx,
  createFxInstance,
  deleteUserFxChainPreset,
  loadUserFxChainPresets,
} from './audio/fxCatalog';
import { midiBus } from './audio/MidiBus';
import {
  createAndSaveNewProject,
  deleteSavedProject,
  duplicateSavedProject,
  importProjectAsNew,
  loadInitialActiveProject,
  loadProjectById,
  renameSavedProject,
  requestPersistentStorage,
  saveProjectSafe,
} from './audio/projectStorage';
import { syncAndRestoreStudioIndexedDb } from './audio/tarekIndexedDb';
import { sequencerEngine } from './audio/SequencerEngine';
import { getPatternId } from './audio/sequencerStorage';
import { studioAudio } from './audio/StudioAudio';
import { subbassEngine } from './audio/SubbassEngine';
import { createDefaultSubbassSequencerState } from './audio/subbassPresets';
import { synthEngine } from './audio/SynthEngine';
import { sixSixSixEngine } from './audio/ts666/SixSixSixEngine';
import {
  createCleanBassInit666,
  createDefaultTs666SequencerState,
} from './audio/ts666/ts666Presets';
import {
  setMidiActiveState,
  setModTelemetryState,
  setTransportState,
} from './audio/transportStore';
import { HomeLauncher, type LauncherTargetId } from './components/HomeLauncher';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  TarekTransportBar,
  type FullscreenInstrumentId,
  type StudioWorkspaceMode,
} from './components/TarekTransportBar';

const AndroidExportModal = lazy(() =>
  import('./components/AndroidExportModal').then((m) => ({ default: m.AndroidExportModal }))
);
const AudioMonitorModal = lazy(() =>
  import('./components/AudioMonitorModal').then((m) => ({ default: m.AudioMonitorModal }))
);
const BassRemixPlugin = lazy(() =>
  import('./components/bassRemix/BassRemixPlugin').then((m) => ({ default: m.BassRemixPlugin }))
);
const BeatboxPlugin = lazy(() =>
  import('./components/BeatboxPlugin').then((m) => ({ default: m.BeatboxPlugin }))
);
const FxBrowserModal = lazy(() =>
  import('./components/fx/FxBrowserModal').then((m) => ({ default: m.FxBrowserModal }))
);
const FxDeviceRack = lazy(() =>
  import('./components/fx/FxDeviceRack').then((m) => ({ default: m.FxDeviceRack }))
);
const MyProjectsModal = lazy(() =>
  import('./components/MyProjectsModal').then((m) => ({ default: m.MyProjectsModal }))
);
const SequencerPlugin = lazy(() =>
  import('./components/SequencerPlugin').then((m) => ({ default: m.SequencerPlugin }))
);
const SerumPlugin = lazy(() =>
  import('./components/SerumPlugin').then((m) => ({ default: m.SerumPlugin }))
);
const SessionView = lazy(() =>
  import('./components/SessionView').then((m) => ({ default: m.SessionView }))
);
const SubbassPlugin = lazy(() =>
  import('./components/SubbassPlugin').then((m) => ({ default: m.SubbassPlugin }))
);
const SixSixSixPlugin = lazy(() =>
  import('./components/ts666/SixSixSixPlugin').then((m) => ({ default: m.SixSixSixPlugin }))
);

const VIEW_LABELS: Record<LauncherTargetId, string> = {
  subbass: 'PL1 · SUBSYNTH',
  ts666: 'PL2 · 666TS',
  beatbox: 'PL3 · BEATBOX',
  serum: 'PL4 · SERUM 2',
  sequencer: 'SEQUENCER',
  bassremix: 'BASS REMIX',
  mixer: 'STUDIO MIXER',
};

const PluginLoadingFallback: React.FC = () => (
  <div className="flex-1 h-full w-full flex items-center justify-center bg-[#090503] text-[#E08A3C] font-display text-sm tracking-widest">
    Loading Plugin...
  </div>
);
import type { BassRemixPreset, BassRemixProjectState } from './types/bassRemix';
import type {
  BeatboxState,
  StudioRoutingConfig,
  TarekProject,
  TarekProjectSummary,
} from './types/beatbox';
import type { DawSequencerState, TimeSignatureId } from './types/daw';
import type {
  FxCategoryId,
  FxChainPreset,
  FxTrackId,
  ModularFxInstance,
} from './types/fx';
import type { MidiNote, SequencerState } from './types/sequencer';
import type { SubbassPatch, SubbassSequencerState } from './types/subbass';
import type { SynthPatch } from './types/synth';
import type { Ts666Patch, Ts666SequencerState } from './types/ts666';

export default function App() {
  const initialLoadRef = useRef<{
    project: TarekProject;
    projects: TarekProjectSummary[];
  } | null>(null);
  if (!initialLoadRef.current) {
    initialLoadRef.current = loadInitialActiveProject();
  }

  const [project, setProject] = useState<TarekProject>(
    () => initialLoadRef.current!.project
  );
  const [savedProjects, setSavedProjects] = useState<TarekProjectSummary[]>(
    () => initialLoadRef.current!.projects
  );
  const [myProjectsOpen, setMyProjectsOpen] = useState<boolean>(false);

  const [activeLauncherView, setActiveLauncherView] = useState<'home' | LauncherTargetId>('home');
  const [lastVisitedId, setLastVisitedId] = useState<LauncherTargetId | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<StudioWorkspaceMode>('session');
  const [fullscreenInstrument, setFullscreenInstrument] =
    useState<FullscreenInstrumentId>('none');
  const [instrumentOpenPianoRoll, setInstrumentOpenPianoRoll] = useState<boolean>(false);

  const [focusedFxTrack, setFocusedFxTrack] = useState<FxTrackId>('ts666');
  const [deviceRackOpen, setDeviceRackOpen] = useState<boolean>(true);
  const [fxBrowserOpen, setFxBrowserOpen] = useState<boolean>(false);
  const [userFxPresets, setUserFxPresets] = useState<FxChainPreset[]>(() =>
    loadUserFxChainPresets()
  );

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isPortraitMobile, setIsPortraitMobile] = useState<boolean>(false);
  const [dismissPortraitTip, setDismissPortraitTip] = useState<boolean>(false);
  const [audioMonitorOpen, setAudioMonitorOpen] = useState<boolean>(false);
  const [androidExportOpen, setAndroidExportOpen] = useState<boolean>(false);

  const lastUiTelemetryRef = useRef<number>(0);
  const recKeyStartsRef = useRef<Map<number, number>>(new Map());
  const saveTimerRef = useRef<number | null>(null);
  const idleSaveHandleRef = useRef<number | null>(null);
  const projectRef = useRef<TarekProject>(project);
  projectRef.current = project;
  const isRecordingRef = useRef<boolean>(isRecording);
  isRecordingRef.current = isRecording;
  const activeInstrumentRef = useRef<FullscreenInstrumentId>(fullscreenInstrument);
  activeInstrumentRef.current = fullscreenInstrument;

  const deviceFx = useMemo(
    () => project.deviceFx ?? createDefaultProjectDeviceFx(),
    [project.deviceFx]
  );

  const totalFxCount = useMemo(
    () =>
      deviceFx.serum.length +
      deviceFx.subbass.length +
      deviceFx.beatbox.length +
      (deviceFx.ts666?.length ?? 0) +
      (deviceFx.bassremix?.length ?? 0),
    [deviceFx]
  );

  const cancelScheduledPersistence = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (idleSaveHandleRef.current !== null) {
      const cancelIdle = (
        window as Window & { cancelIdleCallback?: (id: number) => void }
      ).cancelIdleCallback;
      if (typeof cancelIdle === 'function') {
        cancelIdle(idleSaveHandleRef.current);
      }
      idleSaveHandleRef.current = null;
    }
  }, []);

  const flushPersistence = useCallback(
    (proj: TarekProject) => {
      cancelScheduledPersistence();
      const updated = saveProjectSafe(proj, { setAsActive: true });
      setSavedProjects(updated);
    },
    [cancelScheduledPersistence]
  );

  useEffect(() => {
    requestPersistentStorage();
    void syncAndRestoreStudioIndexedDb().then((restoredAny) => {
      if (restoredAny) {
        const reloaded = loadInitialActiveProject();
        setProject(reloaded.project);
        setSavedProjects(reloaded.projects);
        setUserFxPresets(loadUserFxChainPresets());
      }
    });
  }, []);

  // Track portrait vs landscape orientation & fullscreen state
  useEffect(() => {
    const checkViewport = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsPortraitMobile(w < 600 && h > w);
    };
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    checkViewport();
    window.addEventListener('resize', checkViewport);
    document.addEventListener('fullscreenchange', onFsChange);

    // Attempt landscape lock automatically when launched as an installed Android PWA/APK
    const isAppDisplay =
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: standalone)').matches;
    if (isAppDisplay) {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (type: string) => Promise<void>;
      };
      orientation?.lock?.('landscape').catch(() => {});
    }

    return () => {
      window.removeEventListener('resize', checkViewport);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, []);

  const prevAudibleRef = useRef<{
    serum: boolean;
    beatbox: boolean;
    subbass: boolean;
    ts666: boolean;
    bassremix: boolean;
  }>({
    serum: true,
    beatbox: true,
    subbass: true,
    ts666: true,
    bassremix: true,
  });

  // 1. Routing, Mute/Solo Panic, Subbass/666TS Mute Gate & FX Bypass Sync
  useEffect(() => {
    studioAudio.setRouting(project.routing);
    const audible = studioAudio.getPluginAuditability();
    if (prevAudibleRef.current.serum && !audible.serum) {
      synthEngine.panic();
    }
    if (prevAudibleRef.current.beatbox && !audible.beatbox) {
      beatboxEngine.panic();
    }
    if (prevAudibleRef.current.subbass && !audible.subbass) {
      subbassEngine.panic();
    }
    if (prevAudibleRef.current.ts666 && !audible.ts666) {
      sixSixSixEngine.panic();
    }
    if (prevAudibleRef.current.bassremix && !audible.bassremix) {
      bassRemixEngine.panic();
    }
    subbassEngine.setMuted(!audible.subbass);
    sixSixSixEngine.setMuted(!audible.ts666);
    prevAudibleRef.current = {
      serum: audible.serum,
      beatbox: audible.beatbox,
      subbass: audible.subbass,
      ts666: audible.ts666,
      bassremix: audible.bassremix,
    };

    synthEngine.setFxBypass(Boolean(project.routing.serumFxBypass));
    subbassEngine.setFxBypass(Boolean(project.routing.subbassFxBypass));
    beatboxEngine.setFxBypass(Boolean(project.routing.beatboxFxBypass));
  }, [project.routing]);

  // 1b. Modular FX Chain Sync into StudioAudio
  useEffect(() => {
    studioAudio.setDeviceFx(deviceFx);
  }, [deviceFx]);

  // 2. SERUM Patch Sync
  useEffect(() => {
    synthEngine.setPatch(project.serumPatch);
  }, [project.serumPatch]);

  // 3. SUBBASS Patch Sync
  useEffect(() => {
    subbassEngine.setPatch(project.subbass);
  }, [project.subbass]);

  // 3b. 666TS Patch Sync
  const activeTs666Patch = useMemo(
    () => project.ts666Patch ?? createCleanBassInit666(),
    [project.ts666Patch]
  );

  useEffect(() => {
    sixSixSixEngine.setPatch(activeTs666Patch);
  }, [activeTs666Patch]);

  // 3c. BASS REMIX State Sync
  const activeBassRemixState = useMemo(
    () => project.bassRemix ?? createDefaultBassRemixProjectState(),
    [project.bassRemix]
  );

  useEffect(() => {
    bassRemixEngine.setPatch(activeBassRemixState.patch);
    bassRemixEngine.setAbMode(activeBassRemixState.abMode);
    bassRemixEngine.setSelectionAndLoop(
      activeBassRemixState.selStartNorm,
      activeBassRemixState.selEndNorm,
      activeBassRemixState.loopPlayback
    );
  }, [activeBassRemixState]);

  // 4. Shared BPM Sync for Synth, Subbass, 666TS, BASS REMIX & Modular FX Clocks
  useEffect(() => {
    synthEngine.setBpm(project.bpm);
    subbassEngine.setBpm(project.bpm);
    sixSixSixEngine.setBpm(project.bpm);
    bassRemixEngine.setBpm(project.bpm);
    studioAudio.setBpm(project.bpm);
  }, [project.bpm]);

  // 5. BEATBOX Engine Sync
  useEffect(() => {
    beatboxEngine.setState(project.beatbox);
  }, [project.beatbox]);

  // 6. SERUM Sequencer Pattern & Loop Sync
  useEffect(() => {
    const serumPid = getPatternId(
      project.serumSequencer.activeBank,
      project.serumSequencer.activeSlot
    );
    const activeSerumNotes = project.serumSequencer.patterns[serumPid]?.notes ?? [];
    sequencerEngine.setConfig(project.bpm, project.loop, activeSerumNotes);
  }, [project.bpm, project.loop, project.serumSequencer]);

  // 7. BEATBOX Sequencer Steps & MIDI Trigger Sync
  useEffect(() => {
    const bbPid = getPatternId(project.beatbox.activeBank, project.beatbox.activeSlot);
    const activeBbSteps = project.beatbox.patterns[bbPid]?.steps ?? null;
    sequencerEngine.setBeatboxConfig(
      activeBbSteps,
      project.beatbox.swing,
      project.routing.midiBeatboxToSerum
    );

    const bbPr = project.beatbox.pianoRoll;
    const activeBbRollNotes = bbPr
      ? (bbPr.patterns[bbPr.activePatternId]?.notes ?? [])
      : [];
    sequencerEngine.setBeatboxPianoRollNotes(activeBbRollNotes);
  }, [
    project.beatbox.activeBank,
    project.beatbox.activeSlot,
    project.beatbox.patterns,
    project.beatbox.swing,
    project.beatbox.pianoRoll,
    project.routing.midiBeatboxToSerum,
  ]);

  // 8. SUBBASS Piano Roll Pattern Sync
  useEffect(() => {
    const sbSeq = project.subbassSequencer;
    const activeSubbassNotes = sbSeq
      ? (sbSeq.patterns[sbSeq.activePatternId]?.notes ?? [])
      : [];
    sequencerEngine.setSubbassNotes(activeSubbassNotes);
  }, [project.subbassSequencer]);

  // 8b. 666TS Piano Roll Pattern Sync
  useEffect(() => {
    const t6Seq = project.ts666Sequencer;
    const activeTs666Notes = t6Seq
      ? (t6Seq.patterns[t6Seq.activePatternId]?.notes ?? [])
      : [];
    sequencerEngine.setTs666Notes(activeTs666Notes);
  }, [project.ts666Sequencer]);

  // 9. Time Signature & Metronome Sync
  useEffect(() => {
    sequencerEngine.setTimeAndMetronome(
      project.timeSignature,
      project.metronomeEnabled
    );
  }, [project.timeSignature, project.metronomeEnabled]);

  // 10. Unified DAW Sequencer Sync
  useEffect(() => {
    sequencerEngine.setDawConfig(project.daw);
  }, [project.daw]);

  // 11. Debounced Idle Persistence
  useEffect(() => {
    cancelScheduledPersistence();
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const reqIdle = (
        window as Window & {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback;
      if (typeof reqIdle === 'function') {
        idleSaveHandleRef.current = reqIdle(
          () => {
            idleSaveHandleRef.current = null;
            flushPersistence(projectRef.current);
          },
          { timeout: 500 }
        );
      } else {
        flushPersistence(projectRef.current);
      }
    }, 900);

    return () => {
      cancelScheduledPersistence();
    };
  }, [project, cancelScheduledPersistence, flushPersistence]);

  useEffect(() => {
    const onPageHide = () => flushPersistence(projectRef.current);
    const onBeforeUnload = () => flushPersistence(projectRef.current);
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPersistence(projectRef.current);
      }
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisChange);
      if (saveTimerRef.current !== null || idleSaveHandleRef.current !== null) {
        flushPersistence(projectRef.current);
      }
    };
  }, [flushPersistence]);

  // Subscribe to shared SequencerEngine timeline playhead
  useEffect(() => {
    sequencerEngine.setListeners(
      (step16, playing, fullDawStep) => {
        setTransportState({
          playheadStep: step16,
          dawStep: fullDawStep,
          isPlaying: playing,
          isPaused: sequencerEngine.getIsPaused(),
        });
      },
      () => {
        setTransportState({
          isPlaying: false,
          isPaused: false,
          playheadStep: 0,
          dawStep: 0,
        });
      }
    );
    return () => {
      sequencerEngine.setListeners(null, null);
    };
  }, []);

  // Subscribe to real-time SERUM LFO & modulation telemetry ONLY while SERUM view is mounted
  useEffect(() => {
    if (fullscreenInstrument !== 'serum') {
      synthEngine.setModTelemetryListener(null);
      return;
    }
    synthEngine.setModTelemetryListener((offsets, phases, voiceCount) => {
      const now = performance.now();
      const minGap = voiceCount > 0 ? 48 : 95;
      if (now - lastUiTelemetryRef.current >= minGap) {
        lastUiTelemetryRef.current = now;
        setModTelemetryState(offsets, phases);
      }
    });
    return () => {
      synthEngine.setModTelemetryListener(null);
    };
  }, [fullscreenInstrument]);

  // Subscribe to shared MIDI Bus activity, Keyboard -> Beatbox routing, Live Rec, and Web MIDI
  useEffect(() => {
    const unsubActivity = midiBus.subscribeActivity((active) => {
      setMidiActiveState(active);
    });

    const unsubMidi = midiBus.subscribe((evt) => {
      const curr = projectRef.current;
      const resolvedTarget =
        evt.target ??
        (activeInstrumentRef.current === 'subbass'
          ? 'subbass'
          : activeInstrumentRef.current === 'beatbox'
          ? 'beatbox'
          : activeInstrumentRef.current === 'ts666'
          ? 'ts666'
          : 'serum');

      if (
        evt.type === 'noteOn' &&
        (evt.source === 'keyboard' || evt.source === 'external_midi') &&
        curr.routing.midiKeyboardToBeatbox &&
        resolvedTarget !== 'subbass' &&
        resolvedTarget !== 'ts666' &&
        evt.target !== 'beatbox'
      ) {
        void beatboxEngine.triggerByMidiNote(evt.midi, evt.velocity);
      }

      if (
        isRecordingRef.current &&
        sequencerEngine.getIsPlaying() &&
        (evt.source === 'keyboard' || evt.source === 'external_midi')
      ) {
        if (resolvedTarget === 'beatbox') {
          if (evt.type === 'noteOn') {
            const step = Math.round(sequencerEngine.getCurrentStep() * 2) / 2;
            const newNote: MidiNote = {
              id: `rec-bb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              midi: evt.midi,
              step: step % 16,
              duration: 0.5,
              velocity: evt.velocity,
            };
            setProject((prev) => {
              const pr = prev.beatbox.pianoRoll ?? createDefaultBeatboxPianoRollState();
              const pid = pr.activePatternId;
              const existing = pr.patterns[pid] ?? {
                id: pid,
                name: 'Drum Roll 1',
                notes: [],
              };
              return {
                ...prev,
                beatbox: {
                  ...prev.beatbox,
                  pianoRoll: {
                    ...pr,
                    patterns: {
                      ...pr.patterns,
                      [pid]: {
                        ...existing,
                        notes: [...existing.notes, newNote],
                      },
                    },
                  },
                },
              };
            });
          }
          return;
        }

        if (evt.type === 'noteOn') {
          const step = Math.round(sequencerEngine.getCurrentStep() * 2) / 2;
          recKeyStartsRef.current.set(evt.midi, step % 16);
        } else if (evt.type === 'noteOff') {
          const startStep = recKeyStartsRef.current.get(evt.midi);
          if (startStep !== undefined) {
            recKeyStartsRef.current.delete(evt.midi);
            const endStep = sequencerEngine.getCurrentStep();
            let dur = endStep - startStep;
            if (dur < 0) dur += 16;
            dur = Math.max(0.5, Math.min(16 - startStep, Math.round(dur * 2) / 2));

            const newNote: MidiNote = {
              id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              midi: evt.midi,
              step: startStep,
              duration: dur,
              velocity: 0.88,
            };

            if (resolvedTarget === 'subbass') {
              setProject((prev) => {
                const sbSeq = prev.subbassSequencer ?? createDefaultSubbassSequencerState();
                const pid = sbSeq.activePatternId;
                const existing = sbSeq.patterns[pid] ?? {
                  id: pid,
                  name: 'Sub Pattern 1',
                  notes: [],
                };
                return {
                  ...prev,
                  subbassSequencer: {
                    ...sbSeq,
                    patterns: {
                      ...sbSeq.patterns,
                      [pid]: {
                        ...existing,
                        notes: [...existing.notes, newNote],
                      },
                    },
                  },
                };
              });
            } else if (resolvedTarget === 'ts666') {
              setProject((prev) => {
                const t6Seq = prev.ts666Sequencer ?? createDefaultTs666SequencerState();
                const pid = t6Seq.activePatternId;
                const existing = t6Seq.patterns[pid] ?? {
                  id: pid,
                  name: '666TS Pattern 1',
                  notes: [],
                };
                return {
                  ...prev,
                  ts666Sequencer: {
                    ...t6Seq,
                    patterns: {
                      ...t6Seq.patterns,
                      [pid]: {
                        ...existing,
                        notes: [...existing.notes, newNote],
                      },
                    },
                  },
                };
              });
            } else {
              setProject((prev) => {
                const pid = getPatternId(
                  prev.serumSequencer.activeBank,
                  prev.serumSequencer.activeSlot
                );
                const existing = prev.serumSequencer.patterns[pid] ?? {
                  id: pid,
                  bank: prev.serumSequencer.activeBank,
                  slot: prev.serumSequencer.activeSlot,
                  notes: [],
                };
                return {
                  ...prev,
                  serumSequencer: {
                    ...prev.serumSequencer,
                    patterns: {
                      ...prev.serumSequencer.patterns,
                      [pid]: {
                        ...existing,
                        notes: [...existing.notes, newNote],
                      },
                    },
                  },
                };
              });
            }
          }
        }
      }
    });

    void midiBus.initWebMidi(
      (midi, velocity) => {
        if (activeInstrumentRef.current === 'subbass') {
          void subbassEngine.noteOn(midi, velocity);
        } else if (activeInstrumentRef.current === 'ts666') {
          void sixSixSixEngine.noteOn(midi, velocity);
        } else {
          void synthEngine.noteOn(midi, velocity);
        }
      },
      (midi) => {
        if (activeInstrumentRef.current === 'subbass') {
          subbassEngine.noteOff(midi);
        } else if (activeInstrumentRef.current === 'ts666') {
          sixSixSixEngine.noteOff(midi);
        } else {
          synthEngine.noteOff(midi);
        }
      }
    );

    return () => {
      unsubActivity();
      unsubMidi();
    };
  }, []);

  // Shared Project Updaters
  const handleChangeProjectName = useCallback((name: string) => {
    setProject((prev) => ({ ...prev, name }));
  }, []);

  const handleChangeBpm = useCallback((bpm: number) => {
    const clamped = Math.max(40, Math.min(240, bpm));
    setProject((prev) => ({
      ...prev,
      bpm: clamped,
      serumSequencer: { ...prev.serumSequencer, bpm: clamped },
    }));
  }, []);

  const handleToggleLoop = useCallback(() => {
    setProject((prev) => ({
      ...prev,
      loop: !prev.loop,
      serumSequencer: { ...prev.serumSequencer, loop: !prev.loop },
    }));
  }, []);

  const handleChangeRouting = useCallback((patch: Partial<StudioRoutingConfig>) => {
    setProject((prev) => ({
      ...prev,
      routing: { ...prev.routing, ...patch },
    }));
  }, []);

  const handleChangeSerumPatch = useCallback(
    (updater: (prev: SynthPatch) => SynthPatch) => {
      setProject((prev) => ({
        ...prev,
        serumPatch: updater(prev.serumPatch),
      }));
    },
    []
  );

  const handleChangeSerumSeqState = useCallback(
    (updater: (prev: SequencerState) => SequencerState) => {
      setProject((prev) => ({
        ...prev,
        serumSequencer: updater(prev.serumSequencer),
      }));
    },
    []
  );

  const handleChangeBeatbox = useCallback(
    (patchOrUpdater: Partial<BeatboxState> | ((prev: BeatboxState) => BeatboxState)) => {
      setProject((prev) => ({
        ...prev,
        beatbox:
          typeof patchOrUpdater === 'function'
            ? patchOrUpdater(prev.beatbox)
            : { ...prev.beatbox, ...patchOrUpdater },
      }));
    },
    []
  );

  const handleChangeTimeSignature = useCallback((timeSignature: TimeSignatureId) => {
    setProject((prev) => ({ ...prev, timeSignature }));
  }, []);

  const handleToggleMetronome = useCallback(() => {
    setProject((prev) => ({ ...prev, metronomeEnabled: !prev.metronomeEnabled }));
  }, []);

  const handleChangeDaw = useCallback(
    (updater: (prev: DawSequencerState) => DawSequencerState) => {
      setProject((prev) => ({
        ...prev,
        daw: updater(prev.daw),
      }));
    },
    []
  );

  const handleChangeSubbassPatch = useCallback(
    (updater: (prev: SubbassPatch) => SubbassPatch) => {
      setProject((prev) => ({
        ...prev,
        subbass: updater(prev.subbass),
      }));
    },
    []
  );

  const handleChangeSubbassSeqState = useCallback(
    (updater: (prev: SubbassSequencerState) => SubbassSequencerState) => {
      setProject((prev) => ({
        ...prev,
        subbassSequencer: updater(
          prev.subbassSequencer ?? createDefaultSubbassSequencerState()
        ),
      }));
    },
    []
  );

  const handleChangeTs666Patch = useCallback((nextPatch: Ts666Patch) => {
    setProject((prev) => ({
      ...prev,
      ts666Patch: nextPatch,
    }));
  }, []);

  const handleChangeTs666SeqState = useCallback(
    (updater: (prev: Ts666SequencerState) => Ts666SequencerState) => {
      setProject((prev) => ({
        ...prev,
        ts666Sequencer: updater(
          prev.ts666Sequencer ?? createDefaultTs666SequencerState()
        ),
      }));
    },
    []
  );

  const handleChangeBassRemixState = useCallback(
    (updater: (prev: BassRemixProjectState) => BassRemixProjectState) => {
      setProject((prev) => ({
        ...prev,
        bassRemix: updater(
          prev.bassRemix ?? createDefaultBassRemixProjectState()
        ),
      }));
    },
    []
  );

  const handleSelectBassRemixPreset = useCallback((preset: BassRemixPreset) => {
    setProject((prev) => {
      const current = prev.bassRemix ?? createDefaultBassRemixProjectState();
      const nextPatch = JSON.parse(JSON.stringify(preset.patch)) as BassRemixProjectState['patch'];
      nextPatch.automation = {
        ...nextPatch.automation,
        lanes: current.patch.automation.lanes,
        bpmSync: current.patch.automation.bpmSync,
        bars: current.patch.automation.bars,
        loopAutomation: current.patch.automation.loopAutomation,
        snapGrid: current.patch.automation.snapGrid,
        activeTarget: current.patch.automation.activeTarget,
      };
      return {
        ...prev,
        bassRemix: {
          ...current,
          patch: nextPatch,
        },
      };
    });
  }, []);

  // Modular FX Updaters
  const handleChangeTrackDeviceFx = useCallback(
    (track: FxTrackId, nextModules: ModularFxInstance[]) => {
      setProject((prev) => ({
        ...prev,
        deviceFx: {
          ...(prev.deviceFx ?? createDefaultProjectDeviceFx()),
          [track]: nextModules,
        },
      }));
    },
    []
  );

  const handleAddModularFx = useCallback((track: FxTrackId, type: FxCategoryId) => {
    const instance = createFxInstance(type);
    setProject((prev) => {
      const currFx = prev.deviceFx ?? createDefaultProjectDeviceFx();
      return {
        ...prev,
        deviceFx: {
          ...currFx,
          [track]: [...(currFx[track] ?? []), instance],
        },
      };
    });
    setDeviceRackOpen(true);
  }, []);

  const handleLoadFxChainPreset = useCallback(
    (track: FxTrackId, preset: FxChainPreset) => {
      const instances = preset.modules.map((m) =>
        createFxInstance(m.type, {
          name: m.name,
          enabled: m.enabled,
          params: m.params,
        })
      );
      handleChangeTrackDeviceFx(track, instances);
      setDeviceRackOpen(true);
    },
    [handleChangeTrackDeviceFx]
  );

  const handleToggleChannelFxBypass = useCallback((track: FxTrackId) => {
    setProject((prev) => {
      const r = prev.routing;
      if (track === 'serum') return { ...prev, routing: { ...r, serumFxBypass: !r.serumFxBypass } };
      if (track === 'subbass') return { ...prev, routing: { ...r, subbassFxBypass: !r.subbassFxBypass } };
      if (track === 'ts666') return { ...prev, routing: { ...r, ts666FxBypass: !r.ts666FxBypass } };
      if (track === 'bassremix') return { ...prev, routing: { ...r, bassremixFxBypass: !r.bassremixFxBypass } };
      return { ...prev, routing: { ...r, beatboxFxBypass: !r.beatboxFxBypass } };
    });
  }, []);

  const stopAllAudioAndResetTransport = useCallback(() => {
    recKeyStartsRef.current.clear();
    sequencerEngine.stop(true);
    synthEngine.panic();
    beatboxEngine.panic();
    subbassEngine.panic();
    sixSixSixEngine.panic();
    bassRemixEngine.panic();
    setTransportState({
      isPlaying: false,
      isPaused: false,
      playheadStep: 0,
      dawStep: 0,
    });
  }, []);

  const handleImportProject = useCallback(
    (raw: Partial<TarekProject>) => {
      flushPersistence(projectRef.current);
      stopAllAudioAndResetTransport();
      const { project: imported, projects } = importProjectAsNew(raw);
      projectRef.current = imported;
      setProject(imported);
      setSavedProjects(projects);
    },
    [flushPersistence, stopAllAudioAndResetTransport]
  );

  const handleCreateNewProject = useCallback(
    (customName?: string) => {
      flushPersistence(projectRef.current);
      stopAllAudioAndResetTransport();
      const { project: nextProj, projects } = createAndSaveNewProject(customName);
      projectRef.current = nextProj;
      setProject(nextProj);
      setSavedProjects(projects);
    },
    [flushPersistence, stopAllAudioAndResetTransport]
  );

  const handleOpenProject = useCallback(
    (id: string) => {
      if (id === projectRef.current.id) return;
      flushPersistence(projectRef.current);
      stopAllAudioAndResetTransport();
      const loaded = loadProjectById(id);
      if (loaded) {
        projectRef.current = loaded;
        setProject(loaded);
      }
    },
    [flushPersistence, stopAllAudioAndResetTransport]
  );

  const handleRenameProject = useCallback(
    (id: string, nextName: string) => {
      const cleanName = nextName.trim() || 'Untitled Project';
      if (id === projectRef.current.id) {
        cancelScheduledPersistence();
        const updated: TarekProject = {
          ...projectRef.current,
          name: cleanName,
          updatedAt: Date.now(),
        };
        projectRef.current = updated;
        setProject(updated);
        setSavedProjects(saveProjectSafe(updated, { setAsActive: true }));
      } else {
        const { projects } = renameSavedProject(id, cleanName);
        setSavedProjects(projects);
      }
    },
    [cancelScheduledPersistence]
  );

  const handleDuplicateProject = useCallback(
    (id: string) => {
      flushPersistence(projectRef.current);
      stopAllAudioAndResetTransport();
      const duplicated = duplicateSavedProject(id);
      if (duplicated) {
        projectRef.current = duplicated.project;
        setProject(duplicated.project);
        setSavedProjects(duplicated.projects);
      }
    },
    [flushPersistence, stopAllAudioAndResetTransport]
  );

  const handleDeleteProject = useCallback(
    (id: string) => {
      const isDeletingActive = id === projectRef.current.id;
      if (isDeletingActive) {
        cancelScheduledPersistence();
        stopAllAudioAndResetTransport();
      }
      const { projects, nextActiveProject } = deleteSavedProject(
        id,
        projectRef.current.id
      );
      setSavedProjects(projects);
      if (nextActiveProject) {
        projectRef.current = nextActiveProject;
        setProject(nextActiveProject);
      }
    },
    [cancelScheduledPersistence, stopAllAudioAndResetTransport]
  );

  // Global Synchronized Transport
  const handlePlay = useCallback(() => {
    if (!sequencerEngine.getIsPlaying()) {
      void sequencerEngine.start();
      setTransportState({ isPlaying: true, isPaused: false });
    }
  }, []);

  const handlePause = useCallback(() => {
    if (sequencerEngine.getIsPlaying()) {
      recKeyStartsRef.current.clear();
      sequencerEngine.pause();
      setTransportState({ isPlaying: false, isPaused: true });
    }
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (sequencerEngine.getIsPlaying()) {
      recKeyStartsRef.current.clear();
      sequencerEngine.stop(true);
      setTransportState({
        isPlaying: false,
        isPaused: false,
        playheadStep: 0,
        dawStep: 0,
      });
    } else {
      void sequencerEngine.start();
      setTransportState({ isPlaying: true, isPaused: false });
    }
  }, []);

  const handleStop = useCallback(() => {
    recKeyStartsRef.current.clear();
    sequencerEngine.stop(true);
    setTransportState({
      isPlaying: false,
      isPaused: false,
      playheadStep: 0,
      dawStep: 0,
    });
  }, []);

  const handlePanic = useCallback(() => {
    recKeyStartsRef.current.clear();
    sequencerEngine.stop(true);
    synthEngine.panic();
    beatboxEngine.panic();
    subbassEngine.panic();
    sixSixSixEngine.panic();
    bassRemixEngine.panic();
    setTransportState({
      isPlaying: false,
      isPaused: false,
      playheadStep: 0,
      dawStep: 0,
    });
  }, []);

  const handleToggleRecord = useCallback(() => {
    setIsRecording((r) => !r);
  }, []);

  const handleChangeMasterVolume = useCallback(
    (masterVolume: number) => {
      handleChangeRouting({ masterVolume });
    },
    [handleChangeRouting]
  );

  const handleOpenAudioMonitor = useCallback(() => {
    setAudioMonitorOpen(true);
  }, []);

  const toggleFullscreenLandscape = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (type: string) => Promise<void>;
        };
        if (orientation?.lock) {
          await orientation.lock('landscape').catch(() => {});
        }
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore on browsers/iframes blocking fullscreen
    }
  }, []);

  const unlockAudio = useCallback(() => {
    studioAudio.unlockSync();
    void synthEngine.ensureAudio();
    void subbassEngine.ensureAudio();
    void sixSixSixEngine.ensureAudio();
  }, []);

  // Navigation & Home Launcher / Session Clip Launching
  const handleLaunchFromHome = useCallback((target: LauncherTargetId) => {
    setLastVisitedId(target);
    setActiveLauncherView(target);
    if (
      target === 'subbass' ||
      target === 'ts666' ||
      target === 'beatbox' ||
      target === 'serum' ||
      target === 'bassremix'
    ) {
      setFocusedFxTrack(target);
      setInstrumentOpenPianoRoll(false);
      setFullscreenInstrument(target);
    } else if (target === 'sequencer') {
      setFullscreenInstrument('none');
      setWorkspaceMode('arrangement');
    } else {
      setFullscreenInstrument('none');
      setWorkspaceMode('session');
    }
  }, []);

  const handleReturnToHome = useCallback(() => {
    setActiveLauncherView('home');
    setFullscreenInstrument('none');
    setInstrumentOpenPianoRoll(false);
  }, []);

  const handleOpenInstrument = useCallback(
    (plugin: FxTrackId, openPianoRoll = false) => {
      setLastVisitedId(plugin);
      setActiveLauncherView(plugin);
      setFocusedFxTrack(plugin);
      setInstrumentOpenPianoRoll(openPianoRoll);
      setFullscreenInstrument(plugin);
    },
    []
  );

  const handleBackFromInstrument = useCallback(() => {
    setActiveLauncherView('home');
    setFullscreenInstrument('none');
    setInstrumentOpenPianoRoll(false);
  }, []);

  const handleLaunchSerumSlot = useCallback(
    (slot: number, startTransport = true) => {
      setProject((prev) => ({
        ...prev,
        serumSequencer: { ...prev.serumSequencer, activeSlot: slot },
      }));
      if (startTransport && !sequencerEngine.getIsPlaying()) {
        void sequencerEngine.start();
        setTransportState({ isPlaying: true, isPaused: false });
      }
    },
    []
  );

  const handleLaunchSubbassPattern = useCallback(
    (patternId: string, startTransport = true) => {
      setProject((prev) => {
        const sb = prev.subbassSequencer ?? createDefaultSubbassSequencerState();
        const exists = Boolean(sb.patterns[patternId]);
        return {
          ...prev,
          subbassSequencer: {
            ...sb,
            activePatternId: patternId,
            patternOrder: sb.patternOrder.includes(patternId)
              ? sb.patternOrder
              : [...sb.patternOrder, patternId],
            patterns: exists
              ? sb.patterns
              : {
                  ...sb.patterns,
                  [patternId]: {
                    id: patternId,
                    name: `Sub ${patternId.replace('S', '')}`,
                    notes: [],
                  },
                },
          },
        };
      });
      if (startTransport && !sequencerEngine.getIsPlaying()) {
        void sequencerEngine.start();
        setTransportState({ isPlaying: true, isPaused: false });
      }
    },
    []
  );

  const handleLaunchTs666Pattern = useCallback(
    (patternId: string, startTransport = true) => {
      setProject((prev) => {
        const t6 = prev.ts666Sequencer ?? createDefaultTs666SequencerState();
        const exists = Boolean(t6.patterns[patternId]);
        return {
          ...prev,
          ts666Sequencer: {
            ...t6,
            activePatternId: patternId,
            patternOrder: t6.patternOrder.includes(patternId)
              ? t6.patternOrder
              : [...t6.patternOrder, patternId],
            patterns: exists
              ? t6.patterns
              : {
                  ...t6.patterns,
                  [patternId]: {
                    id: patternId,
                    name: `666TS ${patternId.replace('T', '')}`,
                    notes: [],
                  },
                },
          },
        };
      });
      if (startTransport && !sequencerEngine.getIsPlaying()) {
        void sequencerEngine.start();
        setTransportState({ isPlaying: true, isPaused: false });
      }
    },
    []
  );

  const handleLaunchBeatboxSlot = useCallback(
    (slot: number, startTransport = true) => {
      setProject((prev) => ({
        ...prev,
        beatbox: { ...prev.beatbox, activeSlot: slot },
      }));
      if (startTransport && !sequencerEngine.getIsPlaying()) {
        void sequencerEngine.start();
        setTransportState({ isPlaying: true, isPaused: false });
      }
    },
    []
  );

  const handleLaunchScene = useCallback((sceneIdx: number) => {
    const slot = sceneIdx + 1;
    setProject((prev) => {
      const sb = prev.subbassSequencer ?? createDefaultSubbassSequencerState();
      const subPid = sb.patternOrder[sceneIdx] ?? `S${slot}`;
      const subExists = Boolean(sb.patterns[subPid]);

      const t6 = prev.ts666Sequencer ?? createDefaultTs666SequencerState();
      const t6Pid = t6.patternOrder[sceneIdx] ?? `T${slot}`;
      const t6Exists = Boolean(t6.patterns[t6Pid]);

      return {
        ...prev,
        serumSequencer: { ...prev.serumSequencer, activeSlot: slot },
        beatbox: { ...prev.beatbox, activeSlot: slot },
        subbassSequencer: {
          ...sb,
          activePatternId: subPid,
          patternOrder: sb.patternOrder.includes(subPid)
            ? sb.patternOrder
            : [...sb.patternOrder, subPid],
          patterns: subExists
            ? sb.patterns
            : {
                ...sb.patterns,
                [subPid]: {
                  id: subPid,
                  name: `Sub ${slot}`,
                  notes: [],
                },
              },
        },
        ts666Sequencer: {
          ...t6,
          activePatternId: t6Pid,
          patternOrder: t6.patternOrder.includes(t6Pid)
            ? t6.patternOrder
            : [...t6.patternOrder, t6Pid],
          patterns: t6Exists
            ? t6.patterns
            : {
                ...t6.patterns,
                [t6Pid]: {
                  id: t6Pid,
                  name: `666TS ${slot}`,
                  notes: [],
                },
              },
        },
      };
    });
    if (!sequencerEngine.getIsPlaying()) {
      void sequencerEngine.start();
      setTransportState({ isPlaying: true, isPaused: false });
    }
  }, []);

  const handleOpenEffectsForTrack = useCallback((track: FxTrackId) => {
    setFocusedFxTrack(track);
    setDeviceRackOpen(true);
    setFxBrowserOpen(true);
  }, []);

  const handleToggleEffectsFromHeader = useCallback(() => {
    setDeviceRackOpen((open) => {
      const next = !open;
      if (next && (deviceFx[focusedFxTrack]?.length ?? 0) === 0) {
        setFxBrowserOpen(true);
      }
      return next;
    });
  }, [deviceFx, focusedFxTrack]);

  const activeChannelBypass =
    focusedFxTrack === 'serum'
      ? Boolean(project.routing.serumFxBypass)
      : focusedFxTrack === 'subbass'
      ? Boolean(project.routing.subbassFxBypass)
      : focusedFxTrack === 'ts666'
      ? Boolean(project.routing.ts666FxBypass)
      : focusedFxTrack === 'bassremix'
      ? Boolean(project.routing.bassremixFxBypass)
      : Boolean(project.routing.beatboxFxBypass);

  return (
    <div
      onPointerDownCapture={unlockAudio}
      className="flex flex-col h-dvh w-full bg-[#0B0E14] text-slate-100 overflow-hidden select-none"
    >
      {/* Non-blocking Portrait Orientation Suggestion */}
      {isPortraitMobile && !dismissPortraitTip && (
        <div className="flex items-center justify-between gap-2 px-3 py-1 bg-amber-500/15 border-b border-amber-400/40 text-[11px] text-amber-200 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <RotateCw className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span className="truncate">
              Rotate your phone to landscape for TAREK studio view.
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleFullscreenLandscape}
              className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-semibold text-[10px] cursor-pointer"
            >
              Landscape
            </button>
            <button
              type="button"
              onClick={() => setDismissPortraitTip(true)}
              className="px-1.5 py-0.5 text-amber-300 hover:text-white text-[10px] cursor-pointer"
            >
              Hide
            </button>
          </div>
        </div>
      )}

      {/* PERSISTENT HOME LAUNCHER WITH 3D INTERACTIVE AVATAR (Paused when inside a plugin) */}
      <div
        className={
          activeLauncherView === 'home'
            ? 'flex-1 min-h-0 flex flex-col overflow-hidden'
            : 'hidden'
        }
      >
        <HomeLauncher
          active={activeLauncherView === 'home'}
          projectName={project.name}
          bpm={project.bpm}
          masterVolume={project.routing.masterVolume}
          isFullscreen={isFullscreen}
          savedProjectsCount={savedProjects.length}
          lastVisitedId={lastVisitedId}
          onLaunchPlugin={handleLaunchFromHome}
          onPlay={handlePlay}
          onPause={handlePause}
          onStop={handleStop}
          onChangeBpm={handleChangeBpm}
          onChangeMasterVolume={handleChangeMasterVolume}
          onOpenMyProjects={() => setMyProjectsOpen(true)}
          onOpenAudioMonitor={handleOpenAudioMonitor}
          onOpenAndroidExport={() => setAndroidExportOpen(true)}
          onToggleFullscreen={toggleFullscreenLandscape}
          onPanic={handlePanic}
        />
      </div>

      {/* FULLSCREEN PLUGIN WORKSPACE WITH CLEAR UPPER-RIGHT X CLOSE BUTTON */}
      {activeLauncherView !== 'home' && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 h-8 bg-[#100905] border-b border-[#4D301C] shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-display text-xs font-extrabold tracking-widest text-[#E08A3C] whitespace-nowrap">
                TAREK
              </span>
              <span aria-hidden="true" className="text-[#6B4427]">
                ·
              </span>
              <span className="font-display text-xs font-bold tracking-wide text-[#F9EAD9] truncate">
                {VIEW_LABELS[activeLauncherView]}
              </span>
            </div>

            <button
              type="button"
              onClick={handleReturnToHome}
              aria-label="Close plugin and return to Home Screen"
              title="Return to Home Screen"
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center justify-center gap-1 min-w-[44px] h-6.5 px-2.5 rounded-md bg-[#2A150D] hover:bg-[#DC2626] border border-[#7E4A28] hover:border-[#FCA5A5] text-[#FDE68A] hover:text-white font-display font-bold text-xs cursor-pointer transition-colors shrink-0"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>

          <Suspense fallback={<PluginLoadingFallback />}>
            {fullscreenInstrument !== 'none' ? (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden [&>div]:!h-full">
                {fullscreenInstrument === 'serum' && (
                  <SerumPlugin
                    patch={project.serumPatch}
                    seqState={project.serumSequencer}
                    routing={project.routing}
                    bpm={project.bpm}
                    loop={project.loop}
                    isRecording={isRecording}
                    isFullscreen={isFullscreen}
                    initialPianoRoll={instrumentOpenPianoRoll}
                    deviceFx={deviceFx.serum}
                    onChangePatch={handleChangeSerumPatch}
                    onChangeSeqState={handleChangeSerumSeqState}
                    onChangeRouting={handleChangeRouting}
                    onChangeBpm={handleChangeBpm}
                    onToggleLoop={handleToggleLoop}
                    onTogglePlay={handleTogglePlay}
                    onStop={handleStop}
                    onToggleRecord={handleToggleRecord}
                    onToggleFullscreen={toggleFullscreenLandscape}
                    onBack={handleBackFromInstrument}
                    onChangeDeviceFx={(next) => handleChangeTrackDeviceFx('serum', next)}
                    onOpenEffectsBrowser={() => {
                      setFocusedFxTrack('serum');
                      setFxBrowserOpen(true);
                    }}
                  />
                )}

                {fullscreenInstrument === 'subbass' && (
                  <SubbassPlugin
                    patch={project.subbass}
                    seqState={project.subbassSequencer ?? createDefaultSubbassSequencerState()}
                    routing={project.routing}
                    bpm={project.bpm}
                    loop={project.loop}
                    isRecording={isRecording}
                    isFullscreen={isFullscreen}
                    initialPianoRoll={instrumentOpenPianoRoll}
                    deviceFx={deviceFx.subbass}
                    onChangePatch={handleChangeSubbassPatch}
                    onChangeSeqState={handleChangeSubbassSeqState}
                    onChangeRouting={handleChangeRouting}
                    onTogglePlay={handleTogglePlay}
                    onStop={handleStop}
                    onToggleLoop={handleToggleLoop}
                    onToggleRecord={handleToggleRecord}
                    onChangeBpm={handleChangeBpm}
                    onToggleFullscreen={toggleFullscreenLandscape}
                    onBack={handleBackFromInstrument}
                    onChangeDeviceFx={(next) => handleChangeTrackDeviceFx('subbass', next)}
                    onOpenEffectsBrowser={() => {
                      setFocusedFxTrack('subbass');
                      setFxBrowserOpen(true);
                    }}
                  />
                )}

                {fullscreenInstrument === 'beatbox' && (
                  <BeatboxPlugin
                    beatbox={project.beatbox}
                    routing={project.routing}
                    bpm={project.bpm}
                    loop={project.loop}
                    isRecording={isRecording}
                    isFullscreen={isFullscreen}
                    initialPianoRoll={instrumentOpenPianoRoll}
                    deviceFx={deviceFx.beatbox}
                    onChangeBeatbox={handleChangeBeatbox}
                    onChangeRouting={handleChangeRouting}
                    onTogglePlay={handleTogglePlay}
                    onStop={handleStop}
                    onToggleLoop={handleToggleLoop}
                    onToggleRecord={handleToggleRecord}
                    onChangeBpm={handleChangeBpm}
                    onToggleFullscreen={toggleFullscreenLandscape}
                    onBack={handleBackFromInstrument}
                    onChangeDeviceFx={(next) => handleChangeTrackDeviceFx('beatbox', next)}
                    onOpenEffectsBrowser={() => {
                      setFocusedFxTrack('beatbox');
                      setFxBrowserOpen(true);
                    }}
                  />
                )}

                {fullscreenInstrument === 'ts666' && (
                  <SixSixSixPlugin
                    patch={activeTs666Patch}
                    seqState={project.ts666Sequencer ?? createDefaultTs666SequencerState()}
                    routing={project.routing}
                    bpm={project.bpm}
                    loop={project.loop}
                    isRecording={isRecording}
                    isFullscreen={isFullscreen}
                    initialPianoRoll={instrumentOpenPianoRoll}
                    deviceFx={deviceFx.ts666 ?? []}
                    onChangePatch={handleChangeTs666Patch}
                    onChangeSeqState={handleChangeTs666SeqState}
                    onChangeRouting={handleChangeRouting}
                    onTogglePlay={handleTogglePlay}
                    onStop={handleStop}
                    onToggleLoop={handleToggleLoop}
                    onToggleRecord={handleToggleRecord}
                    onChangeBpm={handleChangeBpm}
                    onToggleFullscreen={toggleFullscreenLandscape}
                    onBack={handleBackFromInstrument}
                    onChangeDeviceFx={(next) => handleChangeTrackDeviceFx('ts666', next)}
                    onOpenEffectsBrowser={() => {
                      setFocusedFxTrack('ts666');
                      setFxBrowserOpen(true);
                    }}
                  />
                )}

                {fullscreenInstrument === 'bassremix' && (
                  <BassRemixPlugin
                    state={activeBassRemixState}
                    routing={project.routing}
                    bpm={project.bpm}
                    isFullscreen={isFullscreen}
                    deviceFx={deviceFx.bassremix ?? []}
                    onChangeState={handleChangeBassRemixState}
                    onChangeRouting={handleChangeRouting}
                    onChangeBpm={handleChangeBpm}
                    onToggleFullscreen={toggleFullscreenLandscape}
                    onBack={handleBackFromInstrument}
                    onChangeDeviceFx={(next) => handleChangeTrackDeviceFx('bassremix', next)}
                    onOpenEffectsBrowser={() => {
                      setFocusedFxTrack('bassremix');
                      setFxBrowserOpen(true);
                    }}
                  />
                )}
              </div>
            ) : activeLauncherView === 'sequencer' ? (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden [&>div]:!h-full">
                <SequencerPlugin
                  daw={project.daw}
                  timeSignature={project.timeSignature}
                  bpm={project.bpm}
                  loop={project.loop}
                  isRecording={isRecording}
                  isFullscreen={isFullscreen}
                  onChangeDaw={handleChangeDaw}
                  onTogglePlay={handleTogglePlay}
                  onStop={handleStop}
                  onToggleLoop={handleToggleLoop}
                  onToggleRecord={handleToggleRecord}
                  onChangeBpm={handleChangeBpm}
                  onToggleFullscreen={toggleFullscreenLandscape}
                />
              </div>
            ) : (
              /* STUDIO MIXER & MODULAR FX WORKSPACE */
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <TarekTransportBar
                  workspaceMode={workspaceMode}
                  deviceRackOpen={deviceRackOpen}
                  totalFxCount={totalFxCount}
                  bpm={project.bpm}
                  timeSignature={project.timeSignature}
                  metronomeEnabled={project.metronomeEnabled}
                  loop={project.loop}
                  isRecording={isRecording}
                  masterVolume={project.routing.masterVolume}
                  isFullscreen={isFullscreen}
                  savedProjectsCount={savedProjects.length}
                  onChangeWorkspace={(mode) => {
                    setWorkspaceMode(mode);
                    setActiveLauncherView(mode === 'arrangement' ? 'sequencer' : 'mixer');
                  }}
                  onOpenInstrument={(p) => handleOpenInstrument(p, false)}
                  onToggleEffects={handleToggleEffectsFromHeader}
                  onOpenMyProjects={() => setMyProjectsOpen(true)}
                  onCreateNewProject={() => handleCreateNewProject()}
                  onChangeBpm={handleChangeBpm}
                  onChangeTimeSignature={handleChangeTimeSignature}
                  onToggleMetronome={handleToggleMetronome}
                  onToggleLoop={handleToggleLoop}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onStop={handleStop}
                  onToggleRecord={handleToggleRecord}
                  onChangeMasterVolume={handleChangeMasterVolume}
                  onPanic={handlePanic}
                  onToggleFullscreen={toggleFullscreenLandscape}
                  onOpenAudioMonitor={handleOpenAudioMonitor}
                />

                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <SessionView
                    project={project}
                    savedProjectsCount={savedProjects.length}
                    deviceFx={deviceFx}
                    focusedTrack={focusedFxTrack}
                    onFocusTrack={setFocusedFxTrack}
                    onOpenInstrument={handleOpenInstrument}
                    onOpenEffects={handleOpenEffectsForTrack}
                    onLaunchSerumSlot={handleLaunchSerumSlot}
                    onLaunchSubbassPattern={handleLaunchSubbassPattern}
                    onLaunchTs666Pattern={handleLaunchTs666Pattern}
                    onLaunchBeatboxSlot={handleLaunchBeatboxSlot}
                    onSelectBassRemixPreset={handleSelectBassRemixPreset}
                    onLaunchScene={handleLaunchScene}
                    onStopAllClips={handleStop}
                    onChangeRouting={handleChangeRouting}
                    onChangeProjectName={handleChangeProjectName}
                    onImportProject={handleImportProject}
                    onOpenMyProjects={() => setMyProjectsOpen(true)}
                    onCreateNewProject={() => handleCreateNewProject()}
                  />

                  {deviceRackOpen && (
                    <FxDeviceRack
                      activeTrack={focusedFxTrack}
                      modules={deviceFx[focusedFxTrack] ?? []}
                      channelBypass={activeChannelBypass}
                      onSelectTrack={setFocusedFxTrack}
                      onChangeModules={handleChangeTrackDeviceFx}
                      onToggleChannelBypass={handleToggleChannelFxBypass}
                      onOpenBrowser={(track) => {
                        setFocusedFxTrack(track);
                        setFxBrowserOpen(true);
                      }}
                      onPresetsUpdated={setUserFxPresets}
                    />
                  )}
                </div>
              </div>
            )}
          </Suspense>
        </div>
      )}

      {/* Lazy-Mounted Studio Modals */}
      <Suspense fallback={null}>
        {fxBrowserOpen && (
          <FxBrowserModal
            open={fxBrowserOpen}
            targetTrack={focusedFxTrack}
            activeModules={deviceFx[focusedFxTrack] ?? []}
            userPresets={userFxPresets}
            onClose={() => setFxBrowserOpen(false)}
            onChangeTargetTrack={setFocusedFxTrack}
            onAddEffect={(type) => handleAddModularFx(focusedFxTrack, type)}
            onLoadPreset={(preset) => handleLoadFxChainPreset(focusedFxTrack, preset)}
            onDeleteUserPreset={(id) => setUserFxPresets(deleteUserFxChainPreset(id))}
          />
        )}

        {myProjectsOpen && (
          <MyProjectsModal
            open={myProjectsOpen}
            projects={savedProjects}
            activeProjectId={project.id}
            onClose={() => setMyProjectsOpen(false)}
            onCreateNewProject={handleCreateNewProject}
            onSelectProject={handleOpenProject}
            onRenameProject={handleRenameProject}
            onDuplicateProject={handleDuplicateProject}
            onDeleteProject={handleDeleteProject}
            onImportProject={handleImportProject}
          />
        )}

        {audioMonitorOpen && (
          <AudioMonitorModal
            open={audioMonitorOpen}
            onClose={() => setAudioMonitorOpen(false)}
          />
        )}

        {androidExportOpen && (
          <AndroidExportModal
            open={androidExportOpen}
            onClose={() => setAndroidExportOpen(false)}
          />
        )}
      </Suspense>

      <OfflineIndicator />
    </div>
  );
}
