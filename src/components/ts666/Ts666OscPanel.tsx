import React, { useMemo, useRef } from 'react';
import { SlidersHorizontal, Upload } from 'lucide-react';
import { useTs666TargetModOffsets } from '../../audio/ts666/ts666TelemetryStore';
import {
  TS666_MULTISAMPLES,
  TS666_NOISE_SAMPLES,
  TS666_SAMPLES,
  TS666_WARP_MODES,
  TS666_WAVETABLE_LIST,
  evaluateTs666Cycle,
  getWavetableFrames,
} from '../../audio/ts666/ts666Wavetables';
import type {
  Ts666LiveModOffsets,
  Ts666ModTarget,
  Ts666MultisampleId,
  Ts666NoiseConfig,
  Ts666NoiseSampleId,
  Ts666OscillatorConfig,
  Ts666SampleId,
  Ts666SubConfig,
  Ts666SubShape,
  Ts666SynthMode,
  Ts666WarpMode,
} from '../../types/ts666';
import { Ts666RotaryKnob } from './Ts666RotaryKnob';

interface Ts666OscPanelProps {
  osc: Ts666OscillatorConfig;
  modOffsets?: Ts666LiveModOffsets;
  onChangeOsc: (patch: Partial<Ts666OscillatorConfig>) => void;
  onLoadCustomSample: (file: File) => void;
  onOpenWavetableEditor: () => void;
}

const SYNTH_MODES: { id: Ts666SynthMode; label: string }[] = [
  { id: 'wavetable', label: 'WT' },
  { id: 'sample', label: 'SMP' },
  { id: 'multisample', label: 'MULTI' },
  { id: 'granular', label: 'GRAIN' },
  { id: 'spectral', label: 'SPEC' },
];

