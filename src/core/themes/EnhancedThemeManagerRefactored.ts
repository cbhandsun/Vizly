/**
 * 增强主题管理器 - 重构版
 * 支持动态主题加载和管理
 */

import {
  Theme,
  ThemePreset,
  _ThemeTransition,
  _ThemePerformanceOptions,
  _ThemeEvent,
  _ThemeEventListener,
  _ThemeChangeEvent,
  _ThemePresetEvent,
  ThemeColor
} from './types/ThemeTypes';

import {
  ThemeManagerConfig,
  createThemeManagerConfig
} from './ThemeManagerConfig';

import {
  loadThemePreset,
  getAvailableThemeIds,
  preloadThemePreset,
  clearThemePresetCache,
  _getCachedThemePreset,
  _isThemePresetCached,
  getCacheStats
} from './ThemePresetLoader';

import { ConfigManager, ConfigSource } from '../config/ConfigManager';
import { validateTheme, themeToCSSVariables, applyCSSVariables, removeCSSVariables } from './ThemeUtils';
import { pickReadableTextColor } from '../utils/colorUtils';
import {
  logThemeManagerCustomThemesLoadFailure,
  logThemeManagerCustomThemesSaveFailure,
  logThemeManagerEmbeddedThemeLoadFailure,
  logThemeManagerFallbackFailure,
  logThemeManagerFallbackToBuiltIn,
  logThemeManagerInitializationFailure,
  logThemeManagerListenerFailure,
  logThemeManagerLoadFailure,
  logThemeManagerPreloadFailure,
} from './themeLogging';

/**
 * 主题管理器事件类型
 */
export type ThemeManagerEventType =
  | 'theme-changed'
  | 'theme-loading'
  | 'theme-loaded'
  | 'theme-loading-failed'
  | 'preset-added'
  | 'preset-removed'
  | 'preset-updated';

/**
 * 主题管理器事件
 */
export interface ThemeManagerEvent {
  type: ThemeManagerEventType;
  themeId?: string;
  error?: Error;
  oldTheme?: Theme;
  newTheme?: Theme;
  preset?: ThemePreset;
  source?: 'user' | 'system' | 'preset' | 'custom';
  timestamp?: number;
}

/**
 * 主题管理器事件监听器
 */
export type ThemeManagerEventListener = (event: ThemeManagerEvent) => void;

/**
 * 增强主题管理器类
 */
export class EnhancedThemeManager {
  private currentTheme: Theme | undefined = undefined;
  private currentThemeId: string = '';
  private config: ThemeManagerConfig;
  private configManager: ConfigManager;
  private listeners: Set<ThemeManagerEventListener> = new Set();
  private customThemes: Map<string, Theme> = new Map();
  private themeCache: Map<string, Theme> = new Map();
  private transitionTimeouts: Set<NodeJS.Timeout> = new Set();
  private isLoading: boolean = false;
  private loadingPromise: Promise<Theme> | null = null;

  /**
   * 函数级注释：normalizeDomainText
   * 目的：为主题中的各域补齐 `text` 字段，依据 `background|light|main` 的亮度选择白/深色。
   * 说明：返回新的 Theme 对象，不修改入参引用；在 applyTheme/getTheme 两处统一调用，保证首帧与后续切换一致。
   */
  private normalizeDomainText(t: Theme): Theme {
    try {
      const domains = t?.diagram?.domains || {};
      const newDomains: Record<string, any> = { ...domains } as any;
      Object.entries(domains).forEach(([key, color]: any) => {
        const bg = color?.background || color?.light || color?.main;
        const text = color?.text || pickReadableTextColor(String(bg || '#ffffff'), '#FFFFFF', '#111111');
        newDomains[key] = { ...color, text };
      });
      return { ...t, diagram: { ...(t.diagram || {}), domains: newDomains } } as Theme;
    } catch {
      return t;
    }
  }

  constructor(config?: Partial<ThemeManagerConfig>) {
    this.config = createThemeManagerConfig(config);
    this.configManager = ConfigManager.getInstance();
    this.initialize();
  }

