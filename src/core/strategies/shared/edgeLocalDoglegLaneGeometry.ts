import type { Edge } from '@xyflow/react';

import type { Point, Rect } from './edgeLocalDoglegGeometry';
import {
  EPS,
  MIN_CONTRACTED_OUTER_LANE,
  MIN_TERMINAL_STUB,
  OUTER_LANE_CLEARANCES,
  SIDE_INSET,
  SIDE_MATCH_TOLERANCE,
  axisOf,
  segmentLength,
  strictCross,
  toSegments,
} from './edgeLocalDoglegGeometry';

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
