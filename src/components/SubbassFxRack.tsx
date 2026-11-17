import React, { useEffect, useMemo, useRef } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Power,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { midiBus } from '../audio/MidiBus';
import { subbassEngine } from '../audio/SubbassEngine';
import { useIsPlaying } from '../audio/transportStore';
import {
  SUBBASS_FX_PRESETS,
  applySubbassFxPreset,
  createDefaultSubbassFxConfig,
  crossoverHzToNorm,
  normToCrossoverHz,
} from '../audio/subbassPresets';
import type {
  SubbassFilterType,
  SubbassFxConfig,
  SubbassFxId,
  SubbassSidechainRate,
} from '../types/subbass';
import { SubbassKnob } from './SubbassKnob';
import { SubbassWaveshaperCanvas } from './SubbassWaveshaperCanvas';

interface SubbassFxRackProps {
  fx: SubbassFxConfig;
  bpm: number;
  onChangeFx: (updater: (prev: SubbassFxConfig) => SubbassFxConfig) => void;
}

const FX_META: Record<
  SubbassFxId,
  { title: string; role: 'HARMONIC' | 'MASTER'; subtitle: string }
> = {
  tube: {
    title: 'TUBE SATURATION',
    role: 'HARMONIC',
    subtitle: 'Warm even-order analog vacuum saturation',
  },
  diode: {
    title: 'DIODE DISTORTION',
    role: 'HARMONIC',
    subtitle: 'Asymmetric diode grit with tone sculpt',
  },
  softClip: {
    title: 'SOFT CLIPPER',
    role: 'HARMONIC',
    subtitle: 'Smooth peak rounding & harmonic density',
  },
  waveshaper: {
    title: 'WAVESHAPER',
    role: 'HARMONIC',
    subtitle: 'Custom spline harmonic transfer curve',
  },
  eq: {
    title: 'PARAMETRIC EQ',
    role: 'MASTER',
    subtitle: 'Low shelf, sweepable mid bell & high shelf',
  },
  lowpass: {
    title: 'LOW PASS FILTER',
    role: 'MASTER',
    subtitle: '12dB / 24dB / Warm sub-harmonic sculpting',
  },
  compressor: {
    title: 'COMPRESSOR',
    role: 'MASTER',
    subtitle: 'Dynamics glue with gain reduction meter',
  },
  sidechain: {
    title: 'SIDECHAIN',
    role: 'MASTER',
    subtitle: 'Synced to BEATBOX Kick & global BPM',
  },
  stereo: {
    title: 'MONO / STEREO CONTROL',
    role: 'MASTER',
    subtitle: 'Mono sub lock + stereo width above crossover',
  },
};

