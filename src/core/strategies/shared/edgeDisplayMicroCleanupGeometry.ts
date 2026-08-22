import type { Edge } from '@xyflow/react';

export type Point = { x: number; y: number };
export type Axis = 'h' | 'v';
const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);
export type SegmentRef = {
  edgeIndex: number;
  segmentIndex: number;
  a: Point;
  b: Point;
  axis: Axis;
};

export const EPS = 0.5;
export const MICRO_ENDPOINT_SLIDE = 24;
export const MIN_ENDPOINT_STUB = 40;
export const TINY_INTERIOR_SEGMENT = 24;
export const COMPOUND_CLEARANCES = [16, 24, 32, 40, 56, 72, 96, 128, 160];
export const MICRO_LANE_SHIFTS = [32, 48, 64, 80, 96, 128, 160, 192];
export const MICRO_BRIDGE_LANE_SHIFTS = [32, 48, 64, 80, 96, 104, 108, 112, 120, 128, 160, 192];
export const SIDE_APPROACH_OFFSETS = [40, 56, 72, 96, 128, 160];
export const RETURN_LOOP_CLEARANCES = [32, 40, 48, 56, 64, 80, 96, 128, 160];
export const SHARED_TRUNK_DETOUR_CLEARANCES = [144, 154, 160, 192, 224, 256, 320];
export const OUTER_DETOUR_COLLAPSE_OFFSETS = [
  24,
  32,
  40,
  48,
  64,
  80,
  96,
  128,
  160,
  192,
  224,
  256,
  320,
  384,
  448,
  512,
  576,
  640,
  704,
  736,
  752,
  768,
  784,
  800,
  816,
  832,
  864,
  896,
];
export const MAX_HAIRPIN_COLLAPSE_BRIDGE = 104;
export const MAX_MICRO_CANDIDATES_PER_EDGE = 72;
export const LARGE_GRAPH_MICRO_CANDIDATES_PER_EDGE = 14;

export const resolveMicroCandidateBudget = (edgeCount: number): number => (
  Number.isSafeInteger(edgeCount) && edgeCount > 32
    ? LARGE_GRAPH_MICRO_CANDIDATES_PER_EDGE
    : MAX_MICRO_CANDIDATES_PER_EDGE
);

