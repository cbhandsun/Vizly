import {
  compactOrthogonalPath,
  isFinitePoint,
} from './baseReactFlowDisplayEdgeCore';
import {
  displayAxisOf,
  RESIDUAL_PARALLEL_LANE_GAP,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';

const MIN_HAIRPIN_SAFE_HALF_SPAN = 70;

const exactPathSignature = (path: readonly DisplayPoint[]): string => (
  path.map(point => `${Object.is(point.x, -0) ? 0 : point.x},${Object.is(point.y, -0) ? 0 : point.y}`).join(';')
);

const liesStrictlyBetween = (value: number, first: number, second: number): boolean => (
  value > Math.min(first, second) && value < Math.max(first, second)
);

const sideCoordinate = (side: number, crossing: number, gap: number): number => (
  crossing + Math.sign(side - crossing) * gap
);

const prioritizedOuterLanes = (
  preferred: number,
  first: number,
  second: number,
  gap: number,
): number[] => [
  Math.min(first, second) - gap,
  Math.max(first, second) + gap,
].sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));

/**
 * Builds a small rectangular escape at either end of a crossing segment.
 * The escape moves outside the competing segment only until it has passed
 * the crossing coordinate, then rejoins the original lane. Endpoints and
 * declared terminal stubs remain untouched.
 */
export const buildStrictEndpointDetourCandidates = (
  path: readonly DisplayPoint[],
  segment: DisplaySegment,
  other: DisplaySegment,
  gap = RESIDUAL_PARALLEL_LANE_GAP,
): DisplayPoint[][] => {
  if (segment.axis === other.axis || path.length < 4 || gap <= 0) return [];
  const segmentIndex = segment.segmentIndex;
  const start = path[segmentIndex];
  const end = path[segmentIndex + 1];
  if (!start || !end) return [];

  const crossingCoordinate = segment.axis === 'v' ? other.a.y : other.a.x;
  const startCoordinate = segment.axis === 'v' ? start.y : start.x;
  const endCoordinate = segment.axis === 'v' ? end.y : end.x;
  const preferredLane = segment.axis === 'v' ? start.x : start.y;
  const otherFirstLane = segment.axis === 'v' ? other.a.x : other.a.y;
  const otherSecondLane = segment.axis === 'v' ? other.b.x : other.b.y;
  const outerLanes = prioritizedOuterLanes(
    preferredLane,
    otherFirstLane,
    otherSecondLane,
    gap,
  );
  const candidates: DisplayPoint[][] = [];
  const seen = new Set<string>();
  const append = (candidate: DisplayPoint[]) => {
    const compacted = compactOrthogonalPath(candidate);
    if (compacted.length < 2 || !compacted.every(isFinitePoint)) return;
    const signature = exactPathSignature(compacted);
    if (seen.has(signature)) return;
    seen.add(signature);
    candidates.push(compacted);
  };

  const direction = Math.sign(endCoordinate - startCoordinate);
  if (direction !== 0) {
    // The quality gate classifies opposite parallel legs separated by less
    // than 140px as a hairpin. Span at least that full distance while keeping
    // the lateral escape itself on the normal residual lane gap.
    const bypassHalfSpan = Math.max(gap, MIN_HAIRPIN_SAFE_HALF_SPAN);
    const leaveCoordinate = crossingCoordinate - direction * bypassHalfSpan;
    const rejoinCoordinate = crossingCoordinate + direction * bypassHalfSpan;
    if (
      liesStrictlyBetween(leaveCoordinate, startCoordinate, endCoordinate)
      && liesStrictlyBetween(rejoinCoordinate, startCoordinate, endCoordinate)
    ) {
      for (const outerLane of outerLanes) {
        const originalLeave = segment.axis === 'v'
          ? { x: preferredLane, y: leaveCoordinate }
          : { x: leaveCoordinate, y: preferredLane };
        const outerLeave = segment.axis === 'v'
          ? { x: outerLane, y: leaveCoordinate }
          : { x: leaveCoordinate, y: outerLane };
        const outerRejoin = segment.axis === 'v'
          ? { x: outerLane, y: rejoinCoordinate }
          : { x: rejoinCoordinate, y: outerLane };
        const originalRejoin = segment.axis === 'v'
          ? { x: preferredLane, y: rejoinCoordinate }
          : { x: rejoinCoordinate, y: preferredLane };
        append([
          ...path.slice(0, segmentIndex + 1),
          originalLeave,
          outerLeave,
          outerRejoin,
          originalRejoin,
          ...path.slice(segmentIndex + 1),
        ]);
      }
    }
  }

  const previous = path[segmentIndex - 1];
  if (
    segmentIndex > 0
    && previous
    && displayAxisOf(previous, start)
    && displayAxisOf(previous, start) !== segment.axis
  ) {
    const rejoinCoordinate = sideCoordinate(startCoordinate, crossingCoordinate, gap);
    if (liesStrictlyBetween(rejoinCoordinate, startCoordinate, crossingCoordinate)) {
      for (const outerLane of outerLanes) {
        const shiftedStart = segment.axis === 'v'
          ? { x: outerLane, y: start.y }
          : { x: start.x, y: outerLane };
        const outerRejoin = segment.axis === 'v'
          ? { x: outerLane, y: rejoinCoordinate }
          : { x: rejoinCoordinate, y: outerLane };
        const originalRejoin = segment.axis === 'v'
          ? { x: preferredLane, y: rejoinCoordinate }
          : { x: rejoinCoordinate, y: preferredLane };
        append([
          ...path.slice(0, segmentIndex),
          shiftedStart,
          outerRejoin,
          originalRejoin,
          ...path.slice(segmentIndex + 1),
        ]);
      }
    }
  }

  const next = path[segmentIndex + 2];
  if (
    segmentIndex + 2 < path.length
    && next
    && displayAxisOf(end, next)
    && displayAxisOf(end, next) !== segment.axis
  ) {
    const leaveCoordinate = sideCoordinate(endCoordinate, crossingCoordinate, gap);
    if (liesStrictlyBetween(leaveCoordinate, endCoordinate, crossingCoordinate)) {
      for (const outerLane of outerLanes) {
        const originalLeave = segment.axis === 'v'
          ? { x: preferredLane, y: leaveCoordinate }
          : { x: leaveCoordinate, y: preferredLane };
        const outerLeave = segment.axis === 'v'
          ? { x: outerLane, y: leaveCoordinate }
          : { x: leaveCoordinate, y: outerLane };
        const shiftedEnd = segment.axis === 'v'
          ? { x: outerLane, y: end.y }
          : { x: end.x, y: outerLane };
        append([
          ...path.slice(0, segmentIndex + 1),
          originalLeave,
          outerLeave,
          shiftedEnd,
          ...path.slice(segmentIndex + 2),
        ]);
      }
    }
  }

  return candidates.slice(0, 4);
};
