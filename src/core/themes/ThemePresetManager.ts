/**
 * 主题预设管理器
 * 提供主题预设的创建、管理、导入导出功能
 */

import type {
  Theme,
  ThemePreset,
  ThemeColor,
  ThemePalette,
  ThemeTypography,
  ThemeSpacing,
  ThemeBorderRadius,
  ThemeShadow,
  ThemeAnimation
} from './types/ThemeTypes';
import { LayeredConfigManager, ConfigLayer } from '../config/LayeredConfigManager';
import {
  coerceThemePackageImport,
  coerceThemePresetImport,
  parseThemeImportJson,
} from './themeImportSecurity';
import {
  logThemePresetManagerCannotDeleteBuiltIn,
  logThemePresetManagerCannotUpdateBuiltIn,
  logThemePresetManagerInvalidSavedPreset,
  logThemePresetManagerLoadFailure,
  logThemePresetManagerPresetMissing,
  logThemePresetManagerTemplateMissing,
} from './themeInfrastructureLogging';
// import { wmsProfessionalThemePreset } from './WmsProfessionalTheme';

// 重新导出ThemePreset以便其他模块使用
export type { ThemePreset } from './types/ThemeTypes';

export interface PresetCategory {
  id: string;
  name: string;
  description: string;
  icon?: string;
  order: number;
}

export interface PresetFilter {
  category?: string;
  tags?: string[];
  author?: string;
  search?: string;
}

export interface PresetSortOptions {
  field: 'name' | 'createdAt' | 'updatedAt' | 'category' | 'author';
  order: 'asc' | 'desc';
}

export interface PresetExportOptions {
  includePreview: boolean;
  includeMetadata: boolean;
  format: 'json' | 'theme-pack';
}

export interface PresetImportResult {
  success: boolean;
  preset?: ThemePreset;
  error?: string;
  warnings?: string[];
}

