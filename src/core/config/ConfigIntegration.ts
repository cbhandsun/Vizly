/**
 * 配置集成模块
 * 将新的分层配置系统与现有组件集成，提供平滑的迁移和兼容性
 */

import { LayeredConfigManager, ConfigLayer } from './LayeredConfigManager';
import type { LayeredConfigChangeEvent } from './LayeredConfigManager';
import { validators } from './ConfigValidation';
import { DiagramConfigManager } from '../components/config/DiagramConfig';
import type { CanvasConfig, DomainConfig, EdgeConfig, NodeConfig } from '../components/config/DiagramConfig';
import { EnhancedThemeManager } from '../themes/EnhancedThemeManager';
import { ThemePresetManager } from '../themes/ThemePresetManager';
import { ThemePerformanceOptimizer } from '../themes/ThemePerformanceOptimizer';
import { coerceThemeImport } from '../themes/themeImportSecurity';
import type { Theme, ThemePerformanceOptions, ThemePreset } from '../themes/types/ThemeTypes';

export interface IntegrationOptions {
  enableMigration: boolean;
  preserveExistingConfig: boolean;
  enableValidation: boolean;
  enablePerformanceOptimization: boolean;
  migrationStrategy: 'immediate' | 'gradual' | 'manual';
}

export interface MigrationResult {
  success: boolean;
  migratedConfigs: string[];
  errors: Array<{
    config: string;
    error: string;
  }>;
  warnings: string[];
}

export interface IntegrationStatus {
  layeredConfigReady: boolean;
  themeSystemReady: boolean;
  validationReady: boolean;
  performanceOptimizerReady: boolean;
  migrationComplete: boolean;
  errors: string[];
}