export function getEdgePath(edge: Edge): Point[] {
  const raw = edge.data?.computedPath || edge.data?.elkPath || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(point => {
      const candidate = asRecord(point);
      return { x: Number(candidate.x), y: Number(candidate.y) };
    })
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

export function withComputedPath(edge: Edge, path: Point[]): Edge {
  const data: Record<string, unknown> = { ...(edge.data || {}), computedPath: path, displayMicroCleaned: true };
  const treeRouting = asRecord(data.treeRouting);
  if (Array.isArray(treeRouting.points)) {
    data.treeRouting = { ...treeRouting, points: path };
  }
  return { ...edge, data };
}

export function axisOf(a: Point, b: Point): Axis | null {
  if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
}

export function segmentLength(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function pathLength(points: Point[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += segmentLength(points[index], points[index + 1]);
  }
  return total;
}

export function pathDetourPenalty(path: Point[]): number {
  if (path.length < 2) return 0;
  const direct = segmentLength(path[0], path[path.length - 1]);
  if (direct <= EPS) return 0;
  const length = pathLength(path);
  const excess = length / direct - 1.8;
  if (excess <= 0) return 0;
  return Math.round(excess * direct);
}

export function segmentDirection(a: Point, b: Point, axis: Axis): -1 | 0 | 1 {
  const delta = axis === 'h' ? b.x - a.x : b.y - a.y;
  if (Math.abs(delta) <= EPS) return 0;
  return delta > 0 ? 1 : -1;
}

export function pathMicroMetrics(path: Point[]): { shortEndpointStubs: number; tinyInteriorDoglegs: number; hairpins: number } {
  let shortEndpointStubs = 0;
  let tinyInteriorDoglegs = 0;
  let hairpins = 0;
  if (path.length >= 3) {
    if (segmentLength(path[0], path[1]) < 32) shortEndpointStubs += 1;
    if (segmentLength(path[path.length - 2], path[path.length - 1]) < 32) shortEndpointStubs += 1;
  }
  for (let index = 1; index < path.length - 2; index += 1) {
    if (segmentLength(path[index], path[index + 1]) < TINY_INTERIOR_SEGMENT) tinyInteriorDoglegs += 1;
  }

  const segments: Array<{ axis: Axis; direction: -1 | 0 | 1; length: number }> = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const axis = axisOf(path[index], path[index + 1]);
    if (!axis) continue;
    segments.push({
      axis,
      direction: segmentDirection(path[index], path[index + 1], axis),
      length: segmentLength(path[index], path[index + 1]),
    });
  }
  for (let index = 0; index < segments.length - 2; index += 1) {
    const first = segments[index];
    const middle = segments[index + 1];
    const last = segments[index + 2];
    if (
      first.axis === last.axis
      && first.direction !== 0
      && last.direction !== 0
      && first.direction === -last.direction
      && middle.length < 140
    ) {
      hairpins += 1;
    }
  }
  return { shortEndpointStubs, tinyInteriorDoglegs, hairpins };
}

export function microCandidateRank(path: Point[]): number {
  const metrics = pathMicroMetrics(path);
  return metrics.shortEndpointStubs * 100_000
    + metrics.tinyInteriorDoglegs * 10_000
    + metrics.hairpins * 5_000
    + Math.max(0, path.length - 2) * 20
    + pathLength(path) * 0.01;
}

export function getSegments(edges: Edge[]): SegmentRef[] {
  return edges.flatMap((edge, edgeIndex) => {
    const path = getEdgePath(edge);
    const segments: SegmentRef[] = [];
    for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
      const axis = axisOf(path[segmentIndex], path[segmentIndex + 1]);
      if (!axis) continue;
      segments.push({
        edgeIndex,
        segmentIndex,
        a: path[segmentIndex],
        b: path[segmentIndex + 1],
        axis,
      });
    }
    return segments;
  });
}

export function strictlyCrosses(first: SegmentRef, second: SegmentRef): boolean {
  if (first.axis === second.axis) return false;
  const horizontal = first.axis === 'h' ? first : second;
  const vertical = first.axis === 'v' ? first : second;
  const x = vertical.a.x;
  const y = horizontal.a.y;
  return x > Math.min(horizontal.a.x, horizontal.b.x) + 1
    && x < Math.max(horizontal.a.x, horizontal.b.x) - 1
    && y > Math.min(vertical.a.y, vertical.b.y) + 1
    && y < Math.max(vertical.a.y, vertical.b.y) - 1;
}

export function strictCrossingPairsForEdge(edges: Edge[], edgeIndex: number): Array<{ changed: SegmentRef; other: SegmentRef }> {
  const segments = getSegments(edges);
  const pairs: Array<{ changed: SegmentRef; other: SegmentRef }> = [];
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      const first = segments[firstIndex];
      const second = segments[secondIndex];
      if (first.edgeIndex === second.edgeIndex) continue;
      if (first.edgeIndex !== edgeIndex && second.edgeIndex !== edgeIndex) continue;
      if (!strictlyCrosses(first, second)) continue;
      pairs.push(first.edgeIndex === edgeIndex
        ? { changed: first, other: second }
        : { changed: second, other: first });
    }
  }
  return pairs;
}

export function compactPath(points: Point[]): Point[] {
  const deduped: Point[] = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.abs(previous.x - point.x) > EPS || Math.abs(previous.y - point.y) > EPS) {
      deduped.push({ x: Math.round(point.x), y: Math.round(point.y) });
    }
  }
  if (deduped.length <= 2) return deduped;

  const result: Point[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    const sameX = Math.abs(previous.x - current.x) <= EPS && Math.abs(current.x - next.x) <= EPS;
    const sameY = Math.abs(previous.y - current.y) <= EPS && Math.abs(current.y - next.y) <= EPS;
    if (!sameX && !sameY) result.push(current);
  }
  result.push(deduped[deduped.length - 1]);
  return result;
}

