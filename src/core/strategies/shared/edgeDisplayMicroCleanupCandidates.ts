import {
  EPS,
  MICRO_ENDPOINT_SLIDE,
  MIN_ENDPOINT_STUB,
  TINY_INTERIOR_SEGMENT,
  MICRO_LANE_SHIFTS,
  MICRO_BRIDGE_LANE_SHIFTS,
  SIDE_APPROACH_OFFSETS,
  MAX_HAIRPIN_COLLAPSE_BRIDGE,
  axisOf,
  segmentLength,
  pathLength,
  segmentDirection,
  pathMicroMetrics,
  compactPath,
  hasSameEndpoints,
  hasCompatibleDisplayEndpoints,
  allSegmentsOrthogonal,
  hasSameTerminalAxes,
} from './edgeDisplayMicroCleanupGeometry';

import type {
  Point,
} from './edgeDisplayMicroCleanupGeometry';

export function buildTerminalStubSideApproachCandidates(points: Point[], atStart: boolean): Point[][] {
  if (points.length < 4) return [];
  if (atStart) {
    const endpoint = points[0];
    const bend = points[1];
    const bridge = points[2];
    if (!endpoint || !bend || !bridge) return [];

    const stubAxis = axisOf(endpoint, bend);
    const bridgeAxis = axisOf(bend, bridge);
    if (!stubAxis || !bridgeAxis || stubAxis === bridgeAxis) return [];

    const currentLength = segmentLength(endpoint, bend);
    if (currentLength <= EPS || currentLength >= MIN_ENDPOINT_STUB) return [];

    const candidates: Point[][] = [];
    const suffix = points.slice(3);
    if (stubAxis === 'h') {
      const laneDirection = Math.sign(bend.x - endpoint.x);
      if (laneDirection === 0) return [];
      for (const laneShift of [MIN_ENDPOINT_STUB, 48, 64, 80, 96, 128, 160]) {
        const laneX = endpoint.x + laneDirection * laneShift;
        for (const sideOffset of SIDE_APPROACH_OFFSETS) {
          for (const sideY of [endpoint.y - sideOffset, endpoint.y + sideOffset]) {
            candidates.push(compactPath([
              endpoint,
              { x: endpoint.x, y: sideY },
              { x: laneX, y: sideY },
              { x: laneX, y: bridge.y },
              ...suffix,
            ]));
          }
        }
      }
    } else {
      const laneDirection = Math.sign(bend.y - endpoint.y);
      if (laneDirection === 0) return [];
      for (const laneShift of [MIN_ENDPOINT_STUB, 48, 64, 80, 96, 128, 160]) {
        const laneY = endpoint.y + laneDirection * laneShift;
        for (const sideOffset of SIDE_APPROACH_OFFSETS) {
          for (const sideX of [endpoint.x - sideOffset, endpoint.x + sideOffset]) {
            candidates.push(compactPath([
              endpoint,
              { x: sideX, y: endpoint.y },
              { x: sideX, y: laneY },
              { x: bridge.x, y: laneY },
              ...suffix,
            ]));
          }
        }
      }
    }

    return candidates.filter(candidate => (
      candidate.length >= 2
      && hasSameEndpoints(points, candidate)
      && allSegmentsOrthogonal(candidate)
      && segmentLength(candidate[0], candidate[1]) >= MIN_ENDPOINT_STUB
    ));
  }

  const endpoint = points[points.length - 1];
  const bend = points[points.length - 2];
  const bridge = points[points.length - 3];
  if (!endpoint || !bend || !bridge) return [];

  const stubAxis = axisOf(endpoint, bend);
  const bridgeAxis = axisOf(bend, bridge);
  if (!stubAxis || !bridgeAxis || stubAxis === bridgeAxis) return [];

  const currentLength = segmentLength(endpoint, bend);
  if (currentLength <= EPS || currentLength >= MIN_ENDPOINT_STUB) return [];

  const candidates: Point[][] = [];
  const prefix = points.slice(0, points.length - 3);
  if (stubAxis === 'v') {
    const laneDirection = Math.sign(bend.y - endpoint.y);
    if (laneDirection === 0) return [];
    for (const laneShift of MICRO_LANE_SHIFTS) {
      const laneY = bend.y + laneDirection * laneShift;
      for (const sideOffset of SIDE_APPROACH_OFFSETS) {
        for (const sideX of [endpoint.x - sideOffset, endpoint.x + sideOffset]) {
          candidates.push(compactPath([
            ...prefix,
            { x: bridge.x, y: laneY },
            { x: sideX, y: laneY },
            { x: sideX, y: endpoint.y },
            endpoint,
          ]));
        }
      }
    }
  } else {
    const laneDirection = Math.sign(bend.x - endpoint.x);
    if (laneDirection === 0) return [];
    for (const laneShift of MICRO_LANE_SHIFTS) {
      const laneX = bend.x + laneDirection * laneShift;
      for (const sideOffset of SIDE_APPROACH_OFFSETS) {
        for (const sideY of [endpoint.y - sideOffset, endpoint.y + sideOffset]) {
          candidates.push(compactPath([
            ...prefix,
            { x: laneX, y: bridge.y },
            { x: laneX, y: sideY },
            { x: endpoint.x, y: sideY },
            endpoint,
          ]));
        }
      }
    }
  }

  return candidates.filter(candidate => (
    candidate.length >= 2
    && hasSameEndpoints(points, candidate)
    && allSegmentsOrthogonal(candidate)
  ));
}

