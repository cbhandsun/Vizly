import type { Edge, Node } from '@xyflow/react';

import { edgeTerminalPositionIsFixed } from '../../routing/utils/edgeTerminalPolicy';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import { buildObstacleSkirtCandidates } from './baseReactFlowDisplayObstacleCandidates';
import {
  buildDisplayRoutingObstacles,
  collectPathHitObstacleRects,
  displayRangeOverlap,
  displaySegmentsForPath,
  extractDisplaySegments,
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  getDisplayNodeRect,
  NEAR_PARALLEL_LANE_TOLERANCE,
  OBSTACLE_REPAIR_NODE_PADDING,
  RESIDUAL_PARALLEL_LANE_GAP,
  shiftDisplayInternalSegment,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import { displayTerminalSideCanSwitch } from './baseReactFlowDisplayTerminalPortCandidates';

const MIN_LOOP_SHORTCUT_TERMINAL_STUB = 56;

export const buildLoopLaneNudgeVariants = (
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

type BlockingLaneVariant = Readonly<{
  edgeIndex: number;
  path: DisplayPoint[];
  sourceSide?: 'top' | 'right' | 'bottom' | 'left';
  targetSide?: 'top' | 'right' | 'bottom' | 'left';
}>;

export const buildBlockingEdgeLaneNudgeVariants = (
  path: DisplayPoint[],
  edgeIndex: number,
  edges: Edge[],
  nodes: Node[],
  maxCandidates = 8,
): BlockingLaneVariant[] => {
  const candidateSegments = displaySegmentsForPath(path, edgeIndex);
  const otherSegments = extractDisplaySegments(edges)
    .filter(segment => segment.edgeIndex !== edgeIndex);
  const variants: BlockingLaneVariant[] = [];
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

export const buildStrictBlockingTerminalLaneShiftVariants = (
  mainPath: DisplayPoint[],
  mainEdgeIndex: number,
  edges: Edge[],
  nodes: Node[],
  maxCandidates = 4,
): BlockingLaneVariant[] => {
  const provisional = edges.map((edge, edgeIndex) => (
    edgeIndex === mainEdgeIndex ? withDisplayComputedPath(edge, mainPath) : edge
  ));
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const variants: BlockingLaneVariant[] = [];
  const seen = new Set<string>();
  for (const hit of findDisplayStrictCrossingHits(provisional)) {
    const mainSegment = hit.a.edgeIndex === mainEdgeIndex
      ? hit.a
      : hit.b.edgeIndex === mainEdgeIndex
        ? hit.b
        : null;
    if (!mainSegment) continue;
    const blocker = mainSegment === hit.a ? hit.b : hit.a;
    const blockerEdge = provisional[blocker.edgeIndex];
    const blockerPath = getDisplayComputedPath(blockerEdge);
    if (blockerPath.length < 3) continue;
    const sourceTerminal = blocker.segmentIndex === 0;
    const targetTerminal = blocker.segmentIndex === blockerPath.length - 2;
    if (sourceTerminal === targetTerminal) continue;
    const role = sourceTerminal ? 'source' : 'target';
    if (edgeTerminalPositionIsFixed(blockerEdge, role)) continue;
    const terminalNode = nodeById.get(blockerEdge[role]);
    const terminalRect = terminalNode ? getDisplayNodeRect(terminalNode) : null;
    if (!terminalRect) continue;
    const mainMin = mainSegment.axis === 'h'
      ? Math.min(mainSegment.a.x, mainSegment.b.x)
      : Math.min(mainSegment.a.y, mainSegment.b.y);
    const mainMax = mainSegment.axis === 'h'
      ? Math.max(mainSegment.a.x, mainSegment.b.x)
      : Math.max(mainSegment.a.y, mainSegment.b.y);
    const sourceNode = nodeById.get(blockerEdge.source);
    const targetNode = nodeById.get(blockerEdge.target);
    const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
    const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
    if (
      sourceRect
      && targetRect
      && !edgeTerminalPositionIsFixed(blockerEdge, 'source')
      && !edgeTerminalPositionIsFixed(blockerEdge, 'target')
    ) {
      const outerSides = blocker.axis === 'v'
        ? ['right', 'left'] as const
        : ['bottom', 'top'] as const;
      const endpointForSide = (
        rect: NonNullable<typeof sourceRect>,
        side: typeof outerSides[number],
      ): DisplayPoint => (
        side === 'right'
          ? { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
          : side === 'left'
            ? { x: rect.x, y: rect.y + rect.height / 2 }
            : side === 'bottom'
              ? { x: rect.x + rect.width / 2, y: rect.y + rect.height }
              : { x: rect.x + rect.width / 2, y: rect.y }
      );
      for (const side of outerSides) {
        if (!displayTerminalSideCanSwitch(blockerEdge, 'target', side)) continue;
        const targetPoint = endpointForSide(targetRect, side);
        const sourceApproachSides = side === 'right' || side === 'left'
          ? [side, 'bottom', 'top'] as const
          : [side, 'right', 'left'] as const;
        for (const sourceSide of sourceApproachSides) {
          if (!displayTerminalSideCanSwitch(blockerEdge, 'source', sourceSide)) continue;
          const sourcePoint = endpointForSide(sourceRect, sourceSide);
          const corridorMin = blocker.axis === 'v'
            ? Math.min(sourcePoint.y, targetPoint.y)
            : Math.min(sourcePoint.x, targetPoint.x);
          const corridorMax = blocker.axis === 'v'
            ? Math.max(sourcePoint.y, targetPoint.y)
            : Math.max(sourcePoint.x, targetPoint.x);
          const intersectingRects = nodes.flatMap((candidate) => {
            const rect = getDisplayNodeRect(candidate);
            if (!rect || candidate.id === blockerEdge.source || candidate.id === blockerEdge.target) {
              return [];
            }
            const overlapsCorridor = blocker.axis === 'v'
              ? rect.y < corridorMax && rect.y + rect.height > corridorMin
              : rect.x < corridorMax && rect.x + rect.width > corridorMin;
            return overlapsCorridor ? [rect] : [];
          });
          const clearance = Math.max(
            MIN_LOOP_SHORTCUT_TERMINAL_STUB,
            OBSTACLE_REPAIR_NODE_PADDING + RESIDUAL_PARALLEL_LANE_GAP,
          );
          const baseOuterBoundary = side === 'right'
            ? Math.max(mainMax, sourceRect.x + sourceRect.width, targetRect.x + targetRect.width)
            : side === 'left'
              ? Math.min(mainMin, sourceRect.x, targetRect.x)
              : side === 'bottom'
                ? Math.max(mainMax, sourceRect.y + sourceRect.height, targetRect.y + targetRect.height)
                : Math.min(mainMin, sourceRect.y, targetRect.y);
          const obstacleBoundaries = intersectingRects.map(rect => (
            side === 'right'
              ? rect.x + rect.width
              : side === 'left'
                ? rect.x
                : side === 'bottom'
                  ? rect.y + rect.height
                  : rect.y
          ));
          const currentBlockerLane = blocker.axis === 'v' ? blocker.a.x : blocker.a.y;
          const outerLanes = [...new Set([
            baseOuterBoundary,
            ...obstacleBoundaries,
          ].map(boundary => (
            side === 'right' || side === 'bottom'
              ? boundary + clearance
              : boundary - clearance
          )))].filter(lane => (
            side === 'right' || side === 'bottom'
              ? lane >= baseOuterBoundary + clearance
              : lane <= baseOuterBoundary - clearance
          )).sort((first, second) => (
            Math.abs(first - currentBlockerLane) - Math.abs(second - currentBlockerLane)
          ));
          const sourceEscape = sourceSide === 'right'
            ? { x: sourcePoint.x + MIN_LOOP_SHORTCUT_TERMINAL_STUB, y: sourcePoint.y }
            : sourceSide === 'left'
              ? { x: sourcePoint.x - MIN_LOOP_SHORTCUT_TERMINAL_STUB, y: sourcePoint.y }
              : sourceSide === 'bottom'
                ? { x: sourcePoint.x, y: sourcePoint.y + MIN_LOOP_SHORTCUT_TERMINAL_STUB }
                : { x: sourcePoint.x, y: sourcePoint.y - MIN_LOOP_SHORTCUT_TERMINAL_STUB };
          const obstacleRects = [...buildDisplayRoutingObstacles(nodes).entries()]
            .filter(([nodeId]) => nodeId !== blockerEdge.source && nodeId !== blockerEdge.target)
            .map(([, rect]) => rect);
          for (const outerLane of outerLanes) {
            const outerPath = side === 'right' || side === 'left'
              ? compactOrthogonalPath([
                  sourcePoint,
                  sourceEscape,
                  { x: outerLane, y: sourceEscape.y },
                  { x: outerLane, y: targetPoint.y },
                  targetPoint,
                ])
              : compactOrthogonalPath([
                  sourcePoint,
                  sourceEscape,
                  { x: sourceEscape.x, y: outerLane },
                  { x: targetPoint.x, y: outerLane },
                  targetPoint,
                ]);
            if (collectPathHitObstacleRects(outerPath, obstacleRects).length > 0) continue;
            const signature = `${blocker.edgeIndex}:${sourceSide}:${side}:${outerPath.map(point => `${point.x}:${point.y}`).join('|')}`;
            if (seen.has(signature)) continue;
            seen.add(signature);
            variants.push({
              edgeIndex: blocker.edgeIndex,
              path: outerPath,
              sourceSide,
              targetSide: side,
            });
            if (variants.length >= maxCandidates) return variants;
          }
        }
      }
    }
    const currentLane = blocker.axis === 'v' ? blocker.a.x : blocker.a.y;
    const laneValues = [
      mainMin - RESIDUAL_PARALLEL_LANE_GAP,
      mainMax + RESIDUAL_PARALLEL_LANE_GAP,
    ].sort((first, second) => Math.abs(first - currentLane) - Math.abs(second - currentLane));
    for (const lane of laneValues) {
      const liesOnTerminalSide = blocker.axis === 'v'
        ? lane >= terminalRect.x - 0.5 && lane <= terminalRect.x + terminalRect.width + 0.5
        : lane >= terminalRect.y - 0.5 && lane <= terminalRect.y + terminalRect.height + 0.5;
      if (!liesOnTerminalSide) continue;
      const connectorStartIndex = sourceTerminal ? 1 : blocker.segmentIndex - 1;
      const connectorEndIndex = sourceTerminal ? 2 : blocker.segmentIndex;
      const connectorIsAvailable = connectorStartIndex >= 0
        && connectorEndIndex < blockerPath.length;
      const currentConnectorLane = connectorIsAvailable
        ? blocker.axis === 'v'
          ? blockerPath[connectorStartIndex].y
          : blockerPath[connectorStartIndex].x
        : 0;
      const mainPerpendicularValues = blocker.axis === 'v'
        ? mainPath.map(point => point.y)
        : mainPath.map(point => point.x);
      const connectorLanes = connectorIsAvailable
        ? [
            currentConnectorLane,
            Math.min(...mainPerpendicularValues) - RESIDUAL_PARALLEL_LANE_GAP,
            Math.max(...mainPerpendicularValues) + RESIDUAL_PARALLEL_LANE_GAP,
          ]
        : [currentConnectorLane];
      for (const connectorLane of connectorLanes) {
        const shifted = blockerPath.map(point => ({ ...point }));
        if (blocker.axis === 'v') {
          shifted[blocker.segmentIndex].x = lane;
          shifted[blocker.segmentIndex + 1].x = lane;
          if (connectorIsAvailable) {
            shifted[connectorStartIndex].y = connectorLane;
            shifted[connectorEndIndex].y = connectorLane;
          }
        } else {
          shifted[blocker.segmentIndex].y = lane;
          shifted[blocker.segmentIndex + 1].y = lane;
          if (connectorIsAvailable) {
            shifted[connectorStartIndex].x = connectorLane;
            shifted[connectorEndIndex].x = connectorLane;
          }
        }
        const signature = `${blocker.edgeIndex}:${shifted.map(point => `${point.x}:${point.y}`).join('|')}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        variants.push({ edgeIndex: blocker.edgeIndex, path: shifted });
        if (variants.length >= maxCandidates) return variants;
      }
    }
  }
  return variants;
};
