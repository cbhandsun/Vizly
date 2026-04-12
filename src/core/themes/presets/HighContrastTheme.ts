/**
 * 高对比度主题预设
 * 提供高对比度配色方案，增强可访问性
 */

import { ThemePreset } from '../types/ThemeTypes';

export const highContrastThemePreset: ThemePreset = {
  id: 'high-contrast',
  name: '高对比度主题',
  description: '高对比度主题，提升可访问性',
  category: 'built-in',
  tags: ['accessibility', 'high-contrast', 'a11y'],
  theme: {
    id: 'high-contrast',
    name: '高对比度主题',
    mode: 'light',
    palette: {
      primary: {
        main: '#000000',
        light: '#333333',
        dark: '#000000',
        contrast: '#ffffff',
        border: '#000000',
        background: '#ffffff',
        text: '#000000',
        shadow: 'rgba(0, 0, 0, 0.5)'
      },
      secondary: {
        main: '#0066cc',
        light: '#3399ff',
        dark: '#004499',
        contrast: '#ffffff',
        border: '#0066cc',
        background: '#e6f3ff',
        text: '#000000',
        shadow: 'rgba(0, 102, 204, 0.5)'
      },
      success: {
        main: '#006600',
        light: '#339933',
        dark: '#004400',
        contrast: '#ffffff',
        border: '#006600',
        background: '#e6ffe6',
        text: '#000000',
        shadow: 'rgba(0, 102, 0, 0.5)'
      },
      warning: {
        main: '#ff6600',
        light: '#ff9933',
        dark: '#cc5200',
        contrast: '#ffffff',
        border: '#ff6600',
        background: '#fff2e6',
        text: '#000000',
        shadow: 'rgba(255, 102, 0, 0.5)'
      },
      error: {
        main: '#cc0000',
        light: '#ff3333',
        dark: '#990000',
        contrast: '#ffffff',
        border: '#cc0000',
        background: '#ffe6e6',
        text: '#000000',
        shadow: 'rgba(204, 0, 0, 0.5)'
      },
      info: {
        main: '#0066cc',
        light: '#3399ff',
        dark: '#004499',
        contrast: '#ffffff',
        border: '#0066cc',
        background: '#e6f3ff',
        text: '#000000',
        shadow: 'rgba(0, 102, 204, 0.5)'
      },
      neutral: {
        main: '#666666',
        light: '#cccccc',
        dark: '#333333',
        contrast: '#ffffff',
        border: '#666666',
        background: '#f9f9f9',
        text: '#000000',
        shadow: 'rgba(0, 0, 0, 0.3)'
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
      sm: '0 2px 4px rgba(0, 0, 0, 0.5)',
      md: '0 4px 8px rgba(0, 0, 0, 0.5)',
      lg: '0 8px 16px rgba(0, 0, 0, 0.5)',
      xl: '0 16px 32px rgba(0, 0, 0, 0.5)',
      inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)'
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
          main: '#000000',
          light: '#ffffff',
          dark: '#000000',
          contrast: '#ffffff',
          border: '#000000',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(0, 0, 0, 0.8)'
        },
        backend: {
          main: '#0066cc',
          light: '#e6f3ff',
          dark: '#004499',
          contrast: '#ffffff',
          border: '#0066cc',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(0, 102, 204, 0.8)'
        },
        middleware: {
          main: '#ff6600',
          light: '#fff2e6',
          dark: '#cc5200',
          contrast: '#ffffff',
          border: '#ff6600',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(255, 102, 0, 0.8)'
        },
        database: {
          main: '#9900cc',
          light: '#f2e6ff',
          dark: '#660099',
          contrast: '#ffffff',
          border: '#9900cc',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(153, 0, 204, 0.8)'
        },
        external: {
          main: '#cc0000',
          light: '#ffe6e6',
          dark: '#990000',
          contrast: '#ffffff',
          border: '#cc0000',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(204, 0, 0, 0.8)'
        },
        // WMS架构图域配置
        'be-scm': {
          main: '#00cccc',
          light: '#e6ffff',
          dark: '#009999',
          contrast: '#ffffff',
          border: '#00cccc',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(0, 204, 204, 0.8)'
        },
        mid: {
          main: '#ff6600',
          light: '#fff2e6',
          dark: '#cc5200',
          contrast: '#ffffff',
          border: '#ff6600',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(255, 102, 0, 0.8)'
        },
        data: {
          main: '#9900cc',
          light: '#f2e6ff',
          dark: '#660099',
          contrast: '#ffffff',
          border: '#9900cc',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(153, 0, 204, 0.8)'
        },
        ch: {
          main: '#000000',
          light: '#ffffff',
          dark: '#000000',
          contrast: '#ffffff',
          border: '#000000',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(0, 0, 0, 0.8)'
        },
        fe: {
          main: '#00aa00',
          light: '#e6ffe6',
          dark: '#007700',
          contrast: '#ffffff',
          border: '#00aa00',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(0, 170, 0, 0.8)'
        },
        'be-logistics': {
          main: '#8B4513',
          light: '#ffe6cc',
          dark: '#5a2e0f',
          contrast: '#ffffff',
          border: '#8B4513',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(139, 69, 19, 0.8)'
        },
        'be-corp': {
          main: '#ffcc00',
          light: '#fff7cc',
          dark: '#cc9900',
          contrast: '#ffffff',
          border: '#ffcc00',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(255, 204, 0, 0.8)'
        },
        infra: {
          main: '#333333',
          light: '#e6e6e6',
          dark: '#1a1a1a',
          contrast: '#ffffff',
          border: '#333333',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(51, 51, 51, 0.8)'
        }
      },
      edges: {
        default: {
          main: '#000000',
          light: '#ffffff',
          dark: '#000000',
          contrast: '#ffffff',
          border: '#000000',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(0, 0, 0, 0.8)'
        },
        primary: {
          main: '#0066cc',
          light: '#e6f3ff',
          dark: '#004499',
          contrast: '#ffffff',
          border: '#0066cc',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(0, 102, 204, 0.8)'
        },
        secondary: {
          main: '#9900cc',
          light: '#f2e6ff',
          dark: '#660099',
          contrast: '#ffffff',
          border: '#9900cc',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(153, 0, 204, 0.8)'
        },
        dashed: {
          main: '#ff6600',
          light: '#fff2e6',
          dark: '#cc5200',
          contrast: '#ffffff',
          border: '#ff6600',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(255, 102, 0, 0.8)'
        }
      },
      canvas: {
        background: '#ffffff',
        grid: {
          color: '#000000',
          size: 20,
          opacity: 0.3
        }
      },
      nodes: {
        default: {
          main: '#ffffff',
          light: '#f0f0f0',
          dark: '#e0e0e0',
          contrast: '#000000',
          border: '#000000',
          background: '#ffffff',
          text: '#000000',
          shadow: 'rgba(0, 0, 0, 0.8)'
        },
        selected: {
          main: '#0066cc',
          light: '#e6f3ff',
          dark: '#004499',
          contrast: '#ffffff',
          border: '#000000',
          background: '#e6f3ff',
          text: '#000000',
          shadow: 'rgba(0, 0, 0, 1)'
        },
        hover: {
          main: '#f0f0f0',
          light: '#ffffff',
          dark: '#e0e0e0',
          contrast: '#000000',
          border: '#000000',
          background: '#f0f0f0',
          text: '#000000',
          shadow: 'rgba(0, 0, 0, 0.8)'
        }
      }
    }
  }
};
