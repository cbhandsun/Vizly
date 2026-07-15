import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  findStrictCrossings,
  getEdgePath,
  type PathSegmentRef,
} from './edgeDetachedOverlapRepair';
import { createEdgePathQualityEvaluationContext } from './edgeStrictCrossingGuard';
import {
  EPS,
  FIXED_PORT_OUTWARD_STUB,
  MAX_BYPASS_COORDINATES,
  MIN_OBSTACLE_LANE_CLEARANCE,
  MIN_READABLE_BYPASS_SPAN,
  PORT_LANE_GAPS,
  SIDE_INSET,
  axisOf,
  buildObstacleMap,
  compactPath,
  hardQualityDoesNotRegress,
  indexedPathSegments,
  nodeRect,
  originalSegmentIndex,
  segmentIsNearSharedTerminal,
  sharedNodeRole,
  terminalSide,
  terminalSideIsFixed,
  totalObstacleHits,
  withPath,
  type IndexedPathSegment,
  type Point,
  type Rect,
  type Role,
  type Side,
  type TerminalPathCandidate,
} from './edgeSharedEndpointPortOrderGeometry';

const MAX_PASSES = 4;
const MAX_RELEVANT_CROSSINGS_PER_PASS = 16;
const MAX_CANDIDATE_EVALUATIONS_PER_PASS = 64;

function buildBentTerminalShiftCandidates(
  edge: Edge,
  path: Point[],
  role: Role,
  rect: Rect,
  crossingSegment: PathSegmentRef,
  trunkSegment: PathSegmentRef,
): Point[][] {
  if (terminalSideIsFixed(edge, role) || path.length < 3) return [];
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const [terminal, stubEnd, corridorEnd] = ordered;
  if (!terminal || !stubEnd || !corridorEnd) return [];
  const terminalAxis = axisOf(terminal, stubEnd);
  const corridorAxis = axisOf(stubEnd, corridorEnd);
  if (!terminalAxis || !corridorAxis || terminalAxis === corridorAxis) return [];
  if (crossingSegment.segIdx !== originalSegmentIndex(role, 1, path.length)) return [];
  const side = terminalSide(terminal, rect, role === 'source' ? edge.sourceHandle : edge.targetHandle);
  if (!side) return [];
  const expectedTerminalAxis = side === 'top' || side === 'bottom' ? 'v' : 'h';
  if (terminalAxis !== expectedTerminalAxis || trunkSegment.axis !== terminalAxis) return [];

  const terminalCoordinate = terminalAxis === 'v' ? terminal.x : terminal.y;
  const corridorCoordinate = terminalAxis === 'v' ? corridorEnd.x : corridorEnd.y;
  const trunkCoordinate = terminalAxis === 'v' ? trunkSegment.a.x : trunkSegment.a.y;
  const direction = Math.sign(corridorCoordinate - terminalCoordinate);
  if (direction === 0 || direction * (corridorCoordinate - trunkCoordinate) <= EPS) return [];
  const minimum = terminalAxis === 'v' ? rect.x + SIDE_INSET : rect.y + SIDE_INSET;
  const maximum = terminalAxis === 'v'
    ? rect.x + rect.width - SIDE_INSET
    : rect.y + rect.height - SIDE_INSET;
  const laneValues = [
    ...PORT_LANE_GAPS.map(gap => trunkCoordinate + direction * gap),
    (trunkCoordinate + corridorCoordinate) / 2,
    corridorCoordinate,
  ];
  const seen = new Set<number>();
  return laneValues
    .map(value => Math.max(minimum, Math.min(maximum, value)))
    .filter(value => direction * (value - trunkCoordinate) > EPS)
    .filter((value) => {
      const rounded = Math.round(value * 100) / 100;
      if (seen.has(rounded)) return false;
      seen.add(rounded);
      return true;
    })
    .map((value) => {
      const candidate = ordered.map(point => ({ ...point }));
      if (terminalAxis === 'v') {
        candidate[0].x = value;
        candidate[1].x = value;
      } else {
        candidate[0].y = value;
        candidate[1].y = value;
      }
      const compacted = compactPath(candidate);
      return role === 'source' ? compacted : compacted.reverse();
    });
}

