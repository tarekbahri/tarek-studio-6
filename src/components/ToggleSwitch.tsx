import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  accent?: 'cyan' | 'amber';
  compact?: boolean;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  accent = 'cyan',
  compact = false,
}) => {
  const activeBg = accent === 'amber' ? 'bg-amber-400' : 'bg-cyan-400';
  const activeBorder = accent === 'amber' ? 'border-amber-500/60' : 'border-cyan-400/60';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
        compact ? 'px-2.5 min-h-[34px] text-[11px]' : 'px-3 min-h-[40px] text-xs'
      } ${
        checked
          ? `bg-[#1B2434] ${activeBorder} text-slate-100`
          : 'bg-[#10151F] border-[#263042] text-slate-400 hover:text-slate-200'
      }`}
    >
      <span
        className={`inline-block w-2.5 h-2.5 rounded-sm transition-colors ${
          checked ? activeBg : 'bg-slate-700'
        }`}
      />
      {label && <span className="font-medium">{label}</span>}
    </button>
  );
};
