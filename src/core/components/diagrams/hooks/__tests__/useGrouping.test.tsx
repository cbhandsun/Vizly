// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useGrouping } from '../useGrouping';

const node = (id: string, overrides: Partial<Node> = {}): Node => ({
    id,
    position: { x: 10, y: 10 },
    data: {},
    ...overrides,
});

const setup = (nodes: Node[], selectedNodes: Node[]) => {
    const edges: Edge[] = [];
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const setSelectedNodes = vi.fn();
    const takeSnapshot = vi.fn();
    const { result } = renderHook(() => useGrouping({
        nodes,
        edges,
        selectedNodes,
        setNodes: setNodes as unknown as React.Dispatch<React.SetStateAction<Node[]>>,
        setEdges: setEdges as unknown as React.Dispatch<React.SetStateAction<Edge[]>>,
        setSelectedNodes: setSelectedNodes as unknown as React.Dispatch<React.SetStateAction<Node[]>>,
        takeSnapshot,
    }));

    return { result, setNodes, setEdges, setSelectedNodes, takeSnapshot };
};

describe('useGrouping mutation boundaries', () => {
    it('blocks grouping when any selected node is locked', () => {
        const nodes = [node('a', { data: { locked: true } }), node('b')];
        const state = setup(nodes, nodes);

        act(() => state.result.current.handleGroup());

        expect(state.takeSnapshot).not.toHaveBeenCalled();
        expect(state.setNodes).not.toHaveBeenCalled();
    });

    it('blocks ungrouping when a child affected by reparenting is locked', () => {
        const group = node('group', { type: 'titleGroup' });
        const child = node('child', { parentId: group.id, data: { locked: true } });
        const state = setup([group, child], [group]);

        act(() => state.result.current.handleUngroup());

        expect(state.takeSnapshot).not.toHaveBeenCalled();
        expect(state.setNodes).not.toHaveBeenCalled();
    });

    it('records one snapshot before a valid grouping transaction', () => {
        const nodes = [node('a'), node('b', { position: { x: 200, y: 10 } })];
        const state = setup(nodes, nodes);

        act(() => state.result.current.handleGroup());

        expect(state.takeSnapshot).toHaveBeenCalledWith(nodes, []);
        expect(state.setNodes).toHaveBeenCalledTimes(1);
        expect(state.setEdges).toHaveBeenCalledTimes(1);
        expect(state.setSelectedNodes).toHaveBeenCalledTimes(1);
    });
});