function buildBentCorridorLaneEscapeCandidates(
  edge: Edge,
  path: Point[],
  role: Role,
  rect: Rect,
  crossingSegment: PathSegmentRef,
  trunkSegment: PathSegmentRef,
  allPaths: Point[][],
  allSegments: IndexedPathSegment[],
  obstacleRects: Rect[],
  edgeIndex: number,
): Point[][] {
  if (terminalSideIsFixed(edge, role) || path.length < 5) return [];
  if (crossingSegment.segIdx !== originalSegmentIndex(role, 1, path.length)) return [];
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const [terminal, stubEnd, corridorEnd, remoteEnd, remoteReconnect] = ordered;
  if (!terminal || !stubEnd || !corridorEnd || !remoteEnd || !remoteReconnect) return [];
  const terminalAxis = axisOf(terminal, stubEnd);
  const corridorAxis = axisOf(stubEnd, corridorEnd);
  if (
    !terminalAxis
    || !corridorAxis
    || terminalAxis === corridorAxis
    || axisOf(corridorEnd, remoteEnd) !== terminalAxis
    || axisOf(remoteEnd, remoteReconnect) !== corridorAxis
    || trunkSegment.axis !== terminalAxis
  ) return [];
  const side = terminalSide(terminal, rect, role === 'source' ? edge.sourceHandle : edge.targetHandle);
  if (!side) return [];
  const expectedTerminalAxis = side === 'top' || side === 'bottom' ? 'v' : 'h';
  if (terminalAxis !== expectedTerminalAxis) return [];

  const terminalCoordinate = terminalAxis === 'v' ? terminal.y : terminal.x;
  const corridorLane = terminalAxis === 'v' ? corridorEnd.y : corridorEnd.x;
  const remoteLane = terminalAxis === 'v' ? remoteReconnect.y : remoteReconnect.x;
  const outwardDirection = Math.sign(corridorLane - terminalCoordinate);
  if (outwardDirection === 0 || outwardDirection * (remoteLane - corridorLane) <= EPS) return [];

  const opposingPath = allPaths[trunkSegment.edgeIndex] ?? [];
  let opposingPerpendicularMinimum = Number.POSITIVE_INFINITY;
  let opposingPerpendicularMaximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < opposingPath.length - 1; index += 1) {
    const first = opposingPath[index];
    const second = opposingPath[index + 1];
    const axis = axisOf(first, second);
    if (!axis || axis === terminalAxis) continue;
    const firstValue = terminalAxis === 'v' ? first.x : first.y;
    const secondValue = terminalAxis === 'v' ? second.x : second.y;
    opposingPerpendicularMinimum = Math.min(opposingPerpendicularMinimum, firstValue, secondValue);
    opposingPerpendicularMaximum = Math.max(opposingPerpendicularMaximum, firstValue, secondValue);
  }
  if (!Number.isFinite(opposingPerpendicularMinimum) || !Number.isFinite(opposingPerpendicularMaximum)) return [];
  const bypassPool = PORT_LANE_GAPS.flatMap(gap => [
    opposingPerpendicularMinimum - gap,
    opposingPerpendicularMaximum + gap,
  ]);
  for (const obstacle of obstacleRects) {
    const obstacleMinimum = terminalAxis === 'v' ? obstacle.x : obstacle.y;
    const obstacleMaximum = terminalAxis === 'v'
      ? obstacle.x + obstacle.width
      : obstacle.y + obstacle.height;
    for (const gap of PORT_LANE_GAPS) {
      bypassPool.push(obstacleMinimum - gap, obstacleMaximum + gap);
    }
  }
  const terminalPerpendicularCoordinate = terminalAxis === 'v' ? terminal.x : terminal.y;
  const reconnectPerpendicularCoordinate = terminalAxis === 'v' ? remoteReconnect.x : remoteReconnect.y;
  const preferredBypassDirection = Math.sign(
    reconnectPerpendicularCoordinate - terminalPerpendicularCoordinate,
  );
  const bypassCoordinates = [...new Set(bypassPool
    .map(value => Math.round(value * 100) / 100)
    .filter(value => (
      value < opposingPerpendicularMinimum - EPS
      || value > opposingPerpendicularMaximum + EPS
    ))
    .filter(value => obstacleRects.every((obstacle) => {
      const obstacleMinimum = terminalAxis === 'v' ? obstacle.x : obstacle.y;
      const obstacleMaximum = terminalAxis === 'v'
        ? obstacle.x + obstacle.width
        : obstacle.y + obstacle.height;
      return value < obstacleMinimum - MIN_OBSTACLE_LANE_CLEARANCE
        || value > obstacleMaximum + MIN_OBSTACLE_LANE_CLEARANCE;
    })))]
    .sort((first, second) => {
      const firstPreferred = Math.sign(first - terminalPerpendicularCoordinate) === preferredBypassDirection ? 0 : 1;
      const secondPreferred = Math.sign(second - terminalPerpendicularCoordinate) === preferredBypassDirection ? 0 : 1;
      return firstPreferred - secondPreferred
        || Math.abs(first - terminalPerpendicularCoordinate)
          - Math.abs(second - terminalPerpendicularCoordinate);
    })
    .slice(0, MAX_BYPASS_COORDINATES);

  const candidates: Point[][] = [];
  for (const bypassCoordinate of bypassCoordinates) {
    const perpendicularMinimum = Math.min(bypassCoordinate, terminalPerpendicularCoordinate);
    const perpendicularMaximum = Math.max(bypassCoordinate, terminalPerpendicularCoordinate);
    let blockingExtent = corridorLane;
    let extentExpanded = true;
    while (extentExpanded) {
      extentExpanded = false;
      for (const segment of allSegments) {
        // The current corridor is precisely the geometry being replaced. Counting it as
        // a blocker can expand the connected wall all the way to remoteLane and suppress
        // every candidate on that side before the full-graph quality gates can evaluate it.
        if (segment.edgeIndex === edgeIndex) continue;
        if (segment.axis !== terminalAxis) continue;
        const perpendicularCoordinate = terminalAxis === 'v' ? segment.a.x : segment.a.y;
        if (
          perpendicularCoordinate < perpendicularMinimum - EPS
          || perpendicularCoordinate > perpendicularMaximum + EPS
        ) continue;
        const minimumValue = terminalAxis === 'v'
          ? Math.min(segment.a.y, segment.b.y)
          : Math.min(segment.a.x, segment.b.x);
        const maximumValue = terminalAxis === 'v'
          ? Math.max(segment.a.y, segment.b.y)
          : Math.max(segment.a.x, segment.b.x);
        if (outwardDirection > 0) {
          if (minimumValue > blockingExtent + EPS || maximumValue < corridorLane - EPS) continue;
          if (maximumValue > blockingExtent + EPS) {
            blockingExtent = maximumValue;
            extentExpanded = true;
          }
        } else {
          if (maximumValue < blockingExtent - EPS || minimumValue > corridorLane + EPS) continue;
          if (minimumValue < blockingExtent - EPS) {
            blockingExtent = minimumValue;
            extentExpanded = true;
          }
        }
      }
      for (const obstacle of obstacleRects) {
        const obstaclePerpendicularMinimum = terminalAxis === 'v' ? obstacle.x : obstacle.y;
        const obstaclePerpendicularMaximum = terminalAxis === 'v'
          ? obstacle.x + obstacle.width
          : obstacle.y + obstacle.height;
        if (
          obstaclePerpendicularMaximum < perpendicularMinimum - EPS
          || obstaclePerpendicularMinimum > perpendicularMaximum + EPS
        ) continue;
        const obstacleMinimum = terminalAxis === 'v' ? obstacle.y : obstacle.x;
        const obstacleMaximum = terminalAxis === 'v'
          ? obstacle.y + obstacle.height
          : obstacle.x + obstacle.width;
        if (outwardDirection > 0) {
          if (obstacleMinimum > blockingExtent + EPS || obstacleMaximum < corridorLane - EPS) continue;
          if (obstacleMaximum > blockingExtent + EPS) {
            blockingExtent = obstacleMaximum;
            extentExpanded = true;
          }
        } else {
          if (obstacleMaximum < blockingExtent - EPS || obstacleMinimum > corridorLane + EPS) continue;
          if (obstacleMinimum < blockingExtent - EPS) {
            blockingExtent = obstacleMinimum;
            extentExpanded = true;
          }
        }
      }
    }
    const reentryLanes = PORT_LANE_GAPS
      .map(gap => blockingExtent + outwardDirection * gap)
      .filter(value => outwardDirection * (value - terminalCoordinate) > EPS)
      .filter(value => outwardDirection * (remoteLane - value) > EPS);
    for (const reentryLane of reentryLanes) {
      const candidate = terminalAxis === 'v'
        ? [
          { ...terminal },
          { x: terminal.x, y: reentryLane },
          { x: bypassCoordinate, y: reentryLane },
          { x: bypassCoordinate, y: remoteLane },
          { ...remoteReconnect },
          ...ordered.slice(5).map(point => ({ ...point })),
        ]
        : [
          { ...terminal },
          { x: reentryLane, y: terminal.y },
          { x: reentryLane, y: bypassCoordinate },
          { x: remoteLane, y: bypassCoordinate },
          { ...remoteReconnect },
          ...ordered.slice(5).map(point => ({ ...point })),
        ];
      const compacted = compactPath(candidate);
      candidates.push(role === 'source' ? compacted : compacted.reverse());
    }
  }
  return candidates;
}

