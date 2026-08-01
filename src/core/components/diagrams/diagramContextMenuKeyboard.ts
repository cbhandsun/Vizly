const ENABLED_MENU_ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

export const focusFirstEnabledDiagramContextMenuItem = (root: ParentNode | null): boolean => {
    if (!root) return false;
    const firstItem = root.querySelector<HTMLElement>(ENABLED_MENU_ITEM_SELECTOR);
    if (!firstItem) return false;
    firstItem.focus();
    return document.activeElement === firstItem;
};

export const shouldCloseDiagramContextMenuFromKey = (key: string): boolean => key === 'Escape';
