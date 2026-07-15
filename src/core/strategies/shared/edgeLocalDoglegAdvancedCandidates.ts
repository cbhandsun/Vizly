import type { Edge } from '@xyflow/react';

import type { Axis, Point, Rect } from './edgeLocalDoglegGeometry';
import {
  EPS,
  MIN_CONTRACTED_OUTER_LANE,
  MIN_ENDPOINT_CHANNEL_NOISE,
  MIN_READABLE_SIDE_STEP,
  MIN_TERMINAL_STUB,
  MIN_TINY_CORNER_LANE_OFFSET,
  OBSTACLE_PADDING,
  OUTER_LANE_CLEARANCES,
  SIDE_INSET,
  SIDE_MATCH_TOLERANCE,
  TINY_INTERIOR_SEGMENT,
  axisOf,
  compactPath,
  localVisualNoise,
  segmentLength,
  slideEndpointOnSide,
  strictCross,
  toSegments,
} from './edgeLocalDoglegGeometry';


export function buildTinyCornerLaneBypassCandidates(points: Point[], index: number): Point[][] {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  if (!a || !b || !c || !d || !e) return [];

  const firstAxis = axisOf(a, b);
  const secondAxis = axisOf(b, c);
  const thirdAxis = axisOf(c, d);
  const fourthAxis = axisOf(d, e);
  if (!firstAxis || !secondAxis || !thirdAxis || !fourthAxis) return [];
  if (firstAxis !== thirdAxis || secondAxis !== fourthAxis || firstAxis === secondAxis) return [];
  if (segmentLength(b, c) >= TINY_INTERIOR_SEGMENT || segmentLength(c, d) >= TINY_INTERIOR_SEGMENT) {
    return [];
  }

  const firstDirection = firstAxis === 'v' ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
  const thirdDirection = thirdAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
  if (firstDirection === 0 || firstDirection !== thirdDirection) return [];

  const directions = [-firstDirection, firstDirection];
  const clearances = [MIN_TINY_CORNER_LANE_OFFSET, 40, 48, 64, 96, 128, 160];
  const candidates: Point[][] = [];

  if (firstAxis === 'h') {
    for (const direction of directions) {
      for (const clearance of clearances) {
        const laneX = a.x + direction * clearance;
        if (Math.abs(laneX - e.x) < MIN_TINY_CORNER_LANE_OFFSET) continue;
        candidates.push(compactPath([
          ...points.slice(0, index + 1),
          { x: laneX, y: a.y },
          { x: laneX, y: e.y },
          e,
          ...points.slice(index + 5),
        ]));
      }
    }
    return candidates;
  }

  for (const direction of directions) {
    for (const clearance of clearances) {
      const laneY = a.y + direction * clearance;
      if (Math.abs(laneY - e.y) < MIN_TINY_CORNER_LANE_OFFSET) continue;
      candidates.push(compactPath([
        ...points.slice(0, index + 1),
        { x: a.x, y: laneY },
        { x: e.x, y: laneY },
        e,
        ...points.slice(index + 5),
      ]));
    }
  }
  return candidates;
}