export function hasSameEndpoints(first: Point[], second: Point[]): boolean {
  if (first.length < 2 || second.length < 2) return false;
  return Math.abs(first[0].x - second[0].x) <= EPS
    && Math.abs(first[0].y - second[0].y) <= EPS
    && Math.abs(first[first.length - 1].x - second[second.length - 1].x) <= EPS
    && Math.abs(first[first.length - 1].y - second[second.length - 1].y) <= EPS;
}

export function samePoint(first: Point, second: Point, tolerance = EPS): boolean {
  return Math.abs(first.x - second.x) <= tolerance && Math.abs(first.y - second.y) <= tolerance;
}

export function hasCompatibleDisplayEndpoints(first: Point[], second: Point[]): boolean {
  if (hasSameEndpoints(first, second)) return true;
  if (first.length < 2 || second.length < 2) return false;
  const startSlide = segmentLength(first[0], second[0]);
  const endSlide = segmentLength(first[first.length - 1], second[second.length - 1]);
  const startSame = startSlide <= EPS;
  const endSame = endSlide <= EPS;
  return (startSame && endSlide <= MICRO_ENDPOINT_SLIDE)
    || (endSame && startSlide <= MICRO_ENDPOINT_SLIDE);
}

export function allSegmentsOrthogonal(points: Point[]): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (!axisOf(points[index], points[index + 1])) return false;
  }
  return true;
}

export function hasSharedTrunkIntent(edge: Edge): boolean {
  const data = edge.data || {};
  return data.sharedTrunkSynthesized === true
    || data.sharedTrunkAware === true
    || data.isTreeBus === true
    || Boolean(data.treeRouting);
}

export function belongsToFanInTrunk(edge: Edge, edges: Edge[]): boolean {
  if (hasSharedTrunkIntent(edge)) return true;
  return edges.filter(candidate => candidate.id !== edge.id && candidate.target === edge.target).length >= 1;
}

export function buildOuterDetourCollapseCandidates(edge: Edge, points: Point[], edges: Edge[]): Point[][] {
  if (!belongsToFanInTrunk(edge, edges)) return [];
  if (points.length < 6) return [];
  if (pathDetourPenalty(points) <= 0) return [];

  const startAxis = axisOf(points[0], points[1]);
  const endAxis = axisOf(points[points.length - 2], points[points.length - 1]);
  if (!startAxis || startAxis !== endAxis) return [];

  const start = points[0];
  const sourcePivot = points[1];
  const outerPoint = points[2];
  const terminalPivot = points[points.length - 2];
  const end = points[points.length - 1];
  const candidates: Point[][] = [];
  const pushCandidate = (candidate: Point[]) => {
    if (!hasSameEndpoints(points, candidate)) return;
    if (!allSegmentsOrthogonal(candidate)) return;
    if (candidate.length > points.length) return;
    if (pathLength(candidate) >= pathLength(points) - 80) return;
    candidates.push(candidate);
  };

  pushCandidate(startAxis === 'v'
    ? compactPath([
      start,
      { x: start.x, y: terminalPivot.y },
      terminalPivot,
      end,
    ])
    : compactPath([
      start,
      { x: terminalPivot.x, y: start.y },
      terminalPivot,
      end,
    ]));

  const outerDirection = startAxis === 'v'
    ? Math.sign(outerPoint.x - start.x)
    : Math.sign(outerPoint.y - start.y);
  if (outerDirection !== 0) {
    const outerDistance = startAxis === 'v'
      ? Math.abs(outerPoint.x - start.x)
      : Math.abs(outerPoint.y - start.y);
    const offsets = OUTER_DETOUR_COLLAPSE_OFFSETS
      .filter(offset => offset < outerDistance - MIN_ENDPOINT_STUB);
    for (const offset of offsets) {
      if (startAxis === 'v') {
        const laneX = start.x + outerDirection * offset;
        pushCandidate(compactPath([
          start,
          { x: start.x, y: sourcePivot.y },
          { x: laneX, y: sourcePivot.y },
          { x: laneX, y: terminalPivot.y },
          terminalPivot,
          end,
        ]));
      } else {
        const laneY = start.y + outerDirection * offset;
        pushCandidate(compactPath([
          start,
          { x: sourcePivot.x, y: start.y },
          { x: sourcePivot.x, y: laneY },
          { x: terminalPivot.x, y: laneY },
          terminalPivot,
          end,
        ]));
      }
    }
  }

  return candidates;
}

