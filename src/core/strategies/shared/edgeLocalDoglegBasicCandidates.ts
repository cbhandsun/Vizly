import type { Point, Rect } from './edgeLocalDoglegGeometry';
import {
  EPS,
  MAX_BROAD_DOGLEG_DEPTH,
  MAX_HAIRPIN_COLLAPSE_BRIDGE,
  MAX_LOCAL_DOGLEG_DEPTH,
  MAX_OPPOSITE_RETURN_DEPTH,
  MAX_TINY_SIDE_STEP,
  MIN_LENGTH_SAVING,
  MIN_READABLE_SIDE_STEP,
  MIN_TERMINAL_STUB,
  SIDE_MATCH_TOLERANCE,
  TINY_INTERIOR_SEGMENT,
  axisOf,
  compactPath,
  hasSameEndpoints,
  pathLength,
  segmentLength,
  slideEndpointOnSide,
} from './edgeLocalDoglegGeometry';


export function buildStepCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  if (!a || !b || !c || !d) return null;

  if (axisOf(a, b) === 'v' && axisOf(b, c) === 'h' && axisOf(c, d) === 'v') {
    const sameDirection = Math.sign(b.y - a.y) === Math.sign(d.y - c.y);
    const depth = Math.abs(b.x - c.x);
    if (sameDirection && depth > EPS && depth <= MAX_LOCAL_DOGLEG_DEPTH) {
      return [
        ...points.slice(0, index + 1),
        { x: a.x, y: d.y },
        ...points.slice(index + 4),
      ];
    }
  }

  if (axisOf(a, b) === 'h' && axisOf(b, c) === 'v' && axisOf(c, d) === 'h') {
    const sameDirection = Math.sign(b.x - a.x) === Math.sign(d.x - c.x);
    const depth = Math.abs(b.y - c.y);
    if (sameDirection && depth > EPS && depth <= MAX_LOCAL_DOGLEG_DEPTH) {
      return [
        ...points.slice(0, index + 1),
        { x: d.x, y: a.y },
        ...points.slice(index + 4),
      ];
    }
  }

  return null;
}

export function buildReturnNotchCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  if (!a || !b || !c || !d || !e) return null;

  if (
    axisOf(a, b) === 'h'
    && axisOf(b, c) === 'v'
    && axisOf(c, d) === 'h'
    && axisOf(d, e) === 'v'
    && Math.abs(a.y - e.y) <= EPS
  ) {
    const returnsToMainAxis = Math.sign(c.y - b.y) === -Math.sign(e.y - d.y);
    const depth = Math.max(Math.abs(c.y - b.y), Math.abs(e.y - d.y));
    const detourLength = Math.abs(b.x - a.x)
      + Math.abs(c.y - b.y)
      + Math.abs(d.x - c.x)
      + Math.abs(e.y - d.y);
    const directLength = Math.abs(e.x - a.x);
    if (returnsToMainAxis && depth > EPS && depth <= MAX_LOCAL_DOGLEG_DEPTH && detourLength - directLength >= MIN_LENGTH_SAVING) {
      return [
        ...points.slice(0, index + 1),
        { x: e.x, y: a.y },
        ...points.slice(index + 5),
      ];
    }
  }

  if (
    axisOf(a, b) === 'v'
    && axisOf(b, c) === 'h'
    && axisOf(c, d) === 'v'
    && axisOf(d, e) === 'h'
    && Math.abs(a.x - e.x) <= EPS
  ) {
    const returnsToMainAxis = Math.sign(c.x - b.x) === -Math.sign(e.x - d.x);
    const depth = Math.max(Math.abs(c.x - b.x), Math.abs(e.x - d.x));
    const detourLength = Math.abs(b.y - a.y)
      + Math.abs(c.x - b.x)
      + Math.abs(d.y - c.y)
      + Math.abs(e.x - d.x);
    const directLength = Math.abs(e.y - a.y);
    if (returnsToMainAxis && depth > EPS && depth <= MAX_LOCAL_DOGLEG_DEPTH && detourLength - directLength >= MIN_LENGTH_SAVING) {
      return [
        ...points.slice(0, index + 1),
        { x: a.x, y: e.y },
        ...points.slice(index + 5),
      ];
    }
  }

  return null;
}

