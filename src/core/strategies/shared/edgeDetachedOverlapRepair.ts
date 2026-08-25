import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  calculateEdgePathQualityScore,
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from './edgeStrictCrossingGuard';

import {
  createQualityEvaluationBudget,
  type QualityEvaluationBudget,
} from './edgeDetachedOverlapEvaluationCache';

import { buildDetachedOuterBypassCandidates } from './edgeDetachedOuterBypass';
import { createRoutingObstacleGate } from './edgeDetachedObstacleGate';
import {
  createDetachedOverlapStateEvaluationContext,
  scoreDetachedOverlapState,
  type DetachedOverlapStateEvaluationContext,
} from './edgeDetachedOverlapStateEvaluation';
import type {
  DetachedParallelOverlapRepairOptions,
  RoutingObstacleGate,
} from './edgeDetachedOverlapRepairTypes';

import {
  type Point,
  type PathSegmentRef,
  getEdgePath,
  withComputedPath,
  allSegmentsOrthogonal,
  compactPath,
  pathEquals,
  nodeRect,
  getRoutingObstacles,
  extractPathSegmentRefs,
  sharesAnyEndpoint,
  segmentsRunOppositeDirections,
  isOppositeEndpointOverlap,
  extractPathSegmentRefsForPath,
  createStrictCrossingSegmentIndex,
  strictCrossingsForEdgeSegments,
  findDetachedParallelOverlaps,
  scoreActionableDetachedOverlaps,
  shiftInternalSegment,
  bypassParallelOverlap,
  bypassAdjacentLegsAroundOverlap,
  buildAdjacentLaneEscapeCandidates,
  trimSegmentEndpointOverlap,
  endpointBypassCoordinates,
  endpointReadableStubCoordinates,
  bypassEndpointParallelOverlapAtCoordinate,
  bypassEndpointParallelOverlap,
  buildTerminalSegmentParallelLaneCandidates,
  buildTerminalApproachBypassCandidates,
  buildTerminalEndpointSlideShortcutCandidates,
  slideEndpointAlongSide,
} from './edgeDetachedOverlapCandidates';

export * from './edgeDetachedOverlapCandidates';
export {
  createDetachedOverlapStateEvaluationContext,
  scoreDetachedOverlapState,
};
export type { DetachedOverlapStateEvaluationContext };
export type {
  DetachedParallelOverlapRepairOptions,
  StrictCrossingMazeContext,
  StrictCrossingMazeDiagnostics,
  StrictCrossingMazeResultReason,
} from './edgeDetachedOverlapRepairTypes';

function shiftEndpointSegment(
  path: Point[],
  edge: Edge,
  segment: PathSegmentRef,
  nodeById: Map<string, ReactFlowNode>,
  delta: number,
): Point[] | null {
  if (path.length < 2) return null;
  const lastSegmentIndex = path.length - 2;
  if (segment.segIdx !== 0 && segment.segIdx !== lastSegmentIndex) return null;

  const sourceRect = nodeRect(nodeById.get(edge.source));
  const targetRect = nodeRect(nodeById.get(edge.target));
  const shifted = path.map(point => ({ ...point }));

  if (path.length === 2) {
    const start = slideEndpointAlongSide(path[0], sourceRect, segment.axis, delta);
    const end = slideEndpointAlongSide(path[1], targetRect, segment.axis, delta);
    if (!start || !end) return null;
    shifted[0] = start;
    shifted[1] = end;
  } else if (segment.segIdx === 0) {
    const start = slideEndpointAlongSide(path[0], sourceRect, segment.axis, delta);
    if (!start) return null;
    shifted[0] = start;
    if (segment.axis === 'v') shifted[1].x += delta;
    else shifted[1].y += delta;
  } else {
    const end = slideEndpointAlongSide(path[path.length - 1], targetRect, segment.axis, delta);
    if (!end) return null;
    shifted[path.length - 1] = end;
    if (segment.axis === 'v') shifted[path.length - 2].x += delta;
    else shifted[path.length - 2].y += delta;
  }

  const compacted = compactPath(shifted);
  return allSegmentsOrthogonal(compacted) ? compacted : null;
}

