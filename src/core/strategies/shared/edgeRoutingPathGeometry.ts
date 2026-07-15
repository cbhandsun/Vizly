import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

export type EdgeRoutingPoint = { x: number; y: number };
export type EdgeRoutingSegment = { a: EdgeRoutingPoint; b: EdgeRoutingPoint };
export type EdgeRoutingRect = { x: number; y: number; width: number; height: number };

export const finiteNumberOrFallback = (value: unknown, fallback: number): number => (
  typeof value === 'number' && isFinite(value) ? value : fallback
);

/**
 * 计算节点的绝对位置（考虑 parentId 链）。
 */
export function computeAbsolutePosition(
  node: ReactFlowNode,
  nodeMap: Map<string, ReactFlowNode>,
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
 * 为所有节点计算并设置 positionAbsolute。
 * @param nodes 所有节点（会就地修改 positionAbsolute 属性）
 */
export function setAbsolutePositions(nodes: ReactFlowNode[]): void {
  const nodeMap = new Map<string, ReactFlowNode>(nodes.map(node => [node.id, node] as const));
  for (const node of nodes) {
    const absolutePosition = computeAbsolutePosition(node, nodeMap);
    (node as any).positionAbsolute = absolutePosition;
  }
}

/** Handle 方向到锚点的映射。 */
export function handleToAnchor(
  position: any,
  width: number,
  height: number,
  handle: string | null | undefined,
  nodeType?: string,
): EdgeRoutingPoint {
  if ((!handle || handle === 'source' || handle === 'target')
    && (nodeType === 'group' || nodeType === 'subGroup' || nodeType === 'domain')) {
    return { x: position.x + width / 2, y: position.y + height / 2 };
  }
  switch (handle) {
    case 'l':
    case 'left':
      return { x: position.x, y: position.y + height / 2 };
    case 'r':
    case 'right':
      return { x: position.x + width, y: position.y + height / 2 };
    case 't':
    case 'top':
      return { x: position.x + width / 2, y: position.y };
    case 'b':
    case 'bottom':
      return { x: position.x + width / 2, y: position.y + height };
    default:
      return { x: position.x + width / 2, y: position.y + height / 2 };
  }
}

export function getEdgePath(edge: any): EdgeRoutingPoint[] {
  const raw = edge?.data?.computedPath || edge?.data?.elkPath || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((point: any) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point: EdgeRoutingPoint) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function axisOf(
  first: EdgeRoutingPoint,
  second: EdgeRoutingPoint,
): 'h' | 'v' | null {
  if (Math.abs(first.y - second.y) < 0.5 && Math.abs(first.x - second.x) > 0.5) return 'h';
  if (Math.abs(first.x - second.x) < 0.5 && Math.abs(first.y - second.y) > 0.5) return 'v';
  return null;
}

function compactCollinearPath(points: EdgeRoutingPoint[]): EdgeRoutingPoint[] {
  const deduped: EdgeRoutingPoint[] = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.abs(previous.x - point.x) > 0.5 || Math.abs(previous.y - point.y) > 0.5) {
      deduped.push({ x: Math.round(point.x), y: Math.round(point.y) });
    }
  }
  if (deduped.length <= 2) return deduped;
  const result: EdgeRoutingPoint[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index++) {
    const previous = result[result.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    const sameX = Math.abs(previous.x - current.x) < 0.5 && Math.abs(current.x - next.x) < 0.5;
    const sameY = Math.abs(previous.y - current.y) < 0.5 && Math.abs(current.y - next.y) < 0.5;
    if (!sameX && !sameY) result.push(current);
  }
  result.push(deduped[deduped.length - 1]);
  return result;
}

function chooseDiagonalBend(
  previous: EdgeRoutingPoint | undefined,
  first: EdgeRoutingPoint,
  second: EdgeRoutingPoint,
  next: EdgeRoutingPoint | undefined,
): EdgeRoutingPoint {
  const horizontalThenVertical = { x: second.x, y: first.y };
  const verticalThenHorizontal = { x: first.x, y: second.y };
  const score = (bend: EdgeRoutingPoint) => {
    const firstAxis = axisOf(first, bend);
    const lastAxis = axisOf(bend, second);
    const previousAxis = previous ? axisOf(previous, first) : null;
    const nextAxis = next ? axisOf(second, next) : null;
    const firstLength = Math.abs(first.x - bend.x) + Math.abs(first.y - bend.y);
    const lastLength = Math.abs(bend.x - second.x) + Math.abs(bend.y - second.y);
    return (previousAxis && firstAxis && previousAxis !== firstAxis ? 2 : 0)
      + (nextAxis && lastAxis && nextAxis !== lastAxis ? 2 : 0)
      + (Math.min(firstLength, lastLength) < 8 ? 3 : 0);
  };
  return score(horizontalThenVertical) <= score(verticalThenHorizontal)
    ? horizontalThenVertical
    : verticalThenHorizontal;
}

function expandDiagonalSegments(points: EdgeRoutingPoint[]): EdgeRoutingPoint[] {
  if (points.length <= 1) return points;
  const expanded: EdgeRoutingPoint[] = [points[0]];
  for (let index = 0; index < points.length - 1; index++) {
    const first = expanded[expanded.length - 1];
    const second = points[index + 1];
    if (Math.abs(first.x - second.x) < 0.5 || Math.abs(first.y - second.y) < 0.5) {
      expanded.push(second);
      continue;
    }
    const bend = chooseDiagonalBend(expanded[expanded.length - 2], first, second, points[index + 2]);
    expanded.push(bend, second);
  }
  return expanded;
}

function removeShortJogs(points: EdgeRoutingPoint[], threshold = 6): EdgeRoutingPoint[] {
  let result = points;
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 1; index < result.length - 1; index++) {
      const previous = result[index - 1];
      const current = result[index];
      const next = result[index + 1];
      const previousLength = Math.abs(previous.x - current.x) + Math.abs(previous.y - current.y);
      const nextLength = Math.abs(current.x - next.x) + Math.abs(current.y - next.y);
      if ((previousLength < threshold || nextLength < threshold) && axisOf(previous, next)) {
        result = [...result.slice(0, index), ...result.slice(index + 1)];
        changed = true;
        break;
      }
    }
  }
  return result;
}

