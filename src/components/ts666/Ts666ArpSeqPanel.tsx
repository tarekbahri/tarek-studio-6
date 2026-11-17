import React, { useState } from 'react';
import { TS666_LFO_SYNC_DIVISIONS } from '../../audio/ts666/ts666Wavetables';
import type {
  Ts666ArpConfig,
  Ts666ArpMode,
  Ts666ClipSequencerConfig,
  Ts666ClipStep,
  Ts666LfoSyncDivision,
} from '../../types/ts666';
import { Ts666RotaryKnob } from './Ts666RotaryKnob';

interface Ts666ArpSeqPanelProps {
  arp: Ts666ArpConfig;
  clipSeq: Ts666ClipSequencerConfig;
  activeArpStep: number;
  activeClipStep: number;
  onChangeArp: (patch: Partial<Ts666ArpConfig>) => void;
  onChangeClipSeq: (patch: Partial<Ts666ClipSequencerConfig>) => void;
  onUpdateClipStep: (idx: number, patch: Partial<Ts666ClipStep>) => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function midiLabel(m: number): string {
  const oct = Math.floor(m / 12) - 1;
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${oct}`;
}

export const Ts666ArpSeqPanel: React.FC<Ts666ArpSeqPanelProps> = ({
  arp,
  clipSeq,
  activeClipStep,
  onChangeArp,
  onChangeClipSeq,
  onUpdateClipStep,
}) => {
  const [subTab, setSubTab] = useState<'arp' | 'clip'>('arp');

  return (
    <div className="flex flex-col bg-[#131720] border border-[#252D3D] rounded-md p-1.5 h-full min-h-0">
      <div className="flex items-center justify-between gap-1 mb-1 shrink-0">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setSubTab('arp')}
            className={`px-2 py-0.5 rounded text-[9.5px] font-display font-bold cursor-pointer ${
              subTab === 'arp'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-400/60'
                : 'bg-[#0E1219] text-slate-400 border border-[#222938]'
            }`}
          >
            ARP
          </button>
          <button
            type="button"
            onClick={() => setSubTab('clip')}
            className={`px-2 py-0.5 rounded text-[9.5px] font-display font-bold cursor-pointer ${
              subTab === 'clip'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/60'
                : 'bg-[#0E1219] text-slate-400 border border-[#222938]'
            }`}
          >
            CLIP SEQ
          </button>
        </div>

        {subTab === 'arp' ? (
          <button
            type="button"
            onClick={() => onChangeArp({ enabled: !arp.enabled })}
            className={`px-2 py-0.5 rounded text-[9px] font-mono-num font-bold cursor-pointer ${
              arp.enabled
                ? 'bg-amber-400 text-slate-950'
                : 'bg-[#19202C] text-slate-400 border border-[#2B3548]'
            }`}
          >
            {arp.enabled ? 'ARP ON' : 'ARP OFF'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onChangeClipSeq({ enabled: !clipSeq.enabled })}
            className={`px-2 py-0.5 rounded text-[9px] font-mono-num font-bold cursor-pointer ${
              clipSeq.enabled
                ? 'bg-emerald-400 text-slate-950'
                : 'bg-[#19202C] text-slate-400 border border-[#2B3548]'
            }`}
          >
            {clipSeq.enabled ? 'PLAYING' : 'STOPPED'}
          </button>
        )}
      </div>

      {subTab === 'arp' ? (
        <div className="flex flex-col justify-between flex-1 min-h-0 gap-1">
          <div className="flex items-center gap-1">
            <select
              aria-label="Arpeggiator Mode"
              value={arp.mode}
              onChange={(e) => onChangeArp({ mode: e.target.value as Ts666ArpMode })}
              className="flex-1 bg-[#0B0E14] border border-[#252E40] rounded px-1.5 py-0.5 text-[9.5px] font-mono-num text-amber-200 cursor-pointer"
            >
              <option value="up">Up</option>
              <option value="down">Down</option>
              <option value="up_down">Up / Down</option>
              <option value="random">Random</option>
              <option value="chord">Chord</option>
              <option value="order">As Played</option>
            </select>
            <select
              aria-label="Arpeggiator Division"
              value={arp.division}
              onChange={(e) =>
                onChangeArp({ division: e.target.value as Ts666LfoSyncDivision })
              }
              className="bg-[#0B0E14] border border-[#252E40] rounded px-1 py-0.5 text-[9.5px] font-mono-num text-cyan-200 cursor-pointer"
            >
              {TS666_LFO_SYNC_DIVISIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-around gap-1">
            <Ts666RotaryKnob
              label="OCTAVES"
              value={arp.octaves}
              min={1}
              max={4}
              step={1}
              defaultValue={1}
              accent="amber"
              onChange={(octaves) => onChangeArp({ octaves })}
            />
            <Ts666RotaryKnob
              label="GATE"
              value={arp.gate}
              min={0.1}
              max={1.4}
              defaultValue={0.75}
              accent="amber"
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(gate) => onChangeArp({ gate })}
            />
            <Ts666RotaryKnob
              label="SWING"
              value={arp.swing}
              min={0}
              max={0.65}
              defaultValue={0}
              accent="amber"
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(swing) => onChangeArp({ swing })}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 gap-1">
          <div className="flex items-center justify-between gap-1 shrink-0">
            <div className="flex items-center gap-0.5">
              {([8, 16, 32] as const).map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => onChangeClipSeq({ stepCount: cnt })}
                  className={`px-1.5 py-0.5 rounded text-[8.5px] font-mono-num cursor-pointer ${
                    clipSeq.stepCount === cnt
                      ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/60'
                      : 'bg-[#0B0E14] text-slate-400 border border-[#202736]'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
            <select
              aria-label="Clip Sequencer Rate"
              value={clipSeq.division}
              onChange={(e) =>
                onChangeClipSeq({
                  division: e.target.value as '1/8' | '1/16' | '1/32',
                })
              }
              className="bg-[#0B0E14] border border-[#252E40] rounded px-1 py-0.5 text-[8.5px] font-mono-num text-emerald-200 cursor-pointer"
            >
              <option value="1/8">1/8</option>
              <option value="1/16">1/16</option>
              <option value="1/32">1/32</option>
            </select>
          </div>

          <div className="grid grid-cols-8 gap-0.5 flex-1 min-h-0 overflow-y-auto synth-scroll">
            {clipSeq.steps.slice(0, clipSeq.stepCount).map((st, idx) => {
              const isCurr = clipSeq.enabled && activeClipStep === idx;
              return (
                <div
                  key={idx}
                  className={`flex flex-col items-center justify-between rounded border p-0.5 text-[8px] font-mono-num ${
                    isCurr
                      ? 'border-amber-400 bg-amber-500/20'
                      : st.active
                      ? 'border-emerald-500/50 bg-emerald-500/15'
                      : 'border-[#202736] bg-[#0B0E14]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onUpdateClipStep(idx, { active: !st.active })}
                    className={`w-full text-center font-bold cursor-pointer ${
                      st.active ? 'text-emerald-200' : 'text-slate-500'
                    }`}
                  >
                    {idx + 1}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateClipStep(idx, {
                        midi: st.midi >= 60 ? 36 : st.midi + 1,
                      })
                    }
                    title="Tap to step note up"
                    className="text-[7.5px] text-slate-200 hover:text-cyan-300 cursor-pointer"
                  >
                    {midiLabel(st.midi)}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