export function buildBroadReturnCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  if (!a || !b || !c || !d || !e) return null;

  if (
    axisOf(a, b) === 'v'
    && axisOf(b, c) === 'h'
    && axisOf(c, d) === 'v'
    && axisOf(d, e) === 'h'
  ) {
    const sameDirection = Math.sign(b.y - a.y) === Math.sign(d.y - c.y);
    const returnsTowardMainAxis = Math.sign(c.x - b.x) === -Math.sign(e.x - d.x);
    const depth = Math.abs(c.x - b.x);
    const detourLength = Math.abs(b.y - a.y)
      + Math.abs(c.x - b.x)
      + Math.abs(d.y - c.y)
      + Math.abs(e.x - d.x);
    const directLength = Math.abs(e.y - a.y) + Math.abs(e.x - a.x);
    if (
      sameDirection
      && returnsTowardMainAxis
      && depth > MAX_LOCAL_DOGLEG_DEPTH
      && depth <= MAX_BROAD_DOGLEG_DEPTH
      && detourLength - directLength >= MIN_LENGTH_SAVING
    ) {
      return [
        ...points.slice(0, index + 1),
        { x: a.x, y: e.y },
        e,
        ...points.slice(index + 5),
      ];
    }
  }

  if (
    axisOf(a, b) === 'h'
    && axisOf(b, c) === 'v'
    && axisOf(c, d) === 'h'
    && axisOf(d, e) === 'v'
  ) {
    const sameDirection = Math.sign(b.x - a.x) === Math.sign(d.x - c.x);
    const returnsTowardMainAxis = Math.sign(c.y - b.y) === -Math.sign(e.y - d.y);
    const depth = Math.abs(c.y - b.y);
    const detourLength = Math.abs(b.x - a.x)
      + Math.abs(c.y - b.y)
      + Math.abs(d.x - c.x)
      + Math.abs(e.y - d.y);
    const directLength = Math.abs(e.x - a.x) + Math.abs(e.y - a.y);
    if (
      sameDirection
      && returnsTowardMainAxis
      && depth > MAX_LOCAL_DOGLEG_DEPTH
      && depth <= MAX_BROAD_DOGLEG_DEPTH
      && detourLength - directLength >= MIN_LENGTH_SAVING
    ) {
      return [
        ...points.slice(0, index + 1),
        { x: e.x, y: a.y },
        e,
        ...points.slice(index + 5),
      ];
    }
  }

  return null;
}

export function buildOppositeReturnOffsetCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  if (!a || !b || !c || !d || !e) return null;

  if (
    axisOf(a, b) === 'v'
    && axisOf(b, c) === 'h'
    && axisOf(c, d) === 'v'
    && axisOf(d, e) === 'h'
  ) {
    const turnsBack = Math.sign(b.y - a.y) === -Math.sign(d.y - c.y);
    const bridgeDepth = Math.abs(c.x - b.x);
    const detourLength = Math.abs(b.y - a.y)
      + Math.abs(c.x - b.x)
      + Math.abs(d.y - c.y)
      + Math.abs(e.x - d.x);
    const directLength = Math.abs(e.y - a.y) + Math.abs(e.x - a.x);
    if (
      turnsBack
      && bridgeDepth > EPS
      && bridgeDepth <= MAX_OPPOSITE_RETURN_DEPTH
      && detourLength - directLength >= MIN_LENGTH_SAVING
    ) {
      return [
        ...points.slice(0, index + 1),
        { x: a.x, y: e.y },
        e,
        ...points.slice(index + 5),
      ];
    }
  }

  if (
    axisOf(a, b) === 'h'
    && axisOf(b, c) === 'v'
    && axisOf(c, d) === 'h'
    && axisOf(d, e) === 'v'
  ) {
    const turnsBack = Math.sign(b.x - a.x) === -Math.sign(d.x - c.x);
    const bridgeDepth = Math.abs(c.y - b.y);
    const detourLength = Math.abs(b.x - a.x)
      + Math.abs(c.y - b.y)
      + Math.abs(d.x - c.x)
      + Math.abs(e.y - d.y);
    const directLength = Math.abs(e.x - a.x) + Math.abs(e.y - a.y);
    if (
      turnsBack
      && bridgeDepth > EPS
      && bridgeDepth <= MAX_OPPOSITE_RETURN_DEPTH
      && detourLength - directLength >= MIN_LENGTH_SAVING
    ) {
      return [
        ...points.slice(0, index + 1),
        { x: e.x, y: a.y },
        e,
        ...points.slice(index + 5),
      ];
    }
  }

  return null;
}

export function buildFiveSegmentHairpinCollapseCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  const f = points[index + 5];
  if (!a || !b || !c || !d || !e || !f) return null;

  const firstAxis = axisOf(a, b);
  const secondAxis = axisOf(b, c);
  const thirdAxis = axisOf(c, d);
  const fourthAxis = axisOf(d, e);
  const fifthAxis = axisOf(e, f);
  if (!firstAxis || !secondAxis || !thirdAxis || !fourthAxis || !fifthAxis) return null;
  if (firstAxis !== thirdAxis || firstAxis !== fifthAxis || secondAxis !== fourthAxis) return null;
  if (firstAxis === secondAxis) return null;

  const firstDirection = firstAxis === 'v' ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
  const middleDirection = thirdAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
  const lastDirection = fifthAxis === 'v' ? Math.sign(f.y - e.y) : Math.sign(f.x - e.x);
  if (firstDirection === 0 || middleDirection === 0 || lastDirection === 0) return null;
  if (firstDirection !== lastDirection || middleDirection !== -firstDirection) return null;
  if (
    (index === 0 && segmentLength(a, b) < MIN_TERMINAL_STUB)
    || (index + 5 === points.length - 1 && segmentLength(e, f) < MIN_TERMINAL_STUB)
  ) {
    return null;
  }

  const returnBridgeLength = segmentLength(d, e);
  const returnDepth = segmentLength(c, d);
  const detourLength = segmentLength(b, c) + segmentLength(c, d) + segmentLength(d, e);
  const candidate = firstAxis === 'v'
    ? [
      ...points.slice(0, index + 2),
      { x: e.x, y: b.y },
      ...points.slice(index + 5),
    ]
    : [
      ...points.slice(0, index + 2),
      { x: b.x, y: e.y },
      ...points.slice(index + 5),
    ];
  const directLength = pathLength(candidate.slice(index + 1, index + 4));
  if (
    returnBridgeLength > MAX_BROAD_DOGLEG_DEPTH
    || returnDepth > MAX_BROAD_DOGLEG_DEPTH
    || detourLength - directLength < MIN_LENGTH_SAVING
  ) {
    return null;
  }

  return candidate;
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

  const firstDirection = firstAxis === 'v' ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
  const lastDirection = firstAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
  const bridgeLength = segmentLength(b, c);
  if (firstDirection === 0 || firstDirection !== -lastDirection) return [];
  if (bridgeLength > MAX_HAIRPIN_COLLAPSE_BRIDGE) return [];
  if (
    (firstAxis === 'v' && Math.abs(a.y - d.y) <= EPS)
    || (firstAxis === 'h' && Math.abs(a.x - d.x) <= EPS)
  ) {
    return [];
  }
  if (
    (index === 0 && segmentLength(a, b) < MIN_TERMINAL_STUB)
    || (index + 3 === points.length - 1 && segmentLength(c, d) < MIN_TERMINAL_STUB)
  ) {
    return [];
  }

  const directCandidates = firstAxis === 'v'
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
  return directCandidates
    .map(candidate => compactPath(candidate))
    .filter(candidate => (
      candidate.length >= 2
      && hasSameEndpoints(points, candidate)
      && pathLength(points) - pathLength(candidate) >= Math.min(MIN_LENGTH_SAVING, originalLength)
    ));
}

export function buildNearReturnContinuationCollapseCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  const f = points[index + 5];
  if (!a || !b || !c || !d || !e || !f) return null;

  const firstAxis = axisOf(a, b);
  const secondAxis = axisOf(b, c);
  const thirdAxis = axisOf(c, d);
  const fourthAxis = axisOf(d, e);
  const fifthAxis = axisOf(e, f);
  if (!firstAxis || !secondAxis || !thirdAxis || !fourthAxis || !fifthAxis) return null;
  if (firstAxis !== thirdAxis || firstAxis !== fifthAxis || secondAxis !== fourthAxis) return null;
  if (firstAxis === secondAxis) return null;

  const firstDirection = firstAxis === 'v' ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
  const thirdDirection = thirdAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
  if (firstDirection === 0 || firstDirection !== -thirdDirection) return null;
  if (segmentLength(b, c) > MAX_HAIRPIN_COLLAPSE_BRIDGE || segmentLength(d, e) > MAX_BROAD_DOGLEG_DEPTH) {
    return null;
  }
  if (
    (index === 0 && segmentLength(a, b) < MIN_TERMINAL_STUB * 2)
    || (index + 5 === points.length - 1 && segmentLength(e, f) < MIN_TERMINAL_STUB * 2)
  ) {
    return null;
  }

  const nearReturnOffset = firstAxis === 'h' ? Math.abs(a.x - e.x) : Math.abs(a.y - e.y);
  if (nearReturnOffset > TINY_INTERIOR_SEGMENT) return null;

  const candidate = firstAxis === 'h'
    ? [
      ...points.slice(0, index + 1),
      { x: a.x, y: e.y },
      { x: f.x, y: e.y },
      ...points.slice(index + 6),
    ]
    : [
      ...points.slice(0, index + 1),
      { x: e.x, y: a.y },
      { x: e.x, y: f.y },
      ...points.slice(index + 6),
    ];
  const normalized = compactPath(candidate);
  if (!hasSameEndpoints(points, normalized)) return null;
  if (pathLength(points) - pathLength(normalized) < MIN_LENGTH_SAVING) return null;
  return normalized;
}

export function buildReadableSideStepCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  if (!a || !b || !c || !d || !e) return null;

  if (
    axisOf(a, b) === 'v'
    && axisOf(b, c) === 'h'
    && axisOf(c, d) === 'v'
    && axisOf(d, e) === 'h'
  ) {
    const entryOffset = c.x - b.x;
    const exitOffset = e.x - d.x;
    const sameFlowDirection = Math.sign(b.y - a.y) === Math.sign(d.y - c.y);
    const returnsToMainLane = Math.sign(entryOffset) === -Math.sign(exitOffset);
    if (
      sameFlowDirection
      && returnsToMainLane
      && Math.abs(entryOffset) > EPS
      && Math.abs(entryOffset) < MIN_READABLE_SIDE_STEP
      && Math.abs(entryOffset) <= MAX_TINY_SIDE_STEP
      && Math.abs(exitOffset) <= MAX_TINY_SIDE_STEP
    ) {
      const laneX = b.x + Math.sign(entryOffset) * MIN_READABLE_SIDE_STEP;
      const next = points.map(point => ({ ...point }));
      next[index + 2] = { x: laneX, y: c.y };
      next[index + 3] = { x: laneX, y: d.y };
      return next;
    }
  }

  if (
    axisOf(a, b) === 'h'
    && axisOf(b, c) === 'v'
    && axisOf(c, d) === 'h'
    && axisOf(d, e) === 'v'
  ) {
    const entryOffset = c.y - b.y;
    const exitOffset = e.y - d.y;
    const sameFlowDirection = Math.sign(b.x - a.x) === Math.sign(d.x - c.x);
    const returnsToMainLane = Math.sign(entryOffset) === -Math.sign(exitOffset);
    if (
      sameFlowDirection
      && returnsToMainLane
      && Math.abs(entryOffset) > EPS
      && Math.abs(entryOffset) < MIN_READABLE_SIDE_STEP
      && Math.abs(entryOffset) <= MAX_TINY_SIDE_STEP
      && Math.abs(exitOffset) <= MAX_TINY_SIDE_STEP
    ) {
      const laneY = b.y + Math.sign(entryOffset) * MIN_READABLE_SIDE_STEP;
      const next = points.map(point => ({ ...point }));
      next[index + 2] = { x: c.x, y: laneY };
      next[index + 3] = { x: d.x, y: laneY };
      return next;
    }
  }

  return null;
}

