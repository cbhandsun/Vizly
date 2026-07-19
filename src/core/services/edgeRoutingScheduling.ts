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

type ClearRoutingTimer = (handle: unknown) => void;
type ScheduleRoutingTimer = (callback: () => void, delayMs: number) => unknown;

/** Owns debounce/freeze/drag timing state for the routing coordinator. */
export class EdgeRoutingScheduler {
    private pendingTimeout: unknown = null;
    private isDragging = false;
    private isFrozen = false;

    public constructor(
        private readonly triggerBatchRouting: () => void,
        private readonly clearTimer: ClearRoutingTimer = handle =>
            clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
        private readonly scheduleTimer: ScheduleRoutingTimer = (callback, delayMs) =>
            setTimeout(callback, delayMs),
    ) {}

    public freeze(): void {
        this.isFrozen = true;
        this.cancel();
    }

    public unfreeze(): boolean {
        if (!this.isFrozen) return false;
        this.isFrozen = false;
        return true;
    }

    public setDragging(dragging: boolean): boolean {
        this.isDragging = dragging;
        return !dragging;
    }

    public schedule(): boolean {
        return scheduleEdgeRoutingBatch({
            isFrozen: this.isFrozen,
            isDragging: this.isDragging,
            pendingTimeout: this.pendingTimeout,
            clearTimer: this.clearTimer,
            scheduleTimer: this.scheduleTimer,
            setPendingTimeout: handle => {
                this.pendingTimeout = handle;
            },
            triggerBatchRouting: this.triggerBatchRouting,
        });
    }

    public scheduleImmediate(): boolean {
        if (this.isFrozen) return false;
        this.cancel();
        this.pendingTimeout = this.scheduleTimer(() => {
            this.pendingTimeout = null;
            this.triggerBatchRouting();
        }, 0);
        return true;
    }

    public cancel(): void {
        if (this.pendingTimeout) this.clearTimer(this.pendingTimeout);
        this.pendingTimeout = null;
    }
}
