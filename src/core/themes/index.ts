/**
 * 主题管理器入口文件
 * 提供主题管理的统一接口
 */

// 导出主题类型
export * from './types/ThemeTypes';

// 导出主题工具函数
export * from './ThemeUtils';

// 导出主题配置
export * from './ThemeManagerConfig';

// 导出主题预设加载器
export * from './ThemePresetLoader';

// 导出基础常量
export * from './constants/BaseConstants';

// 导出主题管理器 - 使用重命名的导出以兼容旧代码
export {
  EnhancedThemeManager,
  getThemeManager,
  disposeThemeManager,
  type ThemeManagerEvent,
  type ThemeManagerEventListener,
  type ThemeManagerEventType
} from './EnhancedThemeManagerRefactored';

// 导出主题管理器单例函数（兼容旧接口）
export { getThemeManager as getEnhancedThemeManager } from './EnhancedThemeManagerRefactored';
