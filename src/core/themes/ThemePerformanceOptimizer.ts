/**
 * 主题性能优化器
 * 提供主题切换的性能优化功能，包括预加载、缓存、批量更新等
 */

import { Theme, ThemePerformanceOptions } from './types/ThemeTypes';

export interface PerformanceMetrics {
  themeLoadTime: number;
  cssUpdateTime: number;
  domUpdateTime: number;
  totalSwitchTime: number;
  cacheHitRate: number;
  memoryUsage: number;
}

export interface OptimizationStrategy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  apply: (context: OptimizationContext) => Promise<void>;
}

export interface OptimizationContext {
  oldTheme?: Theme;
  newTheme: Theme;
  element: HTMLElement;
  options: ThemePerformanceOptions;
  metrics: PerformanceMetrics;
}

export interface CacheEntry {
  theme: Theme;
  cssVariables: Record<string, string>;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

export interface BatchUpdate {
  id: string;
  properties: Record<string, string>;
  priority: number;
  timestamp: number;
}

// 性能监控器
class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    themeLoadTime: 0,
    cssUpdateTime: 0,
    domUpdateTime: 0,
    totalSwitchTime: 0,
    cacheHitRate: 0,
    memoryUsage: 0
  };

  private startTimes: Map<string, number> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;

  startTimer(name: string): void {
    this.startTimes.set(name, performance.now());
  }

  endTimer(name: string): number {
    const startTime = this.startTimes.get(name);
    if (!startTime) return 0;

    const duration = performance.now() - startTime;
    this.startTimes.delete(name);

    // 更新指标
    switch (name) {
      case 'themeLoad':
        this.metrics.themeLoadTime = duration;
        break;
      case 'cssUpdate':
        this.metrics.cssUpdateTime = duration;
        break;
      case 'domUpdate':
        this.metrics.domUpdateTime = duration;
        break;
      case 'totalSwitch':
        this.metrics.totalSwitchTime = duration;
        break;
    }

    return duration;
  }

  recordCacheHit(): void {
    this.cacheHits++;
    this.updateCacheHitRate();
  }

  recordCacheMiss(): void {
    this.cacheMisses++;
    this.updateCacheHitRate();
  }

  private updateCacheHitRate(): void {
    const total = this.cacheHits + this.cacheMisses;
    this.metrics.cacheHitRate = total > 0 ? this.cacheHits / total : 0;
  }

  updateMemoryUsage(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.memoryUsage = memory.usedJSHeapSize / 1024 / 1024; // MB
    }
  }

  getMetrics(): PerformanceMetrics {
    this.updateMemoryUsage();
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      themeLoadTime: 0,
      cssUpdateTime: 0,
      domUpdateTime: 0,
      totalSwitchTime: 0,
      cacheHitRate: 0,
      memoryUsage: 0
    };
    this.startTimes.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
}