  /**
   * 初始化主题管理器
   */
  private async initialize(): Promise<void> {

    try {
      // 加载保存的自定义主题
      await this.loadCustomThemes();

      // 获取默认主题ID
      const savedThemeId = this.configManager.get<string>('theme.currentId', '');
      const defaultThemeId = savedThemeId || this.config.defaultThemeId;


      // 加载默认主题
      await this.setTheme(defaultThemeId);

      // 预加载其他主题
      this.preloadOtherThemes();

    } catch (error) {
      logThemeManagerInitializationFailure(error);

      // 回退到内置主题
      await this.fallbackToBuiltInTheme();
    }
  }

  /**
   * 设置主题
   */
  async setTheme(themeId: string): Promise<Theme> {

    // 如果正在加载相同主题，返回当前加载的Promise
    if (this.isLoading && this.currentThemeId === themeId && this.loadingPromise) {
      return this.loadingPromise;
    }

    // 如果主题已缓存，直接使用
    if (this.themeCache.has(themeId)) {
      const cachedTheme = this.themeCache.get(themeId)!;
      this.applyTheme(cachedTheme, themeId);
      return Promise.resolve(cachedTheme);
    }

    // 开始加载主题
    this.isLoading = true;
    this.loadingPromise = this.loadTheme(themeId);

    try {
      const theme = await this.loadingPromise;
      await this.applyTheme(theme, themeId);
      return theme;
    } catch (error) {
      logThemeManagerLoadFailure(themeId, error);
      throw error;
    } finally {
      this.isLoading = false;
      this.loadingPromise = null;
    }
  }

  /**
   * 加载主题
   */
  private async loadTheme(themeId: string): Promise<Theme> {
    this.emitEvent({
      type: 'theme-loading',
      themeId,
      timestamp: Date.now()
    });

    try {
      // 首先检查自定义主题
      if (this.customThemes.has(themeId)) {
        const theme = this.customThemes.get(themeId)!;
        this.emitEvent({
          type: 'theme-loaded',
          themeId,
          newTheme: theme,
          timestamp: Date.now()
        });
        return theme;
      }

      // 然后尝试加载预设主题
      const preset = await loadThemePreset(themeId);
      if (preset) {
        const theme = preset.theme;

        // 缓存主题
        if (this.config.performance.cacheThemes) {
          this.themeCache.set(themeId, theme);
        }

        this.emitEvent({
          type: 'theme-loaded',
          themeId,
          newTheme: theme,
          timestamp: Date.now()
        });

        return theme;
      }

      // 如果预设不存在，尝试从数据中心(DataRegistry)提取内嵌的主题属性
      try {
        const { DataRegistry } = await import('../../data/DataRegistry');
        const dataService = DataRegistry.getInstance().getDataService();
        const result = await dataService.queryDiagrams({});
        const diagramWithTheme = result.data.find((d: any) => d.theme?.name === themeId);
        
        if (diagramWithTheme && diagramWithTheme.theme) {
          // 借用 light 预设作为基础主题拼装出一个完整的 Theme 对象
          const basePreset = await loadThemePreset('light');
          if (basePreset) {
            const customTheme = {
               ...basePreset.theme,
               id: themeId,
               name: diagramWithTheme.theme.displayName || themeId,
               diagram: {
                 ...basePreset.theme.diagram,
                 domains: {
                   ...basePreset.theme.diagram.domains,
                   ...diagramWithTheme.theme.domains
                 }
               }
            };
            this.addCustomTheme(customTheme as any);
            
            this.emitEvent({
              type: 'theme-loaded',
              themeId,
              newTheme: customTheme as any,
              timestamp: Date.now()
            });

            return customTheme as any;
          }
        }
      } catch (embErr) {
        logThemeManagerEmbeddedThemeLoadFailure(embErr);
      }

      throw new Error(`主题 "${themeId}" 不存在`);
    } catch (error) {
      this.emitEvent({
        type: 'theme-loading-failed',
        themeId,
        error: error as Error,
        timestamp: Date.now()
      });
      throw error;
    }
  }