/**
 * Moves an automatic terminal to an adjacent node side when parallel incoming corridors form a
 * complete wall across the current side. The remote route is preserved from the first point far
 * enough away to form a readable outer corridor; full-graph quality and obstacle gates still make
 * the final decision.
 */
function buildAdjacentTerminalSideEscapeCandidates(
  edge: Edge,
  path: Point[],
  role: Role,
  rect: Rect,
  crossingSegment: PathSegmentRef,
): TerminalPathCandidate[] {
  if (terminalSideIsFixed(edge, role) || path.length < 4) return [];
  if (crossingSegment.segIdx !== originalSegmentIndex(role, 1, path.length)) return [];
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const terminal = ordered[0];
  const currentStubEnd = ordered[1];
  if (!terminal || !currentStubEnd) return [];
  const currentAxis = axisOf(terminal, currentStubEnd);
  const currentSide = terminalSide(
    terminal,
    rect,
    role === 'source' ? edge.sourceHandle : edge.targetHandle,
  );
  if (!currentAxis || !currentSide) return [];
  const expectedCurrentAxis = currentSide === 'top' || currentSide === 'bottom' ? 'v' : 'h';
  if (currentAxis !== expectedCurrentAxis) return [];

  const adjacentSides: Side[] = currentAxis === 'h'
    ? ['top', 'bottom']
    : ['left', 'right'];
  const candidates: TerminalPathCandidate[] = [];
  for (const gap of PORT_LANE_GAPS.filter(value => value >= 48)) {
    for (const side of adjacentSides) {
      const nextAxis: Axis = side === 'top' || side === 'bottom' ? 'v' : 'h';
      const terminalAlongSide = nextAxis === 'v'
        ? Math.max(rect.x + SIDE_INSET, Math.min(rect.x + rect.width - SIDE_INSET, terminal.x))
        : Math.max(rect.y + SIDE_INSET, Math.min(rect.y + rect.height - SIDE_INSET, terminal.y));
      const nextTerminal: Point = nextAxis === 'v'
        ? { x: terminalAlongSide, y: side === 'top' ? rect.y : rect.y + rect.height }
        : { x: side === 'left' ? rect.x : rect.x + rect.width, y: terminalAlongSide };
      const outwardDirection = side === 'top' || side === 'left' ? -1 : 1;
      const outerLane = nextAxis === 'v'
        ? nextTerminal.y + outwardDirection * gap
        : nextTerminal.x + outwardDirection * gap;
      const remoteIndex = ordered.findIndex((point, index) => (
        index >= 2
        && Math.abs(
          nextAxis === 'v' ? point.x - nextTerminal.x : point.y - nextTerminal.y,
        ) >= MIN_READABLE_BYPASS_SPAN
      ));
      if (remoteIndex < 0) continue;
      const remote = ordered[remoteIndex];
      const candidateOrdered = nextAxis === 'v'
        ? [
          nextTerminal,
          { x: nextTerminal.x, y: outerLane },
          { x: remote.x, y: outerLane },
          { ...remote },
          ...ordered.slice(remoteIndex + 1).map(point => ({ ...point })),
        ]
        : [
          nextTerminal,
          { x: outerLane, y: nextTerminal.y },
          { x: outerLane, y: remote.y },
          { ...remote },
          ...ordered.slice(remoteIndex + 1).map(point => ({ ...point })),
        ];
      const compacted = compactPath(candidateOrdered);
      candidates.push({
        path: role === 'source' ? compacted : compacted.reverse(),
        terminalSide: side,
      });
    }
  }
  return candidates;
}

