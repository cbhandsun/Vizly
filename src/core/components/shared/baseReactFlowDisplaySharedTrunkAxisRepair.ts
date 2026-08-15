import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { createDisplayDeclaredAxisMismatchCounter } from './baseReactFlowDisplayDeclaredAxisTransaction';
import { createDisplayObstacleEvaluationContext } from './baseReactFlowDisplayEvaluation';
import { fullDisplayPortSide, getDisplayComputedPath } from './baseReactFlowDisplayGeometry';
import { buildSharedSourceTrunkAdoptionCandidates } from './baseReactFlowSharedNodePortRoleRepair';
import { withDisplayPortBridge } from './baseReactFlowDisplayTerminalPortCandidates';
import { createDisplayTerminalValidationSnapshot } from './baseReactFlowTerminalAxisRepair';

const hardQualityDoesNotRegress = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean => (
  candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
  && candidate.strictCrossings <= baseline.strictCrossings
  && candidate.reverseOverlap <= baseline.reverseOverlap
  && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
  && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
  && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
  && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
  && candidate.hairpins <= baseline.hairpins
);

/**
 * Final bounded closure for axis-mismatched edges that become repairable only
 * after a same-source peer has established a clean terminal trunk.
 */
export const repairResidualSharedSourceTrunkAxisMismatches = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 24,
): T => {
  if (!Number.isInteger(maxQualityEvaluations) || maxQualityEvaluations <= 0) return edges;
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  const countAxisMismatches = createDisplayDeclaredAxisMismatchCounter(nodes);
  const skippedEdgeIds = new Set<string>();
  let current = edges;
  let evaluations = 0;

  while (evaluations < maxQualityEvaluations) {
    const edgeIndex = current.findIndex(edge => (
      !skippedEdgeIds.has(edge.id) && countAxisMismatches(edge) > 0
    ));
    if (edgeIndex < 0) break;
    const edge = current[edgeIndex];
    const targetSide = fullDisplayPortSide(normalizeHandle(edge.targetHandle));
    let accepted: T | null = null;
    if (targetSide) {
      const qualityContext = createEdgePathQualityEvaluationContext(current);
      const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
      const baselineQuality = qualityContext.evaluate(current);
      const baselineObstacleHits = obstacleContext.evaluate(current);
      for (const peer of current) {
        if (peer.id === edge.id || peer.source !== edge.source) continue;
        const peerSide = fullDisplayPortSide(normalizeHandle(peer.sourceHandle));
        if (!peerSide || !terminalValidation.validateEdge(peer).sourceAnchored) continue;
        for (const path of buildSharedSourceTrunkAdoptionCandidates(
          getDisplayComputedPath(edge),
          getDisplayComputedPath(peer),
          48,
          3,
        )) {
          if (evaluations >= maxQualityEvaluations) break;
          evaluations += 1;
          const candidateEdge = withDisplayPortBridge(edge, path, peerSide, targetSide);
          if (countAxisMismatches(candidateEdge) !== 0) continue;
          const candidate = current.map((item, index) => (
            index === edgeIndex ? candidateEdge : item
          )) as T;
          const candidateQuality = qualityContext.evaluateChanged(candidate, [edgeIndex]);
          if (!hardQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
          if (obstacleContext.evaluateKnownChanges(candidate, [edgeIndex]) > baselineObstacleHits) continue;
          accepted = candidate;
          break;
        }
        if (accepted || evaluations >= maxQualityEvaluations) break;
      }
    }
    if (!accepted) {
      skippedEdgeIds.add(edge.id);
      continue;
    }
    current = accepted;
    skippedEdgeIds.clear();
  }
  return current;
};
