import type { Edge } from '@xyflow/react';

import { BoundedEvaluationLruCache } from './boundedEvaluationLruCache';
import type {
  EdgePathQualityScore,
  PairQualityContribution,
  Point,
  Segment,
} from './edgePathQualityGeometry';
import {
  addPairContribution,
  addScore,
  buildEdgeSegments,
  calculateEdgePairQuality,
  calculateSingleEdgeQuality,
  countNonOrthogonalSegments,
  emptyScore,
  getEdgePath,
  getSegments,
  hasPairContribution,
  strictlyCrosses,
} from './edgePathQualityGeometry';
import { edgeRoutingQualityIntentToken } from './edgeRoutingQualityIntent';

export { MIN_EDGE_PATH_PENALIZED_OVERLAP } from './edgePathQualityGeometry';
export type { EdgePathQualityScore } from './edgePathQualityGeometry';

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
  edgeSignatures: string[];
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
      edgeSignatures: snapshot.edgeSignatures,
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
        edgeSignatures: baselineSnapshot.edgeSignatures,
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
    let uniqueIndexes = [...new Set(changedIndexes)]
      .filter(index => Number.isInteger(index) && index >= 0 && index < parent.edgeCount)
      .sort((first, second) => first - second);
    if (uniqueIndexes.length !== changedIndexes.length) return fullState(candidate);

    const edgeSignatures = parent.edgeSignatures.slice();
    const changedSnapshots = new Map<number, QualityEdgeInputSnapshot>();
    if (uniqueIndexes.length > MAX_INCREMENTAL_QUALITY_EDGE_CHANGES) {
      uniqueIndexes = [];
      for (let index = 0; index < parent.edgeCount; index += 1) {
        const snapshot = buildQualityEdgeInputSnapshot(candidate[index]);
        edgeSignatures[index] = snapshot.signature;
        if (snapshot.signature === parent.edgeSignatures[index]) continue;
        uniqueIndexes.push(index);
        changedSnapshots.set(index, snapshot);
        if (uniqueIndexes.length > MAX_INCREMENTAL_QUALITY_EDGE_CHANGES) {
          return fullState(candidate);
        }
      }
    }

    const changedSet = new Set(uniqueIndexes);
    for (let index = 0; index < parent.edgeCount; index += 1) {
      if (!changedSet.has(index) && candidate[index] !== parent.edgeReferences[index]) {
        const snapshot = changedSnapshots.get(index) ?? buildQualityEdgeInputSnapshot(candidate[index]);
        edgeSignatures[index] = snapshot.signature;
        if (snapshot.signature !== parent.edgeSignatures[index]) return fullState(candidate);
      }
    }
    if (uniqueIndexes.length === 0) {
      if (candidate.every((edge, index) => edge === parent.edgeReferences[index])) return parentState;
      return publicState({
        edgeCount: parent.edgeCount,
        edgeReferences: candidate.slice(),
        edgeSignatures,
        edgeSegments: parent.edgeSegments,
        edgeScores: parent.edgeScores,
        owner: stateOwner,
        pairOverlay: new Map(),
        parent,
        score: parent.score,
      });
    }

    const score = { ...parent.score };
    const edgeSegments = parent.edgeSegments.slice();
    const edgeScores = parent.edgeScores.slice();
    for (const index of uniqueIndexes) {
      addScore(score, parent.edgeScores[index], -1);
      const snapshot = changedSnapshots.get(index) ?? buildQualityEdgeInputSnapshot(candidate[index]);
      changedSnapshots.set(index, snapshot);
      edgeSignatures[index] = snapshot.signature;
      const path = snapshot.path;
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
      edgeSignatures,
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
        // Repair stages sometimes recreate every Edge object even when only a
        // few routing inputs changed. Revalidate the broad reference-based hint
        // against exact signatures before falling back to the O(E^2) scorer.
        return context.evaluate(candidate);
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

  const strictFinalists = orthogonalFinalists.map(metric => ({
    candidate: metric.candidate,
    strictCrossings: countStrictEdgeCrossings(metric.candidate),
  }));
  let bestStrict = strictFinalists[0].strictCrossings;
  for (let index = 1; index < strictFinalists.length; index += 1) {
    bestStrict = Math.min(bestStrict, strictFinalists[index].strictCrossings);
  }
  const qualityFinalists = strictFinalists.filter(
    metric => metric.strictCrossings === bestStrict,
  );
  if (qualityFinalists.length === 1) return qualityFinalists[0].candidate;

  const baseline = qualityFinalists[0].candidate;
  const qualityContext = createEdgePathQualityEvaluationContext(baseline);
  let best = baseline;
  let bestScore = qualityContext.evaluate(baseline);
  for (let index = 1; index < qualityFinalists.length; index += 1) {
    const candidate = qualityFinalists[index].candidate;
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
