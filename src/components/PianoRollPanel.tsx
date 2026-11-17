import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Eraser,
  MousePointer2,
  Pencil,
  Play,
  Circle,
  Repeat,
  Square,
  Trash2,
  ZoomIn,
  ZoomOut,
  SlidersHorizontal,
  ClipboardPaste,
} from 'lucide-react';
import { midiBus } from '../audio/MidiBus';
import { synthEngine } from '../audio/SynthEngine';
import { BANKS, SLOTS, SNAP_OPTIONS, snapToSteps } from '../audio/sequencerStorage';
import type {
  MidiNote,
  PatternBank,
  PatternData,
  PianoRollTool,
  SnapDivision,
} from '../types/sequencer';

interface PianoRollPanelProps {
  bpm: number;
  loop: boolean;
  isPlaying: boolean;
  playheadStep: number; // 0..16
  activeBank: PatternBank;
  activeSlot: number;
  patterns: Record<string, PatternData>;
  onSelectBank: (bank: PatternBank) => void;
  onSelectSlot: (slot: number) => void;
  onUpdateNotes: (updater: MidiNote[] | ((prev: MidiNote[]) => MidiNote[])) => void;
  onChangeBpm: (bpm: number) => void;
  onToggleLoop: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
  isRecording?: boolean;
  onToggleRecord?: () => void;
}

const MIN_MIDI = 36; // C2
const MAX_MIDI = 84; // C6
const TOTAL_STEPS = 16;
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

function quantize(val: number, snapSteps: number): number {
  return Math.round(val / snapSteps) * snapSteps;
}

