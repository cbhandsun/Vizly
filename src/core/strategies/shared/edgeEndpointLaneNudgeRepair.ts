import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  createEndpointLaneInteractionContext,
  endpointLaneAxisOf as axisOf,
  endpointLaneParallelOverlapLength as parallelOverlapLength,
  endpointLaneSegmentDirection as segmentDirection,
  endpointLaneStrictCrosses as strictCrosses,
  endpointLaneToSegments as toSegments,
  shouldConsiderEndpointLaneStrictCrossing as shouldConsiderStrictCrossing,
  type EndpointLanePoint as Point,
  type EndpointLaneSegment as Segment,
} from './edgeEndpointLaneInteractionContext';

type Rect = { x: number; y: number; width: number; height: number };
type Side = 'top' | 'bottom' | 'left' | 'right';
type PositionedNode = ReactFlowNode & { positionAbsolute?: Point };

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const EPS = 0.5;
const MIN_ENDPOINT_STUB = 48;
const OBSTACLE_PADDING = 4;
const SIDE_EDGE_INSET = 16;
const OUTER_BYPASS_EDGE_CLEARANCE = 24;

export type EndpointLaneRepairMetrics = Readonly<{
  candidateCount: number;
  evaluationCount: number;
  scannedSegmentCount: number;
}>;

export type EndpointLaneRepairOptions = Readonly<{
  onMetrics?: (metrics: EndpointLaneRepairMetrics) => void;
}>;

const num = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

