import type { Edge, Node } from '@xyflow/react';

import { countRoutingObstacleHits } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { MIN_EDGE_PATH_PENALIZED_OVERLAP } from '../../strategies/shared/edgeStrictCrossingGuard';
import { compactOrthogonalPath, isFinitePoint } from './baseReactFlowDisplayEdgeCore';
import { anchorForHandle } from './baseReactFlowDisplayEdgeGeometry';
import {
  buildDisplayRoutingObstacles,
  candidateUnrelatedOverlapForEdge,
  displaySegmentIntersectsRect,
  extractDisplaySegments,
  getDisplayComputedPath,
  getDisplayNodeRect,
  type DisplayPoint,
  type DisplayRect,
} from './baseReactFlowDisplayGeometry';
import { createDisplayStrictCrossingCounter } from './baseReactFlowDisplayStrictCrossingCounter';
import {
  displayTerminalPositionIsFixed,
  displayTerminalSideCanSwitch,
  type DisplayTerminalSide,
} from './baseReactFlowDisplayTerminalPolicy';
import { withDisplayPortBridge } from './baseReactFlowDisplayTerminalPortBridge';
import type { OuterPortTransactionCandidate } from './baseReactFlowDisplayOuterPortCandidates';

const SIDES: DisplayTerminalSide[] = ['top', 'right', 'bottom', 'left'];

const outward = (point: DisplayPoint, side: DisplayTerminalSide, distance: number): DisplayPoint => ({
  x: point.x + (side === 'left' ? -distance : side === 'right' ? distance : 0),
  y: point.y + (side === 'top' ? -distance : side === 'bottom' ? distance : 0),
});

/** An exterior ring can still have its return ray blocked by a downstream
 * node. Derive two escape corridors from that ray's complete obstacle wall,
 * rather than requiring a clean local port path before considering the ring. */
export const buildOuterTerminalCorridorPaths = (
  source: DisplayPoint,
  sourceStub: DisplayPoint,
  target: DisplayPoint,
  targetStub: DisplayPoint,
  ring: DisplayPoint,
  obstacles: readonly DisplayRect[],
  clearance: number,
): Array<{ path: DisplayPoint[]; ringAxis: 'x' | 'y'; transitionLane: number }> => {
  if (
    ![source, sourceStub, target, targetStub, ring].every(isFinitePoint)
    || !Number.isFinite(clearance) || clearance < 48
    || obstacles.some(rect => ![rect.x, rect.y, rect.width, rect.height,
      rect.x + rect.width, rect.y + rect.height].every(Number.isFinite)
      || rect.width <= 0 || rect.height <= 0)
  ) return [];
  const verticalWall = obstacles.filter(rect => displaySegmentIntersectsRect(
    { x: targetStub.x, y: ring.y }, targetStub, rect,
  ));
  const horizontalWall = obstacles.filter(rect => displaySegmentIntersectsRect(
    { x: ring.x, y: targetStub.y }, targetStub, rect,
  ));
  const xLanes = verticalWall.length === 0 ? [] : [
    Math.min(...verticalWall.map(rect => rect.x)) - clearance,
    Math.max(...verticalWall.map(rect => rect.x + rect.width)) + clearance,
  ];
  const yLanes = horizontalWall.length === 0 ? [] : [
    Math.min(...horizontalWall.map(rect => rect.y)) - clearance,
    Math.max(...horizontalWall.map(rect => rect.y + rect.height)) + clearance,
  ];
  return [
    ...xLanes.map(transitionLane => ({
      ringAxis: 'x' as const, transitionLane,
      path: compactOrthogonalPath([
        source, sourceStub, { x: ring.x, y: sourceStub.y }, ring,
        { x: transitionLane, y: ring.y }, { x: transitionLane, y: targetStub.y }, targetStub, target,
      ]),
    })),
    ...yLanes.map(transitionLane => ({
      ringAxis: 'y' as const, transitionLane,
      path: compactOrthogonalPath([
        source, sourceStub, { x: sourceStub.x, y: ring.y }, ring,
        { x: ring.x, y: transitionLane }, { x: targetStub.x, y: transitionLane }, targetStub, target,
      ]),
    })),
  ];
};

