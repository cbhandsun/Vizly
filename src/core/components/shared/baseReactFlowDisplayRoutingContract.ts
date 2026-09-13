import type { Edge, Node } from '@xyflow/react';

import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { auditFinalSameSidePassageOrder } from '../../strategies/shared/edgeFinalSameSidePassageOrderRepair';
import { countDisplayBusinessNodeCommercialClearanceViolations } from './baseReactFlowDisplayBusinessNodeClearance';
import { countRenderUnsafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import {
  displayHardQualityReportGeometryIsClean,
  type BaseDisplayBoundedCandidateReport,
} from './baseReactFlowDisplayEvaluation';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';

export type DisplayRoutingContractViolationCode =
  | 'terminal-detached'
  | 'terminal-unanchored'
  | 'non-orthogonal-segment'
  | 'obstacle-hit'
  | 'strict-crossing'
  | 'reverse-overlap'
  | 'unrelated-overlap'
  | 'unexplained-related-overlap'
  | 'short-endpoint-stub'
  | 'tiny-interior-dogleg'
  | 'hairpin'
  | 'minimum-clearance'
  | 'commercial-clearance'
  | 'render-unsafe-endpoint-stub'
  | 'endpoint-order'
  | 'passage-order';

export type DisplayRoutingContractViolation = Readonly<{
  code: DisplayRoutingContractViolationCode;
  phase: 'terminal' | 'geometry' | 'clearance' | 'endpoint-order' | 'passage-order' | 'presentation';
  severity: 'hard' | 'commercial' | 'presentation';
  count: number;
  edgeIds?: readonly string[];
  details?: Readonly<Record<string, number>>;
}>;

export type DisplayRoutingContractOptions = Readonly<{
  /**
   * Reuse a report that was already computed for the same immutable edge/node
   * snapshot. The verifier never trusts caller-provided clean status alone; it
   * still derives the public violation list from report fields.
   */
  hardReport?: BaseDisplayBoundedCandidateReport;
  /**
   * Commercial clearance is a final display contract, but some internal repair
   * stages intentionally validate only the 16px safety floor. Keep the switch
   * explicit so callers can separate internal candidate gates from final output.
   */
  requireCommercialClearance?: boolean;
}>;

export type DisplayRoutingContractReport = Readonly<{
  clean: boolean;
  hardClean: boolean;
  hardReport: BaseDisplayBoundedCandidateReport;
  commercialClearanceViolations: number;
  renderUnsafeEndpointStubs: number;
  endpointOrder: ReturnType<typeof auditFinalSameSideEndpointOrder>;
  passageOrder: ReturnType<typeof auditFinalSameSidePassageOrder>;
  violations: readonly DisplayRoutingContractViolation[];
}>;

const appendCountViolation = (
  violations: DisplayRoutingContractViolation[],
  code: DisplayRoutingContractViolationCode,
  phase: DisplayRoutingContractViolation['phase'],
  severity: DisplayRoutingContractViolation['severity'],
  count: number | undefined,
  details?: Readonly<Record<string, number>>,
): void => {
  if (!Number.isFinite(count) || !count || count <= 0) return;
  violations.push({ code, phase, severity, count, ...(details ? { details } : {}) });
};

const terminalViolations = (
  report: BaseDisplayBoundedCandidateReport,
): DisplayRoutingContractViolation[] => {
  const violations: DisplayRoutingContractViolation[] = [];
  if (!report.terminalsAttached) {
    violations.push({
      code: 'terminal-detached',
      phase: 'terminal',
      severity: 'hard',
      count: 1,
    });
  }
  if (!report.terminalsAnchored) {
    violations.push({
      code: 'terminal-unanchored',
      phase: 'terminal',
      severity: 'hard',
      count: 1,
    });
  }
  return violations;
};

const geometryViolations = (
  report: BaseDisplayBoundedCandidateReport,
): DisplayRoutingContractViolation[] => {
  const violations: DisplayRoutingContractViolation[] = [];
  const { quality } = report;
  appendCountViolation(violations, 'obstacle-hit', 'geometry', 'hard', report.obstacleHits);
  appendCountViolation(
    violations,
    'non-orthogonal-segment',
    'geometry',
    'hard',
    quality.nonOrthogonalSegments,
  );
  appendCountViolation(violations, 'strict-crossing', 'geometry', 'hard', quality.strictCrossings);
  appendCountViolation(violations, 'reverse-overlap', 'geometry', 'hard', quality.reverseOverlap);
  appendCountViolation(violations, 'unrelated-overlap', 'geometry', 'hard', quality.unrelatedOverlap);
  appendCountViolation(
    violations,
    'unexplained-related-overlap',
    'geometry',
    'hard',
    quality.unexplainedRelatedOverlap,
  );
  appendCountViolation(violations, 'short-endpoint-stub', 'geometry', 'hard', quality.shortEndpointStubs);
  appendCountViolation(violations, 'tiny-interior-dogleg', 'geometry', 'hard', quality.tinyInteriorDoglegs);
  appendCountViolation(violations, 'hairpin', 'geometry', 'hard', quality.hairpins);
  if ((report.minimumClearanceViolations ?? 0) > 0) {
    violations.push({
      code: 'minimum-clearance',
      phase: 'clearance',
      severity: 'hard',
      count: report.minimumClearanceViolations ?? 0,
      edgeIds: report.minimumClearanceViolationEdgeIds,
    });
  }
  return violations;
};

export const createDisplayRoutingContractReport = (
  edges: Edge[],
  nodes: Node[],
  options: DisplayRoutingContractOptions = {},
): DisplayRoutingContractReport => {
  const hardReport = options.hardReport ?? getDisplayHardQualityGateReport(edges, nodes, 'polished');
  const requireCommercialClearance = options.requireCommercialClearance ?? true;
  const commercialClearanceViolations = requireCommercialClearance
    ? countDisplayBusinessNodeCommercialClearanceViolations(edges, nodes)
    : (hardReport.commercialClearanceViolations ?? 0);
  const renderUnsafeEndpointStubs = countRenderUnsafeEndpointStubs(edges);
  const endpointOrder = auditFinalSameSideEndpointOrder(edges, nodes);
  const passageOrder = auditFinalSameSidePassageOrder(edges, nodes);
  const violations = [
    ...terminalViolations(hardReport),
    ...geometryViolations(hardReport),
  ];

  appendCountViolation(
    violations,
    'commercial-clearance',
    'clearance',
    'commercial',
    commercialClearanceViolations,
  );
  appendCountViolation(
    violations,
    'render-unsafe-endpoint-stub',
    'presentation',
    'presentation',
    renderUnsafeEndpointStubs,
  );
  appendCountViolation(
    violations,
    'endpoint-order',
    'endpoint-order',
    'presentation',
    endpointOrder.inversions
      + endpointOrder.ambiguousLaneTies
      + endpointOrder.collapsedLanePairs
      + endpointOrder.invalidEndpointCount,
    {
      inversions: endpointOrder.inversions,
      ambiguousLaneTies: endpointOrder.ambiguousLaneTies,
      collapsedLanePairs: endpointOrder.collapsedLanePairs,
      invalidEndpointCount: endpointOrder.invalidEndpointCount,
    },
  );
  appendCountViolation(
    violations,
    'passage-order',
    'passage-order',
    'presentation',
    passageOrder.passageDefects
      + passageOrder.nearTrunkOpportunities
      + passageOrder.invalidLegCount,
    {
      passageDefects: passageOrder.passageDefects,
      nearTrunkOpportunities: passageOrder.nearTrunkOpportunities,
      invalidLegCount: passageOrder.invalidLegCount,
    },
  );

  return {
    clean: violations.length === 0,
    hardClean: displayHardQualityReportGeometryIsClean(hardReport) && hardReport.terminalsAnchored,
    hardReport,
    commercialClearanceViolations,
    renderUnsafeEndpointStubs,
    endpointOrder,
    passageOrder,
    violations,
  };
};
