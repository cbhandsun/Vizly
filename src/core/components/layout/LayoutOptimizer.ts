/**
 * 布局优化器
 * 提供智能的节点布局和边缘优化算法
 */

import { Node, Edge } from '@xyflow/react';
import { enhancedTextMeasurement } from '../../utils/EnhancedTextMeasurement';
import { diagramConfigManager } from '../config/DiagramConfig';

interface LayoutConfig {
  NODE_MIN_WIDTH: number;
  NODE_PADDING: { horizontal: number; vertical: number };
  NODE_H_GAP: number;
  NODE_V_GAP: number;
  GROUP_PADDING: { H: number; V: number };
  SUB_GROUP_PADDING: { H: number; V_TOP: number; V_BOTTOM: number };
  SUB_GROUP_TITLE_CLEARANCE: number;
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
}

interface CachedMeasurement {
  width: number;
  height: number;
  timestamp: number;
}

const FLOWCHART_RENDER_PADDING_H = 18;
const FLOWCHART_TITLE_FONT_SIZE = 13.5;
const FLOWCHART_TITLE_FONT_WEIGHT = '650';
const FLOWCHART_BODY_FONT_SIZE = 13;
const FLOWCHART_BODY_FONT_WEIGHT = '400';
const FLOWCHART_WIDTH_SAFETY = 28;

interface DomainData {
  title: string;
  nodes: string[];
  descs: string[];
}

/**
 * 高性能布局优化器类
 * 使用缓存和批量计算来提升性能
 */
export class LayoutOptimizer {
  private static instance: LayoutOptimizer;
  private measurementCache = new Map<string, CachedMeasurement>();
  private CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存（自适应）
  private cacheQueryCount = 0;
  private cacheHitCount = 0;
  private lastTtlAdjustAt = 0;

  // 紧凑域配置（需与 NodeFactory 保持一致）
  public readonly COMPACT_DOMAINS: Record<string, { fontScale: number; widthScale: number; paddingHScale: number; paddingVScale: number }> = {
    strategy: { fontScale: 0.9, widthScale: 0.9, paddingHScale: 0.9, paddingVScale: 0.9 },
    data: { fontScale: 0.9, widthScale: 0.9, paddingHScale: 0.9, paddingVScale: 0.9 },
    interface: { fontScale: 0.9, widthScale: 0.9, paddingHScale: 0.9, paddingVScale: 0.9 },
  };

  constructor() {
    // 使用统一配置管理器
    diagramConfigManager.addConfigChangeListener(() => {
      // 配置变更时清空缓存
      this.clearCache();
    });
  }

  /**
   * 获取布局优化器单例实例
   */
  public static getInstance(): LayoutOptimizer {
    if (!LayoutOptimizer.instance) {
      LayoutOptimizer.instance = new LayoutOptimizer();
    }
    return LayoutOptimizer.instance;
  }

