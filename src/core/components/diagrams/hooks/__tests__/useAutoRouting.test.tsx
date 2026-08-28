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
    layoutOptions: undefined as unknown,
}));

vi.mock('@/core/config/DiagramConfig', () => ({
    diagramConfigManager: {
        getConfig: () => ({ edge: { autoPathSelection: mocks.autoPathSelection } }),
    },
}));

vi.mock('../useLayoutStrategy', () => ({
    useLayoutStrategy: (options: unknown) => {
        mocks.layoutOptions = options;
        return {
            handleStrategyLayout: mocks.handleStrategyLayout,
            lastDomainStrategy: 'domain-dagre',
            lastDomainDirection: 'TB',
            lastNodeLayout: 'dagre',
        };
    },
}));

vi.mock('../useSmartRoutingConfig', () => ({
    syncAutoPathSelection: mocks.syncAutoPathSelection,
    applyRoutingProfile: mocks.applyRoutingProfile,
    DESIGNER_ROUTING_PROFILE: vi.fn(),
}));

import { useAutoRouting } from '../useAutoRouting';
import type { BaseReactFlowRoutingSessionJob } from '../../../shared/baseReactFlowRoutingSessionRuntime';

type LayoutPreviewCallbacks = Readonly<{
    publishLayoutPreview: (request: {
        nodes: Node[];
        routingJob: BaseReactFlowRoutingSessionJob;
    }) => void;
    clearLayoutPreview: (routingJob: BaseReactFlowRoutingSessionJob) => void;
}>;

const getLayoutPreviewCallbacks = (): LayoutPreviewCallbacks =>
    mocks.layoutOptions as LayoutPreviewCallbacks;

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

const nodes: Node[] = [{ id: 'preview-node', position: { x: 40, y: 80 }, data: {} }];

describe('useAutoRouting layout preference coordination', () => {
    beforeEach(() => {
        mocks.autoPathSelection = true;
        mocks.handleStrategyLayout.mockReset();
        mocks.handleStrategyLayout.mockResolvedValue(true);
        mocks.syncAutoPathSelection.mockReset();
        mocks.applyRoutingProfile.mockReset();
        mocks.layoutOptions = undefined;
    });

    it('synchronizes an explicit preference change without a second cache owner', async () => {
        const { result } = renderHook(() => useAutoRouting(createOptions()));

        act(() => result.current.setAutoRoutingEnabled(false));

        await waitFor(() => expect(mocks.syncAutoPathSelection).toHaveBeenLastCalledWith(false));
    });

    it('owns one routing runtime and passes that exact session to layout routing', () => {
        const { result } = renderHook(() => useAutoRouting(createOptions()));

        expect(mocks.layoutOptions).toMatchObject({
            routingSessionRuntime: result.current.routingSessionRuntime,
        });
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

    it('starts the latest layout request and keeps busy state owned by it', async () => {
        const firstDeferred = createDeferred();
        const secondDeferred = createDeferred();
        mocks.handleStrategyLayout
            .mockReturnValueOnce(firstDeferred.promise)
            .mockReturnValueOnce(secondDeferred.promise);
        const { result } = renderHook(() => useAutoRouting(createOptions()));
        let firstLayout = Promise.resolve();
        let secondLayout = Promise.resolve();

        act(() => {
            firstLayout = result.current.handleStrategyLayout('domain-dagre', 'dagre', 'LR');
        });
        act(() => {
            secondLayout = result.current.handleStrategyLayout('domain-vertical', 'grid', 'TB');
        });

        expect(mocks.handleStrategyLayout).toHaveBeenCalledTimes(2);
        expect(result.current.isLayoutStable).toBe(true);
        expect(result.current.isLayoutBusy).toBe(true);

        firstDeferred.resolve();
        await act(async () => firstLayout);
        expect(result.current.isLayoutBusy).toBe(true);

        secondDeferred.resolve();
        await act(async () => secondLayout);
        expect(result.current.isLayoutStable).toBe(true);
        expect(result.current.isLayoutBusy).toBe(false);
    });

    it('keeps preview cleanup owned by the latest job and generation', async () => {
        const firstDeferred = createDeferred();
        const secondDeferred = createDeferred();
        mocks.handleStrategyLayout
            .mockReturnValueOnce(firstDeferred.promise)
            .mockReturnValueOnce(secondDeferred.promise);
        const { result } = renderHook(() => useAutoRouting({
            ...createOptions(),
            diagramId: 'diagram-a',
        }));
        let firstLayout = Promise.resolve();
        let secondLayout = Promise.resolve();

        act(() => {
            firstLayout = result.current.handleStrategyLayout('tree');
        });
        const firstJob = result.current.routingSessionRuntime.beginJob('layout');
        act(() => getLayoutPreviewCallbacks().publishLayoutPreview({ nodes, routingJob: firstJob }));
        expect(result.current.layoutPresentationPreview).toMatchObject({
            jobId: firstJob.id,
            generation: 1,
            scope: 'diagram-a',
            nodes,
        });

        act(() => {
            secondLayout = result.current.handleStrategyLayout('domain-elk');
        });
        const secondJob = result.current.routingSessionRuntime.beginJob('layout');
        act(() => getLayoutPreviewCallbacks().publishLayoutPreview({ nodes: [], routingJob: secondJob }));
        act(() => getLayoutPreviewCallbacks().clearLayoutPreview(firstJob));

        expect(result.current.layoutPresentationPreview).toMatchObject({
            jobId: secondJob.id,
            generation: 2,
            nodes: [],
        });
        firstDeferred.resolve();
        await act(async () => firstLayout);
        expect(result.current.layoutPresentationPreview?.jobId).toBe(secondJob.id);

        secondDeferred.resolve();
        await act(async () => secondLayout);
        expect(result.current.layoutPresentationPreview).toBeNull();
    });

    it('does not expose a preview after the diagram scope changes', () => {
        const { result, rerender } = renderHook(
            ({ diagramId }: { diagramId: string }) => useAutoRouting({
                ...createOptions(),
                diagramId,
            }),
            { initialProps: { diagramId: 'diagram-a' } },
        );
        const routingJob = result.current.routingSessionRuntime.beginJob('layout');

        act(() => getLayoutPreviewCallbacks().publishLayoutPreview({ nodes, routingJob }));
        expect(result.current.layoutPresentationPreview?.scope).toBe('diagram-a');

        rerender({ diagramId: 'diagram-b' });
        expect(result.current.layoutPresentationPreview).toBeNull();
    });
});
