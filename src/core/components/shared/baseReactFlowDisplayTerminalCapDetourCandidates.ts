import type { Edge, Node } from '@xyflow/react';

import {
  compactOrthogonalPath,
  isFinitePoint,
} from './baseReactFlowDisplayEdgeCore';
import {
  displayAxisOf,
  getDisplayNodeRect,
  type DisplayPoint,
  type DisplayRect,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';

const MIN_DISPLAY_ENDPOINT_STUB = 48;
const TERMINAL_BOUNDARY_TOLERANCE = 2;

type HandleSide = 'top' | 'right' | 'bottom' | 'left';

const normalizedHandleSide = (value: unknown): HandleSide | null => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'top' || normalized.endsWith('-top')) return 'top';
  if (normalized === 'right' || normalized.endsWith('-right')) return 'right';
  if (normalized === 'bottom' || normalized.endsWith('-bottom')) return 'bottom';
  if (normalized === 'left' || normalized.endsWith('-left')) return 'left';
  return null;
};

const handleAxis = (side: HandleSide): 'h' | 'v' => (
  side === 'left' || side === 'right' ? 'h' : 'v'
);

const terminalLiesOnDeclaredSide = (
  point: DisplayPoint,
  rect: DisplayRect,
  side: HandleSide,
): boolean => {
  if (side === 'top') return Math.abs(point.y - rect.y) <= TERMINAL_BOUNDARY_TOLERANCE;
  if (side === 'bottom') {
    return Math.abs(point.y - (rect.y + rect.height)) <= TERMINAL_BOUNDARY_TOLERANCE;
  }
  if (side === 'left') return Math.abs(point.x - rect.x) <= TERMINAL_BOUNDARY_TOLERANCE;
  return Math.abs(point.x - (rect.x + rect.width)) <= TERMINAL_BOUNDARY_TOLERANCE;
};

const terminalSegmentUsesOuterHemisphere = (
  terminal: DisplayPoint,
  adjacent: DisplayPoint,
  side: HandleSide,
): boolean => {
  if (side === 'top') return adjacent.y < terminal.y - TERMINAL_BOUNDARY_TOLERANCE;
  if (side === 'bottom') return adjacent.y > terminal.y + TERMINAL_BOUNDARY_TOLERANCE;
  if (side === 'left') return adjacent.x < terminal.x - TERMINAL_BOUNDARY_TOLERANCE;
  return adjacent.x > terminal.x + TERMINAL_BOUNDARY_TOLERANCE;
};

const terminalCapLane = (
  rect: DisplayRect,
  side: HandleSide,
  clearance: number,
): number => {
  if (side === 'top') return rect.y + rect.height + clearance;
  if (side === 'bottom') return rect.y - clearance;
  if (side === 'left') return rect.x + rect.width + clearance;
  return rect.x - clearance;
};

const exactPathSignature = (path: readonly DisplayPoint[]): string => (
  path.map(point => `${point.x},${point.y}`).join(';')
);

const liesStrictlyBetween = (value: number, first: number, second: number): boolean => (
  value > Math.min(first, second) + TERMINAL_BOUNDARY_TOLERANCE
  && value < Math.max(first, second) - TERMINAL_BOUNDARY_TOLERANCE
);

type TerminalSpec = {
  nodeId: string;
  point: DisplayPoint;
  adjacent: DisplayPoint;
  side: HandleSide | null;
};

const terminalSpecs = (
  edge: Edge,
  path: readonly DisplayPoint[],
  segment: DisplaySegment,
): TerminalSpec[] => {
  const specs: TerminalSpec[] = [];
  if (segment.segmentIndex === 0 && path[0] && path[1]) {
    specs.push({
      nodeId: edge.source,
      point: path[0],
      adjacent: path[1],
      side: normalizedHandleSide(edge.sourceHandle),
    });
  }
  if (segment.segmentIndex === path.length - 2 && path[path.length - 1] && path[path.length - 2]) {
    specs.push({
      nodeId: edge.target,
      point: path[path.length - 1],
      adjacent: path[path.length - 2],
      side: normalizedHandleSide(edge.targetHandle),
    });
  }
  return specs;
};

