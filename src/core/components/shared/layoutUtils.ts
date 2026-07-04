import { Node, Edge } from '@xyflow/react';
// 定义默认数据边颜色常量
const DEFAULT_DATA_EDGE_COLOR = '#47CACC';
import { LayoutConfig, DEFAULT_CONFIG } from './config';
import { NODE_DATA, NodeDataItem, SpecialNodeData } from './nodeData';
import { EDGE_STYLES, createEdge, createCoreFlowEdges, createDomainInternalEdges, createDataFlowEdges } from './edgeData';
import { THEMES } from './flowStyles';
// 统一域键解析与主题获取（与 EnhancedThemeManager / utils 保持一致）
import { resolveThemeDomainKey as resolveDomainKeyUnified, getDomainTheme as getDomainThemeUnified } from '../../utils/domainKey';
import type { Theme } from '../../themes/types/ThemeTypes';
import type { EdgeStyleToken, FlowStylePreset } from './DiagramStyleManager';
import {
  logDomainThemeFallback,
  logHexParseFailure,
  logInvalidHexColor,
  logInvalidHexFormat,
} from './layoutUtilsLogging';

export interface DomainThemeToken {
  main: string;
  light: string;
  border: string;
  text: string;
  background: string;
}

export interface FlowStyleMap {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  markerEnd: { type: 'arrow' | 'arrowclosed'; color: string };
}

export interface FlowStyleMaps {
  main: FlowStyleMap;
  dependency: FlowStyleMap;
  secondary: FlowStyleMap;
  data: FlowStyleMap;
  internal: FlowStyleMap;
  [key: string]: FlowStyleMap;
}

// 工具函数：将十六进制颜色转换为 RGBA
export function hexToRgba(hex: string, alpha: number = 1): string {
  // 参数验证：确保hex是有效的字符串
  if (!hex || typeof hex !== 'string') {
    logInvalidHexColor(hex);
    return `rgba(128, 128, 128, ${alpha})`;
  }
  
  // 确保hex以#开头
  const normalizedHex = hex.startsWith('#') ? hex : `#${hex}`;
  
  // 验证hex格式
  if (!/^#([A-Fa-f0-9]{3}){1,2}$/.test(normalizedHex)) {
    logInvalidHexFormat(hex);
    return `rgba(128, 128, 128, ${alpha})`;
  }
  
  // 处理3位hex颜色（如#abc -> #aabbcc）
  let fullHex = normalizedHex;
  if (normalizedHex.length === 4) {
    fullHex = '#' + normalizedHex[1] + normalizedHex[1] + normalizedHex[2] + normalizedHex[2] + normalizedHex[3] + normalizedHex[3];
  }
  
  const r = parseInt(fullHex.slice(1, 3), 16);
  const g = parseInt(fullHex.slice(3, 5), 16);
  const b = parseInt(fullHex.slice(5, 7), 16);
  
  // 验证解析结果
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    logHexParseFailure(hex);
    return `rgba(128, 128, 128, ${alpha})`;
  }
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 获取域主题（统一解析 + 兼容回退）
 * 函数级注释：
 * - 解析：通过统一的 `resolveThemeDomainKey` 将别名（ch/external、fe/frontend、mid/middleware、data/database 等）映射为主题可用域键。
 * - 优先：使用增强主题的 `diagram.domains[key]` 返回完整主题对象（main/light/border/text/background）。
 * - 回退：如果主题缺失或不包含 `diagram.domains`，使用旧版静态映射 `THEMES` 兜底，保证渲染稳定。
 */
