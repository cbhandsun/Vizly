import type { Edge } from '@xyflow/react';

import { repairResidualHairpinBridges } from '../../strategies/shared/edgeHairpinBridgeWidenRepair';
import {
  baseReactFlowDisplayOutputRouteSignatureMatches,
} from './baseReactFlowDisplayCache';
import {
  createBaseReactFlowFastDisplayEdges,
  withDisplayAbsolutePositions,
} from './baseReactFlowDisplayEdgeCore';
import { computeBaseReactFlowDisplayInputIdentityBundle } from './baseReactFlowDisplayInputIdentity';
import { repairTerminalHandleHemisphereHairpins } from './baseReactFlowDisplayHemisphereHairpinRepair';
import { createBaseReactFlowMovedNodeReconnectCandidates } from './baseReactFlowDisplayLocalReconnect';
import { repairFastDisplayHardSafety } from './baseReactFlowFastEdgeSafety';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { findDisplayStrictCrossingHits } from './baseReactFlowDisplayGeometry';
import { repairRenderSafeTerminalAxes } from './baseReactFlowRenderTerminalSafety';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import {
  findBaseReactFlowBlockedContextEdgePromotions,
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
import type { DisplayEdgesWorkerIncrementalRouteRequest } from './baseReactFlowDisplayWorkerProtocol';

export type BaseReactFlowDisplayIncrementalRouteOutcome = Readonly<{
  edges: Edge[] | null;
  affectedEdgeCount: number;
}>;

const sameIdentifiers = (first: readonly string[], second: readonly string[]): boolean => (
  first.length === second.length
  && first.every((identifier, index) => identifier === second[index])
);

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
  request: DisplayEdgesWorkerIncrementalRouteRequest;
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
    request.edges,
    request.baselinePatches,
  );
  const baselineEdges = baselinePatches
    ? mergeBaseReactFlowDisplayEdgePatches(request.edges, baselinePatches)
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
  const mutableSourceEdges = request.edges.filter(edge => mutableIds.has(edge.id));
  const localRouteTimer = startDisplayRoutingPhaseTrace({
    phase: 'local-route',
    candidateCount: mutableSourceEdges.length,
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
  for (const reconnectedEdges of reconnectCandidates) {
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
    const promotedIds = reportHasOnlyObstacleDefects(reconnectReport)
      ? findBaseReactFlowBlockedContextEdgePromotions({
        edges: candidateEdges,
        nodes: repairNodes,
        changedNodeIds: verifiedChangeSet.changedNodeIds,
        contextEdgeIds: affectedClosure.contextEdgeIds,
      })
      : [];
    if (promotedIds === null) {
      lastReconnectReport = reconnectReport;
      continue;
    }
    const transactionMutableIds = new Set([
      ...affectedClosure.mutableEdgeIds,
      ...promotedIds,
    ]);
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
        reconnectReport = refinedReport;
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
    const preservesClosureBoundary = preservesIncrementalBoundary(
      baselineEdges,
      candidateEdges,
      transactionMutableIds,
    );
    lastReconnectReport = reconnectReport;
    const changedEdgeCount = candidateEdges.filter((edge, index) => (
      edge !== baselineEdges[index]
    )).length;
    if (preservesClosureBoundary && reconnectReport.hardClean) {
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
    const expandedPreservesClosureBoundary = strictExpansion
      ? preservesIncrementalBoundary(
        baselineEdges,
        strictExpansion.edges,
        transactionMutableIds,
      )
      : false;
    if (strictExpansion && expandedPreservesClosureBoundary) {
      const expandedChangedEdgeCount = strictExpansion.edges.filter((edge, index) => (
        edge !== baselineEdges[index]
      )).length;
      localRouteTimer.finish('accepted', expandedChangedEdgeCount);
      const hardGateTimer = startDisplayRoutingPhaseTrace({
        phase: 'hard-gate',
        candidateCount: strictExpansion.edges.length,
        onTrace: onPhaseTrace,
      });
      hardGateTimer.finish('accepted', expandedChangedEdgeCount);
      return {
        edges: strictExpansion.edges,
        affectedEdgeCount: expandedChangedEdgeCount,
      };
    }
  }
  if (lastReconnectReport) onBoundedCandidate?.(lastReconnectReport);

  const locallyRouted = createBaseReactFlowFastDisplayEdges({
    edges: mutableSourceEdges,
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
  const candidateEdges = baselineEdges.map(edge => locallyRoutedById.get(edge.id) ?? edge);
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
  if (!hardReport.hardClean) onBoundedCandidate?.(hardReport);
  hardGateTimer.finish(hardReport.hardClean ? 'accepted' : 'fallback', affectedEdgeCount);
  return {
    edges: hardReport.hardClean ? candidateEdges : null,
    affectedEdgeCount,
  };
};
