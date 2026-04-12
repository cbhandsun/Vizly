// @ts-nocheck

import { LayoutType, AlignmentType, LayoutOptions } from '../../types/layout';
import { GroupNodeData, StandardNodeData } from '../../models/DiagramModels';
import { Edge, Node as ReactFlowNode, XYPosition } from '@xyflow/react';
import { Position, Rectangle } from '../../types/common';
import { diagramConfigManager } from '../../components/config/DiagramConfig';
import { LayeredConfigManager } from '../../config/LayeredConfigManager';
import { deriveDomainClassFromDomain } from '../domainKey';
import { LayoutOptimizer } from '../../components/layout/LayoutOptimizer';
import { forceSimulation, forceCollide, forceX, forceY } from 'd3-force';
import dagre from 'dagre';
import { safeLog } from '../consoleCleanup';

/**
 * @file 统一布局工具函数
 * @description 整合所有图表的布局计算逻辑，避免重复代码
 */

import { calculateHierarchicalLayout } from './hierarchicalLayout';

/**
 * 计算网格布局
 * @param items 要布局的元素数组
 * @param options 布局选项
 * @returns 每个元素的位置数组
 */
export function calculateGridLayout(
  items: any[],
  options: LayoutOptions
): Position[] {
  const {
    spacing = { horizontal: 100, vertical: 120 },
    padding = { top: 50, right: 50, bottom: 50, left: 50 },
    columns = Math.ceil(Math.sqrt(items.length)),
    itemSize = { width: 280, height: 120 },
  } = options;

  const positions: Position[] = [];

  items.forEach((_, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;

    const x = padding.left + col * (itemSize.width + spacing.horizontal);
    const y = padding.top + row * (itemSize.height + spacing.vertical);

    positions.push({ x, y });
  });

  return positions;
}

// 水平布局计算


// 水平布局计算
export function calculateHorizontalLayout(
  items: any[],
  options: LayoutOptions
): Position[] {
  const {
    spacing = { horizontal: 100, vertical: 0 },
    padding = { top: 50, right: 50, bottom: 50, left: 50 },
    alignment = AlignmentType.CENTER,
    containerSize = { width: 1200, height: 800 },
    itemSize = { width: 280, height: 120 },
  } = options;

  const totalWidth = items.length * itemSize.width + (items.length - 1) * spacing.horizontal;
  let startX = padding.left;

  if (alignment === AlignmentType.CENTER) {
    startX = (containerSize.width - totalWidth) / 2;
  } else if (alignment === AlignmentType.RIGHT) {
    startX = containerSize.width - totalWidth - padding.right;
  }

  let startY = padding.top;
  if (alignment === AlignmentType.CENTER) {
    startY = (containerSize.height - itemSize.height) / 2;
  }

  const positions: Position[] = [];

  items.forEach((_, index) => {
    const x = startX + index * (itemSize.width + spacing.horizontal);
    const y = startY;

    positions.push({ x, y });
  });

  return positions;
}

// 垂直布局计算


// 垂直布局计算
export function calculateVerticalLayout(
  items: any[],
  options: LayoutOptions
): Position[] {
  const {
    spacing = { horizontal: 0, vertical: 120 },
    padding = { top: 50, right: 50, bottom: 50, left: 50 },
    alignment = AlignmentType.CENTER,
    containerSize = { width: 1200, height: 800 },
    itemSize = { width: 280, height: 120 },
  } = options;

  const totalHeight = items.length * itemSize.height + (items.length - 1) * spacing.vertical;
  let startY = padding.top;

  if (alignment === AlignmentType.CENTER) {
    startY = (containerSize.height - totalHeight) / 2;
  } else if (alignment === AlignmentType.BOTTOM) {
    startY = containerSize.height - totalHeight - padding.bottom;
  }

  let startX = padding.left;
  if (alignment === AlignmentType.CENTER) {
    startX = (containerSize.width - itemSize.width) / 2;
  }

  const positions: Position[] = [];

  items.forEach((_, index) => {
    const x = startX;
    const y = startY + index * (itemSize.height + spacing.vertical);

    positions.push({ x, y });
  });

  return positions;
}

// 居中布局计算


// 居中布局计算
export function calculateCenteredLayout(
  items: any[],
  options: LayoutOptions
): Position[] {
  const {
    containerSize = { width: 1200, height: 800 },
    itemSize = { width: 280, height: 120 },
    spacing = { horizontal: 100, vertical: 120 },
  } = options;

  const positions: Position[] = [];

  if (items.length === 1) {
    // 单个元素居中
    positions.push({
      x: (containerSize.width - itemSize.width) / 2,
      y: (containerSize.height - itemSize.height) / 2,
    });
  } else {
    // 多个元素以网格形式居中
    const columns = Math.ceil(Math.sqrt(items.length));
    const rows = Math.ceil(items.length / columns);

    const totalWidth = columns * itemSize.width + (columns - 1) * spacing.horizontal;
    const totalHeight = rows * itemSize.height + (rows - 1) * spacing.vertical;

    const startX = (containerSize.width - totalWidth) / 2;
    const startY = (containerSize.height - totalHeight) / 2;

    items.forEach((_, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;

      const x = startX + col * (itemSize.width + spacing.horizontal);
      const y = startY + row * (itemSize.height + spacing.vertical);

      positions.push({ x, y });
    });
  }

  return positions;
}

// 层次布局计算
/**
 * @param nodes 要布局的元素数组
 * @param edges 边数组
 * @param options 布局选项
 * @returns {{ positions: Position[], nodeRanks: Map<string, number> }} 返回一个包含节点位置数组和节点层级 Map 的对象
 */


// 甯冨眬璁＄畻涓诲嚱鏁?
export function calculateLayout(
  items: any[],
  options: LayoutOptions
): Position[] {
  switch (options.type) {
    case LayoutType.GRID:
      return calculateGridLayout(items, options);
    case LayoutType.HORIZONTAL:
      return calculateHorizontalLayout(items, options);
    case LayoutType.VERTICAL:
      return calculateVerticalLayout(items, options);
    case LayoutType.CENTERED:
      return calculateCenteredLayout(items, options);
    case LayoutType.HIERARCHICAL: {
      // 娉ㄦ剰锛氳繖閲岀殑 items 搴旇鍖呭惈 nodes 鍜?edges
      const reactFlowNodes = items.filter(item => 'position' in item) as ReactFlowNode[];
      const edges = items.filter(item => 'source' in item && 'target' in item) as Edge[];
      const { positions } = calculateHierarchicalLayout(reactFlowNodes, edges, options);
      return positions;
    }
    default:
      return calculateGridLayout(items, options);
  }
}

/**
 * 瀛愬煙瀹瑰櫒鍦ㄥ煙鍐呴儴姘村钩灞呬腑锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬湪鍩熷涓庡瓙鍩熸渶缁堝搴︾‘瀹氬悗锛屼娇姣忎釜鍙瀛愬煙瀹瑰櫒鍦ㄦ墍灞炲煙鍐呴儴鍙敤瀹藉害鍐呮按骞冲眳涓紝淇濊瘉宸﹀彸鐣欑櫧瀵圭О锛涘悓姝?children 鐨?x 骞崇Щ锛屼笉鏀瑰彉 y銆?
 */
