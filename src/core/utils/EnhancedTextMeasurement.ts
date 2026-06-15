/**
 * 增强版文本测量系统
 * 集成缓存机制、批量处理和性能优化
 */

import { sanitizeMarkdownHtml } from './sanitizeHtml';

interface TextMeasurementOptions {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  lineHeight?: number;
  padding?: { horizontal: number; vertical: number };
}

interface MeasurementResult {
  width: number;
  height: number;
  lines: string[];
  maxLineWidth: number;
}

interface CacheEntry {
  result: MeasurementResult;
  timestamp: number;
  options: Required<TextMeasurementOptions>;
}

interface MeasurementCache {
  [key: string]: CacheEntry;
}

/**
 * 增强版文本测量类
 * 提供高性能的文本尺寸测量，支持缓存和批量处理
 */
export class EnhancedTextMeasurement {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cache: MeasurementCache = {};
  private cacheMaxAge = 5 * 60 * 1000; // 5分钟缓存（自适应调节）
  private cacheMaxSize = 1000; // 最大缓存条目数
  private cacheQueryCount = 0; // 缓存查询次数
  private cacheHitCount = 0;   // 缓存命中次数
  private lastTtlAdjustAt = 0; // 上次TTL调整时间戳
  private gcTimerId: number | null = null; // 缓存清理定时器ID
  
  private defaultOptions: Required<TextMeasurementOptions> = {
    fontSize: 18,
    fontFamily: 'Arial, sans-serif',
    fontWeight: 'normal',
    lineHeight: 1.4,
    padding: { horizontal: 16, vertical: 12 }
  };

  constructor() {
    this.canvas = document.createElement('canvas');
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('无法创建Canvas 2D上下文');
    }
    this.ctx = context;
    
    // 定期清理过期缓存
    this.gcTimerId = (setInterval(() => this.cleanExpiredCache(), 60000) as unknown as number); // 每分钟清理一次
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(content: string, options: Required<TextMeasurementOptions>): string {
    return `${content}|${options.fontSize}|${options.fontFamily}|${options.fontWeight}|${options.lineHeight}|${options.padding.horizontal}|${options.padding.vertical}`;
  }

  /**
   * 从缓存获取结果
   */
  private getFromCache(key: string): MeasurementResult | null {
    this.cacheQueryCount++;
    const entry = this.cache[key];
    if (!entry) return null;
    
    // 检查是否过期
    if (Date.now() - entry.timestamp > this.cacheMaxAge) {
      delete this.cache[key];
      return null;
    }
    
    this.cacheHitCount++;
    return entry.result;
  }

  /**
   * 存储到缓存
   */
  private storeToCache(key: string, result: MeasurementResult, options: Required<TextMeasurementOptions>): void {
    // 如果缓存已满，删除最旧的条目
    if (Object.keys(this.cache).length >= this.cacheMaxSize) {
      this.cleanOldestCache();
    }
    
    this.cache[key] = {
      result,
      timestamp: Date.now(),
      options
    };
  }

  /**
   * 清理过期缓存
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of Object.entries(this.cache)) {
      if (now - entry.timestamp > this.cacheMaxAge) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => delete this.cache[key]);
  }

  /**
   * 缓存TTL自适应调整（函数级注释）
   * - 依据近期命中率动态调整 TTL：高命中延长，低命中缩短
   * - 调整窗口期：至少每 60s 执行一次；避免频繁抖动
   * - 阈值：hitRate ≥0.8 → 8min；≥0.6 → 6min；≥0.4 → 5min；否则 3min
   */
  private adjustTTLIfNeeded(): void {
    const now = Date.now();
    const MIN_INTERVAL = 60 * 1000;
    if (now - this.lastTtlAdjustAt < MIN_INTERVAL) return;
    const q = this.cacheQueryCount;
    if (q <= 0) return;
    const hitRate = Math.max(0, Math.min(1, this.cacheHitCount / q));
    const minutes = hitRate >= 0.8 ? 8 : hitRate >= 0.6 ? 6 : hitRate >= 0.4 ? 5 : 3;
    this.cacheMaxAge = minutes * 60 * 1000;
    this.lastTtlAdjustAt = now;
  }

