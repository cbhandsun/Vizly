import type { Edge } from '@xyflow/react';

import type { SameSideEndpointTrunkIdentity } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import {
  changedEdgesObstacleHitsDoNotRegress,
  visualPolishHardQualityDoesNotRegress,
} from './baseReactFlowDisplayEvaluation';
import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import type { DisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import { commercialEdgeDetoursDoNotRegress } from './baseReactFlowDisplayCommercialDetourGuard';
import {
  preservesCommercialTrueTrunkMembership,
  preservesInitialTrueTrunks,
  preservesInitialTrueTrunksWithPreferredSourceSupersession,
  preservesInitialTrueTrunksWithinClearanceMargin,
} from './baseReactFlowDisplayTrueTrunkContract';

export type BaseReactFlowFinalEndpointOrderOptions = Readonly<{
  /** Restricts incremental transactions to their declared mutable closure. */
  eligibleEdgeIds?: ReadonlySet<string>;
  /** Source graph before automatic terminal-side routing; used as a soft preference only. */
  preferredEdges?: readonly Edge[];
  /** Aggregate-only stage diagnostics; never includes graph identifiers or geometry. */
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
  /** Request-local exact evidence shared by consecutive final routing stages. */
  evaluation?: BaseReactFlowFinalEndpointEvaluation;
}>;

const passesBaseReactFlowFinalDisplayHardQualityGate = (
  baselineEdges: readonly Edge[],
  candidateEdges: readonly Edge[],
  changedEdgeIndexes: readonly number[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: BaseReactFlowFinalEndpointEvaluation,
): boolean => {
  if (
    options.eligibleEdgeIds
    && !changedEdgeIndexes.every((index) => {
      const edge = candidateEdges[index];
      return Boolean(edge && options.eligibleEdgeIds?.has(edge.id));
    })
  ) return false;
  if (
    evaluation.unsafeEndpointStubs(candidateEdges)
    > evaluation.unsafeEndpointStubs(baselineEdges)
  ) return false;
  const baselineReport = evaluation.hardReport(baselineEdges);
  const candidateReport = evaluation.hardReport(candidateEdges);
  if (
    baselineReport.hardClean
    && !commercialEdgeDetoursDoNotRegress(
      baselineEdges,
      candidateEdges,
      changedEdgeIndexes,
    )
  ) return false;
  if (!changedEdgesObstacleHitsDoNotRegress(
    baselineEdges,
    candidateEdges,
    changedEdgeIndexes,
    evaluation.nodes,
  )) return false;
  if (candidateReport.obstacleHits > baselineReport.obstacleHits) return false;
  if (baselineReport.terminalsAttached && !candidateReport.terminalsAttached) return false;
  if (baselineReport.terminalsAnchored && !candidateReport.terminalsAnchored) return false;
  if (candidateReport.quality.strictCrossings > baselineReport.quality.strictCrossings) {
    return false;
  }
  if (!visualPolishHardQualityDoesNotRegress(
    baselineReport.quality,
    candidateReport.quality,
  )) return false;
  return !baselineReport.hardClean || candidateReport.hardClean;
};

export const passesBaseReactFlowFinalDisplayGate = (
  baselineEdges: readonly Edge[],
  candidateEdges: readonly Edge[],
  changedEdgeIndexes: readonly number[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: BaseReactFlowFinalEndpointEvaluation,
  allowBoundedClearanceStemReduction = false,
  restoredPreferredSourceTrunk?: SameSideEndpointTrunkIdentity,
): boolean => {
  const baselineTrunks = evaluation.endpointOrder(baselineEdges).legalSharedTrunks;
  const candidateOrder = evaluation.endpointOrder(candidateEdges);
  const separatedSourceBranchIds = new Set(candidateEdges.flatMap(edge => (
    edge.data?.sourceBranchCorridorSeparated === true ? [edge.id] : []
  )));
  const trunksPreserved = allowBoundedClearanceStemReduction
    ? baselineTrunks.every(trunk => (
      preservesInitialTrueTrunksWithinClearanceMargin(
        [trunk],
        candidateOrder.legalSharedTrunks,
      )
      || preservesInitialTrueTrunksWithPreferredSourceSupersession(
        [trunk],
        candidateOrder.legalSharedTrunks,
        restoredPreferredSourceTrunk,
        options.preferredEdges,
        separatedSourceBranchIds,
      )
    ))
    : (
    restoredPreferredSourceTrunk
    || options.preferredEdges
    || separatedSourceBranchIds.size > 0
  )
    ? preservesInitialTrueTrunksWithPreferredSourceSupersession(
      baselineTrunks,
      candidateOrder.legalSharedTrunks,
      restoredPreferredSourceTrunk,
      options.preferredEdges,
      separatedSourceBranchIds,
    )
    : preservesInitialTrueTrunks(baselineTrunks, candidateOrder.legalSharedTrunks);
  return trunksPreserved && passesBaseReactFlowFinalDisplayHardQualityGate(
    baselineEdges,
    candidateEdges,
    changedEdgeIndexes,
    options,
    evaluation,
  );
};

/**
 * Commercial shortening may reclaim an arbitrarily overextended shared stem,
 * provided every original trunk membership remains represented by a legal
 * business-clearance stem. All non-trunk hard-quality gates remain identical.
 */
export const passesBaseReactFlowCommercialFinalDisplayGate = (
  baselineEdges: readonly Edge[],
  candidateEdges: readonly Edge[],
  changedEdgeIndexes: readonly number[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: BaseReactFlowFinalEndpointEvaluation,
): boolean => preservesCommercialTrueTrunkMembership(
  evaluation.endpointOrder(baselineEdges).legalSharedTrunks,
  evaluation.endpointOrder(candidateEdges).legalSharedTrunks,
) && passesBaseReactFlowFinalDisplayHardQualityGate(
  baselineEdges,
  candidateEdges,
  changedEdgeIndexes,
  options,
  evaluation,
);
