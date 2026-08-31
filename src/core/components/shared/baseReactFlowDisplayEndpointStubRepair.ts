import type { Edge, Node } from '@xyflow/react';

import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { createEdgePathQualityEvaluationContext } from '../../strategies/shared/edgeStrictCrossingGuard';
import { createNodeClearanceGraphEvaluationContext } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  countDisplayShortEndpointStubs,
  displayAxisOf,
  getDisplayComputedPath,
  segmentDisplayLength,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import {
  createDisplayObstacleEvaluationContext,
  evaluateDisplayObstacleCandidate,
  evaluateDisplayQualityCandidate,
} from './baseReactFlowDisplayEvaluation';
import {
  buildSafeEndpointSideStepCandidates,
  MIN_DISPLAY_ENDPOINT_STUB,
} from './baseReactFlowDisplayEndpointStubCandidates';
import {
  buildStrictCrossingCompanionShiftVariants,
} from './baseReactFlowDisplayTerminalPortRepair';
import { finalStrictDisplaySweep } from './baseReactFlowDisplayStrictSweepRepair';
import {
  repairFinalResidualStrictCrossings,
  type StrictCrossingRepairDiagnostics,
} from './baseReactFlowDisplayStrictResidualRepair';
import {
  createAtomicRouteTransactionEvaluation,
  type AtomicEndpointOrderEvaluation,
} from './baseReactFlowDisplayAtomicTransactionEvaluation';
import { createDisplayDeclaredAxisMismatchCounter } from './baseReactFlowDisplayDeclaredAxisTransaction';
import { eligibleCommercialClearanceDoesNotRegress } from './baseReactFlowDisplayBusinessNodeClearance';
import { createDisplayTerminalValidationSnapshot } from './baseReactFlowTerminalValidation';
import type { DisplayTerminalValidationSnapshot } from './baseReactFlowTerminalValidation';

export const MIN_RENDER_SAFE_ENDPOINT_STUB = 56;
const MAX_FINAL_ENDPOINT_STUB_REPAIR_EVALUATIONS = 8;
const MAX_GLOBAL_STRICT_STUB_FALLBACK_EDGES = 36;
const COMMERCIAL_CLEARANCE_RISK_EPSILON = 1e-6;

export const commercialClearanceRiskIsGloballyMinimal = (risk: number): boolean => (
  Number.isFinite(risk)
  && risk >= 0
  && risk <= COMMERCIAL_CLEARANCE_RISK_EPSILON
);

export const renderSafeEndpointStubRepairUsesGlobalStrictFallback = (
  edgeCount: number,
): boolean => Number.isSafeInteger(edgeCount)
  && edgeCount >= 0
  && edgeCount <= MAX_GLOBAL_STRICT_STUB_FALLBACK_EDGES;

export const countRenderUnsafeEndpointStubs = (edges: Edge[]): number => edges.reduce((total, edge) => {
  const path = getDisplayComputedPath(edge);
  if (path.length < 3) return total;
  return total
    + (segmentDisplayLength(path[0], path[1]) < MIN_RENDER_SAFE_ENDPOINT_STUB ? 1 : 0)
    + (segmentDisplayLength(path[path.length - 2], path[path.length - 1]) < MIN_RENDER_SAFE_ENDPOINT_STUB ? 1 : 0);
}, 0);

