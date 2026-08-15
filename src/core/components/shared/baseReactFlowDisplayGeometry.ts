import type { Edge, Node, XYPosition } from '@xyflow/react';

import {
  compactOrthogonalPath,
  isFinitePoint,
} from './baseReactFlowDisplayEdgeCore';

export type DisplayPoint = { x: number; y: number };
export type DisplaySegment = {
  edgeIndex: number;
  segmentIndex: number;
  axis: 'h' | 'v';
  direction: -1 | 0 | 1;
  a: DisplayPoint;
  b: DisplayPoint;
};
export type DisplayRect = { x: number; y: number; width: number; height: number };

export const NEAR_PARALLEL_LANE_TOLERANCE = 4;
export const OBSTACLE_REPAIR_NODE_PADDING = 8;
export const RESIDUAL_PARALLEL_LANE_GAP = 24;
const SHARED_TRUNK_COORDINATE_EPS = NEAR_PARALLEL_LANE_TOLERANCE;
const STRICT_CROSSING_INTERIOR_EPS = 0.5;

const DISPLAY_CONTAINER_NODE_TYPES = new Set([
  'titleGroup',
  'subGroup',
  'group',
  'domain',
  'subDomain',
  'swimlane',
]);

const displayRoutingObstaclesCache = new WeakMap<Node[], {
  signature: string;
  obstacles: Map<string, DisplayRect>;
}>();

const displayNodeNumber = (value: unknown, fallback = 0): number => (
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

export const isDisplayContainerNode = (node: Node): boolean => (
  DISPLAY_CONTAINER_NODE_TYPES.has(String(node.type ?? ''))
);

export const getDisplayNodeRect = (node: Node): DisplayRect | null => {
  const displayNode = node as DisplayNode;
  const position = displayNode.positionAbsolute ?? node.position ?? { x: 0, y: 0 };
  const style = asRecord(node.style);
  const width = displayNodeNumber(displayNode.measured?.width ?? node.width ?? style.width);
  const height = displayNodeNumber(displayNode.measured?.height ?? node.height ?? style.height);
  if (width <= 1 || height <= 1) return null;
  return {
    x: displayNodeNumber(position.x),
    y: displayNodeNumber(position.y),
    width,
    height,
  };
};

export const displayRoutingObstaclesSignature = (nodes: Node[]): string => JSON.stringify(
  nodes.map((node) => {
    const rect = getDisplayNodeRect(node);
    return [
      node.id,
      isDisplayContainerNode(node),
      rect ? [rect.x, rect.y, rect.width, rect.height] : null,
    ];
  }),
);

export const buildDisplayRoutingObstacles = (nodes: Node[]): Map<string, DisplayRect> => {
  const signature = displayRoutingObstaclesSignature(nodes);
  const cached = displayRoutingObstaclesCache.get(nodes);
  if (cached?.signature === signature) return cached.obstacles;
  const obstacles = new Map<string, DisplayRect>();
  for (const node of nodes) {
    if (isDisplayContainerNode(node)) continue;
    const rect = getDisplayNodeRect(node);
    if (rect) obstacles.set(node.id, rect);
  }
  displayRoutingObstaclesCache.set(nodes, { signature, obstacles });
  return obstacles;
};

export const compactDisplayEdgePaths = <T extends Edge[]>(edges: T): T => {
  let changed = false;
  const compactedEdges = edges.map((edge) => {
    const data = asRecord(edge.data);
    const path = data.computedPath;
    if (!Array.isArray(path) || path.length < 3 || !path.every(isFinitePoint)) return edge;
    const compacted = compactOrthogonalPath(path);
    if (compacted.length === path.length && compacted.every((point, index) => (
      Math.abs(point.x - path[index].x) <= 0.5 && Math.abs(point.y - path[index].y) <= 0.5
    ))) {
      return edge;
    }
    changed = true;
    return {
      ...edge,
      data: {
        ...data,
        computedPath: compacted,
        treeRouting: Array.isArray(asRecord(data.treeRouting).points)
          ? { ...asRecord(data.treeRouting), points: compacted }
          : data.treeRouting,
      },
    };
  }) as T;
  return changed ? compactedEdges : edges;
};

export const getDisplayComputedPath = (edge: Edge): DisplayPoint[] => {
  const path = asRecord(edge.data).computedPath;
  return Array.isArray(path) && path.every(isFinitePoint) ? path : [];
};

export const withDisplayComputedPath = (edge: Edge, path: DisplayPoint[]): Edge => {
  const compactedPath = compactOrthogonalPath(path);
  const treeRouting = asRecord(edge.data).treeRouting;
  const treeRoutingRecord = asRecord(treeRouting);
  return {
    ...edge,
    data: {
      ...(edge.data || {}),
      computedPath: compactedPath,
      treeRouting: Array.isArray(treeRoutingRecord.points)
        ? { ...treeRoutingRecord, points: compactedPath }
        : treeRouting,
    },
  };
};

export const displayAxisOf = (first: DisplayPoint, second: DisplayPoint): 'h' | 'v' | null => {
  if (Math.abs(first.y - second.y) <= 0.5 && Math.abs(first.x - second.x) > 0.5) return 'h';
  if (Math.abs(first.x - second.x) <= 0.5 && Math.abs(first.y - second.y) > 0.5) return 'v';
  return null;
};

export const displaySegmentDirection = (
  first: DisplayPoint,
  second: DisplayPoint,
  axis: 'h' | 'v',
): -1 | 0 | 1 => {
  const delta = axis === 'h' ? second.x - first.x : second.y - first.y;
  if (Math.abs(delta) <= 0.5) return 0;
  return delta > 0 ? 1 : -1;
};

export const displayPathLength = (path: DisplayPoint[]): number => {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    total += Math.abs(path[index + 1].x - path[index].x) + Math.abs(path[index + 1].y - path[index].y);
  }
  return total;
};

