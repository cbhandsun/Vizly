import { describe, expect, it } from 'vitest';

import { resolveDisplayRoutingLayoutVisualTimeoutMs } from './display-routing-layout-visual-settle.mjs';

describe('resolveDisplayRoutingLayoutVisualTimeoutMs', () => {
  it('preserves a finite matrix timeout within the visual-settle bounds', () => {
    expect(resolveDisplayRoutingLayoutVisualTimeoutMs(12_000)).toBe(12_000);
  });

  it('clamps empty, extreme, and invalid timeout values safely', () => {
    expect(resolveDisplayRoutingLayoutVisualTimeoutMs(0)).toBe(100);
    expect(resolveDisplayRoutingLayoutVisualTimeoutMs(120_000)).toBe(30_000);
    expect(resolveDisplayRoutingLayoutVisualTimeoutMs(Number.POSITIVE_INFINITY)).toBe(5_000);
    expect(resolveDisplayRoutingLayoutVisualTimeoutMs(undefined, 8_000)).toBe(8_000);
  });
});
