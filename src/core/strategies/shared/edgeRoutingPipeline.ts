/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @file 边路由管线
 * @description 从 DomainVerticalLayoutStrategy 提取的完整边路由管线。
 *   包含 positionAbsolute 计算、智能边路由决策、两轮优化、
 *   后处理管线（捆绑/分层/正交化/总线/标签避让）以及 ELK 集成。
 */
import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import { diagramConfigManager } from '../../components/config/DiagramConfig';
import {
  decideEdgeRouting,
  separateParallelEdges,
  globalOptimizeEdgeRouting,
  bundleEdges,
  layerBasedEdgeRouting,
  optimizeEdgeLabelPositions,
  beautifyOrthogonalEdges,
  optimizeTreeBusRouting,
  assignGlobalPorts,
  distributePortConnections,
} from '../../utils/HandlePicker';
import { routeEdgesWithELK } from '../../utils/elkEdgeRouter';

const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;

/**
 * 计算节点的绝对位置（考虑 parentId 链）
 */
export function computeAbsolutePosition(
  node: ReactFlowNode,
  nodeMap: Map<string, ReactFlowNode>
): { x: number; y: number } {
  let x = (node.position as any)?.x ?? 0;
  let y = (node.position as any)?.y ?? 0;
  let current = node;
  let depth = 0;
  const visited = new Set<string>();
  visited.add(node.id);

  while (current.parentId && depth < 20) {
    if (visited.has(current.parentId)) break;
    const parent = nodeMap.get(current.parentId);
    if (!parent) break;
    x += (parent.position as any)?.x ?? 0;
    y += (parent.position as any)?.y ?? 0;
    visited.add(parent.id);
    current = parent;
    depth++;
  }
  return { x, y };
}

/**
 * 为所有节点计算并设置 positionAbsolute
 * @param nodes 所有节点（会就地修改 positionAbsolute 属性）
 */
export function setAbsolutePositions(nodes: ReactFlowNode[]): void {
  const nodeMap = new Map<string, ReactFlowNode>(nodes.map(n => [n.id, n] as const));
  for (const node of nodes) {
    const absPos = computeAbsolutePosition(node, nodeMap);
    (node as any).positionAbsolute = absPos;
  }
}

/** Handle 方向到锚点的映射 */
function handleToAnchor(
  pos: any,
  w: number,
  h: number,
  handle: string | null | undefined,
  nodeType?: string
): { x: number; y: number } {
  if ((!handle || handle === 'source' || handle === 'target') &&
    (nodeType === 'group' || nodeType === 'subGroup' || nodeType === 'domain')) {
    return { x: pos.x + w / 2, y: pos.y + h / 2 };
  }
  switch (handle) {
    case 'l': case 'left': return { x: pos.x, y: pos.y + h / 2 };
    case 'r': case 'right': return { x: pos.x + w, y: pos.y + h / 2 };
    case 't': case 'top': return { x: pos.x + w / 2, y: pos.y };
    case 'b': case 'bottom': return { x: pos.x + w / 2, y: pos.y + h };
    default: return { x: pos.x + w / 2, y: pos.y + h / 2 };
  }
}

/**
 * 处理单条边的路由
 */
