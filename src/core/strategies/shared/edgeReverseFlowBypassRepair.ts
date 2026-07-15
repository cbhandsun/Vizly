import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  edgeTerminalSideCanSwitch,
  resolveEdgeTerminalHandleForSide,
} from '../../routing/utils/edgeTerminalPolicy';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Side = 'top' | 'bottom' | 'left' | 'right';
type Segment = { a: Point; b: Point };

const EPS = 0.5;
const MIN_ENDPOINT_STUB = 56;
const SHALLOW_OPPOSITE_SECTOR_STUB = 48;
const OUTER_LANE_PADDING = 56;
const SHARED_LANE_SCORE_BONUS = 150;
const BACKTRACK_SCORE_WEIGHT = 2500;
const LARGE_BACKTRACK_DELTA = 48;
const STRICT_CROSSING_DEVIATION_DELTA = MIN_ENDPOINT_STUB * 2;
const MAX_SHALLOW_OPPOSITE_SECTOR_GRAPH_EDGES = 24;

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

function axisOf(a: Point, b: Point): 'h' | 'v' | null {
  if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
}

function toSegments(path: Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    if (axisOf(a, b)) segments.push({ a, b });
  }
  return segments;
}

function pathLength(path: Point[]): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    total += Math.abs(path[index].x - path[index + 1].x) + Math.abs(path[index].y - path[index + 1].y);
  }
  return total;
}

type PathDeviation = {
  mainAxisBacktrack: number;
  dualAxisBacktrack: number;
  envelope: number;
  sourceWrongWay: number;
};

function pathDeviation(path: Point[]): PathDeviation {
  if (path.length < 2) {
    return { mainAxisBacktrack: 0, dualAxisBacktrack: 0, envelope: 0, sourceWrongWay: 0 };
  }
  const start = path[0];
  const end = path[path.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let horizontalTravel = 0;
  let verticalTravel = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const axis = axisOf(path[index], path[index + 1]);
    if (!axis) continue;
    if (axis === 'h') horizontalTravel += Math.abs(path[index + 1].x - path[index].x);
    if (axis === 'v') verticalTravel += Math.abs(path[index + 1].y - path[index].y);
  }

  const minEndpointX = Math.min(start.x, end.x);
  const maxEndpointX = Math.max(start.x, end.x);
  const minEndpointY = Math.min(start.y, end.y);
  const maxEndpointY = Math.max(start.y, end.y);
  const minPathX = Math.min(...path.map(point => point.x));
  const maxPathX = Math.max(...path.map(point => point.x));
  const minPathY = Math.min(...path.map(point => point.y));
  const maxPathY = Math.max(...path.map(point => point.y));
  const firstAxis = axisOf(path[0], path[1]);
  const firstDelta = firstAxis === 'h' ? path[1].x - path[0].x : path[1].y - path[0].y;
  const expectedFirstDelta = firstAxis === 'h' ? dx : dy;
  const horizontalBacktrack = Math.max(0, horizontalTravel - Math.abs(dx)) / 2;
  const verticalBacktrack = Math.max(0, verticalTravel - Math.abs(dy)) / 2;

  return {
    mainAxisBacktrack: Math.round(Math.abs(dx) >= Math.abs(dy) ? horizontalBacktrack : verticalBacktrack),
    dualAxisBacktrack: Math.round(horizontalBacktrack + verticalBacktrack),
    envelope: Math.round(
      Math.max(0, minEndpointX - minPathX)
      + Math.max(0, maxPathX - maxEndpointX)
      + Math.max(0, minEndpointY - minPathY)
      + Math.max(0, maxPathY - maxEndpointY),
    ),
    sourceWrongWay: firstAxis && (
      Math.abs(expectedFirstDelta) <= EPS
      || Math.sign(firstDelta) !== Math.sign(expectedFirstDelta)
    ) ? Math.round(Math.abs(firstDelta)) : 0,
  };
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
  const result = new Map<string, Rect>();
  const ignoredTypes = new Set(['titleGroup', 'subGroup', 'group', 'domain']);
  for (const node of nodes) {
    if (ignoredTypes.has(String(node.type || ''))) continue;
    const rect = getNodeRect(node);
    if (rect) result.set(node.id, rect);
  }
  return result;
}

