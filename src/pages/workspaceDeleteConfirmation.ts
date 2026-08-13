import type { ModalFuncProps } from 'antd/es/modal/interface';

import { focusWorkspaceTarget } from './workspaceMenuInteraction';

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
