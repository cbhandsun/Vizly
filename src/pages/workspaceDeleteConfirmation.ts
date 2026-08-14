import type { ModalFuncProps } from 'antd/es/modal/interface';

import { focusWorkspaceTarget } from './workspaceMenuInteraction';

const WORKSPACE_DELETE_TARGET_MAX_LENGTH = 80;

const isUnsafeWorkspaceTitleCharacter = (character: string): boolean => {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return true;
  return codePoint <= 0x1f
    || (codePoint >= 0x7f && codePoint <= 0x9f)
    || (codePoint >= 0x200b && codePoint <= 0x200f)
    || (codePoint >= 0x202a && codePoint <= 0x202e)
    || codePoint === 0x2060
    || (codePoint >= 0x2066 && codePoint <= 0x2069)
    || codePoint === 0xfeff;
};

const normalizeWorkspaceDeleteTargetName = (value: string): string => Array
  .from(value, character => (isUnsafeWorkspaceTitleCharacter(character) ? ' ' : character))
  .join('')
  .replace(/\s+/gu, ' ')
  .trim();

const truncateWorkspaceDeleteTargetName = (value: string): string => {
  const characters = Array.from(value);
  if (characters.length <= WORKSPACE_DELETE_TARGET_MAX_LENGTH) return value;
  return `${characters.slice(0, WORKSPACE_DELETE_TARGET_MAX_LENGTH - 1).join('')}…`;
};

export const coerceWorkspaceDeleteTargetName = (
  value: unknown,
  fallback: string,
): string => {
  const safeFallback = truncateWorkspaceDeleteTargetName(
    normalizeWorkspaceDeleteTargetName(fallback) || 'Untitled diagram',
  );
  if (typeof value !== 'string') return safeFallback;

  const normalizedValue = normalizeWorkspaceDeleteTargetName(value);
  return normalizedValue
    ? truncateWorkspaceDeleteTargetName(normalizedValue)
    : safeFallback;
};

export interface WorkspaceDeleteConfirmationOptions {
  title: string;
  description: string;
  deleteLabel: string;
  cancelLabel: string;
  returnFocusTarget: HTMLElement | null;
  fallbackFocusTarget: HTMLElement | null;
  deleteItem: () => Promise<'deleted' | 'invalid-id'>;
  reloadItems: () => Promise<void>;
  onInvalidId: () => void;
  onSuccess: () => void;
  onFailure: (error: unknown) => void;
  onRefreshFailure: (error: unknown) => void;
  onAfterClose?: () => void;
}

export interface WorkspaceDeleteDialogLock {
  active: boolean;
}

export const beginWorkspaceDeleteDialog = (lock: WorkspaceDeleteDialogLock): boolean => {
  if (lock.active) return false;
  lock.active = true;
  return true;
};

export const finishWorkspaceDeleteDialog = (lock: WorkspaceDeleteDialogLock): boolean => {
  if (!lock.active) return false;
  lock.active = false;
  return true;
};

export const createWorkspaceDeleteConfirmation = (
  options: WorkspaceDeleteConfirmationOptions,
): ModalFuncProps => {
  let deletionCompleted = false;

  return {
    title: options.title,
    content: options.description,
    okText: options.deleteLabel,
    okType: 'danger',
    cancelText: options.cancelLabel,
    focusable: {
      autoFocusButton: 'cancel',
      focusTriggerAfterClose: false,
    },
    afterClose: () => {
      focusWorkspaceTarget(
        deletionCompleted ? null : options.returnFocusTarget,
        options.fallbackFocusTarget,
      );
      options.onAfterClose?.();
    },
    onOk: async () => {
      let result: 'deleted' | 'invalid-id';
      try {
        result = await options.deleteItem();
      } catch (error: unknown) {
        options.onFailure(error);
        throw error;
      }

      if (result === 'invalid-id') {
        options.onInvalidId();
        return;
      }

      deletionCompleted = true;
      options.onSuccess();
      try {
        await options.reloadItems();
      } catch (error: unknown) {
        options.onRefreshFailure(error);
      }
    },
  };
};
