import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Circle,
  CopyPlus,
  Eraser,
  Keyboard,
  Magnet,
  Maximize2,
  Minimize2,
  MousePointer2,
  Pencil,
  Play,
  Plus,
  Repeat,
  SlidersHorizontal,
  Square,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { beatboxEngine } from '../audio/BeatboxEngine';
import { DRUM_TRACK_ORDER } from '../audio/beatboxPresets';
import { midiBus } from '../audio/MidiBus';
import { BANKS, SLOTS, SNAP_OPTIONS, snapToSteps } from '../audio/sequencerStorage';
import { studioAudio } from '../audio/StudioAudio';
import { subbassEngine } from '../audio/SubbassEngine';
import { synthEngine } from '../audio/SynthEngine';
import { sixSixSixEngine } from '../audio/ts666/SixSixSixEngine';
import type { BeatboxState, DrumTrackId } from '../types/beatbox';
import type { DawMidiNote, DawMidiOutputTarget } from '../types/daw';
import type { MidiNote, PatternBank, PianoRollTool, SnapDivision } from '../types/sequencer';

export type PianoRollMode = 'serum' | 'subbass' | 'beatbox' | 'ts666' | 'sequencer';

export interface UnifiedPatternOption {
  id: string;
  label: string;
  noteCount: number;
}

export type RollNote = MidiNote & {
  target?: DawMidiOutputTarget;
};

interface UnifiedPianoRollProps {
  mode: PianoRollMode;
  notes: RollNote[];
  totalSteps: number; // 16 for serum/subbass/beatbox, 16|32|64 for sequencer
  bpm: number;
  loop: boolean;
  isPlaying: boolean;
  isRecording: boolean;
  playheadStep: number;
  isFullscreen: boolean;
  onBack: () => void;
  onToggleFullscreen: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onToggleRecord: () => void;
  onChangeBpm: (bpm: number) => void;
  onUpdateNotes: (updater: RollNote[] | ((prev: RollNote[]) => RollNote[])) => void;

  // Pattern selection & CRUD
  patternOptions?: UnifiedPatternOption[];
  activePatternId?: string;
  onSelectPattern?: (patternId: string) => void;
  onCreatePattern?: () => void;
  onDuplicatePattern?: () => void;
  onDeletePattern?: () => void;

  // SERUM bank/slot support (reuses pattern CRUD buttons seamlessly)
  serumActiveBank?: PatternBank;
  serumActiveSlot?: number;
  serumPatterns?: Record<string, { notes: MidiNote[] }>;
  onSelectSerumBank?: (bank: PatternBank) => void;
  onSelectSerumSlot?: (slot: number) => void;

  // BEATBOX optional track labels + import 16-step pattern hits
  beatboxTracks?: BeatboxState['tracks'];
  onImportBeatboxSteps?: () => void;

  // SEQUENCER specific options (step count, target routing, snap persistence)
  dawOutputTarget?: DawMidiOutputTarget;
  onChangeDawOutputTarget?: (target: DawMidiOutputTarget) => void;
  dawStepCount?: 16 | 32 | 64;
  onChangeDawStepCount?: (steps: 16 | 32 | 64) => void;
  snapOverride?: SnapDivision;
  onChangeSnapOverride?: (snap: SnapDivision) => void;
  dawPlayMode?: 'pattern' | 'song';
  onChangeDawPlayMode?: (mode: 'pattern' | 'song') => void;

  // Optional Piano Column visibility toggle (SUBBASS / workspace expansion)
  showKeyboardColumn?: boolean;
  onToggleKeyboardColumn?: () => void;
}

interface RollRow {
  midi: number;
  label: string;
  shortLabel: string;
  isBlack: boolean;
  isC: boolean;
  drumTrackId?: DrumTrackId;
  accentColor?: 'cyan' | 'amber';
}

