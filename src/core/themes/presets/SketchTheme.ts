/**
 * 手绘主题 — 白板/Sketch 风格
 * 暖白底色 + 炭灰手绘线条 + 柔和彩色域
 */

import { ThemePreset } from '../types/ThemeTypes';
import {
  baseTypography,
  baseSpacing,
  baseAnimation
} from '../constants/BaseConstants';

export const sketchThemePreset: ThemePreset = {
  id: 'sketch',
  name: '手绘',
  description: '白板手绘风格，柔和配色搭配圆润圆角',
  category: 'preset',
  tags: ['sketch', 'hand-drawn', 'whiteboard', 'casual'],
  theme: {
    id: 'sketch',
    name: '手绘',
    mode: 'light',
    palette: {
      primary: {
        main: '#5B8DEF',
        light: '#A3C0FF',
        dark: '#3A6BD4',
        contrast: '#ffffff',
        border: '#5B8DEF',
        background: '#F0F4FF',
        text: '#2B4270',
        shadow: 'rgba(91, 141, 239, 0.15)'
      },
      secondary: {
        main: '#FF8F6B',
        light: '#FFB8A0',
        dark: '#D96840',
        contrast: '#ffffff',
        border: '#FF8F6B',
        background: '#FFF3EE',
        text: '#6B3420',
        shadow: 'rgba(255, 143, 107, 0.15)'
      },
      success: {
        main: '#5EC089',
        light: '#A8DFC0',
        dark: '#3A9B64',
        contrast: '#ffffff',
        border: '#5EC089',
        background: '#F0FFF5',
        text: '#1E5C3A',
        shadow: 'rgba(94, 192, 137, 0.15)'
      },
      warning: {
        main: '#F7C948',
        light: '#FADE82',
        dark: '#D4A72A',
        contrast: '#3D3200',
        border: '#F7C948',
        background: '#FFFCE8',
        text: '#5C4A00',
        shadow: 'rgba(247, 201, 72, 0.15)'
      },
      error: {
        main: '#E85D75',
        light: '#F5A0B0',
        dark: '#C43A52',
        contrast: '#ffffff',
        border: '#E85D75',
        background: '#FFF0F3',
        text: '#6B1A2B',
        shadow: 'rgba(232, 93, 117, 0.15)'
      },
      info: {
        main: '#5B8DEF',
        light: '#A3C0FF',
        dark: '#3A6BD4',
        contrast: '#ffffff',
        border: '#5B8DEF',
        background: '#F0F4FF',
        text: '#2B4270',
        shadow: 'rgba(91, 141, 239, 0.15)'
      },
      neutral: {
        main: '#8C8C8C',
        light: '#D9D9D9',
        dark: '#595959',
        contrast: '#ffffff',
        border: '#BFBFBF',
        background: '#FAFAF8',
        text: '#3D3D3D',
        shadow: 'rgba(0, 0, 0, 0.08)'
      }
    },
    typography: baseTypography,
    spacing: baseSpacing,
    borderRadius: { none: 0, sm: 8, md: 12, lg: 16, xl: 20, full: 9999 },
    shadow: {
      none: 'none',
      sm: '1px 2px 4px rgba(0,0,0,0.06)',
      md: '2px 4px 8px rgba(0,0,0,0.08)',
      lg: '3px 6px 16px rgba(0,0,0,0.1)',
      xl: '4px 8px 24px rgba(0,0,0,0.12)',
      inner: 'inset 1px 2px 4px rgba(0,0,0,0.06)'
    },
    animation: baseAnimation,
    diagram: {
      domains: {
        frontend: { main: '#5B8DEF', light: '#F0F4FF', dark: '#3A6BD4', contrast: '#ffffff', border: '#5B8DEF', background: '#F0F4FF', text: '#2B4270', shadow: 'rgba(91, 141, 239, 0.15)' },
        backend:  { main: '#9B7FE6', light: '#F3EEFF', dark: '#7B5FC6', contrast: '#ffffff', border: '#9B7FE6', background: '#F3EEFF', text: '#3D2B70', shadow: 'rgba(155, 127, 230, 0.15)' },
        middleware:{ main: '#FF8F6B', light: '#FFF3EE', dark: '#D96840', contrast: '#ffffff', border: '#FF8F6B', background: '#FFF3EE', text: '#6B3420', shadow: 'rgba(255, 143, 107, 0.15)' },
        database: { main: '#5EC089', light: '#F0FFF5', dark: '#3A9B64', contrast: '#ffffff', border: '#5EC089', background: '#F0FFF5', text: '#1E5C3A', shadow: 'rgba(94, 192, 137, 0.15)' },
        external: { main: '#E85D75', light: '#FFF0F3', dark: '#C43A52', contrast: '#ffffff', border: '#E85D75', background: '#FFF0F3', text: '#6B1A2B', shadow: 'rgba(232, 93, 117, 0.15)' },
        'be-scm': { main: '#5B8DEF', light: '#F0F4FF', dark: '#3A6BD4', contrast: '#ffffff', border: '#5B8DEF', background: '#F0F4FF', text: '#2B4270', shadow: 'rgba(91, 141, 239, 0.15)' },
        mid:      { main: '#FF8F6B', light: '#FFF3EE', dark: '#D96840', contrast: '#ffffff', border: '#FF8F6B', background: '#FFF3EE', text: '#6B3420', shadow: 'rgba(255, 143, 107, 0.15)' },
        data:     { main: '#F7C948', light: '#FFFCE8', dark: '#D4A72A', contrast: '#3D3200', border: '#F7C948', background: '#FFFCE8', text: '#5C4A00', shadow: 'rgba(247, 201, 72, 0.15)' },
        ch:       { main: '#8C8C8C', light: '#F5F5F3', dark: '#595959', contrast: '#ffffff', border: '#BFBFBF', background: '#F5F5F3', text: '#3D3D3D', shadow: 'rgba(0, 0, 0, 0.08)' },
        fe:       { main: '#5B8DEF', light: '#F0F4FF', dark: '#3A6BD4', contrast: '#ffffff', border: '#5B8DEF', background: '#F0F4FF', text: '#2B4270', shadow: 'rgba(91, 141, 239, 0.15)' },
        'be-logistics': { main: '#5EC089', light: '#F0FFF5', dark: '#3A9B64', contrast: '#ffffff', border: '#5EC089', background: '#F0FFF5', text: '#1E5C3A', shadow: 'rgba(94, 192, 137, 0.15)' },
        'be-corp': { main: '#9B7FE6', light: '#F3EEFF', dark: '#7B5FC6', contrast: '#ffffff', border: '#9B7FE6', background: '#F3EEFF', text: '#3D2B70', shadow: 'rgba(155, 127, 230, 0.15)' },
        infra:    { main: '#8C8C8C', light: '#F5F5F3', dark: '#595959', contrast: '#ffffff', border: '#BFBFBF', background: '#F5F5F3', text: '#3D3D3D', shadow: 'rgba(0, 0, 0, 0.08)' },
      },
      edges: {
        default:   { main: '#8C8C8C', light: '#F0F0EE', dark: '#595959', contrast: '#ffffff', border: '#BFBFBF', background: '#FAFAF8', text: '#595959', shadow: 'rgba(0, 0, 0, 0.06)' },
        primary:   { main: '#5B8DEF', light: '#F0F4FF', dark: '#3A6BD4', contrast: '#ffffff', border: '#5B8DEF', background: '#F0F4FF', text: '#2B4270', shadow: 'rgba(91, 141, 239, 0.15)' },
        secondary: { main: '#9B7FE6', light: '#F3EEFF', dark: '#7B5FC6', contrast: '#ffffff', border: '#9B7FE6', background: '#F3EEFF', text: '#3D2B70', shadow: 'rgba(155, 127, 230, 0.15)' },
        dashed:    { main: '#F7C948', light: '#FFFCE8', dark: '#D4A72A', contrast: '#3D3200', border: '#F7C948', background: '#FFFCE8', text: '#5C4A00', shadow: 'rgba(247, 201, 72, 0.15)' },
      },
      canvas: {
        background: '#FAFAF8',
        grid: { color: '#E8E6E0', size: 20, opacity: 0.6 }
      },
      nodes: {
        default:  { main: '#FFFFFF', light: '#FAFAF8', dark: '#F5F5F3', contrast: '#3D3D3D', border: '#D9D6D0', background: '#FFFFFF', text: '#3D3D3D', shadow: '2px 3px 6px rgba(0,0,0,0.06)' },
        selected: { main: '#5B8DEF', light: '#F0F4FF', dark: '#3A6BD4', contrast: '#ffffff', border: '#5B8DEF', background: '#F0F4FF', text: '#2B4270', shadow: 'rgba(91, 141, 239, 0.25)' },
        hover:    { main: '#F5F3FF', light: '#FAFAF8', dark: '#F0EDFF', contrast: '#3D3D3D', border: '#9B7FE6', background: '#F5F3FF', text: '#3D3D3D', shadow: 'rgba(155, 127, 230, 0.12)' },
      }
    }
  }
};
