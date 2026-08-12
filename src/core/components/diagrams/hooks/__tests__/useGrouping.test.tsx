// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
        getGroupHistoryLabel: count => `Before group: ${count}`,
        getUngroupHistoryLabel: (groups, children) => `Before ungroup: ${groups}/${children}`,
    }));

    return { result, setNodes, setEdges, setSelectedNodes, takeSnapshot };
};

describe('useGrouping mutation boundaries', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

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
        const frames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frames.push(callback);
            return frames.length;
        });

        act(() => state.result.current.handleGroup());

        expect(state.takeSnapshot).toHaveBeenCalledWith(nodes, [], 'Before group: 2');
        expect(state.setNodes).toHaveBeenCalledTimes(1);
        expect(state.setEdges).toHaveBeenCalledTimes(1);
        expect(state.setSelectedNodes).toHaveBeenCalledTimes(1);

        const group = state.setSelectedNodes.mock.calls[0]?.[0]?.[0] as Node;
        document.body.innerHTML = `
            <div class="react-flow__node selected" data-id="${group.id}">
                <div id="group-focus" role="treeitem" aria-selected="true" tabindex="0"></div>
            </div>
        `;
        frames.shift()?.(0);
        expect(document.activeElement?.id).toBe('group-focus');
    });

    it('ungroups an explicit context-menu target instead of an unrelated selection', () => {
        const group = node('group', { type: 'titleGroup', position: { x: 100, y: 80 } });
        const child = node('child', { parentId: group.id, position: { x: 20, y: 30 }, extent: 'parent' });
        const unrelated = node('unrelated');
        const state = setup([group, child, unrelated], [unrelated]);

        act(() => state.result.current.handleUngroup([group.id]));

        expect(state.takeSnapshot).toHaveBeenCalledTimes(1);
        expect(state.takeSnapshot).toHaveBeenCalledWith(
            [group, child, unrelated],
            [],
            'Before ungroup: 1/1',
        );
        expect(state.setNodes).toHaveBeenCalledWith([
            expect.objectContaining({
                id: child.id,
                position: { x: 120, y: 110 },
                selected: true,
            }),
            expect.objectContaining({ id: unrelated.id, selected: false }),
        ]);
        expect(state.setSelectedNodes).toHaveBeenCalledWith([
            expect.objectContaining({ id: child.id, selected: true }),
        ]);
    });

    it('selects and focuses promoted children after ungrouping', () => {
        const group = node('group', { type: 'titleGroup', position: { x: 100, y: 80 } });
        const first = node('first', { parentId: group.id, position: { x: 20, y: 30 }, extent: 'parent' });
        const second = node('second', { parentId: group.id, position: { x: 180, y: 30 }, extent: 'parent' });
        const state = setup([group, first, second], [group]);
        const frames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frames.push(callback);
            return frames.length;
        });

        act(() => state.result.current.handleUngroup());

        expect(state.setSelectedNodes).toHaveBeenCalledWith([
            expect.objectContaining({ id: first.id, selected: true }),
            expect.objectContaining({ id: second.id, selected: true }),
        ]);
        document.body.innerHTML = `
            <div class="react-flow__node selected" data-id="${first.id}">
                <div id="first-focus" role="treeitem" aria-selected="true" tabindex="0"></div>
            </div>
        `;
        frames.shift()?.(0);
        expect(document.activeElement?.id).toBe('first-focus');
    });

    it('ungroups nested selected containers without leaving a dangling parent', () => {
        const outer = node('outer', { type: 'titleGroup', position: { x: 100, y: 80 } });
        const inner = node('inner', { type: 'subGroup', parentId: outer.id, position: { x: 20, y: 30 } });
        const child = node('child', { parentId: inner.id, position: { x: 5, y: 7 }, extent: 'parent' });
        const state = setup([outer, inner, child], [outer, inner]);

        act(() => state.result.current.handleUngroup());

        expect(state.setNodes).toHaveBeenCalledWith([
            expect.objectContaining({ id: child.id, position: { x: 125, y: 117 } }),
        ]);
        const promotedChild = state.setNodes.mock.calls[0]?.[0]?.[0] as Node;
        expect(promotedChild).not.toHaveProperty('parentId');
    });
});
