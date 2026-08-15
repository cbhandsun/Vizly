import type { Edge, Node, XYPosition } from '@xyflow/react';

import { PathFinder } from '../../routing/algorithms/PathFinder';
import { expandHandle } from '../../routing/utils/handleUtils';

type FastPoint = { x: number; y: number };
type FastRect = { id: string; x: number; y: number; width: number; height: number };

const EPSILON = 0.5;
const OBSTACLE_PADDING = 8;
const LANE_CLEARANCE = 12;
const GRID_FALLBACK_MAX_PEER_EDGES = 31;
const CONTAINER_TYPES = new Set(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane']);

const finiteNumber = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

type DisplayNode = Node & {
  positionAbsolute?: XYPosition;
  measured?: { width?: number; height?: number };
};

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const samePoint = (a: FastPoint, b: FastPoint): boolean => (
  Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON
);

const compactPath = (path: FastPoint[]): FastPoint[] => {
  const deduped = path.filter((point, index) => index === 0 || !samePoint(point, path[index - 1]));
  if (deduped.length < 3) return deduped;
  const compacted = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = compacted[compacted.length - 1];
    const point = deduped[index];
    const next = deduped[index + 1];
    const sameX = Math.abs(previous.x - point.x) <= EPSILON && Math.abs(point.x - next.x) <= EPSILON;
    const sameY = Math.abs(previous.y - point.y) <= EPSILON && Math.abs(point.y - next.y) <= EPSILON;
    if (!sameX && !sameY) compacted.push(point);
  }
  compacted.push(deduped[deduped.length - 1]);
  return compacted;
};

const resolveNodePosition = (
  node: Node,
  nodeById: Map<string, Node>,
  seen = new Set<string>(),
): FastPoint => {
  const absolute = (node as DisplayNode).positionAbsolute;
  if (absolute) {
    return { x: finiteNumber(absolute.x), y: finiteNumber(absolute.y) };
  }
  const local = node.position ?? { x: 0, y: 0 };
  const position = { x: finiteNumber(local.x), y: finiteNumber(local.y) };
  const parentId = node.parentId;
  if (!parentId || seen.has(parentId)) return position;
  const parent = nodeById.get(parentId);
  if (!parent) return position;
  seen.add(parentId);
  const parentPosition = resolveNodePosition(parent, nodeById, seen);
  return { x: position.x + parentPosition.x, y: position.y + parentPosition.y };
};

const nodeRects = (nodes: Node[]): FastRect[] => {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  return nodes
  .filter(node => !CONTAINER_TYPES.has(String(node.type || '')))
  .map((node) => {
    const position = resolveNodePosition(node, nodeById);
    const displayNode = node as DisplayNode;
    const style = asRecord(node.style);
    const width = finiteNumber(displayNode.measured?.width ?? node.width ?? style.width);
    const height = finiteNumber(displayNode.measured?.height ?? node.height ?? style.height);
    return {
      id: node.id,
      x: finiteNumber(position.x) - OBSTACLE_PADDING,
      y: finiteNumber(position.y) - OBSTACLE_PADDING,
      width: width + OBSTACLE_PADDING * 2,
      height: height + OBSTACLE_PADDING * 2,
    };
  })
  .filter(rect => rect.width > OBSTACLE_PADDING * 2 + 1 && rect.height > OBSTACLE_PADDING * 2 + 1);
};

const segmentHitsRect = (a: FastPoint, b: FastPoint, rect: FastRect): boolean => {
  if (Math.abs(a.x - b.x) <= EPSILON) {
    const x = (a.x + b.x) / 2;
    return x > rect.x + EPSILON
      && x < rect.x + rect.width - EPSILON
      && Math.max(a.y, b.y) > rect.y + EPSILON
      && Math.min(a.y, b.y) < rect.y + rect.height - EPSILON;
  }
  if (Math.abs(a.y - b.y) <= EPSILON) {
    const y = (a.y + b.y) / 2;
    return y > rect.y + EPSILON
      && y < rect.y + rect.height - EPSILON
      && Math.max(a.x, b.x) > rect.x + EPSILON
      && Math.min(a.x, b.x) < rect.x + rect.width - EPSILON;
  }
  return true;
};

const relevantRects = (edge: Edge, rects: FastRect[]): FastRect[] => (
  rects.filter(rect => rect.id !== edge.source && rect.id !== edge.target)
);

