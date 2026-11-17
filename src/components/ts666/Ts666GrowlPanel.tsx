import React, { useEffect, useRef } from 'react';
import { Flame } from 'lucide-react';
import { sixSixSixEngine } from '../../audio/ts666/SixSixSixEngine';
import {
  getTs666TelemetrySnapshot,
  useTs666GrowlTelemetry,
} from '../../audio/ts666/ts666TelemetryStore';
import {
  TS666_GROWL_PRESETS,
  createTs666FxModule,
} from '../../audio/ts666/ts666FxEngine';
import { TS666_LFO_SYNC_DIVISIONS } from '../../audio/ts666/ts666Wavetables';
import type {
  Ts666BusId,
  Ts666FxBuses,
  Ts666FxModule,
  Ts666GrowlTelemetry,
  Ts666LiveModOffsets,
} from '../../types/ts666';
import { Ts666RotaryKnob } from './Ts666RotaryKnob';

interface Ts666GrowlPanelProps {
  fx: Ts666FxBuses;
  activeBus: Ts666BusId;
  bpm: number;
  modOffsets?: Ts666LiveModOffsets;
  growlTelemetry?: Ts666GrowlTelemetry | null;
  onChangeFx: (updater: (prev: Ts666FxBuses) => Ts666FxBuses) => void;
}

const FILTER_MODE_LABELS: { id: number; label: string }[] = [
  { id: 0, label: 'LP+FMT' },
  { id: 1, label: 'VOWEL' },
  { id: 2, label: 'RIDDIM' },
];

function findGrowlTarget(
  fx: Ts666FxBuses,
  preferredBus: Ts666BusId
): { bus: Ts666BusId; index: number; mod: Ts666FxModule } | null {
  const buses: Ts666BusId[] = [
    preferredBus,
    ...(['main', 'bus1', 'bus2'] as Ts666BusId[]).filter((b) => b !== preferredBus),
  ];
  for (const b of buses) {
    const idx = fx[b].findIndex((m) => m.type === 'growl_engine');
    if (idx !== -1) return { bus: b, index: idx, mod: fx[b][idx] };
  }
  return null;
}

function evalGrowlCurveGain(
  freq: number,
  cutoffHz: number,
  resonance: number,
  filterMode: number,
  metal: number,
  drive: number
): number {
  const q = Math.max(0.5, resonance);
  const ratio = freq / Math.max(30, cutoffHz);

  let mag = 1;
  if (filterMode === 1) {
    // Bandpass + Vowel formant peak at 2.15x
    const bp = 1 / Math.sqrt(1 + Math.pow(q * 0.72 * (ratio - 1 / ratio), 2));
    const f2 = freq / Math.max(80, cutoffHz * 2.15);
    const formantBoost = 1 + (1.2 + metal * 0.8) / Math.sqrt(1 + Math.pow(2.4 * (f2 - 1 / f2), 2));
    mag = bp * formantBoost;
  } else if (filterMode === 2) {
    // Notch at 0.88x + LP at 1.9x
    const rNotch = freq / Math.max(40, cutoffHz * 0.88);
    const notchDepth = Math.abs(rNotch - 1 / rNotch);
    const notch = notchDepth / Math.sqrt(notchDepth * notchDepth + Math.pow(0.75 / q, 2));
    const rLp = freq / Math.max(80, cutoffHz * 1.9);
    const lp = 1 / Math.sqrt(Math.pow(1 - rLp * rLp, 2) + Math.pow(rLp / (q * 0.85), 2));
    mag = notch * lp;
  } else {
    // LP12 + Resonant formant hump at 1.85x
    const lp = 1 / Math.sqrt(Math.pow(1 - ratio * ratio, 2) + Math.pow(ratio / (q * 0.82), 2));
    const f2 = freq / Math.max(80, cutoffHz * 1.85);
    const formant = 1 + (0.9 + drive * 0.65) / Math.sqrt(1 + Math.pow(2.5 * (f2 - 1 / f2), 2));
    mag = lp * formant;
  }
  return Math.max(0.03, Math.min(8, mag));
}

