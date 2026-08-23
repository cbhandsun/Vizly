import type { Edge } from '@xyflow/react';

export type EndpointLanePoint = { x: number; y: number };
export type EndpointLaneSegment = { a: EndpointLanePoint; b: EndpointLanePoint };

export type EndpointLaneInteractionMetrics = {
  crossings: number;
  totalCrossings: number;
  oppositeOverlap: number;
};

export type EndpointLaneInteractionContext = {
  evaluate: (path: readonly EndpointLanePoint[]) => EndpointLaneInteractionMetrics;
  readMetrics: () => Readonly<{
    evaluationCount: number;
    scannedSegmentCount: number;
  }>;
};

const EPS = 0.5;

export function endpointLaneAxisOf(
  a: EndpointLanePoint,
  b: EndpointLanePoint,
): 'h' | 'v' | null {
  if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
}

export function endpointLaneToSegments(
  path: readonly EndpointLanePoint[],
): EndpointLaneSegment[] {
  const segments: EndpointLaneSegment[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    if (endpointLaneAxisOf(path[index], path[index + 1])) {
      segments.push({ a: path[index], b: path[index + 1] });
    }
  }
  return segments;
}

export function endpointLaneStrictCrosses(
  first: EndpointLaneSegment,
  second: EndpointLaneSegment,
): boolean {
  const firstAxis = endpointLaneAxisOf(first.a, first.b);
  const secondAxis = endpointLaneAxisOf(second.a, second.b);
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

export function endpointLaneSegmentDirection(segment: EndpointLaneSegment): number {
  const axis = endpointLaneAxisOf(segment.a, segment.b);
  if (axis === 'v') return Math.sign(segment.b.y - segment.a.y);
  if (axis === 'h') return Math.sign(segment.b.x - segment.a.x);
  return 0;
}

export function endpointLaneParallelOverlapLength(
  first: EndpointLaneSegment,
  second: EndpointLaneSegment,
): number {
  const firstAxis = endpointLaneAxisOf(first.a, first.b);
  const secondAxis = endpointLaneAxisOf(second.a, second.b);
  if (!firstAxis || firstAxis !== secondAxis) return 0;
  if (firstAxis === 'h') {
    if (Math.abs(first.a.y - second.a.y) > EPS) return 0;
    return Math.max(0, Math.min(Math.max(first.a.x, first.b.x), Math.max(second.a.x, second.b.x))
      - Math.max(Math.min(first.a.x, first.b.x), Math.min(second.a.x, second.b.x)));
  }
  if (Math.abs(first.a.x - second.a.x) > EPS) return 0;
  return Math.max(0, Math.min(Math.max(first.a.y, first.b.y), Math.max(second.a.y, second.b.y))
    - Math.max(Math.min(first.a.y, first.b.y), Math.min(second.a.y, second.b.y)));
}

export function shouldConsiderEndpointLaneStrictCrossing(edge: Edge, other: Edge): boolean {
  if (other.source === edge.source) return Boolean(edge.sourceHandle && other.sourceHandle);
  return other.source !== edge.target
    && other.target !== edge.source
    && other.target !== edge.target;
}

type PreparedSegment = {
  segment: EndpointLaneSegment;
  axis: 'h' | 'v';
  coordinate: number;
  direction: number;
  contributesToCrossings: boolean;
  contributesToOppositeOverlap: boolean;
  otherOrder: number;
  segmentOrder: number;
};

type OverlapContribution = {
  otherOrder: number;
  candidateOrder: number;
  segmentOrder: number;
  length: number;
};

const lowerBoundByCoordinate = (
  segments: readonly PreparedSegment[],
  coordinate: number,
): number => {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if ((segments[middle]?.coordinate ?? Number.POSITIVE_INFINITY) < coordinate) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};

const forEachCoordinateRange = (
  segments: readonly PreparedSegment[],
  minimum: number,
  maximum: number,
  visit: (segment: PreparedSegment) => void,
): void => {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) return;
  for (let index = lowerBoundByCoordinate(segments, minimum); index < segments.length; index += 1) {
    const prepared = segments[index];
    if (!prepared || prepared.coordinate > maximum) break;
    visit(prepared);
  }
};

/**
 * Captures and indexes the other-edge geometry once for one endpoint-lane
 * candidate set. Exact predicates remain the final authority after the index
 * narrows each scan, so boundary-touching and malformed geometry fail closed.
 */