const pathObstacleHits = (path: FastPoint[], rects: FastRect[]): number => {
  let hits = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    for (const rect of rects) {
      if (segmentHitsRect(path[index], path[index + 1], rect)) hits += 1;
    }
  }
  return hits;
};

const pathLength = (path: FastPoint[]): number => path.reduce((total, point, index) => {
  if (index === 0) return total;
  const previous = path[index - 1];
  return total + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
}, 0);

type FastSegment = Readonly<{
  axis: 'horizontal' | 'vertical';
  a: FastPoint;
  b: FastPoint;
}>;

const orthogonalSegments = (path: FastPoint[]): FastSegment[] => path
  .slice(0, -1)
  .flatMap<FastSegment>((point, index): FastSegment[] => {
    const next = path[index + 1];
    if (Math.abs(point.x - next.x) <= EPSILON) {
      return [{ axis: 'vertical' as const, a: point, b: next } satisfies FastSegment];
    }
    if (Math.abs(point.y - next.y) <= EPSILON) {
      return [{ axis: 'horizontal' as const, a: point, b: next } satisfies FastSegment];
    }
    return [];
  });

const strictlyBetween = (value: number, first: number, second: number): boolean => (
  value > Math.min(first, second) + EPSILON
  && value < Math.max(first, second) - EPSILON
);

const segmentsStrictlyCross = (first: FastSegment, second: FastSegment): boolean => {
  if (first.axis === second.axis) return false;
  const horizontal = first.axis === 'horizontal' ? first : second;
  const vertical = first.axis === 'vertical' ? first : second;
  return strictlyBetween(vertical.a.x, horizontal.a.x, horizontal.b.x)
    && strictlyBetween(horizontal.a.y, vertical.a.y, vertical.b.y);
};

const pathStrictCrossings = (
  path: FastPoint[],
  otherPaths: FastPoint[][],
): number => {
  const candidateSegments = orthogonalSegments(path);
  return otherPaths.reduce((total, otherPath) => {
    const otherSegments = orthogonalSegments(otherPath);
    return total + candidateSegments.reduce((candidateTotal, candidateSegment) => (
      candidateTotal + otherSegments.filter(otherSegment => (
        segmentsStrictlyCross(candidateSegment, otherSegment)
      )).length
    ), 0);
  }, 0);
};

const simplifyCrossingFreePath = (
  path: FastPoint[],
  rects: FastRect[],
  otherPaths: FastPoint[][],
): FastPoint[] => {
  if (path.length < 4) return path;
  const safe = (candidate: FastPoint[]): boolean => (
    pathObstacleHits(candidate, rects) === 0
    && pathStrictCrossings(candidate, otherPaths) === 0
  );
  const sourceStub = path[1];
  const targetStub = path.at(-2);
  if (!sourceStub || !targetStub) return path;
  const core = [sourceStub, ...path.slice(2, -2), targetStub];
  const simplified = [core[0]];
  let index = 0;
  while (index < core.length - 1) {
    let accepted: FastPoint[] | null = null;
    let acceptedIndex = index + 1;
    for (let nextIndex = core.length - 1; nextIndex > index; nextIndex -= 1) {
      const start = core[index];
      const end = core[nextIndex];
      const candidates = Math.abs(start.x - end.x) <= EPSILON
        || Math.abs(start.y - end.y) <= EPSILON
        ? [[start, end]]
        : [
            [start, { x: end.x, y: start.y }, end],
            [start, { x: start.x, y: end.y }, end],
          ];
      const best = candidates
        .filter(safe)
        .sort((first, second) => pathLength(first) - pathLength(second))[0];
      if (!best) continue;
      accepted = best;
      acceptedIndex = nextIndex;
      break;
    }
    if (!accepted) accepted = [core[index], core[index + 1]];
    simplified.push(...accepted.slice(1));
    index = acceptedIndex;
  }
  const result = compactPath([path[0], ...simplified, path.at(-1)!]);
  return safe(result) ? result : path;
};

const handleSide = (handle: string | null | undefined): string => (
  String(expandHandle(String(handle || '')) || '').toLowerCase()
);

