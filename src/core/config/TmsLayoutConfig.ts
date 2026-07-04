/**
 * TMS运输管理系统布局配置
 * 统一管理TMS架构图的布局参数和样式配置
 */

import { safeLog } from '../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../utils/logSecurity';

export interface TmsLayoutConfig {
  // 主线流程配置
  MAIN_FLOW: {
    SPACING_H: number;  // 主线节点水平间距
    SPACING_V: number;  // 垂直间距
    START_X: number;    // 起始X坐标
    START_Y: number;    // 起始Y坐标
  };
  
  // 支撑系统配置
  SUPPORT: {
    OFFSET_Y: number;   // 支撑系统垂直偏移
    SPACING_H: number;  // 支撑系统水平间距
  };
  
  // 外部系统配置
  EXTERNAL: {
    TOP_Y: number;      // 上游系统Y坐标
    BOTTOM_Y: number;   // 下游系统Y坐标
  };
}

/**
 * 默认TMS布局配置
 */
export const DEFAULT_TMS_LAYOUT_CONFIG: TmsLayoutConfig = {
  // 主线流程间距
  MAIN_FLOW: {
    SPACING_H: 360,  // 主线节点水平间距（加大以容纳更丰富内容）
    SPACING_V: 160,  // 垂直间距
    START_X: 150,    // 起始X坐标
    START_Y: 220,    // 起始Y坐标
  },
  
  // 支撑系统配置
  SUPPORT: {
    OFFSET_Y: 220,   // 支撑系统垂直偏移（加大以拉开与主流程距离）
    SPACING_H: 220,  // 支撑系统水平间距
  },
  
  // 外部系统配置
  EXTERNAL: {
    TOP_Y: 50,       // 上游系统Y坐标
    BOTTOM_Y: 560,   // 下游系统Y坐标
  }
};

const cloneConfig = (config: TmsLayoutConfig): TmsLayoutConfig => ({
  MAIN_FLOW: { ...config.MAIN_FLOW },
  SUPPORT: { ...config.SUPPORT },
  EXTERNAL: { ...config.EXTERNAL }
});

const MAX_TMS_LAYOUT_CONFIG_JSON_LENGTH = 2 * 1024 * 1024;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const assertFiniteNumber = (
  value: unknown,
  path: string,
  bounds: { min: number; max: number }
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${path} value`);
  }
  if (value < bounds.min || value > bounds.max) {
    throw new Error(`${path} must be between ${bounds.min} and ${bounds.max}`);
  }
  return value;
};

const coerceCompleteConfig = (value: unknown): TmsLayoutConfig => {
  if (!isPlainObject(value) || !isPlainObject(value.MAIN_FLOW) || !isPlainObject(value.SUPPORT) || !isPlainObject(value.EXTERNAL)) {
    throw new Error('Invalid TMS layout config structure');
  }

  return {
    MAIN_FLOW: {
      SPACING_H: assertFiniteNumber(value.MAIN_FLOW.SPACING_H, 'MAIN_FLOW.SPACING_H', { min: 1, max: 5000 }),
      SPACING_V: assertFiniteNumber(value.MAIN_FLOW.SPACING_V, 'MAIN_FLOW.SPACING_V', { min: 1, max: 5000 }),
      START_X: assertFiniteNumber(value.MAIN_FLOW.START_X, 'MAIN_FLOW.START_X', { min: -10000, max: 10000 }),
      START_Y: assertFiniteNumber(value.MAIN_FLOW.START_Y, 'MAIN_FLOW.START_Y', { min: -10000, max: 10000 }),
    },
    SUPPORT: {
      OFFSET_Y: assertFiniteNumber(value.SUPPORT.OFFSET_Y, 'SUPPORT.OFFSET_Y', { min: -10000, max: 10000 }),
      SPACING_H: assertFiniteNumber(value.SUPPORT.SPACING_H, 'SUPPORT.SPACING_H', { min: 1, max: 5000 }),
    },
    EXTERNAL: {
      TOP_Y: assertFiniteNumber(value.EXTERNAL.TOP_Y, 'EXTERNAL.TOP_Y', { min: -10000, max: 10000 }),
      BOTTOM_Y: assertFiniteNumber(value.EXTERNAL.BOTTOM_Y, 'EXTERNAL.BOTTOM_Y', { min: -10000, max: 10000 }),
    }
  };
};

/**
 * TMS布局配置管理器
 */
export class TmsLayoutConfigManager {
  private static instance: TmsLayoutConfigManager;
  private config: TmsLayoutConfig;

  private constructor() {
    this.config = cloneConfig(DEFAULT_TMS_LAYOUT_CONFIG);
  }

  public static getInstance(): TmsLayoutConfigManager {
    if (!TmsLayoutConfigManager.instance) {
      TmsLayoutConfigManager.instance = new TmsLayoutConfigManager();
    }
    return TmsLayoutConfigManager.instance;
  }

  /**
   * 获取当前配置
   */
  public getConfig(): TmsLayoutConfig {
    return cloneConfig(this.config);
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<TmsLayoutConfig>): void {
    const nextConfig = {
      ...this.config,
      ...newConfig,
      MAIN_FLOW: { ...this.config.MAIN_FLOW, ...newConfig.MAIN_FLOW },
      SUPPORT: { ...this.config.SUPPORT, ...newConfig.SUPPORT },
      EXTERNAL: { ...this.config.EXTERNAL, ...newConfig.EXTERNAL }
    };
    this.config = coerceCompleteConfig(nextConfig);
  }

  /**
   * 重置为默认配置
   */
  public resetToDefault(): void {
    this.config = cloneConfig(DEFAULT_TMS_LAYOUT_CONFIG);
  }

  /**
   * 导出配置
   */
  public exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * 导入配置
   */
  public importConfig(configJson: string): boolean {
    try {
      if (configJson.length > MAX_TMS_LAYOUT_CONFIG_JSON_LENGTH) {
        throw new Error('TMS layout config JSON is too large.');
      }
      const importedConfig = coerceCompleteConfig(JSON.parse(configJson));
      this.config = importedConfig;
      return true;
    } catch (error) {
      safeLog.error('Failed to import TMS layout config:', redactSensitiveLogValue(error));
      return false;
    }
  }
}

// 导出单例实例
export const tmsLayoutConfigManager = TmsLayoutConfigManager.getInstance();

// 便捷导出
export const getTmsLayoutConfig = () => tmsLayoutConfigManager.getConfig();
export const updateTmsLayoutConfig = (config: Partial<TmsLayoutConfig>) => 
  tmsLayoutConfigManager.updateConfig(config);
