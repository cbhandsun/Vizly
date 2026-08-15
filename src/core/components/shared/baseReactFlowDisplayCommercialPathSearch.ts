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
  extractDisplaySegments,
  getDisplayComputedPath,
  NEAR_PARALLEL_LANE_TOLERANCE,
} from './baseReactFlowDisplayGeometry';
import { MIN_RENDER_SAFE_ENDPOINT_STUB } from './baseReactFlowDisplayEndpointStubRepair';
import { withDisplayPortBridge } from './baseReactFlowDisplayTerminalPortBridge';
import {
  displayTerminalSideCanSwitch,
  resolveDisplayTerminalHandleForSide,
  type DisplayTerminalSide,
} from './baseReactFlowDisplayTerminalPolicy';

const COMMERCIAL_PATH_SEARCH_GRID_SIZE = 16;
const MAX_COMMERCIAL_PATH_SEARCH_CANDIDATES = 8;
const MAX_COMMERCIAL_PATH_SEARCH_POINTS = 8;
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

const commercialObstacles = (
  edge: Edge,
  nodes: Node[],
  nodeById: Map<string, Node>,
): Rectangle[] => nodes.flatMap((node) => {
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

const routedLineObstacles = (edge: Edge, allEdges: readonly Edge[]): LineObstacle[] => (
  extractDisplaySegments(allEdges.filter(candidate => candidate.id !== edge.id))
    .map(segment => ({ start: segment.a, end: segment.b }))
);

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
  const lineObstacles = routedLineObstacles(edge, allEdges);
  const obstacles = [
    ...commercialObstacles(edge, nodes, nodeById),
    ...routedLineBarriers(lineObstacles),
  ];
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
      MIN_RENDER_SAFE_ENDPOINT_STUB + COMMERCIAL_PATH_SEARCH_GRID_SIZE * 2,
    );
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
        MIN_RENDER_SAFE_ENDPOINT_STUB + COMMERCIAL_PATH_SEARCH_GRID_SIZE * 2,
      );
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
      const compactedPath = getDisplayComputedPath(path);
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
