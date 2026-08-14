const ESCAPE_OWNING_SURFACE_SELECTOR = [
    'input',
    'textarea',
    'select',
    '[contenteditable]:not([contenteditable="false"])',
    '[role="dialog"]',
    '[role="menu"]',
    '[role="listbox"]',
    '[data-preserve-dialog-on-escape="true"]',
].join(',');

interface MindMapFocusEscapeCandidate {
    key: string;
    target: EventTarget | null;
    defaultPrevented: boolean;
}

/**
 * Focus mode is a page-level state, so Escape may close it only after nested
 * editing and transient surfaces have had an opportunity to consume the key.
 */
export function shouldExitMindMapFocusOnEscape({
    key,
    target,
    defaultPrevented,
}: MindMapFocusEscapeCandidate): boolean {
    if (key !== 'Escape' || defaultPrevented) return false;
    if (!(target instanceof Element)) return true;
    return target.closest(ESCAPE_OWNING_SURFACE_SELECTOR) === null;
}
