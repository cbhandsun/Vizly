import type { Edge, Node } from '@xyflow/react';

import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityEvaluationContext,
  type EdgePathQualityEvaluationState,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  createDisplayObstacleEvaluationContext,
  type DisplayObstacleEvaluationContext,
  visualPolishHardQualityDoesNotRegress,
} from './baseReactFlowDisplayEvaluation';
import { createDisplayTerminalValidationSnapshot } from './baseReactFlowTerminalAxisRepair';
import { preservesInitialTrueTrunksWithinClearanceMargin } from './baseReactFlowDisplayTrueTrunkContract';

export type AtomicEndpointOrderEvaluation = (
  edges: readonly Edge[],
) => ReturnType<typeof auditFinalSameSideEndpointOrder>;

/**
 * Shared full-graph gate for bounded multi-edge transactions. Candidate
 * builders only propose geometry; this evaluator owns the atomic invariants so
 * a repair cannot improve one edge by regressing another edge's terminal,
 * obstacle clearance, hard quality, or established source/target trunk.
 */
export const createAtomicRouteTransactionEvaluation = <T extends Edge[]>(
  baselineEdges: T,
  nodes: Node[],
  reusable?: Readonly<{
    qualityContext: EdgePathQualityEvaluationContext;
    obstacleContext: DisplayObstacleEvaluationContext;
    baselineQuality: EdgePathQualityScore;
    baselineQualityState?: EdgePathQualityEvaluationState;
    baselineObstacleHits: number;
    endpointOrder?: AtomicEndpointOrderEvaluation;
  }>,
) => {
  const qualityContext = reusable?.qualityContext
    ?? createEdgePathQualityEvaluationContext(baselineEdges);
  const obstacleContext = reusable?.obstacleContext
    ?? createDisplayObstacleEvaluationContext(baselineEdges, nodes);
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  const canValidateTerminals = nodes.length > 0;
  const baselineQuality = reusable?.baselineQuality ?? qualityContext.evaluate(baselineEdges);
  const baselineObstacleHits = reusable?.baselineObstacleHits
    ?? obstacleContext.evaluate(baselineEdges);
  const endpointOrder = reusable?.endpointOrder
    ?? ((edges: readonly Edge[]) => auditFinalSameSideEndpointOrder(edges, nodes));
  const baselineTrunks = endpointOrder(baselineEdges).legalSharedTrunks;

  return {
    baselineQuality,
    baselineObstacleHits,
    evaluate(candidate: T, changedIndexes: number[]) {
      const quality = reusable?.baselineQualityState
        ? qualityContext.evaluateStateChanged(
            reusable.baselineQualityState,
            candidate,
            changedIndexes,
          ).score
        : qualityContext.evaluateChanged(candidate, changedIndexes);
      const obstacleHits = obstacleContext.evaluateKnownChanges(candidate, changedIndexes);
      const terminalsAnchored = !canValidateTerminals || changedIndexes.every(index => {
        const edge = candidate[index];
        return Boolean(edge && terminalValidation.validateEdge(edge).anchored);
      });
      const trunksPreserved = preservesInitialTrueTrunksWithinClearanceMargin(
        baselineTrunks,
        endpointOrder(candidate).legalSharedTrunks,
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