export function getDomainTheme(domain: string, theme: Theme | null): DomainThemeToken {
  // 空主题兜底
  if (!theme) {
    logDomainThemeFallback(domain);
    return { main: '#999999', light: '#F7F7F7', border: '#999999', text: '#333333', background: '#FFFFFF' };
  }

  const hasDiagramDomains = !!theme?.diagram?.domains;
  if (hasDiagramDomains) {
    const key = resolveDomainKeyUnified(theme, { domainClass: domain });
    const token = getDomainThemeUnified(theme, { domainClass: key });
    if (token) return {
      main: token.main,
      light: token.light,
      border: token.border,
      text: token.text,
      background: token.background,
    };
  }

  // 旧版静态映射回退（兼容 legacy）
  const staticMap: Record<string, { border: string; color: string }> = {
    ch: THEMES.ch,
    fe: THEMES.fe,
    mid: THEMES.midend,
    'be-scm': THEMES.scm,
    'be-logistics': THEMES.logistics,
    'be-corp': THEMES.corp,
    data: THEMES.data,
    infra: THEMES.infra,
  };
  const themesByKey = THEMES as Record<string, { border: string; color: string }>;
  const token = staticMap[String(domain)] || themesByKey[String(domain)] || { border: '#999999', color: '#999999' };
  return {
    main: token.color,
    light: '#F7F7F7',
    border: token.border,
    text: '#333333',
    background: '#FFFFFF',
  };
}

// 获取域主色
/**
 * 获取域主色（统一解析）
 * 函数级注释：
 * - 使用统一的 `getDomainTheme` 获取域主题对象，返回 `main`，若不存在则回退 `border`，最后兜底灰色。
 */
export function getDomainMain(domain: string, theme: Theme | null): string {
  const domainTheme = getDomainTheme(domain, theme);
  return domainTheme?.main || domainTheme?.border || '#888888';
}

// 获取流程样式映射
export function getFlowStyleMaps(theme: Theme | null, stylePreset?: FlowStylePreset | null): FlowStyleMaps {
  if (stylePreset && stylePreset.edges) {
    const toMap = (token: EdgeStyleToken | undefined, fallback: { stroke: string; strokeWidth: number; strokeDasharray?: string }): FlowStyleMap => {
      const stroke = token?.color ?? fallback.stroke;
      const strokeWidth = token?.width ?? fallback.strokeWidth;
      const strokeDasharray = (token?.dash ?? fallback.strokeDasharray) || undefined;
      const markerColor = token?.arrow?.color ?? stroke;
      return { stroke, strokeWidth, strokeDasharray, markerEnd: { type: 'arrowclosed', color: markerColor } };
    };

    const edges = stylePreset.edges;
    const dependencyToken = edges.dependency ?? edges.external;
    const secondaryToken = edges.support ?? edges.status ?? dependencyToken;
    const internalToken = edges.status ?? edges.support ?? edges.main;

    return {
      main: toMap(edges.main, { stroke: '#333', strokeWidth: 2 }),
      dependency: toMap(dependencyToken, { stroke: '#aaa', strokeWidth: 1, strokeDasharray: '5,5' }),
      secondary: toMap(secondaryToken, { stroke: '#aaa', strokeWidth: 1, strokeDasharray: '5,5' }),
      data: toMap(edges.data, { stroke: DEFAULT_DATA_EDGE_COLOR, strokeWidth: 1.5, strokeDasharray: '4,4' }),
      internal: toMap(internalToken, { stroke: '#666', strokeWidth: 1, strokeDasharray: '3,3' }),
    };
  }

  // 支持 Theme 和 DiagramTheme 两种格式
  const themeEdges = theme?.diagram?.edges;
  const primary = themeEdges?.primary?.main;
  const secondary = themeEdges?.secondary?.main;
  const dashed = themeEdges?.dashed?.main;
  const defaultEdge = themeEdges?.default?.main;
  
  // 使用默认样式
  return {
    main: {
      stroke: primary || '#333',
      strokeWidth: 2,
      strokeDasharray: undefined,
      markerEnd: { type: 'arrowclosed', color: primary || '#333' }
    },
    dependency: {
      stroke: dashed || secondary || '#aaa',
      strokeWidth: 1,
      strokeDasharray: '5,5',
      markerEnd: { type: 'arrowclosed', color: dashed || secondary || '#aaa' }
    },
    secondary: {
      stroke: secondary || '#aaa',
      strokeWidth: 1,
      strokeDasharray: undefined,
      markerEnd: { type: 'arrowclosed', color: secondary || '#aaa' }
    },
    data: {
      stroke: secondary || theme?.palette?.info?.main || DEFAULT_DATA_EDGE_COLOR,
      strokeWidth: 1.5,
      strokeDasharray: '4,4',
      markerEnd: { type: 'arrowclosed', color: secondary || theme?.palette?.info?.main || DEFAULT_DATA_EDGE_COLOR }
    },
    internal: {
      stroke: defaultEdge || '#666',
      strokeWidth: 1,
      strokeDasharray: '3,3',
      markerEnd: { type: 'arrowclosed', color: defaultEdge || '#666' }
    }
  };
}

