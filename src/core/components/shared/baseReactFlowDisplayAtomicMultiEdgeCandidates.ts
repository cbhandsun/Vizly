import type { Edge, Node } from '@xyflow/react';

import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import { anchorForHandle, getNodeRect } from './baseReactFlowDisplayEdgeGeometry';
import {
  buildDisplayRoutingObstacles,
  getDisplayComputedPath,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import type { DisplayExactThresholdResidualPair } from './baseReactFlowDisplayParallelOverlapGeometry';
import {
  buildOppositeRoleSharedNodeCandidates,
  buildStrictCrossingCompanionShiftVariants,
  displayTerminalSideCanSwitch,
  withDisplayPortBridge,
} from './baseReactFlowDisplayTerminalPortCandidates';
import { buildSharedNodeTerminalSideCandidates } from './baseReactFlowSharedNodePortRoleRepair';
import { inferTerminalGeometrySide } from './baseReactFlowDisplayTerminalGeometry';

type OuterSide = 'left' | 'right' | 'top' | 'bottom';

type OuterLaneEdgeCandidate = Readonly<{
  edgeIndex: number;
  edge: Edge;
  side: OuterSide;
  pathLength: number;
}>;

const OUTER_TRANSACTION_PADDING = 64;
const OUTER_TRANSACTION_STUB = 48;
const SAME_SIDE_PORT_CORNER_INSET = 8;

const pointDistance = (first: DisplayPoint, second: DisplayPoint): number => (
  Math.abs(first.x - second.x) + Math.abs(first.y - second.y)
);

const pathLength = (path: DisplayPoint[]): number => path.slice(1).reduce(
  (total, point, index) => total + pointDistance(path[index], point),
  0,
);

const terminalStubForSide = (point: DisplayPoint, side: OuterSide): DisplayPoint => {
  if (side === 'left') return { x: point.x - OUTER_TRANSACTION_STUB, y: point.y };
  if (side === 'right') return { x: point.x + OUTER_TRANSACTION_STUB, y: point.y };
  if (side === 'top') return { x: point.x, y: point.y - OUTER_TRANSACTION_STUB };
  return { x: point.x, y: point.y + OUTER_TRANSACTION_STUB };
};

const buildOuterLaneEdgeCandidates = (
  edges: Edge[],
  nodes: Node[],
  edgeIndex: number,
): OuterLaneEdgeCandidate[] => {
  const edge = edges[edgeIndex];
  if (!edge) return [];
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const sourceRect = getNodeRect(nodeById.get(edge.source), nodeById);
  const targetRect = getNodeRect(nodeById.get(edge.target), nodeById);
  if (!sourceRect || !targetRect) return [];

  const obstacleRects = [...buildDisplayRoutingObstacles(nodes)].map(([, rect]) => rect);
  if (obstacleRects.length === 0) return [];
  const sourceCenter = {
    x: sourceRect.x + sourceRect.width / 2,
    y: sourceRect.y + sourceRect.height / 2,
  };
  const targetCenter = {
    x: targetRect.x + targetRect.width / 2,
    y: targetRect.y + targetRect.height / 2,
  };
  const verticalRelationship = Math.abs(targetCenter.y - sourceCenter.y)
    >= Math.abs(targetCenter.x - sourceCenter.x);
  const sides: OuterSide[] = verticalRelationship
    ? ['left', 'right']
    : ['top', 'bottom'];
  const outerLanes: Record<OuterSide, number> = {
    left: Math.min(...obstacleRects.map(rect => rect.x)) - OUTER_TRANSACTION_PADDING,
    right: Math.max(...obstacleRects.map(rect => rect.x + rect.width)) + OUTER_TRANSACTION_PADDING,
    top: Math.min(...obstacleRects.map(rect => rect.y)) - OUTER_TRANSACTION_PADDING,
    bottom: Math.max(...obstacleRects.map(rect => rect.y + rect.height)) + OUTER_TRANSACTION_PADDING,
  };
  const candidates: OuterLaneEdgeCandidate[] = [];
  for (const side of sides) {
    if (
      !displayTerminalSideCanSwitch(edge, 'source', side)
      || !displayTerminalSideCanSwitch(edge, 'target', side)
    ) continue;
    const sourceAnchor = anchorForHandle(sourceRect, side);
    const targetAnchor = anchorForHandle(targetRect, side);
    const sourceStub = terminalStubForSide(sourceAnchor, side);
    const targetStub = terminalStubForSide(targetAnchor, side);
    const lane = outerLanes[side];
    const candidatePath = compactOrthogonalPath(side === 'left' || side === 'right'
      ? [
        sourceAnchor,
        sourceStub,
        { x: lane, y: sourceStub.y },
        { x: lane, y: targetStub.y },
        targetStub,
        targetAnchor,
      ]
      : [
        sourceAnchor,
        sourceStub,
        { x: sourceStub.x, y: lane },
        { x: targetStub.x, y: lane },
        targetStub,
        targetAnchor,
      ]);
    if (candidatePath.length < 2) continue;
    candidates.push({
      edgeIndex,
      edge: withDisplayPortBridge(edge, candidatePath, side, side),
      side,
      pathLength: pathLength(candidatePath),
    });
  }
  return candidates;
};

const buildLocalTerminalOverlapEscapeCandidates = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  segment: DisplaySegment,
): T[] => {
  const edge = edges[segment.edgeIndex];
  const path = edge ? getDisplayComputedPath(edge) : [];
  if (!edge || path.length < 3) return [];
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const sourceRect = getNodeRect(nodeById.get(edge.source), nodeById);
  const targetRect = getNodeRect(nodeById.get(edge.target), nodeById);
  if (!sourceRect || !targetRect) return [];
  const sourceSide = inferTerminalGeometrySide(path, 'source', sourceRect);
  const targetSide = inferTerminalGeometrySide(path, 'target', targetRect);
  if (!sourceSide || !targetSide) return [];
  const roles: Array<'source' | 'target'> = [];
  if (segment.segmentIndex <= 2) roles.push('source');
  if (segment.segmentIndex >= path.length - 4) roles.push('target');
  const candidates: T[] = [];
  for (const role of roles) {
    const rect = role === 'source' ? sourceRect : targetRect;
    const currentSide = role === 'source' ? sourceSide : targetSide;
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      if (side === currentSide || !displayTerminalSideCanSwitch(edge, role, side)) continue;
      for (const candidatePath of buildSharedNodeTerminalSideCandidates(
        path,
        role,
        rect,
        side,
        OUTER_TRANSACTION_STUB,
        4,
      )) {
        const candidateEdge = withDisplayPortBridge(
          edge,
          candidatePath,
          role === 'source' ? side : sourceSide,
          role === 'target' ? side : targetSide,
        );
        candidates.push(edges.map((item, index) => (
          index === segment.edgeIndex ? candidateEdge : item
        )) as T);
      }
    }
  }
  return candidates;
};

