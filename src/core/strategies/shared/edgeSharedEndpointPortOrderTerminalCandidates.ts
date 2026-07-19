import type { Edge } from '@xyflow/react';

import type { PathSegmentRef } from './edgeDetachedOverlapRepair';
import {
  EPS,
  MIN_READABLE_BYPASS_SPAN,
  PORT_LANE_GAPS,
  SIDE_INSET,
  axisOf,
  compactPath,
  originalSegmentIndex,
  terminalSide,
  terminalSideIsFixed,
  type Axis,
  type Point,
  type Rect,
  type Role,
  type Side,
  type TerminalPathCandidate,
} from './edgeSharedEndpointPortOrderGeometry';

export function buildAdjacentTerminalSideEscapeCandidates(
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

  const adjacentSides: Side[] = currentAxis === 'h' ? ['top', 'bottom'] : ['left', 'right'];
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
        && Math.abs(nextAxis === 'v' ? point.x - nextTerminal.x : point.y - nextTerminal.y)
          >= MIN_READABLE_BYPASS_SPAN
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

export function buildStraightTerminalShiftCandidates(
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
  const laneValues = PORT_LANE_GAPS.flatMap(gap => [corridorMinimum - gap, corridorMaximum + gap]);
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