export function buildTinyCornerObstacleBypassCandidates(
  points: Point[],
  index: number,
  edge: Edge,
  obstacles: Map<string, Rect>,
): Point[][] {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  if (!a || !b || !c || !d || !e) return [];

  const firstAxis = axisOf(a, b);
  const secondAxis = axisOf(b, c);
  const thirdAxis = axisOf(c, d);
  const fourthAxis = axisOf(d, e);
  if (!firstAxis || !secondAxis || !thirdAxis || !fourthAxis) return [];
  if (firstAxis !== thirdAxis || secondAxis !== fourthAxis || firstAxis === secondAxis) return [];
  if (segmentLength(b, c) >= TINY_INTERIOR_SEGMENT || segmentLength(c, d) >= TINY_INTERIOR_SEGMENT) {
    return [];
  }

  const firstDirection = firstAxis === 'v' ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
  const thirdDirection = thirdAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
  if (firstDirection === 0 || firstDirection !== thirdDirection) return [];

  const laneValues = new Set<number>();
  if (firstAxis === 'h') {
    const minY = Math.min(a.y, e.y);
    const maxY = Math.max(a.y, e.y);
    for (const [nodeId, rect] of obstacles) {
      if (nodeId === edge.source || nodeId === edge.target) continue;
      if (!overlapsRange(minY, maxY, rect.y - OBSTACLE_PADDING, rect.y + rect.height + OBSTACLE_PADDING)) continue;
      for (const clearance of OUTER_LANE_CLEARANCES) {
        laneValues.add(Math.round(rect.x - OBSTACLE_PADDING - clearance));
        laneValues.add(Math.round(rect.x + rect.width + OBSTACLE_PADDING + clearance));
      }
    }
    return [...laneValues].map(laneX => compactPath([
      ...points.slice(0, index + 1),
      { x: laneX, y: a.y },
      { x: laneX, y: e.y },
      e,
      ...points.slice(index + 5),
    ]));
  }

  const minX = Math.min(a.x, e.x);
  const maxX = Math.max(a.x, e.x);
  for (const [nodeId, rect] of obstacles) {
    if (nodeId === edge.source || nodeId === edge.target) continue;
    if (!overlapsRange(minX, maxX, rect.x - OBSTACLE_PADDING, rect.x + rect.width + OBSTACLE_PADDING)) continue;
    for (const clearance of OUTER_LANE_CLEARANCES) {
      laneValues.add(Math.round(rect.y - OBSTACLE_PADDING - clearance));
      laneValues.add(Math.round(rect.y + rect.height + OBSTACLE_PADDING + clearance));
    }
  }
  return [...laneValues].map(laneY => compactPath([
    ...points.slice(0, index + 1),
    { x: a.x, y: laneY },
    { x: e.x, y: laneY },
    e,
    ...points.slice(index + 5),
  ]));
}

export function buildTinyCornerReadableLadderCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  if (!a || !b || !c || !d || !e) return null;

  const firstAxis = axisOf(a, b);
  const secondAxis = axisOf(b, c);
  const thirdAxis = axisOf(c, d);
  const fourthAxis = axisOf(d, e);
  if (!firstAxis || !secondAxis || !thirdAxis || !fourthAxis) return null;
  if (firstAxis !== thirdAxis || secondAxis !== fourthAxis || firstAxis === secondAxis) return null;
  if (segmentLength(b, c) >= TINY_INTERIOR_SEGMENT || segmentLength(c, d) >= TINY_INTERIOR_SEGMENT) {
    return null;
  }

  const firstDirection = firstAxis === 'v' ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
  const secondDirection = secondAxis === 'v' ? Math.sign(c.y - b.y) : Math.sign(c.x - b.x);
  const thirdDirection = thirdAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
  if (firstDirection === 0 || secondDirection === 0 || firstDirection !== thirdDirection) return null;

  const bridgeDirection = -firstDirection;
  if (firstAxis === 'h') {
    const entryY = c.y - secondDirection * TINY_INTERIOR_SEGMENT;
    const returnY = c.y + secondDirection * TINY_INTERIOR_SEGMENT;
    const laneX = c.x + bridgeDirection * TINY_INTERIOR_SEGMENT;
    return compactPath([
      ...points.slice(0, index),
      { x: a.x, y: entryY },
      { x: b.x, y: entryY },
      { x: b.x, y: c.y },
      { x: laneX, y: c.y },
      { x: laneX, y: returnY },
      { x: e.x, y: returnY },
      e,
      ...points.slice(index + 5),
    ]);
  }

  const entryX = c.x - secondDirection * TINY_INTERIOR_SEGMENT;
  const returnX = c.x + secondDirection * TINY_INTERIOR_SEGMENT;
  const laneY = c.y + bridgeDirection * TINY_INTERIOR_SEGMENT;
  return compactPath([
    ...points.slice(0, index),
    { x: entryX, y: a.y },
    { x: entryX, y: b.y },
    { x: c.x, y: b.y },
    { x: c.x, y: laneY },
    { x: returnX, y: laneY },
    { x: returnX, y: e.y },
    e,
    ...points.slice(index + 5),
  ]);
}

