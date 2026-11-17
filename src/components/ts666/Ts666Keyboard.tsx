import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Ts666KeyboardProps {
  pitchBendValue: number;
  modWheelValue: number;
  keyboardVisible?: boolean;
  keyboardOnly?: boolean;
  performanceSlot?: React.ReactNode;
  onChangePitchBend: (val: number) => void;
  onChangeModWheel: (val: number) => void;
  onNoteOn: (midi: number, vel: number) => void;
  onNoteOff: (midi: number) => void;
}

const BLACK_OFFSETS = new Set([1, 3, 6, 8, 10]);
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const Ts666Keyboard: React.FC<Ts666KeyboardProps> = React.memo(({
  pitchBendValue,
  modWheelValue,
  keyboardVisible = true,
  keyboardOnly = false,
  performanceSlot,
  onChangePitchBend,
  onChangeModWheel,
  onNoteOn,
  onNoteOff,
}) => {
  const [baseOctave, setBaseOctave] = useState<number>(2);
  const [activeMidis, setActiveMidis] = useState<Set<number>>(() => new Set());

  const keys = useMemo(() => {
    const startMidi = (baseOctave + 1) * 12;
    const totalSemis = 25;
    const list: { midi: number; isBlack: boolean; label: string }[] = [];
    for (let i = 0; i < totalSemis; i++) {
      const m = startMidi + i;
      const pc = m % 12;
      list.push({
        midi: m,
        isBlack: BLACK_OFFSETS.has(pc),
        label: `${NOTE_NAMES[pc]}${Math.floor(m / 12) - 1}`,
      });
    }
    return list;
  }, [baseOctave]);

  const whiteKeys = useMemo(() => keys.filter((k) => !k.isBlack), [keys]);
  const blackKeys = useMemo(() => keys.filter((k) => k.isBlack), [keys]);

  const pressKey = (midi: number) => {
    setActiveMidis((prev) => {
      if (prev.has(midi)) return prev;
      const next = new Set(prev);
      next.add(midi);
      return next;
    });
    onNoteOn(midi, 0.88);
  };

  const releaseKey = (midi: number) => {
    setActiveMidis((prev) => {
      if (!prev.has(midi)) return prev;
      const next = new Set(prev);
      next.delete(midi);
      return next;
    });
    onNoteOff(midi);
  };

  if (keyboardOnly && !keyboardVisible) {
    return null;
  }

  return (
    <footer
      aria-label={keyboardOnly ? '666TS Piano Keyboard' : '666TS Bottom Performance Area'}
      className={`flex items-stretch gap-1 bg-[#120B07] border-t border-[#5C3E24] px-1.5 py-[2px] shrink-0 select-none overflow-hidden transition-[height] duration-150 ${
        keyboardOnly
          ? 'h-[48px]'
          : keyboardVisible
            ? 'h-[45px]'
            : 'h-[37px]'
      }`}
    >
      {/* Left Octave / Optional PB & MW Wheels */}
      <div
        className={`flex items-stretch gap-1 min-w-0 ${
          keyboardVisible ? 'shrink-0' : 'w-full justify-between'
        }`}
      >
        <div className="flex items-center gap-1 shrink-0 bg-[#1A110B] border border-[#543720] rounded px-1 py-[1px]">
          {!keyboardOnly && (
            <>
              <div className="flex flex-col items-center">
                <span className="text-[6.5px] font-mono-num text-[#BFA080] leading-none">PB</span>
                <input
                  aria-label="Pitch Bend Wheel"
                  type="range"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={pitchBendValue}
                  style={{ writingMode: 'vertical-lr', direction: 'rtl', touchAction: 'none' }}
                  onChange={(e) => onChangePitchBend(parseFloat(e.target.value))}
                  onPointerUp={() => onChangePitchBend(0)}
                  className="h-6 w-3 accent-red-500 cursor-ns-resize"
                />
              </div>

              <div className="flex flex-col items-center">
                <span className="text-[6.5px] font-mono-num text-[#BFA080] leading-none">MW</span>
                <input
                  aria-label="Modulation Wheel"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={modWheelValue}
                  style={{ writingMode: 'vertical-lr', direction: 'rtl', touchAction: 'none' }}
                  onChange={(e) => onChangeModWheel(parseFloat(e.target.value))}
                  className="h-6 w-3 accent-amber-500 cursor-ns-resize"
                />
              </div>
            </>
          )}

          <div className="flex flex-col items-center justify-center gap-[2px] px-0.5">
            <span className="text-[7.5px] leading-none font-mono-num font-bold text-[#E08A3C]">
              C{baseOctave}
            </span>
            <div className="flex items-center gap-[2px]">
              <button
                type="button"
                aria-label="Octave Down"
                onClick={() => setBaseOctave((o) => Math.max(0, o - 1))}
                className="p-[2px] rounded bg-[#26180E] border border-[#5E3E24] text-[#F5D3B3] cursor-pointer"
              >
                <ChevronLeft className="w-2.5 h-2.5" />
              </button>
              <button
                type="button"
                aria-label="Octave Up"
                onClick={() => setBaseOctave((o) => Math.min(6, o + 1))}
                className="p-[2px] rounded bg-[#26180E] border border-[#5E3E24] text-[#F5D3B3] cursor-pointer"
              >
                <ChevronRight className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        </div>

        {!keyboardOnly && performanceSlot}
      </div>

      {/* Dedicated Collapsible 2-Octave Piano Keyboard (never overlaps other panels) */}
      {keyboardVisible && (
        <div className="relative flex-1 min-w-0 h-full overflow-hidden rounded border border-[#4D321D] bg-[#0B0604]">
          <div className="flex h-full gap-[1px]">
            {whiteKeys.map((k) => {
              const isActive = activeMidis.has(k.midi);
              return (
                <button
                  key={k.midi}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    pressKey(k.midi);
                  }}
                  onPointerUp={() => releaseKey(k.midi)}
                  onPointerLeave={() => releaseKey(k.midi)}
                  onPointerCancel={() => releaseKey(k.midi)}
                  style={{ touchAction: 'none' }}
                  className={`flex-1 h-full rounded-b border flex flex-col justify-end items-center pb-[1px] text-[6.5px] leading-none font-mono-num transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#EF4444] text-white border-[#FCA5A5]'
                      : 'bg-[#EADBC8] text-[#4A2E1A] border-[#8A623F] hover:bg-[#F7EBDC]'
                  }`}
                >
                  {k.midi % 12 === 0 ? k.label : ''}
                </button>
              );
            })}
          </div>

          {/* Overlaid Black Keys */}
          <div className="absolute inset-x-0 top-0 h-[56%] pointer-events-none">
            {blackKeys.map((k) => {
              const whiteBefore = whiteKeys.filter((w) => w.midi < k.midi).length;
              const leftPct = ((whiteBefore - 0.34) / whiteKeys.length) * 100;
              const widthPct = (0.68 / whiteKeys.length) * 100;
              const isActive = activeMidis.has(k.midi);
              return (
                <button
                  key={k.midi}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    pressKey(k.midi);
                  }}
                  onPointerUp={() => releaseKey(k.midi)}
                  onPointerLeave={() => releaseKey(k.midi)}
                  onPointerCancel={() => releaseKey(k.midi)}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    touchAction: 'none',
                  }}
                  className={`absolute top-0 h-full rounded-b border pointer-events-auto cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-[#DC2626] border-[#FCA5A5]'
                      : 'bg-[#1D120B] border-[#614126] hover:bg-[#311E12]'
                  }`}
                />
              );
            })}
          </div>
        </div>
      )}
    </footer>
  );
});

