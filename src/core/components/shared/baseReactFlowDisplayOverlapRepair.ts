import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import { separateDetachedParallelOverlaps } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { repairDisplayMicroArtifacts } from '../../strategies/shared/edgeDisplayMicroCleanup';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import {
  calculateEdgePathQualityScore,
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { buildReverseOverlapRepairCandidates } from './baseReactFlowReverseOverlapRepairCandidates';
import {
  compactOrthogonalPath,
  isFinitePoint,
} from './baseReactFlowDisplayEdgeCore';
import {
  buildDisplayRoutingObstacles,
  displayAxisOf,
  displayEdgesRelated,
  displaySegmentOverlap,
  displaySegmentsForPath,
  extractDisplaySegments,
  getDisplayComputedPath,
  getDisplayNodeRect,
  isDisplayContainerNode,
  NEAR_PARALLEL_LANE_TOLERANCE,
  OBSTACLE_REPAIR_NODE_PADDING,
  RESIDUAL_PARALLEL_LANE_GAP,
  shiftDisplayInternalSegment,
  sortedUniqueNumbers,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplayRect,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import {
  chooseFinalObstacleAwarePolishCandidate,
  createDisplayObstacleEvaluationContext,
  displayObstacleEdgeSignature,
  evaluateDisplayObstacleCandidate,
  evaluateDisplayQualityCandidate,
  hasHardDisplayOverlapRisk,
  visualPolishHardQualityDoesNotRegress,
} from './baseReactFlowDisplayEvaluation';
import { buildObstacleSkirtCandidates } from './baseReactFlowDisplayObstacleCandidates';
import { repairDisplayLoopShortcuts } from './baseReactFlowDisplayLoopShortcutRepair';

const RESIDUAL_PARALLEL_OVERLAP = 16;

export const repairResidualDisplayOverlaps = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  options = DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  extendedOptions = DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
): T => {
  const loopShortened = repairDisplayLoopShortcuts(edges, nodes, 32);
  const initialQuality = calculateEdgePathQualityScore(loopShortened);
  const initialExactResidualPairs = collectExactThresholdResidualPairs(loopShortened);
  if (!hasHardDisplayOverlapRisk(initialQuality) && initialExactResidualPairs.length === 0) {
    return loopShortened;
  }
  const exactQualityBudget = Math.max(
    8,
    Math.min(128, extendedOptions.maxQualityEvaluations * 2),
  );
  const nearParallelQualityBudget = Math.max(
    8,
    Math.min(96, extendedOptions.maxQualityEvaluations),
  );

  // Exact lane shifts are bounded and use the same full quality/obstacle gates. Run them before
  // the combinatorial near-parallel search so a small terminal or interior lane conflict does not
  // force thousands of outer-bridge candidates.
  const exactFirstRepaired = repairExactThresholdResidualOverlaps(
    loopShortened,
    nodes,
    exactQualityBudget,
  );
  const exactFirstSelected = chooseExactThresholdResidualCandidate(
    nodes,
    loopShortened,
    exactFirstRepaired,
  );
  const quality = calculateEdgePathQualityScore(exactFirstSelected);
  const exactResidualPairs = collectExactThresholdResidualPairs(exactFirstSelected);
  const hardOverlapRisk = hasHardDisplayOverlapRisk(quality);
  if (!hardOverlapRisk && exactResidualPairs.length === 0) return exactFirstSelected;
  if (!hardOverlapRisk) {
    const nearParallelCleaned = repairNearParallelResidualOverlaps(
      exactFirstSelected,
      nodes,
      nearParallelQualityBudget,
    );
    const exactCleaned = repairExactThresholdResidualOverlaps(
      nearParallelCleaned,
      nodes,
      exactQualityBudget,
    );
    return chooseExactThresholdResidualCandidate(
      nodes,
      exactFirstSelected,
      nearParallelCleaned,
      exactCleaned,
    );
  }

  const overlapRepaired = separateDetachedParallelOverlaps(
    exactFirstSelected,
    nodes,
    16,
    options,
  ) as T;
  const shouldRunDefaultOverlapCandidate = options === DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS;
  const defaultOverlapRepaired = shouldRunDefaultOverlapCandidate
    ? separateDetachedParallelOverlaps(exactFirstSelected, nodes, 16) as T
    : overlapRepaired;
  const overlapMicroRepaired = repairDisplayMicroArtifacts(overlapRepaired) as T;
  const endpointRepaired = repairEndpointOrthogonalPaths(overlapRepaired, nodes) as T;
  const microRepaired = repairDisplayMicroArtifacts(endpointRepaired) as T;
  const defaultOverlapMicroRepaired = defaultOverlapRepaired === overlapRepaired
    ? overlapMicroRepaired
    : repairDisplayMicroArtifacts(defaultOverlapRepaired) as T;
  const defaultEndpointRepaired = defaultOverlapRepaired === overlapRepaired
    ? endpointRepaired
    : repairEndpointOrthogonalPaths(defaultOverlapRepaired, nodes) as T;
  let selected = chooseFinalObstacleAwarePolishCandidate(
    nodes,
    exactFirstSelected,
    overlapRepaired,
    overlapMicroRepaired,
    endpointRepaired,
    microRepaired,
    defaultOverlapRepaired,
    defaultOverlapMicroRepaired,
    defaultEndpointRepaired,
  );
  selected = chooseExactThresholdResidualCandidate(
    nodes,
    selected,
    overlapRepaired,
    overlapMicroRepaired,
    endpointRepaired,
    microRepaired,
    defaultOverlapRepaired,
    defaultOverlapMicroRepaired,
    defaultEndpointRepaired,
  );
  if (hasHardDisplayOverlapRisk(calculateEdgePathQualityScore(selected))) {
    const extendedOverlapRepaired = separateDetachedParallelOverlaps(
      selected,
      nodes,
      16,
      extendedOptions,
    ) as T;
    const extendedOverlapMicroRepaired = repairDisplayMicroArtifacts(extendedOverlapRepaired) as T;
    const extendedEndpointRepaired = repairEndpointOrthogonalPaths(extendedOverlapRepaired, nodes) as T;
    const extendedMicroRepaired = repairDisplayMicroArtifacts(extendedEndpointRepaired) as T;
    selected = chooseFinalObstacleAwarePolishCandidate(
      nodes,
      selected,
      extendedOverlapRepaired,
      extendedOverlapMicroRepaired,
      extendedEndpointRepaired,
      extendedMicroRepaired,
    );
    selected = chooseExactThresholdResidualCandidate(
      nodes,
      selected,
      extendedOverlapRepaired,
      extendedOverlapMicroRepaired,
      extendedEndpointRepaired,
      extendedMicroRepaired,
    );
  }
  const exactShiftCleaned = repairExactThresholdResidualOverlaps(
    selected,
    nodes,
    exactQualityBudget,
  );
  selected = chooseExactThresholdResidualCandidate(nodes, selected, exactShiftCleaned);
  if (extendedOptions === DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS) return selected;
  const residualCleaned = repairNearParallelResidualOverlaps(
    selected,
    nodes,
    nearParallelQualityBudget,
  );
  const residualMicroCleaned = repairDisplayMicroArtifacts(residualCleaned) as T;
  return chooseFinalObstacleAwarePolishCandidate(nodes, selected, residualCleaned, residualMicroCleaned);
};

export const DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS = {
  maxIterations: 2,
  maxHitBudget: 3,
  maxQualityEvaluations: 160,
  maxResidualPasses: 1,
};

export const DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS = {
  maxIterations: 1,
  maxHitBudget: 2,
  maxQualityEvaluations: 16,
  maxResidualPasses: 1,
};

export const DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS = {
  maxIterations: 2,
  maxHitBudget: 6,
  maxQualityEvaluations: 640,
  maxResidualPasses: 2,
  qualityOnly: true,
};

export const DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS = {
  maxIterations: 1,
  maxHitBudget: 1,
  maxQualityEvaluations: 8,
  maxResidualPasses: 1,
  qualityOnly: true,
};

const buildNearParallelLaneNudgePaths = (
  path: DisplayPoint[],
  segment: DisplaySegment,
  other: DisplaySegment,
  otherPath: DisplayPoint[],
  nodes: Node[],
  edge: Edge,
  allEdges: Edge[],
): DisplayPoint[][] => {
  if (segment.segmentIndex < 0 || segment.segmentIndex >= path.length - 1) return [];
  const laneCandidates = new Set<number>();
  const addLane = (lane: number) => {
    if (Number.isFinite(lane)) laneCandidates.add(Math.round(lane));
  };
  [-1, 1].forEach((direction) => {
    if (segment.axis === 'v') {
      [
        NEAR_PARALLEL_LANE_TOLERANCE + 1,
        NEAR_PARALLEL_LANE_TOLERANCE * 2,
        12,
        RESIDUAL_PARALLEL_LANE_GAP,
        RESIDUAL_PARALLEL_LANE_GAP * 2,
        RESIDUAL_PARALLEL_LANE_GAP * 3,
        RESIDUAL_PARALLEL_LANE_GAP * 4,
      ].forEach(gap => addLane(other.a.x + direction * gap));
    } else {
      [
        NEAR_PARALLEL_LANE_TOLERANCE + 1,
        NEAR_PARALLEL_LANE_TOLERANCE * 2,
        12,
        RESIDUAL_PARALLEL_LANE_GAP,
        RESIDUAL_PARALLEL_LANE_GAP * 2,
        RESIDUAL_PARALLEL_LANE_GAP * 3,
        RESIDUAL_PARALLEL_LANE_GAP * 4,
      ].forEach(gap => addLane(other.a.y + direction * gap));
    }
  });

  const segmentMainMin = segment.axis === 'h'
    ? Math.min(segment.a.x, segment.b.x)
    : Math.min(segment.a.y, segment.b.y);
  const segmentMainMax = segment.axis === 'h'
    ? Math.max(segment.a.x, segment.b.x)
    : Math.max(segment.a.y, segment.b.y);
  const blockingLaneValues: number[] = [];
  [other.segmentIndex - 1, other.segmentIndex + 1].forEach((neighborIndex) => {
    const neighborStart = otherPath[neighborIndex];
    const neighborEnd = otherPath[neighborIndex + 1];
    if (!neighborStart || !neighborEnd) return;
    const neighborAxis = displayAxisOf(neighborStart, neighborEnd);
    if (!neighborAxis || neighborAxis === segment.axis) return;
    const neighborMain = segment.axis === 'h' ? neighborStart.x : neighborStart.y;
    if (neighborMain < segmentMainMin - 0.5 || neighborMain > segmentMainMax + 0.5) return;
    blockingLaneValues.push(
      segment.axis === 'h' ? neighborStart.y : neighborStart.x,
      segment.axis === 'h' ? neighborEnd.y : neighborEnd.x,
    );
  });
  if (blockingLaneValues.length > 0) {
    const minLane = Math.min(...blockingLaneValues);
    const maxLane = Math.max(...blockingLaneValues);
    [RESIDUAL_PARALLEL_LANE_GAP, 32, 48, 64].forEach((gap) => {
      addLane(minLane - gap);
      addLane(maxLane + gap);
    });
  }

  const candidatePaths: DisplayPoint[][] = [];
  const appendCandidate = (candidate: DisplayPoint[]) => {
    const compacted = compactOrthogonalPath(candidate);
    if (compacted.length >= 2 && compacted.every(isFinitePoint)) {
      candidatePaths.push(compacted);
    }
  };

  const isEndpointSegment = segment.segmentIndex <= 0 || segment.segmentIndex >= path.length - 2;
  if (isEndpointSegment) {
    const start = path[segment.segmentIndex];
    const end = path[segment.segmentIndex + 1];
    if (start && end) {
      [...laneCandidates].forEach((lane) => {
        if (segment.axis === 'v') {
          if (Math.abs(lane - segment.a.x) <= NEAR_PARALLEL_LANE_TOLERANCE) return;
          appendCandidate([
            ...path.slice(0, segment.segmentIndex + 1),
            { x: lane, y: start.y },
            { x: lane, y: end.y },
            ...path.slice(segment.segmentIndex + 1),
          ]);
        } else {
          if (Math.abs(lane - segment.a.y) <= NEAR_PARALLEL_LANE_TOLERANCE) return;
          appendCandidate([
            ...path.slice(0, segment.segmentIndex + 1),
            { x: start.x, y: lane },
            { x: end.x, y: lane },
            ...path.slice(segment.segmentIndex + 1),
          ]);
        }
      });
    }
  }

  if (isEndpointSegment) {
    const seen = new Set<string>();
    return candidatePaths.filter((candidate) => {
      const key = candidate.map(point => `${Math.round(point.x)}:${Math.round(point.y)}`).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  [...laneCandidates].forEach((lane) => {
      const next = path.map(point => ({ ...point }));
      if (segment.axis === 'v') {
        if (Math.abs(lane - segment.a.x) <= NEAR_PARALLEL_LANE_TOLERANCE) return;
        next[segment.segmentIndex].x = lane;
        next[segment.segmentIndex + 1].x = lane;
      } else {
        if (Math.abs(lane - segment.a.y) <= NEAR_PARALLEL_LANE_TOLERANCE) return;
        next[segment.segmentIndex].y = lane;
        next[segment.segmentIndex + 1].y = lane;
      }
      appendCandidate(next);

      const firstAnchor = Math.max(0, segment.segmentIndex - 3);
      const segmentDirection = segment.direction || 1;
      const exitOffsets = [0, 24, 32, 48, 64, 96, 128];
      const exitMainCandidates = exitOffsets.map((offset) => (
        segment.axis === 'v'
          ? segment.b.y + segmentDirection * offset
          : segment.b.x + segmentDirection * offset
      ));
      for (let anchorIndex = firstAnchor; anchorIndex < segment.segmentIndex; anchorIndex += 1) {
        const anchor = path[anchorIndex];
        if (!anchor) continue;
        appendCandidate(segment.axis === 'v'
          ? [
            ...path.slice(0, anchorIndex + 1),
            { x: lane, y: anchor.y },
            { x: lane, y: segment.b.y },
            ...path.slice(segment.segmentIndex + 2),
          ]
          : [
            ...path.slice(0, anchorIndex + 1),
            { x: anchor.x, y: lane },
            { x: segment.b.x, y: lane },
            ...path.slice(segment.segmentIndex + 2),
          ]);
        const exitContinuation = path[segment.segmentIndex + 2];
        if (!exitContinuation) continue;
        for (const exitMain of exitMainCandidates) {
          appendCandidate(segment.axis === 'v'
            ? [
              ...path.slice(0, anchorIndex + 1),
              { x: lane, y: anchor.y },
              { x: lane, y: exitMain },
              { x: exitContinuation.x, y: exitMain },
              ...path.slice(segment.segmentIndex + 3),
            ]
            : [
              ...path.slice(0, anchorIndex + 1),
              { x: anchor.x, y: lane },
              { x: exitMain, y: lane },
              { x: exitMain, y: exitContinuation.y },
              ...path.slice(segment.segmentIndex + 3),
            ]);
        }
      }
    });

  for (const candidatePath of buildObstacleSkirtCandidates(path, nodes, edge, allEdges)) {
    appendCandidate(candidatePath);
  }

  const obstacles = [...buildDisplayRoutingObstacles(nodes)]
    .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
    .map(([, rect]) => rect)
    .sort((first, second) => {
      const firstDistance = segment.axis === 'v'
        ? Math.abs((first.x + first.width / 2) - segment.a.x)
        : Math.abs((first.y + first.height / 2) - segment.a.y);
      const secondDistance = segment.axis === 'v'
        ? Math.abs((second.x + second.width / 2) - segment.a.x)
        : Math.abs((second.y + second.height / 2) - segment.a.y);
      return firstDistance - secondDistance;
    })
    .slice(0, 8);
  const entry = path[segment.segmentIndex];
  const suffixStart = segment.segmentIndex + 2;
  for (const rect of obstacles) {
    if (segment.axis === 'v') {
      const laneValues = sortedUniqueNumbers([
        rect.x - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
        rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP,
        rect.x - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP * 2,
        rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP * 2,
      ], segment.a.x);
      const bypassValues = sortedUniqueNumbers([
        rect.y - OBSTACLE_REPAIR_NODE_PADDING - 1,
        rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + 1,
        rect.y - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
        rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP,
      ], segment.b.y);
      for (const laneX of laneValues.slice(0, 4)) {
        for (const bypassY of bypassValues.slice(0, 4)) {
          for (let exitIndex = suffixStart; exitIndex < path.length; exitIndex += 1) {
            const exit = path[exitIndex];
            if (!entry || !exit) continue;
            appendCandidate([
              ...path.slice(0, segment.segmentIndex),
              { x: laneX, y: entry.y },
              { x: laneX, y: bypassY },
              { x: exit.x, y: bypassY },
              ...path.slice(exitIndex + 1),
            ]);
          }
        }
      }
    } else {
      const laneValues = sortedUniqueNumbers([
        rect.y - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
        rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP,
        rect.y - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP * 2,
        rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP * 2,
      ], segment.a.y);
      const bypassValues = sortedUniqueNumbers([
        rect.x - OBSTACLE_REPAIR_NODE_PADDING - 1,
        rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + 1,
        rect.x - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
        rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP,
      ], segment.b.x);
      for (const laneY of laneValues.slice(0, 4)) {
        for (const bypassX of bypassValues.slice(0, 4)) {
          for (let exitIndex = suffixStart; exitIndex < path.length; exitIndex += 1) {
            const exit = path[exitIndex];
            if (!entry || !exit) continue;
            appendCandidate([
              ...path.slice(0, segment.segmentIndex),
              { x: entry.x, y: laneY },
              { x: bypassX, y: laneY },
              { x: bypassX, y: exit.y },
              ...path.slice(exitIndex + 1),
            ]);
          }
        }
      }
    }
  }

  const seen = new Set<string>();
  return candidatePaths.filter((candidate) => {
    const key = candidate.map(point => `${Math.round(point.x)}:${Math.round(point.y)}`).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const repairNearParallelResidualOverlaps = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 96,
): T => {
  const qualityContext = createEdgePathQualityEvaluationContext(edges);
  const obstacleContext = createDisplayObstacleEvaluationContext(edges, nodes);
  const exactResidualContext = createDisplayExactResidualEvaluationContext(edges);
  const baselineQuality = qualityContext.evaluate(edges);
  const baselineExactScore = exactResidualContext.evaluate(edges);
  if (
    baselineQuality.reverseOverlap === 0
    && baselineQuality.unrelatedOverlap === 0
    && baselineQuality.unexplainedRelatedOverlap === 0
    && baselineExactScore === 0
  ) return edges;
  const hasNoResidualOverlap = (quality: EdgePathQualityScore): boolean => (
    quality.reverseOverlap === 0
    && quality.unrelatedOverlap === 0
    && quality.unexplainedRelatedOverlap === 0
  );

  let bestEdges: T = edges;
  let bestQuality = baselineQuality;
  let bestObstacleHits = obstacleContext.evaluate(bestEdges);
  let bestExactScore = baselineExactScore;
  let qualityEvaluations = 0;
  const segments = extractDisplaySegments(edges);
  const overlapPairs: Array<{
    first: DisplaySegment;
    second: DisplaySegment;
    overlap: number;
    oppositeDirection: boolean;
  }> = [];
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      const first = segments[firstIndex];
      const second = segments[secondIndex];
      if (first.edgeIndex === second.edgeIndex) continue;
      const related = displayEdgesRelated(edges[first.edgeIndex], edges[second.edgeIndex]);
      const oppositeDirection = first.direction !== 0
        && second.direction !== 0
        && first.direction === -second.direction;
      if (!oppositeDirection && related) continue;
      const overlap = displaySegmentOverlap(first, second);
      if (overlap < RESIDUAL_PARALLEL_OVERLAP) continue;
      overlapPairs.push({ first, second, overlap, oppositeDirection });
    }
  }
  overlapPairs.sort((first, second) => (
    Number(second.oppositeDirection) - Number(first.oppositeDirection)
    || second.overlap - first.overlap
  ));

  for (const pair of overlapPairs) {
    for (const segment of [pair.second, pair.first]) {
        const other = segment === pair.second ? pair.first : pair.second;
        const path = getDisplayComputedPath(edges[segment.edgeIndex]);
        const otherPath = getDisplayComputedPath(edges[other.edgeIndex]);
        for (const candidatePath of buildNearParallelLaneNudgePaths(
          path,
          segment,
          other,
          otherPath,
          nodes,
          edges[segment.edgeIndex],
          edges,
        ).concat(buildOppositeOverlapOuterBridgeCandidates(
          path,
          segment,
          other,
          otherPath,
          nodes,
          edges[segment.edgeIndex],
        )).slice(0, Math.max(8, Math.min(64, maxQualityEvaluations)))) {
          if (qualityEvaluations >= maxQualityEvaluations) return bestEdges;
          const candidateEdges = edges.map((edge, edgeIndex) => (
            edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
          )) as T;
          const candidateVariants = [
            candidatePath,
            ...buildObstacleSkirtCandidates(
              candidatePath,
              nodes,
              edges[segment.edgeIndex],
              candidateEdges,
            ),
          ];
          for (const candidateVariant of candidateVariants) {
            if (qualityEvaluations >= maxQualityEvaluations) return bestEdges;
            qualityEvaluations += 1;
            const variantEdges = edges.map((edge, edgeIndex) => (
              edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidateVariant) : edge
            )) as T;
            const candidateQuality = qualityContext.evaluateChanged(variantEdges, [segment.edgeIndex]);
            if (!visualPolishHardQualityDoesNotRegress(bestQuality, candidateQuality)) continue;
            const candidateObstacleHits = obstacleContext.evaluateKnownChanges(variantEdges, [segment.edgeIndex]);
            if (candidateObstacleHits > bestObstacleHits) continue;
            const candidateExactScore = exactResidualContext.evaluate(variantEdges);
            if (
              candidateQuality.reverseOverlap < bestQuality.reverseOverlap
              || candidateQuality.unrelatedOverlap < bestQuality.unrelatedOverlap
              || candidateQuality.unexplainedRelatedOverlap < bestQuality.unexplainedRelatedOverlap
              || candidateExactScore < bestExactScore
            ) {
              bestEdges = variantEdges;
              bestQuality = candidateQuality;
              bestObstacleHits = candidateObstacleHits;
              bestExactScore = candidateExactScore;
              if (hasNoResidualOverlap(bestQuality) && bestExactScore === 0) return bestEdges;
            }
          }
        }
      }
  }
  return bestEdges;
};

export const repairBoundedReverseParallelOverlapsWithCandidates = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations: number,
  buildOppositeRoleCandidates: (
    edges: T,
    nodes: Node[],
    first: DisplaySegment,
    second: DisplaySegment,
  ) => T[],
): T => {
  let current = edges;
  let qualityEvaluations = 0;
  for (let pass = 0; pass < 3 && qualityEvaluations < maxQualityEvaluations; pass += 1) {
    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
    const baselineQuality = qualityContext.evaluate(current);
    if (baselineQuality.reverseOverlap === 0) break;
    const baselineObstacleHits = obstacleContext.evaluate(current);
    const reversePairs = collectExactThresholdResidualPairs(current)
      .filter(pair => (
        pair.first.direction !== 0
        && pair.first.direction === -pair.second.direction
      ))
      .slice(0, 4);
    let accepted: T | null = null;

    for (const pair of reversePairs) {
      for (const candidate of buildOppositeRoleCandidates(
        current,
        nodes,
        pair.first,
        pair.second,
      )) {
        if (qualityEvaluations >= maxQualityEvaluations) return current;
        qualityEvaluations += 1;
        const candidateQuality = evaluateDisplayQualityCandidate(qualityContext, current, candidate);
        if (
          candidateQuality.reverseOverlap >= baselineQuality.reverseOverlap
          || candidateQuality.nonOrthogonalSegments > baselineQuality.nonOrthogonalSegments
          || candidateQuality.strictCrossings > baselineQuality.strictCrossings
          || candidateQuality.unrelatedOverlap > baselineQuality.unrelatedOverlap
          || candidateQuality.unexplainedRelatedOverlap > baselineQuality.unexplainedRelatedOverlap
          || candidateQuality.shortEndpointStubs > baselineQuality.shortEndpointStubs
          || candidateQuality.tinyInteriorDoglegs > baselineQuality.tinyInteriorDoglegs
          || candidateQuality.hairpins > baselineQuality.hairpins
        ) continue;
        if (evaluateDisplayObstacleCandidate(obstacleContext, current, candidate) > baselineObstacleHits) continue;
        accepted = candidate;
        break;
      }
      if (accepted) break;
      const orderedSegments = [pair.first, pair.second].sort((first, second) => (
        getDisplayComputedPath(current[first.edgeIndex]).length
          - getDisplayComputedPath(current[second.edgeIndex]).length
      ));
      for (const segment of orderedSegments) {
        const other = segment === pair.first ? pair.second : pair.first;
        const path = getDisplayComputedPath(current[segment.edgeIndex]);
        const sourceSide = normalizeHandle(current[segment.edgeIndex]?.sourceHandle);
        const preferredSourceAxis = sourceSide === 'l' || sourceSide === 'r'
          ? 'h'
          : sourceSide === 't' || sourceSide === 'b'
            ? 'v'
            : undefined;
        const candidatePaths = buildReverseOverlapRepairCandidates(
          path,
          segment,
          other,
          getDisplayComputedPath(current[other.edgeIndex]),
          preferredSourceAxis,
        );
        for (const candidatePath of candidatePaths.slice(0, 3)) {
          if (qualityEvaluations >= maxQualityEvaluations) return current;
          qualityEvaluations += 1;
          const candidate = current.map((edge, edgeIndex) => (
            edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
          )) as T;
          const candidateQuality = qualityContext.evaluateChanged(candidate, [segment.edgeIndex]);
          if (
            candidateQuality.reverseOverlap >= baselineQuality.reverseOverlap
            || candidateQuality.nonOrthogonalSegments > baselineQuality.nonOrthogonalSegments
            || candidateQuality.strictCrossings > baselineQuality.strictCrossings
            || candidateQuality.unrelatedOverlap > baselineQuality.unrelatedOverlap
            || candidateQuality.unexplainedRelatedOverlap > baselineQuality.unexplainedRelatedOverlap
            || candidateQuality.shortEndpointStubs > baselineQuality.shortEndpointStubs
            || candidateQuality.tinyInteriorDoglegs > baselineQuality.tinyInteriorDoglegs
            || candidateQuality.hairpins > baselineQuality.hairpins
          ) continue;
          if (obstacleContext.evaluateKnownChanges(candidate, [segment.edgeIndex]) > baselineObstacleHits) continue;
          accepted = candidate;
          break;
        }
        if (accepted) break;
      }
      if (accepted) break;
    }

    if (!accepted) break;
    current = accepted;
  }
  return current;
};

const residualOverlapScore = (quality: EdgePathQualityScore): number => (
  quality.reverseOverlap + quality.unrelatedOverlap + quality.unexplainedRelatedOverlap
);

const collectExactThresholdResidualPairs = (edges: Edge[]): Array<{
  first: DisplaySegment;
  second: DisplaySegment;
  overlap: number;
}> => {
  const segments = extractDisplaySegments(edges);
  const pairs: Array<{ first: DisplaySegment; second: DisplaySegment; overlap: number }> = [];
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      const first = segments[firstIndex];
      const second = segments[secondIndex];
      if (first.edgeIndex === second.edgeIndex) continue;
      const related = displayEdgesRelated(edges[first.edgeIndex], edges[second.edgeIndex]);
      const oppositeDirection = first.direction !== 0
        && second.direction !== 0
        && first.direction === -second.direction;
      if (!oppositeDirection && related) continue;
      const overlap = displaySegmentOverlap(first, second);
      if (overlap < 24) continue;
      pairs.push({ first, second, overlap });
    }
  }
  pairs.sort((first, second) => second.overlap - first.overlap);
  return pairs;
};

