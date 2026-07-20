import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  edgeTerminalPositionIsFixed,
  edgeTerminalSideIsFixed,
} from '../../routing/utils/edgeTerminalPolicy';
import { normalizeHandle } from '../../routing/utils/handleUtils';
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Axis = 'h' | 'v';
export type TerminalRole = 'source' | 'target';
export type BoundarySide = 'top' | 'bottom' | 'left' | 'right';

export const EPS = 0.5;
export const BOUNDARY_TOLERANCE = 2;
export const MIN_READABLE_BRIDGE = 48;
export const CORNER_INSET = 16;
export const DEFAULT_MAX_REPAIRED_EDGES = 4;
export const DEFAULT_MAX_GRAPH_EDGES = 24;
export const DEFAULT_MAX_DECLARED_AXIS_REPAIRS = 8;

export const CONTAINER_NODE_TYPES = new Set([
  'titleGroup',
  'subGroup',
  'group',
  'domain',
  'subDomain',
  'swimlane',
]);

export const num = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

export function getEdgePath(edge: Edge): Point[] {
  const raw = (edge.data as any)?.computedPath
    || (edge.data as any)?.treeRouting?.points
    || (edge.data as any)?.elkPath
    || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((point: any) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

export function nodeRect(node: ReactFlowNode | undefined): Rect | null {
  if (!node) return null;
  const position = (node as any).positionAbsolute ?? node.position ?? { x: 0, y: 0 };
  const width = num((node as any).measured?.width ?? node.width ?? (node.style as any)?.width, 0);
  const height = num((node as any).measured?.height ?? node.height ?? (node.style as any)?.height, 0);
  if (width <= 1 || height <= 1) return null;
  return {
    x: num((position as any).x, 0),
    y: num((position as any).y, 0),
    width,
    height,
  };
}

export function axisOf(a: Point, b: Point): Axis | null {
  if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
}
export function segmentLength(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function pathLength(path: Point[]): number {
  return path.slice(1).reduce((total, point, index) => (
    total + segmentLength(path[index], point)
  ), 0);
}

export function compactPath(path: Point[]): Point[] {
  const deduped: Point[] = [];
  for (const point of path) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.abs(previous.x - point.x) > EPS || Math.abs(previous.y - point.y) > EPS) {
      deduped.push({ ...point });
    }
  }
  if (deduped.length <= 2) return deduped;

  const compacted: Point[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = compacted[compacted.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    const sameX = Math.abs(previous.x - current.x) <= EPS
      && Math.abs(current.x - next.x) <= EPS;
    const sameY = Math.abs(previous.y - current.y) <= EPS
      && Math.abs(current.y - next.y) <= EPS;
    if (!sameX && !sameY) compacted.push(current);
  }
  compacted.push(deduped[deduped.length - 1]);
  return compacted;
}

export function pathEquals(first: Point[], second: Point[]): boolean {
  return first.length === second.length && first.every((point, index) => (
    Math.abs(point.x - second[index].x) <= EPS
    && Math.abs(point.y - second[index].y) <= EPS
  ));
}

export function terminalPositionIsFixed(edge: Edge, role: TerminalRole): boolean {
  return edgeTerminalPositionIsFixed(edge, role);
}

export function terminalSideIsFixed(edge: Edge, role: TerminalRole): boolean {
  return edgeTerminalSideIsFixed(edge, role);
}

export function terminalBoundarySide(
  terminal: Point,
  rect: Rect,
  firstAxis: Axis,
): 'top' | 'bottom' | 'left' | 'right' | null {
  if (firstAxis === 'v') {
    if (Math.abs(terminal.y - rect.y) <= BOUNDARY_TOLERANCE) return 'top';
    if (Math.abs(terminal.y - (rect.y + rect.height)) <= BOUNDARY_TOLERANCE) return 'bottom';
    return null;
  }
  if (Math.abs(terminal.x - rect.x) <= BOUNDARY_TOLERANCE) return 'left';
  if (Math.abs(terminal.x - (rect.x + rect.width)) <= BOUNDARY_TOLERANCE) return 'right';
  return null;
}
export function leavesBoundaryOutward(terminal: Point, adjacent: Point, side: string): boolean {
  if (side === 'top') return adjacent.y < terminal.y - EPS;
  if (side === 'bottom') return adjacent.y > terminal.y + EPS;
  if (side === 'left') return adjacent.x < terminal.x - EPS;
  return adjacent.x > terminal.x + EPS;
}

export function entersBoundaryInterior(terminal: Point, adjacent: Point, side: string): boolean {
  if (side === 'top') return adjacent.y > terminal.y + EPS;
  if (side === 'bottom') return adjacent.y < terminal.y - EPS;
  if (side === 'left') return adjacent.x > terminal.x + EPS;
  return adjacent.x < terminal.x - EPS;
}

export function oppositeBoundarySide(side: BoundarySide): BoundarySide {
  if (side === 'top') return 'bottom';
  if (side === 'bottom') return 'top';
  if (side === 'left') return 'right';
  return 'left';
}

export function declaredBoundarySide(edge: Edge, role: TerminalRole): BoundarySide | null {
  const handle = normalizeHandle(role === 'source' ? edge.sourceHandle : edge.targetHandle);
  if (handle === 't') return 'top';
  if (handle === 'b') return 'bottom';
  if (handle === 'l') return 'left';
  if (handle === 'r') return 'right';
  return null;
}

export function boundaryPointOnSide(point: Point, rect: Rect, side: BoundarySide): Point {
  if (side === 'top') return { x: point.x, y: rect.y };
  if (side === 'bottom') return { x: point.x, y: rect.y + rect.height };
  if (side === 'left') return { x: rect.x, y: point.y };
  return { x: rect.x + rect.width, y: point.y };
}

export function boundarySideFacesOtherNode(side: BoundarySide, rect: Rect, otherRect: Rect | null): boolean {
  if (!otherRect) return false;
  const dx = (otherRect.x + otherRect.width / 2) - (rect.x + rect.width / 2);
  const dy = (otherRect.y + otherRect.height / 2) - (rect.y + rect.height / 2);
  if (side === 'top') return dy < -EPS;
  if (side === 'bottom') return dy > EPS;
  if (side === 'left') return dx < -EPS;
  return dx > EPS;
}

export function pointStrictlyInsideRect(point: Point, rect: Rect): boolean {
  return point.x > rect.x + EPS
    && point.x < rect.x + rect.width - EPS
    && point.y > rect.y + EPS
    && point.y < rect.y + rect.height - EPS;
}

export function pointStrictlyOutsideRect(point: Point, rect: Rect): boolean {
  return point.x < rect.x - EPS
    || point.x > rect.x + rect.width + EPS
    || point.y < rect.y - EPS
    || point.y > rect.y + rect.height + EPS;
}

export function segmentIntersectsRectInterior(first: Point, second: Point, rect: Rect): boolean {
  if (Math.abs(first.y - second.y) <= EPS) {
    const y = first.y;
    if (y <= rect.y + EPS || y >= rect.y + rect.height - EPS) return false;
    return Math.max(Math.min(first.x, second.x), rect.x + EPS)
      < Math.min(Math.max(first.x, second.x), rect.x + rect.width - EPS);
  }
  if (Math.abs(first.x - second.x) <= EPS) {
    const x = first.x;
    if (x <= rect.x + EPS || x >= rect.x + rect.width - EPS) return false;
    return Math.max(Math.min(first.y, second.y), rect.y + EPS)
      < Math.min(Math.max(first.y, second.y), rect.y + rect.height - EPS);
  }
  return false;
}

export function buildGeometricExitTerminalReanchor(
  path: Point[],
  rect: Rect,
  role: TerminalRole,
  edge: Edge,
): { path: Point[]; side: BoundarySide } | null {
  if (terminalSideIsFixed(edge, role)) return null;
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  if (ordered.length < 2) return null;

  let sawInterior = false;
  let outsideIndex = -1;
  for (let index = 1; index < ordered.length; index += 1) {
    if (pointStrictlyInsideRect(ordered[index], rect)) {
      sawInterior = true;
      continue;
    }
    const crossesInterior = segmentIntersectsRectInterior(ordered[index - 1], ordered[index], rect);
    if ((sawInterior || crossesInterior) && pointStrictlyOutsideRect(ordered[index], rect)) {
      outsideIndex = index;
      break;
    }
  }
  if (outsideIndex < 0) return null;

  const previous = ordered[outsideIndex - 1];
  const outside = ordered[outsideIndex];
  const exitAxis = axisOf(previous, outside);
  if (!exitAxis) return null;
  const side: BoundarySide | null = exitAxis === 'h'
    ? outside.x < rect.x - EPS
      ? 'left'
      : outside.x > rect.x + rect.width + EPS
        ? 'right'
        : null
    : outside.y < rect.y - EPS
      ? 'top'
      : outside.y > rect.y + rect.height + EPS
        ? 'bottom'
        : null;
  if (!side) return null;

  const anchor = boundaryPointOnSide(previous, rect, side);
  let candidateOrdered = compactPath([anchor, ...ordered.slice(outsideIndex)]);
  if (
    candidateOrdered.length >= 2
    && segmentLength(candidateOrdered[0], candidateOrdered[1]) < MIN_READABLE_BRIDGE - EPS
  ) {
    const next = ordered[outsideIndex + 1];
    const following = ordered[outsideIndex + 2];
    const turnAxis = next ? axisOf(outside, next) : null;
    const continuationAxis = next && following ? axisOf(next, following) : null;
    if (next && following && turnAxis && turnAxis !== exitAxis && continuationAxis === exitAxis) {
      const readableStub = offsetOutward(anchor, side, MIN_READABLE_BRIDGE);
      const corridorAtStub = exitAxis === 'v'
        ? { x: next.x, y: readableStub.y }
        : { x: readableStub.x, y: next.y };
      const widened = compactPath([
        anchor,
        readableStub,
        corridorAtStub,
        ...ordered.slice(outsideIndex + 2),
      ]);
      if (
        widened.length >= 2
        && widened.every((point, index) => index === 0 || axisOf(widened[index - 1], point) !== null)
        && leavesBoundaryOutward(widened[0], widened[1], side)
      ) {
        candidateOrdered = widened;
      }
    }
  }
  if (
    candidateOrdered.length < 2
    || !leavesBoundaryOutward(candidateOrdered[0], candidateOrdered[1], side)
  ) return null;
  return {
    path: role === 'source' ? candidateOrdered : candidateOrdered.reverse(),
    side,
  };
}

export function coordinateWithinSideInset(value: number, min: number, span: number): boolean {
  const inset = Math.min(CORNER_INSET, span / 2);
  return value >= min + inset - EPS && value <= min + span - inset + EPS;
}

export function coordinateWithinSideBounds(value: number, min: number, span: number): boolean {
  return value >= min - BOUNDARY_TOLERANCE && value <= min + span + BOUNDARY_TOLERANCE;
}

export function offsetOutward(
  point: Point,
  side: 'top' | 'bottom' | 'left' | 'right',
  distance: number,
): Point {
  if (side === 'top') return { x: point.x, y: point.y - distance };
  if (side === 'bottom') return { x: point.x, y: point.y + distance };
  if (side === 'left') return { x: point.x - distance, y: point.y };
  return { x: point.x + distance, y: point.y };
}

export function boundarySideForTangentialSegment(
  terminal: Point,
  adjacent: Point,
  rect: Rect,
  firstAxis: Axis,
): 'top' | 'bottom' | 'left' | 'right' | null {
  if (firstAxis === 'h') {
    if (
      Math.abs(terminal.y - rect.y) <= BOUNDARY_TOLERANCE
      && Math.abs(adjacent.y - rect.y) <= BOUNDARY_TOLERANCE
    ) return 'top';
    if (
      Math.abs(terminal.y - (rect.y + rect.height)) <= BOUNDARY_TOLERANCE
      && Math.abs(adjacent.y - (rect.y + rect.height)) <= BOUNDARY_TOLERANCE
    ) return 'bottom';
    return null;
  }
  if (
    Math.abs(terminal.x - rect.x) <= BOUNDARY_TOLERANCE
    && Math.abs(adjacent.x - rect.x) <= BOUNDARY_TOLERANCE
  ) return 'left';
  if (
    Math.abs(terminal.x - (rect.x + rect.width)) <= BOUNDARY_TOLERANCE
    && Math.abs(adjacent.x - (rect.x + rect.width)) <= BOUNDARY_TOLERANCE
  ) return 'right';
  return null;
}
