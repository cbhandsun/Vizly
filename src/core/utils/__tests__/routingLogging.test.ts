// @vitest-environment node

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

describe('routingLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive values before logging routing and worker failures', async () => {
    const logging = await import('../routingLogging');

    logging.logEdgeRouterFatalError(new Error('Authorization: Bearer edge-secret'));
    logging.logPathfindingMassiveGrid(300, 700, 210000);
    logging.logPathfindingWalkableEndpointFailure({
      start: { x: 10, y: 20 },
      end: { x: 30, y: 40 },
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 120,
      startIdx: -1,
      endIdx: 9,
      validStartIdx: -1,
      validEndIdx: 11,
      obstacleCount: 5,
      cols: 30,
      rows: 40,
    });
    logging.logPathfindingIterationLimit(100000);
    logging.logPathfindingOpenSetExhausted({
      iterations: 42,
      start: { x: 1, y: 2 },
      end: { x: 3, y: 4 },
      cols: 50,
      rows: 60,
      obstacleCount: 7,
    });
    logging.logPathfindingFallbackLShape({
      iterations: 17,
      start: { x: 5, y: 6 },
      end: { x: 7, y: 8 },
      cols: 9,
      rows: 10,
    });
    logging.logIncrementalVisibilityGraphObstacleExists('obs-1');
    logging.logIncrementalVisibilityGraphObstacleMissing('obs-2');
    logging.logIncrementalVisibilityGraphObstacleMissingAdd('obs-3');
    logging.logVisibilityGraphCachePrebuildDisabled();
    logging.logLPNudgeOptimizeFailure(new Error('token=lp-secret'));

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    expect(errorPayload).toContain('[EdgeRouter] Fatal Error:');
    expect(warnPayload).toContain('[Pathfinding] Grid massive: 300x700 = 210000. Memory impact high.');
    expect(warnPayload).toContain('[A*] Failed to find walkable start/end.');
    expect(warnPayload).toContain('[A*] Aborted: Exceeded max iterations (100000). Falling back.');
    expect(warnPayload).toContain('[A*] openSet exhausted. iterations=42');
    expect(warnPayload).toContain('[A*] Fallback L-shape. iterations=17');
    expect(warnPayload).toContain('[IncrementalVG] Obstacle obs-1 already exists. Use updateObstacle instead.');
    expect(warnPayload).toContain('[IncrementalVG] Obstacle obs-2 not found.');
    expect(warnPayload).toContain('[IncrementalVG] Obstacle obs-3 not found. Adding it.');
    expect(warnPayload).toContain('[VGCache] Prebuild disabled in config');
    expect(errorPayload).toContain('LPNudge optimize failed');
    expect(errorPayload).toContain('[redacted]');
    expect(errorPayload).not.toContain('edge-secret');
    expect(errorPayload).not.toContain('lp-secret');
  });
});
