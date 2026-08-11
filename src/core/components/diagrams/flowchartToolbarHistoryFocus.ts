export type FlowchartToolbarHistoryAction = 'undo' | 'redo';

export interface FlowchartToolbarHistoryFocusTargets {
    undo: HTMLButtonElement | null;
    redo: HTMLButtonElement | null;
    history: HTMLButtonElement | null;
}

interface HistoryFocusScheduler {
    cancel: () => void;
}

const isFocusableButton = (
    button: HTMLButtonElement | null,
): button is HTMLButtonElement => Boolean(button?.isConnected && !button.disabled);

export const resolveFlowchartToolbarHistoryFocusTarget = (
    action: FlowchartToolbarHistoryAction,
    targets: FlowchartToolbarHistoryFocusTargets,
): HTMLButtonElement | null => {
    const primary = action === 'undo' ? targets.undo : targets.redo;
    const opposite = action === 'undo' ? targets.redo : targets.undo;

    if (isFocusableButton(primary)) return primary;
    if (isFocusableButton(opposite)) return opposite;
    if (isFocusableButton(targets.history)) return targets.history;
    return null;
};

export const scheduleFlowchartToolbarHistoryFocus = (
    action: FlowchartToolbarHistoryAction,
    origin: HTMLButtonElement | null,
    getTargets: () => FlowchartToolbarHistoryFocusTargets,
): HistoryFocusScheduler | null => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;

    let active = true;
    let frameId: number | null = null;
    const cancel = () => {
        if (!active) return;
        active = false;
        if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
    const focus = () => {
        if (!active) return;
        const activeElement = document.activeElement;
        const focusStillOwned = activeElement === origin || activeElement === document.body;
        const target = focusStillOwned
            ? resolveFlowchartToolbarHistoryFocusTarget(action, getTargets())
            : null;
        active = false;
        frameId = null;
        target?.focus({ preventScroll: true });
    };

    frameId = window.requestAnimationFrame(() => {
        if (!active) return;
        frameId = window.requestAnimationFrame(focus);
    });

    return { cancel };
};
