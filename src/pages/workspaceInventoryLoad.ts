export const WORKSPACE_INVENTORY_LOAD_TIMEOUT_MS = 8_000;

const MAX_WORKSPACE_INVENTORY_LOAD_TIMEOUT_MS = 60_000;

export type WorkspaceInventoryLoadFailureReason = 'timeout' | 'failed';

export type WorkspaceInventoryCompletedLoadResult<T> =
  | { kind: 'success'; value: T }
  | { kind: 'failure'; reason: 'failed'; error: unknown };

export type WorkspaceInventoryLoadResult<T> =
  | WorkspaceInventoryCompletedLoadResult<T>
  | {
      kind: 'failure';
      reason: 'timeout';
      completion: Promise<WorkspaceInventoryCompletedLoadResult<T>>;
    };

const normalizeTimeout = (timeoutMs: number): number => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return WORKSPACE_INVENTORY_LOAD_TIMEOUT_MS;
  }
  return Math.min(timeoutMs, MAX_WORKSPACE_INVENTORY_LOAD_TIMEOUT_MS);
};

export const loadWorkspaceInventoryWithDeadline = async <T>(
  load: () => Promise<T>,
  timeoutMs = WORKSPACE_INVENTORY_LOAD_TIMEOUT_MS,
): Promise<WorkspaceInventoryLoadResult<T>> => {
  const deadlineMs = normalizeTimeout(timeoutMs);
  const completion = Promise.resolve()
    .then(load)
    .then<WorkspaceInventoryCompletedLoadResult<T>, WorkspaceInventoryCompletedLoadResult<T>>(
      value => ({ kind: 'success', value }),
      (error: unknown) => ({ kind: 'failure', reason: 'failed', error }),
    );
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<WorkspaceInventoryLoadResult<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({ kind: 'failure', reason: 'timeout', completion });
    }, deadlineMs);
  });

  const result = await Promise.race([completion, timeout]);
  if (timeoutId !== undefined) clearTimeout(timeoutId);
  return result;
};
