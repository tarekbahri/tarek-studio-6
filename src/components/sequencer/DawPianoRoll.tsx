import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Eraser,
  Magnet,
  MousePointer2,
  Pencil,
  SlidersHorizontal,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { beatboxEngine } from '../../audio/BeatboxEngine';
import { SNAP_OPTIONS, snapToSteps } from '../../audio/sequencerStorage';
import { studioAudio } from '../../audio/StudioAudio';
import { subbassEngine } from '../../audio/SubbassEngine';
import { synthEngine } from '../../audio/SynthEngine';
import { sixSixSixEngine } from '../../audio/ts666/SixSixSixEngine';
import type { DawMidiNote, DawMidiOutputTarget, DawPattern } from '../../types/daw';
import type { PianoRollTool, SnapDivision } from '../../types/sequencer';

interface DawPianoRollProps {
  pattern: DawPattern;
  outputTarget: DawMidiOutputTarget;
  snap: SnapDivision;
  isPlaying: boolean;
  playMode: 'pattern' | 'song';
  dawStep: number;
  onChangeOutputTarget: (target: DawMidiOutputTarget) => void;
  onChangeSnap: (snap: SnapDivision) => void;
  onUpdateNotes: (updater: (prev: DawMidiNote[]) => DawMidiNote[]) => void;
}

const MIN_MIDI = 36; // C2
const MAX_MIDI = 84; // C6
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