function processEdge(
  edge: any,
  existingPaths: Array<{ points: Array<{ x: number; y: number }> }>,
  nodeMap: Map<string, ReactFlowNode>,
  nodes: ReactFlowNode[],
  cfgEdge: any,
  layoutDirection: string,
  globalPorts: any,
) {
  const edgeType = String(edge.type || '').toLowerCase();
  const baseType = edgeType.includes('smart') ? edge.type : 'smart-step';

  const newData = {
    ...(edge.data || {}),
    intraContainerNoObstacle: true,
    obstacleScope: 'corridor',
    obstaclePadding: 16,
    pathOptions: {
      ...(edge.data?.pathOptions || {}),
      gridRatio: 1.04,
      borderRadius: 4,
    },
  };

  const srcNode = nodeMap.get(edge.source);
  const tgtNode = nodeMap.get(edge.target);

  let finalType = baseType;
  let finalSourceHandle = edge.sourceHandle;
  let finalTargetHandle = edge.targetHandle;
  let computedPath: Array<{ x: number; y: number }> = [];

  if (srcNode && tgtNode) {
    const routingConfig = {
      mode: 'advanced-smart' as const,
      globalPath: (cfgEdge.pathType || 'step') as string,
      autoPathSelection: true,
      layoutDirection,
      directionalHandlePolicy: 'force' as const,
      angleToleranceDeg: Number(cfgEdge.angleToleranceDeg ?? 36),
      routedPaths: existingPaths,
      preAssignedPorts: globalPorts,
    };

    const choice = decideEdgeRouting(srcNode, tgtNode, nodes, routingConfig);
    finalType = choice.type;
    finalSourceHandle = choice.sourceHandle;
    finalTargetHandle = choice.targetHandle;
    computedPath = choice.computedPath || [];

    if (computedPath.length < 2) {
      const sPos = (srcNode as any).positionAbsolute ?? (srcNode as any).position ?? { x: 0, y: 0 };
      const tPos = (tgtNode as any).positionAbsolute ?? (tgtNode as any).position ?? { x: 0, y: 0 };
      const sW = (srcNode as any)?.measured?.width ?? 100;
      const sH = (srcNode as any)?.measured?.height ?? 50;
      const tW = (tgtNode as any)?.measured?.width ?? 100;
      const tH = (tgtNode as any)?.measured?.height ?? 50;

      if (!finalSourceHandle) {
        const dx = tPos.x - sPos.x;
        const dy = tPos.y - sPos.y;
        finalSourceHandle = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
      }
      if (!finalTargetHandle) {
        const dx = sPos.x - tPos.x;
        const dy = sPos.y - tPos.y;
        finalTargetHandle = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
      }

      computedPath = [
        handleToAnchor(sPos, sW, sH, finalSourceHandle, srcNode.type),
        handleToAnchor(tPos, tW, tH, finalTargetHandle, tgtNode.type),
      ];
    }
  }

  return {
    edge: {
      ...edge,
      type: finalType,
      sourceHandle: finalSourceHandle,
      targetHandle: finalTargetHandle,
      data: { ...newData, computedPath },
    },
    computedPath,
  };
}

export interface EdgeRoutingOptions {
  /** 布局方向：'TB' | 'LR' */
  layoutDirection: 'TB' | 'LR';
}

/**
 * 执行完整的边路由管线
 *
 * 包含以下阶段：
 * 1. 设置 positionAbsolute
 * 2. 全局端口分配
 * 3. 边排序（短边先处理）
 * 4. 两轮路由优化
 * 5. P2-P8 后处理管线
 * 6. ELK 边路由集成（可选）
 *
 * @returns 路由后的边数组
 */
