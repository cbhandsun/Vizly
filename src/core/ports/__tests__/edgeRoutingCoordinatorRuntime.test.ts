import { describe, expect, it, vi } from 'vitest';

import {
  configureEdgeRoutingCoordinatorRuntime,
  loadEdgeRoutingCoordinator,
} from '../edgeRoutingCoordinatorRuntime';

describe('edge routing coordinator runtime port', () => {
  it('returns the configured lifecycle without exposing its implementation', async () => {
    const lifecycle = {
      forceClearAllCaches: vi.fn(),
      freeze: vi.fn(),
      unfreeze: vi.fn(),
    };
    configureEdgeRoutingCoordinatorRuntime(async () => lifecycle);

    const loaded = await loadEdgeRoutingCoordinator();
    loaded.freeze();

    expect(loaded).toBe(lifecycle);
    expect(lifecycle.freeze).toHaveBeenCalledOnce();
  });

  it('propagates loader failures to the caller-owned fallback path', async () => {
    configureEdgeRoutingCoordinatorRuntime(async () => {
      throw new Error('routing unavailable');
    });

    await expect(loadEdgeRoutingCoordinator()).rejects.toThrow('routing unavailable');
  });
});
