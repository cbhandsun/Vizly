// @vitest-environment jsdom
import type React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    autoPathSelection: true,
    handleStrategyLayout: vi.fn(),
    syncAutoPathSelection: vi.fn(),
    applyRoutingProfile: vi.fn(),
}));

vi.mock('@/core/config/DiagramConfig', () => ({
    diagramConfigManager: {
        getConfig: () => ({ edge: { autoPathSelection: mocks.autoPathSelection } }),
    },
}));

vi.mock('../useLayoutStrategy', () => ({
    useLayoutStrategy: () => ({
        handleStrategyLayout: mocks.handleStrategyLayout,
        lastDomainStrategy: 'domain-dagre',
        lastDomainDirection: 'TB',
        lastNodeLayout: 'dagre',
    }),
}));

vi.mock('../useSmartRoutingConfig', () => ({
    syncAutoPathSelection: mocks.syncAutoPathSelection,
    applyRoutingProfile: mocks.applyRoutingProfile,
    DESIGNER_ROUTING_PROFILE: vi.fn(),
}));

import { useAutoRouting } from '../useAutoRouting';

const createDeferred = () => {
    let resolvePromise: (() => void) | undefined;
    let rejectPromise: ((reason?: unknown) => void) | undefined;
    const promise = new Promise<void>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });
    return {
        promise,
        resolve: () => resolvePromise?.(),
        reject: (reason?: unknown) => rejectPromise?.(reason),
    };
};

const createOptions = () => {
    const setNodes: React.Dispatch<React.SetStateAction<Node[]>> = () => undefined;
    const setEdges: React.Dispatch<React.SetStateAction<Edge[]>> = () => undefined;
    return {
        setNodes,
        setEdges,
        nodesRef: { current: [] as Node[] },
        edgesRef: { current: [] as Edge[] },
        takeSnapshot: () => undefined,
        reactFlowInstance: null,
    };
};

describe('useAutoRouting layout preference coordination', () => {
    beforeEach(() => {
        mocks.autoPathSelection = true;
        mocks.handleStrategyLayout.mockReset();
        mocks.handleStrategyLayout.mockResolvedValue(true);
        mocks.syncAutoPathSelection.mockReset();
        mocks.applyRoutingProfile.mockReset();
    });

    it('does not load or clear the advanced routing cache on initial mount', () => {
        renderHook(() => useAutoRouting(createOptions()));

        expect(mocks.forceClearAllCaches).not.toHaveBeenCalled();
    });

    it('clears the advanced routing cache after an explicit preference change', async () => {
        const { result } = renderHook(() => useAutoRouting(createOptions()));

        act(() => result.current.setAutoRoutingEnabled(false));

        await waitFor(() => expect(mocks.forceClearAllCaches).toHaveBeenCalledTimes(1));
    });

    it('does not let a late layout completion overwrite a newer manual routing choice', async () => {
        const deferred = createDeferred();
        mocks.handleStrategyLayout.mockReturnValueOnce(deferred.promise);
        const { result } = renderHook(() => useAutoRouting(createOptions()));
        let layoutPromise = Promise.resolve();

        act(() => {
            layoutPromise = result.current.handleStrategyLayout('tree');
        });
        expect(result.current.isLayoutStable).toBe(true);
        expect(result.current.isLayoutBusy).toBe(true);

        act(() => {
            result.current.setAutoRoutingEnabled(false);
        });
        deferred.resolve();
        await act(async () => layoutPromise);

        expect(result.current.autoRoutingEnabled).toBe(false);
        expect(result.current.isLayoutStable).toBe(true);
        expect(result.current.isLayoutBusy).toBe(false);
    });

    it('enables routing after layout when the user preference did not change', async () => {
        mocks.autoPathSelection = false;
        const { result } = renderHook(() => useAutoRouting(createOptions()));

        await act(async () => result.current.handleStrategyLayout('tree'));

        expect(result.current.autoRoutingEnabled).toBe(true);
        expect(result.current.isLayoutStable).toBe(true);
        expect(result.current.isLayoutBusy).toBe(false);
    });

    it('restores the stable flag when layout execution rejects', async () => {
        mocks.handleStrategyLayout.mockRejectedValueOnce(new Error('layout failed'));
        const { result } = renderHook(() => useAutoRouting(createOptions()));

        await act(async () => {
            await expect(result.current.handleStrategyLayout('tree')).rejects.toThrow('layout failed');
        });

        expect(result.current.isLayoutStable).toBe(true);
        expect(result.current.isLayoutBusy).toBe(false);
    });

    it('ignores overlapping layout requests until the active layout completes', async () => {
        const deferred = createDeferred();
        mocks.handleStrategyLayout.mockReturnValueOnce(deferred.promise);
        const { result } = renderHook(() => useAutoRouting(createOptions()));
        let firstLayout = Promise.resolve();

        act(() => {
            firstLayout = result.current.handleStrategyLayout('domain-dagre', 'dagre', 'LR');
        });
        await act(async () => {
            await result.current.handleStrategyLayout('domain-vertical', 'grid', 'TB');
        });

        expect(mocks.handleStrategyLayout).toHaveBeenCalledTimes(1);
        expect(result.current.isLayoutStable).toBe(true);
        expect(result.current.isLayoutBusy).toBe(true);

        deferred.resolve();
        await act(async () => firstLayout);
        expect(result.current.isLayoutStable).toBe(true);
        expect(result.current.isLayoutBusy).toBe(false);
    });
});
