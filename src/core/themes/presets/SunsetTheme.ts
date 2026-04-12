/**
 * 日落主题预设
 * 提供温暖的日落橙色配色方案
 */

import { ThemePreset } from '../types/ThemeTypes';

export const sunsetThemePreset: ThemePreset = {
  id: 'sunset',
  name: '日落主题',
  description: '温暖的日落橙色主题',
  category: 'built-in',
  tags: ['orange', 'sunset', 'warm'],
  theme: {
    id: 'sunset',
    name: '日落主题',
    mode: 'light',
    palette: {
      primary: {
        main: '#ff6b35',
        light: '#ff9068',
        dark: '#cc5429',
        contrast: '#ffffff',
        border: '#ff6b35',
        background: '#fff4f0',
        text: '#8b2500',
        shadow: 'rgba(255, 107, 53, 0.3)'
      },
      secondary: {
        main: '#f7931e',
        light: '#ffb347',
        dark: '#cc7518',
        contrast: '#ffffff',
        border: '#f7931e',
        background: '#fff8f0',
        text: '#8b4000',
        shadow: 'rgba(247, 147, 30, 0.3)'
      },
      success: {
        main: '#27ae60',
        light: '#58d68d',
        dark: '#1e8449',
        contrast: '#ffffff',
        border: '#27ae60',
        background: '#e8f8f5',
        text: '#0d4f3c',
        shadow: 'rgba(39, 174, 96, 0.3)'
      },
      warning: {
        main: '#f39c12',
        light: '#f8c471',
        dark: '#d68910',
        contrast: '#ffffff',
        border: '#f39c12',
        background: '#fef9e7',
        text: '#7d4f00',
        shadow: 'rgba(243, 156, 18, 0.3)'
      },
      error: {
        main: '#e74c3c',
        light: '#ec7063',
        dark: '#c0392b',
        contrast: '#ffffff',
        border: '#e74c3c',
        background: '#fdedec',
        text: '#922b21',
        shadow: 'rgba(231, 76, 60, 0.3)'
      },
      info: {
        main: '#3498db',
        light: '#5dade2',
        dark: '#2980b9',
        contrast: '#ffffff',
        border: '#3498db',
        background: '#ebf3fd',
        text: '#1b4f72',
        shadow: 'rgba(52, 152, 219, 0.3)'
      },
      neutral: {
        main: '#95a5a6',
        light: '#d5dbdb',
        dark: '#7f8c8d',
        contrast: '#ffffff',
        border: '#95a5a6',
        background: '#f8f9fa',
        text: '#2c3e50',
        shadow: 'rgba(149, 165, 166, 0.3)'
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
          main: '#ff6b35',
          light: '#fff4f0',
          dark: '#cc5429',
          contrast: '#ffffff',
          border: '#ff6b35',
          background: '#fff8f5',
          text: '#8b2500',
          shadow: 'rgba(255, 107, 53, 0.3)'
        },
        backend: {
          main: '#f7931e',
          light: '#fff8f0',
          dark: '#cc7518',
          contrast: '#ffffff',
          border: '#f7931e',
          background: '#fffaf5',
          text: '#8b4000',
          shadow: 'rgba(247, 147, 30, 0.3)'
        },
        middleware: {
          main: '#e67e22',
          light: '#fdeaa7',
          dark: '#d35400',
          contrast: '#ffffff',
          border: '#e67e22',
          background: '#fef5e7',
          text: '#7d4f00',
          shadow: 'rgba(230, 126, 34, 0.3)'
        },
        database: {
          main: '#d35400',
          light: '#fdeaa7',
          dark: '#a04000',
          contrast: '#ffffff',
          border: '#d35400',
          background: '#fef5e7',
          text: '#7d2d00',
          shadow: 'rgba(211, 84, 0, 0.3)'
        },
        external: {
          main: '#95a5a6',
          light: '#f8f9fa',
          dark: '#7f8c8d',
          contrast: '#ffffff',
          border: '#95a5a6',
          background: '#f8f9fa',
          text: '#2c3e50',
          shadow: 'rgba(149, 165, 166, 0.3)'
        },
        // WMS架构图域配置
        'be-scm': {
          main: '#ff6b35',
          light: '#fff4f0',
          dark: '#cc5429',
          contrast: '#ffffff',
          border: '#ff6b35',
          background: '#fff8f5',
          text: '#8b2500',
          shadow: 'rgba(255, 107, 53, 0.3)'
        },
        mid: {
          main: '#f7931e',
          light: '#fff8f0',
          dark: '#cc7518',
          contrast: '#ffffff',
          border: '#f7931e',
          background: '#fffaf5',
          text: '#8b4000',
          shadow: 'rgba(247, 147, 30, 0.3)'
        },
        data: {
          main: '#27ae60',
          light: '#e8f8f5',
          dark: '#1e8449',
          contrast: '#ffffff',
          border: '#27ae60',
          background: '#f0fff4',
          text: '#0d4f3c',
          shadow: 'rgba(39, 174, 96, 0.3)'
        },
        ch: {
          main: '#3498db',
          light: '#ebf3fd',
          dark: '#2980b9',
          contrast: '#ffffff',
          border: '#3498db',
          background: '#f8fbff',
          text: '#1b4f72',
          shadow: 'rgba(52, 152, 219, 0.3)'
        },
        fe: {
          main: '#ff6b35',
          light: '#fff4f0',
          dark: '#cc5429',
          contrast: '#ffffff',
          border: '#ff6b35',
          background: '#fff8f5',
          text: '#8b2500',
          shadow: 'rgba(255, 107, 53, 0.3)'
        },
        'be-logistics': {
          main: '#f7931e',
          light: '#fff8f0',
          dark: '#cc7518',
          contrast: '#ffffff',
          border: '#f7931e',
          background: '#fffaf5',
          text: '#8b4000',
          shadow: 'rgba(247, 147, 30, 0.3)'
        },
        'be-corp': {
          main: '#e67e22',
          light: '#fdeaa7',
          dark: '#d35400',
          contrast: '#ffffff',
          border: '#e67e22',
          background: '#fef5e7',
          text: '#7d4f00',
          shadow: 'rgba(230, 126, 34, 0.3)'
        },
        infra: {
          main: '#95a5a6',
          light: '#f8f9fa',
          dark: '#7f8c8d',
          contrast: '#ffffff',
          border: '#95a5a6',
          background: '#f8f9fa',
          text: '#2c3e50',
          shadow: 'rgba(149, 165, 166, 0.3)'
        }
      },
      edges: {
        default: {
          main: '#95a5a6',
          light: '#d5dbdb',
          dark: '#7f8c8d',
          contrast: '#ffffff',
          border: '#95a5a6',
          background: '#f8f9fa',
          text: '#2c3e50',
          shadow: 'rgba(149, 165, 166, 0.3)'
        },
        primary: {
          main: '#ff6b35',
          light: '#fff4f0',
          dark: '#cc5429',
          contrast: '#ffffff',
          border: '#ff6b35',
          background: '#fff8f5',
          text: '#8b2500',
          shadow: 'rgba(255, 107, 53, 0.3)'
        },
        secondary: {
          main: '#f7931e',
          light: '#fff8f0',
          dark: '#cc7518',
          contrast: '#ffffff',
          border: '#f7931e',
          background: '#fffaf5',
          text: '#8b4000',
          shadow: 'rgba(247, 147, 30, 0.3)'
        },
        dashed: {
          main: '#e67e22',
          light: '#fdeaa7',
          dark: '#d35400',
          contrast: '#ffffff',
          border: '#e67e22',
          background: '#fef5e7',
          text: '#7d4f00',
          shadow: 'rgba(230, 126, 34, 0.3)'
        }
      },
      canvas: {
        background: '#fffcf8',
        grid: {
          color: '#ffeaa7',
          size: 20,
          opacity: 0.5
        }
      },
      nodes: {
        default: {
          main: '#ffffff',
          light: '#fffcf8',
          dark: '#fff4f0',
          contrast: '#8b2500',
          border: '#ff6b35',
          background: '#ffffff',
          text: '#8b2500',
          shadow: 'rgba(255, 107, 53, 0.2)'
        },
        selected: {
          main: '#ff6b35',
          light: '#fff4f0',
          dark: '#cc5429',
          contrast: '#ffffff',
          border: '#ff6b35',
          background: '#fff4f0',
          text: '#8b2500',
          shadow: 'rgba(255, 107, 53, 0.4)'
        },
        hover: {
          main: '#fff8f5',
          light: '#ffffff',
          dark: '#fff4f0',
          contrast: '#8b2500',
          border: '#ff6b35',
          background: '#fff8f5',
          text: '#8b2500',
          shadow: 'rgba(255, 107, 53, 0.3)'
        }
      }
    }
  }
};
