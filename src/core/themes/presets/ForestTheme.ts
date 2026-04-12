/**
 * 森林主题定义
 */

import { ThemePreset } from '../types/ThemeTypes';
import { 
  baseTypography, 
  baseSpacing, 
  baseBorderRadius, 
  baseShadow, 
  baseAnimation 
} from '../constants/BaseConstants';

export const forestThemePreset: ThemePreset = {
  id: 'forest',
  name: '森林主题',
  description: '自然的森林绿色主题，带来生机感',
  category: 'preset',
  tags: ['forest', 'green', 'nature', 'vibrant'],
  theme: {
    id: 'forest',
    name: '森林主题',
    mode: 'light',
    palette: {
      primary: {
        main: '#2F855A',
        light: '#48BB78',
        dark: '#276749',
        contrast: '#ffffff',
        border: '#68D391',
        background: '#F0FFF4',
        text: '#1A202C',
        shadow: 'rgba(47, 133, 90, 0.2)'
      },
      secondary: {
        main: '#38A169',
        light: '#68D391',
        dark: '#2F855A',
        contrast: '#ffffff',
        border: '#9AE6B4',
        background: '#F0FFF4',
        text: '#22543D',
        shadow: 'rgba(56, 161, 105, 0.2)'
      },
      success: {
        main: '#48BB78',
        light: '#9AE6B4',
        dark: '#2F855A',
        contrast: '#ffffff',
        border: '#68D391',
        background: '#F0FFF4',
        text: '#22543D',
        shadow: 'rgba(72, 187, 120, 0.2)'
      },
      warning: {
        main: '#D69E2E',
        light: '#F6E05E',
        dark: '#B7791F',
        contrast: '#ffffff',
        border: '#F6E05E',
        background: '#FFFFF0',
        text: '#5A3A14',
        shadow: 'rgba(214, 158, 46, 0.2)'
      },
      error: {
        main: '#E53E3E',
        light: '#FC8181',
        dark: '#C53030',
        contrast: '#ffffff',
        border: '#FC8181',
        background: '#FFF5F5',
        text: '#742A2A',
        shadow: 'rgba(229, 62, 62, 0.2)'
      },
      info: {
        main: '#3182CE',
        light: '#63B3ED',
        dark: '#2C5282',
        contrast: '#ffffff',
        border: '#90CDF4',
        background: '#EBF8FF',
        text: '#2A4365',
        shadow: 'rgba(49, 130, 206, 0.2)'
      },
      neutral: {
        main: '#718096',
        light: '#CBD5E0',
        dark: '#2D3748',
        contrast: '#ffffff',
        border: '#A0AEC0',
        background: '#F7FAFC',
        text: '#1A202C',
        shadow: 'rgba(113, 128, 150, 0.2)'
      }
    },
    typography: baseTypography,
    spacing: baseSpacing,
    borderRadius: baseBorderRadius,
    shadow: baseShadow,
    animation: baseAnimation,
    diagram: {
      domains: {
        frontend: {
          main: '#68D391',
          light: '#F0FFF4',
          dark: '#48BB78',
          contrast: '#ffffff',
          border: '#9AE6B4',
          background: '#F0FFF4',
          text: '#22543D',
          shadow: 'rgba(104, 211, 145, 0.2)'
        },
        backend: {
          main: '#2F855A',
          light: '#F0FFF4',
          dark: '#276749',
          contrast: '#ffffff',
          border: '#68D391',
          background: '#F0FFF4',
          text: '#1A202C',
          shadow: 'rgba(47, 133, 90, 0.2)'
        },
        middleware: {
          main: '#38A169',
          light: '#F0FFF4',
          dark: '#2F855A',
          contrast: '#ffffff',
          border: '#68D391',
          background: '#F0FFF4',
          text: '#22543D',
          shadow: 'rgba(56, 161, 105, 0.2)'
        },
        database: {
          main: '#48BB78',
          light: '#F0FFF4',
          dark: '#2F855A',
          contrast: '#ffffff',
          border: '#68D391',
          background: '#F0FFF4',
          text: '#22543D',
          shadow: 'rgba(72, 187, 120, 0.2)'
        },
        external: {
          main: '#D69E2E',
          light: '#FFFFF0',
          dark: '#B7791F',
          contrast: '#ffffff',
          border: '#F6E05E',
          background: '#FFFFF0',
          text: '#5A3A14',
          shadow: 'rgba(214, 158, 46, 0.2)'
        },
        'be-scm': {
          main: '#2F855A',
          light: '#F0FFF4',
          dark: '#276749',
          contrast: '#ffffff',
          border: '#68D391',
          background: '#F0FFF4',
          text: '#1A202C',
          shadow: 'rgba(47, 133, 90, 0.2)'
        },
        mid: {
          main: '#38A169',
          light: '#F0FFF4',
          dark: '#2F855A',
          contrast: '#ffffff',
          border: '#68D391',
          background: '#F0FFF4',
          text: '#22543D',
          shadow: 'rgba(56, 161, 105, 0.2)'
        },
        data: {
          main: '#48BB78',
          light: '#F0FFF4',
          dark: '#2F855A',
          contrast: '#ffffff',
          border: '#68D391',
          background: '#F0FFF4',
          text: '#22543D',
          shadow: 'rgba(72, 187, 120, 0.2)'
        },
        ch: {
          main: '#68D391',
          light: '#F0FFF4',
          dark: '#48BB78',
          contrast: '#ffffff',
          border: '#9AE6B4',
          background: '#F0FFF4',
          text: '#22543D',
          shadow: 'rgba(104, 211, 145, 0.2)'
        },
        fe: {
          main: '#68D391',
          light: '#F0FFF4',
          dark: '#48BB78',
          contrast: '#ffffff',
          border: '#9AE6B4',
          background: '#F0FFF4',
          text: '#22543D',
          shadow: 'rgba(104, 211, 145, 0.2)'
        },
        'be-logistics': {
          main: '#38A169',
          light: '#F0FFF4',
          dark: '#2F855A',
          contrast: '#ffffff',
          border: '#68D391',
          background: '#F0FFF4',
          text: '#22543D',
          shadow: 'rgba(56, 161, 105, 0.2)'
        },
        'be-corp': {
          main: '#2F855A',
          light: '#F0FFF4',
          dark: '#276749',
          contrast: '#ffffff',
          border: '#68D391',
          background: '#F0FFF4',
          text: '#1A202C',
          shadow: 'rgba(47, 133, 90, 0.2)'
        },
        infra: {
          main: '#718096',
          light: '#F7FAFC',
          dark: '#2D3748',
          contrast: '#ffffff',
          border: '#A0AEC0',
          background: '#F7FAFC',
          text: '#1A202C',
          shadow: 'rgba(113, 128, 150, 0.2)'
        }
      },
      edges: {
        default: {
          main: '#A0AEC0',
          light: '#E2E8F0',
          dark: '#718096',
          contrast: '#ffffff',
          border: '#CBD5E0',
          background: '#F7FAFC',
          text: '#4A5568',
          shadow: 'rgba(160, 174, 192, 0.2)'
        },
        primary: {
          main: '#2F855A',
          light: '#F0FFF4',
          dark: '#276749',
          contrast: '#ffffff',
          border: '#68D391',
          background: '#F0FFF4',
          text: '#22543D',
          shadow: 'rgba(47, 133, 90, 0.2)'
        },
        secondary: {
          main: '#38A169',
          light: '#F0FFF4',
          dark: '#2F855A',
          contrast: '#ffffff',
          border: '#68D391',
          background: '#F0FFF4',
          text: '#22543D',
          shadow: 'rgba(56, 161, 105, 0.2)'
        },
        dashed: {
          main: '#D69E2E',
          light: '#FFFFF0',
          dark: '#B7791F',
          contrast: '#ffffff',
          border: '#F6E05E',
          background: '#FFFFF0',
          text: '#5A3A14',
          shadow: 'rgba(214, 158, 46, 0.2)'
        }
      },
      canvas: {
        background: '#F0FFF4',
        grid: {
          color: '#C6F6D5',
          size: 20,
          opacity: 0.5
        }
      },
      nodes: {
        default: {
          main: '#FFFFFF',
          light: '#F0FFF4',
          dark: '#E6FFFA',
          contrast: '#2D3748',
          border: '#C6F6D5',
          background: '#FFFFFF',
          text: '#2D3748',
          shadow: 'rgba(0, 0, 0, 0.1)'
        },
        selected: {
          main: '#2F855A',
          light: '#F0FFF4',
          dark: '#276749',
          contrast: '#ffffff',
          border: '#2F855A',
          background: '#F0FFF4',
          text: '#1A202C',
          shadow: 'rgba(47, 133, 90, 0.3)'
        },
        hover: {
          main: '#F0FFF4',
          light: '#F7FAFC',
          dark: '#E6FFFA',
          contrast: '#2D3748',
          border: '#68D391',
          background: '#F0FFF4',
          text: '#2D3748',
          shadow: 'rgba(104, 211, 145, 0.15)'
        }
      }
    }
  }
};
