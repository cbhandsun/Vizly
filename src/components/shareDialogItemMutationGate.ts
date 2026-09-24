export type ShareDialogItemMutation = 'revoke-share' | 'remove-collaborator';

export interface ShareDialogItemMutationToken {
  readonly generation: number;
  readonly key: string;
  readonly operation: ShareDialogItemMutation;
  readonly targetId: string;
}

export interface ShareDialogItemMutationGate {
  begin: (
    operation: ShareDialogItemMutation,
    targetId: string,
  ) => ShareDialogItemMutationToken | null;
  finish: (token: ShareDialogItemMutationToken) => boolean;
  invalidate: () => void;
  isCurrent: (token: ShareDialogItemMutationToken) => boolean;
}

const getMutationKey = (operation: ShareDialogItemMutation, targetId: string) => (
  `${operation}:${targetId}`
);

/**
 * Coalesces duplicate item mutations while allowing unrelated list items to proceed.
 * Invalidating the gate makes every older async continuation harmless.
 */
export function createShareDialogItemMutationGate(): ShareDialogItemMutationGate {
  let generation = 0;
  const activeTokens = new Map<string, ShareDialogItemMutationToken>();

  const isCurrent = (token: ShareDialogItemMutationToken): boolean => (
    token.generation === generation && activeTokens.get(token.key) === token
  );

  return {
    begin(operation, targetId) {
      const key = getMutationKey(operation, targetId);
      if (activeTokens.has(key)) return null;
      const token = { generation, key, operation, targetId };
      activeTokens.set(key, token);
      return token;
    },
    finish(token) {
      if (!isCurrent(token)) return false;
      activeTokens.delete(token.key);
      return true;
    },
    invalidate() {
      generation += 1;
      activeTokens.clear();
    },
    isCurrent,
  };
}