const buildSameSidePortOrderEdge = (
  edge: Edge,
  nodes: Node[],
  segment: DisplaySegment,
  role: 'source' | 'target',
): Edge | null => {
  const path = getDisplayComputedPath(edge);
  if (segment.axis !== 'h' || path.length < 3) return null;
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const rect = getNodeRect(nodeById.get(role === 'source' ? edge.source : edge.target), nodeById);
  if (!rect) return null;
  const side = inferTerminalGeometrySide(path, role, rect);
  if (side !== 'top' && side !== 'bottom') return null;
  if (role === 'source' && segment.segmentIndex > 2) return null;
  if (role === 'target' && segment.segmentIndex < path.length - 3) return null;
  const orderedX = role === 'source'
    ? (segment.b.x > segment.a.x
      ? rect.x + SAME_SIDE_PORT_CORNER_INSET
      : rect.x + rect.width - SAME_SIDE_PORT_CORNER_INSET)
    : (segment.a.x > segment.b.x
      ? rect.x + rect.width - SAME_SIDE_PORT_CORNER_INSET
      : rect.x + SAME_SIDE_PORT_CORNER_INSET);
  const nextPath = path.map(point => ({ ...point }));
  if (role === 'source') {
    for (let index = 0; index <= segment.segmentIndex; index += 1) {
      const point = nextPath[index];
      if (point) point.x = orderedX;
    }
  } else {
    for (let index = segment.segmentIndex + 1; index < nextPath.length; index += 1) {
      const point = nextPath[index];
      if (point) point.x = orderedX;
    }
  }
  const compacted = compactOrthogonalPath(nextPath);
  return compacted.length >= 2 ? withDisplayComputedPath(edge, compacted) : null;
};