const terminalStub = (
  point: FastPoint,
  handle: string | null | undefined,
  distance: number,
): FastPoint => {
  switch (handleSide(handle)) {
    case 'left': return { x: point.x - distance, y: point.y };
    case 'right': return { x: point.x + distance, y: point.y };
    case 'top': return { x: point.x, y: point.y - distance };
    case 'bottom': return { x: point.x, y: point.y + distance };
    default: return point;
  }
};

const findGridObstacleFallback = (
  edge: Edge,
  path: FastPoint[],
  rects: FastRect[],
  otherPaths: FastPoint[][],
): FastPoint[] | null => {
  const start = path[0];
  const end = path.at(-1);
  if (!start || !end) return null;
  const stubDistance = 24;
  const startStub = terminalStub(start, edge.sourceHandle, stubDistance);
  const endStub = terminalStub(end, edge.targetHandle, stubDistance);
  const coordinates = [start, end, startStub, endStub, ...path, ...otherPaths.flat()];
  const margin = 96;
  const bbox = {
    minX: Math.min(...coordinates.map(point => point.x), ...rects.map(rect => rect.x)) - margin,
    minY: Math.min(...coordinates.map(point => point.y), ...rects.map(rect => rect.y)) - margin,
    maxX: Math.max(
      ...coordinates.map(point => point.x),
      ...rects.map(rect => rect.x + rect.width),
    ) + margin,
    maxY: Math.max(
      ...coordinates.map(point => point.y),
      ...rects.map(rect => rect.y + rect.height),
    ) + margin,
  };
  const pathBarriers: FastRect[] = otherPaths.flatMap((otherPath, pathIndex) => {
    const sharesStart = otherPath.some(point => samePoint(point, start));
    const sharesEnd = otherPath.some(point => samePoint(point, end));
    return otherPath.slice(0, -1).flatMap((point, segmentIndex) => {
      const next = otherPath[segmentIndex + 1];
      if (
        (sharesStart && segmentIndex === 0)
        || (sharesEnd && segmentIndex === otherPath.length - 2)
      ) return [];
      if (Math.abs(point.x - next.x) <= EPSILON) {
        const length = Math.abs(next.y - point.y);
        return length <= 2 ? [] : [{
          id: `path-${pathIndex}-${segmentIndex}`,
          x: point.x - 1,
          y: Math.min(point.y, next.y) + 1,
          width: 2,
          height: length - 2,
        }];
      }
      if (Math.abs(point.y - next.y) <= EPSILON) {
        const length = Math.abs(next.x - point.x);
        return length <= 2 ? [] : [{
          id: `path-${pathIndex}-${segmentIndex}`,
          x: Math.min(point.x, next.x) + 1,
          y: point.y - 1,
          width: length - 2,
          height: 2,
        }];
      }
      return [];
    });
  });
  const hardObstacles = [...rects, ...pathBarriers];
  const finder = new PathFinder();
  let best: FastPoint[] | null = null;
  let bestStrict = Number.POSITIVE_INFINITY;
  let bestLength = Number.POSITIVE_INFINITY;
  for (const gridSize of [8, 12, 16]) {
    const routed = finder.findPath(
      bbox,
      startStub,
      endStub,
      gridSize,
      40_000,
      hardObstacles,
    );
    if (!routed) continue;
    let candidate = orthogonalizePath(
      edge,
      compactPath([start, startStub, ...routed, endStub, end]),
      rects,
    );
    candidate = simplifyCrossingFreePath(candidate, rects, otherPaths);
    if (pathObstacleHits(candidate, rects) > 0) continue;
    const strict = pathStrictCrossings(candidate, otherPaths);
    const length = pathLength(candidate);
    if (strict < bestStrict || (strict === bestStrict && length < bestLength)) {
      best = candidate;
      bestStrict = strict;
      bestLength = length;
    }
    if (bestStrict === 0) break;
  }
  return best;
};

const preferredDiagonalBend = (
  edge: Edge,
  segmentIndex: number,
  lastSegmentIndex: number,
  a: FastPoint,
  b: FastPoint,
): FastPoint | null => {
  if (segmentIndex === 0) {
    const side = handleSide(edge.sourceHandle);
    if (side === 'left' || side === 'right') return { x: b.x, y: a.y };
    if (side === 'top' || side === 'bottom') return { x: a.x, y: b.y };
  }
  if (segmentIndex === lastSegmentIndex) {
    const side = handleSide(edge.targetHandle);
    if (side === 'left' || side === 'right') return { x: a.x, y: b.y };
    if (side === 'top' || side === 'bottom') return { x: b.x, y: a.y };
  }
  return null;
};

