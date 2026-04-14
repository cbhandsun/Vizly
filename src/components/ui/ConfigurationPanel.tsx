// @ts-nocheck
/**
 * 配置面板组件
 * 提供简洁易用的配置管理界面，支持实时编辑和预览
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LayeredConfigManager } from '@/core';
import { FaTimes, FaUndo, FaCheck, FaExclamationTriangle, FaCog, FaQuestionCircle } from 'react-icons/fa';
import Tooltip from './Tooltip';
import { useConfigIntegration } from '@/core';
import { safeLog } from '@/core';

export interface ConfigurationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
}

interface ConfigItem {
  key: string;
  value: any;
  type: 'number' | 'string' | 'boolean' | 'select';
  label?: string;
  description?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  group?: string; // 添加分组字段
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
  const [editingValues, setEditingValues] = useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'nodes' | 'containers' | 'spacing' | 'edges' | 'layout' | 'performance'>('nodes');

  // 定义可编辑的配置项，按类别分组
  const configItemsByCategory: Record<string, ConfigItem[]> = useMemo(() => ({
    nodes: [
      {
        key: 'diagram.node.minWidth',
        type: 'number' as const,
        value: 120,
        min: 80,
        max: 300,
        step: 10
      },
      {
        key: 'diagram.node.maxWidth',
        type: 'number' as const,
        value: 300,
        min: 200,
        max: 500,
        step: 10
      },
      {
        key: 'diagram.node.height',
        type: 'number' as const,
        value: 60,
        min: 40,
        max: 120,
        step: 5
      },
      {
        key: 'diagram.node.padding.horizontal',
        type: 'number' as const,
        value: 20,
        min: 0,
        max: 50,
        step: 2
      },
      {
        key: 'diagram.node.padding.vertical',
        type: 'number' as const,
        value: 20,
        min: 0,
        max: 50,
        step: 2
      },
      {
        key: 'diagram.node.boxShadow',
        type: 'string' as const,
        value: '0 2px 4px rgba(0,0,0,0.1)'
      },
      {
        key: 'diagram.font.size',
        type: 'number' as const,
        value: 14,
        min: 10,
        max: 24,
        step: 1
      }
    ],
    containers: [
      // Domain Configs
      {
        key: 'diagram.domain.padding.horizontal',
        type: 'number' as const,
        value: 32,
        min: 0,
        max: 100,
        step: 4
      },
      {
        key: 'diagram.domain.padding.vertical',
        type: 'number' as const,
        value: 32,
        min: 0,
        max: 100,
        step: 4
      },
      {
        key: 'diagram.domain.gap',
        type: 'number' as const,
        value: 60,
        min: 20,
        max: 200,
        step: 10
      },
      {
        key: 'diagram.domain.sideSafeGap',
        type: 'number' as const,
        value: 8,
        min: 0,
        max: 50,
        step: 2
      },
      {
        key: 'diagram.domain.bottomSafeGap',
        type: 'number' as const,
        value: 12,
        min: 0,
        max: 50,
        step: 2
      },
      {
        key: 'diagram.domain.title.height',
        type: 'number' as const,
        value: 48,
        min: 20,
        max: 100,
        step: 4
      },
      {
        key: 'diagram.domain.title.safeGap',
        type: 'number' as const,
        value: 8,
        min: 0,
        max: 40,
        step: 2
      },
      // SubDomain Configs
      {
        key: 'diagram.subDomain.padding.horizontal',
        type: 'number' as const,
        value: 24,
        min: 0,
        max: 80,
        step: 4
      },
      {
        key: 'diagram.subDomain.padding.vertical',
        type: 'number' as const,
        value: 24,
        min: 0,
        max: 80,
        step: 4
      },
      {
        key: 'diagram.subDomain.title.height',
        type: 'number' as const,
        value: 42,
        min: 20,
        max: 80,
        step: 2
      },
      {
        key: 'diagram.subDomain.ensureTitleClearance',
        type: 'boolean' as const,
        value: true
      }
    ],
    spacing: [
      {
        key: 'diagram.spacing.horizontal',
        type: 'number' as const,
        value: 150,
        min: 50,
        max: 300,
        step: 10
      },
      {
        key: 'diagram.spacing.vertical',
        type: 'number' as const,
        value: 100,
        min: 50,
        max: 200,
        step: 10
      }
    ],
    edges: [
      // --- 基础设置 ---
      {
        key: 'diagram.edge.mode',
        type: 'select' as const,
        value: 'smart',
        options: ['smart', 'advanced-smart', 'native'],
        group: '基础设置'
      },
      {
        key: 'diagram.edge.pathType',
        type: 'select' as const,
        value: 'step',
        options: ['bezier', 'straight', 'step'],
        group: '基础设置'
      },
      {
        key: 'diagram.edge.directionalHandlePolicy',
        type: 'select' as const,
        value: 'prefer',
        options: ['prefer', 'force', 'off'],
        group: '基础设置'
      },
      {
        key: 'diagram.edge.forceDirect',
        type: 'boolean' as const,
        value: false,
        group: '基础设置'
      },
      // --- 避障与容器 ---
      {
        key: 'diagram.edge.intraContainerNoObstacle',
        type: 'boolean' as const,
        value: true,
        group: '避障与容器'
      },
      {
        key: 'diagram.edge.pureObstacleMode',
        type: 'boolean' as const,
        value: false,
        group: '避障与容器'
      },
      {
        key: 'diagram.edge.ignoreContainers',
        type: 'boolean' as const,
        value: true,
        group: '避障与容器'
      },
      {
        key: 'diagram.edge.laneClamp',
        type: 'boolean' as const,
        value: false,
        group: '避障与容器'
      },
      {
        key: 'diagram.edge.obstaclePadding',
        type: 'number' as const,
        value: 36,
        min: 0,
        max: 120,
        step: 2,
        group: '避障与容器'
      },
      // --- 几何微调 ---
      {
        key: 'diagram.edge.minArrowOffset',
        type: 'number' as const,
        value: 18,
        min: 0,
        max: 60,
        step: 1,
        group: '几何微调'
      },
      {
        key: 'diagram.edge.stepLastSegmentMin',
        type: 'number' as const,
        value: 24,
        min: 0,
        max: 200,
        step: 2,
        group: '几何微调'
      },
      // --- 偏好权重 ---
      {
        key: 'diagram.edge.disableDomainInfluence',
        type: 'boolean' as const,
        value: true,
        group: '偏好权重'
      },
      {
        key: 'diagram.edge.crossDomainVerticalPrefer',
        type: 'boolean' as const,
        value: false,
        group: '偏好权重'
      },
      {
        key: 'diagram.edge.crossDomainBias',
        type: 'number' as const,
        value: 0,
        min: 0,
        max: 1,
        step: 0.1,
        group: '偏好权重'
      },
      {
        key: 'diagram.edge.preferOrthogonalInDomain',
        type: 'boolean' as const,
        value: false,
        group: '偏好权重'
      },
      {
        key: 'diagram.edge.domainOrthogonalBias',
        type: 'number' as const,
        value: 0,
        min: 0,
        max: 1,
        step: 0.1,
        group: '偏好权重'
      },
      {
        key: 'diagram.edge.preferLROnHorizontal',
        type: 'boolean' as const,
        value: true,
        group: '偏好权重'
      },
      {
        key: 'diagram.edge.horizontalBiasThreshold',
        type: 'number' as const,
        value: 1.0,
        min: 0.6,
        max: 2.0,
        step: 0.1,
        group: '偏好权重'
      },
      {
        key: 'diagram.edge.typePreferenceProfile',
        type: 'select' as const,
        value: 'orthogonal-first',
        options: ['orthogonal-first', 'balanced', 'curved-allowed'],
        group: '偏好权重'
      },
      // --- 高级采样算法 ---
      {
        key: 'diagram.edge.orthogonalSamplingEnabled',
        type: 'boolean' as const,
        value: false,
        group: '高级采样'
      },
      {
        key: 'diagram.edge.orthogonalGridSize',
        type: 'number' as const,
        value: 40,
        min: 12,
        max: 120,
        step: 4,
        group: '高级采样'
      },
      {
        key: 'diagram.edge.orthogonalSampleBudget',
        type: 'number' as const,
        value: 5,
        min: 3,
        max: 11,
        step: 1,
        group: '高级采样'
      },
      {
        key: 'diagram.edge.gridAStarEnabled',
        type: 'boolean' as const,
        value: false,
        group: '高级采样'
      },
      {
        key: 'diagram.edge.gridAStarGridSize',
        type: 'number' as const,
        value: 40,
        min: 12,
        max: 120,
        step: 4,
        group: '高级采样'
      },
      {
        key: 'diagram.edge.gridAStarMaxExpansions',
        type: 'number' as const,
        value: 300,
        min: 100,
        max: 1000,
        step: 50,
        group: '高级采样'
      },
      // --- 贝塞尔微调 ---
      {
        key: 'diagram.edge.beziersAllowedMinAngleDeg',
        type: 'number' as const,
        value: 25,
        min: 0,
        max: 90,
        step: 1,
        group: '贝塞尔微调'
      },
      {
        key: 'diagram.edge.beziersAllowedMinDetourRatio',
        type: 'number' as const,
        value: 2.2,
        min: 1.0,
        max: 5.0,
        step: 0.1,
        group: '贝塞尔微调'
      },
      {
        key: 'diagram.edge.corridorObstacleHardThreshold',
        type: 'number' as const,
        value: 8,
        min: 2,
        max: 30,
        step: 1,
        group: '贝塞尔微调'
      }
    ],
    layout: [
      // --- 核心策略 ---
      {
        key: 'diagram.layout.INDUSTRY_PROFILE',
        type: 'select' as const,
        value: 'auto',
        options: ['auto', 'strict_industry', 'balanced_industry', 'relaxed_industry'],
        group: '核心策略'
      },
      {
        key: 'diagram.layout.strategy',
        type: 'select' as const,
        value: 'DomainVerticalLayout',
        options: ['DomainVerticalLayout', 'DomainHorizontalLayout', 'DomainElkLayout', 'DomainElkCompoundLayout', 'DomainElkRadialLayout', 'DomainElkForceLayout', 'DomainElkTrueRadialLayout'],
        group: '核心策略'
      },
      {
        key: 'diagram.layout.direction',
        type: 'select' as const,
        value: 'TB',
        options: ['LR', 'RL', 'TB', 'BT'],
        group: '核心策略'
      },
      {
        key: 'diagram.layout.nodeStrategy',
        type: 'select' as const,
        value: 'HorizontalLayout',
        options: ['HorizontalLayout', 'VerticalLayout', 'GridLayout', 'CenteredLayout', 'ElkNodeLayout', 'DagreLayout'],
        group: '核心策略'
      },
      {
        key: 'diagram.layout.linkOrientation',
        type: 'boolean' as const,
        value: true,
        group: '核心策略'
      },
      {
        key: 'diagram.layout.CONTAINMENT_POLICY',
        type: 'select' as const,
        value: 'elastic',
        options: ['elastic', 'soft', 'strict'],
        group: '核心策略'
      },
      // --- ELK 基础 ---
      {
        key: 'diagram.layout.ELK_ALGORITHM',
        type: 'select' as const,
        value: 'layered',
        options: ['layered', 'force', 'stress', 'radial', 'mrtree', 'disco'],
        group: 'ELK 基础'
      },
      {
        key: 'diagram.layout.RANK_MODE',
        type: 'select' as const,
        value: 'elk',
        options: ['elk', 'dagre_like'],
        group: 'ELK 基础'
      },
      {
        key: 'diagram.layout.ELK_STRICT_MODE',
        type: 'boolean' as const,
        value: false,
        group: 'ELK 基础'
      },
      {
        key: 'diagram.layout.ELK_DIRECTION',
        type: 'select' as const,
        value: '',
        options: ['', 'RIGHT', 'DOWN', 'LEFT', 'UP'],
        group: 'ELK 基础'
      },
      // --- ELK 间距 ---
      {
        key: 'diagram.layout.ELK_NODE_SPACING',
        type: 'number' as const,
        value: 56,
        group: 'ELK 间距'
      },
      {
        key: 'diagram.layout.ELK_LAYER_SPACING',
        type: 'number' as const,
        value: 80,
        group: 'ELK 间距'
      },
      {
        key: 'diagram.layout.ELK_LABEL_SPACING',
        type: 'number' as const,
        value: 8,
        min: 0,
        max: 40,
        step: 1,
        group: 'ELK 间距'
      },
      {
        key: 'diagram.layout.ELK_EDGE_NODE_SPACING',
        type: 'number' as const,
        value: 8,
        min: 0,
        max: 80,
        step: 1,
        group: 'ELK 间距'
      },
      {
        key: 'diagram.layout.ELK_EDGE_EDGE_SPACING',
        type: 'number' as const,
        value: 4,
        min: 0,
        max: 80,
        step: 1,
        group: 'ELK 间距'
      },
      {
        key: 'diagram.layout.ELK_PORT_PORT_SPACING',
        type: 'number' as const,
        value: 4,
        min: 0,
        max: 40,
        step: 1,
        group: 'ELK 间距'
      },
      {
        key: 'diagram.layout.ELK_PORT_BORDER_OFFSET',
        type: 'number' as const,
        value: 4,
        min: 0,
        max: 40,
        step: 1,
        group: 'ELK 间距'
      },
      // --- ELK 高级微调 ---
      {
        key: 'diagram.layout.ELK_NODE_PLACEMENT',
        type: 'select' as const,
        value: 'NETWORK_SIMPLEX',
        options: ['NETWORK_SIMPLEX', 'LINEAR_SEGMENTS', 'BRANDES_KOEPF'],
        group: 'ELK 高级微调'
      },
      {
        key: 'diagram.layout.ELK_LAYERING',
        type: 'select' as const,
        value: 'NETWORK_SIMPLEX',
        options: ['NETWORK_SIMPLEX', 'LONGEST_PATH', 'COFFMAN_GRAHAM'],
        group: 'ELK 高级微调'
      },
      {
        key: 'diagram.layout.ELK_EDGE_ROUTING',
        type: 'select' as const,
        value: 'POLYLINE',
        options: ['POLYLINE', 'ORTHOGONAL', 'SPLINES'],
        group: 'ELK 高级微调'
      },
      {
        key: 'diagram.layout.ELK_MERGE_EDGES',
        type: 'boolean' as const,
        value: true,
        group: 'ELK 高级微调'
      },
      {
        key: 'diagram.layout.ELK_FIXED_ALIGNMENT',
        type: 'select' as const,
        value: 'NONE',
        options: ['NONE', 'BALANCED', 'LEFTDOWN', 'RIGHTUP', 'LEFTUP', 'RIGHTDOWN'],
        group: 'ELK 高级微调'
      },
      {
        key: 'diagram.layout.ELK_CONSIDER_MODEL_ORDER',
        type: 'boolean' as const,
        value: false,
        group: 'ELK 高级微调'
      },
      {
        key: 'diagram.layout.ELK_CYCLE_BREAKING',
        type: 'select' as const,
        value: 'GREEDY',
        options: ['GREEDY', 'DEPTH_FIRST', 'INTERACTIVE'],
        group: 'ELK 高级微调'
      }
    ],
    performance: [
      {
        key: 'performance.enableVirtualization',
        type: 'boolean' as const,
        value: true
      },
      {
        key: 'performance.enableAnimations',
        type: 'boolean' as const,
        value: true
      }
    ]
  }), []);

// 获取所有配置项的扁平列表
const configItems: ConfigItem[] = useMemo(() => [
  ...configItemsByCategory.nodes,
  ...configItemsByCategory.containers,
  ...configItemsByCategory.spacing,
  ...configItemsByCategory.edges,
  ...configItemsByCategory.layout,
  ...configItemsByCategory.performance
], [configItemsByCategory]);

// 加载当前配置值 - 优化依赖以避免死循环
useEffect(() => {
  if (!state.isReady || !state.integration) return;

  const loadCurrentValues = async () => {
    const currentValues: Record<string, any> = {};

    for (const item of configItems) {
      try {
        const value = await actions.getConfig(item.key);
        currentValues[item.key] = value !== undefined ? value : item.value;
      } catch (error) {
        console.warn(`Failed to load config ${item.key}:`, error);
        currentValues[item.key] = item.value;
      }
    }

    setEditingValues(currentValues);
  };

  loadCurrentValues();
}, [state.isReady, state.integration]); // 移除actions和configItems依赖

// 处理配置值变更
// 处理配置值变更
const handleValueChange = useCallback(async (key: string, value: any) => {
  safeLog.debug('[Config] handleValueChange:', key, value);

  // 联动逻辑：当选择域水平/垂直布局时，默认将节点布局设置为 Dagre
  if (key === 'diagram.layout.strategy' && (value === 'DomainHorizontalLayout' || value === 'DomainVerticalLayout')) {
    safeLog.info('[Config] Auto-switching nodeStrategy to DagreLayout');
    setEditingValues(prev => ({
      ...prev,
      [key]: value,
      'diagram.layout.nodeStrategy': 'DagreLayout'
    }));
    // Auto-save for immediate feedback
    await actions.setConfig(key, value);
    await actions.setConfig('diagram.layout.nodeStrategy', 'DagreLayout');
    return;
  }

  // List of keys that should trigger immediate update for better UX
  const instantKeys = [
    'diagram.layout.strategy',
    'diagram.layout.ELK_ALGORITHM',
    'diagram.layout.ELK_DIRECTION',
    'diagram.layout.direction'
  ];

  setEditingValues(prev => ({
    ...prev,
    [key]: value
  }));

  if (instantKeys.includes(key)) {
    await actions.setConfig(key, value);
  } else {
    setHasChanges(true);
  }
}, [actions]);

// 保存所有更改
const handleSaveChanges = useCallback(async () => {
  if (!state.isReady || !state.integration) return;

  try {
    for (const [key, value] of Object.entries(editingValues)) {
      await actions.setConfig(key, value);
    }
    setHasChanges(false);
    console.log('配置已保存');
  } catch (error) {
    console.error('保存配置失败:', error);
  }
}, [editingValues, actions, state.integration]);

// 重置所有更改
const handleResetChanges = useCallback(() => {
  const resetValues: Record<string, any> = {};
  configItems.forEach(item => {
    resetValues[item.key] = item.value;
  });
  setEditingValues(resetValues);
  setHasChanges(false);
}, [configItems]);

// 渲染配置项编辑器
const renderConfigEditor = (item: ConfigItem) => {
  const currentValue = editingValues[item.key] ?? item.value;
  const layeredStrategy = String(LayeredConfigManager.getInstance().get<string>('diagram.layout.strategy', '') || '');
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '').replace(/[+_\-]/g, '');
  const isElk = (v: string) => { const n = norm(v); return n === 'domainelk' || n === 'domainelklayout'; };
  const nodeLayoutDisabled = item.key === 'diagram.layout.nodeStrategy' && (isElk(String(editingValues['diagram.layout.strategy'] || '')) || isElk(layeredStrategy));

  switch (item.type) {
    case 'number':
      return (
        <input
          type="number"
          value={currentValue}
          min={item.min}
          max={item.max}
          step={item.step}
          onChange={(e) => handleValueChange(item.key, Number(e.target.value))}
          className="w-24 px-3 py-1.5 text-[13px] font-medium text-center transition-all bg-black/5 dark:bg-white/10 border border-transparent rounded-[8px] text-gray-800 dark:text-gray-100 hover:bg-black/10 dark:hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-black"
          title={t(`config.${item.key}.label`)}
        />
      );

    case 'boolean':
      return (
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(currentValue)}
            onChange={(e) => handleValueChange(item.key, e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
        </label>
      );

    case 'select':
      return (
        <div className="flex flex-col items-end gap-1">
          <select
            value={currentValue}
            onChange={(e) => handleValueChange(item.key, e.target.value)}
            className="w-48 px-3 py-1.5 text-[13px] font-medium transition-all bg-black/5 dark:bg-white/10 border border-transparent rounded-[8px] text-gray-800 dark:text-gray-100 hover:bg-black/10 dark:hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-black cursor-pointer disabled:opacity-50"
            disabled={nodeLayoutDisabled}
            title={t(`config.${item.key}.label`)}
          >
            {item.options?.map(option => {
              const trOpt = t(`config.options.${option}`);
              return (
                <option key={option} value={option}>
                  {trOpt.startsWith('config.') ? option : trOpt}
                </option>
              );
            })}
          </select>
          {nodeLayoutDisabled && (
            <div className="text-[10px] text-amber-500 font-medium">
              {t('config.layout.domainElkActive', '域ELK生效中')}
            </div>
          )}
        </div>
      );

    case 'string':
    default:
      return (
        <input
          type="text"
          value={currentValue}
          onChange={(e) => handleValueChange(item.key, e.target.value)}
          className="w-64 px-3 py-1.5 text-[13px] font-medium transition-all bg-black/5 dark:bg-white/10 border border-transparent rounded-[8px] text-gray-800 dark:text-gray-100 hover:bg-black/10 dark:hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-black"
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

  return (
  <div key={item.key} className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
    <div className="flex flex-col pr-4 flex-1 min-w-0">
      <div className="text-[13px] font-medium text-gray-800 dark:text-gray-200 leading-tight">
        {displayLabel}
      </div>
      {primaryDesc && (
        <div
          className="mt-0.5 text-[11.5px] text-gray-400 dark:text-gray-500 truncate max-w-[280px] cursor-help"
          title={displayDesc}
        >
          {primaryDesc}
        </div>
      )}
    </div>

    <div className="flex items-center flex-none">
      {renderConfigEditor(item)}
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
    <div className="flex flex-col gap-8 pb-4">
      {groups.map((group, index) => (
        <div key={index} className="flex flex-col">
          <div className="mb-2 px-2">
            <h3 className="text-[11px] font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase">
              {(() => {
                const map: Record<string, string> = {
                  '基础设置': 'basic', '避障与容器': 'obstacle', '几何微调': 'geometry', '偏好权重': 'preference',
                  '高级采样': 'sampling', '贝塞尔微调': 'bezier', '核心策略': 'core', 'ELK 基础': 'elkBasic',
                  'ELK 间距': 'elkSpacing', 'ELK 高级微调': 'elkAdvanced'
                };
                if (map[group.name]) {
                  const tGroup = t(`config.groups.${map[group.name]}`);
                  return tGroup.startsWith('config.') ? group.name : tGroup;
                }
                return group.name;
              })()}
            </h3>
          </div>
          <div className="flex flex-col bg-white dark:bg-[#1A1A1C] shadow-sm border border-gray-200/60 dark:border-white/10 rounded-[12px] overflow-hidden divide-y divide-gray-100 dark:divide-white/5">
            {group.items.map(renderConfigItem)}
          </div>
        </div>
      ))}
    </div>
  );
};

if (!isOpen) {
  return null;
}

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
const activeTabClass = "bg-black/5 dark:bg-white/10 text-gray-900 dark:text-gray-100 font-semibold";
const inactiveTabClass = "text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 font-medium";
const actionBtnPrimary = "text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm border-transparent rounded-[8px]";
const actionBtnSecondary = "text-gray-700 dark:text-gray-200 bg-white dark:bg-black hover:bg-gray-50 dark:hover:bg-white/5 border border-black/10 dark:border-white/10 shadow-sm rounded-[8px]";

// 修复（函数级注释）：确保配置面板在全屏下可见，portal 挂载到全屏元素
return createPortal(
  <div className={`fixed inset-0 z-[5000] flex items-center justify-center p-4 sm:p-6 bg-black/30 dark:bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose}>
    {/* Vercel/Linear 风格设置面板 (Sidebar Master-Detail) */}
    <div className={`relative flex w-full max-w-[900px] h-full max-h-[640px] rounded-[16px] bg-white dark:bg-[#111113] border border-black/10 dark:border-white/10 shadow-2xl transition-all duration-300 transform ${isOpen ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-8 opacity-0'} overflow-hidden`} onClick={(e) => e.stopPropagation()}>
      
      {/* 左侧导航栏 Sidebar */}
      <div className="w-[240px] flex-none flex flex-col border-r border-black/10 dark:border-white/10 bg-gray-50/60 dark:bg-black/30">
        <div className="px-5 py-5 border-b border-transparent">
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <div className="p-1.5 bg-indigo-500/10 rounded-md">
              <FaCog className="text-indigo-600 dark:text-indigo-400 w-3.5 h-3.5" />
            </div>
            {t('config.title')}
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          {[
            { id: 'nodes', label: t('config.tabs.nodes') },
            { id: 'containers', label: t('config.tabs.containers') },
            { id: 'spacing', label: t('config.tabs.spacing') },
            { id: 'edges', label: t('config.tabs.edges') },
            { id: 'layout', label: t('config.tabs.layout') },
            { id: 'performance', label: t('config.tabs.performance') }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`w-full flex items-center px-3 py-2 text-[13px] rounded-lg transition-colors ${activeTab === tab.id ? activeTabClass : inactiveTabClass}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 右侧主区域 Main Content */}
      <div className="flex-1 flex flex-col relative bg-transparent overflow-hidden">
        {/* 顶部标题栏 & 关闭按钮 */}
        <div className="flex-none flex items-center justify-between px-8 md:px-12 pt-7 pb-5">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight leading-none">
            {t(`config.tabs.${activeTab}`)}
          </h1>
          <button onClick={onClose} className="-mr-2 p-1.5 rounded-md text-gray-400 hover:text-gray-800 hover:bg-black/5 dark:hover:text-gray-100 dark:hover:bg-white/10 transition-colors" title={t('config.actions.close')}>
            <FaTimes className="w-4 h-4" />
          </button>
        </div>

        {/* 滚动内容区 */}
        <div className="flex-1 overflow-y-auto px-8 md:px-12 pb-8 pt-1 scrollbar-thin scrollbar-thumb-black/10 dark:scrollbar-thumb-white/10">
          <div className="w-full max-w-2xl mx-auto pb-12">
            {renderTabContent()}
            {activeTab === 'layout' && (
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button
                className={`flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-medium transition-colors rounded-lg flex-1 sm:flex-none ${actionBtnSecondary}`}
                onClick={async () => {
                  const preset: Record<string, any> = {
                    'diagram.layout.ELK_NODE_SPACING': 36,
                    'diagram.layout.ELK_LAYER_SPACING': 64,
                    'diagram.layout.ELK_EDGE_ROUTING': 'ORTHOGONAL',
                    'diagram.layout.ELK_NODE_PLACEMENT': 'BRANDES_KOEPF',
                    'diagram.layout.ELK_LAYERING': 'LONGEST_PATH',
                    'diagram.layout.ELK_FIXED_ALIGNMENT': 'BALANCED',
                    'diagram.layout.ELK_CONSIDER_MODEL_ORDER': true,
                    'diagram.layout.ELK_MERGE_EDGES': false,
                    'diagram.layout.ELK_CYCLE_BREAKING': 'GREEDY',
                    'diagram.layout.ELK_PORT_BORDER_OFFSET': 4,
                    'diagram.layout.ELK_LABEL_SPACING': 6,
                  };
                  const next = { ...editingValues };
                  for (const [k, v] of Object.entries(preset)) {
                    next[k] = v; await actions.setConfig(k, v);
                  }
                  setEditingValues(next);
                  setHasChanges(false);
                }}
                title={t('config.actions.applyCompact') === 'config.actions.applyCompact' ? '应用紧凑排版预设' : t('config.actions.applyCompact')}
              >
                {t('config.actions.applyCompact') === 'config.actions.applyCompact' ? '应用紧凑排版预设' : t('config.actions.applyCompact')}
              </button>
              <button
                className={`flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-medium transition-colors rounded-lg flex-1 sm:flex-none ${actionBtnSecondary}`}
                onClick={async () => {
                  const preset: Record<string, any> = {
                    'diagram.layout.ELK_NODE_SPACING': 56,
                    'diagram.layout.ELK_LAYER_SPACING': 96,
                    'diagram.layout.ELK_EDGE_ROUTING': 'POLYLINE',
                    'diagram.layout.ELK_NODE_PLACEMENT': 'NETWORK_SIMPLEX',
                    'diagram.layout.ELK_LAYERING': 'NETWORK_SIMPLEX',
                    'diagram.layout.ELK_FIXED_ALIGNMENT': 'NONE',
                    'diagram.layout.ELK_CONSIDER_MODEL_ORDER': false,
                    'diagram.layout.ELK_MERGE_EDGES': true,
                    'diagram.layout.ELK_CYCLE_BREAKING': 'DEPTH_FIRST',
                    'diagram.layout.ELK_PORT_BORDER_OFFSET': 4,
                    'diagram.layout.ELK_LABEL_SPACING': 8,
                  };
                  const next = { ...editingValues };
                  for (const [k, v] of Object.entries(preset)) {
                    next[k] = v; await actions.setConfig(k, v);
                  }
                  setEditingValues(next);
                  setHasChanges(false);
                }}
                title={t('config.actions.applyConsistent') === 'config.actions.applyConsistent' ? '应用标准排版预设' : t('config.actions.applyConsistent')}
              >
                {t('config.actions.applyConsistent') === 'config.actions.applyConsistent' ? '应用标准排版预设' : t('config.actions.applyConsistent')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="flex-none px-10 py-5 border-t border-black/5 dark:border-white/5 flex items-center justify-between bg-gray-50/30 dark:bg-[#161618]">
        <div className="flex items-center gap-3">
          <button
            onClick={handleResetChanges}
            className={`flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${actionBtnSecondary}`}
            disabled={!hasChanges}
          >
            <FaUndo />
            {t('config.actions.reset') === 'config.actions.reset' ? '重置' : t('config.actions.reset')}
          </button>
          {hasChanges && (
            <div className="flex items-center gap-2 text-[13px] font-medium text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-md border border-amber-200 dark:border-amber-800/30">
              <FaExclamationTriangle className="w-3.5 h-3.5" />
              {t('config.unsavedChanges') === 'config.unsavedChanges' ? '有未保存的更改' : t('config.unsavedChanges')}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className={`px-6 py-2 text-[13px] font-medium transition-colors ${actionBtnSecondary}`}
          >
            {t('config.actions.cancel') === 'config.actions.cancel' ? '取消' : t('config.actions.cancel')}
          </button>
          <button
            onClick={handleSaveChanges}
            disabled={!hasChanges || !state.isReady || !state.integration}
            className={`flex items-center justify-center gap-2 px-6 py-2 text-[13px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${actionBtnPrimary}`}
          >
            <FaCheck />
            {t('config.actions.save') === 'config.actions.save' ? '保存更改' : t('config.actions.save')}
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
