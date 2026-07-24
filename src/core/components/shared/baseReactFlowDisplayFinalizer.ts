import type { Edge, Node } from '@xyflow/react';

import {
  computeBaseReactFlowDisplayOutputRouteSignature,
  withDisplayAbsolutePositions,
} from './baseReactFlowDisplayEdgeCore';
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

export type BaseReactFlowDisplayExactReport = Readonly<{
  inputNodes: Node[];
  repairNodes: Node[];
  outputRouteSignature: string;
  report: BaseDisplayBoundedCandidateReport;
}>;

export type BaseReactFlowDisplayFinalizerOutcome<T extends Edge[] = Edge[]> = Readonly<{
  edges: T;
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
  let routedEdges = fullRouteEdges;
  let routedReport = trustedEvaluation?.report ?? getDisplayHardQualityGateReport(
    routedEdges,
    repairNodes,
    'polished',
  );
  let hasAtomicOuterPortHardBaseline = false;

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
      const directAxisReport = getDisplayHardQualityGateReport(
        directAxisCandidate,
        repairNodes,
        'polished',
      );
      if (directAxisReport.hardClean) {
        routedEdges = directAxisCandidate;
        routedReport = directAxisReport;
      }
    }
  }

  if (!routedReport.hardClean) {
    const measuredSeed = routedEdges;
    const measuredOutcome = repairBaseReactFlowMeasuredDisplayEdgesWithReport(
      routedEdges,
      nodes,
      {
        edges: measuredSeed,
        inputNodes: nodes,
        repairNodes,
        report: routedReport,
      },
    );
    routedEdges = measuredOutcome.edges as T;
    routedReport = measuredOutcome.report;
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
      const residualLaneReport = getDisplayHardQualityGateReport(
        residualLaneCandidate,
        repairNodes,
        'polished',
      );
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
      : getDisplayHardQualityGateReport(directAxisCandidate, repairNodes, 'polished');
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
    ) as T
    : routedEdges;
  if (atomicOuterPortEdges !== routedEdges) {
    const atomicOuterPortReport = getDisplayHardQualityGateReport(
      atomicOuterPortEdges,
      repairNodes,
      'polished',
    );
    if (atomicOuterPortReport.hardClean) {
      // 48px is the formal hard minimum. Keep the complete transaction as the
      // rollback baseline, then allow exactly one independently hard-gated
      // 56px render preference instead of re-entering the remaining finalizer.
      routedEdges = atomicOuterPortEdges;
      routedReport = atomicOuterPortReport;
      hasAtomicOuterPortHardBaseline = true;
    }
  }

  const renderSafeEdges = repairRenderSafeEndpointStubs(routedEdges, repairNodes) as T;
  const renderSafeEndpointReport = renderSafeEdges === routedEdges
    ? routedReport
    : getDisplayHardQualityGateReport(renderSafeEdges, repairNodes, 'polished');
  if (
    renderSafeEndpointReport.hardClean
    && countRenderUnsafeEndpointStubs(renderSafeEdges) === 0
  ) return { edges: renderSafeEdges, report: renderSafeEndpointReport };
  if (hasAtomicOuterPortHardBaseline) {
    return { edges: routedEdges, report: routedReport };
  }
  if (!renderSafeEndpointReport.terminalsAttached) {
    return { edges: routedEdges, report: routedReport };
  }

  const renderSafeAxisEdges = repairRenderSafeEndpointStubs(
    repairRenderSafeTerminalAxes(renderSafeEdges, repairNodes, 48),
    repairNodes,
  ) as T;
  const renderSafeReport = renderSafeAxisEdges === renderSafeEdges
    ? renderSafeEndpointReport
    : getDisplayHardQualityGateReport(renderSafeAxisEdges, repairNodes, 'polished');
  if (
    renderSafeReport.hardClean
    && countRenderUnsafeEndpointStubs(renderSafeAxisEdges) === 0
  ) return { edges: renderSafeAxisEdges, report: renderSafeReport };
  if (!renderSafeReport.terminalsAttached) {
    return { edges: routedEdges, report: routedReport };
  }

  const outerPortSafeEdges = needsOuterPortTransaction(renderSafeReport)
    ? repairResidualOuterPortTransactionWithHardGate(
      renderSafeAxisEdges,
      repairNodes,
      64,
    ) as T
    : renderSafeAxisEdges;
  if (outerPortSafeEdges !== renderSafeAxisEdges) {
    const outerPortSafeReport = getDisplayHardQualityGateReport(
      outerPortSafeEdges,
      repairNodes,
      'polished',
    );
    if (outerPortSafeReport.hardClean) {
      const preferredOuterPortEdges = repairRenderSafeEndpointStubs(
        outerPortSafeEdges,
        repairNodes,
      ) as T;
      const preferredOuterPortReport = preferredOuterPortEdges === outerPortSafeEdges
        ? outerPortSafeReport
        : getDisplayHardQualityGateReport(preferredOuterPortEdges, repairNodes, 'polished');
      return (
        preferredOuterPortReport.hardClean
        && countRenderUnsafeEndpointStubs(preferredOuterPortEdges) === 0
      )
        ? { edges: preferredOuterPortEdges, report: preferredOuterPortReport }
        : { edges: outerPortSafeEdges, report: outerPortSafeReport };
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
      report: getDisplayHardQualityGateReport(declaredRoleSafeEdges, repairNodes, 'polished'),
    };
  }

  const axisSafeEdges = repairRenderSafeEndpointStubs(
    compactDisplayEdgePaths(repairAxisMismatchedTerminalsWithBoundedPortRoles(
      renderSafeAxisEdges,
      repairNodes,
      Math.min(128, Math.max(32, renderSafeAxisEdges.length * 4)),
    )),
    repairNodes,
  ) as T;
  const axisSafeReport = axisSafeEdges === renderSafeAxisEdges
    ? renderSafeReport
    : getDisplayHardQualityGateReport(axisSafeEdges, repairNodes, 'polished');
  return (
    countRenderUnsafeEndpointStubs(axisSafeEdges) === 0
    && axisSafeReport.hardClean
  )
    ? { edges: axisSafeEdges, report: axisSafeReport }
    : { edges: routedEdges, report: routedReport };
};

export const finalizeBaseReactFlowDisplayEdges = <T extends Edge[]>(
  fullRouteEdges: T,
  nodes: Node[],
  exactReport?: BaseReactFlowDisplayExactReport,
): T => finalizeBaseReactFlowDisplayEdgesWithReport(
  fullRouteEdges,
  nodes,
  exactReport,
).edges;