export const segmentDisplayLength = (first: DisplayPoint, second: DisplayPoint): number => (
  Math.abs(first.x - second.x) + Math.abs(first.y - second.y)
);

export const countDisplayShortEndpointStubs = (edges: Edge[], minLength: number): number => (
  edges.reduce((total, edge) => {
    const path = getDisplayComputedPath(edge);
    if (path.length < 3) return total;
    return total
      + (segmentDisplayLength(path[0], path[1]) < minLength ? 1 : 0)
      + (segmentDisplayLength(path[path.length - 2], path[path.length - 1]) < minLength ? 1 : 0);
  }, 0)
);

export const displayRangeOverlap = (a1: number, a2: number, b1: number, b2: number): number => (
  Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2))
    - Math.max(Math.min(a1, a2), Math.min(b1, b2)))
);

export const rangesOverlapWithMargin = (
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
  margin = 0,
): boolean => (
  Math.max(Math.min(firstStart, firstEnd), Math.min(secondStart, secondEnd)) - margin
  <= Math.min(Math.max(firstStart, firstEnd), Math.max(secondStart, secondEnd)) + margin
);

export const displaySegmentOverlap = (first: DisplaySegment, second: DisplaySegment): number => {
  if (first.axis !== second.axis) return 0;
  if (first.axis === 'h') {
    if (Math.abs(first.a.y - second.a.y) > NEAR_PARALLEL_LANE_TOLERANCE) return 0;
    return displayRangeOverlap(first.a.x, first.b.x, second.a.x, second.b.x);
  }
  if (Math.abs(first.a.x - second.a.x) > NEAR_PARALLEL_LANE_TOLERANCE) return 0;
  return displayRangeOverlap(first.a.y, first.b.y, second.a.y, second.b.y);
};

export const displayEdgesRelated = (first: Edge, second: Edge): boolean => (
  first.source === second.source
  || first.target === second.target
  || first.source === second.target
  || first.target === second.source
);