export interface IntegratedConfigExport {
  layeredConfig: string;
  themeConfig: Theme | undefined;
  presets: ThemePreset[];
  metadata: {
    exportTime: string;
    version: string;
    status: IntegrationStatus;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

// 配置迁移器
class ConfigMigrator {
  constructor(
    private layeredConfig: LayeredConfigManager,
    private diagramConfig: DiagramConfigManager
  ) { }

  private setConfigIfDefined(key: string, value: unknown): void {
    if (value !== undefined) {
      this.layeredConfig.setConfig(key, value, ConfigLayer.USER);
    }
  }

  /**
   * 迁移现有配置到分层系统
   */
  async migrateExistingConfig(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      migratedConfigs: [],
      errors: [],
      warnings: []
    };

    try {
      // 获取现有配置
      const existingConfig = this.diagramConfig.getConfig();

      // 迁移节点配置
      await this.migrateNodeConfig(existingConfig.node, result);

      // 迁移域配置
      await this.migrateDomainConfig(existingConfig.domain, result);

      // 迁移边缘配置
      await this.migrateEdgeConfig(existingConfig.edge, result);

      // 迁移画布配置
      await this.migrateCanvasConfig(existingConfig.canvas, result);

    } catch (error) {
      result.success = false;
      result.errors.push({
        config: 'global',
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return result;
  }

  private async migrateNodeConfig(nodeConfig: Partial<NodeConfig>, result: MigrationResult): Promise<void> {
    try {
      // 迁移节点样式配置
      this.setConfigIfDefined('diagram.node.minWidth', nodeConfig.minWidth);
      this.setConfigIfDefined('diagram.node.maxWidth', nodeConfig.maxWidth);
      this.setConfigIfDefined('diagram.node.height', nodeConfig.height);
      this.setConfigIfDefined('diagram.node.padding.horizontal', nodeConfig.padding?.horizontal);
      this.setConfigIfDefined('diagram.node.padding.vertical', nodeConfig.padding?.vertical);
      this.setConfigIfDefined('diagram.node.boxShadow', nodeConfig.boxShadow);
      this.setConfigIfDefined('diagram.node.font.size', nodeConfig.font?.size);

      result.migratedConfigs.push('node');
    } catch (error) {
      result.errors.push({
        config: 'node',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async migrateDomainConfig(domainConfig: Partial<DomainConfig>, result: MigrationResult): Promise<void> {
    try {
      this.setConfigIfDefined('diagram.domain.padding.horizontal', domainConfig.padding?.horizontal);
      this.setConfigIfDefined('diagram.domain.padding.vertical', domainConfig.padding?.vertical);
      this.setConfigIfDefined('diagram.domain.gap', domainConfig.gap);
      this.setConfigIfDefined('diagram.domain.sideSafeGap', domainConfig.sideSafeGap);
      this.setConfigIfDefined('diagram.domain.bottomSafeGap', domainConfig.bottomSafeGap);
      this.setConfigIfDefined('diagram.domain.title.height', domainConfig.title?.height);
      this.setConfigIfDefined('diagram.domain.title.safeGap', domainConfig.title?.safeGap);

      result.migratedConfigs.push('domain');
    } catch (error) {
      result.errors.push({
        config: 'domain',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async migrateEdgeConfig(edgeConfig: Partial<EdgeConfig>, result: MigrationResult): Promise<void> {
    try {
      this.setConfigIfDefined('diagram.edge.strokeWidth', edgeConfig.strokeWidth);
      this.setConfigIfDefined('diagram.edge.strokeDasharray', edgeConfig.strokeDasharray);
      this.setConfigIfDefined('diagram.edge.animated', edgeConfig.animated);
      this.setConfigIfDefined('diagram.edge.mode', edgeConfig.mode);
      this.setConfigIfDefined('diagram.edge.pathType', edgeConfig.pathType);

      result.migratedConfigs.push('edge');
    } catch (error) {
      result.errors.push({
        config: 'edge',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async migrateCanvasConfig(canvasConfig: Partial<CanvasConfig>, result: MigrationResult): Promise<void> {
    try {
      this.setConfigIfDefined('diagram.canvas.background', canvasConfig.background);
      this.setConfigIfDefined('diagram.canvas.grid.size', canvasConfig.grid?.size);
      this.setConfigIfDefined('diagram.canvas.grid.color', canvasConfig.grid?.color);
      this.setConfigIfDefined('diagram.canvas.grid.enabled', canvasConfig.grid?.enabled);

      result.migratedConfigs.push('canvas');
    } catch (error) {
      result.errors.push({
        config: 'canvas',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

// 配置同步器
class ConfigSynchronizer {
  private syncHandlers: Map<string, (value: unknown) => void> = new Map();

  constructor(
    private layeredConfig: LayeredConfigManager,
    private diagramConfig: DiagramConfigManager,
    private themeManager: EnhancedThemeManager
  ) {
    this.setupSyncHandlers();
  }

  /**
   * 设置同步处理器
   */
  private setupSyncHandlers(): void {
    /**
     * 全局监听器：同步分层配置到图表配置与主题系统（函数级注释）
     * - 修复问题：分层监听使用通配符 'diagram.*'/'theme.*' 不被 LayeredConfigManager 支持，导致同步未触发；
     * - 做法：改用全局监听器，按 key 前缀路由到对应的同步处理；
     * - 细节：使用 event.effectiveValue（优先）或 newValue，保证读取到合并后的有效值。
     */
    this.layeredConfig.addGlobalListener((event: LayeredConfigChangeEvent<unknown>) => {
      const key = event.key || '';
      const value = event.effectiveValue ?? event.newValue;
      if (key.startsWith('diagram.')) {
        this.syncToDiagramConfig(key, value);
      } else if (key.startsWith('theme.')) {
        this.syncToThemeManager(key, value);
      }
    });

    // 设置具体的同步处理器
    this.syncHandlers.set('diagram.node', this.syncNodeConfig.bind(this));
    this.syncHandlers.set('diagram.domain', this.syncDomainConfig.bind(this));
    this.syncHandlers.set('diagram.edge', this.syncEdgeConfig.bind(this));
    this.syncHandlers.set('diagram.canvas', this.syncCanvasConfig.bind(this));
    this.syncHandlers.set('diagram.layout', this.syncLayoutConfig.bind(this));
    this.syncHandlers.set('theme.current', this.syncCurrentTheme.bind(this));
  }

  /**
   * 路由并规范化配置值后同步至图表配置（函数级注释）
   * - 解析键路径：diagram.<category>.<prop>...；仅支持一级属性合并（如 edge.mode、edge.pathType）；
   * - 构造部分对象：将叶子值包裹为 { [prop]: value } 传递给对应的同步处理器；
   * - 作用：避免直接扩展原始值（数字/字符串）到对象导致无效合并。
   */
  private syncToDiagramConfig(key: string, value: unknown): void {
    const parts = String(key).split('.');
    if (parts[0] !== 'diagram' || parts.length < 2) return;
    const category = parts[1];
    const prop = parts[2];
    const handler = this.syncHandlers.get(`diagram.${category}`);
    if (!handler) return;
    const normalized = prop ? { [prop]: value } : value;
    handler(normalized);
  }

  private syncToThemeManager(key: string, value: unknown): void {
    const handler = this.syncHandlers.get(key);

    if (handler) {
      handler(value);
    }
  }

  private syncNodeConfig(value: unknown): void {
    if (!isRecord(value)) return;
    // 更新图表配置管理器中的节点配置
    const currentConfig = this.diagramConfig.getConfig();
    const updatedConfig = {
      ...currentConfig,
      node: { ...currentConfig.node, ...value }
    };

    this.diagramConfig.updateConfig(updatedConfig);
  }

  private syncDomainConfig(value: unknown): void {
    if (!isRecord(value)) return;
    const currentConfig = this.diagramConfig.getConfig();
    const updatedConfig = {
      ...currentConfig,
      domain: { ...currentConfig.domain, ...value }
    };

    this.diagramConfig.updateConfig(updatedConfig);
  }

  private syncEdgeConfig(value: unknown): void {
    if (!isRecord(value)) return;
    const currentConfig = this.diagramConfig.getConfig();
    const updatedConfig = {
      ...currentConfig,
      edge: { ...currentConfig.edge, ...value }
    };

    this.diagramConfig.updateConfig(updatedConfig);
  }

  private syncCanvasConfig(value: unknown): void {
    if (!isRecord(value)) return;
    const currentConfig = this.diagramConfig.getConfig();
    const updatedConfig = {
      ...currentConfig,
      canvas: { ...currentConfig.canvas, ...value }
    };

    this.diagramConfig.updateConfig(updatedConfig);
  }

  private syncLayoutConfig(value: unknown): void {
    if (!isRecord(value)) return;
    const currentConfig = this.diagramConfig.getConfig();
    const updatedConfig = {
      ...currentConfig,
      layout: { ...currentConfig.layout, ...value }
    };
    this.diagramConfig.updateConfig(updatedConfig);
  }

  private async syncCurrentTheme(themeId: unknown): Promise<void> {
    if (typeof themeId !== 'string' || !themeId.trim()) return;
    try {
      await this.themeManager.setTheme(themeId);
    } catch (error) {
      console.error('Failed to sync theme:', error);
    }
  }
}

// 主配置集成器
export class ConfigIntegration {
  private layeredConfig!: LayeredConfigManager; // 使用断言操作符，在initialize中初始化
  private validation: typeof validators;
  private themeManager!: EnhancedThemeManager; // 使用断言操作符，在initialize中初始化
  private presetManager!: ThemePresetManager; // 使用断言操作符，在initialize中初始化
  private performanceOptimizer!: ThemePerformanceOptimizer; // 使用断言操作符，在initialize中初始化
  private migrator!: ConfigMigrator; // 使用断言操作符，在initialize中初始化
  private synchronizer?: ConfigSynchronizer; // 可选属性，避免初始化错误
  private status: IntegrationStatus;

  private initializationPromise: Promise<void> | null = null;

  constructor(
    private diagramConfig: DiagramConfigManager,
    private options: IntegrationOptions
  ) {
    this.validation = validators; // 直接赋值validators对象
    this.status = {
      layeredConfigReady: false,
      themeSystemReady: false,
      validationReady: true, // 直接设置为true，因为validators已经可用
      performanceOptimizerReady: false,
      migrationComplete: false,
      errors: []
    };

    this.initializationPromise = this.initializeComponents();
  }

  /**
   * 初始化组件
   */
  private async initializeComponents(): Promise<void> {
    try {
      // 初始化分层配置管理器
      this.layeredConfig = LayeredConfigManager.getInstance(); // 使用单例实例
      // LayeredConfigManager是单例，不需要initialize方法
      this.status.layeredConfigReady = true;

      // 初始化主题系统
      // 主题管理器接收局部配置对象，避免传入LayeredConfigManager实例
      this.themeManager = new EnhancedThemeManager();

      // 验证主题管理器是否正确初始化
      const currentTheme = this.themeManager.getCurrentTheme();

      // 启用域别名增强（为缺失的细分后端域与常用别名生成派生颜色）
      try {
        this.themeManager.setDomainAugmentationEnabled(true);
        // 重新应用当前主题以使增强生效
        const currentId = currentTheme?.id || 'light';
        await this.themeManager.setTheme(currentId);
      } catch (e) {
        console.warn('Failed to enable domain augmentation, continuing:', e);
      }

      this.presetManager = new ThemePresetManager(this.layeredConfig);

      this.status.themeSystemReady = true;

      // 初始化性能优化器
      if (this.options.enablePerformanceOptimization) {
        try {
          const performanceOptions = await this.layeredConfig.getConfig<Partial<ThemePerformanceOptions>>('theme.performance');

          // 提供默认的性能配置，防止undefined错误
          const defaultPerformanceOptions = {
            enableTransitions: true,
            transitionDuration: 300,
            batchUpdates: true,
            debounceDelay: 100,
            cacheThemes: true,
            preloadThemes: ['light', 'dark']
          };

          const finalPerformanceOptions: ThemePerformanceOptions = performanceOptions ?
            { ...defaultPerformanceOptions, ...performanceOptions } :
            defaultPerformanceOptions;

          this.performanceOptimizer = new ThemePerformanceOptimizer(finalPerformanceOptions);
          this.status.performanceOptimizerReady = true;
        } catch (error) {
          console.warn('Performance optimizer initialization failed, continuing without it:', error);
          this.status.performanceOptimizerReady = true; // 设置为true以避免阻塞
        }
      } else {
        this.status.performanceOptimizerReady = true; // 如果不启用，直接设置为true
      }

      // 初始化迁移器和同步器
      this.migrator = new ConfigMigrator(this.layeredConfig, this.diagramConfig);
      this.synchronizer = new ConfigSynchronizer(
        this.layeredConfig,
        this.diagramConfig,
        this.themeManager
      );

      // 执行迁移
      if (this.options.enableMigration) {
        await this.performMigration();
      } else {
        this.status.migrationComplete = true; // 如果不启用迁移，直接设置为完成
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.status.errors.push(errorMessage);
      console.error('ConfigIntegration initialization failed:', error);
    }
  }

  /**
   * 执行配置迁移
   */
  private async performMigration(): Promise<void> {
    try {
      const migrationResult = await this.migrator.migrateExistingConfig();

      if (migrationResult.success) {
        this.status.migrationComplete = true;
      } else {
        this.status.errors.push(...migrationResult.errors.map(e => e.error));
        console.warn('Configuration migration completed with errors:', migrationResult);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.status.errors.push(`Migration failed: ${errorMessage}`);
      console.error('Configuration migration failed:', error);
    }
  }

  /**
   * 获取分层配置管理器
   */
  getLayeredConfigManager(): LayeredConfigManager {
    return this.layeredConfig;
  }

  /**
   * 获取增强主题管理器
   */
  getThemeManager(): EnhancedThemeManager {
    return this.themeManager;
  }

  /**
   * 获取主题预设管理器
   */
  getPresetManager(): ThemePresetManager {
    return this.presetManager;
  }

  /**
   * 获取性能优化器
   */
  getPerformanceOptimizer(): ThemePerformanceOptimizer | undefined {
    return this.performanceOptimizer;
  }

  /**
   * 获取验证器
   */
  getValidation(): typeof validators | undefined {
    return this.validation;
  }

  /**
   * 获取集成状态
   */
  getStatus(): IntegrationStatus {
    return { ...this.status };
  }

  /**
   * 检查是否准备就绪
   */
  isReady(): boolean {
    return this.status.layeredConfigReady &&
      this.status.themeSystemReady &&
      (!this.options.enableValidation || this.status.validationReady) &&
      (!this.options.enablePerformanceOptimization || this.status.performanceOptimizerReady) &&
      (!this.options.enableMigration || this.status.migrationComplete);
  }

  /**
   * 等待准备就绪
   */
  async waitForReady(timeout: number = 10000): Promise<boolean> {

    // 首先等待初始化完成
    if (this.initializationPromise) {
      try {
        await this.initializationPromise;
      } catch (error) {
        console.error('Initialization failed:', error);
        return false;
      }
    }

    const startTime = Date.now();

    while (!this.isReady() && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const ready = this.isReady();
    return ready;
  }

  /**
   * 导出集成配置
   */
  async exportIntegratedConfig(): Promise<IntegratedConfigExport> {
    const layeredConfig = await this.layeredConfig.exportConfig();
    const themeConfig = this.themeManager.getCurrentTheme();
    const presetsJson = this.presetManager.exportThemePackage(
      this.presetManager.getAllPresets().map(p => p.id),
      { name: 'All Presets' }
    );
    const parsedPresets = presetsJson ? JSON.parse(presetsJson) : null;
    const presets = isRecord(parsedPresets) && Array.isArray(parsedPresets.presets)
      ? parsedPresets.presets as ThemePreset[]
      : [];

    return {
      layeredConfig,
      themeConfig,
      presets,
      metadata: {
        exportTime: new Date().toISOString(),
        version: '1.0.0',
        status: this.getStatus()
      }
    };
  }

  /**
   * 导入集成配置
   */
  async importIntegratedConfig(config: unknown): Promise<void> {
    try {
      if (!isRecord(config)) {
        throw new Error('Integrated configuration must be an object');
      }

      // 导入分层配置
      if (typeof config.layeredConfig === 'string') {
        await this.layeredConfig.importConfig(config.layeredConfig);
      }

      // 导入主题配置
      if (config.themeConfig) {
        const theme = coerceThemeImport(config.themeConfig);
        if (theme?.id) {
          this.themeManager.addCustomTheme(theme);
          await this.themeManager.setTheme(theme.id);
        }
      }

      // 导入预设
      if (config.presets !== undefined) {
        if (!Array.isArray(config.presets)) {
          throw new Error('Integrated configuration presets must be an array');
        }
        await this.presetManager.importThemePackage({
          version: '1.0',
          name: 'Imported Presets',
          presets: config.presets
        });
      }
    } catch (error) {
      console.error('Failed to import integrated configuration:', error);
      throw error;
    }
  }

  /**
   * 重置到默认配置
   */
  async resetToDefaults(): Promise<void> {
    try {
      await this.layeredConfig.resetLayer(ConfigLayer.USER);
      // 重置主题到默认值
      this.themeManager.setTheme('light');
    } catch (error) {
      console.error('Failed to reset configuration:', error);
      throw error;
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.performanceOptimizer?.dispose();
    // LayeredConfigManager 不需要dispose，它是单例
    this.themeManager?.dispose();
  }
}

// 全局单例管理
let globalConfigIntegration: ConfigIntegration | null = null;
let initializationPromise: Promise<ConfigIntegration> | null = null;

// 工厂函数
export async function createConfigIntegration(
  diagramConfig: DiagramConfigManager,
  options: Partial<IntegrationOptions> = {}
): Promise<ConfigIntegration> {
  // 如果已经有实例，直接返回
  if (globalConfigIntegration) {
    // 确保实例已经完全初始化
    await globalConfigIntegration.waitForReady();
    return globalConfigIntegration;
  }

  // 如果正在初始化，等待初始化完成
  if (initializationPromise) {
    return initializationPromise;
  }

  const defaultOptions: IntegrationOptions = {
    enableMigration: true,
    preserveExistingConfig: true,
    enableValidation: true,
    enablePerformanceOptimization: true,
    migrationStrategy: 'gradual'
  };

  const finalOptions = { ...defaultOptions, ...options };

  // 创建初始化Promise
  initializationPromise = (async () => {
    try {
      const integration = new ConfigIntegration(diagramConfig, finalOptions);



      // 等待初始化完成
      const ready = await integration.waitForReady();

      if (ready) {
        globalConfigIntegration = integration;
        return integration;
      } else {
        throw new Error('ConfigIntegration initialization timeout');
      }
    } catch (error) {
      // 重置状态，允许重试
      initializationPromise = null;
      globalConfigIntegration = null;
      throw error;
    } finally {
      // 清理初始化Promise
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}

// 获取全局实例
export function getConfigIntegration(): ConfigIntegration | null {
  return globalConfigIntegration;
}

// 重置全局实例（用于测试或重新初始化）
export function resetConfigIntegration(): void {
  if (globalConfigIntegration) {
    globalConfigIntegration.dispose();
    globalConfigIntegration = null;
  }
  initializationPromise = null;
}
