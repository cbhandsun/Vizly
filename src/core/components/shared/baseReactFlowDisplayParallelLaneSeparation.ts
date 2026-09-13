import type { Edge, Node } from '@xyflow/react';

import {
  getDisplayComputedPath,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { doBaseReactFlowDisplayRoutesMatchExactly } from './baseReactFlowDisplayRoutingTransaction';

const PARALLEL_ROUTE_LANE_GAP = 20;
const THREE_POINT_LANE_GAP = 24;
const MAX_PARALLEL_ROUTE_GROUP = 8;

type EdgeData = Record<string, unknown>;

const asRecord = (value: unknown): EdgeData => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as EdgeData
    : {}
);

const relationToken = (edge: Edge): string => {
  const data = asRecord(edge.data);
  const relationKey = data.relationKey;
  const relation = data.relation;
  if (typeof relationKey === 'string') return relationKey;
  if (typeof relation === 'string') return relation;
  return '';
};

const terminalToken = (value: unknown): string => (
  typeof value === 'string' ? value.toLowerCase() : ''
);

const parallelRouteKey = (edge: Edge): string => [
  edge.source,
  terminalToken(edge.sourceHandle),
  edge.target,
  terminalToken(edge.targetHandle),
  relationToken(edge),
].join('\u0000');

const segmentAxis = (
  first: DisplayPoint,
  second: DisplayPoint,
): 'h' | 'v' | null => {
  if (Math.abs(first.y - second.y) <= 0.5 && Math.abs(first.x - second.x) > 0.5) return 'h';
  if (Math.abs(first.x - second.x) <= 0.5 && Math.abs(first.y - second.y) > 0.5) return 'v';
  return null;
};

const segmentLength = (first: DisplayPoint, second: DisplayPoint): number => (
  Math.abs(first.x - second.x) + Math.abs(first.y - second.y)
);

const findShiftableInternalSegment = (path: DisplayPoint[]): {
  segmentIndex: number;
  axis: 'h' | 'v';
} | null => {
  let best: { segmentIndex: number; axis: 'h' | 'v'; length: number } | null = null;
  for (let segmentIndex = 1; segmentIndex < path.length - 2; segmentIndex += 1) {
    const first = path[segmentIndex];
    const second = path[segmentIndex + 1];
    const axis = segmentAxis(first, second);
    if (!axis) continue;
    const length = segmentLength(first, second);
    if (!best || length > best.length) best = { segmentIndex, axis, length };
  }
  return best ? { segmentIndex: best.segmentIndex, axis: best.axis } : null;
};

const laneOffset = (index: number, count: number): number => (
  Math.round((index - (count - 1) / 2) * PARALLEL_ROUTE_LANE_GAP)
);

const threePointLaneOffset = (path: DisplayPoint[], index: number): number => {
  const bend = path[1];
  const last = path[2];
  if (!bend || !last) return (index + 1) * THREE_POINT_LANE_GAP;
  const horizontalDirection = Math.sign(last.x - bend.x);
  if (horizontalDirection !== 0) return horizontalDirection * (index + 1) * THREE_POINT_LANE_GAP;
  const verticalDirection = Math.sign(last.y - bend.y);
  return (verticalDirection || 1) * (index + 1) * THREE_POINT_LANE_GAP;
};

const shiftInternalLane = (
  path: DisplayPoint[],
  segmentIndex: number,
  axis: 'h' | 'v',
  offset: number,
): DisplayPoint[] | null => {
  if (offset === 0) return path.map(point => ({ ...point }));
  const first = path[segmentIndex];
  const second = path[segmentIndex + 1];
  if (!first || !second) return null;
  const shifted = path.map(point => ({ ...point }));
  if (axis === 'h') {
    shifted[segmentIndex].y = first.y + offset;
    shifted[segmentIndex + 1].y = second.y + offset;
  } else {
    shifted[segmentIndex].x = first.x + offset;
    shifted[segmentIndex + 1].x = second.x + offset;
  }
  return shifted;
};