const buildSameSideTerminalPortOrderCandidates = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  pair: DisplayExactThresholdResidualPair,
): T[] => {
  const candidates: T[] = [];
  for (const [targetSegment, sourceSegment] of [
    [pair.first, pair.second],
    [pair.second, pair.first],
  ] as const) {
    const targetEdge = edges[targetSegment.edgeIndex];
    const sourceEdge = edges[sourceSegment.edgeIndex];
    if (!targetEdge || !sourceEdge) continue;
    const orderedTarget = buildSameSidePortOrderEdge(targetEdge, nodes, targetSegment, 'target');
    const orderedSource = buildSameSidePortOrderEdge(sourceEdge, nodes, sourceSegment, 'source');
    if (orderedTarget) {
      candidates.push(edges.map((edge, index) => (
        index === targetSegment.edgeIndex ? orderedTarget : edge
      )) as T);
    }
    if (orderedTarget && orderedSource && targetSegment.edgeIndex !== sourceSegment.edgeIndex) {
      candidates.push(edges.map((edge, index) => {
        if (index === targetSegment.edgeIndex) return orderedTarget;
        if (index === sourceSegment.edgeIndex) return orderedSource;
        return edge;
      }) as T);
    }
  }
  return candidates;
};

const buildTargetUnderpassOverlapCandidates = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  segment: DisplaySegment,
): T[] => {
  const edge = edges[segment.edgeIndex];
  const path = edge ? getDisplayComputedPath(edge) : [];
  if (!edge || path.length < 5 || segment.segmentIndex < path.length - 3) return [];
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const sourceRect = getNodeRect(nodeById.get(edge.source), nodeById);
  const targetRect = getNodeRect(nodeById.get(edge.target), nodeById);
  if (!sourceRect || !targetRect) return [];
  const sourceSide = inferTerminalGeometrySide(path, 'source', sourceRect);
  if (!sourceSide) return [];
  const sourceCenterY = sourceRect.y + sourceRect.height / 2;
  const targetCenterY = targetRect.y + targetRect.height / 2;
  const targetSide: OuterSide = targetCenterY >= sourceCenterY ? 'bottom' : 'top';
  if (!displayTerminalSideCanSwitch(edge, 'target', targetSide)) return [];
  const rightLane = targetRect.x + targetRect.width + OUTER_TRANSACTION_STUB;
  const leftLane = targetRect.x - OUTER_TRANSACTION_STUB;
  const start = path[0];
  const sourceStub = path[1];
  if (!start || !sourceStub) return [];
  const rightAnchorX = Math.max(
    targetRect.x + OUTER_TRANSACTION_STUB,
    targetRect.x + targetRect.width - OUTER_TRANSACTION_STUB,
  );
  const leftAnchorX = Math.min(
    targetRect.x + targetRect.width - OUTER_TRANSACTION_STUB,
    targetRect.x + OUTER_TRANSACTION_STUB,
  );
  return [
    { laneX: rightLane, anchorX: rightAnchorX },
    { laneX: rightLane + 16, anchorX: rightAnchorX - 16 },
    { laneX: leftLane, anchorX: leftAnchorX },
    { laneX: leftLane - 16, anchorX: leftAnchorX + 16 },
  ].map(({ laneX, anchorX }) => {
    const targetAnchor = {
      x: anchorX,
      y: targetSide === 'bottom' ? targetRect.y + targetRect.height : targetRect.y,
    };
    const targetStub = terminalStubForSide(targetAnchor, targetSide);
    const candidatePath = compactOrthogonalPath([
      start,
      sourceStub,
      { x: laneX, y: sourceStub.y },
      { x: laneX, y: targetStub.y },
      targetStub,
      targetAnchor,
    ]);
    const candidateEdge = withDisplayPortBridge(
      edge,
      candidatePath,
      sourceSide,
      targetSide,
    );
    return edges.map((item, index) => (
      index === segment.edgeIndex ? candidateEdge : item
    )) as T;
  });
};

const mergeIndependentTerminalCandidates = <T extends Edge[]>(
  baseline: T,
  first: T,
  second: T,
): T | null => {
  const firstChanges = baseline.flatMap((edge, index) => first[index] !== edge ? [index] : []);
  const secondChanges = baseline.flatMap((edge, index) => second[index] !== edge ? [index] : []);
  if (
    firstChanges.length !== 1
    || secondChanges.length !== 1
    || firstChanges[0] === secondChanges[0]
  ) return null;
  const firstIndex = firstChanges[0];
  const secondIndex = secondChanges[0];
  return baseline.map((edge, index) => {
    if (index === firstIndex) return first[index] ?? edge;
    if (index === secondIndex) return second[index] ?? edge;
    return edge;
  }) as T;
};

