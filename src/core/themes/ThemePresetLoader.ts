/**
 * 主题预设加载器
 * 动态加载和管理主题预设
 */

import { ThemePreset } from './types/ThemeTypes';
import {
  logThemePresetDataInvalid,
  logThemePresetLoadFailure,
  logThemePresetMissing,
  logThemePresetModuleFormatInvalid,
  logThemePresetPreloadFailure,
} from './themeInfrastructureLogging';

// 主题预设映射表
const THEME_PRESET_MAP = {
  'light': () => import('./presets/LightTheme'),
  'dark': () => import('./presets/DarkTheme'),
  'ocean': () => import('./presets/OceanTheme'),
  'forest': () => import('./presets/ForestTheme'),
  'high-contrast': () => import('./presets/HighContrastTheme'),
  'sunset': () => import('./presets/SunsetTheme'),
  'mono': () => import('./presets/MonoTheme'),
  'original': () => import('./presets/OriginalTheme'),
  'blueprint': () => import('./presets/BlueprintTheme'),
  'sketch': () => import('./presets/SketchTheme'),
  'corporate': () => import('./presets/CorporateTheme'),
} as const;

// 主题预设缓存
const themePresetCache = new Map<string, ThemePreset>();

/**
 * 获取可用的主题预设ID列表
 */
export function getAvailableThemeIds(): string[] {
  return Object.keys(THEME_PRESET_MAP);
}

/**
 * 动态加载主题预设
 */
export async function loadThemePreset(themeId: string): Promise<ThemePreset | null> {
  try {
    // 检查缓存
    if (themePresetCache.has(themeId)) {
      return themePresetCache.get(themeId)!;
    }

    // 获取加载函数
    const loader = THEME_PRESET_MAP[themeId as keyof typeof THEME_PRESET_MAP];
    if (!loader) {
      logThemePresetMissing(themeId);
      return null;
    }

    // 动态导入主题模块
    const module = await loader();

    const moduleExports = module as Record<string, unknown>;
    const isThemePreset = (value: unknown): value is ThemePreset =>
      Boolean(value && typeof value === 'object' && 'id' in value && 'theme' in value);
    const preferredExportNames = [
      'lightThemePreset',
      'darkThemePreset',
      'oceanThemePreset',
      'forestThemePreset',
      'highContrastThemePreset',
      'sunsetThemePreset',
      'monoThemePreset',
      'originalThemePreset',
      'blueprintThemePreset',
      'sketchThemePreset',
      'corporateThemePreset',
      'default',
    ] as const;
    const themePreset = preferredExportNames
      .map(exportName => moduleExports[exportName])
      .find(isThemePreset)
      ?? Object.values(moduleExports).find(isThemePreset);

    if (!themePreset) {
      logThemePresetModuleFormatInvalid(themeId);
      return null;
    }

    // 验证主题预设
    if (!themePreset || !themePreset.id || !themePreset.theme) {
      logThemePresetDataInvalid(themeId);
      return null;
    }

    // 缓存主题预设
    themePresetCache.set(themeId, themePreset);

    return themePreset;

  } catch (error) {
    logThemePresetLoadFailure(themeId, error);
    return null;
  }
}

/**
 * 批量加载多个主题预设
 */
export async function loadThemePresets(themeIds: string[]): Promise<Map<string, ThemePreset>> {
  const results = new Map<string, ThemePreset>();

  const loadPromises = themeIds.map(async (themeId) => {
    const preset = await loadThemePreset(themeId);
    if (preset) {
      results.set(themeId, preset);
    }
  });

  await Promise.all(loadPromises);

  return results;
}

/**
 * 预加载主题预设（在后台静默加载）
 */
export function preloadThemePreset(themeId: string): void {
  if (themePresetCache.has(themeId)) {
    return; // 已经缓存，无需预加载
  }

  // 异步预加载，不阻塞当前操作
  loadThemePreset(themeId).then(preset => {
    if (preset) {
      // 预加载完成
    }
  }).catch(error => {
    logThemePresetPreloadFailure(themeId, error);
  });
}

/**
 * 清理主题预设缓存
 */
export function clearThemePresetCache(themeIds?: string[]): void {
  if (themeIds && themeIds.length > 0) {
    // 清理指定的主题预设缓存
    themeIds.forEach(themeId => {
      themePresetCache.delete(themeId);
    });
  } else {
    // 清理所有缓存
    themePresetCache.clear();
  }
}

/**
 * 获取已缓存的主题预设
 */
export function getCachedThemePreset(themeId: string): ThemePreset | undefined {
  return themePresetCache.get(themeId);
}

/**
 * 检查主题预设是否已缓存
 */
export function isThemePresetCached(themeId: string): boolean {
  return themePresetCache.has(themeId);
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats(): {
  totalCached: number;
  cachedThemeIds: string[];
  cacheSize: number;
} {
  return {
    totalCached: themePresetCache.size,
    cachedThemeIds: Array.from(themePresetCache.keys()),
    cacheSize: JSON.stringify(Array.from(themePresetCache.entries())).length
  };
}