const exactThresholdResidualScore = (edges: Edge[]): number => (
  collectExactThresholdResidualPairs(edges)
    .reduce((total, pair) => total + pair.overlap, 0)
);

type DisplayExactResidualEvaluationContext = {
  evaluate: (candidate: Edge[]) => number;
};

const exactThresholdPairScore = (
  firstPath: DisplayPoint[],
  secondPath: DisplayPoint[],
  related: boolean,
): number => {
  const firstSegments = displaySegmentsForPath(firstPath, 0);
  const secondSegments = displaySegmentsForPath(secondPath, 1);
  let total = 0;
  for (const first of firstSegments) {
    for (const second of secondSegments) {
      if (first.axis !== second.axis) continue;
      const oppositeDirection = first.direction !== 0
        && second.direction !== 0
        && first.direction === -second.direction;
      if (!oppositeDirection && related) continue;
      const overlap = displaySegmentOverlap(first, second);
      if (overlap >= 24) total += overlap;
    }
  }
  return total;
};

const createDisplayExactResidualEvaluationContext = (
  baseline: Edge[],
): DisplayExactResidualEvaluationContext => {
  const edgeCount = baseline.length;
  const baselinePaths = baseline.map(getDisplayComputedPath);
  const baselineSignatures = baseline.map(displayObstacleEdgeSignature);
  const baselinePairScores = new Map<number, number>();
  let baselineTotal = 0;
  for (let firstIndex = 0; firstIndex < edgeCount; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < edgeCount; secondIndex += 1) {
      const score = exactThresholdPairScore(
        baselinePaths[firstIndex],
        baselinePaths[secondIndex],
        displayEdgesRelated(baseline[firstIndex], baseline[secondIndex]),
      );
      if (score > 0) baselinePairScores.set(firstIndex * edgeCount + secondIndex, score);
      baselineTotal += score;
    }
  }

  return {
    evaluate(candidate: Edge[]): number {
      if (candidate.length !== edgeCount) return exactThresholdResidualScore(candidate);
      const changedIndexes: number[] = [];
      const candidatePaths = baselinePaths.slice();
      for (let index = 0; index < edgeCount; index += 1) {
        if (displayObstacleEdgeSignature(candidate[index]) === baselineSignatures[index]) continue;
        changedIndexes.push(index);
        candidatePaths[index] = getDisplayComputedPath(candidate[index]);
      }
      if (changedIndexes.length === 0) return baselineTotal;

      let total = baselineTotal;
      const affectedPairs = new Set<number>();
      for (const changedIndex of changedIndexes) {
        for (let otherIndex = 0; otherIndex < edgeCount; otherIndex += 1) {
          if (changedIndex === otherIndex) continue;
          const firstIndex = Math.min(changedIndex, otherIndex);
          const secondIndex = Math.max(changedIndex, otherIndex);
          affectedPairs.add(firstIndex * edgeCount + secondIndex);
        }
      }
      for (const pairKey of affectedPairs) {
        const firstIndex = Math.floor(pairKey / edgeCount);
        const secondIndex = pairKey % edgeCount;
        total -= baselinePairScores.get(pairKey) ?? 0;
        total += exactThresholdPairScore(
          candidatePaths[firstIndex],
          candidatePaths[secondIndex],
          displayEdgesRelated(baseline[firstIndex], baseline[secondIndex]),
        );
      }
      return total;
    },
  };
};

