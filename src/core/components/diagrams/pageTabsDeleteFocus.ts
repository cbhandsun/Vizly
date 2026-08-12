export interface PageTabsDeleteFocusRequest {
    cancel: () => void;
}

interface SchedulePageTabsDeleteFocusOptions {
    dialog: HTMLElement | null;
    observerRoot: Node;
    resolvePrimaryTarget: () => HTMLElement | null;
    resolveFallbackTarget: () => HTMLElement | null;
}

/**
 * Restores focus only after Ant Design has actually removed the confirmation
 * popup. This avoids the popup teardown moving focus back to document.body
 * after an earlier requestAnimationFrame focus attempt.
 */
export const schedulePageTabsDeleteFocus = ({
    dialog,
    observerRoot,
    resolvePrimaryTarget,
    resolveFallbackTarget,
}: SchedulePageTabsDeleteFocusOptions): PageTabsDeleteFocusRequest | null => {
    const ownerDocument = dialog?.ownerDocument
        ?? (observerRoot instanceof Document ? observerRoot : observerRoot.ownerDocument);
    const ownerWindow = ownerDocument?.defaultView;
    if (!ownerDocument || !ownerWindow) return null;

    let active = true;
    let frameId: number | null = null;
    let observer: MutationObserver | null = null;
    let waitedForPrimaryTarget = false;

    const cancel = () => {
        if (!active) return;
        active = false;
        observer?.disconnect();
        observer = null;
        if (frameId !== null) ownerWindow.cancelAnimationFrame(frameId);
        frameId = null;
    };

    const focusTarget = () => {
        frameId = null;
        if (!active) return;
        const primaryTarget = resolvePrimaryTarget();
        if (!primaryTarget?.isConnected && !waitedForPrimaryTarget) {
            waitedForPrimaryTarget = true;
            frameId = ownerWindow.requestAnimationFrame(focusTarget);
            return;
        }
        const target = primaryTarget?.isConnected ? primaryTarget : resolveFallbackTarget();
        if (target?.isConnected) target.focus({ preventScroll: true });
        cancel();
    };

    const scheduleFocus = () => {
        observer?.disconnect();
        observer = null;
        if (!active || frameId !== null) return;
        frameId = ownerWindow.requestAnimationFrame(focusTarget);
    };

    if (!dialog?.isConnected) {
        scheduleFocus();
        return { cancel };
    }

    observer = new ownerWindow.MutationObserver(() => {
        if (!dialog.isConnected) scheduleFocus();
    });
    observer.observe(observerRoot, { childList: true, subtree: true });
    if (!dialog.isConnected) scheduleFocus();

    return { cancel };
};
