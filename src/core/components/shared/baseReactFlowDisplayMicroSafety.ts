import type { Edge, Node } from '@xyflow/react';

import type {
  DisplayMicroCleanupSafetyContext,
  DisplayMicroCleanupSafetyScore,
} from '../../strategies/shared/edgeDisplayMicroCleanup';
import { createDisplayObstacleEvaluationContext } from './baseReactFlowDisplayEvaluation';
import { createDisplayTerminalValidationSnapshot } from './baseReactFlowTerminalAxisRepair';

const countTerminalSafety = (
  edges: readonly Edge[],
  validateEdge: ReturnType<typeof createDisplayTerminalValidationSnapshot>['validateEdge'],
): Pick<DisplayMicroCleanupSafetyScore, 'attachedTerminals' | 'anchoredTerminals'> => {
  let attachedTerminals = 0;
  let anchoredTerminals = 0;
  for (const edge of edges) {
    const validation = validateEdge(edge);
    if (validation.attached) attachedTerminals += 1;
    if (validation.anchored) anchoredTerminals += 1;
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
  const baselineTerminalValidation = baseline.map(edge => terminalSnapshot.validateEdge(edge));
  const baselineTerminalSafety = countTerminalSafety(
    baseline,
    terminalSnapshot.validateEdge,
  );
  const baselineScore: DisplayMicroCleanupSafetyScore = {
    obstacleHits: obstacleContext.evaluate(baseline),
    ...baselineTerminalSafety,
  };

  const evaluateFull = (candidateEdges: Edge[]): DisplayMicroCleanupSafetyScore => ({
    obstacleHits: obstacleContext.evaluate(candidateEdges),
    ...countTerminalSafety(candidateEdges, terminalSnapshot.validateEdge),
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
        anchoredTerminals += Number(candidateValidation.anchored) - Number(baselineValidation.anchored);
      }
      return {
        obstacleHits: obstacleContext.evaluateKnownChanges(candidateEdges, uniqueIndexes),
        attachedTerminals,
        anchoredTerminals,
      };
    },
  };
};
