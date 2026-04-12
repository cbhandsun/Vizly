/**
 * TMS运输管理系统布局配置
 * 统一管理TMS架构图的布局参数和样式配置
 */

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

/**
 * TMS布局配置管理器
 */
export class TmsLayoutConfigManager {
  private static instance: TmsLayoutConfigManager;
  private config: TmsLayoutConfig;

  private constructor() {
    this.config = { ...DEFAULT_TMS_LAYOUT_CONFIG };
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
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<TmsLayoutConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
      MAIN_FLOW: { ...this.config.MAIN_FLOW, ...newConfig.MAIN_FLOW },
      SUPPORT: { ...this.config.SUPPORT, ...newConfig.SUPPORT },
      EXTERNAL: { ...this.config.EXTERNAL, ...newConfig.EXTERNAL }
    };
  }

  /**
   * 重置为默认配置
   */
  public resetToDefault(): void {
    this.config = { ...DEFAULT_TMS_LAYOUT_CONFIG };
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
      const importedConfig = JSON.parse(configJson) as TmsLayoutConfig;
      this.validateConfig(importedConfig);
      this.config = importedConfig;
      return true;
    } catch (error) {
      console.error('Failed to import TMS layout config:', error);
      return false;
    }
  }

  /**
   * 验证配置有效性
   */
  private validateConfig(config: TmsLayoutConfig): void {
    if (!config.MAIN_FLOW || !config.SUPPORT || !config.EXTERNAL) {
      throw new Error('Invalid TMS layout config structure');
    }

    const requiredMainFlowKeys = ['SPACING_H', 'SPACING_V', 'START_X', 'START_Y'];
    const requiredSupportKeys = ['OFFSET_Y', 'SPACING_H'];
    const requiredExternalKeys = ['TOP_Y', 'BOTTOM_Y'];

    requiredMainFlowKeys.forEach(key => {
      if (typeof config.MAIN_FLOW[key as keyof typeof config.MAIN_FLOW] !== 'number') {
        throw new Error(`Invalid MAIN_FLOW.${key} value`);
      }
    });

    requiredSupportKeys.forEach(key => {
      if (typeof config.SUPPORT[key as keyof typeof config.SUPPORT] !== 'number') {
        throw new Error(`Invalid SUPPORT.${key} value`);
      }
    });

    requiredExternalKeys.forEach(key => {
      if (typeof config.EXTERNAL[key as keyof typeof config.EXTERNAL] !== 'number') {
        throw new Error(`Invalid EXTERNAL.${key} value`);
      }
    });
  }
}

// 导出单例实例
export const tmsLayoutConfigManager = TmsLayoutConfigManager.getInstance();

// 便捷导出
export const getTmsLayoutConfig = () => tmsLayoutConfigManager.getConfig();
export const updateTmsLayoutConfig = (config: Partial<TmsLayoutConfig>) => 
  tmsLayoutConfigManager.updateConfig(config);
