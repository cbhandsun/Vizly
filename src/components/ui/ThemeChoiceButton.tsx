import React from 'react';

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
  const isOcean = themeId === 'ocean';
  const isHighContrast = themeId === 'high-contrast';
  const isSketch = themeId === 'sketch';
  const isMidnight = themeId === 'midnight';
  const isCorporate = themeId === 'corporate' || themeId === 'enterprise';
  const isNordic = themeId === 'nordic';
  const isMono = themeId === 'mono';
  const isClassic = themeId === 'classic' || themeId === 'origin' || themeId === 'default';

  // 基础渲染色彩
  const canvasBg = previewDetails ? previewDetails.canvasBg : gradient;
  const gridColor = previewDetails?.gridColor || (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.07)');
  const nodeBg = previewDetails?.nodeBg || (isDark ? '#1e293b' : '#ffffff');
  const nodeBorder = previewDetails?.nodeBorder || (isDark ? '#475569' : '#cbd5e1');
  const nodeText = previewDetails?.nodeText || (isDark ? '#f8fafc' : '#0f172a');
  const edgeColor = previewDetails?.edgeColor || (isDark ? '#38bdf8' : '#2563eb');
  const accentColor = previewDetails?.accentColor || (isDark ? '#818cf8' : '#4f46e5');

  // 微缩窗口标题专属标识
  const getMicroChromeBadge = () => {
    if (isBlueprint) return 'CAD // ARCH_BLUEPRINT 2.4';
    if (isMidnight) return 'CYBER // MIDNIGHT_NEON';
    if (isDark) return 'OBSIDIAN // DARK_CORE';
    if (isSunset) return 'TWILIGHT // AMBER_GLOW';
    if (isForest) return 'JADE // BOTANICAL_V3';
    if (isOcean) return 'AZURE // OCEAN_FLOW';
    if (isHighContrast) return 'SWISS // HIGH_CONTRAST';
    if (isMono) return 'BRAUN // MONOCHROME';
    if (isCorporate) return 'ENTERPRISE // SLATE_SYS';
    if (isNordic) return 'NORDIC // MINIMAL_ICE';
    if (isSketch) return 'HANDMADE // SKETCH_FLOW';
    if (isClassic) return 'ORIGIN // CLEAN_VECTOR';
    return 'VIZLY // PRO_CANVAS';
  };

  // 窗口微按钮颜色
  const getTrafficDotColors = () => {
    if (isMono || isHighContrast) {
      return isDark ? ['#475569', '#64748b', '#94a3b8'] : ['#94a3b8', '#cbd5e1', '#e2e8f0'];
    }
    return ['#ef4444', '#f59e0b', '#10b981'];
  };

  const [dotRed, dotYellow, dotGreen] = getTrafficDotColors();
  const nodeRadius = isBlueprint ? '2' : isHighContrast ? '1' : isSketch ? '8' : '6';

  return (
    <button
      type="button"
      data-theme-id={themeId}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={`group relative flex min-h-[44px] flex-col gap-2.5 p-3 sm:p-3.5 text-left transition-all duration-300 rounded-2xl cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${
        active
          ? 'bg-white dark:bg-[#161820] border-2 border-indigo-600 dark:border-indigo-500 shadow-[0_14px_32px_-6px_rgba(99,102,241,0.28)] ring-4 ring-indigo-500/15'
          : 'bg-white dark:bg-[#131419] border border-slate-200/85 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20 hover:shadow-[0_16px_36px_-8px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.04)] dark:hover:shadow-black/40 hover:-translate-y-1.5'
      }`}
      onClick={onSelect}
    >
      {/* ── Canvas Miniature Scene (380px Wide Viewport with 80px+ Left/Right Margins) ── */}
      <div
        aria-hidden="true"
        className="w-full h-[120px] sm:h-[126px] rounded-xl relative overflow-hidden flex flex-col select-none shadow-[inset_0_1px_4px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.03)] dark:shadow-[inset_0_1px_4px_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.2)]"
        style={{
          background: canvasBg,
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
        }}
      >
        {previewDetails ? (
          <svg
            className="w-full h-full overflow-hidden pointer-events-none transition-transform duration-500 ease-out group-hover:scale-[1.02]"
            viewBox="0 0 350 142"
            preserveAspectRatio="xMidYMid meet"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Pattern: Dot Grid */}
              <pattern id={`grid-${themeId}`} width="14" height="14" patternUnits="userSpaceOnUse">
                {isBlueprint ? (
                  <>
                    <path d="M 14 0 L 0 0 0 14" fill="none" stroke={gridColor} strokeWidth="0.5" strokeOpacity="0.35" />
                    <circle cx="0" cy="0" r="0.75" fill={gridColor} />
                  </>
                ) : (
                  <circle cx="2" cy="2" r="0.75" fill={gridColor} />
                )}
              </pattern>

              {/* Multi-Stage Spatial Elevation Shadow (Contact + Ambient Depth) */}
              <filter id={`shadow-${themeId}`} x="-30%" y="-30%" width="160%" height="170%">
                <feDropShadow
                  dx="0"
                  dy="1.2"
                  stdDeviation="1.5"
                  floodColor={isDark ? '#000000' : '#0f172a'}
                  floodOpacity={isDark ? '0.7' : '0.12'}
                />
                <feDropShadow
                  dx="0"
                  dy="5"
                  stdDeviation="5"
                  floodColor={isDark ? '#000000' : '#0f172a'}
                  floodOpacity={isDark ? '0.5' : '0.07'}
                />
              </filter>

              {/* Spatial Atmosphere / Radial Lighting Pool Centered on Diagram */}
              <radialGradient id={`spatial-light-${themeId}`} cx="50%" cy="56%" r="56%">
                <stop
                  offset="0%"
                  stopColor={isDark ? accentColor : '#ffffff'}
                  stopOpacity={isDark ? (isMidnight ? '0.24' : '0.16') : '0.85'}
                />
                <stop
                  offset="65%"
                  stopColor={isDark ? accentColor : '#ffffff'}
                  stopOpacity={isDark ? '0.05' : '0.2'}
                />
                <stop
                  offset="100%"
                  stopColor={isDark ? '#000000' : '#0f172a'}
                  stopOpacity={isDark ? '0.35' : '0.03'}
                />
              </radialGradient>

              {/* Theme-Specific Washes */}
              {isSunset && (
                <linearGradient id={`sunset-wash-${themeId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffedd5" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#fed7aa" stopOpacity="0.15" />
                </linearGradient>
              )}
              {isForest && (
                <linearGradient id={`forest-wash-${themeId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#dcfce7" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#bbf7d0" stopOpacity="0.14" />
                </linearGradient>
              )}
              {isOcean && (
                <linearGradient id={`ocean-wash-${themeId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#bae6fd" stopOpacity="0.16" />
                </linearGradient>
              )}
              {isCorporate && (
                <linearGradient id={`corporate-wash-${themeId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#eff6ff" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.14" />
                </linearGradient>
              )}
              {isNordic && (
                <linearGradient id={`nordic-wash-${themeId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f0f9ff" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#e0f2fe" stopOpacity="0.14" />
                </linearGradient>
              )}
              {isMono && (
                <linearGradient id={`mono-wash-${themeId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f4f4f5" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#e4e4e7" stopOpacity="0.16" />
                </linearGradient>
              )}
            </defs>

            {/* Canvas Base Grid */}
            <rect width="100%" height="100%" fill={`url(#grid-${themeId})`} />

            {/* Ambient Lighting & Stage Pool */}
            <rect width="100%" height="100%" fill={`url(#spatial-light-${themeId})`} />
            {isSunset && <rect width="100%" height="100%" fill={`url(#sunset-wash-${themeId})`} />}
            {isForest && <rect width="100%" height="100%" fill={`url(#forest-wash-${themeId})`} />}
            {isOcean && <rect width="100%" height="100%" fill={`url(#ocean-wash-${themeId})`} />}
            {isCorporate && <rect width="100%" height="100%" fill={`url(#corporate-wash-${themeId})`} />}
            {isNordic && <rect width="100%" height="100%" fill={`url(#nordic-wash-${themeId})`} />}
            {isMono && <rect width="100%" height="100%" fill={`url(#mono-wash-${themeId})`} />}

            {/* ── Micro-Chrome Window Header Bar (Height 18px) ── */}
            <rect
              x="0"
              y="0"
              width="350"
              height="18"
              fill={isDark ? 'rgba(0,0,0,0.38)' : 'rgba(255,255,255,0.78)'}
            />
            <line
              x1="0"
              y1="18"
              x2="350"
              y2="18"
              stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
              strokeWidth="0.75"
            />
            {/* Window Traffic Dots */}
            <circle cx="13" cy="9" r="2.2" fill={dotRed} opacity="0.85" />
            <circle cx="20" cy="9" r="2.2" fill={dotYellow} opacity="0.85" />
            <circle cx="27" cy="9" r="2.2" fill={dotGreen} opacity="0.85" />

            {/* Micro Window Title (Centered at 190) */}
            <text
              x="175"
              y="12.5"
              textAnchor="middle"
              fontSize="6"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontWeight="700"
              letterSpacing="0.08em"
              fill={nodeText}
              fillOpacity="0.65"
            >
              {getMicroChromeBadge()}
            </text>

            {/* Scale / Active Indicator */}
            {active ? (
              <text
                x="336"
                y="12.5"
                textAnchor="end"
                fontSize="6"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="700"
                fill={accentColor}
              >
                ● ACTIVE
              </text>
            ) : (
              <text
                x="336"
                y="12.5"
                textAnchor="end"
                fontSize="5.2"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="500"
                fill={nodeText}
                fillOpacity="0.45"
              >
                100%
              </text>
            )}

            {/* Technical CAD Details for Blueprint */}
            {isBlueprint && (
              <g stroke={gridColor} strokeWidth="0.75" strokeOpacity="0.75">
                <path d="M 12 26 L 18 26 M 15 23 L 15 29" />
                <path d="M 362 26 L 368 26 M 365 23 L 365 29" />
                <path d="M 12 122 L 18 122 M 15 119 L 15 125" />
                <path d="M 362 122 L 368 122 M 365 119 L 365 125" />
                <text x="190" y="126" textAnchor="middle" fontSize="4.2" fontFamily="ui-monospace, monospace" fill="#38bdf8" opacity="0.55">
                  ◄── 350px ARCH_GRID SYSTEM ──►
                </text>
              </g>
            )}

            {/* ── Spatial Minimap Navigator HUD (Bottom Right Corner) ── */}
            <g transform="translate(318, 116)" opacity="0.6">
              <rect
                x="0"
                y="0"
                width="20"
                height="14"
                rx="2.5"
                fill={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
                stroke={nodeBorder}
                strokeWidth="0.5"
                strokeOpacity="0.5"
              />
              {/* Viewport Frame */}
              <rect
                x="3"
                y="2.5"
                width="11"
                height="8"
                rx="1"
                fill="none"
                stroke={accentColor}
                strokeWidth="0.75"
              />
              {/* Mini Nodes in Canvas HUD */}
              <circle cx="5.5" cy="5.5" r="0.75" fill={accentColor} />
              <circle cx="10" cy="4.5" r="0.75" fill={edgeColor} />
              <circle cx="10" cy="7.5" r="0.75" fill={edgeColor} />
              <circle cx="16" cy="6.5" r="0.75" fill={accentColor} />
            </g>

            {/* ── Connectors (Spacious Flow Paths Centered in Canvas) ── */}
            {/* Highway 1: Trigger -> Upper Router Node */}
            <path
              d="M 110 73 C 126 73, 126 48, 142 48"
              fill="none"
              stroke={edgeColor}
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <polygon points="138,45.5 143,48 138,50.5" fill={edgeColor} />

            {/* Highway 2: Trigger -> Lower Store Node */}
            <path
              d="M 110 73 C 126 73, 126 99, 142 99"
              fill="none"
              stroke={edgeColor}
              strokeWidth="1.2"
              strokeDasharray={isBlueprint ? '3,2' : '2.5,2'}
              strokeLinecap="round"
              strokeOpacity="0.75"
            />
            <polygon points="138,96.5 143,99 138,101.5" fill={edgeColor} fillOpacity="0.75" />

            {/* Highway 3: Upper Router -> Client Delivery Node */}
            <path
              d="M 212 48 C 228 48, 228 73, 244 73"
              fill="none"
              stroke={edgeColor}
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <polygon points="240,70.5 245,73 240,75.5" fill={edgeColor} />

            {/* Highway 4: Lower Store -> Client Delivery (Telemetry sync) */}
            <path
              d="M 212 99 C 228 99, 228 73, 244 73"
              fill="none"
              stroke={edgeColor}
              strokeWidth="1"
              strokeDasharray="2.5,2"
              strokeLinecap="round"
              strokeOpacity="0.5"
            />

            {/* Glowing Data Flow Pulses */}
            <circle cx="126" cy="60.5" r="2.2" fill={accentColor} />
            <circle cx="126" cy="60.5" r="4.5" fill={accentColor} fillOpacity="0.25" />
            <circle cx="228" cy="60.5" r="2" fill={edgeColor} />

            {/* ── Node 1: API Gateway / Ingest Node (Left Margin = 76px!) ── */}
            <g filter={`url(#shadow-${themeId})`}>
              <rect
                x="52"
                y="49"
                width="58"
                height="48"
                rx={nodeRadius}
                fill={nodeBg}
                stroke={nodeBorder}
                strokeWidth={isHighContrast ? '1.75' : '1.2'}
              />
              {/* Node Header Strip */}
              <rect
                x="52"
                y="49"
                width="58"
                height="14"
                rx={nodeRadius}
                fill={accentColor}
                fillOpacity={isDark ? '0.25' : '0.1'}
              />
              {/* Mini Icon Dot */}
              <circle cx="60" cy="56" r="2.2" fill={accentColor} />
              {/* Micro Title */}
              <text
                x="66"
                y="58"
                fontSize="6.2"
                fontWeight="700"
                fontFamily="system-ui, -apple-system, sans-serif"
                fill={nodeText}
                letterSpacing="0.02em"
              >
                API Ingest
              </text>
              {/* Live Status Indicator Dot */}
              <circle cx="103" cy="56" r="1.6" fill="#10b981" />

              {/* Header Separator Line */}
              <line
                x1="52"
                y1="63"
                x2="110"
                y2="63"
                stroke={nodeBorder}
                strokeWidth="0.75"
                strokeOpacity="0.3"
              />

              {/* Micro Metadata */}
              <text
                x="58"
                y="71.5"
                fontSize="5"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="600"
                fill={nodeText}
                fillOpacity="0.75"
              >
                POST /v1/order
              </text>
              <text
                x="58"
                y="79.5"
                fontSize="4.6"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="500"
                fill={accentColor}
                fillOpacity="0.9"
              >
                200 OK • 18ms
              </text>
              <text
                x="58"
                y="87"
                fontSize="4.2"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="500"
                fill={nodeText}
                fillOpacity="0.4"
              >
                payload: 2.4kb
              </text>

              {/* Micro Output Anchor Socket */}
              <circle cx="110" cy="73" r="2.2" fill={nodeBg} stroke={edgeColor} strokeWidth="1.3" />
            </g>

            {/* ── Node 2A: Event Router / AI Process (Center Top: x=158 to 222) ── */}
            <g filter={`url(#shadow-${themeId})`}>
              <rect
                x="142"
                y="28"
                width="70"
                height="40"
                rx={nodeRadius}
                fill={nodeBg}
                stroke={nodeBorder}
                strokeWidth={isHighContrast ? '1.75' : '1.2'}
              />
              {/* Left Accent Stripe */}
              <rect
                x="142"
                y="32"
                width="2.5"
                height="16"
                rx="1.25"
                fill={accentColor}
              />
              {/* Micro Title */}
              <text
                x="151"
                y="38.5"
                fontSize="6.2"
                fontWeight="700"
                fontFamily="system-ui, -apple-system, sans-serif"
                fill={nodeText}
              >
                Event Router
              </text>
              {/* Micro Status Chip */}
              <rect
                x="184"
                y="32"
                width="22"
                height="7"
                rx="3"
                fill={accentColor}
                fillOpacity="0.15"
                stroke={accentColor}
                strokeWidth="0.5"
                strokeOpacity="0.4"
              />
              <text
                x="195"
                y="37"
                fontSize="4.2"
                fontWeight="700"
                textAnchor="middle"
                fontFamily="system-ui, -apple-system, sans-serif"
                fill={accentColor}
              >
                ASYNC
              </text>

              {/* Separator line */}
              <line
                x1="142"
                y1="43"
                x2="212"
                y2="43"
                stroke={nodeBorder}
                strokeWidth="0.75"
                strokeOpacity="0.3"
              />

              {/* Micro text */}
              <text
                x="150"
                y="51.5"
                fontSize="5"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="600"
                fill={nodeText}
                fillOpacity="0.75"
              >
                route: dispatch_q
              </text>
              <text
                x="150"
                y="60"
                fontSize="4.6"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="500"
                fill={accentColor}
                fillOpacity="0.85"
              >
                p99: 1.2ms • ok
              </text>

              {/* Micro In/Out Anchor Sockets */}
              <circle cx="142" cy="48" r="2.2" fill={nodeBg} stroke={edgeColor} strokeWidth="1.3" />
              <circle cx="212" cy="48" r="2.2" fill={nodeBg} stroke={edgeColor} strokeWidth="1.3" />
            </g>

            {/* ── Node 2B: State Store / Redis (Center Bottom: x=158 to 222) ── */}
            <g filter={`url(#shadow-${themeId})`}>
              <rect
                x="142"
                y="80"
                width="70"
                height="38"
                rx={nodeRadius}
                fill={nodeBg}
                stroke={nodeBorder}
                strokeWidth={isHighContrast ? '1.75' : '1.2'}
              />
              {/* Micro Title */}
              <text
                x="151"
                y="90.5"
                fontSize="6.2"
                fontWeight="700"
                fontFamily="system-ui, -apple-system, sans-serif"
                fill={nodeText}
              >
                Redis Cache
              </text>
              {/* Micro Status Chip */}
              <rect
                x="183"
                y="84"
                width="23"
                height="7"
                rx="3"
                fill="#10b981"
                fillOpacity="0.14"
                stroke="#10b981"
                strokeWidth="0.5"
                strokeOpacity="0.4"
              />
              <text
                x="194.5"
                y="89"
                fontSize="4.2"
                fontWeight="700"
                textAnchor="middle"
                fontFamily="system-ui, -apple-system, sans-serif"
                fill="#10b981"
              >
                SYNCED
              </text>

              {/* Separator line */}
              <line
                x1="142"
                y1="95"
                x2="212"
                y2="95"
                stroke={nodeBorder}
                strokeWidth="0.75"
                strokeOpacity="0.3"
              />

              {/* Micro text */}
              <text
                x="150"
                y="103"
                fontSize="5"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="600"
                fill={nodeText}
                fillOpacity="0.7"
              >
                hit_rate: 98.4%
              </text>
              <text
                x="150"
                y="110.5"
                fontSize="4.6"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="500"
                fill="#10b981"
                fillOpacity="0.9"
              >
                replica: live_02
              </text>

              {/* Micro In Anchor Socket */}
              <circle cx="142" cy="99" r="2.2" fill={nodeBg} stroke={edgeColor} strokeWidth="1.3" />
            </g>

            {/* ── Node 3: Target Outcome / Client DB (Right Column: x=250 to 296, Right Margin = 84px!) ── */}
            <g filter={`url(#shadow-${themeId})`}>
              <rect
                x="244"
                y="49"
                width="54"
                height="48"
                rx={nodeRadius}
                fill={nodeBg}
                stroke={nodeBorder}
                strokeWidth={isHighContrast ? '1.75' : '1.2'}
              />
              {/* Micro Success Icon Badge */}
              <circle cx="254" cy="57" r="3.5" fill={accentColor} fillOpacity="0.15" />
              <path
                d="M 252.5 57 L 253.7 58.3 L 256 55.5"
                fill="none"
                stroke={accentColor}
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Micro Title */}
              <text
                x="260"
                y="59"
                fontSize="6.2"
                fontWeight="700"
                fontFamily="system-ui, -apple-system, sans-serif"
                fill={nodeText}
              >
                Client DB
              </text>

              {/* Separator */}
              <line
                x1="244"
                y1="64"
                x2="298"
                y2="64"
                stroke={nodeBorder}
                strokeWidth="0.75"
                strokeOpacity="0.3"
              />

              {/* Output Micro Lines */}
              <text
                x="250"
                y="72.5"
                fontSize="5"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="600"
                fill={nodeText}
                fillOpacity="0.75"
              >
                Postgres
              </text>
              <text
                x="250"
                y="80.5"
                fontSize="4.6"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="500"
                fill={accentColor}
                fillOpacity="0.9"
              >
                committed
              </text>
              <text
                x="250"
                y="88.5"
                fontSize="4.2"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="500"
                fill="#10b981"
                fillOpacity="0.9"
              >
                tx: 0x8a9f
              </text>

              {/* Micro In Anchor Socket */}
              <circle cx="244" cy="73" r="2.2" fill={nodeBg} stroke={edgeColor} strokeWidth="1.3" />
            </g>
          </svg>
        ) : (
          <span
            className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/30 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 transform -translate-x-[150%] group-hover:translate-x-[150%]"
            style={{ transitionProperty: 'opacity, transform' }}
          />
        )}
      </div>

      {/* ── Card Meta / Information (Refined Commercial Typography) ── */}
      <div className="relative flex flex-1 flex-col gap-1.5 text-left pointer-events-none px-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13.5px] font-bold text-slate-800 dark:text-slate-100 capitalize tracking-tight truncate">
              {label}
            </span>
            {active && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 text-[10px] font-bold tracking-tight shrink-0 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>当前生效</span>
              </span>
            )}
          </div>
          {/* Color Token Swatches Capsule */}
          {previewDetails && (
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100/90 dark:bg-zinc-800/90 border border-slate-200/80 dark:border-white/10 shadow-2xs shrink-0"
              title={`画布: ${previewDetails.canvasBg} · 节点: ${previewDetails.nodeBg} · 强调: ${previewDetails.accentColor} · 连线: ${previewDetails.edgeColor}`}
              aria-label="主题色彩基调"
            >
              <span
                className="w-2.5 h-2.5 rounded-full ring-1 ring-black/15 dark:ring-white/20 shadow-2xs shrink-0"
                style={{ backgroundColor: previewDetails.canvasBg }}
                title="画布背景"
              />
              <span
                className="w-2.5 h-2.5 rounded-full ring-1 ring-black/15 dark:ring-white/20 shadow-2xs shrink-0"
                style={{ backgroundColor: previewDetails.nodeBg }}
                title="节点底色"
              />
              <span
                className="w-2.5 h-2.5 rounded-full ring-1 ring-black/15 dark:ring-white/20 shadow-2xs shrink-0"
                style={{ backgroundColor: previewDetails.accentColor }}
                title="主强调色"
              />
              <span
                className="w-2.5 h-2.5 rounded-full ring-1 ring-black/15 dark:ring-white/20 shadow-2xs shrink-0"
                style={{ backgroundColor: previewDetails.edgeColor }}
                title="连线颜色"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded bg-slate-100/90 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 font-medium text-[10.5px]">
              {categoryLabel}
            </span>
            {previewDetails?.mode && (
              <>
                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