export interface ThemePackage {
  version: string;
  name: string;
  description?: string;
  author?: string;
  presets: ThemePreset[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}

type ThemePresetCategory = ThemePreset['category'];
type ThemePresetMetadata = {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  author?: string;
};
type ThemePackageInfo = {
  name: string;
  description?: string;
  author?: string;
  metadata?: Record<string, unknown>;
};

const MAX_PRESET_METADATA_TEXT = 240;
const MAX_PRESET_TAGS = 16;
const MAX_PRESET_TAG_LENGTH = 40;
const VALID_THEME_PRESET_CATEGORIES = new Set<ThemePresetCategory>(['built-in', 'preset', 'custom', 'community']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const coerceOptionalText = (value: unknown, maxLength = MAX_PRESET_METADATA_TEXT): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
};

const coerceTags = (tags: unknown): string[] => (
  Array.isArray(tags)
    ? tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map(tag => tag.trim().slice(0, MAX_PRESET_TAG_LENGTH))
        .filter(Boolean)
        .slice(0, MAX_PRESET_TAGS)
    : []
);

const coercePresetCategory = (category: unknown, fallback: ThemePresetCategory = 'custom'): ThemePresetCategory => (
  typeof category === 'string' && VALID_THEME_PRESET_CATEGORIES.has(category as ThemePresetCategory)
    ? category as ThemePresetCategory
    : fallback
);

// 预设分类定义
const DEFAULT_CATEGORIES: PresetCategory[] = [
  {
    id: 'built-in',
    name: '内置主题',
    description: '系统内置的主题预设',
    icon: '🏠',
    order: 1
  },
  {
    id: 'preset',
    name: '系统预设',
    description: '系统提供的主题预设',
    icon: '💼',
    order: 2
  },
  {
    id: 'community',
    name: '社区主题',
    description: '来自社区贡献的主题',
    icon: '🎨',
    order: 3
  },
  {
    id: 'custom',
    name: '自定义主题',
    description: '用户创建的自定义主题',
    icon: '♿',
    order: 4
  }
];

// 主题模板定义
export interface ThemeTemplate {
  id: string;
  name: string;
  description: string;
  baseTheme: string;
  customizations: {
    palette?: Partial<ThemePalette>;
    diagram?: {
      domains?: Record<string, ThemeColor>;
      edges?: Partial<{
        default: ThemeColor;
        primary: ThemeColor;
        secondary: ThemeColor;
        dashed: ThemeColor;
      }>;
      canvas?: Partial<{
        background: string;
        grid: {
          color: string;
          size: number;
          opacity: number;
        };
      }>;
      nodes?: Partial<{
        default: ThemeColor;
        selected: ThemeColor;
        hover: ThemeColor;
      }>;
    };
    typography?: Partial<ThemeTypography>;
    spacing?: Partial<ThemeSpacing>;
    borderRadius?: Partial<ThemeBorderRadius>;
    shadow?: Partial<ThemeShadow>;
    animation?: Partial<ThemeAnimation>;
  };
  preview?: string;
}

const THEME_TEMPLATES: ThemeTemplate[] = [
  {
    id: 'ocean-blue',
    name: '海洋蓝',
    description: '清新的海洋蓝色主题，适合技术文档',
    baseTheme: 'light',
    customizations: {
      palette: {
        primary: {
          main: '#0077be',
          light: '#e6f3ff',
          dark: '#005a8b',
          contrast: '#ffffff',
          border: '#0088cc',
          background: '#f0f8ff',
          text: '#003d5c',
          shadow: 'rgba(0, 119, 190, 0.2)'
        }
      },
      diagram: {
        domains: {
          frontend: {
            main: '#00bcd4',
            light: '#e0f7fa',
            dark: '#0097a7',
            contrast: '#ffffff',
            border: '#26c6da',
            background: '#e0f2f1',
            text: '#004d40',
            shadow: 'rgba(0, 188, 212, 0.2)'
          },
          backend: {
            main: '#2196f3',
            light: '#e3f2fd',
            dark: '#1976d2',
            contrast: '#ffffff',
            border: '#42a5f5',
            background: '#e8f4fd',
            text: '#0d47a1',
            shadow: 'rgba(33, 150, 243, 0.2)'
          }
        }
      }
    }
  },
  {
    id: 'forest-green',
    name: '森林绿',
    description: '自然的森林绿色主题，环保友好',
    baseTheme: 'light',
    customizations: {
      palette: {
        primary: {
          main: '#4caf50',
          light: '#e8f5e8',
          dark: '#388e3c',
          contrast: '#ffffff',
          border: '#66bb6a',
          background: '#f1f8e9',
          text: '#1b5e20',
          shadow: 'rgba(76, 175, 80, 0.2)'
        }
      },
      diagram: {
        domains: {
          frontend: {
            main: '#8bc34a',
            light: '#f1f8e9',
            dark: '#689f38',
            contrast: '#ffffff',
            border: '#9ccc65',
            background: '#f9fbe7',
            text: '#33691e',
            shadow: 'rgba(139, 195, 74, 0.2)'
          },
          backend: {
            main: '#4caf50',
            light: '#e8f5e8',
            dark: '#388e3c',
            contrast: '#ffffff',
            border: '#66bb6a',
            background: '#e8f5e8',
            text: '#1b5e20',
            shadow: 'rgba(76, 175, 80, 0.2)'
          }
        }
      }
    }
  },
  {
    id: 'sunset-orange',
    name: '日落橙',
    description: '温暖的日落橙色主题，充满活力',
    baseTheme: 'light',
    customizations: {
      palette: {
        primary: {
          main: '#ff9800',
          light: '#fff3e0',
          dark: '#f57c00',
          contrast: '#ffffff',
          border: '#ffb74d',
          background: '#fff8e1',
          text: '#e65100',
          shadow: 'rgba(255, 152, 0, 0.2)'
        }
      },
      diagram: {
        domains: {
          frontend: {
            main: '#ff5722',
            light: '#fbe9e7',
            dark: '#d84315',
            contrast: '#ffffff',
            border: '#ff7043',
            background: '#fff3e0',
            text: '#bf360c',
            shadow: 'rgba(255, 87, 34, 0.2)'
          },
          backend: {
            main: '#ff9800',
            light: '#fff3e0',
            dark: '#f57c00',
            contrast: '#ffffff',
            border: '#ffb74d',
            background: '#fff8e1',
            text: '#e65100',
            shadow: 'rgba(255, 152, 0, 0.2)'
          }
        }
      }
    }
  },
  {
    id: 'purple-galaxy',
    name: '紫色星系',
    description: '神秘的紫色星系主题，科技感十足',
    baseTheme: 'dark',
    customizations: {
      palette: {
        primary: {
          main: '#9c27b0',
          light: '#f3e5f5',
          dark: '#7b1fa2',
          contrast: '#ffffff',
          border: '#ba68c8',
          background: '#1a0d1f',
          text: '#ffffff',
          shadow: 'rgba(156, 39, 176, 0.3)'
        }
      },
      diagram: {
        domains: {
          frontend: {
            main: '#e91e63',
            light: '#fce4ec',
            dark: '#c2185b',
            contrast: '#ffffff',
            border: '#f06292',
            background: '#1f0a14',
            text: '#ffffff',
            shadow: 'rgba(233, 30, 99, 0.3)'
          },
          backend: {
            main: '#673ab7',
            light: '#ede7f6',
            dark: '#512da8',
            contrast: '#ffffff',
            border: '#9575cd',
            background: '#1a0d2e',
            text: '#ffffff',
            shadow: 'rgba(103, 58, 183, 0.3)'
          }
        }
      }
    }
  }
];

export class ThemePresetManager {
  private configManager: LayeredConfigManager;
  private presets: Map<string, ThemePreset> = new Map();
  private categories: Map<string, PresetCategory> = new Map();
  private templates: Map<string, ThemeTemplate> = new Map();

