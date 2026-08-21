const COLLABORATION_FOCUS_RETURN_SELECTOR = '[data-collaboration-focus-return]';

const getFallbackTarget = (): HTMLElement | null => (
  typeof document === 'undefined'
    ? null
    : document.querySelector<HTMLElement>(COLLABORATION_FOCUS_RETURN_SELECTOR)
);

const isUsableTarget = (target: HTMLElement | null): target is HTMLElement => (
  target?.isConnected === true
  && target !== document.body
  && !(target instanceof HTMLButtonElement && target.disabled)
);

export const captureCollaborationModalFocus = (): HTMLElement | null => {
  if (typeof document === 'undefined') return null;

  const activeTarget = document.activeElement instanceof HTMLElement
    && document.activeElement !== document.body
    ? document.activeElement
    : null;

  if (activeTarget?.closest('[role="menu"]')) {
    return getFallbackTarget() ?? activeTarget;
  }

  return activeTarget ?? getFallbackTarget();
};

export const restoreCollaborationModalFocus = (
  capturedTarget: HTMLElement | null,
): boolean => {
  if (typeof document === 'undefined') return false;

  const target = isUsableTarget(capturedTarget)
    ? capturedTarget
    : getFallbackTarget();
  if (!isUsableTarget(target)) return false;

  target.focus();
  return document.activeElement === target;
};

export const scheduleCollaborationModalFocusRestore = (
  capturedTarget: HTMLElement | null,
): void => {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      restoreCollaborationModalFocus(capturedTarget);
    });
  });
};