export const Ts666OscPanel: React.FC<Ts666OscPanelProps> = React.memo(({
  osc,
  modOffsets,
  onChangeOsc,
  onLoadCustomSample,
  onOpenWavetableEditor,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const prefix = osc.id === 'A' ? 'OSC_A' : osc.id === 'B' ? 'OSC_B' : 'OSC_C';
  const tgt = (suffix: string): Ts666ModTarget => `${prefix}_${suffix}` as Ts666ModTarget;

  const waveKeys = useMemo(
    () =>
      [
        `${prefix}_WT` as Ts666ModTarget,
        `${prefix}_WARP1` as Ts666ModTarget,
        `${prefix}_WARP2` as Ts666ModTarget,
      ] as const,
    [prefix]
  );
  const storeWaveMods = useTs666TargetModOffsets(waveKeys);
  const waveMods = modOffsets ?? storeWaveMods;

  const wavePath = useMemo(() => {
    const frames = getWavetableFrames(osc.wavetableId, osc.customWavetable);
    const liveWt = Math.max(0, Math.min(1, osc.wtPosition + (waveMods[waveKeys[0]] ?? 0)));
    const liveW1 = Math.max(0, Math.min(1, osc.warp1Amount + (waveMods[waveKeys[1]] ?? 0)));
    const liveW2 = Math.max(0, Math.min(1, osc.warp2Amount + (waveMods[waveKeys[2]] ?? 0)));
    const cycle = evaluateTs666Cycle(
      frames,
      liveWt,
      osc.warp1Mode,
      liveW1,
      osc.warp2Mode,
      liveW2,
      osc.phase,
      88
    );
    const W = 220;
    const H = 56;
    const pts: string[] = [];
    for (let i = 0; i < cycle.length; i++) {
      const x = (i / (cycle.length - 1)) * W;
      let yVal = cycle[i];
      if (osc.mode === 'spectral') {
        const smear = 1 - Math.min(0.7, osc.grainSize * 1.4);
        yVal = yVal * smear + Math.sin((i / cycle.length) * Math.PI * 2) * (1 - smear) * 0.5;
      }
      const y = H / 2 - yVal * (H * 0.4);
      pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [osc, waveMods, waveKeys]);

  const showGrainControls = osc.mode === 'granular' || osc.mode === 'spectral';

  const handleWaveScrub = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    e.preventDefault();
    const startX = e.clientX;
    const startWt = osc.wtPosition;
    const onMove = (ev: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      const dx = (ev.clientX - startX) / Math.max(40, rect.width);
      onChangeOsc({ wtPosition: Math.max(0, Math.min(1, startWt + dx)) });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <div
      className={`flex flex-col justify-between rounded border p-1 h-full min-h-0 min-w-0 overflow-hidden transition-colors ${
        osc.enabled
          ? 'bg-[#17100A] border-[#6B4829]'
          : 'bg-[#120C08] border-[#432C1A] opacity-75'
      }`}
    >
      {/* Header: Power + Name + 5 Mode Buttons + WT Edit */}
      <div className="flex items-center justify-between gap-1 mb-0.5 shrink-0 min-w-0">
        <div className="flex items-center gap-0.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onChangeOsc({ enabled: !osc.enabled })}
            style={{ touchAction: 'manipulation' }}
            className={`px-1 py-0.5 rounded text-[8px] font-display font-extrabold cursor-pointer whitespace-nowrap shrink-0 border ${
              osc.enabled
                ? 'bg-[#D97724] text-[#140B05] border-[#F4B073]'
                : 'bg-[#26180E] text-[#A98463] border-[#52351F]'
            }`}
          >
            OSC {osc.id}
          </button>

          <div className="flex items-center gap-[1px] bg-[#0C0704] p-[1px] rounded border border-[#472E1A] min-w-0 overflow-hidden">
            {SYNTH_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onChangeOsc({ mode: m.id })}
                className={`px-1 py-[1px] rounded text-[6.5px] font-mono-num font-bold cursor-pointer whitespace-nowrap ${
                  osc.mode === m.id
                    ? 'bg-[#DC2626]/30 text-[#FCA5A5] border border-[#EF4444]/70'
                    : 'text-[#A68464] hover:text-[#FFE7CE] border border-transparent'
                }`}
              >
                {m.id === 'multisample'
                  ? 'MLT'
                  : m.id === 'granular'
                  ? 'GRN'
                  : m.id === 'spectral'
                  ? 'SPC'
                  : m.label}
              </button>
            ))}
          </div>
        </div>

        {(osc.mode === 'wavetable' || osc.mode === 'spectral') && (
          <button
            type="button"
            onClick={onOpenWavetableEditor}
            title="Open Wavetable Editor"
            className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-[#24170E] hover:bg-[#332014] border border-[#6E492A] text-[7px] font-mono-num text-[#F2B880] cursor-pointer whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="w-2.5 h-2.5 text-[#EF4444]" />
            <span>EDIT</span>
          </button>
        )}
      </div>

      {/* Source Selector & Red Waveform Screen Side-by-Side (zero wasted vertical height) */}
      <div className="flex items-stretch gap-1 flex-1 min-h-[20px] mb-0.5 min-w-0">
        <div className="w-[46%] min-w-0 flex items-center gap-0.5">
          {osc.mode === 'wavetable' || osc.mode === 'spectral' ? (
            <select
              aria-label={`OSC ${osc.id} Wavetable`}
              value={osc.wavetableId}
              onChange={(e) => onChangeOsc({ wavetableId: e.target.value })}
              className="w-full h-full max-h-[24px] min-w-0 bg-[#0B0604] border border-[#543720] rounded px-1 text-[8px] font-mono-num text-[#F5D3B3] cursor-pointer"
            >
              {TS666_WAVETABLE_LIST.map((wt) => (
                <option key={wt.id} value={wt.id}>
                  {wt.name}
                </option>
              ))}
              {osc.customWavetable && (
                <option value="custom">Custom: {osc.customWavetable.name}</option>
              )}
            </select>
          ) : osc.mode === 'multisample' ? (
            <select
              aria-label={`OSC ${osc.id} Multisample`}
              value={osc.multisampleId}
              onChange={(e) =>
                onChangeOsc({ multisampleId: e.target.value as Ts666MultisampleId })
              }
              className="w-full h-full max-h-[24px] min-w-0 bg-[#0B0604] border border-[#543720] rounded px-1 text-[8px] font-mono-num text-[#F5D3B3] cursor-pointer"
            >
              {TS666_MULTISAMPLES.map((ms) => (
                <option key={ms.id} value={ms.id}>
                  {ms.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-0.5 w-full min-w-0">
              <select
                aria-label={`OSC ${osc.id} Sample`}
                value={osc.sampleId}
                onChange={(e) => onChangeOsc({ sampleId: e.target.value as Ts666SampleId })}
                className="flex-1 h-[22px] min-w-0 bg-[#0B0604] border border-[#543720] rounded px-1 text-[8px] font-mono-num text-[#F5D3B3] cursor-pointer"
              >
                {TS666_SAMPLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                {osc.customSampleName && (
                  <option value="custom">Custom: {osc.customSampleName}</option>
                )}
              </select>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Load Custom Sample (WAV / MP3 / OGG)"
                className="inline-flex items-center justify-center w-5 h-[22px] rounded bg-[#24170E] border border-[#6E492A] text-[#FCA5A5] cursor-pointer shrink-0"
              >
                <Upload className="w-2.5 h-2.5" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onLoadCustomSample(f);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 bg-[#070303] border border-[#6B231C] rounded overflow-hidden relative">
          <svg
            viewBox="0 0 220 56"
            preserveAspectRatio="none"
            onPointerDown={handleWaveScrub}
            style={{ touchAction: 'none' }}
            className="w-full h-full block cursor-ew-resize"
          >
            <line x1={0} y1={28} x2={220} y2={28} stroke="#2E1311" strokeWidth={0.8} />
            <path
              d={wavePath}
              fill="none"
              stroke={osc.enabled ? '#EF4444' : '#6B4837'}
              strokeWidth={1.8}
            />
            {osc.unison > 1 && osc.enabled && (
              <path
                d={wavePath}
                fill="none"
                stroke="rgba(248, 113, 113, 0.42)"
                strokeWidth={1}
                transform={`translate(${(osc.detune * 4).toFixed(1)}, 0)`}
              />
            )}
          </svg>
          <span className="pointer-events-none absolute top-0.5 right-1 font-mono-num text-[6.5px] text-[#F87171]/80">
            {osc.mode.slice(0, 4).toUpperCase()}
          </span>
        </div>

        {showGrainControls && (
          <div className="flex items-center gap-0.5 bg-[#110A06] border border-[#5A3B23] rounded px-0.5 shrink-0">
            <Ts666RotaryKnob
              label={osc.mode === 'granular' ? 'GRN' : 'SMR'}
              value={osc.grainSize}
              min={0.01}
              max={0.3}
              defaultValue={0.08}
              size="2xs"
              accent="red"
              modTarget={tgt('GRAIN_SIZE')}
              modOffset={modOffsets?.[tgt('GRAIN_SIZE')] ?? 0}
              formatValue={(v) => `${Math.round(v * 1000)}m`}
              onChange={(grainSize) => onChangeOsc({ grainSize })}
            />
            <Ts666RotaryKnob
              label="DNS"
              value={osc.density}
              min={0}
              max={1}
              defaultValue={0.45}
              size="2xs"
              accent="copper"
              modTarget={tgt('DENSITY')}
              modOffset={modOffsets?.[tgt('DENSITY')] ?? 0}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(density) => onChangeOsc({ density })}
            />
          </div>
        )}
      </div>

      {/* All 14 Required Oscillator Controls Directly Underneath */}
      <div className="grid grid-cols-7 gap-x-0.5 gap-y-0.5 items-start shrink-0">
        {/* Row 1: Tuning + Unison */}
        <Ts666RotaryKnob
          label="OCT"
          value={osc.octave}
          min={-4}
          max={4}
          step={1}
          defaultValue={0}
          bipolar
          size="xs"
          accent="bronze"
          modTarget={tgt('OCT')}
          modOffset={modOffsets?.[tgt('OCT')] ?? 0}
          formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}`}
          onChange={(octave) => onChangeOsc({ octave })}
        />
        <Ts666RotaryKnob
          label="SEMI"
          value={osc.semitone}
          min={-12}
          max={12}
          step={1}
          defaultValue={0}
          bipolar
          size="xs"
          accent="bronze"
          modTarget={tgt('SEMI')}
          modOffset={modOffsets?.[tgt('SEMI')] ?? 0}
          formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}`}
          onChange={(semitone) => onChangeOsc({ semitone })}
        />
        <Ts666RotaryKnob
          label="FINE"
          value={osc.fine}
          min={-100}
          max={100}
          step={1}
          defaultValue={0}
          bipolar
          size="xs"
          accent="bronze"
          modTarget={tgt('FINE')}
          modOffset={modOffsets?.[tgt('FINE')] ?? 0}
          formatValue={(v) => `${Math.round(v)}c`}
          onChange={(fine) => onChangeOsc({ fine })}
        />
        <Ts666RotaryKnob
          label="CRSE"
          value={osc.coarse}
          min={-64}
          max={64}
          step={1}
          defaultValue={0}
          bipolar
          size="xs"
          accent="bronze"
          modTarget={tgt('COARSE')}
          modOffset={modOffsets?.[tgt('COARSE')] ?? 0}
          onChange={(coarse) => onChangeOsc({ coarse })}
        />
        <Ts666RotaryKnob
          label="UNIS"
          value={osc.unison}
          min={1}
          max={8}
          step={1}
          defaultValue={1}
          size="xs"
          accent="copper"
          modTarget={tgt('UNISON')}
          modOffset={modOffsets?.[tgt('UNISON')] ?? 0}
          onChange={(unison) => onChangeOsc({ unison })}
        />
        <Ts666RotaryKnob
          label="DET"
          value={osc.detune}
          min={0}
          max={1}
          defaultValue={0.14}
          size="xs"
          accent="copper"
          modTarget={tgt('DETUNE')}
          modOffset={modOffsets?.[tgt('DETUNE')] ?? 0}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(detune) => onChangeOsc({ detune })}
        />
        <Ts666RotaryKnob
          label="BLND"
          value={osc.blend}
          min={0}
          max={1}
          defaultValue={0.5}
          size="xs"
          accent="copper"
          modTarget={tgt('BLEND')}
          modOffset={modOffsets?.[tgt('BLEND')] ?? 0}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(blend) => onChangeOsc({ blend })}
        />

        {/* Row 2: WT Pos, Phase, Random, Warp 1, Warp 2, Pan, Level */}
        <Ts666RotaryKnob
          label="WT POS"
          value={osc.wtPosition}
          min={0}
          max={1}
          defaultValue={0}
          size="xs"
          accent="red"
          modTarget={tgt('WT')}
          modOffset={modOffsets?.[tgt('WT')] ?? 0}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(wtPosition) => onChangeOsc({ wtPosition })}
        />
        <Ts666RotaryKnob
          label="PHS"
          value={osc.phase}
          min={0}
          max={360}
          step={1}
          defaultValue={0}
          size="xs"
          accent="bronze"
          modTarget={tgt('PHASE')}
          modOffset={modOffsets?.[tgt('PHASE')] ?? 0}
          formatValue={(v) => `${Math.round(v)}°`}
          onChange={(phase) => onChangeOsc({ phase })}
        />
        <Ts666RotaryKnob
          label="RND"
          value={osc.random}
          min={0}
          max={1}
          defaultValue={0}
          size="xs"
          accent="bronze"
          modTarget={tgt('RANDOM')}
          modOffset={modOffsets?.[tgt('RANDOM')] ?? 0}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(random) => onChangeOsc({ random })}
        />
        <div className="flex flex-col items-center min-w-0 w-full gap-0.5">
          <Ts666RotaryKnob
            label="WRP1"
            value={osc.warp1Amount}
            min={0}
            max={1}
            defaultValue={0}
            size="2xs"
            accent="red"
            modTarget={tgt('WARP1')}
            modOffset={modOffsets?.[tgt('WARP1')] ?? 0}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(warp1Amount) => onChangeOsc({ warp1Amount })}
          />
          <select
            aria-label={`OSC ${osc.id} Warp 1 Mode`}
            value={osc.warp1Mode}
            onChange={(e) => onChangeOsc({ warp1Mode: e.target.value as Ts666WarpMode })}
            className="w-full h-[14px] bg-[#0A0503] border border-[#4E321D] rounded text-[6.5px] leading-none font-mono-num text-[#FCA5A5] px-0.5 cursor-pointer"
          >
            {TS666_WARP_MODES.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col items-center min-w-0 w-full gap-0.5">
          <Ts666RotaryKnob
            label="WRP2"
            value={osc.warp2Amount}
            min={0}
            max={1}
            defaultValue={0}
            size="2xs"
            accent="red"
            modTarget={tgt('WARP2')}
            modOffset={modOffsets?.[tgt('WARP2')] ?? 0}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(warp2Amount) => onChangeOsc({ warp2Amount })}
          />
          <select
            aria-label={`OSC ${osc.id} Warp 2 Mode`}
            value={osc.warp2Mode}
            onChange={(e) => onChangeOsc({ warp2Mode: e.target.value as Ts666WarpMode })}
            className="w-full h-[14px] bg-[#0A0503] border border-[#4E321D] rounded text-[6.5px] leading-none font-mono-num text-[#FCA5A5] px-0.5 cursor-pointer"
          >
            {TS666_WARP_MODES.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
        <Ts666RotaryKnob
          label="PAN"
          value={osc.pan}
          min={-1}
          max={1}
          defaultValue={0}
          bipolar
          size="xs"
          accent="bronze"
          modTarget={tgt('PAN')}
          modOffset={modOffsets?.[tgt('PAN')] ?? 0}
          formatValue={(v) =>
            Math.abs(v) < 0.03 ? 'C' : v < 0 ? `L${Math.round(-v * 50)}` : `R${Math.round(v * 50)}`
          }
          onChange={(pan) => onChangeOsc({ pan })}
        />
        <Ts666RotaryKnob
          label="LVL"
          value={osc.level}
          min={0}
          max={1}
          defaultValue={0.85}
          size="xs"
          accent="copper"
          modTarget={tgt('LEVEL')}
          modOffset={modOffsets?.[tgt('LEVEL')] ?? 0}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(level) => onChangeOsc({ level })}
        />
      </div>
    </div>
  );
});

const SUB_SHAPES: { id: Ts666SubShape; label: string }[] = [
  { id: 'sine', label: 'SINE' },
  { id: 'triangle', label: 'TRI' },
  { id: 'sawtooth', label: 'SAW' },
  { id: 'square', label: 'SQR' },
  { id: 'sub_pulse', label: 'PULSE' },
];

export interface Ts666SubPanelProps {
  sub: Ts666SubConfig;
  modOffsets?: Ts666LiveModOffsets;
  onChangeSub: (patch: Partial<Ts666SubConfig>) => void;
}

export const Ts666SubPanel: React.FC<Ts666SubPanelProps> = React.memo(({
  sub,
  modOffsets,
  onChangeSub,
}) => {
  return (
    <div
      className={`rounded border p-1.5 h-full flex flex-col justify-between min-h-0 min-w-0 overflow-hidden transition-colors ${
        sub.enabled
          ? 'bg-[#17100A] border-[#6B4829]'
          : 'bg-[#120C08] border-[#432C1A] opacity-80'
      }`}
    >
      <div className="flex items-center justify-between gap-1 shrink-0 min-w-0">
        <button
          type="button"
          onClick={() => onChangeSub({ enabled: !sub.enabled })}
          className={`px-1.5 py-0.5 rounded text-[8.5px] font-display font-extrabold cursor-pointer border shrink-0 ${
            sub.enabled
              ? 'bg-[#D97724] text-[#140B05] border-[#F4B073]'
              : 'bg-[#26180E] text-[#A98463] border-[#52351F]'
          }`}
        >
          SUB
        </button>
        <select
          aria-label="Sub Waveform"
          value={sub.shape}
          onChange={(e) => onChangeSub({ shape: e.target.value as Ts666SubShape })}
          className="flex-1 min-w-0 bg-[#0B0604] border border-[#543720] rounded px-1 py-0.5 text-[8.5px] font-mono-num text-[#F5D3B3] cursor-pointer"
        >
          {SUB_SHAPES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onChangeSub({ directOut: !sub.directOut })}
          className={`px-1.5 py-0.5 rounded text-[7.5px] font-mono-num font-bold cursor-pointer border shrink-0 ${
            sub.directOut
              ? 'bg-[#DC2626]/25 text-[#FCA5A5] border-[#EF4444]'
              : 'bg-[#0C0704] text-[#A68464] border-[#472E1A]'
          }`}
        >
          DIR
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 items-center my-auto shrink-0">
        <Ts666RotaryKnob
          label="OCT"
          value={sub.octave}
          min={-3}
          max={2}
          step={1}
          defaultValue={-1}
          bipolar
          size="xs"
          accent="bronze"
          modTarget="SUB_OCTAVE"
          modOffset={modOffsets?.SUB_OCTAVE ?? 0}
          onChange={(octave) => onChangeSub({ octave })}
        />
        <Ts666RotaryKnob
          label="PAN"
          value={sub.pan}
          min={-1}
          max={1}
          defaultValue={0}
          bipolar
          size="xs"
          accent="bronze"
          modTarget="SUB_PAN"
          modOffset={modOffsets?.SUB_PAN ?? 0}
          onChange={(pan) => onChangeSub({ pan })}
        />
        <Ts666RotaryKnob
          label="LEVEL"
          value={sub.level}
          min={0}
          max={1}
          defaultValue={0.7}
          size="xs"
          accent="copper"
          modTarget="SUB_LEVEL"
          modOffset={modOffsets?.SUB_LEVEL ?? 0}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(level) => onChangeSub({ level })}
        />
      </div>
    </div>
  );
});