export function hasSameTerminalAxes(first: Point[], second: Point[]): boolean {
  if (first.length < 2 || second.length < 2) return false;
  const firstStart = axisOf(first[0], first[1]);
  const secondStart = axisOf(second[0], second[1]);
  const firstEnd = axisOf(first[first.length - 2], first[first.length - 1]);
  const secondEnd = axisOf(second[second.length - 2], second[second.length - 1]);
  return firstStart === secondStart && firstEnd === secondEnd;
}

export function buildShiftedSegmentPath(points: Point[], segmentIndex: number, lane: number): Point[] | null {
  if (segmentIndex < 0 || segmentIndex >= points.length - 1) return null;
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  const axis = axisOf(a, b);
  if (!axis) return null;

  const prefix = points.slice(0, segmentIndex + 1);
  const suffix = points.slice(segmentIndex + 1);
  if (axis === 'v') {
    if (Math.abs(a.x - lane) <= EPS) return null;
    return compactPath([
      ...prefix,
      { x: lane, y: a.y },
      { x: lane, y: b.y },
      ...suffix,
    ]);
  }
  if (Math.abs(a.y - lane) <= EPS) return null;
  return compactPath([
    ...prefix,
    { x: a.x, y: lane },
    { x: b.x, y: lane },
    ...suffix,
  ]);
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
  if (currentLength <= EPS || currentLength >= MIN_ENDPOINT_STUB) return null;

  const delta = MIN_ENDPOINT_STUB - currentLength;
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
  return compactPath(next);
}

export function buildTinySideStepContinuationCollapseCandidate(points: Point[], segmentIndex: number): Point[] | null {
  if (segmentIndex < 0 || segmentIndex + 3 >= points.length) return null;
  const before = points[segmentIndex];
  const sideStepStart = points[segmentIndex + 1];
  const sideStepEnd = points[segmentIndex + 2];
  const continuationEnd = points[segmentIndex + 3];
  if (!before || !sideStepStart || !sideStepEnd || !continuationEnd) return null;

  const incomingAxis = axisOf(before, sideStepStart);
  const sideStepAxis = axisOf(sideStepStart, sideStepEnd);
  const outgoingAxis = axisOf(sideStepEnd, continuationEnd);
  if (!incomingAxis || !sideStepAxis || !outgoingAxis) return null;
  if (incomingAxis !== outgoingAxis || sideStepAxis === incomingAxis) return null;
  if (segmentLength(sideStepStart, sideStepEnd) >= TINY_INTERIOR_SEGMENT) return null;

  const incomingDirection = incomingAxis === 'h'
    ? Math.sign(sideStepStart.x - before.x)
    : Math.sign(sideStepStart.y - before.y);
  const outgoingDirection = outgoingAxis === 'h'
    ? Math.sign(continuationEnd.x - sideStepEnd.x)
    : Math.sign(continuationEnd.y - sideStepEnd.y);
  if (incomingDirection === 0 || incomingDirection !== outgoingDirection) return null;

  const collapsedContinuation = incomingAxis === 'h'
    ? { x: continuationEnd.x, y: sideStepStart.y }
    : { x: sideStepStart.x, y: continuationEnd.y };
  const candidate = compactPath([
    ...points.slice(0, segmentIndex + 2),
    collapsedContinuation,
    ...points.slice(segmentIndex + 4),
  ]);
  if (!hasSameEndpoints(points, candidate) || !allSegmentsOrthogonal(candidate)) return null;
  return candidate;
}

