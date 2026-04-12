// @ts-nocheck
/**
 * 增强版主题选择器
 * 支持新的主题系统功能，包括预设、自定义主题、性能优化等
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'antd';
import { FaPalette, FaCog, FaDownload, FaUpload, FaPlus, FaTrash, FaEdit, FaCheck, FaTimes } from 'react-icons/fa';

import { useConfigIntegration, useTheme } from '@/core';
import { useDraggablePanel } from '../../hooks/useDraggablePanel';
import { Theme } from '@/core';
import { ThemeMode } from '@/core';
import { ThemePreset, PresetCategory } from '@/core';

import { getCachedThemePreset } from '@/core/themes/ThemePresetLoader';

export interface EnhancedThemeSelectorProps {
  className?: string;
  style?: React.CSSProperties;
  showPresets?: boolean;
  showCustomThemes?: boolean;
  showPerformanceMetrics?: boolean;
  showImportExport?: boolean;
  onThemeChange?: (theme: Theme) => void;
}

interface CustomThemeForm {
  id: string;
  name: string;
  description: string;
  mode: ThemeMode;
  baseTheme: string;
}

/**
 * 增强版主题选择器组件
 */
export const EnhancedThemeSelector: React.FC<EnhancedThemeSelectorProps> = ({
  className = '',
  style,
  showPresets = true,
  showCustomThemes = true,
  showPerformanceMetrics = false,
  showImportExport = true,
  onThemeChange,
}) => {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const [state, actions] = useConfigIntegration();
  const [currentTheme, setTheme] = useTheme();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'themes' | 'presets' | 'custom' | 'settings'>('themes');
  const [presets, setPresets] = useState<ThemePreset[]>([]);
  const [customThemes, setCustomThemes] = useState<Theme[]>([]);
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [customThemeForm, setCustomThemeForm] = useState<CustomThemeForm>({
    id: '',
    name: '',
    description: '',
    mode: 'light',
    baseTheme: 'light',
  });
  const [themeCache, setThemeCache] = useState<Record<string, Theme>>({});

  // 拖拽逻辑 Hook
  const { panelRef, isDragging, handlePointerDown } = useDraggablePanel();

  // 加载预设和自定义主题
  useEffect(() => {
    if (!state.integration) return;

    const loadData = async () => {
      try {
        const presetManager = state.integration!.getPresetManager();
        const themeManager = state.integration!.getThemeManager();

        // 获取所有原生主题ID进行预加载，确保主题的静态调色板提前进入内存缓存
        // 这样下方在渲染卡片预览时，调用 getThemeColor 可以同步获取到颜色数据
        const availableBuiltInIds = themeManager.getAvailablePresetIds().filter(id => !id.startsWith('custom-'));
        await themeManager.preloadThemes(availableBuiltInIds);

        const allPresets = await presetManager.getAllPresets();
        const allCustomThemes = await themeManager.getCustomThemes();

        const cache: Record<string, Theme> = {};
        for (const id of availableBuiltInIds) {
          const t = await themeManager.getTheme(id);
          if (t) cache[id] = t;
        }
        
        setThemeCache(cache);
        setPresets(allPresets);
        setCustomThemes(allCustomThemes);
      } catch (error) {
        console.error('Failed to load theme data:', error);
      }
    };

    if (state.isReady) {
      loadData();
    }
  }, [state.integration, state.isReady]);

  // 获取可用主题列表
  const availableThemes = useMemo(() => {
    if (!state.integration) return [];

    const themeManager = state.integration.getThemeManager();
    // 过滤掉 custom- 开头的主题
    return themeManager.getAvailablePresetIds().filter(id => !id.startsWith('custom-'));
  }, [state.integration]);

  // 处理主题切换
  const handleThemeChange = useCallback(async (themeId: string) => {
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
      console.error('Failed to change theme:', error);
    }
  }, [setTheme, state.integration, onThemeChange]);

  // 应用预设
  const handleApplyPreset = useCallback(async (preset: ThemePreset) => {
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
      console.error('Failed to apply preset:', error);
    }
  }, [state.integration, onThemeChange, setTheme]);

  // 创建自定义主题
  const handleCreateCustomTheme = useCallback(async () => {
    try {
      if (!state.integration) return;

      const themeManager = state.integration.getThemeManager();
      const baseThemePromise = themeManager.getTheme(customThemeForm.baseTheme);
      if (!baseThemePromise) {
        console.error('无法获取基础主题');
        return;
      }

      const baseTheme = await baseThemePromise;
      if (!baseTheme) {
        console.error('无法获取基础主题');
        return;
      }

      const customTheme: Theme = {
        ...baseTheme,
        id: customThemeForm.id || `custom-${Date.now()}`,
        name: customThemeForm.name,
        mode: customThemeForm.mode,
        // 添加description字段，如果为空则使用默认值
        ...(customThemeForm.description ? { description: customThemeForm.description } : { description: '' }),
      };

      await themeManager.addCustomTheme(customTheme);
      setCustomThemes(prev => [...prev, customTheme]);
      setIsCreatingCustom(false);
      setCustomThemeForm({
        id: '',
        name: '',
        description: '',
        mode: 'light',
        baseTheme: 'light',
      });
    } catch (error) {
      console.error('Failed to create custom theme:', error);
    }
  }, [state.integration, customThemeForm]);

  // 删除自定义主题
  const handleDeleteCustomTheme = useCallback(async (themeId: string) => {
    try {
      if (!state.integration) return;

      const themeManager = state.integration.getThemeManager();
      await themeManager.removeCustomTheme(themeId);
      setCustomThemes(prev => prev.filter(theme => theme.id !== themeId));
    } catch (error) {
      console.error('Failed to delete custom theme:', error);
    }
  }, [state.integration]);

  // 导出主题配置
  const handleExportThemes = useCallback(async () => {
    try {
      const config = await actions.exportConfig();
      const dataStr = JSON.stringify(config, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });

      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `theme-config-${new Date().toISOString().split('T')[0]}.json`;
      link.click();

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export themes:', error);
    }
  }, [actions]);

  // 导入主题配置
  const handleImportThemes = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const config = JSON.parse(e.target?.result as string);
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
      } catch (error) {
        console.error('Failed to import themes:', error);
      }
    };
    reader.readAsText(file);
  }, [actions, state.integration]);

  const getGradientBackground = (item: any) => {
    const themeManager = state.integration?.getThemeManager();
    const themeData = item.theme || item;
    let colors: string[] = [];
    
    if (themeData?.palette) {
        const getCol = (c: any, sub: string = 'main') => typeof c === 'string' ? c : c?.[sub] || c?.main;
        colors = [
            getCol(themeData.palette.primary, 'light'),
            getCol(themeData.palette.primary, 'main'),
            getCol(themeData.palette.secondary, 'main'),
            getCol(themeData.palette.secondary, 'light') || getCol(themeData.palette.primary, 'dark')
        ].filter(Boolean) as string[];
    } else if (themeManager) {
        let themeId = item.id;
        if (themeId && !themeManager.hasTheme?.(themeId) && item.baseTheme) {
            themeId = item.baseTheme;
        }
        if (themeId) {
            const p = themeManager.getThemeColor(themeId, 'primary');
            const s = themeManager.getThemeColor(themeId, 'secondary');
            if (p) colors.push(p);
            if (s) colors.push(s);
        }
    }
    
    if (colors.length === 0) colors = [token.colorPrimary || '#1677ff', token.colorFillSecondary || '#f0f0f0'];
    if (colors.length === 1) colors.push(colors[0]);
    
    return `linear-gradient(135deg, ${colors.join(', ')})`;
  };

  // 渲染主题列表
  const renderThemeList = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {availableThemes.map((themeId: string) => {
        const themeManager = state.integration?.getThemeManager();
        // 优先从预设加载颜色数据，确保预览卡片能显示出五彩渐变色
        let preset = presets.find(p => p.id === themeId);
        if (!preset) {
            preset = getCachedThemePreset(themeId);
        }
        
        const themeData = themeCache[themeId] || (preset ? preset.theme : (themeManager?.getCurrentThemeId() === themeId ? themeManager?.getCurrentTheme() : null));
        
        const isActive = currentTheme?.id === themeId;

        return (
          <div
            key={themeId}
            className={`relative flex flex-col gap-3 p-4 transition-all duration-200 rounded-xl cursor-pointer border ${isActive ? 'bg-white/60 dark:bg-black/40 border-blue-500/50 shadow-md shadow-blue-500/10' : 'bg-white/30 dark:bg-black/20 border-black/5 dark:border-white/5 hover:bg-white/50 dark:hover:bg-black/30'}`}
            onClick={() => handleThemeChange(themeId)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleThemeChange(themeId); } }}
          >
            <div className="w-full h-16 rounded-lg opacity-90 shadow-inner" style={{
              background: getGradientBackground(preset || themeData || { id: themeId }),
            }} />
            <div className="flex flex-col pt-2 pointer-events-none">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 capitalize">
                {preset?.name || t(`theme.selector.${themeId}`, { defaultValue: themeId })}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {preset?.category === 'built-in' ? '基础主题' : preset?.category === 'preset' ? '系统预设' : t('theme.selector.themes')}
              </div>
            </div>
            {isActive && <FaCheck className="absolute top-3 right-3 text-blue-500 p-1 bg-white/80 dark:bg-black/50 rounded-full shadow-sm" />}
          </div>
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
              <h4 className="text-xs font-bold tracking-wider text-gray-500 uppercase dark:text-gray-400">{category.name}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {categoryPresets.map(preset => (
                  <div
                    key={preset.id}
                    className="flex flex-col gap-3 p-4 transition-all duration-200 rounded-xl cursor-pointer border bg-white/30 dark:bg-black/20 border-black/5 dark:border-white/5 hover:bg-white/50 dark:hover:bg-black/30"
                    onClick={() => handleApplyPreset(preset)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleApplyPreset(preset); } }}
                  >
                    <div className="w-full h-16 rounded-lg opacity-90 shadow-inner" style={{
                      background: getGradientBackground(preset),
                    }} />
                    <div className="relative pt-16 flex-1 text-left z-10 flex flex-col pointer-events-none">
                      <span className="font-medium text-gray-800 dark:text-gray-100 capitalize">
                        {preset?.name || preset.id}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {preset?.category === 'built-in' ? '基础主题' : preset?.category === 'preset' ? '系统预设' : '自定义'}
                      </span>
                    </div>
                  </div>
                ))}
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
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors pointer-events-auto shadow-sm"
          onClick={() => setIsCreatingCustom(true)}
        >
          <FaPlus /> {t('theme.selector.create')}
        </button>
      </div>

      {isCreatingCustom && (
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-white/50 dark:bg-black/30 border border-blue-200/50 dark:border-blue-800/30">
          <input
            type="text"
            placeholder={t('theme.selector.name')}
            value={customThemeForm.name}
            onChange={(e) => setCustomThemeForm(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-3 py-2 text-sm transition-colors border rounded-md border-gray-300/50 dark:border-gray-600/50 bg-white/70 dark:bg-black/40 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
          />
          <input
            type="text"
            placeholder={t('theme.selector.desc')}
            value={customThemeForm.description}
            onChange={(e) => setCustomThemeForm(prev => ({ ...prev, description: e.target.value }))}
            className="w-full px-3 py-2 text-sm transition-colors border rounded-md border-gray-300/50 dark:border-gray-600/50 bg-white/70 dark:bg-black/40 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
          />
          <select
            value={customThemeForm.mode}
            onChange={(e) => setCustomThemeForm(prev => ({ ...prev, mode: e.target.value as ThemeMode }))}
            title={t('theme.selector.mode') || 'Mode'}
            className="w-full px-3 py-2 text-sm transition-colors border rounded-md border-gray-300/50 dark:border-gray-600/50 bg-white/70 dark:bg-black/40 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
          >
            <option value="light">{t('theme.selector.light')}</option>
            <option value="dark">{t('theme.selector.dark')}</option>
          </select>
          <select
            value={customThemeForm.baseTheme}
            onChange={(e) => setCustomThemeForm(prev => ({ ...prev, baseTheme: e.target.value }))}
            title={t('theme.selector.baseTheme') || 'Base Theme'}
            className="w-full px-3 py-2 text-sm transition-colors border rounded-md border-gray-300/50 dark:border-gray-600/50 bg-white/70 dark:bg-black/40 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
          >
            {availableThemes.map((themeId: string) => (
              <option key={themeId} value={themeId}>{themeId}</option>
            ))}
          </select>
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleCreateCustomTheme}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 shadow-sm transition-colors"
            >
              <FaCheck /> {t('theme.selector.actions.create')}
            </button>
            <button
              onClick={() => setIsCreatingCustom(false)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <FaTimes /> {t('theme.selector.actions.cancel')}
            </button>
          </div>
        </div>
      )}

      {customThemes.length === 0 && !isCreatingCustom && (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
          暂无自定义主题
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {customThemes.map(theme => (
          <div key={theme.id} className="relative flex flex-col gap-3 p-4 transition-all duration-200 rounded-xl bg-white/30 dark:bg-black/20 border border-black/5 dark:border-white/5 hover:bg-white/50 dark:hover:bg-black/30 group">
            <div className="w-full h-16 rounded-lg opacity-90 shadow-inner" style={{
              background: getGradientBackground(theme),
            }} />
            <div className="flex flex-col">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{theme.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{theme.description}</div>
            </div>
            {/* 隐藏的悬浮按钮 */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/90 dark:bg-black/60 p-1 rounded-lg shadow-sm backdrop-blur-sm pointer-events-auto">
              <button
                className="p-1.5 text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                onClick={() => handleThemeChange(theme.id)}
                title={t('theme.selector.actions.apply') || 'Apply'}
              >
                <FaCheck />
              </button>
              <button
                className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded"
                onClick={() => handleDeleteCustomTheme(theme.id)}
                title={t('theme.selector.actions.delete') || 'Delete'}
              >
                <FaTrash />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // 渲染设置面板
  const renderSettings = () => (
    <div className="flex flex-col gap-6">
      {showPerformanceMetrics && (
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-bold tracking-wider text-gray-500 uppercase dark:text-gray-400">{t('theme.selector.performance')}</h4>
          <div className="p-4 rounded-xl bg-white/30 dark:bg-black/20 border border-black/5 dark:border-white/5">
            {/* 性能指标显示 */}
          </div>
        </div>
      )}

      {showImportExport && (
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-bold tracking-wider text-gray-500 uppercase dark:text-gray-400">{t('theme.selector.import')}/{t('theme.selector.export')}</h4>
          <div className="flex gap-4">
            <button
              onClick={handleExportThemes}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white/50 border border-gray-200/50 rounded-lg hover:bg-white/80 dark:bg-black/40 dark:text-gray-200 dark:border-gray-700/50 dark:hover:bg-black/60 shadow-sm transition-colors"
            >
              <FaDownload /> {t('theme.selector.export')}
            </button>
            <div
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white/50 border border-gray-200/50 rounded-lg hover:bg-white/80 dark:bg-black/40 dark:text-gray-200 dark:border-gray-700/50 dark:hover:bg-black/60 shadow-sm cursor-pointer transition-colors"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                const input = (e.currentTarget.nextElementSibling as HTMLInputElement);
                if (input) input.click();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  const input = (e.currentTarget.nextElementSibling as HTMLInputElement);
                  if (input) input.click();
                }
              }}
            >
              <FaUpload /> {t('theme.selector.import')}
            </div>
            <input
              type="file"
              accept=".json"
              onChange={handleImportThemes}
              style={{ display: 'none' }}
              tabIndex={-1}
              aria-label={t('theme.selector.import')}
              title={t('theme.selector.import')}
            />
          </div>
        </div>
      )}
    </div>
  );

  if (!state.isReady) {
    return (
      <div className={`p-2 rounded w-8 h-8 flex animate-pulse bg-black/5 dark:bg-white/5 ${className}`} style={style} />
    );
  }

  const activeTabClass = "bg-white/50 dark:bg-black/30 text-blue-600 dark:text-blue-400 shadow-sm border border-black/5 dark:border-white/5";
  const inactiveTabClass = "text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 border border-transparent";

  return (
    <>
      <button
        className={`flex items-center gap-2 h-8 px-3 text-sm transition-colors rounded-[8px] bg-white/70 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border border-black/5 dark:border-white/10 hover:bg-white flex items-center justify-center dark:hover:bg-[#2C2C2E]/90 text-gray-700 dark:text-gray-200 shadow-sm shadow-black/5 pointer-events-auto ${className}`}
        onClick={() => setIsOpen(!isOpen)}
        style={style}
      >
        <div
          className="w-[14px] h-[14px] rounded-full border border-black/10 dark:border-white/20 shadow-sm"
          style={{
            background: currentTheme?.palette?.primary?.main || token.colorPrimary,
          }}
        />
        <span>
          {currentTheme
            ? t(`theme.selector.${currentTheme.id}`, { defaultValue: currentTheme.name })
            : t('theme.selector.choose')}
        </span>
      </button>

      {isOpen && createPortal(
        <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsOpen(false)}>
          <div
            className="relative flex flex-col w-full max-w-2xl max-h-[85vh] rounded-2xl bg-white/70 dark:bg-[#1C1C1E]/80 backdrop-blur-xl backdrop-saturate-150 border border-white/20 dark:border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.12)] overflow-hidden transition-all duration-300 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            style={{
              cursor: isDragging ? 'grabbing' : 'default',
            }}
            ref={panelRef}
          >
            {/* Header */}
            <div className="flex-none px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50 flex items-center justify-between"
              onPointerDown={handlePointerDown}
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
              <div className="flex items-center gap-3 text-lg font-semibold text-gray-800 dark:text-gray-100">
                <FaPalette className="text-purple-500" />
                <h2>{t('theme.selector.title')}</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-2 text-gray-500 transition-colors rounded-full hover:bg-black/5 dark:hover:bg-white/10 hover:text-gray-800 dark:hover:text-gray-100 cursor-pointer"
                title={t('config.actions.close')}
              >
                <FaTimes />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex-none flex px-6 py-2 gap-2 overflow-x-auto border-b border-gray-200/50 dark:border-gray-700/50 scrollbar-hide">
              <button
                className={`flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap cursor-pointer ${activeTab === 'themes' ? activeTabClass : inactiveTabClass}`}
                onClick={() => setActiveTab('themes')}
              >
                {t('theme.selector.themes')}
              </button>
              {showPresets && (
                <button
                  className={`flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap cursor-pointer ${activeTab === 'presets' ? activeTabClass : inactiveTabClass}`}
                  onClick={() => setActiveTab('presets')}
                >
                  {t('theme.selector.presets')}
                </button>
              )}
              {showCustomThemes && (
                <button
                  className={`flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap cursor-pointer ${activeTab === 'custom' ? activeTabClass : inactiveTabClass}`}
                  onClick={() => setActiveTab('custom')}
                >
                  {t('theme.selector.custom')}
                </button>
              )}
              <div className="flex-1" />
              <button
                className={`flex-none p-2 rounded-lg transition-all duration-200 cursor-pointer flex items-center justify-center ${activeTab === 'settings' ? activeTabClass : inactiveTabClass}`}
                onClick={() => setActiveTab('settings')}
                title={t('theme.selector.settings') || 'Settings'}
              >
                <FaCog />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
              {activeTab === 'themes' && renderThemeList()}
              {activeTab === 'presets' && showPresets && renderPresetList()}
              {activeTab === 'custom' && showCustomThemes && renderCustomThemes()}
              {activeTab === 'settings' && renderSettings()}
            </div>
          </div>
        </div>,
        (document.fullscreenElement as HTMLElement | null) || document.body
      )}
    </>
  );


};

export default EnhancedThemeSelector;
