import React, { useEffect, useState } from 'react';
import { Power } from 'lucide-react';
import { SYNC_DIVISIONS } from '../../audio/bassRemixPresets';
import { subscribeBassRemixTelemetry } from '../../audio/bassRemixTelemetryStore';
import type {
  BassRemixDistortionMode,
  BassRemixFilterType,
  BassRemixOttConfig,
  BassRemixSyncDivision,
  BassRemixTransformConfig,
  BassRemixVolumeConfig,
  BassRemixWaveshapeMode,
  BassRemixWobbleConfig,
  BassRemixWobbleWaveform,
} from '../../types/bassRemix';
import { BassRemixKnob } from './BassRemixKnob';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const db = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}dB`;
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)}k` : `${Math.round(v)}Hz`);
const ms = (v: number) => `${Math.round(v)}ms`;

const WAVEFORMS: { id: BassRemixWobbleWaveform; label: string }[] = [
  { id: 'sine', label: 'SIN' },
  { id: 'triangle', label: 'TRI' },
  { id: 'square', label: 'SQR' },
  { id: 'saw', label: 'SAW' },
];

const FILTER_TYPES: { id: BassRemixFilterType; label: string }[] = [
  { id: 'lp12', label: 'LP12' },
  { id: 'lp24', label: 'LP24' },
  { id: 'bp', label: 'BP' },
  { id: 'notch', label: 'NTCH' },
  { id: 'formant', label: 'FORM' },
];