export const displaySegmentsForPath = (
  path: DisplayPoint[],
  edgeIndex: number,
): DisplaySegment[] => {
  const segments: DisplaySegment[] = [];
  for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
    const axis = displayAxisOf(path[segmentIndex], path[segmentIndex + 1]);
    if (!axis) continue;
    segments.push({
      edgeIndex,
      segmentIndex,
      axis,
      direction: displaySegmentDirection(path[segmentIndex], path[segmentIndex + 1], axis),
      a: path[segmentIndex],
      b: path[segmentIndex + 1],
    });
  }
  return segments;
};

/**
 * A shared endpoint alone does not make an overlap a trunk. Every preceding
 * source segment (or following target segment) must be the same directed
 * geometric chain. This mirrors the rendered audit and keeps source/target
 * identities independent for dual-trunk edges.
 */
export const isProtectedDisplaySharedTrunkPair = (
  first: DisplaySegment,
  firstPath: DisplayPoint[],
  firstEdge: Edge,
  second: DisplaySegment,
  secondPath: DisplayPoint[],
  secondEdge: Edge,
): boolean => {
  const chainContains = (target: boolean): boolean => {
    const firstOffset = target
      ? firstPath.length - 2 - first.segmentIndex
      : first.segmentIndex;
    const secondOffset = target
      ? secondPath.length - 2 - second.segmentIndex
      : second.segmentIndex;
    if (firstOffset !== secondOffset || firstOffset < 0) return false;
    const firstSegments = displaySegmentsForPath(firstPath, first.edgeIndex);
    const secondSegments = displaySegmentsForPath(secondPath, second.edgeIndex);
    for (let offset = 0; offset <= firstOffset; offset += 1) {
      const firstIndex = target ? firstPath.length - 2 - offset : offset;
      const secondIndex = target ? secondPath.length - 2 - offset : offset;
      const firstPart = firstSegments.find(segment => segment.segmentIndex === firstIndex);
      const secondPart = secondSegments.find(segment => segment.segmentIndex === secondIndex);
      if (!firstPart || !secondPart || firstPart.axis !== secondPart.axis) return false;
      const [firstStart, firstEnd] = target
        ? [firstPart.b, firstPart.a]
        : [firstPart.a, firstPart.b];
      const [secondStart, secondEnd] = target
        ? [secondPart.b, secondPart.a]
        : [secondPart.a, secondPart.b];
      if (
        Math.abs(firstStart.x - secondStart.x) > SHARED_TRUNK_COORDINATE_EPS
        || Math.abs(firstStart.y - secondStart.y) > SHARED_TRUNK_COORDINATE_EPS
      ) return false;
      const firstDelta = firstPart.axis === 'h'
        ? firstEnd.x - firstStart.x
        : firstEnd.y - firstStart.y;
      const secondDelta = secondPart.axis === 'h'
        ? secondEnd.x - secondStart.x
        : secondEnd.y - secondStart.y;
      if (firstDelta * secondDelta <= 0.5) return false;
      if (
        offset < firstOffset
        && (
          Math.abs(firstEnd.x - secondEnd.x) > SHARED_TRUNK_COORDINATE_EPS
          || Math.abs(firstEnd.y - secondEnd.y) > SHARED_TRUNK_COORDINATE_EPS
        )
      ) return false;
    }
    return true;
  };
  return (firstEdge.source === secondEdge.source && chainContains(false))
    || (firstEdge.target === secondEdge.target && chainContains(true));
};

export const extractDisplaySegments = (edges: Edge[]): DisplaySegment[] => (
  edges.flatMap((edge, edgeIndex) => displaySegmentsForPath(getDisplayComputedPath(edge), edgeIndex))
);

export const displayStrictCrossesHorizontal = (
  horizontalStart: DisplayPoint,
  horizontalEnd: DisplayPoint,
  vertical: DisplaySegment,
): boolean => {
  if (vertical.axis !== 'v') return false;
  const x = vertical.a.x;
  const y = horizontalStart.y;
  return x > Math.min(horizontalStart.x, horizontalEnd.x) + STRICT_CROSSING_INTERIOR_EPS
    && x < Math.max(horizontalStart.x, horizontalEnd.x) - STRICT_CROSSING_INTERIOR_EPS
    && y > Math.min(vertical.a.y, vertical.b.y) + STRICT_CROSSING_INTERIOR_EPS
    && y < Math.max(vertical.a.y, vertical.b.y) - STRICT_CROSSING_INTERIOR_EPS;
};

