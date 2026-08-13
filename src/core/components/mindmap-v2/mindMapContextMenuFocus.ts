const TEMPORARY_TAB_INDEX = '-1';

export function restoreMindMapContextMenuFocus(
    trigger: HTMLElement | null,
    fallback: HTMLElement | null,
): boolean {
    const target = trigger?.isConnected
        ? trigger
        : fallback?.isConnected
            ? fallback
            : null;
    if (!target) return false;

    const previousTabIndex = target.getAttribute('tabindex');
    if (previousTabIndex === null) target.setAttribute('tabindex', TEMPORARY_TAB_INDEX);
    target.focus({ preventScroll: true });
    if (previousTabIndex === null) {
        target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
    }
    return document.activeElement === target;
}