function buildFixedTerminalStubBypassCandidates(
  edge: Edge,
  path: Point[],
  role: Role,
  rect: Rect,
  crossingSegment: PathSegmentRef,
  corridorSegment: PathSegmentRef,
  allSegments: IndexedPathSegment[],
  obstacleRects: Rect[],
  edgeIndex: number,
): Point[][] {
  if (path.length < 3) return [];
  if (crossingSegment.segIdx !== originalSegmentIndex(role, 0, path.length)) return [];
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const [terminal, stubEnd, reconnect] = ordered;
  if (!terminal || !stubEnd || !reconnect) return [];
  const terminalAxis = axisOf(terminal, stubEnd);
  const reconnectAxis = axisOf(stubEnd, reconnect);
  if (!terminalAxis || !reconnectAxis || terminalAxis === reconnectAxis) return [];
  if (corridorSegment.axis === terminalAxis) return [];
  const side = terminalSide(terminal, rect, role === 'source' ? edge.sourceHandle : edge.targetHandle);
  if (!side) return [];
  const expectedTerminalAxis = side === 'top' || side === 'bottom' ? 'v' : 'h';
  if (terminalAxis !== expectedTerminalAxis) return [];

  const terminalCoordinate = terminalAxis === 'v' ? terminal.y : terminal.x;
  const stubEndCoordinate = terminalAxis === 'v' ? stubEnd.y : stubEnd.x;
  const crossingCoordinate = terminalAxis === 'v' ? corridorSegment.a.y : corridorSegment.a.x;
  const outwardDirection = Math.sign(stubEndCoordinate - terminalCoordinate);
  if (outwardDirection === 0) return [];
  const preCrossLane = terminalCoordinate + outwardDirection * FIXED_PORT_OUTWARD_STUB;
  if (outwardDirection * (crossingCoordinate - preCrossLane) <= EPS) return [];
  if (outwardDirection * (stubEndCoordinate - crossingCoordinate) <= EPS) return [];

  let corridorMinimum = terminalAxis === 'v'
    ? Math.min(corridorSegment.a.x, corridorSegment.b.x)
    : Math.min(corridorSegment.a.y, corridorSegment.b.y);
  let corridorMaximum = terminalAxis === 'v'
    ? Math.max(corridorSegment.a.x, corridorSegment.b.x)
    : Math.max(corridorSegment.a.y, corridorSegment.b.y);
  // Adjacent perpendicular segments on the same lane form one continuous
  // wall. Expand the seed corridor before choosing an upper/lower bypass so
  // a crossing is not merely moved onto the next edge in that wall.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const segment of allSegments) {
      if (segment.edgeIndex === edgeIndex || segment.axis === terminalAxis) continue;
      const laneCoordinate = terminalAxis === 'v' ? segment.a.y : segment.a.x;
      if (Math.abs(laneCoordinate - crossingCoordinate) > EPS) continue;
      const minimumValue = terminalAxis === 'v'
        ? Math.min(segment.a.x, segment.b.x)
        : Math.min(segment.a.y, segment.b.y);
      const maximumValue = terminalAxis === 'v'
        ? Math.max(segment.a.x, segment.b.x)
        : Math.max(segment.a.y, segment.b.y);
      if (maximumValue < corridorMinimum - EPS || minimumValue > corridorMaximum + EPS) continue;
      if (minimumValue < corridorMinimum - EPS || maximumValue > corridorMaximum + EPS) {
        corridorMinimum = Math.min(corridorMinimum, minimumValue);
        corridorMaximum = Math.max(corridorMaximum, maximumValue);
        expanded = true;
      }
    }
  }
  const bypassCoordinatePool = PORT_LANE_GAPS.flatMap(gap => [
    corridorMinimum - gap,
    corridorMaximum + gap,
  ]);
  for (const segment of allSegments) {
    if (segment.edgeIndex === edgeIndex || segment.axis === terminalAxis) continue;
    const firstValue = terminalAxis === 'v' ? segment.a.x : segment.a.y;
    const secondValue = terminalAxis === 'v' ? segment.b.x : segment.b.y;
    for (const endpointValue of [firstValue, secondValue]) {
      for (const gap of PORT_LANE_GAPS) {
        bypassCoordinatePool.push(endpointValue - gap, endpointValue + gap);
      }
    }
  }
  const bypassCoordinates = [...new Set(bypassCoordinatePool
    .map(value => Math.round(value * 100) / 100)
    .filter(value => value < corridorMinimum - EPS || value > corridorMaximum + EPS))]
    .sort((first, second) => (
      Math.abs(first - (terminalAxis === 'v' ? terminal.x : terminal.y))
      - Math.abs(second - (terminalAxis === 'v' ? terminal.x : terminal.y))
    ))
    .slice(0, MAX_BYPASS_COORDINATES);
  const candidates: Point[][] = [];
  for (const bypassCoordinate of bypassCoordinates) {
    const perpendicularMinimum = Math.min(bypassCoordinate, terminalAxis === 'v' ? stubEnd.x : stubEnd.y);
    const perpendicularMaximum = Math.max(bypassCoordinate, terminalAxis === 'v' ? stubEnd.x : stubEnd.y);
    let blockingExtent = crossingCoordinate;
    let extentExpanded = true;
    while (extentExpanded) {
      extentExpanded = false;
      for (const segment of allSegments) {
        if (segment.edgeIndex === edgeIndex || segment.axis !== terminalAxis) continue;
        const perpendicularCoordinate = terminalAxis === 'v' ? segment.a.x : segment.a.y;
        if (
          perpendicularCoordinate < perpendicularMinimum - EPS
          || perpendicularCoordinate > perpendicularMaximum + EPS
        ) continue;
        const minimumValue = terminalAxis === 'v'
          ? Math.min(segment.a.y, segment.b.y)
          : Math.min(segment.a.x, segment.b.x);
        const maximumValue = terminalAxis === 'v'
          ? Math.max(segment.a.y, segment.b.y)
          : Math.max(segment.a.x, segment.b.x);
        if (outwardDirection > 0) {
          if (minimumValue > blockingExtent + EPS || maximumValue < crossingCoordinate - EPS) continue;
          if (maximumValue > blockingExtent + EPS) {
            blockingExtent = maximumValue;
            extentExpanded = true;
          }
        } else {
          if (maximumValue < blockingExtent - EPS || minimumValue > crossingCoordinate + EPS) continue;
          if (minimumValue < blockingExtent - EPS) {
            blockingExtent = minimumValue;
            extentExpanded = true;
          }
        }
      }
      for (const obstacle of obstacleRects) {
        const obstaclePerpendicularMinimum = terminalAxis === 'v' ? obstacle.x : obstacle.y;
        const obstaclePerpendicularMaximum = terminalAxis === 'v'
          ? obstacle.x + obstacle.width
          : obstacle.y + obstacle.height;
        if (
          obstaclePerpendicularMaximum < perpendicularMinimum - EPS
          || obstaclePerpendicularMinimum > perpendicularMaximum + EPS
        ) continue;
        const obstacleMinimum = terminalAxis === 'v' ? obstacle.y : obstacle.x;
        const obstacleMaximum = terminalAxis === 'v'
          ? obstacle.y + obstacle.height
          : obstacle.x + obstacle.width;
        if (outwardDirection > 0) {
          if (obstacleMinimum > blockingExtent + EPS || obstacleMaximum < crossingCoordinate - EPS) continue;
          if (obstacleMaximum > blockingExtent + EPS) {
            blockingExtent = obstacleMaximum;
            extentExpanded = true;
          }
        } else {
          if (obstacleMaximum < blockingExtent - EPS || obstacleMinimum > crossingCoordinate + EPS) continue;
          if (obstacleMinimum < blockingExtent - EPS) {
            blockingExtent = obstacleMinimum;
            extentExpanded = true;
          }
        }
      }
    }
    const clearanceLane = blockingExtent + outwardDirection * (PORT_LANE_GAPS[0] ?? 32);
    const readableLane = preCrossLane + outwardDirection * MIN_READABLE_BYPASS_SPAN;
    const firstPostCrossLane = outwardDirection > 0
      ? Math.max(clearanceLane, readableLane)
      : Math.min(clearanceLane, readableLane);
    const postCrossLanes = [0, 16, 32]
      .map(gap => firstPostCrossLane + outwardDirection * gap)
      .filter(value => outwardDirection * (stubEndCoordinate - value) > EPS)
      .filter(value => Math.abs(value - preCrossLane) >= MIN_READABLE_BYPASS_SPAN);
    for (const postCrossLane of postCrossLanes) {
      const candidate = terminalAxis === 'v'
        ? [
          { ...terminal },
          { x: terminal.x, y: preCrossLane },
          { x: bypassCoordinate, y: preCrossLane },
          { x: bypassCoordinate, y: postCrossLane },
          { x: stubEnd.x, y: postCrossLane },
          { ...stubEnd },
          ...ordered.slice(2).map(point => ({ ...point })),
        ]
        : [
          { ...terminal },
          { x: preCrossLane, y: terminal.y },
          { x: preCrossLane, y: bypassCoordinate },
          { x: postCrossLane, y: bypassCoordinate },
          { x: postCrossLane, y: stubEnd.y },
          { ...stubEnd },
          ...ordered.slice(2).map(point => ({ ...point })),
        ];
      const compacted = compactPath(candidate);
      candidates.push(role === 'source' ? compacted : compacted.reverse());
    }
  }
  return candidates;
}

