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
type Point = { x: number; y: number };
type Segment = { a: Point; b: Point };
type Rect = { x: number; y: number; width: number; height: number };

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

function getEdgePath(edge: any): Point[] {
  const raw = edge?.data?.computedPath || edge?.data?.elkPath || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => ({ x: Number(p?.x), y: Number(p?.y) }))
    .filter((p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

function compactPath(points: Point[]): Point[] {
  const deduped: Point[] = [];
  for (const p of points) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.abs(prev.x - p.x) > 0.5 || Math.abs(prev.y - p.y) > 0.5) {
      deduped.push({ x: Math.round(p.x), y: Math.round(p.y) });
    }
  }
  if (deduped.length <= 2) return deduped;
  const result: Point[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i++) {
    const prev = result[result.length - 1];
    const cur = deduped[i];
    const next = deduped[i + 1];
    const sameX = Math.abs(prev.x - cur.x) < 0.5 && Math.abs(cur.x - next.x) < 0.5;
    const sameY = Math.abs(prev.y - cur.y) < 0.5 && Math.abs(cur.y - next.y) < 0.5;
    if (!sameX && !sameY) result.push(cur);
  }
  result.push(deduped[deduped.length - 1]);
  return result;
}

function toSegments(points: Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5) {
      segments.push({ a, b });
    }
  }
  return segments;
}

function pointNear(p: Point, q: Point, tolerance = 2): boolean {
  return Math.abs(p.x - q.x) <= tolerance && Math.abs(p.y - q.y) <= tolerance;
}

function rangeOverlap(a1: number, a2: number, b1: number, b2: number): number {
  const minA = Math.min(a1, a2);
  const maxA = Math.max(a1, a2);
  const minB = Math.min(b1, b2);
  const maxB = Math.max(b1, b2);
  return Math.max(0, Math.min(maxA, maxB) - Math.max(minA, minB));
}

function segmentRelation(s1: Segment, s2: Segment): { crossings: number; overlap: number } {
  const s1H = Math.abs(s1.a.y - s1.b.y) < 0.5;
  const s1V = Math.abs(s1.a.x - s1.b.x) < 0.5;
  const s2H = Math.abs(s2.a.y - s2.b.y) < 0.5;
  const s2V = Math.abs(s2.a.x - s2.b.x) < 0.5;

  if (s1H && s2V) {
    const x = s2.a.x;
    const y = s1.a.y;
    const crosses =
      x > Math.min(s1.a.x, s1.b.x) + 1 &&
      x < Math.max(s1.a.x, s1.b.x) - 1 &&
      y > Math.min(s2.a.y, s2.b.y) + 1 &&
      y < Math.max(s2.a.y, s2.b.y) - 1;
    if (!crosses) return { crossings: 0, overlap: 0 };
    const p = { x, y };
    const endpointTouch = [s1.a, s1.b].some(a => pointNear(a, p)) || [s2.a, s2.b].some(a => pointNear(a, p));
    return { crossings: endpointTouch ? 0 : 1, overlap: 0 };
  }

  if (s1V && s2H) return segmentRelation(s2, s1);

  if (s1H && s2H && Math.abs(s1.a.y - s2.a.y) < 2) {
    return { crossings: 0, overlap: rangeOverlap(s1.a.x, s1.b.x, s2.a.x, s2.b.x) };
  }

  if (s1V && s2V && Math.abs(s1.a.x - s2.a.x) < 2) {
    return { crossings: 0, overlap: rangeOverlap(s1.a.y, s1.b.y, s2.a.y, s2.b.y) };
  }

  return { crossings: 0, overlap: 0 };
}

function segmentIntersectsRect(seg: Segment, rect: Rect, padding = 10): boolean {
  const x1 = rect.x - padding;
  const y1 = rect.y - padding;
  const x2 = rect.x + rect.width + padding;
  const y2 = rect.y + rect.height + padding;
  if (Math.abs(seg.a.y - seg.b.y) < 0.5) {
    const y = seg.a.y;
    if (y < y1 || y > y2) return false;
    return Math.max(Math.min(seg.a.x, seg.b.x), x1) < Math.min(Math.max(seg.a.x, seg.b.x), x2);
  }
  if (Math.abs(seg.a.x - seg.b.x) < 0.5) {
    const x = seg.a.x;
    if (x < x1 || x > x2) return false;
    return Math.max(Math.min(seg.a.y, seg.b.y), y1) < Math.min(Math.max(seg.a.y, seg.b.y), y2);
  }
  return false;
}

