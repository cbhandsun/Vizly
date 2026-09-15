import type { Edge } from '@xyflow/react';
import type { Point, Segment } from './edgePathQualityGeometry';

const EPS = 0.5;
const MIN_EDGE_PATH_PENALIZED_OVERLAP = 24;
const VISUAL_PARALLEL_LANE_TOLERANCE = 4;
const SHARED_TRUNK_COORDINATE_EPS = 1;

const sameTrunkPoint = (first: Point, second: Point): boolean => (
  Math.abs(first.x - second.x) <= SHARED_TRUNK_COORDINATE_EPS
  && Math.abs(first.y - second.y) <= SHARED_TRUNK_COORDINATE_EPS
);

const rangeOverlap = (a1: number, a2: number, b1: number, b2: number): number => (
  Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2))
    - Math.max(Math.min(a1, a2), Math.min(b1, b2)))
);

const parallelOverlap = (first: Segment, second: Segment): number => {
  if (first.axis !== second.axis) return 0;
  if (first.axis === 'h') {
    if (Math.abs(first.a.y - second.a.y) > VISUAL_PARALLEL_LANE_TOLERANCE) return 0;
    return rangeOverlap(first.a.x, first.b.x, second.a.x, second.b.x);
  }
  if (Math.abs(first.a.x - second.a.x) > VISUAL_PARALLEL_LANE_TOLERANCE) return 0;
  return rangeOverlap(first.a.y, first.b.y, second.a.y, second.b.y);
};

const adjacentSegment = (
  segments: readonly Segment[],
  segment: Segment,
  offset: -1 | 1,
): Segment | null => segments.find(candidate => (
  candidate.edgeIndex === segment.edgeIndex
  && candidate.segmentIndex === segment.segmentIndex + offset
)) ?? null;

const endpointChainContainsSegments = (
  firstSegment: Segment,
  secondSegment: Segment,
  firstSegments: readonly Segment[],
  secondSegments: readonly Segment[],
  target: boolean,
): boolean => {
  const firstOffset = target
    ? firstSegment.segmentCount - 1 - firstSegment.segmentIndex
    : firstSegment.segmentIndex;
  const secondOffset = target
    ? secondSegment.segmentCount - 1 - secondSegment.segmentIndex
    : secondSegment.segmentIndex;
  if (firstOffset !== secondOffset || firstOffset < 0) return false;

  for (let offset = 0; offset <= firstOffset; offset += 1) {
    const firstIndex = target ? firstSegment.segmentCount - 1 - offset : offset;
    const secondIndex = target ? secondSegment.segmentCount - 1 - offset : offset;
    const first = firstSegments.find(segment => segment.segmentIndex === firstIndex);
    const second = secondSegments.find(segment => segment.segmentIndex === secondIndex);
    if (!first || !second || first.axis !== second.axis) return false;
    const [firstStart, firstEnd] = target ? [first.b, first.a] : [first.a, first.b];
    const [secondStart, secondEnd] = target ? [second.b, second.a] : [second.a, second.b];
    if (!sameTrunkPoint(firstStart, secondStart)) return false;
    const firstDelta = first.axis === 'h'
      ? firstEnd.x - firstStart.x
      : firstEnd.y - firstStart.y;
    const secondDelta = second.axis === 'h'
      ? secondEnd.x - secondStart.x
      : secondEnd.y - secondStart.y;
    if (firstDelta * secondDelta <= EPS) return false;
    if (offset < firstOffset && !sameTrunkPoint(firstEnd, secondEnd)) return false;
  }
  return true;
};

const overlapTouchesSharedEndpointTrunk = (
  first: Edge,
  second: Edge,
  firstSegment: Segment,
  secondSegment: Segment,
  firstSegments: readonly Segment[],
  secondSegments: readonly Segment[],
): boolean => (
  first.source === second.source
  && endpointChainContainsSegments(firstSegment, secondSegment, firstSegments, secondSegments, false)
) || (
  first.target === second.target
  && endpointChainContainsSegments(firstSegment, secondSegment, firstSegments, secondSegments, true)
);

