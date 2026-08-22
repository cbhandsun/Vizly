import type { Edge, Node } from '@xyflow/react';

import {
  countRenderUnsafeEndpointStubs,
  MIN_RENDER_SAFE_ENDPOINT_STUB,
} from './baseReactFlowDisplayEndpointStubRepair';
import {
  countDisplayObstacleHits,
} from './baseReactFlowDisplayEvaluation';
import {
  displayPathLength,
  getDisplayComputedPath,
  withDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';
import { buildWholePathOuterLaneCandidates } from './baseReactFlowDisplayObstacleCandidates';
import { createDisplayObstacleHitContext } from './baseReactFlowDisplayObstacleHitCache';
import {
  displayRenderedHardQualityGatesAreClean,
  getDisplayHardQualityGateReport,
} from './baseReactFlowDisplayQualityGates';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';

const MAX_EMERGENCY_EDGES = 8;
const MAX_EMERGENCY_CANDIDATES_PER_EDGE = 32;

const supportsOuterLaneTerminalStubs = (
  baseline: ReturnType<typeof getDisplayComputedPath>,
  candidate: ReturnType<typeof getDisplayComputedPath>,
): boolean => {
  if (baseline.length < 2 || candidate.length < 4) return false;
  const start = baseline[0];
  const sourceNext = baseline[1];
  const targetPrevious = baseline.at(-2)!;
  const end = baseline.at(-1)!;
  const sourceVertical = Math.abs(sourceNext.x - start.x) <= 0.5;
  const targetVertical = Math.abs(end.x - targetPrevious.x) <= 0.5;
  if (sourceVertical && targetVertical) {
    return Math.abs(candidate[1].y - start.y) <= 0.5
      && Math.abs(candidate[1].x - start.x) > 0.5;
  }
  const sourceHorizontal = Math.abs(sourceNext.y - start.y) <= 0.5;
  const targetHorizontal = Math.abs(end.y - targetPrevious.y) <= 0.5;
  return sourceHorizontal
    && targetHorizontal
    && Math.abs(candidate[1].x - start.x) <= 0.5
    && Math.abs(candidate[1].y - start.y) > 0.5;
};

const preserveOuterLaneTerminalStubs = (
  baseline: ReturnType<typeof getDisplayComputedPath>,
  candidate: ReturnType<typeof getDisplayComputedPath>,
): ReturnType<typeof getDisplayComputedPath> => {
  if (baseline.length < 2 || candidate.length < 4) return candidate;
  const start = baseline[0];
  const sourceNext = baseline[1];
  const targetPrevious = baseline.at(-2)!;
  const end = baseline.at(-1)!;
  const sourceVertical = Math.abs(sourceNext.x - start.x) <= 0.5;
  const targetVertical = Math.abs(end.x - targetPrevious.x) <= 0.5;
  if (sourceVertical && targetVertical) {
    const sourceDirection = Math.sign(sourceNext.y - start.y);
    const targetDirection = Math.sign(end.y - targetPrevious.y);
    if (sourceDirection === 0 || targetDirection === 0) return candidate;
    const laneX = candidate[1].x;
    const sourceStub = { x: start.x, y: start.y + sourceDirection * MIN_RENDER_SAFE_ENDPOINT_STUB };
    const targetStub = { x: end.x, y: end.y - targetDirection * MIN_RENDER_SAFE_ENDPOINT_STUB };
    return compactOrthogonalPath([
      start,
      sourceStub,
      { x: laneX, y: sourceStub.y },
      { x: laneX, y: targetStub.y },
      targetStub,
      end,
    ]);
  }
  const sourceHorizontal = Math.abs(sourceNext.y - start.y) <= 0.5;
  const targetHorizontal = Math.abs(end.y - targetPrevious.y) <= 0.5;
  if (!sourceHorizontal || !targetHorizontal) return candidate;
  const sourceDirection = Math.sign(sourceNext.x - start.x);
  const targetDirection = Math.sign(end.x - targetPrevious.x);
  if (sourceDirection === 0 || targetDirection === 0) return candidate;
  const laneY = candidate[1].y;
  const sourceStub = { x: start.x + sourceDirection * MIN_RENDER_SAFE_ENDPOINT_STUB, y: start.y };
  const targetStub = { x: end.x - targetDirection * MIN_RENDER_SAFE_ENDPOINT_STUB, y: end.y };
  return compactOrthogonalPath([
    start,
    sourceStub,
    { x: sourceStub.x, y: laneY },
    { x: targetStub.x, y: laneY },
    targetStub,
    end,
  ]);
};

/**
 * Builds a bounded last-resort outer-lane candidate for a rendered route that
 * still intersects a business node. The caller must pass the result through
 * the final hard closure and must never commit this intermediate candidate.
 */
export const buildBaseReactFlowEmergencyObstacleCandidate = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
): T => {
  if (edges.length === 0 || nodes.length === 0 || countDisplayObstacleHits(edges, nodes) === 0) {
    return edges;
  }
  const hitContext = createDisplayObstacleHitContext(nodes);
  let bestCandidate = edges;
  let bestObstacleHits = countDisplayObstacleHits(edges, nodes);
  const affected = edges.flatMap((edge, edgeIndex) => {
    const path = getDisplayComputedPath(edge);
    const hits = path.length >= 2 ? hitContext.countRouting(path, edge) : 0;
    return hits > 0 ? [{ edge, edgeIndex, hits, path }] : [];
  }).sort((first, second) => second.hits - first.hits).slice(0, MAX_EMERGENCY_EDGES);

  for (const { edge, edgeIndex, path } of affected) {
    const candidates = buildWholePathOuterLaneCandidates(path, nodes, edge, true)
      .filter(candidate => supportsOuterLaneTerminalStubs(path, candidate))
      .sort((first, second) => displayPathLength(first) - displayPathLength(second))
      .slice(0, MAX_EMERGENCY_CANDIDATES_PER_EDGE);
    for (const rawCandidatePath of candidates) {
      const candidatePath = preserveOuterLaneTerminalStubs(path, rawCandidatePath);
      const candidate = edges.map((candidateEdge, candidateIndex) => (
        candidateIndex === edgeIndex
          ? withDisplayComputedPath(candidateEdge, candidatePath)
          : candidateEdge
      )) as T;
      if (
        displayRenderedHardQualityGatesAreClean(candidate, nodes)
        && countRenderUnsafeEndpointStubs(candidate) === 0
      ) {
        return candidate;
      }
      const candidateObstacleHits = getDisplayHardQualityGateReport(
        candidate,
        nodes,
        'polished',
      ).obstacleHits;
      if (candidateObstacleHits < bestObstacleHits) {
        bestCandidate = candidate;
        bestObstacleHits = candidateObstacleHits;
      }
    }
  }
  return bestCandidate;
};