export function createEndpointLaneInteractionContext(
  edge: Edge,
  paths: ReadonlyMap<string, readonly EndpointLanePoint[]>,
  edgesById: ReadonlyMap<string, Edge>,
): EndpointLaneInteractionContext {
  const horizontalSegments: PreparedSegment[] = [];
  const verticalSegments: PreparedSegment[] = [];
  let otherOrder = 0;
  for (const [otherId, otherPath] of paths) {
    if (otherId === edge.id) continue;
    const other = edgesById.get(otherId);
    const contributesToCrossings = Boolean(
      other && shouldConsiderEndpointLaneStrictCrossing(edge, other),
    );
    const contributesToOppositeOverlap = Boolean(
      other
      && other.source !== edge.source
      && other.target !== edge.target,
    );
    endpointLaneToSegments(otherPath).forEach((segment, segmentOrder) => {
      const axis = endpointLaneAxisOf(segment.a, segment.b);
      if (!axis) return;
      const prepared: PreparedSegment = {
        segment,
        axis,
        coordinate: axis === 'h' ? segment.a.y : segment.a.x,
        direction: endpointLaneSegmentDirection(segment),
        contributesToCrossings,
        contributesToOppositeOverlap,
        otherOrder,
        segmentOrder,
      };
      (axis === 'h' ? horizontalSegments : verticalSegments).push(prepared);
    });
    otherOrder += 1;
  }
  horizontalSegments.sort((left, right) => left.coordinate - right.coordinate);
  verticalSegments.sort((left, right) => left.coordinate - right.coordinate);
  let evaluationCount = 0;
  let scannedSegmentCount = 0;

  return {
    evaluate(path: readonly EndpointLanePoint[]): EndpointLaneInteractionMetrics {
      evaluationCount += 1;
      const candidateSegments = endpointLaneToSegments(path);
      let crossings = 0;
      let totalCrossings = 0;
      const overlapContributions: OverlapContribution[] = [];

      for (let candidateOrder = 0; candidateOrder < candidateSegments.length; candidateOrder += 1) {
        const first = candidateSegments[candidateOrder];
        const axis = endpointLaneAxisOf(first.a, first.b);
        if (!axis) continue;
        const firstDirection = endpointLaneSegmentDirection(first);
        const strictSegments = axis === 'h' ? verticalSegments : horizontalSegments;
        const strictMinimum = axis === 'h'
          ? Math.min(first.a.x, first.b.x) + 1 - EPS
          : Math.min(first.a.y, first.b.y) + 1 - EPS;
        const strictMaximum = axis === 'h'
          ? Math.max(first.a.x, first.b.x) - 1 + EPS
          : Math.max(first.a.y, first.b.y) - 1 + EPS;
        forEachCoordinateRange(strictSegments, strictMinimum, strictMaximum, prepared => {
          scannedSegmentCount += 1;
          if (!endpointLaneStrictCrosses(first, prepared.segment)) return;
          totalCrossings += 1;
          if (prepared.contributesToCrossings) crossings += 1;
        });

        const overlapSegments = axis === 'h' ? horizontalSegments : verticalSegments;
        const coordinate = axis === 'h' ? first.a.y : first.a.x;
        forEachCoordinateRange(overlapSegments, coordinate - EPS, coordinate + EPS, prepared => {
          scannedSegmentCount += 1;
          if (
            !prepared.contributesToOppositeOverlap
            || firstDirection * prepared.direction >= 0
          ) {
            return;
          }
          const length = endpointLaneParallelOverlapLength(first, prepared.segment);
          if (length <= 0) return;
          overlapContributions.push({
            otherOrder: prepared.otherOrder,
            candidateOrder,
            segmentOrder: prepared.segmentOrder,
            length,
          });
        });
      }

      overlapContributions.sort((left, right) => (
        left.otherOrder - right.otherOrder
        || left.candidateOrder - right.candidateOrder
        || left.segmentOrder - right.segmentOrder
      ));
      const oppositeOverlap = overlapContributions.reduce(
        (total, contribution) => total + contribution.length,
        0,
      );

      return { crossings, totalCrossings, oppositeOverlap };
    },
    readMetrics: () => ({ evaluationCount, scannedSegmentCount }),
  };
}
