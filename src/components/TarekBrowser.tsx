import React, { useRef } from 'react';
import {
  ArrowRight,
  AudioWaveform,
  Cable,
  Disc3,
  Download,
  Drum,
  FilePlus2,
  FolderOpen,
  Layers,
  Upload,
} from 'lucide-react';
import { DRUM_KITS, DRUM_TRACK_ORDER } from '../audio/beatboxPresets';
import { getPatternId } from '../audio/sequencerStorage';
import { useIsPlaying, usePlayheadStep } from '../audio/transportStore';
import type {
  BeatboxStep,
  DrumTrackId,
  StudioRoutingConfig,
  TarekPluginId,
  TarekProject,
} from '../types/beatbox';
import { Oscilloscope } from './Oscilloscope';
import { PluginChannelStrip } from './PluginChannelStrip';
import { ToggleSwitch } from './ToggleSwitch';

interface TarekBrowserProps {
  project: TarekProject;
  isPlaying?: boolean;
  playheadStep?: number;
  onOpenPlugin: (plugin: TarekPluginId) => void;
  onChangeProjectName: (name: string) => void;
  onChangeRouting: (patch: Partial<StudioRoutingConfig>) => void;
  onImportProject: (raw: Partial<TarekProject>) => void;
  onCreateNewProject: () => void;
  onOpenMyProjects?: () => void;
}

const BeatboxMiniPreview: React.FC<{
  steps?: Record<DrumTrackId, BeatboxStep[]>;
  isPlayingProp?: boolean;
  playheadStepProp?: number;
}> = React.memo(({ steps, isPlayingProp, playheadStepProp }) => {
  const storeIsPlaying = useIsPlaying();
  const storePlayheadStep = usePlayheadStep();
  const isPlaying = isPlayingProp ?? storeIsPlaying;
  const playheadStep = playheadStepProp ?? storePlayheadStep;
  const currentStepInt = Math.floor(playheadStep) % 16;

  return (
    <div className="grid grid-cols-16 gap-0.5 bg-[#0A0E15] p-1.5 rounded border border-[#232D3F]">
      {Array.from({ length: 16 }, (_, stepIdx) => {
        const isHead = isPlaying && currentStepInt === stepIdx;
        const activeCount = DRUM_TRACK_ORDER.reduce(
          (acc, tid) => acc + (steps?.[tid]?.[stepIdx]?.active ? 1 : 0),
          0
        );
        return (
          <div
            key={stepIdx}
            className={`h-5 rounded-xs flex items-end overflow-hidden ${
              isHead
                ? 'ring-1 ring-white bg-[#1C273A]'
                : stepIdx % 4 === 0
                ? 'bg-[#131A26]'
                : 'bg-[#0E131D]'
            }`}
          >
            <div
              style={{
                height: `${Math.min(100, activeCount * 28)}%`,
              }}
              className={`w-full transition-colors ${
                isHead ? 'bg-amber-300' : 'bg-amber-500/75'
              }`}
            />
          </div>
        );
      })}
    </div>
  );
});