export function compactEdgeRoutingPath(points: EdgeRoutingPoint[]): EdgeRoutingPoint[] {
  const rounded = compactCollinearPath(points);
  const orthogonal = expandDiagonalSegments(rounded);
  return compactCollinearPath(removeShortJogs(compactCollinearPath(orthogonal)));
}

export function edgeRoutingPathsEqual(
  first: EdgeRoutingPoint[],
  second: EdgeRoutingPoint[],
): boolean {
  return first.length === second.length && first.every((point, index) => (
    Math.abs(point.x - second[index]?.x) <= 0.5
    && Math.abs(point.y - second[index]?.y) <= 0.5
  ));
}

export function withComputedPath(
  edge: Edge,
  path: EdgeRoutingPoint[],
  flags: Record<string, unknown> = {},
): Edge {
  const data: any = { ...(edge.data || {}), ...flags, computedPath: path };
  if (data.treeRouting && Array.isArray(data.treeRouting.points)) {
    data.treeRouting = { ...data.treeRouting, points: path };
  }
  return { ...edge, data };
}

export function lockComputedPathsForDisplay(edges: Edge[]): Edge[] {
  return edges.map(edge => {
    const path = getEdgePath(edge);
    if (path.length < 2) return edge;
    return {
      ...edge,
      type: edge.type || 'advanced-smart-step',
      data: {
        ...(edge.data || {}),
        computedPath: path,
        layoutPathLocked: true,
        runtimeHandleLock: {
          ...((((edge.data as any)?.runtimeHandleLock) && typeof (edge.data as any).runtimeHandleLock === 'object')
            ? (edge.data as any).runtimeHandleLock
            : {}),
          source: true,
          target: true,
        },
      },
    };
  });
}

export function sanitizeComputedPaths(edges: Edge[]): Edge[] {
  return edges.map(edge => {
    const path = getEdgePath(edge);
    if (path.length < 2) return edge;
    const compacted = compactEdgeRoutingPath(path);
    if (edgeRoutingPathsEqual(path, compacted)) return edge;
    return withComputedPath(edge, compacted, { orthogonalSanitized: true });
  });
}

export function toEdgeRoutingSegments(points: EdgeRoutingPoint[]): EdgeRoutingSegment[] {
  const segments: EdgeRoutingSegment[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const first = points[index];
    const second = points[index + 1];
    if (Math.abs(first.x - second.x) > 0.5 || Math.abs(first.y - second.y) > 0.5) {
      segments.push({ a: first, b: second });
    }
  }
  return segments;
}

