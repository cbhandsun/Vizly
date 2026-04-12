import { type Node } from '@xyflow/react';
import { type Theme } from '../../themes/EnhancedThemeManager';
import { getDomainMain, getDomainTheme, hexToRgba } from '../shared/layoutUtils';
import { MasterDataType, DomainData } from '../../types'; // Correctly import DomainData
import { useLayout, type LayoutUtils, type DynamicConfig } from '../layout/useLayout';

// 此处定义了从 ArchitectureDiagramRefactored.tsx 中提取的布局辅助函数

/**
 * 构建简单分层（主域使用标题组样式）
 */
export const buildSimpleLayer = (
  nodes: Node[],
  domainKey: keyof MasterDataType,
  xOffset: number,
  yCursor: number, // Changed from object to number
  masterData: MasterDataType,
  layoutUtils: LayoutUtils,
  dynamicConfig: DynamicConfig,
  unifiedDomainWidth: number,
  /**
   * 函数级注释：当前主题（Theme | null）
   * - 统一使用 Theme，以兼容增强主题管理器；允许为 null 并使用默认色板。
   */
  currentTheme: Theme | null
): number => { // Return the new y-cursor
  const domainData = masterData[domainKey];
  if (!domainData) {
    return yCursor;
  }

  const nodeNum = domainData.nodes.length;
  const nodeWidths = layoutUtils.calculateMultipleNodeWidths(domainData.descs, { domainKey: domainKey.toString() });
  const nodeHeights = layoutUtils.calculateMultipleNodeHeights(domainData.descs, { domainKey: domainKey.toString() });
  const totalNodesWidth = nodeWidths.reduce((sum: number, w: number) => sum + w, 0) + (nodeNum - 1) * dynamicConfig.NODE_H_GAP;

  const actualDomainWidth = unifiedDomainWidth;
  const maxNodeHeight = Math.max(0, ...nodeHeights);
  const layerHeight = maxNodeHeight + dynamicConfig.GROUP_PADDING.V_TOP + dynamicConfig.GROUP_PADDING.V_BOTTOM + dynamicConfig.GROUP_TITLE_HEIGHT;

  const domainTheme = getDomainTheme(domainKey.toString(), currentTheme);

  nodes.push({
    id: `${String(domainKey)}-group`,
    type: 'titleGroup',
    position: { x: xOffset, y: yCursor },
    style: {
      width: actualDomainWidth,
      height: layerHeight,
      backgroundColor: hexToRgba(getDomainMain(domainKey.toString(), currentTheme), 0.03),
      border: 'none',
      borderRadius: dynamicConfig.NODE_BORDER_RADIUS,
      zIndex: dynamicConfig.Z_INDEX.GROUP
    },
    data: { 
    // 统一仅使用 description，移除 label
    description: domainData.title, 
    themeColor: getDomainMain(domainKey.toString(), currentTheme), 
    titleBarHeight: dynamicConfig.GROUP_TITLE_HEIGHT, 
    baseZIndex: 1, 
    title: domainData.title, 
    nodes: [],
    domainClass: domainKey.toString()
  }
  });

  const availableWidth = actualDomainWidth - dynamicConfig.GROUP_PADDING.H * 2;
  const startX = xOffset + dynamicConfig.GROUP_PADDING.H + Math.max(0, (availableWidth - totalNodesWidth) / 2);

  let currentX = startX;
  domainData.nodes.forEach((nodeId: string, i: number) => {
    nodes.push({
      id: nodeId,
      type: 'custom',
      position: { x: currentX, y: yCursor + dynamicConfig.GROUP_PADDING.V_TOP + dynamicConfig.GROUP_TITLE_HEIGHT },
      style: {
        width: nodeWidths[i],
        height: nodeHeights[i],
        borderRadius: dynamicConfig.NODE_BORDER_RADIUS,
        border: 'none',
        backgroundColor: 'transparent',
        boxShadow: dynamicConfig.NODE_BOX_SHADOW,
        zIndex: dynamicConfig.Z_INDEX.NODE // 确保普通节点在TitleGroup之上
      },
      data: {
        description: domainData.descs[i],
        theme: domainTheme,
        domainClass: domainKey.toString(),
        fontSize: dynamicConfig.NODE_FONT.size,
        fontFamily: dynamicConfig.NODE_FONT.family,
        fontWeight: dynamicConfig.NODE_FONT.weight,
        padding: dynamicConfig.NODE_PADDING
      }
    });

    currentX += nodeWidths[i] + dynamicConfig.NODE_H_GAP;
  });

  return yCursor + layerHeight + dynamicConfig.LAYER_V_GAP; // Return new y-cursor
};

