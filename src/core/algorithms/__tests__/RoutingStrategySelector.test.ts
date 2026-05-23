import { describe, expect, it } from 'vitest';
import {
  resetStrategySelector,
  getStrategySelector,
  RoutingAlgorithm,
  RoutingStrategySelector,
} from '../RoutingStrategySelector';

describe('RoutingStrategySelector', () => {
  const canvasBounds = { width: 1000, height: 800 };

  it('selects grid, visibility graph, and hybrid by obstacle count and density', () => {
    const selector = new RoutingStrategySelector();

    expect(selector.selectStrategy({ obstacleCount: 3, canvasBounds })).toBe(RoutingAlgorithm.GRID_ASTAR);
    expect(selector.selectStrategy({ obstacleCount: 10, canvasBounds })).toBe(RoutingAlgorithm.VISIBILITY_GRAPH);
    expect(selector.selectStrategy({
      obstacleCount: 40,
      canvasBounds,
      obstacles: [{ x: 0, y: 0, width: 10, height: 10 }],
    })).toBe(RoutingAlgorithm.VISIBILITY_GRAPH);
    expect(selector.selectStrategy({
      obstacleCount: 40,
      canvasBounds: { width: 100, height: 100 },
      obstacles: [{ x: 0, y: 0, width: 80, height: 80 }],
    })).toBe(RoutingAlgorithm.HYBRID);
  });

  it('analyzes alternatives and estimates relative costs', () => {
    const selector = new RoutingStrategySelector();
    const analysis = selector.analyzeStrategies({ obstacleCount: 12, canvasBounds });

    expect(analysis.algorithm).toBe(RoutingAlgorithm.VISIBILITY_GRAPH);
    expect(analysis.reason).toContain('Medium density');
    expect(analysis.estimatedCost).toBeGreaterThan(0);
    expect(analysis.alternativeAlgorithms?.map(item => item.algorithm)).toEqual(
      expect.arrayContaining([RoutingAlgorithm.GRID_ASTAR, RoutingAlgorithm.HYBRID]),
    );
    expect(selector.estimateCost(RoutingAlgorithm.GRID_ASTAR, { obstacleCount: 1, canvasBounds })).toBeGreaterThan(0);
    expect(selector.estimateCost('unknown' as RoutingAlgorithm, { obstacleCount: 1, canvasBounds })).toBe(Infinity);
  });

  it('records a capped circular history and can clear it', () => {
    const selector = new RoutingStrategySelector();

    for (let i = 0; i < 105; i++) {
      selector.selectStrategy({ obstacleCount: i % 35, canvasBounds });
    }

    const stats = selector.getStats();
    expect(stats.totalDecisions).toBe(100);
    expect(stats.recentDecisions.length).toBeLessThanOrEqual(10);
    expect(Object.keys(stats.distributionByAlgorithm).length).toBeGreaterThan(0);

    selector.clearHistory();
    expect(selector.getStats().totalDecisions).toBe(0);
  });

  it('supports singleton reset', () => {
    resetStrategySelector();
    const first = getStrategySelector();
    resetStrategySelector();
    expect(getStrategySelector()).not.toBe(first);
  });
});