const buildOppositeOverlapOuterBridgeCandidates = (
  path: DisplayPoint[],
  segment: DisplaySegment,
  other: DisplaySegment,
  otherPath: DisplayPoint[],
  nodes: Node[] = [],
  edge?: Edge,
): DisplayPoint[][] => {
  if (segment.axis !== other.axis || path.length < 5 || otherPath.length < 5) return [];
  if (segment.segmentIndex <= 0 || segment.segmentIndex >= path.length - 2) return [];
  const before = path[segment.segmentIndex - 1];
  const start = path[segment.segmentIndex];
  const end = path[segment.segmentIndex + 1];
  const after = path[segment.segmentIndex + 2];
  if (!before || !start || !end || !after) return [];

  const otherWindow = otherPath.slice(
    Math.max(0, other.segmentIndex - 1),
    Math.min(otherPath.length, other.segmentIndex + 4),
  );
  if (otherWindow.length < 2) return [];
  const minX = Math.min(...otherWindow.map(point => point.x));
  const maxX = Math.max(...otherWindow.map(point => point.x));
  const minY = Math.min(...otherWindow.map(point => point.y));
  const maxY = Math.max(...otherWindow.map(point => point.y));
  const gap = RESIDUAL_PARALLEL_LANE_GAP;
  const candidates: DisplayPoint[][] = [];
  const obstacleRects = nodes
    .filter(node => !isDisplayContainerNode(node))
    .filter(node => !edge || (node.id !== edge.source && node.id !== edge.target))
    .map(getDisplayNodeRect)
    .filter((rect): rect is DisplayRect => rect !== null);
  const horizontalBridgeLanes = (entryY: number, exitY: number): number[] => {
    const bridgeMinY = Math.min(entryY, exitY) - OBSTACLE_REPAIR_NODE_PADDING;
    const bridgeMaxY = Math.max(entryY, exitY) + OBSTACLE_REPAIR_NODE_PADDING;
    const relevantRects = obstacleRects.filter((rect) => (
      Math.max(rect.y - OBSTACLE_REPAIR_NODE_PADDING, bridgeMinY)
        < Math.min(rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING, bridgeMaxY)
      && rect.x - OBSTACLE_REPAIR_NODE_PADDING < maxX + gap
      && rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING > minX - gap
    ));
    return relevantRects.flatMap(rect => [
      rect.x - OBSTACLE_REPAIR_NODE_PADDING - gap,
      rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + gap,
      rect.x - OBSTACLE_REPAIR_NODE_PADDING - gap * 2,
      rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + gap * 2,
    ]);
  };
  const verticalBridgeLanes = (entryX: number, exitX: number): number[] => {
    const bridgeMinX = Math.min(entryX, exitX) - OBSTACLE_REPAIR_NODE_PADDING;
    const bridgeMaxX = Math.max(entryX, exitX) + OBSTACLE_REPAIR_NODE_PADDING;
    const relevantRects = obstacleRects.filter((rect) => (
      Math.max(rect.x - OBSTACLE_REPAIR_NODE_PADDING, bridgeMinX)
        < Math.min(rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING, bridgeMaxX)
      && rect.y - OBSTACLE_REPAIR_NODE_PADDING < maxY + gap
      && rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING > minY - gap
    ));
    return relevantRects.flatMap(rect => [
      rect.y - OBSTACLE_REPAIR_NODE_PADDING - gap,
      rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + gap,
      rect.y - OBSTACLE_REPAIR_NODE_PADDING - gap * 2,
      rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + gap * 2,
    ]);
  };

  if (segment.axis === 'h') {
    if (displayAxisOf(before, start) !== 'v' || displayAxisOf(end, after) !== 'v') return [];
    const currentY = start.y;
    const exitDirection = Math.sign(after.y - currentY) || 1;
    const entryY = before.y < minY
      ? minY - gap
      : before.y > maxY
        ? maxY + gap
        : currentY - exitDirection * gap;
    const exitY = exitDirection > 0
      ? Math.max(currentY + gap, maxY + gap)
      : Math.min(currentY - gap, minY - gap);
    const bridgeXValues = sortedUniqueNumbers([
      minX - gap,
      maxX + gap,
      minX - gap * 2,
      maxX + gap * 2,
      minX - 96,
      maxX + 96,
      minX - 160,
      maxX + 160,
      ...horizontalBridgeLanes(entryY, exitY),
    ], start.x);
    for (const bridgeX of bridgeXValues.slice(0, 16)) {
      candidates.push(compactOrthogonalPath([
        ...path.slice(0, segment.segmentIndex),
        { x: start.x, y: entryY },
        { x: bridgeX, y: entryY },
        { x: bridgeX, y: exitY },
        { x: end.x, y: exitY },
        ...path.slice(segment.segmentIndex + 2),
      ]));
    }
  } else {
    if (displayAxisOf(before, start) !== 'h' || displayAxisOf(end, after) !== 'h') return [];
    const currentX = start.x;
    const exitDirection = Math.sign(after.x - currentX) || 1;
    const entryX = before.x < minX
      ? minX - gap
      : before.x > maxX
        ? maxX + gap
        : currentX - exitDirection * gap;
    const exitX = exitDirection > 0
      ? Math.max(currentX + gap, maxX + gap)
      : Math.min(currentX - gap, minX - gap);
    const bridgeYValues = sortedUniqueNumbers([
      minY - gap,
      maxY + gap,
      minY - gap * 2,
      maxY + gap * 2,
      minY - 96,
      maxY + 96,
      minY - 160,
      maxY + 160,
      ...verticalBridgeLanes(entryX, exitX),
    ], start.y);
    for (const bridgeY of bridgeYValues.slice(0, 16)) {
      candidates.push(compactOrthogonalPath([
        ...path.slice(0, segment.segmentIndex),
        { x: entryX, y: start.y },
        { x: entryX, y: bridgeY },
        { x: exitX, y: bridgeY },
        { x: exitX, y: end.y },
        ...path.slice(segment.segmentIndex + 2),
      ]));
    }
  }

  return candidates.filter(candidate => candidate.length >= 2 && candidate.every(isFinitePoint));
};