const buildBoundedStrictCompanionClosures = <T extends Edge[]>(
  baseline: T,
  candidates: T[],
  maxCandidates: number,
): T[] => candidates.slice(0, maxCandidates).flatMap((candidate) => {
  const changedIndexes = baseline.flatMap((edge, index) => candidate[index] !== edge ? [index] : []);
  const firstClosure = changedIndexes.flatMap(primaryEdgeIndex => (
    buildStrictCrossingCompanionShiftVariants(candidate, primaryEdgeIndex).slice(0, 4)
  ));
  return [
    ...firstClosure,
    ...firstClosure.slice(0, 8).flatMap(next => changedIndexes.flatMap(primaryEdgeIndex => (
      buildStrictCrossingCompanionShiftVariants(next, primaryEdgeIndex).slice(0, 2)
    ))),
  ];
});

/**
 * Builds bounded two-edge transactions for an overlap that cannot be removed
 * by shifting either member independently. Shared-node opposite roles first
 * get a local port-side transaction; unrelated edges get complementary global
 * outer lanes so their branches cannot swap order through the same corridor.
 */
export const buildAtomicOverlapCompanionCandidates = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  pair: DisplayExactThresholdResidualPair,
): T[] => {
  const firstLocalTerminalCandidates = buildLocalTerminalOverlapEscapeCandidates(
    edges,
    nodes,
    pair.first,
  );
  const secondLocalTerminalCandidates = buildLocalTerminalOverlapEscapeCandidates(
    edges,
    nodes,
    pair.second,
  );
  const localTerminalCandidates = [
    ...firstLocalTerminalCandidates,
    ...secondLocalTerminalCandidates,
  ];
  const firstBounded = firstLocalTerminalCandidates.slice(0, 8);
  const secondBounded = secondLocalTerminalCandidates.slice(0, 8);
  const pairedTerminalCandidates: T[] = [];
  for (let diagonal = 0; diagonal < firstBounded.length + secondBounded.length - 1; diagonal += 1) {
    for (let firstIndex = 0; firstIndex <= diagonal; firstIndex += 1) {
      const secondIndex = diagonal - firstIndex;
      const first = firstBounded[firstIndex];
      const second = secondBounded[secondIndex];
      if (!first || !second) continue;
      const merged = mergeIndependentTerminalCandidates(edges, first, second);
      if (merged) pairedTerminalCandidates.push(merged);
    }
  }
  const companionClosedCandidates = buildBoundedStrictCompanionClosures(
    edges,
    localTerminalCandidates,
    12,
  );
  const candidates = [
    ...buildSameSideTerminalPortOrderCandidates(edges, nodes, pair),
    ...buildTargetUnderpassOverlapCandidates(edges, nodes, pair.first),
    ...buildTargetUnderpassOverlapCandidates(edges, nodes, pair.second),
    ...buildOppositeRoleSharedNodeCandidates(edges, nodes, pair.first, pair.second),
    ...buildOppositeRoleSharedNodeCandidates(edges, nodes, pair.second, pair.first),
    ...pairedTerminalCandidates,
    ...companionClosedCandidates,
    ...localTerminalCandidates,
  ];
  const firstOuter = buildOuterLaneEdgeCandidates(edges, nodes, pair.first.edgeIndex);
  const secondOuter = buildOuterLaneEdgeCandidates(edges, nodes, pair.second.edgeIndex);
  for (const first of firstOuter) {
    for (const second of secondOuter) {
      if (first.side === second.side) continue;
      const candidate = edges.map((edge, edgeIndex) => {
        if (edgeIndex === first.edgeIndex) return first.edge;
        if (edgeIndex === second.edgeIndex) return second.edge;
        return edge;
      }) as T;
      candidates.push(candidate);
    }
  }
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      const changedIndexes = edges.flatMap((edge, index) => candidate[index] !== edge ? [index] : []);
      const key = changedIndexes
        .map(index => {
          const edge = candidate[index];
          const path = Array.isArray(edge?.data?.computedPath)
            ? edge.data.computedPath as DisplayPoint[]
            : [];
          return `${index}:${String(edge?.sourceHandle)}:${String(edge?.targetHandle)}:${path
            .map(point => `${point.x}:${point.y}`).join('|')}`;
        })
        .join('::');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 64);
};
