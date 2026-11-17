import React, { useMemo, useRef } from 'react';
import {
  Disc3,
  Download,
  Drum,
  FilePlus2,
  Flame,
  FolderOpen,
  FolderUp,
  ListMusic,
  Maximize2,
  Play,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import {
  BASS_REMIX_FACTORY_PRESETS,
  createDefaultBassRemixProjectState,
} from '../audio/bassRemixPresets';
import { createDefaultSubbassSequencerState } from '../audio/subbassPresets';
import { createDefaultTs666SequencerState } from '../audio/ts666/ts666Presets';
import { useIsPlaying } from '../audio/transportStore';
import type { BassRemixPreset } from '../types/bassRemix';
import type { StudioRoutingConfig, TarekProject } from '../types/beatbox';
import type { FxTrackId, ModularFxInstance, ProjectDeviceFxState } from '../types/fx';

interface SessionViewProps {
  project: TarekProject;
  savedProjectsCount: number;
  deviceFx: ProjectDeviceFxState;
  focusedTrack: FxTrackId;
  onFocusTrack: (track: FxTrackId) => void;
  onOpenInstrument: (
    plugin: 'serum' | 'subbass' | 'beatbox' | 'ts666' | 'bassremix',
    openPianoRoll?: boolean
  ) => void;
  onOpenEffects: (track: FxTrackId) => void;
  onLaunchSerumSlot: (slot: number, startTransport?: boolean) => void;
  onLaunchSubbassPattern: (patternId: string, startTransport?: boolean) => void;
  onLaunchTs666Pattern: (patternId: string, startTransport?: boolean) => void;
  onLaunchBeatboxSlot: (slot: number, startTransport?: boolean) => void;
  onSelectBassRemixPreset: (preset: BassRemixPreset) => void;
  onLaunchScene: (sceneIndex: number) => void;
  onStopAllClips: () => void;
  onChangeRouting: (patch: Partial<StudioRoutingConfig>) => void;
  onChangeProjectName: (name: string) => void;
  onImportProject: (raw: Partial<TarekProject>) => void;
  onOpenMyProjects: () => void;
  onCreateNewProject: () => void;
}

const SCENE_COUNT = 6;

export const SessionView: React.FC<SessionViewProps> = ({
  project,
  savedProjectsCount,
  deviceFx,
  focusedTrack,
  onFocusTrack,
  onOpenInstrument,
  onOpenEffects,
  onLaunchSerumSlot,
  onLaunchSubbassPattern,
  onLaunchTs666Pattern,
  onLaunchBeatboxSlot,
  onSelectBassRemixPreset,
  onLaunchScene,
  onStopAllClips,
  onChangeRouting,
  onChangeProjectName,
  onImportProject,
  onOpenMyProjects,
  onCreateNewProject,
}) => {
  const isPlaying = useIsPlaying();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const subSeq = useMemo(
    () => project.subbassSequencer ?? createDefaultSubbassSequencerState(),
    [project.subbassSequencer]
  );

  // Build up to 6 subbass pattern slots mapped cleanly to scene rows 1..6
  const subPatternRows = useMemo(() => {
    const order = subSeq.patternOrder.length > 0 ? subSeq.patternOrder : ['S1'];
    return Array.from({ length: SCENE_COUNT }, (_, idx) => {
      const pid = order[idx] ?? `S${idx + 1}`;
      const pat = subSeq.patterns[pid];
      return {
        id: pid,
        name: pat?.name ?? `Sub ${idx + 1}`,
        noteCount: pat?.notes.length ?? 0,
        exists: Boolean(pat),
      };
    });
  }, [subSeq]);

  const ts666Seq = useMemo(
    () => project.ts666Sequencer ?? createDefaultTs666SequencerState(),
    [project.ts666Sequencer]
  );

  // Build up to 6 666TS pattern slots mapped cleanly to scene rows 1..6
  const ts666PatternRows = useMemo(() => {
    const order = ts666Seq.patternOrder.length > 0 ? ts666Seq.patternOrder : ['T1'];
    return Array.from({ length: SCENE_COUNT }, (_, idx) => {
      const pid = order[idx] ?? `T${idx + 1}`;
      const pat = ts666Seq.patterns[pid];
      return {
        id: pid,
        name: pat?.name ?? `666TS ${idx + 1}`,
        noteCount: pat?.notes.length ?? 0,
        exists: Boolean(pat),
      };
    });
  }, [ts666Seq]);

  const bassRemixState = useMemo(
    () => project.bassRemix ?? createDefaultBassRemixProjectState(),
    [project.bassRemix]
  );

  const anySolo = Boolean(
    project.routing.serumSolo ||
      project.routing.beatboxSolo ||
      project.routing.subbassSolo ||
      project.routing.ts666Solo ||
      project.routing.bassremixSolo
  );

  const handleExport = () => {
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project.name || 'tarek-project').replace(/[^a-z0-9_-]+/gi, '_')}.tarek.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<TarekProject>;
        if (parsed && typeof parsed === 'object') {
          onImportProject(parsed);
        }
      } catch {
        // ignore invalid json
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const renderTrackColumnHeader = (opts: {
    track: FxTrackId;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    accent: 'cyan' | 'blue' | 'amber' | 'rose' | 'copper';
    muted: boolean;
    solo: boolean;
    fxBypass: boolean;
    level: number;
    fxList: ModularFxInstance[];
  }) => {
    const isFocused = focusedTrack === opts.track;
    const silenced = opts.muted || (anySolo && !opts.solo);

    const headerStyles =
      opts.accent === 'cyan'
        ? {
            border: isFocused ? 'border-cyan-400/80 shadow-[0_0_18px_rgba(34,211,238,0.14)]' : 'border-[#253147]',
            topBar: 'bg-cyan-500/15 border-b border-cyan-400/35',
            titleColor: 'text-cyan-200',
            openBtn: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950',
            slider: 'accent-cyan-400',
          }
        : opts.accent === 'blue'
        ? {
            border: isFocused ? 'border-violet-400/80 shadow-[0_0_18px_rgba(139,92,246,0.18)]' : 'border-[#253147]',
            topBar: 'bg-gradient-to-r from-blue-600/20 to-violet-600/20 border-b border-blue-400/35',
            titleColor: 'text-blue-200',
            openBtn: 'bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-400 hover:to-violet-400 text-white',
            slider: 'accent-blue-500',
          }
        : opts.accent === 'rose'
        ? {
            border: isFocused ? 'border-rose-400/80 shadow-[0_0_18px_rgba(244,63,94,0.18)]' : 'border-[#253147]',
            topBar: 'bg-gradient-to-r from-rose-600/20 to-fuchsia-600/20 border-b border-rose-400/35',
            titleColor: 'text-rose-200',
            openBtn: 'bg-rose-500 hover:bg-rose-400 text-white',
            slider: 'accent-rose-400',
          }
        : opts.accent === 'copper'
        ? {
            border: isFocused ? 'border-red-400/80 shadow-[0_0_18px_rgba(239,68,68,0.2)]' : 'border-[#3d291a]',
            topBar: 'bg-gradient-to-r from-[#3b2314] to-[#2e1612] border-b border-[#8c4b27]',
            titleColor: 'text-amber-200',
            openBtn: 'bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white',
            slider: 'accent-red-500',
          }
        : {
            border: isFocused ? 'border-amber-400/80 shadow-[0_0_18px_rgba(245,158,11,0.14)]' : 'border-[#253147]',
            topBar: 'bg-amber-500/15 border-b border-amber-400/35',
            titleColor: 'text-amber-200',
            openBtn: 'bg-amber-500 hover:bg-amber-400 text-slate-950',
            slider: 'accent-amber-400',
          };

    const setMute = (val: boolean) => {
      if (opts.track === 'serum') onChangeRouting({ serumMuted: val });
      else if (opts.track === 'subbass') onChangeRouting({ subbassMuted: val });
      else if (opts.track === 'ts666') onChangeRouting({ ts666Muted: val });
      else if (opts.track === 'bassremix') onChangeRouting({ bassremixMuted: val });
      else onChangeRouting({ beatboxMuted: val });
    };
    const setSolo = (val: boolean) => {
      if (opts.track === 'serum') onChangeRouting({ serumSolo: val });
      else if (opts.track === 'subbass') onChangeRouting({ subbassSolo: val });
      else if (opts.track === 'ts666') onChangeRouting({ ts666Solo: val });
      else if (opts.track === 'bassremix') onChangeRouting({ bassremixSolo: val });
      else onChangeRouting({ beatboxSolo: val });
    };
    const setFxByp = (val: boolean) => {
      if (opts.track === 'serum') onChangeRouting({ serumFxBypass: val });
      else if (opts.track === 'subbass') onChangeRouting({ subbassFxBypass: val });
      else if (opts.track === 'ts666') onChangeRouting({ ts666FxBypass: val });
      else if (opts.track === 'bassremix') onChangeRouting({ bassremixFxBypass: val });
      else onChangeRouting({ beatboxFxBypass: val });
    };
    const setLevel = (val: number) => {
      if (opts.track === 'serum') onChangeRouting({ serumLevel: val });
      else if (opts.track === 'subbass') onChangeRouting({ subbassLevel: val });
      else if (opts.track === 'ts666') onChangeRouting({ ts666Level: val });
      else if (opts.track === 'bassremix') onChangeRouting({ bassremixLevel: val });
      else onChangeRouting({ beatboxLevel: val });
    };

    return (
      <div
        onClick={() => onFocusTrack(opts.track)}
        className={`rounded-xl border bg-[#111724] flex flex-col overflow-hidden transition-all ${headerStyles.border}`}
      >
        {/* Colored Track Title Bar */}
        <div className={`px-2.5 py-2 flex items-center justify-between gap-1.5 ${headerStyles.topBar}`}>
          <div className="flex items-center gap-2 min-w-0">
            {opts.icon}
            <div className="min-w-0">
              <div className={`font-display font-bold text-xs sm:text-sm tracking-wide truncate ${headerStyles.titleColor}`}>
                {opts.title}
              </div>
              <div className="text-[10px] text-slate-300/80 truncate">{opts.subtitle}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenInstrument(opts.track, false);
            }}
            style={{ touchAction: 'manipulation' }}
            className={`inline-flex items-center gap-1 px-2.5 h-8 rounded-lg font-display font-bold text-[11px] cursor-pointer whitespace-nowrap shrink-0 ${headerStyles.openBtn}`}
          >
            <Maximize2 className="w-3 h-3 shrink-0" />
            <span>OPEN</span>
          </button>
        </div>

        {/* Clip Slots / Presets Grid */}
        <div className="p-2 flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto synth-scroll">
          {opts.track === 'bassremix'
            ? BASS_REMIX_FACTORY_PRESETS.map((preset) => {
                const active = bassRemixState.patch.name === preset.name;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFocusTrack('bassremix');
                      onSelectBassRemixPreset(preset);
                    }}
                    style={{ touchAction: 'manipulation' }}
                    className={`group flex items-center justify-between gap-2 px-2.5 h-8 rounded-lg border text-left transition-all cursor-pointer shrink-0 ${
                      active
                        ? 'bg-gradient-to-r from-[#3a1f16] to-[#281210] border-red-400/80 text-amber-100 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                        : 'bg-[#120d0a] border-[#342319] text-amber-100/75 hover:border-amber-500/50 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Waves
                        className={`w-3.5 h-3.5 shrink-0 ${
                          active ? 'text-red-400' : 'text-amber-500/60 group-hover:text-red-400'
                        }`}
                      />
                      <span className="font-display font-semibold text-[11px] truncate">
                        {preset.name}
                      </span>
                    </div>
                    <span className="font-mono-num text-[9px] text-amber-300/70 whitespace-nowrap shrink-0">
                      {preset.patch.wobble.enabled
                        ? `WOB ${preset.patch.wobble.syncDivision}`
                        : preset.patch.ott.bypass
                        ? 'RAW'
                        : `OTT ${Math.round(preset.patch.ott.amount * 100)}%`}
                    </span>
                  </button>
                );
              })
            : Array.from({ length: SCENE_COUNT }, (_, idx) => {
                const slotNum = idx + 1;
                let label = '';
                let metaText = '';
                let isSelected = false;
                let hasNotes = false;

                if (opts.track === 'serum') {
                  const pid = `${project.serumSequencer.activeBank}${slotNum}`;
                  const count = project.serumSequencer.patterns[pid]?.notes.length ?? 0;
                  label = `Clip ${pid}`;
                  metaText = count > 0 ? `${count} notes` : 'Empty';
                  isSelected = project.serumSequencer.activeSlot === slotNum;
                  hasNotes = count > 0;
                } else if (opts.track === 'subbass') {
                  const row = subPatternRows[idx];
                  label = row.name;
                  metaText = row.noteCount > 0 ? `${row.noteCount} notes` : row.id;
                  isSelected = subSeq.activePatternId === row.id;
                  hasNotes = row.noteCount > 0;
                } else if (opts.track === 'ts666') {
                  const row = ts666PatternRows[idx];
                  label = row.name;
                  metaText = row.noteCount > 0 ? `${row.noteCount} notes` : row.id;
                  isSelected = ts666Seq.activePatternId === row.id;
                  hasNotes = row.noteCount > 0;
                } else {
                  const pid = `${project.beatbox.activeBank}${slotNum}`;
                  const pat = project.beatbox.patterns[pid];
                  const stepCount = pat
                    ? Object.values(pat.steps).reduce(
                        (acc, steps) => acc + steps.filter((s) => s.active).length,
                        0
                      )
                    : 0;
                  label = `Drum ${pid}`;
                  metaText = stepCount > 0 ? `${stepCount} hits` : 'Empty';
                  isSelected = project.beatbox.activeSlot === slotNum;
                  hasNotes = stepCount > 0;
                }

                const slotPlaying = isSelected && isPlaying;

                return (
                  <button
                    key={slotNum}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFocusTrack(opts.track);
                      if (opts.track === 'serum') onLaunchSerumSlot(slotNum, true);
                      else if (opts.track === 'subbass') onLaunchSubbassPattern(subPatternRows[idx].id, true);
                      else if (opts.track === 'ts666') onLaunchTs666Pattern(ts666PatternRows[idx].id, true);
                      else onLaunchBeatboxSlot(slotNum, true);
                    }}
                    style={{ touchAction: 'manipulation' }}
                    className={`group flex items-center justify-between gap-2 px-2.5 h-9 rounded-lg border text-left transition-all cursor-pointer shrink-0 ${
                      slotPlaying
                        ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                        : isSelected
                        ? 'bg-[#1A2438] border-slate-400/70 text-white'
                        : hasNotes
                        ? 'bg-[#0D1320] border-[#26334B] text-slate-200 hover:border-slate-400/60'
                        : 'bg-[#090C14] border-[#1A2233] text-slate-400 hover:border-[#2C3A54] hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Play
                        className={`w-3.5 h-3.5 shrink-0 ${
                          slotPlaying
                            ? 'text-emerald-300 fill-emerald-300 animate-pulse'
                            : isSelected
                            ? 'text-cyan-300 fill-cyan-300'
                            : hasNotes
                            ? 'text-slate-300 group-hover:text-emerald-300'
                            : 'text-slate-600 group-hover:text-slate-300'
                        }`}
                      />
                      <span className="font-display font-semibold text-xs truncate">{label}</span>
                    </div>
                    <span className="font-mono-num text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                      {metaText}
                    </span>
                  </button>
                );
              })}
        </div>

        {/* Bottom Track Strip: Quick Actions (Piano Roll / FX) + Channel Mixer (M / S / FX / Level) */}
        <div className="p-2 bg-[#0B0F18] border-t border-[#1D2638] flex flex-col gap-2 shrink-0">
          <div className="grid grid-cols-2 gap-1.5">
            {opts.track === 'bassremix' ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInstrument('bassremix', false);
                }}
                style={{ touchAction: 'manipulation' }}
                className="inline-flex items-center justify-center gap-1 h-8 rounded-lg bg-[#23150e] hover:bg-[#311c12] border border-[#6e3e22] text-[11px] font-display font-bold text-amber-100 cursor-pointer whitespace-nowrap"
              >
                <Waves className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span>RESAMPLER</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInstrument(opts.track, true);
                }}
                style={{ touchAction: 'manipulation' }}
                className="inline-flex items-center justify-center gap-1 h-8 rounded-lg bg-[#141C2B] hover:bg-[#1C273D] border border-[#2A374F] text-[11px] font-display font-bold text-slate-100 cursor-pointer whitespace-nowrap"
              >
                <ListMusic className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>PIANO ROLL</span>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEffects(opts.track);
              }}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center justify-center gap-1 h-8 rounded-lg bg-[#141C2B] hover:bg-[#1C273D] border border-[#2A374F] text-[11px] font-display font-bold text-slate-100 cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              <span>EFFECTS ({opts.fxList.length})</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                aria-pressed={opts.muted}
                onClick={(e) => {
                  e.stopPropagation();
                  setMute(!opts.muted);
                }}
                style={{ touchAction: 'manipulation' }}
                className={`w-7 h-7 rounded font-display font-bold text-[10px] border cursor-pointer ${
                  opts.muted
                    ? 'bg-rose-500 text-white border-rose-300'
                    : 'bg-[#121826] border-[#26324A] text-slate-300 hover:text-white'
                }`}
              >
                M
              </button>
              <button
                type="button"
                aria-pressed={opts.solo}
                onClick={(e) => {
                  e.stopPropagation();
                  setSolo(!opts.solo);
                }}
                style={{ touchAction: 'manipulation' }}
                className={`w-7 h-7 rounded font-display font-bold text-[10px] border cursor-pointer ${
                  opts.solo
                    ? 'bg-amber-400 text-slate-950 border-amber-200'
                    : 'bg-[#121826] border-[#26324A] text-slate-300 hover:text-white'
                }`}
              >
                S
              </button>
              <button
                type="button"
                aria-pressed={opts.fxBypass}
                onClick={(e) => {
                  e.stopPropagation();
                  setFxByp(!opts.fxBypass);
                }}
                style={{ touchAction: 'manipulation' }}
                className={`px-1.5 h-7 rounded font-display font-bold text-[10px] border cursor-pointer ${
                  opts.fxBypass
                    ? 'bg-orange-500/20 border-orange-400 text-orange-300'
                    : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                }`}
              >
                FX
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {silenced ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <input
                aria-label={`${opts.title} Track Volume`}
                type="range"
                min={0}
                max={1.2}
                step={0.01}
                value={opts.level}
                style={{ touchAction: 'none' }}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setLevel(parseFloat(e.target.value))}
                className={`w-full h-1.5 bg-[#1B2434] rounded cursor-pointer ${headerStyles.slider}`}
              />
              <span className="font-mono-num text-[10px] text-slate-300 w-8 text-right shrink-0">
                {Math.round(opts.level * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col p-2 sm:p-3 gap-2 overflow-hidden bg-[#0B0E14]">
      {/* Multi-Track Session Columns + Scene Launcher */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden synth-scroll">
        <div className="min-h-0 flex flex-col">
          {renderTrackColumnHeader({
            track: 'subbass',
            title: 'SUBSYNTH',
            subtitle: project.subbass.name,
            icon: <Disc3 className="w-4 h-4 text-blue-300 shrink-0" />,
            accent: 'blue',
            muted: project.routing.subbassMuted,
            solo: project.routing.subbassSolo,
            fxBypass: project.routing.subbassFxBypass,
            level: project.routing.subbassLevel,
            fxList: deviceFx.subbass,
          })}
        </div>

        <div className="min-h-0 flex flex-col">
          {renderTrackColumnHeader({
            track: 'ts666',
            title: '666TS',
            subtitle: project.ts666Patch?.name ?? '666TS Clean Bass',
            icon: <Flame className="w-4 h-4 text-rose-300 shrink-0" />,
            accent: 'rose',
            muted: Boolean(project.routing.ts666Muted),
            solo: Boolean(project.routing.ts666Solo),
            fxBypass: Boolean(project.routing.ts666FxBypass),
            level: project.routing.ts666Level ?? 1.0,
            fxList: deviceFx.ts666 ?? [],
          })}
        </div>

        <div className="min-h-0 flex flex-col">
          {renderTrackColumnHeader({
            track: 'beatbox',
            title: 'BEATBOX',
            subtitle: `${project.beatbox.kitId.replace('_', ' ').toUpperCase()}`,
            icon: <Drum className="w-4 h-4 text-amber-300 shrink-0" />,
            accent: 'amber',
            muted: project.routing.beatboxMuted,
            solo: project.routing.beatboxSolo,
            fxBypass: project.routing.beatboxFxBypass,
            level: project.routing.beatboxLevel,
            fxList: deviceFx.beatbox,
          })}
        </div>

        <div className="min-h-0 flex flex-col">
          {renderTrackColumnHeader({
            track: 'bassremix',
            title: 'BASS REMIX',
            subtitle: bassRemixState.patch.name,
            icon: <Waves className="w-4 h-4 text-red-400 shrink-0" />,
            accent: 'copper',
            muted: Boolean(project.routing.bassremixMuted),
            solo: Boolean(project.routing.bassremixSolo),
            fxBypass: Boolean(project.routing.bassremixFxBypass),
            level: project.routing.bassremixLevel ?? 1.0,
            fxList: deviceFx.bassremix ?? [],
          })}
        </div>

        {/* MASTER / SCENES LAUNCH & SESSION PROJECT COLUMN */}
        <div className="sm:col-span-2 lg:col-span-1 rounded-xl border border-[#253147] bg-[#111724] flex flex-col overflow-hidden min-h-0">
          <div className="px-2.5 py-2 bg-[#161F31] border-b border-[#253147] flex items-center justify-between gap-2 shrink-0">
            <div>
              <div className="font-display font-bold text-xs sm:text-sm text-emerald-300 tracking-wide">
                MASTER SCENES
              </div>
              <div className="text-[10px] text-slate-400">Launch synced rows</div>
            </div>
            <button
              type="button"
              onClick={onStopAllClips}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg bg-[#090D16] hover:bg-rose-500/20 border border-[#2A374F] hover:border-rose-400/60 text-slate-200 hover:text-rose-200 font-display font-bold text-[11px] cursor-pointer whitespace-nowrap"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>STOP</span>
            </button>
          </div>

          {/* 6 Scene Launch Rows */}
          <div className="p-2 flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto synth-scroll">
            {Array.from({ length: SCENE_COUNT }, (_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onLaunchScene(idx)}
                style={{ touchAction: 'manipulation' }}
                className="flex items-center justify-between gap-2 px-3 h-9 rounded-lg border border-emerald-500/30 bg-[#0D1518] hover:bg-emerald-500/15 hover:border-emerald-400/70 text-emerald-100 transition-colors cursor-pointer shrink-0"
              >
                <div className="flex items-center gap-2">
                  <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 shrink-0" />
                  <span className="font-display font-bold text-xs">Scene {idx + 1}</span>
                </div>
                <span className="font-mono-num text-[10px] text-emerald-300/80">
                  ALL ×{idx + 1}
                </span>
              </button>
            ))}
          </div>

          {/* Session Project & Sidechain Controls */}
          <div className="p-2 bg-[#0B0F18] border-t border-[#1D2638] flex flex-col gap-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-300 whitespace-nowrap">Kick Sidechain</span>
              <input
                aria-label="Kick Sidechain Ducking"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={project.routing.sidechainAmount}
                style={{ touchAction: 'none' }}
                onChange={(e) => onChangeRouting({ sidechainAmount: parseFloat(e.target.value) })}
                className="flex-1 h-1.5 accent-emerald-400 bg-[#1B2434] rounded cursor-pointer"
              />
              <span className="font-mono-num text-[10px] text-emerald-300 w-8 text-right">
                {Math.round(project.routing.sidechainAmount * 100)}%
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                aria-label="Project Name"
                type="text"
                value={project.name}
                onChange={(e) => onChangeProjectName(e.target.value)}
                className="flex-1 min-w-0 h-8 px-2 rounded-lg bg-[#070A10] border border-[#243045] text-xs font-medium text-white focus:outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                title="Export Project JSON"
                onClick={handleExport}
                style={{ touchAction: 'manipulation' }}
                className="w-8 h-8 rounded-lg bg-[#141C2B] border border-[#2A374F] flex items-center justify-center text-slate-300 hover:text-cyan-300 cursor-pointer shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Import Project JSON as New Project"
                onClick={() => fileInputRef.current?.click()}
                style={{ touchAction: 'manipulation' }}
                className="w-8 h-8 rounded-lg bg-[#141C2B] border border-[#2A374F] flex items-center justify-center text-slate-300 hover:text-amber-300 cursor-pointer shrink-0"
              >
                <FolderUp className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.tarek.json,application/json"
                className="hidden"
                onChange={handleImportFile}
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={onOpenMyProjects}
                style={{ touchAction: 'manipulation' }}
                className="inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-[#141C2B] hover:bg-[#1C273D] border border-[#2A374F] hover:border-emerald-400/60 text-[11px] font-display font-bold text-slate-100 cursor-pointer whitespace-nowrap"
              >
                <FolderOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>MY PROJECTS ({savedProjectsCount})</span>
              </button>
              <button
                type="button"
                title="Create a separate new project (never deletes previous projects)"
                onClick={onCreateNewProject}
                style={{ touchAction: 'manipulation' }}
                className="inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/50 text-[11px] font-display font-bold text-emerald-200 cursor-pointer whitespace-nowrap"
              >
                <FilePlus2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                <span>+ NEW PROJECT</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