const orthogonalizePath = (edge: Edge, path: FastPoint[], rects: FastRect[]): FastPoint[] => {
  const expanded: FastPoint[] = [path[0]];
  const lastSegmentIndex = path.length - 2;
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    if (Math.abs(a.x - b.x) > EPSILON && Math.abs(a.y - b.y) > EPSILON) {
      const preferred = preferredDiagonalBend(edge, index, lastSegmentIndex, a, b);
      const bends = preferred
        ? [preferred]
        : [{ x: b.x, y: a.y }, { x: a.x, y: b.y }];
      let best = bends[0];
      let bestHits = pathObstacleHits([a, best, b], rects);
      for (const bend of bends.slice(1)) {
        const hits = pathObstacleHits([a, bend, b], rects);
        if (hits < bestHits) {
          best = bend;
          bestHits = hits;
        }
      }
      expanded.push(best);
    }
    expanded.push(b);
  }
  return compactPath(expanded);
};

const firstObstacleHit = (path: FastPoint[], rects: FastRect[]) => {
  for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
    for (const rect of rects) {
      if (segmentHitsRect(path[segmentIndex], path[segmentIndex + 1], rect)) {
        return { segmentIndex, rect };
      }
    }
  }
  return null;
};

const pointInsideRect = (point: FastPoint, rect: FastRect): boolean => (
  point.x > rect.x + EPSILON
  && point.x < rect.x + rect.width - EPSILON
  && point.y > rect.y + EPSILON
  && point.y < rect.y + rect.height - EPSILON
);

const firstInteriorObstacleWaypoint = (path: FastPoint[], rects: FastRect[]) => {
  for (let pointIndex = 1; pointIndex < path.length - 1; pointIndex += 1) {
    for (const rect of rects) {
      if (pointInsideRect(path[pointIndex], rect)) return { pointIndex, rect };
    }
  }
  return null;
};

const interiorWaypointEscapeCandidates = (
  path: FastPoint[],
  pointIndex: number,
  rect: FastRect,
): FastPoint[][] => {
  const previous = path[pointIndex - 1];
  const next = path[pointIndex + 1];
  const prefix = path.slice(0, pointIndex - 1);
  const suffix = path.slice(pointIndex + 2);
  const corners = [
    { x: rect.x - LANE_CLEARANCE, y: rect.y - LANE_CLEARANCE },
    { x: rect.x + rect.width + LANE_CLEARANCE, y: rect.y - LANE_CLEARANCE },
    { x: rect.x - LANE_CLEARANCE, y: rect.y + rect.height + LANE_CLEARANCE },
    { x: rect.x + rect.width + LANE_CLEARANCE, y: rect.y + rect.height + LANE_CLEARANCE },
  ];
  return corners.flatMap(corner => [
    compactPath([
      ...prefix,
      previous,
      { x: corner.x, y: previous.y },
      corner,
      { x: next.x, y: corner.y },
      next,
      ...suffix,
    ]),
    compactPath([
      ...prefix,
      previous,
      { x: previous.x, y: corner.y },
      corner,
      { x: corner.x, y: next.y },
      next,
      ...suffix,
    ]),
  ]);
};

