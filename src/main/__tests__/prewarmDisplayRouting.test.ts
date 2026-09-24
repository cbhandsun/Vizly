import { describe, expect, it, vi } from 'vitest';

import {
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

  it('loads once for a diagram route and fails closed when loading is blocked', async () => {
    const load = vi.fn().mockResolvedValue({});
    await expect(prewarmDisplayRoutingForLocation(
      { hash: '#/?diagram=logistics' },
      load,
    )).resolves.toBe(true);
    expect(load).toHaveBeenCalledOnce();

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
