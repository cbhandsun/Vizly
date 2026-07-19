/**
 * 主题预设管理器
 * 提供主题预设的创建、管理、导入导出功能
 */

import type {
  Theme,
  ThemePreset,
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
import {
  DEFAULT_THEME_PRESET_CATEGORIES,
  THEME_PRESET_TEMPLATES,
  type PresetCategory,
  type ThemeTemplate,
} from './themePresetCatalog';
import { applyThemeCustomizations } from './themeCustomization';
// import { wmsProfessionalThemePreset } from './WmsProfessionalTheme';

// 重新导出ThemePreset以便其他模块使用
export type { ThemePreset } from './types/ThemeTypes';
export type { PresetCategory, ThemeTemplate } from './themePresetCatalog';

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
    DEFAULT_THEME_PRESET_CATEGORIES.forEach(category => {
      this.categories.set(category.id, category);
    });
  }

  /**
   * 初始化模板
   */
  private initializeTemplates(): void {
    THEME_PRESET_TEMPLATES.forEach(template => {
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
    const customizedTheme = applyThemeCustomizations(
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
      preset: { ...preset },
      exportedAt: new Date().toISOString(),
    };

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
