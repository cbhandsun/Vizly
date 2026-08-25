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
    logging.logWorkerPoolInitializationFailure({ token: 'worker-init-secret' });
    logging.logWorkerPoolRuntimeError(1, new Error('cookie=worker-runtime-secret'));
    logging.logPathfindingWorkerStartupError(2, {
      message: 'api_key=startup-secret',
      filename: 'worker.js',
      lineno: 42,
    });
    logging.logPathfindingWorkerExecutionError({ message: 'secret=exec-secret' });
    logging.logPathfindingWorkerPostMessageError({ message: 'credential=post-secret' });
    logging.logPathfindingWorkerTaskExecutionFailure('edge-11', new Error('token=task-secret'));
    logging.logPathfindingWorkerSerializationFailure(new Error('secret=serialize-secret'));
    logging.logPathfindingWorkerPostingError('Authorization: Bearer posting-secret');
    logging.logPathfindingWorkerCriticalFailure(new Error('api_key=critical-secret'));
    logging.logElkLayoutWorkerFailure('elk-2', new Error('cookie=elk-secret'));
    logging.logAStarGridFailure(new Error('password=astar-secret'));
    logging.logTrunkSuggestedPortInvariant({ token: 'trunk-secret' });
    logging.logRoutingWorkerDebug('debug route message');
    logging.logRoutingWorkerVisibilityGraphAbort();
    logging.logRoutingWorkerPathfindingFallback('edge-88');
    logging.logGridBuilderMassiveGrid(400, 600, 240000);
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
    expect(errorPayload).toContain('Failed to initialize worker pool:');
    expect(errorPayload).toContain('Worker 1 error:');
    expect(errorPayload).toContain('Worker 2 startup error:');
    expect(errorPayload).toContain('[DEBUG-WORKER-POOL] Worker Execution Error:');
    expect(errorPayload).toContain('[WorkerPool] postMessage Error:');
    expect(errorPayload).toContain('[Worker] Task execution failed for edge edge-11:');
    expect(errorPayload).toContain('[DEBUG-WORKER] Return serialization failed:');
    expect(errorPayload).toContain('[Worker] Posting ERROR:');
    expect(errorPayload).toContain('[Worker] CRITICAL FAILURE:');
    expect(errorPayload).toContain('[Worker] Layout failed for elk-2:');
    expect(errorPayload).toContain('[AStarPathfinder] Grid A* failed:');
    expect(errorPayload).toContain('[TrunkCalculator] suggestedPort was never assigned for horizontal trunk!');
    expect(warnPayload).toContain('[Worker] Visibility Graph path aborted: Cannot be orthogonalized safely. Falling back to Grid A*.');
    expect(warnPayload).toContain('[Worker] Pathfinding failed for edge-88, falling back to simple path.');
    expect(warnPayload).toContain('[GridBuilder] Grid massive: 400x600 = 240000. Memory impact high.');
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
    expect(errorPayload).not.toContain('worker-init-secret');
    expect(errorPayload).not.toContain('worker-runtime-secret');
    expect(errorPayload).not.toContain('startup-secret');
    expect(errorPayload).not.toContain('exec-secret');
    expect(errorPayload).not.toContain('post-secret');
    expect(errorPayload).not.toContain('task-secret');
    expect(errorPayload).not.toContain('serialize-secret');
    expect(errorPayload).not.toContain('posting-secret');
    expect(errorPayload).not.toContain('critical-secret');
    expect(errorPayload).not.toContain('elk-secret');
    expect(errorPayload).not.toContain('astar-secret');
    expect(errorPayload).not.toContain('trunk-secret');
    expect(errorPayload).not.toContain('lp-secret');
  });

  it('logs non-sensitive routing diagnostics with safeLog', async () => {
    const logging = await import('../routingLogging');

    logging.logWorkerPoolMalformedMessage();
    logging.logWorkerPoolUnknownJobMessage();
    logging.logPathfindingWorkerBatchTimeout(0, 10_000, 3);
    logging.logRoutingWorkerDebug('route dbg');

    expect(safeLogState.warn).toHaveBeenCalledWith('[WorkerPool] Ignoring malformed worker message');
    expect(safeLogState.warn).toHaveBeenCalledWith('[WorkerPool] Ignoring worker message for unknown job');
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[WorkerPool] Worker 0 batch execution timed out after 10s; falling back to serial routing for 3 job(s).'
    );
    expect(safeLogState.debug).toHaveBeenCalledWith('route dbg');
  });
});
