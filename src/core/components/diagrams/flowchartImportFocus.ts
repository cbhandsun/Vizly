export const FLOWCHART_IMPORT_FOCUS_RETURN_SELECTOR = '[data-flowchart-import-focus-return="true"]';

export const focusFlowchartImportTrigger = (root: ParentNode = document): boolean => {
    const trigger = root.querySelector<HTMLButtonElement>(FLOWCHART_IMPORT_FOCUS_RETURN_SELECTOR);
    if (!trigger?.isConnected || trigger.disabled) return false;

    trigger.focus();
    return document.activeElement === trigger;
};
