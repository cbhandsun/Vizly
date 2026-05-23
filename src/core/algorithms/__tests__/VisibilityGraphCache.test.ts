import { describe, expect, it } from 'vitest';
import { resetVGCache, getVGCache, VisibilityGraphCache } from '../VisibilityGraphCache';

const obstacles = [{ x: 10, y: 10, width: 20, height: 20 }];

function graph(id: number) {
  return {
    vertices: [{ x: id, y: id }],
    edges: new Map([[0, []]]),
    edgeCosts: new Map(),
    vertexToObstacle: new Map(),
  };
}

describe('VisibilityGraphCache', () => {
  it('builds once, reuses cached graphs, and tracks stats', () => {
    const cache = new VisibilityGraphCache({ maxSize: 2 });
    let builds = 0;

    const first = cache.getOrBuild(obstacles, undefined, () => {
      builds += 1;
      return graph(1);
    }, { obstacleOffset: 5 });
    const second = cache.getOrBuild(obstacles, undefined, () => {
      builds += 1;
      return graph(2);
    }, { obstacleOffset: 5 });

    expect(first).toBe(second);
    expect(builds).toBe(1);
    expect(cache.has(obstacles, { obstacleOffset: 5 })).toBe(true);
    expect(cache.peek(obstacles, { obstacleOffset: 5 })?.hitCount).toBe(1);
    expect(cache.getStats()).toMatchObject({ size: 1, maxSize: 2, hitCount: 1, missCount: 1, hitRate: 0.5 });
  });

  it('keeps obstacle offset in cache identity', () => {
    const cache = new VisibilityGraphCache({ maxSize: 4 });

    const first = cache.getOrBuild(obstacles, undefined, () => graph(1), { obstacleOffset: 5 });
    const second = cache.getOrBuild(obstacles, undefined, () => graph(2), { obstacleOffset: 10 });

    expect(first).not.toBe(second);
    expect(cache.getStats().size).toBe(2);
  });

  it('evicts least recently used entries and supports invalidation', () => {
    const cache = new VisibilityGraphCache({ maxSize: 2 });
    const a = [{ x: 0, y: 0, width: 10, height: 10 }];
    const b = [{ x: 20, y: 20, width: 10, height: 10 }];
    const c = [{ x: 40, y: 40, width: 10, height: 10 }];

    cache.getOrBuild(a, undefined, () => graph(1));
    cache.getOrBuild(b, undefined, () => graph(2));
    cache.getOrBuild(a, undefined, () => graph(3));
    cache.getOrBuild(c, undefined, () => graph(4));

    expect(cache.has(a)).toBe(true);
    expect(cache.has(b)).toBe(false);
    expect(cache.has(c)).toBe(true);
    expect(cache.invalidate(entry => entry.graph.vertices[0].x === 1)).toBe(1);
    expect(cache.has(a)).toBe(false);
  });

  it('prebuilds only when enabled and singleton can be reset', async () => {
    const disabled = new VisibilityGraphCache({ enablePrebuild: false });
    await disabled.prebuildGraphs([obstacles]);
    expect(disabled.getStats().size).toBe(0);

    const enabled = new VisibilityGraphCache({ enablePrebuild: true });
    await enabled.prebuildGraphs([obstacles]);
    expect(enabled.getStats().size).toBe(1);

    resetVGCache();
    const first = getVGCache();
    resetVGCache();
    expect(getVGCache()).not.toBe(first);
  });
});
