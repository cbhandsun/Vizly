import type { Edge, Node } from '@xyflow/react';

import {
  computeBaseReactFlowDisplayOutputRouteSignature,
  withDisplayAbsolutePositions,
} from './baseReactFlowDisplayEdgeCore';
import { computeBaseDisplayHardGateEvidenceSignature } from './baseReactFlowDisplayHardGateMemo';
import {
  countRenderUnsafeEndpointStubs,
  repairRenderSafeEndpointStubs,
} from './baseReactFlowDisplayEndpointStubRepair';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import { compactDisplayEdgePaths } from './baseReactFlowDisplayGeometry';
import { repairBaseReactFlowMeasuredDisplayEdgesWithReport } from './baseReactFlowDisplayMeasuredRepair';
import { repairResidualOuterPortTransactionWithHardGate } from './baseReactFlowDisplayOuterPortTransaction';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { repairAxisMismatchedTerminalsWithBoundedPortRoles } from './baseReactFlowDisplayTerminalPortRepair';
import { repairDeclaredTerminalRolesWithHardGate } from './baseReactFlowDeclaredTerminalRoleRepair';
import { repairRenderSafeTerminalAxes } from './baseReactFlowRenderTerminalSafety';
import { repairSharedPortAndTinyTerminalLanes } from './baseReactFlowDisplaySharedPortLaneRepair';
import { repairFinalResidualStrictCrossings } from './baseReactFlowDisplayStrictResidualRepair';
import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { doBaseReactFlowDisplayRoutesMatchExactly } from './baseReactFlowDisplayRoutingTransaction';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

export type BaseReactFlowDisplayExactReport = Readonly<{
  inputNodes: Node[];
  repairNodes: Node[];
  outputRouteSignature: string;
  report: BaseDisplayBoundedCandidateReport;
}>;

export type BaseReactFlowDisplayFinalizerOutcome<T extends Edge[] = Edge[]> = Readonly<{
  edges: T;
  measuredRepairReachedFixedPoint?: boolean;
  report: BaseDisplayBoundedCandidateReport;
}>;

const needsOuterPortTransaction = (
  report: BaseDisplayBoundedCandidateReport,
): boolean => !report.hardClean && (
  report.quality.unrelatedOverlap > 0
  || report.quality.reverseOverlap > 0
  || report.quality.strictCrossings > 0
);

const hasOnlyDeclaredTerminalAxisDefect = (
  report: BaseDisplayBoundedCandidateReport,
): boolean => {
  const quality = report.quality;
  return report.terminalsAttached
    && !report.terminalsAnchored
    && report.obstacleHits === 0
    && quality.nonOrthogonalSegments === 0
    && quality.strictCrossings === 0
    && quality.reverseOverlap === 0
    && quality.unrelatedOverlap === 0
    && quality.unexplainedRelatedOverlap === 0
    && quality.shortEndpointStubs === 0
    && quality.tinyInteriorDoglegs === 0
    && quality.hairpins === 0;
};

const canDeferStrictOnlyMeasuredRepair = (
  report: BaseDisplayBoundedCandidateReport,
): boolean => {
  const quality = report.quality;
  return report.terminalsAttached
    && quality.nonOrthogonalSegments === 0
    && quality.strictCrossings > 0
    && quality.reverseOverlap === 0
    && quality.unrelatedOverlap === 0
    && quality.unexplainedRelatedOverlap === 0;
};

export const createBaseReactFlowDisplayExactReport = (
  edges: Edge[],
  inputNodes: Node[],
  repairNodes: Node[],
  report: BaseDisplayBoundedCandidateReport,
): BaseReactFlowDisplayExactReport | undefined => {
  const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(edges);
  return outputRouteSignature
    ? { inputNodes, repairNodes, outputRouteSignature, report }
    : undefined;
};

const resolveTrustedInitialEvaluation = (
  edges: Edge[],
  nodes: Node[],
  exactReport?: BaseReactFlowDisplayExactReport,
): BaseReactFlowDisplayExactReport | undefined => {
  if (!exactReport || exactReport.inputNodes !== nodes) return undefined;
  return computeBaseReactFlowDisplayOutputRouteSignature(edges) === exactReport.outputRouteSignature
    ? exactReport
    : undefined;
};