export const repairFinalShortEndpointStubs = <T extends Edge[]>(edges: T, nodes: Node[]): T => {
  const qualityContext = createEdgePathQualityEvaluationContext(edges);
  const obstacleContext = createDisplayObstacleEvaluationContext(edges, nodes);
  const baselineQuality = qualityContext.evaluate(edges);
  const baselineEndpointStubIssues = countDisplayShortEndpointStubs(edges, MIN_DISPLAY_ENDPOINT_STUB);
  if (baselineEndpointStubIssues === 0) return edges;
  let bestEdges = edges;
  let bestQuality = baselineQuality;
  let bestEndpointStubIssues = baselineEndpointStubIssues;
  let bestObstacleHits = obstacleContext.evaluate(edges);
  let qualityEvaluations = 0;

  const edgeRepairOrder = edges
    .map((edge, edgeIndex) => {
      const path = getDisplayComputedPath(edge);
      if (path.length < 3) return null;
      const first = segmentDisplayLength(path[0], path[1]);
      const last = segmentDisplayLength(path[path.length - 2], path[path.length - 1]);
      const shortest = Math.min(first, last);
      return shortest < MIN_DISPLAY_ENDPOINT_STUB ? { edge, edgeIndex, shortest } : null;
    })
    .filter((entry): entry is { edge: Edge; edgeIndex: number; shortest: number } => entry !== null)
    .sort((first, second) => first.shortest - second.shortest);

  edgeRepairOrder.forEach(({ edge, edgeIndex, shortest }) => {
    if (qualityEvaluations >= MAX_FINAL_ENDPOINT_STUB_REPAIR_EVALUATIONS) return;
    const path = getDisplayComputedPath(edge);
    const candidatePaths = buildSafeEndpointSideStepCandidates(path, edgeIndex, bestEdges, nodes);
    for (const candidatePath of candidatePaths) {
      if (qualityEvaluations >= MAX_FINAL_ENDPOINT_STUB_REPAIR_EVALUATIONS) break;
      const candidateEdges = bestEdges.map((item, index) => (
        index === edgeIndex ? withDisplayComputedPath(item, candidatePath) : item
      )) as T;
      const initialQuality = evaluateDisplayQualityCandidate(qualityContext, edges, candidateEdges);
      const initialObstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, edges, candidateEdges);
      const initialEndpointStubIssues = countDisplayShortEndpointStubs(candidateEdges, MIN_DISPLAY_ENDPOINT_STUB);
      const variants: Array<() => T> = [() => candidateEdges];
      if (
        initialObstacleHits <= bestObstacleHits
        && initialEndpointStubIssues < bestEndpointStubIssues
        && initialQuality.strictCrossings > bestQuality.strictCrossings
        && initialQuality.strictCrossings <= bestQuality.strictCrossings + 2
      ) {
        variants.push(
          ...buildStrictCrossingCompanionShiftVariants(candidateEdges, edgeIndex)
            .map(variant => () => variant),
          () => finalStrictDisplaySweep(candidateEdges, nodes),
        );
      }
      const evaluatedVariantReferences = new Set<T>();
      for (const materializeVariant of variants) {
        if (qualityEvaluations >= MAX_FINAL_ENDPOINT_STUB_REPAIR_EVALUATIONS) break;
        // Materialize only candidates the unchanged evaluation budget can visit.
        // In particular, do not run a full strict sweep after companion variants
        // have already consumed the remaining slots.
        const variantEdges = materializeVariant();
        qualityEvaluations += 1;
        if (evaluatedVariantReferences.has(variantEdges)) continue;
        evaluatedVariantReferences.add(variantEdges);
        const candidateQuality = variantEdges === candidateEdges
          ? initialQuality
          : evaluateDisplayQualityCandidate(qualityContext, edges, variantEdges);
        const candidateObstacleHits = variantEdges === candidateEdges
          ? initialObstacleHits
          : evaluateDisplayObstacleCandidate(obstacleContext, edges, variantEdges);
        const candidateEndpointStubIssues = variantEdges === candidateEdges
          ? initialEndpointStubIssues
          : countDisplayShortEndpointStubs(variantEdges, MIN_DISPLAY_ENDPOINT_STUB);
        const allowSevereStubExpansionHairpin = shortest <= 16
          && candidateEndpointStubIssues < bestEndpointStubIssues
          && candidateQuality.strictCrossings <= bestQuality.strictCrossings
          && candidateQuality.reverseOverlap <= bestQuality.reverseOverlap
          && candidateQuality.unrelatedOverlap <= bestQuality.unrelatedOverlap
          && candidateQuality.unexplainedRelatedOverlap <= bestQuality.unexplainedRelatedOverlap;
        if (candidateObstacleHits > bestObstacleHits) continue;
        if (
          candidateQuality.nonOrthogonalSegments > bestQuality.nonOrthogonalSegments
          || candidateQuality.strictCrossings > bestQuality.strictCrossings
          || candidateQuality.reverseOverlap > bestQuality.reverseOverlap
          || candidateQuality.unrelatedOverlap > bestQuality.unrelatedOverlap
          || candidateQuality.relatedOverlap > bestQuality.relatedOverlap
          || candidateQuality.unexplainedRelatedOverlap > bestQuality.unexplainedRelatedOverlap
          || candidateQuality.tinyInteriorDoglegs > bestQuality.tinyInteriorDoglegs
          || candidateQuality.hairpins > bestQuality.hairpins + (allowSevereStubExpansionHairpin ? 1 : 0)
        ) continue;
        if (candidateEndpointStubIssues >= bestEndpointStubIssues) continue;
        bestEdges = variantEdges;
        bestQuality = candidateQuality;
        bestEndpointStubIssues = candidateEndpointStubIssues;
        bestObstacleHits = candidateObstacleHits;
      }
    }
  });

  return bestEdges;
};