function buildTerminalStubShiftCandidates(
  edge: Edge,
  path: Point[],
  role: Role,
  rect: Rect,
  crossingSegment: PathSegmentRef,
  corridorSegment: PathSegmentRef,
): Point[][] {
  if (terminalSideIsFixed(edge, role) || path.length < 3) return [];
  if (crossingSegment.segIdx !== originalSegmentIndex(role, 0, path.length)) return [];
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const [terminal, stubEnd, reconnect] = ordered;
  if (!terminal || !stubEnd || !reconnect) return [];
  const terminalAxis = axisOf(terminal, stubEnd);
  const reconnectAxis = axisOf(stubEnd, reconnect);
  if (!terminalAxis || !reconnectAxis || terminalAxis === reconnectAxis) return [];
  if (corridorSegment.axis === terminalAxis) return [];
  const side = terminalSide(terminal, rect, role === 'source' ? edge.sourceHandle : edge.targetHandle);
  if (!side) return [];
  const expectedTerminalAxis = side === 'top' || side === 'bottom' ? 'v' : 'h';
  if (terminalAxis !== expectedTerminalAxis) return [];

  const corridorMinimum = terminalAxis === 'v'
    ? Math.min(corridorSegment.a.x, corridorSegment.b.x)
    : Math.min(corridorSegment.a.y, corridorSegment.b.y);
  const corridorMaximum = terminalAxis === 'v'
    ? Math.max(corridorSegment.a.x, corridorSegment.b.x)
    : Math.max(corridorSegment.a.y, corridorSegment.b.y);
  const minimum = terminalAxis === 'v' ? rect.x + SIDE_INSET : rect.y + SIDE_INSET;
  const maximum = terminalAxis === 'v'
    ? rect.x + rect.width - SIDE_INSET
    : rect.y + rect.height - SIDE_INSET;
  const seen = new Set<number>();
  const shiftedTerminalValues = PORT_LANE_GAPS
    .flatMap(gap => [corridorMinimum - gap, corridorMaximum + gap])
    .map(value => Math.max(minimum, Math.min(maximum, value)))
    .filter(value => value < corridorMinimum - EPS || value > corridorMaximum + EPS)
    .filter((value) => {
      const rounded = Math.round(value * 100) / 100;
      if (seen.has(rounded)) return false;
      seen.add(rounded);
      return true;
    });
  const terminalCoordinate = terminalAxis === 'v' ? terminal.y : terminal.x;
  const stubEndCoordinate = terminalAxis === 'v' ? stubEnd.y : stubEnd.x;
  const crossingCoordinate = terminalAxis === 'v' ? corridorSegment.a.y : corridorSegment.a.x;
  const outwardDirection = Math.sign(stubEndCoordinate - terminalCoordinate);
  const reconnectLaneValues = outwardDirection === 0
    ? []
    : PORT_LANE_GAPS
      .map(gap => crossingCoordinate + outwardDirection * gap)
      .filter(value => outwardDirection * (value - crossingCoordinate) > EPS)
      .filter(value => outwardDirection * (value - terminalCoordinate) > EPS)
      .filter(value => outwardDirection * (stubEndCoordinate - value) > EPS);
  const candidates: Point[][] = [];
  for (const value of shiftedTerminalValues) {
    for (const reconnectLane of reconnectLaneValues) {
      const localCandidate = terminalAxis === 'v'
        ? [
          { x: value, y: terminal.y },
          { x: value, y: reconnectLane },
          { x: stubEnd.x, y: reconnectLane },
          { ...stubEnd },
          ...ordered.slice(2).map(point => ({ ...point })),
        ]
        : [
          { x: terminal.x, y: value },
          { x: reconnectLane, y: value },
          { x: reconnectLane, y: stubEnd.y },
          { ...stubEnd },
          ...ordered.slice(2).map(point => ({ ...point })),
        ];
      const compacted = compactPath(localCandidate);
      candidates.push(role === 'source' ? compacted : compacted.reverse());
    }

    // Retain the whole-stub shift as a shorter alternative when the remote
    // trunk lane is also globally clear. Full-graph gates choose between it
    // and the local rejoin candidates above.
    {
      const candidate = ordered.map(point => ({ ...point }));
      if (terminalAxis === 'v') {
        candidate[0].x = value;
        candidate[1].x = value;
      } else {
        candidate[0].y = value;
        candidate[1].y = value;
      }
      const compacted = compactPath(candidate);
      candidates.push(role === 'source' ? compacted : compacted.reverse());
    }
  }
  return candidates;
}

