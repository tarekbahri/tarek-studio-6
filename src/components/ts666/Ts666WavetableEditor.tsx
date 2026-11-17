import React, { useMemo, useRef, useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import {
  evaluateCustomFrameCycle,
  getWavetableFrames,
} from '../../audio/ts666/ts666Wavetables';
import type {
  Ts666CustomWavetable,
  Ts666OscillatorConfig,
  Ts666WavetableFrameData,
} from '../../types/ts666';

interface Ts666WavetableEditorProps {
  oscillators: [
    Ts666OscillatorConfig,
    Ts666OscillatorConfig,
    Ts666OscillatorConfig
  ];
  initialOscIdx: 0 | 1 | 2;
  onApplyCustomWavetable: (
    oscIdx: 0 | 1 | 2,
    wt: Ts666CustomWavetable
  ) => void;
  onClose: () => void;
}

function emptyFrameSine(): Ts666WavetableFrameData {
  const real = Array(33).fill(0);
  const imag = Array(33).fill(0);
  imag[1] = 1;
  return { real, imag };
}

function extractHarmonicsFromCycle(cycle: Float32Array): Ts666WavetableFrameData {
  const N = cycle.length;
  const real = Array(33).fill(0);
  const imag = Array(33).fill(0);
  for (let h = 1; h <= 32; h++) {
    let re = 0;
    let im = 0;
    const step = (2 * Math.PI * h) / N;
    for (let n = 0; n < N; n++) {
      re += cycle[n] * Math.cos(step * n);
      im += cycle[n] * Math.sin(step * n);
    }
    real[h] = (2 * re) / N;
    imag[h] = (2 * im) / N;
  }
  return { real, imag };
}

function seedCustomFrames(osc: Ts666OscillatorConfig): Ts666CustomWavetable {
  if (osc.customWavetable && osc.customWavetable.frames.length === 16) {
    return {
      name: osc.customWavetable.name,
      frames: osc.customWavetable.frames.map((f) => ({
        real: [...f.real],
        imag: [...f.imag],
      })),
    };
  }
  const sourceFrames = getWavetableFrames(osc.wavetableId, osc.customWavetable);
  return {
    name: `Custom 666 (${osc.id})`,
    frames: Array.from({ length: 16 }, (_, i) => {
      const f = sourceFrames[i] ?? sourceFrames[0];
      return extractHarmonicsFromCycle(f);
    }),
  };
}

export const Ts666WavetableEditor: React.FC<Ts666WavetableEditorProps> = ({
  oscillators,
  initialOscIdx,
  onApplyCustomWavetable,
  onClose,
}) => {
  const [targetOscIdx, setTargetOscIdx] = useState<0 | 1 | 2>(initialOscIdx);
  const [wtData, setWtData] = useState<Ts666CustomWavetable>(() =>
    seedCustomFrames(oscillators[initialOscIdx])
  );
  const [selectedFrame, setSelectedFrame] = useState<number>(0);
  const waveSvgRef = useRef<SVGSVGElement | null>(null);

  const frame = wtData.frames[selectedFrame] ?? emptyFrameSine();
  const cycleSamples = useMemo(() => evaluateCustomFrameCycle(frame), [frame]);

  const harmonicMags = useMemo(() => {
    return Array.from({ length: 32 }, (_, idx) => {
      const h = idx + 1;
      return Math.min(1, Math.hypot(frame.real[h] ?? 0, frame.imag[h] ?? 0));
    });
  }, [frame]);

  const wavePath = useMemo(() => {
    const W = 400;
    const H = 140;
    const pts: string[] = [];
    for (let i = 0; i < cycleSamples.length; i += 2) {
      const x = (i / (cycleSamples.length - 1)) * W;
      const y = H / 2 - cycleSamples[i] * (H * 0.42);
      pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [cycleSamples]);

  const updateFrameData = (nextFrame: Ts666WavetableFrameData) => {
    setWtData((prev) => ({
      ...prev,
      frames: prev.frames.map((fr, i) => (i === selectedFrame ? nextFrame : fr)),
    }));
  };

  const handleDrawWave = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!waveSvgRef.current) return;
    e.preventDefault();
    const working = new Float32Array(cycleSamples);
    let lastIdx = -1;

    const paint = (cx: number, cy: number) => {
      if (!waveSvgRef.current) return;
      const rect = waveSvgRef.current.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (cx - rect.left) / Math.max(1, rect.width)));
      const ny = Math.max(-1, Math.min(1, 1 - ((cy - rect.top) / Math.max(1, rect.height)) * 2));
      const idx = Math.min(working.length - 1, Math.floor(nx * working.length));
      if (lastIdx >= 0 && Math.abs(idx - lastIdx) > 1 && Math.abs(idx - lastIdx) < 40) {
        const step = idx > lastIdx ? 1 : -1;
        for (let k = lastIdx; k !== idx; k += step) {
          const frac = (k - lastIdx) / (idx - lastIdx);
          working[k] = working[lastIdx] * (1 - frac) + ny * frac;
        }
      }
      working[idx] = ny;
      lastIdx = idx;
      updateFrameData(extractHarmonicsFromCycle(working));
    };

    paint(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => paint(ev.clientX, ev.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const setPartialMagnitude = (h: number, mag: number) => {
    const nextReal = [...frame.real];
    const nextImag = [...frame.imag];
    const currAngle = Math.atan2(nextImag[h] ?? 0, nextReal[h] ?? 0) || Math.PI / 2;
    nextReal[h] = mag * Math.cos(currAngle);
    nextImag[h] = mag * Math.sin(currAngle);
    updateFrameData({ real: nextReal, imag: nextImag });
  };

  const applyGeneratorShape = (kind: 'sine' | 'saw' | 'square' | 'tri' | 'organ') => {
    const real = Array(33).fill(0);
    const imag = Array(33).fill(0);
    for (let h = 1; h <= 32; h++) {
      if (kind === 'sine' && h === 1) imag[h] = 1;
      else if (kind === 'saw') imag[h] = 1 / h;
      else if (kind === 'square' && h % 2 === 1) imag[h] = 1 / h;
      else if (kind === 'tri' && h % 2 === 1) imag[h] = ((((h - 1) / 2) % 2 === 0 ? 1 : -1) / (h * h));
      else if (kind === 'organ' && [1, 2, 3, 4, 6, 8].includes(h)) imag[h] = 0.7 / Math.sqrt(h);
    }
    updateFrameData({ real, imag });
  };

  const morphFrame0To15 = () => {
    const f0 = wtData.frames[0];
    const f15 = wtData.frames[15];
    const nextFrames = Array.from({ length: 16 }, (_, idx) => {
      const t = idx / 15;
      return {
        real: f0.real.map((v, h) => v * (1 - t) + (f15.real[h] ?? 0) * t),
        imag: f0.imag.map((v, h) => v * (1 - t) + (f15.imag[h] ?? 0) * t),
      };
    });
    setWtData((prev) => ({ ...prev, frames: nextFrames }));
  };

  const handleApply = () => {
    onApplyCustomWavetable(targetOscIdx, wtData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3">
      <div className="w-full max-w-4xl bg-[#160F0A] border border-[#6B4829] rounded-lg shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#1D130C] border-b border-[#5C3E24] shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-bold text-[#FCA5A5]">
              666TS INTERACTIVE WAVETABLE EDITOR
            </span>
            <div className="flex items-center gap-0.5 bg-[#0C0704] p-0.5 rounded border border-[#4D321D]">
              {([0, 1, 2] as const).map((idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setTargetOscIdx(idx);
                    setWtData(seedCustomFrames(oscillators[idx]));
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono-num font-bold cursor-pointer ${
                    targetOscIdx === idx
                      ? 'bg-[#DC2626] text-white'
                      : 'text-[#BFA080] hover:text-white'
                  }`}
                >
                  OSC {idx === 0 ? 'A' : idx === 1 ? 'B' : 'C'}
                </button>
              ))}
            </div>
            <input
              aria-label="Custom Wavetable Name"
              type="text"
              value={wtData.name}
              onChange={(e) => setWtData((p) => ({ ...p, name: e.target.value }))}
              className="bg-[#0A0503] border border-[#543720] rounded px-2 py-0.5 text-xs font-mono-num text-[#F5D3B3] w-36"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleApply}
              className="inline-flex items-center gap-1 px-3 py-1 rounded bg-[#DC2626] hover:bg-[#EF4444] text-white font-display text-xs font-bold cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>APPLY TO OSC {targetOscIdx === 0 ? 'A' : targetOscIdx === 1 ? 'B' : 'C'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded bg-[#26180E] text-[#D9B694] hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 p-3 overflow-y-auto synth-scroll flex-1">
          <div className="flex flex-wrap items-center justify-between gap-1.5 shrink-0">
            <div className="flex items-center gap-1">
              {(['sine', 'tri', 'saw', 'square', 'organ'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => applyGeneratorShape(g)}
                  className="px-2 py-1 rounded bg-[#26180E] hover:bg-[#362215] border border-[#6B4829] text-[10px] font-mono-num uppercase text-[#F5D3B3] cursor-pointer"
                >
                  {g}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={morphFrame0To15}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#DC2626]/25 border border-[#EF4444] text-[#FCA5A5] text-[10px] font-mono-num font-bold cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              <span>MORPH F1 → F16</span>
            </button>
          </div>

          <div className="bg-[#090403] border border-[#6B231C] rounded-md p-1.5">
            <div className="text-[10px] font-mono-num text-[#E08A3C] mb-1">
              SINGLE-CYCLE WAVEFORM CANVAS (DRAW FREEHAND — FRAME {selectedFrame + 1}/16)
            </div>
            <svg
              ref={waveSvgRef}
              viewBox="0 0 400 140"
              onPointerDown={handleDrawWave}
              style={{ touchAction: 'none' }}
              className="w-full h-36 bg-[#070303] rounded cursor-crosshair block"
            >
              <line x1={0} y1={70} x2={400} y2={70} stroke="#3B1512" strokeWidth={1} />
              <line x1={200} y1={0} x2={200} y2={140} stroke="#3B1512" strokeWidth={1} />
              <path d={wavePath} fill="none" stroke="#EF4444" strokeWidth={2.2} />
            </svg>
          </div>

          <div className="bg-[#0A0503] border border-[#543720] rounded-md p-2">
            <div className="text-[10px] font-mono-num text-[#E08A3C] mb-1.5">
              32-HARMONIC SPECTRUM PARTIALS (TAP / DRAG BARS)
            </div>
            <div className="grid grid-cols-16 gap-1 h-24 items-end">
              {harmonicMags.map((mag, idx) => (
                <div
                  key={idx}
                  onPointerDown={(e) => {
                    const el = e.currentTarget;
                    const updateBar = (clientY: number) => {
                      const rect = el.getBoundingClientRect();
                      const val = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
                      setPartialMagnitude(idx + 1, val);
                    };
                    updateBar(e.clientY);
                    const onMove = (ev: PointerEvent) => updateBar(ev.clientY);
                    const onUp = () => {
                      window.removeEventListener('pointermove', onMove);
                      window.removeEventListener('pointerup', onUp);
                    };
                    window.addEventListener('pointermove', onMove);
                    window.addEventListener('pointerup', onUp);
                  }}
                  style={{ touchAction: 'none' }}
                  title={`Harmonic ${idx + 1}: ${Math.round(mag * 100)}%`}
                  className="h-full bg-[#180E08] rounded-t border border-[#4A301D] flex flex-col justify-end cursor-ns-resize overflow-hidden"
                >
                  <div
                    className="w-full bg-[#EF4444]"
                    style={{ height: `${Math.round(mag * 100)}%` }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-8 sm:grid-cols-16 gap-1 shrink-0">
            {wtData.frames.map((_fr, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedFrame(idx)}
                className={`py-1.5 rounded text-[10px] font-mono-num font-bold cursor-pointer border ${
                  selectedFrame === idx
                    ? 'bg-[#DC2626] text-white border-[#FCA5A5]'
                    : 'bg-[#0C0704] text-[#D9B694] border-[#4D321D] hover:border-[#E08A3C]'
                }`}
              >
                F{idx + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