export const displayStrictCrossesVertical = (
  verticalStart: DisplayPoint,
  verticalEnd: DisplayPoint,
  horizontal: DisplaySegment,
): boolean => {
  if (horizontal.axis !== 'h') return false;
  const x = verticalStart.x;
  const y = horizontal.a.y;
  return x > Math.min(horizontal.a.x, horizontal.b.x) + STRICT_CROSSING_INTERIOR_EPS
    && x < Math.max(horizontal.a.x, horizontal.b.x) - STRICT_CROSSING_INTERIOR_EPS
    && y > Math.min(verticalStart.y, verticalEnd.y) + STRICT_CROSSING_INTERIOR_EPS
    && y < Math.max(verticalStart.y, verticalEnd.y) - STRICT_CROSSING_INTERIOR_EPS;
};

export const findDisplayStrictCrossingHits = (
  edges: Edge[],
): Array<{ a: DisplaySegment; b: DisplaySegment }> => {
  const segments = extractDisplaySegments(edges);
  const hits: Array<{ a: DisplaySegment; b: DisplaySegment }> = [];
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      const first = segments[firstIndex];
      const second = segments[secondIndex];
      if (first.edgeIndex === second.edgeIndex || first.axis === second.axis) continue;
      const crosses = first.axis === 'h'
        ? displayStrictCrossesHorizontal(first.a, first.b, second)
        : displayStrictCrossesVertical(first.a, first.b, second);
      if (crosses) hits.push({ a: first, b: second });
    }
  }
  return hits;
};

export const candidateUnrelatedOverlapForEdge = (
  edgeIndex: number,
  path: DisplayPoint[],
  edges: Edge[],
  otherSegments: DisplaySegment[],
): number => {
  const edge = edges[edgeIndex];
  if (!edge) return 0;
  const candidateSegments = displaySegmentsForPath(path, edgeIndex);
  if (candidateSegments.length === 0) return 0;
  let overlap = 0;
  for (const first of candidateSegments) {
    for (const second of otherSegments) {
      const otherEdge = edges[second.edgeIndex];
      if (!otherEdge || displayEdgesRelated(edge, otherEdge)) continue;
      overlap += displaySegmentOverlap(first, second);
    }
  }
  return overlap;
};

export const candidateStrictCrossingsForEdge = (
  edgeIndex: number,
  path: DisplayPoint[],
  otherSegments: DisplaySegment[],
): number => {
  const candidateSegments = displaySegmentsForPath(path, edgeIndex);
  if (candidateSegments.length === 0) return 0;
  let crossings = 0;
  for (const first of candidateSegments) {
    for (const second of otherSegments) {
      if (first.axis === 'h') {
        if (displayStrictCrossesHorizontal(first.a, first.b, second)) crossings += 1;
      } else if (displayStrictCrossesVertical(first.a, first.b, second)) {
        crossings += 1;
      }
    }
  }
  return crossings;
};

export type DisplayCandidateInteractionCounts = Readonly<{
  strictCrossings: number;
  unrelatedOverlap: number;
}>;

export type DisplayCandidateInteractionContext = Readonly<{
  evaluate: (path: DisplayPoint[]) => DisplayCandidateInteractionCounts;
}>;

type DisplayCandidateInteractionSegment = Readonly<{
  fixed: number;
  min: number;
  max: number;
}>;

const compileDisplayCandidateInteractionSegment = (
  segment: DisplaySegment,
): DisplayCandidateInteractionSegment => (
  segment.axis === 'h'
    ? {
        fixed: segment.a.y,
        min: Math.min(segment.a.x, segment.b.x),
        max: Math.max(segment.a.x, segment.b.x),
      }
    : {
        fixed: segment.a.x,
        min: Math.min(segment.a.y, segment.b.y),
        max: Math.max(segment.a.y, segment.b.y),
      }
);