/**
 * Applies the measured, terminal-axis, render-safety, and bounded terminal
 * transactions to a full-route candidate. The returned report always belongs
 * to the returned route. An exact signed-by-geometry report can be supplied by
 * an earlier stage so the pairwise hard gate is not repeated.
 */
export const finalizeBaseReactFlowDisplayEdgesWithReport = <T extends Edge[]>(
  fullRouteEdges: T,
  nodes: Node[],
  exactReport?: BaseReactFlowDisplayExactReport,
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
  deferStrictOnlyMeasuredRepair = false,
  allowCompoundMeasuredResidualClosure = true,
  evaluation?: BaseReactFlowFinalEndpointEvaluation,
): BaseReactFlowDisplayFinalizerOutcome<T> => {
  const trustedEvaluation = resolveTrustedInitialEvaluation(
    fullRouteEdges,
    nodes,
    exactReport,
  );
  const repairNodes = trustedEvaluation?.repairNodes ?? withDisplayAbsolutePositions(
    nodes,
    new Map(nodes.map(node => [node.id, node] as const)),
  );
  if (trustedEvaluation && evaluation) {
    evaluation.rememberHardReport(fullRouteEdges, trustedEvaluation.report);
  }
  const hardReportFor = (candidateEdges: readonly Edge[]): BaseDisplayBoundedCandidateReport => (
    evaluation?.hardReport(candidateEdges)
      ?? getDisplayHardQualityGateReport([...candidateEdges], repairNodes, 'polished')
  );
  const repairRenderSafeStubs = (candidateEdges: T): T => (
    evaluation?.repairRenderSafeEndpointStubs(candidateEdges)
      ?? repairRenderSafeEndpointStubs(candidateEdges, repairNodes)
  ) as T;
  let routedEdges = fullRouteEdges;
  let routedReport = trustedEvaluation?.report ?? hardReportFor(routedEdges);
  let hasAtomicOuterPortHardBaseline = false;
  let measuredRepairFixedPointEdges: T | undefined;
  const createOutcome = (
    edges: T,
    report: BaseDisplayBoundedCandidateReport,
  ): BaseReactFlowDisplayFinalizerOutcome<T> => ({
    edges,
    measuredRepairReachedFixedPoint: Boolean(
      measuredRepairFixedPointEdges
      && doBaseReactFlowDisplayRoutesMatchExactly(measuredRepairFixedPointEdges, edges)
      && computeBaseDisplayHardGateEvidenceSignature(measuredRepairFixedPointEdges)
        === computeBaseDisplayHardGateEvidenceSignature(edges)
    ),
    report,
  });

  // A candidate that is already geometrically clean should not enter the
  // broader measured-repair pipeline merely because one declared port axis is
  // stale. The broader pipeline may legitimately re-anchor several terminals,
  // which expands a one-edge defect into new loop/stair defects. Keep this
  // bounded transaction first and commit it only when the exact whole-graph
  // hard gate is clean.
  if (hasOnlyDeclaredTerminalAxisDefect(routedReport)) {
    const directAxisCandidate = compactDisplayEdgePaths(
      repairAxisMismatchedTerminalsWithBoundedPortRoles(
        routedEdges,
        repairNodes,
        Math.min(128, Math.max(32, routedEdges.length * 4)),
      ),
    ) as T;
    if (directAxisCandidate !== routedEdges) {
      const directAxisReport = hardReportFor(directAxisCandidate);
      if (directAxisReport.hardClean) {
        routedEdges = directAxisCandidate;
        routedReport = directAxisReport;
      }
    }
  }

  if (deferStrictOnlyMeasuredRepair && canDeferStrictOnlyMeasuredRepair(routedReport)) {
    return createOutcome(routedEdges, routedReport);
  }

  if (!routedReport.hardClean) {
    const measuredTimer = startDisplayRoutingPhaseTrace({
      phase: 'measured-repair',
      candidateCount: routedEdges.length,
      onTrace: onPhaseTrace,
    });
    const measuredSeed = routedEdges;
    const measuredInputEvidenceSignature = computeBaseDisplayHardGateEvidenceSignature(
      measuredSeed,
    );
    const measuredOutcome = repairBaseReactFlowMeasuredDisplayEdgesWithReport(
      routedEdges,
      nodes,
      {
        edges: measuredSeed,
        inputNodes: nodes,
        repairNodes,
        report: routedReport,
        evaluation,
      },
      deferStrictOnlyMeasuredRepair,
      onPhaseTrace,
      allowCompoundMeasuredResidualClosure,
    );
    routedEdges = measuredOutcome.edges as T;
    routedReport = measuredOutcome.report;
    const measuredOutputEvidenceSignature = computeBaseDisplayHardGateEvidenceSignature(
      routedEdges,
    );
    if (
      measuredInputEvidenceSignature !== null
      && measuredInputEvidenceSignature === measuredOutputEvidenceSignature
      && doBaseReactFlowDisplayRoutesMatchExactly(measuredSeed, routedEdges)
    ) measuredRepairFixedPointEdges = routedEdges;
    measuredTimer.finish(routedReport.hardClean ? 'accepted' : 'fallback', routedEdges.length);
  }

  if (
    !routedReport.hardClean
    && (
      routedReport.quality.tinyInteriorDoglegs > 0
      || routedReport.quality.hairpins > 0
    )
  ) {
    const residualLaneCandidate = compactDisplayEdgePaths(
      repairFinalResidualStrictCrossings(
        repairSharedPortAndTinyTerminalLanes(
          routedEdges,
          repairNodes,
          Math.min(32, Math.max(8, routedEdges.length)),
          { allowTransientStrictCrossing: true },
        ),
        repairNodes,
      ),
    ) as T;
    if (residualLaneCandidate !== routedEdges) {
      const residualLaneReport = hardReportFor(residualLaneCandidate);
      if (residualLaneReport.hardClean) {
        routedEdges = residualLaneCandidate;
        routedReport = residualLaneReport;
      }
    }
  }

  if (routedReport.terminalsAttached && !routedReport.terminalsAnchored) {
    const directAxisCandidate = compactDisplayEdgePaths(
      repairAxisMismatchedTerminalsWithBoundedPortRoles(
        routedEdges,
        repairNodes,
        Math.min(128, Math.max(32, routedEdges.length * 4)),
      ),
    ) as T;
    const directAxisReport = directAxisCandidate === routedEdges
      ? routedReport
      : hardReportFor(directAxisCandidate);
    if (directAxisReport.hardClean) {
      routedEdges = directAxisCandidate;
      routedReport = directAxisReport;
    }
  }

  const atomicOuterPortEdges = needsOuterPortTransaction(routedReport)
    ? repairResidualOuterPortTransactionWithHardGate(
      routedEdges,
      repairNodes,
      64,
      {
        evaluation,
        initialReport: { edges: routedEdges, report: routedReport },
        onPhaseTrace,
      },
    ) as T
    : routedEdges;
  if (atomicOuterPortEdges !== routedEdges) {
    const atomicOuterPortReport = hardReportFor(atomicOuterPortEdges);
    if (atomicOuterPortReport.hardClean) {
      // 48px is the formal hard minimum. Keep the complete transaction as the
      // rollback baseline, then allow exactly one independently hard-gated
      // 56px render preference instead of re-entering the remaining finalizer.
      routedEdges = atomicOuterPortEdges;
      routedReport = atomicOuterPortReport;
      hasAtomicOuterPortHardBaseline = true;
    }
  }

  const renderSafeEdges = repairRenderSafeStubs(routedEdges);
  const renderSafeEndpointReport = renderSafeEdges === routedEdges
    ? routedReport
    : hardReportFor(renderSafeEdges);
  if (
    renderSafeEndpointReport.hardClean
    && countRenderUnsafeEndpointStubs(renderSafeEdges) === 0
  ) return createOutcome(renderSafeEdges, renderSafeEndpointReport);
  if (hasAtomicOuterPortHardBaseline) {
    return createOutcome(routedEdges, routedReport);
  }
  if (!renderSafeEndpointReport.terminalsAttached) {
    return createOutcome(routedEdges, routedReport);
  }

  const renderSafeAxisEdges = repairRenderSafeStubs(
    repairRenderSafeTerminalAxes(renderSafeEdges, repairNodes, 48) as T,
  );
  const renderSafeReport = renderSafeAxisEdges === renderSafeEdges
    ? renderSafeEndpointReport
    : hardReportFor(renderSafeAxisEdges);
  if (
    renderSafeReport.hardClean
    && countRenderUnsafeEndpointStubs(renderSafeAxisEdges) === 0
  ) return createOutcome(renderSafeAxisEdges, renderSafeReport);
  if (!renderSafeReport.terminalsAttached) {
    return createOutcome(routedEdges, routedReport);
  }

  const outerPortSafeEdges = needsOuterPortTransaction(renderSafeReport)
    ? repairResidualOuterPortTransactionWithHardGate(
      renderSafeAxisEdges,
      repairNodes,
      64,
      {
        evaluation,
        initialReport: { edges: renderSafeAxisEdges, report: renderSafeReport },
        onPhaseTrace,
      },
    ) as T
    : renderSafeAxisEdges;
  if (outerPortSafeEdges !== renderSafeAxisEdges) {
    const outerPortSafeReport = hardReportFor(outerPortSafeEdges);
    if (outerPortSafeReport.hardClean) {
      const preferredOuterPortEdges = repairRenderSafeStubs(outerPortSafeEdges);
      const preferredOuterPortReport = preferredOuterPortEdges === outerPortSafeEdges
        ? outerPortSafeReport
        : hardReportFor(preferredOuterPortEdges);
      return createOutcome(
        preferredOuterPortReport.hardClean
        && countRenderUnsafeEndpointStubs(preferredOuterPortEdges) === 0
          ? preferredOuterPortEdges
          : outerPortSafeEdges,
        preferredOuterPortReport.hardClean
        && countRenderUnsafeEndpointStubs(preferredOuterPortEdges) === 0
          ? preferredOuterPortReport
          : outerPortSafeReport,
      );
    }
  }

  const declaredRoleSafeEdges = repairDeclaredTerminalRolesWithHardGate(
    renderSafeAxisEdges,
    repairNodes,
    Math.min(256, Math.max(64, renderSafeAxisEdges.length * 4)),
  ) as T;
  if (
    declaredRoleSafeEdges !== renderSafeAxisEdges
    && countRenderUnsafeEndpointStubs(declaredRoleSafeEdges) === 0
  ) {
    return {
      edges: declaredRoleSafeEdges,
      report: hardReportFor(declaredRoleSafeEdges),
    };
  }

  const axisSafeEdges = repairRenderSafeStubs(
    compactDisplayEdgePaths(repairAxisMismatchedTerminalsWithBoundedPortRoles(
      renderSafeAxisEdges,
      repairNodes,
      Math.min(128, Math.max(32, renderSafeAxisEdges.length * 4)),
    )) as T,
  );
  const axisSafeReport = axisSafeEdges === renderSafeAxisEdges
    ? renderSafeReport
    : hardReportFor(axisSafeEdges);
  return createOutcome(
    countRenderUnsafeEndpointStubs(axisSafeEdges) === 0
    && axisSafeReport.hardClean
      ? axisSafeEdges
      : routedEdges,
    countRenderUnsafeEndpointStubs(axisSafeEdges) === 0
    && axisSafeReport.hardClean
      ? axisSafeReport
      : routedReport,
  );
};

export const finalizeBaseReactFlowDisplayEdges = <T extends Edge[]>(
  fullRouteEdges: T,
  nodes: Node[],
  exactReport?: BaseReactFlowDisplayExactReport,
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
  deferStrictOnlyMeasuredRepair = false,
  evaluation?: BaseReactFlowFinalEndpointEvaluation,
): T => finalizeBaseReactFlowDisplayEdgesWithReport(
  fullRouteEdges,
  nodes,
  exactReport,
  onPhaseTrace,
  deferStrictOnlyMeasuredRepair,
  true,
  evaluation,
).edges;
