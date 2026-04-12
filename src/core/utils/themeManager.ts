import { DomainTheme } from '../types/common';

/**
 * 统一主题管理器
 * 整合所有图表的主题配置，避免重复定义
 */

// 基础颜色调色板
export const COLOR_PALETTE = {
  // 主色调
  PRIMARY: {
    BLUE: '#3B82F6',
    GREEN: '#10B981',
    PURPLE: '#8B5CF6',
    ORANGE: '#F59E0B',
    RED: '#EF4444',
    INDIGO: '#6366F1',
    PINK: '#EC4899',
    TEAL: '#14B8A6',
  },
  
  // 中性色
  NEUTRAL: {
    WHITE: '#FFFFFF',
    GRAY_50: '#F9FAFB',
    GRAY_100: '#F3F4F6',
    GRAY_200: '#E5E7EB',
    GRAY_300: '#D1D5DB',
    GRAY_400: '#9CA3AF',
    GRAY_500: '#6B7280',
    GRAY_600: '#4B5563',
    GRAY_700: '#374151',
    GRAY_800: '#1F2937',
    GRAY_900: '#111827',
    BLACK: '#000000',
  },
  
  // 语义化颜色
  SEMANTIC: {
    SUCCESS: '#10B981',
    WARNING: '#F59E0B',
    ERROR: '#EF4444',
    INFO: '#3B82F6',
  },
  
  // 渐变色
  GRADIENTS: {
    BLUE: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    GREEN: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    PURPLE: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    ORANGE: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  },
} as const;

// 域主题预设
export const DOMAIN_THEMES = {
  // 业务域主题
  BUSINESS: {
    background: COLOR_PALETTE.PRIMARY.BLUE,
    border: COLOR_PALETTE.PRIMARY.BLUE,
    text: COLOR_PALETTE.NEUTRAL.WHITE,
    accent: COLOR_PALETTE.PRIMARY.INDIGO,
  },
  
  // 数据域主题
  DATA: {
    background: COLOR_PALETTE.PRIMARY.GREEN,
    border: COLOR_PALETTE.PRIMARY.GREEN,
    text: COLOR_PALETTE.NEUTRAL.WHITE,
    accent: COLOR_PALETTE.PRIMARY.TEAL,
  },
  
  // 中台域主题
  MIDDLEWARE: {
    background: COLOR_PALETTE.PRIMARY.PURPLE,
    border: COLOR_PALETTE.PRIMARY.PURPLE,
    text: COLOR_PALETTE.NEUTRAL.WHITE,
    accent: COLOR_PALETTE.PRIMARY.PINK,
  },
  
  // 渠道域主题
  CHANNEL: {
    background: COLOR_PALETTE.PRIMARY.ORANGE,
    border: COLOR_PALETTE.PRIMARY.ORANGE,
    text: COLOR_PALETTE.NEUTRAL.WHITE,
    accent: COLOR_PALETTE.PRIMARY.RED,
  },
  
  // 基础设施主题
  INFRASTRUCTURE: {
    background: COLOR_PALETTE.NEUTRAL.GRAY_600,
    border: COLOR_PALETTE.NEUTRAL.GRAY_600,
    text: COLOR_PALETTE.NEUTRAL.WHITE,
    accent: COLOR_PALETTE.NEUTRAL.GRAY_500,
  },
  
  // 物流主题
  LOGISTICS: {
    background: COLOR_PALETTE.PRIMARY.TEAL,
    border: COLOR_PALETTE.PRIMARY.TEAL,
    text: COLOR_PALETTE.NEUTRAL.WHITE,
    accent: COLOR_PALETTE.PRIMARY.GREEN,
  },
  
  // 供应链主题
  SCM: {
    background: COLOR_PALETTE.PRIMARY.INDIGO,
    border: COLOR_PALETTE.PRIMARY.INDIGO,
    text: COLOR_PALETTE.NEUTRAL.WHITE,
    accent: COLOR_PALETTE.PRIMARY.BLUE,
  },
  
  // 企业主题
  CORPORATE: {
    background: COLOR_PALETTE.PRIMARY.PINK,
    border: COLOR_PALETTE.PRIMARY.PINK,
    text: COLOR_PALETTE.NEUTRAL.WHITE,
    accent: COLOR_PALETTE.PRIMARY.RED,
  },
} as const;

