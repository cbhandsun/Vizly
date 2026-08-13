import React from 'react';
import { FaCheck } from 'react-icons/fa';

interface ThemeChoiceButtonProps {
  active: boolean;
  categoryLabel: string;
  disabled: boolean;
  gradient: string;
  label: string;
  onSelect: () => void;
}

export const ThemeChoiceButton: React.FC<ThemeChoiceButtonProps> = ({
  active,
  categoryLabel,
  disabled,
  gradient,
  label,
  onSelect,
}) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={active}
    disabled={disabled}
    className={`group relative flex min-h-[44px] flex-col gap-3 p-4 text-left transition-all duration-300 rounded-[var(--glass-radius)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${active ? 'bg-white dark:bg-[#1A1A1C]/60 border-indigo-500 dark:border-indigo-400 shadow-[0_2px_12px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500/20' : 'bg-white dark:bg-white/5 border border-black/[0.06] dark:border-white/[0.08] hover:border-black/[0.1] dark:hover:border-white/[0.15] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)]'}`}
    onClick={onSelect}
  >
    <span
      aria-hidden="true"
      className="w-full h-[72px] rounded-[6px] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.05)] relative overflow-hidden transform transition-transform"
      style={{ background: gradient }}
    >
      <span
        className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/30 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 transform -translate-x-[150%] group-hover:translate-x-[150%]"
        style={{ transitionProperty: 'opacity, transform' }}
      />
    </span>
    <span className="relative flex flex-1 flex-col pt-1 text-left pointer-events-none">
      <span className="text-[15px] font-semibold text-gray-800 dark:text-gray-100 capitalize tracking-tight">
        {label}
      </span>
      <span className="text-xs font-medium text-gray-500/80 dark:text-gray-400">
        {categoryLabel}
      </span>
    </span>
    {active && (
      <FaCheck
        aria-hidden="true"
        className="absolute top-2 right-2 text-blue-500 p-1.5 w-6 h-6 bg-white/90 dark:bg-black/70 rounded-full shadow-sm backdrop-blur-md"
      />
    )}
  </button>
);
