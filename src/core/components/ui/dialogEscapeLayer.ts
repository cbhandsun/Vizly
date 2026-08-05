const DIALOG_ESCAPE_LAYER_SELECTOR = [
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[role="menu"]',
    '[role="listbox"]',
].join(',');

export const shouldPreserveParentDialogOnEscape = (
    eventTarget: EventTarget | null,
    parentDialog?: HTMLElement | null,
): boolean => {
    if (!(eventTarget instanceof Element)) return false;

    if (eventTarget.closest('[data-preserve-dialog-on-escape="true"]')) {
        return true;
    }

    const activeEscapeLayer = eventTarget.closest<HTMLElement>(DIALOG_ESCAPE_LAYER_SELECTOR);
    return Boolean(activeEscapeLayer && activeEscapeLayer !== parentDialog);
};
