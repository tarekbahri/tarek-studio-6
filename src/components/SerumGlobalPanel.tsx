import React from 'react';
import { FolderOpen, RotateCcw, Sliders, Sparkles } from 'lucide-react';
import type { OscillatorConfig, SynthPatch } from '../types/synth';
import { RotaryKnob } from './RotaryKnob';

interface SerumGlobalPanelProps {
  patch: SynthPatch;
  onChangeOsc: (index: 0 | 1 | 2, oscPatch: Partial<OscillatorConfig>) => void;
  onChangeMasterVolume: (volume: number) => void;
  onChangeGlideMs: (glideMs: number) => void;
  onChangePitchBendRange: (pitchBendRange: number) => void;
  onOpenPresets: () => void;
  onInitPatch: () => void;
  onOpenMatrix: () => void;
}

export const SerumGlobalPanel: React.FC<SerumGlobalPanelProps> = React.memo(
  ({
    patch,
    onChangeOsc,
    onChangeMasterVolume,
    onChangeGlideMs,
    onChangePitchBendRange,
    onOpenPresets,
    onInitPatch,
    onOpenMatrix,
  }) => {
    const activeModRoutes = patch.modMatrix.filter((r) => r.enabled).length;

    return (
      <div className="h-full w-full grid grid-cols-1 md:grid-cols-12 gap-2 overflow-y-auto synth-scroll select-none">
        {/* LEFT: GLOBAL MASTER & PITCH / PORTAMENTO SETTINGS */}
        <section className="md:col-span-4 flex flex-col justify-between rounded-lg border border-[#2E3543] bg-[#191D24] overflow-hidden">
          <div className="flex items-center justify-between px-3 h-8 bg-[#222731] border-b border-[#2E3543] shrink-0">
            <span className="font-display text-xs font-bold tracking-wider text-slate-100 uppercase">
              Master & Voicing
            </span>
            <span className="font-mono-num text-[10px] text-[#2EE59D]">
              GLOBAL
            </span>
          </div>

          <div className="flex-1 flex flex-col justify-between p-3 gap-3">
            <div className="grid grid-cols-3 gap-2 bg-[#13161C] border border-[#262C38] rounded-lg p-3">
              <RotaryKnob
                label="Master Vol"
                size="md"
                accent="mint"
                value={patch.master.volume}
                min={0}
                max={1}
                defaultValue={0.85}
                modTarget="AMP_LEVEL"
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={onChangeMasterVolume}
              />
              <RotaryKnob
                label="Portamento"
                size="md"
                accent="cyan"
                value={patch.master.glideMs}
                min={0}
                max={400}
                step={5}
                defaultValue={0}
                formatValue={(v) => `${Math.round(v)}ms`}
                onChange={(v) => onChangeGlideMs(Math.round(v))}
              />
              <RotaryKnob
                label="PB Range"
                size="md"
                accent="amber"
                value={patch.master.pitchBendRange}
                min={1}
                max={12}
                step={1}
                defaultValue={2}
                formatValue={(v) => `±${Math.round(v)} st`}
                onChange={(v) => onChangePitchBendRange(Math.round(v))}
              />
            </div>

            {/* Active Patch Card */}
            <div className="rounded-lg bg-[#13161C] border border-[#262C38] p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                    Active Patch
                  </div>
                  <div className="font-display text-sm font-bold text-slate-100 truncate">
                    {patch.name}
                  </div>
                </div>
                <span className="text-[11px] font-mono-num text-[#2EE59D] shrink-0">
                  {patch.category}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onOpenPresets}
                  style={{ touchAction: 'manipulation' }}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md bg-[#222731] hover:bg-[#2B3240] border border-[#343C4C] text-xs font-semibold text-slate-100 cursor-pointer whitespace-nowrap"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[#2EE59D]" />
                  <span>Presets</span>
                </button>
                <button
                  type="button"
                  onClick={onInitPatch}
                  style={{ touchAction: 'manipulation' }}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md bg-[#161920] hover:bg-[#222731] border border-[#2E3543] text-xs font-semibold text-slate-300 hover:text-amber-300 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clean Bass Init</span>
                </button>
              </div>
            </div>

            {/* Modulation & Macro Summary */}
            <div className="rounded-lg bg-[#13161C] border border-[#262C38] p-3 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-300">
                <span className="font-semibold text-slate-100">
                  {activeModRoutes}
                </span>{' '}
                active matrix routes ·{' '}
                <span className="font-semibold text-slate-100">
                  {patch.macros.length}
                </span>{' '}
                macros
              </div>
              <button
                type="button"
                onClick={onOpenMatrix}
                style={{ touchAction: 'manipulation' }}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded bg-[#2EE59D]/15 border border-[#2EE59D]/50 text-[#2EE59D] text-[11px] font-semibold cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Open Matrix</span>
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT: OSCILLATOR TUNING & UNISON ENGINE OVERVIEW */}
        <section className="md:col-span-8 flex flex-col justify-between rounded-lg border border-[#2E3543] bg-[#191D24] overflow-hidden">
          <div className="flex items-center justify-between px-3 h-8 bg-[#222731] border-b border-[#2E3543] shrink-0">
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-[#2EE59D]" />
              <span className="font-display text-xs font-bold tracking-wider text-slate-100 uppercase">
                Oscillator Unison & Pitch Preferences
              </span>
            </div>
            <span className="text-[10px] font-mono-num text-slate-400">
              OSC A · OSC B · OSC C
            </span>
          </div>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 p-3">
            {patch.oscillators.map((osc, idx) => {
              const i = idx as 0 | 1 | 2;
              const accent = idx === 0 ? 'mint' : 'cyan';
              return (
                <div
                  key={osc.id}
                  className={`flex flex-col justify-between rounded-lg border p-2.5 ${
                    osc.enabled
                      ? 'bg-[#13161C] border-[#2C3341]'
                      : 'bg-[#101318] border-[#222731] opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#242A36]">
                    <span className="font-display text-xs font-bold text-slate-100">
                      OSC {osc.id}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={osc.enabled}
                      onClick={() => onChangeOsc(i, { enabled: !osc.enabled })}
                      className={`px-2 h-6 rounded text-[10px] font-bold border cursor-pointer ${
                        osc.enabled
                          ? 'bg-[#2EE59D]/15 border-[#2EE59D]/55 text-[#2EE59D]'
                          : 'bg-[#0C0E13] border-[#29303D] text-slate-500'
                      }`}
                    >
                      {osc.enabled ? 'ACTIVE' : 'OFF'}
                    </button>
                  </div>

                  {/* Unison Voice Stack Selector */}
                  <div className="py-2">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span>Unison Voices</span>
                      <span className="font-mono-num text-slate-200">
                        {osc.unisonVoices} Voices
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 bg-[#0C0E13] p-1 rounded border border-[#242A36]">
                      {[1, 2, 3, 4].map((u) => (
                        <button
                          key={u}
                          type="button"
                          disabled={!osc.enabled}
                          onClick={() => onChangeOsc(i, { unisonVoices: u })}
                          className={`h-7 text-[11px] font-mono-num rounded cursor-pointer ${
                            osc.unisonVoices === u
                              ? 'bg-[#2EE59D]/20 text-[#2EE59D] border border-[#2EE59D]/50'
                              : 'text-slate-400 hover:text-slate-200 border border-transparent'
                          }`}
                        >
                          {u}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1 pt-2 border-t border-[#242A36]">
                    <RotaryKnob
                      label="Uni Det"
                      size="sm"
                      accent={accent}
                      value={osc.unisonDetune}
                      min={0}
                      max={1}
                      defaultValue={0.25}
                      disabled={!osc.enabled || osc.unisonVoices === 1}
                      formatValue={(v) => `${Math.round(v * 100)}%`}
                      onChange={(unisonDetune) =>
                        onChangeOsc(i, { unisonDetune })
                      }
                    />
                    <RotaryKnob
                      label="Octave"
                      size="sm"
                      accent={accent}
                      value={osc.octave}
                      min={-3}
                      max={3}
                      step={1}
                      defaultValue={0}
                      bipolar
                      disabled={!osc.enabled}
                      formatValue={(v) =>
                        v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`
                      }
                      onChange={(octave) =>
                        onChangeOsc(i, { octave: Math.round(octave) })
                      }
                    />
                    <RotaryKnob
                      label="Fine"
                      size="sm"
                      accent={accent}
                      value={osc.detune}
                      min={-100}
                      max={100}
                      step={1}
                      defaultValue={0}
                      bipolar
                      disabled={!osc.enabled}
                      formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}c`}
                      onChange={(detune) =>
                        onChangeOsc(i, { detune: Math.round(detune) })
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    );
  }
);
