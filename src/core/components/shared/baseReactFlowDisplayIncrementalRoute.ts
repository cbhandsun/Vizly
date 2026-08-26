import type { Edge } from '@xyflow/react';

import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  repairBusinessNodeClearanceRisks,
} from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { repairResidualHairpinBridges } from '../../strategies/shared/edgeHairpinBridgeWidenRepair';
import {
  baseReactFlowDisplayOutputRouteSignatureMatches,
} from './baseReactFlowDisplayCache';
import {
  createBaseReactFlowFastDisplayEdges,
  lockFinalDisplayComputedPaths,
  withDisplayAbsolutePositions,
} from './baseReactFlowDisplayEdgeCore';
import { computeBaseReactFlowDisplayInputIdentityBundle } from './baseReactFlowDisplayInputIdentity';
import { repairTerminalHandleHemisphereHairpins } from './baseReactFlowDisplayHemisphereHairpinRepair';
import { createBaseReactFlowMovedNodeReconnectCandidates } from './baseReactFlowDisplayLocalReconnect';
import { createBaseReactFlowRigidMoveSeed } from './baseReactFlowDisplayRigidMove';
import { repairFastDisplayHardSafety } from './baseReactFlowFastEdgeSafety';
import {
  findDisplayStrictCrossingHits,
  getDisplayNodeRect,
  isDisplayContainerNode,
} from './baseReactFlowDisplayGeometry';
import { repairRenderSafeTerminalAxes } from './baseReactFlowRenderTerminalSafety';
import { repairFinalResidualStrictCrossings } from './baseReactFlowDisplayStrictResidualRepair';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import {
  createBaseReactFlowFinalEndpointEvaluation,
  diffBaseReactFlowEvaluationMetrics,
} from './baseReactFlowDisplayFinalEndpointEvaluation';
import {
  findBaseReactFlowBlockedContextEdgePromotions,
  findBaseReactFlowStrictContextEdgePromotions,
} from './baseReactFlowDisplayIncrementalPromotion';
import {
  createBaseReactFlowRoutingAffectedClosure,
  createBaseReactFlowRoutingChangeSet,
} from './baseReactFlowDisplayRoutingChangeSet';
import { expandBaseReactFlowStrictCrossingClosure } from './baseReactFlowDisplayStrictExpansion';
import {
  mergeBaseReactFlowDisplayEdgePatches,
  sanitizeBaseReactFlowTrustedDisplayPatches,
} from './baseReactFlowDisplayRoutingTransaction';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import type {
  DisplayEdgesWorkerResolvedIncrementalRouteRequest,
} from './baseReactFlowDisplayWorkerProtocol';
import {
  createDisplayRoutingSegmentSpatialIndex,
  type DisplayRoutingWorkerSpatialSnapshot,
} from './baseReactFlowDisplayWorkerSpatialSnapshot';
import {
  baseReactFlowIncrementalEdgesHaveNodeClearance as hasNodeClearance,
  baseReactFlowIdentifierListsMatch as sameIdentifiers,
  baseReactFlowReportHasOnlyObstacleDefects as reportHasOnlyObstacleDefects,
  baseReactFlowReportHasOnlyStrictDefects as reportHasOnlyStrictDefects,
  baseReactFlowRoutingChangeSetMatches as routingChangeSetMatches,
  preservesBaseReactFlowIncrementalBoundary as preservesIncrementalBoundary,
} from './baseReactFlowDisplayIncrementalContracts';
import {
  createBaseReactFlowTopologyIncrementalRoute,
} from './baseReactFlowDisplayTopologyIncrementalRoute';

export type BaseReactFlowDisplayIncrementalRouteOutcome = Readonly<{
  edges: Edge[] | null;
  affectedEdgeCount: number;
  eligibleEdgeIds: string[];
  hardReport?: BaseDisplayBoundedCandidateReport;
}>;

const INCREMENTAL_HARD_NODE_CLEARANCE = 16;

/**
 * Attempts an incident-only route against a frozen hard-clean baseline.
 * Returning null is an explicit request for the caller to execute the existing
 * full route in the same Worker job; no partial candidate may escape.
 */
