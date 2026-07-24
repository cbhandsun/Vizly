import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import type {
  Axis,
  BoundarySide,
  Point,
  Rect,
  TerminalRole,
} from './edgeTerminalBoundaryCoreGeometry';
import {
  CONTAINER_NODE_TYPES,
  EPS,
  MIN_READABLE_BRIDGE,
  axisOf,
  boundaryPointOnSide,
  boundarySideFacesOtherNode,
  boundarySideForTangentialSegment,
  compactPath,
  coordinateWithinSideBounds,
  coordinateWithinSideInset,
  entersBoundaryInterior,
  getEdgePath,
  leavesBoundaryOutward,
  nodeRect,
  offsetOutward,
  oppositeBoundarySide,
  pathEquals,
  pathLength,
  pointStrictlyInsideRect,
  segmentLength,
  terminalBoundarySide,
  terminalSideIsFixed,
} from './edgeTerminalBoundaryCoreGeometry';

export * from './edgeTerminalBoundaryCoreGeometry';

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
  const data: Record<string, unknown> = {
    ...(edge.data || {}),
    computedPath: path,
    terminalBoundaryStairRepaired: true,
  };
  const treeRouting = data.treeRouting && typeof data.treeRouting === 'object'
    ? data.treeRouting as Record<string, unknown>
    : undefined;
  if (treeRouting && Array.isArray(treeRouting.points)) {
    data.treeRouting = { ...treeRouting, points: path };
  }
  return { ...edge, data };
}
