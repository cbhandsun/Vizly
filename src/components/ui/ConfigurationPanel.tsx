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
        key: 'edge.obstaclePadding',
        type: 'number' as const,
        value: 36,
        min: 0,
        max: 120,
        step: 2,
        group: '避障与容器'
      },
      // --- 几何微调 ---
      {
        key: 'edge.minArrowOffset',
        type: 'number' as const,
        value: 18,
        min: 0,
        max: 60,
        step: 1,
        group: '几何微调'
      },
      {
        key: 'edge.stepLastSegmentMin',
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
          className="w-full px-3 py-2 text-sm transition-colors border rounded-md border-gray-300/50 dark:border-gray-600/50 bg-white/50 dark:bg-black/40 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
          title={t(`config.${item.key}.label`)}
        />
      );

    case 'boolean':
      return (
        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            checked={Boolean(currentValue)}
            onChange={(e) => handleValueChange(item.key, e.target.checked)}
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300/50 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 dark:bg-black/40 dark:border-gray-600/50"
          />
          <span>{currentValue ? t('config.boolean.enable') : t('config.boolean.disable')}</span>
        </label>
      );

    case 'select':
      return (
        <div className="flex flex-col gap-1">
          <select
            value={currentValue}
            onChange={(e) => handleValueChange(item.key, e.target.value)}
            className="w-full px-3 py-2 text-sm transition-colors border rounded-md border-gray-300/50 dark:border-gray-600/50 bg-white/50 dark:bg-black/40 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 disabled:opacity-50"
            disabled={nodeLayoutDisabled}
            title={t(`config.${item.key}.label`)}
          >
            {item.options?.map(option => (
              <option key={option} value={option}>
                {t(`config.options.${option}`)}
              </option>
            ))}
          </select>
          {nodeLayoutDisabled && (
            <div className="text-xs text-orange-500/80 dark:text-orange-400/80 mt-1">Domain ELK overrides Node Strategy</div>
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
          className="w-full px-3 py-2 text-sm transition-colors border rounded-md border-gray-300/50 dark:border-gray-600/50 bg-white/50 dark:bg-black/40 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
          title={t(`config.${item.key}.label`)}
        />
      );
  }
};

// 渲染单个配置项
const renderConfigItem = (item: ConfigItem) => (
  <div key={item.key} className="flex flex-col justify-between p-4 transition-colors rounded-xl bg-white/40 dark:bg-black/20 border border-black/5 dark:border-white/5 hover:bg-white/60 dark:hover:bg-black/30">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-200">
        {t(`config.${item.key}.label`)}
        {t(`config.${item.key}.desc`) && (
          <Tooltip content={t(`config.${item.key}.desc`)} delay={0}>
            <FaQuestionCircle
              className="ml-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 cursor-help transition-colors"
            />
          </Tooltip>
        )}
      </div>
      <div className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-black/5 dark:bg-white/10 px-2 py-1 rounded max-w-[120px] truncate">
        {typeof editingValues[item.key] === 'boolean'
          ? (editingValues[item.key] ? '✓' : '✗')
          : String(editingValues[item.key] || '')
        }
      </div>
    </div>

    <div className="w-full">
      {renderConfigEditor(item)}
    </div>
  </div>
);