export function buildConsecutiveTinyCornerCollapse(points: Point[], index: number): Point[] | null {
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
  if (segmentLength(b, c) >= TINY_INTERIOR_SEGMENT || segmentLength(c, d) >= TINY_INTERIOR_SEGMENT) return null;

  const firstDirection = firstAxis === 'v' ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
  const thirdDirection = thirdAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
  if (firstDirection === 0 || firstDirection !== thirdDirection) return null;

  return compactPath(firstAxis === 'v'
    ? [
      ...points.slice(0, index + 1),
      { x: b.x, y: e.y },
      e,
      ...points.slice(index + 5),
    ]
    : [
      ...points.slice(0, index + 1),
      { x: e.x, y: b.y },
      e,
      ...points.slice(index + 5),
    ]);
}

export function buildConsecutiveTinyCornerLaneCandidates(points: Point[], index: number): Point[][] {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  const previous = points[index - 1];
  if (!a || !b || !c || !d || !e || !previous) return [];

  const firstAxis = axisOf(a, b);
  const secondAxis = axisOf(b, c);
  const thirdAxis = axisOf(c, d);
  const fourthAxis = axisOf(d, e);
  const entryAxis = axisOf(previous, a);
  if (!firstAxis || !secondAxis || !thirdAxis || !fourthAxis || !entryAxis) return [];
  if (firstAxis !== thirdAxis || secondAxis !== fourthAxis || firstAxis === secondAxis) return [];
  if (entryAxis !== secondAxis) return [];
  if (segmentLength(b, c) >= TINY_INTERIOR_SEGMENT || segmentLength(c, d) >= TINY_INTERIOR_SEGMENT) return [];

  const firstDirection = firstAxis === 'v' ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
  const thirdDirection = thirdAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
  if (firstDirection === 0 || firstDirection !== thirdDirection) return [];

  const candidates: Point[][] = [];
  if (firstAxis === 'h') {
    for (const shift of MICRO_LANE_SHIFTS) {
      for (const laneY of [b.y - shift, b.y + shift]) {
        candidates.push(compactPath([
          ...points.slice(0, index),
          { x: a.x, y: laneY },
          { x: e.x, y: laneY },
          e,
          ...points.slice(index + 5),
        ]));
      }
    }
  } else {
    for (const shift of MICRO_LANE_SHIFTS) {
      for (const laneX of [b.x - shift, b.x + shift]) {
        candidates.push(compactPath([
          ...points.slice(0, index),
          { x: laneX, y: a.y },
          { x: laneX, y: e.y },
          e,
          ...points.slice(index + 5),
        ]));
      }
    }
  }

  return candidates.filter(candidate => (
    candidate.length >= 2
    && hasSameEndpoints(points, candidate)
    && allSegmentsOrthogonal(candidate)
  ));
}

export function buildTrailingTinyStairCollapseCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  if (!a || !b || !c || !d || !e) return null;

  const firstAxis = axisOf(a, b);
  const bridgeAxis = axisOf(b, c);
  const tinyAxis = axisOf(c, d);
  const exitAxis = axisOf(d, e);
  if (!firstAxis || !bridgeAxis || !tinyAxis || !exitAxis) return null;
  if (firstAxis !== tinyAxis || bridgeAxis !== exitAxis || firstAxis === bridgeAxis) return null;
  if (segmentLength(c, d) >= TINY_INTERIOR_SEGMENT || segmentLength(d, e) >= TINY_INTERIOR_SEGMENT) return null;

  const firstDirection = segmentDirection(a, b, firstAxis);
  const tinyDirection = segmentDirection(c, d, tinyAxis);
  const bridgeDirection = segmentDirection(b, c, bridgeAxis);
  const exitDirection = segmentDirection(d, e, exitAxis);
  if (!firstDirection || !bridgeDirection || firstDirection !== tinyDirection || bridgeDirection !== exitDirection) {
    return null;
  }

  const candidate = compactPath(firstAxis === 'v'
    ? [
      ...points.slice(0, index + 1),
      { x: a.x, y: e.y },
      e,
      ...points.slice(index + 5),
    ]
    : [
      ...points.slice(0, index + 1),
      { x: e.x, y: a.y },
      e,
      ...points.slice(index + 5),
    ]);
  if (!hasSameEndpoints(points, candidate) || !allSegmentsOrthogonal(candidate)) return null;
  if (pathLength(candidate) > pathLength(points) + EPS) return null;
  return candidate;
}

export function buildTinyInteriorBridgeCollapseCandidate(points: Point[], index: number): Point[] | null {
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

  if (segmentLength(b, c) < TINY_INTERIOR_SEGMENT) {
    const firstDirection = segmentDirection(a, b, firstAxis);
    const secondDirection = segmentDirection(c, d, thirdAxis);
    if (firstDirection !== 0 && firstDirection === secondDirection) {
      return compactPath(firstAxis === 'v'
        ? [
          ...points.slice(0, index + 1),
          { x: a.x, y: d.y },
          d,
          ...points.slice(index + 4),
        ]
        : [
          ...points.slice(0, index + 1),
          { x: d.x, y: a.y },
          d,
          ...points.slice(index + 4),
        ]);
    }
  }

  if (segmentLength(c, d) >= TINY_INTERIOR_SEGMENT) return null;
  const firstDirection = segmentDirection(b, c, secondAxis);
  const secondDirection = segmentDirection(d, e, fourthAxis);
  if (firstDirection === 0 || firstDirection !== secondDirection) return null;

  return compactPath(firstAxis === 'h'
    ? [
      ...points.slice(0, index + 1),
      { x: e.x, y: a.y },
      e,
      ...points.slice(index + 5),
    ]
    : [
      ...points.slice(0, index + 1),
      { x: a.x, y: e.y },
      e,
      ...points.slice(index + 5),
    ]);
}

