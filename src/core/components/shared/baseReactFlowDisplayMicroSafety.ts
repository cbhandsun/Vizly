import type { Edge, Node } from '@xyflow/react';

import type {
  DisplayMicroCleanupSafetyContext,
  DisplayMicroCleanupSafetyScore,
} from '../../strategies/shared/edgeDisplayMicroCleanup';
import { createDisplayObstacleEvaluationContext } from './baseReactFlowDisplayEvaluation';
import { createDisplayTerminalValidationSnapshot } from './baseReactFlowTerminalAxisRepair';
import { displayTerminalRoleNeedsDeclaredAxisRepair } from './baseReactFlowDisplayTerminalPortCandidates';
import { getDisplayComputedPath, getDisplayNodeRect } from './baseReactFlowDisplayGeometry';

const countTerminalSafety = (
  edges: readonly Edge[],
  validateEdge: ReturnType<typeof createDisplayTerminalValidationSnapshot>['validateEdge'],
  hasValidDeclaredAxes: (edge: Edge) => boolean,
): Pick<DisplayMicroCleanupSafetyScore, 'attachedTerminals' | 'anchoredTerminals'> => {
  let attachedTerminals = 0;
  let anchoredTerminals = 0;
  for (const edge of edges) {
    const validation = validateEdge(edge);
    if (validation.attached) attachedTerminals += 1;
    if (validation.anchored && hasValidDeclaredAxes(edge)) anchoredTerminals += 1;
  }
  return { attachedTerminals, anchoredTerminals };
};

/**
 * Compiles node obstacles and terminal rectangles once for a micro-cleanup
 * transaction. Candidate evaluation is exact for cumulative changed indexes
 * and falls back to a full scan when a caller supplies an invalid delta.
 */
export const createBaseReactFlowDisplayMicroSafetyContext = (
  baseline: Edge[],
  nodes: Node[],
): DisplayMicroCleanupSafetyContext => {
  const obstacleContext = createDisplayObstacleEvaluationContext(baseline, nodes);
  const terminalSnapshot = createDisplayTerminalValidationSnapshot(nodes);
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const hasValidDeclaredAxes = (edge: Edge): boolean => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) return false;
    const sourceRect = getDisplayNodeRect(sourceNode);
    const targetRect = getDisplayNodeRect(targetNode);
    if (!sourceRect || !targetRect) return false;
    const path = getDisplayComputedPath(edge);
    return !displayTerminalRoleNeedsDeclaredAxisRepair(
      edge,
      path,
      'source',
      sourceRect,
    ) && !displayTerminalRoleNeedsDeclaredAxisRepair(
      edge,
      path,
      'target',
      targetRect,
    );
  };
  const baselineTerminalValidation = baseline.map(edge => terminalSnapshot.validateEdge(edge));
  const baselineDeclaredAnchoring = baseline.map((edge, index) => (
    baselineTerminalValidation[index].anchored && hasValidDeclaredAxes(edge)
  ));
  const baselineTerminalSafety = countTerminalSafety(
    baseline,
    terminalSnapshot.validateEdge,
    hasValidDeclaredAxes,
  );
  const baselineScore: DisplayMicroCleanupSafetyScore = {
    obstacleHits: obstacleContext.evaluate(baseline),
    ...baselineTerminalSafety,
  };

  const evaluateFull = (candidateEdges: Edge[]): DisplayMicroCleanupSafetyScore => ({
    obstacleHits: obstacleContext.evaluate(candidateEdges),
    ...countTerminalSafety(candidateEdges, terminalSnapshot.validateEdge, hasValidDeclaredAxes),
  });

  return {
    baseline: baselineScore,
    evaluate: (candidateEdges, changedIndexes) => {
      if (candidateEdges === baseline) return baselineScore;
      if (!changedIndexes || candidateEdges.length !== baseline.length) {
        return evaluateFull(candidateEdges);
      }
      const uniqueIndexes = [...new Set(changedIndexes)];
      if (
        uniqueIndexes.length !== changedIndexes.length
        || uniqueIndexes.some(index => (
          !Number.isInteger(index)
          || index < 0
          || index >= candidateEdges.length
        ))
      ) return evaluateFull(candidateEdges);

      let attachedTerminals = baselineScore.attachedTerminals;
      let anchoredTerminals = baselineScore.anchoredTerminals;
      for (const index of uniqueIndexes) {
        const baselineValidation = baselineTerminalValidation[index];
        const candidateValidation = terminalSnapshot.validateEdge(candidateEdges[index]);
        attachedTerminals += Number(candidateValidation.attached) - Number(baselineValidation.attached);
        anchoredTerminals += Number(
          candidateValidation.anchored && hasValidDeclaredAxes(candidateEdges[index]),
        ) - Number(baselineDeclaredAnchoring[index]);
      }
      return {
        obstacleHits: obstacleContext.evaluateKnownChanges(candidateEdges, uniqueIndexes),
        attachedTerminals,
        anchoredTerminals,
      };
    },
  };
};