// 渲染当前标签页的内容（支持分组）
const renderTabContent = () => {
  const items = configItemsByCategory[activeTab];
  const hasGroups = items.some(item => item.group);

  if (!hasGroups) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map(renderConfigItem)}
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
    <div className="flex flex-col gap-8">
      {groups.map((group, index) => (
        <div key={index} className="flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-bold tracking-wider text-gray-500 uppercase dark:text-gray-400">
              {['基础设置', '避障与容器', '几何微调', '偏好权重', '高级采样', '贝塞尔微调', '核心策略', 'ELK 基础', 'ELK 间距', 'ELK 高级微调'].includes(group.name)
                ? t(`config.groups.${group.name === '基础设置' ? 'basic' :
                  group.name === '避障与容器' ? 'obstacle' :
                    group.name === '几何微调' ? 'geometry' :
                      group.name === '偏好权重' ? 'preference' :
                        group.name === '高级采样' ? 'sampling' :
                          group.name === '贝塞尔微调' ? 'bezier' :
                            group.name === '核心策略' ? 'core' :
                              group.name === 'ELK 基础' ? 'elkBasic' :
                                group.name === 'ELK 间距' ? 'elkSpacing' : 'elkAdvanced'
                  }`)
                : group.name}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

// 通用的按钮类模板
const activeTabClass = "bg-white/50 dark:bg-black/30 text-blue-600 dark:text-blue-400 shadow-sm border border-black/5 dark:border-white/5";
const inactiveTabClass = "text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 border border-transparent";
const actionBtnPrimary = "text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 shadow-sm";
const actionBtnSecondary = "text-gray-700 dark:text-gray-200 bg-white/50 dark:bg-black/40 hover:bg-white/80 dark:hover:bg-black/60 border border-black/5 dark:border-white/10 shadow-sm";

// 修复（函数级注释）：确保配置面板在全屏下可见，portal 挂载到全屏元素
return createPortal(
  <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose}>
    <div className={`relative flex flex-col w-full max-w-4xl max-h-[90vh] rounded-2xl bg-white/70 dark:bg-[#1C1C1E]/80 backdrop-blur-xl backdrop-saturate-150 border border-white/20 dark:border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.12)] transition-all duration-300 transform ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`} onClick={(e) => e.stopPropagation()}>
      {/* 头部 */}
      <div className="flex-none px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50 flex items-center justify-between">
        <div className="flex items-center gap-3 text-lg font-semibold text-gray-800 dark:text-gray-100">
          <FaCog className="text-blue-500" />
          <h2>{t('config.title')}</h2>
        </div>
        <button onClick={onClose} className="p-2 text-gray-500 transition-colors rounded-full hover:bg-black/5 dark:hover:bg-white/10 hover:text-gray-800 dark:hover:text-gray-100" title={t('config.actions.close')}>
          <FaTimes />
        </button>
      </div>

      {/* Tab标签页 */}
      <div className="flex-none flex px-6 py-2 gap-2 overflow-x-auto border-b border-gray-200/50 dark:border-gray-700/50 scrollbar-hide">
        <button
          className={`flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${activeTab === 'nodes' ? activeTabClass : inactiveTabClass}`}
          onClick={() => setActiveTab('nodes')}
        >
          {t('config.tabs.nodes')}
        </button>
        <button
          className={`flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${activeTab === 'containers' ? activeTabClass : inactiveTabClass}`}
          onClick={() => setActiveTab('containers')}
        >
          {t('config.tabs.containers')}
        </button>
        <button
          className={`flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${activeTab === 'spacing' ? activeTabClass : inactiveTabClass}`}
          onClick={() => setActiveTab('spacing')}
        >
          {t('config.tabs.spacing')}
        </button>
        <button
          className={`flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${activeTab === 'edges' ? activeTabClass : inactiveTabClass}`}
          onClick={() => setActiveTab('edges')}
        >
          {t('config.tabs.edges')}
        </button>
        <button
          className={`flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${activeTab === 'layout' ? activeTabClass : inactiveTabClass}`}
          onClick={() => setActiveTab('layout')}
        >
          {t('config.tabs.layout')}
        </button>
        <button
          className={`flex-none px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${activeTab === 'performance' ? activeTabClass : inactiveTabClass}`}
          onClick={() => setActiveTab('performance')}
        >
          {t('config.tabs.performance')}
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
        <div className="w-full">
          {renderTabContent()}
          {activeTab === 'layout' && (
            <div className="mt-6 flex gap-3">
              <button
                className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded-lg flex-1 sm:flex-none ${actionBtnSecondary}`}
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
                title={t('config.actions.applyCompact')}
              >
                {t('config.actions.applyCompact')}
              </button>
              <button
                className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded-lg flex-1 sm:flex-none ${actionBtnSecondary}`}
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
                title={t('config.actions.applyConsistent')}
              >
                {t('config.actions.applyConsistent')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="flex-none px-6 py-4 border-t border-gray-200/50 dark:border-gray-700/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50/30 dark:bg-black/20">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleResetChanges}
            className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded-lg flex-1 sm:flex-none disabled:opacity-50 disabled:cursor-not-allowed ${actionBtnSecondary}`}
            disabled={!hasChanges}
          >
            <FaUndo />
            {t('config.actions.reset')}
          </button>
          <button
            onClick={handleSaveChanges}
            className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded-lg flex-1 sm:flex-none disabled:opacity-50 disabled:cursor-not-allowed ${actionBtnPrimary}`}
            disabled={!hasChanges || !state.isReady || !state.integration}
          >
            <FaCheck />
            {t('config.actions.save')}
          </button>
        </div>
        {hasChanges && (
          <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-full border border-amber-200 dark:border-amber-800/30">
            <FaExclamationTriangle />
            {t('config.unsavedChanges')}
          </div>
        )}
      </div>
    </div>
  </div>,
  (document.fullscreenElement as HTMLElement | null) || document.body
);
};

export default ConfigurationPanel;
