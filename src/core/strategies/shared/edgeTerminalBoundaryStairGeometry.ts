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

export function buildInwardTerminalReanchor(
  path: Point[],
  rect: Rect,
  otherRect: Rect | null,
  role: TerminalRole,
  edge: Edge,
  switchFacingTangentialSide = false,
): { path: Point[]; side: BoundarySide } | null {
  if (terminalSideIsFixed(edge, role)) return null;
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const terminal = ordered[0];
  const adjacent = ordered[1];
  if (!terminal || !adjacent) return null;
  const firstAxis = axisOf(terminal, adjacent);
  if (!firstAxis) return null;
  const directSide = terminalBoundarySide(terminal, rect, firstAxis);
  const tangentialSide = boundarySideForTangentialSegment(terminal, adjacent, rect, firstAxis);
  const currentSide = directSide ?? tangentialSide;
  if (!currentSide) return null;
  const inwardStartIndex = directSide && entersBoundaryInterior(terminal, adjacent, currentSide)
    ? 0
    : tangentialSide
      && ordered[2]
      && entersBoundaryInterior(adjacent, ordered[2], currentSide)
      ? 1
      : -1;
  if (inwardStartIndex < 0) return null;

  const facesOtherNode = boundarySideFacesOtherNode(currentSide, rect, otherRect);
  if (facesOtherNode && inwardStartIndex > 0 && !switchFacingTangentialSide) return null;
  if (facesOtherNode && inwardStartIndex === 0) {
    const outsideIndex = ordered.findIndex((point, index) => (
      index > inwardStartIndex + 1 && !pointStrictlyInsideRect(point, rect)
    ));
    if (outsideIndex < 0) return null;
    const outside = ordered[outsideIndex];
    const terminalStub = offsetOutward(terminal, currentSide, MIN_READABLE_BRIDGE);
    const corridorAtStub = currentSide === 'top' || currentSide === 'bottom'
      ? { x: outside.x, y: terminalStub.y }
      : { x: terminalStub.x, y: outside.y };
    const candidateOrdered = compactPath([
      terminal,
      terminalStub,
      corridorAtStub,
      ...ordered.slice(outsideIndex),
    ]);
    if (
      candidateOrdered.length < 3
      || !leavesBoundaryOutward(candidateOrdered[0], candidateOrdered[1], currentSide)
    ) return null;
    return {
      path: role === 'source' ? candidateOrdered : candidateOrdered.reverse(),
      side: currentSide,
    };
  }

  // A same-side outward bypass for a tangential re-entry was already attempted by the scored
  // terminal candidates. If none passed the full-graph gates, switching to the geometric exit
  // side removes only the portion inside the node and cannot add an external crossing.

  const side = oppositeBoundarySide(currentSide);
  const movedTerminal = boundaryPointOnSide(terminal, rect, side);
  const candidateOrdered = inwardStartIndex === 0
    ? compactPath([movedTerminal, ...ordered.slice(1)])
    : compactPath([
      movedTerminal,
      boundaryPointOnSide(adjacent, rect, side),
      ...ordered.slice(2),
    ]);
  const outwardSegmentStart = candidateOrdered[inwardStartIndex];
  const outwardSegmentEnd = candidateOrdered[inwardStartIndex + 1];
  if (
    candidateOrdered.length < 2
    || !outwardSegmentStart
    || !outwardSegmentEnd
    || !leavesBoundaryOutward(outwardSegmentStart, outwardSegmentEnd, side)
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

export function buildTangentialBoundaryCandidate(ordered: Point[], rect: Rect): Point[] | null {
  const terminal = ordered[0];
  const boundaryEnd = ordered[1];
  const outwardEnd = ordered[2];
  const corridorEnd = ordered[3];
  if (!terminal || !boundaryEnd || !outwardEnd || !corridorEnd) return null;
  const boundaryAxis = axisOf(terminal, boundaryEnd);
  const outwardAxis = axisOf(boundaryEnd, outwardEnd);
  const corridorAxis = axisOf(outwardEnd, corridorEnd);
  if (!boundaryAxis || !outwardAxis || boundaryAxis === outwardAxis) return null;
  const side = boundarySideForTangentialSegment(terminal, boundaryEnd, rect, boundaryAxis);
  if (!side) return null;

  const expectedCorridorAxis = outwardAxis === 'v' ? 'h' : 'v';
  if (corridorAxis !== expectedCorridorAxis) return null;

  if (entersBoundaryInterior(boundaryEnd, outwardEnd, side)) {
    const terminalStub = offsetOutward(terminal, side, MIN_READABLE_BRIDGE);
    const tail = ordered.length > 4
      ? ordered.slice(4).map(point => ({ ...point }))
      : [{ ...corridorEnd }];
    const corridorAtStub = boundaryAxis === 'h'
      ? { x: corridorEnd.x, y: terminalStub.y }
      : { x: terminalStub.x, y: corridorEnd.y };
    if (axisOf(corridorAtStub, tail[0]) !== outwardAxis && !pathEquals([corridorAtStub], tail)) {
      return null;
    }
    const candidate = compactPath([terminal, terminalStub, corridorAtStub, ...tail]);
    if (
      candidate.length < 3
      || axisOf(candidate[0], candidate[1]) !== outwardAxis
      || !leavesBoundaryOutward(candidate[0], candidate[1], side)
      || segmentLength(candidate[0], candidate[1]) < MIN_READABLE_BRIDGE - EPS
    ) return null;
    return candidate;
  }
  if (!leavesBoundaryOutward(boundaryEnd, outwardEnd, side)) return null;
  const corridorDirection = corridorAxis === 'h'
    ? Math.sign(corridorEnd.x - outwardEnd.x)
    : Math.sign(corridorEnd.y - outwardEnd.y);
  if (corridorDirection === 0) return null;
  const corridorLength = segmentLength(outwardEnd, corridorEnd);

  const movedTerminal = { ...terminal };
  const movedOutwardEnd = { ...outwardEnd };
  let movedTerminalIsValid = false;
  if (corridorAxis === 'h') {
    const nextX = corridorLength >= MIN_READABLE_BRIDGE - EPS
      ? outwardEnd.x
      : corridorEnd.x - corridorDirection * MIN_READABLE_BRIDGE;
    if (coordinateWithinSideInset(nextX, rect.x, rect.width)) {
      movedTerminal.x = nextX;
      movedOutwardEnd.x = nextX;
      movedTerminalIsValid = true;
    }
  } else {
    const nextY = corridorLength >= MIN_READABLE_BRIDGE - EPS
      ? outwardEnd.y
      : corridorEnd.y - corridorDirection * MIN_READABLE_BRIDGE;
    if (coordinateWithinSideInset(nextY, rect.y, rect.height)) {
      movedTerminal.y = nextY;
      movedOutwardEnd.y = nextY;
      movedTerminalIsValid = true;
    }
  }

  if (movedTerminalIsValid) {
    const candidate = compactPath([movedTerminal, movedOutwardEnd, ...ordered.slice(2)]);
    const firstAxis = candidate.length >= 2 ? axisOf(candidate[0], candidate[1]) : null;
    if (
      candidate.length >= 3
      && firstAxis === outwardAxis
      && leavesBoundaryOutward(candidate[0], candidate[1], side)
    ) return candidate;
  }

  // The corridor lane can lie outside this node's legal anchor span (for example, a route from
  // the top of one node to the bottom of a much wider neighbour). Keep the existing anchor and
  // move the tangential boundary run outward instead of rejecting the repair. This preserves the
  // chosen port while producing a normal stub followed by an orthogonal bridge.
  const outwardClearance = segmentLength(boundaryEnd, outwardEnd);
  if (outwardClearance < MIN_READABLE_BRIDGE + 24 - EPS) return null;
  const terminalStub = offsetOutward(terminal, side, MIN_READABLE_BRIDGE);
  const boundaryEndStub = offsetOutward(boundaryEnd, side, MIN_READABLE_BRIDGE);
  const doglegCandidate = compactPath([
    terminal,
    terminalStub,
    boundaryEndStub,
    outwardEnd,
    ...ordered.slice(3),
  ]);
  if (
    doglegCandidate.length < 5
    || axisOf(doglegCandidate[0], doglegCandidate[1]) !== outwardAxis
    || !leavesBoundaryOutward(doglegCandidate[0], doglegCandidate[1], side)
    || segmentLength(doglegCandidate[0], doglegCandidate[1]) < MIN_READABLE_BRIDGE - EPS
  ) return null;
  return doglegCandidate;
}

export function buildOrderedTerminalCandidate(ordered: Point[], rect: Rect): Point[] | null {
  const terminal = ordered[0];
  const adjacent = ordered[1];
  const bridgeEnd = ordered[2];
  const continuation = ordered[3];
  if (!terminal || !adjacent || !bridgeEnd || !continuation) return null;

  const tangentialCandidate = buildTangentialBoundaryCandidate(ordered, rect);
  if (tangentialCandidate) return tangentialCandidate;

  const firstAxis = axisOf(terminal, adjacent);
  const bridgeAxis = axisOf(adjacent, bridgeEnd);
  const continuationAxis = axisOf(bridgeEnd, continuation);
  if (!firstAxis || !bridgeAxis || !continuationAxis) return null;
  if (firstAxis !== continuationAxis || firstAxis === bridgeAxis) return null;
  const side = terminalBoundarySide(terminal, rect, firstAxis);
  if (!side || !leavesBoundaryOutward(terminal, adjacent, side)) return null;

  const firstDirection = firstAxis === 'v'
    ? Math.sign(adjacent.y - terminal.y)
    : Math.sign(adjacent.x - terminal.x);
  const continuationDirection = continuationAxis === 'v'
    ? Math.sign(continuation.y - bridgeEnd.y)
    : Math.sign(continuation.x - bridgeEnd.x);
  if (firstDirection === 0 || firstDirection !== continuationDirection) return null;

  const bridgeLength = segmentLength(adjacent, bridgeEnd);
  if (bridgeLength <= EPS || bridgeLength >= MIN_READABLE_BRIDGE - EPS) return null;
  const bridgeDirection = bridgeAxis === 'h'
    ? Math.sign(bridgeEnd.x - adjacent.x)
    : Math.sign(bridgeEnd.y - adjacent.y);
  if (bridgeDirection === 0) return null;

  const movedTerminal = { ...terminal };
  const movedAdjacent = { ...adjacent };
  if (bridgeAxis === 'h') {
    const nextX = bridgeEnd.x - bridgeDirection * MIN_READABLE_BRIDGE;
    if (!coordinateWithinSideInset(nextX, rect.x, rect.width)) return null;
    movedTerminal.x = nextX;
    movedAdjacent.x = nextX;
  } else {
    const nextY = bridgeEnd.y - bridgeDirection * MIN_READABLE_BRIDGE;
    if (!coordinateWithinSideInset(nextY, rect.y, rect.height)) return null;
    movedTerminal.y = nextY;
    movedAdjacent.y = nextY;
  }

  const candidate = compactPath([movedTerminal, movedAdjacent, ...ordered.slice(2)]);
  if (candidate.length < 4 || segmentLength(candidate[1], candidate[2]) < MIN_READABLE_BRIDGE - EPS) {
    return null;
  }
  return candidate;
}

export function buildTerminalCandidate(
  path: Point[],
  rect: Rect,
  role: TerminalRole,
): Point[] | null {
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const candidate = buildOrderedTerminalCandidate(ordered, rect);
  if (!candidate) return null;
  return role === 'source' ? candidate : candidate.reverse();
}

export function buildTerminalDoglegCollapseCandidate(
  path: Point[],
  rect: Rect,
  role: TerminalRole,
): Point[] | null {
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const [terminal, adjacent, bridgeEnd, continuation] = ordered;
  if (!terminal || !adjacent || !bridgeEnd || !continuation) return null;
  const firstAxis = axisOf(terminal, adjacent);
  const bridgeAxis = axisOf(adjacent, bridgeEnd);
  const continuationAxis = axisOf(bridgeEnd, continuation);
  if (
    !firstAxis
    || !bridgeAxis
    || continuationAxis !== firstAxis
    || bridgeAxis === firstAxis
    || segmentLength(adjacent, bridgeEnd) >= MIN_READABLE_BRIDGE - EPS
  ) return null;
  const firstDirection = firstAxis === 'h'
    ? Math.sign(adjacent.x - terminal.x)
    : Math.sign(adjacent.y - terminal.y);
  const continuationDirection = firstAxis === 'h'
    ? Math.sign(continuation.x - bridgeEnd.x)
    : Math.sign(continuation.y - bridgeEnd.y);
  if (firstDirection === 0 || firstDirection !== continuationDirection) return null;
  const side = terminalBoundarySide(terminal, rect, firstAxis);
  if (!side || !leavesBoundaryOutward(terminal, adjacent, side)) return null;

  const movedTerminal = { ...terminal };
  const movedAdjacent = { ...adjacent };
  if (bridgeAxis === 'v') {
    if (!coordinateWithinSideBounds(bridgeEnd.y, rect.y, rect.height)) return null;
    movedTerminal.y = bridgeEnd.y;
    movedAdjacent.y = bridgeEnd.y;
  } else {
    if (!coordinateWithinSideBounds(bridgeEnd.x, rect.x, rect.width)) return null;
    movedTerminal.x = bridgeEnd.x;
    movedAdjacent.x = bridgeEnd.x;
  }
  const candidate = compactPath([movedTerminal, movedAdjacent, ...ordered.slice(2)]);
  if (candidate.length < 2) return null;
  return role === 'source' ? candidate : candidate.reverse();
}

export function buildTerminalDoglegWidenCandidate(
  path: Point[],
  rect: Rect,
  role: TerminalRole,
  clearance: number,
): Point[] | null {
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const [terminal, adjacent, bridgeEnd, continuation] = ordered;
  if (!terminal || !adjacent || !bridgeEnd || !continuation) return null;
  const firstAxis = axisOf(terminal, adjacent);
  const bridgeAxis = axisOf(adjacent, bridgeEnd);
  const continuationAxis = axisOf(bridgeEnd, continuation);
  if (
    !firstAxis
    || !bridgeAxis
    || continuationAxis !== firstAxis
    || bridgeAxis === firstAxis
    || segmentLength(adjacent, bridgeEnd) >= MIN_READABLE_BRIDGE - EPS
  ) return null;
  const firstDirection = firstAxis === 'h'
    ? Math.sign(adjacent.x - terminal.x)
    : Math.sign(adjacent.y - terminal.y);
  const continuationDirection = firstAxis === 'h'
    ? Math.sign(continuation.x - bridgeEnd.x)
    : Math.sign(continuation.y - bridgeEnd.y);
  if (firstDirection === 0 || firstDirection !== continuationDirection) return null;
  const side = terminalBoundarySide(terminal, rect, firstAxis);
  if (!side || !leavesBoundaryOutward(terminal, adjacent, side)) return null;
  const bridgeDirection = bridgeAxis === 'h'
    ? Math.sign(bridgeEnd.x - adjacent.x)
    : Math.sign(bridgeEnd.y - adjacent.y);
  if (bridgeDirection === 0) return null;

  const movedTerminal = { ...terminal };
  const movedAdjacent = { ...adjacent };
  if (bridgeAxis === 'v') {
    const nextY = bridgeEnd.y - bridgeDirection * clearance;
    if (!coordinateWithinSideBounds(nextY, rect.y, rect.height)) return null;
    movedTerminal.y = nextY;
    movedAdjacent.y = nextY;
  } else {
    const nextX = bridgeEnd.x - bridgeDirection * clearance;
    if (!coordinateWithinSideBounds(nextX, rect.x, rect.width)) return null;
    movedTerminal.x = nextX;
    movedAdjacent.x = nextX;
  }
  const candidate = compactPath([movedTerminal, movedAdjacent, ...ordered.slice(2)]);
  if (candidate.length < 4 || segmentLength(candidate[1], candidate[2]) < clearance - EPS) return null;
  return role === 'source' ? candidate : candidate.reverse();
}

export function buildReadableLaneVariants(ordered: Point[]): Point[][] {
  const terminal = ordered[0];
  const firstJoin = ordered[1];
  const secondJoin = ordered[2];
  const continuation = ordered[3];
  if (!terminal || !firstJoin || !secondJoin || !continuation) return [];
  const mainAxis = axisOf(terminal, firstJoin);
  const bridgeAxis = axisOf(firstJoin, secondJoin);
  const continuationAxis = axisOf(secondJoin, continuation);
  if (!mainAxis || !bridgeAxis || continuationAxis !== mainAxis || bridgeAxis === mainAxis) return [];
  const mainDirection = mainAxis === 'v'
    ? Math.sign(firstJoin.y - terminal.y)
    : Math.sign(firstJoin.x - terminal.x);
  const continuationDirection = mainAxis === 'v'
    ? Math.sign(continuation.y - secondJoin.y)
    : Math.sign(continuation.x - secondJoin.x);
  if (mainDirection === 0 || mainDirection !== continuationDirection) return [];

  const terminalCoordinate = mainAxis === 'v' ? terminal.y : terminal.x;
  const continuationCoordinate = mainAxis === 'v' ? continuation.y : continuation.x;
  const currentCoordinate = mainAxis === 'v' ? firstJoin.y : firstJoin.x;
  const laneValues = [
    currentCoordinate,
    ...[48, 64, 72, 96, 128, 160, 192]
      .map(clearance => terminalCoordinate + mainDirection * clearance),
    ...[24, 32, 48, 64, 96, 128]
      .map(clearance => continuationCoordinate - mainDirection * clearance),
  ];
  const seen = new Set<number>();
  return laneValues
    .map(value => Math.round(value * 100) / 100)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return mainDirection * (value - terminalCoordinate) >= MIN_READABLE_BRIDGE - EPS
        && mainDirection * (continuationCoordinate - value) >= 24 - EPS;
    })
    .map((value) => {
      const candidate = ordered.map(point => ({ ...point }));
      if (mainAxis === 'v') {
        candidate[1].y = value;
        candidate[2].y = value;
      } else {
        candidate[1].x = value;
        candidate[2].x = value;
      }
      return compactPath(candidate);
    });
}

