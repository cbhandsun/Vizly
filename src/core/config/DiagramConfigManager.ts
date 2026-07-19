import { safeLog } from '../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../utils/logSecurity';
import { logUiStorageReadFailure, logUiStorageWriteFailure } from '../utils/uiStorageLogging';
import {
  cloneDiagramConfig,
  DIAGRAM_CONFIG_STORAGE_KEY,
  MAX_IMPORTED_DIAGRAM_CONFIG_CHARS,
  MAX_STORED_DIAGRAM_CONFIG_CHARS,
  mergeDiagramConfig,
  parseBoundedConfigJson,
  sanitizeConfigPatch
} from './DiagramConfigBoundary';
import { defaultConfig } from './DiagramConfigDefaults';
import type { DiagramConfig } from './DiagramConfigTypes';

/**
 * 配置管理器类
 */
export class DiagramConfigManager {
  private config: DiagramConfig;
  private listeners: Set<(config: DiagramConfig) => void> = new Set();

  constructor(initialConfig: DiagramConfig = defaultConfig) {
    const safeInitialConfig = sanitizeConfigPatch(initialConfig);
    this.config = mergeDiagramConfig(defaultConfig, safeInitialConfig);
    this.ensureMinGaps(this.config);
  }

  /**
   * 获取当前配置
   */
  public getConfig(): DiagramConfig {
    return cloneDiagramConfig(this.config);
  }

  /**
   * 更新配置
   */
  public updateConfig(updates: Partial<DiagramConfig>): void {
    const safeUpdates = sanitizeConfigPatch(updates);
    const nextConfig = mergeDiagramConfig(this.config, safeUpdates);
    this.ensureMinGaps(nextConfig);
    this.config = nextConfig;
    this.notifyListeners();
    this.saveConfigToStorage();
  }

  /**
   * 重置为默认配置
   */
  public resetToDefault(): void {
    this.config = cloneDiagramConfig(defaultConfig);
    this.ensureMinGaps(this.config);
    this.notifyListeners();
    this.saveConfigToStorage();
  }

  /**
   * 添加配置变更监听器
   */
  public addConfigChangeListener(listener: (config: DiagramConfig) => void): void {
    this.listeners.add(listener);
  }