function buildStraightTerminalShiftCandidates(
  edge: Edge,
  path: Point[],
  role: Role,
  rect: Rect,
  crossingSegment: PathSegmentRef,
  corridorSegment: PathSegmentRef,
): Point[][] {
  if (terminalSideIsFixed(edge, role) || path.length !== 2) return [];
  if (crossingSegment.segIdx !== originalSegmentIndex(role, 0, path.length)) return [];
  const ordered = role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }));
  const [terminal, adjacent] = ordered;
  if (!terminal || !adjacent) return [];
  const terminalAxis = axisOf(terminal, adjacent);
  if (!terminalAxis || corridorSegment.axis === terminalAxis) return [];
  const side = terminalSide(terminal, rect, role === 'source' ? edge.sourceHandle : edge.targetHandle);
  if (!side) return [];
  const expectedTerminalAxis = side === 'top' || side === 'bottom' ? 'v' : 'h';
  if (terminalAxis !== expectedTerminalAxis) return [];

  const corridorMinimum = terminalAxis === 'v'
    ? Math.min(corridorSegment.a.x, corridorSegment.b.x)
    : Math.min(corridorSegment.a.y, corridorSegment.b.y);
  const corridorMaximum = terminalAxis === 'v'
    ? Math.max(corridorSegment.a.x, corridorSegment.b.x)
    : Math.max(corridorSegment.a.y, corridorSegment.b.y);
  const minimum = terminalAxis === 'v' ? rect.x + SIDE_INSET : rect.y + SIDE_INSET;
  const maximum = terminalAxis === 'v'
    ? rect.x + rect.width - SIDE_INSET
    : rect.y + rect.height - SIDE_INSET;
  const laneValues = PORT_LANE_GAPS.flatMap(gap => [
    corridorMinimum - gap,
    corridorMaximum + gap,
  ]);
  const seen = new Set<number>();
  return laneValues
    .filter(value => value >= minimum - EPS && value <= maximum + EPS)
    .filter(value => value < corridorMinimum - EPS || value > corridorMaximum + EPS)
    .filter((value) => {
      const rounded = Math.round(value * 100) / 100;
      if (seen.has(rounded)) return false;
      seen.add(rounded);
      return true;
    })
    .map((value) => {
      const movedTerminal = terminalAxis === 'v'
        ? { x: value, y: terminal.y }
        : { x: terminal.x, y: value };
      const connector = terminalAxis === 'v'
        ? { x: value, y: adjacent.y }
        : { x: adjacent.x, y: value };
      const candidateOrdered = compactPath([movedTerminal, connector, adjacent]);
      return role === 'source' ? candidateOrdered : candidateOrdered.reverse();
    });
}

