import React, { useEffect, useRef, useState } from 'react';
import { Power, Repeat, RotateCcw, Trash2 } from 'lucide-react';
import {
  AUTOMATION_TARGET_META,
  evaluateAutomationLane,
} from '../../audio/bassRemixPresets';
import {
  getBassRemixTelemetry,
  subscribeBassRemixTelemetry,
} from '../../audio/bassRemixTelemetryStore';
import type {
  BassRemixAutomationPoint,
  BassRemixAutomationState,
  BassRemixAutomationTarget,
  BassRemixCurveMode,
  BassRemixSnapGrid,
} from '../../types/bassRemix';

interface BassRemixAutomationEditorProps {
  automation: BassRemixAutomationState;
  bpm: number;
  onChange: (next: BassRemixAutomationState) => void;
}

const SNAP_OPTIONS: BassRemixSnapGrid[] = [
  'off',
  '1/1',
  '1/2',
  '1/4',
  '1/8',
  '1/16',
  '1/32',
];

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function snapTimeNorm(
  t: number,
  snap: BassRemixSnapGrid,
  bars: number
): number {
  if (snap === 'off') return clamp(t, 0, 1);
  const denom = parseInt(snap.split('/')[1] || '16', 10);
  const totalGridSteps = Math.max(1, bars * denom);
  return clamp(Math.round(t * totalGridSteps) / totalGridSteps, 0, 1);
}