type DragInteraction =
  | {
      kind: 'move';
      pointerId: number;
      startX: number;
      startY: number;
      originNotes: Map<string, { step: number; midi: number }>;
      primaryId: string;
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
  | {
      kind: 'pan';
      pointerId: number;
      startX: number;
      startY: number;
      startScrollLeft: number;
      startScrollTop: number;
      moved: boolean;
      downStep: number;
      downMidi: number;
    }
  | {
      kind: 'marquee';
      pointerId: number;
      startGridX: number;
      startGridY: number;
      currGridX: number;
      currGridY: number;
    }
  | {
      kind: 'erase';
      pointerId: number;
    };

export const PianoRollPanel: React.FC<PianoRollPanelProps> = ({
  bpm,
  loop,
  isPlaying,
  playheadStep,
  activeBank,
  activeSlot,
  patterns,
  onSelectBank,
  onSelectSlot,
  onUpdateNotes,
  onChangeBpm,
  onToggleLoop,
  onTogglePlay,
  onStop,
  isRecording: controlledRecording,
  onToggleRecord,
}) => {
  const [tool, setTool] = useState<PianoRollTool>('draw');
  const [snap, setSnap] = useState<SnapDivision>('1/4');
  const [stepWidth, setStepWidth] = useState<number>(48);
  const [rowHeight, setRowHeight] = useState<number>(22);
  const [showVelocity, setShowVelocity] = useState<boolean>(true);
  const [localRecording, setLocalRecording] = useState<boolean>(false);
  const isRecording = controlledRecording ?? localRecording;
  const toggleRecording = () => {
    if (onToggleRecord) onToggleRecord();
    else setLocalRecording((r) => !r);
  };
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clipboardNotes, setClipboardNotes] = useState<MidiNote[] | null>(null);
  const [activeKeyMidis, setActiveKeyMidis] = useState<Set<number>>(new Set());
  const [marqueeRect, setMarqueeRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [velocityTooltip, setVelocityTooltip] = useState<string | null>(null);

  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const keysScrollRef = useRef<HTMLDivElement | null>(null);
  const rulerScrollRef = useRef<HTMLDivElement | null>(null);
  const velScrollRef = useRef<HTMLDivElement | null>(null);

  const dragRef = useRef<DragInteraction | null>(null);
  const lastNoteDurationRef = useRef<number>(1);
  const keyPointerRef = useRef<Map<number, number>>(new Map());
  const recNoteStartsRef = useRef<Map<number, { step: number; time: number }>>(new Map());
  const velDragNoteRef = useRef<string | null>(null);
  const erasedInDragRef = useRef<Set<string>>(new Set());

  const activePatternId = `${activeBank}${activeSlot}`;
  const notes = patterns[activePatternId]?.notes ?? [];
  const snapSteps = snapToSteps(snap);

  // Ordered top-to-bottom: MAX_MIDI (C6) down to MIN_MIDI (C2)
  const midiRows = useMemo(() => {
    const arr: number[] = [];
    for (let m = MAX_MIDI; m >= MIN_MIDI; m--) {
      arr.push(m);
    }
    return arr;
  }, []);

  const gridWidth = TOTAL_STEPS * stepWidth;
  const gridHeight = midiRows.length * rowHeight;

  // Center scroll around C4 (MIDI 60) on first mount
  useEffect(() => {
    const scroller = gridScrollRef.current;
    if (!scroller) return;
    const c4Index = MAX_MIDI - 64;
    const targetTop = Math.max(0, c4Index * rowHeight - scroller.clientHeight / 2);
    scroller.scrollTop = targetTop;
    if (keysScrollRef.current) keysScrollRef.current.scrollTop = targetTop;
  }, []);

  // Clear selection when switching patterns
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activePatternId]);

  const syncScroll = useCallback(() => {
    const g = gridScrollRef.current;
    if (!g) return;
    if (keysScrollRef.current) keysScrollRef.current.scrollTop = g.scrollTop;
    if (rulerScrollRef.current) rulerScrollRef.current.scrollLeft = g.scrollLeft;
    if (velScrollRef.current) velScrollRef.current.scrollLeft = g.scrollLeft;
  }, []);

  const auditionPitch = useCallback((midi: number, velocity = 0.85) => {
    const now = synthEngine.getCurrentTime();
    if (now !== null) {
      void synthEngine.scheduleNote(midi, velocity, now, now + 0.16);
    } else {
      void synthEngine.noteOn(midi, velocity).then(() => {
        window.setTimeout(() => synthEngine.noteOff(midi), 150);
      });
    }
  }, []);

  // Coordinate helpers
  const clientToGrid = useCallback(
    (clientX: number, clientY: number) => {
      const g = gridScrollRef.current;
      if (!g) return { x: 0, y: 0, step: 0, midi: 60 };
      const rect = g.getBoundingClientRect();
      const x = clientX - rect.left + g.scrollLeft;
      const y = clientY - rect.top + g.scrollTop;
      const step = clamp(x / stepWidth, 0, TOTAL_STEPS - 0.125);
      const rowIdx = clamp(Math.floor(y / rowHeight), 0, midiRows.length - 1);
      const midi = midiRows[rowIdx];
      return { x, y, step, midi };
    },
    [stepWidth, rowHeight, midiRows]
  );

  const createNoteAt = useCallback(
    (step: number, midi: number) => {
      const snappedStep = clamp(Math.floor(step / snapSteps) * snapSteps, 0, TOTAL_STEPS - snapSteps);
      const dur = clamp(
        Math.max(snapSteps, lastNoteDurationRef.current),
        0.25,
        TOTAL_STEPS - snappedStep
      );
      const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newNote: MidiNote = {
        id,
        midi,
        step: snappedStep,
        duration: dur,
        velocity: 0.85,
      };
      onUpdateNotes((prev) => [...prev, newNote]);
      setSelectedIds(new Set([id]));
      auditionPitch(midi, 0.85);
    },
    [snapSteps, onUpdateNotes, auditionPitch]
  );

  const deleteNoteById = useCallback(
    (id: string) => {
      onUpdateNotes((prev) => prev.filter((n) => n.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [onUpdateNotes]
  );

  // Grid background pointer handlers
  const handleGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const g = gridScrollRef.current;
    if (!g) return;

    const pt = clientToGrid(e.clientX, e.clientY);

    if (tool === 'erase') {
      e.currentTarget.setPointerCapture(e.pointerId);
      erasedInDragRef.current.clear();
      dragRef.current = { kind: 'erase', pointerId: e.pointerId };
      return;
    }

    if (tool === 'select') {
      e.currentTarget.setPointerCapture(e.pointerId);
      setSelectedIds(new Set());
      dragRef.current = {
        kind: 'marquee',
        pointerId: e.pointerId,
        startGridX: pt.x,
        startGridY: pt.y,
        currGridX: pt.x,
        currGridY: pt.y,
      };
      setMarqueeRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
      return;
    }

    // Draw mode: tapping creates note, dragging pans the canvas smoothly on touchscreens
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: 'pan',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: g.scrollLeft,
      startScrollTop: g.scrollTop,
      moved: false,
      downStep: pt.step,
      downMidi: pt.midi,
    };
  };

  const handleGridPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const g = gridScrollRef.current;
    if (!g) return;

    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && (Math.abs(dx) > 7 || Math.abs(dy) > 7)) {
        drag.moved = true;
      }
      if (drag.moved) {
        g.scrollLeft = drag.startScrollLeft - dx;
        g.scrollTop = drag.startScrollTop - dy;
        syncScroll();
      }
      return;
    }

    if (drag.kind === 'marquee') {
      const pt = clientToGrid(e.clientX, e.clientY);
      drag.currGridX = pt.x;
      drag.currGridY = pt.y;
      const rx = Math.min(drag.startGridX, pt.x);
      const ry = Math.min(drag.startGridY, pt.y);
      const rw = Math.abs(pt.x - drag.startGridX);
      const rh = Math.abs(pt.y - drag.startGridY);
      setMarqueeRect({ x: rx, y: ry, w: rw, h: rh });

      const sel = new Set<string>();
      for (const n of notes) {
        const nx1 = n.step * stepWidth;
        const nx2 = (n.step + n.duration) * stepWidth;
        const ny1 = (MAX_MIDI - n.midi) * rowHeight;
        const ny2 = ny1 + rowHeight;
        if (nx1 < rx + rw && nx2 > rx && ny1 < ry + rh && ny2 > ry) {
          sel.add(n.id);
        }
      }
      setSelectedIds(sel);
      return;
    }

    if (drag.kind === 'move') {
      const dxSteps = (e.clientX - drag.startX) / stepWidth;
      const dyRows = Math.round((e.clientY - drag.startY) / rowHeight);
      const snappedDeltaStep = quantize(dxSteps, snapSteps);

      let previewMidi: number | null = null;
      onUpdateNotes((prev) =>
        prev.map((n) => {
          const orig = drag.originNotes.get(n.id);
          if (!orig) return n;
          const nextStep = clamp(orig.step + snappedDeltaStep, 0, TOTAL_STEPS - n.duration);
          const nextMidi = clamp(orig.midi - dyRows, MIN_MIDI, MAX_MIDI);
          if (n.id === drag.primaryId && nextMidi !== drag.lastPreviewMidi) {
            previewMidi = nextMidi;
            drag.lastPreviewMidi = nextMidi;
          }
          return { ...n, step: nextStep, midi: nextMidi };
        })
      );
      if (previewMidi !== null) {
        auditionPitch(previewMidi, 0.82);
      }
      return;
    }

    if (drag.kind === 'resize') {
      const dxSteps = (e.clientX - drag.startX) / stepWidth;
      const rawDur = drag.originDuration + dxSteps;
      const snappedDur = clamp(
        Math.max(snapSteps === 0.125 ? 0.25 : snapSteps, quantize(rawDur, snapSteps)),
        0.25,
        TOTAL_STEPS - drag.noteStep
      );
      lastNoteDurationRef.current = snappedDur;
      onUpdateNotes((prev) =>
        prev.map((n) => (n.id === drag.noteId ? { ...n, duration: snappedDur } : n))
      );
      return;
    }

    if (drag.kind === 'erase') {
      const pt = clientToGrid(e.clientX, e.clientY);
      const hit = notes.find(
        (n) =>
          !erasedInDragRef.current.has(n.id) &&
          n.midi === pt.midi &&
          pt.step >= n.step &&
          pt.step <= n.step + n.duration
      );
      if (hit) {
        erasedInDragRef.current.add(hit.id);
        deleteNoteById(hit.id);
      }
    }
  };

  const handleGridPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    if (drag.kind === 'pan' && !drag.moved) {
      createNoteAt(drag.downStep, drag.downMidi);
    }
    if (drag.kind === 'marquee') {
      setMarqueeRect(null);
    }
    erasedInDragRef.current.clear();
    dragRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
  };

  // Note block pointer handlers
  const handleNotePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    note: MidiNote,
    isResizeHandle: boolean
  ) => {
    e.stopPropagation();
    e.preventDefault();

    if (tool === 'erase') {
      deleteNoteById(note.id);
      return;
    }

    const g = gridScrollRef.current;
    if (g) {
      try {
        g.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }

    if (isResizeHandle) {
      setSelectedIds(new Set([note.id]));
      dragRef.current = {
        kind: 'resize',
        pointerId: e.pointerId,
        noteId: note.id,
        startX: e.clientX,
        originDuration: note.duration,
        noteStep: note.step,
      };
      return;
    }

    // Select & initiate move (move all selected notes if clicking inside existing selection)
    let activeSel = selectedIds;
    if (!selectedIds.has(note.id)) {
      activeSel = e.shiftKey ? new Set([...selectedIds, note.id]) : new Set([note.id]);
      setSelectedIds(activeSel);
    }

    const originNotes = new Map<string, { step: number; midi: number }>();
    for (const n of notes) {
      if (activeSel.has(n.id)) {
        originNotes.set(n.id, { step: n.step, midi: n.midi });
      }
    }

    auditionPitch(note.midi, note.velocity);

    dragRef.current = {
      kind: 'move',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originNotes,
      primaryId: note.id,
      lastPreviewMidi: note.midi,
    };
  };

  // Vertical Left Piano Keyboard Interaction + Multi-Touch + Step Recording
  const resolveKeyMidiAt = (clientX: number, clientY: number): number | null => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const keyEl = el?.closest('[data-roll-midi]') as HTMLElement | null;
    if (!keyEl) return null;
    const midi = Number(keyEl.dataset.rollMidi);
    return Number.isFinite(midi) ? midi : null;
  };

  const syncActiveKeysState = () => {
    const next = new Set<number>();
    keyPointerRef.current.forEach((m) => next.add(m));
    setActiveKeyMidis(next);
  };

  const startKeyPlay = (pointerId: number, midi: number) => {
    keyPointerRef.current.set(pointerId, midi);
    syncActiveKeysState();
    void synthEngine.noteOn(midi, 0.85);
    midiBus.emit({ type: 'noteOn', source: 'keyboard', midi, velocity: 0.85 });

    // Live recording during playback is handled centrally via MidiBus in App.tsx.
    // When transport is stopped and Record is armed, allow step-entry recording here.
    if (isRecording && !isPlaying) {
      recNoteStartsRef.current.set(midi, { step: 0, time: performance.now() });
    }
  };

  const stopKeyPlay = (pointerId: number) => {
    const midi = keyPointerRef.current.get(pointerId);
    if (midi === undefined) return;
    keyPointerRef.current.delete(pointerId);
    syncActiveKeysState();

    let stillHeld = false;
    keyPointerRef.current.forEach((m) => {
      if (m === midi) stillHeld = true;
    });
    if (!stillHeld) {
      synthEngine.noteOff(midi);
      midiBus.emit({ type: 'noteOff', source: 'keyboard', midi });
    }

    if (isRecording && !isPlaying) {
      const rec = recNoteStartsRef.current.get(midi);
      if (rec) {
        recNoteStartsRef.current.delete(midi);
        const dur = Math.max(1, snapSteps);
        const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        onUpdateNotes((prev) => [
          ...prev,
          { id, midi, step: rec.step, duration: dur, velocity: 0.88 },
        ]);
      }
    }
  };

  // Velocity lane pointer drag
  const handleVelocityPointer = (e: React.PointerEvent<HTMLDivElement>, noteId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relY = 1 - clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const vel = clamp(0.08 + relY * 0.92, 0.08, 1);
    onUpdateNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, velocity: vel } : n))
    );
    setVelocityTooltip(`${Math.round(vel * 127)}`);
  };

  const handleCopyPattern = () => {
    setClipboardNotes(notes.map((n) => ({ ...n })));
  };

  const handlePastePattern = () => {
    if (!clipboardNotes) return;
    const pasted = clipboardNotes.map((n, i) => ({
      ...n,
      id: `paste-${Date.now()}-${i}`,
    }));
    onUpdateNotes(pasted);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const toDelete = new Set(selectedIds);
    onUpdateNotes((prev) => prev.filter((n) => !toDelete.has(n.id)));
    setSelectedIds(new Set());
  };

  // Format Bar : Beat : Step readout
  const currentBeat = Math.floor(playheadStep / 4) + 1;
  const currentSubStep = Math.floor(playheadStep % 4) + 1;
  const currentLedStep = Math.floor(playheadStep) % 16;

  return (
    <div className="flex flex-col h-full w-full rounded-xl border border-[#263042] bg-[#0F141D] overflow-hidden select-none">
      {/* TOP CONTROL PANEL: Pattern Banks + Slots 1..16 + Tools + Snap + Zoom */}
      <div className="flex flex-col gap-1.5 px-2.5 py-1.5 bg-[#141A26] border-b border-[#263042] shrink-0">
        {/* Row 1: Pattern Banks A-D & Pattern Slots 1-16 */}
        <div className="flex items-center gap-2 overflow-x-auto synth-scroll pb-0.5">
          {/* Banks A, B, C, D */}
          <div className="flex items-center gap-1 bg-[#0B0E14] p-0.5 rounded-md border border-[#242E40] shrink-0">
            {BANKS.map((b) => {
              const active = b === activeBank;
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => onSelectBank(b)}
                  className={`w-7 h-7 rounded text-xs font-display font-bold transition-colors cursor-pointer ${
                    active
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-[#1A2232]'
                  }`}
                >
                  {b}
                </button>
              );
            })}
          </div>

          {/* Pattern Slots 1..16 */}
          <div className="flex items-center gap-1 flex-1 min-w-max">
            {SLOTS.map((slot) => {
              const pid = `${activeBank}${slot}`;
              const hasNotes = (patterns[pid]?.notes.length ?? 0) > 0;
              const isSelected = slot === activeSlot;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => onSelectSlot(slot)}
                  className={`relative min-w-[28px] h-7 px-1.5 rounded text-[11px] font-mono-num font-semibold border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                      : hasNotes
                      ? 'bg-[#182232] border-[#2E3D55] text-slate-200 hover:border-cyan-400/50'
                      : 'bg-[#0B0E14] border-[#222B3B] text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {slot}
                  {hasNotes && (
                    <span
                      className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-2.5 h-0.5 rounded-full ${
                        isSelected ? 'bg-cyan-300' : 'bg-amber-400/80'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Tools, Snap, Velocity Toggle, Zoom, Pattern Actions */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto synth-scroll">
          {/* Edit Mode Tools */}
          <div className="flex items-center gap-1 shrink-0">
            <div className="flex items-center gap-0.5 bg-[#0B0E14] p-0.5 rounded-md border border-[#242E40]">
              <button
                type="button"
                onClick={() => setTool('draw')}
                title="Draw & Move Notes"
                className={`inline-flex items-center gap-1 px-2.5 h-7 rounded text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                  tool === 'draw'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Pencil className="w-3 h-3" />
                <span>Draw</span>
              </button>
              <button
                type="button"
                onClick={() => setTool('select')}
                title="Marquee Select Notes"
                className={`inline-flex items-center gap-1 px-2.5 h-7 rounded text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                  tool === 'select'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <MousePointer2 className="w-3 h-3" />
                <span>Select</span>
              </button>
              <button
                type="button"
                onClick={() => setTool('erase')}
                title="Tap or Swipe to Erase Notes"
                className={`inline-flex items-center gap-1 px-2.5 h-7 rounded text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                  tool === 'erase'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Eraser className="w-3 h-3" />
                <span>Erase</span>
              </button>
            </div>

            {/* Snap Selector */}
            <div className="flex items-center gap-1 bg-[#0B0E14] px-2 h-8 rounded-md border border-[#242E40]">
              <span className="text-[10px] text-slate-400">Snap</span>
              <select
                aria-label="Grid Snap"
                value={snap}
                onChange={(e) => setSnap(e.target.value as SnapDivision)}
                className="bg-transparent text-[11px] font-mono-num text-cyan-300 focus:outline-none cursor-pointer"
              >
                {SNAP_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-[#111622] text-slate-200">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Velocity Lane Toggle */}
            <button
              type="button"
              onClick={() => setShowVelocity((v) => !v)}
              className={`inline-flex items-center gap-1 px-2.5 h-8 rounded-md border text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                showVelocity
                  ? 'bg-amber-500/15 border-amber-400/50 text-amber-300'
                  : 'bg-[#0B0E14] border-[#242E40] text-slate-400 hover:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Vel</span>
            </button>
          </div>

          {/* Zoom + Pattern Utility Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="inline-flex items-center gap-1 px-2.5 h-8 rounded-md bg-rose-500/20 border border-rose-400/50 text-rose-300 text-[11px] font-medium hover:bg-rose-500/30 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3 h-3" />
                <span>Del ({selectedIds.size})</span>
              </button>
            )}

            <button
              type="button"
              title="Copy Pattern"
              onClick={handleCopyPattern}
              className="w-8 h-8 rounded-md bg-[#0B0E14] border border-[#242E40] flex items-center justify-center text-slate-400 hover:text-cyan-300 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              title="Paste Pattern"
              disabled={!clipboardNotes}
              onClick={handlePastePattern}
              className="w-8 h-8 rounded-md bg-[#0B0E14] border border-[#242E40] flex items-center justify-center text-slate-400 hover:text-cyan-300 disabled:opacity-35 cursor-pointer"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              title="Clear Pattern"
              onClick={() => onUpdateNotes([])}
              className="px-2 h-8 rounded-md bg-[#0B0E14] border border-[#242E40] text-[11px] text-slate-400 hover:text-rose-300 cursor-pointer whitespace-nowrap"
            >
              Clear
            </button>

            <div className="flex items-center bg-[#0B0E14] rounded-md border border-[#242E40] overflow-hidden">
              <button
                type="button"
                title="Zoom Out"
                onClick={() => {
                  setStepWidth((w) => Math.max(28, w - 8));
                  setRowHeight((h) => Math.max(16, h - 2));
                }}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Zoom In"
                onClick={() => {
                  setStepWidth((w) => Math.min(84, w + 8));
                  setRowHeight((h) => Math.min(34, h + 2));
                }}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white border-l border-[#242E40] cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CENTER: VERTICAL PIANO KEYBOARD + TIMELINE + EDITABLE GRID + VELOCITY LANE */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* LEFT PIANO COLUMN */}
        <div className="w-[62px] sm:w-[70px] flex flex-col border-r border-[#263042] bg-[#0B0E14] shrink-0">
          {/* Top Corner Ruler Spacer */}
          <div className="h-6 border-b border-[#263042] bg-[#121722] flex items-center justify-center shrink-0">
            <span className="font-mono-num text-[10px] text-cyan-300 font-semibold">
              {activeKeyMidis.size > 0
                ? midiLabel(Array.from(activeKeyMidis)[activeKeyMidis.size - 1])
                : activePatternId}
            </span>
          </div>

          {/* Vertical Playable Piano Keys */}
          <div
            ref={keysScrollRef}
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              const m = resolveKeyMidiAt(e.clientX, e.clientY);
              if (m !== null) startKeyPlay(e.pointerId, m);
            }}
            onPointerMove={(e) => {
              if (!keyPointerRef.current.has(e.pointerId)) return;
              const m = resolveKeyMidiAt(e.clientX, e.clientY);
              const prev = keyPointerRef.current.get(e.pointerId);
              if (m !== null && m !== prev) {
                stopKeyPlay(e.pointerId);
                startKeyPlay(e.pointerId, m);
              }
            }}
            onPointerUp={(e) => {
              stopKeyPlay(e.pointerId);
              try {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              } catch {
                // ignore
              }
            }}
            onPointerCancel={(e) => stopKeyPlay(e.pointerId)}
            className="flex-1 overflow-hidden relative"
          >
            <div style={{ height: gridHeight }} className="relative w-full">
              {midiRows.map((midi) => {
                const semi = midi % 12;
                const isBlack = BLACK_SEMITONES.has(semi);
                const isC = semi === 0;
                const isLit = activeKeyMidis.has(midi);
                return (
                  <div
                    key={midi}
                    data-roll-midi={midi}
                    style={{ height: rowHeight }}
                    className={`relative flex items-center justify-end pr-1.5 border-b border-[#1D2534] text-[9px] font-mono-num transition-colors ${
                      isBlack
                        ? isLit
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-[#19202D] text-slate-400'
                        : isLit
                        ? 'bg-cyan-300 text-slate-950 font-bold'
                        : isC
                        ? 'bg-[#E2E8F0] text-slate-900 font-bold'
                        : 'bg-[#CBD5E1] text-slate-700'
                    }`}
                  >
                    {/* Black key inset bar on left edge for classic Piano Roll recognition */}
                    {isBlack && (
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-[62%] rounded-r-sm border-r border-b ${
                          isLit
                            ? 'bg-cyan-400 border-cyan-200'
                            : 'bg-[#090C11] border-[#05070A]'
                        }`}
                      />
                    )}
                    <span className="relative z-10 pointer-events-none">
                      {isC ? midiLabel(midi) : rowHeight >= 24 && !isBlack ? midiLabel(midi) : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Velocity Corner Spacer */}
          {showVelocity && (
            <div className="h-[54px] border-t border-[#263042] bg-[#121722] flex flex-col items-center justify-center shrink-0">
              <span className="text-[9px] font-medium text-slate-400">Velocity</span>
              {velocityTooltip && (
                <span className="font-mono-num text-[10px] text-amber-300">
                  {velocityTooltip}
                </span>
              )}
            </div>
          )}
        </div>

        {/* RIGHT GRID AREA */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Timeline Ruler (Bars & Beats) */}
          <div
            ref={rulerScrollRef}
            className="h-6 border-b border-[#263042] bg-[#121722] overflow-hidden shrink-0"
          >
            <div style={{ width: gridWidth }} className="relative h-full flex">
              {Array.from({ length: TOTAL_STEPS }).map((_, stepIdx) => {
                const isBeat = stepIdx % 4 === 0;
                const beatNum = Math.floor(stepIdx / 4) + 1;
                return (
                  <div
                    key={stepIdx}
                    style={{ width: stepWidth }}
                    className={`h-full border-r flex items-center pl-1 font-mono-num text-[10px] shrink-0 ${
                      isBeat
                        ? 'border-[#334155] text-slate-200 font-semibold'
                        : 'border-[#1E2736] text-slate-500'
                    }`}
                  >
                    {isBeat ? `1.${beatNum}` : stepIdx + 1}
                  </div>
                );
              })}

              {/* Playhead marker triangle */}
              <div
                style={{ transform: `translateX(${playheadStep * stepWidth}px)` }}
                className="absolute top-0 bottom-0 left-0 w-0.5 bg-cyan-400 pointer-events-none"
              >
                <div className="w-2.5 h-2.5 -ml-1 bg-cyan-400 rotate-45 -mt-1.5" />
              </div>
            </div>
          </div>

          {/* Editable MIDI Note Grid */}
          <div
            ref={gridScrollRef}
            onScroll={syncScroll}
            style={{ touchAction: 'none' }}
            onPointerDown={handleGridPointerDown}
            onPointerMove={handleGridPointerMove}
            onPointerUp={handleGridPointerUp}
            onPointerCancel={handleGridPointerUp}
            className="flex-1 overflow-auto synth-scroll relative bg-[#0D1119]"
          >
            <div
              style={{ width: gridWidth, height: gridHeight }}
              className="relative"
            >
              {/* Horizontal Note Rows */}
              {midiRows.map((midi, rIdx) => {
                const semi = midi % 12;
                const isBlack = BLACK_SEMITONES.has(semi);
                const isC = semi === 0;
                const isRowActive = activeKeyMidis.has(midi);
                return (
                  <div
                    key={midi}
                    style={{
                      top: rIdx * rowHeight,
                      height: rowHeight,
                    }}
                    className={`absolute inset-x-0 border-b pointer-events-none ${
                      isC ? 'border-[#2E3C52]' : 'border-[#18202E]'
                    } ${
                      isRowActive
                        ? 'bg-cyan-500/10'
                        : isBlack
                        ? 'bg-[#0C1018]'
                        : isC
                        ? 'bg-[#171F2E]'
                        : 'bg-[#121824]'
                    }`}
                  />
                );
              })}

              {/* Vertical Step & Beat Grid Lines */}
              {Array.from({ length: TOTAL_STEPS }).map((_, stepIdx) => {
                const isBeat = stepIdx % 4 === 0;
                const isHalfBeat = stepIdx % 2 === 0;
                return (
                  <div
                    key={stepIdx}
                    style={{ left: stepIdx * stepWidth, width: stepWidth }}
                    className={`absolute top-0 bottom-0 border-r pointer-events-none ${
                      isBeat
                        ? 'border-l border-l-[#334155] border-r-[#1A2232]'
                        : isHalfBeat
                        ? 'border-r-[#212C3F]'
                        : 'border-r-[#171F2D]'
                    }`}
                  />
                );
              })}

              {/* MIDI Notes */}
              {notes.map((note) => {
                const rowIdx = MAX_MIDI - note.midi;
                if (rowIdx < 0 || rowIdx >= midiRows.length) return null;
                const isSelected = selectedIds.has(note.id);
                const left = note.step * stepWidth;
                const width = Math.max(14, note.duration * stepWidth);
                const top = rowIdx * rowHeight + 1;
                const height = Math.max(12, rowHeight - 2);
                const isPlayingNow =
                  isPlaying &&
                  playheadStep >= note.step &&
                  playheadStep < note.step + note.duration;

                return (
                  <div
                    key={note.id}
                    onPointerDown={(e) => handleNotePointerDown(e, note, false)}
                    style={{
                      left,
                      top,
                      width,
                      height,
                    }}
                    className={`absolute rounded-sm border flex items-center justify-between overflow-hidden cursor-grab active:cursor-grabbing transition-colors ${
                      isPlayingNow
                        ? 'bg-cyan-300 border-white text-slate-950 shadow-sm shadow-cyan-400/40'
                        : isSelected
                        ? 'bg-amber-500/90 border-amber-200 text-slate-950'
                        : 'bg-cyan-500/85 border-cyan-300/70 text-slate-950'
                    }`}
                  >
                    {/* Velocity bar strip on left edge */}
                    <div
                      style={{ height: `${Math.round(note.velocity * 100)}%` }}
                      className="w-1 self-end bg-slate-950/45 shrink-0 pointer-events-none"
                    />

                    {/* Note name */}
                    {width >= 26 && (
                      <span className="font-mono-num text-[9px] font-bold px-1 truncate pointer-events-none">
                        {midiLabel(note.midi)}
                      </span>
                    )}

                    {/* Right Edge Resize Handle */}
                    <div
                      onPointerDown={(e) => handleNotePointerDown(e, note, true)}
                      title="Drag to resize duration"
                      className="w-3.5 sm:w-4 h-full bg-slate-950/20 hover:bg-slate-950/40 border-l border-slate-950/25 cursor-ew-resize shrink-0 flex items-center justify-center"
                    >
                      <span className="w-0.5 h-2.5 bg-slate-950/60 rounded-full pointer-events-none" />
                    </div>
                  </div>
                );
              })}

              {/* Marquee Selection Box */}
              {marqueeRect && (
                <div
                  style={{
                    left: marqueeRect.x,
                    top: marqueeRect.y,
                    width: marqueeRect.w,
                    height: marqueeRect.h,
                  }}
                  className="absolute border border-cyan-400 bg-cyan-400/15 pointer-events-none z-20"
                />
              )}

              {/* Sweeping Playhead Line */}
              <div
                style={{ transform: `translateX(${playheadStep * stepWidth}px)` }}
                className="absolute top-0 bottom-0 left-0 w-0.5 bg-cyan-400 pointer-events-none z-30"
              />
            </div>
          </div>

          {/* VELOCITY EDITOR LANE */}
          {showVelocity && (
            <div
              ref={velScrollRef}
              className="h-[54px] border-t border-[#263042] bg-[#0B0E14] overflow-hidden shrink-0"
            >
              <div style={{ width: gridWidth }} className="relative h-full">
                {/* Step lines */}
                {Array.from({ length: TOTAL_STEPS }).map((_, sIdx) => (
                  <div
                    key={sIdx}
                    style={{ left: sIdx * stepWidth, width: stepWidth }}
                    className={`absolute top-0 bottom-0 border-r pointer-events-none ${
                      sIdx % 4 === 0 ? 'border-l border-l-[#263042] border-r-[#151C28]' : 'border-r-[#151C28]'
                    }`}
                  />
                ))}

                {/* Velocity stems */}
                {notes.map((note) => {
                  const isSel = selectedIds.has(note.id);
                  const barH = Math.round(note.velocity * 42);
                  return (
                    <div
                      key={note.id}
                      style={{
                        left: note.step * stepWidth,
                        width: Math.max(14, Math.min(26, note.duration * stepWidth)),
                        touchAction: 'none',
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        velDragNoteRef.current = note.id;
                        handleVelocityPointer(e, note.id);
                      }}
                      onPointerMove={(e) => {
                        if (velDragNoteRef.current === note.id) {
                          handleVelocityPointer(e, note.id);
                        }
                      }}
                      onPointerUp={(e) => {
                        if (velDragNoteRef.current === note.id) {
                          velDragNoteRef.current = null;
                          setVelocityTooltip(null);
                        }
                        try {
                          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                          }
                        } catch {
                          // ignore
                        }
                      }}
                      className="absolute top-0 bottom-0 flex items-end justify-start cursor-ns-resize pl-0.5"
                    >
                      <div
                        style={{ height: barH }}
                        className={`w-2.5 rounded-t-sm border-t-2 transition-colors ${
                          isSel
                            ? 'bg-amber-500/75 border-amber-200'
                            : 'bg-cyan-500/70 border-cyan-300'
                        }`}
                      />
                    </div>
                  );
                })}

                {/* Playhead line */}
                <div
                  style={{ transform: `translateX(${playheadStep * stepWidth}px)` }}
                  className="absolute top-0 bottom-0 left-0 w-0.5 bg-cyan-400/60 pointer-events-none"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM TRANSPORT PANEL */}
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#141A26] border-t border-[#263042] shrink-0 overflow-x-auto synth-scroll">
        {/* Transport Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onTogglePlay}
            className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap ${
              isPlaying
                ? 'bg-emerald-500 border-emerald-300 text-slate-950'
                : 'bg-[#1B2434] border-[#2D3B52] text-emerald-300 hover:border-emerald-400/60'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isPlaying ? 'Playing' : 'Play'}</span>
          </button>

          <button
            type="button"
            aria-label="Stop"
            onClick={onStop}
            className="w-9 h-9 rounded-md bg-[#1B2434] border border-[#2D3B52] flex items-center justify-center text-slate-200 hover:border-slate-400 cursor-pointer shrink-0"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>

          <button
            type="button"
            onClick={toggleRecording}
            className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              isRecording
                ? 'bg-rose-500/25 border-rose-400 text-rose-200'
                : 'bg-[#1B2434] border-[#2D3B52] text-slate-300 hover:text-rose-300'
            }`}
          >
            <Circle className={`w-3 h-3 ${isRecording ? 'fill-rose-400 text-rose-400' : ''}`} />
            <span>Rec</span>
          </button>

          <button
            type="button"
            onClick={onToggleLoop}
            className={`inline-flex items-center gap-1 h-9 px-2.5 rounded-md border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              loop
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                : 'bg-[#0B0E14] border-[#242E40] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>Loop</span>
          </button>
        </div>

        {/* 16-Step Pattern Playback LED Strip */}
        <div className="hidden md:flex items-center gap-1 px-2">
          {Array.from({ length: 16 }).map((_, idx) => {
            const isBeat = idx % 4 === 0;
            const activeLed = isPlaying && currentLedStep === idx;
            return (
              <div
                key={idx}
                className={`w-2.5 h-2.5 rounded-sm transition-colors ${
                  activeLed
                    ? 'bg-cyan-300'
                    : isBeat
                    ? 'bg-[#2B374C]'
                    : 'bg-[#1B2332]'
                }`}
              />
            );
          })}
        </div>

        {/* BPM & Bar:Beat Position Readout */}
        <div className="flex items-center gap-2 shrink-0">
          {/* BPM Stepper + Slider */}
          <div className="flex items-center gap-1 bg-[#0B0E14] px-1.5 h-9 rounded-md border border-[#242E40]">
            <button
              type="button"
              aria-label="Decrease BPM"
              onClick={() => onChangeBpm(Math.max(40, bpm - 1))}
              className="w-7 h-7 rounded text-slate-300 hover:bg-[#1B2434] font-bold cursor-pointer"
            >
              -
            </button>
            <span
              style={{ touchAction: 'none' }}
              title="Drag vertically to adjust BPM"
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                e.currentTarget.dataset.startY = String(e.clientY);
                e.currentTarget.dataset.startBpm = String(bpm);
              }}
              onPointerMove={(e) => {
                const sy = e.currentTarget.dataset.startY;
                const sb = e.currentTarget.dataset.startBpm;
                if (!sy || !sb) return;
                const dy = Number(sy) - e.clientY;
                const next = Math.max(40, Math.min(240, Math.round(Number(sb) + dy / 3)));
                onChangeBpm(next);
              }}
              onPointerUp={(e) => {
                delete e.currentTarget.dataset.startY;
                delete e.currentTarget.dataset.startBpm;
                try {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                } catch {
                  // ignore
                }
              }}
              className="font-mono-num text-xs font-semibold text-amber-300 px-1.5 whitespace-nowrap cursor-ns-resize"
            >
              {bpm} BPM
            </span>
            <button
              type="button"
              aria-label="Increase BPM"
              onClick={() => onChangeBpm(Math.min(240, bpm + 1))}
              className="w-7 h-7 rounded text-slate-300 hover:bg-[#1B2434] font-bold cursor-pointer"
            >
              +
            </button>
          </div>

          {/* Current Bar : Beat : Step Readout */}
          <div className="h-9 px-2.5 rounded-md bg-[#0B0E14] border border-[#242E40] flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 hidden sm:inline">Pos</span>
            <span className="font-mono-num text-xs font-semibold text-cyan-300">
              1.{currentBeat}.{currentSubStep}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
