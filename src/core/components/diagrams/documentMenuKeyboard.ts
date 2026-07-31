export const DOCUMENT_MENU_OVERLAY_CLASS = 'vizly-document-actions-menu';

export const shouldOpenDocumentMenuFromKey = (key: string): boolean => (
    key === 'ArrowDown'
);

export const shouldCloseDocumentMenuFromKey = (key: string): boolean => (
    key === 'Escape'
);

export const focusFirstEnabledDocumentMenuItem = (root: ParentNode): boolean => {
    const items = root.querySelectorAll<HTMLElement>(
        `.${DOCUMENT_MENU_OVERLAY_CLASS} [role="menuitem"]`,
    );
    const firstEnabled = Array.from(items).find(item => (
        item.getAttribute('aria-disabled') !== 'true'
        && !item.hasAttribute('disabled')
    ));
    if (!firstEnabled) return false;
    firstEnabled.focus();
    return true;
};
