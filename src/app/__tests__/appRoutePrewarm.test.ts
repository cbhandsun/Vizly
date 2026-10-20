// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
  createSingleFlightLoader,
  prewarmBrowserLocationRoute,
  resolveBrowserLocationRouteTarget,
  type RoutePrewarmLoaders,
} from '../appRoutePrewarm';

describe('createSingleFlightLoader', () => {
  it('shares the in-flight promise and retries after a rejected load', async () => {
    let attempts = 0;
    const loader = createSingleFlightLoader(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('network-transient');
      return { ok: true };
    });

    const first = loader();
    const duplicate = loader();
    expect(first).toBe(duplicate);
    await expect(first).rejects.toThrow('network-transient');

    const retry = loader();
    expect(retry).not.toBe(first);
    await expect(retry).resolves.toEqual({ ok: true });
    expect(attempts).toBe(2);
  });
});

describe('resolveBrowserLocationRouteTarget', () => {
  it('resolves hash-routed and pathname-routed locations consistently with AppRoutes', () => {
    expect(resolveBrowserLocationRouteTarget({ pathname: '/', hash: '#/manage' }, false)).toMatchObject({
      routeTarget: 'manage',
      path: '/manage',
      diagramId: '',
      testMode: '',
    });

    expect(
      resolveBrowserLocationRouteTarget(
        { pathname: '/', hash: '#/?diagram=wms-process-flow-v1' },
        false,
      ),
    ).toMatchObject({
      routeTarget: 'diagram',
      path: '/',
      diagramId: 'wms-process-flow-v1',
    });

    expect(
      resolveBrowserLocationRouteTarget({ pathname: '/storage-config', hash: '' }, false),
    ).toMatchObject({
      routeTarget: 'storage-config',
      path: '/storage-config',
    });

    expect(
      resolveBrowserLocationRouteTarget({ pathname: '/', search: '?test=3d' }, false),
    ).toMatchObject({
      routeTarget: 'warehouse-3d',
      testMode: '3d',
    });
  });

  it('handles empty, invalid, oversized, and security-sensitive locations safely', () => {
    expect(resolveBrowserLocationRouteTarget(null, false).routeTarget).toBe('manage');
    expect(resolveBrowserLocationRouteTarget(undefined, false).routeTarget).toBe('manage');
    expect(
      resolveBrowserLocationRouteTarget(
        { pathname: `/${'a'.repeat(5_000)}`, hash: `#/${'b'.repeat(5_000)}` },
        false,
      ).routeTarget,
    ).toBe('manage');
    expect(
      resolveBrowserLocationRouteTarget(
        { pathname: '/%2e%2e/manage' },
        false,
      ).routeTarget,
    ).toBe('not-found');
    expect(
      resolveBrowserLocationRouteTarget(
        { pathname: '/', hash: '#/%2e%2e/manage?diagram=wms-process-flow-v1' },
        false,
      ).routeTarget,
    ).toBe('not-found');
    expect(
      resolveBrowserLocationRouteTarget({ pathname: '/', search: '?test=colors' }, false).routeTarget,
    ).toBe('manage');
    expect(
      resolveBrowserLocationRouteTarget({ pathname: '/', search: '?test=colors' }, true).routeTarget,
    ).toBe('theme-colors');
  });
});

describe('prewarmBrowserLocationRoute', () => {
  it('prewarms only the matched route and preloads known standard preset data on diagram routes', async () => {
    const manageLoader = vi.fn().mockResolvedValue({});
    const diagramLoader = vi.fn().mockResolvedValue({});
    const preloadStandardPreset = vi.fn().mockResolvedValue({});
    const routeLoaders: RoutePrewarmLoaders = {
      manage: manageLoader,
      diagram: diagramLoader,
    };

    await expect(
      prewarmBrowserLocationRoute(
        { pathname: '/', hash: '#/?diagram=wms-process-flow-v1' },
        { routeLoaders, preloadStandardPreset, enableDevRoutes: false },
      ),
    ).resolves.toBe(true);

    expect(diagramLoader).toHaveBeenCalledOnce();
    expect(manageLoader).not.toHaveBeenCalled();
    expect(preloadStandardPreset).toHaveBeenCalledWith('wms-process-flow-v1');
  });

  it('does not preload standard preset assets for custom non-preset diagram ids', async () => {
    const diagramLoader = vi.fn().mockResolvedValue({});
    const preloadStandardPreset = vi.fn().mockResolvedValue({});

    await expect(
      prewarmBrowserLocationRoute(
        { pathname: '/', hash: '#/?diagram=custom-user-diagram-123' },
        {
          routeLoaders: { diagram: diagramLoader },
          preloadStandardPreset,
          enableDevRoutes: false,
        },
      ),
    ).resolves.toBe(true);

    expect(diagramLoader).toHaveBeenCalledOnce();
    expect(preloadStandardPreset).not.toHaveBeenCalled();
  });

  it('fails closed on unknown routes, missing loaders, or rejected route/preset loads', async () => {
    const preloadStandardPreset = vi.fn().mockRejectedValue(new Error('preset-failed'));
    const diagramLoader = vi.fn().mockResolvedValue({});

    await expect(
      prewarmBrowserLocationRoute(
        { pathname: '/unknown-route' },
        { routeLoaders: { diagram: diagramLoader }, preloadStandardPreset, enableDevRoutes: false },
      ),
    ).resolves.toBe(false);
    expect(diagramLoader).not.toHaveBeenCalled();

    await expect(
      prewarmBrowserLocationRoute(
        { pathname: '/docs' },
        { routeLoaders: {}, preloadStandardPreset, enableDevRoutes: false },
      ),
    ).resolves.toBe(false);

    // Preset preload failure does not fail route prewarming
    await expect(
      prewarmBrowserLocationRoute(
        { pathname: '/', hash: '#/?diagram=wms-process-flow-v1' },
        { routeLoaders: { diagram: diagramLoader }, preloadStandardPreset, enableDevRoutes: false },
      ),
    ).resolves.toBe(true);

    // Route loader failure returns false without throwing
    await expect(
      prewarmBrowserLocationRoute(
        { pathname: '/manage' },
        {
          routeLoaders: { manage: vi.fn().mockRejectedValue(new Error('chunk-failed')) },
          preloadStandardPreset,
          enableDevRoutes: false,
        },
      ),
    ).resolves.toBe(false);
  });
});