/**
 * Reuses the mover-independent half of candidate interaction scoring. The
 * numeric axis partitions preserve the original segment order, so overlap
 * accumulation and strict-crossing boundary behavior stay identical to the
 * standalone scorers without allocating candidate segment objects. The
 * returned context snapshots segment geometry and edge relationships.
 */
export const createDisplayCandidateInteractionContext = (
  edgeIndex: number,
  edges: Edge[],
  otherSegments: DisplaySegment[],
): DisplayCandidateInteractionContext => {
  const edge = edges[edgeIndex];
  const horizontalSegments: DisplayCandidateInteractionSegment[] = [];
  const verticalSegments: DisplayCandidateInteractionSegment[] = [];
  const unrelatedHorizontalSegments: DisplayCandidateInteractionSegment[] = [];
  const unrelatedVerticalSegments: DisplayCandidateInteractionSegment[] = [];

  for (const segment of otherSegments) {
    const compiled = compileDisplayCandidateInteractionSegment(segment);
    if (segment.axis === 'h') horizontalSegments.push(compiled);
    else verticalSegments.push(compiled);
    if (!edge) continue;
    const otherEdge = edges[segment.edgeIndex];
    if (!otherEdge || displayEdgesRelated(edge, otherEdge)) continue;
    if (segment.axis === 'h') unrelatedHorizontalSegments.push(compiled);
    else unrelatedVerticalSegments.push(compiled);
  }

  return {
    evaluate: (path: DisplayPoint[]): DisplayCandidateInteractionCounts => {
      let strictCrossings = 0;
      let unrelatedOverlap = 0;
      for (let index = 0; index < path.length - 1; index += 1) {
        const first = path[index];
        const second = path[index + 1];
        if (Math.abs(first.y - second.y) <= 0.5 && Math.abs(first.x - second.x) > 0.5) {
          const fixed = first.y;
          const min = Math.min(first.x, second.x);
          const max = Math.max(first.x, second.x);
          for (const other of verticalSegments) {
            if (
              other.fixed > min + STRICT_CROSSING_INTERIOR_EPS
              && other.fixed < max - STRICT_CROSSING_INTERIOR_EPS
              && fixed > other.min + STRICT_CROSSING_INTERIOR_EPS
              && fixed < other.max - STRICT_CROSSING_INTERIOR_EPS
            ) {
              strictCrossings += 1;
            }
          }
          for (const other of unrelatedHorizontalSegments) {
            if (Math.abs(fixed - other.fixed) > NEAR_PARALLEL_LANE_TOLERANCE) continue;
            unrelatedOverlap += Math.max(
              0,
              Math.min(max, other.max) - Math.max(min, other.min),
            );
          }
        } else if (
          Math.abs(first.x - second.x) <= 0.5
          && Math.abs(first.y - second.y) > 0.5
        ) {
          const fixed = first.x;
          const min = Math.min(first.y, second.y);
          const max = Math.max(first.y, second.y);
          for (const other of horizontalSegments) {
            if (
              fixed > other.min + STRICT_CROSSING_INTERIOR_EPS
              && fixed < other.max - STRICT_CROSSING_INTERIOR_EPS
              && other.fixed > min + STRICT_CROSSING_INTERIOR_EPS
              && other.fixed < max - STRICT_CROSSING_INTERIOR_EPS
            ) {
              strictCrossings += 1;
            }
          }
          for (const other of unrelatedVerticalSegments) {
            if (Math.abs(fixed - other.fixed) > NEAR_PARALLEL_LANE_TOLERANCE) continue;
            unrelatedOverlap += Math.max(
              0,
              Math.min(max, other.max) - Math.max(min, other.min),
            );
          }
        }
      }
      return { strictCrossings, unrelatedOverlap };
    },
  };
};