function midiLabel(midi: number): string {
  const semi = midi % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[semi]}${oct}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export const DawPianoRoll: React.FC<DawPianoRollProps> = ({
  pattern,
  outputTarget,
  snap,
  isPlaying,
  playMode,
  dawStep,
  onChangeOutputTarget,
  onChangeSnap,
  onUpdateNotes,
}) => {
  const [tool, setTool] = useState<PianoRollTool>('draw');
  const [stepWidth, setStepWidth] = useState<number>(42);
  const [rowHeight, setRowHeight] = useState<number>(20);
  const [showVelocity, setShowVelocity] = useState<boolean>(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeKeyMidis, setActiveKeyMidis] = useState<Set<number>>(new Set());

  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const keysScrollRef = useRef<HTMLDivElement | null>(null);
  const rulerScrollRef = useRef<HTMLDivElement | null>(null);
  const velScrollRef = useRef<HTMLDivElement | null>(null);

  const dragRef = useRef<
    | {
        kind: 'move';
        pointerId: number;
        startX: number;
        startY: number;
        originStep: number;
        originMidi: number;
        noteId: string;
        lastPreviewMidi: number;
      }
    | {
        kind: 'resize';
        pointerId: number;
        noteId: string;
        startX: number;
        originDuration: number;
        noteStep: number;
      }
    | null
  >(null);

  const totalSteps = pattern.stepCount;
  const notes = pattern.pianoRollNotes;
  const snapSteps = snapToSteps(snap);

  const midiRows = useMemo(() => {
    const arr: number[] = [];
    for (let m = MAX_MIDI; m >= MIN_MIDI; m--) arr.push(m);
    return arr;
  }, []);

  useEffect(() => {
    const g = gridScrollRef.current;
    if (!g) return;
    const c3Index = MAX_MIDI - 52;
    const targetTop = Math.max(0, c3Index * rowHeight - g.clientHeight / 2);
    g.scrollTop = targetTop;
    if (keysScrollRef.current) keysScrollRef.current.scrollTop = targetTop;
  }, [rowHeight]);

  const syncScroll = useCallback(() => {
    const g = gridScrollRef.current;
    if (!g) return;
    if (keysScrollRef.current) keysScrollRef.current.scrollTop = g.scrollTop;
    if (rulerScrollRef.current) rulerScrollRef.current.scrollLeft = g.scrollLeft;
    if (velScrollRef.current) velScrollRef.current.scrollLeft = g.scrollLeft;
  }, []);

  const auditionNote = useCallback(
    (midi: number, target: DawMidiOutputTarget, velocity = 0.88) => {
      studioAudio.unlockSync();
      if (target === 'beatbox' || target === 'both' || target === 'all') {
        void studioAudio.ensureAudio().then((ctx) => {
          beatboxEngine.scheduleByMidiNote(midi, velocity, ctx.currentTime);
        });
      }
      if (target === 'serum' || target === 'both' || target === 'all') {
        void synthEngine.ensureAudio().then((ctx) => {
          const now = ctx.currentTime;
          void synthEngine.scheduleNote(midi, velocity, now, now + 0.18);
        });
      }
      if (target === 'subbass' || target === 'all') {
        void subbassEngine.ensureAudio().then((ctx) => {
          const now = ctx.currentTime;
          subbassEngine.scheduleNote(midi, velocity, now, now + 0.24);
        });
      }
      if (target === 'ts666' || target === 'all') {
        void sixSixSixEngine.ensureAudio().then((ctx) => {
          if (!ctx) return;
          const now = ctx.currentTime;
          sixSixSixEngine.scheduleNote(midi, velocity, now, now + 0.22);
        });
      }
    },
    []
  );

  const handleGridClick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const g = gridScrollRef.current;
    if (!g) return;
    const rect = g.getBoundingClientRect();
    const x = e.clientX - rect.left + g.scrollLeft;
    const y = e.clientY - rect.top + g.scrollTop;
    const rawStep = clamp(x / stepWidth, 0, totalSteps - 0.125);
    const rowIdx = clamp(Math.floor(y / rowHeight), 0, midiRows.length - 1);
    const midi = midiRows[rowIdx];

    if (tool !== 'draw') {
      setSelectedIds(new Set());
      return;
    }

    const snappedStep = clamp(
      Math.floor(rawStep / snapSteps) * snapSteps,
      0,
      totalSteps - Math.min(1, snapSteps)
    );
    const dur = clamp(Math.max(1, snapSteps), 0.25, totalSteps - snappedStep);
    const id = `dn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newNote: DawMidiNote = {
      id,
      midi,
      step: snappedStep,
      duration: dur,
      velocity: 0.88,
      target: outputTarget,
    };
    onUpdateNotes((prev) => [...prev, newNote]);
    setSelectedIds(new Set([id]));
    auditionNote(midi, outputTarget, 0.88);
  };

  const handleNotePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    note: DawMidiNote
  ) => {
    e.stopPropagation();
    if (tool === 'erase') {
      onUpdateNotes((prev) => prev.filter((n) => n.id !== note.id));
      return;
    }
    setSelectedIds(new Set([note.id]));
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: 'move',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originStep: note.step,
      originMidi: note.midi,
      noteId: note.id,
      lastPreviewMidi: note.midi,
    };
    auditionNote(note.midi, note.target, note.velocity);
  };

  const handleResizePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    note: DawMidiNote
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: 'resize',
      pointerId: e.pointerId,
      noteId: note.id,
      startX: e.clientX,
      originDuration: note.duration,
      noteStep: note.step,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;

    if (d.kind === 'move') {
      const dxSteps = (e.clientX - d.startX) / stepWidth;
      const dySemis = Math.round((d.startY - e.clientY) / rowHeight);
      const nextStep = clamp(
        Math.round((d.originStep + dxSteps) / snapSteps) * snapSteps,
        0,
        totalSteps - 0.25
      );
      const nextMidi = clamp(d.originMidi + dySemis, MIN_MIDI, MAX_MIDI);

      if (nextMidi !== d.lastPreviewMidi) {
        d.lastPreviewMidi = nextMidi;
        const target = notes.find((n) => n.id === d.noteId)?.target ?? outputTarget;
        auditionNote(nextMidi, target, 0.85);
      }

      onUpdateNotes((prev) =>
        prev.map((n) =>
          n.id === d.noteId
            ? {
                ...n,
                step: clamp(nextStep, 0, totalSteps - n.duration),
                midi: nextMidi,
              }
            : n
        )
      );
    } else if (d.kind === 'resize') {
      const dxSteps = (e.clientX - d.startX) / stepWidth;
      const nextDur = clamp(
        Math.round((d.originDuration + dxSteps) / snapSteps) * snapSteps,
        Math.min(0.25, snapSteps),
        totalSteps - d.noteStep
      );
      onUpdateNotes((prev) =>
        prev.map((n) => (n.id === d.noteId ? { ...n, duration: nextDur } : n))
      );
    }
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleQuantize = () => {
    const qStep = snap === 'off' ? 0.5 : snapSteps;
    onUpdateNotes((prev) =>
      prev.map((n) => {
        if (selectedIds.size > 0 && !selectedIds.has(n.id)) return n;
        const qStart = clamp(
          Math.round(n.step / qStep) * qStep,
          0,
          totalSteps - qStep
        );
        const qDur = clamp(
          Math.max(qStep, Math.round(n.duration / qStep) * qStep),
          qStep,
          totalSteps - qStart
        );
        return { ...n, step: qStart, duration: qDur };
      })
    );
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    onUpdateNotes((prev) => prev.filter((n) => !selectedIds.has(n.id)));
    setSelectedIds(new Set());
  };

  const handleRetarget = (target: DawMidiOutputTarget) => {
    onChangeOutputTarget(target);
    if (selectedIds.size > 0) {
      onUpdateNotes((prev) =>
        prev.map((n) => (selectedIds.has(n.id) ? { ...n, target } : n))
      );
    }
  };

  const gridWidth = totalSteps * stepWidth;
  const gridHeight = midiRows.length * rowHeight;
  const playheadPos =
    isPlaying && playMode === 'pattern' ? dawStep % totalSteps : -1;

  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#111622] border border-[#242E40] shrink-0">
        <div className="flex items-center gap-1 flex-wrap">
          {/* Tools */}
          <div className="flex items-center gap-0.5 bg-[#090C12] p-0.5 rounded-md border border-[#242E40]">
            {(
              [
                { id: 'draw', label: 'Draw', icon: Pencil },
                { id: 'select', label: 'Select', icon: MousePointer2 },
                { id: 'erase', label: 'Erase', icon: Eraser },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTool(t.id)}
                  className={`inline-flex items-center gap-1 px-2 h-7 rounded text-[11px] font-medium cursor-pointer ${
                    tool === t.id
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* MIDI Output Target */}
          <div className="flex items-center gap-0.5 bg-[#090C12] p-0.5 rounded-md border border-[#242E40]">
            <span className="text-[10px] text-slate-400 px-1.5">OUT</span>
            {(['serum', 'subbass', 'ts666', 'beatbox', 'both', 'all'] as DawMidiOutputTarget[]).map((tgt) => (
              <button
                key={tgt}
                type="button"
                onClick={() => handleRetarget(tgt)}
                className={`px-2 h-7 rounded text-[10px] font-display font-bold uppercase cursor-pointer ${
                  outputTarget === tgt
                    ? tgt === 'beatbox'
                      ? 'bg-amber-500 text-slate-950'
                      : tgt === 'subbass'
                      ? 'bg-violet-500 text-white'
                      : tgt === 'ts666'
                      ? 'bg-rose-500 text-white'
                      : tgt === 'both' || tgt === 'all'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tgt === 'subbass' ? 'SUB' : tgt === 'ts666' ? '666' : tgt}
              </button>
            ))}
          </div>

          {/* Snap & Quantize */}
          <select
            aria-label="Piano Roll Snap"
            value={snap}
            onChange={(e) => onChangeSnap(e.target.value as SnapDivision)}
            className="h-8 px-2 rounded-md bg-[#090C12] border border-[#242E40] text-[11px] text-slate-200 focus:outline-none focus:border-cyan-400"
          >
            {SNAP_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                Snap {opt.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleQuantize}
            title="Quantize Selected (or All) Notes"
            className="inline-flex items-center gap-1 px-2 h-8 rounded-md bg-[#090C12] border border-[#242E40] text-[11px] font-medium text-cyan-300 hover:border-cyan-400/50 cursor-pointer"
          >
            <Magnet className="w-3.5 h-3.5" />
            <span>Quantize</span>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label="Zoom Out"
            onClick={() => setStepWidth((w) => Math.max(24, w - 8))}
            className="w-8 h-8 rounded-md bg-[#090C12] border border-[#242E40] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Zoom In"
            onClick={() => setStepWidth((w) => Math.min(84, w + 8))}
            className="w-8 h-8 rounded-md bg-[#090C12] border border-[#242E40] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowVelocity((v) => !v)}
            className={`inline-flex items-center gap-1 px-2 h-8 rounded-md border text-[11px] cursor-pointer ${
              showVelocity
                ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300'
                : 'bg-[#090C12] border-[#242E40] text-slate-400'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Vel</span>
          </button>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={handleDeleteSelected}
              className="inline-flex items-center gap-1 px-2 h-8 rounded-md bg-rose-500/20 border border-rose-400/50 text-rose-300 text-[11px] cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Piano Roll Main Area */}
      <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-[#242E40] bg-[#0B0E14] overflow-hidden">
        {/* Top Ruler */}
        <div className="flex h-6 border-b border-[#242E40] bg-[#101521] shrink-0">
          <div className="w-14 shrink-0 border-r border-[#242E40] flex items-center justify-center font-mono-num text-[10px] text-slate-400">
            {totalSteps}S
          </div>
          <div
            ref={rulerScrollRef}
            className="flex-1 overflow-hidden relative"
          >
            <div className="relative h-full" style={{ width: gridWidth }}>
              {Array.from({ length: totalSteps }, (_, s) => (
                <div
                  key={s}
                  style={{ left: s * stepWidth, width: stepWidth }}
                  className={`absolute top-0 bottom-0 border-l px-1 flex items-center font-mono-num text-[10px] ${
                    s % 4 === 0
                      ? 'border-[#33425C] text-slate-200 font-semibold'
                      : 'border-[#1B2332] text-slate-500'
                  }`}
                >
                  {s % 4 === 0 ? `${Math.floor(s / 16) + 1}.${(Math.floor(s / 4) % 4) + 1}` : ''}
                </div>
              ))}
              {playheadPos >= 0 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 pointer-events-none"
                  style={{ transform: `translateX(${playheadPos * stepWidth}px)` }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Keyboard + Grid */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Vertical Piano Keys */}
          <div
            ref={keysScrollRef}
            className="w-14 shrink-0 border-r border-[#242E40] overflow-hidden bg-[#0D1119]"
          >
            <div style={{ height: gridHeight }}>
              {midiRows.map((midi) => {
                const isBlack = BLACK_SEMITONES.has(midi % 12);
                const isC = midi % 12 === 0;
                const isDown = activeKeyMidis.has(midi);
                return (
                  <button
                    key={midi}
                    type="button"
                    onPointerDown={() => {
                      setActiveKeyMidis((prev) => new Set(prev).add(midi));
                      auditionNote(midi, outputTarget, 0.9);
                    }}
                    onPointerUp={() =>
                      setActiveKeyMidis((prev) => {
                        const n = new Set(prev);
                        n.delete(midi);
                        return n;
                      })
                    }
                    onPointerLeave={() =>
                      setActiveKeyMidis((prev) => {
                        const n = new Set(prev);
                        n.delete(midi);
                        return n;
                      })
                    }
                    style={{ height: rowHeight, touchAction: 'none' }}
                    className={`w-full flex items-center justify-between px-1.5 border-b border-[#192231] text-[9px] font-mono-num cursor-pointer ${
                      isDown
                        ? 'bg-cyan-400 text-slate-950 font-bold'
                        : isBlack
                        ? 'bg-[#121723] text-slate-400'
                        : 'bg-[#1B2233] text-slate-200'
                    }`}
                  >
                    <span>{isC ? midiLabel(midi) : ''}</span>
                    <span className="text-[8px] opacity-60">
                      {isBlack ? '▪' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note Grid */}
          <div
            ref={gridScrollRef}
            onScroll={syncScroll}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="flex-1 overflow-auto synth-scroll relative"
          >
            <div
              onPointerDown={handleGridClick}
              style={{ width: gridWidth, height: gridHeight }}
              className="relative"
            >
              {/* Row Stripes */}
              {midiRows.map((midi, rIdx) => {
                const isBlack = BLACK_SEMITONES.has(midi % 12);
                return (
                  <div
                    key={midi}
                    style={{ top: rIdx * rowHeight, height: rowHeight }}
                    className={`absolute inset-x-0 border-b border-[#171F2E] pointer-events-none ${
                      isBlack ? 'bg-[#0B0E15]' : 'bg-[#0E131D]'
                    }`}
                  />
                );
              })}

              {/* Step Vertical Grid Lines */}
              {Array.from({ length: totalSteps }, (_, s) => (
                <div
                  key={s}
                  style={{ left: s * stepWidth }}
                  className={`absolute top-0 bottom-0 border-l pointer-events-none ${
                    s % 16 === 0
                      ? 'border-[#3B4C6A]'
                      : s % 4 === 0
                      ? 'border-[#28344B]'
                      : 'border-[#161E2C]'
                  }`}
                />
              ))}

              {/* Notes */}
              {notes.map((note) => {
                const rowIdx = MAX_MIDI - note.midi;
                if (rowIdx < 0 || rowIdx >= midiRows.length) return null;
                const selected = selectedIds.has(note.id);
                const bgClass =
                  note.target === 'beatbox'
                    ? 'bg-amber-500/85 border-amber-200 text-slate-950'
                    : note.target === 'subbass'
                    ? 'bg-violet-500/85 border-blue-200 text-white'
                    : note.target === 'ts666'
                    ? 'bg-rose-500/85 border-rose-200 text-white'
                    : note.target === 'both' || note.target === 'all'
                    ? 'bg-emerald-500/85 border-emerald-200 text-slate-950'
                    : 'bg-cyan-500/85 border-cyan-200 text-slate-950';

                return (
                  <div
                    key={note.id}
                    onPointerDown={(e) => handleNotePointerDown(e, note)}
                    style={{
                      left: note.step * stepWidth,
                      top: rowIdx * rowHeight + 1,
                      width: Math.max(14, note.duration * stepWidth - 1),
                      height: rowHeight - 2,
                      touchAction: 'none',
                    }}
                    className={`absolute rounded-xs border flex items-center justify-between px-1 text-[9px] font-mono-num font-bold select-none cursor-grab ${bgClass} ${
                      selected ? 'ring-2 ring-white' : ''
                    }`}
                  >
                    <span className="truncate pointer-events-none">
                      {midiLabel(note.midi)}
                    </span>
                    <div
                      onPointerDown={(e) => handleResizePointerDown(e, note)}
                      title="Drag to resize note duration"
                      className="w-2 h-full cursor-ew-resize shrink-0 bg-black/20 rounded-r-xs"
                    />
                  </div>
                );
              })}

              {/* Playhead */}
              {playheadPos >= 0 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 pointer-events-none z-20"
                  style={{ transform: `translateX(${playheadPos * stepWidth}px)` }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Velocity Lane */}
        {showVelocity && (
          <div className="flex h-16 border-t border-[#242E40] bg-[#0D1119] shrink-0">
            <div className="w-14 shrink-0 border-r border-[#242E40] flex items-center justify-center text-[10px] font-medium text-slate-400">
              Vel
            </div>
            <div ref={velScrollRef} className="flex-1 overflow-hidden relative">
              <div className="relative h-full" style={{ width: gridWidth }}>
                {notes.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    title={`Velocity ${Math.round(n.velocity * 100)}% (click to cycle)`}
                    onClick={() => {
                      const nextVel =
                        n.velocity >= 0.95 ? 0.55 : Number((n.velocity + 0.15).toFixed(2));
                      onUpdateNotes((prev) =>
                        prev.map((x) =>
                          x.id === n.id ? { ...x, velocity: Math.min(1, nextVel) } : x
                        )
                      );
                    }}
                    style={{
                      left: n.step * stepWidth + 2,
                      height: `${Math.round(n.velocity * 90)}%`,
                      width: 10,
                    }}
                    className={`absolute bottom-0 rounded-t-xs cursor-pointer ${
                      n.target === 'beatbox'
                        ? 'bg-amber-400'
                        : n.target === 'subbass'
                        ? 'bg-violet-400'
                        : n.target === 'ts666'
                        ? 'bg-rose-400'
                        : n.target === 'both' || n.target === 'all'
                        ? 'bg-emerald-400'
                        : 'bg-cyan-400'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
