import type { Edge, Node } from '@xyflow/react';

import { routeStrictCrossingMazeCandidate } from '../../strategies/shared/edgeDetachedStrictCrossingMaze';
import {
  displayAxisOf,
  getDisplayComputedPath,
  getDisplayNodeRect,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';

const samePoint = (first: DisplayPoint, second: DisplayPoint): boolean => (
  Math.abs(first.x - second.x) <= 0.5 && Math.abs(first.y - second.y) <= 0.5
);

const intersectsMazeGrid = (
  node: Node,
  center: DisplayPoint,
): boolean => {
  const rect = getDisplayNodeRect(node);
  return Boolean(rect
    && rect.x <= center.x + 320
    && rect.x + rect.width >= center.x - 320
    && rect.y <= center.y + 320
    && rect.y + rect.height >= center.y - 320);
};

const pathSegmentFor = (
  edges: Edge[],
  segment: DisplaySegment,
): { edge: Edge; path: DisplayPoint[]; start: DisplayPoint; end: DisplayPoint } | null => {
  if (!Number.isInteger(segment.edgeIndex) || !Number.isInteger(segment.segmentIndex)) return null;
  const edge = edges[segment.edgeIndex];
  if (!edge) return null;
  const path = getDisplayComputedPath(edge);
  const start = path[segment.segmentIndex];
  const end = path[segment.segmentIndex + 1];
  if (!start || !end || displayAxisOf(start, end) !== segment.axis) return null;
  if (!samePoint(start, segment.a) || !samePoint(end, segment.b)) return null;
  return { edge, path, start, end };
};

const strictPerpendicularCrosses = (
  moving: DisplaySegment,
  opposing: DisplaySegment,
): DisplayPoint | null => {
  if (moving.axis === opposing.axis) return null;
  const point = moving.axis === 'h'
    ? { x: opposing.a.x, y: moving.a.y }
    : { x: moving.a.x, y: opposing.a.y };
  const within = (value: number, first: number, second: number): boolean => (
    value > Math.min(first, second) + 0.5 && value < Math.max(first, second) - 0.5
  );
  const movingInside = moving.axis === 'h'
    ? within(point.x, moving.a.x, moving.b.x)
    : within(point.y, moving.a.y, moving.b.y);
  const opposingInside = opposing.axis === 'h'
    ? within(point.x, opposing.a.x, opposing.b.x)
    : within(point.y, opposing.a.y, opposing.b.y);
  return movingInside && opposingInside ? point : null;
};

/** Builds one local maze alternative; callers remain responsible for graph-wide acceptance. */
export const buildDisplaySegmentMazeCandidate = (
  edges: Edge[],
  nodes: Node[],
  moving: DisplaySegment,
  opposing: DisplaySegment,
): Edge | null => {
  const movingSegment = pathSegmentFor(edges, moving);
  const opposingSegment = pathSegmentFor(edges, opposing);
  if (!movingSegment || !opposingSegment || moving.edgeIndex === opposing.edgeIndex) return null;
  const crosspoint = strictPerpendicularCrosses(moving, opposing);
  if (!crosspoint) return null;

  const allPaths = edges.map(getDisplayComputedPath);
  const terminalCaps = moving.segmentIndex > 0 && moving.segmentIndex + 2 < movingSegment.path.length
    ? {
        startPredecessor: movingSegment.path[moving.segmentIndex - 1],
        endSuccessor: movingSegment.path[moving.segmentIndex + 2],
      }
    : undefined;
  const middle = routeStrictCrossingMazeCandidate(
    [movingSegment.start, movingSegment.end],
    0,
    [[movingSegment.start, movingSegment.end], [opposingSegment.start, opposingSegment.end]],
    [movingSegment.edge, opposingSegment.edge],
    nodes,
    {
      penaltyPaths: allPaths,
      penaltyEdges: edges,
      penaltyEdgeIndex: moving.edgeIndex,
      gridNodes: nodes.filter(node => intersectsMazeGrid(node, crosspoint)),
      terminalCaps,
    },
  );
  if (!middle) return null;
  return withDisplayComputedPath(movingSegment.edge, [
    ...movingSegment.path.slice(0, moving.segmentIndex),
    ...middle,
    ...movingSegment.path.slice(moving.segmentIndex + 2),
  ]);
};
