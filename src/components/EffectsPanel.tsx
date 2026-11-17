import React from 'react';
import {
  CABINET_TYPES,
  TREMOLO_SYNC_DIVISIONS,
  TREMOLO_WAVEFORMS,
} from '../audio/cabinetAndTremolo';
import { useModTelemetry } from '../audio/transportStore';
import { divisionToHz } from '../audio/wavetables';
import type {
  CabinetConfig,
  DistortionConfig,
  EffectsConfig,
  LfoSyncDivision,
  LiveModOffsets,
  TremoloConfig,
} from '../types/synth';
import { RotaryKnob } from './RotaryKnob';
import { ToggleSwitch } from './ToggleSwitch';

interface EffectsPanelProps {
  effects: EffectsConfig;
  bpm?: number;
  modOffsets?: LiveModOffsets;
  onChangeEffects: (patch: Partial<EffectsConfig>) => void;
}

const DEFAULT_CABINET: CabinetConfig = {
  enabled: false,
  cabinetType: '1x15_bass',
  size: 0.55,
  micPosition: 0.35,
  micDistance: 0.25,
  roomAmount: 0.2,
  mix: 0.85,
  outputGain: 1.0,
};

const DEFAULT_TREMOLO: TremoloConfig = {
  enabled: false,
  rate: 4.0,
  depth: 0.65,
  waveform: 'sine',
  stereoPhase: 90,
  sync: false,
  division: '1/8',
  mix: 1.0,
};

const DISTORTION_MODES: { id: DistortionConfig['mode']; label: string }[] = [
  { id: 'tube', label: 'Tube' },
  { id: 'hard', label: 'Hard' },
  { id: 'fold', label: 'Fold' },
  { id: 'bitcrush', label: 'Bit' },
];