/** Fallback only for the selected residual pair. At most two edges, sixteen
 * side pairs, four ring corners and four wall corridors are considered; the
 * caller's existing exact-evaluation cap is not increased. */
export const buildBoundedOuterCorridorCandidates = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  movingIndexes: readonly number[],
  minStub: number,
  limit: number,
): Array<OuterPortTransactionCandidate<T>> => {
  if (!Number.isFinite(minStub) || minStub < 48 || !Number.isInteger(limit) || limit <= 0) return [];
  const obstacles = buildDisplayRoutingObstacles(nodes);
  const rectangles = [...obstacles.values()];
  if (rectangles.length === 0) return [];
  const segments = extractDisplaySegments(edges);
  const points = segments.flatMap(segment => [segment.a, segment.b]);
  if (!points.every(isFinitePoint)) return [];
  const xs = [
    Math.min(...rectangles.map(rect => rect.x), ...points.map(point => point.x)) - minStub,
    Math.max(...rectangles.map(rect => rect.x + rect.width), ...points.map(point => point.x)) + minStub,
  ];
  const ys = [
    Math.min(...rectangles.map(rect => rect.y), ...points.map(point => point.y)) - minStub,
    Math.max(...rectangles.map(rect => rect.y + rect.height), ...points.map(point => point.y)) + minStub,
  ];
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const candidates: Array<OuterPortTransactionCandidate<T>> = [];
  const seen = new Set<string>();
  for (const movingEdgeIndex of [...new Set(movingIndexes)].slice(0, 2)) {
    const edge = edges[movingEdgeIndex];
    if (!edge || !Number.isInteger(movingEdgeIndex)) continue;
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
    const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
    if (!sourceRect || !targetRect) continue;
    const otherSegments = segments.filter(segment => segment.edgeIndex !== movingEdgeIndex);
    const countStrict = createDisplayStrictCrossingCounter(otherSegments);
    const otherRects = [...obstacles].filter(([id]) => id !== edge.source && id !== edge.target)
      .map(([, rect]) => rect);
    const currentPath = getDisplayComputedPath(edge);
    for (const sourceSide of SIDES) {
      if (!displayTerminalSideCanSwitch(edge, 'source', sourceSide)) continue;
      const source = displayTerminalPositionIsFixed(edge, 'source')
        ? currentPath[0] : anchorForHandle(sourceRect, sourceSide);
      if (!isFinitePoint(source)) continue;
      const sourceStub = outward(source, sourceSide, minStub);
      for (const targetSide of SIDES) {
        if (!displayTerminalSideCanSwitch(edge, 'target', targetSide)) continue;
        const target = displayTerminalPositionIsFixed(edge, 'target')
          ? currentPath[currentPath.length - 1] : anchorForHandle(targetRect, targetSide);
        if (!isFinitePoint(target)) continue;
        const targetStub = outward(target, targetSide, minStub);
        for (const x of xs) for (const y of ys) {
          const ring = { x, y };
          for (const item of buildOuterTerminalCorridorPaths(
            source, sourceStub, target, targetStub, ring, otherRects, minStub,
          )) {
            const key = `${movingEdgeIndex}:${sourceSide}:${targetSide}:${JSON.stringify(item.path)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const candidateEdge = withDisplayPortBridge(edge, item.path, sourceSide, targetSide);
            if (countRoutingObstacleHits(item.path, candidateEdge, obstacles) > 0
              || countStrict(item.path) > 0
              || candidateUnrelatedOverlapForEdge(movingEdgeIndex, item.path, edges, otherSegments)
                >= MIN_EDGE_PATH_PENALIZED_OVERLAP) continue;
            const quickScore = item.path.slice(1).reduce((length, point, index) => length
              + Math.abs(point.x - item.path[index].x) + Math.abs(point.y - item.path[index].y), 0);
            if (!Number.isFinite(quickScore)) continue;
            candidates.push({
              edges: edges.map((current, index) => index === movingEdgeIndex ? candidateEdge : current) as T,
              movingEdgeIndex, ringAxis: item.ringAxis,
              ringLane: item.ringAxis === 'x' ? x : y, transitionLane: item.transitionLane,
              quickScore,
            });
          }
        }
      }
    }
  }
  return candidates.sort((first, second) => first.quickScore - second.quickScore).slice(0, Math.min(64, limit));
};