// 计算节点位置的主函数
export const calculateLayout = (
  nodes: Node[], 
  config: LayoutConfig = DEFAULT_CONFIG
): Node[] => {
  // 复制原始节点数组以避免直接修改
  const positionedNodes = [...nodes];
  
  // 使用配置中的画布宽度
  const canvasWidth = config.CANVAS_WIDTH;
  
  // 计算域宽度
  const domainWidth = Math.max(config.DOMAIN_MIN_WIDTH, canvasWidth - 80);
  
  // 计算中心位置
  const centerX = canvasWidth / 2;
  const domainStartX = centerX - domainWidth / 2;
  
  // 对每个节点应用布局逻辑
  positionedNodes.forEach(node => {
    // 这里可以根据节点ID或类型应用不同的布局策略
    // 实际项目中可能需要更复杂的布局算法
    if (node.position.x === 0 && node.position.y === 0) {
      // 如果节点没有位置信息，应用默认布局
      node.position = { x: domainStartX + Math.random() * domainWidth, y: Math.random() * 500 };
    }
  });
  
  return positionedNodes;
};

// 简化版布局函数，保留原有功能
export const calculateNodePositions = (
  canvasWidth: number,
  config: LayoutConfig = DEFAULT_CONFIG
) => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Calculate domain widths
  const domainWidth = Math.max(config.DOMAIN_MIN_WIDTH, canvasWidth - 80);
  const channelWidth = domainWidth;
  const midendWidth = domainWidth;
  const beWidth = domainWidth;
  const dataWidth = domainWidth;
  const infraWidth = domainWidth;

  // Calculate x positions
  const centerX = canvasWidth / 2;
  const domainStartX = centerX - domainWidth / 2;

  // Channel Layer
  let currentY = config.START_Y_POSITION;
  const channelNodes = Object.entries(NODE_DATA.channel as Record<string, NodeDataItem>).map(([id, data], index) => {
    const x = domainStartX + (channelWidth / 3) * (index + 1);
    return {
      id: `channel-${id}`,
      type: 'custom',
      position: { x, y: currentY },
      data: { ...data, width: channelWidth / 3 - config.NODE_MARGIN }
    };
  });
  nodes.push(...channelNodes);

  // Midend Layer
  currentY += config.LAYER_V_GAP + config.NODE_HEIGHT;
  const midendNodes = Object.entries(NODE_DATA.midend as Record<string, NodeDataItem>).map(([id, data], index) => {
    const x = domainStartX + (midendWidth / 4) * (index + 1);
    return {
      id: `midend-${id}`,
      type: 'custom',
      position: { x, y: currentY },
      data: { ...data, width: midendWidth / 4 - config.NODE_MARGIN }
    };
  });
  nodes.push(...midendNodes);

  // Business Layer
  currentY += config.LAYER_V_GAP + config.NODE_HEIGHT;
  
  // SCM Domain
  const scmStartX = domainStartX;
  const scmWidth = beWidth * 0.25;
  Object.entries(NODE_DATA['be-scm'] as Record<string, NodeDataItem>).forEach(([id, data], index) => {
    nodes.push({
      id: `be-scm-${id}`,
      type: 'custom',
      position: { 
        x: scmStartX + (scmWidth / 2) * index + config.BE_COLUMN_GAP,
        y: currentY
      },
      data: { ...data, width: scmWidth / 2 - config.BE_COLUMN_GAP * 1.5 }
    });
  });

  // Logistics Domain
  const logisticsStartX = scmStartX + scmWidth;
  const logisticsWidth = beWidth * 0.5;
  Object.entries(NODE_DATA['be-logistics'] as Record<string, NodeDataItem>).forEach(([id, data], index) => {
    nodes.push({
      id: `be-logistics-${id}`,
      type: 'custom',
      position: {
        x: logisticsStartX + (logisticsWidth / 5) * index + config.BE_COLUMN_GAP,
        y: currentY
      },
      data: { ...data, width: logisticsWidth / 5 - config.BE_COLUMN_GAP * 1.5 }
    });
  });

  // Corp Domain
  const corpStartX = logisticsStartX + logisticsWidth;
  const corpWidth = beWidth * 0.25;
  Object.entries(NODE_DATA['be-corp'] as Record<string, NodeDataItem>).forEach(([id, data], index) => {
    nodes.push({
      id: `be-corp-${id}`,
      type: 'custom',
      position: {
        x: corpStartX + (corpWidth / 3) * index + config.BE_COLUMN_GAP,
        y: currentY
      },
      data: { ...data, width: corpWidth / 3 - config.BE_COLUMN_GAP * 1.5 }
    });
  });

  // Data Layer
  currentY += config.LAYER_V_GAP + config.NODE_HEIGHT;
  const dataStartX = domainStartX;
  (NODE_DATA.data as SpecialNodeData).ids.forEach((id, index) => {
    nodes.push({
      id: `data-${id}`,
      type: 'custom',
      position: {
        x: dataStartX + (dataWidth / 6) * index + config.DATA_COLLECT_GAP,
        y: currentY
      },
      data: {
        description: (NODE_DATA.data as SpecialNodeData).descs[index],
        theme: THEMES.data,
        width: dataWidth / 6 - config.DATA_COLLECT_GAP * 1.5
      }
    });
  });

  // Infrastructure Layer
  currentY += config.LAYER_V_GAP + config.NODE_HEIGHT;
  const infraStartX = domainStartX;
  (NODE_DATA.infra as SpecialNodeData).ids.forEach((id, index) => {
    nodes.push({
      id: `infra-${id}`,
      type: 'custom',
      position: {
        x: infraStartX + (infraWidth / 6) * index + config.DATA_COLLECT_GAP,
        y: currentY
      },
      data: {
        description: (NODE_DATA.infra as SpecialNodeData).descs[index],
        theme: THEMES.infra,
        width: infraWidth / 6 - config.DATA_COLLECT_GAP * 1.5
      }
    });
  });

  // Create edges
  // Core business flow
  edges.push(...createCoreFlowEdges([
    'channel-b2b',
    'midend-order',
    'be-logistics-l-oms',
    'be-logistics-wms',
    'be-logistics-tms'
  ]));

  // Channel to Midend connections
  channelNodes.forEach(node => {
    midendNodes.forEach(midendNode => {
      edges.push(createEdge(node.id, midendNode.id, EDGE_STYLES.channel));
    });
  });

  // Domain internal connections
  edges.push(
    ...createDomainInternalEdges('be-scm', ['sourcing', 'planning'], EDGE_STYLES.scm),
    ...createDomainInternalEdges('be-logistics', ['l-oms', 'wms', 'tms', 'customs', 'bms'], EDGE_STYLES.logistics),
    ...createDomainInternalEdges('be-corp', ['crm-ma', 'crm-sales', 'fms'], EDGE_STYLES.corp)
  );

  // Data flow connections
  const dataNodes = (NODE_DATA.data as SpecialNodeData).ids.map(id => `data-${id}`);
  const infraNodes = (NODE_DATA.infra as SpecialNodeData).ids.map(id => `infra-${id}`);
  edges.push(...createDataFlowEdges(dataNodes, infraNodes));

  return { nodes, edges };
};
