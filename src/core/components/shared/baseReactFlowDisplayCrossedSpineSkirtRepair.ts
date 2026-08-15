import type { Edge, Node } from '@xyflow/react';

import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { createEdgePathQualityEvaluationContext } from '../../strategies/shared/edgeStrictCrossingGuard';
import { repairDisplayMicroArtifacts } from '../../strategies/shared/edgeDisplayMicroCleanup';
import {
  buildDisplayRoutingObstacles,
  candidateStrictCrossingsForEdge,
  collectPathHitObstacleRects,
  extractDisplaySegments,
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import {
  createDisplayObstacleEvaluationContext,
  obstacleRepairScore,
  visualPolishHardQualityDoesNotRegress,
} from './baseReactFlowDisplayEvaluation';
import { createDisplayTerminalValidationSnapshot } from './baseReactFlowTerminalAxisRepair';
import { collectExactThresholdResidualPairs } from './baseReactFlowDisplayParallelOverlapGeometry';
import { buildAtomicOverlapCompanionCandidates } from './baseReactFlowDisplayAtomicMultiEdgeCandidates';
import { createAtomicRouteTransactionEvaluation } from './baseReactFlowDisplayAtomicTransactionEvaluation';
import { buildSharedTargetCrossingBridgeCandidates } from './baseReactFlowDisplaySharedTargetCrossingBridge';
import { buildSharedTargetTrunkNormalizationCandidates } from './baseReactFlowDisplaySharedTargetTrunkNormalization';
import { buildSharedSourcePeerBranchCandidates } from './baseReactFlowDisplaySharedSourceBranchCandidates';
import {
  buildBoundedIndependentSkirtPairs,
  buildChangedTerminalCandidates,
  buildCrossedSpineInternalLaneCandidates,
  buildCrossedSpineLocalWallCandidates,
  buildDualTerminalOuterLaneCandidates,
} from './baseReactFlowDisplayCrossedSpineSkirtCandidates';
import {
  crossedSpinePathLength,
} from './baseReactFlowDisplayCrossedSpineSkirtGeometry';

const MAX_OUTER_SKIRT_EVALUATIONS = 64;
const MAX_OUTER_SKIRT_CANDIDATES_PER_SPINE = 16;

type CrossedSpineHardMetrics = Readonly<{
  nonOrthogonalSegments: number;
  reverseOverlap: number;
  unrelatedOverlap: number;
  unexplainedRelatedOverlap: number;
  shortEndpointStubs: number;
  tinyInteriorDoglegs: number;
  hairpins: number;
}>;

export type CrossedSpineSkirtRepairReport = Readonly<{
  crossedSpines: number;
  evaluatedCandidates: number;
  rejectedDetached: number;
  rejectedStrict: number;
  rejectedHardQuality: number;
  rejectedObstacles: number;
  rejectedTrunks: number;
  acceptedStrictCrossings: number;
  pairedGenerated: number;
  pairedStrictReduced: number;
  pairedEligible: number;
  pairedRejectedHardQuality: number;
  pairedRejectedObstacles: number;
  pairedRejectedTrunks: number;
  tripleGenerated: number;
  tripleEligible: number;
  tripleAccepted: number;
  closestRejectedHardQuality: CrossedSpineHardMetrics | null;
}>;

type CrossedSpine = Readonly<{
  edgeIndex: number;
  segment: DisplaySegment;
  crossingCount: number;
}>;

const collectCrossedSpines = (edges: Edge[]): CrossedSpine[] => {
  const counts = new Map<string, { segment: DisplaySegment; otherEdges: Set<number> }>();
  for (const hit of findDisplayStrictCrossingHits(edges)) {
    for (const [segment, other] of [[hit.a, hit.b], [hit.b, hit.a]] as const) {
      const key = `${segment.edgeIndex}:${segment.segmentIndex}`;
      const current = counts.get(key) ?? { segment, otherEdges: new Set<number>() };
      current.otherEdges.add(other.edgeIndex);
      counts.set(key, current);
    }
  }
  return [...counts.values()]
    // A single residual crossing can be just as visible as a multi-branch
    // spine (notably where a reverse branch crosses a long return lane). The
    // bounded candidate/evaluation caps below keep this safe to consider.
    // Segment 1 is already beyond the terminal stub. Same-source fan-out can
    // therefore form a real branch-order crossing here (for example a short
    // target branch cutting a longer vertical sibling). Segment 0 remains
    // excluded because an orthogonal contact there is the shared endpoint
    // junction, not a detachable crossed spine.
    .filter(({ segment, otherEdges }) => segment.segmentIndex >= 1 && otherEdges.size >= 1)
    .map(({ segment, otherEdges }) => ({
      edgeIndex: segment.edgeIndex,
      segment,
      crossingCount: otherEdges.size,
    }))
    .sort((first, second) => second.crossingCount - first.crossingCount)
    .slice(0, 4);
};

const preservesLegalSharedTrunks = (
  baseline: ReturnType<typeof auditFinalSameSideEndpointOrder>['legalSharedTrunks'],
  candidate: ReturnType<typeof auditFinalSameSideEndpointOrder>['legalSharedTrunks'],
): boolean => baseline.every(trunk => candidate.some(next => (
  next.nodeId === trunk.nodeId
  && next.role === trunk.role
  && next.side === trunk.side
  && trunk.edgeIds.every(edgeId => next.edgeIds.includes(edgeId))
  && next.commonStemLength + 1e-6 >= trunk.commonStemLength
)));

/**
 * Escapes a spine crossed by multiple opposite-flow terminal approaches.
 * The transaction may switch one unconstrained terminal to an outer side, but
 * commits only when the full graph stays anchored, obstacle-safe, and retains
 * every pre-existing legal source/target trunk.
 */
export const repairCrossedSpineWithOuterSkirt = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  options: Readonly<{
    onReport?: (report: CrossedSpineSkirtRepairReport) => void;
  }> = {},
): T => {
  const spines = collectCrossedSpines(edges);
  const report = {
    crossedSpines: spines.length,
    evaluatedCandidates: 0,
    rejectedDetached: 0,
    rejectedStrict: 0,
    rejectedHardQuality: 0,
    rejectedObstacles: 0,
    rejectedTrunks: 0,
    acceptedStrictCrossings: 0,
    pairedGenerated: 0,
    pairedStrictReduced: 0,
    pairedEligible: 0,
    pairedRejectedHardQuality: 0,
    pairedRejectedObstacles: 0,
    pairedRejectedTrunks: 0,
    tripleGenerated: 0,
    tripleEligible: 0,
    tripleAccepted: 0,
    closestRejectedHardQuality: null as CrossedSpineHardMetrics | null,
  };
  let closestHardRegressionPenalty = Number.POSITIVE_INFINITY;
  if (spines.length === 0) {
    options.onReport?.(report);
    return edges;
  }
  const qualityContext = createEdgePathQualityEvaluationContext(edges);
  const obstacleContext = createDisplayObstacleEvaluationContext(edges, nodes);
  const atomicEvaluation = createAtomicRouteTransactionEvaluation(edges, nodes);
  const baselineQuality = qualityContext.evaluate(edges);
  report.acceptedStrictCrossings = baselineQuality.strictCrossings;
  if (baselineQuality.strictCrossings === 0) {
    options.onReport?.(report);
    return edges;
  }
  const baselineObstacleHits = obstacleContext.evaluate(edges);
  const baselineTrunks = auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks;
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  const allSegments = extractDisplaySegments(edges);
  const candidates = spines.flatMap(spine => {
    const edge = edges[spine.edgeIndex];
    if (!edge) return [];
    const otherSegments = allSegments.filter(segment => segment.edgeIndex !== spine.edgeIndex);
    const baselineEdgeStrict = candidateStrictCrossingsForEdge(
      spine.edgeIndex,
      getDisplayComputedPath(edge),
      otherSegments,
    );
    const obstacles = [...buildDisplayRoutingObstacles(nodes)]
      .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
      .map(([, rect]) => rect);
    return [
      ...buildCrossedSpineLocalWallCandidates(
        edge,
        spine.edgeIndex,
        spine.segment,
        nodes,
        otherSegments,
      ),
      ...buildCrossedSpineInternalLaneCandidates(
        edge,
        spine.edgeIndex,
        spine.segment,
        nodes,
        otherSegments,
      ),
      ...buildSharedSourcePeerBranchCandidates(
        edges,
        nodes,
        spine.edgeIndex,
      ).map(candidateEdge => {
        const candidatePath = getDisplayComputedPath(candidateEdge);
        return {
          edgeIndex: spine.edgeIndex,
          edge: candidateEdge,
          obstacleHits: collectPathHitObstacleRects(candidatePath, obstacles).length,
          pathLength: crossedSpinePathLength(candidatePath),
          strictCrossings: candidateStrictCrossingsForEdge(
            spine.edgeIndex,
            candidatePath,
            otherSegments,
          ),
          topologyPriority: -2,
        };
      }),
      ...buildSharedTargetCrossingBridgeCandidates(
        edges,
        nodes,
        spine.edgeIndex,
        spine.segment,
      ).map(candidateEdge => {
        const candidatePath = getDisplayComputedPath(candidateEdge);
        return {
          edgeIndex: spine.edgeIndex,
          edge: candidateEdge,
          obstacleHits: collectPathHitObstacleRects(candidatePath, obstacles).length,
          pathLength: crossedSpinePathLength(candidatePath),
          strictCrossings: candidateStrictCrossingsForEdge(
            spine.edgeIndex,
            candidatePath,
            otherSegments,
          ),
          topologyPriority: -1,
        };
      }),
      ...(['target', 'source'] as const).flatMap(role => buildChangedTerminalCandidates(
        edge,
        spine.edgeIndex,
        spine.segment,
        nodes,
        otherSegments,
        role,
      )),
      ...buildDualTerminalOuterLaneCandidates(
        edge,
        spine.edgeIndex,
        spine.segment,
        nodes,
        otherSegments,
      ),
    ]
      .filter(candidate => candidate.strictCrossings < baselineEdgeStrict)
      .sort((first, second) => (
        first.strictCrossings - second.strictCrossings
        || first.obstacleHits - second.obstacleHits
        || first.topologyPriority - second.topologyPriority
        || first.pathLength - second.pathLength
      ))
      .slice(0, MAX_OUTER_SKIRT_CANDIDATES_PER_SPINE);
  }).sort((first, second) => (
    first.strictCrossings - second.strictCrossings
    || first.obstacleHits - second.obstacleHits
    || first.topologyPriority - second.topologyPriority
    || first.pathLength - second.pathLength
  )).slice(0, MAX_OUTER_SKIRT_EVALUATIONS);

  let best = edges;
  let bestQuality = baselineQuality;
  let bestScore = obstacleRepairScore(baselineQuality, baselineObstacleHits);
  let transientTinyCandidate: T | null = null;
  let transientTinyQuality = baselineQuality;
  const transientOverlapCandidates: Array<{
    edges: T;
    primaryEdgeIndex: number;
    quality: typeof baselineQuality;
  }> = [];
  for (const candidate of candidates) {
    report.evaluatedCandidates += 1;
    if (!terminalValidation.validateEdge(candidate.edge).anchored) {
      report.rejectedDetached += 1;
      continue;
    }
    const candidateEdges = edges.map((edge, index) => (
      index === candidate.edgeIndex ? candidate.edge : edge
    )) as T;
    const changedIndexes = [candidate.edgeIndex];
    const candidateQuality = qualityContext.evaluateChanged(candidateEdges, changedIndexes);
    if (candidateQuality.strictCrossings >= baselineQuality.strictCrossings) {
      report.rejectedStrict += 1;
      continue;
    }
    if (!visualPolishHardQualityDoesNotRegress(baselineQuality, candidateQuality)) {
      const onlyAddsParallelOverlap =
        candidateQuality.nonOrthogonalSegments <= baselineQuality.nonOrthogonalSegments
        && candidateQuality.shortEndpointStubs <= baselineQuality.shortEndpointStubs
        && candidateQuality.tinyInteriorDoglegs <= baselineQuality.tinyInteriorDoglegs
        && candidateQuality.hairpins <= baselineQuality.hairpins
        && (
          candidateQuality.reverseOverlap > baselineQuality.reverseOverlap
          || candidateQuality.unrelatedOverlap > baselineQuality.unrelatedOverlap
          || candidateQuality.unexplainedRelatedOverlap > baselineQuality.unexplainedRelatedOverlap
        );
      if (onlyAddsParallelOverlap) {
        const transientObstacleHits = obstacleContext.evaluateKnownChanges(
          candidateEdges,
          changedIndexes,
        );
        if (
          transientObstacleHits <= baselineObstacleHits
          && preservesLegalSharedTrunks(
            baselineTrunks,
            auditFinalSameSideEndpointOrder(candidateEdges, nodes).legalSharedTrunks,
          )
        ) {
          transientOverlapCandidates.push({
            edges: candidateEdges,
            primaryEdgeIndex: candidate.edgeIndex,
            quality: candidateQuality,
          });
        }
      }
      const onlyAddsOneTinyDogleg =
        candidateQuality.nonOrthogonalSegments <= baselineQuality.nonOrthogonalSegments
        && candidateQuality.reverseOverlap <= baselineQuality.reverseOverlap
        && candidateQuality.unrelatedOverlap <= baselineQuality.unrelatedOverlap
        && candidateQuality.unexplainedRelatedOverlap <= baselineQuality.unexplainedRelatedOverlap
        && candidateQuality.shortEndpointStubs <= baselineQuality.shortEndpointStubs
        && candidateQuality.hairpins <= baselineQuality.hairpins
        && candidateQuality.tinyInteriorDoglegs === baselineQuality.tinyInteriorDoglegs + 1;
      if (onlyAddsOneTinyDogleg) {
        const transientObstacleHits = obstacleContext.evaluateKnownChanges(
          candidateEdges,
          changedIndexes,
        );
        if (
          transientObstacleHits <= baselineObstacleHits
          && preservesLegalSharedTrunks(
            baselineTrunks,
            auditFinalSameSideEndpointOrder(candidateEdges, nodes).legalSharedTrunks,
          )
          && (
            !transientTinyCandidate
            || candidateQuality.detourPenalty < transientTinyQuality.detourPenalty
          )
        ) {
          transientTinyCandidate = candidateEdges;
          transientTinyQuality = candidateQuality;
        }
      } else {
        report.rejectedHardQuality += 1;
        const hardMetrics: CrossedSpineHardMetrics = {
          nonOrthogonalSegments: candidateQuality.nonOrthogonalSegments,
          reverseOverlap: candidateQuality.reverseOverlap,
          unrelatedOverlap: candidateQuality.unrelatedOverlap,
          unexplainedRelatedOverlap: candidateQuality.unexplainedRelatedOverlap,
          shortEndpointStubs: candidateQuality.shortEndpointStubs,
          tinyInteriorDoglegs: candidateQuality.tinyInteriorDoglegs,
          hairpins: candidateQuality.hairpins,
        };
        const hardRegressionPenalty =
          Math.max(0, hardMetrics.nonOrthogonalSegments - baselineQuality.nonOrthogonalSegments) * 1_000_000
          + Math.max(0, hardMetrics.reverseOverlap - baselineQuality.reverseOverlap) * 10_000
          + Math.max(0, hardMetrics.unrelatedOverlap - baselineQuality.unrelatedOverlap) * 10_000
          + Math.max(0, hardMetrics.unexplainedRelatedOverlap - baselineQuality.unexplainedRelatedOverlap) * 10_000
          + Math.max(0, hardMetrics.shortEndpointStubs - baselineQuality.shortEndpointStubs) * 1_000
          + Math.max(0, hardMetrics.hairpins - baselineQuality.hairpins) * 1_000
          + Math.max(0, hardMetrics.tinyInteriorDoglegs - baselineQuality.tinyInteriorDoglegs) * 100;
        if (hardRegressionPenalty < closestHardRegressionPenalty) {
          closestHardRegressionPenalty = hardRegressionPenalty;
          report.closestRejectedHardQuality = hardMetrics;
        }
      }
      continue;
    }
    const candidateObstacleHits = obstacleContext.evaluateKnownChanges(
      candidateEdges,
      changedIndexes,
    );
    if (candidateObstacleHits > baselineObstacleHits) {
      report.rejectedObstacles += 1;
      continue;
    }
    if (!preservesLegalSharedTrunks(
      baselineTrunks,
      auditFinalSameSideEndpointOrder(candidateEdges, nodes).legalSharedTrunks,
    )) {
      report.rejectedTrunks += 1;
      continue;
    }
    const candidateScore = obstacleRepairScore(candidateQuality, candidateObstacleHits);
    if (
      candidateQuality.strictCrossings < bestQuality.strictCrossings
      || candidateScore < bestScore - 1
    ) {
      best = candidateEdges;
      bestQuality = candidateQuality;
      bestScore = candidateScore;
    }
  }
  atomicPairSearch: for (const pair of baselineQuality.strictCrossings >= 2
    ? buildBoundedIndependentSkirtPairs(edges, candidates)
    : []) {
    report.pairedGenerated += 1;
    const evaluated = atomicEvaluation.evaluate(pair.edges, [...pair.changedIndexes]);
    if (evaluated.quality.strictCrossings < baselineQuality.strictCrossings) {
      report.pairedStrictReduced += 1;
    }
    if (!evaluated.terminalsAnchored) continue;
    report.pairedEligible += 1;
    if (!evaluated.hardQualityDoesNotRegress) {
      report.pairedRejectedHardQuality += 1;
      continue;
    }
    if (!evaluated.obstacleHitsDoNotRegress) {
      report.pairedRejectedObstacles += 1;
      continue;
    }
    if (!evaluated.trunksPreserved) {
      report.pairedRejectedTrunks += 1;
      continue;
    }
    if (evaluated.quality.strictCrossings >= bestQuality.strictCrossings) continue;
    best = pair.edges;
    bestQuality = evaluated.quality;
    if (bestQuality.strictCrossings === 0) break atomicPairSearch;
  }
  pairedOverlapSearch: for (const primary of transientOverlapCandidates
    .sort((first, second) => (
      first.quality.strictCrossings - second.quality.strictCrossings
      || first.quality.reverseOverlap - second.quality.reverseOverlap
      || first.quality.unrelatedOverlap - second.quality.unrelatedOverlap
      || first.quality.detourPenalty - second.quality.detourPenalty
    ))
    .slice(0, 8)) {
    const overlapPairs = collectExactThresholdResidualPairs(primary.edges)
      .filter(pair => (
        pair.first.edgeIndex === primary.primaryEdgeIndex
        || pair.second.edgeIndex === primary.primaryEdgeIndex
      ))
      .slice(0, 4);
    for (const pair of overlapPairs) {
      const companionCandidates = buildAtomicOverlapCompanionCandidates(
        primary.edges,
        nodes,
        pair,
      );
      report.pairedGenerated += companionCandidates.length;
      for (const candidateEdges of companionCandidates) {
        const changedIndexes = edges.flatMap((edge, index) => (
          candidateEdges[index] !== edge ? [index] : []
        ));
        if (changedIndexes.length < 2) continue;
        const evaluated = atomicEvaluation.evaluate(candidateEdges, changedIndexes);
        if (evaluated.quality.strictCrossings < baselineQuality.strictCrossings) {
          report.pairedStrictReduced += 1;
        }
        if (!evaluated.terminalsAnchored) continue;
        report.pairedEligible += 1;
        if (!evaluated.hardQualityDoesNotRegress) {
          report.pairedRejectedHardQuality += 1;
          continue;
        }
        if (!evaluated.obstacleHitsDoNotRegress) {
          report.pairedRejectedObstacles += 1;
          continue;
        }
        if (!evaluated.trunksPreserved) {
          report.pairedRejectedTrunks += 1;
          continue;
        }
        if (evaluated.quality.strictCrossings >= bestQuality.strictCrossings) continue;
        best = candidateEdges;
        bestQuality = evaluated.quality;
        if (bestQuality.strictCrossings === 0) break pairedOverlapSearch;
      }
    }
  }
  const transactionPairs: Array<{
    edges: T;
    changedIndexes: number[];
    quality: typeof baselineQuality;
    obstacleHits: number;
  }> = [];
  if (best !== edges && bestQuality.strictCrossings > 0) {
    const primaryEdges = best;
    const primaryChangedIndexes = edges.flatMap((edge, index) => (
      primaryEdges[index] !== edge ? [index] : []
    ));
    const primaryChangedSet = new Set(primaryChangedIndexes);
    const bestSegments = extractDisplaySegments(primaryEdges);
    const remainingHits = findDisplayStrictCrossingHits(primaryEdges).slice(0, 2);
    companionSearch: for (const hit of remainingHits) {
      const companionSegment = primaryChangedSet.has(hit.a.edgeIndex)
        ? hit.b
        : primaryChangedSet.has(hit.b.edgeIndex)
          ? hit.a
          : null;
      if (!companionSegment) continue;
      const companionEdge = primaryEdges[companionSegment.edgeIndex];
      if (!companionEdge) continue;
      const companionOtherSegments = bestSegments.filter(segment => (
        segment.edgeIndex !== companionSegment.edgeIndex
      ));
      const baselineCompanionStrict = candidateStrictCrossingsForEdge(
        companionSegment.edgeIndex,
        getDisplayComputedPath(companionEdge),
        companionOtherSegments,
      );
      const generatedCompanionCandidates = buildDualTerminalOuterLaneCandidates(
        companionEdge,
        companionSegment.edgeIndex,
        companionSegment,
        nodes,
        companionOtherSegments,
      );
      report.pairedGenerated += generatedCompanionCandidates.length;
      const strictReducedCompanionCandidates = generatedCompanionCandidates
        .filter(next => next.strictCrossings <= Math.max(
          baselineCompanionStrict,
          baselineQuality.strictCrossings,
        ));
      report.pairedStrictReduced += strictReducedCompanionCandidates.length;
      const companionCandidates = strictReducedCompanionCandidates
        .filter(next => terminalValidation.validateEdge(next.edge).anchored)
        .sort((first, second) => (
          first.strictCrossings - second.strictCrossings
          || first.obstacleHits - second.obstacleHits
          || first.pathLength - second.pathLength
        ));
      report.pairedEligible += companionCandidates.length;
      for (const companionCandidate of companionCandidates) {
        const pairedEdges = primaryEdges.map((edge, index) => (
          index === companionCandidate.edgeIndex ? companionCandidate.edge : edge
        )) as T;
        const pairedChangedIndexes = [
          ...primaryChangedIndexes,
          companionCandidate.edgeIndex,
        ];
        const pairedQuality = qualityContext.evaluateChanged(pairedEdges, pairedChangedIndexes);
        if (!visualPolishHardQualityDoesNotRegress(baselineQuality, pairedQuality)) {
          report.pairedRejectedHardQuality += 1;
          continue;
        }
        const pairedObstacleHits = obstacleContext.evaluateKnownChanges(
          pairedEdges,
          pairedChangedIndexes,
        );
        if (pairedObstacleHits > baselineObstacleHits) {
          report.pairedRejectedObstacles += 1;
          continue;
        }
        if (!preservesLegalSharedTrunks(
          baselineTrunks,
          auditFinalSameSideEndpointOrder(pairedEdges, nodes).legalSharedTrunks,
        )) {
          report.pairedRejectedTrunks += 1;
          continue;
        }
        if (pairedQuality.strictCrossings <= baselineQuality.strictCrossings) {
          transactionPairs.push({
            edges: pairedEdges,
            changedIndexes: pairedChangedIndexes,
            quality: pairedQuality,
            obstacleHits: pairedObstacleHits,
          });
        }
        if (pairedQuality.strictCrossings < bestQuality.strictCrossings) {
          best = pairedEdges;
          bestQuality = pairedQuality;
        }
        if (pairedQuality.strictCrossings === 0) break companionSearch;
      }
    }
  }
  if (bestQuality.strictCrossings > 0 && transactionPairs.length > 0) {
    const scheduledPairs = transactionPairs
      .sort((first, second) => (
        first.quality.strictCrossings - second.quality.strictCrossings
        || obstacleRepairScore(first.quality, first.obstacleHits)
          - obstacleRepairScore(second.quality, second.obstacleHits)
      ))
      .slice(0, 8);
    tripleSearch: for (const pair of scheduledPairs) {
      const changedSet = new Set(pair.changedIndexes);
      const pairSegments = extractDisplaySegments(pair.edges);
      for (const hit of findDisplayStrictCrossingHits(pair.edges).slice(0, 4)) {
        const thirdSegment = changedSet.has(hit.a.edgeIndex) && !changedSet.has(hit.b.edgeIndex)
          ? hit.b
          : changedSet.has(hit.b.edgeIndex) && !changedSet.has(hit.a.edgeIndex)
            ? hit.a
            : null;
        if (!thirdSegment) continue;
        const thirdEdge = pair.edges[thirdSegment.edgeIndex];
        if (!thirdEdge) continue;
        const thirdOtherSegments = pairSegments.filter(segment => (
          segment.edgeIndex !== thirdSegment.edgeIndex
        ));
        const baselineThirdStrict = candidateStrictCrossingsForEdge(
          thirdSegment.edgeIndex,
          getDisplayComputedPath(thirdEdge),
          thirdOtherSegments,
        );
        const thirdCandidates = buildDualTerminalOuterLaneCandidates(
          thirdEdge,
          thirdSegment.edgeIndex,
          thirdSegment,
          nodes,
          thirdOtherSegments,
        );
        report.tripleGenerated += thirdCandidates.length;
        const eligible = thirdCandidates
          .filter(candidate => candidate.strictCrossings < baselineThirdStrict)
          .filter(candidate => terminalValidation.validateEdge(candidate.edge).anchored)
          .sort((first, second) => (
            first.strictCrossings - second.strictCrossings
            || first.obstacleHits - second.obstacleHits
            || first.pathLength - second.pathLength
          ))
          .slice(0, 16);
        report.tripleEligible += eligible.length;
        for (const candidate of eligible) {
          const tripleEdges = pair.edges.map((edge, index) => (
            index === candidate.edgeIndex ? candidate.edge : edge
          )) as T;
          const tripleChangedIndexes = [...pair.changedIndexes, candidate.edgeIndex];
          const tripleQuality = qualityContext.evaluateChanged(
            tripleEdges,
            tripleChangedIndexes,
          );
          if (tripleQuality.strictCrossings >= bestQuality.strictCrossings) continue;
          if (!visualPolishHardQualityDoesNotRegress(baselineQuality, tripleQuality)) continue;
          const tripleObstacleHits = obstacleContext.evaluateKnownChanges(
            tripleEdges,
            tripleChangedIndexes,
          );
          if (tripleObstacleHits > baselineObstacleHits) continue;
          if (!preservesLegalSharedTrunks(
            baselineTrunks,
            auditFinalSameSideEndpointOrder(tripleEdges, nodes).legalSharedTrunks,
          )) continue;
          best = tripleEdges;
          bestQuality = tripleQuality;
          report.tripleAccepted += 1;
          if (tripleQuality.strictCrossings === 0) break tripleSearch;
        }
      }
    }
  }
  if (best !== edges && bestQuality.strictCrossings === 0 && bestQuality.tinyInteriorDoglegs > 0) {
    for (const candidateEdges of buildSharedTargetTrunkNormalizationCandidates(best)) {
      report.tripleGenerated += 1;
      const changedIndexes = edges.flatMap((edge, index) => (
        candidateEdges[index] !== edge ? [index] : []
      ));
      if (changedIndexes.length < 2) continue;
      const evaluated = atomicEvaluation.evaluate(candidateEdges, changedIndexes);
      if (!evaluated.terminalsAnchored) continue;
      report.tripleEligible += 1;
      if (
        evaluated.quality.strictCrossings > bestQuality.strictCrossings
        || evaluated.quality.tinyInteriorDoglegs >= bestQuality.tinyInteriorDoglegs
        || !evaluated.hardQualityDoesNotRegress
        || !evaluated.obstacleHitsDoNotRegress
        || !evaluated.trunksPreserved
      ) continue;
      best = candidateEdges;
      bestQuality = evaluated.quality;
      report.tripleAccepted += 1;
      if (bestQuality.tinyInteriorDoglegs === 0) break;
    }
  }
  if (best === edges && transientTinyCandidate) {
    best = transientTinyCandidate;
    bestQuality = transientTinyQuality;
  }
  if (best !== edges && bestQuality.tinyInteriorDoglegs > 0) {
    const microCandidate = repairDisplayMicroArtifacts(best) as T;
    const microQuality = qualityContext.evaluate(microCandidate);
    const microObstacleHits = obstacleContext.evaluate(microCandidate);
    if (
      microQuality.strictCrossings <= bestQuality.strictCrossings
      && visualPolishHardQualityDoesNotRegress(bestQuality, microQuality)
      && microQuality.tinyInteriorDoglegs < bestQuality.tinyInteriorDoglegs
      && microObstacleHits <= baselineObstacleHits
      && microCandidate.every(edge => terminalValidation.validateEdge(edge).anchored)
      && preservesLegalSharedTrunks(
        baselineTrunks,
        auditFinalSameSideEndpointOrder(microCandidate, nodes).legalSharedTrunks,
      )
    ) {
      best = microCandidate;
      bestQuality = microQuality;
    }
  }
  report.acceptedStrictCrossings = bestQuality.strictCrossings;
  options.onReport?.(report);
  return best;
};