export const createBaseReactFlowIncrementalDisplayEdges = ({
  request,
  baselineSpatialSnapshot,
  onPhaseTrace,
  onBoundedCandidate,
}: {
  request: DisplayEdgesWorkerResolvedIncrementalRouteRequest;
  baselineSpatialSnapshot?: DisplayRoutingWorkerSpatialSnapshot | null;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
  onBoundedCandidate?: (report: BaseDisplayBoundedCandidateReport) => void;
}): BaseReactFlowDisplayIncrementalRouteOutcome => {
  const closureTimer = startDisplayRoutingPhaseTrace({
    phase: 'incremental-closure',
    candidateCount: request.edges.length,
    onTrace: onPhaseTrace,
  });
  const baselineIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
    nodes: request.baselineNodes,
    edges: request.baselineSourceEdges,
    enableSmartEdges: request.enableSmartEdges,
    smartEdgePadding: request.smartEdgePadding,
    isLargeGraph: request.isLargeGraph,
  });
  const nextIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
    nodes: request.nodes,
    edges: request.edges,
    enableSmartEdges: request.enableSmartEdges,
    smartEdgePadding: request.smartEdgePadding,
    isLargeGraph: request.isLargeGraph,
  });
  if (
    baselineIdentity.cacheSignature !== request.baselineInputSignature
    || baselineIdentity.geometryDigest !== request.baselineInputGeometryDigest
    || nextIdentity.cacheSignature !== request.nextInputSignature
    || nextIdentity.geometryDigest !== request.nextInputGeometryDigest
  ) {
    closureTimer.finish('fallback');
    return { edges: null, affectedEdgeCount: 0, eligibleEdgeIds: [] };
  }

  const baselinePatches = sanitizeBaseReactFlowTrustedDisplayPatches(
    request.baselineSourceEdges,
    request.baselinePatches,
  );
  const baselineEdges = baselinePatches
    ? mergeBaseReactFlowDisplayEdgePatches(request.baselineSourceEdges, baselinePatches)
    : null;
  if (
    !baselinePatches
    || !baselineEdges
    || !baseReactFlowDisplayOutputRouteSignatureMatches(
      baselineEdges,
      request.baselineOutputRouteSignature,
    )
  ) {
    closureTimer.finish('fallback');
    return { edges: null, affectedEdgeCount: 0, eligibleEdgeIds: [] };
  }

  const verifiedChangeSet = createBaseReactFlowRoutingChangeSet({
    previousNodes: request.baselineNodes,
    previousEdges: request.baselineSourceEdges,
    nextNodes: request.nodes,
    nextEdges: request.edges,
    reasonHint: request.changeSet.reason,
  });
  const affectedClosure = createBaseReactFlowRoutingAffectedClosure({
    changeSet: verifiedChangeSet,
    previousNodes: request.baselineNodes,
    nextNodes: request.nodes,
    baselineEdges,
    nextEdges: request.edges,
  });
  const requestedMutableEdgeIds = [...request.mutableEdgeIds].sort();
  const requestedContextEdgeIds = [...request.contextEdgeIds].sort();
  const closureMatchesHints = sameIdentifiers(
    affectedClosure.mutableEdgeIds,
    requestedMutableEdgeIds,
  ) && sameIdentifiers(
    affectedClosure.contextEdgeIds,
    requestedContextEdgeIds,
  );
  const affectedEdgeCount = affectedClosure.mutableEdgeIds.length;
  if (!routingChangeSetMatches(verifiedChangeSet, request.changeSet)) {
    closureTimer.finish('fallback', affectedEdgeCount);
    return { edges: null, affectedEdgeCount, eligibleEdgeIds: [] };
  }
  if (closureMatchesHints && verifiedChangeSet.topologyChanged) {
    const topology = createBaseReactFlowTopologyIncrementalRoute({
      request,
      baselineEdges,
      baselinePatches,
      changeSet: verifiedChangeSet,
      onRejectedReport: onBoundedCandidate,
    });
    closureTimer.finish(
      topology.edges ? 'accepted' : 'fallback',
      topology.affectedEdgeCount,
    );
    return topology;
  }
  if (
    !closureMatchesHints
    || !verifiedChangeSet.geometryChanged
    || affectedEdgeCount === 0
    || affectedEdgeCount > 64
  ) {
    closureTimer.finish('fallback', affectedEdgeCount);
    return { edges: null, affectedEdgeCount, eligibleEdgeIds: [] };
  }
  const mutableIds = new Set(affectedClosure.mutableEdgeIds);
  const repairNodes = withDisplayAbsolutePositions(
    request.nodes,
    new Map(request.nodes.map(node => [node.id, node] as const)),
  );
  const evaluationSession = createBaseReactFlowFinalEndpointEvaluation(repairNodes);
  const sessionSpatialSnapshot = baselineSpatialSnapshot?.outputRouteSignature
    === request.baselineOutputRouteSignature
    ? baselineSpatialSnapshot
    : null;
  const segmentIndex = sessionSpatialSnapshot?.segmentIndex
    ?? createDisplayRoutingSegmentSpatialIndex(
      baselineEdges,
      request.baselineOutputRouteSignature,
    );
  const changedNodeIds = new Set(verifiedChangeSet.changedNodeIds);
  const changedBusinessNodeRects = repairNodes.flatMap(node => {
    if (!changedNodeIds.has(node.id) || isDisplayContainerNode(node)) return [];
    const rect = getDisplayNodeRect(node);
    return rect ? [rect] : [];
  });
  const spatialCandidateEdgeIds = segmentIndex?.queryEdgeIds(
    changedBusinessNodeRects,
    COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  ) ?? undefined;
  const promotedIds = findBaseReactFlowBlockedContextEdgePromotions({
    edges: baselineEdges,
    nodes: repairNodes,
    changedNodeIds: verifiedChangeSet.changedNodeIds,
    contextEdgeIds: affectedClosure.contextEdgeIds,
    mutableEdgeIds: affectedClosure.mutableEdgeIds,
    candidateEdgeIds: spatialCandidateEdgeIds,
  });
  if (promotedIds === null) {
    closureTimer.finish('fallback', affectedEdgeCount, {
      cacheHitCount: sessionSpatialSnapshot ? 1 : 0,
    });
    return { edges: null, affectedEdgeCount, eligibleEdgeIds: [] };
  }
  closureTimer.finish('accepted', affectedEdgeCount, {
    cacheHitCount: sessionSpatialSnapshot ? 1 : 0,
  });
  const transactionMutableIds = new Set([
    ...affectedClosure.mutableEdgeIds,
    ...promotedIds,
  ]);
  // Incident edges are mutable because one of their endpoints moved, but that
  // does not make their post-trunk branches exempt from commercial clearance.
  // Only checking promoted frozen edges allowed a hard-clean reconnect to pass
  // while an incident sibling branch moved from >=48px to 36px from WCS.
  const commercialClearanceRepairIds = new Set([
    ...affectedClosure.mutableEdgeIds,
    ...promotedIds,
  ]);
  const strictContextClearanceIds = new Set<string>();
  const repairIncrementalClearance = (candidateEdges: Edge[]): Edge[] => (
    repairBusinessNodeClearanceRisks(candidateEdges, repairNodes, {
      eligibleEdgeIds: commercialClearanceRepairIds,
      minimumClearance: COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      validateCandidate: ({ candidateEdges: nextEdges }) => (
        preservesIncrementalBoundary(
          baselineEdges,
          nextEdges,
          transactionMutableIds,
        )
        && (() => {
          const nextReport = evaluationSession.hardReport(nextEdges);
          return nextReport.hardClean || reportHasOnlyStrictDefects(nextReport);
        })()
      ),
    })
  );
  const transactionSourceEdges = request.edges.filter(edge => (
    transactionMutableIds.has(edge.id)
  ));
  const localRouteTimer = startDisplayRoutingPhaseTrace({
    phase: 'local-route',
    candidateCount: transactionSourceEdges.length,
    onTrace: onPhaseTrace,
  });
  let lastReconnectReport: BaseDisplayBoundedCandidateReport | undefined;
  let reconnectGeneratedPathCount = 0;
  let reconnectEvaluatedPathCount = 0;
  const reconnectSeedTimer = startDisplayRoutingPhaseTrace({
    phase: 'local-reconnect-seed',
    candidateCount: transactionSourceEdges.length,
    onTrace: onPhaseTrace,
  });
  const rigidMoveSeed = createBaseReactFlowRigidMoveSeed({
    baselineEdges,
    baselineNodes: request.baselineNodes,
    nextNodes: request.nodes,
    changedNodeIds: verifiedChangeSet.changedNodeIds,
    mutableEdgeIds: affectedClosure.mutableEdgeIds,
  });
  const rigidEdgeIds = new Set(rigidMoveSeed.rigidEdgeIds);
  const reconnectMutableEdgeIds = affectedClosure.mutableEdgeIds.filter(
    edgeId => !rigidEdgeIds.has(edgeId),
  );
  const reconnectCandidates = reconnectMutableEdgeIds.length > 0
    ? createBaseReactFlowMovedNodeReconnectCandidates({
        baselineEdges: rigidMoveSeed.edges,
        nodes: repairNodes,
        changedNodeIds: verifiedChangeSet.changedNodeIds,
        mutableEdgeIds: reconnectMutableEdgeIds,
        beamWidth: 1,
        onDiagnostics: (diagnostics) => {
          reconnectGeneratedPathCount = diagnostics.generatedPathCount;
          reconnectEvaluatedPathCount = diagnostics.evaluatedPathCount;
        },
      })
    : rigidMoveSeed.rigidEdgeIds.length > 0
      ? [rigidMoveSeed.edges]
      : [];
  reconnectSeedTimer.finish(
    reconnectCandidates.length > 0 ? 'accepted' : 'fallback',
    reconnectCandidates.length,
    {
      candidateCount: reconnectGeneratedPathCount,
      evaluationCount: reconnectEvaluatedPathCount,
    },
  );
  const reconnectCandidatesTimer = startDisplayRoutingPhaseTrace({
    phase: 'local-reconnect-candidates',
    candidateCount: reconnectCandidates.length,
    onTrace: onPhaseTrace,
  });
  const reconnectEvaluationMetricsBefore = evaluationSession.readMetrics();
  const commitReconnectCandidate = (
    candidateEdges: Edge[],
    minimumClearance = COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  ): BaseReactFlowDisplayIncrementalRouteOutcome | null => {
    const lockedCandidateEdges = lockFinalDisplayComputedPaths(candidateEdges, repairNodes);
    const report = evaluationSession.hardReport(lockedCandidateEdges);
    if (
      !report.hardClean
      || !preservesIncrementalBoundary(
        baselineEdges,
        lockedCandidateEdges,
        transactionMutableIds,
      )
      || !hasNodeClearance(
        lockedCandidateEdges,
        repairNodes,
        commercialClearanceRepairIds,
        minimumClearance,
      )
    ) return null;
    const changedEdgeCount = lockedCandidateEdges.filter((edge, index) => (
      edge !== baselineEdges[index]
    )).length;
    reconnectCandidatesTimer.finish(
      'accepted',
      changedEdgeCount,
      diffBaseReactFlowEvaluationMetrics(
        reconnectEvaluationMetricsBefore,
        evaluationSession.readMetrics(),
      ),
    );
    localRouteTimer.finish('accepted', changedEdgeCount);
    const hardGateTimer = startDisplayRoutingPhaseTrace({
      phase: 'hard-gate',
      candidateCount: candidateEdges.length,
      onTrace: onPhaseTrace,
    });
    hardGateTimer.finish('accepted', changedEdgeCount);
    return {
      edges: lockedCandidateEdges,
      affectedEdgeCount: changedEdgeCount,
      eligibleEdgeIds: [...transactionMutableIds].sort(),
      hardReport: report,
    };
  };
  for (const reconnectedEdges of reconnectCandidates) {
    const reconnectSeedReport = evaluationSession.hardReport(reconnectedEdges);
    const committedSeed = commitReconnectCandidate(reconnectedEdges);
    if (committedSeed) return committedSeed;
    onBoundedCandidate?.(reconnectSeedReport);
    if (promotedIds.length > 0 && reconnectSeedReport.hardClean) {
      const promotedSourceEdges = request.edges.filter(edge => (
        promotedIds.includes(edge.id)
      ));
      const promotedRoutedById = new Map(
        createBaseReactFlowFastDisplayEdges({
          edges: promotedSourceEdges,
          nodes: repairNodes,
          enableSmartEdges: request.enableSmartEdges,
          smartEdgePadding: request.smartEdgePadding,
          isLargeGraph: false,
          displayEdgeEpoch: request.displayEdgeEpoch,
        }).map(edge => [edge.id, edge] as const),
      );
      const promotedCandidate = reconnectedEdges.map(edge => (
        promotedRoutedById.get(edge.id) ?? edge
      ));
      const promotedVariants = [
        promotedCandidate,
        repairIncrementalClearance(promotedCandidate),
      ];
      for (const promotedVariant of promotedVariants) {
        const committedPromoted = commitReconnectCandidate(promotedVariant);
        if (committedPromoted) return committedPromoted;
      }
    }
    const commercialClearanceCandidate = repairIncrementalClearance(reconnectedEdges);
    if (commercialClearanceCandidate !== reconnectedEdges) {
      const committedCommercialClearance = commitReconnectCandidate(
        commercialClearanceCandidate,
      );
      if (committedCommercialClearance) return committedCommercialClearance;
    }
    const committedSafeClearanceSeed = commitReconnectCandidate(
      reconnectedEdges,
      INCREMENTAL_HARD_NODE_CLEARANCE,
    );
    if (committedSafeClearanceSeed) return committedSafeClearanceSeed;
    const terminalHairpinRepaired = repairTerminalHandleHemisphereHairpins(
      reconnectedEdges.filter(edge => mutableIds.has(edge.id)),
      repairNodes,
    );
    const hairpinRepairedById = new Map(
      repairResidualHairpinBridges(
        terminalHairpinRepaired,
        repairNodes,
        { maxEdges: affectedEdgeCount },
      ).map(edge => [edge.id, edge] as const),
    );
    let candidateEdges = reconnectedEdges.map(edge => (
      hairpinRepairedById.get(edge.id) ?? edge
    ));
    let reconnectReport = evaluationSession.hardReport(candidateEdges);
    if (reportHasOnlyObstacleDefects(reconnectReport)) {
      const obstacleRepairIds = new Set(
        promotedIds.length > 0
          ? promotedIds
          : affectedClosure.mutableEdgeIds,
      );
      const safetyRepairedById = new Map(
        repairFastDisplayHardSafety(
          candidateEdges.filter(edge => obstacleRepairIds.has(edge.id)),
          repairNodes,
        ).map(edge => [edge.id, edge] as const),
      );
      candidateEdges = candidateEdges.map(edge => (
        safetyRepairedById.get(edge.id) ?? edge
      ));
      const terminalSafeById = new Map(
        repairRenderSafeTerminalAxes(
          candidateEdges.filter(edge => transactionMutableIds.has(edge.id)),
          repairNodes,
          24,
        ).map(edge => [edge.id, edge] as const),
      );
      candidateEdges = candidateEdges.map(edge => (
        terminalSafeById.get(edge.id) ?? edge
      ));
      reconnectReport = evaluationSession.hardReport(candidateEdges);
    }
    if (reportHasOnlyStrictDefects(reconnectReport) && promotedIds.length > 0) {
      const strictIncidentIds = [...new Set(
        findDisplayStrictCrossingHits(candidateEdges)
          .flatMap(hit => [hit.a.edgeIndex, hit.b.edgeIndex])
          .map(edgeIndex => candidateEdges[edgeIndex]?.id)
          .filter((edgeId): edgeId is string => (
            Boolean(edgeId) && mutableIds.has(edgeId) && !rigidEdgeIds.has(edgeId)
          )),
      )];
      const refinedCandidates = createBaseReactFlowMovedNodeReconnectCandidates({
        baselineEdges: candidateEdges,
        nodes: repairNodes,
        changedNodeIds: verifiedChangeSet.changedNodeIds,
        mutableEdgeIds: strictIncidentIds,
        beamWidth: 8,
      });
      for (const refinedCandidate of refinedCandidates) {
        const refinedReport = evaluationSession.hardReport(refinedCandidate);
        if (
          refinedReport.hardClean
          && preservesIncrementalBoundary(
            baselineEdges,
            refinedCandidate,
            transactionMutableIds,
          )
        ) {
          candidateEdges = refinedCandidate;
          break;
        }
      }
    }
    candidateEdges = repairIncrementalClearance(candidateEdges);
    reconnectReport = evaluationSession.hardReport(candidateEdges);
    if (reportHasOnlyStrictDefects(reconnectReport)) {
      const strictContextPromotions = findBaseReactFlowStrictContextEdgePromotions({
        edges: candidateEdges,
        mutableEdgeIds: transactionMutableIds,
        contextEdgeIds: affectedClosure.contextEdgeIds,
      });
      if (strictContextPromotions === null) {
        continue;
      }
      for (const edgeId of strictContextPromotions) {
        transactionMutableIds.add(edgeId);
        strictContextClearanceIds.add(edgeId);
      }
      const strictRepaired = repairFinalResidualStrictCrossings(
        candidateEdges,
        repairNodes,
      );
      if (
        strictRepaired !== candidateEdges
        && preservesIncrementalBoundary(
          baselineEdges,
          strictRepaired,
          transactionMutableIds,
        )
      ) {
        const strictRepairedReport = evaluationSession.hardReport(strictRepaired);
        if (
          strictRepairedReport.hardClean
          && hasNodeClearance(
            strictRepaired,
            repairNodes,
            strictContextClearanceIds,
          )
        ) {
          candidateEdges = strictRepaired;
        }
      }
    }
    candidateEdges = repairIncrementalClearance(candidateEdges);
    reconnectReport = evaluationSession.hardReport(candidateEdges);
    const preservesClosureBoundary = preservesIncrementalBoundary(
      baselineEdges,
      candidateEdges,
      transactionMutableIds,
    );
    const commercialClearanceClean = hasNodeClearance(
      candidateEdges,
      repairNodes,
      commercialClearanceRepairIds,
    ) && hasNodeClearance(
      candidateEdges,
      repairNodes,
      strictContextClearanceIds,
    );
    lastReconnectReport = reconnectReport;
    const changedEdgeCount = candidateEdges.filter((edge, index) => (
      edge !== baselineEdges[index]
    )).length;
    if (
      preservesClosureBoundary
      && reconnectReport.hardClean
      && commercialClearanceClean
    ) {
      reconnectCandidatesTimer.finish(
        'accepted',
        changedEdgeCount,
        diffBaseReactFlowEvaluationMetrics(
          reconnectEvaluationMetricsBefore,
          evaluationSession.readMetrics(),
        ),
      );
      localRouteTimer.finish('accepted', changedEdgeCount);
      const hardGateTimer = startDisplayRoutingPhaseTrace({
        phase: 'hard-gate',
        candidateCount: candidateEdges.length,
        onTrace: onPhaseTrace,
      });
      hardGateTimer.finish('accepted', changedEdgeCount);
      return {
        edges: candidateEdges,
        affectedEdgeCount: changedEdgeCount,
        eligibleEdgeIds: [...transactionMutableIds].sort(),
        hardReport: reconnectReport,
      };
    }
    const strictExpansion = preservesClosureBoundary
      ? expandBaseReactFlowStrictCrossingClosure({
        edges: candidateEdges,
        nodes: repairNodes,
        initialChangedEdgeIds: affectedClosure.mutableEdgeIds,
        mutableEdgeIds: [...transactionMutableIds],
        onRejectedReport: onBoundedCandidate,
      })
      : null;
    const expandedCandidate = strictExpansion
      ? repairIncrementalClearance(strictExpansion.edges)
      : null;
    const lockedExpandedCandidate = expandedCandidate
      ? lockFinalDisplayComputedPaths(expandedCandidate, repairNodes)
      : null;
    const expandedPreservesClosureBoundary = lockedExpandedCandidate
      ? preservesIncrementalBoundary(
        baselineEdges,
        lockedExpandedCandidate,
        transactionMutableIds,
      )
      : false;
    const expandedReport = lockedExpandedCandidate
      ? evaluationSession.hardReport(lockedExpandedCandidate)
      : null;
    if (
      lockedExpandedCandidate
      && expandedPreservesClosureBoundary
      && expandedReport?.hardClean
      && hasNodeClearance(
        lockedExpandedCandidate,
        repairNodes,
        commercialClearanceRepairIds,
      )
    ) {
      const expandedChangedEdgeCount = lockedExpandedCandidate.filter((edge, index) => (
        edge !== baselineEdges[index]
      )).length;
      reconnectCandidatesTimer.finish(
        'accepted',
        expandedChangedEdgeCount,
        diffBaseReactFlowEvaluationMetrics(
          reconnectEvaluationMetricsBefore,
          evaluationSession.readMetrics(),
        ),
      );
      localRouteTimer.finish('accepted', expandedChangedEdgeCount);
      const hardGateTimer = startDisplayRoutingPhaseTrace({
        phase: 'hard-gate',
        candidateCount: lockedExpandedCandidate.length,
        onTrace: onPhaseTrace,
      });
      hardGateTimer.finish('accepted', expandedChangedEdgeCount);
      return {
        edges: lockedExpandedCandidate,
        affectedEdgeCount: expandedChangedEdgeCount,
        eligibleEdgeIds: [...transactionMutableIds].sort(),
        hardReport: expandedReport,
      };
    }
  }
  reconnectCandidatesTimer.finish(
    'rejected',
    undefined,
    diffBaseReactFlowEvaluationMetrics(
      reconnectEvaluationMetricsBefore,
      evaluationSession.readMetrics(),
    ),
  );
  if (lastReconnectReport) onBoundedCandidate?.(lastReconnectReport);

  const fastFallbackTimer = startDisplayRoutingPhaseTrace({
    phase: 'local-fast-fallback',
    candidateCount: transactionSourceEdges.length,
    onTrace: onPhaseTrace,
  });
  const locallyRouted = createBaseReactFlowFastDisplayEdges({
    edges: transactionSourceEdges,
    nodes: repairNodes,
    enableSmartEdges: request.enableSmartEdges,
    smartEdgePadding: request.smartEdgePadding,
    isLargeGraph: false,
    displayEdgeEpoch: request.displayEdgeEpoch,
  });
  const locallyRoutedById = new Map(
    locallyRouted.map(edge => [edge.id, edge] as const),
  );
  fastFallbackTimer.finish('accepted', locallyRoutedById.size);
  localRouteTimer.finish('accepted', locallyRoutedById.size);
  const candidateEdges = lockFinalDisplayComputedPaths(repairIncrementalClearance(
    baselineEdges.map(edge => locallyRoutedById.get(edge.id) ?? edge),
  ), repairNodes);
  const hardGateTimer = startDisplayRoutingPhaseTrace({
    phase: 'hard-gate',
    candidateCount: candidateEdges.length,
    onTrace: onPhaseTrace,
  });
  const hardGateMetricsBefore = evaluationSession.readMetrics();
  const hardReport = evaluationSession.hardReport(candidateEdges);
  const candidateClearanceClean = hasNodeClearance(
    candidateEdges,
    repairNodes,
    commercialClearanceRepairIds,
  );
  if (!hardReport.hardClean) onBoundedCandidate?.(hardReport);
  hardGateTimer.finish(
    hardReport.hardClean && candidateClearanceClean ? 'accepted' : 'fallback',
    affectedEdgeCount,
    diffBaseReactFlowEvaluationMetrics(
      hardGateMetricsBefore,
      evaluationSession.readMetrics(),
    ),
  );
  return {
    edges: hardReport.hardClean && candidateClearanceClean ? candidateEdges : null,
    affectedEdgeCount,
    eligibleEdgeIds: hardReport.hardClean && candidateClearanceClean
      ? [...transactionMutableIds].sort()
      : [],
    ...(hardReport.hardClean && candidateClearanceClean ? { hardReport } : {}),
  };
};
