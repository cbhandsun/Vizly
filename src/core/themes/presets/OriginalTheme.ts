/**
 * 原始主题预设
 * 提供经典的蓝色配色方案
 */

import { ThemePreset } from '../types/ThemeTypes';

export const originalThemePreset: ThemePreset = {
  id: 'original',
  name: '原始主题',
  description: '经典的蓝色配色方案',
  category: 'built-in',
  tags: ['blue', 'classic', 'original'],
  theme: {
    id: 'original',
    name: '原始主题',
    mode: 'light',
    palette: {
      primary: {
        main: '#1976d2',
        light: '#42a5f5',
        dark: '#1565c0',
        contrast: '#ffffff',
        border: '#1976d2',
        background: '#e3f2fd',
        text: '#0d47a1',
        shadow: 'rgba(25, 118, 210, 0.3)'
      },
      secondary: {
        main: '#dc004e',
        light: '#f53269',
        dark: '#9a0036',
        contrast: '#ffffff',
        border: '#dc004e',
        background: '#fce4ec',
        text: '#880e4f',
        shadow: 'rgba(220, 0, 78, 0.3)'
      },
      success: {
        main: '#4caf50',
        light: '#66bb6a',
        dark: '#388e3c',
        contrast: '#ffffff',
        border: '#4caf50',
        background: '#e8f5e9',
        text: '#1b5e20',
        shadow: 'rgba(76, 175, 80, 0.3)'
      },
      warning: {
        main: '#ff9800',
        light: '#ffa726',
        dark: '#f57c00',
        contrast: '#ffffff',
        border: '#ff9800',
        background: '#fff3e0',
        text: '#e65100',
        shadow: 'rgba(255, 152, 0, 0.3)'
      },
      error: {
        main: '#f44336',
        light: '#ef5350',
        dark: '#d32f2f',
        contrast: '#ffffff',
        border: '#f44336',
        background: '#ffebee',
        text: '#b71c1c',
        shadow: 'rgba(244, 67, 54, 0.3)'
      },
      info: {
        main: '#2196f3',
        light: '#42a5f5',
        dark: '#1976d2',
        contrast: '#ffffff',
        border: '#2196f3',
        background: '#e3f2fd',
        text: '#0d47a1',
        shadow: 'rgba(33, 150, 243, 0.3)'
      },
      neutral: {
        main: '#757575',
        light: '#bdbdbd',
        dark: '#424242',
        contrast: '#ffffff',
        border: '#757575',
        background: '#fafafa',
        text: '#212121',
        shadow: 'rgba(117, 117, 117, 0.3)'
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
          main: '#1976d2',
          light: '#e3f2fd',
          dark: '#1565c0',
          contrast: '#ffffff',
          border: '#1976d2',
          background: '#e3f2fd',
          text: '#0d47a1',
          shadow: 'rgba(25, 118, 210, 0.3)'
        },
        backend: {
          main: '#dc004e',
          light: '#fce4ec',
          dark: '#9a0036',
          contrast: '#ffffff',
          border: '#dc004e',
          background: '#fce4ec',
          text: '#880e4f',
          shadow: 'rgba(220, 0, 78, 0.3)'
        },
        middleware: {
          main: '#2196f3',
          light: '#e3f2fd',
          dark: '#1976d2',
          contrast: '#ffffff',
          border: '#2196f3',
          background: '#e3f2fd',
          text: '#0d47a1',
          shadow: 'rgba(33, 150, 243, 0.3)'
        },
        database: {
          main: '#4caf50',
          light: '#e8f5e9',
          dark: '#388e3c',
          contrast: '#ffffff',
          border: '#4caf50',
          background: '#e8f5e9',
          text: '#1b5e20',
          shadow: 'rgba(76, 175, 80, 0.3)'
        },
        external: {
          main: '#757575',
          light: '#fafafa',
          dark: '#424242',
          contrast: '#ffffff',
          border: '#757575',
          background: '#fafafa',
          text: '#212121',
          shadow: 'rgba(117, 117, 117, 0.3)'
        },
        // WMS架构图域配置
        'be-scm': {
          main: '#1976d2',
          light: '#e3f2fd',
          dark: '#1565c0',
          contrast: '#ffffff',
          border: '#1976d2',
          background: '#e3f2fd',
          text: '#0d47a1',
          shadow: 'rgba(25, 118, 210, 0.3)'
        },
        mid: {
          main: '#dc004e',
          light: '#fce4ec',
          dark: '#9a0036',
          contrast: '#ffffff',
          border: '#dc004e',
          background: '#fce4ec',
          text: '#880e4f',
          shadow: 'rgba(220, 0, 78, 0.3)'
        },
        data: {
          main: '#4caf50',
          light: '#e8f5e9',
          dark: '#388e3c',
          contrast: '#ffffff',
          border: '#4caf50',
          background: '#e8f5e9',
          text: '#1b5e20',
          shadow: 'rgba(76, 175, 80, 0.3)'
        },
        ch: {
          main: '#2196f3',
          light: '#e3f2fd',
          dark: '#1976d2',
          contrast: '#ffffff',
          border: '#2196f3',
          background: '#e3f2fd',
          text: '#0d47a1',
          shadow: 'rgba(33, 150, 243, 0.3)'
        },
        fe: {
          main: '#1976d2',
          light: '#e3f2fd',
          dark: '#1565c0',
          contrast: '#ffffff',
          border: '#1976d2',
          background: '#e3f2fd',
          text: '#0d47a1',
          shadow: 'rgba(25, 118, 210, 0.3)'
        },
        'be-logistics': {
          main: '#dc004e',
          light: '#fce4ec',
          dark: '#9a0036',
          contrast: '#ffffff',
          border: '#dc004e',
          background: '#fce4ec',
          text: '#880e4f',
          shadow: 'rgba(220, 0, 78, 0.3)'
        },
        'be-corp': {
          main: '#2196f3',
          light: '#e3f2fd',
          dark: '#1976d2',
          contrast: '#ffffff',
          border: '#2196f3',
          background: '#e3f2fd',
          text: '#0d47a1',
          shadow: 'rgba(33, 150, 243, 0.3)'
        },
        infra: {
          main: '#757575',
          light: '#fafafa',
          dark: '#424242',
          contrast: '#ffffff',
          border: '#757575',
          background: '#fafafa',
          text: '#212121',
          shadow: 'rgba(117, 117, 117, 0.3)'
        }
      },
      edges: {
        default: {
          main: '#757575',
          light: '#bdbdbd',
          dark: '#424242',
          contrast: '#ffffff',
          border: '#757575',
          background: '#fafafa',
          text: '#212121',
          shadow: 'rgba(117, 117, 117, 0.3)'
        },
        primary: {
          main: '#1976d2',
          light: '#42a5f5',
          dark: '#1565c0',
          contrast: '#ffffff',
          border: '#1976d2',
          background: '#e3f2fd',
          text: '#0d47a1',
          shadow: 'rgba(25, 118, 210, 0.3)'
        },
        secondary: {
          main: '#dc004e',
          light: '#f53269',
          dark: '#9a0036',
          contrast: '#ffffff',
          border: '#dc004e',
          background: '#fce4ec',
          text: '#880e4f',
          shadow: 'rgba(220, 0, 78, 0.3)'
        },
        dashed: {
          main: '#ff9800',
          light: '#ffa726',
          dark: '#f57c00',
          contrast: '#ffffff',
          border: '#ff9800',
          background: '#fff3e0',
          text: '#e65100',
          shadow: 'rgba(255, 152, 0, 0.3)'
        }
      },
      canvas: {
        background: '#fafafa',
        grid: {
          color: '#e0e0e0',
          size: 20,
          opacity: 0.5
        }
      },
      nodes: {
        default: {
          main: '#ffffff',
          light: '#fafafa',
          dark: '#f5f5f5',
          contrast: '#212121',
          border: '#bdbdbd',
          background: '#ffffff',
          text: '#212121',
          shadow: 'rgba(0, 0, 0, 0.1)'
        },
        selected: {
          main: '#1976d2',
          light: '#42a5f5',
          dark: '#1565c0',
          contrast: '#ffffff',
          border: '#1976d2',
          background: '#e3f2fd',
          text: '#0d47a1',
          shadow: 'rgba(25, 118, 210, 0.4)'
        },
        hover: {
          main: '#f5f5f5',
          light: '#fafafa',
          dark: '#eeeeee',
          contrast: '#212121',
          border: '#9e9e9e',
          background: '#f5f5f5',
          text: '#212121',
          shadow: 'rgba(117, 117, 117, 0.3)'
        }
      }
    }
  }
};