function getEdgePath(edge: Edge): Point[] {
  const treeRouting = asRecord(edge.data?.treeRouting);
  const raw = edge.data?.computedPath || treeRouting.points || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(point => {
      const candidate = asRecord(point);
      return { x: Number(candidate.x), y: Number(candidate.y) };
    })
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function compactCollinearPath(path: Point[]): Point[] {
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

function compactPath(path: Point[]): Point[] {
  return compactCollinearPath(path);
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
  const position = (node as PositionedNode).positionAbsolute ?? node.position;
  const width = num(node.measured?.width ?? node.width ?? node.style?.width, 0);
  const height = num(node.measured?.height ?? node.height ?? node.style?.height, 0);
  if (width <= 1 || height <= 1) return null;
  return {
    x: num(position.x, 0),
    y: num(position.y, 0),
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
  const firstAxis = axisOf(start, next);
  if (Math.abs(start.y - rect.y) <= 2 && firstAxis === 'v') return 'top';
  if (Math.abs(start.y - (rect.y + rect.height)) <= 2 && firstAxis === 'v') return 'bottom';
  if (Math.abs(start.x - rect.x) <= 2 && firstAxis === 'h') return 'left';
  if (Math.abs(start.x - (rect.x + rect.width)) <= 2 && firstAxis === 'h') return 'right';
  return null;
}

function strictCrossingPoint(first: Segment, second: Segment): Point | null {
  if (!strictCrosses(first, second)) return null;
  const firstAxis = axisOf(first.a, first.b);
  const horizontal = firstAxis === 'h' ? first : second;
  const vertical = firstAxis === 'v' ? first : second;
  return { x: vertical.a.x, y: horizontal.a.y };
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
  const addUnique = (point: Point): void => {
    if (Math.abs(point.x - start.x) <= 6 && Math.abs(point.y - start.y) <= 6) return;
    if (result.some(existing => Math.abs(existing.x - point.x) <= 1 && Math.abs(existing.y - point.y) <= 1)) return;
    result.push(point);
  };
  if (side === 'top' || side === 'bottom') {
    addUnique({ x: Math.round(rect.x + SIDE_EDGE_INSET), y: start.y });
    addUnique({ x: Math.round(rect.x + rect.width - SIDE_EDGE_INSET), y: start.y });
    for (const fraction of [0.06, 0.12, 0.18, 0.28, 0.38, 0.5, 0.62, 0.72, 0.82, 0.88, 0.94]) {
      const x = Math.round(rect.x + rect.width * fraction);
      addUnique({ x, y: start.y });
    }
  } else {
    addUnique({ x: start.x, y: Math.round(rect.y + SIDE_EDGE_INSET) });
    addUnique({ x: start.x, y: Math.round(rect.y + rect.height - SIDE_EDGE_INSET) });
    for (const fraction of [0.06, 0.12, 0.18, 0.28, 0.38, 0.5, 0.62, 0.72, 0.82, 0.88, 0.94]) {
      const y = Math.round(rect.y + rect.height * fraction);
      addUnique({ x: start.x, y });
    }
  }
  return result;
}

function sourceNudgeCandidates(path: Point[], sourceRect: Rect): Point[][] {
  if (path.length < 3) return [];
  const side = sourceSideFromPath(path, sourceRect);
  if (!side) return [];
  const branchAxis = side === 'top' || side === 'bottom' ? 'h' : 'v';
  const branchIndex = path.findIndex((point, index) => (
    index >= 1
    && index < path.length - 1
    && axisOf(point, path[index + 1]) === branchAxis
  ));
  if (branchIndex < 1) return [];
  const branch = path[branchIndex];
  const tail = path.slice(branchIndex + 1);
  return shiftedSourcePoints(path[0], sourceRect, side)
    .map(start => {
      if (side === 'top' || side === 'bottom') {
        const stub = Math.abs(branch.y - start.y);
        if (stub < MIN_ENDPOINT_STUB) return [];
        return compactPath([start, { x: start.x, y: branch.y }, branch, ...tail]);
      }
      const stub = Math.abs(branch.x - start.x);
      if (stub < MIN_ENDPOINT_STUB) return [];
      return compactPath([start, { x: branch.x, y: start.y }, branch, ...tail]);
    })
    .filter(candidate => candidate.length >= 2);
}

function outerBypassCandidates(
  path: Point[],
  edge: Edge,
  paths: Map<string, Point[]>,
  edgesById: Map<string, Edge>,
  obstacles: Map<string, Rect>,
): Point[][] {
  if (path.length < 4) return [];
  const sourceRect = obstacles.get(edge.source);
  if (!sourceRect) return [];
  const side = sourceSideFromPath(path, sourceRect);
  if (!side) return [];

  const firstAxis = axisOf(path[0], path[1]);
  const beforeTarget = path[path.length - 2];
  const target = path[path.length - 1];
  if (!firstAxis || !beforeTarget || !target) return [];

  const candidates: Point[][] = [];
  const sourceStarts = [path[0], ...shiftedSourcePoints(path[0], sourceRect, side)];
  const addCandidate = (startPoint: Point, lanePoint: Point, bypassPoint: Point): void => {
    const candidate = compactPath([
      startPoint,
      lanePoint,
      bypassPoint,
      firstAxis === 'v'
        ? { x: bypassPoint.x, y: beforeTarget.y }
        : { x: beforeTarget.x, y: bypassPoint.y },
      beforeTarget,
      target,
    ]);
    if (candidate.length >= 2) candidates.push(candidate);
  };

  for (const [otherId, otherPath] of paths) {
    if (otherId === edge.id) continue;
    const other = edgesById.get(otherId);
    if (!other || !shouldConsiderStrictCrossing(edge, other)) continue;
    const sameSourceHandlePair = other.source === edge.source && Boolean(edge.sourceHandle && other.sourceHandle);
    if (path.length < 5 && !sameSourceHandlePair) continue;

    for (const segment of toSegments(path)) {
      for (const otherSegment of toSegments(otherPath)) {
        const crossing = strictCrossingPoint(segment, otherSegment);
        if (!crossing) continue;
        if (firstAxis === 'v') {
          const direction = Math.sign(path[1].y - path[0].y) || 1;
          let laneY = crossing.y - direction * MIN_ENDPOINT_STUB;
          if (sameSourceHandlePair) {
            laneY = direction > 0
              ? Math.max(laneY, path[0].y + MIN_ENDPOINT_STUB)
              : Math.min(laneY, path[0].y - MIN_ENDPOINT_STUB);
          } else {
            if (direction > 0 && laneY <= path[0].y + MIN_ENDPOINT_STUB) continue;
            if (direction < 0 && laneY >= path[0].y - MIN_ENDPOINT_STUB) continue;
          }
          const otherRangeMin = Math.min(otherSegment.a.x, otherSegment.b.x, crossing.x);
          const otherRangeMax = Math.max(otherSegment.a.x, otherSegment.b.x, crossing.x);
          const xCandidates = new Set<number>([
            otherRangeMin - MIN_ENDPOINT_STUB,
            otherRangeMax + MIN_ENDPOINT_STUB,
          ]);
          const yMin = Math.min(laneY, beforeTarget.y);
          const yMax = Math.max(laneY, beforeTarget.y);
          for (const [candidateOtherId, candidateOtherPath] of paths) {
            if (candidateOtherId === edge.id) continue;
            for (const segmentRef of toSegments(candidateOtherPath)) {
              if (axisOf(segmentRef.a, segmentRef.b) !== 'v') continue;
              if (Math.max(segmentRef.a.y, segmentRef.b.y) < yMin || Math.min(segmentRef.a.y, segmentRef.b.y) > yMax) continue;
              xCandidates.add(segmentRef.a.x - OUTER_BYPASS_EDGE_CLEARANCE);
              xCandidates.add(segmentRef.a.x + OUTER_BYPASS_EDGE_CLEARANCE);
            }
          }
          for (const [nodeId, rect] of obstacles) {
            if (nodeId === edge.source || nodeId === edge.target) continue;
            if (rect.y > yMax || rect.y + rect.height < yMin) continue;
            xCandidates.add(rect.x - MIN_ENDPOINT_STUB);
            xCandidates.add(rect.x + rect.width + MIN_ENDPOINT_STUB);
          }
          for (const x of xCandidates) {
            for (const start of sourceStarts) {
              addCandidate(start, { x: start.x, y: Math.round(laneY) }, { x: Math.round(x), y: Math.round(laneY) });
            }
          }
        } else {
          const direction = Math.sign(path[1].x - path[0].x) || 1;
          let laneX = crossing.x - direction * MIN_ENDPOINT_STUB;
          if (sameSourceHandlePair) {
            laneX = direction > 0
              ? Math.max(laneX, path[0].x + MIN_ENDPOINT_STUB)
              : Math.min(laneX, path[0].x - MIN_ENDPOINT_STUB);
          } else {
            if (direction > 0 && laneX <= path[0].x + MIN_ENDPOINT_STUB) continue;
            if (direction < 0 && laneX >= path[0].x - MIN_ENDPOINT_STUB) continue;
          }
          const otherRangeMin = Math.min(otherSegment.a.y, otherSegment.b.y, crossing.y);
          const otherRangeMax = Math.max(otherSegment.a.y, otherSegment.b.y, crossing.y);
          const yCandidates = new Set<number>([
            otherRangeMin - MIN_ENDPOINT_STUB,
            otherRangeMax + MIN_ENDPOINT_STUB,
          ]);
          const xMin = Math.min(laneX, beforeTarget.x);
          const xMax = Math.max(laneX, beforeTarget.x);
          for (const [candidateOtherId, candidateOtherPath] of paths) {
            if (candidateOtherId === edge.id) continue;
            for (const segmentRef of toSegments(candidateOtherPath)) {
              if (axisOf(segmentRef.a, segmentRef.b) !== 'h') continue;
              if (Math.max(segmentRef.a.x, segmentRef.b.x) < xMin || Math.min(segmentRef.a.x, segmentRef.b.x) > xMax) continue;
              yCandidates.add(segmentRef.a.y - OUTER_BYPASS_EDGE_CLEARANCE);
              yCandidates.add(segmentRef.a.y + OUTER_BYPASS_EDGE_CLEARANCE);
            }
          }
          for (const [nodeId, rect] of obstacles) {
            if (nodeId === edge.source || nodeId === edge.target) continue;
            if (rect.x > xMax || rect.x + rect.width < xMin) continue;
            yCandidates.add(rect.y - MIN_ENDPOINT_STUB);
            yCandidates.add(rect.y + rect.height + MIN_ENDPOINT_STUB);
          }
          for (const y of yCandidates) {
            for (const start of sourceStarts) {
              addCandidate(start, { x: Math.round(laneX), y: start.y }, { x: Math.round(laneX), y: Math.round(y) });
            }
          }
        }
      }
    }
  }

  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const key = candidate.map(point => `${point.x},${point.y}`).join(';');
    if (seen.has(key)) return false;
    seen.add(key);
    return !pathHitsObstacle(candidate, edge, obstacles);
  });
}

function outerBypassOverlapCandidates(
  path: Point[],
  edge: Edge,
  paths: Map<string, Point[]>,
  edgesById: Map<string, Edge>,
  obstacles: Map<string, Rect>,
): Point[][] {
  if (path.length < 4) return [];
  const sourceRect = obstacles.get(edge.source);
  if (!sourceRect) return [];
  const side = sourceSideFromPath(path, sourceRect);
  if (!side) return [];
  const firstAxis = axisOf(path[0], path[1]);
  const beforeTarget = path[path.length - 2];
  const target = path[path.length - 1];
  if (!firstAxis || !beforeTarget || !target) return [];

  const sourceStarts = [path[0], ...shiftedSourcePoints(path[0], sourceRect, side)];
  const candidates: Point[][] = [];
  const addCandidate = (startPoint: Point, lanePoint: Point, bypassPoint: Point): void => {
    const candidate = compactPath([
      startPoint,
      lanePoint,
      bypassPoint,
      firstAxis === 'v'
        ? { x: bypassPoint.x, y: beforeTarget.y }
        : { x: beforeTarget.x, y: bypassPoint.y },
      beforeTarget,
      target,
    ]);
    if (candidate.length >= 2) candidates.push(candidate);
  };

  for (const [otherId, otherPath] of paths) {
    if (otherId === edge.id) continue;
    const other = edgesById.get(otherId);
    if (!other || other.source === edge.source || other.target === edge.target) continue;
    for (const segment of toSegments(path)) {
      for (const otherSegment of toSegments(otherPath)) {
        if (segmentDirection(segment) * segmentDirection(otherSegment) >= 0) continue;
        if (parallelOverlapLength(segment, otherSegment) <= OUTER_BYPASS_EDGE_CLEARANCE) continue;
        const segmentAxis = axisOf(segment.a, segment.b);
        if (firstAxis === 'v' && segmentAxis === 'h') {
          const yValues = [segment.a.y - OUTER_BYPASS_EDGE_CLEARANCE, segment.a.y + OUTER_BYPASS_EDGE_CLEARANCE];
          const xCandidates = new Set<number>([
            Math.min(otherSegment.a.x, otherSegment.b.x) - MIN_ENDPOINT_STUB,
            Math.max(otherSegment.a.x, otherSegment.b.x) + MIN_ENDPOINT_STUB,
          ]);
          const yMin = Math.min(...yValues, beforeTarget.y);
          const yMax = Math.max(...yValues, beforeTarget.y);
          for (const [candidateOtherId, candidateOtherPath] of paths) {
            if (candidateOtherId === edge.id) continue;
            for (const segmentRef of toSegments(candidateOtherPath)) {
              if (axisOf(segmentRef.a, segmentRef.b) !== 'v') continue;
              if (Math.max(segmentRef.a.y, segmentRef.b.y) < yMin || Math.min(segmentRef.a.y, segmentRef.b.y) > yMax) continue;
              xCandidates.add(segmentRef.a.x - OUTER_BYPASS_EDGE_CLEARANCE);
              xCandidates.add(segmentRef.a.x + OUTER_BYPASS_EDGE_CLEARANCE);
            }
          }
          for (const [nodeId, rect] of obstacles) {
            if (nodeId === edge.source || nodeId === edge.target) continue;
            if (rect.y > yMax || rect.y + rect.height < yMin) continue;
            xCandidates.add(rect.x - MIN_ENDPOINT_STUB);
            xCandidates.add(rect.x + rect.width + MIN_ENDPOINT_STUB);
          }
          for (const y of yValues) {
            for (const x of xCandidates) {
              for (const start of sourceStarts) {
                addCandidate(start, { x: start.x, y: Math.round(y) }, { x: Math.round(x), y: Math.round(y) });
              }
            }
          }
        }
        if (firstAxis === 'v' && segmentAxis === 'v') {
          const direction = Math.sign(path[1].y - path[0].y) || 1;
          const laneYValues = new Set<number>([path[1].y]);
          const overlapBoundary = direction > 0
            ? Math.max(segment.a.y, segment.b.y, otherSegment.a.y, otherSegment.b.y)
            : Math.min(segment.a.y, segment.b.y, otherSegment.a.y, otherSegment.b.y);
          for (const offset of [24, 32, 48, 64, 80]) {
            const laneY = path[1].y + direction * offset;
            if (direction > 0 && laneY > path[0].y + MIN_ENDPOINT_STUB) laneYValues.add(Math.round(laneY));
            if (direction < 0 && laneY < path[0].y - MIN_ENDPOINT_STUB) laneYValues.add(Math.round(laneY));
          }
          for (const clearance of [24, 32, 48, 64]) {
            const laneY = overlapBoundary + direction * clearance;
            if (direction > 0 && laneY > path[0].y + MIN_ENDPOINT_STUB) laneYValues.add(Math.round(laneY));
            if (direction < 0 && laneY < path[0].y - MIN_ENDPOINT_STUB) laneYValues.add(Math.round(laneY));
          }
          for (const [candidateOtherId, candidateOtherPath] of paths) {
            if (candidateOtherId === edge.id) continue;
            const candidateOther = edgesById.get(candidateOtherId);
            for (const segmentRef of toSegments(candidateOtherPath)) {
              if (axisOf(segmentRef.a, segmentRef.b) !== 'h') continue;
              const y = segmentRef.a.y;
              const withinSourceRun = y > Math.min(path[0].y, path[1].y) + EPS
                && y < Math.max(path[0].y, path[1].y) - EPS;
              if (!withinSourceRun) continue;
              if (candidateOther?.source === edge.source && Math.abs(y - path[1].y) <= OUTER_BYPASS_EDGE_CLEARANCE) {
                laneYValues.add(Math.round(y));
              }
              for (const clearance of [24, 32, 48]) {
                const laneY = y + direction * clearance;
                if (direction > 0 && laneY > path[0].y + MIN_ENDPOINT_STUB) laneYValues.add(Math.round(laneY));
                if (direction < 0 && laneY < path[0].y - MIN_ENDPOINT_STUB) laneYValues.add(Math.round(laneY));
              }
            }
          }
          for (const laneY of laneYValues) {
            for (const start of sourceStarts) {
              addCandidate(
                start,
                { x: start.x, y: Math.round(laneY) },
                { x: beforeTarget.x, y: Math.round(laneY) },
              );
            }
          }
        }
        if (firstAxis === 'h' && segmentAxis === 'v') {
          const xValues = [segment.a.x - OUTER_BYPASS_EDGE_CLEARANCE, segment.a.x + OUTER_BYPASS_EDGE_CLEARANCE];
          const yCandidates = new Set<number>([
            Math.min(otherSegment.a.y, otherSegment.b.y) - MIN_ENDPOINT_STUB,
            Math.max(otherSegment.a.y, otherSegment.b.y) + MIN_ENDPOINT_STUB,
          ]);
          const xMin = Math.min(...xValues, beforeTarget.x);
          const xMax = Math.max(...xValues, beforeTarget.x);
          for (const [candidateOtherId, candidateOtherPath] of paths) {
            if (candidateOtherId === edge.id) continue;
            for (const segmentRef of toSegments(candidateOtherPath)) {
              if (axisOf(segmentRef.a, segmentRef.b) !== 'h') continue;
              if (Math.max(segmentRef.a.x, segmentRef.b.x) < xMin || Math.min(segmentRef.a.x, segmentRef.b.x) > xMax) continue;
              yCandidates.add(segmentRef.a.y - OUTER_BYPASS_EDGE_CLEARANCE);
              yCandidates.add(segmentRef.a.y + OUTER_BYPASS_EDGE_CLEARANCE);
            }
          }
          for (const [nodeId, rect] of obstacles) {
            if (nodeId === edge.source || nodeId === edge.target) continue;
            if (rect.x > xMax || rect.x + rect.width < xMin) continue;
            yCandidates.add(rect.y - MIN_ENDPOINT_STUB);
            yCandidates.add(rect.y + rect.height + MIN_ENDPOINT_STUB);
          }
          for (const x of xValues) {
            for (const y of yCandidates) {
              for (const start of sourceStarts) {
                addCandidate(start, { x: Math.round(x), y: start.y }, { x: Math.round(x), y: Math.round(y) });
              }
            }
          }
        }
        if (firstAxis === 'h' && segmentAxis === 'h') {
          const direction = Math.sign(path[1].x - path[0].x) || 1;
          const laneXValues = new Set<number>([path[1].x]);
          const overlapBoundary = direction > 0
            ? Math.max(segment.a.x, segment.b.x, otherSegment.a.x, otherSegment.b.x)
            : Math.min(segment.a.x, segment.b.x, otherSegment.a.x, otherSegment.b.x);
          for (const offset of [24, 32, 48, 64, 80]) {
            const laneX = path[1].x + direction * offset;
            if (direction > 0 && laneX > path[0].x + MIN_ENDPOINT_STUB) laneXValues.add(Math.round(laneX));
            if (direction < 0 && laneX < path[0].x - MIN_ENDPOINT_STUB) laneXValues.add(Math.round(laneX));
          }
          for (const clearance of [24, 32, 48, 64]) {
            const laneX = overlapBoundary + direction * clearance;
            if (direction > 0 && laneX > path[0].x + MIN_ENDPOINT_STUB) laneXValues.add(Math.round(laneX));
            if (direction < 0 && laneX < path[0].x - MIN_ENDPOINT_STUB) laneXValues.add(Math.round(laneX));
          }
          for (const [candidateOtherId, candidateOtherPath] of paths) {
            if (candidateOtherId === edge.id) continue;
            const candidateOther = edgesById.get(candidateOtherId);
            for (const segmentRef of toSegments(candidateOtherPath)) {
              if (axisOf(segmentRef.a, segmentRef.b) !== 'v') continue;
              const x = segmentRef.a.x;
              const withinSourceRun = x > Math.min(path[0].x, path[1].x) + EPS
                && x < Math.max(path[0].x, path[1].x) - EPS;
              if (!withinSourceRun) continue;
              if (candidateOther?.source === edge.source && Math.abs(x - path[1].x) <= OUTER_BYPASS_EDGE_CLEARANCE) {
                laneXValues.add(Math.round(x));
              }
              for (const clearance of [24, 32, 48]) {
                const laneX = x + direction * clearance;
                if (direction > 0 && laneX > path[0].x + MIN_ENDPOINT_STUB) laneXValues.add(Math.round(laneX));
                if (direction < 0 && laneX < path[0].x - MIN_ENDPOINT_STUB) laneXValues.add(Math.round(laneX));
              }
            }
          }
          for (const laneX of laneXValues) {
            for (const start of sourceStarts) {
              addCandidate(
                start,
                { x: Math.round(laneX), y: start.y },
                { x: Math.round(laneX), y: beforeTarget.y },
              );
            }
          }
        }
      }
    }
  }

  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const key = candidate.map(point => `${point.x},${point.y}`).join(';');
    if (seen.has(key)) return false;
    seen.add(key);
    return !pathHitsObstacle(candidate, edge, obstacles);
  });
}