export function buildTinyParallelContinuationCollapseCandidate(points: Point[], segmentIndex: number): Point[] | null {
  if (segmentIndex <= 0 || segmentIndex + 3 >= points.length) return null;
  const segmentStart = points[segmentIndex];
  const tinyStart = points[segmentIndex + 1];
  const tinyEnd = points[segmentIndex + 2];
  const continuationEnd = points[segmentIndex + 3];
  if (!segmentStart || !tinyStart || !tinyEnd || !continuationEnd) return null;

  const incomingAxis = axisOf(segmentStart, tinyStart);
  const bridgeAxis = axisOf(tinyStart, tinyEnd);
  const outgoingAxis = axisOf(tinyEnd, continuationEnd);
  if (!incomingAxis || !bridgeAxis || !outgoingAxis) return null;
  if (incomingAxis !== outgoingAxis || bridgeAxis === incomingAxis) return null;
  if (segmentLength(tinyStart, tinyEnd) >= TINY_INTERIOR_SEGMENT) return null;

  const incomingDirection = incomingAxis === 'h'
    ? Math.sign(tinyStart.x - segmentStart.x)
    : Math.sign(tinyStart.y - segmentStart.y);
  const outgoingDirection = outgoingAxis === 'h'
    ? Math.sign(continuationEnd.x - tinyEnd.x)
    : Math.sign(continuationEnd.y - tinyEnd.y);
  if (incomingDirection === 0 || incomingDirection !== outgoingDirection) return null;

  const bridgePoint = incomingAxis === 'h'
    ? { x: segmentStart.x, y: tinyEnd.y }
    : { x: tinyEnd.x, y: segmentStart.y };
  const candidate = compactPath([
    ...points.slice(0, segmentIndex),
    bridgePoint,
    ...points.slice(segmentIndex + 3),
  ]);
  if (!hasSameEndpoints(points, candidate) || !allSegmentsOrthogonal(candidate)) return null;
  return candidate;
}

export function buildTinyBridgeExtensionCandidates(points: Point[], segmentIndex: number): Point[][] {
  if (segmentIndex < 0 || segmentIndex + 3 >= points.length) return [];
  const before = points[segmentIndex];
  const bridgeStart = points[segmentIndex + 1];
  const bridgeEnd = points[segmentIndex + 2];
  const continuationEnd = points[segmentIndex + 3];
  if (!before || !bridgeStart || !bridgeEnd || !continuationEnd) return [];

  const incomingAxis = axisOf(before, bridgeStart);
  const bridgeAxis = axisOf(bridgeStart, bridgeEnd);
  const outgoingAxis = axisOf(bridgeEnd, continuationEnd);
  if (!incomingAxis || !bridgeAxis || !outgoingAxis) return [];
  if (incomingAxis !== outgoingAxis || bridgeAxis === incomingAxis) return [];
  if (segmentLength(bridgeStart, bridgeEnd) >= TINY_INTERIOR_SEGMENT) return [];

  const incomingDirection = incomingAxis === 'h'
    ? Math.sign(bridgeStart.x - before.x)
    : Math.sign(bridgeStart.y - before.y);
  const outgoingDirection = outgoingAxis === 'h'
    ? Math.sign(continuationEnd.x - bridgeEnd.x)
    : Math.sign(continuationEnd.y - bridgeEnd.y);
  if (incomingDirection === 0 || incomingDirection !== outgoingDirection) return [];

  const bridgeDirection = bridgeAxis === 'h'
    ? Math.sign(bridgeEnd.x - bridgeStart.x)
    : Math.sign(bridgeEnd.y - bridgeStart.y);
  if (bridgeDirection === 0) return [];

  return [24, 32, 40, 48, 64, 80, 96, 128, 160].map((distance) => {
    const expandedBridgeEnd = bridgeAxis === 'h'
      ? { x: bridgeStart.x + bridgeDirection * distance, y: bridgeStart.y }
      : { x: bridgeStart.x, y: bridgeStart.y + bridgeDirection * distance };
    const expandedContinuation = incomingAxis === 'h'
      ? { x: continuationEnd.x, y: expandedBridgeEnd.y }
      : { x: expandedBridgeEnd.x, y: continuationEnd.y };
    const candidate = compactPath([
      ...points.slice(0, segmentIndex + 2),
      expandedBridgeEnd,
      expandedContinuation,
      ...points.slice(segmentIndex + 4),
    ]);
    return hasSameEndpoints(points, candidate) && allSegmentsOrthogonal(candidate) ? candidate : null;
  }).filter((candidate): candidate is Point[] => candidate !== null);
}

