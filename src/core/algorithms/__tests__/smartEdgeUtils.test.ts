import { describe, expect, it } from 'vitest';
import { Position } from '../../types/flow';
import {
  alignSegmentsToObstacles,
  calculateOptimalPositions,
  createFilletedPath,
  createPathWithJumpsFromObstacles,
  ensureMinFirstSegment,
  ensureMinLastSegment,
  enforcePortSpacing,
  generateGreedyOrthogonalPath,
  getCenterFromHandle,
  getClosestDistanceToPath,
  getHandleFromCenter,
  getIntersection,
  getNodePosition,
  getPortOffsetPoint,
  getSVGPath,
  getSmartLabelPosition,
  makePathOrthogonal,
  offsetPathSegments,
  optimizeOrthogonalPath,
  removeShortDiagonals,
  removeTinyOrthogonalJogs,
  routeWithAStar,
  simplifyPath,
  smoothShortSegments,
} from '../smartEdgeUtils';

describe('smartEdgeUtils geometry primitives', () => {
  it('normalizes node positions with precedence and finite-value guards', () => {
    expect(getNodePosition(undefined)).toEqual({ x: 0, y: 0 });
    expect(getNodePosition({
      position: { x: 1, y: 2 },
      positionAbsolute: { x: 3, y: 4 },
      computed: { positionAbsolute: { x: 5, y: 6 } },
    })).toEqual({ x: 5, y: 6 });
    expect(getNodePosition({ position: { x: Number.NaN, y: Infinity } })).toEqual({ x: 0, y: 0 });
  });

  it('converts between center and handle coordinates for each side', () => {
    const center = { x: 100, y: 80 };
    const size = { w: 40, h: 20 };

    for (const pos of [Position.Top, Position.Bottom, Position.Left, Position.Right]) {
      const handle = getHandleFromCenter(center.x, center.y, pos, size.w, size.h);
      expect(getCenterFromHandle(handle.x, handle.y, pos, size.w, size.h)).toEqual(center);
    }
  });

  it('chooses optimal opposite ports by target angle and applies safe port offsets', () => {
    expect(calculateOptimalPositions({ x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({ sourcePos: Position.Right, targetPos: Position.Left });
    expect(calculateOptimalPositions({ x: 0, y: 0 }, { x: 0, y: 100 })).toEqual({ sourcePos: Position.Bottom, targetPos: Position.Top });
    expect(calculateOptimalPositions({ x: 0, y: 0 }, { x: -100, y: 0 })).toEqual({ sourcePos: Position.Left, targetPos: Position.Right });
    expect(calculateOptimalPositions({ x: 0, y: 0 }, { x: 0, y: -100 })).toEqual({ sourcePos: Position.Top, targetPos: Position.Bottom });

    expect(getPortOffsetPoint(10, 10, Position.Right, 5)).toEqual({ x: 50, y: 10 });
    expect(getPortOffsetPoint(10, 10, Position.Top, 60)).toEqual({ x: 10, y: -50 });
  });

  it('enforces minimum source and target stubs without losing orthogonality', () => {
    expect(ensureMinFirstSegment([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 50 },
    ], 30, Position.Right)).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 50 },
    ]);

    expect(ensureMinLastSegment([
      { x: 0, y: 0 },
      { x: 50, y: 5 },
      { x: 50, y: 0 },
    ], 30, Position.Left)).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 5 },
      { x: 20, y: 0 },
      { x: 50, y: 0 },
    ]);
  });

  it('formats SVG paths and simplifies redundant orthogonal points safely', () => {
    expect(getSVGPath([])).toBe('');
    expect(getSVGPath([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe('M 0 0 L 10 0');

    expect(simplifyPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 40 },
    ])).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 40 },
    ]);
  });

  it('detects orthogonal intersections and ignores endpoints/non-crossing segments', () => {
    expect(getIntersection({ x: 0, y: 10 }, { x: 20, y: 10 }, { x: 5, y: 0 }, { x: 5, y: 20 })).toEqual({ x: 5, y: 10 });
    expect(getIntersection({ x: 0, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 0 }, { x: 20, y: 20 })).toBeNull();
    expect(getIntersection({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 10 }, { x: 20, y: 10 })).toBeNull();
  });

  it('chooses readable label positions and computes distances to path segments', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 120 },
    ];

    expect(getSmartLabelPosition(path)).toEqual({ x: 110, y: 100 });
    expect(getClosestDistanceToPath({ x: 10, y: 5 }, path)).toBe(5);
    expect(getClosestDistanceToPath({ x: 3, y: 4 }, [{ x: 0, y: 0 }, { x: 0, y: 0 }])).toBe(5);
    expect(getClosestDistanceToPath({ x: 0, y: 0 }, [])).toBe(Infinity);
  });

  it('repairs short diagonal segments and leaves long diagonals for orthogonalization', () => {
    expect(removeShortDiagonals([
      { x: 0, y: 0 },
      { x: 3, y: 10 },
      { x: 3, y: 20 },
    ], 20)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 3, y: 10 },
      { x: 3, y: 20 },
    ]);

    expect(removeShortDiagonals([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ], 20)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
  });

  it('enforces port spacing and keeps the placeholder A* contract explicit', () => {
    expect(routeWithAStar({ x: 0, y: 0 }, { x: 10, y: 0 }, [])).toBeNull();

    expect(enforcePortSpacing([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 20, y: 0 },
    ], 12)).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 6 },
      { x: 4, y: 0 },
      { x: 20, y: 0 },
    ]);
  });

  it('removes tiny jogs and smooths short middle segments when unobstructed', () => {
    expect(removeTinyOrthogonalJogs([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 5 },
      { x: 80, y: 5 },
      { x: 80, y: 40 },
    ], 20)).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 40 },
    ]);

    expect(smoothShortSegments([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 5 },
      { x: 80, y: 5 },
    ], 20)).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 5 },
      { x: 80, y: 5 },
    ]);
  });

  it('creates filleted and jump-aware SVG paths', () => {
    const filleted = createFilletedPath([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
    ], 10);
    expect(filleted).toContain(' A ');
    expect(filleted).toContain(' L 40 40');

    const jumpPath = createPathWithJumpsFromObstacles(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      0,
      5,
      [{ start: { x: 50, y: -20 }, end: { x: 50, y: 20 } }],
    );
    expect(jumpPath).toContain('Q 50 -7.5 55 0');
  });

  it('snaps half-pixel drift on two-point near-orthogonal SVG paths', () => {
    expect(createFilletedPath([
      { x: 242.5, y: 902 },
      { x: 243, y: 1062 },
    ], 4)).toBe('M 242.5 902 L 242.5 1062');
  });

  it('offsets orthogonal paths and generates greedy orthogonal routes', () => {
    expect(offsetPathSegments([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
    ], 5)).toEqual([
      { x: 0, y: 5 },
      { x: 45, y: 5 },
      { x: 45, y: 40 },
    ]);

    expect(generateGreedyOrthogonalPath(
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      Position.Right,
      Position.Bottom,
      20,
    )).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
  });

  it('orthogonalizes, aligns to nearby obstacle borders, and optimizes Z paths', () => {
    expect(makePathOrthogonal([
      { x: 0, y: 0 },
      { x: 30, y: 20 },
    ])).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 20 },
    ]);

    expect(alignSegmentsToObstacles([
      { x: 0, y: 0 },
      { x: 10, y: 23 },
      { x: 100, y: 23 },
      { x: 110, y: 0 },
    ], [{ x: 20, y: 40, width: 40, height: 20 }], 20)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 25 },
      { x: 100, y: 25 },
      { x: 110, y: 0 },
    ]);

    expect(optimizeOrthogonalPath([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 40 },
      { x: 100, y: 40 },
    ])).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
    ]);
  });

  it('optimizes orthogonal paths through alternate corners and balanced Z bridges', () => {
    expect(optimizeOrthogonalPath([
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 100 },
    ], [], { sourcePos: Position.Top })).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ]);

    const horizontalZBlockers = [
      { x: 90, y: -5, width: 5, height: 10 },
      { x: -5, y: 50, width: 10, height: 10 },
    ];
    expect(optimizeOrthogonalPath([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 100 },
      { x: 100, y: 100 },
    ], horizontalZBlockers)).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
      { x: 100, y: 100 },
    ]);

    const verticalZBlockers = [
      { x: 50, y: -5, width: 5, height: 10 },
      { x: -5, y: 90, width: 10, height: 5 },
    ];
    expect(optimizeOrthogonalPath([
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      { x: 100, y: 20 },
      { x: 100, y: 100 },
    ], verticalZBlockers)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
    ]);
  });
});