function getRoutingObstacles(nodes: ReactFlowNode[]): Map<string, Rect> {
  const result = new Map<string, Rect>();
  const ignoredTypes = new Set(['titleGroup', 'subGroup', 'group', 'domain']);
  for (const node of nodes) {
    if (ignoredTypes.has(String(node.type || ''))) continue;
    const pos = (node as any).positionAbsolute ?? node.position ?? { x: 0, y: 0 };
    const width = num((node as any).measured?.width ?? node.width ?? (node.style as any)?.width, 100);
    const height = num((node as any).measured?.height ?? node.height ?? (node.style as any)?.height, 60);
    result.set(node.id, { x: pos.x, y: pos.y, width, height });
  }
  return result;
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
  }
  return total;
}

function generateWaypointCandidates(basePath: Point[], layoutDirection: string): Point[][] {
  const base = compactPath(basePath);
  if (base.length < 2) return [base];

  const candidates: Point[][] = [base];
  const start = base[0];
  const end = base[base.length - 1];
  const offsets = [-240, -180, -120, -84, -56, -28, 28, 56, 84, 120, 180, 240];
  const isHorizontalLayout = String(layoutDirection).toUpperCase().includes('LR');
  const internal = base.slice(1, -1);

  const xLanes = new Set<number>([
    ...internal.map(p => Math.round(p.x)),
    Math.round((start.x + end.x) / 2),
    ...offsets.map(o => Math.round(start.x + o)),
    ...offsets.map(o => Math.round(end.x + o)),
  ]);
  const yLanes = new Set<number>([
    ...internal.map(p => Math.round(p.y)),
    Math.round((start.y + end.y) / 2),
    ...offsets.map(o => Math.round(start.y + o)),
    ...offsets.map(o => Math.round(end.y + o)),
  ]);

  for (const x of xLanes) {
    if (Math.abs(x - start.x) < 8 || Math.abs(x - end.x) < 8) continue;
    candidates.push(compactPath([start, { x, y: start.y }, { x, y: end.y }, end]));
  }
  for (const y of yLanes) {
    if (Math.abs(y - start.y) < 8 || Math.abs(y - end.y) < 8) continue;
    candidates.push(compactPath([start, { x: start.x, y }, { x: end.x, y }, end]));
  }

  for (let i = 1; i < base.length - 2; i++) {
    const a = base[i];
    const b = base[i + 1];
    const vertical = Math.abs(a.x - b.x) < 0.5;
    const horizontal = Math.abs(a.y - b.y) < 0.5;
    if (!vertical && !horizontal) continue;
    for (const delta of [-42, -24, 24, 42]) {
      const shifted = base.map(p => ({ ...p }));
      if (vertical) {
        shifted[i].x += delta;
        shifted[i + 1].x += delta;
      } else {
        shifted[i].y += delta;
        shifted[i + 1].y += delta;
      }
      candidates.push(compactPath(shifted));
    }
  }

  const seen = new Set<string>();
  return candidates
    .map(compactPath)
    .filter(path => {
      if (path.length < 2) return false;
      const key = path.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      if (a === base) return -1;
      if (b === base) return 1;
      return isHorizontalLayout
        ? Math.abs((a[1]?.y ?? start.y) - start.y) - Math.abs((b[1]?.y ?? start.y) - start.y)
        : Math.abs((a[1]?.x ?? start.x) - start.x) - Math.abs((b[1]?.x ?? start.x) - start.x);
    })
    .slice(0, 56);
}

