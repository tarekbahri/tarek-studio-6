import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cpu,
  FileArchive,
  FolderOpen,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useIsPaused, useIsPlaying } from '../audio/transportStore';
import type { AvatarAnimState } from './avatar/TarekAvatarModel';
import {
  TarekAvatarStage,
  type AvatarLaunchRequest,
  type AvatarPerchCoord,
} from './avatar/TarekAvatarStage';
import { PWAInstallButton } from './PWAInstallButton';

export type LauncherTargetId =
  | 'subbass'
  | 'ts666'
  | 'beatbox'
  | 'serum'
  | 'sequencer'
  | 'bassremix'
  | 'mixer';

interface HomeLauncherProps {
  active: boolean;
  projectName: string;
  bpm: number;
  masterVolume: number;
  isFullscreen: boolean;
  savedProjectsCount: number;
  lastVisitedId: LauncherTargetId | null;
  onLaunchPlugin: (target: LauncherTargetId) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onChangeBpm: (bpm: number) => void;
  onChangeMasterVolume: (vol: number) => void;
  onOpenMyProjects: () => void;
  onOpenAudioMonitor: () => void;
  onOpenAndroidExport?: () => void;
  onToggleFullscreen: () => void;
  onPanic: () => void;
}

interface PluginCardDef {
  id: LauncherTargetId;
  slotLabel: string;
  name: string;
  subtitle: string;
  accentHex: string;
  glowClass: string;
  row: 1 | 2;
}

const PLUGIN_CARDS: PluginCardDef[] = [
  {
    id: 'subbass',
    slotLabel: 'PL1',
    name: 'SUBSYNTH',
    subtitle: 'Sub & 808 Engine',
    accentHex: '#2EE59D',
    glowClass: 'hover:border-[#2EE59D]/70',
    row: 1,
  },
  {
    id: 'ts666',
    slotLabel: 'PL2',
    name: '666TS',
    subtitle: 'Triple-Osc Growl',
    accentHex: '#EF4444',
    glowClass: 'hover:border-[#EF4444]/75',
    row: 1,
  },
  {
    id: 'beatbox',
    slotLabel: 'PL3',
    name: 'BEATBOX',
    subtitle: 'Drum Pad & Steps',
    accentHex: '#F59E0B',
    glowClass: 'hover:border-[#F59E0B]/75',
    row: 1,
  },
  {
    id: 'serum',
    slotLabel: 'PL4',
    name: 'SERUM 2',
    subtitle: 'Wavetable Synth',
    accentHex: '#38BDF8',
    glowClass: 'hover:border-[#38BDF8]/75',
    row: 1,
  },
  {
    id: 'sequencer',
    slotLabel: 'DAW',
    name: 'SEQUENCER',
    subtitle: 'Timeline & Piano Roll',
    accentHex: '#22D3EE',
    glowClass: 'hover:border-[#22D3EE]/75',
    row: 2,
  },
  {
    id: 'bassremix',
    slotLabel: 'FX LAB',
    name: 'BASS REMIX',
    subtitle: 'Audio to Dubstep',
    accentHex: '#F97316',
    glowClass: 'hover:border-[#F97316]/80',
    row: 2,
  },
  {
    id: 'mixer',
    slotLabel: 'CONSOLE',
    name: 'STUDIO MIXER',
    subtitle: 'Session & Modular FX',
    accentHex: '#E08A3C',
    glowClass: 'hover:border-[#E08A3C]/80',
    row: 2,
  },
];

