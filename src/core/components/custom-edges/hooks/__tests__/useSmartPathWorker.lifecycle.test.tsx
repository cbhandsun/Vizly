// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { Position, type Edge } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EdgeRoutingCoordinator } from '../../../../services/EdgeRoutingCoordinator';
import { SmartEdgeRoutingOwnerContext } from '../../smartEdgeRoutingOwnership';
import { useSmartPathWorker, type EdgeData, type UseSmartPathWorkerProps } from '../useSmartPathWorker';

const routedResult = {
    path: 'M 100 40 L 300 40',
    points: [
        { x: 100, y: 40 },
        { x: 300, y: 40 },
    ],
    labelX: 200,
    labelY: 40,
};

const createFixture = () => {
    const sourceNode = {
        id: 'source',
        x: 0,
        y: 0,
        position: { x: 0, y: 0 },
        width: 100,
        height: 80,
        measured: { width: 100, height: 80 },
        data: { label: 'Source' },
    };
    const targetNode = {
        id: 'target',
        x: 300,
        y: 0,
        position: { x: 300, y: 0 },
        width: 100,
        height: 80,
        measured: { width: 100, height: 80 },
        data: { label: 'Target' },
    };
    const simpleNodeMap = new Map([
        [sourceNode.id, sourceNode],
        [targetNode.id, targetNode],
    ]);
    const storeEdges = [{
        id: 'edge-1',
        source: 'source',
        target: 'target',
        data: { label: 'Flow' },
    }] as Edge[];
    const centeredCoords = {
        sourceX: 100,
        sourceY: 40,
        targetX: 300,
        targetY: 40,
        sourceNodeOrigin: { x: 0, y: 0 },
        targetNodeOrigin: { x: 300, y: 0 },
    };
    const edgeConfig = {
        strictOrthogonal: true,
        sourceOffset: 20,
        targetOffset: 32,
        minLastSegment: 30,
        borderRadius: 0,
        gridSize: 20,
        jumpRadius: 10,
    };
    const fallbackPositions = {
        sourcePos: Position.Right,
        targetPos: Position.Left,
    };
    const multiEdgeInfo = {};
    const obstacles: never[] = [];

    const buildProps = (edgeData: EdgeData = { _layoutEpoch: 1, algorithm: 'smart' }): UseSmartPathWorkerProps => ({
        id: 'edge-1',
        source: 'source',
        target: 'target',
        centeredCoords,
        fallbackPositions,
        obstacles,
        simpleNodeMap,
        storeEdges,
        edgeConfig,
        layoutDirection: 'LR',
        zoomLevel: 1,
        respectSourceHandle: false,
        respectTargetHandle: false,
        isReverseEdge: false,
        sourceHandleId: null,
        targetHandleId: null,
        edgeData,
        multiEdgeInfo,
        isLayoutStable: true,
        nodesDragging: false,
    });

    return { buildProps, simpleNodeMap, storeEdges };
};

const createCoordinator = (cachedResult: typeof routedResult | null = null) => ({
    subscribeGraphVersion: vi.fn(() => () => undefined),
    getGraphVersion: vi.fn(() => 0),
    getCachedResult: vi.fn(() => cachedResult),
    route: vi.fn(async () => routedResult),
});

const dispatchScheduledRouting = async () => {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(9);
    });
};

const CanvasRoutingOwner = ({ children }: PropsWithChildren) => (
    <SmartEdgeRoutingOwnerContext.Provider value="canvas">
        {children}
    </SmartEdgeRoutingOwnerContext.Provider>
);

