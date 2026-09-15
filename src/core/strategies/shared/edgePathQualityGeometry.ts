import type { Edge } from '@xyflow/react';
import { isReadableOrthogonalCrossing } from '../../routing/orthogonalCrossingPolicy';
import { isPermittedRelatedOverlap } from './edgePathRelatedOverlapPolicy';
import {
  backtrackPenalty,
  countHairpins,
  countShortEndpointStubs,
  countTinyInteriorDoglegs,
  detourPenalty,
  pathLength,
} from './edgePathSingleQualityMetrics';

export type Point = { x: number; y: number };
const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);
type Axis = 'h' | 'v';
export type Segment = {
  a: Point;
  b: Point;
  axis: Axis;
  direction: -1 | 0 | 1;
  edgeIndex: number;
  segmentIndex: number;
  segmentCount: number;
  length: number;
};

export type EdgePathQualityScore = {
  nonOrthogonalSegments: number;
  strictCrossings: number;
  /** Clear perpendicular crossings shown with bridges; never hidden from diagnostics. */
  bridgedCrossings?: number;
  /** Ordinary crossing = 1, crossing among adjacent edges = 7. */
  crossingCost?: number;
  reverseOverlap: number;
  unrelatedOverlap: number;
  relatedOverlap: number;
  unexplainedRelatedOverlap: number;
  shortEndpointStubs: number;
  tinyInteriorDoglegs: number;
  hairpins: number;
  backtrackPenalty: number;
  detourPenalty: number;
  bends: number;
  totalLength: number;
};

export const compareEdgePathQualityScores = (
  first: EdgePathQualityScore,
  second: EdgePathQualityScore,
): number => {
  const keys = [
    'nonOrthogonalSegments',
    'strictCrossings',
    'reverseOverlap',
    'unrelatedOverlap',
    'unexplainedRelatedOverlap',
    'shortEndpointStubs',
    'tinyInteriorDoglegs',
    'hairpins',
  ] as const;
  for (const key of keys) {
    const delta = first[key] - second[key];
    if (delta !== 0) return delta;
  }
  return edgePathReadabilityCost(first) - edgePathReadabilityCost(second);
};

/** Crossing and bend costs are relative weights, not pass/fail thresholds. */
export const edgePathReadabilityCost = (score: EdgePathQualityScore): number => (
  (score.crossingCost ?? score.bridgedCrossings ?? 0) + score.bends * 3 + score.totalLength * 0.005
    + score.backtrackPenalty * 200 + score.detourPenalty * 0.75
);

const EPS = 0.5;
export const MIN_EDGE_PATH_PENALIZED_OVERLAP = 24;
const BOUNDED_CROSSING_JUNCTION_LENGTH = 24;
const VISUAL_PARALLEL_LANE_TOLERANCE = 4;
// Nearby parallel lanes are a defect; only rounding-scale drift describes one
// shared trunk. Match the rendered audit's one-pixel identity tolerance.
const SHARED_TRUNK_COORDINATE_EPS = 1;
const SHORT_ENDPOINT_STUB = 32;
const HAIRPIN_BRIDGE = 140;

export function getEdgePath(edge: Edge): Point[] {
  const treeRouting = asRecord(edge.data?.treeRouting);
  const raw = edge.data?.computedPath || treeRouting.points || edge.data?.elkPath || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(point => {
      const candidate = asRecord(point);
      return { x: Number(candidate.x), y: Number(candidate.y) };
    })
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function axisOf(a: Point, b: Point): Axis | null {
  if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
}

function segmentLength(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function segmentDirection(a: Point, b: Point, axis: Axis): -1 | 0 | 1 {
  const delta = axis === 'h' ? b.x - a.x : b.y - a.y;
  if (Math.abs(delta) <= EPS) return 0;
  return delta > 0 ? 1 : -1;
}

export function getSegments(paths: Point[][]): Segment[] {
  const segments: Segment[] = [];
  paths.forEach((path, edgeIndex) => {
    for (let index = 0; index < path.length - 1; index += 1) {
      const axis = axisOf(path[index], path[index + 1]);
      if (axis) {
        segments.push({
          a: path[index],
          b: path[index + 1],
          axis,
          direction: segmentDirection(path[index], path[index + 1], axis),
          edgeIndex,
          segmentIndex: index,
          segmentCount: path.length - 1,
          length: segmentLength(path[index], path[index + 1]),
        });
      }
    }
  });
  return segments;
}

export function strictlyCrosses(first: Segment, second: Segment): boolean {
  if (first.axis === second.axis) return false;
  const horizontal = first.axis === 'h' ? first : second;
  const vertical = first.axis === 'v' ? first : second;
  const x = vertical.a.x;
  const y = horizontal.a.y;
  return x > Math.min(horizontal.a.x, horizontal.b.x) + EPS
    && x < Math.max(horizontal.a.x, horizontal.b.x) - EPS
    && y > Math.min(vertical.a.y, vertical.b.y) + EPS
    && y < Math.max(vertical.a.y, vertical.b.y) - EPS;
}

function rangeOverlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2))
    - Math.max(Math.min(a1, a2), Math.min(b1, b2)));
}