// CSS变量提取器
class CSSVariableExtractor {
  private static readonly VARIABLE_PATTERNS = {
    color: /^(#[0-9a-f]{3,8}|rgb\(|rgba\(|hsl\(|hsla\()/i,
    size: /^(\d+(\.\d+)?(px|em|rem|%|vh|vw))$/i,
    shadow: /^(none|(\d+px\s+){2,4}rgba?\([^)]+\))$/i,
    font: /^([a-z\s,'-]+)$/i
  };

  extractFromTheme(theme: Theme): Record<string, string> {
    const variables: Record<string, string> = {};

    // 提取调色板变量
    this.extractPaletteVariables(theme.palette, variables);
    
    // 提取字体变量
    this.extractTypographyVariables(theme.typography, variables);
    
    // 提取间距变量
    this.extractSpacingVariables(theme.spacing, variables);
    
    // 提取圆角变量
    this.extractBorderRadiusVariables(theme.borderRadius, variables);
    
    // 提取阴影变量
    this.extractShadowVariables(theme.shadow, variables);
    
    // 提取动画变量
    this.extractAnimationVariables(theme.animation, variables);
    
    // 提取图表变量
    this.extractDiagramVariables(theme.diagram, variables);

    return variables;
  }

  private extractPaletteVariables(palette: any, variables: Record<string, string>): void {
    Object.entries(palette).forEach(([key, color]: [string, any]) => {
      if (typeof color === 'object' && color !== null) {
        Object.entries(color).forEach(([prop, value]: [string, unknown]) => {
          if (typeof value === 'string') {
            variables[`--color-${key}-${prop}`] = value;
          }
        });
      }
    });
  }

  /**
   * 提取版式相关的 CSS 变量
   * 兼容对象结构的 fontFamily，并对缺失的数值做健壮处理。
   */
  private extractTypographyVariables(typography: any, variables: Record<string, string>): void {
    const fontFamily = (() => {
      const ff = typography?.fontFamily;
      if (!ff) return '';
      // 支持 { sans: string[]; mono: string[] } 或直接字符串
      if (Array.isArray(ff?.sans)) return ff.sans.join(', ');
      if (typeof ff === 'string') return ff;
      return '';
    })();
    variables['--font-family'] = fontFamily;

    Object.entries(typography?.fontSize || {}).forEach(([key, value]: [string, unknown]) => {
      const num = typeof value === 'number' ? value : 0;
      variables[`--font-size-${key}`] = `${num}px`;
    });

    Object.entries(typography?.fontWeight || {}).forEach(([key, value]: [string, unknown]) => {
      const v = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
      variables[`--font-weight-${key}`] = v;
    });

    Object.entries(typography?.lineHeight || {}).forEach(([key, value]: [string, unknown]) => {
      const v = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
      variables[`--line-height-${key}`] = v;
    });
  }

  private extractSpacingVariables(spacing: any, variables: Record<string, string>): void {
    Object.entries(spacing).forEach(([key, value]) => {
      variables[`--spacing-${key}`] = `${value}px`;
    });
  }

  private extractBorderRadiusVariables(borderRadius: any, variables: Record<string, string>): void {
    Object.entries(borderRadius).forEach(([key, value]) => {
      variables[`--border-radius-${key}`] = `${value}px`;
    });
  }

  private extractShadowVariables(shadow: any, variables: Record<string, string>): void {
    Object.entries(shadow).forEach(([key, value]) => {
      variables[`--shadow-${key}`] = value as string;
    });
  }

  private extractAnimationVariables(animation: any, variables: Record<string, string>): void {
    Object.entries(animation.duration).forEach(([key, value]) => {
      variables[`--animation-duration-${key}`] = `${value}ms`;
    });
    
    Object.entries(animation.easing).forEach(([key, value]) => {
      variables[`--animation-easing-${key}`] = value as string;
    });
  }

  /**
   * 提取图表相关的 CSS 变量
   * 为缺失字段提供默认值，避免运行时读取 undefined.toString 造成的错误。
   */
  private extractDiagramVariables(diagram: any, variables: Record<string, string>): void {
    if (!diagram) return;
    // 域变量
    Object.entries(diagram?.domains || {}).forEach(([domain, color]: [string, any]) => {
      Object.entries(color).forEach(([prop, value]: [string, unknown]) => {
        variables[`--diagram-domain-${domain}-${prop}`] = value as string;
      });
    });

    // 边缘变量
    Object.entries(diagram?.edges || {}).forEach(([type, color]: [string, any]) => {
      Object.entries(color).forEach(([prop, value]: [string, unknown]) => {
        variables[`--diagram-edge-${type}-${prop}`] = value as string;
      });
    });

    // 节点变量
    Object.entries(diagram?.nodes || {}).forEach(([state, color]: [string, any]) => {
      Object.entries(color).forEach(([prop, value]: [string, unknown]) => {
        variables[`--diagram-node-${state}-${prop}`] = value as string;
      });
    });

    // 画布变量
    const canvas = diagram?.canvas || {};
    const grid = canvas?.grid || {};
    const gridSize = typeof grid.size === 'number' ? grid.size : 0;
    const gridOpacity = typeof grid.opacity === 'number' ? grid.opacity : 1;
    variables['--diagram-canvas-background'] = canvas.background || '';
    variables['--diagram-grid-color'] = grid.color || '';
    variables['--diagram-grid-size'] = `${gridSize}px`;
    variables['--diagram-grid-opacity'] = String(gridOpacity);
  }

  optimizeVariables(variables: Record<string, string>): Record<string, string> {
    const optimized: Record<string, string> = {};
    
    // 去重和优化
    const seen = new Set<string>();
    Object.entries(variables).forEach(([key, value]) => {
      const normalizedValue = this.normalizeValue(value);
      const signature = `${key}:${normalizedValue}`;
      
      if (!seen.has(signature)) {
        seen.add(signature);
        optimized[key] = normalizedValue;
      }
    });

    return optimized;
  }

  private normalizeValue(value: string): string {
    // 标准化颜色值
    if (CSSVariableExtractor.VARIABLE_PATTERNS.color.test(value)) {
      return this.normalizeColor(value);
    }
    
    // 标准化尺寸值
    if (CSSVariableExtractor.VARIABLE_PATTERNS.size.test(value)) {
      return this.normalizeSize(value);
    }
    
    return value.trim();
  }

  private normalizeColor(color: string): string {
    // 简单的颜色标准化
    return color.toLowerCase().replace(/\s+/g, '');
  }

  private normalizeSize(size: string): string {
    // 移除不必要的小数点
    return size.replace(/\.0+(px|em|rem|%)$/, '$1');
  }
}

// 批量更新管理器
class BatchUpdateManager {
  private pendingUpdates: Map<string, BatchUpdate> = new Map();
  private updateQueue: BatchUpdate[] = [];
  private isProcessing = false;
  private batchTimeout?: NodeJS.Timeout;

  constructor(private debounceDelay: number = 16) {} // 60fps

  addUpdate(id: string, properties: Record<string, string>, priority: number = 0): void {
    const update: BatchUpdate = {
      id,
      properties,
      priority,
      timestamp: Date.now()
    };

    this.pendingUpdates.set(id, update);
    this.scheduleProcess();
  }

  private scheduleProcess(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.debounceDelay);
  }

  private processBatch(): void {
    if (this.isProcessing || this.pendingUpdates.size === 0) return;

    this.isProcessing = true;
    
    // 将待处理的更新移到队列中
    this.updateQueue = Array.from(this.pendingUpdates.values())
      .sort((a, b) => b.priority - a.priority);
    
    this.pendingUpdates.clear();

    // 使用 requestAnimationFrame 确保在下一帧执行
    requestAnimationFrame(() => {
      this.applyUpdates();
      this.isProcessing = false;
    });
  }

  private applyUpdates(): void {
    const root = document.documentElement;
    const style = root.style;

    // 批量应用所有更新
    this.updateQueue.forEach(update => {
      Object.entries(update.properties).forEach(([property, value]) => {
        style.setProperty(property, value);
      });
    });

    this.updateQueue = [];
  }

  clear(): void {
    this.pendingUpdates.clear();
    this.updateQueue = [];
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = undefined;
    }
  }
}