export function buildTinyInteriorBridgeLaneCandidates(points: Point[], index: number): Point[][] {
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
  if (segmentLength(c, d) >= TINY_INTERIOR_SEGMENT) return [];

  const bridgeDirection = segmentDirection(b, c, secondAxis);
  const exitDirection = segmentDirection(d, e, fourthAxis);
  if (bridgeDirection === 0 || bridgeDirection !== exitDirection) return [];

  const originalLength = pathLength(points);
  const candidates: Point[][] = [];
  if (firstAxis === 'v') {
    for (const shift of MICRO_BRIDGE_LANE_SHIFTS) {
      for (const laneY of [b.y - shift, b.y + shift, d.y - shift, d.y + shift]) {
        candidates.push(compactPath([
          ...points.slice(0, index + 1),
          { x: a.x, y: laneY },
          { x: e.x, y: laneY },
          e,
          ...points.slice(index + 5),
        ]));
      }
    }
  } else {
    for (const shift of MICRO_BRIDGE_LANE_SHIFTS) {
      for (const laneX of [b.x - shift, b.x + shift, d.x - shift, d.x + shift]) {
        candidates.push(compactPath([
          ...points.slice(0, index + 1),
          { x: laneX, y: a.y },
          { x: laneX, y: e.y },
          e,
          ...points.slice(index + 5),
        ]));
      }
    }
  }

  return candidates.filter(candidate => (
    candidate.length >= 2
    && hasSameEndpoints(points, candidate)
    && hasSameTerminalAxes(points, candidate)
    && allSegmentsOrthogonal(candidate)
    && pathMicroMetrics(candidate).tinyInteriorDoglegs < pathMicroMetrics(points).tinyInteriorDoglegs
    && pathLength(candidate) <= originalLength + 96
  ));
}

export function buildTinyPreTerminalSideApproachCandidates(points: Point[], index: number): Point[][] {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  if (!a || !b || !c || !d || !e) return [];
  if (index + 4 !== points.length - 1) return [];

  const firstAxis = axisOf(a, b);
  const secondAxis = axisOf(b, c);
  const thirdAxis = axisOf(c, d);
  const fourthAxis = axisOf(d, e);
  if (!firstAxis || !secondAxis || !thirdAxis || !fourthAxis) return [];
  if (firstAxis !== thirdAxis || secondAxis !== fourthAxis || firstAxis === secondAxis) return [];
  if (segmentLength(c, d) >= TINY_INTERIOR_SEGMENT) return [];

  const bridgeDirection = segmentDirection(b, c, secondAxis);
  const exitDirection = segmentDirection(d, e, fourthAxis);
  if (bridgeDirection === 0 || bridgeDirection !== exitDirection) return [];

  const candidates: Point[][] = [];
  const terminalOffsets = [40, 48, 56, 64, 80, 96, 128, 160];
  if (firstAxis === 'v') {
    for (const offset of terminalOffsets) {
      for (const laneY of [e.y - offset, e.y + offset]) {
        candidates.push(compactPath([
          ...points.slice(0, index + 1),
          { x: a.x, y: laneY },
          { x: e.x, y: laneY },
          e,
        ]));
      }
    }
  } else {
    for (const offset of terminalOffsets) {
      for (const laneX of [e.x - offset, e.x + offset]) {
        candidates.push(compactPath([
          ...points.slice(0, index + 1),
          { x: laneX, y: a.y },
          { x: laneX, y: e.y },
          e,
        ]));
      }
    }
  }

  const originalLength = pathLength(points);
  return candidates.filter(candidate => (
    candidate.length >= 2
    && hasSameEndpoints(points, candidate)
    && allSegmentsOrthogonal(candidate)
    && pathMicroMetrics(candidate).tinyInteriorDoglegs < pathMicroMetrics(points).tinyInteriorDoglegs
    && segmentLength(candidate[candidate.length - 2], candidate[candidate.length - 1]) >= MIN_ENDPOINT_STUB
    && pathLength(candidate) <= originalLength + 256
  ));
}

