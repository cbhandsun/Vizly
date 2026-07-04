import { safeLog } from '../../../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../../../utils/logSecurity';

export const logSmartPathWorkerMissingNode = (details: {
  edgeId: string;
  source: string;
  target: string;
  mapSize: number;
}): void => {
  safeLog.warn(
    `[SmartWorker:${details.edgeId}] Node not found in simpleNodeMap - retrying next frame.`,
    { mapSize: details.mapSize }
  );
};

export const logSmartPathWorkerEmptyResult = (edgeId: string, error: unknown): void => {
  safeLog.warn(
    `[SmartWorker:${edgeId}] Worker returned error or empty path:`,
    redactSensitiveLogValue(error ?? 'Empty path')
  );
};

export const logSmartPathWorkerFallback = (edgeId: string, reason: unknown): void => {
  safeLog.warn(
    `[SmartWorker:${edgeId}] Using fallback path.`,
    redactSensitiveLogValue({
      reasonType: reason instanceof Error
        ? 'error'
        : typeof reason === 'string'
          ? 'message'
          : typeof reason,
    })
  );
};

export const logSmartPathWorkerFailure = (edgeId: string, error: unknown): void => {
  safeLog.error(`[useSmartPathWorker] Worker failed for ${edgeId}:`, redactSensitiveLogValue(error));
};
