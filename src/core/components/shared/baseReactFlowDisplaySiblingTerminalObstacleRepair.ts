import type { Edge, Node } from '@xyflow/react';

import {
  compactOrthogonalPath,
} from './baseReactFlowDisplayEdgeCore';
import {
  displayAxisOf,
  displaySegmentIntersectsRect,
  getDisplayComputedPath,
  getDisplayNodeRect,
  RESIDUAL_PARALLEL_LANE_GAP,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplayRect,
} from './baseReactFlowDisplayGeometry';

const pointEquals = (first: DisplayPoint, second: DisplayPoint): boolean => (
  Math.abs(first.x - second.x) <= 0.5
  && Math.abs(first.y - second.y) <= 0.5
);

const edgeHasSiblingTerminalAtNode = (
  edge: Edge,
  nodeId: string,
  edges: readonly Edge[],
): boolean => edges.some(candidate => (
  candidate.id !== edge.id
  && (
    (candidate.source === edge.source && candidate.target === nodeId)
    || (candidate.target === edge.target && candidate.source === nodeId)
  )
));

const buildHorizontalSourceTrunkSkirts = (
  path: DisplayPoint[],
  segmentIndex: number,
  rect: DisplayRect,
): DisplayPoint[][] => {
  if (segmentIndex !== 1 || path.length < 4) return [];
  const start = path[segmentIndex];
  const end = path[segmentIndex + 1];
  const terminal = path[0];
  if (displayAxisOf(terminal, start) !== 'v') return [];
  const direction = Math.sign(end.x - start.x);
  const terminalDirection = Math.sign(start.y - terminal.y);
  if (direction === 0 || terminalDirection === 0) return [];

  const nearX = direction > 0
    ? rect.x - RESIDUAL_PARALLEL_LANE_GAP
    : rect.x + rect.width + RESIDUAL_PARALLEL_LANE_GAP;
  const farX = direction > 0
    ? rect.x + rect.width + RESIDUAL_PARALLEL_LANE_GAP
    : rect.x - RESIDUAL_PARALLEL_LANE_GAP;
  const laneValues = terminalDirection > 0
    ? [rect.y + rect.height + RESIDUAL_PARALLEL_LANE_GAP]
    : [rect.y - RESIDUAL_PARALLEL_LANE_GAP];

  return laneValues.map(lane => compactOrthogonalPath([
    ...path.slice(0, segmentIndex),
    { x: start.x, y: lane },
    { x: farX, y: lane },
    { x: farX, y: start.y },
    ...path.slice(segmentIndex + 1),
  ])).filter(candidate => (
    candidate.length >= 4
    && !pointEquals(candidate[0], candidate[1])
    && Math.abs(nearX - farX) >= RESIDUAL_PARALLEL_LANE_GAP
  ));
};

const buildVerticalSourceTrunkSkirts = (
  path: DisplayPoint[],
  segmentIndex: number,
  rect: DisplayRect,
): DisplayPoint[][] => {
  if (segmentIndex !== 1 || path.length < 4) return [];
  const start = path[segmentIndex];
  const end = path[segmentIndex + 1];
  const terminal = path[0];
  if (displayAxisOf(terminal, start) !== 'h') return [];
  const direction = Math.sign(end.y - start.y);
  const terminalDirection = Math.sign(start.x - terminal.x);
  if (direction === 0 || terminalDirection === 0) return [];

  const farY = direction > 0
    ? rect.y + rect.height + RESIDUAL_PARALLEL_LANE_GAP
    : rect.y - RESIDUAL_PARALLEL_LANE_GAP;
  const laneValues = terminalDirection > 0
    ? [rect.x + rect.width + RESIDUAL_PARALLEL_LANE_GAP]
    : [rect.x - RESIDUAL_PARALLEL_LANE_GAP];

  return laneValues.map(lane => compactOrthogonalPath([
    ...path.slice(0, segmentIndex),
    { x: lane, y: start.y },
    { x: lane, y: farY },
    { x: start.x, y: farY },
    ...path.slice(segmentIndex + 1),
  ])).filter(candidate => candidate.length >= 4 && !pointEquals(candidate[0], candidate[1]));
};

const reversePath = (path: DisplayPoint[]): DisplayPoint[] => [...path].reverse();

const buildTerminalTrunkSkirts = (
  path: DisplayPoint[],
  segmentIndex: number,
  rect: DisplayRect,
): DisplayPoint[][] => {
  const axis = displayAxisOf(path[segmentIndex], path[segmentIndex + 1]);
  const sourceCandidates = axis === 'h'
    ? buildHorizontalSourceTrunkSkirts(path, segmentIndex, rect)
    : axis === 'v'
      ? buildVerticalSourceTrunkSkirts(path, segmentIndex, rect)
      : [];
  const reversed = reversePath(path);
  const reversedSegmentIndex = path.length - segmentIndex - 2;
  const targetCandidates = axis === 'h'
    ? buildHorizontalSourceTrunkSkirts(reversed, reversedSegmentIndex, rect)
    : axis === 'v'
      ? buildVerticalSourceTrunkSkirts(reversed, reversedSegmentIndex, rect)
      : [];
  return [...sourceCandidates, ...targetCandidates.map(reversePath)];
};

/**
 * Generates atomic O2M/M2O branch skirts without shortening either terminal
 * trunk. A sibling endpoint node remains an absolute obstacle after trunk
 * synthesis; extending the adjacent trunk is safer than cutting that trunk.
 */
export const buildSiblingTerminalObstacleSkirtCandidates = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxCandidates = 24,
): T[] => {
  const nodeRects = nodes.flatMap(node => {
    const rect = getDisplayNodeRect(node);
    return rect ? [{ nodeId: node.id, rect }] : [];
  });
  const candidates: T[] = [];
  const seen = new Set<string>();

  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    const edge = edges[edgeIndex];
    const path = getDisplayComputedPath(edge);
    if (path.length < 4) continue;
    for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
      const first = path[segmentIndex];
      const second = path[segmentIndex + 1];
      for (const { nodeId, rect } of nodeRects) {
        if (
          nodeId === edge.source
          || nodeId === edge.target
          || !edgeHasSiblingTerminalAtNode(edge, nodeId, edges)
          || !displaySegmentIntersectsRect(first, second, rect)
        ) continue;
        for (const candidatePath of buildTerminalTrunkSkirts(path, segmentIndex, rect)) {
          const signature = `${edge.id}:${candidatePath.map(point => `${point.x}:${point.y}`).join('|')}`;
          if (seen.has(signature)) continue;
          seen.add(signature);
          candidates.push(edges.map((candidateEdge, candidateIndex) => (
            candidateIndex === edgeIndex
              ? withDisplayComputedPath(candidateEdge, candidatePath)
              : candidateEdge
          )) as T);
          if (candidates.length >= maxCandidates) return candidates;
        }
      }
    }
  }
  return candidates;
};
