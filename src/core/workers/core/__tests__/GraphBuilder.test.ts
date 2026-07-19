import { describe, expect, it } from 'vitest';
import { Position } from '../../../types/routing';
import {
  buildOrGetSpatialIndex,
  countObstaclesInDirection,
} from '../GraphBuilder';

const nodeRect = { x: 100, y: 100, width: 50, height: 40 };

describe('GraphBuilder helpers', () => {
  it('counts obstacles by directional scan area for array inputs', () => {
    const obstacles = [
      { x: 160, y: 110, width: 20, height: 20 },
      { x: 40, y: 110, width: 20, height: 20 },
      { x: 115, y: 150, width: 20, height: 20 },
      { x: 115, y: 40, width: 20, height: 20 },
      { x: 500, y: 500, width: 20, height: 20 },
    ];

    expect(countObstaclesInDirection(nodeRect, Position.Right, obstacles, 100)).toBe(1);
    expect(countObstaclesInDirection(nodeRect, Position.Left, obstacles, 100)).toBe(1);
    expect(countObstaclesInDirection(nodeRect, Position.Bottom, obstacles, 100)).toBe(1);
    expect(countObstaclesInDirection(nodeRect, Position.Top, obstacles, 100)).toBe(1);
    expect(countObstaclesInDirection(nodeRect, 'unknown' as Position, obstacles, 100)).toBe(0);
  });

  it('uses a spatial index query when available', () => {
    const spatialIndex = {
      query: (range: { x: number; y: number; width: number; height: number }) => [
        range,
        { x: range.x + 1, y: range.y + 1, width: 1, height: 1 },
      ],
    };

    expect(countObstaclesInDirection(nodeRect, Position.Right, spatialIndex as never, 100)).toBe(2);
  });

  it('returns existing spatial index and builds a QuadTree only for larger obstacle sets', () => {
    const prebuilt = { query: () => [] };
    expect(buildOrGetSpatialIndex([], prebuilt as never)).toBe(prebuilt);
    expect(buildOrGetSpatialIndex(Array.from({ length: 20 }, (_, i) => ({ x: i, y: i, width: 1, height: 1 })))).toBeUndefined();

    const index = buildOrGetSpatialIndex(Array.from({ length: 21 }, (_, i) => ({ x: i * 10, y: 0, width: 5, height: 5 })));
    expect(index).toBeTruthy();
    expect(index?.query({ x: 0, y: 0, width: 20, height: 20 }).length).toBeGreaterThan(0);
  });
});
