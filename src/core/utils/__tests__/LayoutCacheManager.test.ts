import { afterEach, describe, expect, it, vi } from 'vitest';

const logLayoutCacheKeyCreationFailure = vi.fn();

vi.mock('../layoutCacheLogging', () => ({
  logLayoutCacheKeyCreationFailure,
}));

describe('LayoutCacheManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    logLayoutCacheKeyCreationFailure.mockReset();
  });

  it('logs and falls back when createKey cannot serialize options', async () => {
    const { LayoutCacheManager } = await import('../LayoutCacheManager');
    const cache = LayoutCacheManager.getInstance();
    const cyclicOptions: Record<string, unknown> = {};
    cyclicOptions.self = cyclicOptions;

    const key = cache.createKey(
      [{ id: 'n1', style: {}, data: {} } as any],
      [{ id: 'e1', source: 'n1', target: 'n1' } as any],
      cyclicOptions
    );

    expect(key).toMatch(/^layout:\d+:/);
    expect(logLayoutCacheKeyCreationFailure).toHaveBeenCalledWith('createKey', expect.any(Error));
  });

  it('logs and falls back when createStructureKey cannot serialize options', async () => {
    const { LayoutCacheManager } = await import('../LayoutCacheManager');
    const cache = LayoutCacheManager.getInstance();
    const cyclicOptions: Record<string, unknown> = {};
    cyclicOptions.self = cyclicOptions;

    const key = cache.createStructureKey(
      [{ id: 'n1', data: {} } as any],
      [{ id: 'e1', source: 'n1', target: 'n1' } as any],
      'dagre',
      cyclicOptions
    );

    expect(key).toMatch(/^struct:dagre:\d+$/);
    expect(logLayoutCacheKeyCreationFailure).toHaveBeenCalledWith('createStructureKey', expect.any(Error));
  });
});
