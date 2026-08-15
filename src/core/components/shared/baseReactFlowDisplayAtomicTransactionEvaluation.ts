import type { Edge, Node } from '@xyflow/react';

import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { createEdgePathQualityEvaluationContext } from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  createDisplayObstacleEvaluationContext,
  visualPolishHardQualityDoesNotRegress,
} from './baseReactFlowDisplayEvaluation';
import { createDisplayTerminalValidationSnapshot } from './baseReactFlowTerminalAxisRepair';

const preservesLegalSharedTrunks = (
  baseline: ReturnType<typeof auditFinalSameSideEndpointOrder>['legalSharedTrunks'],
  candidate: ReturnType<typeof auditFinalSameSideEndpointOrder>['legalSharedTrunks'],
): boolean => baseline.every(trunk => candidate.some(next => (
  next.nodeId === trunk.nodeId
  && next.role === trunk.role
  && next.side === trunk.side
  && trunk.edgeIds.every(edgeId => next.edgeIds.includes(edgeId))
  && next.commonStemLength + 1e-6 >= trunk.commonStemLength
)));

/**
 * Shared full-graph gate for bounded multi-edge transactions. Candidate
 * builders only propose geometry; this evaluator owns the atomic invariants so
 * a repair cannot improve one edge by regressing another edge's terminal,
 * obstacle clearance, hard quality, or established source/target trunk.
 */
export const createAtomicRouteTransactionEvaluation = <T extends Edge[]>(
  baselineEdges: T,
  nodes: Node[],
) => {
  const qualityContext = createEdgePathQualityEvaluationContext(baselineEdges);
  const obstacleContext = createDisplayObstacleEvaluationContext(baselineEdges, nodes);
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  const canValidateTerminals = nodes.length > 0;
  const baselineQuality = qualityContext.evaluate(baselineEdges);
  const baselineObstacleHits = obstacleContext.evaluate(baselineEdges);
  const baselineTrunks = auditFinalSameSideEndpointOrder(
    baselineEdges,
    nodes,
  ).legalSharedTrunks;

  return {
    baselineQuality,
    baselineObstacleHits,
    evaluate(candidate: T, changedIndexes: number[]) {
      const quality = qualityContext.evaluateChanged(candidate, changedIndexes);
      const obstacleHits = obstacleContext.evaluateKnownChanges(candidate, changedIndexes);
      const terminalsAnchored = !canValidateTerminals || changedIndexes.every(index => {
        const edge = candidate[index];
        return Boolean(edge && terminalValidation.validateEdge(edge).anchored);
      });
      const trunksPreserved = preservesLegalSharedTrunks(
        baselineTrunks,
        auditFinalSameSideEndpointOrder(candidate, nodes).legalSharedTrunks,
      );
      return {
        quality,
        obstacleHits,
        terminalsAnchored,
        trunksPreserved,
        hardQualityDoesNotRegress: visualPolishHardQualityDoesNotRegress(
          baselineQuality,
          quality,
        ),
        obstacleHitsDoNotRegress: obstacleHits <= baselineObstacleHits,
      };
    },
  };
};