  /**
   * 测量文本最长行宽度（不含内边距）
   */
  public measureLongestLineWidth(text: string): number {
    if (!text) return 0;
    const cleanText = text.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ');
    // 按换行或 <br/> 标签分割为多行
    const lines = cleanText.split(/\n|<br\s*\/?>(?:)/i).filter(line => line.trim());
    let maxLineWidth = 0;
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        const measurement = enhancedTextMeasurement.measureNodeContent(trimmedLine, {
          fontSize: this.config.NODE_FONT_SIZE,
          fontFamily: this.config.NODE_FONT_FAMILY,
          fontWeight: this.config.NODE_FONT_WEIGHT,
          padding: this.config.NODE_PADDING,
        });
        maxLineWidth = Math.max(maxLineWidth, measurement.maxLineWidth);
      }
    }
    return Math.max(0, maxLineWidth);
  }

  /**
   * 获取当前布局配置
   */
  private get config() {
    return diagramConfigManager.getLayoutConfig();
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(content: string, fontSize: number, fontFamily: string, fontWeight: string): string {
    return `${content}|${fontSize}|${fontFamily}|${fontWeight}`;
  }

  private calculateRenderedContentWidth(
    lines: string[],
    options: {
      fontSize: number;
      fontFamily: string;
      fontWeight: string;
      paddingH: number;
    }
  ): number {
    if (!Array.isArray(lines) || lines.length === 0) return 0;

    const renderedPaddingH = Math.max(options.paddingH, FLOWCHART_RENDER_PADDING_H);
    const maxLineWidth = lines.reduce((maxWidth, line, index) => {
      const isTitle = index === 0;
      const fontSize = isTitle ? Math.max(options.fontSize, FLOWCHART_TITLE_FONT_SIZE) : Math.max(options.fontSize, FLOWCHART_BODY_FONT_SIZE);
      const fontWeight = isTitle ? FLOWCHART_TITLE_FONT_WEIGHT : (options.fontWeight || FLOWCHART_BODY_FONT_WEIGHT);
      const measurement = enhancedTextMeasurement.measureNodeContent(line, {
        fontSize,
        fontFamily: options.fontFamily,
        fontWeight,
        padding: { horizontal: 0, vertical: 0 },
      });
      const letterSpacingAllowance = isTitle ? Math.ceil(String(line || '').length * FLOWCHART_TITLE_FONT_SIZE * 0.015) : 0;
      return Math.max(maxWidth, (measurement.maxLineWidth || 0) + letterSpacingAllowance);
    }, 0);

    return maxLineWidth + renderedPaddingH * 2 + FLOWCHART_WIDTH_SAFETY;
  }

  /**
   * 检查缓存是否有效
   */
  private isCacheValid(cached: CachedMeasurement): boolean {
    return Date.now() - cached.timestamp < this.CACHE_TTL;
  }

  /**
   * 清理过期缓存
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.measurementCache.entries()) {
      if (now - cached.timestamp >= this.CACHE_TTL) {
        this.measurementCache.delete(key);
      }
    }
  }

  /**
   * 自适应调整布局测量缓存TTL（函数级注释）
   * - 依据命中率在 2–8 分钟范围内调整，降低抖动与无效缓存占用
   * - 调整至少每 60s 执行一次
   */
  private adjustCacheTTLByHitRate(): void {
    const now = Date.now();
    const MIN_INTERVAL = 60 * 1000;
    if (now - this.lastTtlAdjustAt < MIN_INTERVAL) return;
    const q = this.cacheQueryCount;
    if (q <= 0) return;
    const hitRate = Math.max(0, Math.min(1, this.cacheHitCount / q));
    const minutes = hitRate >= 0.8 ? 8 : hitRate >= 0.6 ? 6 : hitRate >= 0.4 ? 5 : 3;
    this.CACHE_TTL = minutes * 60 * 1000;
    this.lastTtlAdjustAt = now;
  }

  /**
   * 高性能节点宽度计算（带缓存）
   * 函数级注释：
   * - 以内容为准计算节点宽度，统一用增强文本测量解析行与宽度。
   * - 单一要点（仅一行且以 •/-/· 开头）不受 maxWidth 限制，确保不折行。
   * - 其它情况应用最小/最大宽度夹取，并加入安全边距，避免溢出。
   */
  public calculateNodeWidth(description: string): number {
    // 输入验证
    if (!description || typeof description !== 'string') {
      return this.config.NODE_MIN_WIDTH;
    }

    // 确保配置值是有效的数字
    const config = this.config;
    const fontSize = (typeof config.NODE_FONT_SIZE === 'number' && !isNaN(config.NODE_FONT_SIZE) && config.NODE_FONT_SIZE > 0) ? config.NODE_FONT_SIZE : 16;
    const fontFamily = (typeof config.NODE_FONT_FAMILY === 'string' && config.NODE_FONT_FAMILY.length > 0) ? config.NODE_FONT_FAMILY : 'Arial, sans-serif';
    const fontWeight = (typeof config.NODE_FONT_WEIGHT === 'string' && config.NODE_FONT_WEIGHT.length > 0) ? config.NODE_FONT_WEIGHT : 'normal';
    const paddingH = (typeof config.NODE_PADDING?.horizontal === 'number' && !isNaN(config.NODE_PADDING.horizontal)) ? config.NODE_PADDING.horizontal : 16;
    const paddingV = (typeof config.NODE_PADDING?.vertical === 'number' && !isNaN(config.NODE_PADDING.vertical)) ? config.NODE_PADDING.vertical : 12;
    const minWidth = (typeof config.NODE_MIN_WIDTH === 'number' && !isNaN(config.NODE_MIN_WIDTH) && config.NODE_MIN_WIDTH > 0) ? config.NODE_MIN_WIDTH : 120;
    // 读取全局配置的最大宽度上限，作为强制夹紧边界
    const hardMaxWidth = (() => {
      try {
        const full = diagramConfigManager.getConfig();
        const mw = (full?.node?.maxWidth as number) ?? 0;
        return (typeof mw === 'number' && !isNaN(mw) && mw > 0) ? mw : 420;
      } catch {
        return 420;
      }
    })();

    const cacheKey = this.getCacheKey(
      description,
      fontSize,
      fontFamily,
      fontWeight
    );

    // 检查缓存
    const cached = this.measurementCache.get(cacheKey);
    this.cacheQueryCount++;
    if (cached && this.isCacheValid(cached)) {
      this.cacheHitCount++;
      return cached.width;
    }

    // 统一测量整段内容，获取要点行与最长行宽
    let lines: string[] = [];
    let maxLineWidth = 0;
    let totalWidth = minWidth;
    try {
      const measurement = enhancedTextMeasurement.measureNodeContent(description, {
        fontSize: fontSize,
        fontFamily: fontFamily,
        fontWeight: fontWeight,
        padding: { horizontal: paddingH, vertical: paddingV },
      });
      lines = Array.isArray(measurement.lines) ? measurement.lines : [];
      maxLineWidth = (typeof measurement.maxLineWidth === 'number' && isFinite(measurement.maxLineWidth)) ? measurement.maxLineWidth : 0;
      const rawWidth = Math.max(
        maxLineWidth + paddingH * 2 + 12,
        this.calculateRenderedContentWidth(lines, { fontSize, fontFamily, fontWeight, paddingH })
      );
      const isSingleBullet = (lines.length === 1) && /^\s*(•|-|·|\u2022)/.test(lines[0] || '');
      totalWidth = isSingleBullet
        ? Math.max(minWidth, rawWidth)
        : Math.max(minWidth, Math.min(rawWidth, hardMaxWidth));
    } catch (error) {
      console.warn('Node width calculation failed, fallback:', error);
      const cleanText = description.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ');
      const estimated = cleanText.length * fontSize * 0.6 + Math.max(paddingH, FLOWCHART_RENDER_PADDING_H) * 2 + FLOWCHART_WIDTH_SAFETY;
      totalWidth = Math.max(minWidth, Math.min(estimated, hardMaxWidth));
    }

    // 确保最终结果是有效数字
    const validTotalWidth = (typeof totalWidth === 'number' && !isNaN(totalWidth) && isFinite(totalWidth))
      ? totalWidth
      : minWidth;

    // 缓存结果
    this.measurementCache.set(cacheKey, {
      width: validTotalWidth,
      height: lines.length * fontSize * 1.4, // 估算高度
      timestamp: Date.now()
    });
    this.adjustCacheTTLByHitRate();

    return validTotalWidth;
  }

  /**
   * 计算节点宽度（支持覆盖字体与内边距，并可缩放）
   * 用于特定域的紧凑展示：根据更小的字体和/或更小的内边距来精准测量宽度，
   * 然后按给定 scale 进行最终宽度收缩。
   */
  public calculateNodeWidthWithOverrides(
    description: string,
    overrides?: {
      fontSize?: number;
      fontFamily?: string;
      fontWeight?: string;
      padding?: { horizontal: number; vertical: number };
      minWidth?: number;
      scale?: number;
      maxWidth?: number;
    }
  ): number {
    // 函数级注释：采用覆盖字体/内边距测量整段内容；单一要点不受上限限制，支持 scale 缩放后再夹取下限。
    if (!description || typeof description !== 'string') {
      const baseMin = this.config.NODE_MIN_WIDTH;
      const minWidth = overrides?.minWidth ?? baseMin;
      return minWidth;
    }

    const base = this.config;
    const fontSize = (typeof overrides?.fontSize === 'number' && overrides.fontSize > 0)
      ? overrides.fontSize
      : base.NODE_FONT_SIZE;
    const fontFamily = overrides?.fontFamily || base.NODE_FONT_FAMILY;
    const fontWeight = overrides?.fontWeight || base.NODE_FONT_WEIGHT;
    const paddingH = (typeof overrides?.padding?.horizontal === 'number')
      ? overrides!.padding!.horizontal
      : base.NODE_PADDING.horizontal;
    const paddingV = (typeof overrides?.padding?.vertical === 'number')
      ? overrides!.padding!.vertical
      : base.NODE_PADDING.vertical;
    const minWidth = (typeof overrides?.minWidth === 'number' && overrides.minWidth > 0)
      ? overrides.minWidth
      : base.NODE_MIN_WIDTH;
    // 允许覆盖最大宽度，否则使用全局配置上限
    const hardMaxWidth = (() => {
      // 优先使用覆盖的最大宽度
      if (typeof overrides?.maxWidth === 'number' && overrides.maxWidth > 0) {
        return overrides.maxWidth;
      }
      try {
        const full = diagramConfigManager.getConfig();
        const mw = (full?.node?.maxWidth as number) ?? 0;
        return (typeof mw === 'number' && !isNaN(mw) && mw > 0) ? mw : 420;
      } catch {
        return 420;
      }
    })();

    // 覆盖下的缓存键包含 padding 以确保精确测量缓存
    const cacheKey = `${description}|${fontSize}|${fontFamily}|${fontWeight}|${paddingH}|${paddingV}`;
    const cached = this.measurementCache.get(cacheKey);
    this.cacheQueryCount++;
    if (cached && this.isCacheValid(cached)) {
      this.cacheHitCount++;
      const scaledRaw = overrides?.scale ? cached.width * overrides.scale : cached.width;
      const scaled = Math.max(minWidth, Math.min(scaledRaw, hardMaxWidth));
      return scaled;
    }

    let lines: string[] = [];
    let scaledWidth = minWidth;
    let validTotalWidth = minWidth;
    try {
      const measurement = enhancedTextMeasurement.measureNodeContent(description, {
        fontSize,
        fontFamily,
        fontWeight,
        padding: { horizontal: paddingH, vertical: paddingV },
      });
      lines = Array.isArray(measurement.lines) ? measurement.lines : [];
      const maxLineWidth = (typeof measurement.maxLineWidth === 'number' && isFinite(measurement.maxLineWidth)) ? measurement.maxLineWidth : 0;
      const rawWidth = Math.max(
        maxLineWidth + paddingH * 2 + 12,
        this.calculateRenderedContentWidth(lines, { fontSize, fontFamily, fontWeight, paddingH })
      );
      const isSingleBullet = (lines.length === 1) && /^\s*(•|-|·|\u2022)/.test(lines[0] || '');
      const baseClamped = isSingleBullet
        ? Math.max(minWidth, rawWidth)
        : Math.max(minWidth, Math.min(rawWidth, hardMaxWidth));
      const scaledCandidate = overrides?.scale ? Math.max(minWidth, baseClamped * overrides.scale) : baseClamped;
      scaledWidth = Math.max(minWidth, Math.min(scaledCandidate, hardMaxWidth));
      validTotalWidth = (typeof baseClamped === 'number' && isFinite(baseClamped)) ? baseClamped : minWidth;
    } catch {
      const cleanText = description.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ');
      const estimated = cleanText.length * fontSize * 0.6 + Math.max(paddingH, FLOWCHART_RENDER_PADDING_H) * 2 + FLOWCHART_WIDTH_SAFETY;
      scaledWidth = Math.max(minWidth, Math.min(estimated, hardMaxWidth));
      validTotalWidth = scaledWidth;
    }

    this.measurementCache.set(cacheKey, {
      width: validTotalWidth,
      height: lines.length * fontSize * 1.4,
      timestamp: Date.now(),
    });
    this.adjustCacheTTLByHitRate();

    return scaledWidth;
  }

  /**
   * 批量计算多个节点宽度（优化版，含最大宽度硬上限）
   *
   * 函数说明：
   * - 使用增强版文本测量批量获取每个描述的内容宽度。
   * - 同步当前布局配置的字体、内边距用于测量；字体大小在配置无效时回退为 28（与 LayoutConfig 保持一致）。
   * - 支持紧凑域（Compact Domain）配置，自动应用缩放系数。
   * - 对每个结果应用 `minWidth` 与全局 `maxWidth`（来自 ConfigManager.node.maxWidth，若无效则回退 300）的硬性夹取，确保不会产生过宽节点。
   * - 为每个宽度加上 8px 安全边距并进行最终夹取。
   */
  public calculateMultipleNodeWidths(descriptions: string[], options?: { domainKey?: string }): number[] {
    // 定期清理过期缓存
    if (this.measurementCache.size > 100) {
      this.cleanExpiredCache();
    }

    // 确保配置值是有效的数字
    const config = this.config;
    // 字体大小：与 DiagramConfigManager.getLayoutConfig 的回退策略保持一致（28）
    let fontSize = (typeof config.NODE_FONT_SIZE === 'number' && !isNaN(config.NODE_FONT_SIZE) && config.NODE_FONT_SIZE > 0) ? config.NODE_FONT_SIZE : 28;
    const fontFamily = (typeof config.NODE_FONT_FAMILY === 'string' && config.NODE_FONT_FAMILY.length > 0) ? config.NODE_FONT_FAMILY : 'Arial, sans-serif';
    const fontWeight = (typeof config.NODE_FONT_WEIGHT === 'string' && config.NODE_FONT_WEIGHT.length > 0) ? config.NODE_FONT_WEIGHT : 'normal';
    let paddingH = (typeof config.NODE_PADDING?.horizontal === 'number' && !isNaN(config.NODE_PADDING.horizontal)) ? config.NODE_PADDING.horizontal : 16;
    const paddingV = (typeof config.NODE_PADDING?.vertical === 'number' && !isNaN(config.NODE_PADDING.vertical)) ? config.NODE_PADDING.vertical : 12;
    const minWidth = (typeof config.NODE_MIN_WIDTH === 'number' && !isNaN(config.NODE_MIN_WIDTH) && config.NODE_MIN_WIDTH > 0) ? config.NODE_MIN_WIDTH : 120;

    // 应用紧凑域配置
    if (options?.domainKey && this.COMPACT_DOMAINS[options.domainKey]) {
      const compact = this.COMPACT_DOMAINS[options.domainKey];
      fontSize = Math.round(fontSize * compact.fontScale);
      paddingH = Math.round(paddingH * compact.paddingHScale);
      // widthScale 会在结果上应用吗？NodeFactory 是在 measure 之前 adjust params?
      // NodeFactory: fontSizeOverride, paddingOverride. 
      // widthScale is used AFTER measure in NodeFactory? No, NodeFactory: const widthScale = isCompact ? ... : 1;
      // But createNode logic: clampedWidth = ... * widthScale.
      // Here we return "measured width". If we want layout to match, we should probably scale the result too if needed.
      // But LayoutOptimizer mainly cares about "content width".
      // Let's stick to font/padding adjustments for measurement first.
    }

    // 最大宽度硬上限：优先使用全局配置的 node.maxWidth，无效时回退 300
    const hardMaxWidth = (() => {
      try {
        const full = diagramConfigManager.getConfig();
        const mw = (full?.node?.maxWidth as number) ?? 0;
        return (typeof mw === 'number' && !isNaN(mw) && mw > 0) ? mw : 420;
      } catch {
        return 420;
      }
    })();

    // 使用增强版文本测量系统的批量处理功能
    const measurements = enhancedTextMeasurement.measureMultipleNodes(descriptions, {
      fontSize: fontSize,
      fontFamily: fontFamily,
      fontWeight: fontWeight,
      padding: { horizontal: paddingH, vertical: paddingV }
    });

    return measurements.map((measurement) => {
      // 确保测量结果是有效数字
      const raw = (typeof measurement.width === 'number' && !isNaN(measurement.width) && isFinite(measurement.width)) ? measurement.width : minWidth;
      let withSafety = Math.max(
        raw + 12,
        this.calculateRenderedContentWidth(measurement.lines, { fontSize, fontFamily, fontWeight, paddingH })
      );

      // 应用紧凑域宽度缩放
      if (options?.domainKey && this.COMPACT_DOMAINS[options.domainKey]) {
        withSafety *= this.COMPACT_DOMAINS[options.domainKey].widthScale;
      }

      // 单一要点不折行（仅一行且以 •/-/· 开头）：跳过最大宽度夹取
      const isSingleBullet = Array.isArray(measurement.lines) && measurement.lines.length === 1 && /^\s*(•|-|·|\u2022)/.test(measurement.lines[0] || '');
      return isSingleBullet
        ? Math.max(minWidth, withSafety)
        : Math.max(minWidth, Math.min(withSafety, hardMaxWidth));
    });
  }

  /**
   * 计算单个节点的高度（含内边距）
   */
  public calculateNodeHeight(description: string): number {
    // 确保输入是有效的字符串
    if (!description || typeof description !== 'string') {
      return 60; // 默认高度
    }

    // 确保配置值是有效的数字
    const config = this.config;
    const fontSize = (typeof config.NODE_FONT_SIZE === 'number' && !isNaN(config.NODE_FONT_SIZE) && config.NODE_FONT_SIZE > 0) ? config.NODE_FONT_SIZE : 16;
    const fontFamily = (typeof config.NODE_FONT_FAMILY === 'string' && config.NODE_FONT_FAMILY.length > 0) ? config.NODE_FONT_FAMILY : 'Arial, sans-serif';
    const fontWeight = (typeof config.NODE_FONT_WEIGHT === 'string' && config.NODE_FONT_WEIGHT.length > 0) ? config.NODE_FONT_WEIGHT : 'normal';
    const paddingH = (typeof config.NODE_PADDING?.horizontal === 'number' && !isNaN(config.NODE_PADDING.horizontal)) ? config.NODE_PADDING.horizontal : 16;
    const paddingV = (typeof config.NODE_PADDING?.vertical === 'number' && !isNaN(config.NODE_PADDING.vertical)) ? config.NODE_PADDING.vertical : 12;
    const hardMaxWidth = (() => {
      try {
        const full = diagramConfigManager.getConfig();
        const mw = (full?.node?.maxWidth as number) ?? 0;
        return (typeof mw === 'number' && !isNaN(mw) && mw > 0) ? mw : 420;
      } catch {
        return 420;
      }
    })();

    try {
      // 使用增强版文本测量系统
      const measurement = enhancedTextMeasurement.measureNodeContent(description, {
        fontSize: fontSize,
        fontFamily: fontFamily,
        fontWeight: fontWeight,
        padding: { horizontal: paddingH, vertical: paddingV }
      });

      // 确保测量结果是有效数字
      const height = this.calculateWrappedContentHeight(measurement.lines, {
        fontSize,
        fontFamily,
        fontWeight,
        lineHeight: 1.4,
        paddingH,
        paddingV,
        maxWidth: hardMaxWidth,
        fallbackHeight: measurement.height,
      });
      return Math.max(60, height); // 最小高度60px

    } catch (error) {
      console.warn('节点高度计算失败，使用默认值:', error);
      return 60;
    }
  }

  /**
   * 计算节点高度（支持覆盖字体与内边距）
   * 搭配 calculateNodeWidthWithOverrides 使用，确保紧凑节点的高度与字体/内边距一致。
   */
  public calculateNodeHeightWithOverrides(
    description: string,
    overrides?: {
      fontSize?: number;
      fontFamily?: string;
      fontWeight?: string;
      padding?: { horizontal: number; vertical: number };
      minHeight?: number;
      maxWidth?: number;
    }
  ): number {
    if (!description || typeof description !== 'string') {
      return Math.max(60, overrides?.minHeight || 60);
    }

    const base = this.config;
    const fontSize = (typeof overrides?.fontSize === 'number' && overrides.fontSize > 0)
      ? overrides.fontSize
      : base.NODE_FONT_SIZE;
    const fontFamily = overrides?.fontFamily || base.NODE_FONT_FAMILY;
    const fontWeight = overrides?.fontWeight || base.NODE_FONT_WEIGHT;
    const paddingH = (typeof overrides?.padding?.horizontal === 'number')
      ? overrides!.padding!.horizontal
      : base.NODE_PADDING.horizontal;
    const paddingV = (typeof overrides?.padding?.vertical === 'number')
      ? overrides!.padding!.vertical
      : base.NODE_PADDING.vertical;
    const hardMaxWidth = (() => {
      if (typeof overrides?.maxWidth === 'number' && overrides.maxWidth > 0) {
        return overrides.maxWidth;
      }
      try {
        const full = diagramConfigManager.getConfig();
        const mw = (full?.node?.maxWidth as number) ?? 0;
        return (typeof mw === 'number' && !isNaN(mw) && mw > 0) ? mw : 420;
      } catch {
        return 420;
      }
    })();

    try {
      const measurement = enhancedTextMeasurement.measureNodeContent(description, {
        fontSize,
        fontFamily,
        fontWeight,
        padding: { horizontal: paddingH, vertical: paddingV },
      });
      const height = this.calculateWrappedContentHeight(measurement.lines, {
        fontSize,
        fontFamily,
        fontWeight,
        lineHeight: 1.4,
        paddingH,
        paddingV,
        maxWidth: hardMaxWidth,
        fallbackHeight: measurement.height,
      });
      return Math.max(overrides?.minHeight || 60, height);
    } catch {
      return Math.max(overrides?.minHeight || 60, 60);
    }
  }

  private calculateWrappedContentHeight(
    lines: string[],
    options: {
      fontSize: number;
      fontFamily: string;
      fontWeight: string;
      lineHeight: number;
      paddingH: number;
      paddingV: number;
      maxWidth: number;
      fallbackHeight?: number;
    }
  ): number {
    if (!Array.isArray(lines) || lines.length === 0) {
      return Math.max(options.paddingV * 2, options.fallbackHeight || 0);
    }

    const contentMaxWidth = Math.max(24, options.maxWidth - options.paddingH * 2 - 12);
    const visualLineCount = lines.reduce((sum, line) => {
      const lineMeasurement = enhancedTextMeasurement.measureNodeContent(line, {
        fontSize: options.fontSize,
        fontFamily: options.fontFamily,
        fontWeight: options.fontWeight,
        padding: { horizontal: 0, vertical: 0 },
      });
      const lineWidth = Math.max(0, lineMeasurement.maxLineWidth || 0);
      return sum + Math.max(1, Math.ceil(lineWidth / contentMaxWidth));
    }, 0);
    const titleGap = lines.length > 1 ? 12 : 0;
    const contentHeight = visualLineCount * options.fontSize * options.lineHeight + options.paddingV * 2 + titleGap;
    return Math.ceil(Math.max(contentHeight, options.fallbackHeight || 0));
  }

  /**
   * 批量计算多个节点的高度（含内边距）
   */
  public calculateMultipleNodeHeights(descriptions: string[], options?: { domainKey?: string }): number[] {
    if (!descriptions || descriptions.length === 0) return [];

    const config = this.config;
    // 字体大小：与 calculateMultipleNodeWidths 保持一致
    let fontSize = (typeof config.NODE_FONT_SIZE === 'number' && !isNaN(config.NODE_FONT_SIZE) && config.NODE_FONT_SIZE > 0) ? config.NODE_FONT_SIZE : 28;
    let paddingV = (typeof config.NODE_PADDING?.vertical === 'number' && !isNaN(config.NODE_PADDING.vertical)) ? config.NODE_PADDING.vertical : 12;
    let paddingH = (typeof config.NODE_PADDING?.horizontal === 'number' && !isNaN(config.NODE_PADDING.horizontal)) ? config.NODE_PADDING.horizontal : 16;

    // 应用紧凑域配置
    if (options?.domainKey && this.COMPACT_DOMAINS[options.domainKey]) {
      const compact = this.COMPACT_DOMAINS[options.domainKey];
      fontSize = Math.round(fontSize * compact.fontScale);
      paddingV = Math.round(paddingV * compact.paddingVScale);
      paddingH = Math.round(paddingH * compact.paddingHScale);
    }

    const measurements = enhancedTextMeasurement.measureMultipleNodes(descriptions, {
      fontSize: fontSize,
      fontFamily: this.config.NODE_FONT_FAMILY,
      fontWeight: this.config.NODE_FONT_WEIGHT,
      padding: { horizontal: paddingH, vertical: paddingV },
    });
    return measurements.map(m => Math.max(m.height, paddingV * 2));
  }

  /**
   * 优化的子域宽度计算
   */
  public calculateSubDomainWidth(
    nodeDescriptions: string[],
    layout: 'single' | 'double' = 'single',
    options?: { domainKey?: string }
  ): number {
    const nodeWidths = this.calculateMultipleNodeWidths(nodeDescriptions, options);

    if (layout === 'double') {
      // 双列布局：计算每行的宽度，取最大值
      const rows: number[] = [];
      for (let i = 0; i < nodeWidths.length; i += 2) {
        const rowWidth = nodeWidths[i] +
          (nodeWidths[i + 1] || 0) +
          (nodeWidths[i + 1] ? this.config.NODE_H_GAP : 0);
        rows.push(rowWidth);
      }
      const maxRowWidth = Math.max(0, ...rows);
      const subGroupPaddingH = this.config.SUB_GROUP_PADDING?.H ?? 30;
      return maxRowWidth + subGroupPaddingH * 2 + 40; // 安全边距
    } else {
      // 单列布局：取最大节点宽度
      const maxNodeWidth = Math.max(0, ...nodeWidths);
      const subGroupPaddingH = this.config.SUB_GROUP_PADDING?.H ?? 30;
      return maxNodeWidth + subGroupPaddingH * 2 + 20; // 安全边距
    }
  }

  /**
   * 优化的域宽度计算
   */
  public calculateDomainWidth(
    subDomainWidths: number[],
    nodeDescriptions: string[] = [],
    layout: 'horizontal' | 'vertical' = 'horizontal',
    options?: { domainKey?: string }
  ): number {
    let maxWidth = 0;

    // 考虑子域宽度
    if (subDomainWidths.length > 0) {
      if (layout === 'horizontal') {
        // 水平排列：所有子域宽度之和加间隙
        const totalSubDomainWidth = subDomainWidths.reduce((sum, w) => sum + w, 0) +
          (subDomainWidths.length - 1) * this.config.DOMAIN_H_GAP;
        maxWidth = Math.max(maxWidth, totalSubDomainWidth);
      } else {
        // 垂直排列：取最大子域宽度
        maxWidth = Math.max(maxWidth, Math.max(0, ...subDomainWidths));
      }
    }

    // 考虑直接节点宽度
    if (nodeDescriptions.length > 0) {
      const nodeWidths = this.calculateMultipleNodeWidths(nodeDescriptions, options);
      const totalNodeWidth = nodeWidths.reduce((sum, w) => sum + w, 0) +
        (nodeWidths.length - 1) * this.config.NODE_H_GAP;
      maxWidth = Math.max(maxWidth, totalNodeWidth);
    }

    const groupPaddingH = this.config.GROUP_PADDING?.H ?? 40;
    // 加上域的内边距和安全边距
    return maxWidth + groupPaddingH * 2 + 60; // 安全边距
  }

  /**
   * 计算单层域的实际需要宽度（基于内容）
   */
  public calculateSingleLayerDomainWidth(domainData: DomainData, domainKey?: string): number {
    const nodeWidths = this.calculateMultipleNodeWidths(domainData.descs, { domainKey });
    const totalNodeWidth = nodeWidths.reduce((sum, w) => sum + w, 0);
    const totalGap = (nodeWidths.length - 1) * this.config.NODE_H_GAP;

    const groupPaddingH = this.config.GROUP_PADDING?.H ?? 40;
    return totalNodeWidth + totalGap + groupPaddingH * 2;
  }

  /**
   * 计算后台域的最小宽度需求（基于实际内容计算）
   */
  public calculateBackendDomainMinWidth(domainData: DomainData, domainKey?: string): number {
    if (!domainData) return 800;

    const nodeWidths = this.calculateMultipleNodeWidths(domainData.descs, { domainKey });

    // 根据域的特点选择布局策略
    if (domainData.nodes.length === 6) {
      // SCM域：2x3布局
      const rows = [
        [nodeWidths[0], nodeWidths[1]], // 第一行
        [nodeWidths[2], nodeWidths[3]], // 第二行
        [nodeWidths[4], nodeWidths[5]]  // 第三行
      ];

      const maxRowWidth = Math.max(0, ...rows.map(row =>
        row.reduce((sum, w) => sum + w, 0) + (row.length - 1) * this.config.NODE_H_GAP
      ));

      const subGroupPaddingH = this.config.SUB_GROUP_PADDING?.H ?? 30;
      return maxRowWidth + subGroupPaddingH * 2 + 40;
    } else if (domainData.nodes.length === 5) {
      // 物流域：1（调度中心） + 3（同排） + 1（计费结算）
      const row1Width = nodeWidths[0] || 0;
      const row2Width = (nodeWidths[1] || 0) + (nodeWidths[2] || 0) + (nodeWidths[3] || 0) + this.config.NODE_H_GAP * 2;
      const row3Width = nodeWidths[4] || 0;
      const maxRowWidth = Math.max(row1Width, row2Width, row3Width);
      const subGroupPaddingH = this.config.SUB_GROUP_PADDING?.H ?? 30;
      return maxRowWidth + subGroupPaddingH * 2 + 40;
    } else {
      // 其他域：单列布局
      const maxNodeWidth = Math.max(0, ...nodeWidths);
      const subGroupPaddingH = this.config.SUB_GROUP_PADDING?.H ?? 30;
      return maxNodeWidth + subGroupPaddingH * 2 + 20;
    }
  }

  /**
   * 获取缓存统计信息
   */
  public getCacheStats(): { size: number; hitRate: number } {
    const q = this.cacheQueryCount;
    const hr = q > 0 ? Math.max(0, Math.min(1, this.cacheHitCount / q)) : 0;
    return { size: this.measurementCache.size, hitRate: hr };
  }

  /**
   * 清空缓存
   */
  public clearCache(): void {
    this.measurementCache.clear();
  }

  /**
   * 计算复杂域的实际需要宽度（包含子域）
   */
  public calculateComplexDomainWidth(domainKey: string, masterData: any): number {
    const domainData = masterData[domainKey];
    if (!domainData) return 800;

    // 根据不同域的特点计算宽度
    switch (domainKey) {
      case 'mid':
        // 中台域：多行布局
        const nodeWidths = this.calculateMultipleNodeWidths(domainData.descs, { domainKey });
        const rows = [
          [nodeWidths[0], nodeWidths[1], nodeWidths[2]], // 第一行：交易、支付、履约
          [nodeWidths[3], nodeWidths[4], nodeWidths[5]], // 第二行：商品、价格、会员
          [nodeWidths[6], nodeWidths[7]], // 第三行：风控、营销
          [nodeWidths[8], nodeWidths[9]]  // 第四行：规则、库存
        ];

        const maxRowWidth = Math.max(0, ...rows.map(row =>
          row.reduce((sum, w) => sum + w, 0) + (row.length - 1) * this.config.NODE_H_GAP
        ));

        const groupPaddingH = this.config.GROUP_PADDING?.H ?? 40;
        return maxRowWidth + groupPaddingH * 2;

      case 'data':
        // 数据域：2x3布局
        return this.calculateSingleLayerDomainWidth(domainData, domainKey);

      default:
        return this.calculateSingleLayerDomainWidth(domainData, domainKey);
    }
  }

  /**
   * 计算后端复合域的宽度（包含三个子域）
   */
  public calculateBackendComplexDomainWidth(masterData: any): number {
    const scmWidth = this.calculateBackendDomainMinWidth(masterData['be-scm'], 'be-scm');
    const logisticsWidth = this.calculateBackendDomainMinWidth(masterData['be-logistics'], 'be-logistics');
    const corpWidth = this.calculateBackendDomainMinWidth(masterData['be-corp'], 'be-corp');

    const beColumnGap = this.config.BE_COLUMN_GAP ?? 60;
    // 三个子域水平排列，加上间隙
    const totalWidth = scmWidth + logisticsWidth + corpWidth + 2 * beColumnGap;

    const groupPaddingH = this.config.GROUP_PADDING?.H ?? 40;
    return totalWidth + groupPaddingH * 2;
  }

  /**
   * 计算所有域的宽度需求
   */
  public calculateAllDomainWidths(masterData: any): { [key: string]: number } {
    if (!masterData) return {}; // 如果 masterData 未定义，则返回空对象
    const domainWidths: { [key: string]: number } = {};

    // 计算后端复合域
    domainWidths['backend'] = this.calculateBackendComplexDomainWidth(masterData);

    // 计算其他域
    for (const [key, domainData] of Object.entries(masterData)) {
      if (key.startsWith('be-')) continue; // 跳过后端子域，已在复合域中计算

      if (key === 'mid' || key === 'data') {
        domainWidths[key] = this.calculateComplexDomainWidth(key, masterData);
      } else {
        domainWidths[key] = this.calculateSingleLayerDomainWidth(domainData as DomainData, key);
      }
    }

    return domainWidths;
  }

  /**
   * 计算统一的域宽度（所有域中的最大宽度）
   */
  public calculateUnifiedDomainWidth(masterData: any): number {
    if (!masterData) return 1200; // 如果 masterData 未定义，则返回默认宽度
    const allWidths = this.calculateAllDomainWidths(masterData);
    const maxWidth = Math.max(0, ...Object.values(allWidths));

    // 确保最小宽度
    return Math.max(maxWidth, 1200);
  }

  /**
   * 计算单层域的实际需要高度（基于内容）
   */
  public calculateSingleLayerDomainHeight(domainData: DomainData, domainKey?: string): number {
    const nodeHeights = this.calculateMultipleNodeHeights(domainData.descs, { domainKey });
    // 假设是单行水平布局，高度由最高的节点决定
    const maxNodeHeight = Math.max(0, ...nodeHeights);

    const groupPaddingV = this.config.GROUP_PADDING?.V ?? 40;
    return maxNodeHeight + groupPaddingV * 2;
  }

  /**
   * 计算后台域的最小高度需求（基于实际内容计算）
   */
  public calculateBackendDomainMinHeight(domainData: DomainData, domainKey?: string): number {
    if (!domainData) return 400; // 默认高度

    const nodeHeights = this.calculateMultipleNodeHeights(domainData.descs, { domainKey });
    let contentHeight = 0;

    // 根据宽度计算中使用的相同布局逻辑来计算高度
    if (domainData.nodes.length === 6) {
      // SCM域：2x3布局 (3行 x 2列)
      const rows = [
        [nodeHeights[0], nodeHeights[1]], // 第1行
        [nodeHeights[2], nodeHeights[3]], // 第2行
        [nodeHeights[4], nodeHeights[5]]  // 第3行
      ];

      const totalRowHeights = rows.map(row => Math.max(row[0] || 0, row[1] || 0))
        .reduce((sum, h) => sum + h, 0);
      contentHeight = totalRowHeights + (rows.length > 1 ? (rows.length - 1) * this.config.NODE_V_GAP : 0);

    } else {
      // 其他域：默认单列布局
      const totalNodeHeight = nodeHeights.reduce((sum, h) => sum + h, 0);
      contentHeight = totalNodeHeight + (nodeHeights.length > 1 ? (nodeHeights.length - 1) * this.config.NODE_V_GAP : 0);
    }

    const subGroupPaddingV = this.config.SUB_GROUP_PADDING.V_TOP + this.config.SUB_GROUP_PADDING.V_BOTTOM;
    return contentHeight + subGroupPaddingV;
  }

  /**
   * 计算复杂域的实际需要高度（包含子域）
   */
  public calculateComplexDomainHeight(domainKey: string, masterData: any): number {
    const domainData = masterData[domainKey];
    if (!domainData) return 400;

    switch (domainKey) {
      case 'mid':
        // 中台域：多行布局
        const nodeHeights = this.calculateMultipleNodeHeights(domainData.descs, { domainKey });
        const rows = [
          [nodeHeights[0], nodeHeights[1], nodeHeights[2]],
          [nodeHeights[3], nodeHeights[4], nodeHeights[5]],
          [nodeHeights[6], nodeHeights[7]],
          [nodeHeights[8], nodeHeights[9]]
        ];

        const totalRowHeights = rows.map(row => Math.max(0, ...row))
          .reduce((sum, h) => sum + h, 0);
        const contentHeight = totalRowHeights + (rows.length > 1 ? (rows.length - 1) * this.config.NODE_V_GAP : 0);

        const groupPaddingV = this.config.GROUP_PADDING?.V ?? 40;
        return contentHeight + groupPaddingV * 2;

      default:
        return this.calculateSingleLayerDomainHeight(domainData as DomainData, domainKey);
    }
  }

  /**
   * 计算后端复合域的高度（包含三个子域）
   */
  public calculateBackendComplexDomainHeight(masterData: any): number {
    const scmHeight = this.calculateBackendDomainMinHeight(masterData['be-scm'], 'be-scm');
    const logisticsHeight = this.calculateBackendDomainMinHeight(masterData['be-logistics'], 'be-logistics');
    const corpHeight = this.calculateBackendDomainMinHeight(masterData['be-corp'], 'be-corp');

    // 水平排列，高度取最大值
    const maxHeight = Math.max(scmHeight, logisticsHeight, corpHeight);

    const groupPaddingV = this.config.GROUP_PADDING?.V ?? 40;
    return maxHeight + groupPaddingV * 2;
  }

  /**
   * 计算自适应画布宽度（统一域宽度加上padding）
   */
  public calculateAdaptiveCanvasWidth(masterData: any): number {
    const unifiedWidth = this.calculateUnifiedDomainWidth(masterData);
    return unifiedWidth + this.config.DOMAIN_H_GAP;
  }
}

// 导出类和单例实例
export default LayoutOptimizer;
export const layoutOptimizer = LayoutOptimizer.getInstance();