function parallelOverlap(first: Segment, second: Segment): number {
  if (first.axis !== second.axis) return 0;
  if (first.axis === 'h') {
    if (Math.abs(first.a.y - second.a.y) > VISUAL_PARALLEL_LANE_TOLERANCE) return 0;
    return rangeOverlap(first.a.x, first.b.x, second.a.x, second.b.x);
  }
  if (Math.abs(first.a.x - second.a.x) > VISUAL_PARALLEL_LANE_TOLERANCE) return 0;
  return rangeOverlap(first.a.y, first.b.y, second.a.y, second.b.y);
}

function adjacentSegment(
  segments: readonly Segment[],
  segment: Segment,
  offset: -1 | 1,
): Segment | null {
  return segments.find(candidate => (
    candidate.edgeIndex === segment.edgeIndex
    && candidate.segmentIndex === segment.segmentIndex + offset
  )) ?? null;
}

function segmentIsInside(first: Segment, second: Segment): boolean {
  if (first.axis !== second.axis) return false;
  if (first.axis === 'h') {
    return Math.min(first.a.x, first.b.x) > Math.min(second.a.x, second.b.x) + EPS
      && Math.max(first.a.x, first.b.x) < Math.max(second.a.x, second.b.x) - EPS;
  }
  return Math.min(first.a.y, first.b.y) > Math.min(second.a.y, second.b.y) + EPS
    && Math.max(first.a.y, first.b.y) < Math.max(second.a.y, second.b.y) - EPS;
}

function oppositeSidesOfAxis(
  before: Segment,
  after: Segment,
  junction: Segment,
): boolean {
  if (junction.axis === 'h') {
    const beforeDelta = before.a.y - junction.a.y;
    const afterDelta = after.b.y - junction.a.y;
    return Math.abs(beforeDelta) > EPS
      && Math.abs(afterDelta) > EPS
      && Math.sign(beforeDelta) === -Math.sign(afterDelta);
  }
  const beforeDelta = before.a.x - junction.a.x;
  const afterDelta = after.b.x - junction.a.x;
  return Math.abs(beforeDelta) > EPS
    && Math.abs(afterDelta) > EPS
    && Math.sign(beforeDelta) === -Math.sign(afterDelta);
}

/**
 * A 24px internal segment may deliberately follow a blocking segment before
 * leaving on its opposite side. This is a bounded crossing junction, not a
 * shared trunk: it must cover the whole short segment, stay inside the long
 * segment, keep the same direction, and have orthogonal legs on opposite
 * sides. Longer or terminal overlaps remain hard defects.
 */
function isBoundedCrossingJunctionOverlap(
  first: Segment,
  second: Segment,
  firstSegments: readonly Segment[],
  secondSegments: readonly Segment[],
  overlap: number,
): boolean {
  const pairs = [
    { junction: first, blocker: second, junctionSegments: firstSegments },
    { junction: second, blocker: first, junctionSegments: secondSegments },
  ];
  return pairs.some(({ junction, blocker, junctionSegments }) => {
    if (
      Math.abs(junction.length - BOUNDED_CROSSING_JUNCTION_LENGTH) > EPS
      || Math.abs(overlap - junction.length) > EPS
      || junction.direction === 0
      || junction.direction !== blocker.direction
      || junction.segmentIndex <= 0
      || junction.segmentIndex >= junction.segmentCount - 1
      || !segmentIsInside(junction, blocker)
    ) return false;
    const before = adjacentSegment(junctionSegments, junction, -1);
    const after = adjacentSegment(junctionSegments, junction, 1);
    return Boolean(
      before
      && after
      && before.axis !== junction.axis
      && after.axis !== junction.axis
      && oppositeSidesOfAxis(before, after, junction),
    );
  });
}

