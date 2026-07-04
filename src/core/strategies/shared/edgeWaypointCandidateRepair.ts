import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import type { BuddyGroup } from '../../algorithms/globalChannelRouting';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Segment = { a: Point; b: Point };

const EPS = 0.5;
const FLEXIBLE_SHARED_TRUNK_MIN = 24;

const num = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

function axisOf(a: Point, b: Point): 'h' | 'v' | null {
  if (Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
}

function pointNear(p: Point, q: Point, tolerance = 2): boolean {
  return Math.abs(p.x - q.x) <= tolerance && Math.abs(p.y - q.y) <= tolerance;
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

function toSegments(points: Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (Math.abs(a.x - b.x) > EPS || Math.abs(a.y - b.y) > EPS) segments.push({ a, b });
  }
  return segments;
}

function nodeRect(node: ReactFlowNode): Rect | null {
  const pos = (node as any).positionAbsolute ?? node.position ?? { x: 0, y: 0 };
  const width = num((node as any).measured?.width ?? node.width ?? (node.style as any)?.width, 0);
  const height = num((node as any).measured?.height ?? node.height ?? (node.style as any)?.height, 0);
  if (width <= 1 || height <= 1) return null;
  return { x: num((pos as any).x, 0), y: num((pos as any).y, 0), width, height };
}

function isContainerNode(node: ReactFlowNode): boolean {
  return new Set(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane'])
    .has(String(node.type ?? ''));
}

function segmentIntersectsRect(segment: Segment, rect: Rect, padding = 10): boolean {
  const x1 = rect.x - padding;
  const y1 = rect.y - padding;
  const x2 = rect.x + rect.width + padding;
  const y2 = rect.y + rect.height + padding;
  if (Math.abs(segment.a.y - segment.b.y) < EPS) {
    const y = segment.a.y;
    if (y < y1 || y > y2) return false;
    return Math.max(Math.min(segment.a.x, segment.b.x), x1) < Math.min(Math.max(segment.a.x, segment.b.x), x2);
  }
  if (Math.abs(segment.a.x - segment.b.x) < EPS) {
    const x = segment.a.x;
    if (x < x1 || x > x2) return false;
    return Math.max(Math.min(segment.a.y, segment.b.y), y1) < Math.min(Math.max(segment.a.y, segment.b.y), y2);
  }
  return false;
}

function distancePointToSegment(point: Point, segment: Segment): number {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / lenSq));
  return Math.hypot(point.x - (segment.a.x + dx * t), point.y - (segment.a.y + dy * t));
}

function segmentToRectDistance(segment: Segment, rect: Rect): number {
  if (segmentIntersectsRect(segment, rect, 0)) return 0;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  return Math.min(...corners.map(corner => distancePointToSegment(corner, segment)));
}

function businessRects(nodes: ReactFlowNode[]): Array<{ id: string; rect: Rect }> {
  return nodes.flatMap(node => {
    if (isContainerNode(node)) return [];
    const rect = nodeRect(node);
    return rect ? [{ id: node.id, rect }] : [];
  });
}

function addLaneValue(values: Set<number>, value: number): void {
  if (Number.isFinite(value)) values.add(Math.round(value));
}

function rectIntersectsExpandedBounds(rect: Rect, bounds: Rect, padding: number): boolean {
  return rect.x + rect.width >= bounds.x - padding
    && rect.x <= bounds.x + bounds.width + padding
    && rect.y + rect.height >= bounds.y - padding
    && rect.y <= bounds.y + bounds.height + padding;
}

