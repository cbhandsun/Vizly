import type { Edge, Node } from '@xyflow/react';

import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { scoreNodeClearanceRisk } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { changedEdgesObstacleHitsDoNotRegress, visualPolishHardQualityDoesNotRegress } from './baseReactFlowDisplayEvaluation';
import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { passesBaseReactFlowCommercialFinalDisplayGate, type BaseReactFlowFinalEndpointOrderOptions } from './baseReactFlowDisplayFinalEndpointGate';
import { buildCommercialParallelTerminalCorridorShortcutPaths, buildCommercialSameSideRectangularShortcutPaths } from './baseReactFlowDisplayCommercialTerminalShortcut';
import { MAX_COMMERCIAL_BEND_COUNT } from './baseReactFlowDisplayCommercialQuality';
import {
  buildTerminalPreservingDirectShortcutCandidates,
} from './baseReactFlowDisplayLoopShortcutRepair';
import { buildTerminalPreservingInteriorShortcutCandidates } from './baseReactFlowDisplayInteriorShortcutCandidates';
import { displayPathLength, getDisplayComputedPath, withDisplayComputedPath } from './baseReactFlowDisplayGeometry';

const FINAL_COMMERCIAL_OUTER_STAIR_EVALUATIONS = 16;

const withTerminalPreservingOuterStairPath = (
  edge: Edge,
  path: ReturnType<typeof getDisplayComputedPath>,
): Edge => {
  const changed = withDisplayComputedPath(edge, path);
  if (changed.data?.displayNodeClearanceRepaired !== true) return changed;
  const data = { ...changed.data };
  delete data.displayNodeClearanceRepaired;
  return { ...changed, data };
};

export const rankCommercialInteriorShortcutCandidates = (
  edge: Edge,
  path: ReturnType<typeof getDisplayComputedPath>,
  nodes: Node[],
): ReturnType<typeof getDisplayComputedPath>[] => (
  buildTerminalPreservingInteriorShortcutCandidates(path)
    .map((candidatePath, originalIndex) => {
      const candidateEdge = withTerminalPreservingOuterStairPath(edge, candidatePath);
      return {
        candidatePath,
        clearanceRisk: scoreNodeClearanceRisk(
          candidatePath,
          nodes,
          candidateEdge,
          COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        ),
        length: displayPathLength(candidatePath),
        originalIndex,
      };
    })
    .sort((first, second) => (
      first.clearanceRisk - second.clearanceRisk
      || first.candidatePath.length - second.candidatePath.length
      || first.length - second.length
      || first.originalIndex - second.originalIndex
    ))
    .map(candidate => candidate.candidatePath)
);

export const repairTerminalPreservingOuterStairs = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: BaseReactFlowFinalEndpointEvaluation,
): T => {
  let best = edges;
  let bestReport = evaluation.hardReport(best);
  if (!bestReport.hardClean) return edges;
  let evaluations = 0;
  const rankedEdgeIndexes = edges.map((edge, edgeIndex) => {
    const path = getDisplayComputedPath(edge);
    const first = path[0];
    const last = path.at(-1);
    if (!first || !last || path.length < 4) return null;
    const direct = Math.abs(last.x - first.x) + Math.abs(last.y - first.y);
    const bends = Math.max(0, path.length - 2);
    return {
      bends,
      edgeIndex,
      // Candidate promotion cannot rely on transient shared-trunk intent, so
      // an objectively excessive chain must receive the bounded shortcut
      // budget before merely long but structurally acceptable routes.
      excessiveBends: Math.max(0, bends - MAX_COMMERCIAL_BEND_COUNT),
      excessLength: displayPathLength(path) - direct,
    };
  }).filter((entry): entry is {
    bends: number;
    edgeIndex: number;
    excessiveBends: number;
    excessLength: number;
  } => Boolean(entry))
    .sort((first, second) => (
      second.excessiveBends - first.excessiveBends
      || second.bends - first.bends
      || second.excessLength - first.excessLength
      || first.edgeIndex - second.edgeIndex
    ));

  const pending = rankedEdgeIndexes.filter(({ edgeIndex }) => (
    !options.eligibleEdgeIds || options.eligibleEdgeIds.has(edges[edgeIndex].id)
  )).map(({ edgeIndex }) => ({
    edgeIndex,
    candidates: (function* () {
      const path = getDisplayComputedPath(best[edgeIndex]);
      yield* rankCommercialInteriorShortcutCandidates(
        best[edgeIndex], path, nodes,
      );
      yield* buildTerminalPreservingDirectShortcutCandidates(path);
      yield* buildCommercialParallelTerminalCorridorShortcutPaths(path, nodes, best[edgeIndex]);
      yield* buildCommercialSameSideRectangularShortcutPaths(best[edgeIndex], nodes, best);
    })(),
  }));
  // Give each edge a simple candidate before spending the shared budget on
  // one edge's many obstacle corridors. Keep the same exact evaluation cap.
  while (pending.length > 0) {
    const entry = pending.shift();
    if (!entry) break;
    const { edgeIndex, candidates } = entry;
    const baselinePath = getDisplayComputedPath(best[edgeIndex]);
    const next = candidates.next();
    if (next.done) continue;
    const candidatePath = next.value;
    pending.push(entry);
    const baselineLength = displayPathLength(baselinePath);
    const candidateLength = displayPathLength(candidatePath);
    const reducesBendsAtEqualLength = candidatePath.length < baselinePath.length
      && candidateLength <= baselineLength + 0.5;
    if (candidateLength >= baselineLength - 0.5 && !reducesBendsAtEqualLength) continue;
    const candidate = best.map((edge, index) => (
      index === edgeIndex
        ? withTerminalPreservingOuterStairPath(edge, candidatePath)
        : edge
    )) as T;
    const candidateEdge = candidate[edgeIndex];
    // Reject candidates that cannot pass the existing per-edge clearance gate
    // before spending one of the bounded whole-graph quality evaluations.
    if (scoreNodeClearanceRisk(
      candidatePath, nodes, candidateEdge, COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    ) > scoreNodeClearanceRisk(
      baselinePath, nodes, best[edgeIndex], COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    )) continue;
    if (evaluations >= FINAL_COMMERCIAL_OUTER_STAIR_EVALUATIONS) return best;
    evaluations += 1;
    const candidateReport = evaluation.hardReport(candidate);
    const accepted = !(
      !candidateEdge
      || !candidateReport.hardClean
      || candidateReport.quality.totalLength > bestReport.quality.totalLength + 0.5
      || (
        candidateReport.quality.totalLength >= bestReport.quality.totalLength - 0.5
        && candidateReport.quality.bends >= bestReport.quality.bends
      )
      || candidateReport.quality.detourPenalty > bestReport.quality.detourPenalty
      || evaluation.unsafeEndpointStubs(candidate) > evaluation.unsafeEndpointStubs(best)
      || !changedEdgesObstacleHitsDoNotRegress(best, candidate, [edgeIndex], nodes)
      || !visualPolishHardQualityDoesNotRegress(
        bestReport.quality,
        candidateReport.quality,
      )
      || !passesBaseReactFlowCommercialFinalDisplayGate(
        best,
        candidate,
        [edgeIndex],
        options,
        evaluation,
      )
    );
    if (accepted) {
      best = candidate;
      bestReport = candidateReport;
      pending.pop();
    }
  }
  return best;
};
