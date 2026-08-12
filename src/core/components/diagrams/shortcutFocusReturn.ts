const FOCUSABLE_RETURN_TARGET = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

export const captureShortcutFocusOwner = (): HTMLElement | null => (
    typeof document !== 'undefined'
    && document.activeElement instanceof HTMLElement
    && document.activeElement !== document.body
        ? document.activeElement
        : null
);

const canRestoreShortcutFocus = (target: HTMLElement | null): target is HTMLElement => (
    target?.isConnected === true
    && target.matches(FOCUSABLE_RETURN_TARGET)
    && target.closest('[role="dialog"]') === null
);

export const restoreShortcutFocus = (previousOwner: HTMLElement | null): boolean => {
    const target = canRestoreShortcutFocus(previousOwner)
        ? previousOwner
        : document.querySelector<HTMLElement>('[data-command-palette-focus-return]');
    if (!target) return false;
    target.focus();
    return document.activeElement === target;
};

export const scheduleShortcutFocusRestore = (previousOwner: HTMLElement | null): void => {
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            restoreShortcutFocus(previousOwner);
        });
    });
};
