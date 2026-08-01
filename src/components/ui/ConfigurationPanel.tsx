/**
 * 配置面板组件
 * 提供简洁易用的配置管理界面，支持实时编辑和预览
 */

import React, { useState, useEffect, useMemo, useCallback, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  logConfigurationPanelConfigLoadFailure,
  logConfigurationPanelSaveFailure,
} from '@/components/configurationLogging';
import { LayeredConfigManager } from '@/core/config/LayeredConfigManager';
import { LayoutStrategyManager } from '@/core/strategies/LayoutStrategyManager';
import { FaTimes, FaUndo, FaCheck, FaExclamationTriangle, FaCog } from 'react-icons/fa';
import { useConfigIntegration } from '@/core/hooks/useConfigIntegration';
import { useModalFocusTrap } from '@/hooks/useModalFocusTrap';
import { safeLog } from '@/core/utils/consoleCleanup';
import { createConfigurationItemsByCategory } from './configurationPanelCatalog';
import {
  stageConfigurationPreset,
  type ConfigurationPresetId,
} from './configurationPanelPresets';
import {
  coerceConfigValue,
  type ConfigItem,
  type ConfigTab,
  type ConfigValue,
  type ConfigValues,
} from './configurationPanelModel';

export interface ConfigurationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 配置面板组件
 */