export const TarekBrowser: React.FC<TarekBrowserProps> = React.memo(({
  project,
  isPlaying: isPlayingProp,
  playheadStep: playheadStepProp,
  onOpenPlugin,
  onChangeProjectName,
  onChangeRouting,
  onImportProject,
  onCreateNewProject,
  onOpenMyProjects,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { routing, serumPatch, serumSequencer, beatbox, subbass } = project;

  const serumPid = getPatternId(serumSequencer.activeBank, serumSequencer.activeSlot);
  const serumNotes = serumSequencer.patterns[serumPid]?.notes ?? [];

  const bbPid = getPatternId(beatbox.activeBank, beatbox.activeSlot);
  const bbPattern = beatbox.patterns[bbPid];
  const kitName = DRUM_KITS.find((k) => k.id === beatbox.kitId)?.name ?? 'Dubstep Heavy';

  const handleExportProject = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'tarek-project'}.tarek.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<TarekProject>;
      onImportProject(parsed);
    } catch {
      // ignore invalid JSON
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="h-full overflow-y-auto synth-scroll p-2.5 sm:p-4">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-3 h-full justify-between">
        {/* Studio Project Header Strip */}
        <section className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#263042] bg-[#131822] px-3 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="min-w-0 flex-1 max-w-xs">
              <label htmlFor="tarek-project-name" className="sr-only">
                Project Name
              </label>
              <input
                id="tarek-project-name"
                type="text"
                value={project.name}
                onChange={(e) => onChangeProjectName(e.target.value)}
                className="w-full h-8 px-2.5 rounded-md bg-[#0A0E15] border border-[#263042] font-display text-xs sm:text-sm font-semibold text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 whitespace-nowrap">
              <span>4 Integrated Plugins</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num text-slate-300">{project.bpm} BPM</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num text-slate-300">{project.timeSignature}</span>
              <span aria-hidden="true">·</span>
              <span>Shared Master Bus</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Oscilloscope source="master" className="hidden sm:block w-24 h-8" />
            <button
              type="button"
              onClick={handleExportProject}
              title="Export TAREK Project JSON"
              className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md bg-[#0B0E14] border border-[#263042] text-xs font-medium text-slate-200 hover:text-cyan-300 hover:border-cyan-400/50 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Import TAREK Project JSON"
              className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md bg-[#0B0E14] border border-[#263042] text-xs font-medium text-slate-200 hover:text-cyan-300 hover:border-cyan-400/50 cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Import</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileImport}
              className="hidden"
            />
            {onOpenMyProjects && (
              <button
                type="button"
                onClick={onOpenMyProjects}
                title="Open My Projects Manager"
                className="inline-flex items-center gap-1 px-2.5 h-8 rounded-md bg-[#0B0E14] border border-[#263042] text-xs font-medium text-slate-200 hover:text-emerald-300 hover:border-emerald-400/50 cursor-pointer whitespace-nowrap"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">My Projects</span>
              </button>
            )}
            <button
              type="button"
              onClick={onCreateNewProject}
              title="Create New Separate Studio Project"
              className="inline-flex items-center gap-1 px-2.5 h-8 rounded-md bg-[#0B0E14] border border-[#263042] text-xs font-medium text-emerald-300 hover:border-emerald-400/50 cursor-pointer whitespace-nowrap"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New</span>
            </button>
          </div>
        </section>

        {/* PLUGIN BROWSER: SERUM, BEATBOX, SUBBASS & SEQUENCER */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 flex-1 min-h-0">
          {/* PLUGIN 1: SERUM */}
          <article className="flex flex-col justify-between rounded-xl border border-[#2B3952] bg-[#131822] p-3.5 sm:p-4 hover:border-cyan-400/60 transition-colors">
            <div>
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <AudioWaveform className="w-5 h-5 text-cyan-400 shrink-0" />
                    <h2 className="font-display text-lg font-bold tracking-tight text-slate-100">
                      SERUM
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    3D Wavetable Synthesizer · Piano Roll · 9-Unit FX Rack
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenPlugin('serum')}
                  style={{ touchAction: 'manipulation' }}
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-xs tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>OPEN SERUM</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Active Synth Summary */}
              <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-[#1E2736] text-xs">
                <div>
                  <div className="text-[10px] text-slate-400">Active Preset</div>
                  <div className="font-medium text-slate-100 truncate mt-0.5">
                    {serumPatch.name}
                  </div>
                  <div className="text-[10px] text-cyan-300">{serumPatch.category}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Piano Roll</div>
                  <div className="font-mono-num font-medium text-slate-100 mt-0.5">
                    Pattern {serumPid}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono-num">
                    {serumNotes.length} MIDI notes
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Filter / LFOs</div>
                  <div className="font-mono-num font-medium text-slate-100 uppercase mt-0.5">
                    {serumPatch.filter.mode}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono-num">
                    {serumPatch.modMatrix.filter((m) => m.enabled).length} mod links
                  </div>
                </div>
              </div>
            </div>

            {/* SERUM Channel Strip: MUTE, SOLO, FX BYPASS, MIX LEVEL */}
            <PluginChannelStrip
              plugin="serum"
              routing={routing}
              onChangeRouting={onChangeRouting}
              variant="card"
              accent="cyan"
            />
          </article>

          {/* PLUGIN 2: BEATBOX */}
          <article className="flex flex-col justify-between rounded-xl border border-[#2B3952] bg-[#131822] p-3.5 sm:p-4 hover:border-amber-400/60 transition-colors">
            <div>
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <Drum className="w-5 h-5 text-amber-400 shrink-0" />
                    <h2 className="font-display text-lg font-bold tracking-tight text-slate-100">
                      BEATBOX
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    8-Voice Drum Synthesizer · 16-Step Sequencer · Groove Pads
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenPlugin('beatbox')}
                  style={{ touchAction: 'manipulation' }}
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>OPEN BEATBOX</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Mini Live 8x16 Step Matrix Preview */}
              <div className="py-2 border-y border-[#1E2736] space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    Kit: <strong className="text-slate-200 font-medium">{kitName}</strong>
                  </span>
                  <span className="font-mono-num">
                    Pattern {bbPid} · Swing {Math.round(beatbox.swing * 100)}%
                  </span>
                </div>
                <BeatboxMiniPreview
                  steps={bbPattern?.steps}
                  isPlayingProp={isPlayingProp}
                  playheadStepProp={playheadStepProp}
                />
              </div>
            </div>

            {/* BEATBOX Channel Strip: MUTE, SOLO, FX BYPASS, MIX LEVEL */}
            <PluginChannelStrip
              plugin="beatbox"
              routing={routing}
              onChangeRouting={onChangeRouting}
              variant="card"
              accent="amber"
            />
          </article>

          {/* PLUGIN 3: SUBBASS */}
          <article className="flex flex-col justify-between rounded-xl border border-[#1E2E52] bg-[#070B16] p-3.5 sm:p-4 hover:border-blue-400/70 transition-colors">
            <div>
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <Disc3 className="w-5 h-5 text-blue-400 shrink-0" />
                    <h2 className="font-display text-lg font-bold tracking-tight text-slate-100">
                      SUBBASS
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mono Subwoofer Synth · 9 FX Modules · 2-Octave Keys
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenPlugin('subbass')}
                  style={{ touchAction: 'manipulation' }}
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-display font-bold text-xs tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>OPEN SUBBASS</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-[#14203B] text-xs">
                <div>
                  <div className="text-[10px] text-slate-400">Active Preset</div>
                  <div className="font-medium text-slate-100 truncate mt-0.5">
                    {subbass.name}
                  </div>
                  <div className="text-[10px] text-blue-300">
                    {subbass.squareEnabled ? 'Sine+Tri+Sqr' : 'Sine+Tri'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Sub Octave</div>
                  <div className="font-mono-num font-medium text-slate-100 mt-0.5">
                    OCT {subbass.octave}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono-num">
                    Phase {subbass.phase}°
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Low Pass</div>
                  <div className="font-mono-num font-medium text-slate-100 mt-0.5">
                    {Math.round(38 * Math.pow(63.15, subbass.lowPassFilter))} Hz
                  </div>
                  <div className="text-[10px] text-violet-300 font-mono-num">
                    Sat {Math.round(subbass.saturation * 100)}%
                  </div>
                </div>
              </div>
            </div>

            {/* SUBBASS Channel Strip: MUTE, SOLO, FX BYPASS, MIX LEVEL */}
            <PluginChannelStrip
              plugin="subbass"
              routing={routing}
              onChangeRouting={onChangeRouting}
              variant="card"
              accent="blue"
            />
          </article>

          {/* PLUGIN 4: SEQUENCER */}
          <article className="flex flex-col justify-between rounded-xl border border-[#2B3952] bg-[#131822] p-3.5 sm:p-4 hover:border-emerald-400/60 transition-colors">
            <div>
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-emerald-400 shrink-0" />
                    <h2 className="font-display text-lg font-bold tracking-tight text-slate-100">
                      SEQUENCER
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    64-Step Workstation · Piano Roll · Song Mode · Automation
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenPlugin('sequencer')}
                  style={{ touchAction: 'manipulation' }}
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>OPEN SEQUENCER</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-[#1E2736] text-xs">
                <div>
                  <div className="text-[10px] text-slate-400">Active Pattern</div>
                  <div className="font-mono-num font-medium text-slate-100 mt-0.5">
                    {project.daw.activePatternId}
                  </div>
                  <div className="text-[10px] text-emerald-300 font-mono-num">
                    {project.daw.mode === 'pro'
                      ? `${project.daw.patterns[project.daw.activePatternId]?.stepCount ?? 16} Steps`
                      : '16-Step Easy'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Mode / Tracks</div>
                  <div className="font-display font-semibold text-slate-100 uppercase mt-0.5">
                    {project.daw.mode === 'pro' ? 'PRO' : 'EASY'}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono-num">
                    {project.daw.trackOrder?.length ?? 6} Tracks
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Automation</div>
                  <div className="font-mono-num font-medium text-slate-100 mt-0.5">
                    {Object.values(project.daw.automationLanes).filter((l) => l.enabled).length} Active
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono-num">
                    {project.timeSignature} Sync
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2.5 text-[11px] text-slate-400">
              <span>Drives SERUM, SUBBASS & BEATBOX</span>
              <span className="font-mono-num text-emerald-300">
                {project.metronomeEnabled ? 'Metronome ON' : 'Metronome OFF'}
              </span>
            </div>
          </article>
        </div>

        {/* SHARED AUDIO & MIDI ROUTING MATRIX */}
        <section className="rounded-xl border border-[#263042] bg-[#131822] px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <Cable className="w-4 h-4 text-cyan-400" />
              <span className="font-display text-xs font-semibold text-slate-100">
                Shared Audio & MIDI Routing
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-5 flex-1 justify-end">
              <ToggleSwitch
                checked={routing.beatboxToSerumFx}
                onChange={(beatboxToSerumFx) => onChangeRouting({ beatboxToSerumFx })}
                label="BEATBOX → SERUM FX"
                accent="amber"
                compact
              />

              <div className="flex items-center gap-2 min-w-[160px]">
                <span className="text-[11px] text-slate-300 whitespace-nowrap">
                  Kick Sidechain
                </span>
                <input
                  aria-label="Kick Sidechain Ducking on SERUM"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={routing.sidechainAmount}
                  style={{ touchAction: 'none' }}
                  onChange={(e) =>
                    onChangeRouting({ sidechainAmount: parseFloat(e.target.value) })
                  }
                  className="w-20 accent-cyan-400 h-1.5 bg-[#1B2434] rounded-lg cursor-pointer"
                />
                <span className="font-mono-num text-[11px] text-cyan-300 w-8 text-right">
                  {Math.round(routing.sidechainAmount * 100)}%
                </span>
              </div>

              <ToggleSwitch
                checked={routing.midiBeatboxToSerum}
                onChange={(midiBeatboxToSerum) =>
                  onChangeRouting({ midiBeatboxToSerum })
                }
                label="Drum → Synth MIDI"
                accent="cyan"
                compact
              />

              <ToggleSwitch
                checked={routing.midiKeyboardToBeatbox}
                onChange={(midiKeyboardToBeatbox) =>
                  onChangeRouting({ midiKeyboardToBeatbox })
                }
                label="MIDI Keys → Drums"
                accent="amber"
                compact
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
});