function pointsAreNear(
  first: EdgeRoutingPoint,
  second: EdgeRoutingPoint,
  tolerance = 2,
): boolean {
  return Math.abs(first.x - second.x) <= tolerance && Math.abs(first.y - second.y) <= tolerance;
}

export function edgeRoutingRangeOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): number {
  const firstMin = Math.min(firstStart, firstEnd);
  const firstMax = Math.max(firstStart, firstEnd);
  const secondMin = Math.min(secondStart, secondEnd);
  const secondMax = Math.max(secondStart, secondEnd);
  return Math.max(0, Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin));
}

export function edgeRoutingSegmentRelation(
  first: EdgeRoutingSegment,
  second: EdgeRoutingSegment,
): { crossings: number; overlap: number } {
  const firstHorizontal = Math.abs(first.a.y - first.b.y) < 0.5;
  const firstVertical = Math.abs(first.a.x - first.b.x) < 0.5;
  const secondHorizontal = Math.abs(second.a.y - second.b.y) < 0.5;
  const secondVertical = Math.abs(second.a.x - second.b.x) < 0.5;

  if (firstHorizontal && secondVertical) {
    const x = second.a.x;
    const y = first.a.y;
    const crosses = x > Math.min(first.a.x, first.b.x) + 1
      && x < Math.max(first.a.x, first.b.x) - 1
      && y > Math.min(second.a.y, second.b.y) + 1
      && y < Math.max(second.a.y, second.b.y) - 1;
    if (!crosses) return { crossings: 0, overlap: 0 };
    const point = { x, y };
    const endpointTouch = [first.a, first.b].some(endpoint => pointsAreNear(endpoint, point))
      || [second.a, second.b].some(endpoint => pointsAreNear(endpoint, point));
    return { crossings: endpointTouch ? 0 : 1, overlap: 0 };
  }

  if (firstVertical && secondHorizontal) return edgeRoutingSegmentRelation(second, first);

  if (firstHorizontal && secondHorizontal && Math.abs(first.a.y - second.a.y) < 2) {
    return {
      crossings: 0,
      overlap: edgeRoutingRangeOverlap(first.a.x, first.b.x, second.a.x, second.b.x),
    };
  }

  if (firstVertical && secondVertical && Math.abs(first.a.x - second.a.x) < 2) {
    return {
      crossings: 0,
      overlap: edgeRoutingRangeOverlap(first.a.y, first.b.y, second.a.y, second.b.y),
    };
  }

  return { crossings: 0, overlap: 0 };
}

export function edgeRoutingSegmentIntersectsRect(
  segment: EdgeRoutingSegment,
  rect: EdgeRoutingRect,
  padding = 10,
): boolean {
  const x1 = rect.x - padding;
  const y1 = rect.y - padding;
  const x2 = rect.x + rect.width + padding;
  const y2 = rect.y + rect.height + padding;
  if (Math.abs(segment.a.y - segment.b.y) < 0.5) {
    const y = segment.a.y;
    if (y < y1 || y > y2) return false;
    return Math.max(Math.min(segment.a.x, segment.b.x), x1)
      < Math.min(Math.max(segment.a.x, segment.b.x), x2);
  }
  if (Math.abs(segment.a.x - segment.b.x) < 0.5) {
    const x = segment.a.x;
    if (x < x1 || x > x2) return false;
    return Math.max(Math.min(segment.a.y, segment.b.y), y1)
      < Math.min(Math.max(segment.a.y, segment.b.y), y2);
  }
  return false;
}

export function getRoutingObstacles(nodes: ReactFlowNode[]): Map<string, EdgeRoutingRect> {
  const result = new Map<string, EdgeRoutingRect>();
  const ignoredTypes = new Set(['titleGroup', 'subGroup', 'group', 'domain']);
  for (const node of nodes) {
    if (ignoredTypes.has(String(node.type || ''))) continue;
    const position = (node as any).positionAbsolute ?? node.position ?? { x: 0, y: 0 };
    const width = finiteNumberOrFallback(
      (node as any).measured?.width ?? node.width ?? (node.style as any)?.width,
      100,
    );
    const height = finiteNumberOrFallback(
      (node as any).measured?.height ?? node.height ?? (node.style as any)?.height,
      60,
    );
    result.set(node.id, { x: position.x, y: position.y, width, height });
  }
  return result;
}
