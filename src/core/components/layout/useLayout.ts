/**
 * 布局管理 Hook
 * 提供统一的布局计算和优化功能
 */

import { useMemo, type CSSProperties } from 'react';
import { Node, Edge, MarkerType } from '@xyflow/react';
import { LayoutOptimizer } from './LayoutOptimizer';
const DEFAULT_DATA_EDGE_COLOR = '#00aaff';
import { diagramConfigManager, type DiagramConfig } from '@/core/config/DiagramConfig';
import { MasterDataType, DomainData } from '../../types';
import { useConfigIntegration } from '../../hooks/useConfigIntegration';

import { Theme } from '../../themes/types/ThemeTypes';

export interface LayoutUtils {
  calculateNodeWidth: (text: string, isGroupTitle?: boolean) => number;
  calculateMultipleNodeWidths: (descs: string[], options?: { domainKey?: string }) => number[];
  calculateNodeHeight: (description: string) => number;
  measureLongestLineWidth: (text: string) => number;
  calculateBackendDomainMinWidth: (domain: keyof MasterDataType | DomainData, domainKey?: string) => number;
  calculateUnifiedDomainWidth: (masterData: MasterDataType) => number;
  createNode: (id: string, position: { x: number; y: number }, data?: Record<string, unknown>, style?: CSSProperties, type?: string) => Node;
  createEdge: (id: string, source: string, target: string, style?: CSSProperties, type?: 'native' | 'smart') => Edge;
  calculateGroupWidth: (nodeWidths: number[], gap: number) => number;
  calculateGroupHeight: (nodeCount: number, nodeHeight: number, gap: number) => number;
  calculateMultipleNodeHeights: (descriptions: string[], options?: { domainKey?: string }) => number[];
  calculateSubDomainWidth: (nodeDescriptions: string[], layout?: 'single' | 'double', options?: { domainKey?: string }) => number;
  calculateNodeWidthByContent: (description: string) => number;
  getMaxNodeWidthInDomain: (descriptions: string[]) => number;
  calculateDomainWidth: (subDomainWidths: number[], nodeDescriptions?: string[], layout?: 'horizontal' | 'vertical', options?: { domainKey?: string }) => number;
  calculateSingleLayerDomainWidth: (domainData: DomainData, domainKey?: string) => number;
  calculateComplexDomainWidth: (domainKey: string, masterData: MasterDataType) => number;
  calculateBackendComplexDomainWidth: (masterData: MasterDataType) => number;
  calculateAllDomainWidths: (masterData: MasterDataType) => { [key: string]: number };
  calculateAdaptiveCanvasWidth: (masterData: MasterDataType) => number;
}

export interface DynamicConfig {
  NODE_HEIGHT: number;
  NODE_MIN_WIDTH: number;
  NODE_MAX_WIDTH: number;
  NODE_H_GAP: number;
  NODE_V_GAP: number;
  GROUP_PADDING: { H: number; V_TOP: number; V_BOTTOM: number };
  GROUP_TITLE_HEIGHT: number;
  SUB_GROUP_PADDING: { H: number; V_TOP: number; V_BOTTOM: number };
  LAYER_V_GAP: number;
  DOMAIN_H_GAP: number;
  THEME: Theme | null;
  Z_INDEX: { GROUP: number; SUB_GROUP: number; NODE: number; CUSTOM_NODE: number; EDGE: number };
  NODE_BORDER_RADIUS: number;
  NODE_BOX_SHADOW: string;
  NODE_FONT: { size: number; family: string; weight: string | number };
  NODE_PADDING: { H: number; V: number };
  MAIN_FLOW_ARROW: { type: MarkerType; color: string; width: number; height: number };
  DEPENDENCY_ARROW: { type: MarkerType; color: string; width: number; height: number };
  DATA_ARROW: { type: MarkerType; color: string; width: number; height: number };
  MAIN_FLOW_STYLE: { stroke: string; strokeWidth: number; strokeDasharray?: string };
  DEPENDENCY_STYLE: { stroke: string; strokeWidth: number; strokeDasharray?: string };
  DATA_STYLE: { stroke: string; strokeWidth: number; strokeDasharray?: string };
}

