import { describe, expect, it, vi } from 'vitest';

import {
    EDGE_ROUTING_BATCH_DELAY_MS,
    resolveEdgeRoutingBatchDelay,
    scheduleEdgeRoutingBatch,
} from '../edgeRoutingScheduling';

describe('edgeRoutingScheduling', () => {
    it('uses a longer debounce while dragging', () => {
        expect(resolveEdgeRoutingBatchDelay(false)).toBe(EDGE_ROUTING_BATCH_DELAY_MS.idle);
        expect(resolveEdgeRoutingBatchDelay(true)).toBe(EDGE_ROUTING_BATCH_DELAY_MS.dragging);
    });

    it('does not schedule while frozen', () => {
        const scheduleTimer = vi.fn();

        const scheduled = scheduleEdgeRoutingBatch({
            isFrozen: true,
            isDragging: false,
            pendingTimeout: null,
            clearTimer: vi.fn(),
            scheduleTimer,
            setPendingTimeout: vi.fn(),
            triggerBatchRouting: vi.fn(),
        });

        expect(scheduled).toBe(false);
        expect(scheduleTimer).not.toHaveBeenCalled();
    });

    it('clears an existing timeout and schedules a new batch trigger', () => {
        const clearTimer = vi.fn();
        const setPendingTimeout = vi.fn();
        const triggerBatchRouting = vi.fn();
        let scheduledCallback: (() => void) | null = null;

        const scheduled = scheduleEdgeRoutingBatch({
            isFrozen: false,
            isDragging: true,
            pendingTimeout: 'old-handle',
            clearTimer,
            scheduleTimer: (callback, delayMs) => {
                scheduledCallback = callback;
                expect(delayMs).toBe(EDGE_ROUTING_BATCH_DELAY_MS.dragging);
                return 'new-handle';
            },
            setPendingTimeout,
            triggerBatchRouting,
        });

        expect(scheduled).toBe(true);
        expect(clearTimer).toHaveBeenCalledWith('old-handle');
        expect(setPendingTimeout).toHaveBeenCalledWith('new-handle');

        scheduledCallback?.();
        expect(setPendingTimeout).toHaveBeenLastCalledWith(null);
        expect(triggerBatchRouting).toHaveBeenCalledOnce();
    });
});
