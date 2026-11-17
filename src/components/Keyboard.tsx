import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Volume2 } from 'lucide-react';
import { midiBus } from '../audio/MidiBus';
import { studioAudio } from '../audio/StudioAudio';
import { synthEngine } from '../audio/SynthEngine';

interface KeyboardProps {
  glideMs: number;
  masterVolume: number;
  compact?: boolean;
  onChangeGlideMs: (ms: number) => void;
  onChangeMasterVolume: (vol: number) => void;
}

interface KeyDef {
  midi: number;
  noteName: string;
  isBlack: boolean;
  whiteIndex: number; // position index among white keys
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

// QWERTY mapping relative to baseOctave C
const QWERTY_MAP: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, ',': 12,
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23, i: 24,
};

export const Keyboard: React.FC<KeyboardProps> = ({
  glideMs,
  masterVolume,
  compact = false,
  onChangeGlideMs,
  onChangeMasterVolume,
}) => {
  const [baseOctave, setBaseOctave] = useState<number>(3); // C3 = MIDI 48
  const [octaveSpan, setOctaveSpan] = useState<2 | 3>(2);
  const [holdActive, setHoldActive] = useState<boolean>(false);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [pitchBend, setPitchBend] = useState<number>(0);
  const [modWheel, setModWheel] = useState<number>(0);

  const keysContainerRef = useRef<HTMLDivElement | null>(null);
  const pointerNotesRef = useRef<Map<number, number>>(new Map());
  const qwertyNotesRef = useRef<Map<string, number>>(new Map());

  const keys = useMemo<KeyDef[]>(() => {
    const startMidi = (baseOctave + 1) * 12; // MIDI 48 = C3 when baseOctave=3
    const totalSemitones = octaveSpan * 12 + 1; // Include top C
    const result: KeyDef[] = [];
    let whiteCounter = 0;

    for (let i = 0; i < totalSemitones; i++) {
      const midi = startMidi + i;
      const semi = midi % 12;
      const oct = Math.floor(midi / 12) - 1;
      const isBlack = BLACK_SEMITONES.has(semi);
      const noteName = `${NOTE_NAMES[semi]}${oct}`;
      if (!isBlack) {
        result.push({ midi, noteName, isBlack: false, whiteIndex: whiteCounter });
        whiteCounter++;
      } else {
        result.push({ midi, noteName, isBlack: true, whiteIndex: whiteCounter - 1 });
      }
    }
    return result;
  }, [baseOctave, octaveSpan]);

  const whiteKeys = useMemo(() => keys.filter((k) => !k.isBlack), [keys]);
  const blackKeys = useMemo(() => keys.filter((k) => k.isBlack), [keys]);

  const syncActiveNotesState = useCallback(() => {
    const next = new Set<number>();
    pointerNotesRef.current.forEach((m) => next.add(m));
    qwertyNotesRef.current.forEach((m) => next.add(m));
    setActiveNotes(next);
  }, []);

  const triggerOn = useCallback((midi: number, velocity = 0.85) => {
    studioAudio.unlockSync();
    void synthEngine.noteOn(midi, velocity);
    midiBus.emit({ type: 'noteOn', source: 'keyboard', midi, velocity });
  }, []);

  const triggerOff = useCallback((midi: number) => {
    // Only release if no other pointer or qwerty key is holding this same MIDI note
    let stillHeld = false;
    pointerNotesRef.current.forEach((m) => {
      if (m === midi) stillHeld = true;
    });
    qwertyNotesRef.current.forEach((m) => {
      if (m === midi) stillHeld = true;
    });
    if (!stillHeld) {
      synthEngine.noteOff(midi);
      midiBus.emit({ type: 'noteOff', source: 'keyboard', midi });
    }
  }, []);

  const resolveMidiAtPoint = (clientX: number, clientY: number): { midi: number; velocity: number } | null => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!el) return null;
    const keyEl = el.closest('[data-midi]') as HTMLElement | null;
    if (!keyEl) return null;
    const midi = Number(keyEl.dataset.midi);
    if (!Number.isFinite(midi)) return null;

    // Subtle vertical velocity expression on key press (0.65 top to 0.96 bottom)
    const rect = keyEl.getBoundingClientRect();
    const relY = rect.height > 0 ? Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) : 0.7;
    const velocity = 0.65 + relY * 0.31;
    return { midi, velocity };
  };

  const handleKeysPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const hit = resolveMidiAtPoint(e.clientX, e.clientY);
    if (!hit) return;
    pointerNotesRef.current.set(e.pointerId, hit.midi);
    triggerOn(hit.midi, hit.velocity);
    syncActiveNotesState();
  };

  const handleKeysPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerNotesRef.current.has(e.pointerId)) return;
    e.preventDefault();
    const prevMidi = pointerNotesRef.current.get(e.pointerId)!;
    const hit = resolveMidiAtPoint(e.clientX, e.clientY);
    if (!hit) return;

    if (hit.midi !== prevMidi) {
      pointerNotesRef.current.delete(e.pointerId);
      triggerOff(prevMidi);
      pointerNotesRef.current.set(e.pointerId, hit.midi);
      triggerOn(hit.midi, hit.velocity);
      syncActiveNotesState();
    }
  };

  const handleKeysPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const prevMidi = pointerNotesRef.current.get(e.pointerId);
    if (prevMidi !== undefined) {
      pointerNotesRef.current.delete(e.pointerId);
      triggerOff(prevMidi);
      syncActiveNotesState();
    }
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
  };

  // Computer QWERTY keyboard support
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key.toLowerCase();
      if (key in QWERTY_MAP) {
        const midi = (baseOctave + 1) * 12 + QWERTY_MAP[key];
        if (!qwertyNotesRef.current.has(key)) {
          qwertyNotesRef.current.set(key, midi);
          triggerOn(midi, 0.85);
          syncActiveNotesState();
        }
      } else if (e.key === 'ArrowLeft') {
        setBaseOctave((o) => Math.max(1, o - 1));
      } else if (e.key === 'ArrowRight') {
        setBaseOctave((o) => Math.min(5, o + 1));
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const midi = qwertyNotesRef.current.get(key);
      if (midi !== undefined) {
        qwertyNotesRef.current.delete(key);
        triggerOff(midi);
        syncActiveNotesState();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [baseOctave, triggerOn, triggerOff, syncActiveNotesState]);

  const toggleHold = () => {
    const next = !holdActive;
    setHoldActive(next);
    synthEngine.setHoldMode(next);
  };

  const handlePitchDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const normY = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const val = normY * 2 - 1;
    setPitchBend(val);
    synthEngine.setPitchBend(val);
  };

  const handleModDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const val = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setModWheel(val);
    synthEngine.setModWheel(val);
  };

  const whiteCount = whiteKeys.length;
  const startLabel = `C${baseOctave}`;
  const endLabel = `C${baseOctave + octaveSpan}`;

  return (
    <div className="flex flex-col bg-[#12151B] border-t border-[#2D3442] shrink-0 select-none">
      {/* Compact Performance Control Ribbon */}
      <div
        className={`flex items-center justify-between gap-2 px-2.5 bg-[#181B22] border-b border-[#2A303D] text-[11px] ${
          compact ? 'py-0.5' : 'py-1'
        }`}
      >
        <div className="flex items-center gap-1.5">
          {/* Octave Shift */}
          <div className="flex items-center rounded-md bg-[#0E1116] border border-[#2D3442] overflow-hidden">
            <button
              type="button"
              aria-label="Octave Down"
              disabled={baseOctave <= 1}
              onClick={() => setBaseOctave((o) => Math.max(1, o - 1))}
              className="w-8 h-7 flex items-center justify-center text-slate-300 hover:bg-[#222731] disabled:opacity-35 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono-num text-[10px] px-2 text-[#2EE59D] font-medium whitespace-nowrap">
              {startLabel}–{endLabel}
            </span>
            <button
              type="button"
              aria-label="Octave Up"
              disabled={baseOctave >= 5}
              onClick={() => setBaseOctave((o) => Math.min(5, o + 1))}
              className="w-8 h-7 flex items-center justify-center text-slate-300 hover:bg-[#1A2232] disabled:opacity-35 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Span Toggle */}
          <button
            type="button"
            onClick={() => setOctaveSpan((s) => (s === 2 ? 3 : 2))}
            className="h-7 px-2.5 rounded-md bg-[#0B0E14] border border-[#242E40] text-[10px] font-medium text-slate-300 hover:border-cyan-400/50 cursor-pointer whitespace-nowrap"
          >
            {octaveSpan} Oct
          </button>

          {/* Hold / Sustain Latch */}
          <button
            type="button"
            onClick={toggleHold}
            className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md border text-[10px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              holdActive
                ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                : 'bg-[#0B0E14] border-[#242E40] text-slate-300 hover:text-white'
            }`}
          >
            <Lock className="w-3 h-3" />
            <span>Hold</span>
          </button>
        </div>

        {/* Glide & Mobile Master Volume Controls */}
        <div className="flex items-center gap-2.5">
          <div className="flex md:hidden items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <input
              aria-label="Mobile Master Volume"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={masterVolume}
              style={{ touchAction: 'none' }}
              onChange={(e) => onChangeMasterVolume(parseFloat(e.target.value))}
              className="w-14 h-1.5 accent-cyan-400 bg-[#1C2434] rounded-lg cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 hidden sm:inline">Glide</span>
            <input
              aria-label="Portamento Glide Time"
              type="range"
              min={0}
              max={350}
              step={5}
              value={glideMs}
              style={{ touchAction: 'none' }}
              onChange={(e) => onChangeGlideMs(Number(e.target.value))}
              className="w-16 sm:w-24 h-1.5 accent-cyan-400 bg-[#1C2434] rounded-lg cursor-pointer"
            />
            <span className="font-mono-num text-[10px] text-slate-300 w-9 text-right">
              {glideMs}ms
            </span>
          </div>
        </div>
      </div>

      {/* Pitch/Mod Strips + Multitouch Piano Keys */}
      <div
        className={`flex w-full ${
          compact
            ? 'h-[72px] sm:h-[82px]'
            : 'h-[108px] sm:h-[124px] lg:h-[148px]'
        }`}
      >
        {/* Left Touch Strips (Pitch Bend & Mod Wheel) */}
        <div className="flex gap-1.5 px-2 py-1.5 bg-[#14171D] border-r border-[#2A303D] shrink-0">
          {/* Pitch Bend Strip */}
          <div className="flex flex-col items-center">
            <div
              role="slider"
              aria-label="Pitch Bend"
              aria-valuemin={-1}
              aria-valuemax={1}
              aria-valuenow={pitchBend}
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                handlePitchDrag(e);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 0 && e.pointerType === 'mouse') return;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  handlePitchDrag(e);
                }
              }}
              onPointerUp={(e) => {
                setPitchBend(0);
                synthEngine.setPitchBend(0);
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {
                  // ignore
                }
              }}
              onPointerCancel={() => {
                setPitchBend(0);
                synthEngine.setPitchBend(0);
              }}
              className="relative w-6 sm:w-7 flex-1 rounded bg-[#0C0E13] border border-[#2D3442] cursor-ns-resize overflow-hidden"
            >
              <div className="absolute inset-x-0 top-1/2 h-px bg-slate-600" />
              <div
                className="absolute left-0.5 right-0.5 h-2.5 -mt-1.25 rounded-sm bg-[#2EE59D]"
                style={{ top: `${(1 - (pitchBend + 1) / 2) * 100}%` }}
              />
            </div>
            <span className="text-[9px] text-slate-500 mt-0.5">PB</span>
          </div>

          {/* Mod Wheel Strip */}
          <div className="flex flex-col items-center">
            <div
              role="slider"
              aria-label="Modulation Wheel"
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={modWheel}
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                handleModDrag(e);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  handleModDrag(e);
                }
              }}
              onPointerUp={(e) => {
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {
                  // ignore
                }
              }}
              className="relative w-6 sm:w-7 flex-1 rounded bg-[#0C0E13] border border-[#2D3442] cursor-ns-resize overflow-hidden"
            >
              <div
                className="absolute bottom-0 inset-x-0 bg-amber-400/25"
                style={{ height: `${modWheel * 100}%` }}
              />
              <div
                className="absolute left-0.5 right-0.5 h-2 -mb-1 rounded-sm bg-amber-400"
                style={{ bottom: `${modWheel * 100}%` }}
              />
            </div>
            <span className="text-[9px] text-slate-500 mt-0.5">MOD</span>
          </div>
        </div>

        {/* Multitouch Keybed */}
        <div
          ref={keysContainerRef}
          style={{ touchAction: 'none' }}
          onPointerDown={handleKeysPointerDown}
          onPointerMove={handleKeysPointerMove}
          onPointerUp={handleKeysPointerUp}
          onPointerCancel={handleKeysPointerUp}
          className="relative flex-1 flex h-full bg-[#090B0F] overflow-hidden"
        >
          {/* White Keys */}
          {whiteKeys.map((k) => {
            const isActive = activeNotes.has(k.midi);
            const isC = k.midi % 12 === 0;
            return (
              <div
                key={k.midi}
                data-midi={k.midi}
                className={`relative flex-1 h-full border-r border-[#1F242E] last:border-r-0 flex flex-col justify-end items-center pb-1.5 transition-colors duration-75 ${
                  isActive
                    ? 'bg-gradient-to-b from-[#6EE7B7] to-[#2EE59D] text-slate-950'
                    : 'bg-gradient-to-b from-[#E5E9F0] to-[#CBD3E0] text-slate-600'
                }`}
              >
                {isC && (
                  <span
                    className={`font-mono-num text-[9px] font-semibold pointer-events-none ${
                      isActive ? 'text-slate-950' : 'text-slate-500'
                    }`}
                  >
                    {k.noteName}
                  </span>
                )}
              </div>
            );
          })}

          {/* Black Keys Overlay */}
          {blackKeys.map((k) => {
            const isActive = activeNotes.has(k.midi);
            const whiteWidthPct = 100 / whiteCount;
            const blackWidthPct = whiteWidthPct * 0.64;
            const leftPct = (k.whiteIndex + 1) * whiteWidthPct - blackWidthPct / 2;

            return (
              <div
                key={k.midi}
                data-midi={k.midi}
                style={{
                  left: `${leftPct}%`,
                  width: `${blackWidthPct}%`,
                }}
                className={`absolute top-0 h-[62%] z-10 rounded-b-md border transition-colors duration-75 shadow-md ${
                  isActive
                    ? 'bg-gradient-to-b from-[#2EE59D] to-[#10B981] border-[#A7F3D0]'
                    : 'bg-gradient-to-b from-[#232833] to-[#11141B] border-[#07090D]'
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
