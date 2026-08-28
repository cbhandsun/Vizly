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
  compareEdgePathQualityScores,
  countNonOrthogonalSegments,
  getEdgePath,
  getSegments,
  hasPairContribution,
} from './edgePathQualityGeometry';
import {
  buildQualityEdgeInputSnapshot,
  buildQualityInputSignature,
  buildQualityInputSnapshot,
  type QualityEdgeInputSnapshot,
  type QualityInputSnapshot,
} from './edgePathQualityInputSnapshot';
import {
  calculateMemoizedEdgePairQuality,
  EdgePathQualityGenerationalPairMemo,
  readSharedEdgePairQualityMemoMetrics,
} from './edgePathQualityPairMemo';
import {
  collectPotentialChangedEdgePairKeys,
  createReusableEdgePathQualitySegmentIndex,
} from './edgePathQualitySegmentIndex';
import {
  calculateMemoizedEdgePathQualityDecomposition,
  type EdgePathQualityDecomposition,
} from './edgePathQualityFullScan';
import {
  shouldUseIncrementalEdgePathQualityEvaluation,
  shouldUseIncrementalEdgePathQualityState,
} from './edgePathQualityIncrementalPolicy';
import {
  countIndexedStrictSegmentCrossings,
  type StrictCrossingIndexDiagnostics,
} from './edgeStrictCrossingIndex';
import { readSignatureValue, rememberBoundedSignatureValue } from './boundedSignatureCache';

export { MIN_EDGE_PATH_PENALIZED_OVERLAP } from './edgePathQualityGeometry';
export type { EdgePathQualityScore } from './edgePathQualityGeometry';

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
export const readEdgePairQualityMemoMetrics = readSharedEdgePairQualityMemoMetrics;

const EDGE_PATH_QUALITY_STATE = Symbol('edge-path-quality-state');