export function buildEndpointTinyCornerLaneCandidates(
  points: Point[],
  index: number,
  edgeKey: string,
  pathByEdgeKey: Map<string, Point[]>,
  sourceRect: Rect | null,
): Point[][] {
  if (index !== 1 || !sourceRect || points.length < 6) return [];
  const start = points[0];
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  if (!start || !a || !b || !c || !d || !e) return [];

  const previousAxis = axisOf(start, a);
  const firstAxis = axisOf(a, b);
  const secondAxis = axisOf(b, c);
  const thirdAxis = axisOf(c, d);
  const fourthAxis = axisOf(d, e);
  if (!previousAxis || !firstAxis || !secondAxis || !thirdAxis || !fourthAxis) return [];
  if (firstAxis !== thirdAxis || secondAxis !== fourthAxis || firstAxis === secondAxis) return [];
  if (previousAxis !== secondAxis) return [];
  if (segmentLength(b, c) >= TINY_INTERIOR_SEGMENT || segmentLength(c, d) >= TINY_INTERIOR_SEGMENT) {
    return [];
  }

  const firstDirection = firstAxis === 'v' ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
  const thirdDirection = thirdAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
  if (firstDirection === 0 || firstDirection !== thirdDirection) return [];

  const endpointOffsets = [TINY_INTERIOR_SEGMENT, MIN_TINY_CORNER_LANE_OFFSET, 40, 48, 64, 96, 128, 160];
  const candidates: Point[][] = [];

  if (firstAxis === 'h') {
    const laneValues = strictCrossingBoundaryLaneValues('x', e.x, a.y, e.y, edgeKey, pathByEdgeKey);
    for (const laneX of laneValues) {
      for (const direction of [-1, 1]) {
        for (const offset of endpointOffsets) {
          const startX = laneX + direction * offset;
          const movedStart = slideEndpointOnSide(start, sourceRect, previousAxis, startX);
          if (!movedStart) continue;
          candidates.push(compactPath([
            movedStart,
            { x: movedStart.x, y: a.y },
            { x: laneX, y: a.y },
            { x: laneX, y: e.y },
            e,
            ...points.slice(index + 5),
          ]));
        }
      }
    }
    return candidates;
  }

  const laneValues = strictCrossingBoundaryLaneValues('y', e.y, a.x, e.x, edgeKey, pathByEdgeKey);
  for (const laneY of laneValues) {
    for (const direction of [-1, 1]) {
      for (const offset of endpointOffsets) {
        const startY = laneY + direction * offset;
        const movedStart = slideEndpointOnSide(start, sourceRect, previousAxis, startY);
        if (!movedStart) continue;
        candidates.push(compactPath([
          movedStart,
          { x: a.x, y: movedStart.y },
          { x: a.x, y: laneY },
          { x: e.x, y: laneY },
          e,
          ...points.slice(index + 5),
        ]));
      }
    }
  }
  return candidates;
}

export function strictCrossingBoundaryLaneValues(
  coordinateAxis: 'x' | 'y',
  directCoordinate: number,
  rangeStart: number,
  rangeEnd: number,
  edgeKey: string,
  pathByEdgeKey: Map<string, Point[]>,
): number[] {
  const values = new Set<number>();
  const minRange = Math.min(rangeStart, rangeEnd);
  const maxRange = Math.max(rangeStart, rangeEnd);
  for (const [otherKey, otherPath] of pathByEdgeKey) {
    if (otherKey === edgeKey) continue;
    for (let index = 0; index < otherPath.length - 1; index += 1) {
      const a = otherPath[index];
      const b = otherPath[index + 1];
      const axis = axisOf(a, b);
      if (!axis) continue;
      if (coordinateAxis === 'x') {
        if (axis !== 'h') continue;
        const y = a.y;
        if (y <= minRange + EPS || y >= maxRange - EPS) continue;
        if (directCoordinate <= Math.min(a.x, b.x) + EPS || directCoordinate >= Math.max(a.x, b.x) - EPS) {
          continue;
        }
        values.add(Math.round(Math.min(a.x, b.x)));
        values.add(Math.round(Math.max(a.x, b.x)));
      } else {
        if (axis !== 'v') continue;
        const x = a.x;
        if (x <= minRange + EPS || x >= maxRange - EPS) continue;
        if (directCoordinate <= Math.min(a.y, b.y) + EPS || directCoordinate >= Math.max(a.y, b.y) - EPS) {
          continue;
        }
        values.add(Math.round(Math.min(a.y, b.y)));
        values.add(Math.round(Math.max(a.y, b.y)));
      }
    }
  }
  return [...values];
}

