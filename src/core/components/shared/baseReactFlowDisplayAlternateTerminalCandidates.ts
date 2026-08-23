import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import { compactOrthogonalPath, isFinitePoint } from './baseReactFlowDisplayEdgeCore';
import {
  displaySegmentsForPath,
  getDisplayComputedPath,
  getDisplayNodeRect,
  isProtectedDisplaySharedTrunkPair,
  OBSTACLE_REPAIR_NODE_PADDING,
  RESIDUAL_PARALLEL_LANE_GAP,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import {
  displayTerminalPositionIsFixed,
  displayTerminalSideCanSwitch,
  type DisplayTerminalSide,
} from './baseReactFlowDisplayTerminalPolicy';

export type DisplayAlternateTerminalSideCandidate = Readonly<{
  path: DisplayPoint[];
  side: DisplayTerminalSide;
}>;

export const buildDisplayAlternateTerminalSideCandidates = (
  edges: Edge[],
  segment: DisplaySegment,
  other: DisplaySegment,
  nodes: Node[],
  maxCandidates = Number.POSITIVE_INFINITY,
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
    if (candidates.length >= maxCandidates) break;
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

    sideCandidateSearch:
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
              if (
                sideCandidates.length >= 12
                || candidates.length + sideCandidates.length >= maxCandidates
              ) break sideCandidateSearch;
            }
          }
        }
      }
    }
    candidates.push(...sideCandidates);
  }
  return candidates;
};