export function buildMonotonicStaircaseCollapseCandidate(points: Point[], index: number): Point[] | null {
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

  const mainDirectionA = firstAxis === 'v' ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
  const mainDirectionB = thirdAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
  const crossDirectionA = secondAxis === 'v' ? Math.sign(c.y - b.y) : Math.sign(c.x - b.x);
  const crossDirectionB = fourthAxis === 'v' ? Math.sign(e.y - d.y) : Math.sign(e.x - d.x);
  if (
    mainDirectionA === 0
    || crossDirectionA === 0
    || mainDirectionA !== mainDirectionB
    || crossDirectionA !== crossDirectionB
  ) {
    return null;
  }

  const middleMainLength = segmentLength(c, d);
  const firstCrossLength = segmentLength(b, c);
  const secondCrossLength = segmentLength(d, e);
  const tinyMainStep = middleMainLength > EPS && middleMainLength <= TINY_INTERIOR_SEGMENT;
  const tinyCrossStair = firstCrossLength <= MAX_TINY_SIDE_STEP
    && secondCrossLength <= MAX_TINY_SIDE_STEP;
  if (!tinyMainStep && !tinyCrossStair) return null;

  const collapsed = firstAxis === 'v'
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
    ];

  return collapsed;
}

export function buildTinyEndpointOffsetCandidates(
  points: Point[],
  index: number,
  sourceRect: Rect | null,
  targetRect: Rect | null,
): Point[][] {
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

  const firstDirection = firstAxis === 'v' ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
  const lastDirection = firstAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
  if (firstDirection === 0 || firstDirection !== lastDirection) return [];
  if (segmentLength(b, c) >= TINY_INTERIOR_SEGMENT) return [];

  const candidates: Point[][] = [];
  if (index === 0) {
    const movedStart = slideEndpointOnSide(
      points[0],
      sourceRect,
      firstAxis,
      firstAxis === 'v' ? c.x : c.y,
    );
    if (movedStart) {
      candidates.push(compactPath([
        movedStart,
        d,
        ...points.slice(index + 4),
      ]));
    } else {
      const fallbackStart = firstAxis === 'v'
        ? { x: c.x, y: a.y }
        : { x: a.x, y: c.y };
      if (segmentLength(a, fallbackStart) <= SIDE_MATCH_TOLERANCE) {
        candidates.push(compactPath([
          fallbackStart,
          d,
          ...points.slice(index + 4),
        ]));
      }
    }
  }

  if (index + 3 === points.length - 1) {
    const movedEnd = slideEndpointOnSide(
      points[points.length - 1],
      targetRect,
      firstAxis,
      firstAxis === 'v' ? a.x : a.y,
    );
    if (movedEnd) {
      candidates.push(compactPath([
        ...points.slice(0, index + 1),
        movedEnd,
      ]));
    } else {
      const fallbackEnd = firstAxis === 'v'
        ? { x: a.x, y: d.y }
        : { x: d.x, y: a.y };
      if (segmentLength(d, fallbackEnd) <= SIDE_MATCH_TOLERANCE) {
        candidates.push(compactPath([
          ...points.slice(0, index + 1),
          fallbackEnd,
        ]));
      }
    }
  }

  const bridgeDirection = firstAxis === 'v'
    ? Math.sign(c.x - b.x)
    : Math.sign(c.y - b.y);
  if (bridgeDirection !== 0) {
    if (firstAxis === 'v') {
      const laneX = d.x + bridgeDirection * MIN_READABLE_SIDE_STEP;
      candidates.push(compactPath([
        ...points.slice(0, index + 1),
        { x: a.x, y: b.y },
        { x: laneX, y: b.y },
        { x: laneX, y: d.y },
        d,
        ...points.slice(index + 4),
      ]));
    } else {
      const laneY = d.y + bridgeDirection * MIN_READABLE_SIDE_STEP;
      candidates.push(compactPath([
        ...points.slice(0, index + 1),
        { x: b.x, y: a.y },
        { x: b.x, y: laneY },
        { x: d.x, y: laneY },
        d,
        ...points.slice(index + 4),
      ]));
    }
  }

  return candidates;
}

