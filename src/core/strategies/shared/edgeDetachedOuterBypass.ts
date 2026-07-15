import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  allSegmentsOrthogonal,
  axisOf,
  compactPath,
  nodeRect,
  pathEquals,
  pathLength,
  type Point,
} from './edgeDetachedOverlapGeometry';

const OUTER_LANE_CLEARANCE = 24;
const LOCAL_PATH_PADDING = 96;
const MAX_OUTER_BYPASS_CANDIDATES = 32;
const MAX_OUTER_BYPASS_NODES = 500;
const MAX_OUTER_BYPASS_POINTS = 2_000;
const MAX_ABS_COORDINATE = 1_000_000_000;
const IGNORED_NODE_TYPES = new Set(['titleGroup', 'subGroup', 'group', 'domain']);

export type DetachedOuterBypassOptions = Readonly<{
  includeAxisPreservingEnvelope?: boolean;
}>;

/**
 * Builds bounded outer-lane alternatives for a locally topology-locked edge.
 * Exact graph-quality and obstacle acceptance remains the caller's responsibility.
 */
export function buildDetachedOuterBypassCandidates(
  path: Point[],
  edge: Edge,
  nodes: ReactFlowNode[],
  options: DetachedOuterBypassOptions = {},
): Point[][] {
  if (
    !Array.isArray(path)
    || path.length < 2
    || path.length > MAX_OUTER_BYPASS_POINTS
    || !edge
    || typeof edge !== 'object'
    || !Array.isArray(nodes)
    || nodes.length > MAX_OUTER_BYPASS_NODES
    || !options
    || typeof options !== 'object'
    || Array.isArray(options)
    || (
      options.includeAxisPreservingEnvelope !== undefined
      && typeof options.includeAxisPreservingEnvelope !== 'boolean'
    )
  ) return [];

  let pathMinX = Number.POSITIVE_INFINITY;
  let pathMaxX = Number.NEGATIVE_INFINITY;
  let pathMinY = Number.POSITIVE_INFINITY;
  let pathMaxY = Number.NEGATIVE_INFINITY;
  for (const point of path) {
    if (
      !point
      || typeof point.x !== 'number'
      || typeof point.y !== 'number'
      || !Number.isFinite(point.x)
      || !Number.isFinite(point.y)
      || Math.abs(point.x) > MAX_ABS_COORDINATE
      || Math.abs(point.y) > MAX_ABS_COORDINATE
    ) return [];
    pathMinX = Math.min(pathMinX, point.x);
    pathMaxX = Math.max(pathMaxX, point.x);
    pathMinY = Math.min(pathMinY, point.y);
    pathMaxY = Math.max(pathMaxY, point.y);
  }
  const start = path[0];
  const end = path[path.length - 1];
  const originalFirstAxis = axisOf(path[0], path[1]);
  const originalLastAxis = axisOf(path[path.length - 2], path[path.length - 1]);
  const minX = pathMinX - LOCAL_PATH_PADDING;
  const maxX = pathMaxX + LOCAL_PATH_PADDING;
  const minY = pathMinY - LOCAL_PATH_PADDING;
  const maxY = pathMaxY + LOCAL_PATH_PADDING;
  const candidates: Point[][] = [];

  for (const node of nodes) {
    if (!node || typeof node !== 'object') return [];
    if (node.id === edge.source || node.id === edge.target) continue;
    if (IGNORED_NODE_TYPES.has(String(node.type || ''))) continue;
    const rect = nodeRect(node);
    if (!rect) continue;
    if (
      rect.x > maxX
      || rect.x + rect.width < minX
      || rect.y > maxY
      || rect.y + rect.height < minY
    ) continue;
    const laneXs = [
      rect.x - OUTER_LANE_CLEARANCE,
      rect.x + rect.width + OUTER_LANE_CLEARANCE,
    ];
    const laneYs = [
      rect.y - OUTER_LANE_CLEARANCE,
      rect.y + rect.height + OUTER_LANE_CLEARANCE,
    ];
    if (
      options.includeAxisPreservingEnvelope === true
      && path.length >= 4
      && originalFirstAxis === 'h'
      && originalLastAxis === 'h'
    ) {
      const sourceTurn = path[1];
      const targetTurn = path[path.length - 2];
      for (const laneY of laneYs) {
        candidates.push(compactPath([
          start,
          sourceTurn,
          { x: sourceTurn.x, y: laneY },
          { x: targetTurn.x, y: laneY },
          targetTurn,
          end,
        ]));
      }
    }
    if (
      options.includeAxisPreservingEnvelope === true
      && path.length >= 4
      && originalFirstAxis === 'v'
      && originalLastAxis === 'v'
    ) {
      const sourceTurn = path[1];
      const targetTurn = path[path.length - 2];
      for (const laneX of laneXs) {
        candidates.push(compactPath([
          start,
          sourceTurn,
          { x: laneX, y: sourceTurn.y },
          { x: laneX, y: targetTurn.y },
          targetTurn,
          end,
        ]));
      }
    }
    for (const laneX of laneXs) {
      for (const laneY of laneYs) {
        candidates.push(compactPath([
          start,
          { x: laneX, y: start.y },
          { x: laneX, y: laneY },
          { x: end.x, y: laneY },
          end,
        ]));
        candidates.push(compactPath([
          start,
          { x: start.x, y: laneY },
          { x: laneX, y: laneY },
          { x: laneX, y: end.y },
          end,
        ]));
      }
    }
  }

  const seen = new Set<string>();
  return candidates
    .filter(candidate => {
      if (candidate.length < 2 || !allSegmentsOrthogonal(candidate)) return false;
      if (pathEquals(candidate, compactPath(path))) return false;
      if (edge.sourceHandle != null && axisOf(candidate[0], candidate[1]) !== originalFirstAxis) return false;
      if (
        edge.targetHandle != null
        && axisOf(candidate[candidate.length - 2], candidate[candidate.length - 1]) !== originalLastAxis
      ) return false;
      const signature = candidate.map(point => `${point.x}:${point.y}`).join('|');
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .sort((first, second) => pathLength(first) - pathLength(second))
    .slice(0, MAX_OUTER_BYPASS_CANDIDATES);
}
