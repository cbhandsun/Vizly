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

type PreparedOtherEdge = {
  segments: readonly EndpointLaneSegment[];
  contributesToCrossings: boolean;
  contributesToOppositeOverlap: boolean;
};

/**
 * Captures the other-edge geometry once for one endpoint-lane candidate set.
 * Evaluation retains the original other-edge / candidate-segment / other-segment
 * iteration order so all three legacy metrics remain numerically identical.
 */
export function createEndpointLaneInteractionContext(
  edge: Edge,
  paths: ReadonlyMap<string, readonly EndpointLanePoint[]>,
  edgesById: ReadonlyMap<string, Edge>,
): EndpointLaneInteractionContext {
  const preparedOthers: PreparedOtherEdge[] = [];
  for (const [otherId, otherPath] of paths) {
    if (otherId === edge.id) continue;
    const other = edgesById.get(otherId);
    preparedOthers.push({
      segments: endpointLaneToSegments(otherPath),
      contributesToCrossings: Boolean(other && shouldConsiderEndpointLaneStrictCrossing(edge, other)),
      contributesToOppositeOverlap: Boolean(
        other
        && other.source !== edge.source
        && other.target !== edge.target,
      ),
    });
  }

  return {
    evaluate(path: readonly EndpointLanePoint[]): EndpointLaneInteractionMetrics {
      const candidateSegments = endpointLaneToSegments(path);
      let crossings = 0;
      let totalCrossings = 0;
      let oppositeOverlap = 0;

      for (const prepared of preparedOthers) {
        for (const first of candidateSegments) {
          const firstDirection = endpointLaneSegmentDirection(first);
          for (const second of prepared.segments) {
            if (endpointLaneStrictCrosses(first, second)) {
              totalCrossings += 1;
              if (prepared.contributesToCrossings) crossings += 1;
            }
            if (
              prepared.contributesToOppositeOverlap
              && firstDirection * endpointLaneSegmentDirection(second) < 0
            ) {
              oppositeOverlap += endpointLaneParallelOverlapLength(first, second);
            }
          }
        }
      }

      return { crossings, totalCrossings, oppositeOverlap };
    },
  };
}
