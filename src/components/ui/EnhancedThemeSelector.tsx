/**
 * 增强版主题选择器
 * 支持新的主题系统功能，包括预设、自定义主题、性能优化等
 */

import React, { useState, useEffect, useCallback, useId, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { THEME_JSON_IMPORT_MAX_BYTES, getFileSizeLimitError } from '../../core/utils/fileImportGuards';
import { theme } from 'antd';
import Popconfirm from 'antd/es/popconfirm';
import { FaPalette, FaDownload, FaUpload, FaPlus, FaTrash, FaCheck, FaTimes } from 'react-icons/fa';

import { useConfigIntegration } from '@/core/hooks/useConfigIntegration';
import { useTheme } from '@/core/themes/useCoreTheme';
import type { Theme, ThemeMode } from '@/core/themes/types/ThemeTypes';
import type { ThemePreset } from '@/core/themes/ThemePresetManager';

import { getCachedThemePreset } from '@/core/themes/ThemePresetLoader';
import { parseThemeImportJson } from '@/core/themes/themeImportSecurity';
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
} from '@/core/themes/themeLogging';
import { renderSafeThemePreviewGradient } from '@/core/themes/themePreviewSecurity';
import { downloadFile } from '@/core/utils/downloadUtils';
import { ThemeChoiceButton } from './ThemeChoiceButton';
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
}) => {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const [state, actions] = useConfigIntegration();
  const [currentTheme, setTheme] = useTheme();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ThemeSelectorTab>('themes');
  const [presets, setPresets] = useState<ThemePreset[]>([]);
  const [customThemes, setCustomThemes] = useState<Theme[]>([]);
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [customThemeForm, setCustomThemeForm] = useState<CustomThemeForm>(EMPTY_CUSTOM_THEME_FORM);
  const [isThemeActionPending, setIsThemeActionPending] = useState(false);
  const [importStatus, setImportStatus] = useState<'success' | 'rejected' | 'failed' | null>(null);
  const [themeCache, setThemeCache] = useState<Record<string, Theme>>({});
  const themeActionPendingRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importInputId = useId();
  const closeThemeDialog = useCallback(() => setIsOpen(false), []);
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

        const allPresets = presetManager.getAllPresets();
        const allCustomThemes = themeManager.getCustomThemes();

        const cache: Record<string, Theme> = {};
        for (const id of availableBuiltInIds) {
          const t = await themeManager.getTheme(id);
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
    if (themeActionPendingRef.current) return;
    themeActionPendingRef.current = true;
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
      themeActionPendingRef.current = false;
      setIsThemeActionPending(false);
    }
  }, [setTheme, state.integration, onThemeChange]);

  // 应用预设
  const handleApplyPreset = useCallback(async (preset: ThemePreset) => {
    if (themeActionPendingRef.current) return;
    themeActionPendingRef.current = true;
    setIsThemeActionPending(true);
    try {
      if (!state.integration) return;

      const presetManager = state.integration.getPresetManager();
      const theme = presetManager.applyPreset(preset.id);
      await setTheme(preset.id);
      
      // ⭐ 同样广播此预设应用事件
      window.dispatchEvent(new CustomEvent('diagram-global-theme-changed', { detail: preset.id }));

      if (theme && onThemeChange) {
        onThemeChange(theme);
      }
    } catch (error) {
      logThemeSelectorApplyPresetFailure(error);
    } finally {
      themeActionPendingRef.current = false;
      setIsThemeActionPending(false);
    }
  }, [state.integration, onThemeChange, setTheme]);

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
  const renderThemeList = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6" aria-busy={isThemeActionPending}>
      {availableThemes.map((themeId: string) => {
        const themeManager = state.integration?.getThemeManager();
        // 优先从预设加载颜色数据，确保预览卡片能显示出五彩渐变色
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
            active={isActive}
            categoryLabel={preset?.category
              ? t(`theme.selector.categories.${preset.category}`, { defaultValue: preset.category })
              : t('theme.selector.themes')}
            disabled={isThemeActionPending}
            gradient={getGradientBackground(preset || themeData || { id: themeId })}
            label={themeName}
            onSelect={() => void handleThemeChange(themeId)}
          />
        );
      })}
    </div>
  );

  // 渲染预设列表
  const renderPresetList = () => {
    if (!state.integration) return null;

    const presetManager = state.integration.getPresetManager();
    const categories = presetManager.getCategories();

    return (
      <div className="flex flex-col gap-6">
        {categories.map(category => {
          const categoryPresets = presets.filter(preset => preset.category === category.id);
          if (categoryPresets.length === 0) return null;

          return (
            <div key={category.id} className="flex flex-col gap-3">
              <h4 className="text-xs font-bold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {t(`theme.selector.categories.${category.id}`, { defaultValue: category.name })}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6" aria-busy={isThemeActionPending}>
                {categoryPresets.map(preset => {
                  const isActive = currentTheme?.id === preset.id;
                  return (
                    <ThemeChoiceButton
                      key={preset.id}
                      active={isActive}
                      categoryLabel={t(`theme.selector.categories.${preset.category}`, { defaultValue: preset.category })}
                      disabled={isThemeActionPending}
                      gradient={getGradientBackground(preset)}
                      label={preset.name || preset.id}
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between pointer-events-none">
        <h4 className="text-sm font-bold tracking-wider text-gray-500 uppercase dark:text-gray-400 pointer-events-auto">{t('theme.selector.custom')}</h4>
        <button
          type="button"
          className="flex min-h-[44px] items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors pointer-events-auto shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          onClick={() => setIsCreatingCustom(true)}
        >
          <FaPlus aria-hidden="true" /> {t('theme.selector.create')}
        </button>
      </div>

      {isCreatingCustom && (
        <form
          className="flex flex-col gap-3 p-4 rounded-xl bg-white/50 dark:bg-black/30 border border-blue-200/50 dark:border-blue-800/30"
          onSubmit={(event) => { event.preventDefault(); void handleCreateCustomTheme(); }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
            {t('theme.selector.name')}
            <input
              autoFocus
              type="text"
              required
              maxLength={80}
              value={customThemeForm.name}
              onChange={(e) => setCustomThemeForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 text-sm transition-colors border rounded-md border-gray-300/50 dark:border-gray-600/50 bg-white/70 dark:bg-black/40 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
            {t('theme.selector.desc')}
            <input
              type="text"
              maxLength={240}
              value={customThemeForm.description}
              onChange={(e) => setCustomThemeForm(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 text-sm transition-colors border rounded-md border-gray-300/50 dark:border-gray-600/50 bg-white/70 dark:bg-black/40 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
            {t('theme.selector.mode')}
            <select
              value={customThemeForm.mode}
              onChange={(e) => setCustomThemeForm(prev => ({ ...prev, mode: e.target.value as ThemeMode }))}
              className="w-full px-3 py-2 text-sm transition-colors border rounded-md border-gray-300/50 dark:border-gray-600/50 bg-white/70 dark:bg-black/40 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
            >
            <option value="light">{t('theme.selector.light')}</option>
            <option value="dark">{t('theme.selector.dark')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
            {t('theme.selector.baseTheme')}
            <select
              value={customThemeForm.baseTheme}
              onChange={(e) => setCustomThemeForm(prev => ({ ...prev, baseTheme: e.target.value }))}
              className="w-full px-3 py-2 text-sm transition-colors border rounded-md border-gray-300/50 dark:border-gray-600/50 bg-white/70 dark:bg-black/40 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
            >
              {availableThemes.map((themeId: string) => (
                <option key={themeId} value={themeId}>{themeId}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 mt-2">
            <button
              type="submit"
              disabled={!customThemeForm.name.trim()}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FaCheck aria-hidden="true" /> {t('theme.selector.actions.create')}
            </button>
            <button
              type="button"
              onClick={() => { setIsCreatingCustom(false); setCustomThemeForm(EMPTY_CUSTOM_THEME_FORM); }}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <FaTimes aria-hidden="true" /> {t('theme.selector.actions.cancel')}
            </button>
          </div>
        </form>
      )}

      {customThemes.length === 0 && !isCreatingCustom && (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
          {t('theme.selector.emptyCustom')}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {customThemes.map(theme => (
          <div key={theme.id} className="relative flex flex-col gap-3 p-4 transition-all duration-200 rounded-xl bg-white/30 dark:bg-black/20 border border-black/5 dark:border-white/5 hover:bg-white/50 dark:hover:bg-black/30 group">
            <div className="w-full h-16 rounded-lg opacity-90 shadow-inner" style={{
              background: getGradientBackground(theme),
            }} />
            <div className="flex flex-col">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{theme.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{theme.description}</div>
            </div>
            <div className="absolute top-2 right-2 flex gap-1 bg-white/90 dark:bg-black/60 p-1 rounded-lg shadow-sm backdrop-blur-sm pointer-events-auto">
              <button
                type="button"
                aria-label={`${t('theme.selector.actions.apply')} ${theme.name}`}
                aria-pressed={currentTheme?.id === theme.id}
                disabled={isThemeActionPending}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center p-1.5 text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-50"
                onClick={() => void handleThemeChange(theme.id)}
                title={t('theme.selector.actions.apply') || 'Apply'}
              >
                <FaCheck aria-hidden="true" />
              </button>
              <Popconfirm
                title={t('theme.selector.deleteConfirmTitle', { name: theme.name })}
                description={t('theme.selector.deleteConfirmDescription')}
                okText={t('common.delete')}
                cancelText={t('common.cancel')}
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDeleteCustomTheme(theme.id)}
              >
                <button
                  type="button"
                  aria-label={`${t('theme.selector.actions.delete')} ${theme.name}`}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  title={t('theme.selector.actions.delete') || 'Delete'}
                >
                  <FaTrash aria-hidden="true" />
                </button>
              </Popconfirm>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // 渲染设置面板
  const renderSettings = () => (
    <div className="flex flex-col gap-6">
      {showImportExport && (
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-bold tracking-wider text-gray-500 uppercase dark:text-gray-400">{t('theme.selector.import')}/{t('theme.selector.export')}</h4>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => void handleExportThemes()}
              className="flex min-h-[44px] items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white/50 border border-gray-200/50 rounded-lg hover:bg-white/80 dark:bg-black/40 dark:text-gray-200 dark:border-gray-700/50 dark:hover:bg-black/60 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <FaDownload aria-hidden="true" /> {t('theme.selector.export')}
            </button>
            <button
              type="button"
              aria-controls={importInputId}
              className="flex min-h-[44px] items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white/50 border border-gray-200/50 rounded-lg hover:bg-white/80 dark:bg-black/40 dark:text-gray-200 dark:border-gray-700/50 dark:hover:bg-black/60 shadow-sm cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              onClick={() => importInputRef.current?.click()}
            >
              <FaUpload aria-hidden="true" /> {t('theme.selector.import')}
            </button>
            <input
              ref={importInputRef}
              id={importInputId}
              type="file"
              accept=".json"
              onChange={handleImportThemes}
              className="sr-only"
              tabIndex={-1}
              aria-label={t('theme.selector.import')}
              title={t('theme.selector.import')}
            />
          </div>
          {importStatus && (
            <p
              role={importStatus === 'success' ? 'status' : 'alert'}
              className={`text-sm ${importStatus === 'success' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}
            >
              {t(`theme.selector.importStatus.${importStatus}`)}
            </p>
          )}
        </div>
      )}
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
