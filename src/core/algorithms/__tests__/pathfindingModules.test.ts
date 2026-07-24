import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';

import {
  buildPathfindingGrid,
  findPath,
  getPathfindingConfig,
  setPathfindingConfig,
} from '../pathfinding';
import { isPathBlocked } from '../pathfindingCollision';
import { MinHeap } from '../pathfindingMinHeap';
import {
  generateSimplePath,
  generateSmartCShapePath,
  simplifyPath,
} from '../pathfindingSimplePaths';

describe('pathfinding modules', () => {
  it('coerces global configuration at its runtime boundary and returns snapshots', () => {
    const original = getPathfindingConfig();
    setPathfindingConfig({ visibilityGraphMinObstacles: -5.8 });
    expect(getPathfindingConfig().visibilityGraphMinObstacles).toBe(0);

    setPathfindingConfig({
      useVisibilityGraph: 'true',
      visibilityGraphMinObstacles: Number.POSITIVE_INFINITY,
    } as never);
    const snapshot = getPathfindingConfig();
    expect(snapshot.useVisibilityGraph).toBe(original.useVisibilityGraph);
    expect(snapshot.visibilityGraphMinObstacles).toBe(0);
    snapshot.visibilityGraphMinObstacles = 999;
    expect(getPathfindingConfig().visibilityGraphMinObstacles).toBe(0);

    setPathfindingConfig({
      useVisibilityGraph: original.useVisibilityGraph,
      visibilityGraphMinObstacles: original.visibilityGraphMinObstacles,
    });
  });

  it('orders heap entries by their current finite weights', () => {
    const heap = new MinHeap(new Float32Array([5, 1, 3]));
    heap.push(0);
    heap.push(2);
    heap.push(1);

    expect(heap.size()).toBe(3);
    expect([heap.pop(), heap.pop(), heap.pop(), heap.pop()]).toEqual([1, 2, 0, undefined]);
  });

  it('normalizes invalid grid sizes, coordinates, and alignment points', () => {
    const invalid = buildPathfindingGrid([], {
      startX: Number.NaN,
      startY: Number.POSITIVE_INFINITY,
      endX: 100,
      endY: 100,
    }, Number.NaN, { x: Number.NaN, y: 0 });
    expect(invalid.size).toBe(20);
    expect(invalid.maxIndex).toBeGreaterThan(0);
    expect(invalid.data).toHaveLength(invalid.maxIndex);

    const clamped = buildPathfindingGrid([], {
      startX: 0,
      startY: 0,
      endX: 100,
      endY: 100,
    }, 10_000);
    expect(clamped.size).toBe(1_000);

    const extreme = buildPathfindingGrid([{
      x: Number.POSITIVE_INFINITY,
      y: 0,
      width: 10,
      height: 10,
    }], {
      startX: -1_000_000_000,
      startY: -1_000_000_000,
      endX: 1_000_000_000,
      endY: 1_000_000_000,
    }, 2);
    expect(extreme.maxIndex).toBeLessThanOrEqual(2_000_000);
    expect(extreme.size).toBeGreaterThan(2);

    expect(() => buildPathfindingGrid(null as never, null as never, 20)).not.toThrow();
    expect(() => buildPathfindingGrid([null, {}, { x: 0, y: 0, width: -1, height: 2 }] as never, {
      startX: 0,
      startY: 0,
      endX: 10,
      endY: 10,
    })).not.toThrow();

    expect(findPath(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [null, {}, { x: 0, y: 0, width: -1, height: 2 }] as never,
    )).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });

  it('detects rectangle crossings on horizontal, vertical, and diagonal segments', () => {
    const obstacle = { x: 40, y: 40, width: 20, height: 20 };

    expect(isPathBlocked([{ x: 0, y: 50 }, { x: 100, y: 50 }], [obstacle], 0)).toBe(true);
    expect(isPathBlocked([{ x: 50, y: 0 }, { x: 50, y: 100 }], [obstacle], 0)).toBe(true);
    expect(isPathBlocked([{ x: 0, y: 0 }, { x: 100, y: 100 }], [obstacle], 0)).toBe(true);
    expect(isPathBlocked([{ x: 0, y: 0 }, { x: 20, y: 20 }], [obstacle], 0)).toBe(false);
  });

  it('rejects strict crossings and collinear overlaps with existing lines', () => {
    const vertical = { start: { x: 50, y: -20 }, end: { x: 50, y: 20 } };
    const horizontal = { start: { x: 20, y: 0 }, end: { x: 80, y: 0 } };

    expect(isPathBlocked([{ x: 0, y: 0 }, { x: 100, y: 0 }], [], 0, [vertical])).toBe(true);
    expect(isPathBlocked([{ x: 0, y: 0 }, { x: 100, y: 0 }], [], 0, [horizontal])).toBe(true);
  });

  it('generates simple paths and preserves backtracking bends during simplification', () => {
    expect(generateSimplePath({ x: 0, y: 0 }, { x: 100, y: 0 }, [])).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(simplifyPath([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 40 },
    ])).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 40 },
    ]);
  });

  it('generates a bounded C-shaped detour from the requested source side', () => {
    const path = generateSmartCShapePath(
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      Position.Right,
      null,
      null,
      [],
    );

    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 100 },
      { x: 100, y: 100 },
    ]);
  });
});
