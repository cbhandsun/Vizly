import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

const elkState = vi.hoisted(() => ({
  layout: vi.fn(),
  terminateWorker: vi.fn(),
}));

vi.mock('../consoleCleanup', () => ({
  safeLog: safeLogState,
}));

vi.mock('elkjs', () => ({
  default: class MockElk {
    layout = elkState.layout;
    terminateWorker = elkState.terminateWorker;
  },
}));

import { routeEdgesWithELK } from '../elkEdgeRouter';

describe('elkEdgeRouter', () => {
  beforeEach(() => {
    elkState.layout.mockRejectedValue(new Error('Authorization: Bearer live-token'));
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
    expect(elkState.terminateWorker).toHaveBeenCalledOnce();
  });

  it('falls back and terminates ELK when routing does not settle', async () => {
    vi.useFakeTimers();
    elkState.layout.mockReturnValue(new Promise(() => undefined));

    const routingPromise = routeEdgesWithELK([], []);
    await vi.advanceTimersByTimeAsync(3_000);
    const paths = await routingPromise;

    expect(paths.size).toBe(0);
    expect(elkState.terminateWorker).toHaveBeenCalled();
    expect(safeLogState.error).toHaveBeenCalledWith(
      '[ELK Edge Router] Layout failed:',
      expect.objectContaining({ message: 'ELK edge routing exceeded 3000ms' }),
    );
  });
});
