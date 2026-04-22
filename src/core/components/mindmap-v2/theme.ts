/**
 * Vizly Hyper-Glass Theme for mind-elixir
 * Matches Vizly's visual identity — purple gradient brand + glassmorphism
 */
import type { Theme } from 'mind-elixir';

export const VIZLY_HYPER_THEME: Theme = {
    name: 'Vizly Hyper',
    palette: [
        '#6366f1', // indigo
        '#8b5cf6', // violet
        '#06b6d4', // cyan
        '#10b981', // emerald
        '#f59e0b', // amber
        '#ef4444', // red
        '#ec4899', // pink
        '#3b82f6', // blue
        '#14b8a6', // teal
        '#a855f7', // purple
    ],
    cssVar: {
        '--bgcolor': '#f8fafc',
        '--color': '#1e293b',
        '--panel-color': '#ffffff',
        '--border-color': 'rgba(226, 232, 240, 0.8)',
        '--main-color': '#ffffff',
        '--main-bgcolor': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
        '--color2': '#334155',
        '--bgcolor2': '#ffffff',
        '--selected': 'rgba(99, 102, 241, 0.12)',
        '--root-radius': '16px',
        '--radius': '8px',
        // Gap between main branches
        '--gap': '32px',
        '--main-gap': '48px',
    },
};

export const VIZLY_HYPER_DARK_THEME: Theme = {
    name: 'Vizly Hyper Dark',
    palette: [
        '#818cf8', // indigo-400
        '#a78bfa', // violet-400
        '#22d3ee', // cyan-400
        '#34d399', // emerald-400
        '#fbbf24', // amber-400
        '#f87171', // red-400
        '#f472b6', // pink-400
        '#60a5fa', // blue-400
        '#2dd4bf', // teal-400
        '#c084fc', // purple-400
    ],
    cssVar: {
        '--bgcolor': '#0f172a',
        '--color': '#f1f5f9',
        '--panel-color': '#1e293b',
        '--border-color': 'rgba(71, 85, 105, 0.6)',
        '--main-color': '#ffffff',
        '--main-bgcolor': 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #9333ea 100%)',
        '--color2': '#cbd5e1',
        '--bgcolor2': '#1e293b',
        '--selected': 'rgba(129, 140, 248, 0.18)',
        '--root-radius': '16px',
        '--radius': '8px',
        '--gap': '32px',
        '--main-gap': '48px',
    },
};