export const SubbassFxRack: React.FC<SubbassFxRackProps> = React.memo(({
  fx,
  bpm,
  onChangeFx,
}) => {
  const compBarRef = useRef<HTMLDivElement | null>(null);
  const compTextRef = useRef<HTMLSpanElement | null>(null);
  const scBarRef = useRef<HTMLDivElement | null>(null);
  const lastMetersRef = useRef<{ gr: number; sc: number }>({ gr: -1, sc: -1 });

  const isPlaying = useIsPlaying();
  const wakeMetersRef = useRef<(() => void) | null>(null);

  // Direct DOM meter updates (~18fps during live audio, sleeps cleanly when idle)
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let silentTicks = 0;

    const tick = (ts: number) => {
      raf = 0;
      if (document.hidden) return;
      if (ts - last < 55) {
        raf = requestAnimationFrame(tick);
        return;
      }
      last = ts;

      const gr = Math.round(Math.abs(subbassEngine.getCompressorReduction()) * 10) / 10;
      const sc = Math.round(subbassEngine.getSidechainTelemetry().level * 100);

      if (gr !== lastMetersRef.current.gr) {
        lastMetersRef.current.gr = gr;
        if (compBarRef.current) {
          compBarRef.current.style.width = `${Math.min(100, (gr / 18) * 100)}%`;
        }
        if (compTextRef.current) {
          compTextRef.current.textContent = `-${gr.toFixed(1)} dB`;
        }
      }
      if (sc !== lastMetersRef.current.sc) {
        lastMetersRef.current.sc = sc;
        if (scBarRef.current) {
          scBarRef.current.style.width = `${sc}%`;
        }
      }

      if (gr > 0 || sc > 0) {
        silentTicks = 0;
      } else {
        silentTicks++;
      }

      if (isPlaying || gr > 0 || sc > 0 || silentTicks < 6) {
        raf = requestAnimationFrame(tick);
      }
    };

    wakeMetersRef.current = () => {
      silentTicks = 0;
      if (raf === 0) {
        raf = requestAnimationFrame(tick);
      }
    };

    const unsubMidi = midiBus.subscribe(() => {
      wakeMetersRef.current?.();
    });

    raf = requestAnimationFrame(tick);
    return () => {
      unsubMidi();
      if (raf !== 0) cancelAnimationFrame(raf);
      wakeMetersRef.current = null;
    };
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      wakeMetersRef.current?.();
    }
  }, [isPlaying]);

  const activePreset = useMemo(
    () =>
      SUBBASS_FX_PRESETS.find((p) => p.id === fx.presetId) ??
      SUBBASS_FX_PRESETS[0],
    [fx.presetId]
  );

  const moveModule = (id: SubbassFxId, dir: -1 | 1) => {
    onChangeFx((prev) => {
      const idx = prev.order.indexOf(id);
      if (idx < 0) return prev;
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= prev.order.length) return prev;
      const nextOrder = [...prev.order];
      const [item] = nextOrder.splice(idx, 1);
      nextOrder.splice(targetIdx, 0, item);
      return { ...prev, order: nextOrder };
    });
  };

  const toggleModule = (id: SubbassFxId) => {
    onChangeFx((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        enabled: !prev[id].enabled,
      },
    }));
  };

  const updateModule = <K extends SubbassFxId>(
    id: K,
    patch: Partial<SubbassFxConfig[K]>
  ) => {
    onChangeFx((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...patch,
      },
    }));
  };

  const renderModuleControls = (id: SubbassFxId) => {
    const enabled = fx[id].enabled;
    switch (id) {
      case 'tube':
        return (
          <div className="grid grid-cols-3 gap-2">
            <SubbassKnob
              compact
              muted={!enabled}
              label="DRIVE"
              value={fx.tube.drive}
              defaultValue={0.28}
              accent="purple"
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(drive) => updateModule('tube', { drive })}
            />
            <SubbassKnob
              compact
              muted={!enabled}
              label="MIX"
              value={fx.tube.mix}
              defaultValue={0.65}
              accent="blue"
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(mix) => updateModule('tube', { mix })}
            />
            <SubbassKnob
              compact
              muted={!enabled}
              label="OUTPUT"
              value={fx.tube.output}
              defaultValue={0.55}
              accent="dual"
              formatValue={(v) => `${Math.round((0.25 + v * 1.35) * 100)}%`}
              onChange={(output) => updateModule('tube', { output })}
            />
          </div>
        );

      case 'diode':
        return (
          <div className="grid grid-cols-3 gap-2">
            <SubbassKnob
              compact
              muted={!enabled}
              label="DRIVE"
              value={fx.diode.drive}
              defaultValue={0.35}
              accent="purple"
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(drive) => updateModule('diode', { drive })}
            />
            <SubbassKnob
              compact
              muted={!enabled}
              label="TONE"
              value={fx.diode.tone}
              defaultValue={0.55}
              accent="blue"
              formatValue={(v) => `${Math.round(260 * Math.pow(18, v))} Hz`}
              onChange={(tone) => updateModule('diode', { tone })}
            />
            <SubbassKnob
              compact
              muted={!enabled}
              label="MIX"
              value={fx.diode.mix}
              defaultValue={0.5}
              accent="dual"
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(mix) => updateModule('diode', { mix })}
            />
          </div>
        );

      case 'softClip':
        return (
          <div className="grid grid-cols-3 gap-2">
            <SubbassKnob
              compact
              muted={!enabled}
              label="THRESHOLD"
              value={fx.softClip.threshold}
              defaultValue={0.65}
              accent="blue"
              formatValue={(v) => `${Math.round((0.92 - v * 0.68) * 100)}%`}
              onChange={(threshold) => updateModule('softClip', { threshold })}
            />
            <SubbassKnob
              compact
              muted={!enabled}
              label="AMOUNT"
              value={fx.softClip.amount}
              defaultValue={0.42}
              accent="purple"
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(amount) => updateModule('softClip', { amount })}
            />
            <SubbassKnob
              compact
              muted={!enabled}
              label="OUTPUT"
              value={fx.softClip.output}
              defaultValue={0.58}
              accent="dual"
              formatValue={(v) => `${Math.round((0.35 + v * 1.15) * 100)}%`}
              onChange={(output) => updateModule('softClip', { output })}
            />
          </div>
        );

      case 'waveshaper':
        return (
          <div className="flex flex-col gap-2.5">
            <SubbassWaveshaperCanvas
              curvePoints={fx.waveshaper.curvePoints}
              enabled={enabled}
              onChangeCurve={(curvePoints) =>
                updateModule('waveshaper', { curvePoints })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <SubbassKnob
                compact
                muted={!enabled}
                label="DRIVE"
                value={fx.waveshaper.drive}
                defaultValue={0.35}
                accent="purple"
                formatValue={(v) => `${(0.8 + v * 4.5).toFixed(1)}x`}
                onChange={(drive) => updateModule('waveshaper', { drive })}
              />
              <SubbassKnob
                compact
                muted={!enabled}
                label="MIX"
                value={fx.waveshaper.mix}
                defaultValue={0.55}
                accent="blue"
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(mix) => updateModule('waveshaper', { mix })}
              />
            </div>
          </div>
        );

      case 'eq':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <SubbassKnob
              compact
              muted={!enabled}
              label="LOW SHELF"
              value={fx.eq.lowShelf}
              defaultValue={0.5}
              accent="blue"
              formatValue={(v) => {
                const db = (v - 0.5) * 24;
                return `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
              }}
              onChange={(lowShelf) => updateModule('eq', { lowShelf })}
            />
            <SubbassKnob
              compact
              muted={!enabled}
              label="MID FREQ"
              value={fx.eq.midFreq}
              defaultValue={0.42}
              accent="purple"
              formatValue={(v) => `${Math.round(100 * Math.pow(25, v))} Hz`}
              onChange={(midFreq) => updateModule('eq', { midFreq })}
            />
            <SubbassKnob
              compact
              muted={!enabled}
              label="MID GAIN"
              value={fx.eq.midGain}
              defaultValue={0.5}
              accent="dual"
              formatValue={(v) => {
                const db = (v - 0.5) * 24;
                return `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
              }}
              onChange={(midGain) => updateModule('eq', { midGain })}
            />
            <SubbassKnob
              compact
              muted={!enabled}
              label="HIGH SHELF"
              value={fx.eq.highShelf}
              defaultValue={0.5}
              accent="blue"
              formatValue={(v) => {
                const db = (v - 0.5) * 24;
                return `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
              }}
              onChange={(highShelf) => updateModule('eq', { highShelf })}
            />
          </div>
        );

      case 'lowpass':
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-1 bg-[#0E1116] p-1 rounded-md border border-[#2D3442]">
              <span className="text-[10px] font-semibold text-slate-400 px-2">
                FILTER TYPE
              </span>
              <div className="flex items-center gap-1">
                {(
                  [
                    ['lp12', 'LP 12dB'],
                    ['lp24', 'LP 24dB'],
                    ['warm', 'WARM'],
                  ] as [SubbassFilterType, string][]
                ).map(([type, lbl]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => updateModule('lowpass', { filterType: type })}
                    className={`px-2.5 h-7 rounded text-[10.5px] font-bold cursor-pointer transition-colors ${
                      fx.lowpass.filterType === type
                        ? 'bg-[#2EE59D] text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SubbassKnob
                compact
                muted={!enabled}
                label="CUTOFF"
                value={fx.lowpass.cutoff}
                defaultValue={0.65}
                accent="mint"
                formatValue={(v) => `${Math.round(35 * Math.pow(171.4, v))} Hz`}
                onChange={(cutoff) => updateModule('lowpass', { cutoff })}
              />
              <SubbassKnob
                compact
                muted={!enabled}
                label="RESONANCE"
                value={fx.lowpass.resonance}
                defaultValue={0.22}
                accent="amber"
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(resonance) => updateModule('lowpass', { resonance })}
              />
            </div>
          </div>
        );

      case 'compressor':
        return (
          <div className="flex flex-col gap-2">
            {/* Gain Reduction Meter */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[#090B0F] border border-[#282F3C]">
              <span className="text-[10px] font-bold text-slate-400">GR</span>
              <div className="flex-1 h-2 rounded-full bg-[#15181F] overflow-hidden">
                <div
                  ref={compBarRef}
                  style={{ width: '0%' }}
                  className="h-full bg-gradient-to-r from-[#2EE59D] to-amber-400"
                />
              </div>
              <span
                ref={compTextRef}
                className="font-mono-num text-[11px] font-semibold text-[#2EE59D] w-14 text-right"
              >
                -0.0 dB
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              <SubbassKnob
                compact
                muted={!enabled}
                label="THRESH"
                value={fx.compressor.threshold}
                defaultValue={0.52}
                accent="blue"
                formatValue={(v) => `${Math.round(-48 + v * 48)} dB`}
                onChange={(threshold) => updateModule('compressor', { threshold })}
              />
              <SubbassKnob
                compact
                muted={!enabled}
                label="RATIO"
                value={fx.compressor.ratio}
                defaultValue={0.28}
                accent="purple"
                formatValue={(v) => `${(1 + v * 19).toFixed(1)}:1`}
                onChange={(ratio) => updateModule('compressor', { ratio })}
              />
              <SubbassKnob
                compact
                muted={!enabled}
                label="ATTACK"
                value={fx.compressor.attack}
                defaultValue={0.14}
                accent="blue"
                formatValue={(v) => `${Math.round(1 + Math.pow(v, 1.5) * 149)} ms`}
                onChange={(attack) => updateModule('compressor', { attack })}
              />
              <SubbassKnob
                compact
                muted={!enabled}
                label="RELEASE"
                value={fx.compressor.release}
                defaultValue={0.28}
                accent="blue"
                formatValue={(v) => `${Math.round(30 + Math.pow(v, 1.4) * 770)} ms`}
                onChange={(release) => updateModule('compressor', { release })}
              />
              <SubbassKnob
                compact
                muted={!enabled}
                label="MAKEUP"
                value={fx.compressor.makeup}
                defaultValue={0.16}
                accent="dual"
                formatValue={(v) => `+${(v * 18).toFixed(1)} dB`}
                onChange={(makeup) => updateModule('compressor', { makeup })}
              />
            </div>
          </div>
        );

      case 'sidechain':
        return (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[#090B0F] border border-[#282F3C]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-bold text-amber-300 whitespace-nowrap">
                  BEATBOX KICK SYNC
                </span>
                <div className="w-20 h-2 rounded-full bg-[#15181F] overflow-hidden">
                  <div
                    ref={scBarRef}
                    style={{ width: '0%' }}
                    className="h-full bg-gradient-to-r from-amber-400 to-[#2EE59D]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    updateModule('sidechain', { bpmSync: !fx.sidechain.bpmSync })
                  }
                  className={`px-2.5 h-7 rounded text-[10px] font-bold cursor-pointer border ${
                    fx.sidechain.bpmSync
                      ? 'bg-amber-500/20 border-amber-400/70 text-amber-200'
                      : 'bg-[#141820] border-[#2D3442] text-slate-400'
                  }`}
                >
                  BPM SYNC ({bpm})
                </button>
                {fx.sidechain.bpmSync &&
                  (['1/4', '1/8', '1/2'] as SubbassSidechainRate[]).map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => updateModule('sidechain', { syncRate: rate })}
                      className={`px-2 h-7 rounded text-[10px] font-mono-num font-bold cursor-pointer ${
                        fx.sidechain.syncRate === rate
                          ? 'bg-[#2EE59D] text-slate-950'
                          : 'bg-[#141820] text-slate-400 hover:text-white'
                      }`}
                    >
                      {rate}
                    </button>
                  ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <SubbassKnob
                compact
                muted={!enabled}
                label="AMOUNT"
                value={fx.sidechain.amount}
                defaultValue={0.65}
                accent="purple"
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(amount) => updateModule('sidechain', { amount })}
              />
              <SubbassKnob
                compact
                muted={!enabled}
                label="ATTACK"
                value={fx.sidechain.attack}
                defaultValue={0.12}
                accent="blue"
                formatValue={(v) => `${Math.round(2 + v * 75)} ms`}
                onChange={(attack) => updateModule('sidechain', { attack })}
              />
              <SubbassKnob
                compact
                muted={!enabled || fx.sidechain.bpmSync}
                label={fx.sidechain.bpmSync ? 'SYNC REL' : 'RELEASE'}
                value={fx.sidechain.release}
                defaultValue={0.34}
                accent="dual"
                formatValue={(v) => {
                  if (fx.sidechain.bpmSync) {
                    const beatMs = 60000 / Math.max(40, bpm);
                    const mult =
                      fx.sidechain.syncRate === '1/8'
                        ? 0.42
                        : fx.sidechain.syncRate === '1/2'
                        ? 1.55
                        : 0.85;
                    return `${Math.round(beatMs * mult)} ms`;
                  }
                  return `${Math.round(40 + v * 710)} ms`;
                }}
                onChange={(release) => updateModule('sidechain', { release })}
              />
            </div>
          </div>
        );

      case 'stereo': {
        const xoHz = normToCrossoverHz(fx.stereo.crossoverHz);
        const widthPct = Math.round(fx.stereo.width * 160);
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[#090B0F] border border-[#282F3C] text-[10px] font-mono-num">
              <span className="text-[#2EE59D] font-bold">
                SUB MONO &lt; {xoHz} Hz
              </span>
              <span className="text-amber-300 font-bold">
                HARMONICS WIDE {widthPct}% &gt; {xoHz} Hz
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SubbassKnob
                compact
                muted={!enabled}
                label="CROSSOVER"
                value={fx.stereo.crossoverHz}
                defaultValue={crossoverHzToNorm(120)}
                accent="blue"
                formatValue={(v) => `${normToCrossoverHz(v)} Hz`}
                onChange={(crossoverHz) => updateModule('stereo', { crossoverHz })}
              />
              <SubbassKnob
                compact
                muted={!enabled}
                label="STEREO WIDTH"
                value={fx.stereo.width}
                defaultValue={0.35}
                accent="purple"
                formatValue={(v) => `${Math.round(v * 160)}%`}
                onChange={(width) => updateModule('stereo', { width })}
              />
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto synth-scroll px-2 sm:px-3 py-2 flex flex-col gap-2.5 max-w-[1600px] w-full mx-auto">
      {/* Top Row: FX Chain Presets + Dual Processing Blends (Clean Sub vs Harmonic Layer) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
        {/* FX Chain Preset Selector */}
        <div className="lg:col-span-5 rounded-md bg-[#191D24] border border-[#2E3543] overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#222731] border-b border-[#2E3543]">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#2EE59D] shrink-0" />
              <span className="font-display text-[11px] font-bold tracking-wider text-slate-100">
                FX CHAIN PRESETS
              </span>
            </div>
            <button
              type="button"
              onClick={() => onChangeFx(() => createDefaultSubbassFxConfig())}
              className="inline-flex items-center gap-1 px-2 h-6 rounded bg-[#141820] hover:bg-[#1E2430] border border-[#343C4C] text-[10.5px] font-semibold text-slate-200 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-[#2EE59D]" />
              <span>Reset FX</span>
            </button>
          </div>

          <div className="p-2.5 flex flex-col gap-1.5">
            <select
              aria-label="SUBBASS FX Chain Preset"
              value={activePreset.id}
              onChange={(e) => {
                const found = SUBBASS_FX_PRESETS.find((p) => p.id === e.target.value);
                if (found) onChangeFx(() => applySubbassFxPreset(found));
              }}
              className="h-8 px-2.5 rounded bg-[#0E1116] border border-[#2D3442] text-xs font-semibold text-[#2EE59D] focus:outline-none focus:border-[#2EE59D] cursor-pointer"
            >
              {SUBBASS_FX_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <p className="text-[10.5px] text-slate-400 leading-snug">
              {activePreset.description}
            </p>
          </div>
        </div>

        {/* Dual Parallel Signal Architecture: Section A (Clean Sub) & Section B (Harmonic Layer) */}
        <div className="lg:col-span-7 rounded-md bg-[#191D24] border border-[#2E3543] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#222731] border-b border-[#2E3543]">
            <span className="font-display text-[11px] font-bold tracking-wider text-slate-100">
              DUAL-PATH SUB ARCHITECTURE
            </span>
            <span className="text-[10px] font-mono-num text-cyan-300/85">
              Parallel Blend → Master Bus
            </span>
          </div>

          <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Section A: CLEAN SUB */}
            <div className="rounded bg-[#141820] border border-[#2EE59D]/35 p-2 flex items-center gap-2.5">
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-display text-[11px] font-bold text-[#2EE59D]">
                    A · CLEAN SUB
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeFx((prev) => ({
                        ...prev,
                        cleanSubEnabled: !prev.cleanSubEnabled,
                      }))
                    }
                    className={`px-2 h-5 rounded text-[9.5px] font-bold cursor-pointer border ${
                      fx.cleanSubEnabled
                        ? 'bg-[#2EE59D] text-slate-950 border-[#2EE59D]'
                        : 'bg-[#0E1116] text-slate-400 border-[#2D3442]'
                    }`}
                  >
                    {fx.cleanSubEnabled ? 'ON' : 'MUTED'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug">
                  Preserves pure sine &amp; triangle sub fundamental untouched by distortion.
                </p>
              </div>
              <SubbassKnob
                compact
                borderless
                muted={!fx.cleanSubEnabled}
                label="CLEAN"
                value={fx.cleanSubLevel}
                defaultValue={0.95}
                accent="mint"
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(cleanSubLevel) =>
                  onChangeFx((prev) => ({ ...prev, cleanSubLevel }))
                }
              />
            </div>

            {/* Section B: HARMONIC LAYER */}
            <div className="rounded bg-[#141820] border border-amber-500/35 p-2 flex items-center gap-2.5">
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-display text-[11px] font-bold text-amber-300">
                    B · HARMONIC LAYER
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeFx((prev) => ({
                        ...prev,
                        harmonicEnabled: !prev.harmonicEnabled,
                      }))
                    }
                    className={`px-2 h-5 rounded text-[9.5px] font-bold cursor-pointer border ${
                      fx.harmonicEnabled
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-[#0E1116] text-slate-400 border-[#2D3442]'
                    }`}
                  >
                    {fx.harmonicEnabled ? 'ON' : 'MUTED'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug">
                  Parallel saturation, diode clip &amp; waveshaping layer blended with sub.
                </p>
              </div>
              <SubbassKnob
                compact
                borderless
                muted={!fx.harmonicEnabled}
                label="HARMONIC"
                value={fx.harmonicLevel}
                defaultValue={0.38}
                accent="amber"
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(harmonicLevel) =>
                  onChangeFx((prev) => ({ ...prev, harmonicLevel }))
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* 9 Reorderable Effect Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 pb-2">
        {fx.order.map((id, idx) => {
          const meta = FX_META[id];
          const enabled = fx[id].enabled;
          const isHarmonic = meta.role === 'HARMONIC';
          return (
            <div
              key={id}
              className={`rounded-md border overflow-hidden flex flex-col transition-colors ${
                enabled
                  ? isHarmonic
                    ? 'bg-[#191D24] border-amber-500/45'
                    : 'bg-[#191D24] border-[#2EE59D]/45'
                  : 'bg-[#14171D] border-[#262C38]'
              } ${id === 'waveshaper' || id === 'compressor' ? 'md:col-span-2 xl:col-span-1' : ''}`}
            >
              {/* Module Header: Power Toggle, Title, Role & Reorder Controls */}
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#222731] border-b border-[#2E3543]">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    aria-pressed={enabled}
                    aria-label={`Toggle ${meta.title}`}
                    onClick={() => toggleModule(id)}
                    className={`w-7 h-7 rounded flex items-center justify-center border cursor-pointer shrink-0 transition-colors ${
                      enabled
                        ? isHarmonic
                          ? 'bg-amber-500 border-amber-300 text-slate-950'
                          : 'bg-[#2EE59D] border-[#2EE59D] text-slate-950'
                        : 'bg-[#141820] border-[#343C4C] text-slate-500 hover:text-slate-200'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono-num text-[10px] font-bold text-slate-400">
                        #{idx + 1}
                      </span>
                      <h2 className="font-display text-xs font-bold tracking-wider text-slate-100 truncate">
                        {meta.title}
                      </h2>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[9px] font-bold px-1.5 rounded ${
                          isHarmonic
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-[#2EE59D]/18 text-[#2EE59D]'
                        }`}
                      >
                        {meta.role}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">
                        {meta.subtitle}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Effect Reorder Buttons */}
                <div className="flex items-center gap-0.5 shrink-0 bg-[#0E1116] p-0.5 rounded border border-[#2D3442]">
                  <button
                    type="button"
                    disabled={idx === 0}
                    aria-label={`Move ${meta.title} Earlier`}
                    onClick={() => moveModule(id, -1)}
                    className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#1E2430] disabled:opacity-25 cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === fx.order.length - 1}
                    aria-label={`Move ${meta.title} Later`}
                    onClick={() => moveModule(id, 1)}
                    className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#1E2430] disabled:opacity-25 cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Module Controls */}
              <div className="p-2.5 flex-1 flex flex-col justify-center">
                {renderModuleControls(id)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
