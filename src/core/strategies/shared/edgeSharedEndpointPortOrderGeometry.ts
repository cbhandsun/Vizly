import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  edgeTerminalSideCanSwitch,
  edgeTerminalSideIsFixed,
  resolveEdgeTerminalHandleForSide,
} from '../../routing/utils/edgeTerminalPolicy';
import { normalizeHandle } from '../../routing/utils/handleUtils';
import { getEdgePath, type PathSegmentRef } from './edgeDetachedOverlapRepair';
import { type EdgePathQualityScore } from './edgeStrictCrossingGuard';
import { countRoutingObstacleHits } from './edgeWaypointCandidateRepair';

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Axis = 'h' | 'v';
export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Role = 'source' | 'target';
type PositionedNode = ReactFlowNode & { positionAbsolute?: Point };

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);
export type IndexedPathSegment = {
  edgeIndex: number;
  axis: Axis;
  a: Point;
  b: Point;
};
export type TerminalPathCandidate = {
  path: Point[];
  terminalSide?: Side;
};

export const EPS = 0.5;
const SIDE_TOLERANCE = 2;
export const SIDE_INSET = 16;
export const PORT_LANE_GAPS = [32, 48, 64];
export const FIXED_PORT_OUTWARD_STUB = 64;
export const MIN_READABLE_BYPASS_SPAN = 144;
export const MIN_OBSTACLE_LANE_CLEARANCE = 16;
export const MAX_BYPASS_COORDINATES = 12;

const CONTAINER_NODE_TYPES = new Set([
  'titleGroup',
  'subGroup',
  'group',
  'domain',
  'subDomain',
  'swimlane',
]);

const finite = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

export function nodeRect(node: ReactFlowNode | undefined): Rect | null {
  if (!node) return null;
  const position = (node as PositionedNode).positionAbsolute ?? node.position;
  const width = finite(node.measured?.width ?? node.width ?? node.style?.width);
  const height = finite(node.measured?.height ?? node.height ?? node.style?.height);
  if (width <= 1 || height <= 1) return null;
  return {
    x: finite(position.x),
    y: finite(position.y),
    width,
    height,
  };
}

export function axisOf(first: Point, second: Point): Axis | null {
  if (Math.abs(first.y - second.y) <= EPS && Math.abs(first.x - second.x) > EPS) return 'h';
  if (Math.abs(first.x - second.x) <= EPS && Math.abs(first.y - second.y) > EPS) return 'v';
  return null;
}

function sideFromHandle(handle: unknown): Side | null {
  const normalized = normalizeHandle(String(handle ?? ''));
  if (normalized === 't') return 'top';
  if (normalized === 'b') return 'bottom';
  if (normalized === 'l') return 'left';
  if (normalized === 'r') return 'right';
  return null;
}

export function terminalSide(point: Point, rect: Rect, handle: unknown): Side | null {
  const declared = sideFromHandle(handle);
  const matches = (side: Side): boolean => (
    side === 'top'
      ? Math.abs(point.y - rect.y) <= SIDE_TOLERANCE
      : side === 'bottom'
        ? Math.abs(point.y - (rect.y + rect.height)) <= SIDE_TOLERANCE
        : side === 'left'
          ? Math.abs(point.x - rect.x) <= SIDE_TOLERANCE
          : Math.abs(point.x - (rect.x + rect.width)) <= SIDE_TOLERANCE
  );
  if (declared && matches(declared)) return declared;
  return (['top', 'bottom', 'left', 'right'] as const).find(matches) ?? null;
}

export function terminalSideIsFixed(edge: Edge, role: Role): boolean {
  return edgeTerminalSideIsFixed(edge, role);
}

export function compactPath(path: Point[]): Point[] {
  const deduped = path.filter((point, index) => (
    index === 0
    || Math.abs(point.x - path[index - 1].x) > EPS
    || Math.abs(point.y - path[index - 1].y) > EPS
  ));
  if (deduped.length <= 2) return deduped.map(point => ({ ...point }));
  const result: Point[] = [{ ...deduped[0] }];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    const collinear = (
      Math.abs(previous.x - current.x) <= EPS && Math.abs(current.x - next.x) <= EPS
    ) || (
      Math.abs(previous.y - current.y) <= EPS && Math.abs(current.y - next.y) <= EPS
    );
    if (!collinear) result.push({ ...current });
  }
  result.push({ ...deduped[deduped.length - 1] });
  return result;
}

export function withPath(
  edge: Edge,
  path: Point[],
  role?: Role,
  terminalSideOverride?: Side,
): Edge {
  const data = {
    ...(edge.data || {}),
    computedPath: path,
    sharedEndpointPortOrderRepaired: true,
  } as Record<string, unknown>;
  const treeRouting = asRecord(data.treeRouting);
  if (Array.isArray(treeRouting.points)) {
    data.treeRouting = { ...treeRouting, points: path };
  }
  const result = { ...edge, data };
  if (
    role
    && terminalSideOverride
    && edgeTerminalSideCanSwitch(edge, role, terminalSideOverride)
  ) {
    const handle = resolveEdgeTerminalHandleForSide(edge, role, terminalSideOverride);
    if (role === 'source') result.sourceHandle = handle;
    else result.targetHandle = handle;
  }
  return result;
}

export function buildObstacleMap(nodes: ReactFlowNode[]): Map<string, Rect> {
  const result = new Map<string, Rect>();
  for (const node of nodes) {
    if (CONTAINER_NODE_TYPES.has(String(node.type ?? ''))) continue;
    const rect = nodeRect(node);
    if (rect) result.set(node.id, rect);
  }
  return result;
}

export function totalObstacleHits(edges: Edge[], obstacles: Map<string, Rect>): number {
  return edges.reduce((total, edge) => (
    total + countRoutingObstacleHits(getEdgePath(edge), edge, obstacles)
  ), 0);
}

export function hardQualityDoesNotRegress(
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean {
  return candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
    && candidate.reverseOverlap <= baseline.reverseOverlap
    && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
    && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
    && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
    && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
    && candidate.hairpins <= baseline.hairpins
    && candidate.backtrackPenalty <= baseline.backtrackPenalty;
}

export function sharedNodeRole(
  first: Edge,
  second: Edge,
): { nodeId: string; firstRole: Role; secondRole: Role } | null {
  for (const firstRole of ['source', 'target'] as const) {
    const firstNodeId = first[firstRole];
    for (const secondRole of ['source', 'target'] as const) {
      if (firstNodeId === second[secondRole]) return { nodeId: firstNodeId, firstRole, secondRole };
    }
  }
  return null;
}

export function originalSegmentIndex(
  role: Role,
  orderedSegmentIndex: number,
  pointCount: number,
): number {
  return role === 'source'
    ? orderedSegmentIndex
    : pointCount - 2 - orderedSegmentIndex;
}

export function indexedPathSegments(paths: Point[][]): IndexedPathSegment[] {
  const segments: IndexedPathSegment[] = [];
  paths.forEach((path, edgeIndex) => {
    for (let index = 0; index < path.length - 1; index += 1) {
      const axis = axisOf(path[index], path[index + 1]);
      if (!axis) continue;
      segments.push({ edgeIndex, axis, a: path[index], b: path[index + 1] });
    }
  });
  return segments;
}

export function segmentIsNearSharedTerminal(
  segment: PathSegmentRef,
  role: Role,
  pointCount: number,
): boolean {
  if (pointCount < 2) return false;
  const terminalSegmentIndex = role === 'source' ? 0 : pointCount - 2;
  return Math.abs(segment.segIdx - terminalSegmentIndex) <= 1;
}
