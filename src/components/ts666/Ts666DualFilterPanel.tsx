import React, { useMemo } from 'react';
import { Link2 } from 'lucide-react';
import { useTs666TargetModOffsets } from '../../audio/ts666/ts666TelemetryStore';
import {
  TS666_FILTER_CATEGORIES,
  TS666_FILTER_LIBRARY,
  computeFilterCurveGain,
} from '../../audio/ts666/ts666Wavetables';
import type {
  Ts666FilterCategory,
  Ts666FilterConfig,
  Ts666FilterRoutingMode,
  Ts666FilterTypeId,
  Ts666LiveModOffsets,
  Ts666ModTarget,
} from '../../types/ts666';
import { Ts666RotaryKnob } from './Ts666RotaryKnob';

interface Ts666DualFilterPanelProps {
  filters: [Ts666FilterConfig, Ts666FilterConfig];
  filterRouting: Ts666FilterRoutingMode;
  filterLink: boolean;
  modOffsets?: Ts666LiveModOffsets;
  onChangeFilter: (idx: 0 | 1, patch: Partial<Ts666FilterConfig>) => void;
  onChangeRouting: (mode: Ts666FilterRoutingMode) => void;
  onToggleLink: () => void;
}

const SingleFilterColumn: React.FC<{
  slot: 0 | 1;
  f: Ts666FilterConfig;
  linkedCutHz?: number;
  filterRouting: Ts666FilterRoutingMode;
  filterLink: boolean;
  modOffsets?: Ts666LiveModOffsets;
  onChangeFilter: (idx: 0 | 1, patch: Partial<Ts666FilterConfig>) => void;
  onChangeRouting?: (mode: Ts666FilterRoutingMode) => void;
  onToggleLink?: () => void;
}> = React.memo(({
  slot,
  f,
  linkedCutHz,
  filterRouting,
  filterLink,
  modOffsets,
  onChangeFilter,
  onChangeRouting,
  onToggleLink,
}) => {
  const prefix = slot === 0 ? 'F1' : 'F2';
  const tgt = (s: string): Ts666ModTarget => `${prefix}_${s}` as Ts666ModTarget;

  const baseCut = slot === 1 && filterLink && linkedCutHz !== undefined ? linkedCutHz : f.cutoff;
  const cutModKey: Ts666ModTarget = slot === 1 && filterLink ? 'F1_CUTOFF' : tgt('CUTOFF');
  const resModKey: Ts666ModTarget = tgt('RES');
  const watchedKeys = useMemo(() => [cutModKey, resModKey] as const, [cutModKey, resModKey]);
  const storeMods = useTs666TargetModOffsets(watchedKeys);
  const effMods = modOffsets ?? storeMods;
  const liveCut = Math.max(
    20,
    Math.min(20000, baseCut * Math.pow(2, (effMods[cutModKey] ?? 0) * 5.5))
  );
  const liveRes = Math.max(
    0.2,
    Math.min(16, f.resonance + (effMods[resModKey] ?? 0) * 8)
  );

  const { pathD, fillD, cutX } = useMemo(() => {
    const W = 220;
    const H = 56;
    const pts: string[] = [];
    for (let i = 0; i <= 48; i++) {
      const xNorm = i / 48;
      const freq = 20 * Math.pow(1000, xNorm);
      const g = computeFilterCurveGain(f.type, liveCut, liveRes, f.fat, freq);
      const db = Math.max(-24, Math.min(18, 20 * Math.log10(Math.max(0.05, g))));
      const y = H - ((db + 24) / 42) * (H - 8) - 4;
      pts.push(`${i === 0 ? 'M' : 'L'} ${(xNorm * W).toFixed(1)} ${y.toFixed(1)}`);
    }
    const line = pts.join(' ');
    const xCut =
      (Math.log(Math.max(20, liveCut) / 20) / Math.log(1000)) * W;
    return {
      pathD: line,
      fillD: `${line} L ${W} ${H} L 0 ${H} Z`,
      cutX: Math.max(2, Math.min(W - 2, xCut)),
    };
  }, [f.type, f.fat, liveCut, liveRes]);

  const catFilters = useMemo(
    () => TS666_FILTER_LIBRARY.filter((d) => d.category === f.category),
    [f.category]
  );

  const handleSelectCategory = (category: Ts666FilterCategory) => {
    const first = TS666_FILTER_LIBRARY.find((d) => d.category === category);
    onChangeFilter(slot, {
      category,
      type: first ? first.id : f.type,
    });
  };

  const handleCurvePointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    e.preventDefault();
    const applyPt = (cx: number, cy: number) => {
      const rect = svg.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (cx - rect.left) / Math.max(1, rect.width)));
      const ny = Math.max(0, Math.min(1, 1 - (cy - rect.top) / Math.max(1, rect.height)));
      const cutoff = Math.round(20 * Math.pow(1000, nx));
      const resonance = Math.round((0.2 + ny * 15.8) * 10) / 10;
      onChangeFilter(slot, { cutoff, resonance, enabled: true });
    };
    applyPt(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => applyPt(ev.clientX, ev.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <div
      className={`flex flex-col justify-between rounded border p-1 h-full min-h-0 min-w-0 overflow-hidden transition-colors ${
        f.enabled
          ? 'bg-[#17100A] border-[#6B4829]'
          : 'bg-[#120C08] border-[#432C1A] opacity-75'
      }`}
    >
      {/* Header: Power + Filter Title + (Routing & Link on F1, Routing badge on F2) */}
      <div className="flex items-center justify-between gap-1 mb-0.5 shrink-0 min-w-0">
        <button
          type="button"
          onClick={() => onChangeFilter(slot, { enabled: !f.enabled })}
          className={`px-1.5 py-0.5 rounded text-[8.5px] font-display font-extrabold cursor-pointer border whitespace-nowrap shrink-0 ${
            f.enabled
              ? 'bg-[#D97724] text-[#140B05] border-[#F4B073]'
              : 'bg-[#26180E] text-[#A98463] border-[#52351F]'
          }`}
        >
          FILTER {slot + 1}
        </button>

        {slot === 0 && onChangeRouting && onToggleLink ? (
          <div className="flex items-center gap-0.5 shrink-0">
            <div className="flex items-center gap-0.5 bg-[#0C0704] p-0.5 rounded border border-[#472E1A]">
              {(['serial', 'parallel', 'independent'] as Ts666FilterRoutingMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChangeRouting(mode)}
                  className={`px-1 rounded text-[7.5px] font-mono-num uppercase cursor-pointer ${
                    filterRouting === mode
                      ? 'bg-[#DC2626]/30 text-[#FCA5A5] border border-[#EF4444]'
                      : 'text-[#A68464] border border-transparent'
                  }`}
                >
                  {mode === 'independent' ? 'IND' : mode.slice(0, 3)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onToggleLink}
              title="Link Cutoff F1 → F2"
              className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[7.5px] font-mono-num font-bold cursor-pointer border ${
                filterLink
                  ? 'bg-[#DC2626]/30 text-[#FCA5A5] border-[#EF4444]'
                  : 'bg-[#0C0704] text-[#A68464] border-[#472E1A]'
              }`}
            >
              <Link2 className="w-2.5 h-2.5" />
              <span>LNK</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-0.5">
            {(
              [
                ['A', 'routeA'],
                ['B', 'routeB'],
                ['C', 'routeC'],
                ['N', 'routeN'],
                ['S', 'routeS'],
              ] as const
            ).map(([lbl, key]) => (
              <button
                key={lbl}
                type="button"
                onClick={() => onChangeFilter(slot, { [key]: !f[key] })}
                className={`w-4 h-4 rounded text-[7.5px] font-mono-num font-bold cursor-pointer border ${
                  f[key]
                    ? 'bg-[#DC2626]/30 text-[#FCA5A5] border-[#EF4444]'
                    : 'bg-[#0C0704] text-[#7D6147] border-[#422B1A]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Category + Type + (Source Routing on F1) */}
      <div className="flex items-center gap-0.5 mb-0.5 shrink-0 min-w-0">
        <select
          aria-label={`Filter ${slot + 1} Category`}
          value={f.category}
          onChange={(e) => handleSelectCategory(e.target.value as Ts666FilterCategory)}
          className="w-[46px] shrink-0 bg-[#0B0604] border border-[#543720] rounded px-0.5 py-[1px] text-[7.5px] font-mono-num text-[#E08A3C] cursor-pointer"
        >
          {TS666_FILTER_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select
          aria-label={`Filter ${slot + 1} Type`}
          value={f.type}
          onChange={(e) =>
            onChangeFilter(slot, { type: e.target.value as Ts666FilterTypeId })
          }
          className="flex-1 min-w-0 bg-[#0B0604] border border-[#543720] rounded px-1 py-[1px] text-[8px] font-mono-num text-[#F5D3B3] cursor-pointer"
        >
          {catFilters.map((def) => (
            <option key={def.id} value={def.id}>
              {def.name}
            </option>
          ))}
        </select>

        {slot === 0 && (
          <div className="flex items-center gap-[1px] shrink-0">
            {(
              [
                ['A', 'routeA'],
                ['B', 'routeB'],
                ['C', 'routeC'],
                ['N', 'routeN'],
                ['S', 'routeS'],
              ] as const
            ).map(([lbl, key]) => (
              <button
                key={lbl}
                type="button"
                onClick={() => onChangeFilter(slot, { [key]: !f[key] })}
                className={`w-[13px] h-[15px] rounded text-[7px] font-mono-num font-bold cursor-pointer border leading-none ${
                  f[key]
                    ? 'bg-[#DC2626]/30 text-[#FCA5A5] border-[#EF4444]'
                    : 'bg-[#0C0704] text-[#7D6147] border-[#422B1A]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Interactive RED Filter Response Screen */}
      <div className="flex-1 min-h-[18px] bg-[#070303] border border-[#6B231C] rounded overflow-hidden mb-0.5 relative">
        <svg
          viewBox="0 0 220 56"
          preserveAspectRatio="none"
          onPointerDown={handleCurvePointer}
          style={{ touchAction: 'none' }}
          className="w-full h-full block cursor-crosshair"
        >
          <line x1={0} y1={28} x2={220} y2={28} stroke="#2E1311" strokeWidth={0.7} />
          <line
            x1={cutX}
            y1={0}
            x2={cutX}
            y2={56}
            stroke="rgba(239, 68, 68, 0.35)"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
          <path d={fillD} fill={f.enabled ? 'rgba(220, 38, 38, 0.2)' : 'rgba(120, 53, 35, 0.1)'} />
          <path
            d={pathD}
            fill="none"
            stroke={f.enabled ? '#EF4444' : '#7C4B38'}
            strokeWidth={1.9}
          />
        </svg>
        <span className="pointer-events-none absolute top-0.5 right-1 font-mono-num text-[7.5px] text-[#F87171]">
          {liveCut >= 1000 ? `${(liveCut / 1000).toFixed(1)}k` : `${Math.round(liveCut)}`}Hz
        </span>
      </div>

      {/* 6 Filter Knobs Directly Underneath */}
      <div className="grid grid-cols-6 gap-0.5 pt-0.5 items-center shrink-0">
        <Ts666RotaryKnob
          label="CUT"
          value={baseCut}
          min={20}
          max={20000}
          defaultValue={16000}
          logarithmic
          size="xs"
          accent="red"
          disabled={slot === 1 && filterLink}
          modTarget={tgt('CUTOFF')}
          modOffset={modOffsets?.[tgt('CUTOFF')] ?? 0}
          formatValue={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)}
          onChange={(cutoff) => onChangeFilter(slot, { cutoff })}
        />
        <Ts666RotaryKnob
          label="RES"
          value={f.resonance}
          min={0.2}
          max={16}
          defaultValue={0.7}
          size="xs"
          accent="copper"
          modTarget={tgt('RES')}
          modOffset={modOffsets?.[tgt('RES')] ?? 0}
          formatValue={(v) => v.toFixed(1)}
          onChange={(resonance) => onChangeFilter(slot, { resonance })}
        />
        <Ts666RotaryKnob
          label="PAN"
          value={f.pan}
          min={-1}
          max={1}
          defaultValue={0}
          bipolar
          size="xs"
          accent="bronze"
          modTarget={tgt('PAN')}
          modOffset={modOffsets?.[tgt('PAN')] ?? 0}
          onChange={(pan) => onChangeFilter(slot, { pan })}
        />
        <Ts666RotaryKnob
          label="DRV"
          value={f.drive}
          min={0}
          max={1}
          defaultValue={0}
          size="xs"
          accent="red"
          modTarget={tgt('DRIVE')}
          modOffset={modOffsets?.[tgt('DRIVE')] ?? 0}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(drive) => onChangeFilter(slot, { drive })}
        />
        <Ts666RotaryKnob
          label="FAT"
          value={f.fat}
          min={0}
          max={1}
          defaultValue={0}
          size="xs"
          accent="copper"
          modTarget={tgt('FAT')}
          modOffset={modOffsets?.[tgt('FAT')] ?? 0}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(fat) => onChangeFilter(slot, { fat })}
        />
        <Ts666RotaryKnob
          label="MIX"
          value={f.mix}
          min={0}
          max={1}
          defaultValue={1}
          size="xs"
          accent="bronze"
          modTarget={tgt('MIX')}
          modOffset={modOffsets?.[tgt('MIX')] ?? 0}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(mix) => onChangeFilter(slot, { mix })}
        />
      </div>
    </div>
  );
});

export const Ts666DualFilterPanel: React.FC<Ts666DualFilterPanelProps> = React.memo(({
  filters,
  filterRouting,
  filterLink,
  modOffsets,
  onChangeFilter,
  onChangeRouting,
  onToggleLink,
}) => {
  return (
    <div className="grid grid-cols-2 gap-1.5 h-full min-h-0 min-w-0 overflow-hidden">
      <SingleFilterColumn
        slot={0}
        f={filters[0]}
        filterRouting={filterRouting}
        filterLink={filterLink}
        modOffsets={modOffsets}
        onChangeFilter={onChangeFilter}
        onChangeRouting={onChangeRouting}
        onToggleLink={onToggleLink}
      />
      <SingleFilterColumn
        slot={1}
        f={filters[1]}
        linkedCutHz={filters[0].cutoff}
        filterRouting={filterRouting}
        filterLink={filterLink}
        modOffsets={modOffsets}
        onChangeFilter={onChangeFilter}
      />
    </div>
  );
});
