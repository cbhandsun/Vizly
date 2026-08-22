import type { Edge, Node } from '@xyflow/react';

import {
  calculateEdgePathQualityScore,
  countStrictEdgeCrossings,
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { edgeRoutingQualityIntentToken } from '../../strategies/shared/edgeRoutingQualityIntent';
import { MINIMUM_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { createNodeClearanceGraphEvaluationContext } from '../../strategies/shared/edgeWaypointCandidateRepair';
import {
  compactDisplayEdgePaths,
  displayRoutingObstaclesSignature,
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  getDisplayNodeRect,
} from './baseReactFlowDisplayGeometry';
import { createDisplayObstacleHitContext } from './baseReactFlowDisplayObstacleHitCache';
import {
  createDisplayTerminalValidationSnapshot,
  displayTerminalValidationDoesNotRegress,
} from './baseReactFlowTerminalValidation';

export type DisplaySoftQualityOptions = {
  maxEdges: number;
  maxCandidatesPerEdge: number;
  maxQualityEvaluations: number;
  skipOuterFallback?: boolean;
};

export type DisplayQualityBudget = {
  mode: 'full' | 'bounded' | 'fast';
  soft: DisplaySoftQualityOptions;
  finalSoft: DisplaySoftQualityOptions;
};

export type DisplayObstacleEvaluationContext = {
  evaluate: (candidate: Edge[]) => number;
  evaluateChanged: (candidate: Edge[], changedIndexes: readonly number[]) => number;
  /**
   * Exact incremental evaluation for candidates constructed immutably from this
   * context's baseline. The caller guarantees that every changed edge index is
   * listed and that the baseline nodes have not been mutated.
   */
  evaluateKnownChanges: (candidate: Edge[], changedIndexes: readonly number[]) => number;
};

export type BaseDisplayBoundedCandidateReport = {
  candidate: 'terminal-lane' | 'polished';
  hardClean: boolean;
  obstacleHits: number;
  terminalsAttached: boolean;
  terminalsAnchored: boolean;
  quality: EdgePathQualityScore;
  /** Visual-risk diagnostics for unrelated business-node clearance below 16px. */
  minimumClearanceViolations?: number;
  minimumClearanceViolationEdgeIds?: string[];
};

export type DisplayTerminalGateEvaluation = {
  terminalsAttached: boolean;
  terminalsAnchored: boolean;
};

export type DisplayTerminalGateEvaluator = (
  edges: Edge[],
  nodes: Node[],
) => DisplayTerminalGateEvaluation;

export const displayHardQualityReportGeometryIsClean = (
  report: BaseDisplayBoundedCandidateReport,
): boolean => report.quality.nonOrthogonalSegments === 0
  && report.quality.strictCrossings === 0
  && report.quality.reverseOverlap === 0
  && report.quality.unrelatedOverlap === 0
  && report.quality.unexplainedRelatedOverlap === 0
  && report.quality.shortEndpointStubs === 0
  && report.quality.tinyInteriorDoglegs === 0
  && report.quality.hairpins === 0
  && report.obstacleHits === 0;

export const resolveDisplayQualityBudget = (
  edges: Edge[],
  nodes: Node[],
  isLargeGraph: boolean,
  forceFullQuality = false,
): DisplayQualityBudget => {
  if ((!forceFullQuality && isLargeGraph) || edges.length > 80 || nodes.length > 120) {
    return {
      mode: 'fast',
      soft: { maxEdges: 1, maxCandidatesPerEdge: 8, maxQualityEvaluations: 8 },
      finalSoft: { maxEdges: 1, maxCandidatesPerEdge: 8, maxQualityEvaluations: 8 },
    };
  }

  if (edges.length > 16 || nodes.length > 24) {
    return {
      mode: 'bounded',
      soft: { maxEdges: 2, maxCandidatesPerEdge: 16, maxQualityEvaluations: 18 },
      finalSoft: { maxEdges: 2, maxCandidatesPerEdge: 16, maxQualityEvaluations: 18 },
    };
  }

  return {
    mode: 'full',
    soft: { maxEdges: 4, maxCandidatesPerEdge: 40, maxQualityEvaluations: 56 },
    finalSoft: { maxEdges: 4, maxCandidatesPerEdge: 32, maxQualityEvaluations: 48 },
  };
};

export const finalVisualPolishScoreFromQuality = (score: EdgePathQualityScore): number => (
  score.nonOrthogonalSegments * 1_000_000
    + score.strictCrossings * 1_000_000
    + score.reverseOverlap * 1_000
    + score.unrelatedOverlap * 900
    + score.hairpins * 20_000
    + score.tinyInteriorDoglegs * 1_200
    + score.shortEndpointStubs * 50_000
    + score.backtrackPenalty * 400
    + score.detourPenalty * 1.5
    + score.bends * 6
    + score.totalLength * 0.01
);

export const visualPolishHardQualityDoesNotRegress = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean => (
  candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
  && candidate.strictCrossings <= baseline.strictCrossings
  && candidate.reverseOverlap <= baseline.reverseOverlap
  && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
  && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
  && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
  && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
  && candidate.hairpins <= baseline.hairpins
);

export const visualPolishHardQualityWithoutStrictDoesNotRegress = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean => (
  candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
  && candidate.reverseOverlap <= baseline.reverseOverlap
  && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
  && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
  && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
  && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
  && candidate.hairpins <= baseline.hairpins
);

export const DISPLAY_STRICT_REPAIR_OVERLAP_SLACK = 256;

export const displayStrictRepairHardQualityIsAcceptable = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean => (
  candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
  && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
  && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
  && candidate.hairpins <= baseline.hairpins
  && candidate.reverseOverlap <= baseline.reverseOverlap + DISPLAY_STRICT_REPAIR_OVERLAP_SLACK
  && candidate.unrelatedOverlap <= baseline.unrelatedOverlap + DISPLAY_STRICT_REPAIR_OVERLAP_SLACK
  && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap + DISPLAY_STRICT_REPAIR_OVERLAP_SLACK
);

export const changedDisplayEdgeIndexesByReference = (
  baseline: Edge[],
  candidate: Edge[],
): number[] | null => {
  if (candidate.length !== baseline.length) return null;
  if (candidate === baseline) return [];
  const changedIndexes: number[] = [];
  for (let index = 0; index < baseline.length; index += 1) {
    if (candidate[index] !== baseline[index]) changedIndexes.push(index);
  }
  // A fresh array with the same edge objects may still reflect an in-place path
  // mutation. Preserve the signature-aware full evaluator for that uncommon case.
  return changedIndexes.length > 0 ? changedIndexes : null;
};

export const evaluateDisplayQualityCandidate = (
  context: EdgePathQualityEvaluationContext,
  baseline: Edge[],
  candidate: Edge[],
): EdgePathQualityScore => {
  const changedIndexes = changedDisplayEdgeIndexesByReference(baseline, candidate);
  return changedIndexes
    ? context.evaluateChanged(candidate, changedIndexes)
    : context.evaluate(candidate);
};

const uniqueDisplayCandidateReferences = <T extends Edge[]>(
  baseline: T,
  candidates: readonly T[],
): T[] => {
  const seen = new Set<T>([baseline]);
  return candidates.filter((candidate) => {
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    return true;
  });
};

export const chooseFinalVisualPolishCandidate = <T extends Edge[]>(baseline: T, ...candidates: T[]): T => {
  const uniqueCandidates = uniqueDisplayCandidateReferences(baseline, candidates);
  if (uniqueCandidates.length === 0) return baseline;
  const qualityContext = createEdgePathQualityEvaluationContext(baseline);
  let previousCandidate: T = baseline;
  let previousState = qualityContext.createState(baseline);
  const baselineQuality = previousState.score;
  let best = baseline;
  let bestScore = finalVisualPolishScoreFromQuality(baselineQuality);
  for (const candidate of uniqueCandidates) {
    const changedIndexes = changedDisplayEdgeIndexesByReference(previousCandidate, candidate);
    const candidateState = changedIndexes
      ? qualityContext.evaluateStateChanged(previousState, candidate, changedIndexes)
      : qualityContext.createState(candidate);
    const candidateQuality = candidateState.score;
    previousCandidate = candidate;
    previousState = candidateState;
    if (!visualPolishHardQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
    const candidateScore = finalVisualPolishScoreFromQuality(candidateQuality);
    if (candidateScore < bestScore - 1) {
      best = candidate;
      bestScore = candidateScore;
    }
  }
  return best;
};

export const displayObstacleEdgeSignature = (edge: Edge): string => {
  const path = getDisplayComputedPath(edge);
  return JSON.stringify([
    edge.source,
    edge.target,
    path.map(point => [point.x, point.y]),
  ]);
};

const countDisplayEdgeObstacleHits = (
  edge: Edge,
  hitContext: ReturnType<typeof createDisplayObstacleHitContext>,
): number => {
  const path = getDisplayComputedPath(edge);
  return hitContext.countRouting(path, edge);
};

const countDisplayObstacleHitsAgainst = (
  edges: Edge[],
  hitContext: ReturnType<typeof createDisplayObstacleHitContext>,
): number => edges.reduce((hitCount, edge) => (
  hitCount + countDisplayEdgeObstacleHits(edge, hitContext)
), 0);

export const countDisplayObstacleHits = (edges: Edge[], nodes: Node[]): number => {
  if (edges.length === 0 || nodes.length === 0) return 0;
  const hitContext = createDisplayObstacleHitContext(nodes);
  return hitContext.obstacles.size === 0
    ? 0
    : countDisplayObstacleHitsAgainst(edges, hitContext);
};

export const keepPerEdgeObstacleNonRegressingCandidates = <T extends Edge[]>(
  baseline: T,
  candidate: T,
  nodes: Node[],
): T => {
  if (baseline.length !== candidate.length || baseline === candidate) return baseline;
  const hitContext = createDisplayObstacleHitContext(nodes);
  const candidateById = new Map(candidate.map(edge => [edge.id, edge] as const));
  let changed = false;
  const safeEdges = baseline.map((edge, index) => {
    const candidateEdge = candidate[index]?.id === edge.id
      ? candidate[index]
      : candidateById.get(edge.id);
    if (!candidateEdge || candidateEdge === edge) return edge;
    const baselineHits = countDisplayEdgeObstacleHits(edge, hitContext);
    const candidateHits = countDisplayEdgeObstacleHits(candidateEdge, hitContext);
    if (candidateHits > baselineHits) return edge;
    changed = true;
    return candidateEdge;
  });
  return changed ? safeEdges as T : baseline;
};

export const changedEdgesObstacleHitsDoNotRegress = (
  baseline: readonly Edge[],
  candidate: readonly Edge[],
  changedIndexes: readonly number[],
  nodes: Node[],
): boolean => {
  if (baseline.length !== candidate.length) return false;
  const hitContext = createDisplayObstacleHitContext(nodes);
  return [...new Set(changedIndexes)].every(index => {
    const baselineEdge = baseline[index];
    const candidateEdge = candidate[index];
    if (!baselineEdge || !candidateEdge || baselineEdge.id !== candidateEdge.id) return false;
    return countDisplayEdgeObstacleHits(candidateEdge, hitContext)
      <= countDisplayEdgeObstacleHits(baselineEdge, hitContext);
  });
};

type CachedDisplayObstacleEvaluationContext = {
  edgeSignature: string;
  nodeSignature: string;
  context: DisplayObstacleEvaluationContext;
};

// Both keys are weak and each live (edges, nodes) pair retains only its latest
// exact input signature, so repeated routing stages can reuse analysis without
// keeping prior graph snapshots alive.
const displayObstacleEvaluationContextCache = new WeakMap<
  Edge[],
  WeakMap<Node[], CachedDisplayObstacleEvaluationContext>
>();

const displayObstacleEdgesSignature = (edges: Edge[]): string => JSON.stringify(
  edges.map(displayObstacleEdgeSignature),
);

export const createDisplayObstacleEvaluationContext = (
  baseline: Edge[],
  nodes: Node[],
): DisplayObstacleEvaluationContext => {
  const edgeSignature = displayObstacleEdgesSignature(baseline);
  const hitContext = createDisplayObstacleHitContext(nodes);
  const nodeSignature = hitContext.nodeSignature;
  const cachedByNodes = displayObstacleEvaluationContextCache.get(baseline);
  const cached = cachedByNodes?.get(nodes);
  if (
    cached?.edgeSignature === edgeSignature
    && cached.nodeSignature === nodeSignature
  ) return cached.context;

  const baselineSignatures = baseline.map(displayObstacleEdgeSignature);
  const baselineHits = baseline.map(edge => countDisplayEdgeObstacleHits(edge, hitContext));
  const baselineTotal = baselineHits.reduce((total, hits) => total + hits, 0);
  const baselineInputsAreCurrent = (): boolean => (
    displayObstacleEdgesSignature(baseline) === edgeSignature
    && displayRoutingObstaclesSignature(nodes) === nodeSignature
  );
  const evaluateKnownChanges = (
    candidate: Edge[],
    changedIndexes: readonly number[],
  ): number => {
    if (candidate === baseline) return baselineTotal;
    if (candidate.length !== baseline.length) return countDisplayObstacleHits(candidate, nodes);
    const uniqueIndexes = [...new Set(changedIndexes)]
      .filter(index => Number.isInteger(index) && index >= 0 && index < candidate.length);
    if (uniqueIndexes.length !== changedIndexes.length) return countDisplayObstacleHits(candidate, nodes);
    let total = baselineTotal;
    for (const index of uniqueIndexes) {
      const candidateHits = countDisplayEdgeObstacleHits(
        candidate[index],
        hitContext,
      );
      total += candidateHits - baselineHits[index];
    }
    return total;
  };

  const context: DisplayObstacleEvaluationContext = {
    evaluate(candidate: Edge[]): number {
      if (!baselineInputsAreCurrent()) return countDisplayObstacleHits(candidate, nodes);
      if (candidate === baseline) return baselineTotal;
      if (candidate.length !== baseline.length) return countDisplayObstacleHits(candidate, nodes);
      let total = baselineTotal;
      for (let index = 0; index < candidate.length; index += 1) {
        if (displayObstacleEdgeSignature(candidate[index]) === baselineSignatures[index]) continue;
        const candidateHits = countDisplayEdgeObstacleHits(
          candidate[index],
          hitContext,
        );
        total += candidateHits - baselineHits[index];
      }
      return total;
    },
    evaluateChanged(candidate: Edge[], changedIndexes: readonly number[]): number {
      if (!baselineInputsAreCurrent()) return countDisplayObstacleHits(candidate, nodes);
      if (candidate === baseline) return baselineTotal;
      if (candidate.length !== baseline.length) return countDisplayObstacleHits(candidate, nodes);
      const uniqueIndexes = [...new Set(changedIndexes)]
        .filter(index => Number.isInteger(index) && index >= 0 && index < candidate.length);
      if (uniqueIndexes.length !== changedIndexes.length) return countDisplayObstacleHits(candidate, nodes);
      const changedIndexSet = new Set(uniqueIndexes);
      for (let index = 0; index < candidate.length; index += 1) {
        if (
          !changedIndexSet.has(index)
          && displayObstacleEdgeSignature(candidate[index]) !== baselineSignatures[index]
        ) return countDisplayObstacleHits(candidate, nodes);
      }
      let total = baselineTotal;
      for (const index of uniqueIndexes) {
        const candidateHits = countDisplayEdgeObstacleHits(
          candidate[index],
          hitContext,
        );
        total += candidateHits - baselineHits[index];
      }
      return total;
    },
    evaluateKnownChanges,
  };
  const nextCachedByNodes = cachedByNodes
    ?? new WeakMap<Node[], CachedDisplayObstacleEvaluationContext>();
  nextCachedByNodes.set(nodes, { edgeSignature, nodeSignature, context });
  if (!cachedByNodes) displayObstacleEvaluationContextCache.set(baseline, nextCachedByNodes);
  return context;
};

export const evaluateDisplayObstacleCandidate = (
  context: DisplayObstacleEvaluationContext,
  baseline: Edge[],
  candidate: Edge[],
): number => {
  const changedIndexes = changedDisplayEdgeIndexesByReference(baseline, candidate);
  return changedIndexes
    ? context.evaluateChanged(candidate, changedIndexes)
    : context.evaluate(candidate);
};

export const obstacleRepairScore = (quality: EdgePathQualityScore, obstacleHits: number): number => (
  obstacleHits * 1_000_000_000
  + quality.nonOrthogonalSegments * 100_000_000
  + quality.strictCrossings * 50_000_000
  + quality.reverseOverlap * 60_000
  + quality.unrelatedOverlap * 60_000
  + quality.unexplainedRelatedOverlap * 80_000
  + quality.shortEndpointStubs * 2_000_000
  + quality.hairpins * 2_000_000
  + quality.tinyInteriorDoglegs * 500_000
  + quality.backtrackPenalty * 12_000
  + quality.detourPenalty * 12
  + quality.bends * 8
  + quality.totalLength * 0.02
);

export const obstacleRepairHardQualityIsAcceptable = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean => (
  candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
  && candidate.strictCrossings <= baseline.strictCrossings
  && candidate.shortEndpointStubs <= baseline.shortEndpointStubs + 1
  && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs + 1
  && candidate.hairpins <= baseline.hairpins + 2
);

type DisplayHardGateMetrics = {
  signature: string;
  renderNormalizedEdges: Edge[];
  quality: EdgePathQualityScore;
  obstacleHits: number;
  minimumClearanceViolationEdgeIds: string[];
};

const displayHardGateMetricsCache = new WeakMap<Edge[], WeakMap<Node[], DisplayHardGateMetrics>>();

const displayHardGateSignature = (edges: Edge[], nodes: Node[]): string => {
  const edgeSignature = edges.map(edge => (
    `${displayObstacleEdgeSignature(edge)}\u001f${String(edge.sourceHandle ?? '')}\u001f${String(edge.targetHandle ?? '')}\u001f${edgeRoutingQualityIntentToken(edge)}`
  )).join('\u001e');
  const nodeSignature = nodes.map((node) => {
    const rect = getDisplayNodeRect(node);
    return rect
      ? `${node.id}:${String(node.type ?? '')}:${rect.x},${rect.y},${rect.width},${rect.height}`
      : `${node.id}:${String(node.type ?? '')}:none`;
  }).join('\u001e');
  return `${edgeSignature}\u001d${nodeSignature}`;
};

const getDisplayHardGateMetrics = (edges: Edge[], nodes: Node[]): DisplayHardGateMetrics => {
  const signature = displayHardGateSignature(edges, nodes);
  const byNodes = displayHardGateMetricsCache.get(edges);
  const cached = byNodes?.get(nodes);
  if (cached?.signature === signature) return cached;
  // The renderer removes redundant collinear waypoints before drawing. Score
  // that same normalized geometry so a crossing cannot hide at a split point.
  const renderNormalizedEdges = compactDisplayEdgePaths(edges);
  const nodeClearanceContext = createNodeClearanceGraphEvaluationContext(nodes);
  const minimumClearanceViolationEdgeIds = renderNormalizedEdges.flatMap(edge => (
    nodeClearanceContext.score(
      getDisplayComputedPath(edge),
      edge,
      MINIMUM_BUSINESS_NODE_CLEARANCE,
    ) > 0.5
      ? [edge.id]
      : []
  ));
  const metrics: DisplayHardGateMetrics = {
    signature,
    renderNormalizedEdges,
    quality: calculateEdgePathQualityScore(renderNormalizedEdges),
    obstacleHits: countDisplayObstacleHits(renderNormalizedEdges, nodes),
    minimumClearanceViolationEdgeIds,
  };
  const nextByNodes = byNodes ?? new WeakMap<Node[], DisplayHardGateMetrics>();
  nextByNodes.set(nodes, metrics);
  if (!byNodes) displayHardGateMetricsCache.set(edges, nextByNodes);
  return metrics;
};

export const displayHardSafetyIsClean = (edges: Edge[], nodes: Node[]): boolean => {
  const { quality, obstacleHits } = getDisplayHardGateMetrics(edges, nodes);
  return quality.nonOrthogonalSegments === 0
    && quality.strictCrossings === 0
    && quality.reverseOverlap === 0
    && quality.unrelatedOverlap === 0
    && quality.unexplainedRelatedOverlap === 0
    && quality.shortEndpointStubs === 0
    && obstacleHits === 0;
};

export const getDisplayHardQualityGateReport = (
  edges: Edge[],
  nodes: Node[],
  candidate: BaseDisplayBoundedCandidateReport['candidate'],
  evaluateTerminals: DisplayTerminalGateEvaluator,
): BaseDisplayBoundedCandidateReport => {
  const metrics = getDisplayHardGateMetrics(edges, nodes);
  const { quality, obstacleHits, minimumClearanceViolationEdgeIds } = metrics;
  const { terminalsAttached, terminalsAnchored } = evaluateTerminals(
    metrics.renderNormalizedEdges,
    nodes,
  );
  const report: BaseDisplayBoundedCandidateReport = {
    candidate,
    hardClean: false,
    obstacleHits,
    terminalsAttached,
    terminalsAnchored,
    quality,
    minimumClearanceViolations: minimumClearanceViolationEdgeIds.length,
    minimumClearanceViolationEdgeIds: minimumClearanceViolationEdgeIds.slice(0, 32),
  };
  report.hardClean = displayHardQualityReportGeometryIsClean(report) && terminalsAnchored;
  return report;
};

export const displayHardQualityGatesAreClean = (
  edges: Edge[],
  nodes: Node[],
  evaluateTerminals: DisplayTerminalGateEvaluator,
): boolean => getDisplayHardQualityGateReport(
  edges,
  nodes,
  'polished',
  evaluateTerminals,
).hardClean;

const candidateTerminalsDoNotRegress = (
  baseline: Edge[],
  candidate: Edge[],
  snapshot: ReturnType<typeof createDisplayTerminalValidationSnapshot>,
): boolean => displayTerminalValidationDoesNotRegress(baseline, candidate, snapshot);

export const chooseFinalObstacleAwarePolishCandidate = <T extends Edge[]>(
  nodes: Node[],
  baseline: T,
  ...candidates: T[]
): T => {
  const uniqueCandidates = uniqueDisplayCandidateReferences(baseline, candidates);
  if (uniqueCandidates.length === 0) return baseline;
  const qualityContext = createEdgePathQualityEvaluationContext(baseline);
  const obstacleContext = createDisplayObstacleEvaluationContext(baseline, nodes);
  const baselineQuality = qualityContext.evaluate(baseline);
  const baselineObstacleHits = obstacleContext.evaluate(baseline);
  const terminalSnapshot = createDisplayTerminalValidationSnapshot(nodes);
  let best = baseline;
  let bestObstacleHits = baselineObstacleHits;
  let bestScore = obstacleRepairScore(baselineQuality, baselineObstacleHits);
  for (const candidate of uniqueCandidates) {
    if (!candidateTerminalsDoNotRegress(baseline, candidate, terminalSnapshot)) continue;
    const candidateQuality = evaluateDisplayQualityCandidate(qualityContext, baseline, candidate);
    const candidateObstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, baseline, candidate);
    if (candidateObstacleHits > baselineObstacleHits) continue;
    if (
      candidateObstacleHits < baselineObstacleHits
        ? !obstacleRepairHardQualityIsAcceptable(baselineQuality, candidateQuality)
        : !visualPolishHardQualityDoesNotRegress(baselineQuality, candidateQuality)
    ) continue;
    const candidateScore = obstacleRepairScore(candidateQuality, candidateObstacleHits);
    if (
      candidateObstacleHits < bestObstacleHits
      || (candidateObstacleHits === bestObstacleHits && candidateScore < bestScore - 1)
    ) {
      best = candidate;
      bestObstacleHits = candidateObstacleHits;
      bestScore = candidateScore;
    }
  }
  return best;
};

export const chooseFinalTerminalTransactionCandidate = <T extends Edge[]>(
  nodes: Node[],
  baseline: T,
  ...candidates: T[]
): T => {
  const uniqueCandidates = uniqueDisplayCandidateReferences(baseline, candidates);
  if (uniqueCandidates.length === 0) return baseline;
  const qualityContext = createEdgePathQualityEvaluationContext(baseline);
  const obstacleContext = createDisplayObstacleEvaluationContext(baseline, nodes);
  const baselineQuality = qualityContext.evaluate(baseline);
  const baselineObstacleHits = obstacleContext.evaluate(baseline);
  const terminalSnapshot = createDisplayTerminalValidationSnapshot(nodes);
  let best = baseline;
  let bestObstacleHits = baselineObstacleHits;
  let bestScore = obstacleRepairScore(baselineQuality, baselineObstacleHits);
  for (const candidate of uniqueCandidates) {
    if (!candidateTerminalsDoNotRegress(baseline, candidate, terminalSnapshot)) continue;
    const candidateQuality = evaluateDisplayQualityCandidate(qualityContext, baseline, candidate);
    const candidateObstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, baseline, candidate);
    if (candidateObstacleHits > baselineObstacleHits) continue;
    if (!visualPolishHardQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
    const candidateScore = obstacleRepairScore(candidateQuality, candidateObstacleHits);
    if (
      candidateObstacleHits < bestObstacleHits
      || (candidateObstacleHits === bestObstacleHits && candidateScore < bestScore - 1)
    ) {
      best = candidate;
      bestObstacleHits = candidateObstacleHits;
      bestScore = candidateScore;
    }
  }
  return best;
};

export const countDisplayStrictCrossings = (edges: Edge[]): number => {
  const renderNormalizedEdges = compactDisplayEdgePaths(edges);
  return renderNormalizedEdges.every(edge => getDisplayComputedPath(edge).length >= 2)
    ? countStrictEdgeCrossings(renderNormalizedEdges)
    : findDisplayStrictCrossingHits(renderNormalizedEdges).length;
};

export const chooseDisplayStrictPolishCandidate = <T extends Edge[]>(
  nodes: Node[],
  baseline: T,
  ...candidates: T[]
): T => {
  const uniqueCandidates = uniqueDisplayCandidateReferences(baseline, candidates);
  if (uniqueCandidates.length === 0) return baseline;
  const qualityContext = createEdgePathQualityEvaluationContext(baseline);
  const obstacleContext = createDisplayObstacleEvaluationContext(baseline, nodes);
  const baselineQuality = qualityContext.evaluate(baseline);
  const baselineObstacleHits = obstacleContext.evaluate(baseline);
  const terminalSnapshot = createDisplayTerminalValidationSnapshot(nodes);
  let best = baseline;
  const baselineDisplayStrictCrossings = countDisplayStrictCrossings(baseline);
  let bestDisplayStrictCrossings = baselineDisplayStrictCrossings;
  let bestObstacleHits = baselineObstacleHits;
  let bestScore = obstacleRepairScore(baselineQuality, baselineObstacleHits);
  for (const candidate of uniqueCandidates) {
    if (!candidateTerminalsDoNotRegress(baseline, candidate, terminalSnapshot)) continue;
    const candidateQuality = evaluateDisplayQualityCandidate(qualityContext, baseline, candidate);
    const candidateObstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, baseline, candidate);
    if (candidateObstacleHits > baselineObstacleHits) continue;
    const candidateDisplayStrictCrossings = countDisplayStrictCrossings(candidate);
    const reducesDisplayStrict = candidateDisplayStrictCrossings < baselineDisplayStrictCrossings;
    if (
      reducesDisplayStrict
        ? !displayStrictRepairHardQualityIsAcceptable(baselineQuality, candidateQuality)
        : !visualPolishHardQualityWithoutStrictDoesNotRegress(baselineQuality, candidateQuality)
    ) continue;
    const candidateScore = obstacleRepairScore(candidateQuality, candidateObstacleHits);
    if (
      candidateDisplayStrictCrossings < bestDisplayStrictCrossings
      || candidateObstacleHits < bestObstacleHits
      || (
        candidateDisplayStrictCrossings === bestDisplayStrictCrossings
        && candidateObstacleHits === bestObstacleHits
        && candidateScore < bestScore - 1
      )
    ) {
      best = candidate;
      bestDisplayStrictCrossings = candidateDisplayStrictCrossings;
      bestObstacleHits = candidateObstacleHits;
      bestScore = candidateScore;
    }
  }

  return best;
};

export const hasHardDisplayOverlapRisk = (quality: EdgePathQualityScore): boolean => (
  quality.reverseOverlap > 0
  || quality.unrelatedOverlap > 0
  || quality.unexplainedRelatedOverlap > 0
);
