import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Node, Edge } from '@xyflow/react';
import BaseDiagramComponent from './base/BaseDiagramComponent';
import SmartEdgeConfigPanel, { SmartEdgeSettings } from '../ui/SmartEdgeConfigPanel';
import { diagramConfigManager } from '@/core/config/DiagramConfig';
import { LayeredConfigManager, ConfigLayer } from '../../config/LayeredConfigManager';
import { useEdgeNormalization } from '../../hooks/useEdgeNormalization';

interface EdgeModeTestProps {
  edgeMode?: 'native' | 'advanced-smart';
  miniMapPannable?: boolean;
}

/**
 * EdgeModeTest 测试组件（函数级注释）
 *
 * 职责：
 * - 提供智能/原生边模式的实时切换
 * - 通过 SmartEdgeConfigPanel 联动 pathType、smoothFallback、gridRatio、obstaclePadding 等参数
 * - 保证边类型与数据字段在切换时即时更新（不依赖刷新或重新编排）
 */
const EdgeModeTest: React.FC<EdgeModeTestProps> = ({
  edgeMode = 'native',
  miniMapPannable = true
}) => {
  const [currentEdgeMode, setCurrentEdgeMode] = useState<'native' | 'advanced-smart'>(edgeMode);
  const [smartSettings, setSmartSettings] = useState<SmartEdgeSettings>({
    edgeMode: 'advanced-smart',
    pathType: 'step',
    gridRatio: 2.0,
    obstaclePadding: 40,
    forceSmart: true,
    smoothFallback: 'bezier',
    laneClamp: true,
    ignoreContainers: false,
    obstacleScopePadding: 160,
    directionalHandlePolicy: 'force',
    axisAlignTolerance: 8
  });

  useEffect(() => {
    /**
     * 函数级注释：为测试组件强制启用“成本算法把手选择”
     * - 目的：覆盖示例中显式的 sourceHandle/targetHandle，验证 pickHandlesByCost 的效果
     * - 作用域：仅写入到会话层（SESSION），不影响用户全局配置
     */
    const layered = LayeredConfigManager.getInstance();
    layered.set('diagram.edge.handleSelectionPolicy', 'force-cost', ConfigLayer.SESSION);
    return () => {
      // 退出时还原为尊重手工把手的策略，避免影响其他页面
      layered.set('diagram.edge.handleSelectionPolicy', 'respect', ConfigLayer.SESSION);
    };
  }, []);

  /**
   * P1 Refactor: Use useEdgeNormalization hook for Single Source of Truth
   * We no longer manually resolve edge types here. We pass raw edges and let the hook handle it.
   */
  
  // 创建测试节点 - 专门为Smart Step设计的线性障碍布局
  /**
   * 函数级注释：统一使用 description 字段作为节点可视文本
   * - 原因：CustomNode 仅渲染 data.description，不读取 data.label
   * - 处理：为所有测试节点写入 data.description，并提供 domainClass 以驱动域主题
   */
  const testNodes: Node[] = useMemo(() => [
    // 源节点 - 左侧
    {
      id: 'source-1',
      type: 'custom',
      position: { x: 50, y: 150 },
      data: {
        description: '源节点 A',
        domainClass: 'fe'
      },
      style: {
        width: 120,
        height: 60,
        zIndex: 10
      }
    },
    {
      id: 'source-2',
      type: 'custom',
      position: { x: 50, y: 350 },
      data: {
        description: '源节点 B',
        domainClass: 'fe'
      },
      style: {
        width: 120,
        height: 60,
        zIndex: 10
      }
    },
    // 目标节点 - 右侧
    {
      id: 'target-1',
      type: 'custom',
      position: { x: 700, y: 150 },
      data: {
        description: '目标节点 A',
        domainClass: 'be'
      },
      style: {
        width: 120,
        height: 60,
        zIndex: 10
      }
    },
    {
      id: 'target-2',
      type: 'custom',
      position: { x: 700, y: 350 },
      data: {
        description: '目标节点 B',
        domainClass: 'be'
      },
      style: {
        width: 120,
        height: 60,
        zIndex: 10
      }
    },
    // 线性障碍墙 - 强制Smart Step绕行
    {
      id: 'wall-1',
      type: 'custom',
      position: { x: 300, y: 100 },
      data: {
        description: '障碍墙 1',
        domainClass: 'mid'
      },
      style: {
        width: 80,
        height: 120,
        zIndex: 5
      }
    },
    {
      id: 'wall-2',
      type: 'custom',
      position: { x: 300, y: 240 },
      data: {
        description: '障碍墙 2',
        domainClass: 'mid'
      },
      style: {
        width: 80,
        height: 120,
        zIndex: 5
      }
    },
    {
      id: 'wall-3',
      type: 'custom',
      position: { x: 300, y: 380 },
      data: {
        description: '障碍墙 3',
        domainClass: 'mid'
      },
      style: {
        width: 80,
        height: 120,
        zIndex: 5
      }
    },
    // 中间层障碍 - 形成通道
    {
      id: 'middle-1',
      type: 'custom',
      position: { x: 450, y: 120 },
      data: {
        description: '中间障碍 1',
        domainClass: 'ch'
      },
      style: {
        width: 100,
        height: 80,
        zIndex: 5
      }
    },
    {
      id: 'middle-2',
      type: 'custom',
      position: { x: 450, y: 280 },
      data: {
        description: '中间障碍 2',
        domainClass: 'ch'
      },
      style: {
        width: 100,
        height: 80,
        zIndex: 5
      }
    },
    {
      id: 'middle-3',
      type: 'custom',
      position: { x: 450, y: 400 },
      data: {
        description: '中间障碍 3',
        domainClass: 'ch'
      },
      style: {
        width: 100,
        height: 80,
        zIndex: 5
      }
    }
  ], []);

  // 创建测试连线（函数级注释）
  // - 仅定义基础连接关系，类型与属性交由 useEdgeNormalization 统一处理
  const rawTestEdges: Edge[] = useMemo(() => {
    // Basic edge data that we want to preserve or use as input
    const commonData: Record<string, unknown> = {
      // label: will be set by hook or we can set a placeholder
      // pathType, routingStrategy etc will be handled by hook logic or defaults
    };

    return [
      {
        id: 'edge-1',
        source: 'source-1',
        target: 'target-1',
        data: commonData,
        style: { stroke: '#FF5722', strokeWidth: 3, zIndex: 20 }
      },
      {
        id: 'edge-2',
        source: 'source-2',
        target: 'target-2',
        data: commonData,
        style: { stroke: '#9C27B0', strokeWidth: 3, zIndex: 19 }
      },
      {
        id: 'edge-3',
        source: 'source-1',
        target: 'target-2',
        data: commonData,
        style: { stroke: '#FF9800', strokeWidth: 2, zIndex: 18 }
      }
    ];
  }, []);

  // Construct override config for the hook
  const overrideConfig = useMemo(() => ({
    edge: {
      mode: smartSettings.edgeMode,
      pathType: smartSettings.pathType,
      smoothFallback: smartSettings.smoothFallback,
      gridRatio: smartSettings.gridRatio,
      obstaclePadding: smartSettings.obstaclePadding,
      axisAlignTolerance: smartSettings.axisAlignTolerance,
      laneClamp: smartSettings.laneClamp,
      ignoreContainers: smartSettings.ignoreContainers,
      obstacleScopePadding: smartSettings.obstacleScopePadding,
      directionalHandlePolicy: smartSettings.directionalHandlePolicy,
    }
  }), [smartSettings]);

  // Use the P1 normalization hook
  const normalizedEdges = useEdgeNormalization(testNodes, rawTestEdges, {
    enableSmartRouting: true,
    layoutDirection: 'LR', // EdgeModeTest layout seems left-to-right based on node positions
    overrideConfig
  });

  // For display purposes, we might want to update the label to show the resolved type
  const displayEdges = useMemo(() => {
    return normalizedEdges.map(e => ({
      ...e,
      data: {
        ...e.data,
        label: e.data?._generatedType || e.type // Show generated type in label
      }
    }));
  }, [normalizedEdges]);


  const handleApplyGlobal = useCallback((
    mode: 'native' | 'advanced-smart',
    pathType: SmartEdgeSettings['pathType'],
    smoothFallback?: SmartEdgeSettings['smoothFallback']
  ) => {
    /**
     * 函数级注释：同步基础与高级参数到全局配置
     * - 同步：模式/路径/回退策略 + 避障参数（obstaclePadding）与轴向容忍（axisAlignTolerance）、容器与走廊参数
     */
    diagramConfigManager.updateConfig({
      edge: {
        ...diagramConfigManager.getConfig().edge,
        mode,
        pathType,
        smoothFallback,
        obstaclePadding: smartSettings.obstaclePadding,
        axisAlignTolerance: smartSettings.axisAlignTolerance,
        laneClamp: smartSettings.laneClamp,
        ignoreContainers: smartSettings.ignoreContainers,
        obstacleScopePadding: smartSettings.obstacleScopePadding,
        directionalHandlePolicy: smartSettings.directionalHandlePolicy,
      }
    });
  }, [smartSettings]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <SmartEdgeConfigPanel
        value={smartSettings}
        onChange={(v) => {
          setSmartSettings(v);
          // 直接联动模式开关
          setCurrentEdgeMode(v.edgeMode);
        }}
        onApplyGlobal={handleApplyGlobal}
      />

      {/* 图表区域 */}
      <BaseDiagramComponent
        nodes={testNodes}
        edges={displayEdges}
        edgeMode={currentEdgeMode}
        miniMapPannable={miniMapPannable}
        interactionPreset="zoom"
        style={{ width: '100%', height: '100%' }}
        // 函数级注释：禁用组件内部的配置监听与后处理，完全由外部 props (displayEdges) 控制边类型
        disablePostEdgeProcessing={true}
      />
    </div>
  );
};

export default EdgeModeTest;