function sourceSideFromPath(path: Point[], sourceRect: Rect): Side | null {
  if (path.length < 2) return null;
  const start = path[0];
  const next = path[1];
  if (Math.abs(start.y - sourceRect.y) <= 2 && axisOf(start, next) === 'v' && next.y < start.y) return 'top';
  if (Math.abs(start.y - (sourceRect.y + sourceRect.height)) <= 2 && axisOf(start, next) === 'v' && next.y > start.y) return 'bottom';
  if (Math.abs(start.x - sourceRect.x) <= 2 && axisOf(start, next) === 'h' && next.x < start.x) return 'left';
  if (Math.abs(start.x - (sourceRect.x + sourceRect.width)) <= 2 && axisOf(start, next) === 'h' && next.x > start.x) return 'right';
  return null;
}

function targetSideFromPath(path: Point[], targetRect: Rect): Side | null {
  if (path.length < 2) return null;
  const end = path[path.length - 1];
  const previous = path[path.length - 2];
  if (Math.abs(end.y - targetRect.y) <= 2 && axisOf(previous, end) === 'v' && previous.y < end.y) return 'top';
  if (Math.abs(end.y - (targetRect.y + targetRect.height)) <= 2 && axisOf(previous, end) === 'v' && previous.y > end.y) return 'bottom';
  if (Math.abs(end.x - targetRect.x) <= 2 && axisOf(previous, end) === 'h' && previous.x < end.x) return 'left';
  if (Math.abs(end.x - (targetRect.x + targetRect.width)) <= 2 && axisOf(previous, end) === 'h' && previous.x > end.x) return 'right';
  return null;
}

function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function segmentIntersectsRect(segment: Segment, rect: Rect, padding = 0): boolean {
  const x1 = rect.x - padding;
  const y1 = rect.y - padding;
  const x2 = rect.x + rect.width + padding;
  const y2 = rect.y + rect.height + padding;
  if (Math.abs(segment.a.y - segment.b.y) <= EPS) {
    const y = segment.a.y;
    if (y < y1 || y > y2) return false;
    return Math.max(Math.min(segment.a.x, segment.b.x), x1) < Math.min(Math.max(segment.a.x, segment.b.x), x2);
  }
  if (Math.abs(segment.a.x - segment.b.x) <= EPS) {
    const x = segment.a.x;
    if (x < x1 || x > x2) return false;
    return Math.max(Math.min(segment.a.y, segment.b.y), y1) < Math.min(Math.max(segment.a.y, segment.b.y), y2);
  }
  return false;
}

function pathIntersectsAnyRect(path: Point[], rects: Rect[]): boolean {
  return toSegments(path).some(segment => rects.some(rect => segmentIntersectsRect(segment, rect, 0)));
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

function rangeOverlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2))
    - Math.max(Math.min(a1, a2), Math.min(b1, b2)));
}

function parallelOverlap(first: Segment, second: Segment): number {
  const firstAxis = axisOf(first.a, first.b);
  const secondAxis = axisOf(second.a, second.b);
  if (!firstAxis || firstAxis !== secondAxis) return 0;
  if (firstAxis === 'h') {
    if (Math.abs(first.a.y - second.a.y) > 2) return 0;
    return rangeOverlap(first.a.x, first.b.x, second.a.x, second.b.x);
  }
  if (Math.abs(first.a.x - second.a.x) > 2) return 0;
  return rangeOverlap(first.a.y, first.b.y, second.a.y, second.b.y);
}

function relationToOtherEdges(path: Point[], edge: Edge, otherPaths: Map<string, Point[]>, edgesById: Map<string, Edge>): {
  crossings: number;
  overlap: number;
  reverseOverlap: number;
} {
  let crossings = 0;
  let overlap = 0;
  let reverseOverlap = 0;
  const segments = toSegments(path);
  for (const [otherId, otherPath] of otherPaths) {
    const other = edgesById.get(otherId);
    if (!other || other.id === edge.id) continue;
    const related = other.source === edge.source || other.target === edge.target;
    for (const first of segments) {
      for (const second of toSegments(otherPath)) {
        if (!related && strictCrosses(first, second)) crossings += 1;
        const segmentOverlap = parallelOverlap(first, second);
        if (!related) overlap += segmentOverlap;
        if (segmentOverlap > 0 && segmentDirection(first) * segmentDirection(second) < 0) {
          reverseOverlap += segmentOverlap;
        }
      }
    }
  }
  return { crossings, overlap, reverseOverlap };
}

function segmentDirection(segment: Segment): number {
  const axis = axisOf(segment.a, segment.b);
  if (axis === 'h') return Math.sign(segment.b.x - segment.a.x);
  if (axis === 'v') return Math.sign(segment.b.y - segment.a.y);
  return 0;
}

