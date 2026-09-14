import type { Edge, Node, XYPosition } from '@xyflow/react';

import { readEdgeTerminalPolicy } from '../../routing/utils/edgeTerminalPolicy';
import { computedEndpointPathOf } from './baseReactFlowDisplayEndpointCandidateQuality';
import {
  type AnchorSide,
  type NodeRect,
  getNodeRect,
} from './baseReactFlowDisplayEdgeGeometry';

const DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE = 2;
const DISPLAY_PORT_CORNER_INSET = 16;

type EndpointRole = 'source' | 'target';

type EndpointEdgeData = Record<string, unknown> & {
  treeRouting?: (Record<string, unknown> & { points?: unknown }) | null;
};

const clampToRange = (value: number, min: number, max: number): number => (
  Math.max(min, Math.min(max, value))
);

export const insetTerminalOnSide = (
  terminal: XYPosition,
  rect: NodeRect,
  side: AnchorSide,
): XYPosition => {
  if (side === 'left' || side === 'right') {
    const minY = rect.y + Math.min(DISPLAY_PORT_CORNER_INSET, rect.height / 2);
    const maxY = rect.y + rect.height - Math.min(DISPLAY_PORT_CORNER_INSET, rect.height / 2);
    return {
      x: side === 'left' ? rect.x : rect.x + rect.width,
      y: clampToRange(terminal.y, minY, maxY),
    };
  }
  const minX = rect.x + Math.min(DISPLAY_PORT_CORNER_INSET, rect.width / 2);
  const maxX = rect.x + rect.width - Math.min(DISPLAY_PORT_CORNER_INSET, rect.width / 2);
  return {
    x: clampToRange(terminal.x, minX, maxX),
    y: side === 'top' ? rect.y : rect.y + rect.height,
  };
};

const closestRectSide = (point: XYPosition, rect: NodeRect): AnchorSide => {
  const distances: Array<{ side: AnchorSide; distance: number }> = [
    { side: 'left', distance: Math.abs(point.x - rect.x) },
    { side: 'right', distance: Math.abs(point.x - (rect.x + rect.width)) },
    { side: 'top', distance: Math.abs(point.y - rect.y) },
    { side: 'bottom', distance: Math.abs(point.y - (rect.y + rect.height)) },
  ];
  distances.sort((first, second) => first.distance - second.distance);
  return distances[0].side;
};

const pointDistanceToSide = (point: XYPosition, rect: NodeRect, side: AnchorSide): number => {
  if (side === 'left') return Math.abs(point.x - rect.x);
  if (side === 'right') return Math.abs(point.x - (rect.x + rect.width));
  if (side === 'top') return Math.abs(point.y - rect.y);
  return Math.abs(point.y - (rect.y + rect.height));
};

const segmentLeavesTowardSide = (
  start: XYPosition,
  end: XYPosition,
  side: AnchorSide,
): boolean => {
  if (side === 'left') return Math.abs(start.y - end.y) <= 0.5 && end.x < start.x - 0.5;
  if (side === 'right') return Math.abs(start.y - end.y) <= 0.5 && end.x > start.x + 0.5;
  if (side === 'top') return Math.abs(start.x - end.x) <= 0.5 && end.y < start.y - 0.5;
  return Math.abs(start.x - end.x) <= 0.5 && end.y > start.y + 0.5;
};

const removeDegenerateDisplayPathPoints = (path: XYPosition[]): XYPosition[] => (
  path.filter((point, index) => {
    if (index === 0) return true;
    const previous = path[index - 1];
    return Math.abs(point.x - previous.x) > 0.5 || Math.abs(point.y - previous.y) > 0.5;
  })
);

const centeredTerminalOnSide = (rect: NodeRect, side: AnchorSide): XYPosition => {
  if (side === 'left' || side === 'right') {
    return {
      x: side === 'left' ? rect.x : rect.x + rect.width,
      y: rect.y + rect.height / 2,
    };
  }
  return {
    x: rect.x + rect.width / 2,
    y: side === 'top' ? rect.y : rect.y + rect.height,
  };
};