export function buildTinyLeadingBridgeWidenCandidates(points: Point[], index: number): Point[][] {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  if (!a || !b || !c || !d) return [];

  const firstAxis = axisOf(a, b);
  const bridgeAxis = axisOf(b, c);
  const secondAxis = axisOf(c, d);
  if (!firstAxis || !bridgeAxis || !secondAxis) return [];
  if (firstAxis !== secondAxis || firstAxis === bridgeAxis) return [];
  const bridgeLength = segmentLength(b, c);
  if (bridgeLength <= EPS || bridgeLength >= TINY_INTERIOR_SEGMENT) return [];

  const firstMainDirection = firstAxis === 'v' ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
  const secondMainDirection = secondAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
  if (firstMainDirection === 0 || firstMainDirection !== secondMainDirection) return [];

  const bridgeDirection = firstAxis === 'v'
    ? Math.sign(c.x - b.x)
    : Math.sign(c.y - b.y);
  if (bridgeDirection === 0) return [];

  const directions = [bridgeDirection, -bridgeDirection];
  const clearances = [MIN_READABLE_SIDE_STEP, 64, 96, 128, 160, 224, 320];
  const candidates: Point[][] = [];

  if (firstAxis === 'v') {
    for (const direction of directions) {
      for (const clearance of clearances) {
        const laneX = a.x + direction * clearance;
        candidates.push([
          ...points.slice(0, index + 1),
          { x: a.x, y: b.y },
          { x: laneX, y: b.y },
          { x: laneX, y: d.y },
          d,
          ...points.slice(index + 4),
        ]);
      }
    }
    return candidates;
  }

  for (const direction of directions) {
    for (const clearance of clearances) {
      const laneY = a.y + direction * clearance;
      candidates.push([
        ...points.slice(0, index + 1),
        { x: b.x, y: a.y },
        { x: b.x, y: laneY },
        { x: d.x, y: laneY },
        d,
        ...points.slice(index + 4),
      ]);
    }
  }
  return candidates;
}

export function buildEndpointChannelBypassCandidates(
  points: Point[],
  edgeKey: string,
  pathByEdgeKey: Map<string, Point[]>,
  sourceRect: Rect | null,
  targetRect: Rect | null,
): Point[][] {
  if (!sourceRect || !targetRect || points.length < 4 || localVisualNoise(points) < MIN_ENDPOINT_CHANNEL_NOISE) {
    return [];
  }
  const start = points[0];
  const end = points[points.length - 1];
  const candidates: Point[][] = [];

  if (isOnHorizontalSide(start, sourceRect) && isOnHorizontalSide(end, targetRect)) {
    const startY = start.y;
    const endY = end.y;
    const sourceCoordinates = nodeSideCoordinates(sourceRect, 'x', start.x);
    for (const sourceX of sourceCoordinates) {
      const directCrossings = verticalStrictCrossingCoordinates(sourceX, startY, endY, edgeKey, pathByEdgeKey);
      if (directCrossings.length === 0) continue;
      const movedStart = slideEndpointOnSide(start, sourceRect, 'v', sourceX);
      if (!movedStart) continue;
      for (const crossingY of directCrossings) {
        for (const direction of [-1, 1]) {
          for (const exitDistance of [TINY_INTERIOR_SEGMENT, 32, 40, 48]) {
            const outerX = sourceX + direction * exitDistance;
            const targetX = outerX - direction * MIN_TERMINAL_STUB;
            const movedEnd = slideEndpointOnSide(end, targetRect, 'v', targetX);
            if (!movedEnd) continue;
            candidates.push(compactPath([
              movedStart,
              { x: movedStart.x, y: crossingY },
              { x: outerX, y: crossingY },
              { x: outerX, y: movedEnd.y },
              movedEnd,
            ]));
          }
        }
      }
    }
  }

  if (isOnVerticalSide(start, sourceRect) && isOnVerticalSide(end, targetRect)) {
    const startX = start.x;
    const endX = end.x;
    const sourceCoordinates = nodeSideCoordinates(sourceRect, 'y', start.y);
    for (const sourceY of sourceCoordinates) {
      const directCrossings = horizontalStrictCrossingCoordinates(sourceY, startX, endX, edgeKey, pathByEdgeKey);
      if (directCrossings.length === 0) continue;
      const movedStart = slideEndpointOnSide(start, sourceRect, 'h', sourceY);
      if (!movedStart) continue;
      for (const crossingX of directCrossings) {
        for (const direction of [-1, 1]) {
          for (const exitDistance of [TINY_INTERIOR_SEGMENT, 32, 40, 48]) {
            const outerY = sourceY + direction * exitDistance;
            const targetY = outerY - direction * MIN_TERMINAL_STUB;
            const movedEnd = slideEndpointOnSide(end, targetRect, 'h', targetY);
            if (!movedEnd) continue;
            candidates.push(compactPath([
              movedStart,
              { x: crossingX, y: movedStart.y },
              { x: crossingX, y: outerY },
              { x: movedEnd.x, y: outerY },
              movedEnd,
            ]));
          }
        }
      }
    }
  }

  return candidates;
}