describe('useSmartPathWorker lifecycle invariants', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('starts only once when stable geometry is rerendered with equivalent edge data', async () => {
        const coordinator = createCoordinator();
        vi.spyOn(EdgeRoutingCoordinator, 'getInstance').mockReturnValue(coordinator as never);
        const fixture = createFixture();
        const { rerender, result } = renderHook(
            ({ edgeData }: { edgeData: EdgeData }) => useSmartPathWorker(fixture.buildProps(edgeData)),
            { initialProps: { edgeData: { _layoutEpoch: 1, algorithm: 'smart' } } }
        );

        await dispatchScheduledRouting();
        expect(coordinator.route).toHaveBeenCalledTimes(1);
        expect(result.current.path).toBe(routedResult.path);

        rerender({ edgeData: { _layoutEpoch: 1, algorithm: 'smart' } });
        await dispatchScheduledRouting();

        expect(coordinator.route).toHaveBeenCalledTimes(1);
    });

    it('cancels the scheduled dispatch during cleanup', async () => {
        const coordinator = createCoordinator();
        vi.spyOn(EdgeRoutingCoordinator, 'getInstance').mockReturnValue(coordinator as never);
        const fixture = createFixture();
        const { unmount } = renderHook(() => useSmartPathWorker(fixture.buildProps()));

        unmount();
        await dispatchScheduledRouting();

        expect(coordinator.route).not.toHaveBeenCalled();
    });

    it('uses a compatible coordinator cache hit without starting a route', async () => {
        const coordinator = createCoordinator(routedResult);
        vi.spyOn(EdgeRoutingCoordinator, 'getInstance').mockReturnValue(coordinator as never);
        const fixture = createFixture();
        const { result } = renderHook(() => useSmartPathWorker(fixture.buildProps()));

        await dispatchScheduledRouting();

        expect(coordinator.getCachedResult).toHaveBeenCalledTimes(1);
        expect(coordinator.route).not.toHaveBeenCalled();
        expect(result.current.path).toBe(routedResult.path);
        expect(result.current.isLoading).toBe(false);
    });

    it('does not mutate node or edge inputs while building a routing request', async () => {
        const coordinator = createCoordinator();
        vi.spyOn(EdgeRoutingCoordinator, 'getInstance').mockReturnValue(coordinator as never);
        const fixture = createFixture();
        const nodeSnapshot = Array.from(fixture.simpleNodeMap.entries()).map(([id, node]) => [
            id,
            structuredClone(node),
        ]);
        const edgeSnapshot = structuredClone(fixture.storeEdges);

        renderHook(() => useSmartPathWorker(fixture.buildProps()));
        await dispatchScheduledRouting();

        expect(Array.from(fixture.simpleNodeMap.entries())).toEqual(nodeSnapshot);
        expect(fixture.storeEdges).toEqual(edgeSnapshot);
        expect(coordinator.route).toHaveBeenCalledTimes(1);
    });

    it('does not subscribe or submit per-edge work when the canvas owns routing', async () => {
        const getCoordinator = vi.spyOn(EdgeRoutingCoordinator, 'getInstance');
        const fixture = createFixture();
        const { result } = renderHook(
            () => useSmartPathWorker(fixture.buildProps()),
            { wrapper: CanvasRoutingOwner },
        );

        await dispatchScheduledRouting();

        expect(getCoordinator).not.toHaveBeenCalled();
        expect(result.current.path).toBeNull();
        expect(result.current.smartPoints).toBeNull();
        expect(result.current.isLoading).toBe(true);
    });

    it('consumes a compatible canvas-computed path without starting the coordinator', async () => {
        const getCoordinator = vi.spyOn(EdgeRoutingCoordinator, 'getInstance');
        const fixture = createFixture();
        const computedPath = [
            { x: 100, y: 40 },
            { x: 200, y: 40 },
            { x: 300, y: 40 },
        ];
        const { result } = renderHook(
            () => useSmartPathWorker(fixture.buildProps({
                _layoutEpoch: 1,
                algorithm: 'smart',
                computedPath,
            })),
            { wrapper: CanvasRoutingOwner },
        );

        await dispatchScheduledRouting();

        expect(getCoordinator).not.toHaveBeenCalled();
        expect(result.current.path).toBeTruthy();
        expect(result.current.smartPoints).toEqual(computedPath);
        expect(result.current.isLoading).toBe(false);
    });
});