const detourCandidates = (
  path: FastPoint[],
  segmentIndex: number,
  rect: FastRect,
  allRects: FastRect[],
  otherPaths: FastPoint[][],
): FastPoint[][] => {
  const a = path[segmentIndex];
  const b = path[segmentIndex + 1];
  const prefix = path.slice(0, segmentIndex);
  const suffix = path.slice(segmentIndex + 2);
  if (Math.abs(a.x - b.x) <= EPSILON) {
    const direction = b.y >= a.y ? 1 : -1;
    const approachY = direction > 0 ? rect.y - LANE_CLEARANCE : rect.y + rect.height + LANE_CLEARANCE;
    const exitY = direction > 0 ? rect.y + rect.height + LANE_CLEARANCE : rect.y - LANE_CLEARANCE;
    const localLanes = [rect.x - LANE_CLEARANCE, rect.x + rect.width + LANE_CLEARANCE];
    const pathLanes = otherPaths
      .flatMap(otherPath => otherPath.flatMap(point => [
        point.x - LANE_CLEARANCE,
        point.x + LANE_CLEARANCE,
      ]));
    const rectLanes = allRects.flatMap(otherRect => [
        otherRect.x - LANE_CLEARANCE,
        otherRect.x + otherRect.width + LANE_CLEARANCE,
      ]);
    const expandedLanes = [...rectLanes, ...pathLanes]
      .filter(laneX => (
        laneX <= rect.x - LANE_CLEARANCE
        || laneX >= rect.x + rect.width + LANE_CLEARANCE
      ));
    const lanes = [...new Set([
      ...localLanes,
      ...rectLanes,
      ...expandedLanes
        .sort((first, second) => Math.abs(first - a.x) - Math.abs(second - a.x))
        .slice(0, 32),
    ])];
    return lanes.flatMap(laneX => [
      compactPath([
        ...prefix,
        a,
        { x: a.x, y: approachY },
        { x: laneX, y: approachY },
        { x: laneX, y: exitY },
        { x: a.x, y: exitY },
        b,
        ...suffix,
      ]),
      // A local skirt can still cut every edge entering or leaving the
      // obstacle. Reusing the incoming segment's own axis lets the route move
      // outside that feeder fan before it turns around the node.
      compactPath([
        ...prefix,
        a,
        { x: laneX, y: a.y },
        { x: laneX, y: exitY },
        { x: a.x, y: exitY },
        b,
        ...suffix,
      ]),
    ]);
  }
  const direction = b.x >= a.x ? 1 : -1;
  const approachX = direction > 0 ? rect.x - LANE_CLEARANCE : rect.x + rect.width + LANE_CLEARANCE;
  const exitX = direction > 0 ? rect.x + rect.width + LANE_CLEARANCE : rect.x - LANE_CLEARANCE;
  const localLanes = [rect.y - LANE_CLEARANCE, rect.y + rect.height + LANE_CLEARANCE];
  const pathLanes = otherPaths
    .flatMap(otherPath => otherPath.flatMap(point => [
      point.y - LANE_CLEARANCE,
      point.y + LANE_CLEARANCE,
    ]));
  const rectLanes = allRects.flatMap(otherRect => [
      otherRect.y - LANE_CLEARANCE,
      otherRect.y + otherRect.height + LANE_CLEARANCE,
    ]);
  const expandedLanes = [...rectLanes, ...pathLanes]
    .filter(laneY => (
      laneY <= rect.y - LANE_CLEARANCE
      || laneY >= rect.y + rect.height + LANE_CLEARANCE
    ));
  const lanes = [...new Set([
    ...localLanes,
    ...rectLanes,
    ...expandedLanes
      .sort((first, second) => Math.abs(first - a.y) - Math.abs(second - a.y))
      .slice(0, 32),
  ])];
  return lanes.flatMap(laneY => [
    compactPath([
      ...prefix,
      a,
      { x: approachX, y: a.y },
      { x: approachX, y: laneY },
      { x: exitX, y: laneY },
      { x: exitX, y: a.y },
      b,
      ...suffix,
    ]),
    compactPath([
      ...prefix,
      a,
      { x: a.x, y: laneY },
      { x: exitX, y: laneY },
      { x: exitX, y: a.y },
      b,
      ...suffix,
    ]),
  ]);
};