const PluginEmblem: React.FC<{ id: LauncherTargetId; accent: string }> = ({
  id,
  accent,
}) => {
  switch (id) {
    case 'subbass':
      return (
        <svg viewBox="0 0 40 40" className="w-7 h-7 sm:w-8 sm:h-8" fill="none">
          <circle cx="20" cy="20" r="15" stroke={accent} strokeWidth="2.2" strokeOpacity="0.45" />
          <circle cx="20" cy="20" r="9.5" stroke={accent} strokeWidth="2.4" />
          <path
            d="M7 20C10.5 13 14.5 27 20 20C25.5 13 29.5 27 33 20"
            stroke="#F8FAFC"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'ts666':
      return (
        <svg viewBox="0 0 40 40" className="w-7 h-7 sm:w-8 sm:h-8" fill="none">
          <path
            d="M8 29L13 11L19.5 21L26 9L32 29"
            stroke={accent}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M11 31H29"
            stroke="#FDE68A"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="20" cy="26" r="2.2" fill="#EF4444" />
        </svg>
      );
    case 'beatbox':
      return (
        <svg viewBox="0 0 40 40" className="w-7 h-7 sm:w-8 sm:h-8" fill="none">
          <rect x="6" y="7" width="12" height="12" rx="2.5" fill={accent} fillOpacity="0.25" stroke={accent} strokeWidth="2" />
          <rect x="22" y="7" width="12" height="12" rx="2.5" stroke="#F8FAFC" strokeOpacity="0.7" strokeWidth="2" />
          <rect x="6" y="22" width="12" height="12" rx="2.5" stroke="#F8FAFC" strokeOpacity="0.7" strokeWidth="2" />
          <rect x="22" y="22" width="12" height="12" rx="2.5" fill={accent} fillOpacity="0.4" stroke={accent} strokeWidth="2" />
        </svg>
      );
    case 'serum':
      return (
        <svg viewBox="0 0 40 40" className="w-7 h-7 sm:w-8 sm:h-8" fill="none">
          <path
            d="M6 25C10 15 15 15 20 25C25 33 30 13 34 15"
            stroke={accent}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M6 18C10 9 15 9 20 18C25 27 30 8 34 10"
            stroke="#F8FAFC"
            strokeOpacity="0.72"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <ellipse cx="20" cy="30" rx="11" ry="3" stroke={accent} strokeOpacity="0.5" strokeWidth="1.6" />
        </svg>
      );
    case 'sequencer':
      return (
        <svg viewBox="0 0 40 40" className="w-7 h-7 sm:w-8 sm:h-8" fill="none">
          <rect x="6" y="9" width="14" height="5" rx="1.5" fill={accent} />
          <rect x="13" y="17.5" width="18" height="5" rx="1.5" fill="#F8FAFC" fillOpacity="0.88" />
          <rect x="8" y="26" width="22" height="5" rx="1.5" fill={accent} fillOpacity="0.65" />
          <line x1="21" y1="6" x2="21" y2="34" stroke="#FDE68A" strokeWidth="1.8" strokeDasharray="3 2" />
        </svg>
      );
    case 'bassremix':
      return (
        <svg viewBox="0 0 40 40" className="w-7 h-7 sm:w-8 sm:h-8" fill="none">
          <path
            d="M5 20H9L12 10L16 30L20 7L24 32L28 13L31 20H35"
            stroke={accent}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="20" cy="20" r="15.5" stroke="#EF4444" strokeOpacity="0.35" strokeWidth="1.6" />
        </svg>
      );
    case 'mixer':
      return (
        <svg viewBox="0 0 40 40" className="w-7 h-7 sm:w-8 sm:h-8" fill="none">
          <line x1="11" y1="8" x2="11" y2="32" stroke="#9A7858" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="20" y1="8" x2="20" y2="32" stroke="#9A7858" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="29" y1="8" x2="29" y2="32" stroke="#9A7858" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="7" y="12" width="8" height="5" rx="1.5" fill={accent} />
          <rect x="16" y="22" width="8" height="5" rx="1.5" fill="#F8FAFC" />
          <rect x="25" y="15" width="8" height="5" rx="1.5" fill={accent} />
        </svg>
      );
  }
};

export const HomeLauncher: React.FC<HomeLauncherProps> = ({
  active,
  projectName,
  bpm,
  masterVolume,
  isFullscreen,
  savedProjectsCount,
  lastVisitedId,
  onLaunchPlugin,
  onPlay,
  onPause,
  onStop,
  onChangeBpm,
  onChangeMasterVolume,
  onOpenMyProjects,
  onOpenAudioMonitor,
  onOpenAndroidExport,
  onToggleFullscreen,
  onPanic,
}) => {
  const isPlaying = useIsPlaying();
  const isPaused = useIsPaused();

  const stageAreaRef = useRef<HTMLDivElement | null>(null);
  const perchElMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const [perches, setPerches] = useState<AvatarPerchCoord[]>([]);
  const [hoverTarget, setHoverTarget] = useState<AvatarPerchCoord | null>(null);
  const [launchRequest, setLaunchRequest] = useState<AvatarLaunchRequest | null>(null);
  const [pendingTarget, setPendingTarget] = useState<LauncherTargetId | null>(null);
  const [avatarPhase, setAvatarPhase] = useState<AvatarAnimState>('idle');
  const launchNonceRef = useRef(1);

  const registerPerch = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) {
        perchElMapRef.current.set(id, el);
      } else {
        perchElMapRef.current.delete(id);
      }
    },
    []
  );

  const measurePerches = useCallback((): AvatarPerchCoord[] => {
    const container = stageAreaRef.current;
    if (!container) return [];
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return [];

    const result: AvatarPerchCoord[] = [];
    perchElMapRef.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      const cx = (r.left + r.width / 2 - rect.left) / rect.width;
      const cy = (r.bottom - rect.top) / rect.height;
      result.push({
        id,
        normX: Math.max(0.08, Math.min(0.92, cx)),
        normY: Math.max(0.18, Math.min(0.92, cy)),
      });
    });
    return result;
  }, []);

  useEffect(() => {
    if (!active) return;
    const sync = () => {
      setPerches(measurePerches());
    };
    const raf = requestAnimationFrame(sync);
    window.addEventListener('resize', sync);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', sync);
    };
  }, [active, measurePerches]);

  // Clear pending selection when returning home
  useEffect(() => {
    if (active) {
      setPendingTarget(null);
    }
  }, [active]);

  const handleCardHover = useCallback(
    (id: LauncherTargetId | null) => {
      if (!id) {
        setHoverTarget(null);
        return;
      }
      const list = perches.length > 0 ? perches : measurePerches();
      const found = list.find((p) => p.id === id) ?? null;
      setHoverTarget(found);
    },
    [perches, measurePerches]
  );

  const handleCardTap = useCallback(
    (id: LauncherTargetId) => {
      // Fast-open if user taps the already-selected card mid-animation
      if (pendingTarget === id) {
        setPendingTarget(null);
        onLaunchPlugin(id);
        return;
      }

      const freshPerches = measurePerches();
      if (freshPerches.length > 0) setPerches(freshPerches);
      const target = freshPerches.find((p) => p.id === id);

      if (!target) {
        onLaunchPlugin(id);
        return;
      }

      setPendingTarget(id);
      launchNonceRef.current += 1;
      setLaunchRequest({
        pluginId: id,
        targetNormX: target.normX,
        targetNormY: target.normY,
        nonce: launchNonceRef.current,
      });
    },
    [pendingTarget, measurePerches, onLaunchPlugin]
  );

  const handleAvatarSequenceDone = useCallback(
    (pluginId: string) => {
      setPendingTarget(null);
      onLaunchPlugin(pluginId as LauncherTargetId);
    },
    [onLaunchPlugin]
  );

  const row1Cards = useMemo(() => PLUGIN_CARDS.filter((c) => c.row === 1), []);
  const row2Cards = useMemo(() => PLUGIN_CARDS.filter((c) => c.row === 2), []);

  const initialPerch = useMemo(() => {
    if (lastVisitedId) {
      const found = perches.find((p) => p.id === lastVisitedId);
      if (found) return found;
    }
    return { normX: 0.84, normY: 0.51 };
  }, [lastVisitedId, perches]);

  return (
    <div className="flex flex-col h-dvh w-full bg-[#090503] text-[#F6E2CE] overflow-hidden select-none">
      {/* CLEAN 3-ZONE TOP BAR */}
      <header className="flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-5 h-11 bg-[#130B06] border-b border-[#4D301C] shrink-0">
        {/* Zone 1: TAREK Brand & Quiet Project Context */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-display text-base sm:text-lg font-extrabold tracking-widest text-[#FDE68A] whitespace-nowrap shrink-0">
            TAREK
          </span>
          <span
            aria-hidden="true"
            className="hidden sm:inline text-[#6B4427]"
          >
            ·
          </span>
          <span className="hidden sm:inline text-xs text-[#C8A482] truncate max-w-[160px]">
            {projectName}
          </span>
        </div>

        {/* Zone 2: Minimal Global Transport + BPM */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center gap-0.5 bg-[#0A0503] p-0.5 rounded-md border border-[#3E2616]">
            <button
              type="button"
              onClick={isPlaying ? onPause : onPlay}
              aria-label={isPlaying ? 'Pause Transport' : 'Play Transport'}
              style={{ touchAction: 'manipulation' }}
              className={`w-8 h-7 rounded flex items-center justify-center cursor-pointer transition-colors ${
                isPlaying
                  ? 'bg-[#E08A3C] text-[#120A05]'
                  : isPaused
                  ? 'bg-[#3D2212] text-[#FDE68A]'
                  : 'bg-[#1D110A] text-[#E08A3C] hover:bg-[#2C1A0F]'
              }`}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
            </button>
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop Transport"
              style={{ touchAction: 'manipulation' }}
              className="w-8 h-7 rounded bg-[#1D110A] hover:bg-[#2C1A0F] text-[#D7B899] hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
          </div>

          <div className="flex items-center rounded-md bg-[#0A0503] border border-[#3E2616] h-8 overflow-hidden">
            <button
              type="button"
              aria-label="Decrease BPM"
              onClick={() => onChangeBpm(Math.max(40, bpm - 1))}
              className="w-6 h-full flex items-center justify-center text-[#C8A482] hover:text-white hover:bg-[#24150C] text-xs font-bold cursor-pointer"
            >
              -
            </button>
            <span className="px-2 font-mono-num text-[11px] font-semibold text-[#FDE68A] whitespace-nowrap">
              {bpm} BPM
            </span>
            <button
              type="button"
              aria-label="Increase BPM"
              onClick={() => onChangeBpm(Math.min(240, bpm + 1))}
              className="w-6 h-full flex items-center justify-center text-[#C8A482] hover:text-white hover:bg-[#24150C] text-xs font-bold cursor-pointer"
            >
              +
            </button>
          </div>
        </div>

        {/* Zone 3: Projects, Master Volume, Fullscreen, Stop Audio */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="hidden lg:flex items-center gap-1.5 px-2 h-8 rounded-md bg-[#0A0503] border border-[#3E2616]">
            <Volume2 className="w-3.5 h-3.5 text-[#E08A3C] shrink-0" />
            <input
              aria-label="Master Volume"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={masterVolume}
              style={{ touchAction: 'none' }}
              onChange={(e) => onChangeMasterVolume(parseFloat(e.target.value))}
              className="w-14 h-1.5 accent-[#E08A3C] bg-[#2B190F] rounded-lg cursor-pointer"
            />
          </div>

          <PWAInstallButton />

          {onOpenAndroidExport && (
            <button
              type="button"
              onClick={onOpenAndroidExport}
              style={{ touchAction: 'manipulation' }}
              title="Download Source ZIP & Free Android APK Guide"
              className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md bg-[#1D110A] hover:bg-[#2C1A0F] border border-[#7E502C] text-xs font-display font-semibold text-[#FDE68A] cursor-pointer whitespace-nowrap shrink-0 transition-colors"
            >
              <FileArchive className="w-3.5 h-3.5 text-[#E08A3C]" />
              <span className="hidden sm:inline">APK / ZIP</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenMyProjects}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md bg-[#1D110A] hover:bg-[#2C1A0F] border border-[#5B3A22] text-xs font-display font-semibold text-[#F6E2CE] cursor-pointer whitespace-nowrap shrink-0 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#E08A3C]" />
            <span className="hidden sm:inline">Projects</span>
            <span className="font-mono-num text-[11px] text-[#C8A482]">
              {savedProjectsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenAudioMonitor}
            aria-label="Audio Engine Monitor"
            title="Audio Engine Monitor"
            className="w-8 h-8 rounded-md bg-[#0A0503] hover:bg-[#24150C] border border-[#3E2616] flex items-center justify-center text-[#D7B899] hover:text-[#FDE68A] cursor-pointer shrink-0"
          >
            <Cpu className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Landscape'}
            className="hidden sm:flex w-8 h-8 rounded-md bg-[#0A0503] hover:bg-[#24150C] border border-[#3E2616] items-center justify-center text-[#D7B899] hover:text-[#FDE68A] cursor-pointer shrink-0"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onPanic}
            aria-label="Stop All Sound"
            title="Stop All Sound"
            className="w-8 h-8 rounded-md bg-[#0A0503] hover:bg-[#3A1614] border border-[#3E2616] flex items-center justify-center text-[#D7B899] hover:text-[#FCA5A5] cursor-pointer shrink-0"
          >
            <VolumeX className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* MAIN STUDIO LAUNCHER STAGE + 3D INTERACTIVE AVATAR */}
      <main
        ref={stageAreaRef}
        className="flex-1 min-h-0 relative flex flex-col justify-between p-2.5 sm:px-5 sm:py-3.5 lg:p-6 overflow-y-auto synth-scroll"
        style={{
          background:
            'radial-gradient(ellipse 75% 55% at 50% 48%, rgba(168, 88, 32, 0.16) 0%, rgba(14, 8, 5, 0.96) 72%, #090503 100%)',
        }}
      >
        {/* Subtle Stage Floor Line */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-[#5B3A22]/55 to-transparent"
        />

        {/* TOP ROW: PL1 · PL2 · PL3 · PL4 */}
        <section
          aria-label="Instruments"
          className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3.5 lg:gap-4 max-w-6xl w-full mx-auto"
        >
          {row1Cards.map((card) => {
            const isSelected = pendingTarget === card.id;
            const isRecent = lastVisitedId === card.id && !pendingTarget;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => handleCardTap(card.id)}
                onMouseEnter={() => handleCardHover(card.id)}
                onMouseLeave={() => handleCardHover(null)}
                onFocus={() => handleCardHover(card.id)}
                onBlur={() => handleCardHover(null)}
                style={{ touchAction: 'manipulation' }}
                className={`group relative flex flex-col items-start justify-between p-2.5 sm:p-3 lg:p-4 min-h-[82px] sm:min-h-[94px] lg:min-h-[120px] rounded-2xl border bg-[#150D08]/90 text-left cursor-pointer transition-transform duration-150 active:scale-[0.97] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E08A3C] ${
                  isSelected
                    ? 'border-[#E08A3C] scale-[1.02] shadow-[0_0_24px_rgba(224,138,60,0.32)]'
                    : isRecent
                    ? 'border-[#7E502C]'
                    : 'border-[#3E2616]'
                } ${card.glowClass}`}
              >
                <div className="flex items-center justify-between w-full gap-2">
                  <div
                    className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center border border-[#4D301C] bg-[#0D0704] transition-transform duration-150 group-hover:scale-105"
                    style={{
                      boxShadow: isSelected
                        ? `0 0 16px ${card.accentHex}44`
                        : undefined,
                    }}
                  >
                    <PluginEmblem id={card.id} accent={card.accentHex} />
                  </div>
                  <span
                    className="font-mono-num text-[11px] font-semibold tracking-wider text-[#B6906E]"
                    style={{ color: isSelected ? card.accentHex : undefined }}
                  >
                    {card.slotLabel}
                  </span>
                </div>

                <div className="mt-1.5 lg:mt-2.5 w-full min-w-0">
                  <div className="font-display text-xs sm:text-sm lg:text-base font-bold tracking-wide text-[#F9EAD9] truncate">
                    {card.name}
                  </div>
                  <div className="text-[10.5px] lg:text-[11px] text-[#A88262] truncate">
                    {card.subtitle}
                  </div>
                </div>

                {/* Invisible DOM Perch Anchor for 3D Avatar Landing */}
                <span
                  ref={registerPerch(card.id)}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 -bottom-1 w-2 h-2 -translate-x-1/2"
                />
              </button>
            );
          })}
        </section>

        {/* CENTER OPEN STAGE LANE FOR 3D AVATAR MOVEMENT */}
        <div
          aria-hidden="true"
          className="relative z-10 flex-1 min-h-[42px] sm:min-h-[56px] lg:min-h-[92px] flex items-center justify-center pointer-events-none"
        >
          {avatarPhase === 'angry_far' && (
            <div className="px-3 py-1 rounded-lg bg-[#1A0D07]/95 border border-[#EF4444]/60 text-[11px] font-display font-bold text-[#FCA5A5] animate-bounce">
              So far...!
            </div>
          )}
        </div>

        {/* BOTTOM ROW: SEQUENCER · BASS REMIX · STUDIO MIXER */}
        <section
          aria-label="Production & Remix Studios"
          className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3.5 lg:gap-4 max-w-5xl w-full mx-auto"
        >
          {row2Cards.map((card) => {
            const isSelected = pendingTarget === card.id;
            const isRecent = lastVisitedId === card.id && !pendingTarget;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => handleCardTap(card.id)}
                onMouseEnter={() => handleCardHover(card.id)}
                onMouseLeave={() => handleCardHover(null)}
                onFocus={() => handleCardHover(card.id)}
                onBlur={() => handleCardHover(null)}
                style={{ touchAction: 'manipulation' }}
                className={`group relative flex items-center gap-3 p-2.5 sm:p-3 lg:p-4 min-h-[70px] sm:min-h-[78px] lg:min-h-[96px] rounded-2xl border bg-[#150D08]/90 text-left cursor-pointer transition-transform duration-150 active:scale-[0.98] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E08A3C] ${
                  isSelected
                    ? 'border-[#E08A3C] scale-[1.02] shadow-[0_0_24px_rgba(224,138,60,0.34)]'
                    : isRecent
                    ? 'border-[#7E502C]'
                    : 'border-[#3E2616]'
                } ${card.glowClass}`}
              >
                <div
                  className="w-11 h-11 lg:w-14 lg:h-14 rounded-xl flex items-center justify-center border border-[#4D301C] bg-[#0D0704] shrink-0 transition-transform duration-150 group-hover:scale-105"
                  style={{
                    boxShadow: isSelected
                      ? `0 0 18px ${card.accentHex}44`
                      : undefined,
                  }}
                >
                  <PluginEmblem id={card.id} accent={card.accentHex} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] lg:text-[11px] font-mono-num font-semibold text-[#B6906E]">
                    {card.slotLabel}
                  </div>
                  <div className="font-display text-sm sm:text-base lg:text-lg font-bold tracking-wide text-[#F9EAD9] truncate">
                    {card.name}
                  </div>
                  <div className="text-[11px] lg:text-xs text-[#A88262] truncate">
                    {card.subtitle}
                  </div>
                </div>

                {/* Invisible DOM Perch Anchor on Upper Edge so avatar lands right atop lower-row cards */}
                <span
                  ref={registerPerch(card.id)}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-0 w-2 h-2 -translate-x-1/2"
                />
              </button>
            );
          })}
        </section>

        {/* NON-BLOCKING 3D WEBGL AVATAR OVERLAY */}
        <TarekAvatarStage
          active={active}
          initialNormX={initialPerch.normX}
          initialNormY={initialPerch.normY}
          hoverTarget={hoverTarget}
          availablePerches={perches}
          launchRequest={launchRequest}
          onLaunchSequenceComplete={handleAvatarSequenceDone}
          onPhaseChange={setAvatarPhase}
        />
      </main>
    </div>
  );
};