// 主题变体
export const THEME_VARIANTS = {
  LIGHT: 'light',
  DARK: 'dark',
  HIGH_CONTRAST: 'high-contrast',
  OCEAN: 'ocean',
  SUNSET: 'sunset',
  FOREST: 'forest',
  MONO: 'mono',
} as const;

// 主题管理器类
export class ThemeManager {
  private static instance: ThemeManager;
  private themes: Map<string, Record<string, DomainTheme>> = new Map();
  private currentTheme: string = THEME_VARIANTS.LIGHT;
  
  private constructor() {
    this.initializeDefaultThemes();
  }
  
  public static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }
  
  private initializeDefaultThemes(): void {
    // 注册默认主题
    this.registerTheme(THEME_VARIANTS.LIGHT, this.createLightTheme());
    this.registerTheme(THEME_VARIANTS.DARK, this.createDarkTheme());
    this.registerTheme(THEME_VARIANTS.HIGH_CONTRAST, this.createHighContrastTheme());
    this.registerTheme(THEME_VARIANTS.OCEAN, this.createOceanTheme());
    this.registerTheme(THEME_VARIANTS.SUNSET, this.createSunsetTheme());
    this.registerTheme(THEME_VARIANTS.FOREST, this.createForestTheme());
    this.registerTheme(THEME_VARIANTS.MONO, this.createMonoTheme());
  }
  
  private createLightTheme(): Record<string, DomainTheme> {
    return {
      business: DOMAIN_THEMES.BUSINESS,
      data: DOMAIN_THEMES.DATA,
      middleware: DOMAIN_THEMES.MIDDLEWARE,
      channel: DOMAIN_THEMES.CHANNEL,
      infrastructure: DOMAIN_THEMES.INFRASTRUCTURE,
      logistics: DOMAIN_THEMES.LOGISTICS,
      scm: DOMAIN_THEMES.SCM,
      corporate: DOMAIN_THEMES.CORPORATE,
    };
  }
  
  private createDarkTheme(): Record<string, DomainTheme> {
    return {
      business: {
        background: COLOR_PALETTE.NEUTRAL.GRAY_800,
        border: COLOR_PALETTE.PRIMARY.BLUE,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.PRIMARY.INDIGO,
      },
      data: {
        background: COLOR_PALETTE.NEUTRAL.GRAY_800,
        border: COLOR_PALETTE.PRIMARY.GREEN,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.PRIMARY.TEAL,
      },
      middleware: {
        background: COLOR_PALETTE.NEUTRAL.GRAY_800,
        border: COLOR_PALETTE.PRIMARY.PURPLE,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.PRIMARY.PINK,
      },
      channel: {
        background: COLOR_PALETTE.NEUTRAL.GRAY_800,
        border: COLOR_PALETTE.PRIMARY.ORANGE,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.PRIMARY.RED,
      },
      infrastructure: {
        background: COLOR_PALETTE.NEUTRAL.GRAY_900,
        border: COLOR_PALETTE.NEUTRAL.GRAY_500,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.NEUTRAL.GRAY_400,
      },
      logistics: {
        background: COLOR_PALETTE.NEUTRAL.GRAY_800,
        border: COLOR_PALETTE.PRIMARY.TEAL,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.PRIMARY.GREEN,
      },
      scm: {
        background: COLOR_PALETTE.NEUTRAL.GRAY_800,
        border: COLOR_PALETTE.PRIMARY.INDIGO,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.PRIMARY.BLUE,
      },
      corporate: {
        background: COLOR_PALETTE.NEUTRAL.GRAY_800,
        border: COLOR_PALETTE.PRIMARY.PINK,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.PRIMARY.RED,
      },
    };
  }
  
  private createHighContrastTheme(): Record<string, DomainTheme> {
    return {
      business: {
        background: COLOR_PALETTE.NEUTRAL.BLACK,
        border: COLOR_PALETTE.NEUTRAL.WHITE,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.SEMANTIC.INFO,
      },
      data: {
        background: COLOR_PALETTE.NEUTRAL.BLACK,
        border: COLOR_PALETTE.NEUTRAL.WHITE,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.SEMANTIC.SUCCESS,
      },
      middleware: {
        background: COLOR_PALETTE.NEUTRAL.BLACK,
        border: COLOR_PALETTE.NEUTRAL.WHITE,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.PRIMARY.PURPLE,
      },
      channel: {
        background: COLOR_PALETTE.NEUTRAL.BLACK,
        border: COLOR_PALETTE.NEUTRAL.WHITE,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.SEMANTIC.WARNING,
      },
      infrastructure: {
        background: COLOR_PALETTE.NEUTRAL.BLACK,
        border: COLOR_PALETTE.NEUTRAL.WHITE,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.NEUTRAL.GRAY_400,
      },
      logistics: {
        background: COLOR_PALETTE.NEUTRAL.BLACK,
        border: COLOR_PALETTE.NEUTRAL.WHITE,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.PRIMARY.TEAL,
      },
      scm: {
        background: COLOR_PALETTE.NEUTRAL.BLACK,
        border: COLOR_PALETTE.NEUTRAL.WHITE,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.PRIMARY.INDIGO,
      },
      corporate: {
        background: COLOR_PALETTE.NEUTRAL.BLACK,
        border: COLOR_PALETTE.NEUTRAL.WHITE,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.PRIMARY.PINK,
      },
    };
  }
  
  private createOceanTheme(): Record<string, DomainTheme> {
    const oceanBlue = '#006994';
    const oceanTeal = '#4DD0E1';
    const oceanDeep = '#003D5B';
    
    return Object.keys(DOMAIN_THEMES).reduce((themes, key) => {
      themes[key] = {
        background: oceanBlue,
        border: oceanTeal,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: oceanDeep,
      };
      return themes;
    }, {} as Record<string, DomainTheme>);
  }
  
  private createSunsetTheme(): Record<string, DomainTheme> {
    const sunsetOrange = '#FF6B35';
    const sunsetPink = '#F7931E';
    const sunsetRed = '#C5282F';
    
    return Object.keys(DOMAIN_THEMES).reduce((themes, key) => {
      themes[key] = {
        background: sunsetOrange,
        border: sunsetPink,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: sunsetRed,
      };
      return themes;
    }, {} as Record<string, DomainTheme>);
  }
  
  private createForestTheme(): Record<string, DomainTheme> {
    const forestGreen = '#2D5016';
    const forestLight = '#4F7942';
    const forestDark = '#1B3409';
    
    return Object.keys(DOMAIN_THEMES).reduce((themes, key) => {
      themes[key] = {
        background: forestGreen,
        border: forestLight,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: forestDark,
      };
      return themes;
    }, {} as Record<string, DomainTheme>);
  }
  
  private createMonoTheme(): Record<string, DomainTheme> {
    return Object.keys(DOMAIN_THEMES).reduce((themes, key) => {
      themes[key] = {
        background: COLOR_PALETTE.NEUTRAL.GRAY_700,
        border: COLOR_PALETTE.NEUTRAL.GRAY_500,
        text: COLOR_PALETTE.NEUTRAL.WHITE,
        accent: COLOR_PALETTE.NEUTRAL.GRAY_400,
      };
      return themes;
    }, {} as Record<string, DomainTheme>);
  }
  
  public registerTheme(name: string, theme: Record<string, DomainTheme>): void {
    this.themes.set(name, theme);
  }
  
  public getTheme(name?: string): Record<string, DomainTheme> {
    const themeName = name || this.currentTheme;
    const theme = this.themes.get(themeName);
    if (theme) return theme;
    // Fallback to light theme or empty object if light theme missing (should not happen)
    return this.themes.get(THEME_VARIANTS.LIGHT) || {};
  }
  
  public setCurrentTheme(name: string): void {
    if (this.themes.has(name)) {
      this.currentTheme = name;
    }
  }
  
  public getCurrentTheme(): string {
    return this.currentTheme;
  }
  
  public getAllThemes(): string[] {
    return Array.from(this.themes.keys());
  }
  
  public getDomainTheme(domain: string, themeName?: string): DomainTheme {
    const theme = this.getTheme(themeName);
    return theme[domain] || theme.business || DOMAIN_THEMES.BUSINESS;
  }
  
  public createCustomTheme(name: string, baseTheme: string, overrides: Partial<Record<string, DomainTheme>>): void {
    const base = this.getTheme(baseTheme);
    const customTheme = { ...base, ...overrides } as Record<string, DomainTheme>;
    this.registerTheme(name, customTheme);
  }
}

// 导出单例实例
export const themeManager = ThemeManager.getInstance();

// 便捷函数
export const getTheme = (name?: string) => themeManager.getTheme(name);
export const getDomainTheme = (domain: string, themeName?: string) => 
  themeManager.getDomainTheme(domain, themeName);
export const setTheme = (name: string) => themeManager.setCurrentTheme(name);
export const getCurrentTheme = () => themeManager.getCurrentTheme();