/**
 * 构建并排分层
 */
export const buildSideBySideLayer = (
  nodes: Node[],
  domainLeftKey: keyof MasterDataType,
  domainRightKey: keyof MasterDataType,
  xOffset: number,
  yCursor: number, // Changed from object to number
  masterData: MasterDataType,
  layoutUtils: LayoutUtils,
  dynamicConfig: DynamicConfig,
  unifiedDomainWidth: number,
  /**
   * 函数级注释：当前主题（Theme | null）
   * - 统一使用 Theme，以兼容增强主题管理器；允许为 null 并使用默认色板。
   */
  currentTheme: Theme | null
): number => { // Return the new y-cursor
  const leftNodesData = masterData[domainLeftKey] as DomainData;
  const rightNodesData = masterData[domainRightKey] as DomainData;

  if (!leftNodesData || !rightNodesData) {
    return yCursor; // Return original y-cursor if data is invalid
  }

  const leftNodeWidths = layoutUtils.calculateMultipleNodeWidths(leftNodesData.descs, { domainKey: domainLeftKey.toString() });
  const leftNodeHeights = layoutUtils.calculateMultipleNodeHeights(leftNodesData.descs, { domainKey: domainLeftKey.toString() });
  const rightNodeWidths = layoutUtils.calculateMultipleNodeWidths(rightNodesData.descs, { domainKey: domainRightKey.toString() });
  const rightNodeHeights = layoutUtils.calculateMultipleNodeHeights(rightNodesData.descs, { domainKey: domainRightKey.toString() });

  const leftColumnWidth = Math.max(...leftNodeWidths, dynamicConfig.NODE_MIN_WIDTH);
  const rightColumnWidth = Math.max(...rightNodeWidths, dynamicConfig.NODE_MIN_WIDTH);

  const totalContentWidth = leftColumnWidth + rightColumnWidth + dynamicConfig.DOMAIN_H_GAP;
  const layerWidth = Math.max(unifiedDomainWidth, totalContentWidth);
  const startX = xOffset + (layerWidth - totalContentWidth) / 2;

  const leftGroupWidth = leftColumnWidth + 2 * dynamicConfig.GROUP_PADDING.H;
  const rightGroupWidth = rightColumnWidth + 2 * dynamicConfig.GROUP_PADDING.H;

  let leftY = yCursor + dynamicConfig.GROUP_TITLE_HEIGHT + dynamicConfig.GROUP_PADDING.V_TOP;
  leftNodesData.nodes.forEach((nodeId: string, i: number) => {
    const nodeHeight = leftNodeHeights[i];
    nodes.push({
      id: nodeId,
      type: 'custom',
      position: { x: startX + (leftGroupWidth - leftNodeWidths[i]) / 2, y: leftY },
      style: { width: leftNodeWidths[i], height: nodeHeight, zIndex: dynamicConfig.Z_INDEX.NODE },
      data: {
        description: leftNodesData.descs[i],
        theme: getDomainTheme(domainLeftKey.toString(), currentTheme),
        domainClass: domainLeftKey.toString(),
        fontSize: dynamicConfig.NODE_FONT.size,
        fontFamily: dynamicConfig.NODE_FONT.family,
        fontWeight: dynamicConfig.NODE_FONT.weight,
        padding: dynamicConfig.NODE_PADDING,
      },
    });
    leftY += nodeHeight + dynamicConfig.NODE_V_GAP;
  });

  let rightY = yCursor + dynamicConfig.GROUP_TITLE_HEIGHT + dynamicConfig.GROUP_PADDING.V_TOP;
  rightNodesData.nodes.forEach((nodeId: string, i: number) => {
    const nodeHeight = rightNodeHeights[i];
    nodes.push({
      id: nodeId,
      type: 'custom',
      position: { x: startX + leftGroupWidth + dynamicConfig.DOMAIN_H_GAP + (rightGroupWidth - rightNodeWidths[i]) / 2, y: rightY },
      style: { width: rightNodeWidths[i], height: nodeHeight, zIndex: dynamicConfig.Z_INDEX.NODE },
      data: {
        description: rightNodesData.descs[i],
        theme: getDomainTheme(domainRightKey.toString(), currentTheme),
        domainClass: domainRightKey.toString(),
        fontSize: dynamicConfig.NODE_FONT.size,
        fontFamily: dynamicConfig.NODE_FONT.family,
        fontWeight: dynamicConfig.NODE_FONT.weight,
        padding: dynamicConfig.NODE_PADDING,
      },
    });
    rightY += nodeHeight + dynamicConfig.NODE_V_GAP;
  });

  const leftGroupHeight = leftY - yCursor - dynamicConfig.NODE_V_GAP + dynamicConfig.GROUP_PADDING.V_BOTTOM;
  const rightGroupHeight = rightY - yCursor - dynamicConfig.NODE_V_GAP + dynamicConfig.GROUP_PADDING.V_BOTTOM;
  const layerHeight = Math.max(leftGroupHeight, rightGroupHeight);

  nodes.unshift({
    id: `${String(domainLeftKey)}-group`,
    type: 'titleGroup',
    position: { x: startX, y: yCursor },
    style: {
      width: leftGroupWidth,
      height: layerHeight,
      backgroundColor: hexToRgba(getDomainMain(domainLeftKey.toString(), currentTheme), 0.03),
      border: 'none',
      borderRadius: dynamicConfig.NODE_BORDER_RADIUS,
      zIndex: dynamicConfig.Z_INDEX.GROUP,
    },
    // 函数级注释：统一使用 description 作为标题文本，移除 label，避免混淆
    data: { description: leftNodesData.title, themeColor: getDomainMain(domainLeftKey.toString(), currentTheme), titleBarHeight: dynamicConfig.GROUP_TITLE_HEIGHT, baseZIndex: 1, title: leftNodesData.title, nodes: leftNodesData.nodes.map(id => nodes.find(n => n.id === id)).filter(Boolean) as Node[], domainClass: domainLeftKey.toString() },
  });

  nodes.unshift({
    id: `${String(domainRightKey)}-group`,
    type: 'titleGroup',
    position: { x: startX + leftGroupWidth + dynamicConfig.DOMAIN_H_GAP, y: yCursor },
    style: {
      width: rightGroupWidth,
      height: layerHeight,
      backgroundColor: hexToRgba(getDomainMain(domainRightKey.toString(), currentTheme), 0.03),
      border: 'none',
      borderRadius: dynamicConfig.NODE_BORDER_RADIUS,
      zIndex: dynamicConfig.Z_INDEX.GROUP,
    },
    // 函数级注释：统一使用 description 作为标题文本，移除 label，避免混淆
    data: { description: rightNodesData.title, themeColor: getDomainMain(domainRightKey.toString(), currentTheme), titleBarHeight: dynamicConfig.GROUP_TITLE_HEIGHT, baseZIndex: 1, title: rightNodesData.title, nodes: rightNodesData.nodes.map(id => nodes.find(n => n.id === id)).filter(Boolean) as Node[], domainClass: domainRightKey.toString() },
  });

  return yCursor + layerHeight + dynamicConfig.LAYER_V_GAP; // Return new y-cursor
};
