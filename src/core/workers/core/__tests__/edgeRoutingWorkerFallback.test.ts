import { describe, expect, it, vi } from 'vitest';

import type { PathfindingGrid } from '../../../algorithms/pathfinding';
import type { PathFindingJob, Point } from '../../../types/routing';
import { createDefaultRoutingConfig, Position } from '../../../types/routing';
import { routeWorkerFallback } from '../edgeRoutingWorkerFallback';

const job = (): PathFindingJob => ({
  jobId: 'job-edge',
  edgeId: 'edge',
  source: 'source',
  target: 'target',
  sourceX: 0,
  sourceY: 0,
  targetX: 300,
  targetY: 0,
});

const baseOptions = () => {
  const config = createDefaultRoutingConfig();
  const astar = { findPath: vi.fn<() => Point[] | null>(() => null) };
  const visibilityGraphRouter = {
    findPath: vi.fn<() => Point[] | null>(() => null),
  };
  return {
    job: job(),
    config,
    startPoint: { x: 100, y: 30 },
    startOffset: { x: 110, y: 30 },
    endOffset: { x: 290, y: 30 },
    endPoint: { x: 300, y: 30 },
    startPosition: Position.Right,
    endPosition: Position.Left,
    sourceRect: { x: 0, y: 0, width: 100, height: 60 },
    targetRect: { x: 300, y: 0, width: 100, height: 60 },
    routingObstacles: [],
    allObstacles: [],
    clearanceRects: [],
    containerBorders: [],
    lineObstacles: [],
    prebuiltGrid: {} as PathfindingGrid,
    shouldCollectDebugData: false,
    debugData: {},
    gridBuilder: { buildGrid: vi.fn(() => ({} as PathfindingGrid)) },
    astar,
    visibilityGraphRouter,
    analyzer: { intersectsAnyObstacle: vi.fn(() => false) },
  };
};

describe('edgeRoutingWorkerFallback', () => {
  it('prefers a valid visibility graph path', () => {
    const options = baseOptions();
    options.config.algorithm.useVisibilityGraph = true;
    options.visibilityGraphRouter.findPath.mockReturnValue([
      options.startOffset,
      options.endOffset,
    ]);

    const result = routeWorkerFallback(options);

    expect(result.strategyName).toBe('Visibility Graph');
    expect(result.points).toEqual([
      options.startPoint,
      options.startOffset,
      options.endOffset,
      options.endPoint,
    ]);
    expect(options.astar.findPath).not.toHaveBeenCalled();
  });

  it('falls back to A* when visibility routing is disabled', () => {
    const options = baseOptions();
    options.config.algorithm.useVisibilityGraph = false;
    options.astar.findPath.mockReturnValue([
      options.startOffset,
      { x: 200, y: 30 },
      options.endOffset,
    ]);

    const result = routeWorkerFallback(options);

    expect(result.strategyName).toBe('A* Grid');
    expect(result.points).toContainEqual({ x: 200, y: 30 });
    expect(options.astar.findPath).toHaveBeenCalledOnce();
  });

  it('preserves visual continuity when graph and grid routing both fail', () => {
    const options = baseOptions();
    options.config.algorithm.useVisibilityGraph = false;

    const result = routeWorkerFallback(options);

    expect(['Simple Fallback', 'L-Shape Fallback']).toContain(result.strategyName);
    expect(result.points[0]).toEqual(options.startPoint);
    expect(result.points[result.points.length - 1]).toEqual(options.endPoint);
  });
});