type DragInteraction =
  | {
      kind: 'move';
      pointerId: number;
      startX: number;
      startY: number;
      originNotes: Map<string, { step: number; rowIdx: number }>;
      primaryId: string;
      lastPreviewRowIdx: number;
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
      downRowIdx: number;
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

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

function midiLabel(midi: number): string {
  const semi = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[semi]}${oct}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function quantize(val: number, snapSteps: number): number {
  return Math.round(val / snapSteps) * snapSteps;
}

const MODE_THEME: Record<
  PianoRollMode,
  {
    title: string;
    badgeBg: string;
    noteBg: string;
    notePlaying: string;
    playheadBg: string;
    velBar: string;
  }
> = {
  serum: {
    title: 'SERUM',
    badgeBg: 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300',
    noteBg: 'bg-cyan-500/85 border-cyan-200/80 text-slate-950',
    notePlaying: 'bg-cyan-300 border-white text-slate-950 shadow-[0_0_10px_rgba(34,211,238,0.5)]',
    playheadBg: 'bg-cyan-400',
    velBar: 'bg-cyan-400 border-cyan-200',
  },
  subbass: {
    title: 'SUBBASS',
    badgeBg: 'bg-blue-600/25 border-blue-400/70 text-blue-200',
    noteBg: 'bg-gradient-to-r from-blue-500 to-violet-500 border-blue-200/85 text-white',
    notePlaying: 'bg-blue-400 border-white text-slate-950 shadow-[0_0_12px_rgba(59,130,246,0.6)]',
    playheadBg: 'bg-blue-400',
    velBar: 'bg-blue-400 border-violet-300',
  },
  beatbox: {
    title: 'BEATBOX',
    badgeBg: 'bg-amber-500/20 border-amber-400/65 text-amber-300',
    noteBg: 'bg-amber-500/85 border-amber-200/80 text-slate-950',
    notePlaying: 'bg-amber-300 border-white text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.5)]',
    playheadBg: 'bg-amber-400',
    velBar: 'bg-amber-400 border-amber-200',
  },
  ts666: {
    title: '666TS',
    badgeBg: 'bg-rose-500/20 border-rose-400/65 text-rose-200',
    noteBg: 'bg-rose-500/85 border-rose-200/80 text-white',
    notePlaying: 'bg-rose-300 border-white text-slate-950 shadow-[0_0_10px_rgba(244,63,94,0.55)]',
    playheadBg: 'bg-rose-400',
    velBar: 'bg-rose-400 border-rose-200',
  },
  sequencer: {
    title: 'SEQUENCER',
    badgeBg: 'bg-emerald-500/20 border-emerald-400/65 text-emerald-300',
    noteBg: 'bg-emerald-500/85 border-emerald-200/80 text-slate-950',
    notePlaying: 'bg-emerald-300 border-white text-slate-950 shadow-[0_0_10px_rgba(52,211,153,0.5)]',
    playheadBg: 'bg-emerald-400',
    velBar: 'bg-emerald-400 border-emerald-200',
  },
};

export const UnifiedPianoRoll: React.FC<UnifiedPianoRollProps> = ({
  mode,
  notes,
  totalSteps,
  bpm,
  loop,
  isPlaying,
  isRecording,
  playheadStep,
  isFullscreen,
  onBack,
  onToggleFullscreen,
  onTogglePlay,
  onStop,
  onToggleLoop,
  onToggleRecord,
  onChangeBpm,
  onUpdateNotes,
  patternOptions,
  activePatternId,
  onSelectPattern,
  onCreatePattern,
  onDuplicatePattern,
  onDeletePattern,
  serumActiveBank,
  serumActiveSlot,
  serumPatterns,
  onSelectSerumBank,
  onSelectSerumSlot,
  beatboxTracks,
  onImportBeatboxSteps,
  dawOutputTarget = 'serum',
  onChangeDawOutputTarget,
  dawStepCount,
  onChangeDawStepCount,
  snapOverride,
  onChangeSnapOverride,
  dawPlayMode,
  onChangeDawPlayMode,
  showKeyboardColumn = true,
  onToggleKeyboardColumn,
}) => {
  const theme = MODE_THEME[mode];

  // Octave window (3 octaves = 37 keys, shiftable C0..C7)
  // Default: Subbass -> C1 (C1..C4); Serum/Sequencer -> C2 (C2..C5)
  const [baseOctave, setBaseOctave] = useState<number>(() => (mode === 'subbass' ? 1 : 2));
  const [tool, setTool] = useState<PianoRollTool>('draw');
  const [localSnap, setLocalSnap] = useState<SnapDivision>('1/4');
  const snap = snapOverride ?? localSnap;
  const setSnap = (next: SnapDivision) => {
    if (onChangeSnapOverride) onChangeSnapOverride(next);
    else setLocalSnap(next);
  };

  // Large touch-friendly dimensions for Android landscape screens
  const [stepWidth, setStepWidth] = useState<number>(() => (totalSteps > 16 ? 44 : 54));
  const [rowHeight, setRowHeight] = useState<number>(() => (mode === 'beatbox' ? 42 : 28));
  const [showVelocity, setShowVelocity] = useState<boolean>(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeKeyMidis, setActiveKeyMidis] = useState<Set<number>>(new Set());
  const [seqLitMidis, setSeqLitMidis] = useState<Set<number>>(new Set());
  const [marqueeRect, setMarqueeRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [hudTooltip, setHudTooltip] = useState<string | null>(null);

  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const keysScrollRef = useRef<HTMLDivElement | null>(null);
  const rulerScrollRef = useRef<HTMLDivElement | null>(null);
  const velScrollRef = useRef<HTMLDivElement | null>(null);

  const dragRef = useRef<DragInteraction | null>(null);
  const lastNoteDurationRef = useRef<number>(1);
  const keyPointerRef = useRef<Map<number, number>>(new Map());
  const stepRecCursorRef = useRef<number>(0);
  const velDragNoteRef = useRef<string | null>(null);
  const erasedInDragRef = useRef<Set<string>>(new Set());
  const notesRef = useRef<RollNote[]>(notes);
  notesRef.current = notes;
  const bpmDragRef = useRef<{ startY: number; startBpm: number } | null>(null);

  const snapSteps = snapToSteps(snap);

  // Build rows (top-to-bottom):
  // - Beatbox: 8 drum voices sorted descending by MIDI note
  // - Melodic plugins: 3-octave window (37 semitones) from baseOctave
  const rows = useMemo<RollRow[]>(() => {
    if (mode === 'beatbox') {
      const sortedIds = [...DRUM_TRACK_ORDER].sort((a, b) => {
        const ma = beatboxTracks?.[a]?.midiNote ?? 36;
        const mb = beatboxTracks?.[b]?.midiNote ?? 36;
        return mb - ma;
      });
      return sortedIds.map((tid) => {
        const tr = beatboxTracks?.[tid];
        const midi = tr?.midiNote ?? 36;
        return {
          midi,
          label: tr?.name ?? tid.toUpperCase(),
          shortLabel: tr?.shortName ?? tid.toUpperCase(),
          isBlack: false,
          isC: false,
          drumTrackId: tid,
          accentColor: tr?.accentColor ?? 'amber',
        };
      });
    }

    const minMidi = (baseOctave + 1) * 12; // e.g. baseOctave=1 -> C1 (24)
    const maxMidi = minMidi + 36; // 3 octaves inclusive -> C4 (60)
    const out: RollRow[] = [];
    for (let m = maxMidi; m >= minMidi; m--) {
      const semi = m % 12;
      const isBlack = BLACK_SEMITONES.has(semi);
      const isC = semi === 0;
      const lbl = midiLabel(m);
      out.push({
        midi: m,
        label: lbl,
        shortLabel: lbl,
        isBlack,
        isC,
      });
    }
    return out;
  }, [mode, baseOctave, beatboxTracks]);

  const midiToRowIndex = useMemo(() => {
    const map = new Map<number, number>();
    rows.forEach((r, idx) => map.set(r.midi, idx));
    return map;
  }, [rows]);

  const gridWidth = totalSteps * stepWidth;
  const gridHeight = rows.length * rowHeight;

  // Center vertical scroll near middle of current octave range on mount or octave shift
  useEffect(() => {
    const g = gridScrollRef.current;
    if (!g || mode === 'beatbox') return;
    const midIdx = Math.floor(rows.length * 0.45);
    const targetTop = Math.max(0, midIdx * rowHeight - g.clientHeight / 2);
    g.scrollTop = targetTop;
    if (keysScrollRef.current) keysScrollRef.current.scrollTop = targetTop;
  }, [mode, baseOctave, rows.length, rowHeight]);

  // Clear selection when switching active pattern
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activePatternId, serumActiveBank, serumActiveSlot]);

  // Visual illumination when sequencer plays notes strictly for THIS mode
  useEffect(() => {
    const timers = new Map<number, number>();
    const unsub = midiBus.subscribe((evt) => {
      if (evt.type !== 'noteOn' || evt.source !== 'piano_roll') return;
      if (mode === 'subbass' && evt.target !== 'subbass') return;
      if (mode === 'ts666' && evt.target !== 'ts666') return;
      if (mode === 'serum' && evt.target && evt.target !== 'serum') return;
      if (mode === 'beatbox' && evt.target !== 'beatbox') return;

      setSeqLitMidis((prev) => new Set(prev).add(evt.midi));
      const old = timers.get(evt.midi);
      if (old !== undefined) window.clearTimeout(old);
      timers.set(
        evt.midi,
        window.setTimeout(() => {
          timers.delete(evt.midi);
          setSeqLitMidis((prev) => {
            if (!prev.has(evt.midi)) return prev;
            const n = new Set(prev);
            n.delete(evt.midi);
            return n;
          });
        }, 150)
      );
    });
    return () => {
      unsub();
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };
  }, [mode]);

  const syncScroll = useCallback(() => {
    const g = gridScrollRef.current;
    if (!g) return;
    if (keysScrollRef.current) keysScrollRef.current.scrollTop = g.scrollTop;
    if (rulerScrollRef.current) rulerScrollRef.current.scrollLeft = g.scrollLeft;
    if (velScrollRef.current) velScrollRef.current.scrollLeft = g.scrollLeft;
  }, []);

  // Engine-isolated pitch auditioning
  const auditionPitch = useCallback(
    (midi: number, velocity = 0.88, noteTarget?: DawMidiOutputTarget) => {
      studioAudio.unlockSync();
      if (mode === 'subbass') {
        void subbassEngine.ensureAudio().then((ctx) => {
          const now = ctx.currentTime;
          subbassEngine.scheduleNote(midi, velocity, now, now + 0.22);
        });
        return;
      }
      if (mode === 'beatbox') {
        void studioAudio.ensureAudio().then((ctx) => {
          beatboxEngine.scheduleByMidiNote(midi, velocity, ctx.currentTime);
        });
        return;
      }
      if (mode === 'ts666') {
        void sixSixSixEngine.ensureAudio().then((ctx) => {
          if (!ctx) return;
          const now = ctx.currentTime;
          sixSixSixEngine.scheduleNote(midi, velocity, now, now + 0.22);
        });
        return;
      }
      if (mode === 'serum') {
        void synthEngine.ensureAudio().then((ctx) => {
          const now = ctx.currentTime;
          void synthEngine.scheduleNote(midi, velocity, now, now + 0.17);
        });
        return;
      }

      // Sequencer mode honors output target
      const tgt = noteTarget ?? dawOutputTarget;
      if (tgt === 'beatbox' || tgt === 'both' || tgt === 'all') {
        void studioAudio.ensureAudio().then((ctx) => {
          beatboxEngine.scheduleByMidiNote(midi, velocity, ctx.currentTime);
        });
      }
      if (tgt === 'serum' || tgt === 'both' || tgt === 'all') {
        void synthEngine.ensureAudio().then((ctx) => {
          const now = ctx.currentTime;
          void synthEngine.scheduleNote(midi, velocity, now, now + 0.17);
        });
      }
      if (tgt === 'subbass' || tgt === 'all') {
        void subbassEngine.ensureAudio().then((ctx) => {
          const now = ctx.currentTime;
          subbassEngine.scheduleNote(midi, velocity, now, now + 0.22);
        });
      }
      if (tgt === 'ts666' || tgt === 'all') {
        void sixSixSixEngine.ensureAudio().then((ctx) => {
          if (!ctx) return;
          const now = ctx.currentTime;
          sixSixSixEngine.scheduleNote(midi, velocity, now, now + 0.22);
        });
      }
    },
    [mode, dawOutputTarget]
  );

  // Coordinate helper
  const clientToGrid = useCallback(
    (clientX: number, clientY: number) => {
      const g = gridScrollRef.current;
      if (!g) return { x: 0, y: 0, step: 0, rowIdx: 0, midi: rows[0]?.midi ?? 48 };
      const rect = g.getBoundingClientRect();
      const x = clientX - rect.left + g.scrollLeft;
      const y = clientY - rect.top + g.scrollTop;
      const step = clamp(x / stepWidth, 0, totalSteps - 0.125);
      const rowIdx = clamp(Math.floor(y / rowHeight), 0, rows.length - 1);
      const midi = rows[rowIdx]?.midi ?? 48;
      return { x, y, step, rowIdx, midi };
    },
    [stepWidth, rowHeight, totalSteps, rows]
  );

  const createNoteAt = useCallback(
    (step: number, rowIdx: number) => {
      const row = rows[rowIdx];
      if (!row) return;
      const minStepSize = Math.min(1, snapSteps);
      const snappedStep = clamp(
        Math.floor(step / snapSteps) * snapSteps,
        0,
        totalSteps - minStepSize
      );
      const dur =
        mode === 'beatbox'
          ? clamp(Math.min(1, snapSteps >= 0.5 ? snapSteps : 0.5), 0.25, totalSteps - snappedStep)
          : clamp(Math.max(snapSteps, lastNoteDurationRef.current), 0.25, totalSteps - snappedStep);

      const id = `pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newNote: RollNote = {
        id,
        midi: row.midi,
        step: snappedStep,
        duration: dur,
        velocity: 0.88,
        ...(mode === 'sequencer' ? { target: dawOutputTarget } : {}),
      };
      onUpdateNotes((prev) => [...prev, newNote]);
      setSelectedIds(new Set([id]));
      auditionPitch(row.midi, 0.88, dawOutputTarget);
    },
    [rows, snapSteps, totalSteps, mode, dawOutputTarget, onUpdateNotes, auditionPitch]
  );

  const deleteNoteById = useCallback(
    (id: string) => {
      onUpdateNotes((prev) => prev.filter((n) => n.id !== id));
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [onUpdateNotes]
  );

  // Grid pointer handlers
  const handleGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const g = gridScrollRef.current;
    if (!g) return;

    const pt = clientToGrid(e.clientX, e.clientY);

    if (tool === 'erase') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      erasedInDragRef.current.clear();
      dragRef.current = { kind: 'erase', pointerId: e.pointerId };
      return;
    }

    if (tool === 'select') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
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

    // Draw mode: tap creates note; drag > 7px pans horizontally & vertically smoothly on touch
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragRef.current = {
      kind: 'pan',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: g.scrollLeft,
      startScrollTop: g.scrollTop,
      moved: false,
      downStep: pt.step,
      downRowIdx: pt.rowIdx,
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
      for (const n of notesRef.current) {
        const rIdx = midiToRowIndex.get(n.midi);
        if (rIdx === undefined) continue;
        const nx1 = n.step * stepWidth;
        const nx2 = (n.step + n.duration) * stepWidth;
        const ny1 = rIdx * rowHeight;
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

      let previewRowIdx: number | null = null;
      let previewTarget: DawMidiOutputTarget | undefined;
      onUpdateNotes((prev) =>
        prev.map((n) => {
          const orig = drag.originNotes.get(n.id);
          if (!orig) return n;
          const nextStep = clamp(orig.step + snappedDeltaStep, 0, totalSteps - n.duration);
          const nextRowIdx = clamp(orig.rowIdx + dyRows, 0, rows.length - 1);
          const nextMidi = rows[nextRowIdx]?.midi ?? n.midi;
          if (n.id === drag.primaryId && nextRowIdx !== drag.lastPreviewRowIdx) {
            previewRowIdx = nextRowIdx;
            previewTarget = n.target;
            drag.lastPreviewRowIdx = nextRowIdx;
          }
          return { ...n, step: nextStep, midi: nextMidi };
        })
      );
      if (previewRowIdx !== null) {
        const r = rows[previewRowIdx];
        if (r) {
          auditionPitch(r.midi, 0.85, previewTarget);
          setHudTooltip(`${r.shortLabel}`);
        }
      }
      return;
    }

    if (drag.kind === 'resize') {
      const dxSteps = (e.clientX - drag.startX) / stepWidth;
      const rawDur = drag.originDuration + dxSteps;
      const minDur = snapSteps === 0.125 ? 0.25 : Math.min(0.25, snapSteps);
      const snappedDur = clamp(
        Math.max(minDur, quantize(rawDur, snapSteps)),
        0.25,
        totalSteps - drag.noteStep
      );
      lastNoteDurationRef.current = snappedDur;
      setHudTooltip(`Len ${snappedDur.toFixed(snappedDur % 1 === 0 ? 0 : 2)}s`);
      onUpdateNotes((prev) =>
        prev.map((n) => (n.id === drag.noteId ? { ...n, duration: snappedDur } : n))
      );
      return;
    }

    if (drag.kind === 'erase') {
      const pt = clientToGrid(e.clientX, e.clientY);
      const hit = notesRef.current.find(
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
      createNoteAt(drag.downStep, drag.downRowIdx);
    }
    if (drag.kind === 'marquee') {
      setMarqueeRect(null);
    }
    setHudTooltip(null);
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

  // Note block pointer handler
  const handleNotePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    note: RollNote,
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

    let activeSel = selectedIds;
    if (!selectedIds.has(note.id)) {
      activeSel = e.shiftKey ? new Set([...selectedIds, note.id]) : new Set([note.id]);
      setSelectedIds(activeSel);
    }

    const originNotes = new Map<string, { step: number; rowIdx: number }>();
    for (const n of notesRef.current) {
      if (activeSel.has(n.id)) {
        const rIdx = midiToRowIndex.get(n.midi);
        if (rIdx !== undefined) {
          originNotes.set(n.id, { step: n.step, rowIdx: rIdx });
        }
      }
    }

    const primaryRowIdx = midiToRowIndex.get(note.midi) ?? 0;
    auditionPitch(note.midi, note.velocity, note.target);

    dragRef.current = {
      kind: 'move',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originNotes,
      primaryId: note.id,
      lastPreviewRowIdx: primaryRowIdx,
    };
  };

  // Left Keyboard / Drum Column interaction
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
    studioAudio.unlockSync();

    if (mode === 'subbass') {
      void subbassEngine.noteOn(midi, 0.9);
      midiBus.emit({ type: 'noteOn', source: 'keyboard', midi, velocity: 0.9, target: 'subbass' });
    } else if (mode === 'beatbox') {
      void beatboxEngine.triggerByMidiNote(midi, 0.92);
      midiBus.emit({ type: 'noteOn', source: 'keyboard', midi, velocity: 0.92, target: 'beatbox' });
    } else if (mode === 'ts666') {
      void sixSixSixEngine.noteOn(midi, 0.88);
      midiBus.emit({ type: 'noteOn', source: 'keyboard', midi, velocity: 0.88, target: 'ts666' });
    } else if (mode === 'serum') {
      void synthEngine.noteOn(midi, 0.85);
      midiBus.emit({ type: 'noteOn', source: 'keyboard', midi, velocity: 0.85, target: 'serum' });
    } else {
      // Sequencer mode respects dawOutputTarget
      if (dawOutputTarget === 'beatbox' || dawOutputTarget === 'both' || dawOutputTarget === 'all') {
        void beatboxEngine.triggerByMidiNote(midi, 0.9);
      }
      if (dawOutputTarget === 'serum' || dawOutputTarget === 'both' || dawOutputTarget === 'all') {
        void synthEngine.noteOn(midi, 0.85);
      }
      if (dawOutputTarget === 'subbass' || dawOutputTarget === 'all') {
        void subbassEngine.noteOn(midi, 0.9);
      }
      if (dawOutputTarget === 'ts666' || dawOutputTarget === 'all') {
        void sixSixSixEngine.noteOn(midi, 0.88);
      }
      midiBus.emit({
        type: 'noteOn',
        source: 'keyboard',
        midi,
        velocity: 0.88,
        target:
          dawOutputTarget === 'subbass'
            ? 'subbass'
            : dawOutputTarget === 'beatbox'
            ? 'beatbox'
            : dawOutputTarget === 'ts666'
            ? 'ts666'
            : 'serum',
      });
    }

    // Step-entry recording when transport is stopped and Record is armed
    if (isRecording && !isPlaying) {
      const stepPos = stepRecCursorRef.current % totalSteps;
      const dur = Math.max(0.5, Math.min(totalSteps - stepPos, snapSteps >= 0.5 ? snapSteps : 1));
      const id = `srec-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const newNote: RollNote = {
        id,
        midi,
        step: stepPos,
        duration: dur,
        velocity: 0.9,
        ...(mode === 'sequencer' ? { target: dawOutputTarget } : {}),
      };
      onUpdateNotes((prev) => [...prev, newNote]);
      stepRecCursorRef.current = (stepPos + (snapSteps >= 0.5 ? snapSteps : 1)) % totalSteps;
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
    if (stillHeld) return;

    if (mode === 'subbass') {
      subbassEngine.noteOff(midi);
      midiBus.emit({ type: 'noteOff', source: 'keyboard', midi, target: 'subbass' });
    } else if (mode === 'beatbox') {
      midiBus.emit({ type: 'noteOff', source: 'keyboard', midi, target: 'beatbox' });
    } else if (mode === 'ts666') {
      sixSixSixEngine.noteOff(midi);
      midiBus.emit({ type: 'noteOff', source: 'keyboard', midi, target: 'ts666' });
    } else if (mode === 'serum') {
      synthEngine.noteOff(midi);
      midiBus.emit({ type: 'noteOff', source: 'keyboard', midi, target: 'serum' });
    } else {
      if (dawOutputTarget === 'serum' || dawOutputTarget === 'both' || dawOutputTarget === 'all') {
        synthEngine.noteOff(midi);
      }
      if (dawOutputTarget === 'subbass' || dawOutputTarget === 'all') {
        subbassEngine.noteOff(midi);
      }
      if (dawOutputTarget === 'ts666' || dawOutputTarget === 'all') {
        sixSixSixEngine.noteOff(midi);
      }
      midiBus.emit({
        type: 'noteOff',
        source: 'keyboard',
        midi,
        target:
          dawOutputTarget === 'subbass'
            ? 'subbass'
            : dawOutputTarget === 'beatbox'
            ? 'beatbox'
            : dawOutputTarget === 'ts666'
            ? 'ts666'
            : 'serum',
      });
    }
  };

  // Velocity lane drag
  const handleVelocityPointer = (e: React.PointerEvent<HTMLDivElement>, noteId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relY = 1 - clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const vel = clamp(0.08 + relY * 0.92, 0.08, 1);
    onUpdateNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, velocity: vel } : n))
    );
    setHudTooltip(`Vel ${Math.round(vel * 127)}`);
  };

  // Quantize selected or all notes
  const handleQuantize = () => {
    const qStep = snap === 'off' ? 0.5 : snapSteps;
    onUpdateNotes((prev) =>
      prev.map((n) => {
        if (selectedIds.size > 0 && !selectedIds.has(n.id)) return n;
        const qStart = clamp(Math.round(n.step / qStep) * qStep, 0, totalSteps - qStep);
        const qDur = clamp(
          Math.max(qStep, Math.round(n.duration / qStep) * qStep),
          0.25,
          totalSteps - qStart
        );
        return { ...n, step: qStart, duration: qDur };
      })
    );
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const toDelete = new Set(selectedIds);
    onUpdateNotes((prev) => prev.filter((n) => !toDelete.has(n.id)));
    setSelectedIds(new Set());
  };

  const handleRetargetDaw = (target: DawMidiOutputTarget) => {
    onChangeDawOutputTarget?.(target);
    if (selectedIds.size > 0) {
      onUpdateNotes((prev) =>
        prev.map((n) => (selectedIds.has(n.id) ? { ...(n as DawMidiNote), target } : n))
      );
    }
  };

  // Selected note length nudge (+/- snap step) for effortless touch precision
  const singleSelectedNote = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const id = Array.from(selectedIds)[0];
    return notes.find((n) => n.id === id) ?? null;
  }, [selectedIds, notes]);

  const adjustSelectedLength = (delta: number) => {
    if (!singleSelectedNote) return;
    const inc = snapSteps === 0.125 ? 0.25 : snapSteps;
    const nextDur = clamp(
      singleSelectedNote.duration + delta * inc,
      0.25,
      totalSteps - singleSelectedNote.step
    );
    lastNoteDurationRef.current = nextDur;
    onUpdateNotes((prev) =>
      prev.map((n) => (n.id === singleSelectedNote.id ? { ...n, duration: nextDur } : n))
    );
  };

  const clampedHead = playheadStep % totalSteps;
  const currentBar = Math.floor(clampedHead / 16) + 1;
  const currentBeat = Math.floor((clampedHead % 16) / 4) + 1;
  const currentSub = Math.floor(clampedHead % 4) + 1;

  // Compute out-of-range notes summary when octave-shifted so user knows if notes exist above/below
  const outOfRangeCount = useMemo(() => {
    if (mode === 'beatbox') return 0;
    let count = 0;
    for (const n of notes) {
      if (!midiToRowIndex.has(n.midi)) count++;
    }
    return count;
  }, [mode, notes, midiToRowIndex]);

  return (
    <div
      role="dialog"
      aria-label={`${theme.title} Fullscreen Piano Roll`}
      className="fixed inset-0 z-40 flex flex-col h-dvh w-screen bg-[#070A10] text-slate-100 overflow-hidden select-none"
    >
      {/* SINGLE COMPACT FULLSCREEN TOOLBAR */}
      <header className="h-11 px-2 bg-[#0E131E] border-b border-[#232D42] flex items-center justify-between gap-2 overflow-x-auto synth-scroll shrink-0">
        {/* LEFT GROUP: BACK + MODE + PATTERN SELECTOR & CRUD */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onBack}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex items-center gap-1 px-2.5 h-8 rounded-md bg-[#182234] hover:bg-[#22304A] border border-cyan-400/50 text-cyan-200 font-display font-bold text-xs tracking-wide cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span>BACK</span>
          </button>

          <span
            className={`inline-flex items-center px-2 h-7 rounded border font-display text-[11px] font-bold tracking-wider whitespace-nowrap shrink-0 ${theme.badgeBg}`}
          >
            {theme.title}
          </span>

          {/* Pattern Selector: SERUM uses Bank+Slot; SUBBASS/BEATBOX/SEQUENCER use Pattern Dropdown */}
          {mode === 'serum' && serumActiveBank && serumActiveSlot !== undefined ? (
            <div className="flex items-center gap-1 shrink-0">
              <div className="flex items-center gap-0.5 bg-[#080B11] p-0.5 rounded border border-[#242E40]">
                {BANKS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => onSelectSerumBank?.(b)}
                    className={`w-6 h-6 rounded text-[11px] font-display font-bold cursor-pointer ${
                      b === serumActiveBank
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
              <select
                aria-label="SERUM Pattern Slot"
                value={serumActiveSlot}
                onChange={(e) => onSelectSerumSlot?.(Number(e.target.value))}
                className="h-8 px-1.5 rounded bg-[#080B11] border border-[#242E40] font-mono-num text-xs text-cyan-300 focus:outline-none cursor-pointer"
              >
                {SLOTS.map((s) => {
                  const pid = `${serumActiveBank}${s}`;
                  const cnt = serumPatterns?.[pid]?.notes.length ?? 0;
                  return (
                    <option key={s} value={s} className="bg-[#0E131E] text-slate-100">
                      {pid}
                      {cnt > 0 ? ` (${cnt})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : (
            patternOptions &&
            activePatternId && (
              <select
                aria-label={`${theme.title} Pattern`}
                value={activePatternId}
                onChange={(e) => onSelectPattern?.(e.target.value)}
                className="h-8 px-2 rounded bg-[#080B11] border border-[#242E40] text-xs font-medium text-slate-100 focus:outline-none focus:border-blue-400 cursor-pointer max-w-[140px]"
              >
                {patternOptions.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-[#0E131E] text-slate-100">
                    {opt.label}
                    {opt.noteCount > 0 ? ` (${opt.noteCount})` : ''}
                  </option>
                ))}
              </select>
            )
          )}

          {/* Pattern Create / Duplicate / Delete */}
          <div className="flex items-center gap-0.5 bg-[#080B11] p-0.5 rounded border border-[#242E40] shrink-0">
            {onCreatePattern && (
              <button
                type="button"
                title="Create New Pattern"
                onClick={onCreatePattern}
                className="inline-flex items-center gap-0.5 px-1.5 h-7 rounded text-[11px] font-medium text-emerald-300 hover:bg-[#172133] cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">New</span>
              </button>
            )}
            {onDuplicatePattern && (
              <button
                type="button"
                title="Duplicate Pattern"
                onClick={onDuplicatePattern}
                className="inline-flex items-center gap-0.5 px-1.5 h-7 rounded text-[11px] font-medium text-cyan-300 hover:bg-[#172133] cursor-pointer whitespace-nowrap"
              >
                <CopyPlus className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Dup</span>
              </button>
            )}
            {onDeletePattern && (
              <button
                type="button"
                title="Delete / Clear Pattern"
                onClick={onDeletePattern}
                className="inline-flex items-center gap-0.5 px-1.5 h-7 rounded text-[11px] font-medium text-rose-300 hover:bg-rose-500/20 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Del</span>
              </button>
            )}
          </div>

          {mode === 'beatbox' && onImportBeatboxSteps && (
            <button
              type="button"
              title="Import hits from active Beatbox 16-step grid"
              onClick={onImportBeatboxSteps}
              className="px-2 h-8 rounded bg-[#080B11] border border-amber-400/40 text-[11px] font-medium text-amber-300 hover:bg-amber-500/15 cursor-pointer whitespace-nowrap shrink-0"
            >
              From Steps
            </button>
          )}

          {/* SUBBASS / Optional Piano Keyboard Column Visibility Button */}
          {onToggleKeyboardColumn && (
            <button
              type="button"
              aria-pressed={showKeyboardColumn}
              onClick={onToggleKeyboardColumn}
              style={{ touchAction: 'manipulation' }}
              title={showKeyboardColumn ? 'Hide Piano Keyboard Column' : 'Show Piano Keyboard Column'}
              className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded border text-[11px] font-display font-bold tracking-wide cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                showKeyboardColumn
                  ? 'bg-blue-600/25 border-blue-400/70 text-blue-200'
                  : 'bg-[#080B11] border-[#242E40] text-slate-300 hover:text-white'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5 shrink-0" />
              <span>{showKeyboardColumn ? 'KEYBOARD ON' : 'KEYBOARD OFF'}</span>
            </button>
          )}

          {/* SEQUENCER Mode Step Count, Loop Scope & Target Output */}
          {mode === 'sequencer' && (
            <div className="flex items-center gap-1 shrink-0">
              {dawPlayMode && onChangeDawPlayMode && (
                <div className="flex items-center bg-[#080B11] p-0.5 rounded border border-[#242E40]">
                  {(['pattern', 'song'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={dawPlayMode === m}
                      onClick={() => onChangeDawPlayMode(m)}
                      className={`px-2 h-6 rounded text-[10px] font-display font-bold uppercase cursor-pointer transition-colors ${
                        dawPlayMode === m
                          ? m === 'song'
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-cyan-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {m === 'pattern' ? 'PAT' : 'SONG'}
                    </button>
                  ))}
                </div>
              )}
              {dawStepCount && onChangeDawStepCount && (
                <select
                  aria-label="Pattern Length"
                  value={dawStepCount}
                  onChange={(e) => onChangeDawStepCount(Number(e.target.value) as 16 | 32 | 64)}
                  className="h-8 px-1.5 rounded bg-[#080B11] border border-[#242E40] font-mono-num text-[11px] text-emerald-300 focus:outline-none cursor-pointer"
                >
                  <option value={16}>16s</option>
                  <option value={32}>32s</option>
                  <option value={64}>64s</option>
                </select>
              )}
              {onChangeDawOutputTarget && (
                <select
                  aria-label="MIDI Output Target"
                  value={dawOutputTarget}
                  onChange={(e) => handleRetargetDaw(e.target.value as DawMidiOutputTarget)}
                  className="h-8 px-1.5 rounded bg-[#080B11] border border-[#242E40] text-[11px] font-display font-bold uppercase text-cyan-300 focus:outline-none cursor-pointer"
                >
                  <option value="subbass">OUT: SUBBASS</option>
                  <option value="ts666">OUT: 666TS</option>
                  <option value="beatbox">OUT: BEATBOX</option>
                  <option value="all">OUT: ALL</option>
                </select>
              )}
            </div>
          )}
        </div>

        {/* CENTER GROUP: EDIT TOOLS, SNAP, QUANTIZE, OCTAVE RANGE, ZOOM */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-0.5 bg-[#080B11] p-0.5 rounded border border-[#242E40]">
            {(
              [
                { id: 'draw', label: 'Draw', icon: Pencil },
                { id: 'select', label: 'Sel', icon: MousePointer2 },
                { id: 'erase', label: 'Del', icon: Eraser },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const active = tool === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTool(t.id)}
                  className={`inline-flex items-center gap-1 px-2 h-7 rounded text-[11px] font-medium cursor-pointer ${
                    active
                      ? t.id === 'erase'
                        ? 'bg-rose-500/25 text-rose-200 border border-rose-400/50'
                        : 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/50'
                      : 'text-slate-400 hover:text-white border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Selected note delete or length quick controls */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              {singleSelectedNote && (
                <div className="flex items-center bg-[#080B11] rounded border border-[#242E40] h-8">
                  <button
                    type="button"
                    title="Shorten Note"
                    onClick={() => adjustSelectedLength(-1)}
                    className="px-1.5 h-full text-xs text-slate-300 hover:text-white cursor-pointer"
                  >
                    −Len
                  </button>
                  <button
                    type="button"
                    title="Lengthen Note"
                    onClick={() => adjustSelectedLength(1)}
                    className="px-1.5 h-full text-xs text-slate-300 hover:text-white border-l border-[#242E40] cursor-pointer"
                  >
                    +Len
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="inline-flex items-center gap-1 px-2 h-8 rounded bg-rose-500/20 border border-rose-400/50 text-rose-200 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3 h-3" />
                <span>({selectedIds.size})</span>
              </button>
            </div>
          )}

          {/* Snap & Quantize */}
          <select
            aria-label="Grid Snap"
            value={snap}
            onChange={(e) => setSnap(e.target.value as SnapDivision)}
            className="h-8 px-1.5 rounded bg-[#080B11] border border-[#242E40] font-mono-num text-[11px] text-cyan-300 focus:outline-none cursor-pointer"
          >
            {SNAP_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id} className="bg-[#0E131E] text-slate-100">
                {opt.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            title="Quantize Selected (or All) Notes"
            onClick={handleQuantize}
            className="inline-flex items-center gap-1 px-2 h-8 rounded bg-[#080B11] border border-[#242E40] text-[11px] font-medium text-cyan-300 hover:border-cyan-400/60 cursor-pointer whitespace-nowrap"
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Quant</span>
          </button>

          {/* Octave Range Switcher (melodic modes) */}
          {mode !== 'beatbox' && (
            <div className="flex items-center bg-[#080B11] rounded border border-[#242E40] h-8 shrink-0">
              <button
                type="button"
                aria-label="Octave Down"
                disabled={baseOctave <= 0}
                onClick={() => setBaseOctave((o) => Math.max(0, o - 1))}
                className="px-1.5 h-full text-xs text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
              >
                Oct−
              </button>
              <span className="px-1.5 font-mono-num text-[11px] text-blue-200 whitespace-nowrap">
                C{baseOctave}–C{baseOctave + 3}
              </span>
              <button
                type="button"
                aria-label="Octave Up"
                disabled={baseOctave >= 4}
                onClick={() => setBaseOctave((o) => Math.min(4, o + 1))}
                className="px-1.5 h-full text-xs text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
              >
                Oct+
              </button>
            </div>
          )}

          {/* Velocity Toggle & Zoom */}
          <button
            type="button"
            onClick={() => setShowVelocity((v) => !v)}
            className={`inline-flex items-center gap-1 px-2 h-8 rounded border text-[11px] font-medium cursor-pointer ${
              showVelocity
                ? 'bg-amber-500/15 border-amber-400/50 text-amber-300'
                : 'bg-[#080B11] border-[#242E40] text-slate-400 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Vel</span>
          </button>

          <div className="flex items-center bg-[#080B11] rounded border border-[#242E40] h-8 shrink-0">
            <button
              type="button"
              aria-label="Zoom Out"
              onClick={() => {
                setStepWidth((w) => Math.max(28, w - 8));
                setRowHeight((h) => Math.max(mode === 'beatbox' ? 28 : 20, h - 3));
              }}
              className="w-7 h-full flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Zoom In"
              onClick={() => {
                setStepWidth((w) => Math.min(96, w + 8));
                setRowHeight((h) => Math.min(mode === 'beatbox' ? 68 : 42, h + 3));
              }}
              className="w-7 h-full flex items-center justify-center text-slate-300 hover:text-white border-l border-[#242E40] cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* RIGHT GROUP: COMPACT TRANSPORT + BPM + POS + FULLSCREEN TOGGLE */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Stop' : 'Play'}
            className={`inline-flex items-center gap-1 h-8 px-2.5 rounded border text-xs font-semibold cursor-pointer ${
              isPlaying
                ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                : 'bg-[#080B11] text-emerald-300 border-[#242E40] hover:border-emerald-400/60'
            }`}
          >
            {isPlaying ? (
              <Square className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span className="hidden xl:inline">{isPlaying ? 'Stop' : 'Play'}</span>
          </button>

          <button
            type="button"
            title="Stop & Reset Playhead"
            aria-label="Stop and Reset"
            onClick={onStop}
            className="w-8 h-8 rounded bg-[#080B11] border border-[#242E40] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            title="Toggle Loop"
            aria-pressed={loop}
            onClick={onToggleLoop}
            className={`w-8 h-8 rounded border flex items-center justify-center cursor-pointer ${
              loop
                ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300'
                : 'bg-[#080B11] border-[#242E40] text-slate-400 hover:text-white'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            title={isPlaying ? 'Live Record MIDI' : 'Arm Step Record'}
            aria-pressed={isRecording}
            onClick={onToggleRecord}
            className={`w-8 h-8 rounded border flex items-center justify-center cursor-pointer ${
              isRecording
                ? 'bg-rose-500/25 border-rose-400 text-rose-400 animate-pulse'
                : 'bg-[#080B11] border-[#242E40] text-slate-400 hover:text-rose-300'
            }`}
          >
            <Circle className="w-3.5 h-3.5 fill-current" />
          </button>

          {/* Compact BPM adjuster */}
          <div className="flex items-center bg-[#080B11] rounded border border-[#242E40] h-8">
            <button
              type="button"
              aria-label="Decrease BPM"
              onClick={() => onChangeBpm(bpm - 1)}
              className="w-6 h-full text-slate-400 hover:text-white cursor-pointer text-xs"
            >
              −
            </button>
            <span
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                bpmDragRef.current = { startY: e.clientY, startBpm: bpm };
              }}
              onPointerMove={(e) => {
                if (!bpmDragRef.current) return;
                const dy = bpmDragRef.current.startY - e.clientY;
                onChangeBpm(Math.round(bpmDragRef.current.startBpm + dy * 0.4));
              }}
              onPointerUp={() => {
                bpmDragRef.current = null;
              }}
              title="Drag vertically to adjust BPM"
              className="px-1.5 font-mono-num text-[11px] font-semibold text-cyan-200 cursor-ns-resize whitespace-nowrap"
            >
              {bpm} BPM
            </span>
            <button
              type="button"
              aria-label="Increase BPM"
              onClick={() => onChangeBpm(bpm + 1)}
              className="w-6 h-full text-slate-400 hover:text-white cursor-pointer text-xs"
            >
              +
            </button>
          </div>

          <span className="hidden md:inline-flex items-center px-2 h-8 rounded bg-[#080B11] border border-[#242E40] font-mono-num text-[11px] text-slate-300">
            {currentBar}.{currentBeat}.{currentSub}
          </span>

          <button
            type="button"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit Browser Fullscreen' : 'Enter Browser Fullscreen'}
            aria-label="Toggle Fullscreen"
            className="w-8 h-8 rounded bg-[#080B11] border border-[#242E40] flex items-center justify-center text-slate-300 hover:text-cyan-300 cursor-pointer shrink-0"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </header>

      {/* MAIN FULLSCREEN WORKSPACE: LEFT PIANO/DRUM COLUMN + TIMELINE + TOUCH NOTE GRID + VELOCITY */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* PINNED LEFT PIANO KEYBOARD / DRUM VOICES COLUMN (collapsible for extra grid width) */}
        {showKeyboardColumn && (
        <div className="w-[70px] sm:w-[82px] flex flex-col border-r border-[#242E40] bg-[#0A0E16] shrink-0">
          {/* Corner Header */}
          <div className="h-7 border-b border-[#242E40] bg-[#101623] flex items-center justify-center px-1 shrink-0">
            <span className="font-mono-num text-[10px] font-bold text-cyan-300 truncate">
              {hudTooltip
                ? hudTooltip
                : activeKeyMidis.size > 0
                ? midiLabel(Array.from(activeKeyMidis)[activeKeyMidis.size - 1])
                : outOfRangeCount > 0
                ? `${outOfRangeCount} off-rng`
                : `${notes.length} notes`}
            </span>
          </div>

          {/* Playable Keys / Drum Rows */}
          <div
            ref={keysScrollRef}
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => {
              e.preventDefault();
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // ignore
              }
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
              {rows.map((row) => {
                const isLit = activeKeyMidis.has(row.midi) || seqLitMidis.has(row.midi);
                if (mode === 'beatbox') {
                  return (
                    <div
                      key={row.midi}
                      data-roll-midi={row.midi}
                      style={{ height: rowHeight }}
                      className={`flex items-center justify-between px-2 border-b border-[#1D2536] cursor-pointer transition-colors ${
                        isLit
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : row.accentColor === 'amber'
                          ? 'bg-[#171B26] text-amber-200 hover:bg-[#1E2535]'
                          : 'bg-[#121722] text-cyan-200 hover:bg-[#1A2231]'
                      }`}
                    >
                      <span className="font-display text-[11px] font-bold truncate pointer-events-none">
                        {row.shortLabel}
                      </span>
                      <span className="font-mono-num text-[9px] opacity-60 pointer-events-none">
                        {row.midi}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={row.midi}
                    data-roll-midi={row.midi}
                    style={{ height: rowHeight }}
                    className={`relative flex items-center justify-end pr-1.5 border-b border-[#1C2433] text-[10px] font-mono-num transition-colors ${
                      row.isBlack
                        ? isLit
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'bg-[#1A2130] text-slate-400'
                        : isLit
                        ? 'bg-cyan-300 text-slate-950 font-bold'
                        : row.isC
                        ? 'bg-[#E2E8F0] text-slate-950 font-bold'
                        : 'bg-[#CBD5E1] text-slate-700'
                    }`}
                  >
                    {row.isBlack && (
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-[60%] rounded-r-sm border-r border-b ${
                          isLit
                            ? 'bg-cyan-400 border-cyan-200'
                            : 'bg-[#080B10] border-[#04060A]'
                        }`}
                      />
                    )}
                    <span className="relative z-10 pointer-events-none">
                      {row.isC || rowHeight >= 26 ? row.label : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Velocity Corner Label */}
          {showVelocity && (
            <div className="h-12 border-t border-[#242E40] bg-[#101623] flex items-center justify-center shrink-0">
              <span className="text-[10px] font-semibold text-slate-400">VEL</span>
            </div>
          )}
        </div>
        )}

        {/* RIGHT GRID AREA: TIMELINE + NOTE GRID + VELOCITY */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Pinned Top Timeline Ruler */}
          <div
            ref={rulerScrollRef}
            className="h-7 border-b border-[#242E40] bg-[#101623] overflow-hidden shrink-0"
          >
            <div style={{ width: gridWidth }} className="relative h-full flex">
              {Array.from({ length: totalSteps }).map((_, stepIdx) => {
                const isBarStart = stepIdx % 16 === 0;
                const isBeatStart = stepIdx % 4 === 0;
                const barNum = Math.floor(stepIdx / 16) + 1;
                const beatNum = Math.floor((stepIdx % 16) / 4) + 1;
                return (
                  <div
                    key={stepIdx}
                    style={{ width: stepWidth }}
                    className={`h-full border-r flex items-center pl-1.5 font-mono-num text-[10px] shrink-0 ${
                      isBarStart
                        ? 'border-l border-l-cyan-400/50 border-r-[#242E40] text-cyan-200 font-bold'
                        : isBeatStart
                        ? 'border-l border-l-[#334155] border-r-[#1E2736] text-slate-200 font-semibold'
                        : 'border-r-[#18202E] text-slate-500'
                    }`}
                  >
                    {isBeatStart ? `${barNum}.${beatNum}` : stepIdx + 1}
                  </div>
                );
              })}

              {/* Ruler Playhead Marker */}
              <div
                style={{ transform: `translateX(${clampedHead * stepWidth}px)` }}
                className={`absolute top-0 bottom-0 left-0 w-0.5 pointer-events-none ${theme.playheadBg}`}
              >
                <div className={`w-2.5 h-2.5 -ml-1 rotate-45 -mt-1 ${theme.playheadBg}`} />
              </div>
            </div>
          </div>

          {/* Scrollable Touch-Friendly MIDI Grid */}
          <div
            ref={gridScrollRef}
            onScroll={syncScroll}
            style={{ touchAction: 'none' }}
            onPointerDown={handleGridPointerDown}
            onPointerMove={handleGridPointerMove}
            onPointerUp={handleGridPointerUp}
            onPointerCancel={handleGridPointerUp}
            className="flex-1 overflow-auto synth-scroll relative bg-[#080C14]"
          >
            <div style={{ width: gridWidth, height: gridHeight }} className="relative">
              {/* Row Backgrounds */}
              {rows.map((row, rIdx) => {
                const isRowActive = activeKeyMidis.has(row.midi) || seqLitMidis.has(row.midi);
                return (
                  <div
                    key={row.midi}
                    style={{ top: rIdx * rowHeight, height: rowHeight }}
                    className={`absolute inset-x-0 border-b pointer-events-none ${
                      row.isC ? 'border-[#2E3C54]' : 'border-[#161E2D]'
                    } ${
                      isRowActive
                        ? 'bg-cyan-500/12'
                        : mode === 'beatbox'
                        ? rIdx % 2 === 0
                          ? 'bg-[#0E131E]'
                          : 'bg-[#0A0E17]'
                        : row.isBlack
                        ? 'bg-[#090D16]'
                        : row.isC
                        ? 'bg-[#141B29]'
                        : 'bg-[#0F1522]'
                    }`}
                  />
                );
              })}

              {/* Vertical Step / Beat / Bar Grid Lines */}
              {Array.from({ length: totalSteps }).map((_, stepIdx) => {
                const isBar = stepIdx % 16 === 0;
                const isBeat = stepIdx % 4 === 0;
                const isHalf = stepIdx % 2 === 0;
                return (
                  <div
                    key={stepIdx}
                    style={{ left: stepIdx * stepWidth, width: stepWidth }}
                    className={`absolute top-0 bottom-0 border-r pointer-events-none ${
                      isBar
                        ? 'border-l border-l-cyan-400/35 border-r-[#1A2232]'
                        : isBeat
                        ? 'border-l border-l-[#334155] border-r-[#18202F]'
                        : isHalf
                        ? 'border-r-[#1E283B]'
                        : 'border-r-[#141B28]'
                    }`}
                  />
                );
              })}

              {/* Notes */}
              {notes.map((note) => {
                const rowIdx = midiToRowIndex.get(note.midi);
                if (rowIdx === undefined) return null;
                const isSelected = selectedIds.has(note.id);
                const left = note.step * stepWidth;
                const width = Math.max(20, note.duration * stepWidth);
                const top = rowIdx * rowHeight + 2;
                const height = Math.max(16, rowHeight - 4);
                const isPlayingNow =
                  isPlaying &&
                  clampedHead >= note.step &&
                  clampedHead < note.step + note.duration;

                let noteColorClass = isPlayingNow ? theme.notePlaying : theme.noteBg;
                if (mode === 'sequencer' && !isPlayingNow) {
                  noteColorClass =
                    note.target === 'beatbox'
                      ? 'bg-amber-500/85 border-amber-200 text-slate-950'
                      : note.target === 'subbass'
                      ? 'bg-gradient-to-r from-blue-500 to-violet-500 border-blue-200 text-white'
                      : note.target === 'ts666'
                      ? 'bg-rose-500/85 border-rose-200 text-white'
                      : note.target === 'both' || note.target === 'all'
                      ? 'bg-emerald-500/85 border-emerald-200 text-slate-950'
                      : 'bg-cyan-500/85 border-cyan-200 text-slate-950';
                }

                const noteText =
                  mode === 'beatbox'
                    ? rows[rowIdx]?.shortLabel ?? midiLabel(note.midi)
                    : midiLabel(note.midi);

                return (
                  <div
                    key={note.id}
                    onPointerDown={(e) => handleNotePointerDown(e, note, false)}
                    style={{ left, top, width, height }}
                    className={`absolute rounded border flex items-center justify-between overflow-hidden cursor-grab active:cursor-grabbing transition-shadow ${noteColorClass} ${
                      isSelected ? 'ring-2 ring-white z-10' : ''
                    }`}
                  >
                    {/* Left Velocity Fill Bar */}
                    <div
                      style={{ height: `${Math.round(note.velocity * 100)}%` }}
                      className="w-1.5 self-end bg-black/35 shrink-0 pointer-events-none"
                    />

                    {/* Note Label */}
                    {width >= 28 && (
                      <span className="font-mono-num text-[10px] font-bold px-1 truncate pointer-events-none">
                        {noteText}
                      </span>
                    )}

                    {/* Touch-Friendly Right Resize Handle */}
                    <div
                      onPointerDown={(e) => handleNotePointerDown(e, note, true)}
                      title="Drag to resize note length"
                      className="w-4 sm:w-5 h-full bg-black/25 hover:bg-black/45 border-l border-black/25 cursor-ew-resize shrink-0 flex items-center justify-center"
                    >
                      <span className="w-0.5 h-3 bg-white/70 rounded-full pointer-events-none" />
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

              {/* Sweeping Playhead */}
              <div
                style={{ transform: `translateX(${clampedHead * stepWidth}px)` }}
                className={`absolute top-0 bottom-0 left-0 w-0.5 pointer-events-none z-30 ${theme.playheadBg}`}
              />
            </div>

            {/* Compact floating HUD badge when left keyboard column is hidden */}
            {!showKeyboardColumn && (hudTooltip || activeKeyMidis.size > 0) && (
              <div className="pointer-events-none sticky bottom-2 left-2 inline-flex items-center px-2.5 py-1 rounded bg-[#0E131E]/90 border border-blue-400/50 font-mono-num text-[11px] font-bold text-blue-200 shadow-lg z-30">
                {hudTooltip ?? midiLabel(Array.from(activeKeyMidis)[activeKeyMidis.size - 1])}
              </div>
            )}
          </div>

          {/* Velocity Lane */}
          {showVelocity && (
            <div
              ref={velScrollRef}
              className="h-12 border-t border-[#242E40] bg-[#0A0E16] overflow-hidden shrink-0"
            >
              <div style={{ width: gridWidth }} className="relative h-full">
                {Array.from({ length: totalSteps }).map((_, sIdx) => (
                  <div
                    key={sIdx}
                    style={{ left: sIdx * stepWidth, width: stepWidth }}
                    className={`absolute top-0 bottom-0 border-r pointer-events-none ${
                      sIdx % 4 === 0
                        ? 'border-l border-l-[#263042] border-r-[#141A26]'
                        : 'border-r-[#141A26]'
                    }`}
                  />
                ))}

                {notes.map((note) => {
                  const isSel = selectedIds.has(note.id);
                  const barH = Math.round(note.velocity * 38);
                  return (
                    <div
                      key={note.id}
                      style={{
                        left: note.step * stepWidth,
                        width: Math.max(18, Math.min(28, note.duration * stepWidth)),
                        touchAction: 'none',
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        try {
                          e.currentTarget.setPointerCapture(e.pointerId);
                        } catch {
                          // ignore
                        }
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
                          setHudTooltip(null);
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
                        className={`w-3 rounded-t-sm border-t-2 transition-colors ${
                          isSel ? 'bg-white/80 border-white' : theme.velBar
                        }`}
                      />
                    </div>
                  );
                })}

                <div
                  style={{ transform: `translateX(${clampedHead * stepWidth}px)` }}
                  className={`absolute top-0 bottom-0 left-0 w-0.5 opacity-60 pointer-events-none ${theme.playheadBg}`}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