type EdgePathQualityNumericState = {
  edgeCount: number;
  edgeReferences: Edge[];
  edgeSignatures: string[];
  edgeSegments: Segment[][];
  edgeScores: EdgePathQualityScore[];
  changedFromBaselineIndexes: ReadonlySet<number>;
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

function getEdgePathQualityDecomposition(
  edges: Edge[],
  snapshot: QualityInputSnapshot,
  scanMetrics?: { scannedEdgePairCount: number },
): EdgePathQualityDecomposition {
  const cached = qualityDecompositionCache.get(snapshot.signature);
  if (cached) return cached;

  const decomposition = calculateMemoizedEdgePathQualityDecomposition(edges, snapshot, scanMetrics);
  qualityDecompositionCache.set(snapshot.signature, decomposition, {
    edges: edges.length,
    segments: decomposition.edgeSegments.reduce(
      (total, segments) => total + segments.length,
      0,
    ),
    pairs: decomposition.pairScores.size,
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
  rememberBoundedSignatureValue(
    qualityScoreSignatureCache,
    snapshot.signature,
    score,
    QUALITY_SIGNATURE_CACHE_LIMIT,
  );
  rememberBoundedSignatureValue(
    strictCrossingSignatureCache,
    snapshot.signature,
    score.strictCrossings,
    QUALITY_SIGNATURE_CACHE_LIMIT,
  );
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

export function countStrictEdgeCrossings(
  edges: Edge[],
  diagnostics?: StrictCrossingIndexDiagnostics,
): number {
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
  const total = countIndexedStrictSegmentCrossings(getSegments(snapshot.paths), diagnostics);
  strictCrossingCache.set(edges, { signature: snapshot.signature, count: total });
  rememberBoundedSignatureValue(
    strictCrossingSignatureCache,
    snapshot.signature,
    total,
    QUALITY_SIGNATURE_CACHE_LIMIT,
  );
  return total;
}

export function calculateEdgePathQualityScore(
  edges: Edge[],
  scanMetrics?: { scannedEdgePairCount: number },
): EdgePathQualityScore {
  const snapshot = buildQualityInputSnapshot(edges);
  const cached = readQualityScore(edges, snapshot);
  if (cached) return cached;
  const score = { ...getEdgePathQualityDecomposition(edges, snapshot, scanMetrics).score };

  rememberQualityScore(edges, snapshot, score);
  return score;
}

export type EdgePathQualityEvaluationContext = {
  createState: (candidate: Edge[]) => EdgePathQualityEvaluationState;
  readCached?: (candidate: Edge[]) => EdgePathQualityScore | undefined;
  evaluate: (candidate: Edge[]) => EdgePathQualityScore;
  evaluateChanged: (candidate: Edge[], changedIndexes: readonly number[]) => EdgePathQualityScore;
  rememberState?: (
    candidate: Edge[],
    state: EdgePathQualityEvaluationState,
  ) => boolean;
  edgeHasPairRepairOpportunity?: (edgeIndex: number) => boolean;
  readMetrics?: () => Readonly<{
    pairCacheHitCount: number;
    segmentQueryCacheHitCount: number;
    scannedEdgePairCount: number;
    scannedSegmentCount: number;
  }>;
  evaluateStateChanged: (
    parentState: EdgePathQualityEvaluationState,
    candidate: Edge[],
    changedIndexes: readonly number[],
  ) => EdgePathQualityEvaluationState;
};

export type EdgePathQualityEvaluationInitializationMetrics = {
  cacheHit: boolean;
  scannedEdgePairCount: number;
  scannedSegmentCount: number;
};

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
  initializationMetrics?: EdgePathQualityEvaluationInitializationMetrics,
): EdgePathQualityEvaluationContext {
  const baselineSnapshot = buildQualityInputSnapshot(baseline);
  const cached = qualityEvaluationContextCache.get(baseline);
  if (cached?.signature === baselineSnapshot.signature) {
    if (initializationMetrics) {
      initializationMetrics.cacheHit = true;
      initializationMetrics.scannedEdgePairCount = 0;
      initializationMetrics.scannedSegmentCount = 0;
    }
    return cached.context;
  }

  const metrics = {
    pairCacheHitCount: 0,
    segmentQueryCacheHitCount: 0,
    scannedEdgePairCount: 0,
    scannedSegmentCount: 0,
  };
  const baselineDecomposition = getEdgePathQualityDecomposition(baseline, baselineSnapshot, metrics);
  const baselineSegments = baselineDecomposition.edgeSegments;
  const baselineSegmentIndex = createReusableEdgePathQualitySegmentIndex(baselineSegments);
  const baselineEdgeScores = baselineDecomposition.edgeScores;
  const baselinePairScores = baselineDecomposition.pairScores;
  const derivedPairMemo = new EdgePathQualityGenerationalPairMemo();
  const baselineScore = { ...baselineDecomposition.score };
  const edgeCount = baseline.length;
  const baselinePairScoresByEdge = Array.from(
    { length: edgeCount },
    () => [] as Array<readonly [number, PairQualityContribution]>,
  );
  for (const [pairKey, contribution] of baselinePairScores) {
    const firstIndex = Math.floor(pairKey / edgeCount);
    const secondIndex = pairKey % edgeCount;
    baselinePairScoresByEdge[firstIndex].push([pairKey, contribution]);
    baselinePairScoresByEdge[secondIndex].push([pairKey, contribution]);
  }
  const pairRepairEdgeIndexes = new Set<number>();
  for (const [pairKey, contribution] of baselinePairScores) {
    // Micro cleanup can accept a globally non-local improvement only when it
    // removes a strict crossing. Parallel-overlap reductions alone are not an
    // acceptance condition, so they must not disable the exact local prefilter.
    if (contribution.strictCrossings <= 0) continue;
    pairRepairEdgeIndexes.add(Math.floor(pairKey / edgeCount));
    pairRepairEdgeIndexes.add(pairKey % edgeCount);
  }
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
    const snapshot = buildQualityInputSnapshot(candidate);
    const decomposition = getEdgePathQualityDecomposition(candidate, snapshot, metrics);
    const score = { ...decomposition.score };
    rememberQualityScore(candidate, snapshot, score);
    return publicState({
      edgeCount: candidate.length,
      edgeReferences: candidate.slice(),
      edgeSignatures: snapshot.edgeSignatures,
      edgeSegments: decomposition.edgeSegments,
      edgeScores: decomposition.edgeScores,
      changedFromBaselineIndexes: new Set(candidate.map((_, index) => index)),
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
        changedFromBaselineIndexes: new Set(),
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
    if (!shouldUseIncrementalEdgePathQualityState(uniqueIndexes.length)) {
      uniqueIndexes = [];
      for (let index = 0; index < parent.edgeCount; index += 1) {
        const snapshot = buildQualityEdgeInputSnapshot(candidate[index]);
        edgeSignatures[index] = snapshot.signature;
        if (snapshot.signature === parent.edgeSignatures[index]) continue;
        uniqueIndexes.push(index);
        changedSnapshots.set(index, snapshot);
        if (!shouldUseIncrementalEdgePathQualityState(uniqueIndexes.length)) {
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
        changedFromBaselineIndexes: parent.changedFromBaselineIndexes,
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
      addPairContribution(score, pairContributionAt(parent, pairKey), -1);
      pairOverlay.set(pairKey, null);
    }
    const candidatePairQuery = collectPotentialChangedEdgePairKeys({
      additionalPeerIndexes: [...parent.changedFromBaselineIndexes],
      changedIndexes: uniqueIndexes,
      edgeCount: parent.edgeCount,
      edgeSegments,
      segmentIndex: baselineSegmentIndex,
    });
    metrics.segmentQueryCacheHitCount += candidatePairQuery.cacheHitCount;
    metrics.scannedSegmentCount += candidatePairQuery.scannedSegmentCount;
    for (const pairKey of candidatePairQuery.pairKeys) {
      const firstIndex = Math.floor(pairKey / parent.edgeCount);
      const secondIndex = pairKey % parent.edgeCount;
      const firstSignature = edgeSignatures[firstIndex];
      const secondSignature = edgeSignatures[secondIndex];
      let pairContribution = derivedPairMemo.get(firstSignature, secondSignature);
      if (pairContribution) {
        metrics.pairCacheHitCount += 1;
      } else {
        metrics.scannedEdgePairCount += 1;
        pairContribution = calculateEdgePairQuality(
          candidate[firstIndex],
          candidate[secondIndex],
          edgeSegments[firstIndex],
          edgeSegments[secondIndex],
        );
        derivedPairMemo.set(firstSignature, secondSignature, pairContribution);
      }
      addPairContribution(score, pairContribution);
      pairOverlay.set(pairKey, hasPairContribution(pairContribution) ? pairContribution : null);
    }

    return publicState({
      edgeCount: parent.edgeCount,
      edgeReferences: candidate.slice(),
      edgeSignatures,
      edgeSegments,
      edgeScores,
      changedFromBaselineIndexes: new Set([
        ...parent.changedFromBaselineIndexes,
        ...uniqueIndexes,
      ]),
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
    signatureAt: (index: number) => string,
  ): EdgePathQualityScore => {
    const score = { ...baselineScore };
    if (changedIndexes.length === 0) return score;

    if (changedIndexes.length === 1) {
      const changedIndex = changedIndexes[0];
      addScore(score, baselineEdgeScores[changedIndex], -1);
      const candidatePath = pathAt(changedIndex);
      addScore(score, calculateSingleEdgeQuality(candidatePath));
      const changedSegments = buildEdgeSegments(candidatePath, changedIndex);
      for (const [, contribution] of baselinePairScoresByEdge[changedIndex]) {
        addPairContribution(score, contribution, -1);
      }
      const excluded = new Set([changedIndex]);
      const segmentQuery = baselineSegmentIndex.queryPotentialEdgeIndexes(
        changedSegments,
        excluded,
      );
      if (segmentQuery.cacheHit) metrics.segmentQueryCacheHitCount += 1;
      metrics.scannedSegmentCount += segmentQuery.scannedSegmentCount;

      for (const otherIndex of segmentQuery.edgeIndexes) {
        const firstIndex = Math.min(changedIndex, otherIndex);
        const secondIndex = Math.max(changedIndex, otherIndex);
        metrics.scannedEdgePairCount += 1;
        addPairContribution(score, calculateMemoizedEdgePairQuality(
          candidate[firstIndex],
          candidate[secondIndex],
          firstIndex === changedIndex ? changedSegments : baselineSegments[firstIndex],
          secondIndex === changedIndex ? changedSegments : baselineSegments[secondIndex],
          signatureAt(firstIndex),
          signatureAt(secondIndex),
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

    const changedSet = new Set(changedIndexes);
    const affectedPairKeys = new Set<number>();
    for (const [pairKey, contribution] of baselinePairScores) {
      const firstIndex = Math.floor(pairKey / edgeCount);
      const secondIndex = pairKey % edgeCount;
      if (changedSet.has(firstIndex) || changedSet.has(secondIndex)) {
        addPairContribution(score, contribution, -1);
      }
    }
    const candidatePairQuery = collectPotentialChangedEdgePairKeys({
      changedIndexes,
      edgeCount,
      edgeSegments: candidateSegments,
      segmentIndex: baselineSegmentIndex,
    });
    metrics.segmentQueryCacheHitCount += candidatePairQuery.cacheHitCount;
    metrics.scannedSegmentCount += candidatePairQuery.scannedSegmentCount;
    candidatePairQuery.pairKeys.forEach(pairKey => affectedPairKeys.add(pairKey));

    for (const pairKey of affectedPairKeys) {
      const firstIndex = Math.floor(pairKey / edgeCount);
      const secondIndex = pairKey % edgeCount;
      metrics.scannedEdgePairCount += 1;
      addPairContribution(score, calculateMemoizedEdgePairQuality(
        candidate[firstIndex],
        candidate[secondIndex],
        candidateSegments[firstIndex],
        candidateSegments[secondIndex],
        signatureAt(firstIndex),
        signatureAt(secondIndex),
      ));
    }
    return score;
  };

  const context: EdgePathQualityEvaluationContext = {
    readMetrics: () => ({ ...metrics }),
    readCached(candidate): EdgePathQualityScore | undefined {
      const snapshot = buildQualityInputSnapshot(candidate);
      return readQualityScore(candidate, snapshot);
    },
    rememberState(candidate, state): boolean {
      const numericState = readNumericState(state);
      if (!numericState || candidate.length !== numericState.edgeCount) return false;
      const snapshot = buildQualityInputSnapshot(candidate);
      if (snapshot.edgeSignatures.some((signature, index) => (
        signature !== numericState.edgeSignatures[index]
      ))) return false;
      rememberQualityScore(candidate, snapshot, { ...numericState.score });
      return true;
    },
    edgeHasPairRepairOpportunity(edgeIndex: number): boolean {
      return Number.isSafeInteger(edgeIndex)
        && edgeIndex >= 0
        && edgeIndex < edgeCount
        && pairRepairEdgeIndexes.has(edgeIndex);
    },
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
          if (!shouldUseIncrementalEdgePathQualityEvaluation(
            edgeCount,
            changedIndexes.length,
          )) {
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
        index => candidateSnapshot.edgeSignatures[index],
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
        || !shouldUseIncrementalEdgePathQualityEvaluation(edgeCount, uniqueIndexes.length)
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
        signature: buildQualityInputSignature(candidateEdgeSignatures),
        paths: candidatePaths,
        edgeSignatures: candidateEdgeSignatures,
      };
      const cachedScore = readQualityScore(candidate, candidateSnapshot);
      if (cachedScore) return cachedScore;
      const score = evaluateKnownChanges(
        candidate,
        uniqueIndexes,
        index => changedSnapshots.get(index)?.path ?? baselineSnapshot.paths[index],
        index => candidateSnapshot.edgeSignatures[index],
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
  if (initializationMetrics) {
    initializationMetrics.cacheHit = false;
    initializationMetrics.scannedEdgePairCount = metrics.scannedEdgePairCount;
    initializationMetrics.scannedSegmentCount = metrics.scannedSegmentCount;
  }
  return context;
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
        && compareEdgePathQualityScores(candidateScore, bestScore) < 0
      )
    ) {
      best = candidate;
      bestScore = candidateScore;
    }
  }
  return best;
}