function edgesAreRelated(first: Edge, second: Edge): boolean {
  return first.source === second.source
    || first.source === second.target
    || first.target === second.source
    || first.target === second.target;
}

const crossingTouchesSharedEndpoint = (
  firstEdge: Edge,
  secondEdge: Edge,
  firstSegment: Segment,
  secondSegment: Segment,
): boolean => (
  (
    firstEdge.source === secondEdge.source
    && firstSegment.segmentIndex === 0
    && secondSegment.segmentIndex === 0
    && sameTrunkPoint(firstSegment.a, secondSegment.a)
  )
  || (
    firstEdge.target === secondEdge.target
    && firstSegment.segmentIndex === firstSegment.segmentCount - 1
    && secondSegment.segmentIndex === secondSegment.segmentCount - 1
    && sameTrunkPoint(firstSegment.b, secondSegment.b)
  )
);

const sameTrunkPoint = (first: Point, second: Point): boolean => (
  Math.abs(first.x - second.x) <= SHARED_TRUNK_COORDINATE_EPS
  && Math.abs(first.y - second.y) <= SHARED_TRUNK_COORDINATE_EPS
);

export function countNonOrthogonalSegments(path: Point[]): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    if (!axisOf(path[index], path[index + 1])) total += 1;
  }
  return total;
}

export function emptyScore(): EdgePathQualityScore {
  return {
    nonOrthogonalSegments: 0,
    strictCrossings: 0,
    reverseOverlap: 0,
    unrelatedOverlap: 0,
    relatedOverlap: 0,
    unexplainedRelatedOverlap: 0,
    shortEndpointStubs: 0,
    tinyInteriorDoglegs: 0,
    hairpins: 0,
    backtrackPenalty: 0,
    detourPenalty: 0,
    bends: 0,
    totalLength: 0,
  };
}

export type PairQualityContribution = Pick<EdgePathQualityScore,
  | 'strictCrossings'
  | 'bridgedCrossings'
  | 'crossingCost'
  | 'reverseOverlap'
  | 'unrelatedOverlap'
  | 'relatedOverlap'
  | 'unexplainedRelatedOverlap'
>;

const SCORE_KEYS = [
  'nonOrthogonalSegments',
  'strictCrossings',
  'reverseOverlap',
  'unrelatedOverlap',
  'relatedOverlap',
  'unexplainedRelatedOverlap',
  'shortEndpointStubs',
  'tinyInteriorDoglegs',
  'hairpins',
  'backtrackPenalty',
  'detourPenalty',
  'bends',
  'totalLength',
] as const;

const PAIR_SCORE_KEYS = [
  'strictCrossings',
  'reverseOverlap',
  'unrelatedOverlap',
  'relatedOverlap',
  'unexplainedRelatedOverlap',
] as const;

const addBridgedCrossings = (
  target: { bridgedCrossings?: number; crossingCost?: number },
  source: { bridgedCrossings?: number; crossingCost?: number },
  multiplier: number,
): void => {
  for (const key of ['bridgedCrossings', 'crossingCost'] as const) {
    const count = (target[key] ?? 0) + (source[key] ?? 0) * multiplier;
    if (count !== 0) target[key] = count;
    else delete target[key];
  }
};

export function addScore(
  target: EdgePathQualityScore,
  source: EdgePathQualityScore,
  multiplier = 1,
): void {
  for (const key of SCORE_KEYS) target[key] += source[key] * multiplier;
  addBridgedCrossings(target, source, multiplier);
}

