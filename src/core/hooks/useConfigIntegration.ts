/**
 * 配置集成 Hook
 * 为组件提供统一的配置和主题管理接口
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ConfigIntegration, createConfigIntegration } from '../config/ConfigIntegration';
import type { IntegrationStatus } from '../config/ConfigIntegration';
import { ConfigLayer } from '../config/LayeredConfigManager';
import type { LayeredConfigChangeEvent } from '../config/LayeredConfigManager';
import type { Theme } from '../themes/types/ThemeTypes';
import type { PerformanceMetrics } from '../themes/ThemePerformanceOptimizer';
import { diagramConfigManager } from '../config/DiagramConfig';
import { safeLog } from '../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../utils/logSecurity';

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
  status: Omit<IntegrationStatus, 'errors'>;
}

export type IntegratedConfigExport = Awaited<ReturnType<ConfigIntegration['exportIntegratedConfig']>>;

export interface ConfigIntegrationActions {
  initialize: () => Promise<void>;
  reset: () => Promise<void>;
  exportConfig: () => Promise<IntegratedConfigExport>;
  importConfig: (config: unknown) => Promise<void>;
  setConfig: <T = unknown>(key: string, value: T, layer?: ConfigLayer) => Promise<void>;
  removeConfig: (key: string, layer?: ConfigLayer) => Promise<void>;
  getConfig: <T = unknown>(key: string) => Promise<T>;
  setTheme: (themeId: string) => Promise<void>;
  getCurrentTheme: () => Theme | null;
  getPerformanceMetrics: () => PerformanceMetrics | null;
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
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const initialize = useCallback(async () => {
    if (!mountedRef.current) return;
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

      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          integration,
          isReady: integration.isReady(),
          isLoading: false,
          status,
        }));
      }
      // The factory owns this application-wide service. A consumer that
      // unmounts during initialization must not dispose it for other consumers.
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      safeLog.error('ConfigIntegration initialization failed:', redactSensitiveLogValue(error));
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
      }
      safeLog.error('Failed to initialize ConfigIntegration:', redactSensitiveLogValue(error));
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
      safeLog.error('Failed to reset configuration:', redactSensitiveLogValue(error));
      throw error;
    }
  }, [state.integration]);

  // 导出配置
  const exportConfig = useCallback(async (): Promise<IntegratedConfigExport> => {
    if (!state.integration) {
      throw new Error('ConfigIntegration not initialized');
    }

    try {
      return await state.integration.exportIntegratedConfig();
    } catch (error) {
      safeLog.error('Failed to export configuration:', redactSensitiveLogValue(error));
      throw error;
    }
  }, [state.integration]);

  // 导入配置
  const importConfig = useCallback(async (config: unknown) => {
    if (!state.integration) {
      throw new Error('ConfigIntegration not initialized');
    }

    try {
      await state.integration.importIntegratedConfig(config);
    } catch (error) {
      safeLog.error('Failed to import configuration:', redactSensitiveLogValue(error));
      throw error;
    }
  }, [state.integration]);

  // 设置配置
  const setConfig = useCallback(async <T,>(key: string, value: T, layer: ConfigLayer = ConfigLayer.USER) => {
    if (!state.integration) {
      throw new Error('ConfigIntegration not initialized');
    }

    try {
      const layeredConfig = state.integration.getLayeredConfigManager();
      await layeredConfig.setConfig(key, value, layer);
    } catch (error) {
      safeLog.error(`Failed to set config ${key}:`, redactSensitiveLogValue(error));
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
      safeLog.error(`Failed to remove config ${key}:`, redactSensitiveLogValue(error));
      throw error;
    }
  }, [state.integration]);

  // 获取配置
  const getConfig = useCallback(async <T,>(key: string): Promise<T> => {
    if (!state.integration) {
      throw new Error('ConfigIntegration not initialized');
    }

    try {
      const layeredConfig = state.integration.getLayeredConfigManager();
      return await layeredConfig.getConfig<T>(key);
    } catch (error) {
      safeLog.error(`Failed to get config ${key}:`, redactSensitiveLogValue(error));
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
      safeLog.error(`Failed to set theme ${themeId}:`, redactSensitiveLogValue(error));
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
      safeLog.error('Failed to get current theme:', redactSensitiveLogValue(error));
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
      safeLog.error('Failed to get performance metrics:', redactSensitiveLogValue(error));
      return null;
    }
  }, [state.integration]);

  useEffect(() => {
    let cancelled = false;
    if (autoInitialize && !state.integration && !state.isLoading) {
      queueMicrotask(() => {
        if (!cancelled) void initialize();
      });
    }
    return () => {
      cancelled = true;
    };
  }, [autoInitialize, initialize, state.integration, state.isLoading]);

  // Consumers clean up their own subscriptions below; only the factory's
  // resetConfigIntegration boundary may dispose the shared service.

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
export function useConfigValue<T = unknown>(
  key: string,
  defaultValue?: T,
  options: ConfigIntegrationOptions = {}
): [T | undefined, (value: T) => Promise<void>] {
  const [state, actions] = useConfigIntegration(options);
  const [value, setValue] = useState<T | undefined>(defaultValue);

  // 加载配置值
  useEffect(() => {
    if (state.isReady && state.integration) {
      actions.getConfig<T>(key).then(configValue => {
        setValue(configValue !== undefined ? configValue : defaultValue);
      }).catch(error => {
        safeLog.warn(`Failed to load config ${key}:`, redactSensitiveLogValue(error));
        setValue(defaultValue);
      });
    }
  }, [state.isReady, state.integration, key, defaultValue, actions]);

  // 监听配置变化
  useEffect(() => {
    if (!state.integration) return;

    const layeredConfig = state.integration.getLayeredConfigManager();
    const unsubscribe = layeredConfig.addListener<T>(key, (event: LayeredConfigChangeEvent<T>) => {
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
    let cancelled = false;
    if (state.isReady && state.integration) {
      queueMicrotask(() => {
        if (!cancelled) setTheme(actions.getCurrentTheme());
      });
    }
    return () => {
      cancelled = true;
    };
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
): PerformanceMetrics | null {
  const [state, actions] = useConfigIntegration(options);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);

  useEffect(() => {
    if (!state.isReady || !state.integration) return;

    const updateMetrics = () => {
      const currentMetrics = actions.getPerformanceMetrics();
      setMetrics((prev) => {
        // 简单的浅比较以避免不必要的重渲染
        if (!prev && !currentMetrics) return null;
        if (prev && currentMetrics &&
          Object.keys(prev).length === Object.keys(currentMetrics).length &&
          (Object.keys(prev) as Array<keyof PerformanceMetrics>)
            .every(key => prev[key] === currentMetrics[key])) {
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
