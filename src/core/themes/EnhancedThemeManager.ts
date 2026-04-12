/**
 * 增强主题管理器 - 兼容层
 * 
 * 这个文件提供对旧版 EnhancedThemeManager 的兼容支持，
 * 所有实际功能已迁移到 EnhancedThemeManagerRefactored
 */

// 从类型定义文件导出主题相关类型
export type {
  Theme,
  DiagramTheme,
  ThemeColor,
  ThemePalette,
  ThemeTypography,
  ThemeSpacing,
  ThemeBorderRadius,
  ThemeShadow,
  ThemeAnimation,
  DomainColors,
  EdgeColors,
  CanvasTheme,
  NodeTheme,
  ThemePreset,
  ThemeTransition,
  ThemePerformanceOptions
} from './types/ThemeTypes';

// 主题模式类型
export type ThemeMode = 'light' | 'dark';

export {
  // 主题管理器类
  EnhancedThemeManager,
  
  // 单例函数
  getThemeManager,
  disposeThemeManager,
  
  // 事件类型
  type ThemeManagerEvent,
  type ThemeManagerEventListener,
  type ThemeManagerEventType
} from './EnhancedThemeManagerRefactored';

// 从工具函数中导出主题相关函数
export {
  getThemeColor,
  getEdgeColor,
  themeToCSSVariables,
  applyCSSVariables,
  validateTheme
} from './ThemeUtils';

// 为了向后兼容，也导出原始的 EnhancedThemeManager 名称
export { EnhancedThemeManager as EnhancedThemeManagerOriginal } from './EnhancedThemeManagerRefactored';
