import type { Edge, Node } from '@xyflow/react';

import { traceSkippedFinalCommercialDetours } from './baseReactFlowDisplayCommercialDetourRepair';
import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { traceSkippedFinalEndpointPhases } from './baseReactFlowDisplayFinalEndpointOrder';
import { auditBaseReactFlowFinalSafetyClosure } from './baseReactFlowDisplayFinalSafetyAudit';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import type { DisplayEdgesWorkerResponse } from './baseReactFlowDisplayWorkerProtocol';
import { finalizeStableIncrementalDisplayResponse } from './baseReactFlowDisplayWorkerResponse';

/**
 * Commits an incremental route that already satisfies the complete final
 * safety audit. A defect returns null so the caller enters the existing
 * endpoint and commercial repair pipeline in the same Worker transaction.
 */
export const finalizeAuditedIncrementalDisplayResponse = ({
  response,
  edges,
  nodes,
  evaluation,
  onPhaseTrace,
}: Readonly<{
  response: DisplayEdgesWorkerResponse;
  edges: Edge[];
  nodes: Node[];
  evaluation: BaseReactFlowFinalEndpointEvaluation;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}>): DisplayEdgesWorkerResponse | null => {
  if (response.routeResolution !== 'incremental-route') return null;
  const audit = auditBaseReactFlowFinalSafetyClosure(
    edges,
    nodes,
    evaluation,
    onPhaseTrace,
  );
  if (!audit.canSkip) return null;

  traceSkippedFinalEndpointPhases(edges.length, onPhaseTrace, true);
  startDisplayRoutingPhaseTrace({
    phase: 'final-safety-closure',
    candidateCount: edges.length,
    onTrace: onPhaseTrace,
  }).finish('skip');
  const stableResponse = finalizeStableIncrementalDisplayResponse(
    response,
    edges,
    nodes,
    evaluation.hardReport(edges),
  );
  if (!stableResponse) return null;
  traceSkippedFinalCommercialDetours(edges.length, onPhaseTrace);
  return stableResponse;
};