// 主题性能优化器
export class ThemePerformanceOptimizer {
  private cache: Map<string, CacheEntry> = new Map();
  private monitor = new PerformanceMonitor();
  private extractor = new CSSVariableExtractor();
  private batchManager: BatchUpdateManager;
  private strategies: Map<string, OptimizationStrategy> = new Map();
  private options: ThemePerformanceOptions;

  constructor(options: ThemePerformanceOptions) {
    this.options = options;
    this.batchManager = new BatchUpdateManager(options.debounceDelay);
    this.initializeStrategies();
  }

  /**
   * 初始化优化策略
   */
  private initializeStrategies(): void {
    const strategies: OptimizationStrategy[] = [
      {
        id: 'preload',
        name: '预加载优化',
        description: '预加载常用主题的CSS变量',
        enabled: true,
        priority: 1,
        apply: this.applyPreloadStrategy.bind(this)
      },
      {
        id: 'cache',
        name: '缓存优化',
        description: '缓存已处理的主题数据',
        enabled: !!this.options.cacheThemes,
        priority: 2,
        apply: this.applyCacheStrategy.bind(this)
      },
      {
        id: 'batch',
        name: '批量更新',
        description: '批量应用CSS变量更新',
        enabled: !!this.options.batchUpdates,
        priority: 3,
        apply: this.applyBatchStrategy.bind(this)
      },
      {
        id: 'transition',
        name: '过渡优化',
        description: '优化主题切换过渡效果',
        enabled: !!this.options.enableTransitions,
        priority: 4,
        apply: this.applyTransitionStrategy.bind(this)
      },
      {
        id: 'memory',
        name: '内存优化',
        description: '管理内存使用和垃圾回收',
        enabled: true,
        priority: 5,
        apply: this.applyMemoryStrategy.bind(this)
      }
    ];

    strategies.forEach(strategy => {
      this.strategies.set(strategy.id, strategy);
    });
  }

