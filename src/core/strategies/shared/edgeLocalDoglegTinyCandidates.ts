import type { Point, Rect } from './edgeLocalDoglegGeometry';
import {
  EPS,
  MIN_READABLE_SIDE_STEP,
  SIDE_MATCH_TOLERANCE,
  TINY_INTERIOR_SEGMENT,
  axisOf,
  compactPath,
  segmentLength,
  slideEndpointOnSide,
} from './edgeLocalDoglegGeometry';

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
