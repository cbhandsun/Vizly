import { describe, expect, it, vi } from 'vitest';

import {
    EDGE_ROUTING_BATCH_DELAY_MS,
    EdgeRoutingScheduler,
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

describe('EdgeRoutingScheduler', () => {
    it('owns freeze and drag timing without leaking timer handles', () => {
        const clearTimer = vi.fn();
        const trigger = vi.fn();
        const scheduled: Array<{ callback: () => void; delay: number }> = [];
        const scheduler = new EdgeRoutingScheduler(
            trigger,
            clearTimer,
            (callback, delay) => {
                scheduled.push({ callback, delay });
                return `timer-${scheduled.length}`;
            },
        );

        scheduler.setDragging(true);
        expect(scheduler.schedule()).toBe(true);
        expect(scheduled[0].delay).toBe(EDGE_ROUTING_BATCH_DELAY_MS.dragging);

        scheduler.freeze();
        expect(clearTimer).toHaveBeenCalledWith('timer-1');
        expect(scheduler.schedule()).toBe(false);
        expect(scheduler.unfreeze()).toBe(true);
        expect(scheduler.unfreeze()).toBe(false);

        scheduler.setDragging(false);
        scheduler.schedule();
        expect(scheduled[1].delay).toBe(EDGE_ROUTING_BATCH_DELAY_MS.idle);
        scheduled[1].callback();
        expect(trigger).toHaveBeenCalledOnce();
    });

    it('supports immediate scheduling and cancellation', () => {
        const clearTimer = vi.fn();
        const trigger = vi.fn();
        let callback: (() => void) | undefined;
        const scheduler = new EdgeRoutingScheduler(
            trigger,
            clearTimer,
            (next, delay) => {
                expect(delay).toBe(0);
                callback = next;
                return 'immediate';
            },
        );

        expect(scheduler.scheduleImmediate()).toBe(true);
        callback?.();
        expect(trigger).toHaveBeenCalledOnce();
        scheduler.cancel();
        expect(clearTimer).not.toHaveBeenCalled();
    });
});