  constructor(configManager: LayeredConfigManager) {
    this.configManager = configManager;
    this.initializeCategories();
    this.initializeTemplates();
    this.loadPresets();
    // this.presets.set(wmsProfessionalThemePreset.id, wmsProfessionalThemePreset);
  }

  /**
   * 初始化分类
   */
  private initializeCategories(): void {
    DEFAULT_CATEGORIES.forEach(category => {
      this.categories.set(category.id, category);
    });
  }

  /**
   * 初始化模板
   */
  private initializeTemplates(): void {
    THEME_TEMPLATES.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  /**
   * 加载预设
   */
  private loadPresets(): void {
    try {
      const savedPresets = this.configManager.get<unknown>('theme.presets', {});
      if (!isRecord(savedPresets)) return;
      Object.entries(savedPresets).forEach(([id, preset]) => {
        try {
          const safePreset = coerceThemePresetImport(preset, id, coercePresetCategory(isRecord(preset) ? preset.category : undefined));
          this.presets.set(id, safePreset);
        } catch (error) {
          logThemePresetManagerInvalidSavedPreset(id, error);
        }
      });
    } catch (error) {
      logThemePresetManagerLoadFailure(error);
    }
  }

  /**
   * 保存预设
   */
  private savePresets(): void {
    const presetsData = Object.fromEntries(this.presets.entries());
    this.configManager.set('theme.presets', presetsData, ConfigLayer.USER);
  }

  /**
   * 创建预设
   */
  createPreset(
    theme: Theme,
    metadata: ThemePresetMetadata = {}
  ): ThemePreset {
    const name = coerceOptionalText(metadata.name) || theme.name;
    const preset: ThemePreset = {
      id: theme.id,
      name,
      description: coerceOptionalText(metadata.description) || '',
      category: coercePresetCategory(metadata.category),
      tags: coerceTags(metadata.tags),
      theme
    };

    this.presets.set(preset.id, preset);
    this.savePresets();

    return preset;
  }

  /**
   * 从模板创建预设
   */
  createPresetFromTemplate(
    templateId: string,
    baseTheme: Theme,
    metadata: ThemePresetMetadata = {}
  ): ThemePreset | null {
    const template = this.templates.get(templateId);
    if (!template) {
      logThemePresetManagerTemplateMissing(templateId);
      return null;
    }

    // 应用模板自定义
    const customizedTheme: Theme = this.applyThemeCustomizations(
      baseTheme,
      template.customizations
    );

    // 生成唯一ID
    const uniqueId = this.generateUniqueId(template.name);
    customizedTheme.id = uniqueId;
    customizedTheme.name = coerceOptionalText(metadata.name) || template.name;

    return this.createPreset(customizedTheme, {
      ...metadata,
      description: coerceOptionalText(metadata.description) || template.description || '',
      tags: [...coerceTags(metadata.tags), 'template', templateId]
    });
  }

  /**
   * 应用主题自定义
   */
  private applyThemeCustomizations(
    baseTheme: Theme,
    customizations: ThemeTemplate['customizations']
  ): Theme {
    return {
      ...baseTheme,
      ...customizations,
      palette: {
        ...baseTheme.palette,
        ...customizations.palette
      },
      diagram: {
        ...baseTheme.diagram,
        ...customizations.diagram,
        domains: {
          ...baseTheme.diagram.domains,
          ...customizations.diagram?.domains
        },
        edges: {
          ...baseTheme.diagram.edges,
          ...customizations.diagram?.edges
        },
        nodes: {
          ...baseTheme.diagram.nodes,
          ...customizations.diagram?.nodes
        },
        canvas: {
          ...baseTheme.diagram.canvas,
          ...customizations.diagram?.canvas
        }
      }
    };
  }

  /**
   * 生成唯一ID
   */
  private generateUniqueId(baseName: string): string {
    const baseId = baseName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    let uniqueId = baseId;
    let counter = 1;

    while (this.presets.has(uniqueId)) {
      uniqueId = `${baseId}-${counter}`;
      counter++;
    }

    return uniqueId;
  }

  /**
   * 更新预设
   */
  updatePreset(id: string, updates: Partial<ThemePreset>): boolean {
    const preset = this.presets.get(id);
    if (!preset) return false;

    // 不允许更新内置预设
    if (preset.category === 'built-in') {
      logThemePresetManagerCannotUpdateBuiltIn();
      return false;
    }

    const updatedPreset: ThemePreset = {
      ...preset,
      ...updates
    };

    this.presets.set(id, updatedPreset);
    this.savePresets();

    return true;
  }

  /**
   * 删除预设
   */
  deletePreset(id: string): boolean {
    const preset = this.presets.get(id);
    if (!preset) return false;

    // 不允许删除内置预设
    if (preset.category === 'built-in') {
      logThemePresetManagerCannotDeleteBuiltIn();
      return false;
    }

    this.presets.delete(id);
    this.savePresets();

    return true;
  }

  /**
   * 获取预设
   */
  getPreset(id: string): ThemePreset | undefined {
    return this.presets.get(id);
  }

  /**
   * 获取所有预设
   */
  getAllPresets(): ThemePreset[] {
    return Array.from(this.presets.values());
  }

  /**
   * 筛选预设
   */
  filterPresets(filter: PresetFilter): ThemePreset[] {
    let presets = this.getAllPresets();

    if (filter.category) {
      presets = presets.filter(p => p.category === filter.category);
    }

    if (filter.tags && filter.tags.length > 0) {
      presets = presets.filter(p => 
        filter.tags!.some(tag => p.tags.includes(tag))
      );
    }

    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      presets = presets.filter(p => 
        p.name.toLowerCase().includes(searchLower) ||
        p.description.toLowerCase().includes(searchLower) ||
        p.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    return presets;
  }

  /**
   * 排序预设
   */
  sortPresets(presets: ThemePreset[], options: PresetSortOptions): ThemePreset[] {
    return presets.sort((a, b) => {
      const normalizeSortValue = (preset: ThemePreset): string | number => {
        const value = preset[options.field as keyof ThemePreset];
        if (typeof value === 'string') return value.toLowerCase();
        if (typeof value === 'number') return value;
        return '';
      };
      const aValue = normalizeSortValue(a);
      const bValue = normalizeSortValue(b);

      let result = 0;
      if (aValue < bValue) result = -1;
      else if (aValue > bValue) result = 1;

      return options.order === 'desc' ? -result : result;
    });
  }

  /**
   * 获取分类
   */
  getCategories(): PresetCategory[] {
    return Array.from(this.categories.values()).sort((a, b) => a.order - b.order);
  }

  /**
   * 获取模板
   */
  getTemplates(): ThemeTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 导出预设
   */
  exportPreset(id: string, _options: PresetExportOptions = {
    includePreview: true,
    includeMetadata: true,
    format: 'json'
  }): string | null {
    const preset = this.presets.get(id);
    if (!preset) return null;

    const exportData = {
      version: '1.0',
      preset: { ...preset }
    };

    exportData.exportedAt = new Date().toISOString();

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 导出主题包
   */
  exportThemePackage(
    presetIds: string[],
    packageInfo: ThemePackageInfo,
    _options: PresetExportOptions = {
      includePreview: true,
      includeMetadata: true,
      format: 'theme-pack'
    }
  ): string | null {
    const presets = presetIds
      .map(id => this.presets.get(id))
      .filter(Boolean) as ThemePreset[];

    if (presets.length === 0) return null;

    const themePackage: ThemePackage = {
      version: '1.0',
      name: coerceOptionalText(packageInfo.name) || 'Theme Package',
      description: coerceOptionalText(packageInfo.description),
      author: coerceOptionalText(packageInfo.author),
      presets: presets.map(preset => ({ ...preset })),
      createdAt: new Date().toISOString(),
      metadata: packageInfo.metadata
    };

    return JSON.stringify(themePackage, null, 2);
  }

  /**
   * 导入预设
   */
  importPreset(data: string | unknown): PresetImportResult {
    try {
      const parsed = typeof data === 'string' ? parseThemeImportJson(data) : data;
      
      // 检查是否是主题包
      if (isRecord(parsed) && Array.isArray(parsed.presets)) {
        return this.importThemePackage(parsed);
      }

      // 单个预设导入
      if (!isRecord(parsed)) throw new Error('无效的预设数据格式');
      const preset = coerceThemePresetImport(parsed.preset, undefined, 'custom');
      
      if (!preset) {
        return {
          success: false,
          error: '无效的预设数据格式'
        };
      }

      // 生成唯一ID
      const uniqueId = this.generateUniqueId(preset.name);
      const importedPreset = coerceThemePresetImport(preset, uniqueId, 'custom');
      importedPreset.createdAt = new Date().toISOString();

      this.presets.set(uniqueId, importedPreset);
      this.savePresets();

      return {
        success: true,
        preset: importedPreset
      };
    } catch (error) {
      return {
        success: false,
        error: `导入失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 导入主题包
   */
  importThemePackage(data: string | unknown): PresetImportResult {
    try {
      const themePackage = typeof data === 'string' ? parseThemeImportJson(data) : data;
      
      if (!isRecord(themePackage) || !Array.isArray(themePackage.presets)) {
        return {
          success: false,
          error: '无效的主题包格式'
        };
      }

      const safePresets = coerceThemePackageImport(themePackage, 'community');
      const importedPresets: ThemePreset[] = [];
      const warnings: string[] = [];

      safePresets.forEach(preset => {
        try {
          const uniqueId = this.generateUniqueId(preset.name);
          const importedPreset = coerceThemePresetImport(preset, uniqueId, 'community');
          importedPreset.createdAt = new Date().toISOString();

          this.presets.set(uniqueId, importedPreset);
          importedPresets.push(importedPreset);
        } catch (error) {
          warnings.push(`预设 "${preset.name}" 导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      });

      if (importedPresets.length > 0) {
        this.savePresets();
      }

      return {
        success: importedPresets.length > 0,
        preset: importedPresets[0], // 返回第一个成功导入的预设
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      return {
        success: false,
        error: `主题包导入失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 应用预设
   */
  applyPreset(id: string): Theme | null {
    const preset = this.presets.get(id);
    if (!preset) {
      logThemePresetManagerPresetMissing(id);
      return null;
    }

    return preset.theme;
  }

  /**
   * 复制预设
   */
  duplicatePreset(id: string, newName?: string): ThemePreset | null {
    const originalPreset = this.presets.get(id);
    if (!originalPreset) return null;

    const uniqueId = this.generateUniqueId(newName || `${originalPreset.name} 副本`);
    const duplicatedPreset: ThemePreset = {
      ...originalPreset,
      id: uniqueId,
      name: newName || `${originalPreset.name} 副本`,
      theme: {
        ...originalPreset.theme,
        id: uniqueId,
        name: newName || `${originalPreset.theme.name} 副本`
      },
      category: 'custom',
      createdAt: new Date().toISOString()
    };

    this.presets.set(uniqueId, duplicatedPreset);
    this.savePresets();

    return duplicatedPreset;
  }

  /**
   * 获取预设统计信息
   */
  getStatistics(): {
    total: number;
    byCategory: Record<string, number>;
    byAuthor: Record<string, number>;
    recentlyCreated: ThemePreset[];
    recentlyUpdated: ThemePreset[];
  } {
    const presets = this.getAllPresets();
    const byCategory: Record<string, number> = {};
    const byAuthor: Record<string, number> = {};

    presets.forEach(preset => {
      byCategory[preset.category] = (byCategory[preset.category] || 0) + 1;
      // Author property is not available in ThemePreset interface
      // byAuthor[preset.author] = (byAuthor[preset.author] || 0) + 1;
    });

    // Sort by creation time using theme id as fallback
    const sortedByCreated = [...presets]
      .sort((a, b) => {
        const aTime = a.theme.id ? parseInt(a.theme.id.split('-').pop() || '0') : 0;
        const bTime = b.theme.id ? parseInt(b.theme.id.split('-').pop() || '0') : 0;
        return bTime - aTime;
      })
      .slice(0, 5);

    // For updated, we'll just use the same as created for now
    const sortedByUpdated = [...sortedByCreated];

    return {
      total: presets.length,
      byCategory,
      byAuthor,
      recentlyCreated: sortedByCreated,
      recentlyUpdated: sortedByUpdated
    };
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.presets.clear();
    this.categories.clear();
    this.templates.clear();
  }
}
