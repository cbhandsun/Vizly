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
      className={`group relative flex min-h-[44px] flex-col gap-2.5 p-3 text-left transition-all duration-200 rounded-xl cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${
        active
          ? 'bg-white dark:bg-[#18181b] border-2 border-indigo-600 dark:border-indigo-500 shadow-[0_4px_20px_-2px_rgba(99,102,241,0.22)] ring-2 ring-indigo-500/20'
          : 'bg-white dark:bg-[#161618] border border-slate-200/80 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5'
      }`}
      onClick={onSelect}
    >
      <div
        aria-hidden="true"
        className="w-full h-[92px] sm:h-[98px] rounded-lg relative overflow-hidden flex items-center justify-center select-none shadow-inner"
        style={{
          background: previewDetails ? previewDetails.canvasBg : gradient,
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        }}
      >
        {previewDetails ? (
          <>
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none opacity-50"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <pattern
                  id={`preview-grid-${themeId}`}
                  width="12"
                  height="12"
                  patternUnits="userSpaceOnUse"
                >
                  <circle
                    cx="2"
                    cy="2"
                    r="0.75"
                    fill={previewDetails.gridColor || (isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.15)')}
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#preview-grid-${themeId})`} />
            </svg>

            <div className="relative z-10 w-full px-3 flex items-center justify-between">
              <div
                className="flex flex-col justify-between p-1.5 rounded-[5px] shrink-0 transition-transform duration-200 group-hover:scale-105"
                style={{
                  width: '62px',
                  height: '36px',
                  backgroundColor: previewDetails.nodeBg,
                  border: `1.25px solid ${previewDetails.nodeBorder}`,
                  boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.06)',
                }}
              >
                <div className="flex items-center gap-1">
                  <div
                    className="rounded-full"
                    style={{ width: '14px', height: '3px', backgroundColor: previewDetails.accentColor }}
                  />
                  <div
                    className="rounded-full opacity-60"
                    style={{ width: '3px', height: '3px', backgroundColor: previewDetails.accentColor }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <div
                    className="rounded-full"
                    style={{
                      width: '38px',
                      height: '3px',
                      backgroundColor: previewDetails.nodeText || (isDark ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.7)'),
                    }}
                  />
                  <div
                    className="rounded-full opacity-40"
                    style={{
                      width: '24px',
                      height: '2px',
                      backgroundColor: previewDetails.nodeText || (isDark ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.5)'),
                    }}
                  />
                </div>
              </div>

              <div className="flex-1 mx-1.5 flex items-center justify-center relative h-6">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 36 20" fill="none" preserveAspectRatio="none">
                  <path
                    d="M 0 10 C 14 10, 18 10, 30 10"
                    stroke={previewDetails.edgeColor}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <polygon points="28,7 34,10 28,13" fill={previewDetails.edgeColor} />
                  <circle cx="15" cy="10" r="1.5" fill={previewDetails.accentColor} />
                </svg>
              </div>

              <div
                className="flex flex-col justify-between p-1.5 rounded-[5px] shrink-0 transition-transform duration-200 group-hover:scale-105"
                style={{
                  width: '62px',
                  height: '36px',
                  backgroundColor: previewDetails.nodeBg,
                  border: `1.25px solid ${previewDetails.nodeBorder}`,
                  borderLeft: `3px solid ${previewDetails.accentColor}`,
                  boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.06)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="rounded-full"
                    style={{ width: '12px', height: '3px', backgroundColor: previewDetails.accentColor }}
                  />
                  <div
                    className="rounded-full"
                    style={{
                      width: '4px',
                      height: '4px',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)',
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <div
                    className="rounded-full"
                    style={{
                      width: '32px',
                      height: '3px',
                      backgroundColor: previewDetails.nodeText || (isDark ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.7)'),
                    }}
                  />
                  <div
                    className="rounded-full opacity-40"
                    style={{
                      width: '20px',
                      height: '2px',
                      backgroundColor: previewDetails.nodeText || (isDark ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.5)'),
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="absolute bottom-1.5 right-1.5 z-20 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/25 dark:bg-black/60 backdrop-blur-md border border-white/20 dark:border-white/10 shadow-xs pointer-events-none">
              <span
                className="w-2 h-2 rounded-full border border-black/10 dark:border-white/20 shrink-0"
                style={{ backgroundColor: previewDetails.canvasBg }}
                title="Canvas"
              />
              <span
                className="w-2 h-2 rounded-full border border-black/10 dark:border-white/20 shrink-0"
                style={{ backgroundColor: previewDetails.nodeBg }}
                title="Surface"
              />
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: previewDetails.accentColor }}
                title="Accent"
              />
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: previewDetails.edgeColor }}
                title="Edge"
              />
            </div>
          </>
        ) : (
          <span
            className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/30 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 transform -translate-x-[150%] group-hover:translate-x-[150%]"
            style={{ transitionProperty: 'opacity, transform' }}
          />
        )}
      </div>

      <div className="relative flex flex-1 flex-col gap-0.5 text-left pointer-events-none">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100 capitalize tracking-tight truncate">
            {label}
          </span>
          {active && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold border border-indigo-200 dark:border-indigo-800/80 shrink-0">
              <FaCheck aria-hidden="true" className="w-2 h-2" />
              <span>当前生效</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {categoryLabel}
          </span>
          {previewDetails?.mode && (
            <>
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {previewDetails.mode === 'dark' ? 'Dark' : 'Light'}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
};
