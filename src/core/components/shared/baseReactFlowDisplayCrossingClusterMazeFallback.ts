import type { Edge, Node } from '@xyflow/react';
import { MINIMUM_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { createEdgePathQualityEvaluationContext } from '../../strategies/shared/edgeStrictCrossingGuard';
import { createNodeClearanceGraphEvaluationContext } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { compareBeamStates, type BeamState } from './baseReactFlowDisplayCrossingClusterBeam';
import { createDisplayCrossingClusterMazePool } from './baseReactFlowDisplayCrossingClusterMazePool';
import { createDisplayObstacleEvaluationContext } from './baseReactFlowDisplayEvaluation';
import { extractDisplaySegments, getDisplayComputedPath } from './baseReactFlowDisplayGeometry';
import { evaluateDisplayTerminalHardGates } from './baseReactFlowDisplayQualityGates';

/** A separate fallback after terminal bridges fail. At most four alternatives
 * yield fifteen nonempty subsets, each moving no more than four edges. Consume
 * only the caller's remaining quality budget; preserve the proven fast path.
 */
export const repairDisplayCrossingClusterMazeFallback = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  remainingEvaluations: number,
  acceptCandidate?: (candidate: T) => boolean,
): T => {
  if (!Number.isSafeInteger(remainingEvaluations) || remainingEvaluations <= 0) return edges;
  const quality = createEdgePathQualityEvaluationContext(edges);
  const baseline = quality.evaluate(edges);
  if (baseline.strictCrossings === 0) return edges;
  const pool = createDisplayCrossingClusterMazePool(edges, nodes, extractDisplaySegments(edges));
  const clearance = createNodeClearanceGraphEvaluationContext(nodes);
  const alternatives = pool.edgeIndexes.flatMap(index => {
    const edge = pool.get(index);
    if (!edge) return [];
    const priorTerminals = evaluateDisplayTerminalHardGates([edges[index]], nodes);
    const candidateTerminals = evaluateDisplayTerminalHardGates([edge], nodes);
    if ((priorTerminals.terminalsAttached && !candidateTerminals.terminalsAttached)
      || (priorTerminals.terminalsAnchored && !candidateTerminals.terminalsAnchored)) return [];
    const risk = clearance.score(getDisplayComputedPath(edge), edge, MINIMUM_BUSINESS_NODE_CLEARANCE);
    const priorRisk = clearance.score(getDisplayComputedPath(edges[index]), edges[index], MINIMUM_BUSINESS_NODE_CLEARANCE);
    return risk <= priorRisk + 0.5 ? [{ index, edge }] : [];
  });
  const obstacles = createDisplayObstacleEvaluationContext(edges, nodes);
  const baselineHits = obstacles.evaluate(edges);
  let best: BeamState<T> | null = null;
  let evaluations = 0;
  for (let mask = 1; mask < 2 ** alternatives.length && evaluations < remainingEvaluations; mask += 1) {
    const chosen = alternatives.filter((_, index) => (mask & (1 << index)) !== 0);
    const changedIndexes = chosen.map(item => item.index).sort((a, b) => a - b);
    const replacements = new Map(chosen.map(item => [item.index, item.edge]));
    const candidate = edges.map((edge, index) => replacements.get(index) ?? edge) as T;
    evaluations += 1;
    const score = quality.evaluateChanged(candidate, changedIndexes);
    if (
      score.strictCrossings >= baseline.strictCrossings
      || score.nonOrthogonalSegments > baseline.nonOrthogonalSegments
      || score.reverseOverlap > baseline.reverseOverlap
      || score.unrelatedOverlap > baseline.unrelatedOverlap
      || score.unexplainedRelatedOverlap > baseline.unexplainedRelatedOverlap
      || score.shortEndpointStubs > baseline.shortEndpointStubs
      || score.tinyInteriorDoglegs > baseline.tinyInteriorDoglegs
      || score.hairpins > baseline.hairpins
    ) continue;
    const obstacleHits = obstacles.evaluateKnownChanges(candidate, changedIndexes);
    if (obstacleHits > baselineHits) continue;
    if (acceptCandidate && !acceptCandidate(candidate)) continue;
    const state: BeamState<T> = {
      edges: candidate, segments: [], quality: score, obstacleHits, changedIndexes, signature: '',
    };
    if (!best || compareBeamStates(state, best) < 0) best = state;
  }
  return best?.edges ?? edges;
};
