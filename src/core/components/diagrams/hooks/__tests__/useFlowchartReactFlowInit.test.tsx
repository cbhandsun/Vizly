// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { ReactFlowInstance } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
    dispatch: vi.fn(),
    schedule: vi.fn(),
    getLastViewport: vi.fn(),
}));

vi.mock('../../../shared/diagramControl', () => ({
    dispatchDiagramControl: harness.dispatch,
}));
vi.mock('../../flowchartInitialFit', () => ({
    scheduleFlowchartInitialFit: harness.schedule,
}));
vi.mock('../../../shared/viewportStore', () => ({
    getLastViewport: harness.getLastViewport,
}));

import { useFlowchartReactFlowInit } from '../useFlowchartReactFlowInit';

describe('useFlowchartReactFlowInit', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stores the instance and schedules a diagram-scoped initial fit', () => {
        const setReactFlowInstance = vi.fn();
        const instance = {} as ReactFlowInstance;
        const hook = renderHook(() => useFlowchartReactFlowInit({
            diagramId: 'diagram-a',
            viewportPersistenceKey: 'diagram-a:page-1',
            setReactFlowInstance,
        }));

        act(() => hook.result.current(instance));

        expect(setReactFlowInstance).toHaveBeenCalledWith(instance);
        expect(harness.schedule).toHaveBeenCalledWith({
            reactFlowInstance: instance,
            dispatchFit: expect.any(Function),
        });
        const request = harness.schedule.mock.calls[0]?.[0] as { dispatchFit: () => void };
        request.dispatchFit();
        expect(harness.dispatch).toHaveBeenCalledWith('fit', 'diagram-a');
    });

    it('does not schedule an initial fit when a scoped viewport can be restored', () => {
        harness.getLastViewport.mockReturnValue({ x: -20, y: 12, zoom: 1 });
        const setReactFlowInstance = vi.fn();
        const instance = {} as ReactFlowInstance;
        const hook = renderHook(() => useFlowchartReactFlowInit({
            diagramId: 'diagram-a',
            viewportPersistenceKey: 'diagram-a:page-1',
            setReactFlowInstance,
        }));

        act(() => hook.result.current(instance));

        expect(setReactFlowInstance).toHaveBeenCalledWith(instance);
        expect(harness.schedule).not.toHaveBeenCalled();
    });
});
