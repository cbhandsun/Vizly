/**
 * Vizly MindMap Themes for mind-elixir
 *
 * 5 built-in themes matching Vizly's Hyper-Glass visual identity.
 * Note: --main-bgcolor uses gradient syntax — applied via `background` shorthand
 * (our CSS fix injects the proper override in MindElixirWrapper.tsx).
 */
import type { Theme } from 'mind-elixir';

interface VizlyThemeColors {
    background: string;
    text: string;
    panel: string;
    border: string;
    accent: string;
    selected: string;
    mainBackground: string;
    mainBackgroundTransparent: string;
    rootBackground: string;
    rootText: string;
}

const createThemeCssVars = (colors: VizlyThemeColors) => ({
    '--node-gap-x': '32px',
    '--node-gap-y': '32px',
    '--main-gap-x': '48px',
    '--main-gap-y': '48px',
    '--main-color': '#ffffff',
    '--main-bgcolor': colors.mainBackground,
    '--main-bgcolor-transparent': colors.mainBackgroundTransparent,
    '--color': colors.text,
    '--bgcolor': colors.background,
    '--selected': colors.selected,
    '--accent-color': colors.accent,
    '--root-color': colors.rootText,
    '--root-bgcolor': colors.rootBackground,
    '--root-border-color': colors.border,
    '--root-radius': '16px',
    '--main-radius': '8px',
    '--topic-padding': '6px 10px',
    '--panel-color': colors.text,
    '--panel-bgcolor': colors.panel,
    '--panel-border-color': colors.border,
    '--map-padding': '32px',
}) satisfies Theme['cssVar'];

// ─── Theme 1: Vizly Indigo (默认品牌色) ────────────────────────────────────
export const VIZLY_HYPER_THEME = {
    name: 'Vizly Indigo',
    palette: [
        '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
        '#f59e0b', '#ef4444', '#ec4899', '#3b82f6',
        '#14b8a6', '#a855f7',
    ],
    cssVar: createThemeCssVars({
        background: '#f8fafc', text: '#1e293b', panel: '#ffffff',
        border: 'rgba(226, 232, 240, 0.8)', accent: '#6366f1',
        selected: 'rgba(99, 102, 241, 0.15)',
        mainBackground: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
        mainBackgroundTransparent: 'rgba(99, 102, 241, 0.12)',
        rootBackground: '#312e81', rootText: '#ffffff',
    }),
} satisfies Theme;

// ─── Theme 2: Ocean Teal ────────────────────────────────────────────────────
export const VIZLY_OCEAN_THEME = {
    name: 'Vizly Ocean',
    palette: [
        '#06b6d4', '#0891b2', '#0e7490', '#22d3ee',
        '#67e8f9', '#a5f3fc', '#10b981', '#059669',
        '#34d399', '#6ee7b7',
    ],
    cssVar: createThemeCssVars({
        background: '#f0f9ff', text: '#0c4a6e', panel: '#ffffff',
        border: 'rgba(186, 230, 253, 0.8)', accent: '#06b6d4',
        selected: 'rgba(6, 182, 212, 0.15)',
        mainBackground: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 50%, #22d3ee 100%)',
        mainBackgroundTransparent: 'rgba(6, 182, 212, 0.12)',
        rootBackground: '#0c4a6e', rootText: '#ffffff',
    }),
} satisfies Theme;

// ─── Theme 3: Emerald Forest ────────────────────────────────────────────────
export const VIZLY_EMERALD_THEME = {
    name: 'Vizly Emerald',
    palette: [
        '#10b981', '#059669', '#34d399', '#6ee7b7',
        '#a7f3d0', '#065f46', '#84cc16', '#65a30d',
        '#a3e635', '#bef264',
    ],
    cssVar: createThemeCssVars({
        background: '#f0fdf4', text: '#064e3b', panel: '#ffffff',
        border: 'rgba(167, 243, 208, 0.8)', accent: '#10b981',
        selected: 'rgba(16, 185, 129, 0.15)',
        mainBackground: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)',
        mainBackgroundTransparent: 'rgba(16, 185, 129, 0.12)',
        rootBackground: '#064e3b', rootText: '#ffffff',
    }),
} satisfies Theme;

// ─── Theme 4: Sunset Rose ────────────────────────────────────────────────────
export const VIZLY_ROSE_THEME = {
    name: 'Vizly Rose',
    palette: [
        '#ec4899', '#db2777', '#f472b6', '#f9a8d4',
        '#fbcfe8', '#be185d', '#ef4444', '#dc2626',
        '#f87171', '#fca5a5',
    ],
    cssVar: createThemeCssVars({
        background: '#fff1f2', text: '#881337', panel: '#ffffff',
        border: 'rgba(253, 164, 175, 0.8)', accent: '#ec4899',
        selected: 'rgba(236, 72, 153, 0.15)',
        mainBackground: 'linear-gradient(135deg, #db2777 0%, #ec4899 50%, #f472b6 100%)',
        mainBackgroundTransparent: 'rgba(236, 72, 153, 0.12)',
        rootBackground: '#881337', rootText: '#ffffff',
    }),
} satisfies Theme;

// ─── Theme 5: Dark Mode ──────────────────────────────────────────────────────
export const VIZLY_HYPER_DARK_THEME = {
    name: 'Vizly Dark',
    palette: [
        '#818cf8', '#a78bfa', '#22d3ee', '#34d399',
        '#fbbf24', '#f87171', '#f472b6', '#60a5fa',
        '#2dd4bf', '#c084fc',
    ],
    cssVar: createThemeCssVars({
        background: '#0f172a', text: '#f1f5f9', panel: '#1e293b',
        border: 'rgba(71, 85, 105, 0.6)', accent: '#818cf8',
        selected: 'rgba(129, 140, 248, 0.2)',
        mainBackground: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #9333ea 100%)',
        mainBackgroundTransparent: 'rgba(129, 140, 248, 0.16)',
        rootBackground: '#1e1b4b', rootText: '#e0e7ff',
    }),
} satisfies Theme;

// ─── Theme Registry ──────────────────────────────────────────────────────────
export const VIZLY_THEMES: Record<string, Theme> = {
    indigo: VIZLY_HYPER_THEME,
    ocean: VIZLY_OCEAN_THEME,
    emerald: VIZLY_EMERALD_THEME,
    rose: VIZLY_ROSE_THEME,
    dark: VIZLY_HYPER_DARK_THEME,
};

export const VIZLY_THEME_OPTIONS = [
    { key: 'indigo', label: '💜 靛蓝',   theme: VIZLY_HYPER_THEME },
    { key: 'ocean',  label: '🩵 海洋',   theme: VIZLY_OCEAN_THEME },
    { key: 'emerald',label: '💚 翡翠',   theme: VIZLY_EMERALD_THEME },
    { key: 'rose',   label: '🌹 玫瑰',   theme: VIZLY_ROSE_THEME },
    { key: 'dark',   label: '🌙 深色',   theme: VIZLY_HYPER_DARK_THEME },
];
