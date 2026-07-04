/**
 * 主题管理器配置
 * 提供主题管理器的配置选项和工具函数
 */

import { 
  _Theme, 
  _ThemePreset, 
  ThemeTransition, 
  ThemePerformanceOptions 
} from './types/ThemeTypes';
import {
  logThemeManagerConfigInvalidMaxCacheSize,
  logThemeManagerConfigInvalidPreloadDelay,
  logThemeManagerConfigMissingKey,
  logThemeManagerConfigValidationFallback,
} from './themeInfrastructureLogging';

/**
 * 主题管理器配置接口
 */
export interface ThemeManagerConfig {
  // 默认主题ID
  defaultThemeId: string;
  
  // 是否启用主题过渡动画
  enableTransitions: boolean;
  
  // 主题过渡配置
  transition: ThemeTransition;
  
  // 性能选项
  performance: ThemePerformanceOptions;
  
  // 调试模式
  debug: boolean;
  
  // 主题加载失败时的回退主题ID
  fallbackThemeId: string;
  
  // 自动保存自定义主题
  autoSaveCustomThemes: boolean;
  
  // 主题变更事件防抖延迟（毫秒）
  themeChangeDebounceDelay: number;
}

/**
 * 默认主题管理器配置
 */
export const DEFAULT_THEME_MANAGER_CONFIG: ThemeManagerConfig = {
  defaultThemeId: 'light',
  enableTransitions: true,
  transition: {
    enabled: true,
    duration: 300,
    easing: 'ease-in-out'
  },
  performance: {
    cacheThemes: true,
    lazyLoad: true,
    preloadDelay: 1000,
    maxCacheSize: 50 * 1024 * 1024 // 50MB
  },
  debug: false,
  fallbackThemeId: 'light',
  autoSaveCustomThemes: true,
  themeChangeDebounceDelay: 100
};

/**
 * 主题管理器配置工具类
 */
export class ThemeManagerConfigUtil {
  private config: ThemeManagerConfig;
  
  constructor(config: Partial<ThemeManagerConfig> = {}) {
    this.config = { ...DEFAULT_THEME_MANAGER_CONFIG, ...config };
  }
  
  /**
   * 获取完整配置
   */
  getConfig(): ThemeManagerConfig {
    return { ...this.config };
  }
  
  /**
   * 更新配置
   */
  updateConfig(updates: Partial<ThemeManagerConfig>): void {
    this.config = { ...this.config, ...updates };
  }
  
  /**
   * 获取指定配置项
   */
  get<K extends keyof ThemeManagerConfig>(key: K): ThemeManagerConfig[K] {
    return this.config[key];
  }
  
  /**
   * 设置指定配置项
   */
  set<K extends keyof ThemeManagerConfig>(key: K, value: ThemeManagerConfig[K]): void {
    this.config[key] = value;
  }
  
  /**
   * 重置为默认配置
   */
  reset(): void {
    this.config = { ...DEFAULT_THEME_MANAGER_CONFIG };
  }
  
  /**
   * 验证配置有效性
   */
  validate(): boolean {
    const requiredKeys: (keyof ThemeManagerConfig)[] = [
      'defaultThemeId',
      'fallbackThemeId',
      'enableTransitions',
      'transition',
      'performance'
    ];
    
    for (const key of requiredKeys) {
      if (this.config[key] === undefined || this.config[key] === null) {
        logThemeManagerConfigMissingKey(String(key));
        return false;
      }
    }
    
    // 验证性能选项
    const { performance } = this.config;
    if (performance.preloadDelay < 0) {
      logThemeManagerConfigInvalidPreloadDelay();
      return false;
    }
    
    if (performance.maxCacheSize <= 0) {
      logThemeManagerConfigInvalidMaxCacheSize();
      return false;
    }
    
    return true;
  }
  
  /**
   * 获取调试信息
   */
  getDebugInfo(): object {
    return {
      config: this.config,
      cacheSize: this.getCacheSize(),
      isValid: this.validate()
    };
  }
  
  /**
   * 获取缓存大小（字节）
   */
  private getCacheSize(): number {
    // 这里可以实现实际的缓存大小计算
    // 现在返回一个估算值
    return JSON.stringify(this.config).length;
  }
}

/**
 * 创建主题管理器配置
 */
export function createThemeManagerConfig(
  config: Partial<ThemeManagerConfig> = {}
): ThemeManagerConfig {
  const configUtil = new ThemeManagerConfigUtil(config);
  
  if (!configUtil.validate()) {
    logThemeManagerConfigValidationFallback();
    configUtil.reset();
  }
  
  return configUtil.getConfig();
}
