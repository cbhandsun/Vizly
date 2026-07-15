import type { Edge } from '@xyflow/react';

import { compactDisplayEdgePaths } from './baseReactFlowDisplayGeometry';
import { displayObstacleEdgeSignature } from './baseReactFlowDisplayEvaluation';

const displayTransactionEdgeSignature = (edge: Edge): string => (
  `${displayObstacleEdgeSignature(edge)}\u001f${String(edge.sourceHandle ?? '')}\u001f${String(edge.targetHandle ?? '')}`
);

/**
 * Finds the smallest accepted subset of an otherwise useful multi-edge repair.
 * This keeps a crossing fix on one edge from committing an unrelated companion
 * move that introduces a long overlap elsewhere in the graph.
 */
export const chooseSmallestAcceptedDisplayTransaction = <T extends Edge[]>(
  baseline: T,
  candidate: T,
  isAccepted: (transaction: T) => boolean,
  maxEvaluations = 32,
): T | null => {
  if (baseline.length !== candidate.length || maxEvaluations <= 0) return null;
  if (baseline.some((edge, index) => edge.id !== candidate[index]?.id)) return null;
  const changedIndexes = baseline
    .map((edge, index) => (
      displayTransactionEdgeSignature(edge) === displayTransactionEdgeSignature(candidate[index])
        ? -1
        : index
    ))
    .filter(index => index >= 0);
  if (changedIndexes.length < 2) return null;

  let evaluations = 0;
  const evaluateIndexes = (indexes: readonly number[]): T | null => {
    if (evaluations >= maxEvaluations) return null;
    evaluations += 1;
    const indexSet = new Set(indexes);
    const transaction = compactDisplayEdgePaths(baseline.map((edge, index) => (
      indexSet.has(index) ? candidate[index] : edge
    )) as T);
    return isAccepted(transaction) ? transaction : null;
  };

  for (const index of changedIndexes) {
    const accepted = evaluateIndexes([index]);
    if (accepted) return accepted;
  }
  for (let first = 0; first < changedIndexes.length; first += 1) {
    for (let second = first + 1; second < changedIndexes.length; second += 1) {
      const accepted = evaluateIndexes([changedIndexes[first], changedIndexes[second]]);
      if (accepted) return accepted;
      if (evaluations >= maxEvaluations) return null;
    }
  }
  return null;
};
