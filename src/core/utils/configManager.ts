import { DiagramConfig } from '../types/common';

/**
 * 统一配置管理器
 * 整合所有图表的配置，避免重复定义
 */

// 基础配置常量
export const BASE_CONFIG = {
  // 画布尺寸
  CANVAS: {
    WIDTH: window.innerWidth * 0.9,
    HEIGHT: 2400,
    MIN_WIDTH: 1200,
    MIN_HEIGHT: 800,
  },
  
  // 节点尺寸
  NODE: {
    WIDTH: 280,
    HEIGHT: 120,
    MIN_WIDTH: 200,
    MIN_HEIGHT: 80,
    TITLE_BAR_HEIGHT: 50,
  },
  
  // 间距配置
  SPACING: {
    HORIZONTAL: 100,
    VERTICAL: 120,
    GROUP_PADDING: { H: 40, V: 30 },
    SUB_GROUP_PADDING: { H: 20, V_TOP: 60, V_BOTTOM: 20 },
    LANE_PADDING: { X: 50, Y: 70 },
    MARGIN: 20,
  },
  
  // 层级间距
  GAPS: {
    MAIN_TO_SIDE: 60,
    LAYER_VERTICAL: 60,
    ROW_VERTICAL: 70,
    FOUNDATION: 40,
    COLUMN: 40,
  },
  
  // Z-Index 层级
  Z_INDEX: {
    BACKGROUND: 0,
    EDGE: 1,
    NODE: 2,
    GROUP: 3,
    SUBGROUP: 4,
    OVERLAY: 5,
  },
} as const;

// 特定架构的配置预设
export const ARCHITECTURE_CONFIGS = {
  // 物流架构配置
  LOGISTICS: {
    ...BASE_CONFIG,
    CANVAS: {
      ...BASE_CONFIG.CANVAS,
      WIDTH: window.innerWidth * 0.95,
      HEIGHT: 1800,
    },
    NODE: {
      ...BASE_CONFIG.NODE,
      HEIGHT: 140,
    },
    GAPS: {
      ...BASE_CONFIG.GAPS,
      LAYER_VERTICAL: 80,
      ROW_VERTICAL: 50,
    },
  },
  
  // WMS架构配置
  WMS: {
    ...BASE_CONFIG,
    CANVAS: {
      ...BASE_CONFIG.CANVAS,
      HEIGHT: 1600,
    },
    NODE: {
      ...BASE_CONFIG.NODE,
      HEIGHT: 130,
    },
    GAPS: {
      ...BASE_CONFIG.GAPS,
      LAYER_VERTICAL: 70,
    },
  },
  
  // TMS架构配置
  TMS: {
    ...BASE_CONFIG,
    CANVAS: {
      ...BASE_CONFIG.CANVAS,
      HEIGHT: 1600,
    },
    NODE: {
      ...BASE_CONFIG.NODE,
      HEIGHT: 130,
    },
    GAPS: {
      ...BASE_CONFIG.GAPS,
      LAYER_VERTICAL: 70,
    },
  },
  
  // 系统交互架构配置
  SYSTEMS_INTERACTION: {
    ...BASE_CONFIG,
    CANVAS: {
      ...BASE_CONFIG.CANVAS,
      HEIGHT: 2000,
    },
    NODE: {
      ...BASE_CONFIG.NODE,
      HEIGHT: 110,
    },
  },
} as const;

// 配置管理器类
export class ConfigManager {
  private static instance: ConfigManager;
  private configs: Map<string, DiagramConfig> = new Map();
  
  private constructor() {
    this.initializeDefaultConfigs();
  }
  
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }
  
  private initializeDefaultConfigs(): void {
    // 注册默认配置
    this.registerConfig('base', this.createDiagramConfig(BASE_CONFIG));
    this.registerConfig('logistics', this.createDiagramConfig(ARCHITECTURE_CONFIGS.LOGISTICS));
    this.registerConfig('wms', this.createDiagramConfig(ARCHITECTURE_CONFIGS.WMS));
    this.registerConfig('tms', this.createDiagramConfig(ARCHITECTURE_CONFIGS.TMS));
    this.registerConfig('systems-interaction', this.createDiagramConfig(ARCHITECTURE_CONFIGS.SYSTEMS_INTERACTION));
  }
  
  private createDiagramConfig(config: any): DiagramConfig {
    return {
      NODE_WIDTH: config.NODE.WIDTH,
      NODE_HEIGHT: config.NODE.HEIGHT,
      SPACING: {
        H: config.SPACING.HORIZONTAL,
        V: config.SPACING.VERTICAL,
      },
      GROUP_PADDING: config.SPACING.GROUP_PADDING.H,
      TITLE_BAR_HEIGHT: config.NODE.TITLE_BAR_HEIGHT,
    };
  }
  
  public registerConfig(name: string, config: DiagramConfig): void {
    this.configs.set(name, config);
  }
  
  public getConfig(name: string): DiagramConfig | undefined {
    return this.configs.get(name);
  }
  
  public getConfigOrDefault(name: string): DiagramConfig {
    return this.getConfig(name) || this.getConfig('base')!;
  }
  
  public getAllConfigs(): Map<string, DiagramConfig> {
    return new Map(this.configs);
  }
  
  public mergeConfig(baseName: string, overrides: Partial<DiagramConfig>): DiagramConfig {
    const baseConfig = this.getConfigOrDefault(baseName);
    return this.deepMerge(baseConfig, overrides);
  }
  
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
  
  public createCustomConfig(baseConfigName: string, customizations: Partial<DiagramConfig>): DiagramConfig {
    const baseConfig = this.getConfigOrDefault(baseConfigName);
    return this.deepMerge(baseConfig, customizations);
  }
}

// 导出单例实例
export const configManager = ConfigManager.getInstance();

// 便捷函数
export const getConfig = (name: string) => configManager.getConfigOrDefault(name);
export const createConfig = (baseName: string, overrides: Partial<DiagramConfig>) => 
  configManager.mergeConfig(baseName, overrides);