export function buildTinySideStepLaneBypassCandidates(points: Point[], segmentIndex: number): Point[][] {
  if (segmentIndex < 0 || segmentIndex + 3 >= points.length) return [];
  const before = points[segmentIndex];
  const sideStepStart = points[segmentIndex + 1];
  const sideStepEnd = points[segmentIndex + 2];
  const continuationEnd = points[segmentIndex + 3];
  if (!before || !sideStepStart || !sideStepEnd || !continuationEnd) return [];

  const incomingAxis = axisOf(before, sideStepStart);
  const sideStepAxis = axisOf(sideStepStart, sideStepEnd);
  const outgoingAxis = axisOf(sideStepEnd, continuationEnd);
  if (!incomingAxis || !sideStepAxis || !outgoingAxis) return [];
  if (incomingAxis !== outgoingAxis || sideStepAxis === incomingAxis) return [];
  if (segmentLength(sideStepStart, sideStepEnd) >= TINY_INTERIOR_SEGMENT) return [];

  const incomingDirection = incomingAxis === 'h'
    ? Math.sign(sideStepStart.x - before.x)
    : Math.sign(sideStepStart.y - before.y);
  const outgoingDirection = outgoingAxis === 'h'
    ? Math.sign(continuationEnd.x - sideStepEnd.x)
    : Math.sign(continuationEnd.y - sideStepEnd.y);
  if (incomingDirection === 0 || incomingDirection !== outgoingDirection) return [];

  const sideDirection = sideStepAxis === 'h'
    ? Math.sign(sideStepEnd.x - sideStepStart.x)
    : Math.sign(sideStepEnd.y - sideStepStart.y);
  if (sideDirection === 0) return [];

  return [24, 32, 48, 64, 80, 96, 128, 160].flatMap(clearance => (
    [sideDirection, -sideDirection].map((laneDirection) => {
      const lane = sideStepAxis === 'h'
        ? sideStepStart.x + laneDirection * clearance
        : sideStepStart.y + laneDirection * clearance;
      const bypass = incomingAxis === 'h'
        ? [
          { x: before.x, y: lane },
          { x: continuationEnd.x, y: lane },
        ]
        : [
          { x: lane, y: before.y },
          { x: lane, y: continuationEnd.y },
        ];
      const candidate = compactPath([
        ...points.slice(0, segmentIndex + 1),
        ...bypass,
        ...points.slice(segmentIndex + 4),
      ]);
      return hasSameEndpoints(points, candidate) && allSegmentsOrthogonal(candidate)
        ? candidate
        : null;
    })
  )).filter((candidate): candidate is Point[] => candidate !== null);
}

export function buildTinyEndpointBridgeCollapseCandidate(points: Point[], atStart: boolean): Point[] | null {
  if (points.length < 4) return null;
  const endpointIndex = atStart ? 0 : points.length - 1;
  const bendIndex = atStart ? 1 : points.length - 2;
  const bridgeIndex = atStart ? 2 : points.length - 3;
  const afterBridgeIndex = atStart ? 3 : points.length - 4;
  const endpoint = points[endpointIndex];
  const bend = points[bendIndex];
  const bridge = points[bridgeIndex];
  const afterBridge = points[afterBridgeIndex];
  if (!endpoint || !bend || !bridge || !afterBridge) return null;

  const stubAxis = axisOf(endpoint, bend);
  const bridgeAxis = axisOf(bend, bridge);
  const nextAxis = axisOf(bridge, afterBridge);
  if (!stubAxis || !bridgeAxis || !nextAxis || stubAxis === bridgeAxis || bridgeAxis === nextAxis) return null;
  if (segmentLength(endpoint, bend) > 4) return null;

  const collapsedBridge = bridgeAxis === 'h'
    ? { x: bridge.x, y: endpoint.y }
    : { x: endpoint.x, y: bridge.y };
  const candidate = atStart
    ? [endpoint, collapsedBridge, ...points.slice(3)]
    : [...points.slice(0, points.length - 3), collapsedBridge, endpoint];
  const normalized = compactPath(candidate);
  if (!hasSameEndpoints(points, normalized) || !allSegmentsOrthogonal(normalized)) return null;
  return normalized;
}