export const Ts666GrowlPanel: React.FC<Ts666GrowlPanelProps> = React.memo(({
  fx,
  activeBus,
  bpm,
  modOffsets,
  growlTelemetry,
  onChangeFx,
}) => {
  const storeGrowlTel = useTs666GrowlTelemetry();
  const effGrowlTelemetry = growlTelemetry ?? storeGrowlTel;

  const found = findGrowlTarget(fx, activeBus);
  const growlMod = found?.mod;
  const growlBus = found?.bus ?? activeBus;
  const defaultParams = TS666_GROWL_PRESETS[0].params;
  const params = growlMod?.params ?? defaultParams;
  const isEnabled = Boolean(growlMod?.enabled);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const latestRef = useRef({
    params,
    isEnabled,
    modOffsets,
    growlTelemetry: effGrowlTelemetry,
    bpm,
  });
  latestRef.current = {
    params,
    isEnabled,
    modOffsets,
    growlTelemetry: effGrowlTelemetry,
    bpm,
  };

  const patchGrowlParams = (
    patch: Record<string, number>,
    forceEnable = false
  ) => {
    onChangeFx((prev) => {
      const target = findGrowlTarget(prev, activeBus);
      if (!target) {
        const created = createTs666FxModule('growl_engine');
        created.enabled = true;
        created.params = { ...created.params, ...patch };
        return {
          ...prev,
          [activeBus]: [created, ...prev[activeBus]],
        };
      }
      return {
        ...prev,
        [target.bus]: prev[target.bus].map((m, i) =>
          i === target.index
            ? {
                ...m,
                enabled: forceEnable ? true : m.enabled,
                params: { ...m.params, ...patch },
              }
            : m
        ),
      };
    });
  };

  const toggleGrowlEnabled = () => {
    onChangeFx((prev) => {
      const target = findGrowlTarget(prev, activeBus);
      if (!target) {
        const created = createTs666FxModule('growl_engine');
        created.enabled = true;
        return {
          ...prev,
          [activeBus]: [created, ...prev[activeBus]],
        };
      }
      return {
        ...prev,
        [target.bus]: prev[target.bus].map((m, i) =>
          i === target.index ? { ...m, enabled: !m.enabled } : m
        ),
      };
    });
  };

  // Real-time animated & audio-reactive Red Growl Filter Canvas (30fps + visibility-gated)
  useEffect(() => {
    let raf = 0;
    let lastDraw = 0;
    let fftBins: Uint8Array<ArrayBuffer> | null = null;

    const render = (now: number) => {
      const canvas = canvasRef.current;
      if (canvas && !document.hidden && canvas.offsetParent !== null && now - lastDraw >= 32) {
        lastDraw = now;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.max(100, canvas.clientWidth);
        const h = Math.max(20, canvas.clientHeight);
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);

          // Deep crimson-black display screen background
          ctx.fillStyle = '#070303';
          ctx.fillRect(0, 0, w, h);

          // Grid lines
          ctx.strokeStyle = 'rgba(130, 52, 32, 0.25)';
          ctx.lineWidth = 0.75;
          for (let gx = 1; gx < 6; gx++) {
            const x = (gx / 6) * w;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.moveTo(0, h * 0.52);
          ctx.lineTo(w, h * 0.52);
          ctx.stroke();

          const snap = getTs666TelemetrySnapshot();
          const { params: p, isEnabled: active } = latestRef.current;
          const mo = latestRef.current.modOffsets ?? snap.offsets;
          const tel = latestRef.current.growlTelemetry ?? snap.growl;

          // 1. Live Audio-Reactive FFT Spectrum from SixSixSixEngine
          const analyser = sixSixSixEngine.getAnalyser();
          let peakEnergy = 0;
          if (analyser) {
            if (!fftBins || fftBins.length !== analyser.frequencyBinCount) {
              fftBins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
            }
            analyser.getByteFrequencyData(fftBins);
            const bars = 40;
            const barW = w / bars;
            for (let b = 0; b < bars; b++) {
              const normX = b / (bars - 1);
              const freq = 35 * Math.pow(360, normX);
              const binIdx = Math.min(
                fftBins.length - 1,
                Math.max(1, Math.round((freq / (analyser.context.sampleRate * 0.5)) * fftBins.length))
              );
              const val = fftBins[binIdx] / 255;
              if (val > peakEnergy) peakEnergy = val;
              if (val > 0.015) {
                const bh = val * (h * 0.85);
                ctx.fillStyle = active
                  ? `rgba(220, 38, 38, ${(0.18 + val * 0.38).toFixed(2)})`
                  : `rgba(160, 75, 45, ${(0.12 + val * 0.2).toFixed(2)})`;
                ctx.fillRect(b * barW + 0.5, h - bh, Math.max(1, barW - 1), bh);
              }
            }
          }

          // 2. Compute live cutoff & wobble-modulated cutoff
          const baseCut = Math.max(
            50,
            Math.min(5500, (p.cutoff ?? 440) * Math.pow(2, (mo.GROWL_CUTOFF ?? 0) * 3.5))
          );
          const res = Math.max(0.5, Math.min(12, (p.resonance ?? 4.4) + (mo.GROWL_RES ?? 0) * 6));
          const metal = Math.max(0, Math.min(1, (p.metal ?? 0.22) + (mo.GROWL_METAL ?? 0)));
          const drive = Math.max(0, Math.min(1, (p.drive ?? 0.34) + (mo.GROWL_DRIVE ?? 0)));
          const filterMode = Math.max(0, Math.min(2, Math.round(p.filterMode ?? 0)));
          const liveModCut = tel && active ? tel.modulatedCutoffHz : baseCut;

          // 3. Draw RED animated Filter Response Curve
          ctx.beginPath();
          const samples = 68;
          for (let i = 0; i <= samples; i++) {
            const xNorm = i / samples;
            const freq = 35 * Math.pow(360, xNorm);
            const mag = evalGrowlCurveGain(
              freq,
              liveModCut,
              res + peakEnergy * 0.8,
              filterMode,
              metal,
              drive
            );
            const db = Math.max(-24, Math.min(16, 20 * Math.log10(mag)));
            const y = h - ((db + 24) / 40) * (h - 10) - 5;
            const x = xNorm * w;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.lineWidth = active ? 2.1 : 1.4;
          ctx.strokeStyle = active ? '#EF4444' : '#99402B';
          ctx.stroke();

          // Red area glow fill under curve
          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.closePath();
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(
            0,
            active
              ? `rgba(239, 68, 68, ${(0.28 + peakEnergy * 0.24).toFixed(2)})`
              : 'rgba(153, 64, 43, 0.14)'
          );
          grad.addColorStop(1, 'rgba(127, 29, 29, 0.02)');
          ctx.fillStyle = grad;
          ctx.fill();

          // 4. Base Cutoff Marker (subtle bronze dashed) & Animated Modulated Cutoff Marker (red dot)
          const baseX = Math.max(
            0,
            Math.min(w, (Math.log(Math.max(35, baseCut) / 35) / Math.log(360)) * w)
          );
          ctx.strokeStyle = 'rgba(217, 130, 43, 0.55)';
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(baseX, 4);
          ctx.lineTo(baseX, h - 4);
          ctx.stroke();
          ctx.setLineDash([]);

          const modX = Math.max(
            4,
            Math.min(w - 4, (Math.log(Math.max(35, liveModCut) / 35) / Math.log(360)) * w)
          );
          const peakMag = evalGrowlCurveGain(
            liveModCut,
            liveModCut,
            res,
            filterMode,
            metal,
            drive
          );
          const peakDb = Math.max(-24, Math.min(16, 20 * Math.log10(peakMag)));
          const modY = Math.max(5, Math.min(h - 5, h - ((peakDb + 24) / 40) * (h - 10) - 5));

          ctx.fillStyle = active ? '#FCA5A5' : '#D9822B';
          ctx.beginPath();
          ctx.arc(modX, modY, active ? 3.8 : 2.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#DC2626';
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Editable Growl Filter Screen Pointer Drag (X = Cutoff, Y = Resonance)
  const handleCanvasPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const updateFromClient = (cx: number, cy: number) => {
      const rect = canvas.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (cx - rect.left) / Math.max(1, rect.width)));
      const ny = Math.max(0, Math.min(1, 1 - (cy - rect.top) / Math.max(1, rect.height)));
      const nextCut = Math.round(50 * Math.pow(110, nx));
      const nextRes = Math.round((0.6 + ny * 11) * 10) / 10;
      patchGrowlParams({ cutoff: Math.min(5500, nextCut), resonance: Math.min(12, nextRes) }, true);
    };
    updateFromClient(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => updateFromClient(ev.clientX, ev.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const syncOn = (params.wobbleSync ?? 1) >= 0.5;
  const divIdx = Math.max(
    0,
    Math.min(TS666_LFO_SYNC_DIVISIONS.length - 1, Math.round(params.wobbleDivIdx ?? 9))
  );
  const filterMode = Math.max(0, Math.min(2, Math.round(params.filterMode ?? 0)));

  const activePresetId = TS666_GROWL_PRESETS.find((pr) => {
    return (
      Math.abs((params.drive ?? 0) - pr.params.drive) < 0.02 &&
      Math.abs((params.metal ?? 0) - pr.params.metal) < 0.02 &&
      Math.abs((params.fmMetal ?? 0) - pr.params.fmMetal) < 0.02 &&
      Math.round(params.filterMode ?? 0) === pr.params.filterMode
    );
  })?.id;

  return (
    <div
      className={`flex flex-col justify-between rounded border p-1 h-full min-h-0 min-w-0 overflow-hidden gap-0.5 transition-colors ${
        isEnabled
          ? 'bg-[#19100B] border-[#9E3224]'
          : 'bg-[#140D09] border-[#5A3B23]'
      }`}
    >
      {/* WONKEY Header + Power + Bus Badge + Filter Mode Pills */}
      <div className="flex items-center justify-between gap-1 shrink-0 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={toggleGrowlEnabled}
            style={{ touchAction: 'manipulation' }}
            className={`inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded text-[8px] font-display font-extrabold cursor-pointer whitespace-nowrap shrink-0 border ${
              isEnabled
                ? 'bg-[#DC2626] text-[#FFF1E6] border-[#FCA5A5]/60'
                : 'bg-[#26180E] text-[#C8A482] border-[#664328]'
            }`}
          >
            <Flame className="w-2.5 h-2.5" />
            <span>WONKEY</span>
          </button>
          <span className="text-[7px] font-mono-num text-[#C8A482] uppercase shrink-0">
            {growlBus}
          </span>
        </div>

        {/* Filter Mode Pills */}
        <div className="flex items-center gap-0.5 shrink-0">
          {FILTER_MODE_LABELS.map((fm) => (
            <button
              key={fm.id}
              type="button"
              onClick={() => patchGrowlParams({ filterMode: fm.id }, true)}
              className={`px-1 py-[1px] rounded text-[6.5px] leading-tight font-mono-num font-bold cursor-pointer border whitespace-nowrap ${
                filterMode === fm.id
                  ? 'bg-[#DC2626]/30 text-[#FCA5A5] border-[#EF4444]'
                  : 'bg-[#0C0705] text-[#9E7B5B] border-[#3F2918]'
              }`}
            >
              {fm.label}
            </button>
          ))}
        </div>
      </div>

      {/* 5 Starting Modes (Crisp Single-Line Strip) */}
      <div className="grid grid-cols-5 gap-0.5 shrink-0 h-[15px]">
        {TS666_GROWL_PRESETS.map((pr) => {
          const shortWord = pr.name.split(' ')[0];
          return (
            <button
              key={pr.id}
              type="button"
              onClick={() => patchGrowlParams({ ...pr.params }, true)}
              title={`Load ${pr.name} starting configuration`}
              className={`px-0.5 h-full leading-none rounded text-[6.5px] font-mono-num font-bold cursor-pointer text-center border truncate ${
                activePresetId === pr.id && isEnabled
                  ? 'bg-[#C96B27]/35 text-[#FFE5CC] border-[#E08A3C]'
                  : 'bg-[#0C0705] text-[#C8A786] border-[#422B1A] hover:border-[#C96B27]'
              }`}
            >
              {shortWord}
            </button>
          );
        })}
      </div>

      {/* Large Animated Red WONKEY Filter Screen */}
      <div className="flex-1 min-h-[20px] bg-[#070303] border border-[#6E261E] rounded overflow-hidden relative">
        <canvas
          ref={canvasRef}
          onPointerDown={handleCanvasPointer}
          style={{ touchAction: 'none' }}
          className="w-full h-full block cursor-crosshair"
        />
        <span className="pointer-events-none absolute top-0.5 left-1 font-mono-num text-[7px] text-[#F87171]">
          {Math.round(
            effGrowlTelemetry && isEnabled
              ? effGrowlTelemetry.modulatedCutoffHz
              : params.cutoff ?? 440
          )}
          Hz · Q{(params.resonance ?? 4.4).toFixed(1)}
        </span>
      </div>

      {/* Organized Sub-Header + 7 Functional Controls Directly Underneath Filter Screen */}
      <div className="bg-[#110A06] border border-[#4A301D] rounded px-1 py-[2px] flex flex-col gap-[2px] shrink-0 overflow-hidden">
        {/* Aligned Section Labels + Wobble Sync Controls */}
        <div className="grid grid-cols-7 gap-0.5 items-center text-center">
          <span className="col-span-3 text-[6.5px] font-mono-num font-bold text-[#C8A482] tracking-wider border-b border-[#3A2414] pb-0.2">
            OUTPUT &amp; DRIVE
          </span>
          <span className="col-span-2 text-[6.5px] font-mono-num font-bold text-[#E08A3C] tracking-wider border-b border-[#3A2414] pb-0.2">
            METALLIC
          </span>
          <div className="col-span-2 flex items-center justify-center gap-0.5 border-b border-[#3A2414] pb-0.2 min-w-0">
            <button
              type="button"
              onClick={() => patchGrowlParams({ wobbleSync: syncOn ? 0 : 1 }, true)}
              className={`px-1 rounded text-[6.5px] font-mono-num font-bold cursor-pointer border leading-tight ${
                syncOn
                  ? 'bg-[#DC2626]/25 text-[#FCA5A5] border-[#EF4444]'
                  : 'bg-[#1D120B] text-[#B89474] border-[#52351F]'
              }`}
            >
              {syncOn ? 'SYNC' : 'FREE'}
            </button>
            {syncOn ? (
              <select
                aria-label="WONKEY Wobble Sync Division"
                value={divIdx}
                onChange={(e) =>
                  patchGrowlParams({ wobbleDivIdx: Number(e.target.value) }, true)
                }
                className="min-w-0 bg-[#090503] border border-[#52351F] rounded px-0.5 text-[6.5px] leading-tight font-mono-num text-[#F6DFC4] cursor-pointer"
              >
                {TS666_LFO_SYNC_DIVISIONS.map((d, i) => (
                  <option key={d.id} value={i}>
                    {d.id}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[6.5px] font-mono-num text-[#E08A3C] truncate">
                {(params.wobbleRate ?? 2).toFixed(1)}Hz
              </span>
            )}
          </div>
        </div>

        {/* All 7 Functional Knobs Evenly Aligned in 1 Clean Row */}
        <div className="grid grid-cols-7 gap-0.5 items-start">
          <Ts666RotaryKnob
            label="VOLUME"
            value={params.volume ?? 0.88}
            min={0}
            max={1.2}
            defaultValue={0.88}
            size="2xs"
            accent="red"
            modTarget="GROWL_VOL"
            modOffset={modOffsets?.GROWL_VOL ?? 0}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(volume) => patchGrowlParams({ volume }, true)}
          />
          <Ts666RotaryKnob
            label="DRIVE"
            value={params.drive ?? 0.34}
            min={0}
            max={1}
            defaultValue={0.34}
            size="2xs"
            accent="red"
            modTarget="GROWL_DRIVE"
            modOffset={modOffsets?.GROWL_DRIVE ?? 0}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(drive) => patchGrowlParams({ drive }, true)}
          />
          <Ts666RotaryKnob
            label="GAIN"
            value={params.gain ?? 1.0}
            min={0.2}
            max={2.2}
            defaultValue={1.0}
            size="2xs"
            accent="copper"
            modTarget="GROWL_GAIN"
            modOffset={modOffsets?.GROWL_GAIN ?? 0}
            formatValue={(v) => `${v.toFixed(1)}x`}
            onChange={(gain) => patchGrowlParams({ gain }, true)}
          />
          <Ts666RotaryKnob
            label="METAL"
            value={params.metal ?? 0.22}
            min={0}
            max={1}
            defaultValue={0.22}
            size="2xs"
            accent="copper"
            modTarget="GROWL_METAL"
            modOffset={modOffsets?.GROWL_METAL ?? 0}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(metal) => patchGrowlParams({ metal }, true)}
          />
          <Ts666RotaryKnob
            label="FM MTL"
            value={params.fmMetal ?? 0.14}
            min={0}
            max={1}
            defaultValue={0.14}
            size="2xs"
            accent="red"
            modTarget="GROWL_FM"
            modOffset={modOffsets?.GROWL_FM ?? 0}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(fmMetal) => patchGrowlParams({ fmMetal }, true)}
          />
          <Ts666RotaryKnob
            label="WOB RTE"
            value={syncOn ? divIdx : params.wobbleRate ?? 2.0}
            min={syncOn ? 0 : 0.1}
            max={syncOn ? TS666_LFO_SYNC_DIVISIONS.length - 1 : 20}
            step={syncOn ? 1 : 0.05}
            defaultValue={syncOn ? 9 : 2.0}
            logarithmic={!syncOn}
            size="2xs"
            accent="red"
            modTarget="GROWL_RATE"
            modOffset={modOffsets?.GROWL_RATE ?? 0}
            formatValue={(v) =>
              syncOn
                ? TS666_LFO_SYNC_DIVISIONS[Math.round(v)]?.id ?? '1/8'
                : `${v.toFixed(1)}`
            }
            onChange={(val) =>
              syncOn
                ? patchGrowlParams({ wobbleDivIdx: Math.round(val) }, true)
                : patchGrowlParams({ wobbleRate: val }, true)
            }
          />
          <Ts666RotaryKnob
            label="WOB DPT"
            value={params.wobbleDepth ?? 0.52}
            min={0}
            max={1}
            defaultValue={0.52}
            size="2xs"
            accent="red"
            modTarget="GROWL_DEPTH"
            modOffset={modOffsets?.GROWL_DEPTH ?? 0}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(wobbleDepth) => patchGrowlParams({ wobbleDepth }, true)}
          />
        </div>
      </div>
    </div>
  );
});
