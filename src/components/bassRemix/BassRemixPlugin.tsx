import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  FolderOpen,
  HardDrive,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Pause,
  Play,
  Plus,
  Save,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Waves,
  X,
} from 'lucide-react';
import { bassRemixEngine } from '../../audio/BassRemixEngine';
import {
  BASS_REMIX_FACTORY_PRESETS,
  createBasePatch,
  deleteUserBassRemixPreset,
  loadUserBassRemixPresets,
  saveUserBassRemixPreset,
} from '../../audio/bassRemixPresets';
import {
  getBassRemixTelemetry,
  subscribeBassRemixTelemetry,
} from '../../audio/bassRemixTelemetryStore';
import type {
  BassRemixAudioMeta,
  BassRemixMicPermission,
  BassRemixPatch,
  BassRemixPreset,
  BassRemixProjectState,
  BassRemixSavedRecordingMeta,
} from '../../types/bassRemix';
import type { StudioRoutingConfig } from '../../types/beatbox';
import type { ModularFxInstance } from '../../types/fx';
import { FxDeviceRack } from '../fx/FxDeviceRack';
import { PluginChannelStrip } from '../PluginChannelStrip';
import { BassRemixAutomationEditor } from './BassRemixAutomationEditor';
import {
  BassRemixOttPanel,
  BassRemixTransformStrip,
  BassRemixVolumePanel,
  BassRemixWobblePanel,
} from './BassRemixSectionPanels';
import { BassRemixWaveformPanel } from './BassRemixWaveformPanel';

interface BassRemixPluginProps {
  state: BassRemixProjectState;
  routing: StudioRoutingConfig;
  bpm: number;
  isFullscreen: boolean;
  deviceFx?: ModularFxInstance[];
  onChangeState: (updater: (prev: BassRemixProjectState) => BassRemixProjectState) => void;
  onChangeRouting: (patch: Partial<StudioRoutingConfig>) => void;
  onChangeBpm: (bpm: number) => void;
  onToggleFullscreen: () => void;
  onBack: () => void;
  onChangeDeviceFx?: (next: ModularFxInstance[]) => void;
  onOpenEffectsBrowser?: () => void;
}

function fmtRecTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

