import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

const elkState = vi.hoisted(() => ({
  runLayout: vi.fn(),
}));

vi.mock('../consoleCleanup', () => ({
  safeLog: safeLogState,
}));

vi.mock('../../workers/elkLayoutClient', () => ({
  runElkLayout: elkState.runLayout,
}));

import { routeEdgesWithELK } from '../elkEdgeRouter';

describe('elkEdgeRouter', () => {
  beforeEach(() => {
    elkState.runLayout.mockRejectedValue(new Error('Authorization: Bearer live-token'));
  });

  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    Object.values(elkState).forEach(mock => mock.mockReset());
    vi.useRealTimers();
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

  it('passes the bounded timeout to the shared worker client', async () => {
    elkState.runLayout.mockRejectedValue(new Error('ELK layout timed out after 3000ms'));

    const paths = await routeEdgesWithELK([], []);

    expect(paths.size).toBe(0);
    expect(elkState.runLayout).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'elk-edge-routing' }),
      { timeoutMs: 3_000 },
    );
    expect(safeLogState.error).toHaveBeenCalledWith(
      '[ELK Edge Router] Layout failed:',
      expect.objectContaining({ message: 'ELK layout timed out after 3000ms' }),
    );
  });
});