  /**
   * 优化主题切换
   */
  async optimizeThemeSwitch(
    newTheme: Theme,
    element: HTMLElement = document.documentElement,
    oldTheme?: Theme
  ): Promise<PerformanceMetrics> {
    this.monitor.startTimer('totalSwitch');

    const context: OptimizationContext = {
      oldTheme,
      newTheme,
      element,
      options: this.options,
      metrics: this.monitor.getMetrics()
    };

    // 按优先级应用优化策略
    const enabledStrategies = Array.from(this.strategies.values())
      .filter(s => s.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const strategy of enabledStrategies) {
      try {
        await strategy.apply(context);
      } catch (error) {
        console.warn(`Optimization strategy '${strategy.id}' failed:`, error);
      }
    }

    this.monitor.endTimer('totalSwitch');
    return this.monitor.getMetrics();
  }

  /**
   * 预加载策略
   */
  private async applyPreloadStrategy(context: OptimizationContext): Promise<void> {
    if (!Array.isArray(this.options.preloadThemes) || !this.options.preloadThemes.includes(context.newTheme.id)) {
      return;
    }

    this.monitor.startTimer('themeLoad');

    // 检查缓存
    const cacheKey = this.getCacheKey(context.newTheme);
    if (this.cache.has(cacheKey)) {
      this.monitor.recordCacheHit();
      this.monitor.endTimer('themeLoad');
      return;
    }

    // 提取CSS变量
    const cssVariables = this.extractor.extractFromTheme(context.newTheme);
    const optimizedVariables = this.extractor.optimizeVariables(cssVariables);

    // 缓存结果
    this.cache.set(cacheKey, {
      theme: context.newTheme,
      cssVariables: optimizedVariables,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now()
    });

    this.monitor.recordCacheMiss();
    this.monitor.endTimer('themeLoad');
  }

  /**
   * 缓存策略
   */
  private async applyCacheStrategy(context: OptimizationContext): Promise<void> {
    const cacheKey = this.getCacheKey(context.newTheme);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      // 更新访问统计
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      this.monitor.recordCacheHit();
    } else {
      // 创建新的缓存条目
      const cssVariables = this.extractor.extractFromTheme(context.newTheme);
      const optimizedVariables = this.extractor.optimizeVariables(cssVariables);

      this.cache.set(cacheKey, {
        theme: context.newTheme,
        cssVariables: optimizedVariables,
        timestamp: Date.now(),
        accessCount: 1,
        lastAccessed: Date.now()
      });

      this.monitor.recordCacheMiss();
    }

