import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { createRoutingObstacleEvaluationContext } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import { resolveDisplayCrossingClusterCandidateBudget } from './baseReactFlowDisplayCrossingClusterBudget';
import {
  buildDisplayRoutingObstacles,
  createDisplayCandidateInteractionContext,
  displayPathLength,
  extractDisplaySegments,
  fullDisplayPortSide,
  getDisplayComputedPath,
  getDisplayNodeRect,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplayRect,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import {
  createDisplayObstacleEvaluationContext,
  displayStrictRepairHardQualityIsAcceptable,
} from './baseReactFlowDisplayEvaluation';
import {
  displayTerminalSideCanSwitch,
  withDisplayPortBridge,
} from './baseReactFlowDisplayTerminalPortRepair';
import { buildStrictLoopShortcutCandidates } from './baseReactFlowDisplayStrictLoopShortcutCandidates';
import { hasDisplayCrossingClusterFixedPoint, rememberDisplayCrossingClusterFixedPoint } from './baseReactFlowDisplayCrossingClusterFixedPointCache';
import {
  DISPLAY_CROSSING_CLUSTER_ENDPOINT_STUB,
  rankDisplayCrossingClusterCandidates,
  type DisplayCrossingClusterLocalCandidate,
  type DisplayCrossingClusterPortSide,
  type DisplayCrossingClusterRankedCandidate,
} from './baseReactFlowDisplayCrossingClusterRanking';
import {
  displayCrossingClusterCrossingPairSignature,
  displayCrossingClusterEdgeStateSignature,
  displayCrossingClusterFacingSidePair,
  displayCrossingClusterOutwardStub,
  displayCrossingClusterPathSignature,
  displayCrossingClusterPointOnSide,
  displayCrossingClusterSideAxis,
  firstDisplayCrossingClusterStrictHits,
  selectDisplayCrossingClusterOtherSegments,
} from './baseReactFlowDisplayCrossingClusterGeometry';

export {
  displayCrossingClusterPathSignature,
  firstDisplayCrossingClusterStrictHits,
  selectDisplayCrossingClusterOtherSegments,
} from './baseReactFlowDisplayCrossingClusterGeometry';
export type { DisplayCrossingClusterStrictHit } from './baseReactFlowDisplayCrossingClusterGeometry';

type BeamState<T extends Edge[]> = {
  edges: T;
  segments: DisplaySegment[];
  quality: EdgePathQualityScore;
  obstacleHits: number;
  changedIndexes: number[];
  signature: string;
};
const MAX_SEARCH_DEPTH = 4;
const MAX_BEAM_WIDTH = 8;
const MAX_STATE_EVALUATIONS = 12;
const MAX_QUALITY_EVALUATIONS = 192;
// Candidate construction used to enumerate tens of thousands of paths per
// mover before the beam consumed at most twelve. Keep every side pair
// represented, rotate source/target anchors diagonally, then cap local depth.
const ENDPOINT_STUB = DISPLAY_CROSSING_CLUSTER_ENDPOINT_STUB;
const ENDPOINT_CLEARANCES = [ENDPOINT_STUB, ENDPOINT_STUB * 2] as const;
const CORRIDOR_OFFSETS = [24, 48] as const;

const inferTerminalSide = (
  edge: Edge,
  role: 'source' | 'target',
  path: DisplayPoint[],
  rect: DisplayRect,
): DisplayCrossingClusterPortSide => {
  const declared = fullDisplayPortSide(normalizeHandle(
    role === 'source' ? edge.sourceHandle : edge.targetHandle,
  ));
  if (declared) return declared;
  const endpoint = role === 'source' ? path[0] : path[path.length - 1];
  const distances: Array<[DisplayCrossingClusterPortSide, number]> = [
    ['left', Math.abs(endpoint.x - rect.x)],
    ['right', Math.abs(endpoint.x - (rect.x + rect.width))],
    ['top', Math.abs(endpoint.y - rect.y)],
    ['bottom', Math.abs(endpoint.y - (rect.y + rect.height))],
  ];
  distances.sort((first, second) => first[1] - second[1]);
  return distances[0][0];
};

const candidateSidePairs = (
  edge: Edge,
  path: DisplayPoint[],
  sourceRect: DisplayRect,
  targetRect: DisplayRect,
): Array<[DisplayCrossingClusterPortSide, DisplayCrossingClusterPortSide]> => {
  const current: [DisplayCrossingClusterPortSide, DisplayCrossingClusterPortSide] = [
    inferTerminalSide(edge, 'source', path, sourceRect),
    inferTerminalSide(edge, 'target', path, targetRect),
  ];
  const facing = displayCrossingClusterFacingSidePair(sourceRect, targetRect);
  const adjacentTo = (
    side: DisplayCrossingClusterPortSide,
  ): DisplayCrossingClusterPortSide[] => (
    displayCrossingClusterSideAxis(side) === 'h' ? ['top', 'bottom'] : ['left', 'right']
  );
  const sourceAdjacent = adjacentTo(current[0]);
  const targetAdjacent = adjacentTo(current[1]);
  const pairs: Array<[DisplayCrossingClusterPortSide, DisplayCrossingClusterPortSide]> = [
    current,
    ...targetAdjacent.map(targetSide => (
      [current[0], targetSide] as [DisplayCrossingClusterPortSide, DisplayCrossingClusterPortSide]
    )),
    ...sourceAdjacent.map(sourceSide => (
      [sourceSide, current[1]] as [DisplayCrossingClusterPortSide, DisplayCrossingClusterPortSide]
    )),
    facing,
    ...adjacentTo(facing[1]).map(targetSide => (
      [facing[0], targetSide] as [DisplayCrossingClusterPortSide, DisplayCrossingClusterPortSide]
    )),
    ...adjacentTo(facing[0]).map(sourceSide => (
      [sourceSide, facing[1]] as [DisplayCrossingClusterPortSide, DisplayCrossingClusterPortSide]
    )),
  ];
  const seen = new Set<string>();
  return pairs.filter(([sourceSide, targetSide]) => {
    const signature = `${sourceSide}:${targetSide}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return displayTerminalSideCanSwitch(edge, 'source', sourceSide)
      && displayTerminalSideCanSwitch(edge, 'target', targetSide);
  });
};

const terminalAnchors = (
  rect: DisplayRect,
  side: DisplayCrossingClusterPortSide,
  currentEndpoint: DisplayPoint,
  tangentValues: number[],
): DisplayPoint[] => {
  const horizontalSide = side === 'top' || side === 'bottom';
  const minimum = horizontalSide ? rect.x : rect.y;
  const maximum = minimum + (horizontalSide ? rect.width : rect.height);
  const currentTangent = horizontalSide ? currentEndpoint.x : currentEndpoint.y;
  const inRangeTangentValues = [...new Set(tangentValues
    .filter(value => value >= minimum - 1 && value <= maximum + 1)
    .map(value => Math.round(value)))]
    .sort((first, second) => first - second);
  const anchorValues = [
    currentTangent,
    (minimum + maximum) / 2,
    minimum + 24,
    minimum + 48,
    maximum - 24,
    maximum - 48,
    inRangeTangentValues[0],
    inRangeTangentValues[inRangeTangentValues.length - 1],
  ];
  const anchors = anchorValues
    .filter(value => Number.isFinite(value) && value >= minimum - 1 && value <= maximum + 1)
    .map((value): DisplayPoint => (
      horizontalSide
        ? { x: value, y: side === 'top' ? rect.y : rect.y + rect.height }
        : { x: side === 'left' ? rect.x : rect.x + rect.width, y: value }
    ));
  if (displayCrossingClusterPointOnSide(currentEndpoint, rect, side)) {
    anchors.unshift({ ...currentEndpoint });
  }
  const seen = new Set<string>();
  return anchors.filter((point) => {
    const signature = `${Math.round(point.x * 10)}:${Math.round(point.y * 10)}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
};

const appendRectCorridors = (xValues: number[], yValues: number[], rect: DisplayRect): void => {
  for (const offset of CORRIDOR_OFFSETS) {
    xValues.push(rect.x - offset, rect.x + rect.width + offset);
    yValues.push(rect.y - offset, rect.y + rect.height + offset);
  }
};

const balancedCorridors = (
  values: number[],
  priorityValues: number[],
  first: number,
  second: number,
): readonly number[] => {
  const lowerBound = Math.min(first, second);
  const upperBound = Math.max(first, second);
  const unique = [...new Set(values.filter(Number.isFinite).map(value => Math.round(value)))];
  const below = unique.filter(value => value < lowerBound - 1).sort((a, b) => b - a);
  const above = unique.filter(value => value > upperBound + 1).sort((a, b) => a - b);
  const middle = unique
    .filter(value => value >= lowerBound - 1 && value <= upperBound + 1)
    .sort((a, b) => Math.abs(a - (first + second) / 2) - Math.abs(b - (first + second) / 2));
  const prioritySet = new Set(priorityValues.filter(Number.isFinite).map(value => Math.round(value)));
  const retainSide = (side: number[]): number[] => {
    if (side.length <= 8) return side;
    const preferred = side.filter(value => prioritySet.has(value)).slice(0, 8);
    if (preferred.length >= 8) return preferred;
    const retained = [...preferred];
    for (const value of side) {
      if (!retained.includes(value)) retained.push(value);
      if (retained.length >= 8) break;
    }
    return retained;
  };
  return [...retainSide(below), ...middle.slice(0, 2), ...retainSide(above)];
};

const corridorGroup = (
  axis: 'x' | 'y',
  value: number,
  first: number,
  second: number,
): string => {
  if (value < Math.min(first, second) - 1) return `${axis}-low`;
  if (value > Math.max(first, second) + 1) return `${axis}-high`;
  return `${axis}-middle`;
};

const qualityWithinIntermediateBaseline = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean => (
  candidate.strictCrossings <= baseline.strictCrossings + 2
  && candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
  && candidate.reverseOverlap <= baseline.reverseOverlap
  && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
  && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
  && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
  && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
  && candidate.hairpins <= baseline.hairpins
);

const buildMoverCandidates = (
  edges: Edge[],
  nodes: Node[],
  nodesById: Map<string, Node>,
  obstacles: Map<string, DisplayRect>,
  allSegments: readonly DisplaySegment[],
  moverIndex: number,
  opposingIndex: number,
  maxLocalCandidates: number,
  maxSidePairCandidates: number,
): DisplayCrossingClusterRankedCandidate[] => {
  const edge = edges[moverIndex];
  const path = getDisplayComputedPath(edge);
  const sourceNode = nodesById.get(edge.source);
  const targetNode = nodesById.get(edge.target);
  const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
  const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
  if (path.length < 2 || !sourceRect || !targetRect) return [];
  const routingObstacleContext = createRoutingObstacleEvaluationContext(edge, obstacles);
  const primaryCorridorAxis = displayCrossingClusterSideAxis(
    displayCrossingClusterFacingSidePair(sourceRect, targetRect)[0],
  ) === 'v'
    ? 'x'
    : 'y';

  const relatedRects = [sourceRect, targetRect];
  const opposingEdge = edges[opposingIndex];
  if (opposingEdge) {
    const opposingSourceRect = nodesById.get(opposingEdge.source);
    const opposingTargetRect = nodesById.get(opposingEdge.target);
    if (opposingSourceRect) {
      const rect = getDisplayNodeRect(opposingSourceRect);
      if (rect) relatedRects.push(rect);
    }
    if (opposingTargetRect) {
      const rect = getDisplayNodeRect(opposingTargetRect);
      if (rect) relatedRects.push(rect);
    }
  }

  const otherSegments = selectDisplayCrossingClusterOtherSegments(allSegments, moverIndex);
  const interactionContext = createDisplayCandidateInteractionContext(
    moverIndex,
    edges,
    otherSegments,
  );
  const globalXValues = [...path.map(point => point.x)];
  const globalYValues = [...path.map(point => point.y)];
  for (const segment of otherSegments) {
    globalXValues.push(segment.a.x, segment.b.x);
    globalYValues.push(segment.a.y, segment.b.y);
  }
  const priorityXValues: number[] = [];
  const priorityYValues: number[] = [];
  for (const rect of relatedRects) appendRectCorridors(priorityXValues, priorityYValues, rect);
  const baseXValues = [...priorityXValues];
  const baseYValues = [...priorityYValues];
  for (const segment of otherSegments) {
    const lane = segment.axis === 'v' ? segment.a.x : segment.a.y;
    for (const offset of CORRIDOR_OFFSETS) {
      if (segment.axis === 'v') baseXValues.push(lane - offset, lane + offset);
      else baseYValues.push(lane - offset, lane + offset);
    }
  }

  const corridorMemo = new Map<string, readonly number[]>();
  const memoizedBalancedCorridors = (
    axis: 'x' | 'y',
    first: number,
    second: number,
  ): readonly number[] => {
    const key = `${axis}:${Object.is(first, -0) ? '-0' : String(first)}:${Object.is(second, -0) ? '-0' : String(second)}`;
    const cached = corridorMemo.get(key);
    if (cached) return cached;
    const baseValues = axis === 'x' ? baseXValues : baseYValues;
    const priorityValues = axis === 'x' ? priorityXValues : priorityYValues;
    const balanced = Object.freeze(balancedCorridors(
      [...baseValues, first, second],
      [...priorityValues, first, second],
      first,
      second,
    ));
    corridorMemo.set(key, balanced);
    return balanced;
  };

  const candidates: DisplayCrossingClusterLocalCandidate[] = [];
  const seen = new Set<string>();
  const clearancePairs = ENDPOINT_CLEARANCES.flatMap(sourceClearance => (
    ENDPOINT_CLEARANCES.map(targetClearance => ({ sourceClearance, targetClearance }))
  ));
  for (const [pairRank, [sourceSide, targetSide]] of candidateSidePairs(
    edge,
    path,
    sourceRect,
    targetRect,
  ).entries()) {
    if (candidates.length >= maxLocalCandidates) break;
    const sourceAnchors = terminalAnchors(
      sourceRect,
      sourceSide,
      path[0],
      displayCrossingClusterSideAxis(sourceSide) === 'v' ? globalXValues : globalYValues,
    );
    const targetAnchors = terminalAnchors(
      targetRect,
      targetSide,
      path[path.length - 1],
      displayCrossingClusterSideAxis(targetSide) === 'v' ? globalXValues : globalYValues,
    );
    const pairStartCount = candidates.length;
    const anchorPairs: Array<readonly [DisplayPoint, DisplayPoint]> = [];
    for (
      let diagonal = 0;
      diagonal < sourceAnchors.length + targetAnchors.length - 1;
      diagonal += 1
    ) {
      for (let sourceIndex = 0; sourceIndex < sourceAnchors.length; sourceIndex += 1) {
        const targetIndex = diagonal - sourceIndex;
        if (targetIndex < 0 || targetIndex >= targetAnchors.length) continue;
        anchorPairs.push([sourceAnchors[sourceIndex], targetAnchors[targetIndex]]);
      }
    }
    const appendPortCandidate = (
      axis: 'x' | 'y',
      corridor: number,
      sourceAnchor: DisplayPoint,
      sourceClearance: number,
      sourceStub: DisplayPoint,
      targetAnchor: DisplayPoint,
      targetClearance: number,
      targetStub: DisplayPoint,
    ): void => {
      if (
        candidates.length >= maxLocalCandidates
        || candidates.length - pairStartCount >= maxSidePairCandidates
      ) return;
      const compactedPath = compactOrthogonalPath(axis === 'x'
        ? [
          sourceAnchor,
          sourceStub,
          { x: corridor, y: sourceStub.y },
          { x: corridor, y: targetStub.y },
          targetStub,
          targetAnchor,
        ]
        : [
          sourceAnchor,
          sourceStub,
          { x: sourceStub.x, y: corridor },
          { x: targetStub.x, y: corridor },
          targetStub,
          targetAnchor,
        ]);
      const candidatePathSignature = displayCrossingClusterPathSignature(compactedPath);
      const signature = `${sourceSide}:${targetSide}:${candidatePathSignature}`;
      if (compactedPath.length < 2 || seen.has(signature)) return;
      seen.add(signature);
      const interactions = interactionContext.evaluate(compactedPath);
      const first = axis === 'x' ? sourceStub.x : sourceStub.y;
      const second = axis === 'x' ? targetStub.x : targetStub.y;
      candidates.push({
        kind: 'port-bridge',
        group: corridorGroup(axis, corridor, first, second),
        laneExcursion: Math.max(
          Math.min(first, second) - corridor,
          corridor - Math.max(first, second),
          0,
        ),
        length: displayPathLength(compactedPath),
        obstacleHits: routingObstacleContext.countPathHits(compactedPath),
        pairRank,
        path: compactedPath,
        pathSignature: candidatePathSignature,
        sourceClearance,
        sourceHandle: sourceSide,
        sourceSide,
        strictCrossings: interactions.strictCrossings,
        targetClearance,
        targetHandle: targetSide,
        targetSide,
        unrelatedOverlap: interactions.unrelatedOverlap,
      });
    };
    pairCandidates: for (const [sourceAnchor, targetAnchor] of anchorPairs) {
      for (const { sourceClearance, targetClearance } of clearancePairs) {
        const sourceStub = displayCrossingClusterOutwardStub(
          sourceAnchor,
          sourceSide,
          sourceClearance,
        );
        const targetStub = displayCrossingClusterOutwardStub(
          targetAnchor,
          targetSide,
          targetClearance,
        );
        const xValues = memoizedBalancedCorridors('x', sourceStub.x, targetStub.x);
        const yValues = memoizedBalancedCorridors('y', sourceStub.y, targetStub.y);
        for (const corridorX of xValues) {
          appendPortCandidate(
            'x',
            corridorX,
            sourceAnchor,
            sourceClearance,
            sourceStub,
            targetAnchor,
            targetClearance,
            targetStub,
          );
          if (
            candidates.length >= maxLocalCandidates
            || candidates.length - pairStartCount >= maxSidePairCandidates
          ) break pairCandidates;
        }
        for (const corridorY of yValues) {
          appendPortCandidate(
            'y',
            corridorY,
            sourceAnchor,
            sourceClearance,
            sourceStub,
            targetAnchor,
            targetClearance,
            targetStub,
          );
          if (
            candidates.length >= maxLocalCandidates
            || candidates.length - pairStartCount >= maxSidePairCandidates
          ) break pairCandidates;
        }
      }
    }
  }
  const declaredSourceSide = fullDisplayPortSide(normalizeHandle(edge.sourceHandle));
  const declaredTargetSide = fullDisplayPortSide(normalizeHandle(edge.targetHandle));
  for (const candidatePath of buildStrictLoopShortcutCandidates(path, 12)) {
    const candidatePathSignature = displayCrossingClusterPathSignature(candidatePath);
    const signature = `${String(declaredSourceSide)}:${String(declaredTargetSide)}:${candidatePathSignature}`;
    if (candidatePath.length < 2 || seen.has(signature)) continue;
    seen.add(signature);
    const candidateEdge = withDisplayComputedPath(edge, candidatePath);
    const interactions = interactionContext.evaluate(candidatePath);
    candidates.push({
      edge: candidateEdge,
      group: 'loop-shortcut',
      kind: 'materialized',
      laneExcursion: 0,
      length: displayPathLength(candidatePath),
      obstacleHits: routingObstacleContext.countPathHits(candidatePath),
      pairRank: 0,
      path: candidatePath,
      pathSignature: candidatePathSignature,
      sourceClearance: ENDPOINT_STUB,
      sourceHandle: candidateEdge.sourceHandle,
      strictCrossings: interactions.strictCrossings,
      targetClearance: ENDPOINT_STUB,
      targetHandle: candidateEdge.targetHandle,
      unrelatedOverlap: interactions.unrelatedOverlap,
    });
  }
  return rankDisplayCrossingClusterCandidates(candidates, primaryCorridorAxis)
    .map((candidate): DisplayCrossingClusterRankedCandidate => ({
      ...candidate,
      edge: candidate.kind === 'port-bridge'
        ? withDisplayPortBridge(
          edge,
          candidate.path,
          candidate.sourceSide,
          candidate.targetSide,
        )
        : candidate.edge,
    }));
};

const compareBeamStates = <T extends Edge[]>(first: BeamState<T>, second: BeamState<T>): number => (
  first.quality.strictCrossings - second.quality.strictCrossings
  || first.obstacleHits - second.obstacleHits
  || first.changedIndexes.length - second.changedIndexes.length
  || first.quality.bends - second.quality.bends
  || first.quality.totalLength - second.quality.totalLength
);

/**
 * A residual crossing can migrate from one edge pair to another while a valid
 * multi-edge repair is being assembled. Keeping only the globally shortest
 * partial paths tends to discard that progress because all intermediate
 * states can still have the same strict-crossing count. Preserve a small,
 * deterministic sample across both crossing topology and changed-edge sets,
 * then fill the remaining beam slots by the normal quality ordering.
 */
const selectDiverseBeamStates = <T extends Edge[]>(states: BeamState<T>[]): BeamState<T>[] => {
  const sorted = [...states].sort(compareBeamStates);
  const selected: BeamState<T>[] = [];
  const selectedSignatures = new Set<string>();
  const crossingPairs = new Set<string>();
  const changedSets = new Set<string>();
  const append = (state: BeamState<T>): void => {
    if (selected.length >= MAX_BEAM_WIDTH || selectedSignatures.has(state.signature)) return;
    selectedSignatures.add(state.signature);
    selected.push(state);
  };

  for (const state of sorted) {
    const pairSignature = displayCrossingClusterCrossingPairSignature(state.segments);
    if (crossingPairs.has(pairSignature)) continue;
    crossingPairs.add(pairSignature);
    append(state);
    if (selected.length >= Math.min(4, MAX_BEAM_WIDTH)) break;
  }

  for (const state of sorted) {
    const changedSet = state.changedIndexes.join(':');
    if (changedSets.has(changedSet)) continue;
    changedSets.add(changedSet);
    append(state);
    if (selected.length >= Math.min(6, MAX_BEAM_WIDTH)) break;
  }

  for (const state of sorted) append(state);
  return selected;
};

/**
 * Last-resort bounded search for residual crossing clusters that require moving
 * several edges together. It deliberately never runs on normal/large graphs.
 */
export const repairBoundedMultiEdgeResidualStrictCrossings = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
): T => {
  const candidateBudget = resolveDisplayCrossingClusterCandidateBudget(edges.length);
  if (!candidateBudget) return edges;
  const qualityContext = createEdgePathQualityEvaluationContext(edges);
  const baselineQuality = qualityContext.evaluate(edges);
  if (baselineQuality.strictCrossings === 0 || hasDisplayCrossingClusterFixedPoint(edges, nodes)) return edges;
  const obstacleContext = createDisplayObstacleEvaluationContext(edges, nodes);
  const baselineObstacleHits = obstacleContext.evaluate(edges);
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const obstacles = buildDisplayRoutingObstacles(nodes);
  const baselineState: BeamState<T> = {
    edges,
    segments: extractDisplaySegments(edges),
    quality: baselineQuality,
    obstacleHits: baselineObstacleHits,
    changedIndexes: [],
    signature: '',
  };
  let beam = [baselineState];
  let best: BeamState<T> | null = null;
  let evaluations = 0;

  for (let depth = 0; depth < MAX_SEARCH_DEPTH && evaluations < MAX_QUALITY_EVALUATIONS; depth += 1) {
    const nextStates: BeamState<T>[] = [];
    const nextSignatures = new Set<string>();
    for (const state of beam) {
      const hits = firstDisplayCrossingClusterStrictHits(state.segments);
      if (hits.length === 0) continue;
      const candidatesByMover = new Map<number, DisplayCrossingClusterRankedCandidate[]>();
      for (const hit of hits) {
        for (const [segment, other] of [[hit.a, hit.b], [hit.b, hit.a]] as const) {
          if (candidatesByMover.has(segment.edgeIndex)) continue;
          candidatesByMover.set(segment.edgeIndex, buildMoverCandidates(
            state.edges,
            nodes,
            nodesById,
            obstacles,
            state.segments,
            segment.edgeIndex,
            other.edgeIndex,
            candidateBudget.maxLocalCandidates,
            candidateBudget.maxSidePairCandidates,
          ));
        }
      }

      const moverEntries = [...candidatesByMover.entries()].sort(([firstIndex], [secondIndex]) => (
        Number(state.changedIndexes.includes(firstIndex)) - Number(state.changedIndexes.includes(secondIndex))
      ));
      const scheduled: Array<{
        moverIndex: number;
        candidate: DisplayCrossingClusterRankedCandidate;
      }> = [];
      const stateEvaluationLimit = depth === 0
        ? MAX_STATE_EVALUATIONS
        : Math.min(8, MAX_QUALITY_EVALUATIONS - evaluations);
      for (let rank = 0; scheduled.length < stateEvaluationLimit; rank += 1) {
        let appended = false;
        for (const [moverIndex, candidates] of moverEntries) {
          const candidate = candidates[rank];
          if (!candidate) continue;
          scheduled.push({ moverIndex, candidate });
          appended = true;
          if (scheduled.length >= stateEvaluationLimit) break;
        }
        if (!appended) break;
      }

      for (const { moverIndex, candidate } of scheduled) {
        if (evaluations >= MAX_QUALITY_EVALUATIONS) break;
        evaluations += 1;
        const candidateEdges = state.edges.map((edge, edgeIndex) => (
          edgeIndex === moverIndex ? candidate.edge : edge
        )) as T;
        const changedIndexes = [...new Set([...state.changedIndexes, moverIndex])].sort((a, b) => a - b);
        const signature = displayCrossingClusterEdgeStateSignature(candidateEdges, changedIndexes);
        if (nextSignatures.has(signature)) continue;
        const candidateQuality = qualityContext.evaluateChanged(candidateEdges, changedIndexes);
        if (!qualityWithinIntermediateBaseline(baselineQuality, candidateQuality)) continue;
        const candidateObstacleHits = obstacleContext.evaluateKnownChanges(candidateEdges, changedIndexes);
        if (candidateObstacleHits > baselineObstacleHits) continue;
        const nextState: BeamState<T> = {
          edges: candidateEdges,
          segments: extractDisplaySegments(candidateEdges),
          quality: candidateQuality,
          obstacleHits: candidateObstacleHits,
          changedIndexes,
          signature,
        };
        nextSignatures.add(signature);
        nextStates.push(nextState);
        if (
          candidateQuality.strictCrossings < baselineQuality.strictCrossings
          && displayStrictRepairHardQualityIsAcceptable(baselineQuality, candidateQuality)
          && (!best || compareBeamStates(nextState, best) < 0)
        ) {
          best = nextState;
          if (candidateQuality.strictCrossings === 0) return candidateEdges;
        }
      }
    }
    if (nextStates.length === 0) break;
    beam = selectDiverseBeamStates(nextStates);
  }

  if (!best) rememberDisplayCrossingClusterFixedPoint(edges, nodes);
  return best?.edges ?? edges;
};
