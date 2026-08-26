import { safeLog } from './consoleCleanup';
import { redactSensitiveLogValue } from './logSecurity';

export const logEdgeRouterFatalError = (error: unknown): void => {
  safeLog.error('[EdgeRouter] Fatal Error:', redactSensitiveLogValue(error));
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
