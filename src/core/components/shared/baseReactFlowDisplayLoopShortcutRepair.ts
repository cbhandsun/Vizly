import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import {
  calculateEdgePathQualityScore,
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { buildStrictLoopShortcutCandidates } from './baseReactFlowDisplayStrictLoopShortcutCandidates';
import {
  buildFacingPortPathCandidates,
  buildNearTerminalSideCandidates,
  buildSharedNodeTerminalSideCandidates,
} from './baseReactFlowSharedNodePortRoleRepair';
import {
  createDisplayObstacleEvaluationContext,
} from './baseReactFlowDisplayEvaluation';
import { buildObstacleSkirtCandidates } from './baseReactFlowDisplayObstacleCandidates';
import {
  buildDisplayRoutingObstacles,
  collectPathHitObstacleRects,
  displayEdgesRelated,
  displayPathLength,
  displayRangeOverlap,
  displaySegmentOverlap,
  displaySegmentsForPath,
  extractDisplaySegments,
  fullDisplayPortSide,
  getDisplayComputedPath,
  getDisplayNodeRect,
  NEAR_PARALLEL_LANE_TOLERANCE,
  OBSTACLE_REPAIR_NODE_PADDING,
  RESIDUAL_PARALLEL_LANE_GAP,
  shiftDisplayInternalSegment,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import {
  displayTerminalSideCanSwitch,
  withDisplayPortBridge,
} from './baseReactFlowDisplayTerminalPortCandidates';
import {
  createDisplayTerminalValidationSnapshot,
  getDisplayTerminalValidationReport,
} from './baseReactFlowTerminalAxisRepair';

const hardLoopDefectsDoNotRegress = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean => (
  candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
  && candidate.strictCrossings <= baseline.strictCrossings
  && candidate.reverseOverlap <= baseline.reverseOverlap
  && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
  && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
  && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
  && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
  && candidate.hairpins <= baseline.hairpins
);

const loopDefectScore = (quality: EdgePathQualityScore): number => (
  quality.nonOrthogonalSegments * 1_000_000_000
  + quality.strictCrossings * 100_000_000
  + quality.hairpins * 10_000_000
  + quality.reverseOverlap * 10_000
  + quality.unrelatedOverlap * 10_000
  + quality.unexplainedRelatedOverlap * 10_000
  + quality.shortEndpointStubs * 1_000_000
  + quality.tinyInteriorDoglegs * 500_000
  + quality.detourPenalty * 10
  + quality.totalLength * 0.01
);

const buildLoopLaneNudgeVariants = (
  path: DisplayPoint[],
  edgeIndex: number,
  edges: Edge[],
  maxCandidates = 8,
): DisplayPoint[][] => {
  const otherSegments = extractDisplaySegments(edges)
    .filter(segment => segment.edgeIndex !== edgeIndex);
  const variants: DisplayPoint[][] = [];
  const seen = new Set<string>();
  for (const segment of displaySegmentsForPath(path, edgeIndex)) {
    if (segment.segmentIndex <= 0 || segment.segmentIndex >= path.length - 2) continue;
    const segmentLane = segment.axis === 'v' ? segment.a.x : segment.a.y;
    const mainStart = segment.axis === 'v' ? segment.a.y : segment.a.x;
    const mainEnd = segment.axis === 'v' ? segment.b.y : segment.b.x;
    const blockingLanes = otherSegments
      .filter(other => other.axis === segment.axis)
      .filter((other) => {
        const otherLane = other.axis === 'v' ? other.a.x : other.a.y;
        const otherStart = other.axis === 'v' ? other.a.y : other.a.x;
        const otherEnd = other.axis === 'v' ? other.b.y : other.b.x;
        return Math.abs(otherLane - segmentLane) <= NEAR_PARALLEL_LANE_TOLERANCE
          && displayRangeOverlap(mainStart, mainEnd, otherStart, otherEnd) >= 16;
      })
      .map(other => (other.axis === 'v' ? other.a.x : other.a.y));
    const lanes = [...new Set(blockingLanes.flatMap(blockingLane => (
      [
        NEAR_PARALLEL_LANE_TOLERANCE + 1,
        RESIDUAL_PARALLEL_LANE_GAP,
        48,
      ].flatMap(gap => [blockingLane - gap, blockingLane + gap])
    )))]
      .sort((first, second) => Math.abs(first - segmentLane) - Math.abs(second - segmentLane));
    for (const lane of lanes) {
      const candidate = shiftDisplayInternalSegment(
        path,
        segment.segmentIndex,
        segment.axis,
        lane,
      );
      if (!candidate) continue;
      const signature = candidate.map(point => `${point.x}:${point.y}`).join('|');
      if (seen.has(signature)) continue;
      seen.add(signature);
      variants.push(candidate);
      if (variants.length >= maxCandidates) return variants;
    }
  }
  return variants;
};

const buildBlockingEdgeLaneNudgeVariants = (
  path: DisplayPoint[],
  edgeIndex: number,
  edges: Edge[],
  nodes: Node[],
  maxCandidates = 8,
): Array<{ edgeIndex: number; path: DisplayPoint[] }> => {
  const candidateSegments = displaySegmentsForPath(path, edgeIndex);
  const otherSegments = extractDisplaySegments(edges)
    .filter(segment => segment.edgeIndex !== edgeIndex);
  const variants: Array<{ edgeIndex: number; path: DisplayPoint[] }> = [];
  const seen = new Set<string>();
  for (const segment of candidateSegments) {
    const segmentLane = segment.axis === 'v' ? segment.a.x : segment.a.y;
    const segmentStart = segment.axis === 'v' ? segment.a.y : segment.a.x;
    const segmentEnd = segment.axis === 'v' ? segment.b.y : segment.b.x;
    for (const other of otherSegments) {
      if (other.axis !== segment.axis) continue;
      const otherPath = getDisplayComputedPath(edges[other.edgeIndex]);
      if (other.segmentIndex <= 0 || other.segmentIndex >= otherPath.length - 2) continue;
      const otherLane = other.axis === 'v' ? other.a.x : other.a.y;
      const otherStart = other.axis === 'v' ? other.a.y : other.a.x;
      const otherEnd = other.axis === 'v' ? other.b.y : other.b.x;
      if (
        Math.abs(otherLane - segmentLane) > NEAR_PARALLEL_LANE_TOLERANCE
        || displayRangeOverlap(segmentStart, segmentEnd, otherStart, otherEnd) < 16
      ) continue;
      const before = path[segment.segmentIndex - 1];
      const after = path[segment.segmentIndex + 2];
      const outerCoordinates = [before, segment.a, segment.b, after]
        .filter((point): point is DisplayPoint => Boolean(point))
        .map(point => (segment.axis === 'v' ? point.x : point.y));
      const minOuterCoordinate = Math.min(...outerCoordinates);
      const maxOuterCoordinate = Math.max(...outerCoordinates);
      const localLanes = [
        NEAR_PARALLEL_LANE_TOLERANCE + 1,
        RESIDUAL_PARALLEL_LANE_GAP,
        48,
      ].flatMap(gap => [segmentLane - gap, segmentLane + gap])
        .sort((first, second) => Math.abs(first - otherLane) - Math.abs(second - otherLane));
      const lanes = [...new Set([
        maxOuterCoordinate + RESIDUAL_PARALLEL_LANE_GAP,
        minOuterCoordinate - RESIDUAL_PARALLEL_LANE_GAP,
        ...localLanes,
      ])];
      for (const lane of lanes) {
        const shifted = shiftDisplayInternalSegment(
          otherPath,
          other.segmentIndex,
          other.axis,
          lane,
        );
        if (!shifted) continue;
        const provisionalEdges = edges.map((edge, provisionalIndex) => (
          provisionalIndex === edgeIndex
            ? withDisplayComputedPath(edge, path)
            : provisionalIndex === other.edgeIndex
              ? withDisplayComputedPath(edge, shifted)
              : edge
        ));
        const obstacleRects = [...buildDisplayRoutingObstacles(nodes).entries()]
          .filter(([nodeId]) => (
            nodeId !== edges[other.edgeIndex].source
            && nodeId !== edges[other.edgeIndex].target
          ))
          .map(([, rect]) => rect);
        const hitRects = collectPathHitObstacleRects(shifted, obstacleRects);
        const obstacleLanes = [...new Set(hitRects.flatMap((rect) => {
          if (other.axis === 'v') {
            return [
              rect.x - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
              rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP,
            ];
          }
          return [
            rect.y - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
            rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP,
          ];
        }))]
          .filter(obstacleLane => (
            lane > maxOuterCoordinate
              ? obstacleLane > maxOuterCoordinate
              : lane < minOuterCoordinate
                ? obstacleLane < minOuterCoordinate
                : true
          ));
        const obstacleLaneVariants = obstacleLanes
          .map(obstacleLane => shiftDisplayInternalSegment(
            otherPath,
            other.segmentIndex,
            other.axis,
            obstacleLane,
          ))
          .filter((candidate): candidate is DisplayPoint[] => Boolean(candidate));
        const shiftedVariants = [
          shifted,
          ...obstacleLaneVariants,
          ...buildObstacleSkirtCandidates(
            shifted,
            nodes,
            edges[other.edgeIndex],
            provisionalEdges,
          ).slice(0, 2),
        ];
        for (const shiftedVariant of shiftedVariants) {
          const signature = `${other.edgeIndex}:${shiftedVariant.map(point => `${point.x}:${point.y}`).join('|')}`;
          if (seen.has(signature)) continue;
          seen.add(signature);
          variants.push({ edgeIndex: other.edgeIndex, path: shiftedVariant });
          if (variants.length >= maxCandidates) return variants;
        }
      }
    }
  }
  return variants;
};

/**
 * Removes a bounded interior loop before the more expensive residual searches.
 * Endpoint stubs are structurally preserved by the candidate builder; the
 * transaction is still accepted only after exact whole-graph quality,
 * obstacle, and terminal validation.
 */
export const repairDisplayLoopShortcuts = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 32,
): T => {
  if (maxQualityEvaluations <= 0 || edges.length === 0) return edges;
  const qualityContext = createEdgePathQualityEvaluationContext(edges);
  const obstacleContext = createDisplayObstacleEvaluationContext(edges, nodes);
  const terminalSnapshot = createDisplayTerminalValidationSnapshot(nodes);
  const baselineQuality = qualityContext.evaluate(edges);
  if (
    baselineQuality.hairpins === 0
    && baselineQuality.reverseOverlap === 0
    && baselineQuality.unrelatedOverlap === 0
    && baselineQuality.unexplainedRelatedOverlap === 0
    && baselineQuality.strictCrossings === 0
  ) return edges;

  const baselineObstacleHits = obstacleContext.evaluate(edges);
  const baselineTerminalReport = getDisplayTerminalValidationReport(edges, terminalSnapshot);
  const overlapHitsByEdge = new Map<number, number>();
  const graphSegments = extractDisplaySegments(edges);
  for (let firstIndex = 0; firstIndex < graphSegments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < graphSegments.length; secondIndex += 1) {
      const first = graphSegments[firstIndex];
      const second = graphSegments[secondIndex];
      if (first.edgeIndex === second.edgeIndex || first.axis !== second.axis) continue;
      const oppositeDirection = first.direction !== 0
        && second.direction !== 0
        && first.direction === -second.direction;
      if (!oppositeDirection && displayEdgesRelated(edges[first.edgeIndex], edges[second.edgeIndex])) {
        continue;
      }
      if (displaySegmentOverlap(first, second) < 16) continue;
      overlapHitsByEdge.set(first.edgeIndex, (overlapHitsByEdge.get(first.edgeIndex) ?? 0) + 1);
      overlapHitsByEdge.set(second.edgeIndex, (overlapHitsByEdge.get(second.edgeIndex) ?? 0) + 1);
    }
  }
  const rankedEdgeIndexes = edges
    .map((edge, edgeIndex) => {
      const path = getDisplayComputedPath(edge);
      if (path.length < 5) return null;
      const first = path[0];
      const last = path[path.length - 1];
      const manhattan = Math.abs(last.x - first.x) + Math.abs(last.y - first.y);
      return {
        edgeIndex,
        hairpins: calculateEdgePathQualityScore([edge]).hairpins,
        overlapHits: overlapHitsByEdge.get(edgeIndex) ?? 0,
        pointCount: path.length,
        excessLength: displayPathLength(path) - manhattan,
      };
    })
    .filter((entry): entry is {
      edgeIndex: number;
      hairpins: number;
      overlapHits: number;
      pointCount: number;
      excessLength: number;
    } => Boolean(entry))
    .sort((first, second) => (
      second.hairpins - first.hairpins
      || second.overlapHits - first.overlapHits
      || second.excessLength - first.excessLength
      || second.pointCount - first.pointCount
      || first.edgeIndex - second.edgeIndex
    ));

  let best = edges;
  let bestQuality = baselineQuality;
  let bestScore = loopDefectScore(baselineQuality);
  let evaluations = 0;
  const considerCandidate = (candidate: T, changedIndexes: number[]): boolean => {
    if (evaluations >= maxQualityEvaluations) return false;
    evaluations += 1;
    const candidateQuality = qualityContext.evaluateChanged(candidate, changedIndexes);
    if (!hardLoopDefectsDoNotRegress(baselineQuality, candidateQuality)) return false;
    const candidateScore = loopDefectScore(candidateQuality);
    if (candidateScore >= bestScore) return false;
    if (obstacleContext.evaluateKnownChanges(candidate, changedIndexes) > baselineObstacleHits) return false;
    const candidateTerminalReport = getDisplayTerminalValidationReport(candidate, terminalSnapshot);
    if (
      candidateTerminalReport.allAttached !== baselineTerminalReport.allAttached
      || candidateTerminalReport.allAnchored !== baselineTerminalReport.allAnchored
    ) return false;
    best = candidate;
    bestQuality = candidateQuality;
    bestScore = candidateScore;
    return bestQuality.hairpins === 0
      && bestQuality.strictCrossings === 0
      && bestQuality.reverseOverlap === 0
      && bestQuality.unrelatedOverlap === 0
      && bestQuality.unexplainedRelatedOverlap === 0;
  };

  const reservedPortEvaluations = Math.min(16, Math.max(4, maxQualityEvaluations / 2));
  const loopEvaluationLimit = Math.max(1, maxQualityEvaluations - reservedPortEvaluations);
  loopSearch: for (const { edgeIndex } of rankedEdgeIndexes) {
    const path = getDisplayComputedPath(edges[edgeIndex]);
    for (const candidatePath of buildStrictLoopShortcutCandidates(path, 16)) {
      const variants = [
        { mainPath: candidatePath, paired: null },
        ...buildLoopLaneNudgeVariants(candidatePath, edgeIndex, edges)
          .map(mainPath => ({ mainPath, paired: null })),
        ...buildBlockingEdgeLaneNudgeVariants(candidatePath, edgeIndex, edges, nodes)
          .map(paired => ({ mainPath: candidatePath, paired })),
      ];
      for (const { mainPath, paired } of variants) {
        if (evaluations >= loopEvaluationLimit) break loopSearch;
        const candidate = edges.map((edge, index) => (
          index === edgeIndex
            ? withDisplayComputedPath(edge, mainPath)
            : index === paired?.edgeIndex
              ? withDisplayComputedPath(edge, paired.path)
              : edge
        )) as T;
        const changedIndexes = paired ? [edgeIndex, paired.edgeIndex] : [edgeIndex];
        if (considerCandidate(candidate, changedIndexes)) return best;
      }
    }
  }

  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const routingObstacleRects = [...buildDisplayRoutingObstacles(nodes).values()];
  const outerBounds = routingObstacleRects.length > 0
    ? {
      left: Math.min(...routingObstacleRects.map(rect => rect.x)),
      right: Math.max(...routingObstacleRects.map(rect => rect.x + rect.width)),
      top: Math.min(...routingObstacleRects.map(rect => rect.y)),
      bottom: Math.max(...routingObstacleRects.map(rect => rect.y + rect.height)),
    }
    : null;
  for (const { edgeIndex } of rankedEdgeIndexes) {
    const edge = edges[edgeIndex];
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
    const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
    if (!sourceRect || !targetRect) continue;
    const currentSourceSide = fullDisplayPortSide(normalizeHandle(edge.sourceHandle));
    const currentTargetSide = fullDisplayPortSide(normalizeHandle(edge.targetHandle));
    const sides = ['top', 'bottom', 'left', 'right'] as const;
    const sourceSides = sides
      .filter(side => displayTerminalSideCanSwitch(edge, 'source', side))
      .sort((first, second) => Number(first !== currentSourceSide) - Number(second !== currentSourceSide));
    const targetSides = sides
      .filter(side => displayTerminalSideCanSwitch(edge, 'target', side))
      .sort((first, second) => Number(first !== currentTargetSide) - Number(second !== currentTargetSide));
    if (outerBounds) {
      const endpointForSide = (
        rect: NonNullable<ReturnType<typeof getDisplayNodeRect>>,
        side: typeof sides[number],
      ): DisplayPoint => (
        side === 'left'
          ? { x: rect.x, y: rect.y + rect.height / 2 }
          : side === 'right'
            ? { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
            : side === 'top'
              ? { x: rect.x + rect.width / 2, y: rect.y }
              : { x: rect.x + rect.width / 2, y: rect.y + rect.height }
      );
      for (const side of sides) {
        if (!sourceSides.includes(side) || !targetSides.includes(side)) continue;
        const sourcePoint = endpointForSide(sourceRect, side);
        const targetPoint = endpointForSide(targetRect, side);
        const lane = side === 'top'
          ? outerBounds.top - 96
          : side === 'bottom'
            ? outerBounds.bottom + 96
            : side === 'left'
              ? outerBounds.left - 96
              : outerBounds.right + 96;
        const candidatePath = side === 'top' || side === 'bottom'
          ? [
            sourcePoint,
            { x: sourcePoint.x, y: lane },
            { x: targetPoint.x, y: lane },
            targetPoint,
          ]
          : [
            sourcePoint,
            { x: lane, y: sourcePoint.y },
            { x: lane, y: targetPoint.y },
            targetPoint,
          ];
        const candidate = edges.map((candidateEdge, candidateIndex) => (
          candidateIndex === edgeIndex
            ? withDisplayPortBridge(edge, candidatePath, side, side)
            : candidateEdge
        )) as T;
        if (considerCandidate(candidate, [edgeIndex])) return best;
      }
    }
    for (const sourceSide of sourceSides) {
      for (const targetSide of targetSides) {
        if (sourceSide === currentSourceSide && targetSide === currentTargetSide) continue;
        const originalPath = getDisplayComputedPath(edge);
        const preservedLanePaths = [
          ...(targetSide === currentTargetSide
            ? [
              ...buildNearTerminalSideCandidates(
                originalPath,
                'source',
                sourceRect,
                sourceSide,
                48,
                2,
              ),
              ...buildSharedNodeTerminalSideCandidates(
                originalPath,
                'source',
                sourceRect,
                sourceSide,
                48,
                4,
              ),
            ]
            : []),
          ...(sourceSide === currentSourceSide
            ? [
              ...buildNearTerminalSideCandidates(
                originalPath,
                'target',
                targetRect,
                targetSide,
                48,
                2,
              ),
              ...buildSharedNodeTerminalSideCandidates(
                originalPath,
                'target',
                targetRect,
                targetSide,
                48,
                4,
              ),
            ]
            : []),
        ];
        const candidatePaths = [
          ...preservedLanePaths,
          ...buildFacingPortPathCandidates(
            sourceRect,
            targetRect,
            sourceSide,
            targetSide,
            48,
          ),
        ];
        for (const candidatePath of candidatePaths) {
          const candidateEdge = withDisplayPortBridge(
            edge,
            candidatePath,
            sourceSide,
            targetSide,
          );
          const directCandidate = edges.map((item, index) => (
            index === edgeIndex ? candidateEdge : item
          )) as T;
          const pathVariants = [
            candidatePath,
            ...buildObstacleSkirtCandidates(candidatePath, nodes, candidateEdge, directCandidate)
              .slice(0, 2),
          ];
          for (const pathVariant of pathVariants) {
            if (evaluations >= maxQualityEvaluations) return best;
            const candidate = edges.map((item, index) => (
              index === edgeIndex
                ? withDisplayPortBridge(item, pathVariant, sourceSide, targetSide)
                : item
            )) as T;
            if (considerCandidate(candidate, [edgeIndex])) return best;
          }
        }
      }
    }
  }
  return best;
};
