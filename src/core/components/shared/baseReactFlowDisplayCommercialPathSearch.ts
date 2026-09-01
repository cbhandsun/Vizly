import type { Edge, Node } from '@xyflow/react';

import {
  buildPathfindingGrid,
  findPath,
  type LineObstacle,
  type Rectangle,
} from '../../algorithms/pathfinding';
import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import {
  anchorForHandle,
  getNodeRect,
  sideForHandle,
} from './baseReactFlowDisplayEdgeGeometry';
import {
  compactDisplayEdgePaths,
  displaySegmentOverlap,
  displaySegmentsForPath,
  extractDisplaySegments,
  getDisplayComputedPath,
  isDisplayContainerNode,
  isProtectedDisplaySharedTrunkPair,
  NEAR_PARALLEL_LANE_TOLERANCE,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import { MIN_RENDER_SAFE_ENDPOINT_STUB } from './baseReactFlowDisplayEndpointStubRepair';
import { createDisplayStrictCrossingCounter } from './baseReactFlowDisplayStrictCrossingCounter';
import { withDisplayPortBridge } from './baseReactFlowDisplayTerminalPortBridge';
import {
  displayTerminalSideCanSwitch,
  resolveDisplayTerminalHandleForSide,
  type DisplayTerminalSide,
} from './baseReactFlowDisplayTerminalPolicy';

const COMMERCIAL_PATH_SEARCH_GRID_SIZE = 16;
const MAX_COMMERCIAL_PATH_SEARCH_CANDIDATES = 8;
const MAX_COMMERCIAL_PATH_SEARCH_POINTS = 8;
const COMMERCIAL_PATH_SEARCH_LEAD_DISTANCE = MIN_RENDER_SAFE_ENDPOINT_STUB
  + COMMERCIAL_PATH_SEARCH_GRID_SIZE * 2;
const TERMINAL_SIDES: readonly DisplayTerminalSide[] = ['left', 'right', 'top', 'bottom'];

const terminalStub = (
  anchor: { x: number; y: number },
  side: DisplayTerminalSide,
  distance = MIN_RENDER_SAFE_ENDPOINT_STUB,
): { x: number; y: number } => {
  switch (side) {
    case 'left': return { x: anchor.x - distance, y: anchor.y };
    case 'right': return { x: anchor.x + distance, y: anchor.y };
    case 'top': return { x: anchor.x, y: anchor.y - distance };
    case 'bottom': return { x: anchor.x, y: anchor.y + distance };
  }
};

const terminalAxisDistance = (
  anchor: DisplayPoint,
  adjacent: DisplayPoint | undefined,
  side: DisplayTerminalSide,
): number | null => {
  if (!adjacent) return null;
  const aligned = side === 'left' || side === 'right'
    ? Math.abs(adjacent.y - anchor.y) <= 0.5
    : Math.abs(adjacent.x - anchor.x) <= 0.5;
  const pointsOutward = side === 'left'
    ? adjacent.x <= anchor.x
    : side === 'right'
      ? adjacent.x >= anchor.x
      : side === 'top'
        ? adjacent.y <= anchor.y
        : adjacent.y >= anchor.y;
  if (!aligned || !pointsOutward) return null;
  const distance = side === 'left' || side === 'right'
    ? Math.abs(adjacent.x - anchor.x)
    : Math.abs(adjacent.y - anchor.y);
  return Number.isFinite(distance) ? distance : null;
};

const preservedTerminalLeadDistance = (
  anchor: DisplayPoint,
  adjacent: DisplayPoint | undefined,
  side: DisplayTerminalSide,
): number => Math.max(
  COMMERCIAL_PATH_SEARCH_LEAD_DISTANCE,
  terminalAxisDistance(anchor, adjacent, side) ?? 0,
);

export const preserveCommercialPathSearchTerminalCorridor = (
  path: DisplayPoint[],
  anchor: DisplayPoint,
  baselineAdjacent: DisplayPoint | undefined,
  side: DisplayTerminalSide,
  role: 'source' | 'target',
): DisplayPoint[] => {
  const requiredDistance = terminalAxisDistance(anchor, baselineAdjacent, side);
  if (!requiredDistance || path.length < 3) return path;
  const adjacentIndex = role === 'source' ? 1 : path.length - 2;
  const bendIndex = role === 'source' ? 2 : path.length - 3;
  const adjacent = path[adjacentIndex];
  const bend = path[bendIndex];
  const candidateDistance = terminalAxisDistance(anchor, adjacent, side);
  if (!adjacent || !bend || candidateDistance === null
    || candidateDistance + 1e-6 >= requiredDistance) return path;
  const horizontalTerminal = side === 'left' || side === 'right';
  const bendAligned = horizontalTerminal
    ? Math.abs(bend.x - adjacent.x) <= 0.5
    : Math.abs(bend.y - adjacent.y) <= 0.5;
  if (!bendAligned) return path;
  const coordinate = horizontalTerminal
    ? anchor.x + (side === 'left' ? -requiredDistance : requiredDistance)
    : anchor.y + (side === 'top' ? -requiredDistance : requiredDistance);
  const preserved = path.map(point => ({ ...point }));
  if (horizontalTerminal) {
    preserved[adjacentIndex].x = coordinate;
    preserved[bendIndex].x = coordinate;
  } else {
    preserved[adjacentIndex].y = coordinate;
    preserved[bendIndex].y = coordinate;
  }
  return preserved;
};

const commercialObstacles = (
  edge: Edge,
  nodes: Node[],
  nodeById: Map<string, Node>,
): Rectangle[] => nodes.flatMap((node) => {
  if (isDisplayContainerNode(node)) return [];
  const rect = getNodeRect(node, nodeById);
  if (!rect) return [];
  if (node.id === edge.source || node.id === edge.target) {
    return [{ ...rect, padding: 0 }];
  }
  return [{
    x: rect.x - COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    y: rect.y - COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    width: rect.width + COMMERCIAL_BUSINESS_NODE_CLEARANCE * 2,
    height: rect.height + COMMERCIAL_BUSINESS_NODE_CLEARANCE * 2,
    padding: 0,
  }];
});

const routedLineBarriers = (lineObstacles: readonly LineObstacle[]): Rectangle[] => {
  const halfGap = NEAR_PARALLEL_LANE_TOLERANCE + 1;
  return lineObstacles.flatMap(({ start, end }) => {
    if (Math.abs(start.y - end.y) <= 0.5) {
      return [{
        x: Math.min(start.x, end.x),
        y: start.y - halfGap,
        width: Math.abs(end.x - start.x),
        height: halfGap * 2,
        padding: 0,
      }];
    }
    if (Math.abs(start.x - end.x) <= 0.5) {
      return [{
        x: start.x - halfGap,
        y: Math.min(start.y, end.y),
        width: halfGap * 2,
        height: Math.abs(end.y - start.y),
        padding: 0,
      }];
    }
    return [];
  });
};

/**
 * Bounded grid search used only as a hard-defect fallback after cheaper
 * terminal shortcuts fail. Node rectangles carry the commercial clearance,
 * while existing routes become soft line obstacles whose remaining conflicts
 * are rejected by the caller's exact graph-wide hard gate.
 */
export const buildCommercialPathSearchTerminalCandidates = (
  edge: Edge,
  nodes: Node[],
  allEdges: readonly Edge[],
): Edge[] => {
  const baselinePath = getDisplayComputedPath(edge);
  if (baselinePath.length < 2 || nodes.length === 0) return [];
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const sourceRect = getNodeRect(nodeById.get(edge.source), nodeById);
  const targetRect = getNodeRect(nodeById.get(edge.target), nodeById);
  if (!sourceRect || !targetRect) return [];
  const frozenEdges = allEdges.filter(candidate => candidate.id !== edge.id);
  const routedSegments = extractDisplaySegments(frozenEdges);
  const lineObstacles: LineObstacle[] = routedSegments.map(segment => ({ start: segment.a, end: segment.b }));
  const countLeadCrossings = createDisplayStrictCrossingCounter(routedSegments);
  const leadIsBlocked = (path: DisplayPoint[]): boolean => {
    if (countLeadCrossings(path) > 0) return true;
    const [lead] = displaySegmentsForPath(path, -1);
    if (!lead) return true;
    return routedSegments.some(segment => {
      if (displaySegmentOverlap(lead, segment) <= 0.5) return false;
      const frozen = frozenEdges[segment.edgeIndex];
      return !isProtectedDisplaySharedTrunkPair(
        lead, path, edge, segment, getDisplayComputedPath(frozen), frozen,
      );
    });
  };
  const obstacles = [
    ...commercialObstacles(edge, nodes, nodeById),
    ...routedLineBarriers(lineObstacles),
  ];
  const currentSourceSide = sideForHandle(edge.sourceHandle);
  const currentTargetSide = sideForHandle(edge.targetHandle);
  const candidates: Edge[] = [];
  const seen = new Set<string>();

  for (const sourceSide of TERMINAL_SIDES) {
    if (!displayTerminalSideCanSwitch(edge, 'source', sourceSide)) continue;
    const sourceHandle = resolveDisplayTerminalHandleForSide(edge, 'source', sourceSide);
    const sourceAnchor = anchorForHandle(sourceRect, sourceHandle);
    const sourceStub = terminalStub(sourceAnchor, sourceSide);
    const sourceLead = terminalStub(
      sourceAnchor,
      sourceSide,
      sourceSide === currentSourceSide
        ? preservedTerminalLeadDistance(sourceAnchor, baselinePath[1], sourceSide)
        : COMMERCIAL_PATH_SEARCH_LEAD_DISTANCE,
    );
    // The grid begins beyond the terminal stub. A blocked entry cannot be
    // repaired by its interior search and must not consume the candidate cap.
    if (leadIsBlocked([sourceAnchor, sourceLead])) continue;
    const targetSides = currentTargetSide
      ? [
        currentTargetSide,
        ...TERMINAL_SIDES.filter(side => side !== currentTargetSide).sort((first, second) => (
          Number(second === sourceSide) - Number(first === sourceSide)
        )),
      ]
      : TERMINAL_SIDES;
    for (const targetSide of targetSides) {
      if (!displayTerminalSideCanSwitch(edge, 'target', targetSide)) continue;
      const targetHandle = resolveDisplayTerminalHandleForSide(edge, 'target', targetSide);
      const targetAnchor = anchorForHandle(targetRect, targetHandle);
      const targetStub = terminalStub(targetAnchor, targetSide);
      const targetLead = terminalStub(
        targetAnchor,
        targetSide,
        targetSide === currentTargetSide
          ? preservedTerminalLeadDistance(
            targetAnchor,
            baselinePath.at(-2),
            targetSide,
          )
          : COMMERCIAL_PATH_SEARCH_LEAD_DISTANCE,
      );
      if (leadIsBlocked([targetLead, targetAnchor])) continue;
      const grid = buildPathfindingGrid(
        obstacles,
        {
          startX: sourceLead.x,
          startY: sourceLead.y,
          endX: targetLead.x,
          endY: targetLead.y,
        },
        COMMERCIAL_PATH_SEARCH_GRID_SIZE,
      );
      const searched = findPath(
        sourceLead,
        targetLead,
        obstacles,
        COMMERCIAL_PATH_SEARCH_GRID_SIZE,
        lineObstacles,
        undefined,
        grid,
        [],
        true,
      );
      if (!searched || searched.length < 2) continue;
      const normalizedSearch = searched.map((point, index) => {
        if (index === 0) return sourceLead;
        if (index === searched.length - 1) return targetLead;
        return point;
      });
      const path = compactDisplayEdgePaths([{
        ...edge,
        data: {
          ...edge.data,
          computedPath: [
            sourceAnchor,
            sourceStub,
            sourceLead,
            ...normalizedSearch,
            targetLead,
            targetStub,
            targetAnchor,
          ],
        },
      }])[0];
      let compactedPath = getDisplayComputedPath(path);
      if (sourceSide === currentSourceSide) {
        compactedPath = preserveCommercialPathSearchTerminalCorridor(
          compactedPath,
          sourceAnchor,
          baselinePath[1],
          sourceSide,
          'source',
        );
      }
      if (targetSide === currentTargetSide) {
        compactedPath = preserveCommercialPathSearchTerminalCorridor(
          compactedPath,
          targetAnchor,
          baselinePath.at(-2),
          targetSide,
          'target',
        );
      }
      const signature = compactedPath.map(point => `${point.x}:${point.y}`).join('|');
      if (
        compactedPath.length < 2
        || compactedPath.length > MAX_COMMERCIAL_PATH_SEARCH_POINTS
        || seen.has(signature)
      ) continue;
      seen.add(signature);
      candidates.push(withDisplayPortBridge(
        edge,
        compactedPath,
        sourceSide,
        targetSide,
      ));
      if (candidates.length >= MAX_COMMERCIAL_PATH_SEARCH_CANDIDATES) return candidates;
    }
  }
  return candidates;
};
