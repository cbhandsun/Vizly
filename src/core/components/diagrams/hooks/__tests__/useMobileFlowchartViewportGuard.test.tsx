// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    useMobileFlowchartViewportGuard,
    useScheduledFlowchartFit,
} from '../useMobileFlowchartViewportGuard';

describe('mobile flowchart viewport guard', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('fits existing nodes after entering mobile layout', () => {
        vi.useFakeTimers();
        const fitView = vi.fn();
        const getNodes = () => [{ id: 'node-1', position: { x: 0, y: 0 }, data: {} }];
        const { rerender } = renderHook(
            ({ isMobile }) => useMobileFlowchartViewportGuard({
                isMobile,
                getNodes,
                fitView,
            }),
            { initialProps: { isMobile: false } },
        );

        rerender({ isMobile: true });
        act(() => vi.runAllTimers());

        expect(fitView).toHaveBeenCalledTimes(1);
    });

    it('provides a stable delayed fit callback for import completion', () => {
        vi.useFakeTimers();
        const fitView = vi.fn();
        const { result } = renderHook(() => useScheduledFlowchartFit(fitView, 300));

        act(() => {
            result.current();
            vi.advanceTimersByTime(299);
        });
        expect(fitView).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(1));
        expect(fitView).toHaveBeenCalledTimes(1);
    });
});