const chooseExactThresholdResidualCandidate = <T extends Edge[]>(
  nodes: Node[],
  baseline: T,
  ...candidates: T[]
): T => {
  const qualityContext = createEdgePathQualityEvaluationContext(baseline);
  const obstacleContext = createDisplayObstacleEvaluationContext(baseline, nodes);
  const exactResidualContext = createDisplayExactResidualEvaluationContext(baseline);
  const baselineQuality = qualityContext.evaluate(baseline);
  let best = baseline;
  let bestQuality = baselineQuality;
  let bestExactScore = exactResidualContext.evaluate(baseline);
  let bestObstacleHits = obstacleContext.evaluate(baseline);
  const seen = new Set<T>([baseline]);
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const candidateExactScore = exactResidualContext.evaluate(candidate);
    if (candidateExactScore >= bestExactScore) continue;
    const candidateQuality = evaluateDisplayQualityCandidate(qualityContext, baseline, candidate);
    if (!visualPolishHardQualityDoesNotRegress(bestQuality, candidateQuality)) continue;
    const candidateObstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, baseline, candidate);
    if (candidateObstacleHits > bestObstacleHits) continue;
    best = candidate;
    bestQuality = candidateQuality;
    bestExactScore = candidateExactScore;
    bestObstacleHits = candidateObstacleHits;
    if (bestExactScore === 0) break;
  }
  return best;
};