const terminalSideKey = (nodeId: string, side: AnchorSide): string => `${nodeId}:${side}`;

const terminalInfoForRole = (
  edge: Edge,
  role: EndpointRole,
  nodeById: Map<string, Node>,
): { nodeId: string; rect: NodeRect; point: XYPosition; adjacent: XYPosition; side: AnchorSide } | null => {
  const path = computedEndpointPathOf(edge);
  if (path.length < 2) return null;
  const nodeId = role === 'source' ? edge.source : edge.target;
  const rect = getNodeRect(nodeById.get(nodeId), nodeById);
  if (!rect) return null;
  const terminal = role === 'source' ? path[0] : path[path.length - 1];
  const adjacent = role === 'source' ? path[1] : path[path.length - 2];
  if (!terminal || !adjacent) return null;
  const side = closestRectSide(terminal, rect);
  if (
    pointDistanceToSide(terminal, rect, side) > DISPLAY_ENDPOINT_BOUNDARY_TOLERANCE
    || !segmentLeavesTowardSide(terminal, adjacent, side)
  ) return null;
  return { nodeId, rect, point: terminal, adjacent, side };
};

export const countTerminalsByNodeSide = (
  edges: Edge[],
  nodeById: Map<string, Node>,
): Map<string, number> => {
  const counts = new Map<string, number>();
  edges.forEach((edge) => {
    (['source', 'target'] as const).forEach((role) => {
      const info = terminalInfoForRole(edge, role, nodeById);
      if (!info) return;
      const key = terminalSideKey(info.nodeId, info.side);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });
  return counts;
};

const centerUniqueTerminalRole = (
  edge: Edge,
  role: EndpointRole,
  nodeById: Map<string, Node>,
  terminalCounts: Map<string, number>,
): Edge => {
  if (readEdgeTerminalPolicy(edge, role).sideFixed) return edge;
  const data = (edge.data || {}) as EndpointEdgeData;
  const path = computedEndpointPathOf(edge);
  if (path.length < 2) return edge;
  const info = terminalInfoForRole(edge, role, nodeById);
  if (!info || terminalCounts.get(terminalSideKey(info.nodeId, info.side)) !== 1) return edge;
  const centered = centeredTerminalOnSide(info.rect, info.side);
  if (
    Math.abs(centered.x - info.point.x) <= 0.5
    && Math.abs(centered.y - info.point.y) <= 0.5
  ) return edge;
  const candidatePath = path.map(point => ({ ...point }));
  const terminalIndex = role === 'source' ? 0 : candidatePath.length - 1;
  const adjacentIndex = role === 'source' ? 1 : candidatePath.length - 2;
  const adjacent = candidatePath[adjacentIndex];
  candidatePath[terminalIndex] = centered;
  candidatePath[adjacentIndex] = info.side === 'top' || info.side === 'bottom'
    ? { ...adjacent, x: centered.x }
    : { ...adjacent, y: centered.y };
  const committedPath = removeDegenerateDisplayPathPoints(candidatePath);
  return {
    ...edge,
    data: {
      ...data,
      computedPath: committedPath,
      treeRouting: data.treeRouting && Array.isArray(data.treeRouting.points)
        ? { ...data.treeRouting, points: committedPath }
        : data.treeRouting,
      renderPortCenterAligned: true,
    },
  };
};

export const centerUniqueAutoTerminals = (
  edge: Edge,
  nodeById: Map<string, Node>,
  terminalCounts: Map<string, number>,
): Edge => {
  const sourceCentered = centerUniqueTerminalRole(edge, 'source', nodeById, terminalCounts);
  return centerUniqueTerminalRole(sourceCentered, 'target', nodeById, terminalCounts);
};
