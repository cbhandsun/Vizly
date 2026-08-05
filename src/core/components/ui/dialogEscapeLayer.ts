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

    const preservedLayer = eventTarget.closest<HTMLElement>('[data-preserve-dialog-on-escape="true"]');
    if (preservedLayer && preservedLayer !== parentDialog) {
        return true;
    }

    const activeEscapeLayer = eventTarget.closest<HTMLElement>(DIALOG_ESCAPE_LAYER_SELECTOR);
    return Boolean(activeEscapeLayer && activeEscapeLayer !== parentDialog);
};