export function buildHairpinBridgeCollapseCandidates(points: Point[], index: number): Point[][] {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  if (!a || !b || !c || !d) return [];

  const firstAxis = axisOf(a, b);
  const bridgeAxis = axisOf(b, c);
  const lastAxis = axisOf(c, d);
  if (!firstAxis || !bridgeAxis || !lastAxis) return [];
  if (firstAxis !== lastAxis || firstAxis === bridgeAxis) return [];

  const firstDirection = segmentDirection(a, b, firstAxis);
  const lastDirection = segmentDirection(c, d, lastAxis);
  const bridgeLength = segmentLength(b, c);
  if (firstDirection === 0 || firstDirection !== -lastDirection) return [];
  if (bridgeLength > MAX_HAIRPIN_COLLAPSE_BRIDGE) return [];
  if (
    (firstAxis === 'v' && Math.abs(a.y - d.y) <= EPS)
    || (firstAxis === 'h' && Math.abs(a.x - d.x) <= EPS)
  ) {
    return [];
  }

  const candidates = firstAxis === 'v'
    ? [
      [
        ...points.slice(0, index + 1),
        { x: a.x, y: d.y },
        d,
        ...points.slice(index + 4),
      ],
      [
        ...points.slice(0, index + 1),
        { x: d.x, y: a.y },
        d,
        ...points.slice(index + 4),
      ],
    ]
    : [
      [
        ...points.slice(0, index + 1),
        { x: d.x, y: a.y },
        d,
        ...points.slice(index + 4),
      ],
      [
        ...points.slice(0, index + 1),
        { x: a.x, y: d.y },
        d,
        ...points.slice(index + 4),
      ],
    ];

  const originalLength = segmentLength(a, b) + segmentLength(b, c) + segmentLength(c, d);
  return candidates
    .map(candidate => compactPath(candidate))
    .filter(candidate => (
      candidate.length >= 2
      && hasSameEndpoints(points, candidate)
      && allSegmentsOrthogonal(candidate)
      && pathLength(points) - pathLength(candidate) >= Math.min(8, originalLength)
    ));
}

export function buildTerminalHairpinEndpointSlideCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  if (!a || !b || !c || !d) return null;
  if (index + 3 !== points.length - 1 && index !== 0) return null;

  const firstAxis = axisOf(a, b);
  const bridgeAxis = axisOf(b, c);
  const lastAxis = axisOf(c, d);
  if (!firstAxis || !bridgeAxis || !lastAxis) return null;
  if (firstAxis !== lastAxis || firstAxis === bridgeAxis) return null;
  const firstDirection = segmentDirection(a, b, firstAxis);
  const lastDirection = segmentDirection(c, d, lastAxis);
  if (firstDirection === 0 || firstDirection !== -lastDirection) return null;
  if (segmentLength(b, c) > MAX_HAIRPIN_COLLAPSE_BRIDGE) return null;

  if (index + 3 === points.length - 1) {
    const slidEndpoint = firstAxis === 'v'
      ? { x: d.x, y: a.y }
      : { x: a.x, y: d.y };
    if (segmentLength(slidEndpoint, d) > MICRO_ENDPOINT_SLIDE) return null;
    const candidate = compactPath([
      ...points.slice(0, index + 1),
      slidEndpoint,
    ]);
    return allSegmentsOrthogonal(candidate) && hasCompatibleDisplayEndpoints(points, candidate) ? candidate : null;
  }

  const slidStart = firstAxis === 'v'
    ? { x: a.x, y: d.y }
    : { x: d.x, y: a.y };
  if (segmentLength(slidStart, a) > MICRO_ENDPOINT_SLIDE) return null;
  const candidate = compactPath([
    slidStart,
    ...points.slice(index + 3),
  ]);
  return allSegmentsOrthogonal(candidate) && hasCompatibleDisplayEndpoints(points, candidate) ? candidate : null;
}

