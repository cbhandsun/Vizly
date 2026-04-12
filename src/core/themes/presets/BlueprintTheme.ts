/**
 * 蓝图主题 — 工程制图风格
 * 深蓝底色 + 白/浅蓝线条 + 冷色系域
 */

import { ThemePreset } from '../types/ThemeTypes';
import {
  baseTypography,
  baseSpacing,
  baseBorderRadius,
  baseShadow,
  baseAnimation
} from '../constants/BaseConstants';

export const blueprintThemePreset: ThemePreset = {
  id: 'blueprint',
  name: '蓝图',
  description: '工程制图风格，深蓝底色搭配浅色线条',
  category: 'preset',
  tags: ['blueprint', 'engineering', 'dark', 'professional'],
  theme: {
    id: 'blueprint',
    name: '蓝图',
    mode: 'dark',
    palette: {
      primary: {
        main: '#4FC3F7',
        light: '#81D4FA',
        dark: '#0288D1',
        contrast: '#0A1929',
        border: '#4FC3F7',
        background: '#0A1929',
        text: '#E3F2FD',
        shadow: 'rgba(79, 195, 247, 0.25)'
      },
      secondary: {
        main: '#80DEEA',
        light: '#B2EBF2',
        dark: '#00838F',
        contrast: '#0A1929',
        border: '#80DEEA',
        background: '#0B1D2E',
        text: '#E0F7FA',
        shadow: 'rgba(128, 222, 234, 0.2)'
      },
      success: {
        main: '#69F0AE',
        light: '#B9F6CA',
        dark: '#00C853',
        contrast: '#0A1929',
        border: '#69F0AE',
        background: '#0B2618',
        text: '#E8F5E9',
        shadow: 'rgba(105, 240, 174, 0.2)'
      },
      warning: {
        main: '#FFD54F',
        light: '#FFE082',
        dark: '#FFB300',
        contrast: '#0A1929',
        border: '#FFD54F',
        background: '#2B2311',
        text: '#FFF8E1',
        shadow: 'rgba(255, 213, 79, 0.2)'
      },
      error: {
        main: '#FF8A80',
        light: '#FFCDD2',
        dark: '#D32F2F',
        contrast: '#0A1929',
        border: '#FF8A80',
        background: '#2A1215',
        text: '#FFEBEE',
        shadow: 'rgba(255, 138, 128, 0.2)'
      },
      info: {
        main: '#4FC3F7',
        light: '#81D4FA',
        dark: '#0288D1',
        contrast: '#0A1929',
        border: '#4FC3F7',
        background: '#0A1929',
        text: '#E3F2FD',
        shadow: 'rgba(79, 195, 247, 0.25)'
      },
      neutral: {
        main: '#90A4AE',
        light: '#546E7A',
        dark: '#CFD8DC',
        contrast: '#ffffff',
        border: '#37474F',
        background: '#102030',
        text: '#ECEFF1',
        shadow: 'rgba(144, 164, 174, 0.15)'
      }
    },
    typography: baseTypography,
    spacing: baseSpacing,
    borderRadius: baseBorderRadius,
    shadow: baseShadow,
    animation: baseAnimation,
    diagram: {
      domains: {
        frontend: { main: '#4FC3F7', light: '#0D2137', dark: '#0288D1', contrast: '#E3F2FD', border: '#4FC3F7', background: '#0D2137', text: '#E3F2FD', shadow: 'rgba(79, 195, 247, 0.25)' },
        backend:  { main: '#4DD0E1', light: '#0B2633', dark: '#00838F', contrast: '#E0F7FA', border: '#4DD0E1', background: '#0B2633', text: '#E0F7FA', shadow: 'rgba(77, 208, 225, 0.25)' },
        middleware:{ main: '#81D4FA', light: '#0D2540', dark: '#0277BD', contrast: '#E1F5FE', border: '#81D4FA', background: '#0D2540', text: '#E1F5FE', shadow: 'rgba(129, 212, 250, 0.2)' },
        database: { main: '#80CBC4', light: '#0B2924', dark: '#00695C', contrast: '#E0F2F1', border: '#80CBC4', background: '#0B2924', text: '#E0F2F1', shadow: 'rgba(128, 203, 196, 0.2)' },
        external: { main: '#FF8A80', light: '#2A1215', dark: '#C62828', contrast: '#FFEBEE', border: '#FF8A80', background: '#2A1215', text: '#FFEBEE', shadow: 'rgba(255, 138, 128, 0.2)' },
        'be-scm': { main: '#4DD0E1', light: '#0B2633', dark: '#00838F', contrast: '#E0F7FA', border: '#4DD0E1', background: '#0B2633', text: '#E0F7FA', shadow: 'rgba(77, 208, 225, 0.25)' },
        mid:      { main: '#69F0AE', light: '#0B2618', dark: '#00C853', contrast: '#E8F5E9', border: '#69F0AE', background: '#0B2618', text: '#E8F5E9', shadow: 'rgba(105, 240, 174, 0.2)' },
        data:     { main: '#FFD54F', light: '#2B2311', dark: '#FFB300', contrast: '#FFF8E1', border: '#FFD54F', background: '#2B2311', text: '#FFF8E1', shadow: 'rgba(255, 213, 79, 0.2)' },
        ch:       { main: '#B0BEC5', light: '#162533', dark: '#546E7A', contrast: '#ECEFF1', border: '#B0BEC5', background: '#162533', text: '#ECEFF1', shadow: 'rgba(176, 190, 197, 0.15)' },
        fe:       { main: '#4FC3F7', light: '#0D2137', dark: '#0288D1', contrast: '#E3F2FD', border: '#4FC3F7', background: '#0D2137', text: '#E3F2FD', shadow: 'rgba(79, 195, 247, 0.25)' },
        'be-logistics': { main: '#80CBC4', light: '#0B2924', dark: '#00695C', contrast: '#E0F2F1', border: '#80CBC4', background: '#0B2924', text: '#E0F2F1', shadow: 'rgba(128, 203, 196, 0.2)' },
        'be-corp': { main: '#4DD0E1', light: '#0B2633', dark: '#00838F', contrast: '#E0F7FA', border: '#4DD0E1', background: '#0B2633', text: '#E0F7FA', shadow: 'rgba(77, 208, 225, 0.25)' },
        infra:    { main: '#546E7A', light: '#102030', dark: '#37474F', contrast: '#ECEFF1', border: '#546E7A', background: '#102030', text: '#ECEFF1', shadow: 'rgba(84, 110, 122, 0.15)' },
      },
      edges: {
        default:   { main: '#4FC3F7', light: '#0D2137', dark: '#0288D1', contrast: '#E3F2FD', border: '#29B6F6', background: '#0A1929', text: '#B3E5FC', shadow: 'rgba(79, 195, 247, 0.2)' },
        primary:   { main: '#4FC3F7', light: '#0D2137', dark: '#0288D1', contrast: '#E3F2FD', border: '#29B6F6', background: '#0A1929', text: '#E3F2FD', shadow: 'rgba(79, 195, 247, 0.3)' },
        secondary: { main: '#80DEEA', light: '#0B2633', dark: '#00838F', contrast: '#E0F7FA', border: '#4DD0E1', background: '#0B1D2E', text: '#E0F7FA', shadow: 'rgba(128, 222, 234, 0.2)' },
        dashed:    { main: '#FFD54F', light: '#2B2311', dark: '#FFB300', contrast: '#FFF8E1', border: '#FFCA28', background: '#1A1810', text: '#FFF8E1', shadow: 'rgba(255, 213, 79, 0.2)' },
      },
      canvas: {
        background: '#0A1929',
        grid: { color: '#1A3A5C', size: 20, opacity: 0.4 }
      },
      nodes: {
        default:  { main: '#102030', light: '#152A3E', dark: '#0A1929', contrast: '#E3F2FD', border: '#1E4976', background: '#102030', text: '#E3F2FD', shadow: 'rgba(79, 195, 247, 0.1)' },
        selected: { main: '#4FC3F7', light: '#0D2137', dark: '#0288D1', contrast: '#0A1929', border: '#4FC3F7', background: '#0D2137', text: '#E3F2FD', shadow: 'rgba(79, 195, 247, 0.35)' },
        hover:    { main: '#152A3E', light: '#1A3450', dark: '#102030', contrast: '#E3F2FD', border: '#29B6F6', background: '#152A3E', text: '#E3F2FD', shadow: 'rgba(79, 195, 247, 0.15)' },
      }
    }
  }
};