export type UseLayoutReturn = { nodes: Node[]; edges: Edge[] } | {
  layoutUtils: LayoutUtils;
  dynamicConfig: DynamicConfig;
  currentTheme: Theme | null;
  currentConfig: DiagramConfig;
  layoutOptimizer: LayoutOptimizer;
};

type LegacySimpleLayoutConfig = {
  NODE_HEIGHT?: number;
  NODE_H_GAP?: number;
  GROUP_PADDING?: { H?: number };
  GROUP_TITLE_HEIGHT?: number;
  LAYER_V_GAP?: number;
  [key: string]: unknown;
};

/**
 * 布局计算Hook
 * @returns 布局工具函数和配置
 */
// 重载签名：
// 1) 无参：返回工具与配置
// 2) 传入 masterData/config：返回 nodes/edges（用于 ArchitectureDiagram3 的简易布局）
export function useLayout(options?: { masterData: MasterDataType; getDynamicNodeData: (nodeInfo: { description: string; theme: { border: string; color?: string } }) => { description: string; theme: { border: string; color?: string } }; config: LegacySimpleLayoutConfig }): UseLayoutReturn {
  return useLayoutImplementation(options);
}

function useLayoutImplementation(options?: { masterData: MasterDataType; getDynamicNodeData: (nodeInfo: { description: string; theme: { border: string; color?: string } }) => { description: string; theme: { border: string; color?: string } }; config: LegacySimpleLayoutConfig }): UseLayoutReturn {
  // 创建布局优化器实例
  const layoutOptimizer = useMemo(() => {
    return new LayoutOptimizer();
  }, []);

  // 获取当前主题
  const [state] = useConfigIntegration();
  const currentTheme = (() => {
    const themeManager = state.integration?.getThemeManager();
    return themeManager?.getCurrentTheme() ?? null;
  })();
  
  // 获取当前配置
  const currentConfig = diagramConfigManager.getConfig();

  // 兼容：若传入 options，则构建一个最小可用的节点/边集合以兼容 ArchitectureDiagram3
  const simpleNodesEdges = useMemo(() => {
    if (!options) return null;
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const cfg = options.config || {};
    const NODE_HEIGHT = cfg.NODE_HEIGHT ?? currentConfig.node.height;
    const NODE_H_GAP = cfg.NODE_H_GAP ?? currentConfig.node.gap.horizontal;
    const GROUP_PADDING_H = (cfg.GROUP_PADDING?.H) ?? currentConfig.domain.padding.horizontal;
    const GROUP_TITLE_HEIGHT = cfg.GROUP_TITLE_HEIGHT ?? currentConfig.domain.title.height;

    // 简易水平布局：将 ch 与 fe 两个域的节点各放一行；支持对象型域（如 mid）与数组型域（如 data/infra）
    /**
     * 函数级注释：为给定域创建一行简单布局并生成域容器（TitleGroup）
     * - 计算该域内所有节点的总宽度，并在顶部插入一个 `titleGroup` 容器。
     * - 容器样式与颜色联动当前主题的域主题：通过传入 `data.domain`/`data.domainClass`。
     * - 注意：统一使用节点级 `type: 'titleGroup'`，避免旧值 `'titleGroupNode'` 未被注册导致样式不生效。
     */
    const addSimpleRow = (domainKey: keyof MasterDataType, yStart: number) => {
      const domain = options.masterData[domainKey] as DomainData;
      if (!domain) return yStart;
      const descs = domain.descs as string[];
      const ids = domain.nodes as string[];

      const widths = layoutOptimizer.calculateMultipleNodeWidths(descs);
      let xCursor = GROUP_PADDING_H;

      // 可选：添加一个域标题组，供 TitleGroupNode 使用（宽度为节点总宽度）
      const totalWidth = widths.reduce((sum, w) => sum + w, 0) + (widths.length - 1) * NODE_H_GAP + GROUP_PADDING_H * 2;
      nodes.push({
        id: `${String(domainKey)}-group`,
        type: 'titleGroup',
        position: { x: 0, y: yStart },
        // 让容器处于背景层：zIndex 设为负值，避免遮挡业务节点
        style: { width: totalWidth, height: GROUP_TITLE_HEIGHT + NODE_HEIGHT + GROUP_PADDING_H, borderRadius: 6, zIndex: -10 },
        data: {
          // 显示标题统一走 description（TitleGroupNode 会优先显示 description）
          description: String(domainKey),
          // 域主题解析关键字段：domain/domainClass
          domain: String(domainKey),
          // 注意：domainClass 仅从节点数据来源获取；此处不根据域键派生
          // 颜色回退（若主题未定义该域时使用）：不会覆盖主题联动颜色
          themeColor: '#888',
          // 标题栏高度与层级控制
          titleBarHeight: GROUP_TITLE_HEIGHT,
          baseZIndex: -10,
        }
      });

      ids.forEach((id, idx) => {
        const nodeId = `${String(domainKey)}-${id}`;
        const nodeWidth = widths[idx];
        nodes.push({
          id: nodeId,
          type: 'custom',
          position: { x: xCursor, y: yStart + GROUP_TITLE_HEIGHT + 10 },
          style: { width: nodeWidth, height: NODE_HEIGHT, zIndex: 10, borderRadius: 8 },
          data: {
            ...options.getDynamicNodeData({ description: descs[idx], theme: { border: '#9E9E9E' } }),
            // 同步字体与内边距到节点，确保与测量一致
            fontSize: currentConfig.node.font.size,
            fontFamily: currentConfig.node.font.family,
            fontWeight: currentConfig.node.font.weight,
            padding: currentConfig.node.padding,
          }
        });
        xCursor += nodeWidth + NODE_H_GAP;
      });

      return yStart + GROUP_TITLE_HEIGHT + NODE_HEIGHT + GROUP_PADDING_H + (cfg.LAYER_V_GAP ?? currentConfig.layout.layerVerticalGap);
    };

    let yCursor = 0;
    yCursor = addSimpleRow('ch', yCursor);
    yCursor = addSimpleRow('fe', yCursor);
    yCursor = addSimpleRow('mid', yCursor);
    yCursor = addSimpleRow('data', yCursor);
    addSimpleRow('infra', yCursor);

    return { nodes, edges };
  }, [options, currentConfig, layoutOptimizer]);

  // 布局工具函数（原 API）
  // 否则，返回完整的布局工具集
  const layoutUtils = useMemo(() => {
    return {
      calculateNodeWidth: (text: string, _isGroupTitle: boolean = false) => layoutOptimizer.calculateNodeWidth(text),
      calculateMultipleNodeWidths: (descs: string[], options?: { domainKey?: string }) => layoutOptimizer.calculateMultipleNodeWidths(descs, options),
      calculateNodeHeight: (description: string) => layoutOptimizer.calculateNodeHeight(description),

      /**
       * 测量最长行的宽度
       */
      measureLongestLineWidth: (text: string): number => {
        return layoutOptimizer.measureLongestLineWidth(text);
      },

      /**
       * 计算后端域的最小宽度
       * 支持传入域数据对象或域键名（传键名时返回保守默认值）
       */
      calculateBackendDomainMinWidth: (
        domain: keyof MasterDataType | DomainData,
        domainKey?: string
      ): number => {
        if (typeof domain === 'string') {
          // 无法在此处获取 masterData，返回保守默认值以避免运行时错误
          return 800;
        }
        return layoutOptimizer.calculateBackendDomainMinWidth(domain as DomainData, domainKey);
      },

      /**
       * 计算统一域宽度
       */
      calculateUnifiedDomainWidth: (masterData: MasterDataType): number => {
        return layoutOptimizer.calculateUnifiedDomainWidth(masterData);
      },

      /**
       * 创建节点
       */
      createNode: (
        id: string,
        position: { x: number; y: number },
        data?: Record<string, unknown>,
        style?: CSSProperties,
        type?: string
      ): Node => {
        return {
          id,
          type: type || 'custom',
          position,
          data: data || {},
          style: {
            zIndex: 10,
            borderRadius: 8,
            ...style
          }
        };
      },

      /**
       * 创建边
       */
      createEdge: (
        id: string,
        source: string,
        target: string,
        style?: CSSProperties,
        type?: 'native' | 'smart' | undefined
      ): Edge => {
        return {
          id,
          source,
          target,
          type: type || 'default',
          style: {
            strokeWidth: currentConfig.edge.strokeWidth,
            ...style
          }
        };
      },

      /**
       * 计算节点组的总宽度
       */
      calculateGroupWidth: (nodeWidths: number[], gap: number): number => {
        return nodeWidths.reduce((total, width) => total + width, 0) + 
               (nodeWidths.length - 1) * gap;
      },

      /**
       * 计算节点组的总高度
       */
      calculateGroupHeight: (nodeCount: number, nodeHeight: number, gap: number): number => {
        return nodeCount * nodeHeight + (nodeCount - 1) * gap;
      },

      /**
       * 批量计算多个节点的高度（含内边距）
       */
      calculateMultipleNodeHeights: (descriptions: string[], options?: { domainKey?: string }): number[] => {
        return layoutOptimizer.calculateMultipleNodeHeights(descriptions, options);
      },

      /**
       * 计算子域宽度
       */
      calculateSubDomainWidth: (nodeDescriptions: string[], layout: 'single' | 'double' = 'single', options?: { domainKey?: string }): number => {
        return layoutOptimizer.calculateSubDomainWidth(nodeDescriptions, layout, options);
      },

      /**
       * 计算节点宽度（根据内容）
       */
      calculateNodeWidthByContent: (description: string): number => {
        return layoutOptimizer.calculateNodeWidth(description);
      },

      /**
       * 获取域内最大节点宽度
       */
      getMaxNodeWidthInDomain: (descriptions: string[]): number => {
        const widths = layoutOptimizer.calculateMultipleNodeWidths(descriptions);
        return Math.max(0, ...widths);
      },

      /**
       * 计算域宽度
       */
      calculateDomainWidth: (subDomainWidths: number[], nodeDescriptions: string[] = [], layout: 'horizontal' | 'vertical' = 'horizontal', options?: { domainKey?: string }): number => {
        return layoutOptimizer.calculateDomainWidth(subDomainWidths, nodeDescriptions, layout, options);
      },

      /**
       * 计算单层域宽度
       */
      calculateSingleLayerDomainWidth: (domainData: DomainData, domainKey?: string): number => {
        return layoutOptimizer.calculateSingleLayerDomainWidth(domainData, domainKey);
      },

      /**
       * 计算复杂域宽度
       */
      calculateComplexDomainWidth: (domainKey: string, masterData: MasterDataType): number => {
        return layoutOptimizer.calculateComplexDomainWidth(domainKey, masterData);
      },

      /**
       * 计算后端复杂域宽度
       */
      calculateBackendComplexDomainWidth: (masterData: MasterDataType): number => {
        return layoutOptimizer.calculateBackendComplexDomainWidth(masterData);
      },

      /**
       * 计算所有域宽度
       */
      calculateAllDomainWidths: (masterData: MasterDataType): { [key: string]: number } => {
        return layoutOptimizer.calculateAllDomainWidths(masterData);
      },

      /**
       * 计算自适应画布宽度
       */
      calculateAdaptiveCanvasWidth: (masterData: MasterDataType): number => {
        return layoutOptimizer.calculateAdaptiveCanvasWidth(masterData);
      }
    };
  }, [layoutOptimizer, currentConfig]);

  // 动态配置
  const dynamicConfig = useMemo(() => {
    // 获取主题颜色
    const mainEdge = { stroke: '#333' };
    const dependencyEdge = { stroke: '#aaa' };
    const dataEdge = { stroke: DEFAULT_DATA_EDGE_COLOR };
    
    return {
      // 基础配置
      NODE_HEIGHT: currentConfig.node.height,
      NODE_MIN_WIDTH: currentConfig.node.minWidth,
      NODE_MAX_WIDTH: currentConfig.node.maxWidth,
      
      // 间距配置
      NODE_H_GAP: currentConfig.node.gap.horizontal * 1.5,
      NODE_V_GAP: currentConfig.node.gap.vertical * 1.5,
      
      // 域配置 - 使用 V_TOP/V_BOTTOM 格式以兼容原版架构
      GROUP_PADDING: {
        H: currentConfig.domain.padding.horizontal,
        V_TOP: currentConfig.domain.padding.vertical,
        V_BOTTOM: currentConfig.domain.padding.vertical
      },
      GROUP_TITLE_HEIGHT: currentConfig.domain.title.height,
      
      // 子域配置
      SUB_GROUP_PADDING: {
        H: currentConfig.subDomain.padding.horizontal,
        V_TOP: currentConfig.subDomain.padding.top,
        V_BOTTOM: currentConfig.subDomain.padding.bottom
      },
      
      // 布局间距
      LAYER_V_GAP: currentConfig.layout.layerVerticalGap,
      DOMAIN_H_GAP: currentConfig.domain.gap,
      
      // 主题配置
      THEME: currentTheme,
      
      // Z-Index配置
      Z_INDEX: {
        GROUP: 1,        // TitleGroup作为背景层，层级最低
        SUB_GROUP: 2,    // SubGroup层级稍高于TitleGroup
        NODE: 10,        // 普通节点保持较高层级，确保在组之上显示
        CUSTOM_NODE: 10, // 自定义节点保持较高层级
        EDGE: 15         // 连线层级最高，确保在所有元素之上
      },
      
      // 边框圆角
      NODE_BORDER_RADIUS: 8,
      
      // 节点阴影
      NODE_BOX_SHADOW: currentConfig.node.boxShadow ?? '0 2px 4px rgba(0,0,0,0.1)',
      
      // 节点字体配置
      NODE_FONT: {
        size: currentConfig.node.font.size,
        family: currentConfig.node.font.family,
        weight: currentConfig.node.font.weight
      },
      
      // 节点内边距
      NODE_PADDING: {
        H: currentConfig.node.padding.horizontal,
        V: currentConfig.node.padding.vertical
      },
      
      // 箭头配置
      MAIN_FLOW_ARROW: { type: MarkerType.ArrowClosed, color: mainEdge.stroke ?? '#333', width: 16, height: 16 },
      DEPENDENCY_ARROW: { type: MarkerType.ArrowClosed, color: dependencyEdge.stroke ?? '#aaa', width: 18, height: 18 },
      DATA_ARROW: { type: MarkerType.ArrowClosed, color: dataEdge.stroke ?? DEFAULT_DATA_EDGE_COLOR, width: 18, height: 18 },
      
      // 连线样式
      MAIN_FLOW_STYLE: {
        stroke: mainEdge.stroke ?? '#333',
        strokeWidth: 3,
        strokeDasharray: undefined
      },
      DEPENDENCY_STYLE: {
        stroke: dependencyEdge.stroke ?? '#aaa',
        strokeWidth: 2,
        strokeDasharray: '5,5'
      },
      DATA_STYLE: {
        stroke: dataEdge.stroke ?? DEFAULT_DATA_EDGE_COLOR,
        strokeWidth: 2,
        strokeDasharray: undefined
      }
    };
  }, [currentConfig, currentTheme]);

  if (simpleNodesEdges) return simpleNodesEdges;

  return {
    layoutUtils,
    dynamicConfig,
    currentTheme,
    currentConfig,
    layoutOptimizer
  };
}

export default useLayout;