function pathBounds(points: Point[]): Rect {
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function buildNodeAwareWaypointLanes(base: Point[], nodes: ReactFlowNode[] | undefined, edge: Edge | undefined): { x: number[]; y: number[] } {
  if (!nodes || nodes.length === 0) return { x: [], y: [] };
  const candidates = businessRects(nodes).filter(node => node.id !== edge?.source && node.id !== edge?.target);
  if (candidates.length === 0) return { x: [], y: [] };

  const bounds = pathBounds(base);
  const relevant = candidates.filter(node => rectIntersectsExpandedBounds(node.rect, bounds, 320));
  const laneRects = relevant.length > 0 ? relevant : candidates;
  const x = new Set<number>();
  const y = new Set<number>();
  for (const { rect } of laneRects) {
    for (const clearance of [36, 64, 96]) {
      addLaneValue(x, rect.x - clearance);
      addLaneValue(x, rect.x + rect.width + clearance);
      addLaneValue(y, rect.y - clearance);
      addLaneValue(y, rect.y + rect.height + clearance);
    }
  }
  const minX = Math.min(...laneRects.map(({ rect }) => rect.x));
  const maxX = Math.max(...laneRects.map(({ rect }) => rect.x + rect.width));
  const minY = Math.min(...laneRects.map(({ rect }) => rect.y));
  const maxY = Math.max(...laneRects.map(({ rect }) => rect.y + rect.height));
  for (const clearance of [72, 120]) {
    addLaneValue(x, minX - clearance);
    addLaneValue(x, maxX + clearance);
    addLaneValue(y, minY - clearance);
    addLaneValue(y, maxY + clearance);
  }
  return {
    x: [...x].sort((a, b) => Math.abs(a - bounds.x) - Math.abs(b - bounds.x)),
    y: [...y].sort((a, b) => Math.abs(a - bounds.y) - Math.abs(b - bounds.y)),
  };
}

function endpointStubPoint(anchor: Point, adjacent: Point | undefined, length: number): Point | null {
  if (!adjacent) return null;
  const axis = axisOf(anchor, adjacent);
  if (!axis) return null;
  if (axis === 'h') {
    const direction = Math.sign(adjacent.x - anchor.x);
    return direction === 0 ? null : { x: anchor.x + direction * length, y: anchor.y };
  }
  const direction = Math.sign(adjacent.y - anchor.y);
  return direction === 0 ? null : { x: anchor.x, y: anchor.y + direction * length };
}

export function pathHasNodeRoutingRisk(path: Point[], nodes: ReactFlowNode[] | undefined, edge: Edge | undefined): boolean {
  if (!nodes || nodes.length === 0 || !edge) return false;
  for (const segment of toSegments(path)) {
    for (const node of businessRects(nodes)) {
      if (node.id === edge.source || node.id === edge.target) continue;
      if (segmentIntersectsRect(segment, node.rect, 12) || segmentToRectDistance(segment, node.rect) < 16) return true;
    }
  }
  return false;
}

export function countUnrelatedObstacleHits(path: Point[], edge: Edge, obstacles: Map<string, Rect>): number {
  let hits = 0;
  for (const [nodeId, rect] of obstacles) {
    if (nodeId === edge.source || nodeId === edge.target) continue;
    for (const segment of toSegments(path)) {
      if (segmentIntersectsRect(segment, rect, 12)) hits += 1;
    }
  }
  return hits;
}

export function generateWaypointCandidates(basePath: Point[], layoutDirection: string, nodes?: ReactFlowNode[], edge?: Edge): Point[][] {
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
  if (pathHasNodeRoutingRisk(base, nodes, edge)) {
    const nodeAwareLanes = buildNodeAwareWaypointLanes(base, nodes, edge);
    for (const x of nodeAwareLanes.x) xLanes.add(x);
    for (const y of nodeAwareLanes.y) yLanes.add(y);
  }

  candidates.push(compactPath([start, { x: start.x, y: end.y }, end]));
  candidates.push(compactPath([start, { x: end.x, y: start.y }, end]));
  if (base.length >= 4) {
    const sourceExit = base[1];
    const targetEntry = base[base.length - 2];
    for (const y of yLanes) {
      if (Math.abs(y - sourceExit.y) >= 8 && Math.abs(y - targetEntry.y) >= 8) {
        candidates.push(compactPath([start, sourceExit, { x: sourceExit.x, y }, { x: targetEntry.x, y }, targetEntry, end]));
      }
    }
    for (const x of xLanes) {
      if (Math.abs(x - sourceExit.x) >= 8 && Math.abs(x - targetEntry.x) >= 8) {
        candidates.push(compactPath([start, sourceExit, { x, y: sourceExit.y }, { x, y: targetEntry.y }, targetEntry, end]));
      }
    }
  }
  for (const x of xLanes) {
    if (Math.abs(x - start.x) >= 8 && Math.abs(x - end.x) >= 8) candidates.push(compactPath([start, { x, y: start.y }, { x, y: end.y }, end]));
  }
  for (const y of yLanes) {
    if (Math.abs(y - start.y) >= 8 && Math.abs(y - end.y) >= 8) candidates.push(compactPath([start, { x: start.x, y }, { x: end.x, y }, end]));
  }
  for (let i = 1; i < base.length - 2; i += 1) {
    const a = base[i];
    const b = base[i + 1];
    const vertical = Math.abs(a.x - b.x) < EPS;
    const horizontal = Math.abs(a.y - b.y) < EPS;
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

  const sourceStub = endpointStubPoint(start, base[1], Math.max(FLEXIBLE_SHARED_TRUNK_MIN, 48));
  const targetStub = endpointStubPoint(end, base[base.length - 2], Math.max(FLEXIBLE_SHARED_TRUNK_MIN, 48));
  if (sourceStub && targetStub) {
    for (const x of xLanes) {
      if (Math.abs(x - sourceStub.x) >= 8 && Math.abs(x - targetStub.x) >= 8) {
        candidates.push(compactPath([start, sourceStub, { x, y: sourceStub.y }, { x, y: targetStub.y }, targetStub, end]));
      }
    }
    for (const y of yLanes) {
      if (Math.abs(y - sourceStub.y) >= 8 && Math.abs(y - targetStub.y) >= 8) {
        candidates.push(compactPath([start, sourceStub, { x: sourceStub.x, y }, { x: targetStub.x, y }, targetStub, end]));
      }
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
    .sort((a, b) => (isHorizontalLayout
      ? Math.abs((a[1]?.y ?? start.y) - start.y) - Math.abs((b[1]?.y ?? start.y) - start.y)
      : Math.abs((a[1]?.x ?? start.x) - start.x) - Math.abs((b[1]?.x ?? start.x) - start.x)))
    .slice(0, 140);
}

function edgeHasBuddyType(edgeId: string, groups: BuddyGroup[], type: BuddyGroup['type']): boolean {
  return groups.some(group => group.type === type && group.edgeIds.has(edgeId));
}

function preservesEndpointTrunk(anchor: Point, originalJoin: Point, candidateJoin: Point, allowShorter: boolean): boolean {
  const originalAxis = axisOf(anchor, originalJoin);
  const candidateAxis = axisOf(anchor, candidateJoin);
  if (!originalAxis || originalAxis !== candidateAxis) return false;
  const originalDelta = originalAxis === 'h' ? originalJoin.x - anchor.x : originalJoin.y - anchor.y;
  const candidateDelta = originalAxis === 'h' ? candidateJoin.x - anchor.x : candidateJoin.y - anchor.y;
  if (Math.sign(originalDelta) !== Math.sign(candidateDelta)) return false;
  const minLength = allowShorter ? FLEXIBLE_SHARED_TRUNK_MIN : Math.abs(originalDelta);
  return Math.abs(candidateDelta) + 1 >= minLength;
}

function endpointTrunkHitsUnrelatedObstacle(anchor: Point, join: Point, edge: Edge, obstacles: Map<string, Rect>): boolean {
  const axis = axisOf(anchor, join);
  if (!axis) return false;
  const segment = { a: anchor, b: join };
  for (const [nodeId, rect] of obstacles) {
    if (nodeId !== edge.source && nodeId !== edge.target && segmentIntersectsRect(segment, rect, 12)) return true;
  }
  return false;
}

export function preservesSharedTrunk(
  candidate: Point[],
  original: Point[],
  edge: Edge,
  groups: BuddyGroup[],
  obstacles: Map<string, Rect>,
): boolean {
  if (original.length < 3 || candidate.length < 3) return true;
  const hasSourceFanOut = edgeHasBuddyType(edge.id, groups, 'o2m');
  const hasTargetFanIn = edgeHasBuddyType(edge.id, groups, 'm2o');
  const allowShortBridgeStub = hasSourceFanOut && hasTargetFanIn;

  if (hasSourceFanOut) {
    if (!pointNear(candidate[0], original[0], 1)) return false;
    const allowShortSourceStub = allowShortBridgeStub || endpointTrunkHitsUnrelatedObstacle(original[0], original[1], edge, obstacles);
    if (!preservesEndpointTrunk(original[0], original[1], candidate[1], allowShortSourceStub)) return false;
  }
  if (hasTargetFanIn) {
    const originalEnd = original[original.length - 1];
    const candidateEnd = candidate[candidate.length - 1];
    if (!pointNear(candidateEnd, originalEnd, 1)) return false;
    const originalJoin = original[original.length - 2];
    const candidateJoin = candidate[candidate.length - 2];
    const allowShortTargetStub = allowShortBridgeStub || endpointTrunkHitsUnrelatedObstacle(originalEnd, originalJoin, edge, obstacles);
    if (!preservesEndpointTrunk(originalEnd, originalJoin, candidateJoin, allowShortTargetStub)) return false;
  }
  return true;
}