export function isOnHorizontalSide(point: Point, rect: Rect): boolean {
  return Math.abs(point.y - rect.y) <= SIDE_MATCH_TOLERANCE
    || Math.abs(point.y - (rect.y + rect.height)) <= SIDE_MATCH_TOLERANCE;
}

export function isOnVerticalSide(point: Point, rect: Rect): boolean {
  return Math.abs(point.x - rect.x) <= SIDE_MATCH_TOLERANCE
    || Math.abs(point.x - (rect.x + rect.width)) <= SIDE_MATCH_TOLERANCE;
}

export function nodeSideCoordinates(rect: Rect, axis: 'x' | 'y', current: number): number[] {
  const min = axis === 'x' ? rect.x + SIDE_INSET : rect.y + SIDE_INSET;
  const max = axis === 'x' ? rect.x + rect.width - SIDE_INSET : rect.y + rect.height - SIDE_INSET;
  const values = new Set<number>();
  for (const value of [
    current,
    min,
    max,
    (min + max) / 2,
    min + MIN_TERMINAL_STUB,
    max - MIN_TERMINAL_STUB,
  ]) {
    if (value >= min - EPS && value <= max + EPS) values.add(Math.round(value));
  }
  return [...values];
}

export function verticalStrictCrossingCoordinates(
  x: number,
  y1: number,
  y2: number,
  edgeKey: string,
  pathByEdgeKey: Map<string, Point[]>,
): number[] {
  const values = new Set<number>();
  const probeA = { x, y: y1 };
  const probeB = { x, y: y2 };
  for (const [otherKey, otherPath] of pathByEdgeKey) {
    if (otherKey === edgeKey) continue;
    for (let index = 0; index < otherPath.length - 1; index += 1) {
      const a = otherPath[index];
      const b = otherPath[index + 1];
      if (axisOf(a, b) === 'h' && strictCross(probeA, probeB, a, b)) {
        values.add(Math.round(a.y));
      }
    }
  }
  return [...values].sort((a, b) => Math.abs(a - y1) - Math.abs(b - y1));
}

export function horizontalStrictCrossingCoordinates(
  y: number,
  x1: number,
  x2: number,
  edgeKey: string,
  pathByEdgeKey: Map<string, Point[]>,
): number[] {
  const values = new Set<number>();
  const probeA = { x: x1, y };
  const probeB = { x: x2, y };
  for (const [otherKey, otherPath] of pathByEdgeKey) {
    if (otherKey === edgeKey) continue;
    for (let index = 0; index < otherPath.length - 1; index += 1) {
      const a = otherPath[index];
      const b = otherPath[index + 1];
      if (axisOf(a, b) === 'v' && strictCross(probeA, probeB, a, b)) {
        values.add(Math.round(a.x));
      }
    }
  }
  return [...values].sort((a, b) => Math.abs(a - x1) - Math.abs(b - x1));
}