const terminalHandleSide = (value: string | null | undefined): string | null => {
  const token = typeof value === 'string' ? value.trim().toLowerCase()[0] : undefined;
  return token === 'l' || token === 'r' || token === 't' || token === 'b'
    ? token
    : null;
};

const hasDistinctSharedEndpointPorts = (first: Edge, second: Edge): boolean => {
  if (first.source === second.source) {
    const firstSide = terminalHandleSide(first.sourceHandle);
    const secondSide = terminalHandleSide(second.sourceHandle);
    return firstSide !== null && secondSide !== null && firstSide !== secondSide;
  }
  if (first.target === second.target) {
    const firstSide = terminalHandleSide(first.targetHandle);
    const secondSide = terminalHandleSide(second.targetHandle);
    return firstSide !== null && secondSide !== null && firstSide !== secondSide;
  }
  return false;
};

const isInternalContainedSegment = (
  contained: Segment,
  carrier: Segment,
  containedSegments: readonly Segment[],
  overlap: number,
): boolean => {
  if (
    contained.axis !== carrier.axis
    || Math.abs(contained.length - overlap) > EPS
    || contained.segmentIndex <= 0
    || contained.segmentIndex >= contained.segmentCount - 1
  ) return false;
  const before = adjacentSegment(containedSegments, contained, -1);
  const after = adjacentSegment(containedSegments, contained, 1);
  return Boolean(
    before
    && after
    && before.axis !== contained.axis
    && after.axis !== contained.axis,
  );
};

/**
 * Two distinct ports on the same endpoint may deliberately merge into one
 * directed internal corridor before branching again. Treat the fully
 * contained corridor as a real peer trunk; a partial overlap or a same-port
 * leave-and-rejoin remains an unexplained hard defect.
 */
const overlapFormsContainedPeerTrunk = (
  first: Edge,
  second: Edge,
  firstSegment: Segment,
  secondSegment: Segment,
  firstSegments: readonly Segment[],
  secondSegments: readonly Segment[],
): boolean => {
  if (!hasDistinctSharedEndpointPorts(first, second)) return false;
  const overlap = parallelOverlap(firstSegment, secondSegment);
  return isInternalContainedSegment(firstSegment, secondSegment, firstSegments, overlap)
    || isInternalContainedSegment(secondSegment, firstSegment, secondSegments, overlap);
};

const directedSegmentPoint = (segment: Segment, atTarget: boolean): Point => (
  atTarget ? segment.b : segment.a
);

const segmentPointsShareAxisLine = (first: Segment, second: Segment): boolean => {
  if (first.axis !== second.axis) return false;
  return first.axis === 'h'
    ? Math.abs(first.a.y - second.a.y) <= SHARED_TRUNK_COORDINATE_EPS
    : Math.abs(first.a.x - second.a.x) <= SHARED_TRUNK_COORDINATE_EPS;
};

const overlapTouchesDirectedEndpointSide = (
  firstSegment: Segment,
  secondSegment: Segment,
  atTarget: boolean,
  overlap: number,
): boolean => {
  if (overlap < MIN_EDGE_PATH_PENALIZED_OVERLAP) return false;
  const firstPoint = directedSegmentPoint(firstSegment, atTarget);
  const secondPoint = directedSegmentPoint(secondSegment, atTarget);
  return sameTrunkPoint(firstPoint, secondPoint);
};

/**
 * Same-endpoint fan-out/fan-in edges may share a directed middle trunk even
 * when earlier orthogonal setup segments give them different segment indexes.
 * The shared span must start from the same source-facing point or end at the
 * same target-facing point, stay on the same rendered line, and keep the same
 * direction. Partial re-merges remain unexplained related overlaps.
 */
