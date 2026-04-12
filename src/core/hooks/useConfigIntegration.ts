// @ts-nocheck
/**
 * 配置集成 Hook
 * 为组件提供统一的配置和主题管理接口
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ConfigIntegration, IntegrationOptions, createConfigIntegration } from '../config/ConfigIntegration';
import { LayeredConfigManager, ConfigLayer } from '../config/LayeredConfigManager';
import { EnhancedThemeManager } from '../themes/EnhancedThemeManager';
import type { Theme } from '../themes/Theme';
import { ThemePresetManager } from '../themes/ThemePresetManager';
import { ThemePerformanceOptimizer } from '../themes/ThemePerformanceOptimizer';
import { diagramConfigManager } from '../components/config/DiagramConfig';

export interface ConfigIntegrationOptions {
  enableMigration?: boolean;
  enableValidation?: boolean;
  enablePerformanceOptimization?: boolean;
  autoInitialize?: boolean;
}

export interface ConfigIntegrationState {
  integration: ConfigIntegration | null;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  status: {
    layeredConfigReady: boolean;
    themeSystemReady: boolean;
    validationReady: boolean;
    performanceOptimizerReady: boolean;
    migrationComplete: boolean;
  };
}

export interface ConfigIntegrationActions {
  initialize: () => Promise<void>;
  reset: () => Promise<void>;
  exportConfig: () => Promise<any>;
  importConfig: (config: any) => Promise<void>;
  setConfig: (key: string, value: any, layer?: ConfigLayer) => Promise<void>;
  removeConfig: (key: string, layer?: ConfigLayer) => Promise<void>;
  getConfig: (key: string) => Promise<any>;
  setTheme: (themeId: string) => Promise<void>;
  getCurrentTheme: () => Theme | null;
  getPerformanceMetrics: () => any;
}

/**
 * 配置集成 Hook
 */