export function buildTerminalStubCandidate(points: Point[], atStart: boolean): Point[] | null {
  if (points.length < 3) return null;

  const endpointIndex = atStart ? 0 : points.length - 1;
  const bendIndex = atStart ? 1 : points.length - 2;
  const bridgeIndex = atStart ? 2 : points.length - 3;
  const endpoint = points[endpointIndex];
  const bend = points[bendIndex];
  const bridge = points[bridgeIndex];
  if (!endpoint || !bend || !bridge) return null;

  const stubAxis = axisOf(endpoint, bend);
  const bridgeAxis = axisOf(bend, bridge);
  if (!stubAxis || !bridgeAxis || stubAxis === bridgeAxis) return null;

  const currentLength = segmentLength(endpoint, bend);
  if (currentLength <= EPS || currentLength >= MIN_TERMINAL_STUB) return null;

  const delta = MIN_TERMINAL_STUB - currentLength;
  const next = points.map(point => ({ ...point }));

  if (stubAxis === 'v') {
    const direction = Math.sign(bend.y - endpoint.y);
    if (direction === 0) return null;
    const y = bend.y + direction * delta;
    next[bendIndex] = { ...next[bendIndex], y };
    next[bridgeIndex] = { ...next[bridgeIndex], y };
  } else {
    const direction = Math.sign(bend.x - endpoint.x);
    if (direction === 0) return null;
    const x = bend.x + direction * delta;
    next[bendIndex] = { ...next[bendIndex], x };
    next[bridgeIndex] = { ...next[bridgeIndex], x };
  }

  return next;
}

export function addOuterLaneCandidate(
  values: Set<number>,
  value: number,
  laneValue: number,
  mainMin: number,
  mainMax: number,
): void {
  if (!Number.isFinite(value)) return;
  const rounded = Math.round(value);
  const leftOuter = laneValue < mainMin - EPS;
  const rightOuter = laneValue > mainMax + EPS;
  const outsideMainBand = rounded <= mainMin - MIN_CONTRACTED_OUTER_LANE
    || rounded >= mainMax + MIN_CONTRACTED_OUTER_LANE;
  if (leftOuter && rounded > laneValue + EPS && outsideMainBand) {
    values.add(rounded);
  }
  if (rightOuter && rounded < laneValue - EPS && outsideMainBand) {
    values.add(rounded);
  }
}

export function overlapsRange(a1: number, a2: number, b1: number, b2: number): boolean {
  return Math.max(Math.min(a1, a2), Math.min(b1, b2)) < Math.min(Math.max(a1, a2), Math.max(b1, b2)) - EPS;
}

export function addInteriorAxisValue(values: Set<number>, value: number, first: number, second: number): void {
  if (!Number.isFinite(value)) return;
  const rounded = Math.round(value);
  const min = Math.min(first, second);
  const max = Math.max(first, second);
  if (rounded > min + MIN_CONTRACTED_OUTER_LANE && rounded < max - MIN_CONTRACTED_OUTER_LANE) {
    values.add(rounded);
  }
}

