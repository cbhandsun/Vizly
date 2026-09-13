// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    useMobileFlowchartViewportGuard,
    useScheduledFlowchartFit,
} from '../useMobileFlowchartViewportGuard';
import { useFlowchartViewportPersistenceKey } from '../useFlowchartViewportPersistenceKey';
import { createFlowchartViewportPersistenceKey } from '../../flowchartResponsiveChrome';
import flowchartDesignerViewSource from '../../FlowchartDesignerView.tsx?raw';
import advancedFlowchartCanvasShellSource from '../../AdvancedFlowchartCanvasShell.tsx?raw';

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

    it('separates persisted desktop and mobile viewports for the same diagram page', () => {
        expect(createFlowchartViewportPersistenceKey({
            diagramId: 'diagram-a',
            pageId: 'page-1',
            isMobile: false,
        })).toBe('diagram-a:page-1:desktop');

        expect(createFlowchartViewportPersistenceKey({
            diagramId: 'diagram-a',
            pageId: 'page-1',
            isMobile: true,
        })).toBe('diagram-a:page-1:mobile');
    });

    it('memoizes the responsive viewport persistence scope for the active page', () => {
        const { result, rerender } = renderHook(
            ({ isMobile }) => useFlowchartViewportPersistenceKey({
                diagramId: 'diagram-a',
                pageId: 'page-1',
                isMobile,
            }),
            { initialProps: { isMobile: false } },
        );

        expect(result.current).toBe('diagram-a:page-1:desktop');
        rerender({ isMobile: true });
        expect(result.current).toBe('diagram-a:page-1:mobile');
    });

    it('wires mobile viewport isolation to the canvas fit policy', () => {
        expect(flowchartDesignerViewSource).toContain('isMobile={isMobile}');
        expect(advancedFlowchartCanvasShellSource).toContain(
            "fitMode={isMobile ? 'fitWidthTop' : 'restoreOrFitAll'}",
        );
    });
});
