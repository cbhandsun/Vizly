import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { compactOrthogonalPath, isFinitePoint } from './baseReactFlowDisplayEdgeCore';
import {
  displaySegmentsForPath,
  getDisplayComputedPath,
  getDisplayNodeRect,
  isProtectedDisplaySharedTrunkPair,
  NEAR_PARALLEL_LANE_TOLERANCE,
  OBSTACLE_REPAIR_NODE_PADDING,
  RESIDUAL_PARALLEL_LANE_GAP,
  shiftDisplayInternalSegment,
  sortedUniqueNumbers,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import {
  createDisplayObstacleEvaluationContext,
  evaluateDisplayObstacleCandidate,
  evaluateDisplayQualityCandidate,
} from './baseReactFlowDisplayEvaluation';
import { buildNearParallelLaneNudgePaths } from './baseReactFlowDisplayNearParallelCandidates';
import {
  buildOppositeOverlapOuterBridgeCandidates,
  createDisplayExactResidualEvaluationContext,
  residualOverlapScore,
} from './baseReactFlowDisplayOverlapEvaluation';
import { collectExactThresholdResidualPairs } from './baseReactFlowDisplayReverseParallelRepair';
import {
  createDisplayTerminalValidationSnapshot,
  displayTerminalValidationDoesNotRegress,
} from './baseReactFlowTerminalValidation';
import {
  displayTerminalPositionIsFixed,
  displayTerminalSideCanSwitch,
  resolveDisplayTerminalHandleForSide,
  type DisplayTerminalSide,
} from './baseReactFlowDisplayTerminalPolicy';

const exactResidualHardQualityIsAcceptable = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean => {
  return candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
    && candidate.strictCrossings <= baseline.strictCrossings
    && candidate.reverseOverlap <= baseline.reverseOverlap
    && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
    && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
    && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
    && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
    && candidate.hairpins <= baseline.hairpins;
};
const preservesDisplayFixedTerminalPositions = (
  baseline: readonly Edge[],
  candidate: readonly Edge[],
): boolean => {
  const candidateById = new Map(candidate.map(edge => [edge.id, edge] as const));
  const samePoint = (first: DisplayPoint | undefined, second: DisplayPoint | undefined): boolean => (
    Boolean(first && second)
    && Math.abs(first!.x - second!.x) <= 0.5
    && Math.abs(first!.y - second!.y) <= 0.5
  );
  return baseline.every((edge, index) => {
    const next = candidate[index]?.id === edge.id
      ? candidate[index]
      : candidateById.get(edge.id);
    if (!next) return false;
    const beforePath = getDisplayComputedPath(edge);
    const afterPath = getDisplayComputedPath(next);
    if (
      displayTerminalPositionIsFixed(edge, 'source')
      && (
        !samePoint(beforePath[0], afterPath[0])
        || !Object.is(edge.sourceHandle, next.sourceHandle)
      )
    ) return false;
    if (
      displayTerminalPositionIsFixed(edge, 'target')
      && (
        !samePoint(beforePath[beforePath.length - 1], afterPath[afterPath.length - 1])
        || !Object.is(edge.targetHandle, next.targetHandle)
      )
    ) return false;
    return true;
  });
};

const shiftDisplayTerminalSegment = (
  path: DisplayPoint[],
  segment: DisplaySegment,
  laneValue: number,
  edge: Edge,
): DisplayPoint[] | null => {
  const sourceTerminal = segment.segmentIndex === 0;
  const targetTerminal = segment.segmentIndex === path.length - 2;
  if (sourceTerminal === targetTerminal) return null;
  const role = sourceTerminal ? 'source' : 'target';
  if (displayTerminalPositionIsFixed(edge, role)) return null;
  const shifted = path.map(point => ({ ...point }));
  const firstIndex = segment.segmentIndex;
  const secondIndex = firstIndex + 1;
  if (segment.axis === 'h') {
    shifted[firstIndex].y = laneValue;
    shifted[secondIndex].y = laneValue;
  } else {
    shifted[firstIndex].x = laneValue;
    shifted[secondIndex].x = laneValue;
  }
  const compacted = compactOrthogonalPath(shifted);
  return compacted.length >= 2 && compacted.every(isFinitePoint) ? compacted : null;
};

const shiftDisplayTerminalTrunkTransaction = <T extends Edge[]>(
  edges: T,
  segment: DisplaySegment,
  laneValue: number,
): T | null => {
  const path = getDisplayComputedPath(edges[segment.edgeIndex]);
  const sourceTerminal = segment.segmentIndex === 0;
  const targetTerminal = segment.segmentIndex === path.length - 2;
  if (sourceTerminal === targetTerminal) return null;
  const role = sourceTerminal ? 'source' : 'target';
  const anchorNodeId = edges[segment.edgeIndex]?.[role];
  if (!anchorNodeId) return null;
  const laneOf = (candidate: DisplaySegment): number => (
    candidate.axis === 'v' ? candidate.a.x : candidate.a.y
  );
  const terminalSegments = edges.flatMap((edge, edgeIndex) => {
    if (edge[role] !== anchorNodeId) return [];
    const edgePath = getDisplayComputedPath(edge);
    const terminalSegmentIndex = sourceTerminal ? 0 : edgePath.length - 2;
    const terminalSegment = displaySegmentsForPath(edgePath, edgeIndex)
      .find(candidate => candidate.segmentIndex === terminalSegmentIndex);
    if (!terminalSegment || terminalSegment.axis !== segment.axis) return [];
    if (Math.abs(laneOf(terminalSegment) - laneOf(segment)) > 0.5) return [];
    if (
      edgeIndex !== segment.edgeIndex
      && !isProtectedDisplaySharedTrunkPair(
        segment,
        path,
        edges[segment.edgeIndex],
        terminalSegment,
        edgePath,
        edge,
      )
    ) return [];
    return [{ edgeIndex, edgePath, terminalSegment }];
  });
  if (terminalSegments.length === 0) return null;
  if (terminalSegments.some(({ edgeIndex }) => (
    displayTerminalPositionIsFixed(edges[edgeIndex], role)
  ))) return null;

  const shiftedByIndex = new Map<number, DisplayPoint[]>();
  for (const member of terminalSegments) {
    const shifted = shiftDisplayTerminalSegment(
      member.edgePath,
      member.terminalSegment,
      laneValue,
      edges[member.edgeIndex],
    );
    if (!shifted) return null;
    shiftedByIndex.set(member.edgeIndex, shifted);
  }
  return edges.map((edge, edgeIndex) => {
    const shifted = shiftedByIndex.get(edgeIndex);
    return shifted ? withDisplayComputedPath(edge, shifted) : edge;
  }) as T;
};

const buildDisplayBoundaryTerminalBreakoutCandidates = (
  edges: Edge[],
  segment: DisplaySegment,
  nodes: Node[],
): DisplayPoint[][] => {
  const edge = edges[segment.edgeIndex];
  const path = getDisplayComputedPath(edge);
  const sourceTerminal = segment.segmentIndex === 0;
  const targetTerminal = segment.segmentIndex === path.length - 2;
  if (!edge || sourceTerminal === targetTerminal || path.length < 3) return [];
  const role = sourceTerminal ? 'source' : 'target';
  if (displayTerminalPositionIsFixed(edge, role)) return [];
  const side = normalizeHandle(role === 'source' ? edge.sourceHandle : edge.targetHandle);
  const tangentBoundarySegment = (side === 'l' || side === 'r')
    ? segment.axis === 'v'
    : (side === 't' || side === 'b') && segment.axis === 'h';
  if (!side || !tangentBoundarySegment) return [];
  const nodeId = edge[role];
  const terminalNode = nodes.find(candidate => candidate.id === nodeId);
  const rect = terminalNode ? getDisplayNodeRect(terminalNode) : null;
  if (!rect) return [];

  const hasProtectedTerminalTrunk = edges.some((candidateEdge, edgeIndex) => {
    if (edgeIndex === segment.edgeIndex || candidateEdge[role] !== nodeId) return false;
    const candidatePath = getDisplayComputedPath(candidateEdge);
    const candidateSegmentIndex = sourceTerminal ? 0 : candidatePath.length - 2;
    const candidateSegment = displaySegmentsForPath(candidatePath, edgeIndex)
      .find(item => item.segmentIndex === candidateSegmentIndex);
    return Boolean(
      candidateSegment
      && candidateSegment.axis === segment.axis
      && isProtectedDisplaySharedTrunkPair(
        segment,
        path,
        edge,
        candidateSegment,
        candidatePath,
        candidateEdge,
      )
    );
  });
  if (hasProtectedTerminalTrunk) return [];

  const orientedPath = sourceTerminal ? path : path.toReversed();
  const terminal = orientedPath[0];
  const boundaryEnd = orientedPath[1];
  const continuation = orientedPath[2];
  if (!terminal || !boundaryEnd || !continuation) return [];
  const horizontalSide = side === 'l' || side === 'r';
  const tangentMin = horizontalSide ? rect.y : rect.x;
  const tangentMax = horizontalSide ? rect.y + rect.height : rect.x + rect.width;
  const currentTangent = horizontalSide ? terminal.y : terminal.x;
  const tangentValues = sortedUniqueNumbers([
    currentTangent - 24,
    currentTangent + 24,
    currentTangent - 48,
    currentTangent + 48,
    (tangentMin + tangentMax) / 2,
    tangentMin + 16,
    tangentMax - 16,
  ], currentTangent).filter(value => value >= tangentMin + 8 && value <= tangentMax - 8);
  const boundaryCoordinate = side === 'l'
    ? rect.x
    : side === 'r'
      ? rect.x + rect.width
      : side === 't'
        ? rect.y
        : rect.y + rect.height;
  const outwardCoordinates = side === 'l' || side === 't'
    ? [boundaryCoordinate - 48, boundaryCoordinate - 72, boundaryCoordinate - 96]
    : [boundaryCoordinate + 48, boundaryCoordinate + 72, boundaryCoordinate + 96];
  const candidates: DisplayPoint[][] = [];
  for (const tangent of tangentValues) {
    for (const outward of outwardCoordinates) {
      const terminalPoint = horizontalSide
        ? { x: boundaryCoordinate, y: tangent }
        : { x: tangent, y: boundaryCoordinate };
      const outwardPoint = horizontalSide
        ? { x: outward, y: tangent }
        : { x: tangent, y: outward };
      const bridgePoint = horizontalSide
        ? { x: outward, y: boundaryEnd.y }
        : { x: boundaryEnd.x, y: outward };
      const orientedCandidate = compactOrthogonalPath([
        terminalPoint,
        outwardPoint,
        bridgePoint,
        continuation,
        ...orientedPath.slice(3),
      ]);
      const candidate = sourceTerminal ? orientedCandidate : orientedCandidate.toReversed();
      if (candidate.length >= 2 && candidate.every(isFinitePoint)) candidates.push(candidate);
    }
  }
  return candidates;
};

type DisplayAlternateTerminalSideCandidate = Readonly<{
  path: DisplayPoint[];
  side: DisplayTerminalSide;
}>;

const buildDisplayAlternateTerminalSideCandidates = (
  edges: Edge[],
  segment: DisplaySegment,
  other: DisplaySegment,
  nodes: Node[],
): DisplayAlternateTerminalSideCandidate[] => {
  const edge = edges[segment.edgeIndex];
  const path = getDisplayComputedPath(edge);
  const sourceTerminal = segment.segmentIndex === 0;
  const targetTerminal = segment.segmentIndex === path.length - 2;
  if (!edge || sourceTerminal === targetTerminal || path.length < 3) return [];
  const role = sourceTerminal ? 'source' : 'target';
  if (displayTerminalPositionIsFixed(edge, role)) return [];
  const nodeId = edge[role];
  const terminalNode = nodes.find(candidate => candidate.id === nodeId);
  const rect = terminalNode ? getDisplayNodeRect(terminalNode) : null;
  if (!rect) return [];
  const currentSide = normalizeHandle(role === 'source' ? edge.sourceHandle : edge.targetHandle);
  const hasProtectedTerminalTrunk = edges.some((candidateEdge, edgeIndex) => {
    if (edgeIndex === segment.edgeIndex || candidateEdge[role] !== nodeId) return false;
    const candidatePath = getDisplayComputedPath(candidateEdge);
    const candidateSegmentIndex = sourceTerminal ? 0 : candidatePath.length - 2;
    const candidateSegment = displaySegmentsForPath(candidatePath, edgeIndex)
      .find(item => item.segmentIndex === candidateSegmentIndex);
    return Boolean(
      candidateSegment
      && candidateSegment.axis === segment.axis
      && isProtectedDisplaySharedTrunkPair(
        segment,
        path,
        edge,
        candidateSegment,
        candidatePath,
        candidateEdge,
      )
    );
  });
  if (hasProtectedTerminalTrunk) return [];
  const orientedPath = sourceTerminal ? path : path.toReversed();
  const continuation = orientedPath[2];
  if (!continuation) return [];

  const candidateSides: DisplayTerminalSide[] = segment.axis === 'v'
    ? ['top', 'bottom', 'right', 'left']
    : ['left', 'right', 'top', 'bottom'];
  const minAlong = segment.axis === 'v'
    ? Math.min(segment.a.y, segment.b.y, other.a.y, other.b.y)
    : Math.min(segment.a.x, segment.b.x, other.a.x, other.b.x);
  const maxAlong = segment.axis === 'v'
    ? Math.max(segment.a.y, segment.b.y, other.a.y, other.b.y)
    : Math.max(segment.a.x, segment.b.x, other.a.x, other.b.x);
  const otherEdge = edges[other.edgeIndex];
  const relevantNodeIds = [
    otherEdge?.source,
    otherEdge?.target,
    edge.source,
    edge.target,
  ].filter((id): id is string => Boolean(id));
  const obstacleSafeCoordinates = relevantNodeIds
    .flatMap(id => nodes.filter(candidate => candidate.id === id))
    .flatMap((candidate) => {
      const candidateRect = getDisplayNodeRect(candidate);
      if (!candidateRect) return [];
      return segment.axis === 'v'
        ? [
            candidateRect.y - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
            candidateRect.y + candidateRect.height + OBSTACLE_REPAIR_NODE_PADDING
              + RESIDUAL_PARALLEL_LANE_GAP,
          ]
        : [
            candidateRect.x - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
            candidateRect.x + candidateRect.width + OBSTACLE_REPAIR_NODE_PADDING
              + RESIDUAL_PARALLEL_LANE_GAP,
          ];
    });
  const allNodeRects = nodes.flatMap((candidate) => {
    const candidateRect = getDisplayNodeRect(candidate);
    return candidateRect ? [candidateRect] : [];
  });
  const globalSafeCoordinates = allNodeRects.length === 0
    ? []
    : segment.axis === 'v'
      ? [
          Math.min(...allNodeRects.map(candidate => candidate.y))
            - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
          Math.max(...allNodeRects.map(candidate => candidate.y + candidate.height))
            + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP,
        ]
      : [
          Math.min(...allNodeRects.map(candidate => candidate.x))
            - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP,
          Math.max(...allNodeRects.map(candidate => candidate.x + candidate.width))
            + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP,
        ];
  const safeCoordinates = [...new Set([
    ...obstacleSafeCoordinates,
    ...globalSafeCoordinates,
    minAlong - RESIDUAL_PARALLEL_LANE_GAP,
    maxAlong + RESIDUAL_PARALLEL_LANE_GAP,
  ])].slice(0, 12);
  const candidates: DisplayAlternateTerminalSideCandidate[] = [];

  for (const side of candidateSides) {
    if (side[0] === currentSide || !displayTerminalSideCanSwitch(edge, role, side)) continue;
    const sideCandidates: DisplayAlternateTerminalSideCandidate[] = [];
    const sideCandidateSignatures = new Set<string>();
    const horizontalSide = side === 'left' || side === 'right';
    const tangentValues = horizontalSide
      ? [rect.y, rect.y + rect.height, rect.y + 2, rect.y + rect.height - 2, rect.y + rect.height / 2]
      : [rect.x, rect.x + rect.width, rect.x + 2, rect.x + rect.width - 2, rect.x + rect.width / 2];
    const boundaryCoordinate = side === 'left'
      ? rect.x
      : side === 'right'
        ? rect.x + rect.width
        : side === 'top'
          ? rect.y
          : rect.y + rect.height;
    const globalOutwardCoordinate = allNodeRects.length === 0
      ? null
      : side === 'left'
        ? Math.min(...allNodeRects.map(candidate => candidate.x))
          - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP
        : side === 'right'
          ? Math.max(...allNodeRects.map(candidate => candidate.x + candidate.width))
            + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP
          : side === 'top'
            ? Math.min(...allNodeRects.map(candidate => candidate.y))
              - OBSTACLE_REPAIR_NODE_PADDING - RESIDUAL_PARALLEL_LANE_GAP
            : Math.max(...allNodeRects.map(candidate => candidate.y + candidate.height))
              + OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP;
    const outwardCoordinates = [
      ...(globalOutwardCoordinate === null ? [] : [globalOutwardCoordinate]),
      ...[48, 72, 96].map(distance => (
      side === 'left' || side === 'top'
        ? boundaryCoordinate - distance
        : boundaryCoordinate + distance
      )),
    ];

    for (const safeCoordinate of safeCoordinates) {
      if (segment.axis === 'v') {
        if (side === 'top' && safeCoordinate >= rect.y) continue;
        if (side === 'bottom' && safeCoordinate <= rect.y + rect.height) continue;
      } else {
        if (side === 'left' && safeCoordinate >= rect.x) continue;
        if (side === 'right' && safeCoordinate <= rect.x + rect.width) continue;
      }
      for (const tangent of tangentValues) {
        for (const outwardCoordinate of outwardCoordinates) {
          const terminalPoint = horizontalSide
            ? { x: boundaryCoordinate, y: tangent }
            : { x: tangent, y: boundaryCoordinate };
          const outwardPoint = horizontalSide
            ? { x: outwardCoordinate, y: tangent }
            : { x: tangent, y: outwardCoordinate };
          const safeTurn = segment.axis === 'v'
            ? { x: outwardPoint.x, y: safeCoordinate }
            : { x: safeCoordinate, y: outwardPoint.y };
          const reconnectTurn = segment.axis === 'v'
            ? { x: continuation.x, y: safeCoordinate }
            : { x: safeCoordinate, y: continuation.y };
          const orientedCandidate = compactOrthogonalPath([
            terminalPoint,
            outwardPoint,
            safeTurn,
            reconnectTurn,
            continuation,
            ...orientedPath.slice(3),
          ]);
          const candidatePath = sourceTerminal
            ? orientedCandidate
            : orientedCandidate.toReversed();
          if (candidatePath.length >= 2 && candidatePath.every(isFinitePoint)) {
            const signature = candidatePath.map(point => `${point.x},${point.y}`).join(';');
            if (!sideCandidateSignatures.has(signature)) {
              sideCandidateSignatures.add(signature);
              sideCandidates.push({ path: candidatePath, side });
            }
          }
        }
      }
    }
    candidates.push(...sideCandidates.slice(0, 12));
  }
  return candidates;
};

const terminalSeparationLaneValues = (
  segment: DisplaySegment,
  path: DisplayPoint[],
  other: DisplaySegment,
  otherPath: DisplayPoint[],
): number[] => {
  const terminalContinuation = (
    candidate: DisplaySegment,
    candidatePath: DisplayPoint[],
  ): DisplayPoint | null => {
    if (candidate.segmentIndex === 0) return candidatePath[2] ?? null;
    if (candidate.segmentIndex === candidatePath.length - 2) {
      return candidatePath[candidatePath.length - 3] ?? null;
    }
    return null;
  };
  const firstContinuation = terminalContinuation(segment, path);
  const secondContinuation = terminalContinuation(other, otherPath);
  if (!firstContinuation && !secondContinuation) return [];
  const coordinate = (point: DisplayPoint): number => (
    segment.axis === 'v' ? point.x : point.y
  );
  const coordinates = [
    segment.axis === 'v' ? segment.a.x : segment.a.y,
    segment.axis === 'v' ? other.a.x : other.a.y,
    ...(firstContinuation ? [coordinate(firstContinuation)] : []),
    ...(secondContinuation ? [coordinate(secondContinuation)] : []),
  ];
  const gap = NEAR_PARALLEL_LANE_TOLERANCE + 1;
  return [Math.min(...coordinates) - gap, Math.max(...coordinates) + gap];
};

export const repairExactThresholdResidualOverlaps = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 128,
): T => {
  const qualityContext = createEdgePathQualityEvaluationContext(edges);
  const obstacleContext = createDisplayObstacleEvaluationContext(edges, nodes);
  const exactResidualContext = createDisplayExactResidualEvaluationContext(edges);
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  const baselineQuality = qualityContext.evaluate(edges);
  const exactPairs = collectExactThresholdResidualPairs(edges);
  if (exactPairs.length === 0 && residualOverlapScore(baselineQuality) === 0) return edges;

  let bestEdges = edges;
  let bestQuality = baselineQuality;
  let bestObstacleHits = obstacleContext.evaluate(edges);
  let bestExactScore = exactPairs.reduce((total, pair) => total + pair.overlap, 0);
  let qualityEvaluations = 0;

  for (const pair of exactPairs) {
    const segmentsByTerminalRisk = [pair.first, pair.second].toSorted((first, second) => {
      const firstPathLength = getDisplayComputedPath(bestEdges[first.edgeIndex]).length;
      const secondPathLength = getDisplayComputedPath(bestEdges[second.edgeIndex]).length;
      const firstTouchesTerminal = first.segmentIndex <= 0
        || first.segmentIndex >= firstPathLength - 2;
      const secondTouchesTerminal = second.segmentIndex <= 0
        || second.segmentIndex >= secondPathLength - 2;
      return Number(firstTouchesTerminal) - Number(secondTouchesTerminal);
    });
    for (const segment of segmentsByTerminalRisk) {
      const other = segment === pair.second ? pair.first : pair.second;
      const path = getDisplayComputedPath(bestEdges[segment.edgeIndex]);
      const otherPath = getDisplayComputedPath(bestEdges[other.edgeIndex]);
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
        ...terminalSeparationLaneValues(segment, path, other, otherPath),
      ], currentLane);

      const candidateEdges: T[] = [];
      candidateEdges.push(
        ...buildDisplayAlternateTerminalSideCandidates(
          bestEdges,
          segment,
          other,
          nodes,
        ).slice(0, 36).map(candidate => bestEdges.map((edge, edgeIndex) => {
          if (edgeIndex !== segment.edgeIndex) return edge;
          const withPath = withDisplayComputedPath(edge, candidate.path);
          return segment.segmentIndex === path.length - 2
            ? {
                ...withPath,
                targetHandle: resolveDisplayTerminalHandleForSide(edge, 'target', candidate.side),
              }
            : {
                ...withPath,
                sourceHandle: resolveDisplayTerminalHandleForSide(edge, 'source', candidate.side),
              };
        }) as T),
      );
      candidateEdges.push(
        ...buildDisplayBoundaryTerminalBreakoutCandidates(
          bestEdges,
          segment,
          nodes,
        ).map(candidatePath => bestEdges.map((edge, edgeIndex) => (
          edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
        )) as T),
      );
      candidateEdges.push(
        ...buildOppositeOverlapOuterBridgeCandidates(
          path,
          segment,
          other,
          otherPath,
          nodes,
          bestEdges[segment.edgeIndex],
        ).map(candidatePath => bestEdges.map((edge, edgeIndex) => (
          edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
        )) as T),
      );
      for (const lane of laneValues) {
        const internalCandidatePath = shiftDisplayInternalSegment(
          path,
          segment.segmentIndex,
          segment.axis,
          lane,
        );
        if (internalCandidatePath) {
          candidateEdges.push(bestEdges.map((edge, edgeIndex) => (
            edgeIndex === segment.edgeIndex
              ? withDisplayComputedPath(edge, internalCandidatePath)
              : edge
          )) as T);
          continue;
        }
        const terminalCandidate = shiftDisplayTerminalTrunkTransaction(
          bestEdges,
          segment,
          lane,
        );
        if (terminalCandidate) candidateEdges.push(terminalCandidate);
      }
      candidateEdges.push(
        ...buildNearParallelLaneNudgePaths(
          path,
          segment,
          other,
          otherPath,
          nodes,
          bestEdges[segment.edgeIndex],
          bestEdges,
        ).slice(0, 24).map(candidatePath => bestEdges.map((edge, edgeIndex) => (
          edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
        )) as T),
      );

      for (const candidateEdgesForRepair of candidateEdges.slice(
        0,
        Math.max(8, Math.min(64, maxQualityEvaluations)),
      )) {
        if (qualityEvaluations >= maxQualityEvaluations) return bestEdges;
        qualityEvaluations += 1;
        const candidateQuality = evaluateDisplayQualityCandidate(
          qualityContext,
          edges,
          candidateEdgesForRepair,
        );
        const candidateExactScore = exactResidualContext.evaluate(candidateEdgesForRepair);
        if (!displayTerminalValidationDoesNotRegress(
          bestEdges,
          candidateEdgesForRepair,
          terminalValidation,
        ) || !preservesDisplayFixedTerminalPositions(bestEdges, candidateEdgesForRepair)) {
          continue;
        }
        if (!exactResidualHardQualityIsAcceptable(bestQuality, candidateQuality)) {
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
        const candidateObstacleHits = evaluateDisplayObstacleCandidate(
          obstacleContext,
          edges,
          candidateEdgesForRepair,
        );
        if (candidateObstacleHits > bestObstacleHits) continue;
        bestEdges = candidateEdgesForRepair;
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