  /**
   * 应用主题
   */
  private async applyTheme(theme: Theme, themeId: string): Promise<void> {
    const oldTheme = this.currentTheme;
    const oldThemeId = this.currentThemeId;

    try {
      // 验证主题
      if (!validateTheme(theme)) {
        throw new Error('主题验证失败');
      }

      /**
       * 函数级注释：normalizeDomainText
       * 输入：Theme
       * 输出：补齐各域 ThemeColor.text（按 background|light|main 的亮度选择白/深色）
       */
      const normalizedTheme = this.normalizeDomainText(theme);
      this.currentTheme = normalizedTheme;
      this.currentThemeId = themeId;

      // 保存当前主题ID
      this.configManager.set('theme.currentId', themeId, ConfigSource.USER_OVERRIDE);

      // 应用CSS变量到文档根元素
      const cssVariables = themeToCSSVariables(normalizedTheme);
      applyCSSVariables(document.documentElement, cssVariables);

      // 根据主题模式切换 Tailwind CSS 的 dark 类
      if (normalizedTheme.mode === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      /**
       * 触发主题变更事件（函数级注释）
       * 调整点：立即在应用 CSS 变量后派发 'theme-changed'，不再等待过渡动画完成。
       * 这样订阅该事件的组件（如 BaseDiagramComponent、SubGroupNode、TitleGroupNode）
       * 能够立刻拿到新主题并重渲染，实现“主题切换立马生效”的体验。
       */
      this.emitEvent({
        type: 'theme-changed',
        oldTheme,
        newTheme: normalizedTheme,
        themeId,
        source: 'user',
        timestamp: Date.now()
      });

      // 应用主题过渡动画（异步进行，不阻塞事件派发）
      if (this.config.enableTransitions && oldTheme) {
        // 不中断 UI 更新：动画在后台完成
        await this.applyThemeTransition(oldTheme, theme);
      }

    } catch (error) {
      // 回滚到之前的主题
      this.currentTheme = oldTheme;
      this.currentThemeId = oldThemeId;
      throw error;
    }
  }

  /**
   * 应用主题过渡动画
   */
  private async applyThemeTransition(_oldTheme: Theme, _newTheme: Theme): Promise<void> {
    return new Promise((resolve) => {
      const duration = this.config.transition.duration;

      // 应用CSS过渡动画

      const timeout = setTimeout(() => {
        resolve();
      }, duration);

      this.transitionTimeouts.add(timeout);
    });
  }

  /**
   * 获取当前主题
   */
  getCurrentTheme(): Theme | undefined {
    return this.currentTheme;
  }

  /**
   * 获取当前主题ID
   */
  getCurrentThemeId(): string {
    return this.currentThemeId;
  }

  /**
   * 获取主题
   */
  async getTheme(themeId: string): Promise<Theme | null> {
    if (this.themeCache.has(themeId)) {
      return this.normalizeDomainText(this.themeCache.get(themeId)!);
    }

    if (this.customThemes.has(themeId)) {
      return this.normalizeDomainText(this.customThemes.get(themeId)!);
    }

    const preset = await loadThemePreset(themeId);
    if (!preset) return null;
    const normalized = this.normalizeDomainText(preset.theme);
    if (this.config.performance.cacheThemes) {
      this.themeCache.set(themeId, normalized);
    }
    return normalized;
  }

  /**
   * 获取所有可用主题ID
   */
  getAvailableThemeIds(): string[] {
    const presetIds = getAvailableThemeIds();
    const customIds = Array.from(this.customThemes.keys());

    return [...new Set([...presetIds, ...customIds])];
  }

  /**
   * 获取仅预设主题的 ID 列表
   * 函数级注释：
   * - 返回来自预设加载器的主题ID，不包含任何通过 addCustomTheme() 添加的自定义主题；
   * - 适用于需要只展示官方预设的场景（如菜单、测试面板），避免“custom-*”混入导致混淆；
   * - 保持与主题系统的单一事实源一致，由 ThemePresetLoader 维护预设列表。
   */
  getAvailablePresetIds(): string[] {
    const presetIds = getAvailableThemeIds();
    return Array.from(new Set(presetIds));
  }

  /**
   * 添加自定义主题
   */
  addCustomTheme(theme: Theme): void {
    this.customThemes.set(theme.id, theme);

    if (this.config.performance.cacheThemes) {
      this.themeCache.set(theme.id, theme);
    }

    this.saveCustomThemes();

    this.emitEvent({
      type: 'preset-added',
      preset: {
        id: theme.id,
        name: theme.name,
        description: '自定义主题',
        category: 'custom',
        tags: ['custom'],
        theme
      },
      timestamp: Date.now()
    });
  }

  /**
   * 移除自定义主题
   */
  removeCustomTheme(themeId: string): boolean {
    const removed = this.customThemes.delete(themeId);
    if (removed) {
      this.themeCache.delete(themeId);
      this.saveCustomThemes();

      this.emitEvent({
        type: 'preset-removed',
        preset: {
          id: themeId,
          name: themeId,
          description: '自定义主题',
          category: 'custom',
          tags: ['custom'],
          theme: {} as Theme
        },
        timestamp: Date.now()
      });
    }
    return removed;
  }

  /**
   * 清空所有自定义主题
   * 函数级注释：
   * - 清空内存中的自定义主题映射与对应缓存；
   * - 持久化写入空数组到配置存储键 `theme.customThemes`；
   * - 不触发“preset-removed”逐条事件，避免造成大量事件风暴；
   * - 用于恢复纯预设主题列表或清理历史测试数据。
   */
  clearCustomThemes(): void {
    this.customThemes.clear();
    for (const key of Array.from(this.themeCache.keys())) {
      if (key.startsWith('custom-')) {
        this.themeCache.delete(key);
      }
    }
    this.saveCustomThemes();
  }

  /**
   * 添加事件监听器
   */
  addEventListener(listener: ThemeManagerEventListener): () => void {
    this.listeners.add(listener);

    // 返回取消订阅函数
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(listener: ThemeManagerEventListener): void {
    this.listeners.delete(listener);
  }

  /**
   * 触发事件
   */
  private emitEvent(event: ThemeManagerEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        logThemeManagerListenerFailure(error);
      }
    });
  }

  /**
   * 预加载其他主题
   */
  private preloadOtherThemes(): void {
    if (!this.config.performance.lazyLoad) {
      return;
    }

    const availableIds = getAvailableThemeIds();
    const delay = this.config.performance.preloadDelay;

    setTimeout(() => {
      availableIds.forEach(themeId => {
        if (themeId !== this.currentThemeId) {
          preloadThemePreset(themeId);
        }
      });
    }, delay);
  }

  /**
   * 回退到内置主题
   */
  private async fallbackToBuiltInTheme(): Promise<void> {
    logThemeManagerFallbackToBuiltIn();

    try {
      const fallbackId = this.config.fallbackThemeId;
      await this.setTheme(fallbackId);
    } catch (error) {
      logThemeManagerFallbackFailure(error);
    }
  }

  /**
   * 加载自定义主题
   */
  private async loadCustomThemes(): Promise<void> {
    try {
      const savedThemes = this.configManager.get('theme.customThemes', []);
      if (savedThemes && Array.isArray(savedThemes)) {
        savedThemes.forEach((themeData: any) => {
          if (themeData && themeData.id) {
            this.customThemes.set(themeData.id, themeData);
          }
        });
      }
    } catch (error) {
      logThemeManagerCustomThemesLoadFailure(error);
    }
  }

  /**
   * 保存自定义主题
   */
  private saveCustomThemes(): void {
    try {
      const themesArray = Array.from(this.customThemes.values());
      this.configManager.set('theme.customThemes', themesArray, ConfigSource.USER_OVERRIDE);
    } catch (error) {
      logThemeManagerCustomThemesSaveFailure(error);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): {
    totalThemes: number;
    cachedThemes: number;
    cacheHitRate: number;
    memoryUsage: number;
  } {
    const presetStats = getCacheStats();
    const customThemes = this.customThemes.size;
    const cachedThemes = this.themeCache.size;

    return {
      totalThemes: presetStats.totalCached + customThemes,
      cachedThemes: presetStats.totalCached + cachedThemes,
      cacheHitRate: 0.8, // 默认命中率
      memoryUsage: presetStats.cacheSize
    };
  }

  /**
   * 预加载主题
   */
  async preloadThemes(themeIds: string[]): Promise<void> {
    const promises = themeIds.map(async (themeId) => {
      if (!this.themeCache.has(themeId) && !this.customThemes.has(themeId)) {
        try {
          const preset = await loadThemePreset(themeId);
          if (preset && this.config.performance.cacheThemes) {
            this.themeCache.set(themeId, preset.theme);
          }
        } catch (error) {
          logThemeManagerPreloadFailure(themeId, error);
        }
      }
    });

    await Promise.all(promises);
  }

  /**
   * 清除主题缓存
   */
  clearThemeCache(): void {
    this.themeCache.clear();
    clearThemePresetCache();

    this.emitEvent({
      type: 'preset-updated',
      timestamp: Date.now()
    });
  }

  /**
   * 获取自定义主题（兼容性方法）
   */
  getCustomThemes(): Theme[] {
    return Array.from(this.customThemes.values());
  }

  /**
   * 获取可用主题（兼容性方法）
   */
  getAvailableThemes(): Theme[] {
    // 兼容同步获取：仅返回当前已缓存或自定义的主题
    const availableIds = this.getAvailableThemeIds();
    const themes: Theme[] = [];

    availableIds.forEach(themeId => {
      const cached = this.themeCache.get(themeId) || this.customThemes.get(themeId);
      if (cached) {
        themes.push(cached);
      }
    });

    return themes;
  }

  /**
   * 添加主题变更监听器（兼容性方法）
   * 函数级注释：为了兼容现有组件的监听签名，此方法在收到
   * 'theme-changed' 事件后，将回调参数标准化为 Theme 对象，
   * 而非事件包，从而确保诸如 BaseReactFlow/BaseDiagramComponent
   * 等组件能够直接拿到最新主题并触发重渲染。
   */
  addThemeChangeListener(listener: (theme: Theme) => void): () => void {
    return this.addEventListener((event: ThemeManagerEvent) => {
      if (event.type === 'theme-changed' && event.newTheme) {
        listener(event.newTheme);
      }
    });
  }

  /**
   * 获取主题颜色（兼容性方法）
   */
  getThemeColor(themeId: string, colorName: string): string | undefined {
    // 兼容方法：优先从当前主题或缓存中读取
    const theme =
      (this.currentThemeId === themeId ? this.currentTheme : undefined) ||
      this.themeCache.get(themeId) ||
      this.customThemes.get(themeId);

    if (!theme || !theme.palette) return undefined;
    const color = theme.palette[colorName as keyof typeof theme.palette] as ThemeColor | string | undefined;
    if (!color) return undefined;
    return typeof color === 'string' ? color : color.main;
  }

  /**
   * 获取边颜色（兼容性方法）
   */
  getEdgeColor(themeId: string, _edgeType: string): string | undefined {
    const theme =
      (this.currentThemeId === themeId ? this.currentTheme : undefined) ||
      this.themeCache.get(themeId) ||
      this.customThemes.get(themeId);

    if (!theme || !theme.palette) return undefined;
    const color = theme.palette.primary as ThemeColor | string;
    return typeof color === 'string' ? color : color.main;
  }

  /**
   * 设置域增强启用状态
   */
  setDomainAugmentationEnabled(enabled: boolean): void {

    // 设置配置管理器中的域增强状态
    this.configManager.set('theme.domainAugmentationEnabled', enabled, ConfigSource.USER_OVERRIDE);

    // 触发预设更新事件
    this.emitEvent({
      type: 'preset-updated',
      timestamp: Date.now()
    });
  }

  /**
   * 获取域增强启用状态
   */
  isDomainAugmentationEnabled(): boolean {
    return this.configManager.get('theme.domainAugmentationEnabled', false) || false;
  }

  /**
   * 清理资源
   */
  dispose(): void {

    // 清除CSS变量
    if (this.currentTheme) {
      const cssVariables = themeToCSSVariables(this.currentTheme);
      removeCSSVariables(document.documentElement, cssVariables);
    }

    this.listeners.clear();
    this.transitionTimeouts.forEach(timeout => clearTimeout(timeout));
    this.transitionTimeouts.clear();

    if (!this.config.performance.cacheThemes) {
      this.themeCache.clear();
    }

    // 清除预设加载器缓存
    clearThemePresetCache();
  }
}

/**
 * 主题管理器单例实例
 */
let themeManagerInstance: EnhancedThemeManager | null = null;

/**
 * 获取主题管理器单例
 */
export function getThemeManager(config?: Partial<ThemeManagerConfig>): EnhancedThemeManager {
  if (!themeManagerInstance) {
    themeManagerInstance = new EnhancedThemeManager(config);
  }
  return themeManagerInstance;
}

/**
 * 销毁主题管理器单例
 */
export function disposeThemeManager(): void {
  if (themeManagerInstance) {
    themeManagerInstance.dispose();
    themeManagerInstance = null;
  }
}
