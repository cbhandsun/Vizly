import { safeLog } from './consoleCleanup';
import { redactSensitiveLogValue } from './logSecurity';

export const logEdgeRouterFatalError = (error: unknown): void => {
  safeLog.error('[EdgeRouter] Fatal Error:', redactSensitiveLogValue(error));
};

export const logWorkerPoolInitWorkerError = (error: unknown): void => {
  safeLog.error('Worker [initPool] error:', redactSensitiveLogValue(error));
};

export const logWorkerPoolInitializationFailure = (error: unknown): void => {
  safeLog.error('Failed to initialize worker pool:', redactSensitiveLogValue(error));
};

export const logWorkerPoolMalformedMessage = (): void => {
  safeLog.warn('[WorkerPool] Ignoring malformed worker message');
};

export const logWorkerPoolUnknownJobMessage = (): void => {
  safeLog.warn('[WorkerPool] Ignoring worker message for unknown job');
};

export const logWorkerPoolRuntimeError = (workerIndex: number, error: unknown): void => {
  safeLog.error(`Worker ${workerIndex} error:`, redactSensitiveLogValue(error));
};

export const logPathfindingWorkerStartupError = (
  workerIndex: number,
  error: { message?: unknown; filename?: unknown; lineno?: unknown }
): void => {
  safeLog.error(`[WorkerPool] Worker ${workerIndex} startup error:`, redactSensitiveLogValue(error));
};

export const logPathfindingWorkerCreateError = (workerIndex: number, error: unknown): void => {
  safeLog.error(`Failed to create worker ${workerIndex}:`, redactSensitiveLogValue(error));
};

export const logPathfindingWorkerBatchTimeout = (
  workerIndex: number,
  timeoutMs: number,
  jobCount: number
): void => {
  safeLog.warn(
    `[WorkerPool] Worker ${workerIndex} batch execution timed out after ${timeoutMs / 1000}s; falling back to serial routing for ${jobCount} job(s).`
  );
};

export const logPathfindingWorkerExecutionError = (error: unknown): void => {
  safeLog.error('[DEBUG-WORKER-POOL] Worker Execution Error:', redactSensitiveLogValue(error));
};

export const logPathfindingWorkerPostMessageError = (error: unknown): void => {
  safeLog.error('[WorkerPool] postMessage Error:', redactSensitiveLogValue(error));
};

export const logPathfindingWorkerTaskExecutionFailure = (edgeId: string, error: unknown): void => {
  safeLog.error(`[Worker] Task execution failed for edge ${edgeId}:`, redactSensitiveLogValue(error));
};

export const logPathfindingWorkerMissingMetadata = (edgeId: string): void => {
  safeLog.warn(`[Worker] Result for ${edgeId} missing metadata! Attaching default.`);
};

export const logPathfindingWorkerSerializationFailure = (error: unknown): void => {
  safeLog.error('[DEBUG-WORKER] Return serialization failed:', redactSensitiveLogValue(error));
};

export const logPathfindingWorkerPostingError = (error: unknown): void => {
  safeLog.error('[Worker] Posting ERROR:', redactSensitiveLogValue(error));
};

export const logPathfindingWorkerCriticalFailure = (error: unknown): void => {
  safeLog.error('[Worker] CRITICAL FAILURE:', redactSensitiveLogValue(error));
};

export const logElkLayoutWorkerFailure = (id: string, error: unknown): void => {
  safeLog.error(`[Worker] Layout failed for ${id}:`, redactSensitiveLogValue(error));
};

export const logAStarGridFailure = (error: unknown): void => {
  safeLog.error('[AStarPathfinder] Grid A* failed:', redactSensitiveLogValue(error));
};

export const logTrunkSuggestedPortInvariant = (details: unknown): void => {
  safeLog.error(
    '[TrunkCalculator] suggestedPort was never assigned for horizontal trunk!',
    redactSensitiveLogValue(details)
  );
};

export const logRoutingWorkerDebug = (message: string): void => {
  safeLog.debug(message);
};

export const logRoutingWorkerVisibilityGraphAbort = (): void => {
  safeLog.warn('[Worker] Visibility Graph path aborted: Cannot be orthogonalized safely. Falling back to Grid A*.');
};

export const logRoutingWorkerPathfindingFallback = (edgeId: string): void => {
  safeLog.warn(`[Worker] Pathfinding failed for ${edgeId}, falling back to simple path.`);
};

export const logGridBuilderMassiveGrid = (cols: number, rows: number, maxIndex: number): void => {
  safeLog.warn(`[GridBuilder] Grid massive: ${cols}x${rows} = ${maxIndex}. Memory impact high.`);
};

export const logPathfindingMassiveGrid = (cols: number, rows: number, maxIndex: number): void => {
  safeLog.warn(`[Pathfinding] Grid massive: ${cols}x${rows} = ${maxIndex}. Memory impact high.`);
};

export const logPathfindingWalkableEndpointFailure = (details: {
  start: { x: number; y: number };
  end: { x: number; y: number };
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  startIdx: number;
  endIdx: number;
  validStartIdx: number;
  validEndIdx: number;
  obstacleCount: number;
  cols: number;
  rows: number;
}): void => {
  safeLog.warn(
    `[A*] Failed to find walkable start/end. start=(${Math.round(details.start.x)},${Math.round(details.start.y)}) end=(${Math.round(details.end.x)},${Math.round(details.end.y)}) gridBounds=[${details.minX},${details.minY}]-[${details.maxX},${details.maxY}] startIdx=${details.startIdx} endIdx=${details.endIdx} validS=${details.validStartIdx} validE=${details.validEndIdx} obstacles=${details.obstacleCount} grid=${details.cols}x${details.rows}`
  );
};

export const logPathfindingIterationLimit = (maxIterations: number): void => {
  safeLog.warn(`[A*] Aborted: Exceeded max iterations (${maxIterations}). Falling back.`);
};

export const logPathfindingOpenSetExhausted = (details: {
  iterations: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
  cols: number;
  rows: number;
  obstacleCount: number;
}): void => {
  safeLog.warn(
    `[A*] openSet exhausted. iterations=${details.iterations} start=(${Math.round(details.start.x)},${Math.round(details.start.y)}) end=(${Math.round(details.end.x)},${Math.round(details.end.y)}) grid=${details.cols}x${details.rows} obstacles=${details.obstacleCount}`
  );
};

export const logPathfindingFallbackLShape = (details: {
  iterations: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
  cols: number;
  rows: number;
}): void => {
  safeLog.warn(
    `[A*] Fallback L-shape. iterations=${details.iterations} start=(${Math.round(details.start.x)},${Math.round(details.start.y)}) end=(${Math.round(details.end.x)},${Math.round(details.end.y)}) grid=${details.cols}x${details.rows}`
  );
};

export const logIncrementalVisibilityGraphObstacleExists = (id: string): void => {
  safeLog.warn(`[IncrementalVG] Obstacle ${id} already exists. Use updateObstacle instead.`);
};

export const logIncrementalVisibilityGraphObstacleMissing = (id: string): void => {
  safeLog.warn(`[IncrementalVG] Obstacle ${id} not found.`);
};

export const logIncrementalVisibilityGraphObstacleMissingAdd = (id: string): void => {
  safeLog.warn(`[IncrementalVG] Obstacle ${id} not found. Adding it.`);
};

export const logVisibilityGraphCachePrebuildDisabled = (): void => {
  safeLog.warn('[VGCache] Prebuild disabled in config');
};

export const logLPNudgeOptimizeFailure = (error: unknown): void => {
  safeLog.error('LPNudge optimize failed', redactSensitiveLogValue(error));
};
