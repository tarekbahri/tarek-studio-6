import React from 'react';
import {
  Activity,
  Circle,
  Cpu,
  Disc3,
  Drum,
  FilePlus2,
  Flame,
  FolderOpen,
  LayoutGrid,
  Layers,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  Sparkles,
  Square,
  Timer,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import { TIME_SIGNATURES, getTimeSignatureInfo } from '../audio/dawPresets';
import {
  useDawStep,
  useIsPaused,
  useIsPlaying,
  useMidiActive,
  usePlayheadStep,
} from '../audio/transportStore';
import type { TimeSignatureId } from '../types/daw';

export type StudioWorkspaceMode = 'session' | 'arrangement';
export type FullscreenInstrumentId = 'none' | 'serum' | 'subbass' | 'beatbox' | 'ts666' | 'bassremix';

interface TarekTransportBarProps {
  workspaceMode: StudioWorkspaceMode;
  deviceRackOpen: boolean;
  totalFxCount: number;
  bpm: number;
  timeSignature: TimeSignatureId;
  metronomeEnabled: boolean;
  loop: boolean;
  isPlaying?: boolean;
  isPaused?: boolean;
  isRecording: boolean;
  playheadStep?: number;
  dawStep?: number;
  masterVolume: number;
  midiActive?: boolean;
  isFullscreen: boolean;
  savedProjectsCount?: number;
  onChangeWorkspace: (mode: StudioWorkspaceMode) => void;
  onOpenInstrument: (plugin: 'serum' | 'subbass' | 'beatbox' | 'ts666' | 'bassremix') => void;
  onToggleEffects: () => void;
  onOpenMyProjects?: () => void;
  onCreateNewProject?: () => void;
  onChangeBpm: (bpm: number) => void;
  onChangeTimeSignature: (ts: TimeSignatureId) => void;
  onToggleMetronome: () => void;
  onToggleLoop: () => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onToggleRecord: () => void;
  onChangeMasterVolume: (vol: number) => void;
  onPanic: () => void;
  onToggleFullscreen: () => void;
  onOpenAudioMonitor?: () => void;
}

const TransportPositionBadge: React.FC<{
  workspaceMode: StudioWorkspaceMode;
  timeSignature: TimeSignatureId;
  playheadStepProp?: number;
  dawStepProp?: number;
  isPlayingProp?: boolean;
}> = React.memo(({ workspaceMode, timeSignature, playheadStepProp, dawStepProp, isPlayingProp }) => {
  const storeIsPlaying = useIsPlaying();
  const storePlayheadStep = usePlayheadStep();
  const storeDawStep = useDawStep();

  const isPlaying = isPlayingProp ?? storeIsPlaying;
  const playheadStep = playheadStepProp ?? storePlayheadStep;
  const dawStep = dawStepProp ?? storeDawStep;

  const tsInfo = getTimeSignatureInfo(timeSignature);
  const posStep = workspaceMode === 'arrangement' ? dawStep : playheadStep;
  const bar = Math.floor(posStep / tsInfo.stepsPerBar) + 1;
  const beat = Math.floor((posStep % tsInfo.stepsPerBar) / tsInfo.stepsPerBeat) + 1;
  const sixteenth = (Math.floor(posStep) % tsInfo.stepsPerBeat) + 1;

  return (
    <div className="hidden lg:flex items-center gap-1.5 px-2 h-8 rounded-md bg-[#090C12] border border-[#232E42] font-mono-num text-[11px] text-slate-200 shrink-0">
      <span className={isPlaying ? 'text-emerald-300 font-semibold' : 'text-slate-400'}>
        {bar}.{beat}.{sixteenth}
      </span>
    </div>
  );
});

const MidiActivityBadge: React.FC<{ midiActiveProp?: boolean }> = React.memo(({ midiActiveProp }) => {
  const storeMidiActive = useMidiActive();
  const midiActive = midiActiveProp ?? storeMidiActive;
  return (
    <div
      className={`hidden xl:flex items-center gap-1 px-2 h-8 rounded-md border text-[10px] font-mono-num whitespace-nowrap shrink-0 transition-colors ${
        midiActive
          ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
          : 'bg-[#090C12] border-[#232E42] text-slate-400'
      }`}
      title="Shared MIDI Communication Bus"
    >
      <Activity className="w-3 h-3" />
      <span>MIDI</span>
    </div>
  );
});

export const TarekTransportBar: React.FC<TarekTransportBarProps> = React.memo(({
  workspaceMode,
  deviceRackOpen,
  totalFxCount,
  bpm,
  timeSignature,
  metronomeEnabled,
  loop,
  isPlaying: isPlayingProp,
  isPaused: isPausedProp,
  isRecording,
  playheadStep: playheadStepProp,
  dawStep: dawStepProp,
  masterVolume,
  midiActive: midiActiveProp,
  isFullscreen,
  savedProjectsCount = 1,
  onChangeWorkspace,
  onOpenInstrument,
  onToggleEffects,
  onOpenMyProjects,
  onCreateNewProject,
  onChangeBpm,
  onChangeTimeSignature,
  onToggleMetronome,
  onToggleLoop,
  onPlay,
  onPause,
  onStop,
  onToggleRecord,
  onChangeMasterVolume,
  onPanic,
  onToggleFullscreen,
  onOpenAudioMonitor,
}) => {
  const storeIsPlaying = useIsPlaying();
  const storeIsPaused = useIsPaused();
  const isPlaying = isPlayingProp ?? storeIsPlaying;
  const isPaused = isPausedProp ?? storeIsPaused;

  return (
    <header className="flex items-center justify-between gap-1 sm:gap-2 px-1.5 sm:px-3 h-11 bg-[#0E131D] border-b border-[#263147] shrink-0 relative z-30 overflow-x-auto synth-scroll">
      {/* Left Zone: TAREK + Session/Arrangement Switcher + Fullscreen Plugin Launchers + EFFECTS */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <span className="font-display text-sm font-bold tracking-wider text-slate-100 px-1 whitespace-nowrap shrink-0">
          TAREK
        </span>

        {/* Ableton Workspace Segmented Control */}
        <div className="flex items-center gap-0.5 bg-[#090C12] p-0.5 rounded-md border border-[#232E42] shrink-0">
          <button
            type="button"
            onClick={() => onChangeWorkspace('session')}
            aria-pressed={workspaceMode === 'session'}
            style={{ touchAction: 'manipulation' }}
            className={`inline-flex items-center gap-1 px-2 h-7 rounded text-[11px] font-display font-bold transition-colors cursor-pointer whitespace-nowrap ${
              workspaceMode === 'session'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/60'
                : 'text-slate-300 hover:text-white border border-transparent'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>SESSION</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeWorkspace('arrangement')}
            aria-pressed={workspaceMode === 'arrangement'}
            style={{ touchAction: 'manipulation' }}
            className={`inline-flex items-center gap-1 px-2 h-7 rounded text-[11px] font-display font-bold transition-colors cursor-pointer whitespace-nowrap ${
              workspaceMode === 'arrangement'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/60'
                : 'text-slate-300 hover:text-white border border-transparent'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>ARRANGEMENT</span>
          </button>
        </div>

        {/* Fullscreen Instrument Launchers */}
        <div className="hidden sm:flex items-center gap-0.5 bg-[#090C12] p-0.5 rounded-md border border-[#232E42] shrink-0">
          <button
            type="button"
            title="Open SUBSYNTH Fullscreen"
            onClick={() => onOpenInstrument('subbass')}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1 px-2 h-7 rounded text-[10px] font-display font-bold text-blue-200 hover:bg-blue-500/15 border border-transparent hover:border-violet-400/40 cursor-pointer whitespace-nowrap"
          >
            <Disc3 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="hidden lg:inline">SUBSYNTH</span>
          </button>
          <button
            type="button"
            title="Open BEATBOX Fullscreen"
            onClick={() => onOpenInstrument('beatbox')}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1 px-2 h-7 rounded text-[10px] font-display font-bold text-amber-200 hover:bg-amber-500/15 border border-transparent hover:border-amber-400/40 cursor-pointer whitespace-nowrap"
          >
            <Drum className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden lg:inline">BEATBOX</span>
          </button>
          <button
            type="button"
            title="Open 666TS Fullscreen"
            onClick={() => onOpenInstrument('ts666')}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1 px-2 h-7 rounded text-[10px] font-display font-bold text-rose-200 hover:bg-rose-500/15 border border-transparent hover:border-rose-400/40 cursor-pointer whitespace-nowrap"
          >
            <Flame className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="hidden lg:inline">666TS</span>
          </button>
          <button
            type="button"
            title="Open BASS REMIX Fullscreen"
            onClick={() => onOpenInstrument('bassremix')}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1 px-2 h-7 rounded text-[10px] font-display font-bold text-amber-200 hover:bg-red-500/20 border border-red-500/35 hover:border-red-400/70 cursor-pointer whitespace-nowrap"
          >
            <Waves className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>BASS REMIX</span>
          </button>
        </div>

        {/* Dedicated EFFECTS Button */}
        <button
          type="button"
          onClick={onToggleEffects}
          aria-pressed={deviceRackOpen}
          title="Toggle Modular Effects Device View & Browser"
          style={{ touchAction: 'manipulation' }}
          className={`inline-flex items-center gap-1 px-2.5 h-8 rounded-md border text-[11px] font-display font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
            deviceRackOpen
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
              : 'bg-[#121928] border-[#2C3A54] text-slate-200 hover:border-cyan-400/50 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
          <span>EFFECTS</span>
          {totalFxCount > 0 && (
            <span className="font-mono-num text-[10px] px-1 rounded bg-cyan-500/25 text-cyan-200">
              {totalFxCount}
            </span>
          )}
        </button>

        {/* My Projects & + New Separate Project */}
        {(onOpenMyProjects || onCreateNewProject) && (
          <div className="flex items-center gap-1 shrink-0">
            {onOpenMyProjects && (
              <button
                type="button"
                onClick={onOpenMyProjects}
                title="Open My Projects Manager"
                style={{ touchAction: 'manipulation' }}
                className="inline-flex items-center gap-1 px-2 h-8 rounded-md bg-[#121928] hover:bg-[#192338] border border-[#2C3A54] hover:border-emerald-400/60 text-[11px] font-display font-bold text-slate-100 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="hidden md:inline">PROJECTS</span>
                <span className="font-mono-num text-[10px] px-1 rounded bg-emerald-500/20 text-emerald-300">
                  {savedProjectsCount}
                </span>
              </button>
            )}
            {onCreateNewProject && (
              <button
                type="button"
                onClick={onCreateNewProject}
                title="Create New Separate Project (keeps all previous projects saved)"
                style={{ touchAction: 'manipulation' }}
                className="inline-flex items-center gap-1 px-2 h-8 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/50 text-[11px] font-display font-bold text-emerald-200 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                <FilePlus2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                <span className="hidden lg:inline">NEW</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Center Zone: Global Synchronized Transport */}
      <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 shrink-0">
        <div className="flex items-center gap-0.5 bg-[#090C12] p-0.5 rounded-md border border-[#232E42] shrink-0">
          <button
            type="button"
            onClick={onPlay}
            aria-label="Play Transport"
            title={isPaused ? 'Resume Playback' : 'Play Shared Timeline'}
            style={{ touchAction: 'manipulation' }}
            className={`w-7 sm:w-8 h-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
              isPlaying
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-[#141B29] text-emerald-300 hover:bg-emerald-500/20'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
          </button>

          <button
            type="button"
            onClick={onPause}
            aria-label="Pause Transport"
            aria-pressed={isPaused}
            title="Pause at Current Position"
            style={{ touchAction: 'manipulation' }}
            className={`w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
              isPaused
                ? 'bg-amber-500/25 border border-amber-400 text-amber-300'
                : 'bg-[#141B29] text-slate-300 hover:text-white border border-transparent'
            }`}
          >
            <Pause className="w-3 h-3 fill-current" />
          </button>

          <button
            type="button"
            onClick={onStop}
            aria-label="Stop Transport"
            title="Stop & Reset Playhead"
            style={{ touchAction: 'manipulation' }}
            className="w-7 sm:w-8 h-7 rounded bg-[#141B29] text-slate-200 hover:text-white hover:bg-[#1E283C] flex items-center justify-center transition-colors cursor-pointer"
          >
            <Square className="w-3 h-3 fill-current" />
          </button>

          <button
            type="button"
            onClick={onToggleRecord}
            aria-label="Record Arm"
            aria-pressed={isRecording}
            title="Arm Real-Time Recording"
            style={{ touchAction: 'manipulation' }}
            className={`w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
              isRecording
                ? 'bg-rose-500/25 border border-rose-400 text-rose-300'
                : 'bg-[#141B29] text-slate-400 hover:text-rose-300 border border-transparent'
            }`}
          >
            <Circle className={`w-3 h-3 ${isRecording ? 'fill-rose-400 text-rose-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onToggleLoop}
            aria-label="Loop Timeline"
            aria-pressed={loop}
            title="Toggle Loop Playback"
            style={{ touchAction: 'manipulation' }}
            className={`hidden sm:flex w-7 h-7 rounded items-center justify-center transition-colors cursor-pointer ${
              loop
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                : 'bg-[#141B29] text-slate-500 hover:text-slate-300 border border-transparent'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggleMetronome}
            aria-label="Toggle Metronome"
            aria-pressed={metronomeEnabled}
            title={metronomeEnabled ? 'Metronome On' : 'Metronome Off'}
            style={{ touchAction: 'manipulation' }}
            className={`w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
              metronomeEnabled
                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/50'
                : 'bg-[#141B29] text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Timer className="w-3.5 h-3.5" />
          </button>
        </div>

        <TransportPositionBadge
          workspaceMode={workspaceMode}
          timeSignature={timeSignature}
          playheadStepProp={playheadStepProp}
          dawStepProp={dawStepProp}
          isPlayingProp={isPlayingProp}
        />

        {/* Global BPM + Time Signature */}
        <div className="flex items-center rounded-md bg-[#090C12] border border-[#232E42] h-8 overflow-hidden shrink-0">
          <button
            type="button"
            aria-label="Decrease BPM"
            onClick={() => onChangeBpm(Math.max(40, bpm - 1))}
            className="w-5 sm:w-6 h-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#182133] text-xs font-bold cursor-pointer"
          >
            -
          </button>
          <span className="px-1 sm:px-1.5 font-mono-num text-[11px] font-semibold text-amber-300 whitespace-nowrap">
            {bpm}
          </span>
          <button
            type="button"
            aria-label="Increase BPM"
            onClick={() => onChangeBpm(Math.min(240, bpm + 1))}
            className="w-5 sm:w-6 h-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#182133] text-xs font-bold cursor-pointer"
          >
            +
          </button>
          <select
            aria-label="Time Signature"
            value={timeSignature}
            onChange={(e) => onChangeTimeSignature(e.target.value as TimeSignatureId)}
            className="hidden sm:block h-full px-1 border-l border-[#232E42] bg-[#0D131F] font-mono-num text-[10px] text-cyan-300 focus:outline-none cursor-pointer"
          >
            {TIME_SIGNATURES.map((ts) => (
              <option key={ts.id} value={ts.id}>
                {ts.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right Zone */}
      <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 shrink">
        <MidiActivityBadge midiActiveProp={midiActiveProp} />

        <div className="hidden lg:flex items-center gap-1.5 px-2 h-8 rounded-md bg-[#090C12] border border-[#232E42] shrink-0">
          <Volume2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <input
            aria-label="Studio Master Volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            style={{ touchAction: 'none' }}
            onChange={(e) => onChangeMasterVolume(parseFloat(e.target.value))}
            className="w-14 h-1.5 accent-cyan-400 bg-[#1B2434] rounded-lg cursor-pointer"
          />
          <span className="font-mono-num text-[10px] text-slate-300 w-6 text-right">
            {Math.round(masterVolume * 100)}
          </span>
        </div>

        <button
          type="button"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Landscape'}
          aria-label="Toggle Fullscreen Landscape"
          onClick={onToggleFullscreen}
          className="hidden md:flex w-8 h-8 rounded-md bg-[#090C12] border border-[#232E42] items-center justify-center text-slate-300 hover:text-cyan-300 cursor-pointer shrink-0"
        >
          {isFullscreen ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>

        {onOpenAudioMonitor && (
          <button
            type="button"
            title="Audio Performance Monitor (DSP / Latency / Voices)"
            aria-label="Open Audio Performance Monitor"
            onClick={onOpenAudioMonitor}
            style={{ touchAction: 'manipulation' }}
            className="w-8 h-8 rounded-md bg-[#090C12] border border-[#232E42] flex items-center justify-center text-slate-300 hover:text-cyan-300 cursor-pointer shrink-0"
          >
            <Cpu className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          title="Stop All Sound (Panic)"
          aria-label="All Notes Off"
          onClick={onPanic}
          className="w-8 h-8 rounded-md bg-[#090C12] border border-[#232E42] flex items-center justify-center text-slate-300 hover:text-rose-400 cursor-pointer shrink-0"
        >
          <VolumeX className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
});
