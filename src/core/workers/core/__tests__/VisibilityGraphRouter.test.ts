import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultRoutingConfig } from '../../../types/routing';
import { VisibilityGraphRouter } from '../VisibilityGraphRouter';

const mockState = vi.hoisted(() => ({
  selectedStrategy: 'VISIBILITY_GRAPH',
  oneBendResult: null as null | { path: Array<{ x: number; y: number }> },
  fullPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  selectStrategy: vi.fn(),
  oneBendFindPath: vi.fn(),
  getOrBuild: vi.fn(),
  getStats: vi.fn(),
  clear: vi.fn(),
  findPathOnVisibilityGraph: vi.fn(),
}));

vi.mock('../../../algorithms/RoutingStrategySelector', () => ({
  RoutingAlgorithm: {
    GRID_ASTAR: 'GRID_ASTAR',
    VISIBILITY_GRAPH: 'VISIBILITY_GRAPH',
    HYBRID: 'HYBRID',
  },
  RoutingStrategySelector: vi.fn().mockImplementation(function () {
    return {
    selectStrategy: mockState.selectStrategy,
    };
  }),
}));

vi.mock('../../../algorithms/OneBendVisibilityGraph', () => ({
  OneBendVisibilityGraph: vi.fn().mockImplementation(function () {
    return {
      findPath: mockState.oneBendFindPath,
    };
  }),
}));

vi.mock('../../../algorithms/VisibilityGraphCache', () => ({
  VisibilityGraphCache: vi.fn().mockImplementation(function () {
    return {
      getOrBuild: mockState.getOrBuild,
      getStats: mockState.getStats,
      clear: mockState.clear,
    };
  }),
}));

vi.mock('../../../algorithms/visibilityGraph', () => ({
  findPathOnVisibilityGraph: mockState.findPathOnVisibilityGraph,
}));

describe('VisibilityGraphRouter', () => {
  beforeEach(() => {
    mockState.selectedStrategy = 'VISIBILITY_GRAPH';
    mockState.oneBendResult = null;
    mockState.fullPath = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    mockState.selectStrategy.mockImplementation(() => mockState.selectedStrategy);
    mockState.oneBendFindPath.mockImplementation(() => mockState.oneBendResult);
    mockState.getOrBuild.mockReturnValue({ vertices: [], edges: [] });
    mockState.getStats.mockReturnValue({ size: 2, hits: 3, misses: 1 });
    mockState.findPathOnVisibilityGraph.mockImplementation(() => mockState.fullPath);
    mockState.clear.mockClear();
    mockState.selectStrategy.mockClear();
    mockState.oneBendFindPath.mockClear();
    mockState.getOrBuild.mockClear();
    mockState.getStats.mockClear();
    mockState.findPathOnVisibilityGraph.mockClear();
  });

  it('returns null when strategy selection prefers grid routing', () => {
    mockState.selectedStrategy = 'GRID_ASTAR';
    const router = new VisibilityGraphRouter(createDefaultRoutingConfig());

    expect(router.findPath({ x: 0, y: 0 }, { x: 100, y: 0 }, [])).toBeNull();
    expect(mockState.oneBendFindPath).not.toHaveBeenCalled();
    expect(mockState.getOrBuild).not.toHaveBeenCalled();
  });

  it('uses one-bend visibility graph as the fast path when enabled', () => {
    mockState.oneBendResult = { path: [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 }] };
    const router = new VisibilityGraphRouter(createDefaultRoutingConfig());

    const path = router.findPath(
      { x: 0, y: 0 },
      { x: 100, y: 50 },
      [{ x: 300, y: 300, width: 10, height: 10 }],
      undefined,
      [{ start: { x: 10, y: 10 }, end: { x: 20, y: 20 } }],
    );

    expect(path).toEqual(mockState.oneBendResult.path);
    expect(mockState.oneBendFindPath).toHaveBeenCalledWith(
      { x: 0, y: 0 },
      { x: 100, y: 50 },
      expect.any(Array),
      expect.any(Array),
    );
    expect(mockState.getOrBuild).not.toHaveBeenCalled();
  });

  it('falls back to full visibility graph when one-bend is disabled', () => {
    const config = createDefaultRoutingConfig();
    config.experimental = { ...config.experimental, enable1BendVG: false };
    const router = new VisibilityGraphRouter(config);

    expect(router.findPath({ x: 0, y: 0 }, { x: 100, y: 0 }, [])).toEqual(mockState.fullPath);
    expect(mockState.oneBendFindPath).not.toHaveBeenCalled();
    expect(mockState.getOrBuild).toHaveBeenCalled();
    expect(mockState.findPathOnVisibilityGraph).toHaveBeenCalledWith(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [],
      { vertices: [], edges: [] },
      { lineObstacles: undefined },
    );
  });

  it('queries spatial indexes locally before strategy selection and full routing', () => {
    const query = vi.fn(() => [{ x: 20, y: -10, width: 20, height: 20 }]);
    const spatial = { query };
    const router = new VisibilityGraphRouter(createDefaultRoutingConfig());

    router.findPath({ x: 0, y: 0 }, { x: 100, y: 0 }, spatial as never, spatial as never);

    expect(query).toHaveBeenCalledWith({ x: -300, y: -300, width: 700, height: 600 });
    expect(mockState.selectStrategy).toHaveBeenCalledWith(expect.objectContaining({ obstacleCount: 1 }));
    expect(mockState.getOrBuild).toHaveBeenCalledWith([{ x: 20, y: -10, width: 20, height: 20 }], spatial);
  });

  it('exposes VG enablement, cache stats, clear, and one-bend optimizer handle', () => {
    const config = createDefaultRoutingConfig();
    config.algorithm.visibilityGraphThreshold = 3;
    const router = new VisibilityGraphRouter(config);

    expect(router.shouldUseVG(2)).toBe(false);
    expect(router.shouldUseVG(3)).toBe(true);
    config.algorithm.useVisibilityGraph = false;
    expect(router.shouldUseVG(99)).toBe(false);

    expect(router.getCacheStats()).toEqual({ size: 2, hits: 3, misses: 1 });
    router.clearCache();
    expect(mockState.clear).toHaveBeenCalled();
    expect(router.getOneBendOptimizer()).toHaveProperty('findPath');
  });
});
