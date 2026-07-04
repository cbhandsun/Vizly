export const EDGE_ROUTING_BATCH_DELAY_MS = {
    idle: 16,
    dragging: 60,
} as const;

export const resolveEdgeRoutingBatchDelay = (isDragging: boolean): number => (
    isDragging ? EDGE_ROUTING_BATCH_DELAY_MS.dragging : EDGE_ROUTING_BATCH_DELAY_MS.idle
);

export const scheduleEdgeRoutingBatch = ({
    isFrozen,
    isDragging,
    pendingTimeout,
    clearTimer,
    scheduleTimer,
    setPendingTimeout,
    triggerBatchRouting,
}: {
    isFrozen: boolean;
    isDragging: boolean;
    pendingTimeout: unknown;
    clearTimer: (handle: unknown) => void;
    scheduleTimer: (callback: () => void, delayMs: number) => unknown;
    setPendingTimeout: (handle: unknown) => void;
    triggerBatchRouting: () => void;
}): boolean => {
    if (isFrozen) {
        return false;
    }

    if (pendingTimeout) {
        clearTimer(pendingTimeout);
    }

    const nextHandle = scheduleTimer(() => {
        setPendingTimeout(null);
        triggerBatchRouting();
    }, resolveEdgeRoutingBatchDelay(isDragging));

    setPendingTimeout(nextHandle);
    return true;
};
