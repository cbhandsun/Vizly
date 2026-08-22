export const WORKSPACE_INVENTORY_LOAD_TIMEOUT_MS = 8_000;

const MAX_WORKSPACE_INVENTORY_LOAD_TIMEOUT_MS = 60_000;

export type WorkspaceInventoryLoadFailureReason = 'timeout' | 'failed';

export type WorkspaceInventoryLoadResult<T> =
  | { kind: 'success'; value: T }
  | { kind: 'failure'; reason: WorkspaceInventoryLoadFailureReason; error?: unknown };

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

  return await new Promise<WorkspaceInventoryLoadResult<T>>((resolve) => {
    let settled = false;
    const settle = (result: WorkspaceInventoryLoadResult<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(result);
    };
    const timeoutId = setTimeout(() => {
      settle({ kind: 'failure', reason: 'timeout' });
    }, deadlineMs);

    Promise.resolve()
      .then(load)
      .then(
        value => settle({ kind: 'success', value }),
        (error: unknown) => settle({ kind: 'failure', reason: 'failed', error }),
      );
  });
};
