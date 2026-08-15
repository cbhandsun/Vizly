import type { Edge, Node } from '@xyflow/react';

import { repairDisplayMicroArtifacts } from '../../strategies/shared/edgeDisplayMicroCleanup';
import {
  getEdgePath,
  pathMicroMetrics,
} from '../../strategies/shared/edgeDisplayMicroCleanupGeometry';
import { synthesizeSharedSourceTrunks } from '../../strategies/shared/edgeSharedTrunkSynthesis';
import { sourceSide } from '../../strategies/shared/edgeSharedTrunkSynthesisCore';
import { calculateEdgePathQualityScore } from '../../strategies/shared/edgeStrictCrossingGuard';
import { createBaseReactFlowDisplayMicroSafetyContext } from './baseReactFlowDisplayMicroSafety';
import { visualPolishHardQualityDoesNotRegress } from './baseReactFlowDisplayEvaluation';

const endpointDegrees = (edges: Edge[]): Map<string, number> => {
  const degrees = new Map<string, number>();
  edges.forEach(edge => {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  });
  return degrees;
};

/**
 * Repairs a micro stair that is topologically blocked by sibling source lanes.
 * Connected business targets are synthesized as one commercial trunk while
 * leaf branches stay on their authored corridor and are marked as separated.
 */
export const repairBaseReactFlowConnectedSourceMicroArtifacts = (
  edges: Edge[],
  nodes: Node[],
): Edge[] => {
  const baselineQuality = calculateEdgePathQualityScore(edges);
  const baselineSafety = createBaseReactFlowDisplayMicroSafetyContext(edges, nodes);
  const degrees = endpointDegrees(edges);
  for (const tinyEdge of edges) {
    if (pathMicroMetrics(getEdgePath(tinyEdge)).tinyInteriorDoglegs === 0) continue;
    const tinySide = sourceSide(getEdgePath(tinyEdge));
    if (!tinySide) continue;
    const sourceIndexes = edges.flatMap((edge, index) => (
      edge.source === tinyEdge.source && sourceSide(getEdgePath(edge)) === tinySide ? [index] : []
    ));
    const connectedIndexes = sourceIndexes.filter(index => (
      (degrees.get(edges[index].target) ?? 0) > 1
    ));
    if (connectedIndexes.length < 3 || !connectedIndexes.includes(edges.indexOf(tinyEdge))) continue;
    const connected = connectedIndexes.map(index => edges[index]);
    const synthesized = synthesizeSharedSourceTrunks(connected, { nodes });
    if (synthesized.every((edge, index) => edge === connected[index])) continue;
    const trunkCandidate = edges.map((edge, index) => {
      const connectedIndex = connectedIndexes.indexOf(index);
      if (connectedIndex >= 0) return synthesized[connectedIndex];
      return sourceIndexes.includes(index) && (degrees.get(edge.target) ?? 0) <= 1
        ? { ...edge, data: { ...edge.data, sourceBranchCorridorSeparated: true } }
        : edge;
    });
    const repaired = repairDisplayMicroArtifacts(
      trunkCandidate,
      createBaseReactFlowDisplayMicroSafetyContext(trunkCandidate, nodes),
    );
    const quality = calculateEdgePathQualityScore(repaired);
    if (
      quality.tinyInteriorDoglegs >= baselineQuality.tinyInteriorDoglegs
      || !visualPolishHardQualityDoesNotRegress(baselineQuality, quality)
    ) continue;
    const safety = baselineSafety.evaluate(repaired);
    if (
      safety.obstacleHits <= baselineSafety.baseline.obstacleHits
      && safety.attachedTerminals >= baselineSafety.baseline.attachedTerminals
      && safety.anchoredTerminals >= baselineSafety.baseline.anchoredTerminals
    ) return repaired;
  }
  return edges;
};
