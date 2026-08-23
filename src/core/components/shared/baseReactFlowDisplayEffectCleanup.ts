export type BaseReactFlowDisplayEffectCleanupResolution =
  | 'completed-retained'
  | 'pending-cancelled';

/**
 * Closes one routing effect without rewriting an already completed atomic
 * transaction. Completed work keeps its deferred cache write and final trace;
 * pending work is aborted and reported exactly once.
 */
export const settleBaseReactFlowDisplayEffectCleanup = ({
  workerStarted,
  workerCompleted,
  abortPendingWork,
  cancelPendingCacheWrite,
  cancelGeometrySchedule,
  recordPendingWorkerCancellation,
  recordCancelledLifecycle,
}: {
  workerStarted: boolean;
  workerCompleted: boolean;
  abortPendingWork: () => void;
  cancelPendingCacheWrite?: () => void;
  cancelGeometrySchedule: () => void;
  recordPendingWorkerCancellation: () => void;
  recordCancelledLifecycle: () => void;
}): BaseReactFlowDisplayEffectCleanupResolution => {
  cancelGeometrySchedule();
  if (workerCompleted) return 'completed-retained';
  if (workerStarted) recordPendingWorkerCancellation();
  abortPendingWork();
  cancelPendingCacheWrite?.();
  recordCancelledLifecycle();
  return 'pending-cancelled';
};
