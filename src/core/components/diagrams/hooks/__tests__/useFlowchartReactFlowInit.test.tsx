// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { ReactFlowInstance } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
    dispatch: vi.fn(),
    schedule: vi.fn(),
}));

vi.mock('../../../shared/diagramControl', () => ({
    dispatchDiagramControl: harness.dispatch,
}));
vi.mock('../../flowchartInitialFit', () => ({
    scheduleFlowchartInitialFit: harness.schedule,
}));

import { useFlowchartReactFlowInit } from '../useFlowchartReactFlowInit';

describe('useFlowchartReactFlowInit', () => {
    it('stores the instance and schedules a diagram-scoped initial fit', () => {
        const setReactFlowInstance = vi.fn();
        const instance = {} as ReactFlowInstance;
        const hook = renderHook(() => useFlowchartReactFlowInit({
            diagramId: 'diagram-a',
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
});
