import { afterEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../consoleCleanup', () => ({
  safeLog: safeLogState,
}));

vi.mock('elkjs', () => ({
  default: class MockElk {
    layout = vi.fn().mockRejectedValue(new Error('Authorization: Bearer live-token'));
  },
}));

import { routeEdgesWithELK } from '../elkEdgeRouter';

describe('elkEdgeRouter', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts layout failures before logging and returns an empty path map', async () => {
    const paths = await routeEdgesWithELK(
      [
        {
          id: 'node-1',
          position: { x: 0, y: 0 },
          style: { width: 100, height: 60 },
        },
        {
          id: 'node-2',
          position: { x: 200, y: 80 },
          style: { width: 100, height: 60 },
        },
      ] as never,
      [
        {
          id: 'edge-1',
          source: 'node-1',
          target: 'node-2',
        },
      ] as never
    );

    expect(paths.size).toBe(0);
    expect(safeLogState.error).toHaveBeenCalledWith(
      '[ELK Edge Router] Layout failed:',
      expect.objectContaining({
        message: 'Authorization: [redacted]',
      })
    );

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    expect(errorPayload).toContain('[redacted]');
    expect(errorPayload).not.toContain('live-token');
  });
});