export const BassRemixTransformStrip: React.FC<{
  transform: BassRemixTransformConfig;
  effectMix: number;
  onChangeTransform: (patch: Partial<BassRemixTransformConfig>) => void;
  onChangeEffectMix: (mix: number) => void;
}> = React.memo(({ transform, effectMix, onChangeTransform, onChangeEffectMix }) => {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg border border-[#5B3A22] bg-[#160E09] overflow-x-auto synth-scroll shrink-0">
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-display text-[10px] font-bold tracking-wider text-[#E08A3C] whitespace-nowrap">
          DUBSTEP TRANSFORM
        </span>

        <div className="flex items-center gap-1 bg-[#0D0704] p-0.5 rounded border border-[#462B19]">
          <select
            aria-label="Distortion Mode"
            value={transform.distortionMode}
            onChange={(e) =>
              onChangeTransform({ distortionMode: e.target.value as BassRemixDistortionMode })
            }
            className="h-6 px-1 rounded bg-[#140B06] border border-[#4A2E1B] text-[9.5px] font-display font-bold text-[#FCA5A5] uppercase cursor-pointer"
          >
            <option value="soft">Soft</option>
            <option value="hard">Hard</option>
            <option value="fold">Fold</option>
            <option value="crush">Crush</option>
          </select>
          <select
            aria-label="Waveshaper Mode"
            value={transform.waveshapeMode}
            onChange={(e) =>
              onChangeTransform({ waveshapeMode: e.target.value as BassRemixWaveshapeMode })
            }
            className="h-6 px-1 rounded bg-[#140B06] border border-[#4A2E1B] text-[9.5px] font-display font-bold text-[#E08A3C] uppercase cursor-pointer"
          >
            <option value="asym">Asym WS</option>
            <option value="rectify">Rectify</option>
            <option value="fmfold">FM Fold</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
        <BassRemixKnob
          label="DIST"
          value={transform.distortionDrive}
          min={0}
          max={1}
          defaultValue={0.4}
          size="xs"
          accent="red"
          formatValue={pct}
          onChange={(v) => onChangeTransform({ distortionDrive: v })}
        />
        <BassRemixKnob
          label="SAT"
          value={transform.saturation}
          min={0}
          max={1}
          defaultValue={0.35}
          size="xs"
          accent="copper"
          formatValue={pct}
          onChange={(v) => onChangeTransform({ saturation: v })}
        />
        <BassRemixKnob
          label="SHAPE"
          value={transform.waveshapeAmount}
          min={0}
          max={1}
          defaultValue={0.4}
          size="xs"
          accent="red"
          formatValue={pct}
          onChange={(v) => onChangeTransform({ waveshapeAmount: v })}
        />
        <BassRemixKnob
          label="HARM"
          value={transform.harmonicEnhance}
          min={0}
          max={1}
          defaultValue={0.45}
          size="xs"
          accent="amber"
          formatValue={pct}
          onChange={(v) => onChangeTransform({ harmonicEnhance: v })}
        />
        <BassRemixKnob
          label="WIDTH"
          value={transform.stereoWidth}
          min={0}
          max={2}
          defaultValue={1.2}
          size="xs"
          accent="bronze"
          formatValue={pct}
          onChange={(v) => onChangeTransform({ stereoWidth: v })}
        />
        <BassRemixKnob
          label="SUB MONO"
          value={transform.subMonoHz}
          min={40}
          max={240}
          step={1}
          defaultValue={115}
          size="xs"
          accent="bronze"
          formatValue={hz}
          onChange={(v) => onChangeTransform({ subMonoHz: v })}
        />
        <BassRemixKnob
          label="FX MIX"
          value={effectMix}
          min={0}
          max={1}
          defaultValue={1}
          size="xs"
          accent="red"
          formatValue={pct}
          onChange={onChangeEffectMix}
        />
      </div>
    </div>
  );
});

export const BassRemixOttPanel: React.FC<{
  ott: BassRemixOttConfig;
  onChange: (patch: Partial<BassRemixOttConfig>) => void;
}> = React.memo(({ ott, onChange }) => {
  const [bands, setBands] = useState({ low: 1, mid: 1, high: 1 });

  useEffect(() => {
    return subscribeBassRemixTelemetry((t) => {
      setBands({ low: t.lowGr, mid: t.midGr, high: t.highGr });
    });
  }, []);

  const grBar = (label: string, mult: number) => {
    const dbVal = 20 * Math.log10(Math.max(0.1, mult));
    const norm = Math.max(0, Math.min(1, (dbVal + 14) / 28));
    return (
      <div className="flex items-center gap-1 flex-1">
        <span className="text-[8px] font-mono-num text-[#B79374] w-3">{label}</span>
        <div className="flex-1 h-1.5 rounded bg-[#080503] border border-[#3B2314] overflow-hidden relative">
          <div
            className="h-full bg-[#EF4444] transition-all duration-75"
            style={{ width: `${Math.round(norm * 100)}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col rounded-lg border border-[#5B3A22] bg-[#160E09] overflow-hidden h-full min-h-0">
      <div className="flex items-center justify-between gap-1 px-2 py-1 bg-[#22140C] border-b border-[#4A2E1B] shrink-0">
        <span className="font-display text-[10.5px] font-bold tracking-wider text-[#E08A3C]">
          OTT MULTIBAND
        </span>
        <button
          type="button"
          onClick={() => onChange({ bypass: !ott.bypass })}
          aria-pressed={!ott.bypass}
          style={{ touchAction: 'manipulation' }}
          className={`inline-flex items-center gap-1 px-1.5 h-6 rounded border text-[9px] font-display font-bold cursor-pointer ${
            !ott.bypass
              ? 'bg-[#DC2626]/25 border-[#EF4444] text-[#FCA5A5]'
              : 'bg-[#0F0905] border-[#4A2E1B] text-[#9A7455]'
          }`}
        >
          <Power className="w-2.5 h-2.5" />
          <span>{ott.bypass ? 'BYPASS' : 'ACTIVE'}</span>
        </button>
      </div>

      {/* Real-time 3-band gain action meters */}
      <div className="flex items-center gap-2 px-2 py-1 bg-[#120B07] border-b border-[#3B2314] shrink-0">
        {grBar('L', ott.bypass ? 1 : bands.low)}
        {grBar('M', ott.bypass ? 1 : bands.mid)}
        {grBar('H', ott.bypass ? 1 : bands.high)}
      </div>

      <div
        className={`grid grid-cols-4 gap-x-1 gap-y-1 p-1.5 flex-1 items-center justify-items-center ${
          ott.bypass ? 'opacity-45' : ''
        }`}
      >
        <BassRemixKnob
          label="AMOUNT"
          value={ott.amount}
          min={0}
          max={1}
          defaultValue={0.72}
          size="xs"
          accent="red"
          formatValue={pct}
          onChange={(v) => onChange({ amount: v })}
        />
        <BassRemixKnob
          label="DEPTH"
          value={ott.depth}
          min={0}
          max={1}
          defaultValue={0.78}
          size="xs"
          accent="copper"
          formatValue={pct}
          onChange={(v) => onChange({ depth: v })}
        />
        <BassRemixKnob
          label="TIME"
          value={ott.time}
          min={0.1}
          max={3.0}
          defaultValue={0.85}
          size="xs"
          accent="amber"
          formatValue={pct}
          onChange={(v) => onChange({ time: v })}
        />
        <BassRemixKnob
          label="UPWARD"
          value={ott.upward}
          min={0}
          max={1}
          defaultValue={0.72}
          size="xs"
          accent="red"
          formatValue={pct}
          onChange={(v) => onChange({ upward: v })}
        />
        <BassRemixKnob
          label="DOWN"
          value={ott.downward}
          min={0}
          max={1}
          defaultValue={0.74}
          size="xs"
          accent="copper"
          formatValue={pct}
          onChange={(v) => onChange({ downward: v })}
        />
        <BassRemixKnob
          label="IN GAIN"
          value={ott.inputGainDb}
          min={-18}
          max={24}
          step={0.5}
          bipolar
          defaultValue={0}
          size="xs"
          accent="bronze"
          formatValue={db}
          onChange={(v) => onChange({ inputGainDb: v })}
        />
        <BassRemixKnob
          label="OUT GAIN"
          value={ott.outputGainDb}
          min={-24}
          max={18}
          step={0.5}
          bipolar
          defaultValue={0}
          size="xs"
          accent="bronze"
          formatValue={db}
          onChange={(v) => onChange({ outputGainDb: v })}
        />
        <BassRemixKnob
          label="MIX"
          value={ott.mix}
          min={0}
          max={1}
          defaultValue={0.92}
          size="xs"
          accent="red"
          formatValue={pct}
          onChange={(v) => onChange({ mix: v })}
        />
      </div>
    </div>
  );
});

export const BassRemixWobblePanel: React.FC<{
  wobble: BassRemixWobbleConfig;
  bpm: number;
  onChange: (patch: Partial<BassRemixWobbleConfig>) => void;
}> = React.memo(({ wobble, bpm, onChange }) => {
  return (
    <div className="flex flex-col rounded-lg border border-[#5B3A22] bg-[#160E09] overflow-hidden h-full min-h-0">
      <div className="flex items-center justify-between gap-1 px-2 py-1 bg-[#22140C] border-b border-[#4A2E1B] shrink-0">
        <span className="font-display text-[10.5px] font-bold tracking-wider text-[#FCA5A5]">
          WOBBLE ENGINE
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange({ bpmSync: !wobble.bpmSync })}
            className={`px-1.5 h-6 rounded border text-[9px] font-mono-num font-bold cursor-pointer ${
              wobble.bpmSync
                ? 'bg-[#CD7F32]/25 border-[#E08A3C] text-[#FDE68A]'
                : 'bg-[#0F0905] border-[#4A2E1B] text-[#9A7455]'
            }`}
          >
            {wobble.bpmSync ? `SYNC ${bpm}` : 'HZ'}
          </button>
          <button
            type="button"
            onClick={() => onChange({ enabled: !wobble.enabled })}
            aria-pressed={wobble.enabled}
            style={{ touchAction: 'manipulation' }}
            className={`inline-flex items-center gap-1 px-1.5 h-6 rounded border text-[9px] font-display font-bold cursor-pointer ${
              wobble.enabled
                ? 'bg-[#DC2626]/25 border-[#EF4444] text-[#FCA5A5]'
                : 'bg-[#0F0905] border-[#4A2E1B] text-[#9A7455]'
            }`}
          >
            <Power className="w-2.5 h-2.5" />
            <span>{wobble.enabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Waveform & Filter Mode Selector Strip */}
      <div className="flex items-center justify-between gap-1 px-2 py-1 bg-[#120B07] border-b border-[#3B2314] shrink-0">
        <div className="flex items-center gap-0.5">
          {WAVEFORMS.map((wf) => (
            <button
              key={wf.id}
              type="button"
              onClick={() => onChange({ waveform: wf.id })}
              className={`px-1.5 h-5 rounded text-[8.5px] font-display font-bold cursor-pointer ${
                wobble.waveform === wf.id
                  ? 'bg-[#DC2626] text-white'
                  : 'bg-[#0D0704] text-[#B79374] hover:text-white'
              }`}
            >
              {wf.label}
            </button>
          ))}
        </div>
        <select
          aria-label="Wobble Filter Mode"
          value={wobble.filterType}
          onChange={(e) => onChange({ filterType: e.target.value as BassRemixFilterType })}
          className="h-5 px-1 rounded bg-[#0D0704] border border-[#4A2E1B] text-[9px] font-mono-num text-[#F6E2CE] cursor-pointer"
        >
          {FILTER_TYPES.map((ft) => (
            <option key={ft.id} value={ft.id}>
              {ft.label}
            </option>
          ))}
        </select>
      </div>

      <div
        className={`grid grid-cols-4 gap-x-1 gap-y-1 p-1.5 flex-1 items-center justify-items-center ${
          !wobble.enabled ? 'opacity-45' : ''
        }`}
      >
        {wobble.bpmSync ? (
          <div className="flex flex-col items-center justify-center">
            <select
              aria-label="Wobble Sync Division"
              value={wobble.syncDivision}
              onChange={(e) =>
                onChange({ syncDivision: e.target.value as BassRemixSyncDivision })
              }
              className="h-7 px-1 rounded bg-[#0D0704] border border-[#6B4427] font-mono-num text-[10px] font-bold text-[#FCA5A5] cursor-pointer"
            >
              {SYNC_DIVISIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <span className="text-[8.5px] font-semibold text-[#D7B899] mt-1">RATE</span>
          </div>
        ) : (
          <BassRemixKnob
            label="RATE"
            value={wobble.rateHz}
            min={0.1}
            max={24}
            logarithmic
            defaultValue={4.0}
            size="xs"
            accent="red"
            formatValue={(v) => `${v.toFixed(1)}Hz`}
            onChange={(v) => onChange({ rateHz: v })}
          />
        )}
        <BassRemixKnob
          label="DEPTH"
          value={wobble.depth}
          min={0}
          max={1}
          defaultValue={0.78}
          size="xs"
          accent="red"
          formatValue={pct}
          onChange={(v) => onChange({ depth: v })}
        />
        <BassRemixKnob
          label="CUTOFF"
          value={wobble.cutoffHz}
          min={30}
          max={16000}
          logarithmic
          defaultValue={320}
          size="xs"
          accent="copper"
          formatValue={hz}
          onChange={(v) => onChange({ cutoffHz: v })}
        />
        <BassRemixKnob
          label="RESO"
          value={wobble.resonance}
          min={0.5}
          max={18}
          defaultValue={6.0}
          size="xs"
          accent="amber"
          formatValue={(v) => v.toFixed(1)}
          onChange={(v) => onChange({ resonance: v })}
        />
        <BassRemixKnob
          label="DRIVE"
          value={wobble.drive}
          min={0}
          max={1}
          defaultValue={0.45}
          size="xs"
          accent="red"
          formatValue={pct}
          onChange={(v) => onChange({ drive: v })}
        />
        <BassRemixKnob
          label="STEREO"
          value={wobble.stereoMod}
          min={0}
          max={1}
          defaultValue={0.35}
          size="xs"
          accent="copper"
          formatValue={pct}
          onChange={(v) => onChange({ stereoMod: v })}
        />
        <BassRemixKnob
          label="MIX"
          value={wobble.mix}
          min={0}
          max={1}
          defaultValue={1.0}
          size="xs"
          accent="bronze"
          formatValue={pct}
          onChange={(v) => onChange({ mix: v })}
        />
      </div>
    </div>
  );
});

export const BassRemixVolumePanel: React.FC<{
  volume: BassRemixVolumeConfig;
  bpm: number;
  onChange: (patch: Partial<BassRemixVolumeConfig>) => void;
}> = React.memo(({ volume, bpm, onChange }) => {
  return (
    <div className="flex flex-col rounded-lg border border-[#5B3A22] bg-[#160E09] overflow-hidden h-full min-h-0">
      <div className="flex items-center justify-between gap-1 px-2 py-1 bg-[#22140C] border-b border-[#4A2E1B] shrink-0">
        <span className="font-display text-[10.5px] font-bold tracking-wider text-[#E08A3C]">
          VOLUME & PUMP
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange({ bpmSync: !volume.bpmSync })}
            className={`px-1.5 h-6 rounded border text-[9px] font-mono-num font-bold cursor-pointer ${
              volume.bpmSync
                ? 'bg-[#CD7F32]/25 border-[#E08A3C] text-[#FDE68A]'
                : 'bg-[#0F0905] border-[#4A2E1B] text-[#9A7455]'
            }`}
          >
            {volume.bpmSync ? `SYNC ${bpm}` : 'HZ'}
          </button>
          <button
            type="button"
            onClick={() => onChange({ lfoEnabled: !volume.lfoEnabled })}
            aria-pressed={volume.lfoEnabled}
            style={{ touchAction: 'manipulation' }}
            className={`inline-flex items-center gap-1 px-1.5 h-6 rounded border text-[9px] font-display font-bold cursor-pointer ${
              volume.lfoEnabled
                ? 'bg-[#DC2626]/25 border-[#EF4444] text-[#FCA5A5]'
                : 'bg-[#0F0905] border-[#4A2E1B] text-[#9A7455]'
            }`}
          >
            <Power className="w-2.5 h-2.5" />
            <span>LFO</span>
          </button>
        </div>
      </div>

      {/* LFO Shape + Sync Division */}
      <div className="flex items-center justify-between gap-1 px-2 py-1 bg-[#120B07] border-b border-[#3B2314] shrink-0">
        <div className="flex items-center gap-0.5">
          {WAVEFORMS.map((wf) => (
            <button
              key={wf.id}
              type="button"
              onClick={() => onChange({ lfoWaveform: wf.id })}
              className={`px-1.5 h-5 rounded text-[8.5px] font-display font-bold cursor-pointer ${
                volume.lfoWaveform === wf.id
                  ? 'bg-[#E08A3C] text-black'
                  : 'bg-[#0D0704] text-[#B79374] hover:text-white'
              }`}
            >
              {wf.label}
            </button>
          ))}
        </div>

        {volume.bpmSync && (
          <select
            aria-label="Volume Pump Division"
            value={volume.syncDivision}
            onChange={(e) =>
              onChange({ syncDivision: e.target.value as BassRemixSyncDivision })
            }
            className="h-5 px-1 rounded bg-[#0D0704] border border-[#4A2E1B] font-mono-num text-[9px] text-[#FDE68A] cursor-pointer"
          >
            {SYNC_DIVISIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-4 gap-x-1 gap-y-1 p-1.5 flex-1 items-center justify-items-center">
        <BassRemixKnob
          label="VOLUME"
          value={volume.volume}
          min={0}
          max={1.5}
          defaultValue={1.0}
          size="xs"
          accent="copper"
          formatValue={pct}
          onChange={(v) => onChange({ volume: v })}
        />
        <BassRemixKnob
          label="GAIN"
          value={volume.gainDb}
          min={-18}
          max={24}
          step={0.5}
          bipolar
          defaultValue={0}
          size="xs"
          accent="bronze"
          formatValue={db}
          onChange={(v) => onChange({ gainDb: v })}
        />
        <BassRemixKnob
          label="PUMP"
          value={volume.sidechainPump}
          min={0}
          max={1}
          defaultValue={0.45}
          size="xs"
          accent="red"
          formatValue={pct}
          onChange={(v) => onChange({ sidechainPump: v })}
        />
        <BassRemixKnob
          label="DEPTH"
          value={volume.depth}
          min={0}
          max={1}
          defaultValue={0.55}
          size="xs"
          accent="red"
          formatValue={pct}
          onChange={(v) => onChange({ depth: v })}
        />
        <BassRemixKnob
          label="ATTACK"
          value={volume.attackMs}
          min={1}
          max={250}
          step={1}
          defaultValue={6}
          size="xs"
          accent="amber"
          formatValue={ms}
          onChange={(v) => onChange({ attackMs: v })}
        />
        <BassRemixKnob
          label="RELEASE"
          value={volume.releaseMs}
          min={10}
          max={800}
          step={1}
          defaultValue={110}
          size="xs"
          accent="amber"
          formatValue={ms}
          onChange={(v) => onChange({ releaseMs: v })}
        />
        {!volume.bpmSync ? (
          <BassRemixKnob
            label="LFO HZ"
            value={volume.rateHz}
            min={0.2}
            max={16}
            logarithmic
            defaultValue={2.0}
            size="xs"
            accent="copper"
            formatValue={(v) => `${v.toFixed(1)}Hz`}
            onChange={(v) => onChange({ rateHz: v })}
          />
        ) : (
          <div className="flex flex-col items-center justify-center">
            <span className="font-mono-num text-[10px] font-bold text-[#E08A3C]">
              {volume.syncDivision}
            </span>
            <span className="text-[8.5px] text-[#B79374]">SYNC</span>
          </div>
        )}
        <BassRemixKnob
          label="MIX"
          value={volume.mix}
          min={0}
          max={1}
          defaultValue={0.85}
          size="xs"
          accent="bronze"
          formatValue={pct}
          onChange={(v) => onChange({ mix: v })}
        />
      </div>
    </div>
  );
});