const repairObstacleHits = (
  path: FastPoint[],
  rects: FastRect[],
  strictCrossingScore: (candidate: FastPoint[]) => number = () => 0,
  otherPaths: FastPoint[][] = [],
): FastPoint[] => {
  let current = path;
  const maximumPasses = Math.max(1, Math.min(16, rects.length * 2));
  for (let pass = 0; pass < maximumPasses; pass += 1) {
    const interiorWaypoint = firstInteriorObstacleWaypoint(current, rects);
    if (interiorWaypoint) {
      const baselineHits = pathObstacleHits(current, rects);
      let best = current;
      let bestScore = baselineHits * 1_000_000_000_000
        + strictCrossingScore(current) * 1_000_000_000
        + pathLength(current)
        + current.length * 4;
      for (const candidate of interiorWaypointEscapeCandidates(
        current,
        interiorWaypoint.pointIndex,
        interiorWaypoint.rect,
      )) {
        const candidateHits = pathObstacleHits(candidate, rects);
        if (candidateHits >= baselineHits) continue;
        const score = candidateHits * 1_000_000_000_000
          + strictCrossingScore(candidate) * 1_000_000_000
          + pathLength(candidate)
          + candidate.length * 4;
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      if (best !== current) {
        current = best;
        continue;
      }
    }
    const hit = firstObstacleHit(current, rects);
    if (!hit) break;
    const baselineHits = pathObstacleHits(current, rects);
    let best = current;
    let bestScore = baselineHits * 1_000_000_000_000
      + strictCrossingScore(current) * 1_000_000_000
      + pathLength(current)
      + current.length * 4;
    for (const candidate of detourCandidates(
      current,
      hit.segmentIndex,
      hit.rect,
      rects,
      otherPaths,
    )) {
      const candidateHits = pathObstacleHits(candidate, rects);
      if (candidateHits >= baselineHits) continue;
      const score = candidateHits * 1_000_000_000_000
        + strictCrossingScore(candidate) * 1_000_000_000
        + pathLength(candidate)
        + candidate.length * 4;
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best === current) break;
    current = best;
  }
  return compactPath(current);
};

const fastComputedPath = (edge: Edge): FastPoint[] => {
  const value = asRecord(edge.data).computedPath;
  if (!Array.isArray(value)) return [];
  return value
    .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    .map(point => ({ x: Number(point.x), y: Number(point.y) }));
};

export const fastDisplayHardSafetyIsClean = (edges: Edge[], nodes: Node[]): boolean => {
  if (edges.length === 0 || nodes.length === 0) return false;
  const rects = nodeRects(nodes);
  return edges.every((edge) => {
    const path = fastComputedPath(edge);
    if (path.length < 2) return false;
    const isOrthogonal = path.slice(0, -1).every((point, index) => {
      const next = path[index + 1];
      return Math.abs(point.x - next.x) <= EPSILON || Math.abs(point.y - next.y) <= EPSILON;
    });
    return isOrthogonal && pathObstacleHits(path, relevantRects(edge, rects)) === 0;
  });
};

export const repairFastDisplayHardSafety = (edges: Edge[], nodes: Node[]): Edge[] => {
  if (edges.length === 0 || nodes.length === 0) return edges;
  const rects = nodeRects(nodes);
  let changed = false;
  const repairedEdges = [...edges];
  edges.forEach((edge, edgeIndex) => {
    const path = fastComputedPath(edge);
    if (path.length < 2) return;
    const obstacles = relevantRects(edge, rects);
    const orthogonal = orthogonalizePath(edge, path, obstacles);
    const otherPaths = repairedEdges.flatMap((otherEdge, otherIndex) => (
      otherIndex === edgeIndex ? [] : [fastComputedPath(otherEdge)]
    ));
    let repaired = repairObstacleHits(
      orthogonal,
      obstacles,
      candidate => pathStrictCrossings(candidate, otherPaths),
      otherPaths,
    );
    const baselineStrict = pathStrictCrossings(orthogonal, otherPaths);
    const repairedStrict = pathStrictCrossings(repaired, otherPaths);
    if (
      repairedStrict > baselineStrict
      && otherPaths.length <= GRID_FALLBACK_MAX_PEER_EDGES
    ) {
      const gridFallback = findGridObstacleFallback(edge, orthogonal, obstacles, otherPaths);
      if (
        gridFallback
        && pathStrictCrossings(gridFallback, otherPaths) < repairedStrict
      ) {
        repaired = gridFallback;
      }
    }
    if (repaired.length === path.length && repaired.every((point, index) => samePoint(point, path[index]))) {
      return;
    }
    const originalData = (edge.data || {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {
      ...originalData,
      computedPath: repaired,
      layoutPathLocked: true,
      fastHardSafetyRepaired: true,
    };
    const treeRouting = originalData.treeRouting;
    if (treeRouting && typeof treeRouting === 'object' && !Array.isArray(treeRouting)) {
      const treeRoutingRecord = treeRouting as Record<string, unknown>;
      if (Array.isArray(treeRoutingRecord.points)) {
        data.treeRouting = { ...treeRoutingRecord, points: repaired };
      }
    }
    changed = true;
    repairedEdges[edgeIndex] = { ...edge, data };
  });
  return changed ? repairedEdges : edges;
};
