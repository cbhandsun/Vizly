import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Axis = 'h' | 'v';

type Segment = {
  a: Point;
  b: Point;
  axis: Axis;
};

type PathSegmentRef = Segment & {
  edgeId: string;
  edgeIndex: number;
  segIdx: number;
  pointCount: number;
  fromStart: number;
  fromEnd: number;
};

type DetachedOverlapHit = {
  a: PathSegmentRef;
  b: PathSegmentRef;
  overlap: number;
};

const EPS = 0.5;
const ENDPOINT_TRUNK_WINDOW = 160;

const num = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

function getEdgePath(edge: Edge): Point[] {
  const raw = (edge.data as any)?.computedPath || (edge.data as any)?.elkPath || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((point: any) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function withComputedPath(edge: Edge, path: Point[]): Edge {
  const data: any = { ...(edge.data || {}), computedPath: path, detachedOverlapSeparated: true };
  if (data.treeRouting && Array.isArray(data.treeRouting.points)) {
    data.treeRouting = { ...data.treeRouting, points: path };
  }
  return { ...edge, data };
}

function axisOf(a: Point, b: Point): Axis | null {
  if (Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
}

function pointNear(a: Point, b: Point, tolerance = 1): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

function compactPath(points: Point[]): Point[] {
  const deduped: Point[] = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.abs(previous.x - point.x) > EPS || Math.abs(previous.y - point.y) > EPS) {
      deduped.push({ x: Math.round(point.x), y: Math.round(point.y) });
    }
  }
  if (deduped.length <= 2) return deduped;
  const result: Point[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    const sameX = Math.abs(previous.x - current.x) <= EPS && Math.abs(current.x - next.x) <= EPS;
    const sameY = Math.abs(previous.y - current.y) <= EPS && Math.abs(current.y - next.y) <= EPS;
    if (!sameX && !sameY) result.push(current);
  }
  result.push(deduped[deduped.length - 1]);
  return result;
}

function pathEquals(first: Point[], second: Point[]): boolean {
  return first.length === second.length
    && first.every((point, index) => (
      Math.abs(point.x - second[index]?.x) <= EPS && Math.abs(point.y - second[index]?.y) <= EPS
    ));
}

function rangeOverlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2))
    - Math.max(Math.min(a1, a2), Math.min(b1, b2)));
}

function segmentOverlap(first: Segment, second: Segment): number {
  if (first.axis !== second.axis) return 0;
  if (first.axis === 'h') {
    if (Math.abs(first.a.y - second.a.y) > 1) return 0;
    return rangeOverlap(first.a.x, first.b.x, second.a.x, second.b.x);
  }
  if (Math.abs(first.a.x - second.a.x) > 1) return 0;
  return rangeOverlap(first.a.y, first.b.y, second.a.y, second.b.y);
}

function strictCross(first: Segment, second: Segment): boolean {
  if (first.axis === second.axis) return false;
  const h = first.axis === 'h' ? first : second;
  const v = first.axis === 'v' ? first : second;
  const x = v.a.x;
  const y = h.a.y;
  return x > Math.min(h.a.x, h.b.x) + 1
    && x < Math.max(h.a.x, h.b.x) - 1
    && y > Math.min(v.a.y, v.b.y) + 1
    && y < Math.max(v.a.y, v.b.y) - 1;
}

function nodeRect(node: ReactFlowNode): Rect | null {
  const pos = (node as any).positionAbsolute ?? node.position ?? { x: 0, y: 0 };
  const width = num((node as any).measured?.width ?? node.width ?? (node.style as any)?.width, 0);
  const height = num((node as any).measured?.height ?? node.height ?? (node.style as any)?.height, 0);
  if (width <= 1 || height <= 1) return null;
  return { x: num((pos as any).x, 0), y: num((pos as any).y, 0), width, height };
}

function getRoutingObstacles(nodes: ReactFlowNode[]): Map<string, Rect> {
  const ignoredTypes = new Set(['titleGroup', 'subGroup', 'group', 'domain']);
  const obstacles = new Map<string, Rect>();
  for (const node of nodes) {
    if (ignoredTypes.has(String(node.type || ''))) continue;
    const rect = nodeRect(node);
    if (rect) obstacles.set(node.id, rect);
  }
  return obstacles;
}

function segmentIntersectsRect(segment: Segment, rect: Rect, padding = 12): boolean {
  const x1 = rect.x - padding;
  const y1 = rect.y - padding;
  const x2 = rect.x + rect.width + padding;
  const y2 = rect.y + rect.height + padding;
  if (segment.axis === 'h') {
    const y = segment.a.y;
    if (y < y1 || y > y2) return false;
    return Math.max(Math.min(segment.a.x, segment.b.x), x1) < Math.min(Math.max(segment.a.x, segment.b.x), x2);
  }
  const x = segment.a.x;
  if (x < x1 || x > x2) return false;
  return Math.max(Math.min(segment.a.y, segment.b.y), y1) < Math.min(Math.max(segment.a.y, segment.b.y), y2);
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.abs(points[index + 1].x - points[index].x) + Math.abs(points[index + 1].y - points[index].y);
  }
  return total;
}