function scorePathCandidate(
  path: Point[],
  acceptedPaths: Point[][],
  originalPaths: Point[][],
  edge: Edge,
  obstacles: Map<string, Rect>,
  baseLength: number
): number {
  const segments = toSegments(path);
  let crossingsAccepted = 0;
  let crossingsAll = 0;
  let overlap = 0;
  for (const otherPath of acceptedPaths) {
    for (const s1 of segments) {
      for (const s2 of toSegments(otherPath)) {
        const rel = segmentRelation(s1, s2);
        crossingsAccepted += rel.crossings;
        overlap += rel.overlap;
      }
    }
  }
  for (const otherPath of originalPaths) {
    for (const s1 of segments) {
      for (const s2 of toSegments(otherPath)) {
        const rel = segmentRelation(s1, s2);
        crossingsAll += rel.crossings;
        overlap += rel.overlap * 0.25;
      }
    }
  }

  let obstacleHits = 0;
  for (const [nodeId, rect] of obstacles) {
    if (nodeId === edge.source || nodeId === edge.target) continue;
    for (const segment of segments) {
      if (segmentIntersectsRect(segment, rect, 12)) obstacleHits++;
    }
  }

  const length = pathLength(path);
  const bends = Math.max(0, path.length - 2);
  const detour = Math.max(0, length - baseLength);
  return obstacleHits * 20000
    + crossingsAccepted * 2600
    + crossingsAll * 360
    + overlap * 12
    + bends * 10
    + length * 0.015
    + detour * 0.08;
}

function reduceEdgeCrossingsWithWaypoints(
  edges: Edge[],
  nodes: ReactFlowNode[],
  layoutDirection: string,
): Edge[] {
  if (edges.length < 2) return edges;
  const obstacles = getRoutingObstacles(nodes);
  const originalPathsById = new Map<string, Point[]>();
  for (const edge of edges) {
    const path = compactPath(getEdgePath(edge));
    if (path.length >= 2) originalPathsById.set(edge.id, path);
  }
  if (originalPathsById.size < 2) return edges;

  const edgeOrder = edges
    .map((edge, index) => ({ edge, index, path: originalPathsById.get(edge.id) }))
    .filter((entry): entry is { edge: Edge; index: number; path: Point[] } => !!entry.path)
    .sort((a, b) => pathLength(a.path) - pathLength(b.path));

  const acceptedPaths: Point[][] = [];
  const chosenPaths = new Map<string, Point[]>();

  for (const { edge, path } of edgeOrder) {
    const others = Array.from(originalPathsById.entries())
      .filter(([id]) => id !== edge.id)
      .map(([, p]) => p);
    const baseLength = pathLength(path);
    const candidates = generateWaypointCandidates(path, layoutDirection);
    let bestPath = path;
    let bestScore = scorePathCandidate(path, acceptedPaths, others, edge, obstacles, baseLength);
    for (const candidate of candidates.slice(1)) {
      const score = scorePathCandidate(candidate, acceptedPaths, others, edge, obstacles, baseLength);
      if (score < bestScore - 5) {
        bestScore = score;
        bestPath = candidate;
      }
    }
    chosenPaths.set(edge.id, bestPath);
    acceptedPaths.push(bestPath);
  }

  return edges.map(edge => {
    const path = chosenPaths.get(edge.id);
    if (!path) return edge;
    const original = originalPathsById.get(edge.id);
    const changed = !original || path.length !== original.length ||
      path.some((p, i) => Math.abs(p.x - original[i]?.x) > 0.5 || Math.abs(p.y - original[i]?.y) > 0.5);
    if (!changed) return edge;
    return {
      ...edge,
      data: {
        ...(edge.data || {}),
        computedPath: path,
        crossingOptimized: true,
      },
    };
  });
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
    obstaclePadding: 24, // [FIX] Increased from 16 for better visual clearance from adjacent nodes/groups
    pathOptions: {
      ...(edge.data?.pathOptions || {}),
      gridRatio: 1.04,
      borderRadius: 4, // [FIX] Hyper-Glass V3: unified to 4px sharp orthogonal corners
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

  // P8.5: 交叉感知拐点重排
  finalEdges = reduceEdgeCrossingsWithWaypoints(finalEdges, nodes, layoutDirection);

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