  /**
   * 移除配置变更监听器
   */
  public removeConfigChangeListener(listener: (config: DiagramConfig) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getConfig());
      } catch (error) {
        safeLog.error('配置变更监听器执行失败:', redactSensitiveLogValue(error));
      }
    });
  }

  /**
   * 保存配置到本地存储
   */
  private saveConfigToStorage(): void {
    try {
      const configToSave = {
        ...this.config,
        // 排除主题相关的配置，因为这些会自动从主题管理器获取
        node: {
          ...this.config.node,
          font: undefined // 字体配置由主题管理
        },
        canvas: {
          ...this.config.canvas,
          background: undefined // 背景色由主题管理
        }
      };

      const serialized = JSON.stringify(configToSave);
      if (serialized.length > MAX_STORED_DIAGRAM_CONFIG_CHARS) {
        safeLog.warn('图表配置超过本地存储大小限制，跳过保存');
        return;
      }
      localStorage.setItem(DIAGRAM_CONFIG_STORAGE_KEY, serialized);
    } catch (error) {
      logUiStorageWriteFailure('DiagramConfigManager.saveConfigToStorage', DIAGRAM_CONFIG_STORAGE_KEY, error);
      safeLog.warn('无法保存配置到本地存储:', redactSensitiveLogValue(error));
    }
  }

  /**
   * 从本地存储加载配置
   */
  public loadConfigFromStorage(): void {
    try {
      const savedConfig = localStorage.getItem(DIAGRAM_CONFIG_STORAGE_KEY);
      if (savedConfig) {
        const parsedConfig = sanitizeConfigPatch(parseBoundedConfigJson(
          savedConfig,
          MAX_STORED_DIAGRAM_CONFIG_CHARS,
          '本地图表配置'
        ));
        // [FIX] Force markerEnd to 10x10 to override any stale values in localStorage
        if (parsedConfig.edge && parsedConfig.edge.markerEnd) {
          parsedConfig.edge.markerEnd.width = 10;
          parsedConfig.edge.markerEnd.height = 10;
        }
        this.updateConfig(parsedConfig);
        // 载入后已通过 updateConfig 规范化并保存
      }
    } catch (error) {
      logUiStorageReadFailure('DiagramConfigManager.loadConfigFromStorage', DIAGRAM_CONFIG_STORAGE_KEY, error);
      localStorage.removeItem(DIAGRAM_CONFIG_STORAGE_KEY);
      safeLog.warn('无法从本地存储加载配置:', redactSensitiveLogValue(error));
    }
  }

  /**
   * 函数级注释：确保关键间距不低于视觉安全下限
   * - 目的：防止因旧版配置或手动调校导致节点/域过于拥挤，保障基本可读性。
   * - 规则：
   *   - 节点水平/垂直间距不低于 48/36
   *   - 域间距不低于 48
   *   - 层间垂直间距不低于 48
   * - 调用时机：构造函数与每次 updateConfig 后。
   */
  private ensureMinGaps(config: DiagramConfig): void {
    const MIN_NODE_H_GAP = 48;
    const MIN_NODE_V_GAP = 36;
    const MIN_DOMAIN_GAP = 48;
    const MIN_LAYER_V_GAP = 48;

    if (!config.node.gap) {
      config.node.gap = { horizontal: MIN_NODE_H_GAP, vertical: MIN_NODE_V_GAP };
    } else {
      config.node.gap.horizontal = Math.max(config.node.gap.horizontal, MIN_NODE_H_GAP);
      config.node.gap.vertical = Math.max(config.node.gap.vertical, MIN_NODE_V_GAP);
    }

    if (typeof config.domain?.gap !== 'number' || isNaN(config.domain.gap) || config.domain.gap < MIN_DOMAIN_GAP) {
      config.domain.gap = MIN_DOMAIN_GAP;
    }

    if (typeof config.layout?.layerVerticalGap !== 'number' || isNaN(config.layout.layerVerticalGap) || config.layout.layerVerticalGap < MIN_LAYER_V_GAP) {
      config.layout.layerVerticalGap = MIN_LAYER_V_GAP;
    }
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
      const importedConfig = sanitizeConfigPatch(parseBoundedConfigJson(
        configJson,
        MAX_IMPORTED_DIAGRAM_CONFIG_CHARS,
        '导入图表配置'
      ));
      this.updateConfig(importedConfig);
      return true;
    } catch (error) {
      safeLog.error('配置导入失败:', redactSensitiveLogValue(error));
      return false;
    }
  }

  /**
   * 获取性能优化配置
   */
  public getPerformanceConfig(): DiagramConfig['performance'] {
    return this.getConfig().performance;
  }

  /**
   * 更新性能配置
   */
  public updatePerformanceConfig(updates: Partial<DiagramConfig['performance']>): void {
    this.updateConfig({
      performance: updates as DiagramConfig['performance']
    });
  }

  /**
   * 获取布局相关配置（用于LayoutOptimizer）
   */
  public getLayoutConfig(): {
    NODE_MIN_WIDTH: number;
    NODE_PADDING: { horizontal: number; vertical: number };
    NODE_H_GAP: number;
    NODE_V_GAP: number;
    GROUP_PADDING: { H: number; V: number };
    SUB_GROUP_PADDING: { H: number; V_TOP: number; V_BOTTOM: number };
    // 计算后的子分组标题顶部留白保底
    SUB_GROUP_TITLE_CLEARANCE: number;
    // 是否启用全局子分组标题留白保底
    ENSURE_SUB_GROUP_TITLE_CLEARANCE: boolean;
    // 新增域相关详细配置
    GROUP_TITLE_HEIGHT: number;
    GROUP_TITLE_SAFE_GAP: number;
    GROUP_SIDE_SAFE_GAP: number;
    GROUP_BOTTOM_SAFE_GAP: number;
    // 新增子域相关详细配置
    SUB_GROUP_TITLE_HEIGHT: number;
    SUB_GROUP_TITLE_SAFE_GAP: number;
    DOMAIN_H_GAP: number;
    BE_COLUMN_GAP: number;
    NODE_FONT_SIZE: number;
    NODE_FONT_FAMILY: string;
    NODE_FONT_WEIGHT: string;
  } {
    // 确保所有数值配置都是有效数字，防止 NaN 传播
    const safeNumber = (value: unknown, defaultValue: number): number => {
      return (typeof value === 'number' && !isNaN(value) && isFinite(value)) ? value : defaultValue;
    };

    const safeString = (value: unknown, defaultValue: string): string => {
      return (typeof value === 'string' && value.trim()) ? value : defaultValue;
    };

    return {
      NODE_MIN_WIDTH: safeNumber(this.config.node.minWidth, 120),
      NODE_PADDING: {
        horizontal: safeNumber(this.config.node.padding.horizontal, 20),
        vertical: safeNumber(this.config.node.padding.vertical, 14)
      },
      NODE_H_GAP: safeNumber(this.config.node.gap.horizontal, 120),
      NODE_V_GAP: safeNumber(this.config.node.gap.vertical, 60),
      GROUP_PADDING: {
        H: safeNumber(this.config.domain.padding.horizontal, 24),
        V: safeNumber(this.config.domain.padding.vertical, 16)
      },
      SUB_GROUP_PADDING: {
        H: safeNumber(this.config.subDomain.padding.horizontal, 18),
        V_TOP: safeNumber(this.config.subDomain.padding.top, 28),
        V_BOTTOM: safeNumber(this.config.subDomain.padding.bottom, 16)
      },
      SUB_GROUP_TITLE_CLEARANCE: Math.max(
        safeNumber(this.config.subDomain.padding.top, 28),
        Math.max(42, safeNumber(this.config.subDomain.title.height, 30)) + safeNumber(this.config.subDomain.title.safeGap, 16)
      ),
      ENSURE_SUB_GROUP_TITLE_CLEARANCE: ((): boolean => {
        const v = this.config.subDomain.ensureTitleClearance;
        return typeof v === 'boolean' ? v : true;
      })(),
      GROUP_TITLE_HEIGHT: safeNumber(this.config.domain.title.height, 48),
      GROUP_TITLE_SAFE_GAP: safeNumber(this.config.domain.title.safeGap, 8),
      GROUP_SIDE_SAFE_GAP: safeNumber(this.config.domain.sideSafeGap, 8),
      GROUP_BOTTOM_SAFE_GAP: safeNumber(this.config.domain.bottomSafeGap, 12),
      SUB_GROUP_TITLE_HEIGHT: safeNumber(this.config.subDomain.title.height, 30),
      SUB_GROUP_TITLE_SAFE_GAP: safeNumber(this.config.subDomain.title.safeGap, 16),
      DOMAIN_H_GAP: safeNumber(this.config.domain.gap, 40),
      BE_COLUMN_GAP: safeNumber(this.config.layout.mainColumnWidth, 300),
      NODE_FONT_SIZE: safeNumber(this.config.node.font.size, 28),
      NODE_FONT_FAMILY: safeString(this.config.node.font.family, '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif'),
      NODE_FONT_WEIGHT: safeString(this.config.node.font.weight, '400')
    };
  }

  /**
   * 公开方法：将当前配置规范化并同步写入 localStorage
   */
  public syncConfigToLocalStorage(): void {
    this.ensureMinGaps(this.config);
    this.saveConfigToStorage();
    this.notifyListeners();
  }
}

/**
 * 全局唯一的配置管理器实例
 */
export const diagramConfigManager = new DiagramConfigManager();