export const BassRemixAutomationEditor: React.FC<BassRemixAutomationEditorProps> = React.memo(({
  automation,
  bpm,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);

  const autoRef = useRef(automation);
  autoRef.current = automation;
  const selectedIdRef = useRef(selectedPointId);
  selectedIdRef.current = selectedPointId;

  const activeTarget = automation.activeTarget;
  const activeLane = automation.lanes[activeTarget];
  const activeMeta =
    AUTOMATION_TARGET_META.find((m) => m.id === activeTarget) ??
    AUTOMATION_TARGET_META[0];

  const updateLane = (
    target: BassRemixAutomationTarget,
    updater: (pts: BassRemixAutomationPoint[], enabled: boolean) => {
      points: BassRemixAutomationPoint[];
      enabled: boolean;
    }
  ) => {
    const lane = automation.lanes[target];
    const res = updater(lane.points, lane.enabled);
    const sorted = [...res.points].sort((a, b) => a.timeNorm - b.timeNorm);
    onChange({
      ...automation,
      lanes: {
        ...automation.lanes,
        [target]: {
          ...lane,
          enabled: res.enabled,
          points: sorted,
        },
      },
    });
  };

  // Draw Automation Lanes + Grid + Points + Synced Playhead
  useEffect(() => {
    let rafId = 0;

    const render = () => {
      const canvas = canvasRef.current;
      if (canvas && canvas.offsetParent !== null) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.clientWidth;
          const h = canvas.clientHeight;
          if (w > 0 && h > 0) {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const tw = Math.floor(w * dpr);
            const th = Math.floor(h * dpr);
            if (canvas.width !== tw || canvas.height !== th) {
              canvas.width = tw;
              canvas.height = th;
            }

            ctx.save();
            ctx.scale(dpr, dpr);

            const auto = autoRef.current;
            const curLane = auto.lanes[auto.activeTarget];

            // Backdrop
            ctx.fillStyle = '#080503';
            ctx.fillRect(0, 0, w, h);

            // Grid lines
            const denom =
              auto.snapGrid === 'off'
                ? 16
                : parseInt(auto.snapGrid.split('/')[1] || '16', 10);
            const totalDivs = Math.min(64, Math.max(4, auto.bars * Math.min(denom, 16)));
            for (let g = 1; g < totalDivs; g++) {
              const x = (g / totalDivs) * w;
              const isBar = g % Math.max(1, totalDivs / auto.bars) === 0;
              ctx.strokeStyle = isBar ? '#472B19' : '#24140C';
              ctx.lineWidth = isBar ? 1.2 : 0.8;
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, h);
              ctx.stroke();
            }
            for (let r = 1; r < 4; r++) {
              const y = (r / 4) * h;
              ctx.strokeStyle = '#24140C';
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(w, y);
              ctx.stroke();
            }

            // Ghost overlay of other enabled lanes
            for (const meta of AUTOMATION_TARGET_META) {
              if (meta.id === auto.activeTarget) continue;
              const lane = auto.lanes[meta.id];
              if (!lane?.enabled || lane.points.length === 0) continue;
              ctx.beginPath();
              const steps = 64;
              for (let s = 0; s <= steps; s++) {
                const tn = s / steps;
                const val = evaluateAutomationLane(lane, tn);
                const x = tn * w;
                const y = (1 - val) * (h - 10) + 5;
                if (s === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              }
              ctx.strokeStyle = meta.color;
              ctx.globalAlpha = 0.3;
              ctx.lineWidth = 1.25;
              ctx.stroke();
              ctx.globalAlpha = 1;
            }

            // Active lane curve + shaded fill
            const meta =
              AUTOMATION_TARGET_META.find((m) => m.id === auto.activeTarget) ??
              AUTOMATION_TARGET_META[0];
            const samples = 128;
            ctx.beginPath();
            for (let s = 0; s <= samples; s++) {
              const tn = s / samples;
              const val = evaluateAutomationLane(curLane, tn);
              const x = tn * w;
              const y = (1 - val) * (h - 10) + 5;
              if (s === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = curLane.enabled ? meta.color : '#8C6242';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.lineTo(w, h);
            ctx.lineTo(0, h);
            ctx.closePath();
            ctx.fillStyle = curLane.enabled
              ? 'rgba(239, 68, 68, 0.14)'
              : 'rgba(140, 98, 66, 0.08)';
            ctx.fill();

            // Draw editable points
            for (const pt of curLane.points) {
              const px = pt.timeNorm * w;
              const py = (1 - pt.value) * (h - 10) + 5;
              const isSel = pt.id === selectedIdRef.current;

              ctx.beginPath();
              ctx.arc(px, py, isSel ? 6 : 4.5, 0, Math.PI * 2);
              ctx.fillStyle = isSel ? '#FFFFFF' : meta.color;
              ctx.fill();
              ctx.lineWidth = 1.5;
              ctx.strokeStyle = '#0D0704';
              ctx.stroke();

              if (pt.curve === 'step') {
                ctx.fillStyle = '#FDE68A';
                ctx.fillRect(px - 2, py - 2, 4, 4);
              }
            }

            // Synced playhead cursor
            const telem = getBassRemixTelemetry();
            if (telem.isPlaying) {
              const px = clamp(telem.selProgressNorm, 0, 1) * w;
              ctx.strokeStyle = '#FCA5A5';
              ctx.lineWidth = 1.8;
              ctx.beginPath();
              ctx.moveTo(px, 0);
              ctx.lineTo(px, h);
              ctx.stroke();
            }

            ctx.restore();
          }
        }
      }
      rafId = requestAnimationFrame(render);
    };

    const unsub = subscribeBassRemixTelemetry(() => {});
    rafId = requestAnimationFrame(render);
    return () => {
      unsub();
      cancelAnimationFrame(rafId);
    };
  }, []);

  const getCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { t: 0, v: 0.5, px: 0, py: 0, w: 1, h: 1 };
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const t = clamp(px / Math.max(1, rect.width), 0, 1);
    const v = clamp(1 - (py - 5) / Math.max(1, rect.height - 10), 0, 1);
    return { t, v, px, py, w: rect.width, h: rect.height };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { t, v, px, py, w, h } = getCoords(e.clientX, e.clientY);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    // Hit test existing points
    let hit: BassRemixAutomationPoint | null = null;
    let bestDist = 16;
    for (const pt of activeLane.points) {
      const ptX = pt.timeNorm * w;
      const ptY = (1 - pt.value) * (h - 10) + 5;
      const d = Math.hypot(px - ptX, py - ptY);
      if (d < bestDist) {
        bestDist = d;
        hit = pt;
      }
    }

    if (hit) {
      setSelectedPointId(hit.id);
      draggingIdRef.current = hit.id;
      return;
    }

    // Add a new point and start dragging it (and auto-enable lane when editing)
    const snappedT = snapTimeNorm(t, automation.snapGrid, automation.bars);
    const newId = `pt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const newPt: BassRemixAutomationPoint = {
      id: newId,
      timeNorm: snappedT,
      value: v,
      curve: 'smooth',
    };
    setSelectedPointId(newId);
    draggingIdRef.current = newId;
    updateLane(activeTarget, (pts) => ({
      enabled: true,
      points: [...pts, newPt],
    }));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const id = draggingIdRef.current;
    if (!id) return;
    const { t, v } = getCoords(e.clientX, e.clientY);
    const snappedT = snapTimeNorm(t, automation.snapGrid, automation.bars);
    updateLane(activeTarget, (pts, enabled) => ({
      enabled,
      points: pts.map((p) =>
        p.id === id ? { ...p, timeNorm: snappedT, value: v } : p
      ),
    }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingIdRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
  };

  const selectedPt = activeLane.points.find((p) => p.id === selectedPointId) ?? null;

  const applyPresetCurve = (shape: 'ramp' | 'drop' | 'wob' | 'pump') => {
    let pts: BassRemixAutomationPoint[] = [];
    if (shape === 'ramp') {
      pts = [
        { id: 'r0', timeNorm: 0, value: 0.15, curve: 'smooth' },
        { id: 'r1', timeNorm: 1, value: 0.92, curve: 'smooth' },
      ];
    } else if (shape === 'drop') {
      pts = [
        { id: 'd0', timeNorm: 0, value: 0.9, curve: 'smooth' },
        { id: 'd1', timeNorm: 0.5, value: 0.25, curve: 'step' },
        { id: 'd2', timeNorm: 0.75, value: 0.85, curve: 'smooth' },
        { id: 'd3', timeNorm: 1, value: 0.2, curve: 'smooth' },
      ];
    } else if (shape === 'wob') {
      pts = [
        { id: 'w0', timeNorm: 0, value: 0.25, curve: 'smooth' },
        { id: 'w1', timeNorm: 0.25, value: 0.85, curve: 'smooth' },
        { id: 'w2', timeNorm: 0.5, value: 0.25, curve: 'smooth' },
        { id: 'w3', timeNorm: 0.75, value: 0.85, curve: 'smooth' },
        { id: 'w4', timeNorm: 1, value: 0.25, curve: 'smooth' },
      ];
    } else {
      pts = [
        { id: 'p0', timeNorm: 0, value: 0.1, curve: 'smooth' },
        { id: 'p1', timeNorm: 0.2, value: 0.9, curve: 'step' },
        { id: 'p2', timeNorm: 0.5, value: 0.12, curve: 'smooth' },
        { id: 'p3', timeNorm: 0.7, value: 0.9, curve: 'smooth' },
        { id: 'p4', timeNorm: 1, value: 0.2, curve: 'smooth' },
      ];
    }
    updateLane(activeTarget, () => ({ enabled: true, points: pts }));
    setSelectedPointId(pts[0]?.id ?? null);
  };

  return (
    <div className="flex flex-col rounded-lg border border-[#5B3A22] bg-[#160E09] overflow-hidden h-full min-h-0">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-1.5 px-2 py-1 bg-[#22140C] border-b border-[#4A2E1B] shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="font-display text-[10.5px] font-bold tracking-wider text-[#E08A3C]">
            AUTOMATION
          </span>
          <button
            type="button"
            onClick={() =>
              updateLane(activeTarget, (pts, en) => ({ enabled: !en, points: pts }))
            }
            style={{ touchAction: 'manipulation' }}
            className={`inline-flex items-center gap-1 px-1.5 h-6 rounded border text-[9px] font-display font-bold cursor-pointer transition-colors ${
              activeLane.enabled
                ? 'bg-[#DC2626]/25 border-[#EF4444] text-[#FCA5A5]'
                : 'bg-[#0F0905] border-[#4A2E1B] text-[#9A7455]'
            }`}
          >
            <Power className="w-2.5 h-2.5" />
            <span>{activeLane.enabled ? 'LANE ON' : 'LANE OFF'}</span>
          </button>
        </div>

        {/* Grid, BPM Sync, Loop & Curve Tools */}
        <div className="flex items-center gap-1 flex-wrap">
          <select
            aria-label="Automation Snap Grid"
            value={automation.snapGrid}
            onChange={(e) =>
              onChange({ ...automation, snapGrid: e.target.value as BassRemixSnapGrid })
            }
            className="h-6 px-1 rounded bg-[#0F0905] border border-[#4A2E1B] font-mono-num text-[9.5px] text-[#F6E2CE] cursor-pointer"
          >
            {SNAP_OPTIONS.map((g) => (
              <option key={g} value={g}>
                Snap {g.toUpperCase()}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => onChange({ ...automation, bpmSync: !automation.bpmSync })}
            className={`px-1.5 h-6 rounded border text-[9px] font-mono-num font-bold cursor-pointer ${
              automation.bpmSync
                ? 'bg-[#CD7F32]/25 border-[#E08A3C] text-[#FDE68A]'
                : 'bg-[#0F0905] border-[#4A2E1B] text-[#9A7455]'
            }`}
          >
            {automation.bpmSync ? `BPM ${bpm}` : 'FREE'}
          </button>

          {automation.bpmSync && (
            <select
              aria-label="Automation Bars"
              value={automation.bars}
              onChange={(e) =>
                onChange({ ...automation, bars: parseInt(e.target.value, 10) })
              }
              className="h-6 px-1 rounded bg-[#0F0905] border border-[#4A2E1B] font-mono-num text-[9.5px] text-[#F6E2CE] cursor-pointer"
            >
              {[1, 2, 4, 8].map((b) => (
                <option key={b} value={b}>
                  {b} Bar{b > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() =>
              onChange({ ...automation, loopAutomation: !automation.loopAutomation })
            }
            title="Loop Automation Curve"
            className={`inline-flex items-center gap-0.5 px-1.5 h-6 rounded border text-[9px] font-display font-bold cursor-pointer ${
              automation.loopAutomation
                ? 'bg-[#DC2626]/20 border-[#EF4444] text-[#FCA5A5]'
                : 'bg-[#0F0905] border-[#4A2E1B] text-[#9A7455]'
            }`}
          >
            <Repeat className="w-2.5 h-2.5" />
            <span>LOOP</span>
          </button>
        </div>
      </div>

      {/* 7 Parameter Lane Tabs */}
      <div className="flex items-center gap-1 px-2 py-1 bg-[#120B07] border-b border-[#3D2516] overflow-x-auto synth-scroll shrink-0">
        {AUTOMATION_TARGET_META.map((meta) => {
          const lane = automation.lanes[meta.id];
          const isActive = activeTarget === meta.id;
          return (
            <button
              key={meta.id}
              type="button"
              onClick={() => {
                onChange({ ...automation, activeTarget: meta.id });
                setSelectedPointId(null);
              }}
              style={{ touchAction: 'manipulation' }}
              className={`px-2 h-6 rounded text-[9px] font-display font-bold whitespace-nowrap shrink-0 border cursor-pointer transition-colors ${
                isActive
                  ? 'bg-[#DC2626] border-[#FCA5A5] text-white'
                  : lane?.enabled
                  ? 'bg-[#2A180F] border-[#E08A3C]/70 text-[#FDE68A]'
                  : 'bg-[#0D0704] border-[#3D2516] text-[#B79374] hover:text-white'
              }`}
            >
              {meta.shortLabel}
              {lane?.enabled ? ' •' : ''}
            </button>
          );
        })}
      </div>

      {/* Interactive Curve Canvas */}
      <div className="flex-1 min-h-[74px] relative p-1 bg-[#080503]">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: 'none' }}
          className="w-full h-full block cursor-crosshair rounded border border-[#3B2314]"
          aria-label={`Automation Curve Editor for ${activeMeta.label}`}
        />

        {selectedPt && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-[#140B06]/90 px-1.5 py-0.5 rounded border border-[#5B3A22] text-[9px] font-mono-num text-[#F6E2CE]">
            <span>{activeMeta.formatValue(selectedPt.value)}</span>
            {(['smooth', 'linear', 'step'] as BassRemixCurveMode[]).map((cm) => (
              <button
                key={cm}
                type="button"
                onClick={() =>
                  updateLane(activeTarget, (pts, en) => ({
                    enabled: en,
                    points: pts.map((p) =>
                      p.id === selectedPt.id ? { ...p, curve: cm } : p
                    ),
                  }))
                }
                className={`px-1 h-4 rounded text-[8.5px] uppercase cursor-pointer ${
                  selectedPt.curve === cm
                    ? 'bg-[#E08A3C] text-black font-bold'
                    : 'bg-[#23140B] text-[#D7B899]'
                }`}
              >
                {cm === 'smooth' ? 'SM' : cm === 'linear' ? 'LIN' : 'STP'}
              </button>
            ))}
            {activeLane.points.length > 2 && (
              <button
                type="button"
                aria-label="Delete Selected Point"
                onClick={() => {
                  updateLane(activeTarget, (pts, en) => ({
                    enabled: en,
                    points: pts.filter((p) => p.id !== selectedPt.id),
                  }));
                  setSelectedPointId(null);
                }}
                className="w-4 h-4 rounded bg-[#3A1414] text-[#FCA5A5] flex items-center justify-center cursor-pointer"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Shape Presets & Reset */}
      <div className="flex items-center justify-between gap-1 px-2 py-1 bg-[#120B07] border-t border-[#3D2516] shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-[#9A7455] font-semibold">SHAPE:</span>
          {(['ramp', 'drop', 'wob', 'pump'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => applyPresetCurve(s)}
              className="px-1.5 h-5 rounded bg-[#1E120B] hover:bg-[#321E12] border border-[#4A2E1B] text-[8.5px] font-display font-bold uppercase text-[#D7B899] hover:text-white cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            updateLane(activeTarget, () => ({
              enabled: false,
              points: [
                { id: `${activeTarget}-r0`, timeNorm: 0, value: 0.5, curve: 'smooth' },
                { id: `${activeTarget}-r1`, timeNorm: 1, value: 0.5, curve: 'smooth' },
              ],
            }));
            setSelectedPointId(null);
          }}
          className="inline-flex items-center gap-1 px-1.5 h-5 rounded bg-[#1E120B] hover:bg-[#321E12] border border-[#4A2E1B] text-[8.5px] font-display font-bold text-[#D7B899] hover:text-white cursor-pointer"
        >
          <RotateCcw className="w-2.5 h-2.5" />
          <span>RESET</span>
        </button>
      </div>
    </div>
  );
});
