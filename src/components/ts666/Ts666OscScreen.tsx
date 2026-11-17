import React, { useState } from 'react';
import { GripVertical } from 'lucide-react';
import type {
  Ts666ArpConfig,
  Ts666ClipSequencerConfig,
  Ts666ClipStep,
  Ts666EnvelopeConfig,
  Ts666FilterConfig,
  Ts666FilterRoutingMode,
  Ts666LfoConfig,
  Ts666LiveModOffsets,
  Ts666MacroConfig,
  Ts666ModSource,
  Ts666ModTarget,
  Ts666NoiseConfig,
  Ts666OscillatorConfig,
  Ts666Patch,
  Ts666PerformanceConfig,
  Ts666SubConfig,
} from '../../types/ts666';
import { Ts666ArpSeqPanel } from './Ts666ArpSeqPanel';
import { Ts666DualFilterPanel } from './Ts666DualFilterPanel';
import { Ts666EnvEditor } from './Ts666EnvEditor';
import { Ts666LfoEditor } from './Ts666LfoEditor';
import { useTs666ModDrag } from './Ts666ModContext';
import { Ts666OscPanel, Ts666SubNoisePanel } from './Ts666OscPanel';
import { Ts666RotaryKnob } from './Ts666RotaryKnob';

interface Ts666OscScreenProps {
  patch: Ts666Patch;
  modOffsets: Ts666LiveModOffsets;
  lfoPhases: number[];
  envValues: [number, number, number, number];
  activeArpStep: number;
  activeClipStep: number;
  onChangeOsc: (idx: 0 | 1 | 2, sub: Partial<Ts666OscillatorConfig>) => void;
  onChangeSub: (sub: Partial<Ts666SubConfig>) => void;
  onChangeNoise: (sub: Partial<Ts666NoiseConfig>) => void;
  onChangeFilter: (idx: 0 | 1, sub: Partial<Ts666FilterConfig>) => void;
  onChangeFilterRouting: (mode: Ts666FilterRoutingMode) => void;
  onToggleFilterLink: () => void;
  onChangeEnv: (idx: 0 | 1 | 2 | 3, sub: Partial<Ts666EnvelopeConfig>) => void;
  onChangeLfo: (idx: number, sub: Partial<Ts666LfoConfig>) => void;
  onChangeArp: (sub: Partial<Ts666ArpConfig>) => void;
  onChangeClipSeq: (sub: Partial<Ts666ClipSequencerConfig>) => void;
  onUpdateClipStep: (idx: number, sub: Partial<Ts666ClipStep>) => void;
  onChangeMacro: (idx: number, sub: Partial<Ts666MacroConfig>) => void;
  onChangePerformance: (sub: Partial<Ts666PerformanceConfig>) => void;
  onAssignMod: (src: Ts666ModSource, target: Ts666ModTarget) => void;
  onLoadCustomSample: (oscId: 'A' | 'B' | 'C', file: File) => void;
  onLoadCustomNoise: (file: File) => void;
  onOpenWavetableEditor: (oscIdx: 0 | 1 | 2) => void;
}