export function addPairContribution(
  target: EdgePathQualityScore,
  source: PairQualityContribution | undefined,
  multiplier = 1,
): void {
  if (!source) return;
  target.strictCrossings += source.strictCrossings * multiplier;
  target.reverseOverlap += source.reverseOverlap * multiplier;
  target.unrelatedOverlap += source.unrelatedOverlap * multiplier;
  target.relatedOverlap += source.relatedOverlap * multiplier;
  target.unexplainedRelatedOverlap += source.unexplainedRelatedOverlap * multiplier;
  addBridgedCrossings(target, source, multiplier);
}

export const crossingCanBeBridged = (
  first: Segment,
  second: Segment,
): boolean => isReadableOrthogonalCrossing(first, second);

export function buildEdgeSegments(path: Point[], edgeIndex: number): Segment[] {
  const segments: Segment[] = [];
  for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
    const axis = axisOf(path[segmentIndex], path[segmentIndex + 1]);
    if (!axis) continue;
    segments.push({
      a: path[segmentIndex],
      b: path[segmentIndex + 1],
      axis,
      direction: segmentDirection(path[segmentIndex], path[segmentIndex + 1], axis),
      edgeIndex,
      segmentIndex,
      segmentCount: path.length - 1,
      length: segmentLength(path[segmentIndex], path[segmentIndex + 1]),
    });
  }
  return segments;
}

export function calculateSingleEdgeQuality(path: Point[]): EdgePathQualityScore {
  const score = emptyScore();
  score.nonOrthogonalSegments = countNonOrthogonalSegments(path);
  score.shortEndpointStubs = countShortEndpointStubs(path);
  score.tinyInteriorDoglegs = countTinyInteriorDoglegs(path);
  score.hairpins = countHairpins(path);
  score.backtrackPenalty = backtrackPenalty(path);
  score.detourPenalty = detourPenalty(path);
  score.bends = Math.max(0, path.length - 2);
  score.totalLength = Math.round(pathLength(path));
  return score;
}

export function calculateEdgePairQuality(
  firstEdge: Edge,
  secondEdge: Edge,
  firstSegments: Segment[],
  secondSegments: Segment[],
): PairQualityContribution {
  const score: PairQualityContribution = {
    strictCrossings: 0,
    reverseOverlap: 0,
    unrelatedOverlap: 0,
    relatedOverlap: 0,
    unexplainedRelatedOverlap: 0,
  };
  const related = edgesAreRelated(firstEdge, secondEdge);

  for (const first of firstSegments) {
    for (const second of secondSegments) {
      if (strictlyCrosses(first, second)) {
        if (crossingCanBeBridged(first, second)) {
          score.bridgedCrossings = (score.bridgedCrossings ?? 0) + 1;
          score.crossingCost = (score.crossingCost ?? 0) + (related ? 7 : 1);
          continue;
        }
        if (!crossingTouchesSharedEndpoint(
          firstEdge,
          secondEdge,
          first,
          second,
        )) score.strictCrossings += 1;
        continue;
      }

      const overlap = parallelOverlap(first, second);
      if (overlap < MIN_EDGE_PATH_PENALIZED_OVERLAP) continue;

      if (
        !related
        && isBoundedCrossingJunctionOverlap(
          first,
          second,
          firstSegments,
          secondSegments,
          overlap,
        )
      ) continue;

      const roundedOverlap = Math.round(overlap);
      const reverse = first.direction !== 0
        && second.direction !== 0
        && first.direction === -second.direction;
      if (reverse) score.reverseOverlap += roundedOverlap;
      if (related) {
        score.relatedOverlap += roundedOverlap;
        if (!isPermittedRelatedOverlap(
          firstEdge,
          secondEdge,
          first,
          second,
          firstSegments,
          secondSegments,
        )) {
          score.unexplainedRelatedOverlap += roundedOverlap;
        }
      } else {
        score.unrelatedOverlap += roundedOverlap;
      }
    }
  }
  return score;
}

export function hasPairContribution(score: PairQualityContribution): boolean {
  return (score.bridgedCrossings ?? 0) !== 0 || PAIR_SCORE_KEYS.some(key => score[key] !== 0);
}
import { TINY_INTERIOR_SEGMENT } from './edgePathReadabilityThresholds';
