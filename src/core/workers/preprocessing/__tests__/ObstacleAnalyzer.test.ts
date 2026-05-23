import { describe, expect, it, vi } from 'vitest';
import { Position } from '../../../types/routing';
import type { Rectangle } from '../../../algorithms/geometryUtils';
import { ObstacleAnalyzer } from '../ObstacleAnalyzer';

describe('ObstacleAnalyzer', () => {
  const analyzer = new ObstacleAnalyzer();

  it('detects line intersections against raw obstacle arrays', () => {
    const obstacles: Rectangle[] = [
      { x: 30, y: 30, width: 20, height: 20 },
      { x: 100, y: 100, width: 20, height: 20 },
    ];

    expect(analyzer.intersectsAnyObstacle({ x: 0, y: 40 }, { x: 80, y: 40 }, obstacles)).toBe(true);
    expect(analyzer.intersectsAnyObstacle({ x: 0, y: 0 }, { x: 20, y: 0 }, obstacles)).toBe(false);
  });

  it('uses buffer padding when checking intersections', () => {
    const obstacles: Rectangle[] = [{ x: 30, y: 30, width: 10, height: 10 }];

    expect(analyzer.intersectsAnyObstacle({ x: 0, y: 20 }, { x: 60, y: 20 }, obstacles)).toBe(false);
    expect(analyzer.intersectsAnyObstacle({ x: 0, y: 20 }, { x: 60, y: 20 }, obstacles, 10)).toBe(true);
  });

  it('queries a spatial index with the segment bounding box', () => {
    const query = vi.fn(() => [{ x: 30, y: 30, width: 20, height: 20 }]);
    const spatialIndex = { query };

    expect(analyzer.intersectsAnyObstacle({ x: 0, y: 40 }, { x: 80, y: 40 }, spatialIndex as never)).toBe(true);
    expect(query).toHaveBeenCalledWith({ x: 0, y: 40, width: 80, height: 0 });
  });

  it('counts obstacles in each cardinal direction', () => {
    const node: Rectangle = { x: 50, y: 50, width: 20, height: 20 };
    const obstacles: Rectangle[] = [
      { x: 80, y: 45, width: 10, height: 10 },
      { x: 20, y: 45, width: 10, height: 10 },
      { x: 45, y: 80, width: 10, height: 10 },
      { x: 45, y: 20, width: 10, height: 10 },
      { x: 300, y: 300, width: 10, height: 10 },
    ];

    expect(analyzer.countObstaclesInDirection(node, Position.Right, obstacles, 50)).toBe(1);
    expect(analyzer.countObstaclesInDirection(node, Position.Left, obstacles, 50)).toBe(1);
    expect(analyzer.countObstaclesInDirection(node, Position.Bottom, obstacles, 50)).toBe(1);
    expect(analyzer.countObstaclesInDirection(node, Position.Top, obstacles, 50)).toBe(1);
  });

  it('delegates directional counting to a spatial index', () => {
    const query = vi.fn(() => [
      { x: 80, y: 45, width: 10, height: 10 },
      { x: 85, y: 65, width: 10, height: 10 },
    ]);
    const node: Rectangle = { x: 50, y: 50, width: 20, height: 20 };

    expect(analyzer.countObstaclesInDirection(node, Position.Right, { query } as never, 100)).toBe(2);
    expect(query).toHaveBeenCalledWith({ x: 70, y: 40, width: 100, height: 40 });
  });

  it('calculates bounds and handles empty inputs', () => {
    expect(analyzer.getBounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    expect(analyzer.getBounds([
      { x: 10, y: 20, width: 5, height: 6 },
      { x: -5, y: 30, width: 20, height: 10 },
    ])).toEqual({ minX: -5, minY: 20, maxX: 15, maxY: 40 });
    expect(analyzer.countObstaclesInDirection({ x: 0, y: 0, width: 10, height: 10 }, Position.Right, [], 100)).toBe(0);
  });
});