const buildRenderSafeEndpointStubPaths = (path: DisplayPoint[]): DisplayPoint[][] => {
  if (path.length < 3) return [];
  const sourceLength = segmentDisplayLength(path[0], path[1]);
  const targetLength = segmentDisplayLength(path[path.length - 2], path[path.length - 1]);
  const sourceNeedsRepair = sourceLength < MIN_RENDER_SAFE_ENDPOINT_STUB;
  const targetNeedsRepair = targetLength < MIN_RENDER_SAFE_ENDPOINT_STUB;
  if (!sourceNeedsRepair && !targetNeedsRepair) return [];

  const extendSource = (candidate: DisplayPoint[]): boolean => {
    const axis = displayAxisOf(candidate[0], candidate[1]);
    if (!axis || candidate.length < 3) return false;
    if (axis === 'h') {
      const direction = Math.sign(candidate[1].x - candidate[0].x);
      if (direction === 0) return false;
      const coordinate = candidate[0].x + direction * MIN_RENDER_SAFE_ENDPOINT_STUB;
      candidate[1].x = coordinate;
      candidate[2].x = coordinate;
    } else {
      const direction = Math.sign(candidate[1].y - candidate[0].y);
      if (direction === 0) return false;
      const coordinate = candidate[0].y + direction * MIN_RENDER_SAFE_ENDPOINT_STUB;
      candidate[1].y = coordinate;
      candidate[2].y = coordinate;
    }
    return true;
  };
  const extendTarget = (candidate: DisplayPoint[]): boolean => {
    const lastIndex = candidate.length - 1;
    const axis = displayAxisOf(candidate[lastIndex - 1], candidate[lastIndex]);
    if (!axis || candidate.length < 3) return false;
    if (axis === 'h') {
      const direction = Math.sign(candidate[lastIndex - 1].x - candidate[lastIndex].x);
      if (direction === 0) return false;
      const coordinate = candidate[lastIndex].x + direction * MIN_RENDER_SAFE_ENDPOINT_STUB;
      candidate[lastIndex - 1].x = coordinate;
      candidate[lastIndex - 2].x = coordinate;
    } else {
      const direction = Math.sign(candidate[lastIndex - 1].y - candidate[lastIndex].y);
      if (direction === 0) return false;
      const coordinate = candidate[lastIndex].y + direction * MIN_RENDER_SAFE_ENDPOINT_STUB;
      candidate[lastIndex - 1].y = coordinate;
      candidate[lastIndex - 2].y = coordinate;
    }
    return true;
  };

  const candidates: DisplayPoint[][] = [];
  if (sourceNeedsRepair) {
    const candidate = path.map(point => ({ ...point }));
    if (extendSource(candidate)) candidates.push(compactOrthogonalPath(candidate));
  }
  if (targetNeedsRepair) {
    const candidate = path.map(point => ({ ...point }));
    if (extendTarget(candidate)) candidates.push(compactOrthogonalPath(candidate));
  }
  if (sourceNeedsRepair && targetNeedsRepair) {
    const candidate = path.map(point => ({ ...point }));
    if (extendSource(candidate) && extendTarget(candidate)) {
      candidates.unshift(compactOrthogonalPath(candidate));
    }
  }
  return candidates;
};

