/**
 * 主题预设加载器
 * 动态加载和管理主题预设
 */

import { ThemePreset } from './types/ThemeTypes';

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
      console.warn(`主题预设 "${themeId}" 不存在`);
      return null;
    }

    // 动态导入主题模块
    const module = await loader();

    // 获取主题预设对象
    let themePreset: ThemePreset;

    // 根据不同的导出方式获取主题预设
    const moduleExports = module as Record<string, any>;

    if ('lightThemePreset' in moduleExports) {
      themePreset = moduleExports.lightThemePreset;
    } else if ('darkThemePreset' in moduleExports) {
      themePreset = moduleExports.darkThemePreset;
    } else if ('oceanThemePreset' in moduleExports) {
      themePreset = moduleExports.oceanThemePreset;
    } else if ('forestThemePreset' in moduleExports) {
      themePreset = moduleExports.forestThemePreset;
    } else if ('highContrastThemePreset' in moduleExports) {
      themePreset = moduleExports.highContrastThemePreset;
    } else if ('sunsetThemePreset' in moduleExports) {
      themePreset = moduleExports.sunsetThemePreset;
    } else if ('monoThemePreset' in moduleExports) {
      themePreset = moduleExports.monoThemePreset;
    } else if ('originalThemePreset' in moduleExports) {
      themePreset = moduleExports.originalThemePreset;
    } else if ('blueprintThemePreset' in moduleExports) {
      themePreset = moduleExports.blueprintThemePreset;
    } else if ('sketchThemePreset' in moduleExports) {
      themePreset = moduleExports.sketchThemePreset;
    } else if ('corporateThemePreset' in moduleExports) {
      themePreset = moduleExports.corporateThemePreset;
    } else if ('default' in moduleExports && moduleExports.default) {
      themePreset = moduleExports.default;
    } else {
      // 获取模块中的第一个导出
      const presetExport = Object.values(moduleExports).find(
        (value): value is ThemePreset =>
          value && typeof value === 'object' && 'id' in value && 'theme' in value
      );

      if (!presetExport) {
        console.error(`主题预设 "${themeId}" 模块格式不正确`);
        return null;
      }

      themePreset = presetExport;
    }

    // 验证主题预设
    if (!themePreset || !themePreset.id || !themePreset.theme) {
      console.error(`主题预设 "${themeId}" 数据格式无效`);
      return null;
    }

    // 缓存主题预设
    themePresetCache.set(themeId, themePreset);

    return themePreset;

  } catch (error) {
    console.error(`加载主题预设 "${themeId}" 失败:`, error);
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
    console.warn(`主题预设 "${themeId}" 预加载失败:`, error);
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