export function useConfigIntegration(
  options: ConfigIntegrationOptions = {}
): [ConfigIntegrationState, ConfigIntegrationActions] {
  const {
    enableMigration = true,
    enableValidation = true,
    enablePerformanceOptimization = true,
    autoInitialize = true,
  } = options;

  const [state, setState] = useState<ConfigIntegrationState>({
    integration: null,
    isReady: false,
    isLoading: false,
    error: null,
    status: {
      layeredConfigReady: false,
      themeSystemReady: false,
      validationReady: false,
      performanceOptimizerReady: false,
      migrationComplete: false,
    },
  });

  const initialize = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const integration = await createConfigIntegration(diagramConfigManager, {
        enableMigration,
        enableValidation,
        enablePerformanceOptimization,
        preserveExistingConfig: true,
        migrationStrategy: 'gradual',
      });

      const status = integration.getStatus();

      setState(prev => ({
        ...prev,
        integration,
        isReady: integration.isReady(),
        isLoading: false,
        status,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('ConfigIntegration initialization failed:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      console.error('Failed to initialize ConfigIntegration:', error);
    }
  }, [enableMigration, enableValidation, enablePerformanceOptimization]);

  // 重置函数
  const reset = useCallback(async () => {
    if (!state.integration) {
      throw new Error('ConfigIntegration not initialized');
    }

    try {
      await state.integration.resetToDefaults();
    } catch (error) {
      console.error('Failed to reset configuration:', error);
      throw error;
    }
  }, [state.integration]);

  // 导出配置
  const exportConfig = useCallback(async () => {
    if (!state.integration) {
      throw new Error('ConfigIntegration not initialized');
    }

    try {
      return await state.integration.exportIntegratedConfig();
    } catch (error) {
      console.error('Failed to export configuration:', error);
      throw error;
    }
  }, [state.integration]);

  // 导入配置
  const importConfig = useCallback(async (config: any) => {
    if (!state.integration) {
      throw new Error('ConfigIntegration not initialized');
    }

    try {
      await state.integration.importIntegratedConfig(config);
    } catch (error) {
      console.error('Failed to import configuration:', error);
      throw error;
    }
  }, [state.integration]);

  // 设置配置
  const setConfig = useCallback(async (key: string, value: any, layer: ConfigLayer = ConfigLayer.USER) => {
    if (!state.integration) {
      throw new Error('ConfigIntegration not initialized');
    }

    try {
      const layeredConfig = state.integration.getLayeredConfigManager();
      await layeredConfig.setConfig(key, value, layer);
    } catch (error) {
      console.error(`Failed to set config ${key}:`, error);
      throw error;
    }
  }, [state.integration]);

  // 删除配置
  const removeConfig = useCallback(async (key: string, layer: ConfigLayer = ConfigLayer.USER) => {
    if (!state.integration) {
      throw new Error('ConfigIntegration not initialized');
    }

    try {
      const layeredConfig = state.integration.getLayeredConfigManager();
      await layeredConfig.remove(key, layer);
    } catch (error) {
      console.error(`Failed to remove config ${key}:`, error);
      throw error;
    }
  }, [state.integration]);

  // 获取配置
  const getConfig = useCallback(async (key: string) => {
    if (!state.integration) {
      throw new Error('ConfigIntegration not initialized');
    }

    try {
      const layeredConfig = state.integration.getLayeredConfigManager();
      return await layeredConfig.getConfig(key);
    } catch (error) {
      console.error(`Failed to get config ${key}:`, error);
      throw error;
    }
  }, [state.integration]);

  // 设置主题
  /**
   * 设置当前主题（异步）
   * 函数级注释：
   * - 正确使用异步 EnhancedThemeManager.setTheme，确保等待主题加载与应用完成；
   * - 移除错误的布尔判断，setTheme 返回的是 Theme 而非 boolean；
   * - 抛出错误以便上层组件（如 EnhancedThemeSelector）捕获并提示。
   */
  const setTheme = useCallback(async (themeId: string) => {
    if (!state.integration) {
      throw new Error('ConfigIntegration not initialized');
    }

    try {
      const themeManager = state.integration.getThemeManager();
      await themeManager.setTheme(themeId);
    } catch (error) {
      console.error(`Failed to set theme ${themeId}:`, error);
      throw error;
    }
  }, [state.integration]);

  // 获取当前主题
  const getCurrentTheme = useCallback(() => {
    if (!state.integration) {
      return null;
    }

    try {
      const themeManager = state.integration.getThemeManager();
      return themeManager.getCurrentTheme() ?? null;
    } catch (error) {
      console.error('Failed to get current theme:', error);
      return null;
    }
  }, [state.integration]);

  // 获取性能指标
  const getPerformanceMetrics = useCallback(() => {
    if (!state.integration) {
      return null;
    }

    try {
      const optimizer = state.integration.getPerformanceOptimizer();
      return optimizer ? optimizer.getMetrics() : null;
    } catch (error) {
      console.error('Failed to get performance metrics:', error);
      return null;
    }
  }, [state.integration]);

  // 自动初始化 - 使用ref来避免死循环
  const initializeRef = useRef(initialize);
  initializeRef.current = initialize;

  useEffect(() => {
    if (autoInitialize && !state.integration && !state.isLoading) {
      initializeRef.current();
    }
  }, [autoInitialize, state.integration, state.isLoading]);

  // 清理资源
  useEffect(() => {
    return () => {
      if (state.integration) {
        state.integration.dispose();
      }
    };
  }, [state.integration]);

  const actions: ConfigIntegrationActions = useMemo(() => ({
    initialize,
    reset,
    exportConfig,
    importConfig,
    setConfig,
    removeConfig,
    getConfig,
    setTheme,
    getCurrentTheme,
    getPerformanceMetrics,
  }), [initialize, reset, exportConfig, importConfig, setConfig, removeConfig, getConfig, setTheme, getCurrentTheme, getPerformanceMetrics]);

  return [state, actions];
}

/**
 * 简化版配置集成 Hook
 * 只返回集成实例，适用于简单场景
 */
export function useSimpleConfigIntegration(
  options: ConfigIntegrationOptions = {}
): ConfigIntegration | null {
  const [state] = useConfigIntegration(options);
  return state.integration;
}

/**
 * 配置值 Hook
 * 监听特定配置项的变化
 */
export function useConfigValue<T = any>(
  key: string,
  defaultValue?: T,
  options: ConfigIntegrationOptions = {}
): [T | undefined, (value: T) => Promise<void>] {
  const [state, actions] = useConfigIntegration(options);
  const [value, setValue] = useState<T | undefined>(defaultValue);

  // 加载配置值
  useEffect(() => {
    if (state.isReady && state.integration) {
      actions.getConfig(key).then(configValue => {
        setValue(configValue !== undefined ? configValue : defaultValue);
      }).catch(error => {
        console.warn(`Failed to load config ${key}:`, error);
        setValue(defaultValue);
      });
    }
  }, [state.isReady, state.integration, key, defaultValue, actions]);

  // 监听配置变化
  useEffect(() => {
    if (!state.integration) return;

    const layeredConfig = state.integration.getLayeredConfigManager();
    const unsubscribe = layeredConfig.addListener(key, (event: any) => {
      // Use effectiveValue to respect layer priority (e.g. session > user)
      const newValue = event.effectiveValue !== undefined ? event.effectiveValue : defaultValue;
      setValue(newValue);
    });

    return unsubscribe;
  }, [state.integration, key, defaultValue]);

  // 设置配置值
  const setConfigValue = useCallback(async (newValue: T) => {
    await actions.setConfig(key, newValue);
    setValue(newValue);
  }, [actions, key]);

  return [value, setConfigValue];
}

/**
 * 主题 Hook
 * 监听主题变化
 */
export function useTheme(
  options: ConfigIntegrationOptions = {}
): [Theme | null, (themeId: string) => Promise<void>] {
  const [state, actions] = useConfigIntegration(options);
  const [theme, setTheme] = useState<Theme | null>(null);

  // 加载当前主题
  useEffect(() => {
    if (state.isReady && state.integration) {
      const currentTheme = actions.getCurrentTheme();
      setTheme(currentTheme);
    }
  }, [state.isReady, state.integration, actions]);

  // 监听主题变化
  useEffect(() => {
    if (!state.integration) return;

    const themeManager = state.integration.getThemeManager();
    const unsubscribe = themeManager.addThemeChangeListener((newTheme) => {
      setTheme(newTheme);
    });

    return unsubscribe;
  }, [state.integration]);

  return [theme, actions.setTheme];
}

/**
 * 性能指标 Hook
 */
export function usePerformanceMetrics(
  options: ConfigIntegrationOptions = {},
  intervalMs: number = 1000
): any {
  const [state, actions] = useConfigIntegration(options);
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    if (!state.isReady || !state.integration) return;

    const updateMetrics = () => {
      const currentMetrics = actions.getPerformanceMetrics();
      setMetrics((prev: any) => {
        // 简单的浅比较以避免不必要的重渲染
        if (!prev && !currentMetrics) return null;
        if (prev && currentMetrics &&
          Object.keys(prev).length === Object.keys(currentMetrics).length &&
          Object.keys(prev).every(k => prev[k] === currentMetrics[k])) {
          return prev;
        }
        return currentMetrics;
      });
    };

    // 初始加载
    updateMetrics();

    // 定期更新
    const interval = setInterval(updateMetrics, intervalMs);

    return () => clearInterval(interval);
  }, [state.isReady, state.integration, actions, intervalMs]);

  return metrics;
}