function targetEntryPoint(end: Point, targetSide: Side): Point {
  if (targetSide === 'bottom') return { x: end.x, y: end.y + MIN_ENDPOINT_STUB };
  if (targetSide === 'top') return { x: end.x, y: end.y - MIN_ENDPOINT_STUB };
  if (targetSide === 'right') return { x: end.x + MIN_ENDPOINT_STUB, y: end.y };
  return { x: end.x - MIN_ENDPOINT_STUB, y: end.y };
}

function bottomBranchValue(sourceRect: Rect, pathsById: Map<string, Point[]>, edges: Edge[], sourceId: string): number {
  const sourceBottom = sourceRect.y + sourceRect.height;
  const values = edges
    .filter(edge => edge.source === sourceId)
    .map(edge => pathsById.get(edge.id))
    .filter((path): path is Point[] => Array.isArray(path) && path.length >= 2)
    .filter(path => Math.abs(path[0].y - sourceBottom) <= 2 && path[1].y > path[0].y + EPS)
    .map(path => path[1].y)
    .filter(Number.isFinite);

  if (values.length > 0) {
    return Math.max(sourceBottom + MIN_ENDPOINT_STUB, Math.round(values.sort((a, b) => a - b)[Math.floor(values.length / 2)]));
  }
  return Math.round(sourceBottom + Math.max(MIN_ENDPOINT_STUB, Math.min(96, sourceRect.height * 0.65)));
}

function topBranchValue(sourceRect: Rect, pathsById: Map<string, Point[]>, edges: Edge[], sourceId: string): number {
  const sourceTop = sourceRect.y;
  const values = edges
    .filter(edge => edge.source === sourceId)
    .map(edge => pathsById.get(edge.id))
    .filter((path): path is Point[] => Array.isArray(path) && path.length >= 2)
    .filter(path => Math.abs(path[0].y - sourceTop) <= 2 && path[1].y < path[0].y - EPS)
    .map(path => path[1].y)
    .filter(Number.isFinite);

  if (values.length > 0) {
    return Math.min(sourceTop - MIN_ENDPOINT_STUB, Math.round(values.sort((a, b) => a - b)[Math.floor(values.length / 2)]));
  }
  return Math.round(sourceTop - Math.max(MIN_ENDPOINT_STUB, Math.min(96, sourceRect.height * 0.65)));
}

function outerLaneX(sourceRect: Rect, targetEntry: Point, obstacles: Rect[], direction: 'left' | 'right'): number {
  if (direction === 'right') {
    const rightBoundary = Math.max(...obstacles.map(rect => rect.x + rect.width), sourceRect.x + sourceRect.width, targetEntry.x);
    return Math.round(rightBoundary + OUTER_LANE_PADDING);
  }
  const leftBoundary = Math.min(...obstacles.map(rect => rect.x), sourceRect.x, targetEntry.x);
  return Math.round(leftBoundary - OUTER_LANE_PADDING);
}

function sameSourceBypassLaneXs(
  edge: Edge,
  pathsById: Map<string, Point[]>,
  edges: Edge[],
  sourceRect: Rect,
  direction: 'left' | 'right',
): number[] {
  const sourceBottom = sourceRect.y + sourceRect.height;
  const sourceCenterX = sourceRect.x + sourceRect.width / 2;
  const minLaneDistance = Math.max(MIN_ENDPOINT_STUB, sourceRect.width * 0.8);
  const result: number[] = [];

  for (const other of edges) {
    if (other.id === edge.id || other.source !== edge.source) continue;
    const path = pathsById.get(other.id);
    if (!path || path.length < 4) continue;
    if (Math.abs(path[0].y - sourceBottom) > 2) continue;
    for (let index = 1; index < path.length - 1; index += 1) {
      if (axisOf(path[index], path[index + 1]) !== 'v') continue;
      const length = Math.abs(path[index].y - path[index + 1].y);
      if (length < sourceRect.height * 1.5) continue;
      const x = path[index].x;
      if (direction === 'right' && x > sourceCenterX + minLaneDistance) result.push(Math.round(x));
      if (direction === 'left' && x < sourceCenterX - minLaneDistance) result.push(Math.round(x));
    }
  }

  return result;
}

