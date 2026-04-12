/**
 * 基础主题常量
 * 定义所有主题共享的基础常量
 */

import { 
  ThemeTypography, 
  ThemeSpacing, 
  ThemeBorderRadius, 
  ThemeShadow, 
  ThemeAnimation 
} from '../types/ThemeTypes';

// 基础版式常量
export const baseTypography: ThemeTypography = {
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['Fira Code', 'monospace']
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 22
  },
  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75
  }
};

// 基础间距常量
export const baseSpacing: ThemeSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48
};

// 基础圆角常量
export const baseBorderRadius: ThemeBorderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999
};

// 基础阴影常量
export const baseShadow: ThemeShadow = {
  none: 'none',
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px rgba(0, 0, 0, 0.1)',
  inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.06)'
};

// 基础动画常量
export const baseAnimation: ThemeAnimation = {
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
};
