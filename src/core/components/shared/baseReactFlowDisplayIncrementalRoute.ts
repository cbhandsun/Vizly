import type { Edge, Node } from '@xyflow/react';

import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  repairBusinessNodeClearanceRisks,
} from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { repairResidualHairpinBridges } from '../../strategies/shared/edgeHairpinBridgeWidenRepair';
import { createNodeClearanceEvaluationContext } from '../../strategies/shared/edgeWaypointCandidateRepair';
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
import { repairFastDisplayHardSafety } from './baseReactFlowFastEdgeSafety';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import {
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';
import { repairRenderSafeTerminalAxes } from './baseReactFlowRenderTerminalSafety';
import { repairFinalResidualStrictCrossings } from './baseReactFlowDisplayStrictResidualRepair';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
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

export type BaseReactFlowDisplayIncrementalRouteOutcome = Readonly<{
  edges: Edge[] | null;
  affectedEdgeCount: number;
}>;

const sameIdentifiers = (first: readonly string[], second: readonly string[]): boolean => (
  first.length === second.length
  && first.every((identifier, index) => identifier === second[index])
);

const INCREMENTAL_HARD_NODE_CLEARANCE = 16;

const reportHasOnlyObstacleDefects = (
  report: BaseDisplayBoundedCandidateReport,
): boolean => (
  report.obstacleHits > 0
  && report.terminalsAnchored
  && report.quality.nonOrthogonalSegments === 0
  && report.quality.strictCrossings === 0
  && report.quality.reverseOverlap === 0
  && report.quality.unrelatedOverlap === 0
  && report.quality.unexplainedRelatedOverlap === 0
  && report.quality.shortEndpointStubs === 0
  && report.quality.tinyInteriorDoglegs === 0
  && report.quality.hairpins === 0
);

const reportHasOnlyStrictDefects = (
  report: BaseDisplayBoundedCandidateReport,
): boolean => (
  report.obstacleHits === 0
  && report.terminalsAnchored
  && report.quality.nonOrthogonalSegments === 0
  && report.quality.strictCrossings > 0
  && report.quality.reverseOverlap === 0
  && report.quality.unrelatedOverlap === 0
  && report.quality.unexplainedRelatedOverlap === 0
  && report.quality.shortEndpointStubs === 0
  && report.quality.tinyInteriorDoglegs === 0
  && report.quality.hairpins === 0
);

const preservesIncrementalBoundary = (
  baselineEdges: Edge[],
  candidateEdges: Edge[],
  mutableIds: ReadonlySet<string>,
): boolean => candidateEdges.every((edge, index) => (
  mutableIds.has(edge.id) || edge === baselineEdges[index]
));

const hasNodeClearance = (
  edges: Edge[],
  nodes: Node[],
  eligibleIds: ReadonlySet<string>,
  minimumClearance = COMMERCIAL_BUSINESS_NODE_CLEARANCE,
): boolean => edges.every(edge => (
  !eligibleIds.has(edge.id)
  || createNodeClearanceEvaluationContext(nodes, edge).score(
    getDisplayComputedPath(edge),
    minimumClearance,
  ) <= 1e-6
));

/**
 * Attempts an incident-only route against a frozen hard-clean baseline.
 * Returning null is an explicit request for the caller to execute the existing
 * full route in the same Worker job; no partial candidate may escape.
 */
export const createBaseReactFlowIncrementalDisplayEdges = ({
  request,
  onPhaseTrace,
  onBoundedCandidate,
}: {
  request: DisplayEdgesWorkerResolvedIncrementalRouteRequest;
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
    return { edges: null, affectedEdgeCount: 0 };
  }

  const baselinePatches = sanitizeBaseReactFlowTrustedDisplayPatches(
    request.baselineSourceEdges,
    request.baselinePatches,
  );
  const baselineEdges = baselinePatches
    ? mergeBaseReactFlowDisplayEdgePatches(request.baselineSourceEdges, baselinePatches)
    : null;
  if (
    !baselineEdges
    || !baseReactFlowDisplayOutputRouteSignatureMatches(
      baselineEdges,
      request.baselineOutputRouteSignature,
    )
  ) {
    closureTimer.finish('fallback');
    return { edges: null, affectedEdgeCount: 0 };
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
  if (
    !closureMatchesHints
    || verifiedChangeSet.topologyChanged
    || !verifiedChangeSet.geometryChanged
    || affectedEdgeCount === 0
    || affectedEdgeCount > 64
  ) {
    closureTimer.finish('fallback', affectedEdgeCount);
    return { edges: null, affectedEdgeCount };
  }
  closureTimer.finish('accepted', affectedEdgeCount);

  const mutableIds = new Set(affectedClosure.mutableEdgeIds);
  const repairNodes = withDisplayAbsolutePositions(
    request.nodes,
    new Map(request.nodes.map(node => [node.id, node] as const)),
  );
  const promotedIds = findBaseReactFlowBlockedContextEdgePromotions({
    edges: baselineEdges,
    nodes: repairNodes,
    changedNodeIds: verifiedChangeSet.changedNodeIds,
    contextEdgeIds: affectedClosure.contextEdgeIds,
    mutableEdgeIds: affectedClosure.mutableEdgeIds,
  });
  if (promotedIds === null) {
    return { edges: null, affectedEdgeCount };
  }
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
          const nextReport = getDisplayHardQualityGateReport(
            nextEdges,
            repairNodes,
            'polished',
          );
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
  const reconnectCandidates = createBaseReactFlowMovedNodeReconnectCandidates({
    baselineEdges,
    nodes: repairNodes,
    changedNodeIds: verifiedChangeSet.changedNodeIds,
    mutableEdgeIds: affectedClosure.mutableEdgeIds,
    beamWidth: 1,
  });
  const commitReconnectCandidate = (
    candidateEdges: Edge[],
    minimumClearance = COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  ): BaseReactFlowDisplayIncrementalRouteOutcome | null => {
    const lockedCandidateEdges = lockFinalDisplayComputedPaths(candidateEdges, repairNodes);
    const report = getDisplayHardQualityGateReport(
      lockedCandidateEdges,
      repairNodes,
      'polished',
    );
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
    localRouteTimer.finish('accepted', changedEdgeCount);
    const hardGateTimer = startDisplayRoutingPhaseTrace({
      phase: 'hard-gate',
      candidateCount: candidateEdges.length,
      onTrace: onPhaseTrace,
    });
    hardGateTimer.finish('accepted', changedEdgeCount);
    return { edges: lockedCandidateEdges, affectedEdgeCount: changedEdgeCount };
  };
  for (const reconnectedEdges of reconnectCandidates) {
    const reconnectSeedReport = getDisplayHardQualityGateReport(
      reconnectedEdges,
      repairNodes,
      'polished',
    );
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
    let reconnectReport = getDisplayHardQualityGateReport(
      candidateEdges,
      repairNodes,
      'polished',
    );
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
      reconnectReport = getDisplayHardQualityGateReport(
        candidateEdges,
        repairNodes,
        'polished',
      );
    }
    if (reportHasOnlyStrictDefects(reconnectReport) && promotedIds.length > 0) {
      const strictIncidentIds = [...new Set(
        findDisplayStrictCrossingHits(candidateEdges)
          .flatMap(hit => [hit.a.edgeIndex, hit.b.edgeIndex])
          .map(edgeIndex => candidateEdges[edgeIndex]?.id)
          .filter((edgeId): edgeId is string => (
            Boolean(edgeId) && mutableIds.has(edgeId)
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
        const refinedReport = getDisplayHardQualityGateReport(
          refinedCandidate,
          repairNodes,
          'polished',
        );
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
    reconnectReport = getDisplayHardQualityGateReport(
      candidateEdges,
      repairNodes,
      'polished',
    );
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
        const strictRepairedReport = getDisplayHardQualityGateReport(
          strictRepaired,
          repairNodes,
          'polished',
        );
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
    reconnectReport = getDisplayHardQualityGateReport(
      candidateEdges,
      repairNodes,
      'polished',
    );
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
      localRouteTimer.finish('accepted', changedEdgeCount);
      const hardGateTimer = startDisplayRoutingPhaseTrace({
        phase: 'hard-gate',
        candidateCount: candidateEdges.length,
        onTrace: onPhaseTrace,
      });
      hardGateTimer.finish('accepted', changedEdgeCount);
      return { edges: candidateEdges, affectedEdgeCount: changedEdgeCount };
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
      ? getDisplayHardQualityGateReport(lockedExpandedCandidate, repairNodes, 'polished')
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
      };
    }
  }
  if (lastReconnectReport) onBoundedCandidate?.(lastReconnectReport);

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
  localRouteTimer.finish('accepted', locallyRoutedById.size);
  const candidateEdges = lockFinalDisplayComputedPaths(repairIncrementalClearance(
    baselineEdges.map(edge => locallyRoutedById.get(edge.id) ?? edge),
  ), repairNodes);
  const hardGateTimer = startDisplayRoutingPhaseTrace({
    phase: 'hard-gate',
    candidateCount: candidateEdges.length,
    onTrace: onPhaseTrace,
  });
  const hardReport = getDisplayHardQualityGateReport(
    candidateEdges,
    repairNodes,
    'polished',
  );
  const candidateClearanceClean = hasNodeClearance(
    candidateEdges,
    repairNodes,
    commercialClearanceRepairIds,
  );
  if (!hardReport.hardClean) onBoundedCandidate?.(hardReport);
  hardGateTimer.finish(
    hardReport.hardClean && candidateClearanceClean ? 'accepted' : 'fallback',
    affectedEdgeCount,
  );
  return {
    edges: hardReport.hardClean && candidateClearanceClean ? candidateEdges : null,
    affectedEdgeCount,
  };
};
