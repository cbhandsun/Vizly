/**
 * 海洋主题定义
 */

import { ThemePreset } from '../types/ThemeTypes';
import { 
  baseTypography, 
  baseSpacing, 
  baseBorderRadius, 
  baseShadow, 
  baseAnimation 
} from '../constants/BaseConstants';

export const oceanThemePreset: ThemePreset = {
  id: 'ocean',
  name: '海洋主题',
  description: '清新的海洋蓝色主题，带来宁静感',
  category: 'preset',
  tags: ['ocean', 'blue', 'fresh', 'calming'],
  theme: {
    id: 'ocean',
    name: '海洋主题',
    mode: 'light',
    palette: {
      primary: {
        main: '#0066CC',
        light: '#4D94FF',
        dark: '#004C99',
        contrast: '#ffffff',
        border: '#3399FF',
        background: '#E6F2FF',
        text: '#003366',
        shadow: 'rgba(0, 102, 204, 0.2)'
      },
      secondary: {
        main: '#00B4D8',
        light: '#66D9EF',
        dark: '#0077A3',
        contrast: '#ffffff',
        border: '#33C5E6',
        background: '#E6F9FF',
        text: '#004D5C',
        shadow: 'rgba(0, 180, 216, 0.2)'
      },
      success: {
        main: '#38B2AC',
        light: '#81E6E1',
        dark: '#2C7A7B',
        contrast: '#ffffff',
        border: '#4FD1C7',
        background: '#E6FFFA',
        text: '#234E52',
        shadow: 'rgba(56, 178, 172, 0.2)'
      },
      warning: {
        main: '#F6AD55',
        light: '#FBD38D',
        dark: '#DD6B20',
        contrast: '#ffffff',
        border: '#F6AD55',
        background: '#FFF5E6',
        text: '#7B341E',
        shadow: 'rgba(246, 173, 85, 0.2)'
      },
      error: {
        main: '#FC8181',
        light: '#FEB2B2',
        dark: '#E53E3E',
        contrast: '#ffffff',
        border: '#FC8181',
        background: '#FFF5F5',
        text: '#742A2A',
        shadow: 'rgba(252, 129, 129, 0.2)'
      },
      info: {
        main: '#4299E1',
        light: '#90CDF4',
        dark: '#3182CE',
        contrast: '#ffffff',
        border: '#63B3ED',
        background: '#EBF8FF',
        text: '#2A4365',
        shadow: 'rgba(66, 153, 225, 0.2)'
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
          main: '#00B4D8',
          light: '#E6F9FF',
          dark: '#0077A3',
          contrast: '#ffffff',
          border: '#33C5E6',
          background: '#E6F9FF',
          text: '#004D5C',
          shadow: 'rgba(0, 180, 216, 0.2)'
        },
        backend: {
          main: '#0066CC',
          light: '#E6F2FF',
          dark: '#004C99',
          contrast: '#ffffff',
          border: '#3399FF',
          background: '#E6F2FF',
          text: '#003366',
          shadow: 'rgba(0, 102, 204, 0.2)'
        },
        middleware: {
          main: '#4299E1',
          light: '#EBF8FF',
          dark: '#3182CE',
          contrast: '#ffffff',
          border: '#63B3ED',
          background: '#EBF8FF',
          text: '#2A4365',
          shadow: 'rgba(66, 153, 225, 0.2)'
        },
        database: {
          main: '#2B6CB0',
          light: '#E6FFFA',
          dark: '#2C5282',
          contrast: '#ffffff',
          border: '#4299E1',
          background: '#E6FFFA',
          text: '#1A365D',
          shadow: 'rgba(43, 108, 176, 0.2)'
        },
        external: {
          main: '#E53E3E',
          light: '#FFF5F5',
          dark: '#C53030',
          contrast: '#ffffff',
          border: '#FC8181',
          background: '#FFF5F5',
          text: '#742A2A',
          shadow: 'rgba(229, 62, 62, 0.2)'
        },
        'be-scm': {
          main: '#0066CC',
          light: '#E6F2FF',
          dark: '#004C99',
          contrast: '#ffffff',
          border: '#3399FF',
          background: '#E6F2FF',
          text: '#003366',
          shadow: 'rgba(0, 102, 204, 0.2)'
        },
        mid: {
          main: '#00B4D8',
          light: '#E6F9FF',
          dark: '#0077A3',
          contrast: '#ffffff',
          border: '#33C5E6',
          background: '#E6F9FF',
          text: '#004D5C',
          shadow: 'rgba(0, 180, 216, 0.2)'
        },
        data: {
          main: '#4299E1',
          light: '#EBF8FF',
          dark: '#3182CE',
          contrast: '#ffffff',
          border: '#63B3ED',
          background: '#EBF8FF',
          text: '#2A4365',
          shadow: 'rgba(66, 153, 225, 0.2)'
        },
        ch: {
          main: '#38B2AC',
          light: '#E6FFFA',
          dark: '#2C7A7B',
          contrast: '#ffffff',
          border: '#4FD1C7',
          background: '#E6FFFA',
          text: '#234E52',
          shadow: 'rgba(56, 178, 172, 0.2)'
        },
        fe: {
          main: '#00B4D8',
          light: '#E6F9FF',
          dark: '#0077A3',
          contrast: '#ffffff',
          border: '#33C5E6',
          background: '#E6F9FF',
          text: '#004D5C',
          shadow: 'rgba(0, 180, 216, 0.2)'
        },
        'be-logistics': {
          main: '#2B6CB0',
          light: '#EBF8FF',
          dark: '#2C5282',
          contrast: '#ffffff',
          border: '#4299E1',
          background: '#EBF8FF',
          text: '#1A365D',
          shadow: 'rgba(43, 108, 176, 0.2)'
        },
        'be-corp': {
          main: '#0066CC',
          light: '#E6F2FF',
          dark: '#004C99',
          contrast: '#ffffff',
          border: '#3399FF',
          background: '#E6F2FF',
          text: '#003366',
          shadow: 'rgba(0, 102, 204, 0.2)'
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
          main: '#0066CC',
          light: '#E6F2FF',
          dark: '#004C99',
          contrast: '#ffffff',
          border: '#3399FF',
          background: '#E6F2FF',
          text: '#003366',
          shadow: 'rgba(0, 102, 204, 0.2)'
        },
        secondary: {
          main: '#00B4D8',
          light: '#E6F9FF',
          dark: '#0077A3',
          contrast: '#ffffff',
          border: '#33C5E6',
          background: '#E6F9FF',
          text: '#004D5C',
          shadow: 'rgba(0, 180, 216, 0.2)'
        },
        dashed: {
          main: '#F6AD55',
          light: '#FFF5E6',
          dark: '#DD6B20',
          contrast: '#ffffff',
          border: '#F6AD55',
          background: '#FFF5E6',
          text: '#7B341E',
          shadow: 'rgba(246, 173, 85, 0.2)'
        }
      },
      canvas: {
        background: '#F7FAFC',
        grid: {
          color: '#E2E8F0',
          size: 20,
          opacity: 0.5
        }
      },
      nodes: {
        default: {
          main: '#FFFFFF',
          light: '#F7FAFC',
          dark: '#EDF2F7',
          contrast: '#2D3748',
          border: '#E2E8F0',
          background: '#FFFFFF',
          text: '#2D3748',
          shadow: 'rgba(0, 0, 0, 0.1)'
        },
        selected: {
          main: '#0066CC',
          light: '#E6F2FF',
          dark: '#004C99',
          contrast: '#ffffff',
          border: '#0066CC',
          background: '#E6F2FF',
          text: '#003366',
          shadow: 'rgba(0, 102, 204, 0.3)'
        },
        hover: {
          main: '#EBF8FF',
          light: '#F0F9FF',
          dark: '#E1F5FE',
          contrast: '#2D3748',
          border: '#4299E1',
          background: '#EBF8FF',
          text: '#2D3748',
          shadow: 'rgba(66, 153, 225, 0.15)'
        }
      }
    }
  }
};
