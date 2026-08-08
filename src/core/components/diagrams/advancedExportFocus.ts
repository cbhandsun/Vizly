export const ADVANCED_EXPORT_FOCUS_RETURN_SELECTOR = '[data-advanced-export-focus-return="true"]';

export const focusAdvancedExportTrigger = (root: ParentNode = document): boolean => {
    const trigger = root.querySelector<HTMLButtonElement>(ADVANCED_EXPORT_FOCUS_RETURN_SELECTOR);
    if (!trigger?.isConnected || trigger.disabled) return false;

    trigger.focus();
    return document.activeElement === trigger;
};