export function buildTinyTerminalBridgeCollapseCandidates(
  points: Point[],
  index: number,
  sourceRect: Rect | null,
  targetRect: Rect | null,
): Array<{ path: Point[]; preserveEndpoints: boolean }> {
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
  if (segmentLength(b, c) <= EPS || segmentLength(b, c) >= TINY_INTERIOR_SEGMENT) return [];

  const firstDirection = firstAxis === 'v' ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
  const lastDirection = firstAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
  if (firstDirection === 0 || firstDirection !== lastDirection) return [];

  const candidates: Array<{ path: Point[]; preserveEndpoints: boolean }> = [];
  if (index === 0) {
    const movedStart = slideEndpointOnSide(
      points[0],
      sourceRect,
      firstAxis,
      firstAxis === 'v' ? c.x : c.y,
    );
    if (movedStart) {
      candidates.push({
        preserveEndpoints: false,
        path: compactPath([movedStart, d, ...points.slice(index + 4)]),
      });
    }
  }

  if (index + 3 === points.length - 1) {
    const movedEnd = slideEndpointOnSide(
      d,
      targetRect,
      firstAxis,
      firstAxis === 'v' ? a.x : a.y,
    );
    if (movedEnd) {
      candidates.push({
        preserveEndpoints: false,
        path: compactPath([...points.slice(0, index + 1), movedEnd]),
      });
    }

    candidates.push({
      preserveEndpoints: true,
      path: compactPath([
        ...points.slice(0, index + 1),
        firstAxis === 'v' ? { x: a.x, y: d.y } : { x: d.x, y: a.y },
        d,
      ]),
    });
  }

  return candidates;
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
    const firstMainDirection = firstAxis === 'v' ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
    const secondMainDirection = thirdAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
    if (firstMainDirection !== 0 && firstMainDirection === secondMainDirection) {
      return firstAxis === 'v'
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
        ];
    }
  }
  if (segmentLength(c, d) >= TINY_INTERIOR_SEGMENT) return null;

  const firstMainDirection = secondAxis === 'v' ? Math.sign(c.y - b.y) : Math.sign(c.x - b.x);
  const secondMainDirection = fourthAxis === 'v' ? Math.sign(e.y - d.y) : Math.sign(e.x - d.x);
  if (firstMainDirection === 0 || firstMainDirection !== secondMainDirection) return null;

  return firstAxis === 'h'
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
    ];
}

export function buildTinyCornerBypassCandidate(points: Point[], index: number): Point[] | null {
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
  const thirdDirection = thirdAxis === 'v' ? Math.sign(d.y - c.y) : Math.sign(d.x - c.x);
  if (firstDirection === 0 || firstDirection !== thirdDirection) return null;

  return firstAxis === 'v'
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
    ];
}
