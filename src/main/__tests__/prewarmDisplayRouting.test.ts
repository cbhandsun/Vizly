// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
  extractDisplayRoutingToken,
  prewarmDisplayRoutingForLocation,
  shouldPrewarmDisplayRouting,
} from '../prewarmDisplayRouting';

describe('prewarmDisplayRouting', () => {
  it.each([
    { search: '?diagram=logistics' },
    { search: '?canonicalPreset=logistics' },
    { search: '?precompiledCapture=logistics' },
    { hash: '#/?diagram=logistics' },
    { pathname: '/share/public-id' },
  ])('recognizes bounded flowchart entry locations', (location) => {
    expect(shouldPrewarmDisplayRouting(location)).toBe(true);
  });

  it('extracts bounded route tokens from search or hash queries and returns null otherwise', () => {
    expect(extractDisplayRoutingToken({ search: '?diagram= wms-e2e-solution ' })).toBe('wms-e2e-solution');
    expect(extractDisplayRoutingToken({ hash: '#/?canonicalPreset=logistics-planning-v1' })).toBe('logistics-planning-v1');
    expect(extractDisplayRoutingToken({ pathname: '/share/public-id' })).toBeNull();
    expect(extractDisplayRoutingToken({ search: '?diagram=   ' })).toBeNull();
  });

  it.each([
    {},
    { pathname: '/manage' },
    { search: '?diagram=' },
    { search: `?diagram=${'x'.repeat(257)}` },
    { hash: '#/manage?view=local' },
    { search: 'x'.repeat(4_097) },
    { search: { diagram: 'invalid-type' } },
  ])('does not preload for unrelated or malformed locations', (location) => {
    expect(shouldPrewarmDisplayRouting(location)).toBe(false);
  });

  it('loads once for a diagram route, prefetches precompiled route token when exposed, and fails closed when loading is blocked', async () => {
    const prefetchBaseReactFlowPrecompiledRoute = vi.fn().mockResolvedValue(true);
    const load = vi.fn().mockResolvedValue({ prefetchBaseReactFlowPrecompiledRoute });
    await expect(prewarmDisplayRoutingForLocation(
      { hash: '#/?diagram=logistics' },
      load,
    )).resolves.toBe(true);
    expect(load).toHaveBeenCalledOnce();
    expect(prefetchBaseReactFlowPrecompiledRoute).toHaveBeenCalledWith('logistics');

    const failingPrefetch = vi.fn().mockRejectedValue(new Error('prefetch-failed'));
    await expect(prewarmDisplayRoutingForLocation(
      { search: '?diagram=logistics' },
      () => Promise.resolve({ prefetchBaseReactFlowPrecompiledRoute: failingPrefetch }),
    )).resolves.toBe(true);
    expect(failingPrefetch).toHaveBeenCalledWith('logistics');

    const blockedLoad = vi.fn().mockRejectedValue(new Error('blocked'));
    await expect(prewarmDisplayRoutingForLocation(
      { search: '?canonicalPreset=logistics' },
      blockedLoad,
    )).resolves.toBe(false);
    expect(blockedLoad).toHaveBeenCalledOnce();
  });

  it('does not invoke the loader outside a display route', async () => {
    const load = vi.fn();
    await expect(prewarmDisplayRoutingForLocation({ pathname: '/manage' }, load))
      .resolves.toBe(false);
    expect(load).not.toHaveBeenCalled();
  });
});