/**
 * Reorders automatic ports on the same node side when a bent source/target corridor cuts across
 * another edge's terminal trunk. Only the terminal anchor and its outward stub move; the node and
 * the remaining route stay fixed, and full-graph crossing/overlap/obstacle gates select the result.
 */
export function repairSharedEndpointPortOrderCrossings(
  edges: Edge[],
  nodes: ReactFlowNode[],
): Edge[] {
  if (edges.length < 2 || nodes.length === 0) return edges;
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const obstacles = buildObstacleMap(nodes);
  const obstacleRects = [...obstacles.values()];
  let current = edges;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const paths = current.map(getEdgePath);
    const allSegments = indexedPathSegments(paths);
    const crossings = findStrictCrossings(paths, current)
      .filter((crossing) => {
        const firstEdge = current[crossing.a.edgeIndex];
        const secondEdge = current[crossing.b.edgeIndex];
        if (!firstEdge || !secondEdge) return false;
        const shared = sharedNodeRole(firstEdge, secondEdge);
        if (!shared) return false;
        return segmentIsNearSharedTerminal(
          crossing.a,
          shared.firstRole,
          paths[crossing.a.edgeIndex]?.length ?? 0,
        ) && segmentIsNearSharedTerminal(
          crossing.b,
          shared.secondRole,
          paths[crossing.b.edgeIndex]?.length ?? 0,
        );
      })
      .slice(0, MAX_RELEVANT_CROSSINGS_PER_PASS);
    if (crossings.length === 0) break;
    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineObstacleHits = totalObstacleHits(current, obstacles);
    let accepted: Edge[] | null = null;
    let acceptedQuality = baselineQuality;
    let candidateEvaluations = 0;

    for (const crossing of crossings) {
      if (candidateEvaluations >= MAX_CANDIDATE_EVALUATIONS_PER_PASS) break;
      const firstEdge = current[crossing.a.edgeIndex];
      const secondEdge = current[crossing.b.edgeIndex];
      if (!firstEdge || !secondEdge) continue;
      const shared = sharedNodeRole(firstEdge, secondEdge);
      if (!shared) continue;
      const rect = nodeRect(nodeById.get(shared.nodeId));
      if (!rect) continue;
      const attempts = [
        {
          edgeIndex: crossing.a.edgeIndex,
          role: shared.firstRole,
          crossingSegment: crossing.a,
          trunkSegment: crossing.b,
        },
        {
          edgeIndex: crossing.b.edgeIndex,
          role: shared.secondRole,
          crossingSegment: crossing.b,
          trunkSegment: crossing.a,
        },
      ] as const;

      const preparedAttempts = attempts.map((attempt) => {
        const edge = current[attempt.edgeIndex];
        const path = paths[attempt.edgeIndex];
        return { attempt, candidatePaths: [
          ...buildAdjacentTerminalSideEscapeCandidates(
            edge,
            path,
            attempt.role,
            rect,
            attempt.crossingSegment,
          ),
          ...buildBentCorridorLaneEscapeCandidates(
            edge,
            path,
            attempt.role,
            rect,
            attempt.crossingSegment,
            attempt.trunkSegment,
            paths,
            allSegments,
            obstacleRects,
            attempt.edgeIndex,
          ).map(candidatePath => ({ path: candidatePath })),
          ...buildFixedTerminalStubBypassCandidates(
            edge,
            path,
            attempt.role,
            rect,
            attempt.crossingSegment,
            attempt.trunkSegment,
            allSegments,
            obstacleRects,
            attempt.edgeIndex,
          ).map(candidatePath => ({ path: candidatePath })),
          ...buildBentTerminalShiftCandidates(
            edge,
            path,
            attempt.role,
            rect,
            attempt.crossingSegment,
            attempt.trunkSegment,
          ).map(candidatePath => ({ path: candidatePath })),
          ...buildTerminalStubShiftCandidates(
            edge,
            path,
            attempt.role,
            rect,
            attempt.crossingSegment,
            attempt.trunkSegment,
          ).map(candidatePath => ({ path: candidatePath })),
          ...buildStraightTerminalShiftCandidates(
            edge,
            path,
            attempt.role,
            rect,
            attempt.crossingSegment,
            attempt.trunkSegment,
          ).map(candidatePath => ({ path: candidatePath })),
        ] };
      });
      const maximumAttemptCandidates = Math.max(
        0,
        ...preparedAttempts.map(prepared => prepared.candidatePaths.length),
      );
      for (
        let candidateIndex = 0;
        candidateIndex < maximumAttemptCandidates
          && candidateEvaluations < MAX_CANDIDATE_EVALUATIONS_PER_PASS;
        candidateIndex += 1
      ) {
        for (const prepared of preparedAttempts) {
          const candidatePath = prepared.candidatePaths[candidateIndex];
          if (!candidatePath) continue;
          if (candidateEvaluations >= MAX_CANDIDATE_EVALUATIONS_PER_PASS) break;
          candidateEvaluations += 1;
          const { attempt } = prepared;
          const candidate = current.map((item, index) => (
            index === attempt.edgeIndex
              ? withPath(
                item,
                candidatePath.path,
                attempt.role,
                candidatePath.terminalSide,
              )
              : item
          ));
          const candidateQuality = qualityContext.evaluateChanged(candidate, [attempt.edgeIndex]);
          if (candidateQuality.strictCrossings >= baselineQuality.strictCrossings) continue;
          if (!hardQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
          if (totalObstacleHits(candidate, obstacles) > baselineObstacleHits) continue;
          if (
            !accepted
            || candidateQuality.strictCrossings < acceptedQuality.strictCrossings
            || (
              candidateQuality.strictCrossings === acceptedQuality.strictCrossings
              && candidateQuality.totalLength < acceptedQuality.totalLength
            )
          ) {
            accepted = candidate;
            acceptedQuality = candidateQuality;
          }
        }
      }
    }

    if (!accepted) break;
    current = accepted;
  }
  return current;
}