function generateReverseFlowBypassCandidates(
  edge: Edge,
  path: Point[],
  sourceRect: Rect,
  targetRect: Rect,
  pathsById: Map<string, Point[]>,
  edges: Edge[],
  obstacles: Rect[],
): Array<{ path: Point[]; sharedLane: boolean; sourceHandle: Side }> {
  const sourceSide = sourceSideFromPath(path, sourceRect);
  if (sourceSide !== 'top') return [];

  const sourceCenter = rectCenter(sourceRect);
  const targetCenter = rectCenter(targetRect);
  if (targetCenter.y >= sourceCenter.y - MIN_ENDPOINT_STUB) return [];

  const end = path[path.length - 1];
  const targetSide = targetSideFromPath(path, targetRect) ?? 'bottom';
  const targetEntry = targetEntryPoint(end, targetSide);
  const sourceTop = path[0];
  const topBranchY = topBranchValue(sourceRect, pathsById, edges, edge.source);
  const sourceBottom = { x: sourceCenter.x, y: sourceRect.y + sourceRect.height };
  const branchY = bottomBranchValue(sourceRect, pathsById, edges, edge.source);
  const preferredDirection = targetCenter.x >= sourceCenter.x ? 'right' as const : 'left' as const;
  const directions = preferredDirection === 'right' ? ['right', 'left'] as const : ['left', 'right'] as const;

  const topCandidates = directions.map(direction => ({
    sourceHandle: 'top' as const,
    sharedLane: false,
    path: compactPath([
      sourceTop,
      { x: sourceTop.x, y: topBranchY },
      { x: outerLaneX(sourceRect, targetEntry, obstacles, direction), y: topBranchY },
      { x: outerLaneX(sourceRect, targetEntry, obstacles, direction), y: targetEntry.y },
      targetEntry,
      end,
    ]),
  }));

  const bottomCandidates = directions.flatMap(direction => {
    const laneXs = [
      ...sameSourceBypassLaneXs(edge, pathsById, edges, sourceRect, direction)
        .map(laneX => ({ laneX, sharedLane: true })),
      { laneX: outerLaneX(sourceRect, targetEntry, obstacles, direction), sharedLane: false },
    ];
    const seen = new Set<number>();
    return laneXs
      .filter(({ laneX }) => {
        if (seen.has(laneX)) return false;
        seen.add(laneX);
        return true;
      })
      .map(({ laneX, sharedLane }) => ({
        sharedLane,
        sourceHandle: 'bottom' as const,
        path: compactPath([
          sourceBottom,
          { x: sourceBottom.x, y: branchY },
          { x: laneX, y: branchY },
          { x: laneX, y: targetEntry.y },
          targetEntry,
          end,
        ]),
      }));
  });

  // A target in the opposite vertical sector must not inherit the deep branch lane used by
  // ordinary bottom-sector peers. Keep one bounded sector split so a blocked top exit can still
  // satisfy hard crossing/obstacle gates without dropping to a graph-wide lower trunk.
  const shallowBottomCandidate = {
    sourceHandle: 'bottom' as const,
    sharedLane: false,
    path: compactPath([
      sourceBottom,
      { x: sourceBottom.x, y: sourceBottom.y + SHALLOW_OPPOSITE_SECTOR_STUB },
      { x: targetEntry.x, y: sourceBottom.y + SHALLOW_OPPOSITE_SECTOR_STUB },
      targetEntry,
      end,
    ]),
  };

  // The shallow side-switch is a bounded small/medium-graph alternative. Dense graphs already
  // have established sector trunks; injecting a new shallow branch there can perturb a later
  // buddy repair even when this edge's local relation score improves.
  return edges.length <= MAX_SHALLOW_OPPOSITE_SECTOR_GRAPH_EDGES
    ? [
      ...topCandidates,
      shallowBottomCandidate,
      ...bottomCandidates,
    ]
    : [...topCandidates, ...bottomCandidates];
}

function withComputedPath(edge: Edge, path: Point[], sourceHandle?: Side): Edge {
  const data: any = {
    ...(edge.data || {}),
    computedPath: path,
    reverseFlowBypassRepaired: true,
    runtimeHandleLock: {
      ...(((edge.data as any)?.runtimeHandleLock && typeof (edge.data as any).runtimeHandleLock === 'object')
        ? (edge.data as any).runtimeHandleLock
        : {}),
      source: true,
      target: true,
    },
  };
  if (data.treeRouting && Array.isArray(data.treeRouting.points)) {
    data.treeRouting = { ...data.treeRouting, points: path };
  }
  return {
    ...edge,
    ...(sourceHandle ? {
      sourceHandle: resolveEdgeTerminalHandleForSide(edge, 'source', sourceHandle),
    } : {}),
    data,
  };
}