const signedStepToward = (from: number, to: number, size: number): number => {
  if (Math.abs(to - from) <= size) return to;
  return from + Math.sign(to - from) * size;
};

const lShapeStubSize = (first: DisplayPoint, bend: DisplayPoint): number => (
  Math.min(segmentLength(first, bend), 56)
);

/**
 * Expands a three-point L route into a short dogleg route whose first and last
 * segments keep the original terminal directions. This covers the common
 * two-node/one-bend path emitted by the browser worker while still allowing the
 * hard gate to reject unsafe candidates.
 */
const shiftThreePointLane = (
  path: DisplayPoint[],
  offset: number,
): DisplayPoint[] | null => {
  const first = path[0];
  const bend = path[1];
  const last = path[2];
  if (!first || !bend || !last) return null;
  const firstAxis = segmentAxis(first, bend);
  const secondAxis = segmentAxis(bend, last);
  if (!firstAxis || !secondAxis || firstAxis === secondAxis) return null;
  if (offset === 0) return path.map(point => ({ ...point }));
  const stub = lShapeStubSize(first, bend);
  if (firstAxis === 'v' && secondAxis === 'h') {
    const stubY = signedStepToward(first.y, bend.y, stub);
    return [
      { ...first },
      { x: first.x, y: stubY },
      { x: first.x + offset, y: stubY },
      { x: first.x + offset, y: last.y },
      { ...last },
    ];
  }
  const stubX = signedStepToward(first.x, bend.x, stub);
  return [
    { ...first },
    { x: stubX, y: first.y },
    { x: stubX, y: first.y + offset },
    { x: last.x, y: first.y + offset },
    { ...last },
  ];
};

/**
 * Builds a conservative route-level separation candidate for same-terminal
 * directed parallel edges. The caller must run the display hard-quality gate
 * before committing the returned candidate.
 */
export const separateBaseReactFlowDisplayParallelLanes = <T extends readonly Edge[]>(
  edges: T,
): Edge[] => {
  const groups = new Map<string, Edge[]>();
  for (const edge of edges) {
    const group = groups.get(parallelRouteKey(edge));
    if (group) group.push(edge);
    else groups.set(parallelRouteKey(edge), [edge]);
  }

  const byId = new Map<string, Edge>();
  for (const group of groups.values()) {
    if (group.length <= 1 || group.length > MAX_PARALLEL_ROUTE_GROUP) {
      group.forEach(edge => byId.set(edge.id, edge));
      continue;
    }
    const ordered = [...group].sort((first, second) => first.id.localeCompare(second.id));
    for (const [index, edge] of ordered.entries()) {
      const path = getDisplayComputedPath(edge);
      const shiftable = path.length >= 4 ? findShiftableInternalSegment(path) : null;
      if (!shiftable && path.length !== 3) {
        byId.set(edge.id, edge);
        continue;
      }
      const offset = shiftable
        ? laneOffset(index, ordered.length)
        : threePointLaneOffset(path, index);
      const shifted = shiftable
        ? shiftInternalLane(path, shiftable.segmentIndex, shiftable.axis, offset)
        : shiftThreePointLane(path, offset);
      byId.set(edge.id, shifted
        ? withDisplayComputedPath(edge, shifted)
        : edge);
    }
  }

  return edges.map(edge => byId.get(edge.id) ?? edge);
};

export const selectHardCleanDisplayParallelLaneCandidate = (
  edges: readonly Edge[],
  nodes: Node[],
): Edge[] => {
  const candidate = separateBaseReactFlowDisplayParallelLanes(edges);
  if (candidate === edges || doBaseReactFlowDisplayRoutesMatchExactly(edges, candidate)) {
    return [...edges];
  }
  const report = getDisplayHardQualityGateReport(candidate, nodes, 'polished');
  return report.hardClean === true ? candidate : [...edges];
};