function withComputedPath(edge: Edge, path: Point[]): Edge {
  const data: Record<string, unknown> = { ...(edge.data || {}), computedPath: path, endpointLaneNudged: true };
  const treeRouting = asRecord(data.treeRouting);
  if (Array.isArray(treeRouting.points)) {
    data.treeRouting = { ...treeRouting, points: path };
  }
  return { ...edge, data };
}

function uniqueEndpointLaneCandidates(candidates: readonly Point[][]): Point[][] {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const key = candidate.map(point => `${point.x},${point.y}`).join(';');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function repairEndpointLaneCrossings(
  edges: Edge[],
  nodes: ReactFlowNode[],
  options: EndpointLaneRepairOptions = {},
): Edge[] {
  let candidateCount = 0;
  let evaluationCount = 0;
  let scannedSegmentCount = 0;
  const reportMetrics = (): void => options.onMetrics?.({
    candidateCount,
    evaluationCount,
    scannedSegmentCount,
  });
  if (edges.length < 2) {
    reportMetrics();
    return edges;
  }

  const paths = new Map<string, Point[]>();
  for (const edge of [...edges].reverse()) {
    const path = compactPath(getEdgePath(edge));
    if (edge.id && path.length >= 2) paths.set(edge.id, path);
  }
  if (paths.size < 2) {
    reportMetrics();
    return edges;
  }

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

    const interactionContext = createEndpointLaneInteractionContext(edge, repaired, edgesById);
    const currentInteractions = interactionContext.evaluate(path);
    const currentCrossings = currentInteractions.crossings;
    const currentTotalStrictCrossings = currentInteractions.totalCrossings;
    const currentOppositeOverlap = currentInteractions.oppositeOverlap;
    if (currentCrossings <= 0 && currentOppositeOverlap <= OUTER_BYPASS_EDGE_CLEARANCE) {
      const interactionMetrics = interactionContext.readMetrics();
      evaluationCount += interactionMetrics.evaluationCount;
      scannedSegmentCount += interactionMetrics.scannedSegmentCount;
      continue;
    }

    const currentLength = pathLength(path);
    const maxExtraLength = currentCrossings > 0
      ? Math.max(240, currentCrossings * 560)
      : 160;
    const candidatePaths = uniqueEndpointLaneCandidates([
      ...sourceNudgeCandidates(path, sourceRect),
      ...outerBypassCandidates(path, edge, repaired, edgesById, obstacles),
      ...outerBypassOverlapCandidates(path, edge, repaired, edgesById, obstacles),
    ])
      .filter(candidate => !pathHitsObstacle(candidate, edge, obstacles))
      .map(candidate => ({ path: candidate, length: pathLength(candidate) }))
      .filter(candidate => candidate.length <= currentLength + maxExtraLength);
    candidateCount += candidatePaths.length;
    const candidates = candidatePaths
      .map((candidate) => {
        const { crossings, totalCrossings, oppositeOverlap } = interactionContext.evaluate(candidate.path);
        return {
          path: candidate.path,
          crossings,
          totalCrossings,
          oppositeOverlap,
          length: candidate.length,
          score: totalCrossings * 140000
            + crossings * 100000
            + oppositeOverlap * 500
            + candidate.length * 0.05
            + Math.abs(candidate.path[0].x - path[0].x)
            + Math.abs(candidate.path[0].y - path[0].y),
        };
      })
      .filter(candidate => (
        (
          candidate.crossings < currentCrossings
          && candidate.totalCrossings < currentTotalStrictCrossings
        )
        || (
          currentCrossings === 0
          && candidate.totalCrossings <= currentTotalStrictCrossings
          && candidate.crossings === 0
          && candidate.oppositeOverlap + OUTER_BYPASS_EDGE_CLEARANCE < currentOppositeOverlap
        )
      ))
      .sort((a, b) => a.score - b.score);

    if (candidates[0]) repaired.set(edge.id, candidates[0].path);
    const interactionMetrics = interactionContext.readMetrics();
    evaluationCount += interactionMetrics.evaluationCount;
    scannedSegmentCount += interactionMetrics.scannedSegmentCount;
  }

  const result = edges.map(edge => {
    const original = paths.get(edge.id);
    const path = repaired.get(edge.id);
    if (!original || !path || pathEquals(original, path)) return edge;
    return withComputedPath(edge, path);
  });
  reportMetrics();
  return result;
}
