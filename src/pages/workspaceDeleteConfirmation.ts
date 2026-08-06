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
}

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
    },
    onOk: async () => {
      try {
        const result = await options.deleteItem();
        if (result === 'invalid-id') {
          options.onInvalidId();
          return;
        }
        deletionCompleted = true;
        options.onSuccess();
        await options.reloadItems();
      } catch (error: unknown) {
        options.onFailure(error);
      }
    },
  };
};