export async function runEdgeRoutingPipeline(
  nodes: ReactFlowNode[],
  edges: Edge[],
  options: EdgeRoutingOptions,
): Promise<Edge[]> {
  const { layoutDirection } = options;
  const cfgEdge = (diagramConfigManager.getConfig() as any)?.edge || {};
  const nodeMap = new Map<string, ReactFlowNode>(nodes.map(n => [n.id, n] as const));

  // 1. 设置 positionAbsolute
  setAbsolutePositions(nodes);

  // 2. 全局端口分配
  const routedPaths: Array<{ points: Array<{ x: number; y: number }> }> = [];
  const globalPorts = assignGlobalPorts(nodes, edges, { ...cfgEdge, layoutDirection });

  // 3. 边排序：短边先处理，长边后处理
  const edgesWithDistance = edges.map((edge, originalIndex) => {
    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);
    let distance = 0;
    if (srcNode && tgtNode) {
      const srcPos = (srcNode as any).positionAbsolute ?? (srcNode as any).position ?? { x: 0, y: 0 };
      const tgtPos = (tgtNode as any).positionAbsolute ?? (tgtNode as any).position ?? { x: 0, y: 0 };
      const sW = (srcNode as any)?.measured?.width ?? 100;
      const sH = (srcNode as any)?.measured?.height ?? 50;
      const tW = (tgtNode as any)?.measured?.width ?? 100;
      const tH = (tgtNode as any)?.measured?.height ?? 50;
      const srcCx = srcPos.x + sW / 2;
      const srcCy = srcPos.y + sH / 2;
      const tgtCx = tgtPos.x + tW / 2;
      const tgtCy = tgtPos.y + tH / 2;
      distance = Math.sqrt((tgtCx - srcCx) ** 2 + (tgtCy - srcCy) ** 2);
    }
    return { edge, originalIndex, distance };
  });

  edgesWithDistance.sort((a, b) => a.distance - b.distance);

  // 4. 第一轮路由
  const sortedResults: Array<{ result: any; originalIndex: number }> = [];
  for (const item of edgesWithDistance) {
    const result = processEdge(item.edge, routedPaths, nodeMap, nodes, cfgEdge, layoutDirection, globalPorts);
    routedPaths.push({ points: result.computedPath });
    sortedResults.push({ result, originalIndex: item.originalIndex });
  }

  const firstPassResults = new Array(edges.length);
  for (const item of sortedResults) {
    firstPassResults[item.originalIndex] = item.result;
  }

  // 5. 第二轮：重新优化长边（前5条最长的边）
  const longEdgeIndices = edgesWithDistance
    .slice(-Math.min(5, Math.ceil(edges.length / 4)))
    .map(item => item.originalIndex);

  for (const idx of longEdgeIndices) {
    const otherPaths = routedPaths.filter((_, i) => i !== idx);
    const result = processEdge(edges[idx], otherPaths, nodeMap, nodes, cfgEdge, layoutDirection, globalPorts);
    firstPassResults[idx] = result;
    const sortedIdx = edgesWithDistance.findIndex(item => item.originalIndex === idx);
    if (sortedIdx >= 0) {
      routedPaths[sortedIdx] = { points: result.computedPath };
    }
  }

  let finalEdges = firstPassResults.map((r: any) => r.edge);

  // P2: 全局路由优化（可选）
  const enableGlobalOptimization = cfgEdge?.globalOptimization ?? false;
  if (enableGlobalOptimization && finalEdges.length > 1) {
    finalEdges = globalOptimizeEdgeRouting(
      finalEdges, nodes,
      { mode: 'advanced-smart', layoutDirection, directionalHandlePolicy: 'force', topK: 4, preAssignedPorts: globalPorts },
      3,
    );
  }

  // P3: 并行边分离
  finalEdges = separateParallelEdges(finalEdges, 12);

  // P4: 动态多端口分布
  finalEdges = distributePortConnections(finalEdges, nodes, 16);

  // P5: 高级边捆绑
  const bundlingEnabled = cfgEdge?.bundling ?? true;
  finalEdges = bundleEdges(finalEdges, nodes, {
    enabled: bundlingEnabled,
    layoutDirection,
    regionSize: 200,
    minBundleSize: 2,
    bundleSpacing: 8,
  });

  // P6: 分层边路由（长边控制点）
  finalEdges = layerBasedEdgeRouting(finalEdges, nodes, {
    enabled: true,
    layerThreshold: 400,
    layoutDirection,
  });

  // P7: 正交边美化
  finalEdges = beautifyOrthogonalEdges(finalEdges, nodes, {
    enabled: true,
    minSegmentLength: 20,
  });

  // P8: 树状总线路由
  finalEdges = optimizeTreeBusRouting(finalEdges, nodes, {
    enabled: true,
    minBusSize: 1,
    layoutDirection,
  });

  // P9: 边标签智能避让
  finalEdges = optimizeEdgeLabelPositions(finalEdges, nodes, {
    enabled: true,
    labelPadding: 8,
  });

  // P10: ELK 边路由（可选）
  const globalElkEnabled = cfgEdge?.useElkRouting ?? false;
  const useElkRouting = globalElkEnabled;

  if (useElkRouting && finalEdges.length > 0) {
    try {
      const elkPaths = await routeEdgesWithELK(nodes, finalEdges, {
        direction: layoutDirection,
        edgeNodeSpacing: 25,
        edgeEdgeSpacing: 20,
      });

      if (elkPaths.size > 0) {
        finalEdges = finalEdges.map((edge: any) => {
          const path = elkPaths.get(edge.id || `${edge.source}->${edge.target}`);
          if (path && path.length >= 2) {
            return {
              ...edge,
              data: { ...edge.data, elkPath: path, useElkRouting: true },
            };
          }
          return edge;
        });
      }
    } catch (err) {
      console.warn('[ELK Edge Router] Failed, falling back to default routing:', err);
    }
  }

  return finalEdges;
}
