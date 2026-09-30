import React from 'react';
import { FaCheck } from 'react-icons/fa';

export interface ThemePreviewDetails {
  canvasBg: string;
  gridColor?: string;
  nodeBg: string;
  nodeBorder: string;
  nodeText?: string;
  edgeColor: string;
  accentColor: string;
  mode: 'light' | 'dark';
}

interface ThemeChoiceButtonProps {
  themeId: string;
  active: boolean;
  categoryLabel: string;
  disabled: boolean;
  gradient: string;
  label: string;
  previewDetails?: ThemePreviewDetails;
  onSelect: () => void;
}

export const ThemeChoiceButton: React.FC<ThemeChoiceButtonProps> = ({
  themeId,
  active,
  categoryLabel,
  disabled,
  gradient,
  label,
  previewDetails,
  onSelect,
}) => {
  const isDark = previewDetails?.mode === 'dark';

  return (
    <button
      type="button"
      data-theme-id={themeId}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={`group relative flex min-h-[44px] flex-col gap-2.5 p-3.5 text-left transition-all duration-200 rounded-[10px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${
        active
          ? 'bg-white dark:bg-[#1A1A1C] border-2 border-indigo-500 shadow-[0_4px_16px_rgba(99,102,241,0.18)] ring-2 ring-indigo-500/20'
          : 'bg-white dark:bg-white/5 border border-black/[0.08] dark:border-white/[0.08] hover:border-indigo-400/60 dark:hover:border-indigo-400/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]'
      }`}
      onClick={onSelect}
    >
      <div
        aria-hidden="true"
        className="w-full h-[76px] rounded-[7px] relative overflow-hidden flex items-center justify-center select-none"
        style={{
          background: previewDetails ? previewDetails.canvasBg : gradient,
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        }}
      >
        {previewDetails ? (
          <>
            {/* Subtle Mini Grid Pattern */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none opacity-40"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <pattern
                  id={`preview-grid-${themeId}`}
                  width="12"
                  height="12"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 12 0 L 0 0 0 12"
                    fill="none"
                    stroke={previewDetails.gridColor || (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)')}
                    strokeWidth="0.75"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#preview-grid-${themeId})`} />
            </svg>

            {/* Mini Diagram Flow */}
            <div className="relative z-10 w-full px-3.5 flex items-center justify-between">
              {/* Mini Node 1 */}
              <div
                className="flex flex-col justify-center px-1.5 py-1 rounded-[4px] shadow-xs shrink-0 transition-transform group-hover:scale-105"
                style={{
                  width: '56px',
                  height: '28px',
                  backgroundColor: previewDetails.nodeBg,
                  border: `1.5px solid ${previewDetails.nodeBorder}`,
                }}
              >
                <div
                  className="rounded-full mb-1"
                  style={{ width: '18px', height: '3.5px', backgroundColor: previewDetails.accentColor }}
                />
                <div
                  className="rounded-full"
                  style={{ width: '28px', height: '2.5px', backgroundColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)' }}
                />
              </div>

              {/* Connecting Mini Edge */}
              <div className="flex-1 mx-1.5 flex items-center justify-center relative h-5">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 40 20" fill="none" preserveAspectRatio="none">
                  <path d="M 0 10 C 15 10, 20 10, 34 10" stroke={previewDetails.edgeColor} strokeWidth="1.75" strokeLinecap="round" />
                  <polygon points="32,7 38,10 32,13" fill={previewDetails.edgeColor} />
                </svg>
              </div>

              {/* Mini Node 2 */}
              <div
                className="flex flex-col justify-center px-1.5 py-1 rounded-[4px] shadow-xs shrink-0 transition-transform group-hover:scale-105"
                style={{
                  width: '56px',
                  height: '28px',
                  backgroundColor: previewDetails.nodeBg,
                  border: `1.5px solid ${previewDetails.nodeBorder}`,
                }}
              >
                <div className="flex items-center gap-1 mb-1">
                  <div
                    className="rounded-full shrink-0"
                    style={{ width: '4px', height: '4px', backgroundColor: previewDetails.accentColor }}
                  />
                  <div
                    className="rounded-full flex-1"
                    style={{ height: '3px', backgroundColor: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)' }}
                  />
                </div>
                <div
                  className="rounded-full"
                  style={{ width: '22px', height: '2.5px', backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }}
                />
              </div>
            </div>
          </>
        ) : (
          <span
            className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/30 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 transform -translate-x-[150%] group-hover:translate-x-[150%]"
            style={{ transitionProperty: 'opacity, transform' }}
          />
        )}
      </div>

      <div className="relative flex flex-1 flex-col pt-0.5 text-left pointer-events-none">
        <span className="text-[14px] font-semibold text-gray-800 dark:text-gray-100 capitalize tracking-tight">
          {label}
        </span>
        <span className="text-xs font-medium text-gray-500/80 dark:text-gray-400">
          {categoryLabel}
        </span>
      </div>

      {active && (
        <span className="absolute top-2.5 right-2.5 flex items-center justify-center w-5 h-5 bg-indigo-600 text-white rounded-full shadow-md">
          <FaCheck aria-hidden="true" className="w-2.5 h-2.5" />
        </span>
      )}
    </button>
  );
};