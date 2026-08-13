export type ShareDialogOperation = 'create-link' | 'invite';

export interface ShareDialogOperationToken {
  readonly generation: number;
  readonly operation: ShareDialogOperation;
}

export interface ShareDialogOperationGate {
  begin: (operation: ShareDialogOperation) => ShareDialogOperationToken | null;
  isCurrent: (token: ShareDialogOperationToken) => boolean;
  finish: (token: ShareDialogOperationToken) => boolean;
  invalidate: () => void;
}

/**
 * Serializes share mutations and invalidates stale continuations when the dialog closes.
 * The token deliberately carries no user content so it is safe to retain in memory.
 */
export function createShareDialogOperationGate(): ShareDialogOperationGate {
  let generation = 0;
  let activeOperation: ShareDialogOperation | null = null;

  const isCurrent = (token: ShareDialogOperationToken): boolean => (
    token.generation === generation && token.operation === activeOperation
  );

  return {
    begin(operation) {
      if (activeOperation) return null;
      activeOperation = operation;
      return { generation, operation };
    },
    isCurrent,
    finish(token) {
      if (!isCurrent(token)) return false;
      activeOperation = null;
      return true;
    },
    invalidate() {
      generation += 1;
      activeOperation = null;
    },
  };
}
