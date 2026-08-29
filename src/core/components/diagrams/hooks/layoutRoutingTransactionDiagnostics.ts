import {
  classifyDisplayLayoutTransactionError,
  updateDisplayLayoutTransactionState,
  type DisplayLayoutTransactionErrorCode,
  type DisplayLayoutTransactionStatus,
} from '../../shared/baseReactFlowDisplayRoutingDebug';

/** Keeps attempt-level details out of the layout strategy composition hook. */
export const createLayoutRoutingTransactionDiagnostics = (jobId: number) => {
  let attemptCount = 0;
  const update = (
    status: DisplayLayoutTransactionStatus,
    errorCode?: DisplayLayoutTransactionErrorCode,
  ): void => updateDisplayLayoutTransactionState({
    jobId,
    status,
    attemptCount,
    errorCode,
  });

  update('running');
  return {
    beginAttempt(): void {
      attemptCount += 1;
      update('running');
    },
    committed(): void {
      update('committed');
    },
    failed(error: unknown): void {
      update('failed', classifyDisplayLayoutTransactionError(error));
    },
    noLayoutableNodes(): void {
      update('failed', 'no-layoutable-nodes');
    },
  };
};
