import React, { useEffect, useRef, useState } from 'react';
import { GripVertical, VolumeX } from 'lucide-react';
import { sixSixSixEngine } from '../../audio/ts666/SixSixSixEngine';
import type {
  Ts666GlobalConfig,
  Ts666LiveModOffsets,
  Ts666MacroConfig,
  Ts666ModSource,
  Ts666ModTarget,
  Ts666Oversampling,
  Ts666PerformanceConfig,
} from '../../types/ts666';
import { useTs666ModDrag } from './Ts666ModContext';
import { Ts666RotaryKnob } from './Ts666RotaryKnob';

interface Ts666InlineMacrosPanelProps {
  macros: Ts666MacroConfig[];
  onChangeMacro: (idx: number, sub: Partial<Ts666MacroConfig>) => void;
  onAssignMod: (src: Ts666ModSource, target: Ts666ModTarget) => void;
}

export const Ts666InlineMacrosPanel: React.FC<Ts666InlineMacrosPanelProps> = React.memo(({
  macros,
  onChangeMacro,
  onAssignMod,
}) => {
  const { startDrag } = useTs666ModDrag();

  return (
    <div className="flex flex-col justify-between bg-[#17100A] border border-[#6B4829] rounded p-1.5 h-full min-h-0 min-w-0 overflow-hidden gap-1">
      <div className="flex items-center justify-between gap-1 shrink-0 min-w-0">
        <span className="text-[8.5px] font-display font-extrabold text-[#E08A3C] tracking-wider truncate">
          MACROS (M1–M8)
        </span>
        <span className="text-[7px] font-mono-num text-[#A68464] whitespace-nowrap shrink-0">
          DRAG
        </span>
      </div>

      <div className="grid grid-cols-4 grid-rows-2 gap-1 flex-1 min-h-0 min-w-0 overflow-hidden">
        {macros.map((m, idx) => {
          const src = (`MACRO${m.id}`) as Ts666ModSource;
          return (
            <div
              key={m.id}
              className="flex flex-col items-center justify-between bg-[#110A06] border border-[#462D1B] rounded px-0.5 py-0.5 min-w-0 min-h-0 overflow-hidden"
            >
              <div className="flex items-center gap-[1px] w-full h-[11px] shrink-0">
                <button
                  type="button"
                  title={`Drag M${m.id} onto any knob`}
                  onPointerDown={(e) => startDrag(src, e, onAssignMod)}
                  style={{ touchAction: 'none' }}
                  className="text-[#EF4444] hover:text-[#FCA5A5] cursor-grab shrink-0"
                >
                  <GripVertical className="w-2.5 h-2.5" />
                </button>
                <input
                  aria-label={`Macro ${m.id} Name`}
                  type="text"
                  value={m.name}
                  onChange={(e) => onChangeMacro(idx, { name: e.target.value })}
                  className="w-full min-w-0 bg-transparent text-[6.5px] leading-none font-mono-num text-[#F5D3B3] focus:outline-none focus:text-white truncate"
                />
              </div>
              <Ts666RotaryKnob
                label={`M${m.id}`}
                hideLabel
                value={m.value}
                min={0}
                max={1}
                defaultValue={0}
                size="2xs"
                accent="copper"
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(value) => onChangeMacro(idx, { value })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

const Ts666LiveOutputCanvas: React.FC<{
  vizMode: 'spec' | 'wave';
  barsCount?: number;
}> = React.memo(({ vizMode, barsCount = 24 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vizModeRef = useRef<'spec' | 'wave'>(vizMode);
  vizModeRef.current = vizMode;

  useEffect(() => {
    let raf = 0;
    let lastDraw = 0;
    let freqBuf: Uint8Array<ArrayBuffer> | null = null;
    let timeBuf: Uint8Array<ArrayBuffer> | null = null;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas || document.hidden || canvas.offsetParent === null) return;
      if (now - lastDraw < 32) return;
      lastDraw = now;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(44, canvas.clientWidth);
      const h = Math.max(20, canvas.clientHeight);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#070303';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(120, 44, 28, 0.3)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      const analyser = sixSixSixEngine.getAnalyser();
      if (!analyser) return;

      if (vizModeRef.current === 'spec') {
        if (!freqBuf || freqBuf.length !== analyser.frequencyBinCount) {
          freqBuf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        }
        analyser.getByteFrequencyData(freqBuf);
        const bw = w / barsCount;
        for (let i = 0; i < barsCount; i++) {
          const idx = Math.min(
            freqBuf.length - 1,
            Math.floor(Math.pow(i / barsCount, 1.8) * (freqBuf.length * 0.65))
          );
          const val = freqBuf[idx] / 255;
          const bh = Math.max(1.5, val * (h - 2));
          ctx.fillStyle = val > 0.65 ? '#FCA5A5' : '#EF4444';
          ctx.fillRect(i * bw + 0.4, h - bh, Math.max(1, bw - 0.9), bh);
        }
      } else {
        if (!timeBuf || timeBuf.length !== analyser.fftSize) {
          timeBuf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        }
        analyser.getByteTimeDomainData(timeBuf);
        ctx.beginPath();
        const step = Math.max(1, Math.floor(timeBuf.length / w));
        for (let x = 0; x < w; x++) {
          const sIdx = Math.min(timeBuf.length - 1, x * step);
          const v = (timeBuf[sIdx] - 128) / 128;
          const y = h / 2 - v * (h * 0.44);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [barsCount]);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
});

interface Ts666PerformancePanelProps {
  performance: Ts666PerformanceConfig;
  modOffsets?: Ts666LiveModOffsets;
  onChangePerformance: (sub: Partial<Ts666PerformanceConfig>) => void;
}

export const Ts666PerformancePanel: React.FC<Ts666PerformancePanelProps> = React.memo(({
  performance,
  modOffsets,
  onChangePerformance,
}) => {
  const [vizMode, setVizMode] = useState<'spec' | 'wave'>('spec');

  return (
    <div className="flex flex-col justify-between bg-[#17100A] border border-[#6B4829] rounded p-1.5 h-full min-h-0 min-w-0 overflow-hidden gap-1">
      <div className="flex items-center justify-between gap-1 shrink-0 min-w-0">
        <span className="text-[8.5px] font-display font-extrabold text-[#E08A3C] tracking-wider whitespace-nowrap">
          PERFORMANCE CONTROLS
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setVizMode((m) => (m === 'spec' ? 'wave' : 'spec'))}
            className="px-1.5 py-0.5 rounded bg-[#1F0A08] border border-[#6E261E] text-[7px] leading-none font-mono-num text-[#FCA5A5] cursor-pointer"
          >
            {vizMode === 'spec' ? 'SPECTRUM' : 'SCOPE'}
          </button>
          <button
            type="button"
            onClick={() => sixSixSixEngine.panic()}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#26180E] hover:bg-[#DC2626] border border-[#6B4829] text-[7px] leading-none font-mono-num text-[#F5D3B3] hover:text-white cursor-pointer"
          >
            <VolumeX className="w-2.5 h-2.5" />
            <span>PANIC</span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex items-center gap-1.5 overflow-hidden">
        {/* PB / MW Wheels */}
        <div className="flex items-center gap-1.5 bg-[#100905] border border-[#472E1B] rounded px-1.5 py-1 h-full shrink-0">
          <div className="flex flex-col items-center h-full justify-between">
            <span className="text-[7px] font-mono-num text-[#BFA080] leading-none">PB</span>
            <input
              aria-label="Performance Pitch Bend"
              type="range"
              min={-1}
              max={1}
              step={0.02}
              value={performance.pitchBendValue}
              style={{ writingMode: 'vertical-lr', direction: 'rtl', touchAction: 'none' }}
              onChange={(e) =>
                onChangePerformance({ pitchBendValue: parseFloat(e.target.value) })
              }
              onPointerUp={() => onChangePerformance({ pitchBendValue: 0 })}
              className="flex-1 min-h-[26px] w-3 accent-red-500 cursor-ns-resize"
            />
          </div>
          <div className="flex flex-col items-center h-full justify-between">
            <span className="text-[7px] font-mono-num text-[#BFA080] leading-none">MW</span>
            <input
              aria-label="Performance Mod Wheel"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={performance.modWheelValue}
              style={{ writingMode: 'vertical-lr', direction: 'rtl', touchAction: 'none' }}
              onChange={(e) =>
                onChangePerformance({ modWheelValue: parseFloat(e.target.value) })
              }
              className="flex-1 min-h-[26px] w-3 accent-amber-500 cursor-ns-resize"
            />
          </div>
        </div>

        {/* Performance Knobs */}
        <div className="flex items-center justify-around flex-1 min-w-0 bg-[#100905] border border-[#472E1B] rounded px-1.5 py-0.5 h-full">
          <Ts666RotaryKnob
            label="PORTA"
            value={performance.portamentoTimeMs}
            min={0}
            max={1000}
            step={5}
            defaultValue={0}
            size="xs"
            accent="bronze"
            formatValue={(v) => `${Math.round(v)}ms`}
            onChange={(portamentoTimeMs) => onChangePerformance({ portamentoTimeMs })}
          />
          <Ts666RotaryKnob
            label="P.CRV"
            value={performance.portamentoCurve}
            min={-1}
            max={1}
            defaultValue={0}
            bipolar
            size="xs"
            accent="bronze"
            onChange={(portamentoCurve) => onChangePerformance({ portamentoCurve })}
          />
          <Ts666RotaryKnob
            label="PB UP"
            value={performance.pitchBendUp}
            min={1}
            max={24}
            step={1}
            defaultValue={2}
            size="xs"
            accent="copper"
            formatValue={(v) => `+${Math.round(v)}`}
            onChange={(pitchBendUp) => onChangePerformance({ pitchBendUp })}
          />
          <Ts666RotaryKnob
            label="PB DN"
            value={performance.pitchBendDown}
            min={1}
            max={24}
            step={1}
            defaultValue={2}
            size="xs"
            accent="copper"
            formatValue={(v) => `-${Math.round(v)}`}
            onChange={(pitchBendDown) => onChangePerformance({ pitchBendDown })}
          />
          <Ts666RotaryKnob
            label="MASTER"
            value={performance.masterVolume}
            min={0}
            max={1}
            defaultValue={0.85}
            size="xs"
            accent="red"
            modTarget="MASTER_VOL"
            modOffset={modOffsets?.MASTER_VOL}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(masterVolume) => onChangePerformance({ masterVolume })}
          />
        </div>

        {/* RED Live Spectrum / Oscilloscope */}
        <div className="w-24 md:w-32 h-full min-h-[34px] bg-[#070303] border border-[#6B231C] rounded overflow-hidden shrink-0">
          <Ts666LiveOutputCanvas vizMode={vizMode} barsCount={22} />
        </div>
      </div>
    </div>
  );
});

interface Ts666MasterPerformanceStripProps {
  performance: Ts666PerformanceConfig;
  global: Ts666GlobalConfig;
  modOffsets?: Ts666LiveModOffsets;
  onChangePerformance: (sub: Partial<Ts666PerformanceConfig>) => void;
  onChangeGlobal: (updater: (prev: Ts666GlobalConfig) => Ts666GlobalConfig) => void;
}

export const Ts666MasterPerformanceStrip: React.FC<Ts666MasterPerformanceStripProps> = React.memo(({
  performance,
  global,
  modOffsets,
  onChangePerformance,
  onChangeGlobal,
}) => {
  const [vizMode, setVizMode] = useState<'spec' | 'wave'>('spec');

  return (
    <div className="flex items-center gap-1 bg-[#17100A] border border-[#543720] rounded px-1 py-[2px] h-full min-h-0 shrink-0 overflow-hidden">
      <div className="flex flex-col justify-center gap-[2px] shrink-0">
        <div className="flex items-center gap-[2px]">
          {([1, 2, 4] as Ts666Oversampling[]).map((os) => (
            <button
              key={os}
              type="button"
              onClick={() =>
                onChangeGlobal((prev) => ({ ...prev, oversampling: os }))
              }
              className={`px-1 rounded text-[6.5px] leading-tight font-mono-num font-bold cursor-pointer border ${
                global.oversampling === os
                  ? 'bg-[#D97724] text-[#140B05] border-[#F4B073]'
                  : 'bg-[#0C0704] text-[#9A7858] border-[#422B1A]'
              }`}
            >
              {os}x
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            onChangeGlobal((prev) => ({ ...prev, monoLegato: !prev.monoLegato }))
          }
          className={`w-full rounded text-[6.5px] leading-tight font-mono-num font-bold cursor-pointer border text-center ${
            global.monoLegato
              ? 'bg-[#DC2626] text-white border-[#FCA5A5]'
              : 'bg-[#0C0704] text-[#E08A3C] border-[#422B1A]'
          }`}
        >
          {global.monoLegato ? 'MONO' : `POLY ${global.polyphony}`}
        </button>
      </div>

      <div className="hidden md:block relative w-12 h-full min-h-[24px] bg-[#070303] border border-[#6B231C] rounded overflow-hidden shrink-0">
        <Ts666LiveOutputCanvas vizMode={vizMode} barsCount={18} />
        <button
          type="button"
          onClick={() => setVizMode((m) => (m === 'spec' ? 'wave' : 'spec'))}
          className="absolute top-[1px] right-[1px] px-[2px] rounded bg-[#1F0A08]/85 border border-[#6E261E] text-[5.5px] leading-tight font-mono-num text-[#FCA5A5] cursor-pointer"
        >
          {vizMode === 'spec' ? 'SPC' : 'SCP'}
        </button>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Ts666RotaryKnob
          label="PORTA"
          value={performance.portamentoTimeMs}
          min={0}
          max={1000}
          step={5}
          defaultValue={0}
          size="2xs"
          accent="bronze"
          formatValue={(v) => `${Math.round(v)}m`}
          onChange={(portamentoTimeMs) => onChangePerformance({ portamentoTimeMs })}
        />
        <Ts666RotaryKnob
          label="P.CRV"
          value={performance.portamentoCurve}
          min={-1}
          max={1}
          defaultValue={0}
          bipolar
          size="2xs"
          accent="bronze"
          onChange={(portamentoCurve) => onChangePerformance({ portamentoCurve })}
        />
        <Ts666RotaryKnob
          label="A4"
          value={global.masterTuningHz}
          min={415}
          max={466}
          step={0.5}
          defaultValue={440}
          size="2xs"
          accent="copper"
          formatValue={(v) => `${Math.round(v)}`}
          onChange={(masterTuningHz) =>
            onChangeGlobal((prev) => ({ ...prev, masterTuningHz }))
          }
        />
        <Ts666RotaryKnob
          label="POLY"
          value={global.polyphony}
          min={1}
          max={16}
          step={1}
          defaultValue={12}
          size="2xs"
          accent="bronze"
          onChange={(polyphony) =>
            onChangeGlobal((prev) => ({ ...prev, polyphony }))
          }
        />
        <Ts666RotaryKnob
          label="MSTR"
          value={performance.masterVolume}
          min={0}
          max={1}
          defaultValue={0.85}
          size="2xs"
          accent="red"
          modTarget="MASTER_VOL"
          modOffset={modOffsets?.MASTER_VOL}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(masterVolume) => onChangePerformance({ masterVolume })}
        />
      </div>
    </div>
  );
});