export const Ts666OscScreen: React.FC<Ts666OscScreenProps> = ({
  patch,
  modOffsets,
  lfoPhases,
  envValues,
  activeArpStep,
  activeClipStep,
  onChangeOsc,
  onChangeSub,
  onChangeNoise,
  onChangeFilter,
  onChangeFilterRouting,
  onToggleFilterLink,
  onChangeEnv,
  onChangeLfo,
  onChangeArp,
  onChangeClipSeq,
  onUpdateClipStep,
  onChangeMacro,
  onChangePerformance,
  onAssignMod,
  onLoadCustomSample,
  onLoadCustomNoise,
  onOpenWavetableEditor,
}) => {
  const { startDrag } = useTs666ModDrag();
  const [secondaryOscIdx, setSecondaryOscIdx] = useState<1 | 2>(1);
  const [selectedEnvIdx, setSelectedEnvIdx] = useState<0 | 1 | 2 | 3>(0);
  const [selectedLfoIdx, setSelectedLfoIdx] = useState<number>(0);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-1.5 p-1.5 overflow-y-auto synth-scroll bg-[#0C0F15]">
      {/* TOP ROW: OSC A + (OSC B / OSC C switcher + quick all-3 toggle) + DUAL FILTER */}
      <div className="grid grid-cols-12 gap-1.5 shrink-0">
        <div className="col-span-12 lg:col-span-4 min-h-0">
          <Ts666OscPanel
            osc={patch.oscillators[0]}
            modOffsets={modOffsets}
            onChangeOsc={(sub) => onChangeOsc(0, sub)}
            onLoadCustomSample={(f) => onLoadCustomSample('A', f)}
            onOpenWavetableEditor={() => onOpenWavetableEditor(0)}
          />
        </div>

        <div className="col-span-12 lg:col-span-4 min-h-0 flex flex-col">
          {/* Instant OSC B / OSC C Slot Header */}
          <div className="flex items-center justify-between gap-1 mb-0.5 px-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSecondaryOscIdx(1)}
                className={`px-2 py-0.5 rounded text-[9.5px] font-display font-bold cursor-pointer ${
                  secondaryOscIdx === 1
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/60'
                    : 'bg-[#121620] text-slate-400 border border-[#222A3A]'
                }`}
              >
                VIEW OSC B {patch.oscillators[1].enabled ? '●' : '○'}
              </button>
              <button
                type="button"
                onClick={() => setSecondaryOscIdx(2)}
                className={`px-2 py-0.5 rounded text-[9.5px] font-display font-bold cursor-pointer ${
                  secondaryOscIdx === 2
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/60'
                    : 'bg-[#121620] text-slate-400 border border-[#222A3A]'
                }`}
              >
                VIEW OSC C {patch.oscillators[2].enabled ? '●' : '○'}
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                onChangeOsc(secondaryOscIdx, {
                  enabled: !patch.oscillators[secondaryOscIdx].enabled,
                })
              }
              className="text-[9px] font-mono-num text-cyan-300 hover:underline cursor-pointer"
            >
              Toggle OSC {secondaryOscIdx === 1 ? 'B' : 'C'}
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Ts666OscPanel
              osc={patch.oscillators[secondaryOscIdx]}
              modOffsets={modOffsets}
              onChangeOsc={(sub) => onChangeOsc(secondaryOscIdx, sub)}
              onLoadCustomSample={(f) =>
                onLoadCustomSample(secondaryOscIdx === 1 ? 'B' : 'C', f)
              }
              onOpenWavetableEditor={() => onOpenWavetableEditor(secondaryOscIdx)}
            />
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 min-h-0">
          <Ts666DualFilterPanel
            filters={patch.filters}
            filterRouting={patch.filterRouting}
            filterLink={patch.filterLink}
            modOffsets={modOffsets}
            onChangeFilter={onChangeFilter}
            onChangeRouting={onChangeFilterRouting}
            onToggleLink={onToggleFilterLink}
          />
        </div>
      </div>

      {/* MIDDLE ROW: ENV 1..4 | LFO 1..10 | SUB + NOISE + ARP/CLIP */}
      <div className="grid grid-cols-12 gap-1.5 flex-1 min-h-[190px]">
        <div className="col-span-12 md:col-span-4 min-h-0">
          <Ts666EnvEditor
            envelopes={patch.envelopes}
            selectedEnvIdx={selectedEnvIdx}
            liveEnvValues={envValues}
            onSelectEnv={setSelectedEnvIdx}
            onChangeEnv={onChangeEnv}
            onAssignMod={onAssignMod}
          />
        </div>

        <div className="col-span-12 md:col-span-4 min-h-0">
          <Ts666LfoEditor
            lfos={patch.lfos}
            selectedLfoIdx={selectedLfoIdx}
            livePhases={lfoPhases}
            onSelectLfo={setSelectedLfoIdx}
            onChangeLfo={onChangeLfo}
            onAssignMod={onAssignMod}
          />
        </div>

        <div className="col-span-12 md:col-span-4 min-h-0 flex flex-col gap-1.5">
          <Ts666SubNoisePanel
            sub={patch.sub}
            noise={patch.noise}
            modOffsets={modOffsets}
            onChangeSub={onChangeSub}
            onChangeNoise={onChangeNoise}
            onLoadCustomNoise={onLoadCustomNoise}
          />
          <div className="flex-1 min-h-0">
            <Ts666ArpSeqPanel
              arp={patch.arp}
              clipSeq={patch.clipSeq}
              activeArpStep={activeArpStep}
              activeClipStep={activeClipStep}
              onChangeArp={onChangeArp}
              onChangeClipSeq={onChangeClipSeq}
              onUpdateClipStep={onUpdateClipStep}
            />
          </div>
        </div>
      </div>

      {/* BOTTOM STRIP: 8 MACROS (M1..M8) + PERFORMANCE CONTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#131720] border border-[#252D3D] rounded-md px-2 py-1 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto synth-scroll">
          {patch.macros.map((m, idx) => {
            const src = (`MACRO${m.id}`) as Ts666ModSource;
            return (
              <div
                key={m.id}
                className="flex flex-col items-center bg-[#0D1118] border border-[#222A3A] rounded px-1.5 py-0.5 shrink-0"
              >
                <div className="flex items-center gap-0.5 mb-0.5">
                  <button
                    type="button"
                    title={`Drag M${m.id} onto any knob`}
                    onPointerDown={(e) => startDrag(src, e, onAssignMod)}
                    style={{ touchAction: 'none' }}
                    className="inline-flex items-center text-[8px] font-mono-num text-amber-300 cursor-grab"
                  >
                    <GripVertical className="w-2.5 h-2.5" />
                  </button>
                  <input
                    aria-label={`Macro ${m.id} Name`}
                    type="text"
                    value={m.name}
                    onChange={(e) => onChangeMacro(idx, { name: e.target.value })}
                    className="w-12 bg-transparent text-[8px] font-mono-num text-slate-300 text-center focus:outline-none focus:text-cyan-200 truncate"
                  />
                </div>
                <Ts666RotaryKnob
                  label={`M${m.id}`}
                  value={m.value}
                  min={0}
                  max={1}
                  defaultValue={0}
                  accent="amber"
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  onChange={(value) => onChangeMacro(idx, { value })}
                />
              </div>
            );
          })}
        </div>

        {/* Performance Strip: Portamento Time/Curve, Pitch Bend Up/Down, Master Vol */}
        <div className="flex items-center gap-2 bg-[#0D1118] border border-[#222A3A] rounded px-2 py-0.5 shrink-0">
          <Ts666RotaryKnob
            label="PORTA"
            value={patch.performance.portamentoTimeMs}
            min={0}
            max={1000}
            step={5}
            defaultValue={0}
            accent="cyan"
            formatValue={(v) => `${Math.round(v)}ms`}
            onChange={(portamentoTimeMs) => onChangePerformance({ portamentoTimeMs })}
          />
          <Ts666RotaryKnob
            label="P.CRV"
            value={patch.performance.portamentoCurve}
            min={-1}
            max={1}
            defaultValue={0}
            bipolar
            accent="cyan"
            onChange={(portamentoCurve) => onChangePerformance({ portamentoCurve })}
          />
          <div className="flex flex-col gap-0.5 text-[8.5px] font-mono-num">
            <label className="flex items-center gap-1 text-slate-400">
              <span>PB+</span>
              <input
                aria-label="Pitch Bend Up Semitones"
                type="number"
                min={1}
                max={24}
                value={patch.performance.pitchBendUp}
                onChange={(e) =>
                  onChangePerformance({
                    pitchBendUp: Math.max(1, Math.min(24, Number(e.target.value) || 2)),
                  })
                }
                className="w-9 bg-[#151B27] border border-[#2A3448] rounded px-1 text-cyan-200 text-center"
              />
            </label>
            <label className="flex items-center gap-1 text-slate-400">
              <span>PB-</span>
              <input
                aria-label="Pitch Bend Down Semitones"
                type="number"
                min={1}
                max={24}
                value={patch.performance.pitchBendDown}
                onChange={(e) =>
                  onChangePerformance({
                    pitchBendDown: Math.max(1, Math.min(24, Number(e.target.value) || 2)),
                  })
                }
                className="w-9 bg-[#151B27] border border-[#2A3448] rounded px-1 text-cyan-200 text-center"
              />
            </label>
          </div>
          <Ts666RotaryKnob
            label="MASTER"
            value={patch.performance.masterVolume}
            min={0}
            max={1}
            defaultValue={0.85}
            accent="emerald"
            modTarget="MASTER_VOL"
            modOffset={modOffsets.MASTER_VOL ?? 0}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(masterVolume) => onChangePerformance({ masterVolume })}
          />
        </div>
      </div>
    </div>
  );
};
