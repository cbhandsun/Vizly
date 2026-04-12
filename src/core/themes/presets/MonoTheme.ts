/**
 * 单色主题预设
 * 提供简洁的灰度配色方案
 */

import { ThemePreset } from '../types/ThemeTypes';

export const monoThemePreset: ThemePreset = {
  id: 'mono',
  name: '单色主题',
  description: '简洁的灰度配色方案',
  category: 'built-in',
  tags: ['monochrome', 'gray', 'minimal'],
  theme: {
    id: 'mono',
    name: '单色主题',
    mode: 'light',
    palette: {
      primary: {
        main: '#374151',
        light: '#6b7280',
        dark: '#1f2937',
        contrast: '#ffffff',
        border: '#374151',
        background: '#f9fafb',
        text: '#111827',
        shadow: 'rgba(55, 65, 81, 0.3)'
      },
      secondary: {
        main: '#6b7280',
        light: '#9ca3af',
        dark: '#4b5563',
        contrast: '#ffffff',
        border: '#6b7280',
        background: '#f3f4f6',
        text: '#1f2937',
        shadow: 'rgba(107, 114, 128, 0.3)'
      },
      success: {
        main: '#10b981',
        light: '#34d399',
        dark: '#059669',
        contrast: '#ffffff',
        border: '#10b981',
        background: '#ecfdf5',
        text: '#064e3b',
        shadow: 'rgba(16, 185, 129, 0.3)'
      },
      warning: {
        main: '#f59e0b',
        light: '#fbbf24',
        dark: '#d97706',
        contrast: '#ffffff',
        border: '#f59e0b',
        background: '#fffbeb',
        text: '#78350f',
        shadow: 'rgba(245, 158, 11, 0.3)'
      },
      error: {
        main: '#ef4444',
        light: '#f87171',
        dark: '#dc2626',
        contrast: '#ffffff',
        border: '#ef4444',
        background: '#fef2f2',
        text: '#7f1d1d',
        shadow: 'rgba(239, 68, 68, 0.3)'
      },
      info: {
        main: '#3b82f6',
        light: '#60a5fa',
        dark: '#2563eb',
        contrast: '#ffffff',
        border: '#3b82f6',
        background: '#eff6ff',
        text: '#1e3a8a',
        shadow: 'rgba(59, 130, 246, 0.3)'
      },
      neutral: {
        main: '#9ca3af',
        light: '#d1d5db',
        dark: '#6b7280',
        contrast: '#ffffff',
        border: '#9ca3af',
        background: '#f3f4f6',
        text: '#374151',
        shadow: 'rgba(156, 163, 175, 0.3)'
      }
    },
    typography: {
      fontFamily: { sans: ['"Segoe UI"', '"Roboto"', '"Helvetica Neue"', 'sans-serif'], mono: ['"Consolas"', '"Monaco"', '"Courier New"', 'monospace'] },
      fontSize: {
        xs: 12,
        sm: 14,
        md: 16,
        lg: 18,
        xl: 20,
        xxl: 24
      },
      fontWeight: {
        light: 400,
        normal: 500,
        medium: 600,
        semibold: 700,
        bold: 800
      },
      lineHeight: {
        tight: 1.25,
        normal: 1.5,
        relaxed: 1.75
      }
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      xxl: 48
    },
    borderRadius: {
      none: 0,
      sm: 2,
      md: 4,
      lg: 6,
      xl: 8,
      full: 9999
    },
    shadow: {
      none: 'none',
      sm: '0 2px 4px rgba(0, 0, 0, 0.1)',
      md: '0 4px 8px rgba(0, 0, 0, 0.15)',
      lg: '0 8px 16px rgba(0, 0, 0, 0.2)',
      xl: '0 16px 32px rgba(0, 0, 0, 0.25)',
      inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.06)'
    },
    animation: {
      duration: {
        fast: 150,
        normal: 300,
        slow: 500
      },
      easing: {
        linear: 'linear',
        ease: 'ease',
        easeIn: 'ease-in',
        easeOut: 'ease-out',
        easeInOut: 'ease-in-out'
      }
    },
    diagram: {
      domains: {
        frontend: {
          main: '#374151',
          light: '#f9fafb',
          dark: '#1f2937',
          contrast: '#ffffff',
          border: '#374151',
          background: '#f9fafb',
          text: '#111827',
          shadow: 'rgba(55, 65, 81, 0.3)'
        },
        backend: {
          main: '#6b7280',
          light: '#f3f4f6',
          dark: '#4b5563',
          contrast: '#ffffff',
          border: '#6b7280',
          background: '#f3f4f6',
          text: '#1f2937',
          shadow: 'rgba(107, 114, 128, 0.3)'
        },
        middleware: {
          main: '#9ca3af',
          light: '#d1d5db',
          dark: '#6b7280',
          contrast: '#ffffff',
          border: '#9ca3af',
          background: '#f3f4f6',
          text: '#374151',
          shadow: 'rgba(156, 163, 175, 0.3)'
        },
        database: {
          main: '#6b7280',
          light: '#f3f4f6',
          dark: '#4b5563',
          contrast: '#ffffff',
          border: '#6b7280',
          background: '#f3f4f6',
          text: '#1f2937',
          shadow: 'rgba(107, 114, 128, 0.3)'
        },
        external: {
          main: '#9ca3af',
          light: '#d1d5db',
          dark: '#6b7280',
          contrast: '#ffffff',
          border: '#9ca3af',
          background: '#f3f4f6',
          text: '#374151',
          shadow: 'rgba(156, 163, 175, 0.3)'
        },
        // WMS架构图域配置
        'be-scm': {
          main: '#374151',
          light: '#f9fafb',
          dark: '#1f2937',
          contrast: '#ffffff',
          border: '#374151',
          background: '#f9fafb',
          text: '#111827',
          shadow: 'rgba(55, 65, 81, 0.3)'
        },
        mid: {
          main: '#6b7280',
          light: '#f3f4f6',
          dark: '#4b5563',
          contrast: '#ffffff',
          border: '#6b7280',
          background: '#f3f4f6',
          text: '#1f2937',
          shadow: 'rgba(107, 114, 128, 0.3)'
        },
        data: {
          main: '#10b981',
          light: '#ecfdf5',
          dark: '#059669',
          contrast: '#ffffff',
          border: '#10b981',
          background: '#ecfdf5',
          text: '#064e3b',
          shadow: 'rgba(16, 185, 129, 0.3)'
        },
        ch: {
          main: '#3b82f6',
          light: '#eff6ff',
          dark: '#2563eb',
          contrast: '#ffffff',
          border: '#3b82f6',
          background: '#eff6ff',
          text: '#1e3a8a',
          shadow: 'rgba(59, 130, 246, 0.3)'
        },
        fe: {
          main: '#374151',
          light: '#f9fafb',
          dark: '#1f2937',
          contrast: '#ffffff',
          border: '#374151',
          background: '#f9fafb',
          text: '#111827',
          shadow: 'rgba(55, 65, 81, 0.3)'
        },
        'be-logistics': {
          main: '#6b7280',
          light: '#f3f4f6',
          dark: '#4b5563',
          contrast: '#ffffff',
          border: '#6b7280',
          background: '#f3f4f6',
          text: '#1f2937',
          shadow: 'rgba(107, 114, 128, 0.3)'
        },
        'be-corp': {
          main: '#9ca3af',
          light: '#d1d5db',
          dark: '#6b7280',
          contrast: '#ffffff',
          border: '#9ca3af',
          background: '#f3f4f6',
          text: '#374151',
          shadow: 'rgba(156, 163, 175, 0.3)'
        },
        infra: {
          main: '#6b7280',
          light: '#f3f4f6',
          dark: '#4b5563',
          contrast: '#ffffff',
          border: '#6b7280',
          background: '#f3f4f6',
          text: '#1f2937',
          shadow: 'rgba(107, 114, 128, 0.3)'
        }
      },
      edges: {
        default: {
          main: '#9ca3af',
          light: '#d1d5db',
          dark: '#6b7280',
          contrast: '#ffffff',
          border: '#9ca3af',
          background: '#f3f4f6',
          text: '#374151',
          shadow: 'rgba(156, 163, 175, 0.3)'
        },
        primary: {
          main: '#374151',
          light: '#6b7280',
          dark: '#1f2937',
          contrast: '#ffffff',
          border: '#374151',
          background: '#f9fafb',
          text: '#111827',
          shadow: 'rgba(55, 65, 81, 0.3)'
        },
        secondary: {
          main: '#6b7280',
          light: '#9ca3af',
          dark: '#4b5563',
          contrast: '#ffffff',
          border: '#6b7280',
          background: '#f3f4f6',
          text: '#1f2937',
          shadow: 'rgba(107, 114, 128, 0.3)'
        },
        dashed: {
          main: '#9ca3af',
          light: '#d1d5db',
          dark: '#6b7280',
          contrast: '#ffffff',
          border: '#9ca3af',
          background: '#f3f4f6',
          text: '#374151',
          shadow: 'rgba(156, 163, 175, 0.3)'
        }
      },
      canvas: {
        background: '#ffffff',
        grid: {
          color: '#f3f4f6',
          size: 20,
          opacity: 0.5
        }
      },
      nodes: {
        default: {
          main: '#ffffff',
          light: '#f9fafb',
          dark: '#f3f4f6',
          contrast: '#111827',
          border: '#d1d5db',
          background: '#ffffff',
          text: '#111827',
          shadow: 'rgba(0, 0, 0, 0.1)'
        },
        selected: {
          main: '#374151',
          light: '#6b7280',
          dark: '#1f2937',
          contrast: '#ffffff',
          border: '#374151',
          background: '#f9fafb',
          text: '#111827',
          shadow: 'rgba(55, 65, 81, 0.4)'
        },
        hover: {
          main: '#f3f4f6',
          light: '#f9fafb',
          dark: '#e5e7eb',
          contrast: '#111827',
          border: '#9ca3af',
          background: '#f3f4f6',
          text: '#111827',
          shadow: 'rgba(107, 114, 128, 0.3)'
        }
      }
    }
  }
};
