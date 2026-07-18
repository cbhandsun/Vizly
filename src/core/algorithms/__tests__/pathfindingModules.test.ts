import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';

import { getPathfindingConfig, setPathfindingConfig } from '../pathfinding';
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