    // 清理过期缓存
    this.cleanupCache();
  }

  /**
   * 批量更新策略
   */
  private async applyBatchStrategy(context: OptimizationContext): Promise<void> {
    this.monitor.startTimer('cssUpdate');

    const cacheKey = this.getCacheKey(context.newTheme);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      // 使用批量管理器应用更新
      this.batchManager.addUpdate(
        `theme-${context.newTheme.id}`,
        cached.cssVariables,
        10 // 高优先级
      );
    }

    this.monitor.endTimer('cssUpdate');
  }

  /**
   * 过渡策略
   */
  private async applyTransitionStrategy(context: OptimizationContext): Promise<void> {
    if (!this.options.enableTransitions) return;

    const element = context.element;
    const duration = this.options.transitionDuration ?? 300;

    // 设置过渡效果
    element.style.transition = `all ${duration}ms ease-in-out`;

    // 在过渡完成后移除过渡样式
    setTimeout(() => {
      element.style.transition = '';
    }, duration);
  }

  /**
   * 内存优化策略
   */
  private async applyMemoryStrategy(_context: OptimizationContext): Promise<void> {
    // 限制缓存大小
    const maxCacheSize = 50;
    if (this.cache.size > maxCacheSize) {
      this.cleanupCache(maxCacheSize * 0.8); // 清理到80%
    }

    // 触发垃圾回收（如果可用）
    if ('gc' in window && typeof (window as any).gc === 'function') {
      (window as any).gc();
    }
  }

  /**
   * 预加载主题
   */
  async preloadThemes(themes: Theme[]): Promise<void> {
    const promises = themes.map(theme => this.preloadTheme(theme));
    await Promise.all(promises);
  }

  /**
   * 预加载单个主题
   */
  async preloadTheme(theme: Theme): Promise<void> {
    const cacheKey = this.getCacheKey(theme);
    if (this.cache.has(cacheKey)) return;

    const cssVariables = this.extractor.extractFromTheme(theme);
    const optimizedVariables = this.extractor.optimizeVariables(cssVariables);

    this.cache.set(cacheKey, {
      theme,
      cssVariables: optimizedVariables,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now()
    });
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(theme: Theme): string {
    return `${theme.id}-${theme.mode}`;
  }

  /**
   * 清理缓存
   */
  private cleanupCache(maxSize?: number): void {
    const configuredMax = Math.max(1, Math.floor(this.options.maxCacheSize || 50));
    const targetSize = Math.max(1, Math.floor(maxSize ?? configuredMax));

    if (this.cache.size <= targetSize) return;

    // 按最后访问时间排序，删除最久未使用的条目
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    const toDelete = entries.slice(0, this.cache.size - targetSize);
    toDelete.forEach(([key]) => this.cache.delete(key));
  }

  /**
   * 获取性能指标
   */
  getMetrics(): PerformanceMetrics {
    return this.monitor.getMetrics();
  }

  /**
   * 重置性能指标
   */
  resetMetrics(): void {
    this.monitor.reset();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    memoryUsage: number;
    entries: Array<{
      key: string;
      accessCount: number;
      lastAccessed: Date;
      age: number;
    }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      accessCount: entry.accessCount,
      lastAccessed: new Date(entry.lastAccessed),
      age: now - entry.timestamp
    }));

    const memoryUsage = entries.reduce((total, entry) => {
      return total + JSON.stringify(this.cache.get(entry.key)).length;
    }, 0) / 1024; // KB

    return {
      size: this.cache.size,
      hitRate: this.monitor.getMetrics().cacheHitRate,
      memoryUsage,
      entries
    };
  }

  /**
   * 更新选项
   */
  updateOptions(options: Partial<ThemePerformanceOptions>): void {
    this.options = { ...this.options, ...options };
    
    // 更新批量管理器
    this.batchManager = new BatchUpdateManager(this.options.debounceDelay);
    
    // 更新策略状态
    this.strategies.get('cache')!.enabled = !!this.options.cacheThemes;
    this.strategies.get('batch')!.enabled = !!this.options.batchUpdates;
    this.strategies.get('transition')!.enabled = !!this.options.enableTransitions;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.cache.clear();
    this.batchManager.clear();
    this.monitor.reset();
    this.strategies.clear();
  }
}