export function buildStartHairpinSideLaneCandidate(points: Point[], index: number): Point[] | null {
  if (index !== 0) return null;
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  if (!a || !b || !c || !d || !e) return null;

  const firstAxis = axisOf(a, b);
  const bridgeAxis = axisOf(b, c);
  const lastAxis = axisOf(c, d);
  const continuationAxis = axisOf(d, e);
  if (!firstAxis || !bridgeAxis || !lastAxis || !continuationAxis) return null;
  if (firstAxis !== lastAxis || firstAxis === bridgeAxis || continuationAxis !== bridgeAxis) return null;
  const firstDirection = segmentDirection(a, b, firstAxis);
  const lastDirection = segmentDirection(c, d, lastAxis);
  const bridgeDirection = segmentDirection(b, c, bridgeAxis);
  if (firstDirection === 0 || bridgeDirection === 0 || firstDirection !== -lastDirection) return null;
  if (segmentLength(b, c) > MAX_HAIRPIN_COLLAPSE_BRIDGE) return null;

  if (firstAxis === 'h') {
    const sideDirection = Math.sign(d.x - a.x) || -firstDirection;
    const laneY = a.y + bridgeDirection * MIN_ENDPOINT_STUB;
    const sideX = d.x + sideDirection * MIN_ENDPOINT_STUB;
    const candidate = compactPath([
      a,
      { x: a.x, y: laneY },
      { x: sideX, y: laneY },
      { x: sideX, y: e.y },
      ...points.slice(index + 5),
    ]);
    return allSegmentsOrthogonal(candidate) && hasSameEndpoints(points, candidate) ? candidate : null;
  }

  const sideDirection = Math.sign(d.y - a.y) || -firstDirection;
  const laneX = a.x + bridgeDirection * MIN_ENDPOINT_STUB;
  const sideY = d.y + sideDirection * MIN_ENDPOINT_STUB;
  const candidate = compactPath([
    a,
    { x: laneX, y: a.y },
    { x: laneX, y: sideY },
    { x: e.x, y: sideY },
    ...points.slice(index + 5),
  ]);
  return allSegmentsOrthogonal(candidate) && hasSameEndpoints(points, candidate) ? candidate : null;
}

export function buildSmallReturnBridgeLaneCandidates(points: Point[], index: number): Point[][] {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  if (!a || !b || !c || !d) return [];

  const firstAxis = axisOf(a, b);
  const bridgeAxis = axisOf(b, c);
  const lastAxis = axisOf(c, d);
  if (!firstAxis || !bridgeAxis || !lastAxis) return [];
  if (firstAxis !== lastAxis || firstAxis === bridgeAxis) return [];
  const firstDirection = segmentDirection(a, b, firstAxis);
  const lastDirection = segmentDirection(c, d, lastAxis);
  if (firstDirection === 0 || firstDirection !== -lastDirection) return [];
  if (segmentLength(b, c) > 32) return [];

  const candidates: Point[][] = [];
  if (firstAxis === 'h') {
    const laneValues = [
      a.y - 64,
      a.y - 48,
      a.y - 40,
      a.y - 32,
      a.y + 32,
      a.y + 40,
      a.y + 48,
      a.y + 64,
      d.y - 64,
      d.y - 48,
      d.y - 40,
      d.y - 32,
      d.y + 32,
      d.y + 40,
      d.y + 48,
      d.y + 64,
    ];
    for (const laneY of laneValues) {
      if (Math.abs(laneY - a.y) < MIN_ENDPOINT_STUB || Math.abs(laneY - d.y) < MIN_ENDPOINT_STUB) continue;
      candidates.push(compactPath([
        ...points.slice(0, index + 1),
        { x: a.x, y: laneY },
        { x: d.x, y: laneY },
        d,
        ...points.slice(index + 4),
      ]));
    }
  } else {
    const laneValues = [
      a.x - 64,
      a.x - 48,
      a.x - 40,
      a.x - 32,
      a.x + 32,
      a.x + 40,
      a.x + 48,
      a.x + 64,
      d.x - 64,
      d.x - 48,
      d.x - 40,
      d.x - 32,
      d.x + 32,
      d.x + 40,
      d.x + 48,
      d.x + 64,
    ];
    for (const laneX of laneValues) {
      if (Math.abs(laneX - a.x) < MIN_ENDPOINT_STUB || Math.abs(laneX - d.x) < MIN_ENDPOINT_STUB) continue;
      candidates.push(compactPath([
        ...points.slice(0, index + 1),
        { x: laneX, y: a.y },
        { x: laneX, y: d.y },
        d,
        ...points.slice(index + 4),
      ]));
    }
  }

  return candidates.filter(candidate => (
    candidate.length >= 2
    && hasSameEndpoints(points, candidate)
    && allSegmentsOrthogonal(candidate)
  ));
}