export function edgesWithPaths(
  edges: Edge[],
  paths: Point[][],
  changedIndexes?: readonly number[],
): Edge[] {
  if (!changedIndexes) {
    return edges.map((edge, index) => ({
      ...edge,
      data: {
        ...(edge.data || {}),
        computedPath: paths[index],
      },
    }));
  }
  const result = edges.slice();
  for (const index of new Set(changedIndexes)) {
    const edge = edges[index];
    if (!edge || !paths[index]) continue;
    result[index] = {
      ...edge,
      data: {
        ...(edge.data || {}),
        computedPath: paths[index],
      },
    };
  }
  return result;
}

export function compareQualityScores(first: EdgePathQualityScore, second: EdgePathQualityScore): number {
  const keys: Array<keyof EdgePathQualityScore> = [
    'nonOrthogonalSegments',
    'strictCrossings',
    'reverseOverlap',
    'unrelatedOverlap',
    'unexplainedRelatedOverlap',
    'shortEndpointStubs',
    'tinyInteriorDoglegs',
    'hairpins',
    'backtrackPenalty',
    'detourPenalty',
    'bends',
    'totalLength',
  ];
  for (const key of keys) {
    const delta = first[key] - second[key];
    if (delta !== 0) return delta;
  }
  return 0;
}

function improvesQualityWithoutAddingLocalNoise(
  candidate: EdgePathQualityScore,
  baseline: EdgePathQualityScore,
): boolean {
  return compareQualityScores(candidate, baseline) < 0
    && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
    && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
    && candidate.hairpins <= baseline.hairpins;
}

function hardQualityDoesNotRegress(
  candidate: EdgePathQualityScore,
  baseline: EdgePathQualityScore,
): boolean {
  return candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
    && candidate.strictCrossings <= baseline.strictCrossings
    && candidate.reverseOverlap <= baseline.reverseOverlap
    && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
    && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
    && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
    && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
    && candidate.hairpins <= baseline.hairpins;
}

function cloneCandidatePath(path: Point[]): Point[] {
  return path.map(point => ({ ...point }));
}

export { routeStrictCrossingMazeCandidate } from './edgeDetachedStrictCrossingMaze';

export function pathManhattanLength(path: Point[]): number {
  let length = 0;
  for (let index = 1; index < path.length; index += 1) {
    length += Math.abs(path[index].x - path[index - 1].x) + Math.abs(path[index].y - path[index - 1].y);
  }
  return length;
}

export function hasShortHairpin(path: Point[]): boolean {
  const segments = extractPathSegmentRefsForPath(path, 0, []);
  for (let index = 0; index + 2 < segments.length; index += 1) {
    const first = segments[index];
    const middle = segments[index + 1];
    const last = segments[index + 2];
    if (first.axis !== last.axis || first.axis === middle.axis) continue;
    const firstDirection = first.axis === 'h' ? Math.sign(first.b.x - first.a.x) : Math.sign(first.b.y - first.a.y);
    const lastDirection = last.axis === 'h' ? Math.sign(last.b.x - last.a.x) : Math.sign(last.b.y - last.a.y);
    const middleLength = Math.abs(middle.b.x - middle.a.x) + Math.abs(middle.b.y - middle.a.y);
    if (firstDirection !== 0 && firstDirection === -lastDirection && middleLength <= 96) return true;
  }
  return false;
}

export { createRoutingObstacleGate } from './edgeDetachedObstacleGate';

const toBoundedPositiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