export function repairReverseFlowBypassCrossings(edges: Edge[], nodes: ReactFlowNode[]): Edge[] {
  if (edges.length < 2) return edges;

  const pathsById = new Map<string, Point[]>();
  for (const edge of edges) {
    const path = compactPath(getEdgePath(edge));
    if (edge.id && path.length >= 2) pathsById.set(edge.id, path);
  }
  if (pathsById.size < 2) return edges;

  const edgesById = new Map(edges.map(edge => [edge.id, edge] as const));
  const nodeRects = new Map<string, Rect>();
  for (const node of nodes) {
    const rect = getNodeRect(node);
    if (rect) nodeRects.set(node.id, rect);
  }
  const allObstacles = getRoutingObstacles(nodes);

  const repaired = new Map(pathsById);
  const repairedSourceHandles = new Map<string, Side>();
  for (let pass = 0; pass < 2; pass += 1) {
    for (const edge of edges) {
      const path = repaired.get(edge.id);
      const sourceRect = nodeRects.get(edge.source);
      const targetRect = nodeRects.get(edge.target);
      if (!path || !sourceRect || !targetRect) continue;

      const currentRelation = relationToOtherEdges(path, edge, repaired, edgesById);
      if (currentRelation.crossings <= 0 && currentRelation.reverseOverlap < 16) continue;

      const ignored = new Set([edge.source, edge.target]);
      const obstacles = Array.from(allObstacles.entries())
        .filter(([nodeId]) => !ignored.has(nodeId))
        .map(([, rect]) => rect);
      const baseLength = pathLength(path);
      const currentDeviation = pathDeviation(path);
      const currentScore = currentRelation.crossings * 100000
        + currentRelation.reverseOverlap * 1500
        + currentRelation.overlap * 100
        + baseLength * 0.04
        + currentDeviation.mainAxisBacktrack * BACKTRACK_SCORE_WEIGHT
        + Math.max(0, path.length - 2) * 20;
      const generatedCandidates = generateReverseFlowBypassCandidates(
        edge,
        path,
        sourceRect,
        targetRect,
        repaired,
        edges,
        obstacles,
      );
      const candidates = generatedCandidates
        .filter(candidate => edgeTerminalSideCanSwitch(edge, 'source', candidate.sourceHandle))
        .filter(candidate => !pathIntersectsAnyRect(candidate.path, obstacles))
        .map(candidate => {
          const relation = relationToOtherEdges(candidate.path, edge, repaired, edgesById);
          const length = pathLength(candidate.path);
          const deviation = pathDeviation(candidate.path);
          return {
            path: candidate.path,
            sourceHandle: candidate.sourceHandle,
            relation,
            deviation,
            score: relation.crossings * 100000
              + relation.reverseOverlap * 1500
              + relation.overlap * 100
              + length * 0.04
              + deviation.mainAxisBacktrack * BACKTRACK_SCORE_WEIGHT
              + Math.max(0, candidate.path.length - 2) * 20
              - (candidate.sharedLane ? SHARED_LANE_SCORE_BONUS : 0),
          };
        })
        .filter(candidate => (
          candidate.relation.crossings < currentRelation.crossings
          || candidate.relation.reverseOverlap < currentRelation.reverseOverlap - 1
        ))
        .filter(candidate => {
          const changesSourceSide = candidate.sourceHandle !== sourceSideFromPath(path, sourceRect);
          if (!changesSourceSide) {
            return candidate.deviation.mainAxisBacktrack
                <= currentDeviation.mainAxisBacktrack + LARGE_BACKTRACK_DELTA
              || candidate.relation.crossings < currentRelation.crossings;
          }
          const deviationDelta = candidate.relation.crossings < currentRelation.crossings
            ? STRICT_CROSSING_DEVIATION_DELTA
            : LARGE_BACKTRACK_DELTA;
          return candidate.deviation.mainAxisBacktrack <= currentDeviation.mainAxisBacktrack + deviationDelta
            && candidate.deviation.sourceWrongWay <= currentDeviation.sourceWrongWay + deviationDelta
            && candidate.deviation.dualAxisBacktrack <= currentDeviation.dualAxisBacktrack + deviationDelta
            && candidate.deviation.envelope <= currentDeviation.envelope + deviationDelta;
        })
        .filter(candidate => candidate.score < currentScore)
        .sort((a, b) => a.score - b.score);

      if (candidates[0]) {
        repaired.set(edge.id, candidates[0].path);
        repairedSourceHandles.set(edge.id, candidates[0].sourceHandle);
      }
    }
  }

  return edges.map(edge => {
    const original = pathsById.get(edge.id);
    const path = repaired.get(edge.id);
    if (!original || !path || pathEquals(original, path)) return edge;
    return withComputedPath(edge, path, repairedSourceHandles.get(edge.id));
  });
}
