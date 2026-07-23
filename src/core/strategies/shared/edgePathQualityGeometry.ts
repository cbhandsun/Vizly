import type { Edge } from '@xyflow/react';

import { edgeHasExplicitSharedTrunkIntent } from './edgeRoutingQualityIntent';
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

const EPS = 0.5;
export const MIN_EDGE_PATH_PENALIZED_OVERLAP = 24;
const VISUAL_PARALLEL_LANE_TOLERANCE = 4;
const SHORT_ENDPOINT_STUB = 32;
const TINY_INTERIOR_SEGMENT = 24;
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
  if (first.axis !== second.axis) return 0;
  if (first.axis === 'h') {
    if (Math.abs(first.a.y - second.a.y) > VISUAL_PARALLEL_LANE_TOLERANCE) return 0;
    return rangeOverlap(first.a.x, first.b.x, second.a.x, second.b.x);
  }
  if (Math.abs(first.a.x - second.a.x) > VISUAL_PARALLEL_LANE_TOLERANCE) return 0;
  return rangeOverlap(first.a.y, first.b.y, second.a.y, second.b.y);
}

function edgesAreRelated(first: Edge, second: Edge): boolean {
  return first.source === second.source
    || first.source === second.target
    || first.target === second.source
    || first.target === second.target;
}

function hasExplicitSharedTrunkIntent(edge: Edge): boolean {
  return edgeHasExplicitSharedTrunkIntent(edge);
}

function overlapTouchesSharedEndpointTrunk(first: Edge, second: Edge, firstSegment: Segment, secondSegment: Segment): boolean {
  const sameSource = first.source === second.source;
  const sameTarget = first.target === second.target;
  if (!sameSource && !sameTarget) return false;

  if (sameSource && firstSegment.segmentIndex <= 1 && secondSegment.segmentIndex <= 1) {
    return firstSegment.direction === secondSegment.direction;
  }
  if (
    sameTarget
    && firstSegment.segmentIndex >= firstSegment.segmentCount - 2
    && secondSegment.segmentIndex >= secondSegment.segmentCount - 2
  ) {
    return firstSegment.direction === secondSegment.direction;
  }
  return false;
}

function isPermittedRelatedOverlap(first: Edge, second: Edge, firstSegment: Segment, secondSegment: Segment): boolean {
  if (
    firstSegment.direction !== 0
    && secondSegment.direction !== 0
    && firstSegment.direction !== secondSegment.direction
  ) {
    return false;
  }
  if (overlapTouchesSharedEndpointTrunk(first, second, firstSegment, secondSegment)) return true;
  return hasExplicitSharedTrunkIntent(first) && hasExplicitSharedTrunkIntent(second);
}

function pathLength(path: Point[]): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    total += segmentLength(path[index], path[index + 1]);
  }
  return total;
}

function manhattanDistance(path: Point[]): number {
  if (path.length < 2) return 0;
  const start = path[0];
  const end = path[path.length - 1];
  return Math.abs(start.x - end.x) + Math.abs(start.y - end.y);
}

function countShortEndpointStubs(path: Point[]): number {
  if (path.length < 3) return 0;
  let total = 0;
  if (segmentLength(path[0], path[1]) < SHORT_ENDPOINT_STUB) total += 1;
  if (segmentLength(path[path.length - 2], path[path.length - 1]) < SHORT_ENDPOINT_STUB) total += 1;
  return total;
}

function countTinyInteriorDoglegs(path: Point[]): number {
  let total = 0;
  for (let index = 1; index < path.length - 2; index += 1) {
    if (segmentLength(path[index], path[index + 1]) < TINY_INTERIOR_SEGMENT) total += 1;
  }
  return total;
}

function countHairpins(path: Point[]): number {
  const segments: Array<{ axis: Axis; direction: -1 | 0 | 1; length: number }> = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const axis = axisOf(path[index], path[index + 1]);
    if (!axis) continue;
    segments.push({
      axis,
      direction: segmentDirection(path[index], path[index + 1], axis),
      length: segmentLength(path[index], path[index + 1]),
    });
  }

  let total = 0;
  for (let index = 0; index < segments.length - 2; index += 1) {
    const first = segments[index];
    const middle = segments[index + 1];
    const last = segments[index + 2];
    if (
      first.axis === last.axis
      && first.direction !== 0
      && last.direction !== 0
      && first.direction === -last.direction
      && middle.length < HAIRPIN_BRIDGE
    ) {
      total += 1;
    }
  }
  return total;
}

function backtrackPenalty(path: Point[]): number {
  if (path.length < 2) return 0;
  const start = path[0];
  const end = path[path.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const horizontalDominant = Math.abs(dx) >= Math.abs(dy);
  const mainDelta = horizontalDominant ? dx : dy;
  const mainDistance = Math.abs(mainDelta);
  if (mainDistance <= EPS) return 0;

  const expectedDirection = mainDelta > 0 ? 1 : -1;
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const axis = axisOf(path[index], path[index + 1]);
    if (!axis) continue;
    if ((horizontalDominant && axis !== 'h') || (!horizontalDominant && axis !== 'v')) continue;
    const direction = segmentDirection(path[index], path[index + 1], axis);
    if (direction !== 0 && direction !== expectedDirection) {
      total += segmentLength(path[index], path[index + 1]);
    }
  }
  return Math.round(total);
}

function detourPenalty(path: Point[]): number {
  const direct = manhattanDistance(path);
  if (direct <= EPS) return 0;
  const length = pathLength(path);
  const excess = length / direct - 1.8;
  if (excess <= 0) return 0;
  return Math.round(excess * direct);
}

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
  | 'reverseOverlap'
  | 'unrelatedOverlap'
  | 'relatedOverlap'
  | 'unexplainedRelatedOverlap'
>;

const SCORE_KEYS: Array<keyof EdgePathQualityScore> = [
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
];

const PAIR_SCORE_KEYS: Array<keyof PairQualityContribution> = [
  'strictCrossings',
  'reverseOverlap',
  'unrelatedOverlap',
  'relatedOverlap',
  'unexplainedRelatedOverlap',
];

export function addScore(
  target: EdgePathQualityScore,
  source: EdgePathQualityScore,
  multiplier = 1,
): void {
  for (const key of SCORE_KEYS) target[key] += source[key] * multiplier;
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
}

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
        score.strictCrossings += 1;
        continue;
      }

      const overlap = parallelOverlap(first, second);
      if (overlap <= MIN_EDGE_PATH_PENALIZED_OVERLAP) continue;

      const roundedOverlap = Math.round(overlap);
      const reverse = first.direction !== 0
        && second.direction !== 0
        && first.direction === -second.direction;
      if (reverse) score.reverseOverlap += roundedOverlap;
      if (related) {
        score.relatedOverlap += roundedOverlap;
        if (!isPermittedRelatedOverlap(firstEdge, secondEdge, first, second)) {
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
  return PAIR_SCORE_KEYS.some(key => score[key] !== 0);
}