export const EffectsPanel: React.FC<EffectsPanelProps> = React.memo(({
  effects,
  bpm = 124,
  modOffsets: modOffsetsProp,
  onChangeEffects,
}) => {
  const { modOffsets: storeModOffsets } = useModTelemetry();
  const modOffsets = modOffsetsProp ?? storeModOffsets;
  const {
    distortion,
    hyperDimension,
    phaser,
    flanger,
    chorus,
    delay,
    reverb,
    eq,
    compressor,
  } = effects;
  const cabinet = effects.cabinet ?? DEFAULT_CABINET;
  const tremolo = effects.tremolo ?? DEFAULT_TREMOLO;

  return (
    <div className="h-full overflow-x-auto synth-scroll pb-1">
      <div className="flex gap-2.5 lg:gap-3 h-full min-w-max">
        {/* 01. Multiband / Tube / Fold / Bit Distortion */}
        <section
          className={`w-[215px] flex flex-col justify-between rounded-xl border p-2.5 lg:p-3 transition-colors shrink-0 ${
            distortion.enabled
              ? 'bg-[#191D24] border-[#2E3543]'
              : 'bg-[#13161C] border-[#232833] opacity-80'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <ToggleSwitch
                checked={distortion.enabled}
                onChange={(enabled) =>
                  onChangeEffects({ distortion: { ...distortion, enabled } })
                }
                label="Distortion"
                accent="amber"
                compact
              />
              <span className="font-mono-num text-[10px] text-slate-500">01</span>
            </div>

            <div className="flex items-center gap-0.5 bg-[#0E1116] p-0.5 rounded-md border border-[#2E3543]">
              {DISTORTION_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={!distortion.enabled}
                  onClick={() =>
                    onChangeEffects({ distortion: { ...distortion, mode: m.id } })
                  }
                  className={`flex-1 py-1 text-[10px] font-medium rounded cursor-pointer transition-colors ${
                    distortion.mode === m.id
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 pt-2 border-t border-[#262C38]">
            <RotaryKnob
              label="Drive"
              size="sm"
              accent="amber"
              value={distortion.drive}
              min={0}
              max={1}
              defaultValue={0.25}
              disabled={!distortion.enabled}
              modOffset={modOffsets.FX_DIST_DRIVE ?? 0}
              modTarget="FX_DIST_DRIVE"
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(drive) =>
                onChangeEffects({ distortion: { ...distortion, drive } })
              }
            />
            <RotaryKnob
              label="Tone"
              size="sm"
              value={distortion.tone}
              min={400}
              max={16000}
              logarithmic
              defaultValue={7500}
              disabled={!distortion.enabled}
              formatValue={(v) =>
                v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`
              }
              onChange={(tone) =>
                onChangeEffects({ distortion: { ...distortion, tone } })
              }
            />
            <RotaryKnob
              label="Mix"
              size="sm"
              value={distortion.mix}
              min={0}
              max={1}
              defaultValue={0.4}
              disabled={!distortion.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(mix) =>
                onChangeEffects({ distortion: { ...distortion, mix } })
              }
            />
          </div>
        </section>

        {/* 02. Hyper & Dimension */}
        <section
          className={`w-[205px] flex flex-col justify-between rounded-xl border p-2.5 lg:p-3 transition-colors shrink-0 ${
            hyperDimension.enabled
              ? 'bg-[#191D24] border-[#2E3543]'
              : 'bg-[#13161C] border-[#232833] opacity-80'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <ToggleSwitch
              checked={hyperDimension.enabled}
              onChange={(enabled) =>
                onChangeEffects({
                  hyperDimension: { ...hyperDimension, enabled },
                })
              }
              label="Hyper / Dim"
              compact
            />
            <span className="font-mono-num text-[10px] text-slate-500">02</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-[#262C38]">
            <RotaryKnob
              label="Hyper Mix"
              size="sm"
              value={hyperDimension.unisonMix}
              min={0}
              max={1}
              defaultValue={0.3}
              disabled={!hyperDimension.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(unisonMix) =>
                onChangeEffects({
                  hyperDimension: { ...hyperDimension, unisonMix },
                })
              }
            />
            <RotaryKnob
              label="Detune"
              size="sm"
              value={hyperDimension.detune}
              min={0}
              max={1}
              defaultValue={0.35}
              disabled={!hyperDimension.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(detune) =>
                onChangeEffects({
                  hyperDimension: { ...hyperDimension, detune },
                })
              }
            />
            <RotaryKnob
              label="Dim Size"
              size="sm"
              accent="amber"
              value={hyperDimension.dimSize}
              min={0}
              max={1}
              defaultValue={0.4}
              disabled={!hyperDimension.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(dimSize) =>
                onChangeEffects({
                  hyperDimension: { ...hyperDimension, dimSize },
                })
              }
            />
            <RotaryKnob
              label="Dim Mix"
              size="sm"
              accent="amber"
              value={hyperDimension.dimMix}
              min={0}
              max={1}
              defaultValue={0.35}
              disabled={!hyperDimension.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(dimMix) =>
                onChangeEffects({
                  hyperDimension: { ...hyperDimension, dimMix },
                })
              }
            />
          </div>
        </section>

        {/* 03. Phaser */}
        <section
          className={`w-[205px] flex flex-col justify-between rounded-xl border p-2.5 lg:p-3 transition-colors shrink-0 ${
            phaser.enabled
              ? 'bg-[#191D24] border-[#2E3543]'
              : 'bg-[#13161C] border-[#232833] opacity-80'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <ToggleSwitch
              checked={phaser.enabled}
              onChange={(enabled) =>
                onChangeEffects({ phaser: { ...phaser, enabled } })
              }
              label="Phaser"
              compact
            />
            <span className="font-mono-num text-[10px] text-slate-500">03</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-[#262C38]">
            <RotaryKnob
              label="Rate"
              size="sm"
              value={phaser.rate}
              min={0.05}
              max={6}
              logarithmic
              defaultValue={0.7}
              disabled={!phaser.enabled}
              formatValue={(v) => `${v.toFixed(2)}Hz`}
              onChange={(rate) =>
                onChangeEffects({ phaser: { ...phaser, rate } })
              }
            />
            <RotaryKnob
              label="Depth"
              size="sm"
              value={phaser.depth}
              min={0}
              max={1}
              defaultValue={0.55}
              disabled={!phaser.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(depth) =>
                onChangeEffects({ phaser: { ...phaser, depth } })
              }
            />
            <RotaryKnob
              label="Feedback"
              size="sm"
              accent="amber"
              value={phaser.feedback}
              min={0}
              max={0.85}
              defaultValue={0.45}
              disabled={!phaser.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(feedback) =>
                onChangeEffects({ phaser: { ...phaser, feedback } })
              }
            />
            <RotaryKnob
              label="Mix"
              size="sm"
              value={phaser.mix}
              min={0}
              max={1}
              defaultValue={0.4}
              disabled={!phaser.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(mix) =>
                onChangeEffects({ phaser: { ...phaser, mix } })
              }
            />
          </div>
        </section>

        {/* 04. Flanger */}
        <section
          className={`w-[205px] flex flex-col justify-between rounded-xl border p-2.5 lg:p-3 transition-colors shrink-0 ${
            flanger.enabled
              ? 'bg-[#191D24] border-[#2E3543]'
              : 'bg-[#13161C] border-[#232833] opacity-80'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <ToggleSwitch
              checked={flanger.enabled}
              onChange={(enabled) =>
                onChangeEffects({ flanger: { ...flanger, enabled } })
              }
              label="Flanger"
              compact
            />
            <span className="font-mono-num text-[10px] text-slate-500">04</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-[#262C38]">
            <RotaryKnob
              label="Rate"
              size="sm"
              value={flanger.rate}
              min={0.05}
              max={6}
              logarithmic
              defaultValue={0.5}
              disabled={!flanger.enabled}
              formatValue={(v) => `${v.toFixed(2)}Hz`}
              onChange={(rate) =>
                onChangeEffects({ flanger: { ...flanger, rate } })
              }
            />
            <RotaryKnob
              label="Depth"
              size="sm"
              value={flanger.depth}
              min={0}
              max={1}
              defaultValue={0.6}
              disabled={!flanger.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(depth) =>
                onChangeEffects({ flanger: { ...flanger, depth } })
              }
            />
            <RotaryKnob
              label="Feedback"
              size="sm"
              accent="amber"
              value={flanger.feedback}
              min={0}
              max={0.85}
              defaultValue={0.5}
              disabled={!flanger.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(feedback) =>
                onChangeEffects({ flanger: { ...flanger, feedback } })
              }
            />
            <RotaryKnob
              label="Mix"
              size="sm"
              value={flanger.mix}
              min={0}
              max={1}
              defaultValue={0.35}
              disabled={!flanger.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(mix) =>
                onChangeEffects({ flanger: { ...flanger, mix } })
              }
            />
          </div>
        </section>

        {/* 05. Chorus */}
        <section
          className={`w-[195px] flex flex-col justify-between rounded-xl border p-2.5 lg:p-3 transition-colors shrink-0 ${
            chorus.enabled
              ? 'bg-[#191D24] border-[#2E3543]'
              : 'bg-[#13161C] border-[#232833] opacity-80'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <ToggleSwitch
              checked={chorus.enabled}
              onChange={(enabled) =>
                onChangeEffects({ chorus: { ...chorus, enabled } })
              }
              label="Chorus"
              compact
            />
            <span className="font-mono-num text-[10px] text-slate-500">05</span>
          </div>

          <div className="grid grid-cols-3 gap-1 pt-2 border-t border-[#262C38]">
            <RotaryKnob
              label="Rate"
              size="sm"
              value={chorus.rate}
              min={0.1}
              max={5}
              logarithmic
              defaultValue={0.9}
              disabled={!chorus.enabled}
              formatValue={(v) => `${v.toFixed(1)}Hz`}
              onChange={(rate) =>
                onChangeEffects({ chorus: { ...chorus, rate } })
              }
            />
            <RotaryKnob
              label="Depth"
              size="sm"
              value={chorus.depth}
              min={0}
              max={1}
              defaultValue={0.45}
              disabled={!chorus.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(depth) =>
                onChangeEffects({ chorus: { ...chorus, depth } })
              }
            />
            <RotaryKnob
              label="Mix"
              size="sm"
              value={chorus.mix}
              min={0}
              max={1}
              defaultValue={0.35}
              disabled={!chorus.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(mix) =>
                onChangeEffects({ chorus: { ...chorus, mix } })
              }
            />
          </div>
        </section>

        {/* 06. Stereo Delay */}
        <section
          className={`w-[195px] flex flex-col justify-between rounded-xl border p-2.5 lg:p-3 transition-colors shrink-0 ${
            delay.enabled
              ? 'bg-[#191D24] border-[#2E3543]'
              : 'bg-[#13161C] border-[#232833] opacity-80'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <ToggleSwitch
              checked={delay.enabled}
              onChange={(enabled) =>
                onChangeEffects({ delay: { ...delay, enabled } })
              }
              label="Delay"
              compact
            />
            <span className="font-mono-num text-[10px] text-slate-500">06</span>
          </div>

          <div className="grid grid-cols-3 gap-1 pt-2 border-t border-[#262C38]">
            <RotaryKnob
              label="Time"
              size="sm"
              value={delay.time}
              min={0.04}
              max={1.0}
              logarithmic
              defaultValue={0.32}
              disabled={!delay.enabled}
              formatValue={(v) => `${Math.round(v * 1000)}ms`}
              onChange={(time) =>
                onChangeEffects({ delay: { ...delay, time } })
              }
            />
            <RotaryKnob
              label="Feedback"
              size="sm"
              accent="amber"
              value={delay.feedback}
              min={0}
              max={0.86}
              defaultValue={0.38}
              disabled={!delay.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(feedback) =>
                onChangeEffects({ delay: { ...delay, feedback } })
              }
            />
            <RotaryKnob
              label="Mix"
              size="sm"
              value={delay.mix}
              min={0}
              max={1}
              defaultValue={0.28}
              disabled={!delay.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(mix) =>
                onChangeEffects({ delay: { ...delay, mix } })
              }
            />
          </div>
        </section>

        {/* 07. Reverb */}
        <section
          className={`w-[195px] flex flex-col justify-between rounded-xl border p-2.5 lg:p-3 transition-colors shrink-0 ${
            reverb.enabled
              ? 'bg-[#191D24] border-[#2E3543]'
              : 'bg-[#13161C] border-[#232833] opacity-80'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <ToggleSwitch
              checked={reverb.enabled}
              onChange={(enabled) =>
                onChangeEffects({ reverb: { ...reverb, enabled } })
              }
              label="Reverb"
              compact
            />
            <span className="font-mono-num text-[10px] text-slate-500">07</span>
          </div>

          <div className="grid grid-cols-3 gap-1 pt-2 border-t border-[#262C38]">
            <RotaryKnob
              label="Size"
              size="sm"
              value={reverb.size}
              min={0.1}
              max={1}
              defaultValue={0.45}
              disabled={!reverb.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(size) =>
                onChangeEffects({ reverb: { ...reverb, size } })
              }
            />
            <RotaryKnob
              label="Damp"
              size="sm"
              value={reverb.damping}
              min={0}
              max={0.95}
              defaultValue={0.45}
              disabled={!reverb.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(damping) =>
                onChangeEffects({ reverb: { ...reverb, damping } })
              }
            />
            <RotaryKnob
              label="Mix"
              size="sm"
              value={reverb.mix}
              min={0}
              max={1}
              defaultValue={0.22}
              disabled={!reverb.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(mix) =>
                onChangeEffects({ reverb: { ...reverb, mix } })
              }
            />
          </div>
        </section>

        {/* 08. 3-Band EQ */}
        <section
          className={`w-[205px] flex flex-col justify-between rounded-xl border p-2.5 lg:p-3 transition-colors shrink-0 ${
            eq.enabled
              ? 'bg-[#191D24] border-[#2E3543]'
              : 'bg-[#13161C] border-[#232833] opacity-80'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <ToggleSwitch
              checked={eq.enabled}
              onChange={(enabled) =>
                onChangeEffects({ eq: { ...eq, enabled } })
              }
              label="EQ 3-Band"
              compact
            />
            <span className="font-mono-num text-[10px] text-slate-500">08</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-[#262C38]">
            <RotaryKnob
              label="Low"
              size="sm"
              value={eq.lowGain}
              min={-12}
              max={12}
              step={0.5}
              defaultValue={0}
              bipolar
              disabled={!eq.enabled}
              formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`}
              onChange={(lowGain) =>
                onChangeEffects({ eq: { ...eq, lowGain } })
              }
            />
            <RotaryKnob
              label="Mid Hz"
              size="sm"
              value={eq.midFreq}
              min={200}
              max={5000}
              logarithmic
              defaultValue={1100}
              disabled={!eq.enabled}
              formatValue={(v) =>
                v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`
              }
              onChange={(midFreq) =>
                onChangeEffects({ eq: { ...eq, midFreq } })
              }
            />
            <RotaryKnob
              label="Mid"
              size="sm"
              accent="amber"
              value={eq.midGain}
              min={-12}
              max={12}
              step={0.5}
              defaultValue={0}
              bipolar
              disabled={!eq.enabled}
              formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`}
              onChange={(midGain) =>
                onChangeEffects({ eq: { ...eq, midGain } })
              }
            />
            <RotaryKnob
              label="High"
              size="sm"
              value={eq.highGain}
              min={-12}
              max={12}
              step={0.5}
              defaultValue={0}
              bipolar
              disabled={!eq.enabled}
              formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`}
              onChange={(highGain) =>
                onChangeEffects({ eq: { ...eq, highGain } })
              }
            />
          </div>
        </section>

        {/* 09. Compressor + Multiband OTT */}
        <section
          className={`w-[225px] flex flex-col justify-between rounded-xl border p-2.5 lg:p-3 transition-colors shrink-0 ${
            compressor.enabled
              ? 'bg-[#191D24] border-[#2E3543]'
              : 'bg-[#13161C] border-[#232833] opacity-80'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <ToggleSwitch
              checked={compressor.enabled}
              onChange={(enabled) =>
                onChangeEffects({ compressor: { ...compressor, enabled } })
              }
              label="Compressor"
              accent="amber"
              compact
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!compressor.enabled}
                onClick={() =>
                  onChangeEffects({
                    compressor: {
                      ...compressor,
                      multiband: !compressor.multiband,
                    },
                  })
                }
                className={`px-2 py-0.5 rounded text-[10px] font-display font-bold border cursor-pointer transition-colors ${
                  compressor.multiband
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                    : 'bg-[#0B0E14] border-[#242E40] text-slate-400'
                }`}
                title="Enable 3-band OTT multiband compression"
              >
                OTT
              </button>
              <span className="font-mono-num text-[10px] text-slate-500">09</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 pt-2 border-t border-[#262C38]">
            <RotaryKnob
              label="Thresh"
              size="sm"
              accent="amber"
              value={compressor.threshold}
              min={-50}
              max={0}
              step={1}
              defaultValue={-16}
              disabled={!compressor.enabled}
              formatValue={(v) => `${Math.round(v)}dB`}
              onChange={(threshold) =>
                onChangeEffects({ compressor: { ...compressor, threshold } })
              }
            />
            <RotaryKnob
              label="Ratio"
              size="sm"
              value={compressor.ratio}
              min={1}
              max={20}
              step={0.5}
              defaultValue={3.5}
              disabled={!compressor.enabled}
              formatValue={(v) => `${v.toFixed(1)}:1`}
              onChange={(ratio) =>
                onChangeEffects({ compressor: { ...compressor, ratio } })
              }
            />
            <RotaryKnob
              label="Gain"
              size="sm"
              accent="amber"
              value={compressor.makeup}
              min={0}
              max={14}
              step={0.5}
              defaultValue={2}
              disabled={!compressor.enabled}
              formatValue={(v) => `+${v.toFixed(1)}`}
              onChange={(makeup) =>
                onChangeEffects({ compressor: { ...compressor, makeup } })
              }
            />
            <RotaryKnob
              label="Attack"
              size="sm"
              value={compressor.attack}
              min={0.001}
              max={0.2}
              logarithmic
              defaultValue={0.01}
              disabled={!compressor.enabled}
              formatValue={(v) => `${Math.round(v * 1000)}ms`}
              onChange={(attack) =>
                onChangeEffects({ compressor: { ...compressor, attack } })
              }
            />
            <RotaryKnob
              label="Release"
              size="sm"
              value={compressor.release}
              min={0.02}
              max={1}
              logarithmic
              defaultValue={0.18}
              disabled={!compressor.enabled}
              formatValue={(v) => `${Math.round(v * 1000)}ms`}
              onChange={(release) =>
                onChangeEffects({ compressor: { ...compressor, release } })
              }
            />
          </div>
        </section>

        {/* 10. Cabinet Simulator */}
        <section
          className={`w-[255px] flex flex-col justify-between rounded-xl border p-2.5 lg:p-3 transition-colors shrink-0 ${
            cabinet.enabled
              ? 'bg-[#191D24] border-[#2E3543]'
              : 'bg-[#13161C] border-[#232833] opacity-80'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <ToggleSwitch
                checked={cabinet.enabled}
                onChange={(enabled) =>
                  onChangeEffects({ cabinet: { ...cabinet, enabled } })
                }
                label="Cabinet Sim"
                accent="amber"
                compact
              />
              <span className="font-mono-num text-[10px] text-slate-500">10</span>
            </div>

            <div className="flex items-center gap-0.5 bg-[#0E1116] p-0.5 rounded-md border border-[#2E3543]">
              {CABINET_TYPES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={!cabinet.enabled}
                  title={c.label}
                  onClick={() =>
                    onChangeEffects({ cabinet: { ...cabinet, cabinetType: c.id } })
                  }
                  className={`flex-1 py-1 text-[10px] font-medium rounded cursor-pointer transition-colors ${
                    cabinet.cabinetType === c.id
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {c.shortLabel}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 pt-2 border-t border-[#262C38]">
            <RotaryKnob
              label="Size"
              size="sm"
              accent="amber"
              value={cabinet.size}
              min={0}
              max={1}
              defaultValue={0.55}
              disabled={!cabinet.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(size) =>
                onChangeEffects({ cabinet: { ...cabinet, size } })
              }
            />
            <RotaryKnob
              label="Mic Pos"
              size="sm"
              value={cabinet.micPosition}
              min={0}
              max={1}
              defaultValue={0.35}
              disabled={!cabinet.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(micPosition) =>
                onChangeEffects({ cabinet: { ...cabinet, micPosition } })
              }
            />
            <RotaryKnob
              label="Mic Dist"
              size="sm"
              value={cabinet.micDistance}
              min={0}
              max={1}
              defaultValue={0.25}
              disabled={!cabinet.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(micDistance) =>
                onChangeEffects({ cabinet: { ...cabinet, micDistance } })
              }
            />
            <RotaryKnob
              label="Room"
              size="sm"
              value={cabinet.roomAmount}
              min={0}
              max={1}
              defaultValue={0.2}
              disabled={!cabinet.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(roomAmount) =>
                onChangeEffects({ cabinet: { ...cabinet, roomAmount } })
              }
            />
            <RotaryKnob
              label="Mix"
              size="sm"
              value={cabinet.mix}
              min={0}
              max={1}
              defaultValue={0.85}
              disabled={!cabinet.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(mix) =>
                onChangeEffects({ cabinet: { ...cabinet, mix } })
              }
            />
            <RotaryKnob
              label="Out Gain"
              size="sm"
              accent="amber"
              value={cabinet.outputGain}
              min={0.3}
              max={1.6}
              defaultValue={1.0}
              disabled={!cabinet.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(outputGain) =>
                onChangeEffects({ cabinet: { ...cabinet, outputGain } })
              }
            />
          </div>
        </section>

        {/* 11. Stereo Tremolo */}
        <section
          className={`w-[240px] flex flex-col justify-between rounded-xl border p-2.5 lg:p-3 transition-colors shrink-0 ${
            tremolo.enabled
              ? 'bg-[#191D24] border-[#2E3543]'
              : 'bg-[#13161C] border-[#232833] opacity-80'
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <ToggleSwitch
                checked={tremolo.enabled}
                onChange={(enabled) =>
                  onChangeEffects({ tremolo: { ...tremolo, enabled } })
                }
                label="Tremolo"
                compact
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!tremolo.enabled}
                  onClick={() =>
                    onChangeEffects({
                      tremolo: { ...tremolo, sync: !tremolo.sync },
                    })
                  }
                  className={`px-1.5 py-0.5 rounded text-[10px] font-display font-bold border cursor-pointer transition-colors ${
                    tremolo.sync
                      ? 'bg-[#2EE59D]/15 border-[#2EE59D]/55 text-[#2EE59D]'
                      : 'bg-[#0B0E14] border-[#242E40] text-slate-400'
                  }`}
                  title="Sync tremolo rate to project BPM"
                >
                  BPM
                </button>
                <span className="font-mono-num text-[10px] text-slate-500">11</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <div className="flex-1 flex items-center gap-0.5 bg-[#0E1116] p-0.5 rounded-md border border-[#2E3543]">
                {TREMOLO_WAVEFORMS.map((wf) => (
                  <button
                    key={wf.id}
                    type="button"
                    disabled={!tremolo.enabled}
                    onClick={() =>
                      onChangeEffects({ tremolo: { ...tremolo, waveform: wf.id } })
                    }
                    className={`flex-1 py-1 text-[10px] font-medium rounded cursor-pointer transition-colors ${
                      tremolo.waveform === wf.id
                        ? 'bg-[#2EE59D]/20 text-[#2EE59D] border border-[#2EE59D]/45'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {wf.label}
                  </button>
                ))}
              </div>
              {tremolo.sync && (
                <select
                  aria-label="Tremolo BPM Division"
                  disabled={!tremolo.enabled}
                  value={tremolo.division}
                  onChange={(e) =>
                    onChangeEffects({
                      tremolo: {
                        ...tremolo,
                        division: e.target.value as LfoSyncDivision,
                      },
                    })
                  }
                  className="h-6 px-1 rounded bg-[#0E1116] border border-[#2E3543] text-[10px] font-mono-num text-[#2EE59D] focus:outline-none cursor-pointer"
                >
                  {TREMOLO_SYNC_DIVISIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-[#262C38]">
            <RotaryKnob
              label={tremolo.sync ? `Sync (${tremolo.division})` : 'Rate'}
              size="sm"
              value={tremolo.sync ? divisionToHz(tremolo.division, bpm) : tremolo.rate}
              min={0.1}
              max={20}
              logarithmic
              defaultValue={4.0}
              disabled={!tremolo.enabled || tremolo.sync}
              formatValue={(v) => `${v.toFixed(1)}Hz`}
              onChange={(rate) =>
                onChangeEffects({ tremolo: { ...tremolo, rate } })
              }
            />
            <RotaryKnob
              label="Depth"
              size="sm"
              value={tremolo.depth}
              min={0}
              max={1}
              defaultValue={0.65}
              disabled={!tremolo.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(depth) =>
                onChangeEffects({ tremolo: { ...tremolo, depth } })
              }
            />
            <RotaryKnob
              label="Phase"
              size="sm"
              accent="amber"
              value={tremolo.stereoPhase}
              min={0}
              max={180}
              step={5}
              defaultValue={90}
              disabled={!tremolo.enabled}
              formatValue={(v) => `${Math.round(v)}°`}
              onChange={(stereoPhase) =>
                onChangeEffects({ tremolo: { ...tremolo, stereoPhase } })
              }
            />
            <RotaryKnob
              label="Mix"
              size="sm"
              value={tremolo.mix}
              min={0}
              max={1}
              defaultValue={1.0}
              disabled={!tremolo.enabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(mix) =>
                onChangeEffects({ tremolo: { ...tremolo, mix } })
              }
            />
          </div>
        </section>
      </div>
    </div>
  );
});