export const displaySegmentIntersectsRect = (
  first: DisplayPoint,
  second: DisplayPoint,
  rect: DisplayRect,
  padding = OBSTACLE_REPAIR_NODE_PADDING,
): boolean => {
  const left = rect.x - padding;
  const right = rect.x + rect.width + padding;
  const top = rect.y - padding;
  const bottom = rect.y + rect.height + padding;
  if (Math.abs(first.y - second.y) <= 1) {
    const y = first.y;
    if (y <= top || y >= bottom) return false;
    return Math.max(Math.min(first.x, second.x), left) < Math.min(Math.max(first.x, second.x), right);
  }
  if (Math.abs(first.x - second.x) <= 1) {
    const x = first.x;
    if (x <= left || x >= right) return false;
    return Math.max(Math.min(first.y, second.y), top) < Math.min(Math.max(first.y, second.y), bottom);
  }
  return false;
};

export const sortedUniqueNumbers = (values: number[], preferred: number): number[] => (
  [...new Set(values.filter(Number.isFinite).map(value => Math.round(value)))]
    .sort((first, second) => Math.abs(first - preferred) - Math.abs(second - preferred))
);

export const prioritizeLaneValues = (
  preferred: number,
  priorityValues: number[],
  secondaryValues: number[],
  maxLanes: number,
): number[] => {
  const lanes: number[] = [];
  const seen = new Set<number>();
  const append = (values: number[]) => {
    for (const value of sortedUniqueNumbers(values, preferred)) {
      if (seen.has(value)) continue;
      seen.add(value);
      lanes.push(value);
      if (lanes.length >= maxLanes) return;
    }
  };
  append(priorityValues);
  if (lanes.length < maxLanes) append(secondaryValues);
  return lanes;
};

export const collectPathHitObstacleRects = (
  path: DisplayPoint[],
  obstacles: DisplayRect[],
): DisplayRect[] => {
  const hitRects: DisplayRect[] = [];
  const seen = new Set<string>();
  for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
    const start = path[segmentIndex];
    const end = path[segmentIndex + 1];
    if (!displayAxisOf(start, end)) continue;
    for (const rect of obstacles) {
      if (!displaySegmentIntersectsRect(start, end, rect)) continue;
      const key = `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hitRects.push(rect);
    }
  }
  return hitRects;
};

export const shiftDisplayInternalSegment = (
  path: DisplayPoint[],
  segmentIndex: number,
  axis: 'h' | 'v',
  laneValue: number,
): DisplayPoint[] | null => {
  if (segmentIndex <= 0 || segmentIndex >= path.length - 2) return null;
  const shifted = path.map(point => ({ ...point }));
  if (axis === 'h') {
    shifted[segmentIndex].y = laneValue;
    shifted[segmentIndex + 1].y = laneValue;
  } else {
    shifted[segmentIndex].x = laneValue;
    shifted[segmentIndex + 1].x = laneValue;
  }
  const compacted = compactOrthogonalPath(shifted);
  return compacted.length >= 2 && compacted.every(isFinitePoint) ? compacted : null;
};

export const fullDisplayPortSide = (
  side: 'l' | 'r' | 't' | 'b' | undefined,
): 'left' | 'right' | 'top' | 'bottom' | undefined => {
  if (side === 'l') return 'left';
  if (side === 'r') return 'right';
  if (side === 't') return 'top';
  if (side === 'b') return 'bottom';
  return undefined;
};

export const oppositeDisplayPortSide = (
  side: 'l' | 'r' | 't' | 'b',
): 'left' | 'right' | 'top' | 'bottom' => {
  if (side === 'l') return 'right';
  if (side === 'r') return 'left';
  if (side === 't') return 'bottom';
  return 'top';
};

export const displayPointsCoincide = (
  first: DisplayPoint | undefined,
  second: DisplayPoint | undefined,
): boolean => (
  Boolean(first && second)
  && Math.abs(first!.x - second!.x) <= 0.5
  && Math.abs(first!.y - second!.y) <= 0.5
);
