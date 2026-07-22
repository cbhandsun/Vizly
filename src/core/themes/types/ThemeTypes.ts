/**
 * 主题类型定义
 * 定义所有主题相关的接口和类型
 */

// 基础颜色定义
export interface ThemeColor {
  main: string;
  light: string;
  dark: string;
  contrast: string;
  border: string;
  background: string;
  text: string;
  shadow: string;
}

// 版式定义
export interface ThemeTypography {
  fontFamily: {
    sans: string[];
    mono: string[];
  };
  fontSize: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  fontWeight: {
    light: number;
    normal: number;
    medium: number;
    semibold: number;
    bold: number;
  };
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
  };
}

// 间距定义
export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

// 圆角定义
export interface ThemeBorderRadius {
  none: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  full: number;
}

// 阴影定义
export interface ThemeShadow {
  none: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  inner: string;
}

// 动画定义
export interface ThemeAnimation {
  duration: {
    fast: number;
    normal: number;
    slow: number;
  };
  easing: {
    linear: string;
    ease: string;
    easeIn: string;
    easeOut: string;
    easeInOut: string;
  };
}

// 图表域颜色定义
export interface DomainColors {
  [key: string]: ThemeColor;
}

// 图表边颜色定义
export interface EdgeColors {
  default: ThemeColor;
  primary: ThemeColor;
  secondary: ThemeColor;
  dashed: ThemeColor;
  [key: string]: ThemeColor;
}

// 图表画布定义
export interface CanvasTheme {
  background: string;
  grid: {
    color: string;
    size: number;
    opacity: number;
  };
}

// 图表节点定义
export interface NodeTheme {
  default: ThemeColor;
  selected: ThemeColor;
  hover: ThemeColor;
}

// 图表主题定义
export interface DiagramTheme {
  domains: DomainColors;
  edges: EdgeColors;
  canvas: CanvasTheme;
  nodes: NodeTheme;
}

// 调色板定义
export interface ThemePalette {
  primary: ThemeColor;
  secondary: ThemeColor;
  success: ThemeColor;
  warning: ThemeColor;
  error: ThemeColor;
  info: ThemeColor;
  neutral: ThemeColor;
}

// 完整主题定义
export interface Theme {
  id: string;
  name: string;
  /** 可选的主题描述 */
  description?: string;
  mode: 'light' | 'dark';
  palette: ThemePalette;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  borderRadius: ThemeBorderRadius;
  shadow: ThemeShadow;
  animation: ThemeAnimation;
  diagram: DiagramTheme;
}

// 主题预设定义
export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  /** 预设类别，兼容社区预设 */
  category: 'built-in' | 'preset' | 'custom' | 'community';
  tags: string[];
  /** 可选的创建时间戳（ISO字符串） */
  createdAt?: string;
  theme: Theme;
}

// 主题过渡定义
export interface ThemeTransition {
  enabled: boolean;
  duration: number;
  easing: string;
}

// 主题性能选项
export interface ThemePerformanceOptions {
  cacheThemes: boolean;
  lazyLoad: boolean;
  preloadDelay: number;
  maxCacheSize: number;
  /** 以下字段用于优化控制，兼容旧代码 */
  enableTransitions?: boolean;
  transitionDuration?: number;
  batchUpdates?: boolean;
  debounceDelay?: number;
  preloadThemes?: string[];
}

// 主题事件定义
export interface ThemeChangeEvent {
  type: 'theme-changed';
  oldTheme: Theme;
  newTheme: Theme;
  source: 'user' | 'system' | 'preset' | 'custom';
  timestamp: number;
}

export interface ThemePresetEvent {
  type: 'preset-added' | 'preset-removed' | 'preset-updated';
  preset: ThemePreset;
  timestamp: number;
}

export type ThemeEvent = ThemeChangeEvent | ThemePresetEvent;
export type ThemeEventListener = (event: ThemeEvent) => void;

// 主题模式类型
export type ThemeMode = 'light' | 'dark';