export const repairRenderSafeEndpointStubs = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxEvaluations = 64,
  endpointOrder?: AtomicEndpointOrderEvaluation,
  reusableTerminalValidation?: DisplayTerminalValidationSnapshot,
  strictDiagnostics?: StrictCrossingRepairDiagnostics,
  allowStrictFallback = true,
): T => {
  if (countRenderUnsafeEndpointStubs(edges) === 0) return edges;
  // Companion shifts remain endpoint-local. The two broader sweep fallbacks
  // rescan the whole graph and duplicate the final safety closure on larger
  // routes, so leave those graphs to the request-level hard-closure stage.
  const allowGlobalStrictFallback = renderSafeEndpointStubRepairUsesGlobalStrictFallback(
    edges.length,
  );
  let current = edges;
  let evaluations = 0;
  const skippedEdgeIds = new Set<string>();
  const qualityContext = createEdgePathQualityEvaluationContext(edges);
  let qualityState = qualityContext.createState(edges);
  // Nodes are immutable for the whole repair transaction. Reuse the spatial
  // index and its per-edge segment memo across accepted candidates instead of
  // rebuilding both for every candidate gate.
  const clearance = createNodeClearanceGraphEvaluationContext(nodes);
  const obstacleContext = createDisplayObstacleEvaluationContext(edges, nodes);
  const terminalValidation = reusableTerminalValidation
    ?? createDisplayTerminalValidationSnapshot(nodes);
  const obstacleChangedIndexes = new Set<number>();
  for (let pass = 0; pass < edges.length && evaluations < maxEvaluations; pass += 1) {
    const baselineIssues = countRenderUnsafeEndpointStubs(current);
    if (baselineIssues === 0) break;
    const edgeIndex = current.findIndex((edge) => {
      if (skippedEdgeIds.has(edge.id)) return false;
      const path = getDisplayComputedPath(edge);
      return path.length >= 3 && (
        segmentDisplayLength(path[0], path[1]) < MIN_RENDER_SAFE_ENDPOINT_STUB
        || segmentDisplayLength(path[path.length - 2], path[path.length - 1]) < MIN_RENDER_SAFE_ENDPOINT_STUB
      );
    });
    if (edgeIndex < 0) break;
    const baselineQuality = qualityState.score;
    const baselineObstacleChangedIndexes = [...obstacleChangedIndexes];
    const baselineObstacleHits = obstacleContext.evaluateKnownChanges(
      current,
      baselineObstacleChangedIndexes,
    );
    const atomic = createAtomicRouteTransactionEvaluation(current, nodes, {
      qualityContext,
      obstacleContext,
      baselineQuality,
      baselineQualityState: qualityState,
      baselineObstacleChangedIndexes,
      baselineObstacleHits,
      endpointOrder,
      terminalValidation,
    });
    const countAxisMismatches = createDisplayDeclaredAxisMismatchCounter(nodes);
    const baselineAxisMismatches = current.map(countAxisMismatches);
    let accepted: T | null = null;
    let acceptedQualityState: ReturnType<typeof qualityContext.evaluateStateChanged> | null = null;
    let acceptedCommercialRiskDelta = Number.POSITIVE_INFINITY;
    for (const candidatePath of buildRenderSafeEndpointStubPaths(getDisplayComputedPath(current[edgeIndex]))) {
      if (evaluations >= maxEvaluations) break;
      const candidate = current.map((edge, index) => (
        index === edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
      )) as T;
      const initialIssues = countRenderUnsafeEndpointStubs(candidate);
      const initialQualityState = qualityContext.evaluateStateChanged(
        qualityState,
        candidate,
        [edgeIndex],
      );
      const initialQuality = initialQualityState.score;
      const initialObstacleHits = obstacleContext.evaluateKnownChanges(
        candidate,
        [...new Set([...baselineObstacleChangedIndexes, edgeIndex])],
      );
      const needsStrictFallback = allowStrictFallback && (
        initialIssues < baselineIssues
        && initialObstacleHits <= baselineObstacleHits
        && initialQuality.strictCrossings > baselineQuality.strictCrossings
        && initialQuality.strictCrossings <= baselineQuality.strictCrossings + 2
      );
      const initialVariants: T[] = [candidate];
      if (needsStrictFallback) {
        if (strictDiagnostics) strictDiagnostics.strictFallbackInvocationCount += 1;
        qualityContext.rememberState?.(candidate, initialQualityState);
        initialVariants.push(...buildStrictCrossingCompanionShiftVariants(candidate, edgeIndex));
      }
      const evaluatedVariantReferences = new Set<T>();
      const considerVariant = (variant: T): void => {
        if (evaluations >= maxEvaluations) return;
        evaluations += 1;
        if (evaluatedVariantReferences.has(variant)) {
          if (strictDiagnostics) strictDiagnostics.duplicateVariantReferenceCount += 1;
          return;
        }
        evaluatedVariantReferences.add(variant);
        const candidateIssues = countRenderUnsafeEndpointStubs(variant);
        if (candidateIssues >= baselineIssues) return;
        const changedIndexes = variant.flatMap((edge, index) => (
          edge === current[index] ? [] : [index]
        ));
        const changedEdgeIds = new Set(changedIndexes.map(index => current[index].id));
        let candidateQualityState = variant === candidate ? initialQualityState : null;
        const cachedCandidateQuality = candidateQualityState
          ? undefined
          : qualityContext.readCached?.(variant);
        if (cachedCandidateQuality && strictDiagnostics) {
          strictDiagnostics.qualityScoreCacheHitCount += 1;
        }
        const candidateQuality = candidateQualityState?.score
          ?? cachedCandidateQuality
          ?? (() => {
            candidateQualityState = qualityContext.evaluateStateChanged(
              qualityState,
              variant,
              changedIndexes,
            );
            return candidateQualityState.score;
          })();
        if (
          candidateQuality.nonOrthogonalSegments > baselineQuality.nonOrthogonalSegments
          || candidateQuality.strictCrossings > baselineQuality.strictCrossings
          || candidateQuality.reverseOverlap > baselineQuality.reverseOverlap
          || candidateQuality.unrelatedOverlap > baselineQuality.unrelatedOverlap
          || candidateQuality.unexplainedRelatedOverlap > baselineQuality.unexplainedRelatedOverlap
          || candidateQuality.tinyInteriorDoglegs > baselineQuality.tinyInteriorDoglegs
          || candidateQuality.hairpins > baselineQuality.hairpins
        ) return;
        const candidateObstacleChangedIndexes = [
          ...new Set([...baselineObstacleChangedIndexes, ...changedIndexes]),
        ];
        if (
          obstacleContext.evaluateKnownChanges(
            variant,
            candidateObstacleChangedIndexes,
          ) > baselineObstacleHits
        ) return;
        if (changedIndexes.some(index => (
          countAxisMismatches(variant[index]) > baselineAxisMismatches[index]
        ))) return;
        if (!eligibleCommercialClearanceDoesNotRegress(
          current,
          variant,
          nodes,
          changedEdgeIds,
          clearance,
        )) return;
        candidateQualityState ??= qualityContext.evaluateStateChanged(
          qualityState,
          variant,
          changedIndexes,
        );
        const transaction = atomic.evaluate(
          variant,
          changedIndexes,
          candidateQualityState,
        );
        if (
          !transaction.hardQualityDoesNotRegress
          || !transaction.obstacleHitsDoNotRegress
          || !transaction.terminalsAnchored
          || !transaction.trunksPreserved
        ) return;
        // Every variant is compared with the same current baseline, so total
        // commercial risk ordering is exactly equivalent to ordering the risk
        // delta over only the immutable changed indexes.
        const candidateCommercialRiskDelta = changedIndexes.reduce((delta, index) => (
          delta
          + clearance.score(
            getDisplayComputedPath(variant[index]),
            variant[index],
            COMMERCIAL_BUSINESS_NODE_CLEARANCE,
          )
          - clearance.score(
            getDisplayComputedPath(current[index]),
            current[index],
            COMMERCIAL_BUSINESS_NODE_CLEARANCE,
          )
        ), 0);
        if (
          candidateCommercialRiskDelta
          >= acceptedCommercialRiskDelta - COMMERCIAL_CLEARANCE_RISK_EPSILON
        ) return;
        accepted = variant;
        acceptedQualityState = candidateQualityState;
        acceptedCommercialRiskDelta = candidateCommercialRiskDelta;
      };
      const acceptedCommercialRiskIsGloballyMinimal = (): boolean => {
        const acceptedEdges = accepted;
        if (!acceptedEdges) return false;
        let totalRisk = 0;
        for (const edge of acceptedEdges) {
          const edgeRisk = clearance.score(
            getDisplayComputedPath(edge),
            edge,
            COMMERCIAL_BUSINESS_NODE_CLEARANCE,
          );
          if (!Number.isFinite(edgeRisk) || edgeRisk < 0) return false;
          totalRisk += edgeRisk;
          if (!Number.isFinite(totalRisk)) return false;
        }
        return commercialClearanceRiskIsGloballyMinimal(totalRisk);
      };

      for (const variant of initialVariants) {
        if (evaluations >= maxEvaluations) break;
        considerVariant(variant);
      }
      if (
        needsStrictFallback
        && allowGlobalStrictFallback
        && evaluations < maxEvaluations
        && !acceptedCommercialRiskIsGloballyMinimal()
      ) {
        considerVariant(finalStrictDisplaySweep(candidate, nodes, strictDiagnostics));
      }
      if (
        needsStrictFallback
        && allowGlobalStrictFallback
        && evaluations < maxEvaluations
        && !acceptedCommercialRiskIsGloballyMinimal()
      ) {
        considerVariant(repairFinalResidualStrictCrossings(candidate, nodes, strictDiagnostics));
      }
      if (accepted) break;
    }
    if (!accepted) {
      skippedEdgeIds.add(current[edgeIndex].id);
      continue;
    }
    current = accepted;
    current.forEach((edge, index) => {
      if (edge !== edges[index]) obstacleChangedIndexes.add(index);
    });
    qualityState = acceptedQualityState
      ?? qualityContext.createState(accepted);
  }
  if (current !== edges) qualityContext.rememberState?.(current, qualityState);
  return current;
};
