import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Side = 'top' | 'bottom' | 'left' | 'right';
type Segment = { a: Point; b: Point };

const EPS = 0.5;
const MIN_ENDPOINT_STUB = 48;
const OBSTACLE_PADDING = 4;

const num = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

function getEdgePath(edge: Edge): Point[] {
  const raw = (edge.data as any)?.computedPath || (edge.data as any)?.treeRouting?.points || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((point: any) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function axisOf(a: Point, b: Point): 'h' | 'v' | null {
  if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
}

function compactPath(path: Point[]): Point[] {
  const deduped: Point[] = [];
  for (const point of path) {
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

function pathLength(path: Point[]): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    total += Math.abs(path[index].x - path[index + 1].x) + Math.abs(path[index].y - path[index + 1].y);
  }
  return total;
}

function getNodeRect(node: ReactFlowNode): Rect | null {
  const position = (node as any).positionAbsolute ?? node.position ?? { x: 0, y: 0 };
  const width = num((node as any).measured?.width ?? node.width ?? (node.style as any)?.width, 0);
  const height = num((node as any).measured?.height ?? node.height ?? (node.style as any)?.height, 0);
  if (width <= 1 || height <= 1) return null;
  return {
    x: num((position as any).x, 0),
    y: num((position as any).y, 0),
    width,
    height,
  };
}

function getRoutingObstacles(nodes: ReactFlowNode[]): Map<string, Rect> {
  const ignoredTypes = new Set(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane']);
  const result = new Map<string, Rect>();
  for (const node of nodes) {
    if (ignoredTypes.has(String(node.type || ''))) continue;
    const rect = getNodeRect(node);
    if (rect) result.set(node.id, rect);
  }
  return result;
}

function sourceSideFromPath(path: Point[], rect: Rect): Side | null {
  if (path.length < 2) return null;
  const start = path[0];
  const next = path[1];
  if (Math.abs(start.y - rect.y) <= 2 && axisOf(start, next) === 'v' && next.y < start.y) return 'top';
  if (Math.abs(start.y - (rect.y + rect.height)) <= 2 && axisOf(start, next) === 'v' && next.y > start.y) return 'bottom';
  if (Math.abs(start.x - rect.x) <= 2 && axisOf(start, next) === 'h' && next.x < start.x) return 'left';
  if (Math.abs(start.x - (rect.x + rect.width)) <= 2 && axisOf(start, next) === 'h' && next.x > start.x) return 'right';
  return null;
}

function toSegments(path: Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    if (axisOf(path[index], path[index + 1])) segments.push({ a: path[index], b: path[index + 1] });
  }
  return segments;
}

function strictCrosses(first: Segment, second: Segment): boolean {
  const firstAxis = axisOf(first.a, first.b);
  const secondAxis = axisOf(second.a, second.b);
  if (!firstAxis || !secondAxis || firstAxis === secondAxis) return false;
  const horizontal = firstAxis === 'h' ? first : second;
  const vertical = firstAxis === 'v' ? first : second;
  const x = vertical.a.x;
  const y = horizontal.a.y;
  return x > Math.min(horizontal.a.x, horizontal.b.x) + 1
    && x < Math.max(horizontal.a.x, horizontal.b.x) - 1
    && y > Math.min(vertical.a.y, vertical.b.y) + 1
    && y < Math.max(vertical.a.y, vertical.b.y) - 1;
}

function crossingCount(path: Point[], edge: Edge, paths: Map<string, Point[]>, edgesById: Map<string, Edge>): number {
  let total = 0;
  const segments = toSegments(path);
  for (const [otherId, otherPath] of paths) {
    if (otherId === edge.id) continue;
    const other = edgesById.get(otherId);
    if (!other || other.source === edge.source || other.target === edge.target) continue;
    for (const first of segments) {
      for (const second of toSegments(otherPath)) {
        if (strictCrosses(first, second)) total += 1;
      }
    }
  }
  return total;
}

function segmentIntersectsRect(a: Point, b: Point, rect: Rect, padding = OBSTACLE_PADDING): boolean {
  const axis = axisOf(a, b);
  if (!axis) return false;
  const x1 = rect.x - padding;
  const y1 = rect.y - padding;
  const x2 = rect.x + rect.width + padding;
  const y2 = rect.y + rect.height + padding;
  if (axis === 'h') {
    const y = a.y;
    if (y < y1 || y > y2) return false;
    return Math.max(Math.min(a.x, b.x), x1) < Math.min(Math.max(a.x, b.x), x2);
  }
  const x = a.x;
  if (x < x1 || x > x2) return false;
  return Math.max(Math.min(a.y, b.y), y1) < Math.min(Math.max(a.y, b.y), y2);
}

function pathHitsObstacle(path: Point[], edge: Edge, obstacles: Map<string, Rect>): boolean {
  for (let index = 0; index < path.length - 1; index += 1) {
    for (const [nodeId, rect] of obstacles) {
      if (nodeId === edge.source || nodeId === edge.target) continue;
      if (segmentIntersectsRect(path[index], path[index + 1], rect)) return true;
    }
  }
  return false;
}

function shiftedSourcePoints(start: Point, rect: Rect, side: Side): Point[] {
  const result: Point[] = [];
  if (side === 'top' || side === 'bottom') {
    for (const fraction of [0.18, 0.28, 0.38, 0.62, 0.72, 0.82]) {
      const x = Math.round(rect.x + rect.width * fraction);
      if (Math.abs(x - start.x) > 6) result.push({ x, y: start.y });
    }
  } else {
    for (const fraction of [0.18, 0.28, 0.38, 0.62, 0.72, 0.82]) {
      const y = Math.round(rect.y + rect.height * fraction);
      if (Math.abs(y - start.y) > 6) result.push({ x: start.x, y });
    }
  }
  return result;
}

function sourceNudgeCandidates(path: Point[], sourceRect: Rect): Point[][] {
  if (path.length < 3) return [];
  const side = sourceSideFromPath(path, sourceRect);
  if (!side) return [];
  const branch = path[1];
  const tail = path.slice(2);
  return shiftedSourcePoints(path[0], sourceRect, side)
    .map(start => {
      if (side === 'top' || side === 'bottom') {
        const stub = Math.abs(branch.y - start.y);
        if (stub < MIN_ENDPOINT_STUB) return [];
        return compactPath([start, { x: start.x, y: branch.y }, { x: tail[0].x, y: branch.y }, ...tail.slice(1)]);
      }
      const stub = Math.abs(branch.x - start.x);
      if (stub < MIN_ENDPOINT_STUB) return [];
      return compactPath([start, { x: branch.x, y: start.y }, { x: branch.x, y: tail[0].y }, ...tail.slice(1)]);
    })
    .filter(candidate => candidate.length >= 2);
}

function withComputedPath(edge: Edge, path: Point[]): Edge {
  const data: any = { ...(edge.data || {}), computedPath: path, endpointLaneNudged: true };
  if (data.treeRouting && Array.isArray(data.treeRouting.points)) {
    data.treeRouting = { ...data.treeRouting, points: path };
  }
  return { ...edge, data };
}

export function repairEndpointLaneCrossings(edges: Edge[], nodes: ReactFlowNode[]): Edge[] {
  if (edges.length < 2) return edges;

  const paths = new Map<string, Point[]>();
  for (const edge of edges) {
    const path = compactPath(getEdgePath(edge));
    if (edge.id && path.length >= 2) paths.set(edge.id, path);
  }
  if (paths.size < 2) return edges;

  const nodeRects = new Map<string, Rect>();
  for (const node of nodes) {
    const rect = getNodeRect(node);
    if (rect) nodeRects.set(node.id, rect);
  }
  const obstacles = getRoutingObstacles(nodes);
  const edgesById = new Map(edges.map(edge => [edge.id, edge] as const));
  const repaired = new Map(paths);

  for (const edge of edges) {
    const path = repaired.get(edge.id);
    const sourceRect = nodeRects.get(edge.source);
    if (!path || !sourceRect) continue;

    const currentCrossings = crossingCount(path, edge, repaired, edgesById);
    if (currentCrossings <= 0) continue;

    const currentLength = pathLength(path);
    const candidates = sourceNudgeCandidates(path, sourceRect)
      .filter(candidate => !pathHitsObstacle(candidate, edge, obstacles))
      .map(candidate => ({
        path: candidate,
        crossings: crossingCount(candidate, edge, repaired, edgesById),
        score: crossingCount(candidate, edge, repaired, edgesById) * 100000
          + pathLength(candidate) * 0.05
          + Math.abs(candidate[0].x - path[0].x)
          + Math.abs(candidate[0].y - path[0].y),
      }))
      .filter(candidate => candidate.crossings < currentCrossings)
      .filter(candidate => pathLength(candidate.path) <= currentLength + 160)
      .sort((a, b) => a.score - b.score);

    if (candidates[0]) repaired.set(edge.id, candidates[0].path);
  }

  return edges.map(edge => {
    const original = paths.get(edge.id);
    const path = repaired.get(edge.id);
    if (!original || !path || pathEquals(original, path)) return edge;
    return withComputedPath(edge, path);
  });
}