function extractPathSegmentRefs(paths: Point[][], edges: Edge[]): PathSegmentRef[] {
  const refs: PathSegmentRef[] = [];
  paths.forEach((path, edgeIndex) => {
    const segmentLengths: number[] = [];
    let totalLength = 0;
    for (let segIdx = 0; segIdx < path.length - 1; segIdx += 1) {
      const length = Math.abs(path[segIdx].x - path[segIdx + 1].x) + Math.abs(path[segIdx].y - path[segIdx + 1].y);
      segmentLengths.push(length);
      totalLength += length;
    }

    let fromStart = 0;
    for (let segIdx = 0; segIdx < path.length - 1; segIdx += 1) {
      const a = path[segIdx];
      const b = path[segIdx + 1];
      const axis = axisOf(a, b);
      const segmentLength = segmentLengths[segIdx] ?? 0;
      if (axis && segmentLength >= 8) {
        refs.push({
          edgeId: edges[edgeIndex]?.id || `edge-${edgeIndex}`,
          edgeIndex,
          segIdx,
          pointCount: path.length,
          a,
          b,
          axis,
          fromStart,
          fromEnd: Math.max(0, totalLength - fromStart - segmentLength),
        });
      }
      fromStart += segmentLength;
    }
  });
  return refs;
}

function isEndpointSharedTrunkOverlap(first: PathSegmentRef, second: PathSegmentRef, edges: Edge[]): boolean {
  const firstEdge = edges[first.edgeIndex];
  const secondEdge = edges[second.edgeIndex];
  if (!firstEdge || !secondEdge) return false;
  if (
    firstEdge.source === secondEdge.source
    && first.fromStart <= ENDPOINT_TRUNK_WINDOW
    && second.fromStart <= ENDPOINT_TRUNK_WINDOW
  ) {
    return true;
  }
  return firstEdge.target === secondEdge.target
    && first.fromEnd <= ENDPOINT_TRUNK_WINDOW
    && second.fromEnd <= ENDPOINT_TRUNK_WINDOW;
}

function findDetachedParallelOverlaps(paths: Point[][], edges: Edge[], minOverlap = 96): DetachedOverlapHit[] {
  const segments = extractPathSegmentRefs(paths, edges);
  const hits: DetachedOverlapHit[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const first = segments[i];
      const second = segments[j];
      if (first.edgeIndex === second.edgeIndex || first.axis !== second.axis) continue;
      if (isEndpointSharedTrunkOverlap(first, second, edges)) continue;
      const overlap = segmentOverlap(first, second);
      if (overlap >= minOverlap) hits.push({ a: first, b: second, overlap });
    }
  }
  return hits.sort((a, b) => b.overlap - a.overlap);
}

function shiftInternalSegment(path: Point[], segment: PathSegmentRef, delta: number): Point[] | null {
  if (segment.segIdx <= 0 || segment.segIdx >= path.length - 2) return null;
  const shifted = path.map(point => ({ ...point }));
  if (segment.axis === 'v') {
    shifted[segment.segIdx].x += delta;
    shifted[segment.segIdx + 1].x += delta;
  } else {
    shifted[segment.segIdx].y += delta;
    shifted[segment.segIdx + 1].y += delta;
  }
  const compacted = compactPath(shifted);
  if (!pointNear(compacted[0], path[0], 1)) return null;
  if (!pointNear(compacted[compacted.length - 1], path[path.length - 1], 1)) return null;
  return compacted;
}

function scoreDetachedOverlapState(paths: Point[][], edges: Edge[], nodes: ReactFlowNode[]): number {
  const segments = extractPathSegmentRefs(paths, edges);
  const obstacles = getRoutingObstacles(nodes);
  let score = 0;

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (segments[i].edgeIndex === segments[j].edgeIndex) continue;
      if (strictCross(segments[i], segments[j])) score += 4500;
      const overlap = segmentOverlap(segments[i], segments[j]);
      if (!isEndpointSharedTrunkOverlap(segments[i], segments[j], edges) && overlap > 24) score += overlap * 36;
    }
  }

  for (const segment of segments) {
    const edge = edges[segment.edgeIndex];
    for (const [nodeId, rect] of obstacles) {
      if (nodeId === edge?.source || nodeId === edge?.target) continue;
      if (segmentIntersectsRect(segment, rect, 12)) score += 50000;
    }
  }

  return score + paths.reduce((sum, path) => sum + pathLength(path) * 0.01, 0);
}

export function separateDetachedParallelOverlaps(edges: Edge[], nodes: ReactFlowNode[], minOverlap = 96): Edge[] {
  let paths = edges.map(edge => compactPath(getEdgePath(edge)));
  if (paths.filter(path => path.length >= 2).length < 2) return edges;

  let changed = false;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const hits = findDetachedParallelOverlaps(paths, edges, minOverlap);
    if (hits.length === 0) break;

    const currentScore = scoreDetachedOverlapState(paths, edges, nodes);
    let bestScore = currentScore;
    let bestPaths: Point[][] | null = null;
    const deltas = [-64, -48, -32, 32, 48, 64];

    for (const hit of hits.slice(0, 8)) {
      for (const segment of [hit.a, hit.b]) {
        for (const delta of deltas) {
          const candidatePath = shiftInternalSegment(paths[segment.edgeIndex], segment, delta);
          if (!candidatePath) continue;
          const candidatePaths = paths.map((path, index) => (index === segment.edgeIndex ? candidatePath : path));
          const candidateScore = scoreDetachedOverlapState(candidatePaths, edges, nodes);
          if (candidateScore < bestScore - 25) {
            bestScore = candidateScore;
            bestPaths = candidatePaths;
          }
        }
      }
    }

    if (!bestPaths) break;
    paths = bestPaths;
    changed = true;
  }

  if (!changed) return edges;
  return edges.map((edge, index) => {
    const path = paths[index];
    const original = compactPath(getEdgePath(edge));
    return path.length < 2 || pathEquals(path, original) ? edge : withComputedPath(edge, path);
  });
}