export function buildHorizontalBridgeYValues(
  points: Point[],
  index: number,
  laneX: number,
  pathByEdgeKey: Map<string, Point[]>,
  edgeKey: string,
): number[] {
  const previous = points[index - 1];
  const a = points[index];
  const c = points[index + 2];
  if (!previous || !a || !c || axisOf(previous, a) !== 'v') return [a?.y].filter(Number.isFinite);

  const values = new Set<number>();
  let mustMoveBridge = false;
  const bridgeMinX = Math.min(a.x, laneX);
  const bridgeMaxX = Math.max(a.x, laneX);
  for (const [otherKey, otherPath] of pathByEdgeKey) {
    if (otherKey === edgeKey) continue;
    for (const segment of toSegments(otherPath)) {
      const segmentAxis = axisOf(segment.a, segment.b);
      if (segmentAxis === 'v') {
        const x = segment.a.x;
        if (x <= bridgeMinX + EPS || x >= bridgeMaxX - EPS) continue;
        if (a.y <= Math.min(segment.a.y, segment.b.y) + EPS || a.y >= Math.max(segment.a.y, segment.b.y) - EPS) continue;
        mustMoveBridge = true;
        const minY = Math.min(segment.a.y, segment.b.y);
        const maxY = Math.max(segment.a.y, segment.b.y);
        for (const clearance of OUTER_LANE_CLEARANCES) {
          addInteriorAxisValue(values, c.y >= a.y ? maxY + clearance : minY - clearance, previous.y, c.y);
        }
      }
      if (segmentAxis === 'h') {
        const y = segment.a.y;
        if (laneX <= Math.min(segment.a.x, segment.b.x) + EPS || laneX >= Math.max(segment.a.x, segment.b.x) - EPS) continue;
        if (y <= Math.min(a.y, c.y) + EPS || y >= Math.max(a.y, c.y) - EPS) continue;
        mustMoveBridge = true;
        for (const clearance of OUTER_LANE_CLEARANCES) {
          addInteriorAxisValue(values, c.y >= a.y ? y + clearance : y - clearance, previous.y, c.y);
        }
      }
    }
  }
  if (!mustMoveBridge) values.add(Math.round(a.y));
  return [...values];
}

export function buildVerticalBridgeXValues(
  points: Point[],
  index: number,
  laneY: number,
  pathByEdgeKey: Map<string, Point[]>,
  edgeKey: string,
): number[] {
  const previous = points[index - 1];
  const a = points[index];
  const c = points[index + 2];
  if (!previous || !a || !c || axisOf(previous, a) !== 'h') return [a?.x].filter(Number.isFinite);

  const values = new Set<number>();
  let mustMoveBridge = false;
  const bridgeMinY = Math.min(a.y, laneY);
  const bridgeMaxY = Math.max(a.y, laneY);
  for (const [otherKey, otherPath] of pathByEdgeKey) {
    if (otherKey === edgeKey) continue;
    for (const segment of toSegments(otherPath)) {
      const segmentAxis = axisOf(segment.a, segment.b);
      if (segmentAxis === 'h') {
        const y = segment.a.y;
        if (y <= bridgeMinY + EPS || y >= bridgeMaxY - EPS) continue;
        if (a.x <= Math.min(segment.a.x, segment.b.x) + EPS || a.x >= Math.max(segment.a.x, segment.b.x) - EPS) continue;
        mustMoveBridge = true;
        const minX = Math.min(segment.a.x, segment.b.x);
        const maxX = Math.max(segment.a.x, segment.b.x);
        for (const clearance of OUTER_LANE_CLEARANCES) {
          addInteriorAxisValue(values, c.x >= a.x ? maxX + clearance : minX - clearance, previous.x, c.x);
        }
      }
      if (segmentAxis === 'v') {
        const x = segment.a.x;
        if (laneY <= Math.min(segment.a.y, segment.b.y) + EPS || laneY >= Math.max(segment.a.y, segment.b.y) - EPS) continue;
        if (x <= Math.min(a.x, c.x) + EPS || x >= Math.max(a.x, c.x) - EPS) continue;
        mustMoveBridge = true;
        for (const clearance of OUTER_LANE_CLEARANCES) {
          addInteriorAxisValue(values, c.x >= a.x ? x + clearance : x - clearance, previous.x, c.x);
        }
      }
    }
  }
  if (!mustMoveBridge) values.add(Math.round(a.x));
  return [...values];
}

