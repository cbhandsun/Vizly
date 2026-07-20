import type { Edge } from '@xyflow/react';

import type { Point, Rect } from './edgeLocalDoglegGeometry';
import {
  EPS,
  MIN_ENDPOINT_CHANNEL_NOISE,
  MIN_READABLE_SIDE_STEP,
  MIN_TERMINAL_STUB,
  MIN_TINY_CORNER_LANE_OFFSET,
  OBSTACLE_PADDING,
  OUTER_LANE_CLEARANCES,
  TINY_INTERIOR_SEGMENT,
  axisOf,
  compactPath,
  localVisualNoise,
  segmentLength,
  slideEndpointOnSide,
} from './edgeLocalDoglegGeometry';
import {
  horizontalStrictCrossingCoordinates,
  isOnHorizontalSide,
  isOnVerticalSide,
  nodeSideCoordinates,
  overlapsRange,
  verticalStrictCrossingCoordinates,
} from './edgeLocalDoglegLaneGeometry';

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

export {
  addInteriorAxisValue,
  addOuterLaneCandidate,
  buildHorizontalBridgeYValues,
  buildOuterLaneContractionCandidates,
  buildTerminalStubCandidate,
  buildVerticalBridgeXValues,
  horizontalStrictCrossingCoordinates,
  isOnHorizontalSide,
  isOnVerticalSide,
  nodeSideCoordinates,
  overlapsRange,
  verticalStrictCrossingCoordinates,
} from './edgeLocalDoglegLaneGeometry';
