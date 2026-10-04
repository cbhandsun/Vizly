/**
 * 增强版主题选择器
 * 支持新的主题系统功能，包括预设、自定义主题、性能优化等
 */

import React, { useState, useEffect, useCallback, useId, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { THEME_JSON_IMPORT_MAX_BYTES, getFileSizeLimitError } from '@vizly/core/input';
import { theme } from 'antd';
import Popconfirm from 'antd/es/popconfirm';
import { FaPalette, FaDownload, FaUpload, FaPlus, FaTrash, FaCheck, FaTimes, FaSearch, FaLayerGroup, FaInfoCircle, FaFileCode, FaSlidersH, FaArrowRight } from 'react-icons/fa';

import { useConfigIntegration } from '@vizly/core/editor-hooks';
import { useTheme } from '@vizly/core/theme';
import type { Theme, ThemeMode, ThemePreset } from '@vizly/core/theme';

import { getCachedThemePreset, parseThemeImportJson } from '@vizly/core/theme';
import { themePresetMap, themePresets } from '@vizly/core/theme-presets';
import {
  logThemeSelectorApplyPresetFailure,
  logThemeSelectorChangeFailure,
  logThemeSelectorCreateCustomThemeFailure,
  logThemeSelectorDeleteCustomThemeFailure,
  logThemeSelectorExportFailure,
  logThemeSelectorImportFailure,
  logThemeSelectorImportRejected,
  logThemeSelectorLoadFailure,
  logThemeSelectorMissingBaseTheme,
} from '@vizly/core/logging';
import { renderSafeThemePreviewGradient } from '@vizly/core/theme';
import { downloadFile } from '@vizly/core/export';
import { ThemeChoiceButton, type ThemePreviewDetails } from './ThemeChoiceButton';
import { ThemeSelectorDialog, type ThemeSelectorTab } from './ThemeSelectorDialog';

export interface EnhancedThemeSelectorProps {
  className?: string;
  style?: React.CSSProperties;
  showPresets?: boolean;
  showCustomThemes?: boolean;
  showImportExport?: boolean;
  borderless?: boolean;
  variant?: 'default' | 'icon';
  onThemeChange?: (theme: Theme) => void;
  ariaLabel?: string;
  /** Opens the dialog on the first mounted render for interaction-triggered lazy boundaries. */
  initialOpen?: boolean;
}

interface CustomThemeForm {
  id: string;
  name: string;
  description: string;
  mode: ThemeMode;
  baseTheme: string;
}

const EMPTY_CUSTOM_THEME_FORM: CustomThemeForm = {
  id: '',
  name: '',
  description: '',
  mode: 'light',
  baseTheme: 'light',
};

type ThemePreviewItem = Partial<Theme> & {
  id?: string;
  baseTheme?: string;
  theme?: Theme | null;
};

/**
 * 增强版主题选择器组件
 */
export const EnhancedThemeSelector: React.FC<EnhancedThemeSelectorProps> = ({
  className = '',
  style,
  showPresets = true,
  showCustomThemes = true,
  showImportExport = true,
  borderless = false,
  variant = 'default',
  onThemeChange,
  ariaLabel,
  initialOpen = false,
}) => {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const [state, actions] = useConfigIntegration();
  const [currentTheme, setTheme] = useTheme();

  const [isOpen, setIsOpen] = useState(initialOpen);
  const [activeTab, setActiveTab] = useState<ThemeSelectorTab>('themes');
  const [presets, setPresets] = useState<ThemePreset[]>([]);
  const [customThemes, setCustomThemes] = useState<Theme[]>([]);
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [customThemeForm, setCustomThemeForm] = useState<CustomThemeForm>(EMPTY_CUSTOM_THEME_FORM);
  const [isThemeActionPending, setIsThemeActionPending] = useState(false);
  const [importStatus, setImportStatus] = useState<'success' | 'rejected' | 'failed' | null>(null);
  const [themeCache, setThemeCache] = useState<Record<string, Theme>>({});
  const [themeSearchTerm, setThemeSearchTerm] = useState('');
  const [themeModeFilter, setThemeModeFilter] = useState<'all' | 'light' | 'dark'>('all');
      const searchInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importInputId = useId();
  const closeThemeDialog = useCallback(() => setIsOpen(false), []);
    useEffect(() => {
      if (!isOpen) return;
      const handleGlobalKeyDown = (e: KeyboardEvent) => {
        if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      };
      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [isOpen]);

  const triggerLabel = ariaLabel || t('theme.selector.title');

  // 加载预设和自定义主题
  useEffect(() => {
    if (!isOpen || !state.integration) return;

    const loadData = async () => {
      try {
        const presetManager = state.integration!.getPresetManager();
        const themeManager = state.integration!.getThemeManager();

        // 获取所有原生主题ID进行预加载，确保主题的静态调色板提前进入内存缓存
        // 这样下方在渲染卡片预览时，调用 getThemeColor 可以同步获取到颜色数据
        const availableBuiltInIds = themeManager.getAvailablePresetIds().filter(id => !id.startsWith('custom-'));
        await themeManager.preloadThemes(availableBuiltInIds);

        const managerPresets = presetManager.getAllPresets();
        const allPresets = managerPresets.length > 0 ? managerPresets : (themePresets || []);
        const allCustomThemes = themeManager.getCustomThemes();

        const themeResults = await Promise.all(
          availableBuiltInIds.map(async (id) => {
            try {
              const t = await themeManager.getTheme(id);
              return [id, t] as const;
            } catch {
              return [id, null] as const;
            }
          })
        );
        const cache: Record<string, Theme> = {};
        for (const [id, t] of themeResults) {
          if (t) cache[id] = t;
        }
        setThemeCache(cache);
        setPresets(allPresets);
        setCustomThemes(allCustomThemes);
      } catch (error) {
        logThemeSelectorLoadFailure(error);
      }
    };

    if (state.isReady) {
      loadData();
    }
  }, [isOpen, state.integration, state.isReady]);

  // 获取可用主题列表
  const availableThemes = useMemo(() => {
    if (!state.integration) return [];

    const themeManager = state.integration.getThemeManager();
    // 过滤掉 custom- 开头的主题
    return themeManager.getAvailablePresetIds().filter(id => !id.startsWith('custom-'));
  }, [state.integration]);

  // 处理主题切换
  const handleThemeChange = useCallback(async (themeId: string) => {
    if (isThemeActionPending) return;
    setIsThemeActionPending(true);
    try {
      await setTheme(themeId);
      const themeManager = state.integration?.getThemeManager();
      const newTheme = themeManager ? await themeManager.getCurrentTheme() : null;
      // ⭐ 发送全局通信以跨越跨包构建的主题隔离层
      window.dispatchEvent(new CustomEvent('diagram-global-theme-changed', { detail: themeId }));
      if (newTheme && onThemeChange) {
        onThemeChange(newTheme);
      }
    } catch (error) {
      logThemeSelectorChangeFailure(error);
    } finally {
      setIsThemeActionPending(false);
    }
  }, [setTheme, state.integration, onThemeChange, isThemeActionPending]);

  // 应用预设
  const handleApplyPreset = useCallback(async (preset: ThemePreset) => {
    if (isThemeActionPending) return;
    setIsThemeActionPending(true);
    try {
      if (!state.integration) return;

      const presetManager = state.integration.getPresetManager();
      const theme = presetManager.applyPreset(preset.id) || preset.theme || null;
      await setTheme(preset.id);
      
      // ⭐ 同样广播此预设应用事件
      window.dispatchEvent(new CustomEvent('diagram-global-theme-changed', { detail: preset.id }));

      if (theme && onThemeChange) {
        onThemeChange(theme);
      }
    } catch (error) {
      logThemeSelectorApplyPresetFailure(error);
    } finally {
      setIsThemeActionPending(false);
    }
  }, [state.integration, onThemeChange, setTheme, isThemeActionPending]);

  // 创建自定义主题
  const handleCreateCustomTheme = useCallback(async () => {
    try {
      if (!state.integration) return;

      const themeManager = state.integration.getThemeManager();
      const baseThemePromise = themeManager.getTheme(customThemeForm.baseTheme);
      if (!baseThemePromise) {
        logThemeSelectorMissingBaseTheme(customThemeForm.baseTheme);
        return;
      }

      const baseTheme = await baseThemePromise;
      if (!baseTheme) {
        logThemeSelectorMissingBaseTheme(customThemeForm.baseTheme);
        return;
      }

      const customThemeName = customThemeForm.name.trim();
      if (!customThemeName) return;
      const customTheme: Theme = {
        ...baseTheme,
        id: customThemeForm.id || `custom-${Date.now()}`,
        name: customThemeName,
        mode: customThemeForm.mode,
        description: customThemeForm.description.trim(),
      };

      await themeManager.addCustomTheme(customTheme);
      setCustomThemes(prev => [...prev, customTheme]);
      setIsCreatingCustom(false);
      setCustomThemeForm(EMPTY_CUSTOM_THEME_FORM);
    } catch (error) {
      logThemeSelectorCreateCustomThemeFailure(error);
    }
  }, [state.integration, customThemeForm]);

  // 删除自定义主题
  const handleDeleteCustomTheme = useCallback(async (themeId: string) => {
    try {
      if (!state.integration) return;

      const themeManager = state.integration.getThemeManager();
      if (currentTheme?.id === themeId) {
        const fallbackTheme = await themeManager.setTheme('light');
        window.dispatchEvent(new CustomEvent('diagram-global-theme-changed', { detail: fallbackTheme.id }));
        onThemeChange?.(fallbackTheme);
      }
      await themeManager.removeCustomTheme(themeId);
      setCustomThemes(prev => prev.filter(theme => theme.id !== themeId));
    } catch (error) {
      logThemeSelectorDeleteCustomThemeFailure(error);
    }
  }, [currentTheme, onThemeChange, state.integration]);

  // 导出主题配置
  const handleExportThemes = useCallback(async () => {
    try {
      const config = await actions.exportConfig();
      const dataStr = JSON.stringify(config, null, 2);
      downloadFile(dataStr, `theme-config-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
    } catch (error) {
      logThemeSelectorExportFailure(error);
    }
  }, [actions]);

  // 导入主题配置
  const handleImportThemes = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportStatus(null);
    const sizeError = getFileSizeLimitError(file, THEME_JSON_IMPORT_MAX_BYTES, 'theme JSON');
    if (sizeError) {
      logThemeSelectorImportRejected(sizeError);
      setImportStatus('rejected');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const config = parseThemeImportJson(String(e.target?.result || ''));
        await actions.importConfig(config);

        // 重新加载数据
        if (state.integration) {
          const presetManager = state.integration.getPresetManager();
          const themeManager = state.integration.getThemeManager();

          const allPresets = await presetManager.getAllPresets();
          const allCustomThemes = themeManager.getCustomThemes();

          setPresets(allPresets);
          setCustomThemes(allCustomThemes);
        }
        setImportStatus('success');
      } catch (error) {
        logThemeSelectorImportFailure(error);
        setImportStatus('failed');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }, [actions, state.integration]);

  const resolveThemePreviewDetails = (themeData: unknown, preset?: unknown, fallbackThemeId?: string): ThemePreviewDetails | undefined => {
    const p = preset as { theme?: Theme; category?: string } | undefined;
    const staticPreset = fallbackThemeId && fallbackThemeId in themePresetMap ? themePresetMap[fallbackThemeId as keyof typeof themePresetMap] : undefined;
    const t = (p?.theme || themeData || staticPreset?.theme) as Theme | undefined;
    if (!t) return undefined;
    const isDark = t.mode === 'dark';
    const canvasBg = t.diagram?.canvas?.background || (isDark ? '#141414' : '#ffffff');
    const gridColor = t.diagram?.canvas?.grid?.color || (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)');
    const nodeBg = t.diagram?.nodes?.default?.background || t.diagram?.nodes?.default?.main || (isDark ? '#1e293d' : '#ffffff');
    const nodeBorder = t.diagram?.nodes?.default?.border || t.palette?.primary?.border || t.palette?.primary?.main || (isDark ? '#38bdf8' : '#cbd5e1');
    const nodeText = t.diagram?.nodes?.default?.text || (isDark ? '#f1f5f9' : '#0f172a');
    const edgeColor = t.diagram?.edges?.default?.main || t.palette?.primary?.main || (isDark ? '#38bdf8' : '#2563eb');
    const accentColor = t.palette?.primary?.main || t.diagram?.edges?.primary?.main || (isDark ? '#60a5fa' : '#2563eb');
    const mode: 'light' | 'dark' = (t.mode as 'light' | 'dark') || (isDark ? 'dark' : 'light');
    return { canvasBg, gridColor, nodeBg, nodeBorder, nodeText, edgeColor, accentColor, mode };
  };

  const getGradientBackground = (item: ThemePreviewItem) => {
    const themeManager = state.integration?.getThemeManager();
    const themeData = item.theme || item;
    let colors: unknown[] = [];
    
    if (themeData?.palette) {
        const getCol = (c: unknown, sub: keyof Theme['palette']['primary'] = 'main') => (
          typeof c === 'string' ? c : typeof c === 'object' && c !== null ? (c as Partial<Theme['palette']['primary']>)[sub] || (c as Partial<Theme['palette']['primary']>).main : undefined
        );
        colors = [
            getCol(themeData.palette.primary, 'light'),
            getCol(themeData.palette.primary, 'main'),
            getCol(themeData.palette.secondary, 'main'),
            getCol(themeData.palette.secondary, 'light') || getCol(themeData.palette.primary, 'dark')
        ];
    } else if (themeManager) {
        const themeId = item.baseTheme || item.id;
        if (themeId) {
            const p = themeManager.getThemeColor(themeId, 'primary');
            const s = themeManager.getThemeColor(themeId, 'secondary');
            if (p) colors.push(p);
            if (s) colors.push(s);
        }
    }
    
    return renderSafeThemePreviewGradient(colors, [
      token.colorPrimary || '#1677ff',
      token.colorFillSecondary || '#f0f0f0',
    ]);
  };

  // 渲染主题列表
  const renderThemeList = () => {
    const filteredThemes = availableThemes.filter((themeId: string) => {
      let preset = presets.find(p => p.id === themeId);
      if (!preset) {
        preset = getCachedThemePreset(themeId);
      }
      const themeManager = state.integration?.getThemeManager();
      const themeData = themeCache[themeId] || (preset ? preset.theme : (themeManager?.getCurrentThemeId() === themeId ? themeManager?.getCurrentTheme() : null));
      const previewDetails = resolveThemePreviewDetails(themeData, preset, themeId);

      if (themeModeFilter !== 'all' && previewDetails?.mode && previewDetails.mode !== themeModeFilter) {
        return false;
      }
      if (themeSearchTerm.trim()) {
        const query = themeSearchTerm.trim().toLowerCase();
        const themeName = (preset?.name || t(`theme.selector.${themeId}`, { defaultValue: themeId })).toLowerCase();
        return themeName.includes(query) || themeId.toLowerCase().includes(query);
      }
      return true;
    });

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4 pb-4 mb-2 border-b border-slate-200/60 dark:border-white/10">
          {/* Mode Switcher */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100/90 dark:bg-zinc-800/80 border border-slate-200/60 dark:border-white/10 shadow-2xs">
            {(['all', 'light', 'dark'] as const).map(mode => {
              const isSelected = themeModeFilter === mode;
              const count = mode === 'all'
                ? availableThemes.length
                : availableThemes.filter((themeId: string) => {
                    let preset = presets.find(p => p.id === themeId);
                    if (!preset) {
                      preset = getCachedThemePreset(themeId);
                    }
                    const themeManager = state.integration?.getThemeManager();
                    const themeData = themeCache[themeId] || (preset ? preset.theme : (themeManager?.getCurrentThemeId() === themeId ? themeManager?.getCurrentTheme() : null));
                    const previewDetails = resolveThemePreviewDetails(themeData, preset, themeId);
                    return previewDetails?.mode === mode;
                  }).length;

              return (
                <button
                  key={mode}
                  type="button"
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs border border-slate-200/50 dark:border-white/10'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white font-medium border border-transparent'
                  }`}
                  onClick={() => setThemeModeFilter(mode)}
                >
                  <span>
                    {mode === 'all'
                      ? t('theme.selector.filterAll', '全部')
                      : mode === 'light'
                      ? t('theme.selector.light', '浅色')
                      : t('theme.selector.dark', '深色')}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300'
                        : 'bg-slate-200/60 dark:bg-zinc-700/60 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative w-56 sm:w-64">
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-100/70 dark:bg-zinc-800/60 hover:bg-slate-100 dark:hover:bg-zinc-800 focus-within:bg-white dark:focus-within:bg-zinc-800 border border-slate-200/80 dark:border-white/10 focus-within:border-indigo-500 dark:focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all shadow-2xs">
              <FaSearch className="w-3.5 h-3.5 text-slate-400 shrink-0 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={themeSearchTerm}
                onChange={(e) => setThemeSearchTerm(e.target.value)}
                placeholder={t('theme.selector.searchPlaceholder', '搜索主题名称...')}
                className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none border-none p-0 focus:ring-0"
              />
              {themeSearchTerm ? (
                <button
                  type="button"
                  onClick={() => setThemeSearchTerm('')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs w-4 h-4 flex items-center justify-center cursor-pointer shrink-0 rounded-full hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
                  title="清除"
                >
                  ×
                </button>
              ) : (
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-white/80 dark:bg-zinc-700/80 border border-slate-200/60 dark:border-white/10 text-[10px] font-mono text-slate-400 select-none shadow-2xs">/</kbd>
              )}
            </div>
          </div>
        </div>

        {filteredThemes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-7 lg:gap-8 pt-2 pb-6" aria-busy={isThemeActionPending} onKeyDown={(e) => {
            const target = e.target as HTMLElement;
            if (!target.matches("button[data-theme-card]")) return;
            const cards = Array.from(e.currentTarget.querySelectorAll("button[data-theme-card]"));
            const index = cards.indexOf(target);
            if (index < 0) return;
            let nextIdx = -1;
            if (e.key === "ArrowRight") nextIdx = (index + 1) % cards.length;
            else if (e.key === "ArrowLeft") nextIdx = (index - 1 + cards.length) % cards.length;
            else if (e.key === "ArrowDown") nextIdx = Math.min(cards.length - 1, index + 3);
            else if (e.key === "ArrowUp") nextIdx = Math.max(0, index - 3);
            if (nextIdx >= 0 && nextIdx !== index) {
              e.preventDefault();
              (cards[nextIdx] as HTMLElement)?.focus();
            }
          }}>
            {filteredThemes.map((themeId: string) => {
              const themeManager = state.integration?.getThemeManager();
              let preset = presets.find(p => p.id === themeId);
              if (!preset) {
                preset = getCachedThemePreset(themeId);
              }

              const themeData = themeCache[themeId] || (preset ? preset.theme : (themeManager?.getCurrentThemeId() === themeId ? themeManager?.getCurrentTheme() : null));
              const isActive = currentTheme?.id === themeId;
              const themeName = preset?.name || t(`theme.selector.${themeId}`, { defaultValue: themeId });

              return (
                <ThemeChoiceButton
                  key={themeId}
                  themeId={themeId}
                  active={isActive}
                  categoryLabel={preset?.category
                    ? t(`theme.selector.categories.${preset.category}`, { defaultValue: preset.category })
                    : t('theme.selector.themes')}
                  disabled={isThemeActionPending}
                  gradient={getGradientBackground(preset || themeData || { id: themeId })}
                  label={themeName}
                  previewDetails={resolveThemePreviewDetails(themeData, preset, themeId)}
                  onSelect={() => void handleThemeChange(themeId)}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-400 mb-3.5 shadow-2xs">
              <FaSearch className="w-4 h-4 text-slate-400" />
            </div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
              未找到与 &ldquo;{themeSearchTerm}&rdquo; 匹配的主题
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4">
              请检查关键词拼写，或切换亮色/暗色筛选条件重新检索
            </p>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer shadow-sm hover:shadow transition-all" style={{ backgroundColor: "#4f46e5", color: "#ffffff", padding: "8px 20px", borderRadius: "10px" }}
              onClick={() => {
                setThemeSearchTerm('');
                setThemeModeFilter('all');
                searchInputRef.current?.focus();
              }}
            >
              <span>重置全部筛选</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  // 渲染预设列表
  const renderPresetList = () => {
    if (!state.integration) return null;

    const presetManager = state.integration.getPresetManager();
    const categories = presetManager.getCategories();
    const hasAnyCategoryPresets = categories.some(category =>
      presets.some(preset => preset.category === category.id)
    );

    if (!hasAnyCategoryPresets) {
      return (
        <div className="py-12 sm:py-16 px-6 text-center rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] flex flex-col items-center justify-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-2xl shadow-sm border border-indigo-100 dark:border-indigo-500/20">
            <FaLayerGroup aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1 max-w-md">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              {t('theme.selector.emptyPresetsTitle', '暂无专属预设组合')}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {t(
                'theme.selector.emptyPresetsDesc',
                '预设组合支持针对流程、图例与容器一键打包多套预制方案。当前尚未导入或配置场景预设，您可以直接选用基础主题，或在「自定义」中创建您的专属配色。'
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('themes')}
              className="flex min-h-[44px] items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-xl shadow-sm transition-all hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              <span>{t('theme.selector.viewAllThemes', '浏览全部主题')}</span>
              <FaArrowRight className="text-xs opacity-80" aria-hidden="true" />
            </button>
            {showCustomThemes && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('custom');
                  setIsCreatingCustom(true);
                }}
                className="flex min-h-[44px] items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 rounded-xl shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                <FaPlus className="text-xs" aria-hidden="true" />
                <span>{t('theme.selector.create', '新建主题')}</span>
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-6">
        {categories.map(category => {
          const categoryPresets = presets.filter(preset => preset.category === category.id);
          if (categoryPresets.length === 0) return null;

          return (
            <div key={category.id} className="flex flex-col gap-3">
              <h4 className="text-xs font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                {t(`theme.selector.categories.${category.id}`, { defaultValue: category.name })}
              </h4>
              <div
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-7 lg:gap-8 pt-2 pb-6"
                aria-busy={isThemeActionPending}
              >
                {categoryPresets.map(preset => {
                  const isActive = currentTheme?.id === preset.id;
                  return (
                    <ThemeChoiceButton
                      key={preset.id}
                      themeId={preset.id}
                      active={isActive}
                      categoryLabel={t(`theme.selector.categories.${preset.category}`, { defaultValue: preset.category })}
                      disabled={isThemeActionPending}
                      gradient={getGradientBackground(preset)}
                      label={preset.name || preset.id}
                      previewDetails={resolveThemePreviewDetails(preset.theme, preset, preset.id)}
                      onSelect={() => void handleApplyPreset(preset)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // 渲染自定义主题
  const renderCustomThemes = () => (
    <div className="flex flex-col gap-5">
      {/* 顶部标题与新建操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h4 className="text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-200">
            {t('theme.selector.custom', '自定义主题')}
          </h4>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t('theme.selector.customSubtitle', '定制符合您品牌或项目规范的配色风格')}
          </p>
        </div>
        {!isCreatingCustom && (
          <button
            type="button"
            className="flex min-h-[44px] items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-xl shadow-sm transition-all hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            onClick={() => setIsCreatingCustom(true)}
          >
            <FaPlus className="text-xs" aria-hidden="true" />
            <span>{t('theme.selector.create', '新建主题')}</span>
          </button>
        )}
      </div>

      {/* 创建表单卡片 */}
      {isCreatingCustom && (
        <form
          className="flex flex-col gap-4 p-5 sm:p-6 rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-indigo-200/80 dark:border-indigo-500/20 shadow-md backdrop-blur-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreateCustomTheme();
          }}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-white/[0.08]">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <FaPalette className="text-indigo-500" aria-hidden="true" />
              <span>{t('theme.selector.createFormTitle', '创建自定义主题')}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsCreatingCustom(false);
                setCustomThemeForm(EMPTY_CUSTOM_THEME_FORM);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label={t('theme.selector.actions.cancel', '取消')}
            >
              <FaTimes aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <span>{t('theme.selector.name', '主题名称')} <span className="text-rose-500" aria-hidden="true">*</span></span>
              <input
                autoFocus
                type="text"
                required
                maxLength={80}
                placeholder={t('theme.selector.namePlaceholder', '如：品牌专属暗色')}
                value={customThemeForm.name}
                onChange={(e) => setCustomThemeForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm transition-colors border rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <span>{t('theme.selector.mode', '色彩模式')}</span>
              <select
                value={customThemeForm.mode}
                onChange={(e) => setCustomThemeForm(prev => ({ ...prev, mode: e.target.value as ThemeMode }))}
                className="w-full px-3 py-2 text-sm transition-colors border rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                <option value="light">{t('theme.selector.light', '亮色')}</option>
                <option value="dark">{t('theme.selector.dark', '暗色')}</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <span>{t('theme.selector.baseTheme', '基准底色模板')}</span>
              <select
                value={customThemeForm.baseTheme}
                onChange={(e) => setCustomThemeForm(prev => ({ ...prev, baseTheme: e.target.value }))}
                className="w-full px-3 py-2 text-sm transition-colors border rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                {availableThemes.map((themeId: string) => (
                  <option key={themeId} value={themeId}>{t(`theme.selector.${themeId}`, { defaultValue: themeId })} ({themeId})</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <span>{t('theme.selector.desc', '描述')}</span>
              <input
                type="text"
                maxLength={240}
                placeholder={t('theme.selector.descPlaceholder', '主题适用场景或配色说明（可选）')}
                value={customThemeForm.description}
                onChange={(e) => setCustomThemeForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 text-sm transition-colors border rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsCreatingCustom(false);
                setCustomThemeForm(EMPTY_CUSTOM_THEME_FORM);
              }}
              className="flex min-h-[44px] items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <FaTimes aria-hidden="true" />
              <span>{t('theme.selector.actions.cancel', '取消')}</span>
            </button>
            <button
              type="submit"
              disabled={!customThemeForm.name.trim()}
              className="flex min-h-[44px] items-center justify-center gap-2 px-5 py-2 text-xs sm:text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-xl shadow-sm transition-all hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FaCheck aria-hidden="true" />
              <span>{t('theme.selector.actions.create', '创建主题')}</span>
            </button>
          </div>
        </form>
      )}

      {/* 空状态引导 */}
      {customThemes.length === 0 && !isCreatingCustom && (
        <div className="py-12 sm:py-16 px-6 text-center rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] flex flex-col items-center justify-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-2xl shadow-sm border border-indigo-100 dark:border-indigo-500/20">
            <FaSlidersH aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1 max-w-md">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              {t('theme.selector.emptyCustomTitle', '尚未创建自定义主题')}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {t(
                'theme.selector.emptyCustomDesc',
                '基于现有基础主题进行微调，定制适合特定报告、业务流程或品牌的专属配色，并在随时一键应用与导出。'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreatingCustom(true)}
            className="flex min-h-[44px] items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-xl shadow-sm transition-all hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            <FaPlus className="text-xs" aria-hidden="true" />
            <span>{t('theme.selector.createFirstTheme', '创建第一个主题')}</span>
          </button>
        </div>
      )}

      {/* 自定义主题卡片列表 */}
      {customThemes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-7 lg:gap-8 pt-2 pb-6">
          {customThemes.map(theme => (
            <div key={theme.id} className="relative group">
              <ThemeChoiceButton
                themeId={theme.id}
                active={currentTheme?.id === theme.id}
                categoryLabel={theme.mode === 'dark' ? t('theme.selector.dark', '暗色') : t('theme.selector.light', '亮色')}
                disabled={isThemeActionPending}
                gradient={getGradientBackground(theme)}
                label={theme.name}
                ariaLabel={`${t('theme.selector.actions.apply', '应用')} ${theme.name}`}
                previewDetails={resolveThemePreviewDetails(theme, undefined, theme.id)}
                onSelect={() => void handleThemeChange(theme.id)}
              />
              <div className="absolute top-3.5 right-3.5 z-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-200">
                <Popconfirm
                  title={t('theme.selector.deleteConfirmTitle', { name: theme.name })}
                  description={t('theme.selector.deleteConfirmDescription')}
                  okText={t('common.delete', '删除')}
                  cancelText={t('common.cancel', '取消')}
                  okButtonProps={{ danger: true }}
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    void handleDeleteCustomTheme(theme.id);
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`${t('theme.selector.actions.delete', '删除')} ${theme.name}`}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-white/95 dark:bg-slate-800/95 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 shadow-sm border border-slate-200/80 dark:border-white/10 backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    title={t('theme.selector.actions.delete', '删除')}
                  >
                    <FaTrash className="text-xs" aria-hidden="true" />
                  </button>
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // 渲染设置面板
  const renderSettings = () => (
    <div className="flex flex-col gap-6 max-w-3xl">
      {showImportExport && (
        <div className="p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.02] shadow-sm flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-lg shrink-0 border border-blue-100 dark:border-blue-500/20">
              <FaFileCode aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-0.5">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t('theme.selector.settingsBackupTitle', '主题配置导入与导出')}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {t(
                  'theme.selector.settingsBackupDesc',
                  '将当前自定义主题及主题偏好导出为标准 JSON 格式文件，便于跨工作区、设备同步或备份归档。'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => void handleExportThemes()}
              className="flex min-h-[44px] items-center gap-2.5 px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-700/60 rounded-xl shadow-xs transition-all hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <FaDownload className="text-slate-400 dark:text-slate-500 text-xs" aria-hidden="true" />
              <span>{t('theme.selector.export', '导出配置文件 (.json)')}</span>
            </button>
            <button
              type="button"
              aria-controls={importInputId}
              onClick={() => importInputRef.current?.click()}
              className="flex min-h-[44px] items-center gap-2.5 px-4 py-2 text-xs sm:text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-500/10 border border-indigo-200/60 dark:border-indigo-500/20 hover:bg-indigo-100/80 dark:hover:bg-indigo-500/20 rounded-xl shadow-xs cursor-pointer transition-all hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <FaUpload className="text-xs" aria-hidden="true" />
              <span>{t('theme.selector.import', '导入主题配置')}</span>
            </button>
            <input
              ref={importInputRef}
              id={importInputId}
              type="file"
              accept=".json"
              onChange={handleImportThemes}
              className="sr-only"
              tabIndex={-1}
              aria-label={t('theme.selector.import', '导入主题配置')}
              title={t('theme.selector.import', '导入主题配置')}
            />
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 pt-1">
            <FaInfoCircle className="shrink-0" aria-hidden="true" />
            <span>{t('theme.selector.jsonFormatHint', '配置文件遵循 Vizly Theme JSON 标准规范，单文件最大支持 2MB。')}</span>
          </div>

          {importStatus && (
            <div
              role={importStatus === 'success' ? 'status' : 'alert'}
              className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium border ${
                importStatus === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/40'
                  : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200/80 dark:border-rose-800/40'
              }`}
            >
              {importStatus === 'success' ? (
                <FaCheck className="shrink-0" aria-hidden="true" />
              ) : (
                <FaInfoCircle className="shrink-0" aria-hidden="true" />
              )}
              <span>{t(`theme.selector.importStatus.${importStatus}`)}</span>
            </div>
          )}
        </div>
      )}

      {/* 当前生效主题概览 */}
      <div className="p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.02] shadow-sm flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center text-lg shrink-0 border border-purple-100 dark:border-purple-500/20">
            <FaPalette aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {t('theme.selector.overviewTitle', '当前生效主题概览')}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('theme.selector.overviewDesc', '查看当前画布应用的主题状态与配置信息。')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5 flex flex-col gap-1">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">当前应用主题</span>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
              {currentTheme?.name || currentTheme?.id || '默认主题'}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5 flex flex-col gap-1">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">色彩渲染模式</span>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {currentTheme?.mode === 'dark' ? '暗色模式 (Dark)' : '亮色模式 (Light)'}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5 flex flex-col gap-1">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">已保存自定义主题</span>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {customThemes.length} 个方案
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  if (!state.isReady) {
    return (
      <div role="status" aria-label={t('theme.selector.loading')} className={`p-2 rounded w-8 h-8 flex animate-pulse bg-black/5 dark:bg-white/5 ${className}`} style={style} />
    );
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
            type="button"
            aria-label={triggerLabel}
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            data-theme-selector-trigger
            className={className || "inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-[6px] border-none text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"}
            onClick={() => setIsOpen(!isOpen)}
            style={style}
            title={t('theme.selector.title')}
        >
            <FaPalette aria-hidden="true" className="text-[13px]" />
        </button>
      ) : (
        <button
            type="button"
            aria-label={triggerLabel}
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            data-theme-selector-trigger
            className={`flex items-center justify-between gap-1.5 ${borderless ? 'min-h-[44px]' : 'h-8'} px-2.5 text-[13px] transition-colors rounded-[6px] ${borderless ? 'bg-transparent border-none' : 'bg-white dark:bg-[#1C1C1E] border border-[#d9d9d9] dark:border-white/15 hover:border-blue-400 dark:hover:border-blue-500 shadow-sm'} text-gray-700 dark:text-gray-200 pointer-events-auto overflow-hidden w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${className}`}
            onClick={() => setIsOpen(!isOpen)}
            style={style}
        >
            <span className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
            <span
                className="flex-shrink-0 w-2.5 h-2.5 rounded-full border border-black/10 dark:border-white/20"
                style={{ background: currentTheme?.palette?.primary?.main || token.colorPrimary }}
            />
            <span className="truncate text-gray-700 dark:text-gray-400 font-medium">
                {currentTheme
                ? t(`theme.selector.${currentTheme.id}`, { defaultValue: currentTheme.name })
                : t('theme.selector.choose')}
            </span>
            </span>
            <svg className="flex-shrink-0 text-gray-400 w-3 h-3 ml-1" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      )}

      {isOpen && (
        <ThemeSelectorDialog
          activeTab={activeTab}
          closeLabel={t('config.actions.close')}
          customLabel={t('theme.selector.custom')}
          onClose={closeThemeDialog}
          onTabChange={setActiveTab}
          presetsLabel={t('theme.selector.presets')}
          settingsLabel={t('theme.selector.settings') || 'Settings'}
          showCustomThemes={showCustomThemes}
          showPresets={showPresets}
          themesLabel={t('theme.selector.themes')}
          title={t('theme.selector.title')}
        >
          {activeTab === 'themes' && renderThemeList()}
          {activeTab === 'presets' && showPresets && renderPresetList()}
          {activeTab === 'custom' && showCustomThemes && renderCustomThemes()}
          {activeTab === 'settings' && renderSettings()}
        </ThemeSelectorDialog>
      )}
    </>
  );


};

export default EnhancedThemeSelector;
