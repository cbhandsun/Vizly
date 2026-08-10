const EMPTY_STATE_ACTION_SELECTOR = '.flowchart-empty-action';

export const focusFlowchartEmptyStateAction = (
    root: ParentNode,
): boolean => {
    const action = root.querySelector<HTMLButtonElement>(EMPTY_STATE_ACTION_SELECTOR);
    if (!action || action.disabled || action.getAttribute('aria-disabled') === 'true') {
        return false;
    }
    action.focus({ preventScroll: true });
    return action.ownerDocument.activeElement === action;
};

/**
 * React renders the empty-state action after the final node is removed. Try on
 * the next paint, then once more if the first frame preceded that commit.
 */
export const scheduleFlowchartEmptyStateFocus = (
    root?: ParentNode,
): { cancel: () => void } | null => {
    if (typeof window === 'undefined' || (!root && typeof document === 'undefined')) {
        return null;
    }
    const resolvedRoot = root ?? document;
    let active = true;
    let frameId = 0;
    const focus = () => {
        if (!active) return;
        if (focusFlowchartEmptyStateAction(resolvedRoot)) {
            active = false;
            return;
        }
        frameId = window.requestAnimationFrame(() => {
            if (!active) return;
            focusFlowchartEmptyStateAction(resolvedRoot);
            active = false;
        });
    };
    frameId = window.requestAnimationFrame(focus);
    return {
        cancel: () => {
            if (!active) return;
            active = false;
            window.cancelAnimationFrame(frameId);
        },
    };
};
