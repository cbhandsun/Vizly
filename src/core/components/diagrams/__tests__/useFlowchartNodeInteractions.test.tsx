// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowchartNodeData } from '../../custom-nodes/FlowchartNode';

const flowState = vi.hoisted(() => ({
    beforeStructuralChange: vi.fn(),
    edges: [] as Edge[],
    nodes: [] as Node[],
    setEdges: vi.fn(),
    setNodes: vi.fn(),
    setViewport: vi.fn(),
}));

vi.mock('@xyflow/react', async importOriginal => {
    const original = await importOriginal<typeof import('@xyflow/react')>();
    return {
        ...original,
        useReactFlow: () => ({
            getEdges: () => flowState.edges,
            getNodes: () => flowState.nodes,
            getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
            setEdges: (edges: Edge[]) => {
                flowState.edges = edges;
                flowState.setEdges(edges);
            },
            setNodes: (nodes: Node[]) => {
                flowState.nodes = nodes;
                flowState.setNodes(nodes);
            },
            setViewport: flowState.setViewport,
        }),
    };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('../useNodeUpdate', () => ({
    useBeforeDiagramStructuralChange: () => flowState.beforeStructuralChange,
    useNodeUpdate: () => undefined,
}));

import { useFlowchartNodeInteractions } from '../../custom-nodes/hooks/useFlowchartNodeInteractions';

const sourceData: FlowchartNodeData = {
    label: 'Source',
    shape: 'rectangle',
};

const sourceNode: Node = {
    id: 'source',
    type: 'flowchart',
    position: { x: 10, y: 20 },
    width: 120,
    height: 60,
    data: sourceData,
    selected: true,
};

describe('useFlowchartNodeInteractions structural history', () => {
    beforeEach(() => {
        flowState.beforeStructuralChange.mockReset();
        flowState.setEdges.mockReset();
        flowState.setNodes.mockReset();
        flowState.setViewport.mockReset();
        flowState.nodes = [sourceNode];
        flowState.edges = [{
            id: 'edge-existing',
            source: 'other',
            target: 'source',
            selected: true,
        }];
    });

    it('snapshots quick-add before applying one node-and-edge transaction', () => {
        const { result } = renderHook(() => useFlowchartNodeInteractions(
            sourceNode.id,
            sourceData,
            true,
        ));

        act(() => {
            result.current.handleQuickClone('right', {
                stopPropagation: vi.fn(),
            } as unknown as PointerEvent);
        });

        expect(flowState.beforeStructuralChange).toHaveBeenCalledTimes(1);
        expect(flowState.setNodes).toHaveBeenCalledTimes(1);
        expect(flowState.setEdges).toHaveBeenCalledTimes(1);
        expect(flowState.nodes.filter(node => node.selected)).toHaveLength(1);
        expect(flowState.edges.some(edge => edge.selected)).toBe(false);
    });

    it('snapshots duplication and clears stale edge selection', () => {
        const { result } = renderHook(() => useFlowchartNodeInteractions(
            sourceNode.id,
            sourceData,
            true,
        ));

        act(() => result.current.handleClone());

        expect(flowState.beforeStructuralChange).toHaveBeenCalledTimes(1);
        expect(flowState.nodes).toHaveLength(2);
        expect(flowState.edges[0].selected).toBe(false);
    });

    it('snapshots node deletion and removes its connected edges atomically', () => {
        const { result } = renderHook(() => useFlowchartNodeInteractions(
            sourceNode.id,
            sourceData,
            true,
        ));

        act(() => result.current.handleDelete());

        expect(flowState.beforeStructuralChange).toHaveBeenCalledTimes(1);
        expect(flowState.nodes).toEqual([]);
        expect(flowState.edges).toEqual([]);
    });

    it('blocks quick-add, duplication, deletion, and data edits when editing is disabled', () => {
        const { result } = renderHook(() => useFlowchartNodeInteractions(
            sourceNode.id,
            sourceData,
            true,
            false,
        ));

        act(() => {
            result.current.handleQuickClone('right', { stopPropagation: vi.fn() } as unknown as PointerEvent);
            result.current.handleClone();
            result.current.handleDelete();
            result.current.handleUpdateData({ label: 'Blocked update' });
        });

        expect(flowState.beforeStructuralChange).not.toHaveBeenCalled();
        expect(flowState.setNodes).not.toHaveBeenCalled();
        expect(flowState.setEdges).not.toHaveBeenCalled();
        expect(flowState.nodes).toEqual([sourceNode]);
        expect(flowState.edges).toHaveLength(1);
    });
});
