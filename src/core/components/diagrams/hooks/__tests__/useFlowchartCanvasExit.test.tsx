/* @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import type { SetStateAction } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDiagramStore } from '../../../../store/useDiagramStore';
import {
    flowchartCanvasExitTestUtils,
    useFlowchartCanvasExit,
} from '../useFlowchartCanvasExit';

afterEach(() => {
    useDiagramStore.getState().setSelectedNodes([]);
    useDiagramStore.getState().setSelectedEdges([]);
    vi.unstubAllGlobals();
});

describe('useFlowchartCanvasExit', () => {
    it('clears visual, scoped, and shared selection while returning to pointer mode', () => {
        let deferredReconciliation: FrameRequestCallback | undefined;
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            deferredReconciliation = callback;
            return 1;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        const selectedNode: Node = {
            id: 'node-1',
            position: { x: 0, y: 0 },
            data: { label: 'Node', isEditing: true },
            selected: true,
        };
        const selectedEdge: Edge = {
            id: 'edge-1',
            source: 'node-1',
            target: 'node-2',
            selected: true,
        };
        let nodes = [selectedNode];
        let edges = [selectedEdge];
        const setNodes = vi.fn((update: SetStateAction<Node[]>) => {
            nodes = typeof update === 'function' ? update(nodes) : update;
        });
        const setEdges = vi.fn((update: SetStateAction<Edge[]>) => {
            edges = typeof update === 'function' ? update(edges) : update;
        });
        const clearScopedSelection = vi.fn();
        const activatePointer = vi.fn();
        const closeQuickAdd = vi.fn();
        useDiagramStore.getState().setSelectedNodes([selectedNode]);
        useDiagramStore.getState().setSelectedEdges([selectedEdge]);

        const { result } = renderHook(() => useFlowchartCanvasExit({
            setNodes,
            setEdges,
            clearScopedSelection,
            activatePointer,
            closeQuickAdd,
        }));

        act(() => result.current.exitCanvasInteraction());

        expect(nodes[0]).toMatchObject({ selected: false, data: { isEditing: false } });
        expect(edges[0]).toMatchObject({ selected: false });
        expect(clearScopedSelection).toHaveBeenCalledOnce();
        expect(activatePointer).toHaveBeenCalledOnce();
        expect(closeQuickAdd).toHaveBeenCalledOnce();
        expect(useDiagramStore.getState().selectedNodes).toEqual([]);
        expect(useDiagramStore.getState().selectedEdges).toEqual([]);

        nodes = [selectedNode];
        edges = [selectedEdge];
        useDiagramStore.getState().setSelectedNodes([selectedNode]);
        useDiagramStore.getState().setSelectedEdges([selectedEdge]);
        act(() => deferredReconciliation?.(16));

        expect(nodes[0]?.selected).toBe(false);
        expect(edges[0]?.selected).toBe(false);
        expect(clearScopedSelection).toHaveBeenCalledTimes(2);
        expect(useDiagramStore.getState().selectedNodes).toEqual([]);
        expect(useDiagramStore.getState().selectedEdges).toEqual([]);
    });

    it('preserves array and element identity when there is nothing to clear', () => {
        const nodes: Node[] = [{ id: 'node-1', position: { x: 0, y: 0 }, data: {} }];
        const edges: Edge[] = [{ id: 'edge-1', source: 'node-1', target: 'node-2' }];

        expect(flowchartCanvasExitTestUtils.clearSelectedNodes(nodes)).toBe(nodes);
        expect(flowchartCanvasExitTestUtils.clearSelectedEdges(edges)).toBe(edges);
    });
});