const exactResidualHardQualityIsAcceptable = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
  bestExactScore: number,
  candidateExactScore: number,
): boolean => {
  const clearsExactResidual = candidateExactScore === 0 && bestExactScore > 0;
  return candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
    && candidate.strictCrossings <= baseline.strictCrossings + (clearsExactResidual ? 2 : 0)
    && candidate.reverseOverlap <= baseline.reverseOverlap
    && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
    && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
    && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
    && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
    && candidate.hairpins <= baseline.hairpins;
};

export const repairExactThresholdResidualOverlaps = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 128,
): T => {
  const qualityContext = createEdgePathQualityEvaluationContext(edges);
  const obstacleContext = createDisplayObstacleEvaluationContext(edges, nodes);
  const exactResidualContext = createDisplayExactResidualEvaluationContext(edges);
  const baselineQuality = qualityContext.evaluate(edges);
  const exactPairs = collectExactThresholdResidualPairs(edges);
  if (exactPairs.length === 0 && residualOverlapScore(baselineQuality) === 0) return edges;

  let bestEdges = edges;
  let bestQuality = baselineQuality;
  let bestObstacleHits = obstacleContext.evaluate(edges);
  let bestExactScore = exactPairs.reduce((total, pair) => total + pair.overlap, 0);
  let qualityEvaluations = 0;

  for (const pair of exactPairs) {
    for (const segment of [pair.second, pair.first]) {
      const other = segment === pair.second ? pair.first : pair.second;
      const path = getDisplayComputedPath(bestEdges[segment.edgeIndex]);
      const currentLane = segment.axis === 'v' ? segment.a.x : segment.a.y;
      const otherLane = segment.axis === 'v' ? other.a.x : other.a.y;
      const away = Math.sign(currentLane - otherLane)
        || (segment.edgeIndex > other.edgeIndex ? 1 : -1);
      const laneValues = sortedUniqueNumbers([
        otherLane + away * (NEAR_PARALLEL_LANE_TOLERANCE + 1),
        currentLane + away * (NEAR_PARALLEL_LANE_TOLERANCE + 1),
        otherLane + away * (NEAR_PARALLEL_LANE_TOLERANCE * 2),
        currentLane + away * (NEAR_PARALLEL_LANE_TOLERANCE * 2),
        currentLane + away * 12,
        currentLane - 12,
        currentLane + 12,
        currentLane - RESIDUAL_PARALLEL_LANE_GAP,
        currentLane + RESIDUAL_PARALLEL_LANE_GAP,
        currentLane - RESIDUAL_PARALLEL_LANE_GAP * 2,
        currentLane + RESIDUAL_PARALLEL_LANE_GAP * 2,
      ], currentLane);

      const candidatePaths: DisplayPoint[][] = [];
      candidatePaths.push(
        ...buildOppositeOverlapOuterBridgeCandidates(
          path,
          segment,
          other,
          getDisplayComputedPath(bestEdges[other.edgeIndex]),
          nodes,
          bestEdges[segment.edgeIndex],
        ),
      );
      for (const lane of laneValues) {
        const candidatePath = shiftDisplayInternalSegment(path, segment.segmentIndex, segment.axis, lane);
        if (candidatePath) candidatePaths.push(candidatePath);
      }
      candidatePaths.push(
        ...buildNearParallelLaneNudgePaths(
          path,
          segment,
          other,
          getDisplayComputedPath(bestEdges[other.edgeIndex]),
          nodes,
          bestEdges[segment.edgeIndex],
          bestEdges,
        ).slice(0, 24),
      );

      for (const candidatePath of candidatePaths.slice(
        0,
        Math.max(8, Math.min(64, maxQualityEvaluations)),
      )) {
        if (qualityEvaluations >= maxQualityEvaluations) return bestEdges;
        qualityEvaluations += 1;
        const candidateEdges = bestEdges.map((edge, edgeIndex) => (
          edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
        )) as T;
        const candidateQuality = evaluateDisplayQualityCandidate(qualityContext, edges, candidateEdges);
        const candidateExactScore = exactResidualContext.evaluate(candidateEdges);
        if (!exactResidualHardQualityIsAcceptable(bestQuality, candidateQuality, bestExactScore, candidateExactScore)) {
          continue;
        }
        const candidateOverlapScore = residualOverlapScore(candidateQuality);
        if (
          candidateOverlapScore >= residualOverlapScore(bestQuality)
          && candidateExactScore >= bestExactScore
          && candidateQuality.strictCrossings >= bestQuality.strictCrossings
        ) {
          continue;
        }
        const candidateObstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, edges, candidateEdges);
        if (candidateObstacleHits > bestObstacleHits) continue;
        bestEdges = candidateEdges;
        bestQuality = candidateQuality;
        bestObstacleHits = candidateObstacleHits;
        bestExactScore = candidateExactScore;
        if (
          candidateOverlapScore === 0
          && candidateExactScore === 0
          && candidateQuality.strictCrossings <= baselineQuality.strictCrossings
        ) return bestEdges;
      }
    }
  }

  return bestEdges;
};
