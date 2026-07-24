/**
 * 主题工具函数
 * 提供主题相关的实用工具函数
 */

import { Theme, ThemeColor } from './types/ThemeTypes';
import {
  logThemeValidationMissingField,
  logThemeValidationMissingPaletteColor,
} from './themeInfrastructureLogging';

/**
 * 解析主题域键
 * 将不同的域别名映射到主题中可用的域键
 */
export function resolveThemeDomainKey(
  theme: Theme, 
  domainSource: { domainClass?: string; domain?: string }
): string {
  const { domainClass, domain } = domainSource;
  const domains = theme.diagram?.domains || {};
  
  // 优先使用 domainClass
  if (domainClass && domains[domainClass]) {
    return domainClass;
  }
  
  // 然后使用 domain
  if (domain && domains[domain]) {
    return domain;
  }
  
  // 尝试一些常见的映射
  const domainMappings: Record<string, string[]> = {
    'frontend': ['fe', 'ui', 'client'],
    'backend': ['be', 'server', 'api'],
    'middleware': ['mid', 'queue', 'message'],
    'database': ['db', 'data', 'storage'],
    'external': ['ext', 'third-party', 'integration']
  };
  
  // 根据 domainClass 查找映射
  if (domainClass) {
    for (const [standardDomain, aliases] of Object.entries(domainMappings)) {
      if (aliases.includes(domainClass.toLowerCase()) && domains[standardDomain]) {
        return standardDomain;
      }
    }
  }
  
  // 根据 domain 查找映射
  if (domain) {
    for (const [standardDomain, aliases] of Object.entries(domainMappings)) {
      if (aliases.includes(domain.toLowerCase()) && domains[standardDomain]) {
        return standardDomain;
      }
    }
  }
  
  // 回退到 frontend 或第一个可用域
  if (domains['frontend']) {
    return 'frontend';
  }
  
  const availableDomains = Object.keys(domains);
  return availableDomains.length > 0 ? availableDomains[0] : 'frontend';
}

/**
 * 获取主题颜色（支持域优先）
 */
export function getThemeColor(
  theme: Theme, 
  domainOrSource: string | { domainClass?: string; domain?: string }
): ThemeColor | undefined {
  const domains = theme.diagram?.domains || {};
  
  const source: { domainClass?: string; domain?: string } = 
    typeof domainOrSource === 'string' 
      ? { domain: domainOrSource } 
      : (domainOrSource || {});
  
  const key = resolveThemeDomainKey(theme, source);
  const color = domains[key];
  
  if (color) {
    return color;
  }
  
  // 回退策略
  const fallbackKey = domains['frontend'] ? 'frontend' : Object.keys(domains)[0];
  return fallbackKey ? domains[fallbackKey] : undefined;
}

/**
 * 获取边缘颜色
 */
export function getEdgeColor(theme: Theme, type: string): ThemeColor | undefined {
  return theme.diagram?.edges[type as keyof typeof theme.diagram.edges];
}

/**
 * 将主题颜色转换为CSS变量
 */
export function themeColorToCSS(color: ThemeColor, prefix: string): Record<string, string> {
  return {
    [`--${prefix}-main`]: color.main,
    [`--${prefix}-light`]: color.light,
    [`--${prefix}-dark`]: color.dark,
    [`--${prefix}-contrast`]: color.contrast,
    [`--${prefix}-border`]: color.border,
    [`--${prefix}-background`]: color.background,
    [`--${prefix}-text`]: color.text,
    [`--${prefix}-shadow`]: color.shadow
  };
}

/**
 * 将完整主题转换为CSS变量
 */
export function themeToCSSVariables(theme: Theme): Record<string, string> {
  const cssVars: Record<string, string> = {};
  
  // 基础调色板
  const palette = theme.palette;
  Object.entries(palette).forEach(([key, color]) => {
    const vars = themeColorToCSS(color, `theme-${key}`);
    Object.assign(cssVars, vars);
  });
  
  // 图表域颜色
  const domains = theme.diagram?.domains || {};
  Object.entries(domains).forEach(([key, color]) => {
    const vars = themeColorToCSS(color, `theme-domain-${key}`);
    Object.assign(cssVars, vars);
  });
  
  // 图表边颜色
  const edges = theme.diagram?.edges || {};
  Object.entries(edges).forEach(([key, color]) => {
    const vars = themeColorToCSS(color, `theme-edge-${key}`);
    Object.assign(cssVars, vars);
  });
  
  // 图表节点颜色
  const nodes = theme.diagram?.nodes || {};
  Object.entries(nodes).forEach(([key, color]) => {
    const vars = themeColorToCSS(color, `theme-node-${key}`);
    Object.assign(cssVars, vars);
  });
  
  // 画布背景
  if (theme.diagram?.canvas?.background) {
    cssVars['--theme-canvas-background'] = theme.diagram.canvas.background;
  }
  
  return cssVars;
}

/**
 * 应用CSS变量到元素
 */
export function applyCSSVariables(
  element: HTMLElement, 
  variables: Record<string, string>
): void {
  Object.entries(variables).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
}

/**
 * 移除CSS变量
 */
export function removeCSSVariables(
  element: HTMLElement, 
  variables: Record<string, string>
): void {
  Object.keys(variables).forEach(key => {
    element.style.removeProperty(key);
  });
}

/**
 * 主题颜色工具函数
 */
export class ThemeColorUtil {
  /**
   * 将十六进制颜色转换为RGB
   */
  static hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
  
  /**
   * 将RGB转换为十六进制颜色
   */
  static rgbToHex(r: number, g: number, b: number): string {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  
  /**
   * 计算颜色的亮度
   */
  static getLuminance(color: ThemeColor): number {
    const rgb = this.hexToRgb(color.main);
    if (!rgb) return 0;
    
    // 使用相对亮度公式
    return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  }
  
  /**
   * 判断颜色是否为亮色
   */
  static isLightColor(color: ThemeColor): boolean {
    return this.getLuminance(color) > 0.5;
  }
  
  /**
   * 判断颜色是否为暗色
   */
  static isDarkColor(color: ThemeColor): boolean {
    return this.getLuminance(color) <= 0.5;
  }
  
  /**
   * 获取合适的对比色
   */
  static getContrastColor(color: ThemeColor): string {
    return this.isLightColor(color) ? '#000000' : '#ffffff';
  }
}

/**
 * 主题验证工具函数
 */
export function validateTheme(theme: unknown): theme is Theme {
  if (!theme || typeof theme !== 'object') {
    return false;
  }
  const candidate = theme as Record<string, unknown>;
  
  const requiredFields = ['id', 'name', 'mode', 'palette', 'typography', 'spacing', 'borderRadius', 'shadow', 'animation', 'diagram'];
  for (const field of requiredFields) {
    if (!(field in candidate)) {
      logThemeValidationMissingField(field);
      return false;
    }
  }
  
  // 验证必需的颜色字段
  const palette = candidate.palette;
  if (!palette || typeof palette !== 'object') return false;
  const requiredColors = ['primary', 'secondary', 'success', 'warning', 'error', 'info', 'neutral'];
  for (const color of requiredColors) {
    if (!(color in palette)) {
      logThemeValidationMissingPaletteColor(color);
      return false;
    }
  }
  
  return true;
}
