import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { StudioRoutingConfig } from '../types/beatbox';

export type PluginChannelId = 'serum' | 'beatbox' | 'subbass' | 'ts666' | 'bassremix';

interface PluginChannelStripProps {
  plugin: PluginChannelId;
  routing: StudioRoutingConfig;
  onChangeRouting: (patch: Partial<StudioRoutingConfig>) => void;
  variant?: 'header' | 'card';
  accent?: 'cyan' | 'amber' | 'blue' | 'rose';
}

export const PluginChannelStrip: React.FC<PluginChannelStripProps> = ({
  plugin,
  routing,
  onChangeRouting,
  variant = 'header',
  accent = 'cyan',
}) => {
  const muted =
    plugin === 'serum'
      ? routing.serumMuted
      : plugin === 'beatbox'
      ? routing.beatboxMuted
      : plugin === 'ts666'
      ? Boolean(routing.ts666Muted)
      : plugin === 'bassremix'
      ? Boolean(routing.bassremixMuted)
      : routing.subbassMuted;

  const solo =
    plugin === 'serum'
      ? routing.serumSolo
      : plugin === 'beatbox'
      ? routing.beatboxSolo
      : plugin === 'ts666'
      ? Boolean(routing.ts666Solo)
      : plugin === 'bassremix'
      ? Boolean(routing.bassremixSolo)
      : routing.subbassSolo;

  const fxBypass =
    plugin === 'serum'
      ? routing.serumFxBypass
      : plugin === 'beatbox'
      ? routing.beatboxFxBypass
      : plugin === 'ts666'
      ? Boolean(routing.ts666FxBypass)
      : plugin === 'bassremix'
      ? Boolean(routing.bassremixFxBypass)
      : routing.subbassFxBypass;

  const level =
    plugin === 'serum'
      ? (routing.serumLevel ?? 1.0)
      : plugin === 'beatbox'
      ? (routing.beatboxLevel ?? 0.95)
      : plugin === 'ts666'
      ? (routing.ts666Level ?? 1.0)
      : plugin === 'bassremix'
      ? (routing.bassremixLevel ?? 1.0)
      : (routing.subbassLevel ?? 1.0);

  const anySolo = Boolean(
    routing.serumSolo ||
      routing.beatboxSolo ||
      routing.subbassSolo ||
      routing.ts666Solo ||
      routing.bassremixSolo
  );
  const silencedByOtherSolo = anySolo && !solo;
  const effectiveSilenced = muted || silencedByOtherSolo;

  const handleToggleMute = () => {
    if (plugin === 'serum') onChangeRouting({ serumMuted: !muted });
    else if (plugin === 'beatbox') onChangeRouting({ beatboxMuted: !muted });
    else if (plugin === 'ts666') onChangeRouting({ ts666Muted: !muted });
    else if (plugin === 'bassremix') onChangeRouting({ bassremixMuted: !muted });
    else onChangeRouting({ subbassMuted: !muted });
  };

  const handleToggleSolo = () => {
    if (plugin === 'serum') onChangeRouting({ serumSolo: !solo });
    else if (plugin === 'beatbox') onChangeRouting({ beatboxSolo: !solo });
    else if (plugin === 'ts666') onChangeRouting({ ts666Solo: !solo });
    else if (plugin === 'bassremix') onChangeRouting({ bassremixSolo: !solo });
    else onChangeRouting({ subbassSolo: !solo });
  };

  const handleToggleFxBypass = () => {
    if (plugin === 'serum') onChangeRouting({ serumFxBypass: !fxBypass });
    else if (plugin === 'beatbox') onChangeRouting({ beatboxFxBypass: !fxBypass });
    else if (plugin === 'ts666') onChangeRouting({ ts666FxBypass: !fxBypass });
    else if (plugin === 'bassremix') onChangeRouting({ bassremixFxBypass: !fxBypass });
    else onChangeRouting({ subbassFxBypass: !fxBypass });
  };

  const handleChangeLevel = (val: number) => {
    if (plugin === 'serum') onChangeRouting({ serumLevel: val });
    else if (plugin === 'beatbox') onChangeRouting({ beatboxLevel: val });
    else if (plugin === 'ts666') onChangeRouting({ ts666Level: val });
    else if (plugin === 'bassremix') onChangeRouting({ bassremixLevel: val });
    else onChangeRouting({ subbassLevel: val });
  };

  const labelPrefix =
    plugin === 'serum'
      ? 'SERUM'
      : plugin === 'beatbox'
      ? 'BEATBOX'
      : plugin === 'ts666'
      ? '666TS'
      : plugin === 'bassremix'
      ? 'BASS REMIX'
      : 'SUBBASS';

  const sliderAccentClass =
    accent === 'amber'
      ? 'accent-amber-400'
      : accent === 'blue'
      ? 'accent-blue-500'
      : accent === 'rose'
      ? 'accent-rose-400'
      : 'accent-cyan-400';

  const readoutTextClass =
    accent === 'amber'
      ? 'text-amber-300'
      : accent === 'blue'
      ? 'text-blue-300'
      : accent === 'rose'
      ? 'text-rose-300'
      : 'text-cyan-300';

  if (variant === 'card') {
    return (
      <div className="flex flex-col gap-2 pt-2.5 border-t border-[#1E2736]/80">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-pressed={muted}
              aria-label={`Mute ${labelPrefix}`}
              onClick={handleToggleMute}
              style={{ touchAction: 'manipulation' }}
              className={`h-8 px-2.5 rounded-md font-display font-bold text-[11px] tracking-wide border transition-colors cursor-pointer ${
                muted
                  ? 'bg-rose-500 text-white border-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.35)]'
                  : 'bg-[#0A0E15] border-[#263042] text-slate-300 hover:text-white hover:border-rose-400/50'
              }`}
            >
              MUTE
            </button>

            <button
              type="button"
              aria-pressed={solo}
              aria-label={`Solo ${labelPrefix}`}
              onClick={handleToggleSolo}
              style={{ touchAction: 'manipulation' }}
              className={`h-8 px-2.5 rounded-md font-display font-bold text-[11px] tracking-wide border transition-colors cursor-pointer ${
                solo
                  ? 'bg-amber-400 text-slate-950 border-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.4)]'
                  : 'bg-[#0A0E15] border-[#263042] text-slate-300 hover:text-white hover:border-amber-400/50'
              }`}
            >
              SOLO
            </button>

            <button
              type="button"
              aria-pressed={fxBypass}
              aria-label={`Bypass FX on ${labelPrefix}`}
              onClick={handleToggleFxBypass}
              style={{ touchAction: 'manipulation' }}
              className={`h-8 px-2 rounded-md font-display font-bold text-[11px] tracking-wide border transition-colors cursor-pointer whitespace-nowrap ${
                fxBypass
                  ? 'bg-orange-500/20 text-orange-300 border-orange-400/60'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:border-emerald-400'
              }`}
            >
              {fxBypass ? 'FX BYP' : 'FX ON'}
            </button>
          </div>

          {silencedByOtherSolo && !muted && (
            <span className="text-[10px] font-mono-num uppercase text-amber-300/80">
              Dimmed (Solo)
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2.5">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-300 whitespace-nowrap">
            {effectiveSilenced ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
            <span>Mix Level</span>
          </span>
          <input
            aria-label={`${labelPrefix} Mix Level`}
            type="range"
            min={0}
            max={1.2}
            step={0.01}
            value={level}
            style={{ touchAction: 'none' }}
            onChange={(e) => handleChangeLevel(parseFloat(e.target.value))}
            className={`flex-1 ${sliderAccentClass} h-1.5 bg-[#1B2434] rounded-lg cursor-pointer`}
          />
          <span className={`font-mono-num text-xs ${readoutTextClass} w-10 text-right`}>
            {Math.round(level * 100)}%
          </span>
        </div>
      </div>
    );
  }

  // Header compact strip for inside SERUM, BEATBOX & SUBBASS plugins
  return (
    <div className="flex items-center gap-1 bg-[#080C16] px-1.5 py-0.5 rounded-lg border border-[#23304A] shrink-0">
      <button
        type="button"
        aria-pressed={muted}
        aria-label={`Mute ${labelPrefix}`}
        title={`Mute ${labelPrefix}`}
        onClick={handleToggleMute}
        style={{ touchAction: 'manipulation' }}
        className={`h-7 px-2 rounded font-display font-bold text-[10px] tracking-wide border transition-colors cursor-pointer ${
          muted
            ? 'bg-rose-500 text-white border-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.35)]'
            : 'bg-[#101726] border-[#263248] text-slate-300 hover:text-white hover:border-rose-400/60'
        }`}
      >
        MUTE
      </button>

      <button
        type="button"
        aria-pressed={solo}
        aria-label={`Solo ${labelPrefix}`}
        title={`Solo ${labelPrefix} (can solo multiple plugins)`}
        onClick={handleToggleSolo}
        style={{ touchAction: 'manipulation' }}
        className={`h-7 px-2 rounded font-display font-bold text-[10px] tracking-wide border transition-colors cursor-pointer ${
          solo
            ? 'bg-amber-400 text-slate-950 border-amber-200 shadow-[0_0_8px_rgba(251,191,36,0.4)]'
            : 'bg-[#101726] border-[#263248] text-slate-300 hover:text-white hover:border-amber-400/60'
        }`}
      >
        SOLO
      </button>

      <button
        type="button"
        aria-pressed={fxBypass}
        aria-label={`FX Bypass ${labelPrefix}`}
        title={fxBypass ? `${labelPrefix} FX Bypassed (click to enable FX)` : `Bypass ${labelPrefix} Effects`}
        onClick={handleToggleFxBypass}
        style={{ touchAction: 'manipulation' }}
        className={`h-7 px-2 rounded font-display font-bold text-[10px] tracking-wide border transition-colors cursor-pointer whitespace-nowrap ${
          fxBypass
            ? 'bg-orange-500/25 text-orange-300 border-orange-400/70'
            : 'bg-[#101726] border-[#263248] text-emerald-300 hover:border-emerald-400/60'
        }`}
      >
        {fxBypass ? 'FX BYP' : 'FX'}
      </button>

      <div className="hidden sm:flex items-center gap-1 pl-1 border-l border-[#1E293D]">
        {effectiveSilenced ? (
          <VolumeX className="w-3.5 h-3.5 text-rose-400 shrink-0" />
        ) : (
          <Volume2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
        <input
          aria-label={`${labelPrefix} Channel Volume`}
          type="range"
          min={0}
          max={1.2}
          step={0.01}
          value={level}
          style={{ touchAction: 'none' }}
          onChange={(e) => handleChangeLevel(parseFloat(e.target.value))}
          className={`w-14 ${sliderAccentClass} h-1.5 bg-[#1B2434] rounded cursor-pointer`}
        />
        <span className={`font-mono-num text-[10px] ${readoutTextClass} w-8 text-right`}>
          {Math.round(level * 100)}%
        </span>
      </div>
    </div>
  );
};