export function buildTerminalCandidateVariants(
  path: Point[],
  rect: Rect,
  role: TerminalRole,
): Point[][] {
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const base = buildOrderedTerminalCandidate(ordered, rect);
  if (!base) return [];
  const seen = new Set<string>();
  return buildReadableLaneVariants(base)
    .map(candidate => (role === 'source' ? candidate : [...candidate].reverse()))
    .filter((candidate) => {
      const key = candidate.map(point => `${point.x},${point.y}`).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function buildNearTerminalStairDepthCandidate(
  path: Point[],
  role: TerminalRole,
): Point[] | null {
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const [a, b, c, d, e, f] = ordered;
  if (!a || !b || !c || !d || !e || !f) return null;
  const firstAxis = axisOf(a, b);
  const firstBridgeAxis = axisOf(b, c);
  const middleAxis = axisOf(c, d);
  const secondBridgeAxis = axisOf(d, e);
  const finalAxis = axisOf(e, f);
  if (
    !firstAxis
    || !firstBridgeAxis
    || middleAxis !== firstAxis
    || secondBridgeAxis !== firstBridgeAxis
    || finalAxis !== firstAxis
    || firstAxis === firstBridgeAxis
  ) return null;
  const firstDirection = firstAxis === 'v' ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
  const middleDirection = firstAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
  const finalDirection = firstAxis === 'v' ? Math.sign(f.y - e.y) : Math.sign(f.x - e.x);
  const firstBridgeDirection = firstBridgeAxis === 'h'
    ? Math.sign(c.x - b.x)
    : Math.sign(c.y - b.y);
  const secondBridgeDirection = firstBridgeAxis === 'h'
    ? Math.sign(e.x - d.x)
    : Math.sign(e.y - d.y);
  if (
    firstDirection === 0
    || firstDirection !== middleDirection
    || firstDirection !== finalDirection
    || firstBridgeDirection === 0
    || firstBridgeDirection !== secondBridgeDirection
  ) return null;
  const middleLength = segmentLength(c, d);
  if (middleLength <= EPS || middleLength >= MIN_READABLE_BRIDGE - EPS) return null;

  const candidate = ordered.map(point => ({ ...point }));
  if (firstAxis === 'v') {
    const nextY = c.y + firstDirection * MIN_READABLE_BRIDGE;
    if (firstDirection * (f.y - nextY) < 24 - EPS) return null;
    candidate[3].y = nextY;
    candidate[4].y = nextY;
  } else {
    const nextX = c.x + firstDirection * MIN_READABLE_BRIDGE;
    if (firstDirection * (f.x - nextX) < 24 - EPS) return null;
    candidate[3].x = nextX;
    candidate[4].x = nextX;
  }
  const compacted = compactPath(candidate);
  return role === 'source' ? compacted : compacted.reverse();
}

export function terminalOuterCoordinatePool(
  edges: Edge[],
  obstacles: Map<string, Rect>,
  bridgeAxis: Axis,
): number[] {
  const values: number[] = [];
  for (const edge of edges) {
    for (const point of getEdgePath(edge)) values.push(bridgeAxis === 'h' ? point.x : point.y);
  }
  for (const rect of obstacles.values()) {
    if (bridgeAxis === 'h') values.push(rect.x, rect.x + rect.width);
    else values.push(rect.y, rect.y + rect.height);
  }
  const expanded = values.flatMap(value => [
    value - MIN_READABLE_BRIDGE,
    value + MIN_READABLE_BRIDGE,
  ]);
  return [...new Set(expanded
    .filter(Number.isFinite)
    .map(value => Math.round(value * 100) / 100))];
}

export function buildTangentialBoundaryLaneCandidates(
  path: Point[],
  rect: Rect,
  role: TerminalRole,
  declaredSide: 'top' | 'bottom' | 'left' | 'right' | null,
  horizontalPool: number[],
  verticalPool: number[],
): Point[][] {
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const [terminal, boundaryEnd, outwardEnd, corridorEnd] = ordered;
  if (!terminal || !boundaryEnd || !outwardEnd || !corridorEnd) return [];
  const boundaryAxis = axisOf(terminal, boundaryEnd);
  const outwardAxis = axisOf(boundaryEnd, outwardEnd);
  const corridorAxis = axisOf(outwardEnd, corridorEnd);
  if (
    !boundaryAxis
    || !outwardAxis
    || boundaryAxis === outwardAxis
    || corridorAxis !== boundaryAxis
  ) return [];
  if (segmentLength(terminal, boundaryEnd) < MIN_READABLE_BRIDGE - EPS) return [];
  const side = boundarySideForTangentialSegment(terminal, boundaryEnd, rect, boundaryAxis);
  if (
    !side
    || (declaredSide && declaredSide !== side)
    || (
      !leavesBoundaryOutward(boundaryEnd, outwardEnd, side)
      && !entersBoundaryInterior(boundaryEnd, outwardEnd, side)
    )
  ) return [];
  const tail = ordered.length > 4
    ? ordered.slice(4).map(point => ({ ...point }))
    : [{ ...corridorEnd }];
  if (axisOf(corridorEnd, tail[0]) !== outwardAxis && !pathEquals([corridorEnd], tail)) return [];

  const pool = boundaryAxis === 'h' ? horizontalPool : verticalPool;
  const candidates = pool
    .filter(value => boundaryAxis === 'h'
      ? coordinateWithinSideInset(value, rect.x, rect.width)
      : coordinateWithinSideInset(value, rect.y, rect.height))
    .map((value) => {
      const movedTerminal = boundaryAxis === 'h'
        ? { x: value, y: terminal.y }
        : { x: terminal.x, y: value };
      const stub = offsetOutward(movedTerminal, side, MIN_READABLE_BRIDGE);
      const corridorAtStub = boundaryAxis === 'h'
        ? { x: corridorEnd.x, y: stub.y }
        : { x: stub.x, y: corridorEnd.y };
      const candidate = compactPath([movedTerminal, stub, corridorAtStub, ...tail]);
      if (
        candidate.length < 4
        || axisOf(candidate[0], candidate[1]) !== outwardAxis
        || !leavesBoundaryOutward(candidate[0], candidate[1], side)
        || segmentLength(candidate[0], candidate[1]) < MIN_READABLE_BRIDGE - EPS
      ) return null;
      return role === 'source' ? candidate : candidate.reverse();
    })
    .filter((candidate): candidate is Point[] => Boolean(candidate))
    .sort((first, second) => pathLength(first) - pathLength(second));
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      const key = candidate.map(point => `${point.x},${point.y}`).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 48);
}

export function buildTerminalOuterBypassCandidates(
  path: Point[],
  rect: Rect,
  role: TerminalRole,
  horizontalPool: number[],
  verticalPool: number[],
): Point[][] {
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const base = buildOrderedTerminalCandidate(ordered, rect);
  if (!base || base.length < 6) return [];
  const terminal = base[0];
  const firstJoin = base[1];
  const secondJoin = base[2];
  const continuation = base[3];
  const corridorJoin = base[4];
  const corridorNext = base[5];
  const mainAxis = axisOf(terminal, firstJoin);
  const bridgeAxis = axisOf(firstJoin, secondJoin);
  if (
    !mainAxis
    || !bridgeAxis
    || bridgeAxis === mainAxis
    || axisOf(secondJoin, continuation) !== mainAxis
    || axisOf(continuation, corridorJoin) !== bridgeAxis
    || axisOf(corridorJoin, corridorNext) !== mainAxis
  ) return [];
  const mainDirection = mainAxis === 'v'
    ? Math.sign(firstJoin.y - terminal.y)
    : Math.sign(firstJoin.x - terminal.x);
  if (mainDirection === 0) return [];

  const stub = mainAxis === 'v'
    ? { x: terminal.x, y: terminal.y + mainDirection * MIN_READABLE_BRIDGE }
    : { x: terminal.x + mainDirection * MIN_READABLE_BRIDGE, y: terminal.y };
  const pool = bridgeAxis === 'h' ? horizontalPool : verticalPool;
  const candidates = pool.map((outerCoordinate) => {
    const outerAtStub = bridgeAxis === 'h'
      ? { x: outerCoordinate, y: stub.y }
      : { x: stub.x, y: outerCoordinate };
    const outerAtJoin = bridgeAxis === 'h'
      ? { x: outerCoordinate, y: corridorJoin.y }
      : { x: corridorJoin.x, y: outerCoordinate };
    const candidate = compactPath([
      terminal,
      stub,
      outerAtStub,
      outerAtJoin,
      corridorJoin,
      ...base.slice(5),
    ]);
    return role === 'source' ? candidate : candidate.reverse();
  });
  const seen = new Set<string>();
  return candidates
    .filter(candidate => candidate.length >= 4)
    .filter((candidate) => {
      const key = candidate.map(point => `${point.x},${point.y}`).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((first, second) => pathLength(first) - pathLength(second))
    .slice(0, 48);
}

export function terminalBoundaryStairRisk(path: Point[], sourceRect: Rect | null, targetRect: Rect | null): number {
  let risk = 0;
  if (sourceRect && buildTerminalCandidate(path, sourceRect, 'source')) risk += 1;
  if (targetRect && buildTerminalCandidate(path, targetRect, 'target')) risk += 1;
  if (buildNearTerminalStairDepthCandidate(path, 'source')) risk += 1;
  if (buildNearTerminalStairDepthCandidate(path, 'target')) risk += 1;
  return risk;
}

export function routingObstacles(nodes: ReactFlowNode[]): Map<string, Rect> {
  const result = new Map<string, Rect>();
  for (const node of nodes) {
    if (CONTAINER_NODE_TYPES.has(String(node.type ?? ''))) continue;
    const rect = nodeRect(node);
    if (rect) result.set(node.id, rect);
  }
  return result;
}

export function withComputedPath(edge: Edge, path: Point[]): Edge {
  const data: any = {
    ...(edge.data || {}),
    computedPath: path,
    terminalBoundaryStairRepaired: true,
  };
  if (data.treeRouting && Array.isArray(data.treeRouting.points)) {
    data.treeRouting = { ...data.treeRouting, points: path };
  }
  return { ...edge, data };
}