export function separateDetachedParallelOverlaps(
  edges: Edge[],
  nodes: ReactFlowNode[],
  minOverlap = 96,
  options: DetachedParallelOverlapRepairOptions = {},
): Edge[] {
  const maxIterations = toBoundedPositiveInteger(options.maxIterations, 4);
  const maxHitBudget = toBoundedPositiveInteger(options.maxHitBudget, minOverlap <= 24 ? 4 : 16);
  const maxQualityEvaluations = toBoundedPositiveInteger(options.maxQualityEvaluations, Number.POSITIVE_INFINITY);
  const maxResidualPasses = toBoundedPositiveInteger(options.maxResidualPasses, 4);
  const qualityOnly = options.qualityOnly === true;
  const enableActionableSubthresholdRepair = minOverlap <= 24 && edges.length <= 8;
  const qualityBudget = createQualityEvaluationBudget(
    maxQualityEvaluations,
    options.diagnostics,
  );

  const initialQuality = qualityBudget.evaluate(edges);
  if (!initialQuality) return edges;
  const initialPaths = edges.map(edge => compactPath(getEdgePath(edge)));
  let paths = initialPaths;
  if (paths.filter(path => path.length >= 2).length < 2) return edges;
  if (
    initialQuality.reverseOverlap === 0
    && initialQuality.unrelatedOverlap === 0
    && initialQuality.unexplainedRelatedOverlap === 0
  ) {
    const actionableOverlapScore = enableActionableSubthresholdRepair
      ? scoreActionableDetachedOverlaps(paths, edges, minOverlap)
      : 0;
    const hasLongRelatedDetachedOverlap = edges.length <= 24
      && minOverlap >= 24
      && findDetachedParallelOverlaps(paths, edges, minOverlap)
        .some(hit => sharesAnyEndpoint(hit.a, hit.b, edges) && hit.overlap >= Math.max(96, minOverlap * 4));
    if (actionableOverlapScore === 0 && !hasLongRelatedDetachedOverlap) return edges;
  }

  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const routingObstacleGate = createRoutingObstacleGate(
    edges,
    getRoutingObstacles(nodes),
    options.diagnostics,
  );

  let changed = false;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const hits = findDetachedParallelOverlaps(paths, edges, minOverlap);
    if (hits.length === 0) break;
    let detachedScoreContext: DetachedOverlapStateEvaluationContext | null = null;
    const getDetachedScoreContext = (): DetachedOverlapStateEvaluationContext => {
      if (!detachedScoreContext) {
        detachedScoreContext = createDetachedOverlapStateEvaluationContext(paths, edges, nodes);
      }
      return detachedScoreContext;
    };

    let currentScore = 0;
    let hasCurrentScore = false;
    const getCurrentScore = () => {
      if (!hasCurrentScore) {
        currentScore = getDetachedScoreContext().evaluate(paths);
        hasCurrentScore = true;
      }
      return currentScore;
    };
    if (qualityBudget.exhausted()) break;
    const currentEdges = edgesWithPaths(edges, paths);
    const qualityEvaluationContext = createEdgePathQualityEvaluationContext(currentEdges);
    const currentQualityScore = qualityBudget.evaluate(currentEdges);
    if (!currentQualityScore) break;
    const currentActionableOverlapScore = enableActionableSubthresholdRepair
      ? scoreActionableDetachedOverlaps(paths, edges, minOverlap)
      : 0;
    const currentSegments = extractPathSegmentRefs(paths, edges);
    const strictCrossingSegmentIndex = createStrictCrossingSegmentIndex(currentSegments);
    let bestScore: number | null = null;
    const getBestScore = () => {
      if (bestScore === null) bestScore = getCurrentScore();
      return bestScore;
    };
    let bestQualityScore = currentQualityScore;
    let bestActionableOverlapScore = currentActionableOverlapScore;
    let bestPaths: Point[][] | null = null;
    const hitBudget = maxHitBudget;
    const narrowDeltas = minOverlap <= 24
      ? [-96, -64, -48, -32, 32, 48, 64, 96]
      : [-160, -128, -96, -64, -48, -32, 32, 48, 64, 96, 128, 160];
    const wideDeltas = [-160, -128, -96, -64, -48, -32, 32, 48, 64, 96, 128, 160];

    for (const hit of hits.slice(0, hitBudget)) {
      if (qualityBudget.exhausted()) break;
      const unrelated = !sharesAnyEndpoint(hit.a, hit.b, edges);
      const narrowSmallOverlapSearch = minOverlap <= 24 && hit.overlap < 96;
      const allowDetachedEndpointLaneShift = segmentsRunOppositeDirections(hit.a, hit.b)
        || hit.overlap >= (unrelated ? minOverlap : Math.max(24, minOverlap));
      const oppositeEndpointOverlap = isOppositeEndpointOverlap(hit, edges);
      const oppositeDirectionOverlap = segmentsRunOppositeDirections(hit.a, hit.b);
      const bothSegmentsNearEndpoint = (
        (hit.a.fromStart <= 32 || hit.a.fromEnd <= 32)
        && (hit.b.fromStart <= 32 || hit.b.fromEnd <= 32)
      );
      const allowEndpointLaneShift = oppositeEndpointOverlap
        || !unrelated
        || allowDetachedEndpointLaneShift;
      if (
        allowEndpointLaneShift
        && (!narrowSmallOverlapSearch || oppositeEndpointOverlap || (oppositeDirectionOverlap && bothSegmentsNearEndpoint))
      ) {
        const pairClearances = narrowSmallOverlapSearch ? [Math.max(2, Math.floor(minOverlap / 2)), Math.max(2, minOverlap - 1), 16, 24, 32] : [16, 24, 32, 48, 64, 96, 128];
        const useReadableOpposedTerminalLanes = oppositeDirectionOverlap && bothSegmentsNearEndpoint;
        const firstCoordinates = [...new Set([
          ...(useReadableOpposedTerminalLanes
            ? endpointReadableStubCoordinates(paths[hit.a.edgeIndex], hit.a)
            : []),
          ...pairClearances.flatMap(clearance => endpointBypassCoordinates(hit.a, hit.b, clearance)),
        ])].slice(0, narrowSmallOverlapSearch ? 4 : 18);
        const secondCoordinates = [...new Set([
          ...(useReadableOpposedTerminalLanes
            ? endpointReadableStubCoordinates(paths[hit.b.edgeIndex], hit.b)
            : []),
          ...pairClearances.flatMap(clearance => endpointBypassCoordinates(hit.b, hit.a, clearance)),
        ])].slice(0, narrowSmallOverlapSearch ? 4 : 18);
        const firstBypasses = firstCoordinates
          .map(coordinate => bypassEndpointParallelOverlapAtCoordinate(
            paths[hit.a.edgeIndex],
            hit.a,
            coordinate,
          ))
          .filter((candidate): candidate is Point[] => candidate !== null);
        const secondBypasses = secondCoordinates
          .map(coordinate => bypassEndpointParallelOverlapAtCoordinate(
            paths[hit.b.edgeIndex],
            hit.b,
            coordinate,
          ))
          .filter((candidate): candidate is Point[] => candidate !== null);
        const changedIndexes = [hit.a.edgeIndex, hit.b.edgeIndex];
        for (const firstBypass of firstBypasses) {
          if (qualityBudget.exhausted()) break;
          for (const secondBypass of secondBypasses) {
            if (qualityBudget.exhausted()) break;
            const candidatePaths = paths.slice();
            candidatePaths[hit.a.edgeIndex] = firstBypass;
            candidatePaths[hit.b.edgeIndex] = secondBypass;
            if (!routingObstacleGate(paths, candidatePaths, changedIndexes)) continue;
            const candidateEdges = edgesWithPaths(currentEdges, candidatePaths, changedIndexes);
            const candidateQualityScore = qualityBudget.evaluateChanged(
              candidateEdges,
              qualityEvaluationContext,
              changedIndexes,
            );
            if (!candidateQualityScore) break;
            if (candidateQualityScore.strictCrossings > currentQualityScore.strictCrossings) continue;
            if (narrowSmallOverlapSearch) {
              if (enableActionableSubthresholdRepair) {
                const candidateActionableOverlapScore = scoreActionableDetachedOverlaps(
                  candidatePaths,
                  edges,
                  minOverlap,
                );
                if (
                  hardQualityDoesNotRegress(candidateQualityScore, currentQualityScore)
                  && (
                    candidateActionableOverlapScore < bestActionableOverlapScore
                    || (
                      candidateActionableOverlapScore === bestActionableOverlapScore
                      && improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
                    )
                  )
                ) {
                  bestQualityScore = candidateQualityScore;
                  bestActionableOverlapScore = candidateActionableOverlapScore;
                  bestPaths = candidatePaths;
                }
              } else if (
                candidateQualityScore.reverseOverlap < bestQualityScore.reverseOverlap
                || candidateQualityScore.unrelatedOverlap < bestQualityScore.unrelatedOverlap
                || candidateQualityScore.unexplainedRelatedOverlap < bestQualityScore.unexplainedRelatedOverlap
                || improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
              ) {
                bestQualityScore = candidateQualityScore;
                bestPaths = candidatePaths;
              }
              continue;
            }
            if (qualityOnly) {
              if (
                compareQualityScores(candidateQualityScore, bestQualityScore) < 0
                || improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
              ) {
                bestQualityScore = candidateQualityScore;
                bestPaths = candidatePaths;
              }
              continue;
            }
            const currentBestScore = getBestScore();
            const candidateScore = getDetachedScoreContext().evaluateChanged(candidatePaths, changedIndexes);
            if (
              candidateScore < currentBestScore - 25
              || improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
            ) {
              bestScore = candidateScore;
              bestQualityScore = candidateQualityScore;
              bestPaths = candidatePaths;
            }
          }
        }
      }
      for (const segment of [hit.a, hit.b]) {
        if (qualityBudget.exhausted()) break;
        const activeDeltas = narrowSmallOverlapSearch ? narrowDeltas : wideDeltas;
        const edge = edges[segment.edgeIndex];
        const otherSegment = segment === hit.a ? hit.b : hit.a;
        const otherEdge = edges[otherSegment.edgeIndex];
        const protectedSharedTrunk = edge?.data?.sharedTrunkSynthesized === true
          && otherEdge?.data?.sharedTrunkSynthesized !== true
          && sharesAnyEndpoint(segment, otherSegment, edges)
          && !segmentsRunOppositeDirections(segment, otherSegment);
        if (protectedSharedTrunk) continue;
        const currentEdgeSegments = currentSegments.filter(item => item.edgeIndex === segment.edgeIndex);
        const currentEdgeCrossings = strictCrossingsForEdgeSegments(
          currentEdgeSegments,
          currentSegments,
          segment.edgeIndex,
          strictCrossingSegmentIndex,
        );
        const endpointBypassByClearance = new Map<number, Point[] | null>();
        const terminalLaneCandidatesByClearance = new Map<number, Point[][]>();
        for (const delta of activeDeltas) {
          if (qualityBudget.exhausted()) break;
          const includeDeltaIndependentCandidates = delta === activeDeltas[0];
          const endpointClearance = Math.max(16, Math.abs(delta));
          let endpointBypass: Point[] | null = null;
          let terminalLaneCandidates: Point[][] = [];
          if (allowEndpointLaneShift) {
            if (!endpointBypassByClearance.has(endpointClearance)) {
              endpointBypassByClearance.set(
                endpointClearance,
                bypassEndpointParallelOverlap(
                  paths[segment.edgeIndex],
                  segment,
                  otherSegment,
                  endpointClearance,
                ),
              );
            }
            endpointBypass = endpointBypassByClearance.get(endpointClearance) ?? null;
            const terminalLaneClearance = Math.max(32, Math.abs(delta));
            terminalLaneCandidates = terminalLaneCandidatesByClearance.get(terminalLaneClearance) ?? [];
            if (!terminalLaneCandidatesByClearance.has(terminalLaneClearance)) {
              terminalLaneCandidates = buildTerminalSegmentParallelLaneCandidates(
                paths[segment.edgeIndex],
                segment,
                otherSegment,
                terminalLaneClearance,
              );
              terminalLaneCandidatesByClearance.set(terminalLaneClearance, terminalLaneCandidates);
            }
          }
          const candidatePathsForSegment = [
            shiftInternalSegment(paths[segment.edgeIndex], segment, delta),
            allowEndpointLaneShift && edge
              ? shiftEndpointSegment(paths[segment.edgeIndex], edge, segment, nodeById, delta)
              : null,
            endpointBypass ? cloneCandidatePath(endpointBypass) : null,
            bypassParallelOverlap(paths[segment.edgeIndex], segment, otherSegment, delta),
            bypassAdjacentLegsAroundOverlap(paths[segment.edgeIndex], segment, otherSegment, delta),
            ...terminalLaneCandidates.map(cloneCandidatePath),
            ...(allowEndpointLaneShift && includeDeltaIndependentCandidates && enableActionableSubthresholdRepair
              ? buildTerminalApproachBypassCandidates(
                paths[segment.edgeIndex],
                segment,
                paths[otherSegment.edgeIndex],
                otherSegment,
                minOverlap,
              )
              : []),
            ...(allowEndpointLaneShift && includeDeltaIndependentCandidates
              ? buildTerminalEndpointSlideShortcutCandidates(paths[segment.edgeIndex], segment)
              : []),
            ...(includeDeltaIndependentCandidates
              ? buildAdjacentLaneEscapeCandidates(paths[segment.edgeIndex], segment, otherSegment)
              : []),
          ].filter((candidate): candidate is Point[] => candidate !== null);

          for (const candidatePath of candidatePathsForSegment) {
            if (qualityBudget.exhausted()) break;
            const candidateEdgeCrossings = strictCrossingsForEdgeSegments(
              extractPathSegmentRefsForPath(candidatePath, segment.edgeIndex, edges),
              currentSegments,
              segment.edgeIndex,
              strictCrossingSegmentIndex,
            );
            if (candidateEdgeCrossings > currentEdgeCrossings) continue;
            const candidatePaths = paths.map((path, index) => (
              index === segment.edgeIndex ? candidatePath : path
            ));
            if (!routingObstacleGate(paths, candidatePaths, [segment.edgeIndex])) continue;
            const candidateEdges = edgesWithPaths(currentEdges, candidatePaths, [segment.edgeIndex]);
            const candidateQualityScore = qualityBudget.evaluateChanged(
              candidateEdges,
              qualityEvaluationContext,
              [segment.edgeIndex],
            );
            if (!candidateQualityScore) break;
            if (narrowSmallOverlapSearch) {
              if (enableActionableSubthresholdRepair) {
                const candidateActionableOverlapScore = scoreActionableDetachedOverlaps(
                  candidatePaths,
                  edges,
                  minOverlap,
                );
                if (
                  hardQualityDoesNotRegress(candidateQualityScore, currentQualityScore)
                  && (
                    candidateActionableOverlapScore < bestActionableOverlapScore
                    || (
                      candidateActionableOverlapScore === bestActionableOverlapScore
                      && improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
                    )
                  )
                ) {
                  bestQualityScore = candidateQualityScore;
                  bestActionableOverlapScore = candidateActionableOverlapScore;
                  bestPaths = candidatePaths;
                }
              } else if (
                candidateQualityScore.reverseOverlap < bestQualityScore.reverseOverlap
                || candidateQualityScore.unrelatedOverlap < bestQualityScore.unrelatedOverlap
                || candidateQualityScore.unexplainedRelatedOverlap < bestQualityScore.unexplainedRelatedOverlap
                || improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
              ) {
                bestQualityScore = candidateQualityScore;
                bestPaths = candidatePaths;
              }
              continue;
            }
            if (qualityOnly) {
              if (
                compareQualityScores(candidateQualityScore, bestQualityScore) < 0
                || improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
              ) {
                bestQualityScore = candidateQualityScore;
                bestPaths = candidatePaths;
              }
              continue;
            }
            const currentBestScore = getBestScore();
            const candidateScore = getDetachedScoreContext().evaluateChanged(candidatePaths, [segment.edgeIndex]);
            if (
              candidateScore < currentBestScore - 25
              || improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
            ) {
              bestScore = candidateScore;
              bestQualityScore = candidateQualityScore;
              bestPaths = candidatePaths;
            }
          }
        }
      }
    }

    if (!bestPaths) break;
    paths = bestPaths;
    changed = true;
  }

  for (let pass = 0; pass < 4; pass += 1) {
    if (pass >= maxResidualPasses) break;
    if (qualityBudget.exhausted()) break;
    const repaired = repairResidualReverseOrUnrelatedOverlap(
      paths,
      edges,
      nodes,
      minOverlap,
      enableActionableSubthresholdRepair,
      qualityBudget,
      routingObstacleGate,
    );
    if (!repaired) break;
    paths = repaired;
    changed = true;
  }

  if (!changed) return edges;
  const changedIndexes = paths.flatMap((path, edgeIndex) => (
    pathEquals(path, initialPaths[edgeIndex] ?? []) ? [] : [edgeIndex]
  ));
  if (changedIndexes.length === 0) return edges;
  const finalEdges = edgesWithPaths(edges, paths, changedIndexes);
  const finalQuality = calculateEdgePathQualityScore(finalEdges);
  if (
    !hardQualityDoesNotRegress(finalQuality, initialQuality)
    || !routingObstacleGate(initialPaths, paths, changedIndexes)
  ) return edges;
  return edges.map((edge, index) => {
    const path = paths[index];
    const original = compactPath(getEdgePath(edge));
    return path.length < 2 || pathEquals(path, original) ? edge : withComputedPath(edge, path);
  });
}

