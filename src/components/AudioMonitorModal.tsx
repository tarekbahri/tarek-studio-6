import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Cpu, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { sequencerEngine } from '../audio/SequencerEngine';
import {
  studioAudio,
  type AudioDiagnostics,
  type LatencyProfile,
} from '../audio/StudioAudio';
import { subbassEngine } from '../audio/SubbassEngine';
import { synthEngine } from '../audio/SynthEngine';
import { sixSixSixEngine } from '../audio/ts666/SixSixSixEngine';

interface AudioMonitorModalProps {
  open: boolean;
  onClose: () => void;
}

export const AudioMonitorModal: React.FC<AudioMonitorModalProps> = ({ open, onClose }) => {
  const [diag, setDiag] = useState<AudioDiagnostics>(() => studioAudio.getDiagnostics());

  useEffect(() => {
    if (!open) return;
    return studioAudio.subscribeDiagnostics(setDiag);
  }, [open]);

  if (!open) return null;

  const stateColor =
    diag.state === 'running'
      ? 'text-emerald-300 border-emerald-400/50 bg-emerald-500/15'
      : diag.state === 'uninitialized'
      ? 'text-slate-300 border-slate-600 bg-slate-800/60'
      : 'text-amber-300 border-amber-400/50 bg-amber-500/15';

  const cpuPct = Math.min(100, Math.round(diag.cpuLoadPct));
  const cpuBarColor =
    cpuPct > 75 ? 'bg-rose-500' : cpuPct > 45 ? 'bg-amber-400' : 'bg-cyan-400';

  const handleRecover = async () => {
    await studioAudio.ensureAudio();
    await studioAudio.recoverIfSuspended();
    synthEngine.panic();
    subbassEngine.panic();
    sixSixSixEngine.panic();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[92dvh] flex flex-col rounded-xl bg-[#111622] border border-[#2A364F] shadow-2xl overflow-hidden text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0D121B] border-b border-[#242E40] shrink-0">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h2 className="font-display text-sm font-bold tracking-wide text-slate-100">
              AUDIO PERFORMANCE MONITOR
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Audio Monitor"
            className="w-7 h-7 rounded-md bg-[#161E2E] hover:bg-[#212C42] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 space-y-3 text-xs overflow-y-auto synth-scroll flex-1 min-h-0">
          {/* Primary Status Row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-[#0A0E16] border border-[#222C3E] p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                AudioContext State
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-mono-num font-semibold uppercase ${stateColor}`}
              >
                <Activity className="w-3 h-3" />
                {diag.state}
              </span>
            </div>

            <div className="rounded-lg bg-[#0A0E16] border border-[#222C3E] p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                DSP Thread Engine
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-mono-num font-semibold ${
                  diag.workletMode === 'audioworklet'
                    ? 'text-cyan-300 border-cyan-400/50 bg-cyan-500/15'
                    : 'text-amber-300 border-amber-400/40 bg-amber-500/10'
                }`}
              >
                <ShieldCheck className="w-3 h-3" />
                {diag.workletMode === 'audioworklet'
                  ? 'AudioWorklet Active'
                  : diag.workletMode === 'fallback'
                  ? 'Native Safe Fallback'
                  : 'Waiting Audio Init'}
              </span>
            </div>
          </div>

          {/* CPU & Active Voices */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-[#0A0E16] border border-[#222C3E] p-2.5">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">
                <span>DSP Render Load</span>
                <span className="font-mono-num text-slate-200 font-semibold">{cpuPct}%</span>
              </div>
              <div className="h-2 rounded bg-[#182132] overflow-hidden">
                <div
                  className={`h-full transition-all duration-150 ${cpuBarColor}`}
                  style={{ width: `${Math.max(4, cpuPct)}%` }}
                />
              </div>
            </div>

            <div className="rounded-lg bg-[#0A0E16] border border-[#222C3E] p-2.5">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">
                <span>Active Polyphony</span>
                <span className="font-mono-num text-cyan-300 font-semibold">
                  {diag.activeVoices} / {diag.maxVoices} Voices
                </span>
              </div>
              <div className="h-2 rounded bg-[#182132] overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all duration-150"
                  style={{
                    width: `${Math.min(100, (diag.activeVoices / diag.maxVoices) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Buffer, Sample Rate, Underruns */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg bg-[#0A0E16] border border-[#222C3E] p-2">
              <div className="text-[9px] uppercase text-slate-400">Sample Rate</div>
              <div className="font-mono-num text-[11px] font-semibold text-slate-100 mt-0.5">
                {(diag.sampleRate / 1000).toFixed(1)} kHz
              </div>
            </div>
            <div className="rounded-lg bg-[#0A0E16] border border-[#222C3E] p-2">
              <div className="text-[9px] uppercase text-slate-400">Base Latency</div>
              <div className="font-mono-num text-[11px] font-semibold text-slate-100 mt-0.5">
                {diag.baseLatencyMs.toFixed(1)} ms
              </div>
            </div>
            <div className="rounded-lg bg-[#0A0E16] border border-[#222C3E] p-2">
              <div className="text-[9px] uppercase text-slate-400">Underruns</div>
              <div
                className={`font-mono-num text-[11px] font-semibold mt-0.5 ${
                  diag.underruns > 0 ? 'text-amber-300' : 'text-emerald-300'
                }`}
              >
                {diag.underruns}
              </div>
            </div>
            <div className="rounded-lg bg-[#0A0E16] border border-[#222C3E] p-2">
              <div className="text-[9px] uppercase text-slate-400">Recoveries</div>
              <div className="font-mono-num text-[11px] font-semibold text-slate-100 mt-0.5">
                {diag.interruptions}
              </div>
            </div>
          </div>

          {/* Buffer Profile Selector (applies on audio initialization / next session) */}
          <div className="rounded-lg bg-[#0A0E16] border border-[#222C3E] p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">
                Buffer Stability Profile
              </span>
              <span className="text-[10px] text-slate-500">Android Recommended: Stable</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'playback', label: 'Stable (Anti-Crackle)' },
                  { id: 'balanced', label: 'Balanced' },
                  { id: 'interactive', label: 'Ultra-Low' },
                ] as { id: LatencyProfile; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    if (diag.latencyProfile === opt.id) return;
                    const wasPlaying = sequencerEngine.getIsPlaying();
                    if (wasPlaying) {
                      sequencerEngine.stop(false);
                    }
                    void studioAudio.setLatencyProfile(opt.id, true).then(async () => {
                      await Promise.all([
                        synthEngine.ensureAudio(),
                        subbassEngine.ensureAudio(),
                      ]);
                      if (wasPlaying) {
                        void sequencerEngine.start();
                      }
                    });
                  }}
                  className={`px-2 py-1.5 rounded text-[10px] font-semibold border cursor-pointer transition-colors ${
                    diag.latencyProfile === opt.id
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : 'bg-[#131B2B] border-[#26324A] text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Playback Error Readout */}
          {diag.lastError ? (
            <div className="flex items-start justify-between gap-2 rounded-lg bg-rose-500/10 border border-rose-400/40 p-2.5 text-rose-200">
              <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-[11px] break-words">{diag.lastError}</div>
              </div>
              <button
                type="button"
                onClick={() => studioAudio.clearErrors()}
                className="text-[10px] text-rose-300 hover:text-white underline shrink-0 cursor-pointer"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-400/30 px-2.5 py-2 text-emerald-200 text-[11px]">
              <span>No playback errors detected. Audio engine healthy.</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleRecover}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Resume & Sync Audio</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
