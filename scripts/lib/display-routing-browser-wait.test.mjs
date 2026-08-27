import { describe, expect, it, vi } from 'vitest';

import { waitForDisplayRoutingBrowserValue } from './display-routing-browser-wait.mjs';

describe('display routing browser wait', () => {
  it('returns the first ready browser value', async () => {
    const ready = { stage: 'final-applied' };
    const session = { evaluate: vi.fn().mockResolvedValue(ready) };

    await expect(waitForDisplayRoutingBrowserValue(session, 'ready', 1_000))
      .resolves.toBe(ready);
    expect(session.evaluate).toHaveBeenCalledWith('ready');
  });

  it('reports bounded routing diagnostics after timeout', async () => {
    const diagnostics = { routing: { stage: 'routing' }, requestCount: 1 };
    const session = { evaluate: vi.fn().mockResolvedValue(diagnostics) };

    await expect(waitForDisplayRoutingBrowserValue(session, 'ready', 0))
      .rejects.toThrow(/"requestCount": 1/);
    expect(session.evaluate).toHaveBeenCalledOnce();
  });
});
