import React from 'react';
import type {
  Ts666BusId,
  Ts666MixChannelConfig,
  Ts666MixConfig,
} from '../../types/ts666';

interface Ts666InlineMixerProps {
  mix: Ts666MixConfig;
  onChangeMix: (updater: (prev: Ts666MixConfig) => Ts666MixConfig) => void;
}

type MixKey = 'oscA' | 'oscB' | 'oscC' | 'sub' | 'noise' | 'filter1' | 'filter2';

const CHANNELS: { key: MixKey; label: string }[] = [
  { key: 'oscA', label: 'A' },
  { key: 'oscB', label: 'B' },
  { key: 'oscC', label: 'C' },
  { key: 'sub', label: 'S' },
  { key: 'noise', label: 'N' },
  { key: 'filter1', label: 'F1' },
  { key: 'filter2', label: 'F2' },
];

const NEXT_BUS: Record<Ts666BusId, Ts666BusId> = {
  main: 'bus1',
  bus1: 'bus2',
  bus2: 'main',
};

const BUS_LABEL: Record<Ts666BusId, string> = {
  main: 'MN',
  bus1: 'B1',
  bus2: 'B2',
};

const VerticalFaderBar: React.FC<{
  value: number;
  max: number;
  ariaLabel: string;
  isMain?: boolean;
  onChange: (val: number) => void;
}> = ({ value, max, ariaLabel, isMain, onChange }) => {
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    e.preventDefault();
    const update = (cy: number) => {
      const rect = el.getBoundingClientRect();
      const norm = Math.max(0, Math.min(1, 1 - (cy - rect.top) / Math.max(1, rect.height)));
      onChange(Math.round(norm * max * 100) / 100);
    };
    update(e.clientY);
    const onMove = (ev: PointerEvent) => update(ev.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      style={{ touchAction: 'none' }}
      className="relative w-full flex-1 min-h-[16px] bg-[#080403] border border-[#4D321D] rounded overflow-hidden cursor-ns-resize flex items-end"
    >
      <div
        className={`w-full transition-[height] duration-75 ${
          isMain ? 'bg-[#EF4444]' : 'bg-[#CD6D29]'
        }`}
        style={{ height: `${pct}%` }}
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-0.5 text-center font-mono-num text-[7px] font-bold text-[#FFF2E5] drop-shadow">
        {Math.round(value * 100)}
      </span>
    </div>
  );
};

export const Ts666InlineMixer: React.FC<Ts666InlineMixerProps> = React.memo(({
  mix,
  onChangeMix,
}) => {
  const updateCh = (key: MixKey, patch: Partial<Ts666MixChannelConfig>) => {
    onChangeMix((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  return (
    <div className="flex flex-col bg-[#17100A] border border-[#6B4829] rounded p-1 h-full min-h-0 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-1 mb-0.5 shrink-0 min-w-0">
        <span className="text-[8.5px] font-display font-extrabold text-[#E08A3C] tracking-wider truncate">
          MIXER
        </span>
        <span className="text-[6.5px] font-mono-num text-[#A88463] whitespace-nowrap">
          CH / BUS
        </span>
      </div>

      <div className="grid grid-cols-10 gap-[2px] flex-1 min-h-0 min-w-0 overflow-hidden">
        {CHANNELS.map(({ key, label }) => {
          const ch = mix[key];
          return (
            <div
              key={key}
              className="flex flex-col items-center gap-[2px] bg-[#110A06] border border-[#462D1B] rounded p-[2px] min-h-0 min-w-0 overflow-hidden"
            >
              <span className="text-[7px] leading-none font-mono-num font-extrabold text-[#F5D3B3]">
                {label}
              </span>
              <button
                type="button"
                title={`Cycle ${label} FX Bus (Main / Bus 1 / Bus 2)`}
                onClick={() => updateCh(key, { bus: NEXT_BUS[ch.bus] })}
                className={`w-full h-[12px] leading-none rounded text-[6.5px] font-mono-num font-bold cursor-pointer border shrink-0 ${
                  ch.bus === 'main'
                    ? 'bg-[#26180E] text-[#E08A3C] border-[#5E3E24]'
                    : 'bg-[#DC2626]/25 text-[#FCA5A5] border-[#EF4444]'
                }`}
              >
                {BUS_LABEL[ch.bus]}
              </button>

              <VerticalFaderBar
                ariaLabel={`${label} Mix Volume`}
                value={ch.volume}
                max={1.2}
                onChange={(volume) => updateCh(key, { volume })}
              />

              <div className="flex flex-col gap-[1px] w-full shrink-0">
                <button
                  type="button"
                  onClick={() => updateCh(key, { mute: !ch.mute })}
                  className={`w-full h-[9px] leading-none rounded text-[6px] font-mono-num font-bold cursor-pointer ${
                    ch.mute
                      ? 'bg-[#DC2626] text-white'
                      : 'bg-[#0C0704] text-[#9A7858] border border-[#3F2918]'
                  }`}
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => updateCh(key, { solo: !ch.solo })}
                  className={`w-full h-[9px] leading-none rounded text-[6px] font-mono-num font-bold cursor-pointer ${
                    ch.solo
                      ? 'bg-[#E08A3C] text-[#140B05]'
                      : 'bg-[#0C0704] text-[#9A7858] border border-[#3F2918]'
                  }`}
                >
                  S
                </button>
              </div>
            </div>
          );
        })}

        {/* BUS 1 & BUS 2 RETURNS */}
        {(
          [
            ['bus1Return', 'R1'],
            ['bus2Return', 'R2'],
          ] as const
        ).map(([bKey, lbl]) => {
          const ret = mix[bKey];
          return (
            <div
              key={bKey}
              className="flex flex-col items-center gap-[2px] bg-[#130B06] border border-[#543720] rounded p-[2px] min-h-0 min-w-0 overflow-hidden"
            >
              <span className="text-[7px] leading-none font-mono-num font-extrabold text-[#E08A3C]">
                {lbl}
              </span>
              <span className="text-[6px] leading-none font-mono-num text-[#9A7858]">RET</span>
              <VerticalFaderBar
                ariaLabel={`${lbl} Return Volume`}
                value={ret.volume}
                max={1.2}
                onChange={(volume) =>
                  onChangeMix((prev) => ({
                    ...prev,
                    [bKey]: { ...prev[bKey], volume },
                  }))
                }
              />
              <button
                type="button"
                onClick={() =>
                  onChangeMix((prev) => ({
                    ...prev,
                    [bKey]: { ...prev[bKey], mute: !prev[bKey].mute },
                  }))
                }
                className={`w-full h-[19px] leading-none rounded text-[6.5px] font-mono-num font-bold cursor-pointer shrink-0 ${
                  ret.mute
                    ? 'bg-[#DC2626] text-white'
                    : 'bg-[#0C0704] text-[#E08A3C] border border-[#462D1B]'
                }`}
              >
                {ret.mute ? 'MUT' : 'ON'}
              </button>
            </div>
          );
        })}

        {/* MAIN OUT */}
        <div className="flex flex-col items-center gap-[2px] bg-[#190D09] border border-[#8E3124] rounded p-[2px] min-h-0 min-w-0 overflow-hidden">
          <span className="text-[7px] leading-none font-mono-num font-extrabold text-[#FCA5A5]">
            OUT
          </span>
          <span className="text-[6px] leading-none font-mono-num text-[#E08A3C]">SUM</span>
          <VerticalFaderBar
            ariaLabel="Main Mix Level"
            value={mix.mainLevel}
            max={1.4}
            isMain
            onChange={(mainLevel) =>
              onChangeMix((prev) => ({ ...prev, mainLevel }))
            }
          />
          <span className="h-[19px] flex items-center text-[6px] font-mono-num text-[#EF4444] font-bold shrink-0">
            LIM
          </span>
        </div>
      </div>
    </div>
  );
});