export const BassRemixPlugin: React.FC<BassRemixPluginProps> = ({
  state,
  routing,
  bpm,
  isFullscreen,
  deviceFx = [],
  onChangeState,
  onChangeRouting,
  onToggleFullscreen,
  onBack,
  onChangeDeviceFx,
  onOpenEffectsBrowser,
}) => {
  const [audioMeta, setAudioMeta] = useState<BassRemixAudioMeta | null>(() =>
    bassRemixEngine.getAudioMeta()
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(
    () => getBassRemixTelemetry().isPlaying
  );
  const [recState, setRecState] = useState<'idle' | 'recording' | 'paused'>(
    () => getBassRemixTelemetry().recState
  );
  const [recDurationSec, setRecDurationSec] = useState<number>(0);
  const [recInputLevel, setRecInputLevel] = useState<number>(0);
  const [micPermission, setMicPermission] = useState<BassRemixMicPermission>(
    () => getBassRemixTelemetry().micPermission
  );
  const [micDeviceLabel, setMicDeviceLabel] = useState<string>(
    () => getBassRemixTelemetry().micDeviceLabel
  );
  const [savedRecordings, setSavedRecordings] = useState<BassRemixSavedRecordingMeta[]>([]);
  const [recordingsDrawerOpen, setRecordingsDrawerOpen] = useState(false);

  const [presetDrawerOpen, setPresetDrawerOpen] = useState(false);
  const [userPresets, setUserPresets] = useState<BassRemixPreset[]>(() =>
    loadUserBassRemixPresets()
  );
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [fxRackOpen, setFxRackOpen] = useState(false);

  const [pendingAction, setPendingAction] = useState<
    | { kind: 'record' }
    | { kind: 'import'; file: File }
    | { kind: 'clear' }
    | { kind: 'loadSaved'; rec: BassRemixSavedRecordingMeta }
    | null
  >(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'error' | 'info';
    text: string;
  } | null>(null);
  const [exportProgress, setExportProgress] = useState<{
    format: 'wav' | 'mp3';
    pct: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync patch, BPM, selection, loop & A/B into BassRemixEngine
  useEffect(() => {
    bassRemixEngine.setPatch(state.patch);
  }, [state.patch]);

  useEffect(() => {
    bassRemixEngine.setBpm(bpm);
  }, [bpm]);

  useEffect(() => {
    bassRemixEngine.setAbMode(state.abMode);
  }, [state.abMode]);

  useEffect(() => {
    bassRemixEngine.setSelectionAndLoop(
      state.selStartNorm,
      state.selEndNorm,
      state.loopPlayback
    );
  }, [state.selStartNorm, state.selEndNorm, state.loopPlayback]);

  // Check real microphone permission status, restore last local audio, & load local recordings on mount; release mic on unmount
  useEffect(() => {
    void bassRemixEngine.checkMicPermission();
    void bassRemixEngine.restoreLastAudioIfEmpty();
    void bassRemixEngine
      .listSavedRecordings()
      .then(setSavedRecordings)
      .catch(() => {});
    return () => {
      bassRemixEngine.stopRecording();
    };
  }, []);

  // Subscribe to buffer & telemetry updates
  useEffect(() => {
    const unsubBuf = bassRemixEngine.subscribeBuffer(() => {
      setAudioMeta(bassRemixEngine.getAudioMeta());
    });
    const unsubTelem = subscribeBassRemixTelemetry((t) => {
      setIsPlaying(t.isPlaying);
      setRecState(t.recState);
      setRecDurationSec(t.recDurationSec);
      setRecInputLevel(t.recInputLevel);
      setMicPermission(t.micPermission);
      setMicDeviceLabel(t.micDeviceLabel);
    });
    return () => {
      unsubBuf();
      unsubTelem();
    };
  }, []);

  const updatePatch = useCallback(
    (updater: (prev: BassRemixPatch) => BassRemixPatch) => {
      onChangeState((prev) => ({
        ...prev,
        patch: updater(prev.patch),
      }));
    },
    [onChangeState]
  );

  const refreshSavedRecordings = useCallback(async () => {
    try {
      const list = await bassRemixEngine.listSavedRecordings();
      setSavedRecordings(list);
    } catch {
      // ignore IndexedDB unavailable
    }
  }, []);

  // Explicit Mic Permission Request (Android / HTTPS friendly)
  const handleRequestMicPermission = async () => {
    setStatusMessage(null);
    try {
      const res = await bassRemixEngine.requestMicPermission();
      setStatusMessage({
        type: 'info',
        text: `Microphone ready: ${res.deviceLabel}. Tap START to record.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Microphone permission denied or unavailable.',
      });
    }
  };

  // Audio Input Handlers with Safe Confirmation when overwriting existing audio
  const executeRecordStart = async () => {
    setStatusMessage(null);
    try {
      await bassRemixEngine.startRecording();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Microphone access denied or unavailable.',
      });
    }
  };

  const handleStartRecordClick = () => {
    if (recState !== 'idle') return;
    if (audioMeta) {
      setPendingAction({ kind: 'record' });
    } else {
      void executeRecordStart();
    }
  };

  const handleStopRecording = async () => {
    const meta = bassRemixEngine.stopRecording();
    if (!meta) {
      setStatusMessage({
        type: 'error',
        text: 'No microphone audio was captured. Verify mic permission and input level.',
      });
      return;
    }
    onChangeState((prev) => ({ ...prev, selStartNorm: 0, selEndNorm: 1 }));
    try {
      await bassRemixEngine.saveCurrentBufferLocally(meta.fileName);
      await refreshSavedRecordings();
      setStatusMessage({
        type: 'info',
        text: `Recorded ${meta.durationSec.toFixed(2)}s (${meta.sampleRate} Hz) and saved locally.`,
      });
    } catch {
      setStatusMessage({
        type: 'info',
        text: `Recorded ${meta.durationSec.toFixed(2)}s at ${meta.sampleRate} Hz.`,
      });
    }
  };

  const handleLoadSavedRecording = async (rec: BassRemixSavedRecordingMeta) => {
    setStatusMessage(null);
    try {
      const meta = await bassRemixEngine.loadSavedRecording(rec.id);
      onChangeState((prev) => ({ ...prev, selStartNorm: 0, selEndNorm: 1 }));
      setRecordingsDrawerOpen(false);
      setStatusMessage({
        type: 'info',
        text: `Loaded saved recording "${meta.fileName}" (${meta.durationSec.toFixed(2)}s).`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load saved recording.',
      });
    }
  };

  const handleDownloadSavedRawWav = async (rec: BassRemixSavedRecordingMeta) => {
    try {
      const { blob, filename } = await bassRemixEngine.exportSavedRecordingRawWav(rec.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to export recording WAV.',
      });
    }
  };

  const executeFileImport = async (file: File) => {
    setStatusMessage(null);
    try {
      const meta = await bassRemixEngine.importAudioFile(file);
      onChangeState((prev) => ({ ...prev, selStartNorm: 0, selEndNorm: 1 }));
      setStatusMessage({
        type: 'info',
        text: `Loaded ${meta.fileName} (${meta.durationSec.toFixed(2)}s · ${meta.sampleRate} Hz).`,
      });
    } catch {
      setStatusMessage({
        type: 'error',
        text: `Could not decode "${file.name}". Please import a valid MP3 or WAV file.`,
      });
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (audioMeta) {
      setPendingAction({ kind: 'import', file });
    } else {
      void executeFileImport(file);
    }
  };

  const handleConfirmPending = () => {
    if (!pendingAction) return;
    const act = pendingAction;
    setPendingAction(null);
    if (act.kind === 'record') {
      void executeRecordStart();
    } else if (act.kind === 'import') {
      void executeFileImport(act.file);
    } else if (act.kind === 'clear') {
      bassRemixEngine.clearAudio();
      onChangeState((prev) => ({ ...prev, selStartNorm: 0, selEndNorm: 1 }));
    } else if (act.kind === 'loadSaved') {
      void handleLoadSavedRecording(act.rec);
    }
  };

  const handlePlayStop = () => {
    if (!audioMeta) return;
    if (isPlaying) {
      bassRemixEngine.stop();
    } else {
      void bassRemixEngine.play();
    }
  };

  const handleExport = async (format: 'wav' | 'mp3') => {
    if (!audioMeta || exportProgress) return;
    setStatusMessage(null);
    setExportProgress({ format, pct: 0.02 });
    try {
      const { blob, filename } = await bassRemixEngine.exportProcessedAudio(
        format,
        (pct) => {
          setExportProgress({ format, pct });
        }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMessage({
        type: 'info',
        text: `Exported ${filename} (${format.toUpperCase()}).`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : `Failed to export ${format.toUpperCase()}.`,
      });
    } finally {
      setExportProgress(null);
    }
  };

  const allPresets = useMemo(
    () => [...BASS_REMIX_FACTORY_PRESETS, ...userPresets],
    [userPresets]
  );

  const handleLoadPreset = (preset: BassRemixPreset) => {
    const freshPatch = createBasePatch(preset.patch);
    onChangeState((prev) => ({
      ...prev,
      patch: {
        ...freshPatch,
        // Preserve user's automation curves if they want, or load clean preset curves
        automation: freshPatch.automation,
      },
    }));
    setPresetDrawerOpen(false);
  };

  const handleSaveUserPreset = () => {
    if (!saveName.trim()) return;
    const updated = saveUserBassRemixPreset(saveName, state.patch);
    setUserPresets(updated);
    setSaveName('');
    setSaveOpen(false);
  };

  return (
    <div className="h-dvh w-full flex flex-col bg-[#0C0704] text-[#F6E2CE] overflow-hidden select-none">
      {/* TOP BRONZE / COPPER HARDWARE HEADER */}
      <header className="flex items-center justify-between gap-1.5 px-2 sm:px-3 h-11 bg-[#190F0A] border-b border-[#5B3A22] shrink-0 overflow-x-auto synth-scroll">
        {/* Left: Back + Title + Record + Import */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onBack}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1 px-2 h-8 rounded bg-[#27170E] hover:bg-[#382114] border border-[#6B4427] text-[11px] font-display font-bold text-[#F6E2CE] cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#E08A3C]" />
            <span>BACK</span>
          </button>

          <div className="flex items-center gap-1.5 px-1.5">
            <Waves className="w-4 h-4 text-[#EF4444] shrink-0" />
            <span className="font-display text-xs sm:text-sm font-bold tracking-wider text-[#FDE68A] whitespace-nowrap">
              BASS REMIX
            </span>
          </div>

          {/* Android & Browser Microphone Permission Status + START / PAUSE / RESUME / STOP */}
          <div className="flex items-center gap-1 bg-[#0E0805] p-0.5 rounded border border-[#4D301C] shrink-0">
            <button
              type="button"
              onClick={() => void handleRequestMicPermission()}
              style={{ touchAction: 'manipulation' }}
              title={
                micPermission === 'granted'
                  ? `Microphone granted${micDeviceLabel ? ` (${micDeviceLabel})` : ''}`
                  : micPermission === 'denied'
                  ? 'Microphone blocked — tap to retry or enable in Chrome site settings'
                  : micPermission === 'insecure'
                  ? 'HTTPS connection required for Android microphone'
                  : 'Request device microphone permission'
              }
              className={`inline-flex items-center gap-1 px-1.5 h-7 rounded text-[9.5px] font-display font-bold cursor-pointer whitespace-nowrap border transition-colors ${
                micPermission === 'granted'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : micPermission === 'denied' || micPermission === 'unavailable' || micPermission === 'insecure'
                  ? 'bg-[#DC2626]/20 border-[#EF4444]/60 text-[#FCA5A5]'
                  : 'bg-[#2A180D] border-[#E08A3C]/60 text-[#FDE68A] hover:bg-[#3A2213]'
              }`}
            >
              {micPermission === 'denied' || micPermission === 'unavailable' || micPermission === 'insecure' ? (
                <MicOff className="w-3 h-3 shrink-0" />
              ) : (
                <Mic className="w-3 h-3 shrink-0" />
              )}
              <span>
                {micPermission === 'granted'
                  ? 'MIC READY'
                  : micPermission === 'denied'
                  ? 'MIC BLOCKED'
                  : micPermission === 'insecure'
                  ? 'HTTPS REQ'
                  : micPermission === 'unavailable'
                  ? 'NO MIC'
                  : 'ALLOW MIC'}
              </span>
            </button>

            {recState === 'idle' ? (
              <button
                type="button"
                onClick={handleStartRecordClick}
                style={{ touchAction: 'manipulation' }}
                title="Start Recording from Device Microphone"
                className="inline-flex items-center gap-1 px-2 h-7 rounded text-[10px] font-display font-bold cursor-pointer whitespace-nowrap bg-[#DC2626] hover:bg-[#EF4444] text-white transition-colors"
              >
                <Mic className="w-3 h-3 shrink-0" />
                <span>START</span>
              </button>
            ) : (
              <>
                {recState === 'recording' ? (
                  <button
                    type="button"
                    onClick={() => bassRemixEngine.pauseRecording()}
                    style={{ touchAction: 'manipulation' }}
                    className="inline-flex items-center gap-1 px-2 h-7 rounded text-[10px] font-display font-bold cursor-pointer whitespace-nowrap bg-[#E08A3C] text-black hover:bg-[#F59E0B]"
                  >
                    <Pause className="w-3 h-3 fill-current" />
                    <span>PAUSE</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => bassRemixEngine.resumeRecording()}
                    style={{ touchAction: 'manipulation' }}
                    className="inline-flex items-center gap-1 px-2 h-7 rounded text-[10px] font-display font-bold cursor-pointer whitespace-nowrap bg-[#DC2626] text-white hover:bg-[#EF4444]"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>RESUME</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleStopRecording()}
                  style={{ touchAction: 'manipulation' }}
                  className="inline-flex items-center gap-1 px-2 h-7 rounded bg-[#381B14] hover:bg-[#52241B] border border-[#EF4444]/60 text-[#FCA5A5] text-[10px] font-display font-bold cursor-pointer whitespace-nowrap"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  <span>STOP</span>
                </button>

                <span className="px-1 font-mono-num text-[10px] text-[#FCA5A5] whitespace-nowrap">
                  {fmtRecTime(recDurationSec)}
                </span>
                <div
                  title="Live Microphone Input Level"
                  className="w-10 h-2.5 rounded bg-[#1B0E08] border border-[#462B19] overflow-hidden mr-1"
                >
                  <div
                    className="h-full bg-gradient-to-r from-[#E08A3C] to-[#EF4444] transition-all duration-75"
                    style={{ width: `${Math.min(100, Math.round(recInputLevel * 200))}%` }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Saved Local Recordings Library */}
          <button
            type="button"
            onClick={() => {
              void refreshSavedRecordings();
              setRecordingsDrawerOpen(true);
            }}
            style={{ touchAction: 'manipulation' }}
            title="Locally Saved Microphone Recordings"
            className="inline-flex items-center gap-1 px-2 h-8 rounded bg-[#21130B] hover:bg-[#321D11] border border-[#5B3A22] text-[10px] font-display font-bold text-[#F6E2CE] cursor-pointer whitespace-nowrap shrink-0"
          >
            <HardDrive className="w-3.5 h-3.5 text-[#E08A3C]" />
            <span>RECS ({savedRecordings.length})</span>
          </button>

          {/* Import MP3 / WAV (Independent of Microphone Recording) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1 px-2 h-8 rounded bg-[#27170E] hover:bg-[#382114] border border-[#6B4427] text-[10px] font-display font-bold text-[#FDE68A] cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-[#E08A3C]" />
            <span>IMPORT MP3/WAV</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav,audio/*"
            className="hidden"
            onChange={handleFileInputChange}
          />

          {audioMeta && recState === 'idle' && (
            <button
              type="button"
              aria-label="Remove Loaded Audio"
              title="Remove Audio"
              onClick={() => setPendingAction({ kind: 'clear' })}
              className="w-8 h-8 rounded bg-[#23130C] hover:bg-[#3F1616] border border-[#5B3A22] flex items-center justify-center text-[#D7B899] hover:text-[#FCA5A5] cursor-pointer shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Center: Play / Stop + A/B Compare + Preset Drawer */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={!audioMeta}
            onClick={handlePlayStop}
            style={{ touchAction: 'manipulation' }}
            className={`inline-flex items-center gap-1 px-2.5 h-8 rounded border font-display font-bold text-[10.5px] cursor-pointer whitespace-nowrap transition-colors ${
              !audioMeta
                ? 'opacity-40 bg-[#1B100A] border-[#3F2616] text-[#8C6242] cursor-not-allowed'
                : isPlaying
                ? 'bg-[#DC2626] border-[#FCA5A5] text-white'
                : 'bg-[#2B190E] hover:bg-[#3D2415] border-[#E08A3C] text-[#FDE68A]'
            }`}
          >
            {isPlaying ? (
              <Square className="w-3 h-3 fill-current" />
            ) : (
              <Play className="w-3 h-3 fill-current" />
            )}
            <span>{isPlaying ? 'STOP' : 'PLAY'}</span>
          </button>

          {/* A/B Comparison Switch */}
          <div className="flex items-center bg-[#0E0805] p-0.5 rounded border border-[#4D301C] shrink-0">
            <button
              type="button"
              onClick={() => onChangeState((p) => ({ ...p, abMode: 'processed' }))}
              style={{ touchAction: 'manipulation' }}
              className={`px-2 h-7 rounded text-[9.5px] font-display font-bold cursor-pointer whitespace-nowrap ${
                state.abMode === 'processed'
                  ? 'bg-[#DC2626] text-white'
                  : 'text-[#B79374] hover:text-white'
              }`}
            >
              PROCESSED
            </button>
            <button
              type="button"
              onClick={() => onChangeState((p) => ({ ...p, abMode: 'original' }))}
              style={{ touchAction: 'manipulation' }}
              className={`px-2 h-7 rounded text-[9.5px] font-display font-bold cursor-pointer whitespace-nowrap ${
                state.abMode === 'original'
                  ? 'bg-[#E08A3C] text-black'
                  : 'text-[#B79374] hover:text-white'
              }`}
            >
              ORIGINAL
            </button>
          </div>

          {/* Preset Selector Button */}
          <button
            type="button"
            onClick={() => setPresetDrawerOpen((o) => !o)}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded bg-[#27170E] hover:bg-[#382114] border border-[#6B4427] text-[10px] font-display font-bold text-[#FDE68A] cursor-pointer whitespace-nowrap"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#E08A3C]" />
            <span className="max-w-[130px] truncate">{state.patch.name}</span>
          </button>
        </div>

        {/* Right: Export WAV / MP3 + FX + Channel Strip + Fullscreen */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 bg-[#0E0805] p-0.5 rounded border border-[#4D301C]">
            <button
              type="button"
              disabled={!audioMeta || Boolean(exportProgress)}
              onClick={() => void handleExport('wav')}
              style={{ touchAction: 'manipulation' }}
              className={`inline-flex items-center gap-1 px-2 h-7 rounded text-[9.5px] font-display font-bold cursor-pointer whitespace-nowrap ${
                !audioMeta || exportProgress
                  ? 'opacity-40 text-[#8C6242] cursor-not-allowed'
                  : 'bg-[#2A180F] hover:bg-[#3F2417] text-[#FDE68A]'
              }`}
            >
              <Download className="w-3 h-3 text-[#E08A3C]" />
              <span>WAV</span>
            </button>
            <button
              type="button"
              disabled={!audioMeta || Boolean(exportProgress)}
              onClick={() => void handleExport('mp3')}
              style={{ touchAction: 'manipulation' }}
              className={`inline-flex items-center gap-1 px-2 h-7 rounded text-[9.5px] font-display font-bold cursor-pointer whitespace-nowrap ${
                !audioMeta || exportProgress
                  ? 'opacity-40 text-[#8C6242] cursor-not-allowed'
                  : 'bg-[#361515] hover:bg-[#541C1C] text-[#FCA5A5]'
              }`}
            >
              <Download className="w-3 h-3 text-[#EF4444]" />
              <span>MP3</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setFxRackOpen((o) => !o)}
            aria-pressed={fxRackOpen}
            className={`hidden sm:inline-flex items-center gap-1 px-2 h-8 rounded border text-[10px] font-display font-bold cursor-pointer whitespace-nowrap ${
              fxRackOpen
                ? 'bg-[#DC2626]/25 border-[#EF4444] text-[#FCA5A5]'
                : 'bg-[#22140C] border-[#5B3A22] text-[#D7B899] hover:text-white'
            }`}
          >
            <Sparkles className="w-3 h-3 text-[#E08A3C]" />
            <span>FX ({deviceFx.length})</span>
          </button>

          <PluginChannelStrip
            plugin="bassremix"
            routing={routing}
            onChangeRouting={onChangeRouting}
            accent="amber"
          />

          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label="Toggle Fullscreen"
            className="w-8 h-8 rounded bg-[#22140C] border border-[#5B3A22] flex items-center justify-center text-[#D7B899] hover:text-white cursor-pointer shrink-0"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </header>

      {/* Non-blocking Confirmation / Export Progress / Status Banner */}
      {(pendingAction || exportProgress || statusMessage) && (
        <div className="flex items-center justify-between gap-2 px-3 py-1 bg-[#24130B] border-b border-[#6B4427] text-xs shrink-0">
          {pendingAction ? (
            <>
              <span className="text-[#FDE68A] font-medium">
                {pendingAction.kind === 'record'
                  ? 'Replace the current active audio with a new microphone recording? (Saved recordings remain in RECS).'
                  : pendingAction.kind === 'import'
                  ? `Replace the current active audio with "${pendingAction.file.name}"?`
                  : pendingAction.kind === 'loadSaved'
                  ? `Load saved recording "${pendingAction.rec.name}" into BASS REMIX?`
                  : 'Remove the currently loaded audio from BASS REMIX?'}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleConfirmPending}
                  className="px-2.5 h-6 rounded bg-[#DC2626] hover:bg-[#EF4444] text-white font-display font-bold text-[10px] cursor-pointer"
                >
                  CONFIRM
                </button>
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  className="px-2 h-6 rounded bg-[#140B06] border border-[#5B3A22] text-[#D7B899] hover:text-white text-[10px] font-display font-bold cursor-pointer"
                >
                  CANCEL
                </button>
              </div>
            </>
          ) : exportProgress ? (
            <div className="flex items-center gap-3 w-full">
              <span className="font-display font-bold text-[10.5px] text-[#FCA5A5] whitespace-nowrap">
                RENDERING {exportProgress.format.toUpperCase()} · {Math.round(exportProgress.pct * 100)}%
              </span>
              <div className="flex-1 h-2 rounded bg-[#0C0704] border border-[#4A2E1B] overflow-hidden">
                <div
                  className="h-full bg-[#EF4444] transition-all duration-100"
                  style={{ width: `${Math.round(exportProgress.pct * 100)}%` }}
                />
              </div>
            </div>
          ) : statusMessage ? (
            <>
              <span
                className={
                  statusMessage.type === 'error'
                    ? 'text-[#FCA5A5] font-medium'
                    : 'text-[#FDE68A]'
                }
              >
                {statusMessage.text}
              </span>
              <button
                type="button"
                aria-label="Dismiss Notice"
                onClick={() => setStatusMessage(null)}
                className="text-[#B79374] hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* MAIN PLUGIN WORKSPACE (Zero-Scroll Fullscreen Landscape) */}
      <div className="flex-1 min-h-0 flex flex-col gap-1.5 p-1.5 sm:p-2 overflow-hidden">
        {/* TOP STAGE: LARGE RED WAVEFORM & SPECTRUM + DUBSTEP TRANSFORM STRIP */}
        <div className="flex flex-col gap-1.5 min-h-0 flex-[1.05]">
          <BassRemixWaveformPanel
            audioMeta={audioMeta}
            selStartNorm={state.selStartNorm}
            selEndNorm={state.selEndNorm}
            loopPlayback={state.loopPlayback}
            onChangeSelection={(s, e) =>
              onChangeState((p) => ({ ...p, selStartNorm: s, selEndNorm: e }))
            }
            onToggleLoop={() =>
              onChangeState((p) => ({ ...p, loopPlayback: !p.loopPlayback }))
            }
            onSeekPlay={(norm) => {
              if (isPlaying) {
                void bassRemixEngine.play(norm);
              }
            }}
          />

          <BassRemixTransformStrip
            transform={state.patch.transform}
            effectMix={state.patch.effectMix}
            onChangeTransform={(patch) =>
              updatePatch((p) => ({
                ...p,
                transform: { ...p.transform, ...patch },
              }))
            }
            onChangeEffectMix={(effectMix) =>
              updatePatch((p) => ({ ...p, effectMix }))
            }
          />
        </div>

        {/* BOTTOM STAGE: 4 CLEARLY SEPARATED SECTIONS (OTT | AUTOMATION | WOBBLE | VOLUME) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-1.5 flex-[1.15] min-h-0 overflow-y-auto lg:overflow-hidden synth-scroll">
          <div className="lg:col-span-3 min-h-[168px] lg:min-h-0">
            <BassRemixOttPanel
              ott={state.patch.ott}
              onChange={(patch) =>
                updatePatch((p) => ({ ...p, ott: { ...p.ott, ...patch } }))
              }
            />
          </div>

          <div className="lg:col-span-4 min-h-[180px] lg:min-h-0">
            <BassRemixAutomationEditor
              automation={state.patch.automation}
              bpm={bpm}
              onChange={(automation) =>
                updatePatch((p) => ({ ...p, automation }))
              }
            />
          </div>

          <div className="lg:col-span-3 min-h-[168px] lg:min-h-0">
            <BassRemixWobblePanel
              wobble={state.patch.wobble}
              bpm={bpm}
              onChange={(patch) =>
                updatePatch((p) => ({ ...p, wobble: { ...p.wobble, ...patch } }))
              }
            />
          </div>

          <div className="lg:col-span-2 min-h-[168px] lg:min-h-0">
            <BassRemixVolumePanel
              volume={state.patch.volume}
              bpm={bpm}
              onChange={(patch) =>
                updatePatch((p) => ({ ...p, volume: { ...p.volume, ...patch } }))
              }
            />
          </div>
        </div>

        {fxRackOpen && onChangeDeviceFx && onOpenEffectsBrowser && (
          <div className="shrink-0">
            <FxDeviceRack
              activeTrack="bassremix"
              modules={deviceFx}
              channelBypass={Boolean(routing.bassremixFxBypass)}
              hideTrackTabs
              onChangeModules={(_, next) => onChangeDeviceFx(next)}
              onToggleChannelBypass={() =>
                onChangeRouting({ bassremixFxBypass: !routing.bassremixFxBypass })
              }
              onOpenBrowser={() => onOpenEffectsBrowser()}
            />
          </div>
        )}
      </div>

      {/* PRESET DRAWER MODAL */}
      {presetDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bass Remix Presets"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setPresetDrawerOpen(false);
          }}
        >
          <div className="w-full max-w-lg max-h-[85dvh] flex flex-col rounded-xl border border-[#6B4427] bg-[#160E09] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#22140C] border-b border-[#4A2E1B]">
              <span className="font-display text-sm font-bold tracking-wider text-[#FDE68A]">
                BASS REMIX PRESETS
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSaveOpen((s) => !s)}
                  className="inline-flex items-center gap-1 px-2.5 h-7 rounded bg-[#2F1B10] hover:bg-[#442818] border border-[#E08A3C]/60 text-[10.5px] font-display font-bold text-[#FDE68A] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>SAVE CURRENT</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPresetDrawerOpen(false)}
                  className="w-7 h-7 rounded bg-[#140B06] border border-[#4A2E1B] flex items-center justify-center text-[#D7B899] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {saveOpen && (
              <div className="flex items-center gap-2 px-4 py-2 bg-[#1D110A] border-b border-[#4A2E1B]">
                <input
                  type="text"
                  placeholder="Preset name..."
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="flex-1 h-8 px-2.5 rounded bg-[#0C0704] border border-[#5B3A22] text-xs text-white focus:outline-none focus:border-[#E08A3C]"
                />
                <button
                  type="button"
                  onClick={handleSaveUserPreset}
                  className="inline-flex items-center gap-1 px-3 h-8 rounded bg-[#DC2626] hover:bg-[#EF4444] text-white text-xs font-display font-bold cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>SAVE</span>
                </button>
              </div>
            )}

            <div className="p-3 space-y-1.5 overflow-y-auto synth-scroll">
              {allPresets.map((preset) => {
                const isSelected = state.patch.name === preset.name;
                return (
                  <div
                    key={preset.id}
                    className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-[#2E1910] border-[#EF4444]'
                        : 'bg-[#100A06] border-[#3F2616] hover:border-[#CD7F32]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadPreset(preset)}
                      className="flex-1 text-left cursor-pointer min-w-0"
                    >
                      <div className="font-display text-xs font-bold text-[#FDE68A] truncate">
                        {preset.name}
                      </div>
                      <div className="text-[10.5px] text-[#B79374] truncate">
                        {preset.description}
                      </div>
                    </button>
                    {!preset.isFactory && (
                      <button
                        type="button"
                        aria-label={`Delete ${preset.name}`}
                        onClick={() => setUserPresets(deleteUserBassRemixPreset(preset.id))}
                        className="w-7 h-7 rounded bg-[#2A1111] hover:bg-[#491818] text-[#FCA5A5] flex items-center justify-center cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* LOCAL SAVED RECORDINGS MODAL */}
      {recordingsDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Saved Microphone Recordings"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setRecordingsDrawerOpen(false);
          }}
        >
          <div className="w-full max-w-lg max-h-[85dvh] flex flex-col rounded-xl border border-[#6B4427] bg-[#160E09] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#22140C] border-b border-[#4A2E1B]">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[#E08A3C]" />
                <span className="font-display text-sm font-bold tracking-wider text-[#FDE68A]">
                  LOCAL RECORDINGS ({savedRecordings.length})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRecordingsDrawerOpen(false)}
                className="w-7 h-7 rounded bg-[#140B06] border border-[#4A2E1B] flex items-center justify-center text-[#D7B899] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 space-y-2 overflow-y-auto synth-scroll">
              {savedRecordings.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#B79374]">
                  No microphone recordings saved yet. Tap START to record real audio from your device microphone.
                </div>
              ) : (
                savedRecordings.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-[#3F2616] bg-[#100A06]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-xs font-bold text-[#FDE68A] truncate">
                        {rec.name}
                      </div>
                      <div className="text-[10px] font-mono-num text-[#B79374]">
                        {rec.durationSec.toFixed(2)}s · {rec.sampleRate} Hz ·{' '}
                        {Math.max(1, Math.round(rec.sizeBytes / 1024))} KB
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (audioMeta) {
                            setRecordingsDrawerOpen(false);
                            setPendingAction({ kind: 'loadSaved', rec });
                          } else {
                            void handleLoadSavedRecording(rec);
                          }
                        }}
                        className="px-2.5 h-7 rounded bg-[#DC2626] hover:bg-[#EF4444] text-white text-[10px] font-display font-bold cursor-pointer"
                      >
                        LOAD
                      </button>
                      <button
                        type="button"
                        title="Export Raw WAV Recording"
                        onClick={() => void handleDownloadSavedRawWav(rec)}
                        className="inline-flex items-center gap-1 px-2 h-7 rounded bg-[#27170E] hover:bg-[#3A2213] border border-[#6B4427] text-[#FDE68A] text-[10px] font-display font-bold cursor-pointer"
                      >
                        <Download className="w-3 h-3 text-[#E08A3C]" />
                        <span>WAV</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${rec.name}`}
                        onClick={() => {
                          void bassRemixEngine
                            .deleteSavedRecording(rec.id)
                            .then(() => refreshSavedRecordings());
                        }}
                        className="w-7 h-7 rounded bg-[#2A1111] hover:bg-[#491818] text-[#FCA5A5] flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
