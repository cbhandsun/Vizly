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
  const isBlueprint = themeId === 'blueprint';
  const isSunset = themeId === 'sunset';
  const isForest = themeId === 'forest' || themeId === 'emerald';
  const isHighContrast = themeId === 'high-contrast';
  const isSketch = themeId === 'sketch';

  // 基础渲染色彩
  const canvasBg = previewDetails ? previewDetails.canvasBg : gradient;
  const gridColor = previewDetails?.gridColor || (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)');
  const nodeBg = previewDetails?.nodeBg || (isDark ? '#1e293b' : '#ffffff');
  const nodeBorder = previewDetails?.nodeBorder || (isDark ? '#475569' : '#cbd5e1');
  const nodeText = previewDetails?.nodeText || (isDark ? '#f8fafc' : '#0f172a');
  const edgeColor = previewDetails?.edgeColor || (isDark ? '#38bdf8' : '#2563eb');
  const accentColor = previewDetails?.accentColor || (isDark ? '#818cf8' : '#4f46e5');

  return (
    <button
      type="button"
      data-theme-id={themeId}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={`group relative flex min-h-[44px] flex-col gap-2.5 p-3 text-left transition-all duration-250 rounded-2xl cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${
        active
          ? 'bg-white dark:bg-[#18191f] border-2 border-indigo-600 dark:border-indigo-500 shadow-[0_8px_24px_-4px_rgba(99,102,241,0.28)] ring-2 ring-indigo-500/20'
          : 'bg-white dark:bg-[#14151a] border border-slate-200/80 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20 hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/30 hover:-translate-y-1'
      }`}
      onClick={onSelect}
    >
      {/* ── Active Status Indicator Badge (Top Right of Card) ── */}
      {active && (
        <div className="absolute top-2.5 right-2.5 z-30 flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-600 text-white shadow-md text-[10px] font-bold pointer-events-none tracking-tight">
          <FaCheck className="w-2 h-2" aria-hidden="true" />
          <span>当前生效</span>
        </div>
      )}

      {/* ── Canvas Miniature Scene ── */}
      <div
        aria-hidden="true"
        className="w-full h-[104px] sm:h-[110px] rounded-xl relative overflow-hidden flex items-center justify-center select-none shadow-xs"
        style={{
          background: canvasBg,
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        }}
      >
        {previewDetails ? (
          <svg
            className="w-full h-full overflow-hidden pointer-events-none transition-transform duration-300 group-hover:scale-[1.02]"
            viewBox="0 0 260 100"
            preserveAspectRatio="xMidYMid meet"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Pattern: Dot Grid */}
              <pattern id={`grid-${themeId}`} width="14" height="14" patternUnits="userSpaceOnUse">
                {isBlueprint ? (
                  <>
                    <path d="M 14 0 L 0 0 0 14" fill="none" stroke={gridColor} strokeWidth="0.5" strokeOpacity="0.4" />
                    <circle cx="0" cy="0" r="0.8" fill={gridColor} />
                  </>
                ) : (
                  <circle cx="2" cy="2" r="0.75" fill={gridColor} />
                )}
              </pattern>

              {/* Ambient Glow for Dark/Tech Themes */}
              {isDark && (
                <radialGradient id={`glow-${themeId}`} cx="50%" cy="50%" r="55%">
                  <stop offset="0%" stopColor={accentColor} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
                </radialGradient>
              )}
              {isSunset && (
                <linearGradient id={`sunset-wash-${themeId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffedd5" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#fed7aa" stopOpacity="0.15" />
                </linearGradient>
              )}
              {isForest && (
                <linearGradient id={`forest-wash-${themeId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#dcfce7" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#bbf7d0" stopOpacity="0.1" />
                </linearGradient>
              )}
            </defs>

            {/* Canvas Base Grid */}
            <rect width="100%" height="100%" fill={`url(#grid-${themeId})`} />

            {/* Theme Special Ambient Effects */}
            {isDark && <rect width="100%" height="100%" fill={`url(#glow-${themeId})`} />}
            {isSunset && <rect width="100%" height="100%" fill={`url(#sunset-wash-${themeId})`} />}
            {isForest && <rect width="100%" height="100%" fill={`url(#forest-wash-${themeId})`} />}

            {/* Blueprint Technical Crosshairs */}
            {isBlueprint && (
              <g stroke={gridColor} strokeWidth="0.75" strokeOpacity="0.6">
                <path d="M 8 12 L 14 12 M 11 9 L 11 15" />
                <path d="M 246 12 L 252 12 M 249 9 L 249 15" />
                <path d="M 8 88 L 14 88 M 11 85 L 11 91" />
                <path d="M 246 88 L 252 88 M 249 85 L 249 91" />
                <text x="18" y="15" fill={accentColor} fontSize="6" fontFamily="monospace" opacity="0.8">
                  CAD // VIZLY-GRID
                </text>
              </g>
            )}

            {/* ── Connectors (Flow Paths) ── */}
            {/* Branch 1: Trigger -> Upper Process */}
            <path
              d="M 68 50 C 86 50, 88 35, 106 35"
              fill="none"
              stroke={edgeColor}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <polygon points="103,32 109,35 103,38" fill={edgeColor} />

            {/* Branch 2: Trigger -> Lower Task (Dashed secondary flow) */}
            <path
              d="M 68 50 C 86 50, 88 68, 106 68"
              fill="none"
              stroke={edgeColor}
              strokeWidth="1.25"
              strokeDasharray={isBlueprint ? '3,2' : '2.5,2.5'}
              strokeLinecap="round"
              strokeOpacity="0.7"
            />
            <polygon points="103,65 109,68 103,71" fill={edgeColor} fillOpacity="0.7" />

            {/* Connector 3: Upper Process -> Target Outcome */}
            <path
              d="M 170 35 C 182 35, 184 48, 194 48"
              fill="none"
              stroke={edgeColor}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <polygon points="191,45 197,48 191,51" fill={edgeColor} />

            {/* Dynamic Accent Pulse Dot on Main Highway */}
            <circle cx="86" cy="43" r="1.5" fill={accentColor} />

            {/* ── Node 1: Origin / Trigger Node (Left) ── */}
            <g filter={isDark ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.06))'}>
              <rect
                x="14"
                y="30"
                width="54"
                height="40"
                rx={isBlueprint ? '2' : isSketch ? '8' : '6'}
                fill={nodeBg}
                stroke={nodeBorder}
                strokeWidth={isHighContrast ? '2' : '1.25'}
              />
              {/* Left Accent Stripe */}
              <rect
                x="14"
                y="34"
                width="3"
                height="20"
                rx="1"
                fill={accentColor}
              />
              {/* Node Title & Skeleton Content */}
              <rect x="22" y="36" width="16" height="3" rx="1.5" fill={accentColor} />
              <rect x="22" y="44" width="34" height="3.5" rx="1.5" fill={nodeText} fillOpacity="0.8" />
              <rect x="22" y="52" width="22" height="2.5" rx="1" fill={nodeText} fillOpacity="0.4" />
              {/* Status Dot */}
              <circle cx="58" cy="38" r="1.5" fill={accentColor} />
            </g>

            {/* ── Node 2A: Process Decision Card (Center Top) ── */}
            <g filter={isDark ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.06))'}>
              <rect
                x="109"
                y="18"
                width="61"
                height="34"
                rx={isBlueprint ? '2' : isSketch ? '8' : '6'}
                fill={nodeBg}
                stroke={nodeBorder}
                strokeWidth={isHighContrast ? '2' : '1.25'}
              />
              {/* Top accent badge */}
              <rect x="115" y="24" width="20" height="3" rx="1.5" fill={accentColor} />
              <circle cx="160" cy="25" r="2" fill={accentColor} fillOpacity="0.8" />
              {/* Skeleton lines */}
              <rect x="115" y="32" width="38" height="3.5" rx="1.5" fill={nodeText} fillOpacity="0.85" />
              <rect x="115" y="40" width="26" height="2.5" rx="1" fill={nodeText} fillOpacity="0.4" />
            </g>

            {/* ── Node 2B: Subtask Node (Center Bottom) ── */}
            <g filter={isDark ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.06))'}>
              <rect
                x="109"
                y="58"
                width="61"
                height="28"
                rx={isBlueprint ? '2' : isSketch ? '6' : '5'}
                fill={nodeBg}
                stroke={nodeBorder}
                strokeWidth={isHighContrast ? '1.75' : '1'}
              />
              <circle cx="116" cy="72" r="2" fill={accentColor} />
              <rect x="122" y="70" width="36" height="3.5" rx="1.5" fill={nodeText} fillOpacity="0.75" />
            </g>

            {/* ── Node 3: Milestone / Success Node (Right) ── */}
            <g filter={isDark ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.06))'}>
              <rect
                x="197"
                y="28"
                width="49"
                height="42"
                rx={isBlueprint ? '2' : isSketch ? '8' : '7'}
                fill={nodeBg}
                stroke={nodeBorder}
                strokeWidth={isHighContrast ? '2' : '1.3'}
              />
              {/* Success Badge */}
              <circle cx="233" cy="38" r="4.5" fill={accentColor} fillOpacity="0.15" />
              <path
                d="M 231 38 L 232.5 39.5 L 235 36.5"
                fill="none"
                stroke={accentColor}
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Title & status lines */}
              <rect x="204" y="48" width="34" height="3.5" rx="1.5" fill={nodeText} fillOpacity="0.85" />
              <rect x="204" y="56" width="22" height="2.5" rx="1" fill={nodeText} fillOpacity="0.4" />
            </g>
          </svg>
        ) : (
          <span
            className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/30 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 transform -translate-x-[150%] group-hover:translate-x-[150%]"
            style={{ transitionProperty: 'opacity, transform' }}
          />
        )}
      </div>

      {/* ── Card Meta / Information ── */}
      <div className="relative flex flex-1 flex-col gap-1 text-left pointer-events-none px-0.5">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100 capitalize tracking-tight truncate">
            {label}
          </span>
          {/* Overlapping Swatch Stack */}
          {previewDetails && (
            <div className="flex items-center -space-x-1 hover:space-x-0.5 transition-all shrink-0" aria-label="主题色彩基调">
              <span
                className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-white/20 shadow-xs relative z-10"
                style={{ backgroundColor: previewDetails.canvasBg }}
                title="画布背景"
              />
              <span
                className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-white/20 shadow-xs relative z-20"
                style={{ backgroundColor: previewDetails.nodeBg }}
                title="节点底色"
              />
              <span
                className="w-3.5 h-3.5 rounded-full border border-white dark:border-zinc-800 shadow-xs relative z-30"
                style={{ backgroundColor: previewDetails.accentColor }}
                title="主强调色"
              />
              <span
                className="w-3.5 h-3.5 rounded-full border border-white dark:border-zinc-800 shadow-xs relative z-40"
                style={{ backgroundColor: previewDetails.edgeColor }}
                title="连线颜色"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-1 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-slate-500 dark:text-slate-400">
              {categoryLabel}
            </span>
            {previewDetails?.mode && (
              <>
                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {previewDetails.mode === 'dark' ? 'Dark' : 'Light'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
};
