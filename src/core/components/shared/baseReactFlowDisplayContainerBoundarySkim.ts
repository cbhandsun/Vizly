import type { Edge, Node } from '@xyflow/react';

import {
  getDisplayComputedPath,
  getDisplayNodeRect,
  isDisplayContainerNode,
  segmentDisplayLength,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';

export const DISPLAY_CONTAINER_BOUNDARY_SKIM_TOLERANCE = 14;
export const DISPLAY_CONTAINER_BOUNDARY_SKIM_MIN_LENGTH = 96;
export const DISPLAY_CONTAINER_BOUNDARY_SKIM_CLEARANCE = 20;

export type DisplayContainerBoundarySkimIssue = Readonly<{
  edgeId: string;
  edgeIndex: number;
  segmentIndex: number;
  axis: 'h' | 'v';
  length: number;
  coordinate: number;
  safeCoordinate: number;
  containerId: string;
  boundary: 'left' | 'right' | 'top' | 'bottom';
}>;

export type DisplayContainerBoundarySkimAudit = Readonly<{
  issues: readonly DisplayContainerBoundarySkimIssue[];
  totalLength: number;
  edgeIds: readonly string[];
}>;

type ContainerBoundary = Readonly<{
  containerId: string;
  boundary: DisplayContainerBoundarySkimIssue['boundary'];
  axis: 'h' | 'v';
  coordinate: number;
  rangeStart: number;
  rangeEnd: number;
  safeCoordinate: number;
}>;

const rangeOverlap = (firstStart: number, firstEnd: number, secondStart: number, secondEnd: number): number => (
  Math.max(0, Math.min(Math.max(firstStart, firstEnd), Math.max(secondStart, secondEnd))
    - Math.max(Math.min(firstStart, firstEnd), Math.min(secondStart, secondEnd)))
);

const finiteNumber = (value: number): boolean => Number.isFinite(value);

const containerBoundaries = (nodes: readonly Node[]): ContainerBoundary[] => {
  const boundaries: ContainerBoundary[] = [];
  for (const node of nodes) {
    if (!isDisplayContainerNode(node)) continue;
    const rect = getDisplayNodeRect(node);
    if (!rect) continue;
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    boundaries.push(
      {
        containerId: node.id,
        boundary: 'left',
        axis: 'v',
        coordinate: left,
        rangeStart: top,
        rangeEnd: bottom,
        safeCoordinate: left + DISPLAY_CONTAINER_BOUNDARY_SKIM_CLEARANCE,
      },
      {
        containerId: node.id,
        boundary: 'right',
        axis: 'v',
        coordinate: right,
        rangeStart: top,
        rangeEnd: bottom,
        safeCoordinate: right - DISPLAY_CONTAINER_BOUNDARY_SKIM_CLEARANCE,
      },
      {
        containerId: node.id,
        boundary: 'top',
        axis: 'h',
        coordinate: top,
        rangeStart: left,
        rangeEnd: right,
        safeCoordinate: top + DISPLAY_CONTAINER_BOUNDARY_SKIM_CLEARANCE,
      },
      {
        containerId: node.id,
        boundary: 'bottom',
        axis: 'h',
        coordinate: bottom,
        rangeStart: left,
        rangeEnd: right,
        safeCoordinate: bottom - DISPLAY_CONTAINER_BOUNDARY_SKIM_CLEARANCE,
      },
    );
  }
  return boundaries;
};

const segmentAxis = (first: DisplayPoint, second: DisplayPoint): 'h' | 'v' | null => {
  if (Math.abs(first.y - second.y) <= 0.5 && Math.abs(first.x - second.x) > 0.5) return 'h';
  if (Math.abs(first.x - second.x) <= 0.5 && Math.abs(first.y - second.y) > 0.5) return 'v';
  return null;
};

const segmentCoordinate = (first: DisplayPoint, second: DisplayPoint, axis: 'h' | 'v'): number => (
  axis === 'h' ? (first.y + second.y) / 2 : (first.x + second.x) / 2
);

const segmentRange = (first: DisplayPoint, second: DisplayPoint, axis: 'h' | 'v'): readonly [number, number] => (
  axis === 'h' ? [first.x, second.x] : [first.y, second.y]
);

export const auditDisplayContainerBoundarySkims = (
  edges: readonly Edge[],
  nodes: readonly Node[],
): DisplayContainerBoundarySkimAudit => {
  const boundaries = containerBoundaries(nodes);
  if (boundaries.length === 0 || edges.length === 0) {
    return { issues: [], totalLength: 0, edgeIds: [] };
  }
  const issues: DisplayContainerBoundarySkimIssue[] = [];
  edges.forEach((edge, edgeIndex) => {
    const path = getDisplayComputedPath(edge);
    if (path.length < 2) return;
    for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
      const first = path[segmentIndex];
      const second = path[segmentIndex + 1];
      if (!finiteNumber(first.x) || !finiteNumber(first.y) || !finiteNumber(second.x) || !finiteNumber(second.y)) continue;
      const axis = segmentAxis(first, second);
      if (!axis) continue;
      const coordinate = segmentCoordinate(first, second, axis);
      const [rangeStart, rangeEnd] = segmentRange(first, second, axis);
      for (const boundary of boundaries) {
        if (boundary.axis !== axis) continue;
        if (Math.abs(coordinate - boundary.coordinate) > DISPLAY_CONTAINER_BOUNDARY_SKIM_TOLERANCE) continue;
        const overlap = rangeOverlap(rangeStart, rangeEnd, boundary.rangeStart, boundary.rangeEnd);
        if (overlap < DISPLAY_CONTAINER_BOUNDARY_SKIM_MIN_LENGTH) continue;
        issues.push({
          edgeId: edge.id,
          edgeIndex,
          segmentIndex,
          axis,
          length: Math.round(overlap),
          coordinate,
          safeCoordinate: boundary.safeCoordinate,
          containerId: boundary.containerId,
          boundary: boundary.boundary,
        });
      }
    }
  });
  const edgeIds = [...new Set(issues.map(issue => issue.edgeId))];
  return {
    issues,
    totalLength: issues.reduce((total, issue) => total + issue.length, 0),
    edgeIds,
  };
};

export const countDisplayContainerBoundarySkimLength = (
  edges: readonly Edge[],
  nodes: readonly Node[],
): number => auditDisplayContainerBoundarySkims(edges, nodes).totalLength;

export const hasRepairableDisplayContainerBoundarySkim = (
  issue: DisplayContainerBoundarySkimIssue,
  edge: Edge,
): boolean => {
  const path = getDisplayComputedPath(edge);
  return issue.segmentIndex > 0
    && issue.segmentIndex < path.length - 2
    && segmentDisplayLength(path[issue.segmentIndex], path[issue.segmentIndex + 1]) >= DISPLAY_CONTAINER_BOUNDARY_SKIM_MIN_LENGTH;
};

