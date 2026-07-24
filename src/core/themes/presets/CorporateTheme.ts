/**
 * 商务主题 — 企业 PPT 风格
 * 纯白底色 + 深灰线条 + 品牌蓝/红域色
 */

import { ThemePreset } from '../types/ThemeTypes';
import {
  baseTypography,
  baseSpacing,
  baseShadow,
  baseAnimation
} from '../constants/BaseConstants';

export const corporateThemePreset: ThemePreset = {
  id: 'corporate',
  name: '商务',
  description: '企业演示风格，专业配色适合正式汇报',
  category: 'preset',
  tags: ['corporate', 'business', 'professional', 'presentation'],
  theme: {
    id: 'corporate',
    name: '商务',
    mode: 'light',
    palette: {
      primary: {
        main: '#1B3A6B',
        light: '#3D6CB3',
        dark: '#0F2344',
        contrast: '#ffffff',
        border: '#2A5298',
        background: '#EEF2F9',
        text: '#0F2344',
        shadow: 'rgba(27, 58, 107, 0.15)'
      },
      secondary: {
        main: '#C0392B',
        light: '#E57373',
        dark: '#962D22',
        contrast: '#ffffff',
        border: '#D94F42',
        background: '#FDF0EF',
        text: '#5C1A14',
        shadow: 'rgba(192, 57, 43, 0.15)'
      },
      success: {
        main: '#27AE60',
        light: '#6FCF97',
        dark: '#1B7D42',
        contrast: '#ffffff',
        border: '#3DBD71',
        background: '#EDF9F1',
        text: '#145230',
        shadow: 'rgba(39, 174, 96, 0.15)'
      },
      warning: {
        main: '#E67E22',
        light: '#F5B041',
        dark: '#B36415',
        contrast: '#ffffff',
        border: '#EB9B47',
        background: '#FEF5EA',
        text: '#6B3A0E',
        shadow: 'rgba(230, 126, 34, 0.15)'
      },
      error: {
        main: '#C0392B',
        light: '#E57373',
        dark: '#962D22',
        contrast: '#ffffff',
        border: '#D94F42',
        background: '#FDF0EF',
        text: '#5C1A14',
        shadow: 'rgba(192, 57, 43, 0.15)'
      },
      info: {
        main: '#2980B9',
        light: '#5DADE2',
        dark: '#1A5276',
        contrast: '#ffffff',
        border: '#3498DB',
        background: '#EBF5FB',
        text: '#154360',
        shadow: 'rgba(41, 128, 185, 0.15)'
      },
      neutral: {
        main: '#7F8C8D',
        light: '#BDC3C7',
        dark: '#2C3E50',
        contrast: '#ffffff',
        border: '#95A5A6',
        background: '#F8F9FA',
        text: '#2C3E50',
        shadow: 'rgba(44, 62, 80, 0.1)'
      }
    },
    typography: baseTypography,
    spacing: baseSpacing,
    borderRadius: { none: 0, sm: 3, md: 4, lg: 6, xl: 8, full: 9999 },
    shadow: baseShadow,
    animation: baseAnimation,
    diagram: {
      domains: {
        frontend: { main: '#2980B9', light: '#EBF5FB', dark: '#1A5276', contrast: '#ffffff', border: '#3498DB', background: '#EBF5FB', text: '#154360', shadow: 'rgba(41, 128, 185, 0.15)' },
        backend:  { main: '#1B3A6B', light: '#EEF2F9', dark: '#0F2344', contrast: '#ffffff', border: '#2A5298', background: '#EEF2F9', text: '#0F2344', shadow: 'rgba(27, 58, 107, 0.15)' },
        middleware:{ main: '#8E44AD', light: '#F4ECF7', dark: '#6C3483', contrast: '#ffffff', border: '#A569BD', background: '#F4ECF7', text: '#4A235A', shadow: 'rgba(142, 68, 173, 0.15)' },
        database: { main: '#27AE60', light: '#EDF9F1', dark: '#1B7D42', contrast: '#ffffff', border: '#3DBD71', background: '#EDF9F1', text: '#145230', shadow: 'rgba(39, 174, 96, 0.15)' },
        external: { main: '#C0392B', light: '#FDF0EF', dark: '#962D22', contrast: '#ffffff', border: '#D94F42', background: '#FDF0EF', text: '#5C1A14', shadow: 'rgba(192, 57, 43, 0.15)' },
        'be-scm': { main: '#1B3A6B', light: '#EEF2F9', dark: '#0F2344', contrast: '#ffffff', border: '#2A5298', background: '#EEF2F9', text: '#0F2344', shadow: 'rgba(27, 58, 107, 0.15)' },
        mid:      { main: '#8E44AD', light: '#F4ECF7', dark: '#6C3483', contrast: '#ffffff', border: '#A569BD', background: '#F4ECF7', text: '#4A235A', shadow: 'rgba(142, 68, 173, 0.15)' },
        data:     { main: '#E67E22', light: '#FEF5EA', dark: '#B36415', contrast: '#ffffff', border: '#EB9B47', background: '#FEF5EA', text: '#6B3A0E', shadow: 'rgba(230, 126, 34, 0.15)' },
        ch:       { main: '#7F8C8D', light: '#F2F3F4', dark: '#566573', contrast: '#ffffff', border: '#95A5A6', background: '#F2F3F4', text: '#2C3E50', shadow: 'rgba(127, 140, 141, 0.1)' },
        fe:       { main: '#2980B9', light: '#EBF5FB', dark: '#1A5276', contrast: '#ffffff', border: '#3498DB', background: '#EBF5FB', text: '#154360', shadow: 'rgba(41, 128, 185, 0.15)' },
        'be-logistics': { main: '#27AE60', light: '#EDF9F1', dark: '#1B7D42', contrast: '#ffffff', border: '#3DBD71', background: '#EDF9F1', text: '#145230', shadow: 'rgba(39, 174, 96, 0.15)' },
        'be-corp': { main: '#1B3A6B', light: '#EEF2F9', dark: '#0F2344', contrast: '#ffffff', border: '#2A5298', background: '#EEF2F9', text: '#0F2344', shadow: 'rgba(27, 58, 107, 0.15)' },
        infra:    { main: '#566573', light: '#EBEDEF', dark: '#2C3E50', contrast: '#ffffff', border: '#808B96', background: '#EBEDEF', text: '#1C2833', shadow: 'rgba(86, 101, 115, 0.1)' },
      },
      edges: {
        default:   { main: '#95A5A6', light: '#F2F3F4', dark: '#7F8C8D', contrast: '#ffffff', border: '#BDC3C7', background: '#F8F9FA', text: '#566573', shadow: 'rgba(44, 62, 80, 0.08)' },
        primary:   { main: '#1B3A6B', light: '#EEF2F9', dark: '#0F2344', contrast: '#ffffff', border: '#2A5298', background: '#EEF2F9', text: '#0F2344', shadow: 'rgba(27, 58, 107, 0.15)' },
        secondary: { main: '#C0392B', light: '#FDF0EF', dark: '#962D22', contrast: '#ffffff', border: '#D94F42', background: '#FDF0EF', text: '#5C1A14', shadow: 'rgba(192, 57, 43, 0.15)' },
        dashed:    { main: '#7F8C8D', light: '#F2F3F4', dark: '#566573', contrast: '#ffffff', border: '#95A5A6', background: '#F8F9FA', text: '#2C3E50', shadow: 'rgba(127, 140, 141, 0.1)' },
      },
      canvas: {
        background: '#FFFFFF',
        grid: { color: '#EBEDEF', size: 20, opacity: 0.5 }
      },
      nodes: {
        default:  { main: '#FFFFFF', light: '#F8F9FA', dark: '#F2F3F4', contrast: '#2C3E50', border: '#D5D8DC', background: '#FFFFFF', text: '#2C3E50', shadow: 'rgba(44, 62, 80, 0.08)' },
        selected: { main: '#1B3A6B', light: '#EEF2F9', dark: '#0F2344', contrast: '#ffffff', border: '#1B3A6B', background: '#EEF2F9', text: '#0F2344', shadow: 'rgba(27, 58, 107, 0.25)' },
        hover:    { main: '#F8F9FA', light: '#FBFCFC', dark: '#F2F3F4', contrast: '#2C3E50', border: '#3498DB', background: '#F8F9FA', text: '#2C3E50', shadow: 'rgba(52, 152, 219, 0.1)' },
      }
    }
  }
};