export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({
  isOpen,
  onClose,
  className = '',
  style,
}) => {
  const { t } = useTranslation();
  const [state, actions] = useConfigIntegration();
  const [editingValues, setEditingValues] = useState<ConfigValues>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set());
  const [isAdvancedMode, setIsAdvancedMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ConfigTab>('basic');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const saveInFlightRef = useRef(false);
  const isSaving = saveStatus === 'saving';
  const handleCancel = useCallback(() => {
    if (saveInFlightRef.current) return;
    setEditingValues({});
    setHasChanges(false);
    setChangedKeys(new Set());
    setSaveStatus('idle');
    onClose();
  }, [onClose]);
  const { containerRef: dialogRef, handleKeyDown: handleDialogKeyDown } = useModalFocusTrap<HTMLDivElement>({
    active: isOpen,
    initialFocusRef: closeButtonRef,
    onClose: handleCancel,
  });

  const configItemsByCategory = useMemo(() => {
    const layoutManager = LayoutStrategyManager.getShared();
    return createConfigurationItemsByCategory(
      layoutManager.getAvailableHierarchyStrategies().map(({ type }) => type),
      layoutManager.getAvailableNodeStrategies().map(({ type }) => type),
    );
  }, []);

// 获取所有配置项的扁平列表
const configItems: ConfigItem[] = useMemo(() => [
  ...configItemsByCategory.nodes,
  ...configItemsByCategory.containers,
  ...configItemsByCategory.spacing,
  ...configItemsByCategory.edges,
  ...configItemsByCategory.layout,
  ...configItemsByCategory.performance
], [configItemsByCategory]);

// 加载当前配置值
useEffect(() => {
  if (!isOpen || !state.isReady || !state.integration) return;

  const loadCurrentValues = async () => {
    const currentValues: ConfigValues = {};

    for (const item of configItems) {
      try {
        const value = await actions.getConfig<unknown>(item.key);
        currentValues[item.key] = value !== undefined ? coerceConfigValue(item, value) : item.value;
      } catch (error) {
        logConfigurationPanelConfigLoadFailure(item.key, error);
        currentValues[item.key] = item.value;
      }
    }

    setEditingValues(currentValues);
    setHasChanges(false);
    setChangedKeys(new Set());
    setSaveStatus('idle');
  };

  loadCurrentValues();
}, [actions, configItems, isOpen, state.isReady, state.integration]);

// 处理配置值变更
// 处理配置值变更
const getEngineNodeLayout = useCallback((nodeStrategy?: ConfigValue) => {
  const normalized = String(nodeStrategy || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '');
  const map: Record<string, string> = {
    dagrelayout: 'dagre',
    dagre: 'dagre',
    horizontallayout: 'horizontal',
    horizontal: 'horizontal',
    verticallayout: 'vertical',
    vertical: 'vertical',
    gridlayout: 'grid',
    grid: 'grid',
    centeredlayout: 'flow',
    centered: 'flow'
  };
  return map[normalized];
}, []);

const requestLayoutApply = useCallback((values: ConfigValues) => {
  const strategy = values['diagram.layout.strategy'];
  if (typeof strategy !== 'string' || !strategy || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('editor:command', {
    detail: {
      action: 'apply-layout',
      strategy,
      nodeLayout: getEngineNodeLayout(values['diagram.layout.nodeStrategy']),
      direction: values['diagram.layout.direction']
    }
  }));
}, [getEngineNodeLayout]);

const handleValueChange = useCallback((key: string, value: unknown) => {
  const item = configItems.find(candidate => candidate.key === key);
  if (!item) {
    safeLog.warn('[Config] Ignoring unknown config key:', key);
    return;
  }

  const nextValue = coerceConfigValue(item, value);
  safeLog.debug('[Config] handleValueChange:', key, nextValue);

  // 联动逻辑：当选择域水平/垂直布局时，默认将子域内部节点按纵向流程排列
  if (key === 'diagram.layout.strategy' && (nextValue === 'DomainHorizontalLayout' || nextValue === 'DomainVerticalLayout')) {
    safeLog.info('[Config] Auto-switching nodeStrategy to VerticalLayout');
    setEditingValues(prev => ({
      ...prev,
      [key]: nextValue,
      'diagram.layout.nodeStrategy': 'VerticalLayout'
    }));
    setHasChanges(true);
    setChangedKeys(prev => new Set(prev).add(key).add('diagram.layout.nodeStrategy'));
    return;
  }

  setEditingValues(prev => ({
    ...prev,
    [key]: nextValue
  }));

  setHasChanges(true);
  setChangedKeys(prev => new Set(prev).add(key));
  setSaveStatus('idle');
}, [configItems]);

// 保存所有更改
const handleSaveChanges = useCallback(async () => {
  if (!state.isReady || !state.integration || saveInFlightRef.current || changedKeys.size === 0) return;

  saveInFlightRef.current = true;
  setSaveStatus('saving');
  try {
    for (const key of changedKeys) {
      const item = configItems.find(candidate => candidate.key === key);
      if (!item) continue;
      const value = editingValues[item.key] ?? item.value;
      await actions.setConfig(item.key, coerceConfigValue(item, value));
    }
    if (
      changedKeys.has('diagram.layout.strategy') ||
      changedKeys.has('diagram.layout.nodeStrategy') ||
      changedKeys.has('diagram.layout.direction')
    ) {
      requestLayoutApply(editingValues);
    }
    setHasChanges(false);
    setChangedKeys(new Set());
    setSaveStatus('success');
  } catch (error) {
    logConfigurationPanelSaveFailure(error);
    setSaveStatus('error');
  } finally {
    saveInFlightRef.current = false;
  }
}, [actions, changedKeys, configItems, editingValues, requestLayoutApply, state.integration, state.isReady]);

// 重置所有更改
const handleResetChanges = useCallback(() => {
  const resetValues: ConfigValues = {};
  configItems.forEach(item => {
    resetValues[item.key] = item.value;
  });
  setEditingValues(resetValues);
  setHasChanges(true);
  setChangedKeys(new Set(configItems.map(item => item.key)));
  setSaveStatus('idle');
}, [configItems]);

const handleStagePreset = useCallback((presetId: ConfigurationPresetId) => {
  const staged = stageConfigurationPreset(editingValues, presetId);
  setEditingValues(staged.values);
  setHasChanges(true);
  setChangedKeys(previous => {
    const next = new Set(previous);
    staged.changedKeys.forEach(key => next.add(key));
    return next;
  });
  setSaveStatus('idle');
}, [editingValues]);

// 渲染配置项编辑器
const renderConfigEditor = (item: ConfigItem, hasDescription: boolean) => {
  const currentValue = editingValues[item.key] ?? item.value;
  const numericValue = typeof currentValue === 'number' ? currentValue : Number(item.value);
  const stringValue = String(currentValue ?? '');
  const layeredStrategy = String(LayeredConfigManager.getInstance().get<string>('diagram.layout.strategy', '') || '');
  const currentLayoutStrategy = String(editingValues['diagram.layout.strategy'] || layeredStrategy || '');
  const nodeLayoutDisabled = item.key === 'diagram.layout.nodeStrategy' &&
    !LayoutStrategyManager.getShared().isNodeLayoutExternallySelectable(currentLayoutStrategy);
  const fieldId = `configuration-field-${item.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const labelId = `${fieldId}-label`;
  const descriptionId = `${fieldId}-description`;
  const getOptionLabel = (option: string) => {
    if (item.key === 'diagram.edge.pathType' && option === 'auto') {
      return t('config.options.autoPathType', 'Auto Path');
    }
    const trOpt = t(`config.options.${option}`);
    return trOpt.startsWith('config.') ? option : trOpt;
  };

  switch (item.type) {
    case 'number':
      return (
        <input
          id={fieldId}
          type="number"
          value={Number.isFinite(numericValue) ? numericValue : ''}
          min={item.min}
          max={item.max}
          step={item.step}
          onChange={(e) => handleValueChange(item.key, e.target.value)}
          disabled={isSaving}
          aria-labelledby={labelId}
          aria-describedby={hasDescription ? descriptionId : undefined}
          className="w-full sm:w-24 min-h-[44px] px-3 py-1.5 text-[13px] font-medium text-center transition-all bg-black/[0.04] dark:bg-white/10 border border-black/5 dark:border-white/5 rounded-[6px] text-gray-800 dark:text-gray-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.15] hover:border-black/10 dark:hover:border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white dark:focus:bg-black/50 focus:border-indigo-500"
          title={t(`config.${item.key}.label`)}
        />
      );

    case 'boolean':
      return (
        <label htmlFor={fieldId} className="relative inline-flex min-w-[44px] min-h-[44px] items-center justify-end cursor-pointer group">
          <input
            id={fieldId}
            type="checkbox"
            role="switch"
            aria-labelledby={labelId}
            aria-describedby={hasDescription ? descriptionId : undefined}
            checked={Boolean(currentValue)}
            onChange={(e) => handleValueChange(item.key, e.target.checked)}
            disabled={isSaving}
            className="sr-only peer"
          />
          <div className="w-[36px] h-[20px] bg-black/10 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 rounded-full peer dark:bg-white/10 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-200/50 after:border after:rounded-full after:h-[16px] after:w-[16px] after:transition-all after:shadow-sm dark:border-gray-600 peer-checked:bg-indigo-500 group-hover:bg-black/15 dark:group-hover:bg-white/15 peer-checked:group-hover:bg-indigo-600 transition-colors"></div>
        </label>
      );

    case 'select':
      return (
        <div className="flex flex-col items-end gap-1">
          <select
            id={fieldId}
            value={stringValue}
            onChange={(e) => handleValueChange(item.key, e.target.value)}
            aria-labelledby={labelId}
            aria-describedby={hasDescription ? descriptionId : undefined}
            className="w-full sm:w-48 min-h-[44px] px-3 py-1.5 text-[13px] font-medium transition-all bg-black/[0.04] dark:bg-white/10 border border-black/5 dark:border-white/5 rounded-[6px] text-gray-800 dark:text-gray-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.15] hover:border-black/10 dark:hover:border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white dark:focus:bg-black/50 focus:border-indigo-500 cursor-pointer disabled:opacity-50 appearance-none"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1em' }}
            disabled={nodeLayoutDisabled || isSaving}
            title={t(`config.${item.key}.label`)}
          >
            {item.options?.map(option => (
              <option key={option} value={option}>
                {getOptionLabel(option)}
              </option>
            ))}
          </select>
          {nodeLayoutDisabled && (
            <div className="text-[10px] text-amber-500 font-medium">
              {t('config.layout.nodeLayoutManaged')}
            </div>
          )}
        </div>
      );

    case 'string':
    default:
      return (
        <input
          id={fieldId}
          type="text"
          value={stringValue}
          onChange={(e) => handleValueChange(item.key, e.target.value)}
          disabled={isSaving}
          aria-labelledby={labelId}
          aria-describedby={hasDescription ? descriptionId : undefined}
          className="w-full sm:w-64 min-h-[44px] px-3 py-1.5 text-[13px] font-medium transition-all bg-black/[0.04] dark:bg-white/10 border border-black/5 dark:border-white/5 rounded-[6px] text-gray-800 dark:text-gray-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.15] hover:border-black/10 dark:hover:border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white dark:focus:bg-black/50 focus:border-indigo-500"
          title={t(`config.${item.key}.label`)}
        />
      );
  }
};

// 渲染单个配置项 (macOS System Settings Style Row)
const renderConfigItem = (item: ConfigItem) => {
  const rawLabel = t(`config.${item.key}.label`);
  const name = item.key.split('.').pop() || '';
  const fallbackLabel = /^[A-Z_]+$/.test(name) 
    ? name.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
    : name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    
  const displayLabel = rawLabel.startsWith('config.') 
    ? (item.label || fallbackLabel)
    : rawLabel;

  const rawDesc = t(`config.${item.key}.desc`);
  const displayDesc = rawDesc.startsWith('config.') ? item.description : rawDesc;
  // Extract primary sentence to avoid wall of text, keep rest in tooltip
  const primaryDesc = displayDesc ? displayDesc.split(' - ')[0] : '';
  const fieldId = `configuration-field-${item.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  return (
  <div key={item.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]" style={{ padding: 'var(--glass-padding-sm) var(--glass-padding-md)' }}>
    <div className="flex flex-col pr-4 flex-1 min-w-0">
      <div id={`${fieldId}-label`} className="text-[13px] font-medium text-gray-800 dark:text-gray-200 leading-tight">
        {displayLabel}
      </div>
      {primaryDesc && (
        <div
          id={`${fieldId}-description`}
          className="mt-0.5 text-[11.5px] text-gray-500 dark:text-gray-400 line-clamp-2 sm:truncate max-w-[280px] cursor-help"
          title={displayDesc}
        >
          {primaryDesc}
        </div>
      )}
    </div>

    <div className="flex items-center w-full sm:w-auto flex-none">
      {renderConfigEditor(item, Boolean(primaryDesc))}
    </div>
  </div>
  );
};

// 渲染当前标签页的内容（支持分组）
const renderTabContent = () => {
  const items = configItemsByCategory[activeTab];
  const hasGroups = items.some(item => item.group);

  if (!hasGroups) {
    return (
      <div className="flex flex-col gap-4 pb-4">
        <div className="flex flex-col bg-white dark:bg-[#1A1A1C] shadow-sm border border-gray-200/60 dark:border-white/10 rounded-[12px] overflow-hidden divide-y divide-gray-100 dark:divide-white/5">
          {items.map(renderConfigItem)}
        </div>
      </div>
    );
  }

  // 按分组组织数据
  const groups: { name: string; items: ConfigItem[] }[] = [];
  let currentGroup: { name: string; items: ConfigItem[] } | null = null;

  items.forEach(item => {
    const groupName = item.group || 'other';
    if (!currentGroup || currentGroup.name !== groupName) {
      currentGroup = { name: groupName, items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push(item);
  });

  return (
    <div className="flex flex-col pb-4" style={{ gap: 'var(--glass-padding-lg)' }}>
      {groups.map((group, index) => (
        <div key={index} className="flex flex-col">
          <div className="mb-2" style={{ paddingLeft: 'var(--glass-padding-sm)' }}>
            <h3 className="text-[11px] font-bold tracking-wider text-indigo-500/80 dark:text-indigo-400/80 uppercase">
              {(() => {
                const map: Record<string, string> = {
                  '基础设置': 'basic', '避障与容器': 'obstacle', '几何微调': 'geometry', '偏好权重': 'preference',
                  '高级采样': 'sampling', '贝塞尔微调': 'bezier', '核心策略': 'core', 'ELK 基础': 'elkBasic',
                  'ELK 间距': 'elkSpacing', 'ELK 高级微调': 'elkAdvanced', 'other': 'other'
                };
                const groupKey = map[group.name] || group.name;
                return t(`config.groups.${groupKey}`);
              })()}
            </h3>
          </div>
          <div className="shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),0_4px_16px_-4px_rgba(0,0,0,0.02)] border border-black/[0.06] dark:border-white/[0.08] overflow-hidden divide-y divide-black/[0.04] dark:divide-white/[0.06] bg-white/60 dark:bg-[#1A1A1C]/60 backdrop-blur-xl" style={{ borderRadius: 'calc(var(--glass-radius) * 1.2)' }}>
            {group.items.map(renderConfigItem)}
          </div>
        </div>
      ))}
    </div>
  );
};

// 如果模态框未打开，不渲染任何内容
if (!isOpen) {
  return null;
}

// 修复（函数级注释）：在元素全屏模式下，挂载到 body 的 portal 不可见
// 解决方案：优先挂载到 document.fullscreenElement，其次回退到 body
if (!state.isReady) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm transition-opacity duration-300 opacity-100 pointer-events-auto">
      <div className="relative flex flex-col w-[300px] h-[200px] rounded-2xl bg-white/70 dark:bg-[#1C1C1E]/80 backdrop-blur-xl backdrop-saturate-150 border border-white/20 dark:border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.12)] overflow-hidden items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-gray-600 dark:text-gray-300">
          <FaCog className="w-8 h-8 animate-spin text-blue-500" />
          <p className="font-medium text-sm">{t('config.loading')}</p>
          {state.error && <p className="text-red-500 text-xs mt-2 text-center px-4">{t('config.error', { message: state.error })}</p>}
        </div>
      </div>
    </div>,
    (document.fullscreenElement as HTMLElement | null) || document.body
  );
}

// 等效于 iOS/macOS 风格的激活态与默认态
const activeTabClass = "bg-white dark:bg-[#2C2C2E] text-gray-900 dark:text-white font-semibold shadow-sm rounded-[6px] border border-black/[0.04] dark:border-white/[0.04]";
const inactiveTabClass = "text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 font-medium rounded-[6px] border border-transparent";
const actionBtnPrimary = "text-white bg-gradient-to-b from-gray-800 to-black hover:from-gray-700 hover:to-gray-900 dark:from-gray-200 dark:to-white dark:text-black dark:hover:from-white dark:hover:to-white shadow-[0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.1)] border-transparent";
const actionBtnSecondary = "text-gray-700 dark:text-gray-200 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 border border-black/[0.08] dark:border-white/10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]";
const visibleTabs: Array<{ id: ConfigTab; label: string }> = isAdvancedMode ? [
  { id: 'nodes', label: t('config.tabs.nodes') },
  { id: 'containers', label: t('config.tabs.containers') },
  { id: 'spacing', label: t('config.tabs.spacing') },
  { id: 'edges', label: t('config.tabs.edges') },
  { id: 'layout', label: t('config.tabs.layout') },
  { id: 'performance', label: t('config.tabs.performance') },
] : [
  { id: 'basic', label: t('config.tabs.basic') },
];
const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
  const horizontalDelta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  const verticalDelta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
  let nextIndex: number;
  if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = visibleTabs.length - 1;
  else if (horizontalDelta || verticalDelta) {
    nextIndex = (index + horizontalDelta + verticalDelta + visibleTabs.length) % visibleTabs.length;
  } else {
    return;
  }
  event.preventDefault();
  const nextTab = visibleTabs[nextIndex];
  setActiveTab(nextTab.id);
  dialogRef.current
    ?.querySelector<HTMLButtonElement>(`[data-configuration-tab="${nextTab.id}"]`)
    ?.focus();
};

// 修复（函数级注释）：确保配置面板在全屏下可见，portal 挂载到全屏元素
return createPortal(
  <div className={`fixed inset-0 z-[5000] flex items-center justify-center bg-black/30 dark:bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} style={{ padding: 'var(--glass-padding-lg)' }} onClick={handleCancel}>
    {/* Vercel/Linear 风格设置面板 (Sidebar Master-Detail) */}
    <div
         ref={dialogRef}
         role="dialog"
         aria-modal="true"
         aria-labelledby={titleId}
         tabIndex={-1}
         onKeyDown={handleDialogKeyDown}
         data-testid="configuration-panel-shell"
         className={`relative flex flex-col sm:flex-row w-full max-w-[900px] h-[calc(100dvh-32px)] sm:h-full max-h-[640px] border-none shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1),inset_0_0_0_1px_rgba(255,255,255,0.45)] dark:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1),inset_0_0_0_1px_rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(28,28,41,0.65)] backdrop-blur-[24px] backdrop-saturate-[180%] transition-all duration-300 transform ${isOpen ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-8 opacity-0'} overflow-hidden ${className}`}
         style={{
           borderRadius: 'calc(var(--glass-radius) * 1.6)',
           ...style,
         }}
         onClick={(e) => e.stopPropagation()}>
      
      {/* 左侧导航栏 Sidebar */}
      <div data-testid="configuration-panel-sidebar" className="w-full sm:w-[240px] flex-none flex flex-col border-b sm:border-b-0 sm:border-r border-black/10 dark:border-white/10" style={{ backgroundColor: 'rgba(0, 0, 0, 0.03)' }}>
        <div className="border-b border-transparent" style={{ padding: 'var(--glass-padding-md)' }}>
          <h2 id={titleId} className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <div className="p-1.5 bg-indigo-500/10 rounded-md">
              <FaCog className="text-indigo-600 dark:text-indigo-400 w-3.5 h-3.5" />
            </div>
            {t('config.title')}
          </h2>
        </div>
        
        <div role="tablist" aria-label={t('config.title')} aria-orientation="horizontal" className="flex sm:flex-col flex-none sm:flex-1 overflow-x-auto sm:overflow-x-hidden sm:overflow-y-auto gap-1 scrollbar-thin scrollbar-thumb-black/10 dark:scrollbar-thumb-white/10" style={{ padding: 'var(--glass-padding-sm)' }}>
          {visibleTabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`configuration-tab-${tab.id}`}
              data-configuration-tab={tab.id}
              aria-controls="configuration-tabpanel"
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`w-auto sm:w-full min-h-[44px] flex-none flex items-center px-3.5 py-2.5 text-[13px] whitespace-nowrap rounded-[6px] transition-colors ${activeTab === tab.id ? activeTabClass : inactiveTabClass}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 高级模式切换 */}
        <div className="border-t border-black/5 dark:border-white/5 bg-gray-50/50 dark:bg-black/20" style={{ padding: 'var(--glass-padding-md)' }}>
          <div className="flex min-h-[44px] items-center justify-between group">
            <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {t('config.groups.expertMode', 'Expert Mode')}
            </span>
            <button
                type="button"
                role="switch"
                aria-label={t('config.groups.expertMode', 'Expert Mode')}
                aria-checked={isAdvancedMode}
                className={`relative inline-flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600/50 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed`}
                disabled={isSaving}
                onClick={() => {
                  const advanced = !isAdvancedMode;
                  setIsAdvancedMode(advanced);
                  setActiveTab(advanced ? 'nodes' : 'basic');
                }}
              >
              <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isAdvancedMode ? 'bg-[#111111] dark:bg-white' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <span className={`pointer-events-none absolute left-[2px] top-[2px] inline-block h-4 w-4 transform rounded-full shadow ring-0 transition duration-200 ease-in-out ${isAdvancedMode ? 'translate-x-4 bg-white dark:bg-black' : 'translate-x-0 bg-white dark:bg-gray-200'}`} />
              </span>
            </button>
          </div>
        </div>
      </div>

        {/* 右侧主区域 Main Content */}
        <div className="flex-1 flex flex-col relative bg-transparent overflow-hidden">
          {/* 顶部标题栏 & 关闭按钮 */}
          <div className="flex-none flex items-center justify-between" style={{ padding: 'var(--glass-padding-md) var(--glass-padding-lg) var(--glass-padding-sm)' }}>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight leading-none">
              {t(`config.tabs.${activeTab}`)}
            </h1>
            <button ref={closeButtonRef} type="button" onClick={handleCancel} disabled={isSaving} aria-label={t('config.actions.close')} className="-mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-gray-400 hover:text-gray-800 hover:bg-black/5 dark:hover:text-gray-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title={t('config.actions.close')}>
              <FaTimes className="w-4 h-4" />
            </button>
          </div>

          {/* 滚动内容区 */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-black/10 dark:scrollbar-thumb-white/10" style={{ padding: '0 var(--glass-padding-lg) var(--glass-padding-lg)' }}>
            <div id="configuration-tabpanel" role="tabpanel" aria-labelledby={`configuration-tab-${activeTab}`} tabIndex={0} className="w-full max-w-2xl mx-auto pb-8">
              {renderTabContent()}
            {activeTab === 'layout' && (
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button
                type="button"
                className={`min-h-[44px] flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-medium transition-colors rounded-lg flex-1 sm:flex-none disabled:opacity-50 disabled:cursor-not-allowed ${actionBtnSecondary}`}
                onClick={() => handleStagePreset('elk-compact')}
                disabled={isSaving}
                title={t('config.actions.applyCompact')}
              >
                {t('config.actions.applyCompact')}
              </button>
              <button
                type="button"
                className={`min-h-[44px] flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-medium transition-colors rounded-lg flex-1 sm:flex-none disabled:opacity-50 disabled:cursor-not-allowed ${actionBtnSecondary}`}
                onClick={() => handleStagePreset('elk-consistent')}
                disabled={isSaving}
                title={t('config.actions.applyConsistent')}
              >
                {t('config.actions.applyConsistent')}
              </button>
            </div>
          )}
        </div>
      </div>

        {/* 底部操作栏 */}
        <div className="flex-none border-t border-black/10 dark:border-white/10 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between" style={{ padding: 'var(--glass-padding-md) var(--glass-padding-lg)', backgroundColor: 'rgba(0, 0, 0, 0.03)' }}>
          <div className="flex w-full sm:w-auto flex-wrap items-center gap-3">
            <button
              onClick={handleResetChanges}
              className={`min-h-[44px] w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2 text-[13px] font-medium transition-colors rounded-[6px] disabled:opacity-50 disabled:cursor-not-allowed ${actionBtnSecondary}`}
              disabled={!state.isReady || !state.integration || isSaving}
            >
              <FaUndo />
              {t('config.actions.reset')}
            </button>
            {hasChanges && (
              <div className="flex items-center gap-2 text-[13px] font-medium text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-[calc(var(--glass-radius)-2px)] border border-amber-200 dark:border-amber-800/30">
                <FaExclamationTriangle className="w-3.5 h-3.5" />
                {t('config.unsavedChanges')}
              </div>
            )}
            {saveStatus !== 'idle' && (
              <div
                role={saveStatus === 'error' ? 'alert' : 'status'}
                aria-live={saveStatus === 'error' ? 'assertive' : 'polite'}
                className={`text-[13px] font-medium ${saveStatus === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}
              >
                {saveStatus === 'saving' && t('config.saving')}
                {saveStatus === 'success' && t('config.saveSuccess')}
                {saveStatus === 'error' && t('config.saveError')}
              </div>
            )}
          </div>
          <div className="grid w-full grid-cols-2 items-center gap-3 sm:flex sm:w-auto sm:justify-end">
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className={`min-h-[44px] w-full sm:w-auto px-6 py-2 text-[13px] font-medium transition-colors rounded-[6px] disabled:opacity-50 disabled:cursor-not-allowed ${actionBtnSecondary}`}
            >
              {t('config.actions.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleSaveChanges}
              disabled={!hasChanges || !state.isReady || !state.integration || isSaving}
              aria-busy={isSaving}
              className={`min-h-[44px] w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 text-[13px] font-medium transition-all rounded-[6px] disabled:opacity-50 disabled:cursor-not-allowed ${actionBtnPrimary}`}
            >
              <FaCheck />
              {isSaving ? t('config.actions.saving') : t('config.actions.save')}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>,
    (document.fullscreenElement as HTMLElement | null) || document.body
  );
};

export default ConfigurationPanel;
