/**
 * Vizly MindMap Themes for mind-elixir
 *
 * 5 built-in themes matching Vizly's Hyper-Glass visual identity.
 * Note: --main-bgcolor uses gradient syntax — applied via `background` shorthand
 * (our CSS fix injects the proper override in MindElixirWrapper.tsx).
 */
import type { Theme } from 'mind-elixir';

// ─── Theme 1: Vizly Indigo (默认品牌色) ────────────────────────────────────
export const VIZLY_HYPER_THEME: Theme = {
    name: 'Vizly Indigo',
    palette: [
        '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
        '#f59e0b', '#ef4444', '#ec4899', '#3b82f6',
        '#14b8a6', '#a855f7',
    ],
    cssVar: {
        '--bgcolor': '#f8fafc',
        '--color': '#1e293b',
        '--panel-color': '#ffffff',
        '--border-color': 'rgba(226, 232, 240, 0.8)',
        '--main-color': '#ffffff',
        '--main-bgcolor': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
        '--root-bgcolor': '#312e81',
        '--root-color': '#ffffff',
        '--color2': '#334155',
        '--bgcolor2': '#ffffff',
        '--selected': 'rgba(99, 102, 241, 0.15)',
        '--root-radius': '16px',
        '--radius': '8px',
        '--gap': '32px',
        '--main-gap': '48px',
    },
};

// ─── Theme 2: Ocean Teal ────────────────────────────────────────────────────
export const VIZLY_OCEAN_THEME: Theme = {
    name: 'Vizly Ocean',
    palette: [
        '#06b6d4', '#0891b2', '#0e7490', '#22d3ee',
        '#67e8f9', '#a5f3fc', '#10b981', '#059669',
        '#34d399', '#6ee7b7',
    ],
    cssVar: {
        '--bgcolor': '#f0f9ff',
        '--color': '#0c4a6e',
        '--panel-color': '#ffffff',
        '--border-color': 'rgba(186, 230, 253, 0.8)',
        '--main-color': '#ffffff',
        '--main-bgcolor': 'linear-gradient(135deg, #0891b2 0%, #06b6d4 50%, #22d3ee 100%)',
        '--root-bgcolor': '#0c4a6e',
        '--root-color': '#ffffff',
        '--color2': '#075985',
        '--bgcolor2': '#ffffff',
        '--selected': 'rgba(6, 182, 212, 0.15)',
        '--root-radius': '16px',
        '--radius': '8px',
        '--gap': '32px',
        '--main-gap': '48px',
    },
};

// ─── Theme 3: Emerald Forest ────────────────────────────────────────────────
export const VIZLY_EMERALD_THEME: Theme = {
    name: 'Vizly Emerald',
    palette: [
        '#10b981', '#059669', '#34d399', '#6ee7b7',
        '#a7f3d0', '#065f46', '#84cc16', '#65a30d',
        '#a3e635', '#bef264',
    ],
    cssVar: {
        '--bgcolor': '#f0fdf4',
        '--color': '#064e3b',
        '--panel-color': '#ffffff',
        '--border-color': 'rgba(167, 243, 208, 0.8)',
        '--main-color': '#ffffff',
        '--main-bgcolor': 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)',
        '--root-bgcolor': '#064e3b',
        '--root-color': '#ffffff',
        '--color2': '#065f46',
        '--bgcolor2': '#ffffff',
        '--selected': 'rgba(16, 185, 129, 0.15)',
        '--root-radius': '16px',
        '--radius': '8px',
        '--gap': '32px',
        '--main-gap': '48px',
    },
};

// ─── Theme 4: Sunset Rose ────────────────────────────────────────────────────
export const VIZLY_ROSE_THEME: Theme = {
    name: 'Vizly Rose',
    palette: [
        '#ec4899', '#db2777', '#f472b6', '#f9a8d4',
        '#fbcfe8', '#be185d', '#ef4444', '#dc2626',
        '#f87171', '#fca5a5',
    ],
    cssVar: {
        '--bgcolor': '#fff1f2',
        '--color': '#881337',
        '--panel-color': '#ffffff',
        '--border-color': 'rgba(253, 164, 175, 0.8)',
        '--main-color': '#ffffff',
        '--main-bgcolor': 'linear-gradient(135deg, #db2777 0%, #ec4899 50%, #f472b6 100%)',
        '--root-bgcolor': '#881337',
        '--root-color': '#ffffff',
        '--color2': '#9f1239',
        '--bgcolor2': '#ffffff',
        '--selected': 'rgba(236, 72, 153, 0.15)',
        '--root-radius': '16px',
        '--radius': '8px',
        '--gap': '32px',
        '--main-gap': '48px',
    },
};

// ─── Theme 5: Dark Mode ──────────────────────────────────────────────────────
export const VIZLY_HYPER_DARK_THEME: Theme = {
    name: 'Vizly Dark',
    palette: [
        '#818cf8', '#a78bfa', '#22d3ee', '#34d399',
        '#fbbf24', '#f87171', '#f472b6', '#60a5fa',
        '#2dd4bf', '#c084fc',
    ],
    cssVar: {
        '--bgcolor': '#0f172a',
        '--color': '#f1f5f9',
        '--panel-color': '#1e293b',
        '--border-color': 'rgba(71, 85, 105, 0.6)',
        '--main-color': '#ffffff',
        '--main-bgcolor': 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #9333ea 100%)',
        '--root-bgcolor': '#1e1b4b',
        '--root-color': '#e0e7ff',
        '--color2': '#cbd5e1',
        '--bgcolor2': '#1e293b',
        '--selected': 'rgba(129, 140, 248, 0.2)',
        '--root-radius': '16px',
        '--radius': '8px',
        '--gap': '32px',
        '--main-gap': '48px',
    },
};

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