const overlapFormsSameEndpointDirectedTrunk = (
  first: Edge,
  second: Edge,
  firstSegment: Segment,
  secondSegment: Segment,
): boolean => {
  if (
    firstSegment.direction === 0
    || secondSegment.direction === 0
    || firstSegment.direction !== secondSegment.direction
    || !segmentPointsShareAxisLine(firstSegment, secondSegment)
  ) return false;

  const overlap = parallelOverlap(firstSegment, secondSegment);
  return (
    first.source === second.source
    && overlapTouchesDirectedEndpointSide(firstSegment, secondSegment, false, overlap)
  ) || (
    first.target === second.target
    && overlapTouchesDirectedEndpointSide(firstSegment, secondSegment, true, overlap)
  );
};

const sharedEndpointHandle = (
  first: Edge,
  second: Edge,
  atTarget: boolean,
): string | null => {
  const firstHandle = atTarget ? first.targetHandle : first.sourceHandle;
  const secondHandle = atTarget ? second.targetHandle : second.sourceHandle;
  return typeof firstHandle === 'string'
    && firstHandle.length > 0
    && firstHandle === secondHandle
    ? firstHandle
    : null;
};

const endpointPointsShareAxisCoordinate = (
  firstSegment: Segment,
  secondSegment: Segment,
  atTarget: boolean,
): boolean => {
  const firstPoint = directedSegmentPoint(firstSegment, atTarget);
  const secondPoint = directedSegmentPoint(secondSegment, atTarget);
  return firstSegment.axis === 'h'
    ? Math.abs(firstPoint.x - secondPoint.x) <= EPS
      && Math.abs(firstPoint.y - secondPoint.y) <= VISUAL_PARALLEL_LANE_TOLERANCE
    : Math.abs(firstPoint.y - secondPoint.y) <= EPS
      && Math.abs(firstPoint.x - secondPoint.x) <= VISUAL_PARALLEL_LANE_TOLERANCE;
};

/**
 * The overlap scanner intentionally treats lines within a few pixels as the
 * same visual lane. When two related edges enter or leave the exact same
 * endpoint handle on that lane, classify the near-pixel fan-in/fan-out as an
 * explained terminal trunk instead of a hard geometry failure.
 */
const overlapFormsSameHandleTerminalTrunk = (
  first: Edge,
  second: Edge,
  firstSegment: Segment,
  secondSegment: Segment,
): boolean => {
  if (
    firstSegment.direction === 0
    || secondSegment.direction === 0
    || firstSegment.direction !== secondSegment.direction
    || parallelOverlap(firstSegment, secondSegment) < MIN_EDGE_PATH_PENALIZED_OVERLAP
  ) return false;

  return (
    first.source === second.source
    && sharedEndpointHandle(first, second, false) !== null
    && endpointPointsShareAxisCoordinate(firstSegment, secondSegment, false)
  ) || (
    first.target === second.target
    && sharedEndpointHandle(first, second, true) !== null
    && endpointPointsShareAxisCoordinate(firstSegment, secondSegment, true)
  );
};

export const isPermittedRelatedOverlap = (
  first: Edge,
  second: Edge,
  firstSegment: Segment,
  secondSegment: Segment,
  firstSegments: readonly Segment[],
  secondSegments: readonly Segment[],
): boolean => {
  if (
    firstSegment.direction !== 0
    && secondSegment.direction !== 0
    && firstSegment.direction !== secondSegment.direction
  ) {
    return false;
  }
  return overlapTouchesSharedEndpointTrunk(
    first,
    second,
    firstSegment,
    secondSegment,
    firstSegments,
    secondSegments,
  ) || overlapFormsContainedPeerTrunk(
    first,
    second,
    firstSegment,
    secondSegment,
    firstSegments,
    secondSegments,
  ) || overlapFormsSameEndpointDirectedTrunk(
    first,
    second,
    firstSegment,
    secondSegment,
  ) || overlapFormsSameHandleTerminalTrunk(
    first,
    second,
    firstSegment,
    secondSegment,
  );
};