  /**
   * 清理最旧的缓存条目
   */
  private cleanOldestCache(): void {
    let oldestKey = '';
    let oldestTime = Date.now();
    
    for (const [key, entry] of Object.entries(this.cache)) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      delete this.cache[oldestKey];
    }
  }

  /**
   * 设置Canvas字体样式
   */
  private setFont(options: Required<TextMeasurementOptions>): void {
    this.ctx.font = `${options.fontWeight} ${options.fontSize}px ${options.fontFamily}`;
  }

  /**
   * 解析HTML内容为文本行数组（函数级注释）
   * - 支持 <br>、<b>/<strong> 粗体、<div>/<p> 块级换行；
   * - 增强：识别 <li> 要点行，直接产出以 "• " 前缀的独立行；
   * - 后处理：将包含 "•" 的混合行拆分为多行，保证“要点分行”。
   */
  private parseHtmlContent(htmlContent: string): string[] {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = sanitizeMarkdownHtml(htmlContent);
    
    const lines: string[] = [];
    let currentLine = '';
    
    const extractTextLines = (element: Element | Node) => {
      for (const node of Array.from(element.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || '';
          currentLine += text;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const elem = node as Element;
          const tagName = elem.tagName.toLowerCase();
          
          if (tagName === 'br') {
            // 遇到<br>标签，结束当前行
            if (currentLine.trim()) {
              lines.push(currentLine.trim());
            }
            currentLine = '';
          } else if (tagName === 'b' || tagName === 'strong') {
            // 处理粗体标签，保留文本内容
            const boldText = elem.textContent || '';
            currentLine += boldText;
          } else if (tagName === 'li') {
            // 列表项：视为独立要点行
            if (currentLine.trim()) {
              lines.push(currentLine.trim());
              currentLine = '';
            }
            const liText = (elem.textContent || '').trim();
            if (liText.length > 0) {
              lines.push('• ' + liText);
            }
          } else if (tagName === 'div' || tagName === 'p' || tagName === 'ul' || tagName === 'ol') {
            // 块级元素，先结束当前行
            if (currentLine.trim()) {
              lines.push(currentLine.trim());
              currentLine = '';
            }
            // 递归处理内容
            extractTextLines(elem);
            // 块级元素后换行
            if (currentLine.trim()) {
              lines.push(currentLine.trim());
              currentLine = '';
            }
          } else {
            // 递归处理其他元素
            extractTextLines(elem);
          }
        }
      }
    };
    
    extractTextLines(tempDiv);
    
    // 添加最后一行（如果有内容）
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }
    
    // 处理项目符号行，确保每个•开头的内容都是独立的行
    const processedLines: string[] = [];
    for (const line of lines) {
      if (line.includes('•')) {
        // 按•分割成多行
        const bulletParts = line.split('•').map(part => part.trim()).filter(part => part.length > 0);
        for (const part of bulletParts) {
          processedLines.push('• ' + part);
        }
      } else {
        processedLines.push(line);
      }
    }
    
    return processedLines.filter(line => line.length > 0);
  }

  /**
   * 测量单行文本宽度
   */
  private measureLineWidth(text: string): number {
    if (!text || typeof text !== 'string') {
      return 0;
    }
    
    try {
      const width = this.ctx.measureText(text).width;
      // 确保返回值是有效数字
      return (typeof width === 'number' && !isNaN(width) && isFinite(width)) ? width : 0;
    } catch (error) {
      console.warn('Canvas measureText failed, using estimation:', error);
      return this.estimateTextWidth(text, this.defaultOptions.fontSize);
    }
  }

  /**
   * 估算中文字符宽度（Canvas不可用时的回退方案）
   */
  private estimateTextWidth(text: string, fontSize: number): number {
    if (!text || typeof text !== 'string') {
      return 0;
    }
    
    // 确保 fontSize 是有效数字
    const validFontSize = (typeof fontSize === 'number' && !isNaN(fontSize) && fontSize > 0) ? fontSize : 16;
    
    let width = 0;
    for (const char of text) {
      // 中文字符大约占1个字符宽度，英文字符约占0.6个字符宽度
      if (/[\u4e00-\u9fff]/.test(char)) {
        width += validFontSize * 0.9; // 中文字符
      } else if (/[A-Za-z0-9]/.test(char)) {
        width += validFontSize * 0.6; // 英文数字
      } else {
        width += validFontSize * 0.4; // 其他字符
      }
    }
    
    // 确保返回值是有效数字
    return (typeof width === 'number' && !isNaN(width) && isFinite(width)) ? width : 0;
  }

  /**
   * 测量节点内容的尺寸需求（带缓存）
   */
  public measureNodeContent(
    content: string, 
    options: Partial<TextMeasurementOptions> = {}
  ): MeasurementResult {
    const opts = { ...this.defaultOptions, ...options };
    const cacheKey = this.generateCacheKey(content, opts);
    
    // 尝试从缓存获取
    const cachedResult = this.getFromCache(cacheKey);
    if (cachedResult) {
      this.adjustTTLIfNeeded();
      return cachedResult;
    }
    
    let result: MeasurementResult;
    
    try {
      this.setFont(opts);
      
      // 解析HTML内容获取文本行
      const lines = this.parseHtmlContent(content);
      
      // 如果没有有效的文本行，返回最小尺寸
      if (lines.length === 0) {
        result = {
          width: opts.padding.horizontal * 2,
          height: opts.padding.vertical * 2,
          lines: [],
          maxLineWidth: 0
        };
      } else {
        let maxLineWidth = 0;
        const lineWidths: number[] = [];
        
        // 测量每行文本宽度
        for (const line of lines) {
          const lineWidth = this.measureLineWidth(line);
          lineWidths.push(lineWidth);
          maxLineWidth = Math.max(maxLineWidth, lineWidth);
        }
        
        // 计算总尺寸 (增加多行标题下方的分割线额外高度补偿)
        const titleGap = lines.length > 1 ? 12 : 0;
        const contentWidth = maxLineWidth + opts.padding.horizontal * 2;
        const contentHeight = lines.length * opts.fontSize * opts.lineHeight + opts.padding.vertical * 2 + titleGap;
      
        // 确保计算结果是有效数字
        const validWidth = (typeof contentWidth === 'number' && !isNaN(contentWidth) && isFinite(contentWidth)) ? contentWidth : opts.padding.horizontal * 2;
        const validHeight = (typeof contentHeight === 'number' && !isNaN(contentHeight) && isFinite(contentHeight)) ? contentHeight : opts.padding.vertical * 2;
        const validMaxLineWidth = (typeof maxLineWidth === 'number' && !isNaN(maxLineWidth) && isFinite(maxLineWidth)) ? maxLineWidth : 0;
      
        result = {
          width: Math.ceil(validWidth),
          height: Math.ceil(validHeight),
          lines,
          maxLineWidth: Math.ceil(validMaxLineWidth)
        };
      }
      
    } catch (error) {
      // Canvas不可用时使用估算方法
      console.warn('Canvas测量失败，使用估算方法:', error);
      result = this.estimateNodeContent(content, opts);
    }
    
    // 存储到缓存
    this.storeToCache(cacheKey, result, opts);
    this.adjustTTLIfNeeded();
    
    return result;
  }

  /**
   * 估算节点内容尺寸（回退方案）
   */
  private estimateNodeContent(
    content: string, 
    options: Required<TextMeasurementOptions>
  ): MeasurementResult {
    const lines = this.parseHtmlContent(content);
    
    // 如果没有有效的文本行，返回最小尺寸
    if (lines.length === 0) {
      return {
        width: options.padding.horizontal * 2,
        height: options.padding.vertical * 2,
        lines: [],
        maxLineWidth: 0
      };
    }
    
    let maxLineWidth = 0;
    
    for (const line of lines) {
      const estimatedWidth = this.estimateTextWidth(line, options.fontSize);
      maxLineWidth = Math.max(maxLineWidth, estimatedWidth);
    }
    
    // (增加多行标题下方的分割线额外高度补偿)
    const titleGap = lines.length > 1 ? 12 : 0;
    const contentWidth = maxLineWidth + options.padding.horizontal * 2;
    const contentHeight = lines.length * options.fontSize * options.lineHeight + options.padding.vertical * 2 + titleGap;
    
    return {
      width: Math.ceil(contentWidth),
      height: Math.ceil(contentHeight),
      lines,
      maxLineWidth: Math.ceil(maxLineWidth)
    };
  }

  /**
   * 批量测量多个节点内容（优化版）
   */
  public measureMultipleNodes(
    contents: string[], 
    options: Partial<TextMeasurementOptions> = {}
  ): MeasurementResult[] {
    const opts = { ...this.defaultOptions, ...options };
    const results: MeasurementResult[] = [];
    const uncachedContents: { content: string; index: number }[] = [];
    
    // 第一遍：检查缓存
    for (let i = 0; i < contents.length; i++) {
      const content = contents[i];
      const cacheKey = this.generateCacheKey(content, opts);
      const cachedResult = this.getFromCache(cacheKey);
      
      if (cachedResult) {
        results[i] = cachedResult;
      } else {
        uncachedContents.push({ content, index: i });
      }
    }
    
    // 第二遍：批量处理未缓存的内容
    if (uncachedContents.length > 0) {
      this.setFont(opts);
      
      for (const { content, index } of uncachedContents) {
        const result = this.measureNodeContent(content, options);
        results[index] = result;
      }
    }
    this.adjustTTLIfNeeded();
    
    return results;
  }

  /**
   * 获取最大宽度需求
   */
  public getMaxWidth(measurements: MeasurementResult[]): number {
    return Math.max(...measurements.map(m => m.width));
  }

  /**
   * 获取缓存统计信息
   */
  public getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    const q = this.cacheQueryCount;
    const hr = q > 0 ? Math.max(0, Math.min(1, this.cacheHitCount / q)) : 0;
    return { size: Object.keys(this.cache).length, maxSize: this.cacheMaxSize, hitRate: hr };
  }

  /**
   * 清空缓存
   */
  public clearCache(): void {
    this.cache = {};
  }

  /**
   * 销毁测量器（函数级注释）
   * - 清理缓存定时器，释放引用，避免页面卸载后残留任务
   * - 清空现有缓存与画布上下文引用
   */
  public dispose(): void {
    try {
      if (this.gcTimerId !== null) {
        clearInterval(this.gcTimerId as unknown as number);
        this.gcTimerId = null;
      }
    } catch {}
    this.clearCache();
    // 不销毁 ctx 和 canvas，因为这是单例模式，后续还会复用
  }

  /**
   * 预热缓存 - 批量预测量常用内容
   */
  public warmupCache(contents: string[], options: Partial<TextMeasurementOptions> = {}): void {
    this.measureMultipleNodes(contents, options);
  }
}

// 创建全局增强实例
export const enhancedTextMeasurement = new EnhancedTextMeasurement();

/**
 * 便捷函数：测量单个节点内容
 */
export function measureNodeContent(
  content: string, 
  options?: Partial<TextMeasurementOptions>
): MeasurementResult {
  return enhancedTextMeasurement.measureNodeContent(content, options);
}

/**
 * 便捷函数：批量测量节点内容
 */
export function measureMultipleNodes(
  contents: string[], 
  options?: Partial<TextMeasurementOptions>
): MeasurementResult[] {
  return enhancedTextMeasurement.measureMultipleNodes(contents, options);
}