/**
 * Builds a bounded detour around the node that caps a competing terminal
 * segment. A local crossing zipper cannot pass such a segment without
 * entering either terminal node, so the mover crosses behind the whole node
 * on the hemisphere opposite that terminal's declared handle.
 */
export const buildTerminalCapDetourCandidates = (
  path: readonly DisplayPoint[],
  segment: DisplaySegment,
  otherPath: readonly DisplayPoint[],
  otherSegment: DisplaySegment,
  otherEdge: Edge,
  nodes: readonly Node[],
  clearance = MIN_DISPLAY_ENDPOINT_STUB,
): DisplayPoint[][] => {
  if (
    clearance < MIN_DISPLAY_ENDPOINT_STUB
    || path.length < 4
    || otherPath.length < 2
    || segment.axis === otherSegment.axis
    || segment.segmentIndex <= 0
    || segment.segmentIndex >= path.length - 2
  ) return [];

  const start = path[segment.segmentIndex];
  const end = path[segment.segmentIndex + 1];
  if (!start || !end || displayAxisOf(start, end) !== segment.axis) return [];

  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const candidates: DisplayPoint[][] = [];
  const seen = new Set<string>();

  for (const terminal of terminalSpecs(otherEdge, otherPath, otherSegment)) {
    const side = terminal.side;
    const terminalNode = nodeById.get(terminal.nodeId);
    const rect = terminalNode ? getDisplayNodeRect(terminalNode) : null;
    if (
      !side
      || !rect
      || handleAxis(side) !== otherSegment.axis
      || !terminalLiesOnDeclaredSide(terminal.point, rect, side)
      || !terminalSegmentUsesOuterHemisphere(terminal.point, terminal.adjacent, side)
    ) continue;

    let candidate: DisplayPoint[];
    if (segment.axis === 'h') {
      const direction = Math.sign(end.x - start.x);
      if (direction === 0) continue;
      const leftLane = rect.x - clearance;
      const rightLane = rect.x + rect.width + clearance;
      const entryX = direction > 0 ? leftLane : rightLane;
      const exitX = direction > 0 ? rightLane : leftLane;
      if (
        !liesStrictlyBetween(entryX, start.x, end.x)
        || !liesStrictlyBetween(exitX, start.x, end.x)
      ) continue;
      const capY = terminalCapLane(rect, side, clearance);
      candidate = [
        ...path.slice(0, segment.segmentIndex + 1),
        { x: entryX, y: start.y },
        { x: entryX, y: capY },
        { x: exitX, y: capY },
        { x: exitX, y: end.y },
        ...path.slice(segment.segmentIndex + 1),
      ];
    } else {
      const direction = Math.sign(end.y - start.y);
      if (direction === 0) continue;
      const topLane = rect.y - clearance;
      const bottomLane = rect.y + rect.height + clearance;
      const entryY = direction > 0 ? topLane : bottomLane;
      const exitY = direction > 0 ? bottomLane : topLane;
      if (
        !liesStrictlyBetween(entryY, start.y, end.y)
        || !liesStrictlyBetween(exitY, start.y, end.y)
      ) continue;
      const capX = terminalCapLane(rect, side, clearance);
      candidate = [
        ...path.slice(0, segment.segmentIndex + 1),
        { x: start.x, y: entryY },
        { x: capX, y: entryY },
        { x: capX, y: exitY },
        { x: end.x, y: exitY },
        ...path.slice(segment.segmentIndex + 1),
      ];
    }

    const compacted = compactOrthogonalPath(candidate);
    if (compacted.length < 2 || !compacted.every(isFinitePoint)) continue;
    const signature = exactPathSignature(compacted);
    if (seen.has(signature)) continue;
    seen.add(signature);
    candidates.push(compacted);
  }

  return candidates.slice(0, 2);
};