function repairResidualReverseOrUnrelatedOverlap(
  paths: Point[][],
  edges: Edge[],
  nodes: ReactFlowNode[],
  minOverlap: number,
  useActionableOverlapScore: boolean,
  qualityBudget: QualityEvaluationBudget,
  routingObstacleGate: RoutingObstacleGate,
): Point[][] | null {
  const currentEdges = edgesWithPaths(edges, paths);
  const qualityEvaluationContext = createEdgePathQualityEvaluationContext(currentEdges);
  const currentQuality = qualityBudget.evaluate(currentEdges);
  if (!currentQuality) return null;
  const hits = findDetachedParallelOverlaps(paths, edges, minOverlap)
    .filter(hit => segmentsRunOppositeDirections(hit.a, hit.b) || !sharesAnyEndpoint(hit.a, hit.b, edges));
  if (hits.length === 0) return null;

  const currentSegments = extractPathSegmentRefs(paths, edges);
  const strictCrossingSegmentIndex = createStrictCrossingSegmentIndex(currentSegments);
  let bestQuality = currentQuality;
  let bestActionableOverlapScore = useActionableOverlapScore
    ? scoreActionableDetachedOverlaps(paths, edges, minOverlap)
    : 0;
  let bestPaths: Point[][] | null = null;
  const deltas = [-224, 224, -160, 160, -128, 128, -96, 96, -64, 64, -48, 48, -32, 32];

  for (const hit of hits.slice(0, 8)) {
    if (qualityBudget.exhausted()) break;
    const segments = [hit.a, hit.b].sort((first, second) => first.fromStart + first.fromEnd - second.fromStart - second.fromEnd);
    for (const segment of segments) {
      if (qualityBudget.exhausted()) break;
      const other = segment === hit.a ? hit.b : hit.a;
      const edgePath = paths[segment.edgeIndex];
      const fixedTrimCandidate = trimSegmentEndpointOverlap(edgePath, segment, other);
      const fixedEndpointBypassCandidate = bypassEndpointParallelOverlap(
        edgePath,
        segment,
        other,
        Math.max(32, minOverlap + 1),
      );
      const fixedEndpointSlideCandidates = buildTerminalEndpointSlideShortcutCandidates(edgePath, segment);
      const fixedAdjacentLaneCandidates = buildAdjacentLaneEscapeCandidates(edgePath, segment, other);
      const includeAxisPreservingEnvelope = hit.overlap >= Math.max(96, minOverlap * 4)
        && (
          segmentsRunOppositeDirections(segment, other)
          || !sharesAnyEndpoint(segment, other, edges)
        );
      const fixedOuterCandidates = buildDetachedOuterBypassCandidates(
        edgePath,
        edges[segment.edgeIndex],
        nodes,
        { includeAxisPreservingEnvelope },
      );
      const terminalLaneCandidatesByClearance = new Map<number, Point[][]>();
      const currentEdgeSegments = currentSegments.filter(item => item.edgeIndex === segment.edgeIndex);
      const currentEdgeCrossings = strictCrossingsForEdgeSegments(
        currentEdgeSegments,
        currentSegments,
        segment.edgeIndex,
        strictCrossingSegmentIndex,
      );
      for (const delta of deltas) {
        if (qualityBudget.exhausted()) break;
        const includeDeltaIndependentCandidates = delta === deltas[0];
        const terminalLaneClearance = Math.max(32, Math.abs(delta));
        let terminalLaneCandidates = terminalLaneCandidatesByClearance.get(terminalLaneClearance);
        if (!terminalLaneCandidates) {
          terminalLaneCandidates = buildTerminalSegmentParallelLaneCandidates(
            edgePath,
            segment,
            other,
            terminalLaneClearance,
          );
          terminalLaneCandidatesByClearance.set(terminalLaneClearance, terminalLaneCandidates);
        }
        const candidatePathsForSegment = [
          ...(includeDeltaIndependentCandidates ? fixedOuterCandidates.map(cloneCandidatePath) : []),
          ...fixedAdjacentLaneCandidates.map(cloneCandidatePath),
          shiftInternalSegment(edgePath, segment, delta),
          fixedTrimCandidate ? cloneCandidatePath(fixedTrimCandidate) : null,
          fixedEndpointBypassCandidate ? cloneCandidatePath(fixedEndpointBypassCandidate) : null,
          bypassAdjacentLegsAroundOverlap(edgePath, segment, other, delta, Math.max(32, minOverlap + 1)),
          ...terminalLaneCandidates.map(cloneCandidatePath),
          ...fixedEndpointSlideCandidates.map(cloneCandidatePath),
        ].filter((candidate): candidate is Point[] => candidate !== null);

        for (const candidatePath of candidatePathsForSegment) {
          if (qualityBudget.exhausted()) break;
          const candidateSegments = extractPathSegmentRefsForPath(candidatePath, segment.edgeIndex, edges);
          if (strictCrossingsForEdgeSegments(
            candidateSegments,
            currentSegments,
            segment.edgeIndex,
            strictCrossingSegmentIndex,
          ) > currentEdgeCrossings) continue;

          const candidatePaths = paths.map((path, index) => (index === segment.edgeIndex ? candidatePath : path));
          if (!routingObstacleGate(paths, candidatePaths, [segment.edgeIndex])) continue;
          const candidateEdges = edgesWithPaths(currentEdges, candidatePaths, [segment.edgeIndex]);
          const candidateQuality = qualityBudget.evaluateChanged(
            candidateEdges,
            qualityEvaluationContext,
            [segment.edgeIndex],
          );
          if (!candidateQuality) return bestPaths;
          if (!hardQualityDoesNotRegress(candidateQuality, currentQuality)) continue;
          const candidateActionableOverlapScore = useActionableOverlapScore
            ? scoreActionableDetachedOverlaps(candidatePaths, edges, minOverlap)
            : 0;
          if (useActionableOverlapScore) {
            if (
              candidateActionableOverlapScore > bestActionableOverlapScore
              || (
                candidateActionableOverlapScore === bestActionableOverlapScore
                && compareQualityScores(candidateQuality, bestQuality) >= 0
              )
            ) continue;
          } else {
            if (
              candidateQuality.reverseOverlap >= bestQuality.reverseOverlap
              && candidateQuality.unrelatedOverlap >= bestQuality.unrelatedOverlap
            ) continue;
            if (compareQualityScores(candidateQuality, bestQuality) >= 0) continue;
          }

          bestQuality = candidateQuality;
          bestActionableOverlapScore = candidateActionableOverlapScore;
          bestPaths = candidatePaths;
          if (
            candidateQuality.reverseOverlap === 0
            && candidateQuality.unrelatedOverlap === 0
            && (!useActionableOverlapScore || candidateActionableOverlapScore === 0)
          ) {
            return bestPaths;
          }
        }
      }
    }
  }

  return bestPaths;
}
