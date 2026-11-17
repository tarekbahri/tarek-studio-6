import React, { useRef, useState } from 'react';
import { Activity, RotateCcw } from 'lucide-react';
import {
  AUTOMATION_PARAMS,
  sortAndDedupeAutomationPoints,
} from '../../audio/dawPresets';
import type {
  AutomationLane,
  AutomationParamId,
  AutomationPoint,
  DawPlayMode,
} from '../../types/daw';

interface DawAutomationEditorProps {
  lanes: Record<AutomationParamId, AutomationLane>;
  patternStepCount: number;
  songLengthSteps: number;
  songStartStep: number;
  playMode: DawPlayMode;
  isPlaying: boolean;
  dawStep: number;
  onUpdateLane: (
    paramId: AutomationParamId,
    updater: (prev: AutomationLane) => AutomationLane
  ) => void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export const DawAutomationEditor: React.FC<DawAutomationEditorProps> = ({
  lanes,
  patternStepCount,
  songLengthSteps,
  songStartStep,
  playMode,
  isPlaying,
  dawStep,
  onUpdateLane,
}) => {
  const [activeParam, setActiveParam] = useState<AutomationParamId>('serum.cutoff');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drawingRef = useRef<boolean>(false);

  const meta =
    AUTOMATION_PARAMS.find((p) => p.paramId === activeParam) ?? AUTOMATION_PARAMS[0];
  const lane = lanes[activeParam];
  const maxSteps = playMode === 'song' ? 64 : patternStepCount;

  const clientToPoint = (clientX: number, clientY: number): AutomationPoint => {
    const svg = svgRef.current;
    if (!svg) return { step: 0, value: 0.5 };
    const rect = svg.getBoundingClientRect();
    const xNorm = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const yNorm = clamp(1 - (clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    const step = Math.round(xNorm * maxSteps * 4) / 4;
    return { step, value: Number(yNorm.toFixed(3)) };
  };

  const applyDrawnPoint = (pt: AutomationPoint) => {
    onUpdateLane(activeParam, (prev) => {
      const filtered = prev.points.filter((p) => Math.abs(p.step - pt.step) > 0.35);
      return {
        ...prev,
        enabled: true,
        points: sortAndDedupeAutomationPoints([...filtered, pt]),
      };
    });
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    applyDrawnPoint(clientToPoint(e.clientX, e.clientY));
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current) return;
    applyDrawnPoint(clientToPoint(e.clientX, e.clientY));
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drawingRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    drawingRef.current = false;
  };

  const applyPresetCurve = (kind: 'up' | 'down' | 'wobble' | 'pulse' | 'reset') => {
    let pts: AutomationPoint[] = [];
    if (kind === 'up') {
      pts = [
        { step: 0, value: 0.1 },
        { step: maxSteps, value: 0.95 },
      ];
    } else if (kind === 'down') {
      pts = [
        { step: 0, value: 0.95 },
        { step: maxSteps, value: 0.1 },
      ];
    } else if (kind === 'wobble') {
      for (let i = 0; i <= 16; i++) {
        const s = (i / 16) * maxSteps;
        const v = 0.5 + 0.42 * Math.sin((i / 16) * Math.PI * 4);
        pts.push({ step: s, value: Number(v.toFixed(3)) });
      }
    } else if (kind === 'pulse') {
      pts = [
        { step: 0, value: 0.2 },
        { step: maxSteps * 0.24, value: 0.2 },
        { step: maxSteps * 0.25, value: 0.9 },
        { step: maxSteps * 0.49, value: 0.9 },
        { step: maxSteps * 0.5, value: 0.25 },
        { step: maxSteps * 0.74, value: 0.25 },
        { step: maxSteps * 0.75, value: 0.95 },
        { step: maxSteps, value: 0.25 },
      ];
    } else {
      pts = [
        { step: 0, value: meta.defaultValue },
        { step: maxSteps, value: meta.defaultValue },
      ];
    }
    onUpdateLane(activeParam, (prev) => ({
      ...prev,
      enabled: kind !== 'reset',
      points: sortAndDedupeAutomationPoints(pts),
    }));
  };

  // Playhead normalized X (0..100%)
  let playheadXNorm = -1;
  if (isPlaying) {
    if (playMode === 'song') {
      playheadXNorm = clamp((dawStep - songStartStep) / Math.max(1, songLengthSteps), 0, 1);
    } else {
      playheadXNorm = clamp((dawStep % maxSteps) / Math.max(1, maxSteps), 0, 1);
    }
  }

  const pts = lane.points;
  const polylinePoints = pts
    .map((p) => {
      const x = (clamp(p.step, 0, maxSteps) / Math.max(1, maxSteps)) * 800;
      const y = (1 - clamp(p.value, 0, 1)) * 220;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const areaPoints =
    pts.length > 0
      ? `0,220 ${polylinePoints} ${(
          (clamp(pts[pts.length - 1].step, 0, maxSteps) / Math.max(1, maxSteps)) *
          800
        ).toFixed(1)},220`
      : '';

  return (
    <div className="flex h-full min-h-0 gap-2">
      {/* Left Target Parameter List */}
      <aside className="w-44 sm:w-52 shrink-0 rounded-lg border border-[#242E40] bg-[#111622] flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-[#242E40] text-[11px] font-display font-semibold text-slate-200 flex items-center gap-1.5 shrink-0">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>Automation Targets</span>
        </div>
        <div className="flex-1 overflow-y-auto synth-scroll p-1.5 space-y-1">
          {AUTOMATION_PARAMS.map((param) => {
            const pLane = lanes[param.paramId];
            const selected = param.paramId === activeParam;
            return (
              <div
                key={param.paramId}
                className={`flex items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 transition-colors ${
                  selected
                    ? 'bg-cyan-500/15 border-cyan-400/50'
                    : 'bg-[#0D1119] border-[#20293B] hover:border-[#32405A]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveParam(param.paramId)}
                  className="flex-1 min-w-0 text-left cursor-pointer"
                >
                  <div className="text-[11px] font-medium text-slate-100 truncate">
                    {param.shortLabel}
                  </div>
                  <div className="text-[9px] font-mono-num text-slate-400">
                    {param.group} · {pLane.points.length} pts
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`Toggle ${param.label}`}
                  onClick={() =>
                    onUpdateLane(param.paramId, (prev) => ({
                      ...prev,
                      enabled: !prev.enabled,
                    }))
                  }
                  className={`px-1.5 h-6 rounded text-[9px] font-bold uppercase cursor-pointer shrink-0 ${
                    pLane.enabled
                      ? 'bg-emerald-500/25 border border-emerald-400/60 text-emerald-300'
                      : 'bg-[#141B29] border border-[#263042] text-slate-500'
                  }`}
                >
                  {pLane.enabled ? 'ON' : 'OFF'}
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Right Curve Canvas & Curve Presets */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-1.5 rounded-lg bg-[#111622] border border-[#242E40] shrink-0">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: meta.color }}
            />
            <span className="text-xs font-display font-semibold text-slate-100">
              {meta.label}
            </span>
            <span className="text-[11px] text-slate-400">
              {lane.enabled ? 'Active' : 'Bypassed'}
            </span>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => applyPresetCurve('up')}
              className="px-2 h-7 rounded bg-[#090C12] border border-[#242E40] text-[11px] text-slate-200 hover:text-cyan-300 cursor-pointer"
            >
              Ramp Up
            </button>
            <button
              type="button"
              onClick={() => applyPresetCurve('down')}
              className="px-2 h-7 rounded bg-[#090C12] border border-[#242E40] text-[11px] text-slate-200 hover:text-cyan-300 cursor-pointer"
            >
              Ramp Down
            </button>
            <button
              type="button"
              onClick={() => applyPresetCurve('wobble')}
              className="px-2 h-7 rounded bg-[#090C12] border border-[#242E40] text-[11px] text-slate-200 hover:text-cyan-300 cursor-pointer"
            >
              Sine Wave
            </button>
            <button
              type="button"
              onClick={() => applyPresetCurve('pulse')}
              className="px-2 h-7 rounded bg-[#090C12] border border-[#242E40] text-[11px] text-slate-200 hover:text-cyan-300 cursor-pointer"
            >
              Step Gate
            </button>
            <button
              type="button"
              onClick={() => applyPresetCurve('reset')}
              className="inline-flex items-center gap-1 px-2 h-7 rounded bg-[#090C12] border border-[#242E40] text-[11px] text-slate-300 hover:text-rose-300 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 rounded-lg border border-[#242E40] bg-[#0B0E14] p-2 flex flex-col">
          <p className="text-[10px] text-slate-400 mb-1 shrink-0">
            Tap or drag anywhere on the grid to draw smooth BPM-synced automation curves.
          </p>
          <div className="flex-1 min-h-0 relative">
            <svg
              ref={svgRef}
              viewBox="0 0 800 220"
              preserveAspectRatio="none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{ touchAction: 'none' }}
              className="w-full h-full rounded bg-[#0D121B] border border-[#1E2738] cursor-crosshair"
            >
              {/* Grid lines */}
              {[0.25, 0.5, 0.75].map((yFrac) => (
                <line
                  key={yFrac}
                  x1={0}
                  y1={yFrac * 220}
                  x2={800}
                  y2={yFrac * 220}
                  stroke="#1B2434"
                  strokeWidth={1}
                />
              ))}
              {Array.from({ length: 16 }, (_, i) => (
                <line
                  key={i}
                  x1={(i / 16) * 800}
                  y1={0}
                  x2={(i / 16) * 800}
                  y2={220}
                  stroke={i % 4 === 0 ? '#2C3A52' : '#161E2C'}
                  strokeWidth={1}
                />
              ))}

              {/* Curve fill & stroke */}
              {pts.length > 0 && (
                <>
                  <polygon points={areaPoints} fill={meta.color} fillOpacity={0.14} />
                  <polyline
                    points={polylinePoints}
                    fill="none"
                    stroke={meta.color}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                  />
                  {pts.map((pt, idx) => (
                    <circle
                      key={idx}
                      cx={(clamp(pt.step, 0, maxSteps) / Math.max(1, maxSteps)) * 800}
                      cy={(1 - clamp(pt.value, 0, 1)) * 220}
                      r={4}
                      fill="#0B0E14"
                      stroke={meta.color}
                      strokeWidth={2}
                    />
                  ))}
                </>
              )}

              {/* Live Playhead */}
              {playheadXNorm >= 0 && (
                <line
                  x1={playheadXNorm * 800}
                  y1={0}
                  x2={playheadXNorm * 800}
                  y2={220}
                  stroke="#34D399"
                  strokeWidth={2}
                />
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