export interface Ts666NoisePanelProps {
  noise: Ts666NoiseConfig;
  modOffsets?: Ts666LiveModOffsets;
  onChangeNoise: (patch: Partial<Ts666NoiseConfig>) => void;
  onLoadCustomNoise: (file: File) => void;
}

export const Ts666NoisePanel: React.FC<Ts666NoisePanelProps> = React.memo(({
  noise,
  modOffsets,
  onChangeNoise,
  onLoadCustomNoise,
}) => {
  const noiseFileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      className={`rounded border p-1.5 h-full flex flex-col justify-between gap-1 min-h-0 min-w-0 overflow-hidden transition-colors ${
        noise.enabled
          ? 'bg-[#17100A] border-[#6B4829]'
          : 'bg-[#120C08] border-[#432C1A] opacity-80'
      }`}
    >
      <div className="flex items-center justify-between gap-1 shrink-0 min-w-0">
        <button
          type="button"
          onClick={() => onChangeNoise({ enabled: !noise.enabled })}
          className={`px-1.5 py-0.5 rounded text-[8.5px] font-display font-extrabold cursor-pointer shrink-0 border ${
            noise.enabled
              ? 'bg-[#D97724] text-[#140B05] border-[#F4B073]'
              : 'bg-[#26180E] text-[#A98463] border-[#52351F]'
          }`}
        >
          NOISE
        </button>
        <select
          aria-label="Noise Sample"
          value={noise.sampleId}
          onChange={(e) => onChangeNoise({ sampleId: e.target.value as Ts666NoiseSampleId })}
          className="flex-1 min-w-0 bg-[#0B0604] border border-[#543720] rounded px-1 py-0.5 text-[8.5px] font-mono-num text-[#F5D3B3] cursor-pointer"
        >
          {TS666_NOISE_SAMPLES.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
          {noise.customSampleName && (
            <option value="custom">Custom: {noise.customSampleName}</option>
          )}
        </select>
        <button
          type="button"
          onClick={() => noiseFileRef.current?.click()}
          title="Load Custom Noise Audio"
          className="px-1.5 py-0.5 rounded bg-[#24170E] border border-[#6E492A] text-[8px] text-[#FCA5A5] cursor-pointer shrink-0"
        >
          <Upload className="w-2.5 h-2.5" />
        </button>
        <input
          ref={noiseFileRef}
          type="file"
          accept="audio/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onLoadCustomNoise(f);
            e.target.value = '';
          }}
          className="hidden"
        />
      </div>

      <div className="flex items-center justify-between gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => onChangeNoise({ keyboardTracking: !noise.keyboardTracking })}
          className={`flex-1 h-[15px] leading-none rounded text-[7px] font-mono-num font-bold cursor-pointer border ${
            noise.keyboardTracking
              ? 'bg-[#DC2626]/25 text-[#FCA5A5] border-[#EF4444]'
              : 'bg-[#0C0704] text-[#9A7858] border-[#422B1A]'
          }`}
        >
          KBD
        </button>
        <button
          type="button"
          onClick={() => onChangeNoise({ oneShot: !noise.oneShot })}
          className={`flex-1 h-[15px] leading-none rounded text-[7px] font-mono-num font-bold cursor-pointer border ${
            noise.oneShot
              ? 'bg-[#D97724]/25 text-[#F6DFC4] border-[#E08A3C]'
              : 'bg-[#0C0704] text-[#9A7858] border-[#422B1A]'
          }`}
        >
          1SH
        </button>
        <button
          type="button"
          onClick={() => onChangeNoise({ directOut: !noise.directOut })}
          className={`flex-1 h-[15px] leading-none rounded text-[7px] font-mono-num font-bold cursor-pointer border ${
            noise.directOut
              ? 'bg-[#DC2626]/25 text-[#FCA5A5] border-[#EF4444]'
              : 'bg-[#0C0704] text-[#9A7858] border-[#422B1A]'
          }`}
        >
          DIR
        </button>
        <button
          type="button"
          onClick={() =>
            onChangeNoise({
              phaseRandomization: noise.phaseRandomization > 0 ? 0 : 1,
            })
          }
          className={`flex-1 h-[15px] leading-none rounded text-[7px] font-mono-num font-bold cursor-pointer border ${
            noise.phaseRandomization > 0
              ? 'bg-[#D97724]/25 text-[#F6DFC4] border-[#E08A3C]'
              : 'bg-[#0C0704] text-[#9A7858] border-[#422B1A]'
          }`}
        >
          RND
        </button>
      </div>

      <div className="grid grid-cols-4 gap-0.5 items-center my-auto shrink-0">
        <Ts666RotaryKnob
          label="PITCH"
          value={noise.pitch}
          min={0}
          max={1}
          defaultValue={0.5}
          size="xs"
          accent="copper"
          modTarget="NOISE_PITCH"
          modOffset={modOffsets?.NOISE_PITCH ?? 0}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(pitch) => onChangeNoise({ pitch })}
        />
        <Ts666RotaryKnob
          label="PHS"
          value={noise.phase}
          min={0}
          max={360}
          defaultValue={0}
          size="xs"
          accent="bronze"
          modTarget="NOISE_PHASE"
          modOffset={modOffsets?.NOISE_PHASE ?? 0}
          formatValue={(v) => `${Math.round(v)}°`}
          onChange={(phase) => onChangeNoise({ phase })}
        />
        <Ts666RotaryKnob
          label="PAN"
          value={noise.pan}
          min={-1}
          max={1}
          defaultValue={0}
          bipolar
          size="xs"
          accent="bronze"
          modTarget="NOISE_PAN"
          modOffset={modOffsets?.NOISE_PAN ?? 0}
          onChange={(pan) => onChangeNoise({ pan })}
        />
        <Ts666RotaryKnob
          label="LVL"
          value={noise.level}
          min={0}
          max={1}
          defaultValue={0.25}
          size="xs"
          accent="red"
          modTarget="NOISE_LEVEL"
          modOffset={modOffsets?.NOISE_LEVEL ?? 0}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(level) => onChangeNoise({ level })}
        />
      </div>
    </div>
  );
});

interface Ts666SubNoiseBarProps {
  sub: Ts666SubConfig;
  noise: Ts666NoiseConfig;
  modOffsets?: Ts666LiveModOffsets;
  onChangeSub: (patch: Partial<Ts666SubConfig>) => void;
  onChangeNoise: (patch: Partial<Ts666NoiseConfig>) => void;
  onLoadCustomNoise: (file: File) => void;
}

export const Ts666SubNoisePanel: React.FC<Ts666SubNoiseBarProps> = React.memo(({
  sub,
  noise,
  modOffsets,
  onChangeSub,
  onChangeNoise,
  onLoadCustomNoise,
}) => {
  return (
    <div className="grid grid-rows-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-1 h-full min-h-0 min-w-0 overflow-hidden">
      <Ts666SubPanel sub={sub} modOffsets={modOffsets} onChangeSub={onChangeSub} />
      <Ts666NoisePanel
        noise={noise}
        modOffsets={modOffsets}
        onChangeNoise={onChangeNoise}
        onLoadCustomNoise={onLoadCustomNoise}
      />
    </div>
  );
});
