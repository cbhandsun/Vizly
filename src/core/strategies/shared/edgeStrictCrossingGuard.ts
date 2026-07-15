import type { Edge } from '@xyflow/react';

import { BoundedEvaluationLruCache } from './boundedEvaluationLruCache';
import {
  edgeHasExplicitSharedTrunkIntent,
  edgeRoutingQualityIntentToken,
} from './edgeRoutingQualityIntent';

type Point = { x: number; y: number };
type Axis = 'h' | 'v';
type Segment = {
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

function getEdgePath(edge: Edge): Point[] {
  const raw = (edge.data as any)?.computedPath || (edge.data as any)?.treeRouting?.points || (edge.data as any)?.elkPath || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((point: any) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

type QualityInputSnapshot = {
  signature: string;
  paths: Point[][];
  edgeSignatures: string[];
};

type QualityEdgeInputSnapshot = {
  path: Point[];
  signature: string;
};

const qualityScoreCache = new WeakMap<Edge[], {
  signature: string;
  score: EdgePathQualityScore;
}>();
const strictCrossingCache = new WeakMap<Edge[], {
  signature: string;
  count: number;
}>();
const QUALITY_SIGNATURE_CACHE_LIMIT = 512;
const qualityScoreSignatureCache = new Map<string, EdgePathQualityScore>();
const strictCrossingSignatureCache = new Map<string, number>();

function rememberSignatureValue<T>(cache: Map<string, T>, signature: string, value: T): void {
  if (cache.has(signature)) cache.delete(signature);
  cache.set(signature, value);
  while (cache.size > QUALITY_SIGNATURE_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (typeof oldest !== 'string') break;
    cache.delete(oldest);
  }
}

function readSignatureValue<T>(cache: Map<string, T>, signature: string): T | undefined {
  const value = cache.get(signature);
  if (typeof value === 'undefined') return undefined;
  cache.delete(signature);
  cache.set(signature, value);
  return value;
}

function buildQualityEdgeInputSnapshot(edge: Edge): QualityEdgeInputSnapshot {
  const path = getEdgePath(edge);
  const intent = edgeRoutingQualityIntentToken(edge);
  const pathSignature = path.map(point => `${point.x},${point.y}`).join(';');
  return {
    path,
    signature: [
      edge.source,
      edge.target,
      edge.sourceHandle ?? '',
      edge.targetHandle ?? '',
      intent,
      pathSignature,
    ].join('\u001f'),
  };
}

function buildQualityInputSnapshot(edges: Edge[]): QualityInputSnapshot {
  const edgeSnapshots = edges.map(buildQualityEdgeInputSnapshot);
  const paths = edgeSnapshots.map(snapshot => snapshot.path);
  const edgeSignatures = edgeSnapshots.map(snapshot => snapshot.signature);
  return {
    signature: edgeSignatures.join('\u001e'),
    paths,
    edgeSignatures,
  };
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

function getSegments(paths: Point[][]): Segment[] {
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

function strictlyCrosses(first: Segment, second: Segment): boolean {
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

function countNonOrthogonalSegments(path: Point[]): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    if (!axisOf(path[index], path[index + 1])) total += 1;
  }
  return total;
}

function emptyScore(): EdgePathQualityScore {
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

type PairQualityContribution = Pick<EdgePathQualityScore,
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

function addScore(
  target: EdgePathQualityScore,
  source: EdgePathQualityScore,
  multiplier = 1,
): void {
  for (const key of SCORE_KEYS) target[key] += source[key] * multiplier;
}

function addPairContribution(
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

function buildEdgeSegments(path: Point[], edgeIndex: number): Segment[] {
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

function calculateSingleEdgeQuality(path: Point[]): EdgePathQualityScore {
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

function calculateEdgePairQuality(
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

function hasPairContribution(score: PairQualityContribution): boolean {
  return PAIR_SCORE_KEYS.some(key => score[key] !== 0);
}

type EdgePathQualityDecomposition = {
  edgeSegments: Segment[][];
  edgeScores: EdgePathQualityScore[];
  pairScores: Map<number, PairQualityContribution>;
  score: EdgePathQualityScore;
};

const EDGE_PATH_QUALITY_STATE = Symbol('edge-path-quality-state');

type EdgePathQualityNumericState = {
  edgeCount: number;
  edgeReferences: Edge[];
  edgeSegments: Segment[][];
  edgeScores: EdgePathQualityScore[];
  owner: object;
  pairOverlay: ReadonlyMap<number, PairQualityContribution | null>;
  parent: EdgePathQualityNumericState | null;
  score: EdgePathQualityScore;
};

export type EdgePathQualityEvaluationState = Readonly<{
  score: EdgePathQualityScore;
  [EDGE_PATH_QUALITY_STATE]: EdgePathQualityNumericState;
}>;

const qualityDecompositionCache = new BoundedEvaluationLruCache<EdgePathQualityDecomposition>({
  entries: 32,
  edgeSlots: 2_048,
  segmentSlots: 16_384,
  pairSlots: 16_384,
});

/**
 * The graph signature includes every input currently consumed by the quality
 * scorer: path coordinates, source/target relationships, and shared-trunk
 * intent. The cached value contains only derived numeric geometry and never
 * retains Edge objects or their arbitrary data payloads.
 */
function getEdgePathQualityDecomposition(
  edges: Edge[],
  snapshot: QualityInputSnapshot,
): EdgePathQualityDecomposition {
  const cached = qualityDecompositionCache.get(snapshot.signature);
  if (cached) return cached;

  const edgeSegments = snapshot.paths.map(buildEdgeSegments);
  const edgeScores = snapshot.paths.map(calculateSingleEdgeQuality);
  const pairScores = new Map<number, PairQualityContribution>();
  const score = emptyScore();
  const edgeCount = edges.length;

  for (const edgeScore of edgeScores) addScore(score, edgeScore);
  for (let firstIndex = 0; firstIndex < edgeCount; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < edgeCount; secondIndex += 1) {
      const pairScore = calculateEdgePairQuality(
        edges[firstIndex],
        edges[secondIndex],
        edgeSegments[firstIndex],
        edgeSegments[secondIndex],
      );
      if (hasPairContribution(pairScore)) {
        pairScores.set(firstIndex * edgeCount + secondIndex, pairScore);
        addPairContribution(score, pairScore);
      }
    }
  }

  const decomposition = { edgeSegments, edgeScores, pairScores, score };
  qualityDecompositionCache.set(snapshot.signature, decomposition, {
    edges: edgeCount,
    segments: edgeSegments.reduce((total, segments) => total + segments.length, 0),
    pairs: pairScores.size,
  });
  return decomposition;
}

function rememberQualityScore(
  edges: Edge[],
  snapshot: QualityInputSnapshot,
  score: EdgePathQualityScore,
): void {
  qualityScoreCache.set(edges, { signature: snapshot.signature, score });
  strictCrossingCache.set(edges, { signature: snapshot.signature, count: score.strictCrossings });
  rememberSignatureValue(qualityScoreSignatureCache, snapshot.signature, score);
  rememberSignatureValue(strictCrossingSignatureCache, snapshot.signature, score.strictCrossings);
}

function readQualityScore(
  edges: Edge[],
  snapshot: QualityInputSnapshot,
): EdgePathQualityScore | undefined {
  const weakCached = qualityScoreCache.get(edges);
  if (weakCached?.signature === snapshot.signature) {
    rememberQualityScore(edges, snapshot, weakCached.score);
    return weakCached.score;
  }
  const signatureCached = readSignatureValue(qualityScoreSignatureCache, snapshot.signature);
  if (!signatureCached) return undefined;
  rememberQualityScore(edges, snapshot, signatureCached);
  return signatureCached;
}

export function countStrictEdgeCrossings(edges: Edge[]): number {
  const snapshot = buildQualityInputSnapshot(edges);
  const cached = strictCrossingCache.get(edges);
  if (cached?.signature === snapshot.signature) return cached.count;
  const qualityCached = qualityScoreCache.get(edges);
  if (qualityCached?.signature === snapshot.signature) {
    return qualityCached.score.strictCrossings;
  }
  const signatureQualityCached = readSignatureValue(qualityScoreSignatureCache, snapshot.signature);
  if (signatureQualityCached) {
    qualityScoreCache.set(edges, { signature: snapshot.signature, score: signatureQualityCached });
    strictCrossingCache.set(edges, {
      signature: snapshot.signature,
      count: signatureQualityCached.strictCrossings,
    });
    return signatureQualityCached.strictCrossings;
  }
  const signatureCached = readSignatureValue(strictCrossingSignatureCache, snapshot.signature);
  if (typeof signatureCached === 'number') {
    strictCrossingCache.set(edges, { signature: snapshot.signature, count: signatureCached });
    return signatureCached;
  }
  const segments = getSegments(snapshot.paths);
  let total = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (segments[i].edgeIndex === segments[j].edgeIndex) continue;
      if (strictlyCrosses(segments[i], segments[j])) total += 1;
    }
  }
  strictCrossingCache.set(edges, { signature: snapshot.signature, count: total });
  rememberSignatureValue(strictCrossingSignatureCache, snapshot.signature, total);
  return total;
}

export function calculateEdgePathQualityScore(edges: Edge[]): EdgePathQualityScore {
  const snapshot = buildQualityInputSnapshot(edges);
  const cached = readQualityScore(edges, snapshot);
  if (cached) return cached;
  const score = { ...getEdgePathQualityDecomposition(edges, snapshot).score };

  rememberQualityScore(edges, snapshot, score);
  return score;
}

export type EdgePathQualityEvaluationContext = {
  createState: (candidate: Edge[]) => EdgePathQualityEvaluationState;
  evaluate: (candidate: Edge[]) => EdgePathQualityScore;
  evaluateChanged: (candidate: Edge[], changedIndexes: readonly number[]) => EdgePathQualityScore;
  evaluateStateChanged: (
    parentState: EdgePathQualityEvaluationState,
    candidate: Edge[],
    changedIndexes: readonly number[],
  ) => EdgePathQualityEvaluationState;
};

const MAX_INCREMENTAL_QUALITY_EDGE_CHANGES = 8;
const qualityEvaluationContextCache = new WeakMap<Edge[], {
  signature: string;
  context: EdgePathQualityEvaluationContext;
}>();

/**
 * Builds an exact baseline-relative evaluator. Candidates with a small number of
 * changed edge inputs only recompute those edges and the edge pairs that touch
 * them. Structural or broad changes deliberately use the full scorer.
 */
export function createEdgePathQualityEvaluationContext(
  baseline: Edge[],
): EdgePathQualityEvaluationContext {
  const baselineSnapshot = buildQualityInputSnapshot(baseline);
  const cached = qualityEvaluationContextCache.get(baseline);
  if (cached?.signature === baselineSnapshot.signature) return cached.context;

  const baselineDecomposition = getEdgePathQualityDecomposition(baseline, baselineSnapshot);
  const baselineSegments = baselineDecomposition.edgeSegments;
  const baselineEdgeScores = baselineDecomposition.edgeScores;
  const baselinePairScores = baselineDecomposition.pairScores;
  const baselineScore = { ...baselineDecomposition.score };
  const edgeCount = baseline.length;
  rememberQualityScore(baseline, baselineSnapshot, baselineScore);
  const stateOwner = {};
  let baselineState: EdgePathQualityEvaluationState | null = null;

  const publicState = (
    numericState: EdgePathQualityNumericState,
  ): EdgePathQualityEvaluationState => ({
    score: numericState.score,
    [EDGE_PATH_QUALITY_STATE]: numericState,
  });

  const fullState = (candidate: Edge[]): EdgePathQualityEvaluationState => {
    const score = { ...calculateEdgePathQualityScore(candidate) };
    const snapshot = buildQualityInputSnapshot(candidate);
    const decomposition = getEdgePathQualityDecomposition(candidate, snapshot);
    return publicState({
      edgeCount: candidate.length,
      edgeReferences: candidate.slice(),
      edgeSegments: decomposition.edgeSegments,
      edgeScores: decomposition.edgeScores,
      owner: stateOwner,
      pairOverlay: decomposition.pairScores,
      parent: null,
      score,
    });
  };

  const baselineNumericState = (): EdgePathQualityEvaluationState => {
    if (!baselineState) {
      baselineState = publicState({
        edgeCount,
        edgeReferences: baseline.slice(),
        edgeSegments: baselineSegments,
        edgeScores: baselineEdgeScores,
        owner: stateOwner,
        pairOverlay: baselinePairScores,
        parent: null,
        score: baselineScore,
      });
    }
    return baselineState;
  };

  const readNumericState = (
    state: EdgePathQualityEvaluationState,
  ): EdgePathQualityNumericState | null => {
    try {
      const numericState = state?.[EDGE_PATH_QUALITY_STATE];
      return numericState?.owner === stateOwner ? numericState : null;
    } catch {
      return null;
    }
  };

  const pairContributionAt = (
    state: EdgePathQualityNumericState,
    pairKey: number,
  ): PairQualityContribution | undefined => {
    let current: EdgePathQualityNumericState | null = state;
    while (current) {
      if (current.pairOverlay.has(pairKey)) {
        return current.pairOverlay.get(pairKey) ?? undefined;
      }
      current = current.parent;
    }
    return undefined;
  };

  const deriveState = (
    parentState: EdgePathQualityEvaluationState,
    candidate: Edge[],
    changedIndexes: readonly number[],
  ): EdgePathQualityEvaluationState => {
    const parent = readNumericState(parentState);
    if (!parent || candidate.length !== parent.edgeCount) return fullState(candidate);
    const uniqueIndexes = [...new Set(changedIndexes)]
      .filter(index => Number.isInteger(index) && index >= 0 && index < parent.edgeCount)
      .sort((first, second) => first - second);
    if (
      uniqueIndexes.length !== changedIndexes.length
      || uniqueIndexes.length > MAX_INCREMENTAL_QUALITY_EDGE_CHANGES
    ) return fullState(candidate);

    const changedSet = new Set(uniqueIndexes);
    for (let index = 0; index < parent.edgeCount; index += 1) {
      if (!changedSet.has(index) && candidate[index] !== parent.edgeReferences[index]) {
        return fullState(candidate);
      }
    }
    if (uniqueIndexes.length === 0) return parentState;

    const score = { ...parent.score };
    const edgeSegments = parent.edgeSegments.slice();
    const edgeScores = parent.edgeScores.slice();
    for (const index of uniqueIndexes) {
      addScore(score, parent.edgeScores[index], -1);
      const path = getEdgePath(candidate[index]);
      const edgeScore = calculateSingleEdgeQuality(path);
      const segments = buildEdgeSegments(path, index);
      edgeScores[index] = edgeScore;
      edgeSegments[index] = segments;
      addScore(score, edgeScore);
    }

    const affectedPairKeys = new Set<number>();
    for (const changedIndex of uniqueIndexes) {
      for (let otherIndex = 0; otherIndex < parent.edgeCount; otherIndex += 1) {
        if (changedIndex === otherIndex) continue;
        const firstIndex = Math.min(changedIndex, otherIndex);
        const secondIndex = Math.max(changedIndex, otherIndex);
        affectedPairKeys.add(firstIndex * parent.edgeCount + secondIndex);
      }
    }

    const pairOverlay = new Map<number, PairQualityContribution | null>();
    for (const pairKey of affectedPairKeys) {
      const firstIndex = Math.floor(pairKey / parent.edgeCount);
      const secondIndex = pairKey % parent.edgeCount;
      addPairContribution(score, pairContributionAt(parent, pairKey), -1);
      const pairContribution = calculateEdgePairQuality(
        candidate[firstIndex],
        candidate[secondIndex],
        edgeSegments[firstIndex],
        edgeSegments[secondIndex],
      );
      addPairContribution(score, pairContribution);
      pairOverlay.set(pairKey, hasPairContribution(pairContribution) ? pairContribution : null);
    }

    return publicState({
      edgeCount: parent.edgeCount,
      edgeReferences: candidate.slice(),
      edgeSegments,
      edgeScores,
      owner: stateOwner,
      pairOverlay,
      parent,
      score,
    });
  };

  const baselineInputIsCurrent = (): boolean => {
    for (let index = 0; index < edgeCount; index += 1) {
      if (
        buildQualityEdgeInputSnapshot(baseline[index]).signature
        !== baselineSnapshot.edgeSignatures[index]
      ) return false;
    }
    return true;
  };

  const evaluateKnownChanges = (
    candidate: Edge[],
    changedIndexes: readonly number[],
    pathAt: (index: number) => Point[],
  ): EdgePathQualityScore => {
    const score = { ...baselineScore };
    if (changedIndexes.length === 0) return score;

    if (changedIndexes.length === 1) {
      const changedIndex = changedIndexes[0];
      addScore(score, baselineEdgeScores[changedIndex], -1);
      const candidatePath = pathAt(changedIndex);
      addScore(score, calculateSingleEdgeQuality(candidatePath));
      const changedSegments = buildEdgeSegments(candidatePath, changedIndex);

      for (let otherIndex = 0; otherIndex < edgeCount; otherIndex += 1) {
        if (changedIndex === otherIndex) continue;
        const firstIndex = Math.min(changedIndex, otherIndex);
        const secondIndex = Math.max(changedIndex, otherIndex);
        const pairKey = firstIndex * edgeCount + secondIndex;
        addPairContribution(score, baselinePairScores.get(pairKey), -1);
        addPairContribution(score, calculateEdgePairQuality(
          candidate[firstIndex],
          candidate[secondIndex],
          firstIndex === changedIndex ? changedSegments : baselineSegments[firstIndex],
          secondIndex === changedIndex ? changedSegments : baselineSegments[secondIndex],
        ));
      }
      return score;
    }

    const candidateSegments = baselineSegments.slice();
    for (const index of changedIndexes) {
      addScore(score, baselineEdgeScores[index], -1);
      const candidatePath = pathAt(index);
      addScore(score, calculateSingleEdgeQuality(candidatePath));
      candidateSegments[index] = buildEdgeSegments(candidatePath, index);
    }

    const affectedPairKeys = new Set<number>();
    for (const changedIndex of changedIndexes) {
      for (let otherIndex = 0; otherIndex < edgeCount; otherIndex += 1) {
        if (changedIndex === otherIndex) continue;
        const firstIndex = Math.min(changedIndex, otherIndex);
        const secondIndex = Math.max(changedIndex, otherIndex);
        affectedPairKeys.add(firstIndex * edgeCount + secondIndex);
      }
    }

    for (const pairKey of affectedPairKeys) {
      const firstIndex = Math.floor(pairKey / edgeCount);
      const secondIndex = pairKey % edgeCount;
      addPairContribution(score, baselinePairScores.get(pairKey), -1);
      addPairContribution(score, calculateEdgePairQuality(
        candidate[firstIndex],
        candidate[secondIndex],
        candidateSegments[firstIndex],
        candidateSegments[secondIndex],
      ));
    }
    return score;
  };

  const context: EdgePathQualityEvaluationContext = {
    createState(candidate: Edge[]): EdgePathQualityEvaluationState {
      if (candidate === baseline && baselineInputIsCurrent()) return baselineNumericState();
      return fullState(candidate);
    },
    evaluate(candidate: Edge[]): EdgePathQualityScore {
      if (candidate === baseline && baselineInputIsCurrent()) return baselineScore;
      if (candidate.length !== edgeCount) return calculateEdgePathQualityScore(candidate);

      const candidateSnapshot = buildQualityInputSnapshot(candidate);
      const cachedScore = readQualityScore(candidate, candidateSnapshot);
      if (cachedScore) return cachedScore;
      const changedIndexes: number[] = [];
      for (let index = 0; index < edgeCount; index += 1) {
        if (candidateSnapshot.edgeSignatures[index] !== baselineSnapshot.edgeSignatures[index]) {
          changedIndexes.push(index);
          if (changedIndexes.length > MAX_INCREMENTAL_QUALITY_EDGE_CHANGES) {
            return calculateEdgePathQualityScore(candidate);
          }
        }
      }

      if (changedIndexes.length === 0) {
        const score = { ...baselineScore };
        rememberQualityScore(candidate, candidateSnapshot, score);
        return score;
      }
      const score = evaluateKnownChanges(
        candidate,
        changedIndexes,
        index => candidateSnapshot.paths[index],
      );

      rememberQualityScore(candidate, candidateSnapshot, score);
      return score;
    },
    evaluateChanged(candidate: Edge[], changedIndexes: readonly number[]): EdgePathQualityScore {
      if (candidate === baseline) {
        return baselineInputIsCurrent()
          ? baselineScore
          : calculateEdgePathQualityScore(candidate);
      }
      if (candidate.length !== edgeCount) return calculateEdgePathQualityScore(candidate);
      const uniqueIndexes = [...new Set(changedIndexes)]
        .filter(index => Number.isInteger(index) && index >= 0 && index < edgeCount)
        .sort((first, second) => first - second);
      if (
        uniqueIndexes.length !== changedIndexes.length
        || uniqueIndexes.length > MAX_INCREMENTAL_QUALITY_EDGE_CHANGES
      ) {
        return calculateEdgePathQualityScore(candidate);
      }
      const changedSnapshots = new Map<number, QualityEdgeInputSnapshot>();
      for (const index of uniqueIndexes) {
        changedSnapshots.set(index, buildQualityEdgeInputSnapshot(candidate[index]));
      }
      const candidateEdgeSignatures = baselineSnapshot.edgeSignatures.slice();
      const candidatePaths = baselineSnapshot.paths.slice();
      for (const [index, snapshot] of changedSnapshots) {
        candidateEdgeSignatures[index] = snapshot.signature;
        candidatePaths[index] = snapshot.path;
      }
      const candidateSnapshot: QualityInputSnapshot = {
        signature: candidateEdgeSignatures.join('\u001e'),
        paths: candidatePaths,
        edgeSignatures: candidateEdgeSignatures,
      };
      const cachedScore = readQualityScore(candidate, candidateSnapshot);
      if (cachedScore) return cachedScore;
      const score = evaluateKnownChanges(
        candidate,
        uniqueIndexes,
        index => changedSnapshots.get(index)?.path ?? baselineSnapshot.paths[index],
      );
      // The incremental result is the exact full-graph score for the declared
      // immutable changes. Seed the normal scorer caches as well: final gates
      // commonly score the accepted candidate again and must not repeat the
      // O(E^2) pair decomposition that this context has already evaluated.
      rememberQualityScore(candidate, candidateSnapshot, score);
      return score;
    },
    evaluateStateChanged(
      parentState: EdgePathQualityEvaluationState,
      candidate: Edge[],
      changedIndexes: readonly number[],
    ): EdgePathQualityEvaluationState {
      return deriveState(parentState, candidate, changedIndexes);
    },
  };
  qualityEvaluationContextCache.set(baseline, {
    signature: baselineSnapshot.signature,
    context,
  });
  return context;
}

function compareScores(first: EdgePathQualityScore, second: EdgePathQualityScore): number {
  const keys: Array<keyof EdgePathQualityScore> = [
    'nonOrthogonalSegments',
    'strictCrossings',
    'reverseOverlap',
    'unrelatedOverlap',
    'unexplainedRelatedOverlap',
    'shortEndpointStubs',
    'tinyInteriorDoglegs',
    'hairpins',
    'backtrackPenalty',
    'detourPenalty',
    'bends',
    'totalLength',
  ];
  for (const key of keys) {
    const delta = first[key] - second[key];
    if (delta !== 0) return delta;
  }
  return 0;
}

export function keepIfNoNewStrictCrossings<T extends Edge[]>(baseline: T, candidate: T): T {
  const baselineCrossings = countStrictEdgeCrossings(baseline);
  const candidateCrossings = countStrictEdgeCrossings(candidate);
  return candidateCrossings <= baselineCrossings
    ? candidate
    : baseline;
}

export function chooseFewestStrictCrossings<T extends Edge[]>(...candidates: T[]): T {
  if (candidates.length === 0) return [] as unknown as T;
  const uniqueCandidates = candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
  const leadingMetrics = uniqueCandidates.map((candidate) => {
    const paths = candidate.map(getEdgePath);
    return {
      candidate,
      nonOrthogonalSegments: paths.reduce(
        (total, path) => total + countNonOrthogonalSegments(path),
        0,
      ),
    };
  });
  let bestLeading = leadingMetrics[0];
  for (let index = 1; index < leadingMetrics.length; index += 1) {
    const metric = leadingMetrics[index];
    if (metric.nonOrthogonalSegments < bestLeading.nonOrthogonalSegments) bestLeading = metric;
  }
  const orthogonalFinalists = leadingMetrics.filter(
    metric => metric.nonOrthogonalSegments === bestLeading.nonOrthogonalSegments,
  );
  if (orthogonalFinalists.length === 1) return orthogonalFinalists[0].candidate;

  const baseline = orthogonalFinalists[0].candidate;
  const qualityContext = createEdgePathQualityEvaluationContext(baseline);
  let best = baseline;
  let bestScore = qualityContext.evaluate(baseline);
  for (let index = 1; index < orthogonalFinalists.length; index += 1) {
    const candidate = orthogonalFinalists[index].candidate;
    const candidateScore = qualityContext.evaluate(candidate);
    if (
      candidateScore.strictCrossings < bestScore.strictCrossings
      || (
        candidateScore.strictCrossings === bestScore.strictCrossings
        && compareScores(candidateScore, bestScore) < 0
      )
    ) {
      best = candidate;
      bestScore = candidateScore;
    }
  }
  return best;
}
