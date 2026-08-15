import type { Edge, Node } from '@xyflow/react';

import { repairDeclaredTerminalRolesWithHardGateWithOutcome } from './baseReactFlowDeclaredTerminalRoleRepair';
import { anchorComputedDisplayEdgeEndpoints } from './baseReactFlowDisplayEdgeCore';
import {
  MIN_RENDER_SAFE_ENDPOINT_STUB,
  repairFinalShortEndpointStubs,
  repairRenderSafeEndpointStubs,
} from './baseReactFlowDisplayEndpointStubRepair';
import { repairSubpixelEndpointStubPrecision } from './baseReactFlowDisplayEndpointStubPrecision';
import { buildBoundedOuterPortTransactionCandidates } from './baseReactFlowDisplayOuterPortCandidates';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';

const reportIsGeometricallyClean = (
  report: ReturnType<typeof getDisplayHardQualityGateReport>,
): boolean => (
  report.terminalsAttached
  && report.obstacleHits === 0
  && report.quality.strictCrossings === 0
  && report.quality.nonOrthogonalSegments === 0
  && report.quality.hairpins === 0
  && report.quality.shortEndpointStubs === 0
  && report.quality.tinyInteriorDoglegs === 0
  && report.quality.reverseOverlap === 0
  && report.quality.unrelatedOverlap === 0
  && report.quality.unexplainedRelatedOverlap === 0
);

/**
 * Resolves the final detached overlap/strict interlock by changing both port
 * roles and one bounded double-axis outer path as a single hard-gated
 * transaction. No partial candidate is returned.
 */
export const repairResidualOuterPortTransactionWithHardGate = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxExactEvaluations = 64,
): T => {
  if (edges.length === 0 || maxExactEvaluations <= 0) return edges;
  const baseline = getDisplayHardQualityGateReport(edges, nodes, 'polished');
  if (baseline.hardClean || (
    baseline.quality.unrelatedOverlap === 0
    && baseline.quality.reverseOverlap === 0
    && baseline.quality.strictCrossings === 0
  )) return edges;

  const candidates = buildBoundedOuterPortTransactionCandidates(edges, nodes, {
    includeStrictCrossings: true,
    maxCandidates: Math.min(64, maxExactEvaluations),
  });
  let remainingEvaluations = Math.min(64, Math.max(1, maxExactEvaluations));
  for (const candidate of candidates) {
    if (remainingEvaluations <= 0) break;
    const terminalBase = repairSubpixelEndpointStubPrecision(
      anchorComputedDisplayEdgeEndpoints(
        repairRenderSafeEndpointStubs(
          repairFinalShortEndpointStubs(
            repairSubpixelEndpointStubPrecision(candidate.edges),
            nodes,
          ),
          nodes,
          64,
        ),
        nodes,
      ) as T,
      MIN_RENDER_SAFE_ENDPOINT_STUB,
    ) as T;
    const report = getDisplayHardQualityGateReport(terminalBase, nodes, 'polished');
    remainingEvaluations -= 1;
    if (report.hardClean) return terminalBase;
    if (!reportIsGeometricallyClean(report) || report.terminalsAnchored) continue;

    const declaredRoleBudget = remainingEvaluations;
    if (declaredRoleBudget <= 0) break;
    const declaredRoleOutcome = repairDeclaredTerminalRolesWithHardGateWithOutcome(
      terminalBase,
      nodes,
      declaredRoleBudget,
    );
    remainingEvaluations -= Math.min(
      remainingEvaluations,
      declaredRoleOutcome.exactEvaluations,
    );
    if (declaredRoleOutcome.edges !== terminalBase) return declaredRoleOutcome.edges as T;
  }
  return edges;
};