export function buildOuterLaneContractionCandidates(
  points: Point[],
  index: number,
  edge: Edge,
  edgeKey: string,
  pathByEdgeKey: Map<string, Point[]>,
  obstacles: Map<string, Rect>,
): Point[][] {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  if (!a || !b || !c || !d) return [];

  const candidates: Point[][] = [];

  if (
    axisOf(a, b) === 'h'
    && axisOf(b, c) === 'v'
    && axisOf(c, d) === 'h'
    && Math.sign(b.x - a.x) === -Math.sign(d.x - c.x)
  ) {
    const laneX = b.x;
    const mainMin = Math.min(a.x, d.x);
    const mainMax = Math.max(a.x, d.x);
    if (laneX < mainMin - EPS || laneX > mainMax + EPS) {
      const values = new Set<number>();
      for (const [nodeId, rect] of obstacles) {
        if (nodeId === edge.source || nodeId === edge.target) continue;
        if (!overlapsRange(b.y, c.y, rect.y, rect.y + rect.height)) continue;
        for (const clearance of OUTER_LANE_CLEARANCES) {
          addOuterLaneCandidate(values, rect.x - clearance, laneX, mainMin, mainMax);
          addOuterLaneCandidate(values, rect.x + rect.width + clearance, laneX, mainMin, mainMax);
        }
      }
      for (const [otherKey, otherPath] of pathByEdgeKey) {
        if (otherKey === edgeKey) continue;
        for (const segment of toSegments(otherPath)) {
          if (axisOf(segment.a, segment.b) !== 'h') continue;
          if (segment.a.y <= Math.min(b.y, c.y) + EPS || segment.a.y >= Math.max(b.y, c.y) - EPS) continue;
          const minX = Math.min(segment.a.x, segment.b.x);
          const maxX = Math.max(segment.a.x, segment.b.x);
          for (const clearance of OUTER_LANE_CLEARANCES) {
            addOuterLaneCandidate(values, minX - clearance, laneX, mainMin, mainMax);
            addOuterLaneCandidate(values, maxX + clearance, laneX, mainMin, mainMax);
          }
        }
      }
      for (const value of values) {
        for (const entryY of buildHorizontalBridgeYValues(points, index, value, pathByEdgeKey, edgeKey)) {
          const shifted = points.map(point => ({ ...point }));
          shifted[index].y = entryY;
          shifted[index + 1] = { x: value, y: entryY };
          shifted[index + 2].x = value;
          candidates.push(shifted);
        }
      }
    }
  }

  if (
    axisOf(a, b) === 'v'
    && axisOf(b, c) === 'h'
    && axisOf(c, d) === 'v'
    && Math.sign(b.y - a.y) === -Math.sign(d.y - c.y)
  ) {
    const laneY = b.y;
    const mainMin = Math.min(a.y, d.y);
    const mainMax = Math.max(a.y, d.y);
    if (laneY < mainMin - EPS || laneY > mainMax + EPS) {
      const values = new Set<number>();
      for (const [nodeId, rect] of obstacles) {
        if (nodeId === edge.source || nodeId === edge.target) continue;
        if (!overlapsRange(b.x, c.x, rect.x, rect.x + rect.width)) continue;
        for (const clearance of OUTER_LANE_CLEARANCES) {
          addOuterLaneCandidate(values, rect.y - clearance, laneY, mainMin, mainMax);
          addOuterLaneCandidate(values, rect.y + rect.height + clearance, laneY, mainMin, mainMax);
        }
      }
      for (const [otherKey, otherPath] of pathByEdgeKey) {
        if (otherKey === edgeKey) continue;
        for (const segment of toSegments(otherPath)) {
          if (axisOf(segment.a, segment.b) !== 'v') continue;
          if (segment.a.x <= Math.min(b.x, c.x) + EPS || segment.a.x >= Math.max(b.x, c.x) - EPS) continue;
          const minY = Math.min(segment.a.y, segment.b.y);
          const maxY = Math.max(segment.a.y, segment.b.y);
          for (const clearance of OUTER_LANE_CLEARANCES) {
            addOuterLaneCandidate(values, minY - clearance, laneY, mainMin, mainMax);
            addOuterLaneCandidate(values, maxY + clearance, laneY, mainMin, mainMax);
          }
        }
      }
      for (const value of values) {
        for (const entryX of buildVerticalBridgeXValues(points, index, value, pathByEdgeKey, edgeKey)) {
          const shifted = points.map(point => ({ ...point }));
          shifted[index].x = entryX;
          shifted[index + 1] = { x: entryX, y: value };
          shifted[index + 2].y = value;
          candidates.push(shifted);
        }
      }
    }
  }

  return candidates;
}
