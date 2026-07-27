// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import type { SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useDiagramActions } from '../useDiagramActions';

const node = (id: string, selected = false): Node => ({
    id,
    type: 'custom',
    position: { x: 10, y: 20 },
    data: { label: id },
    selected,
});

describe('useDiagramActions explicit selection targets', () => {
    it('duplicates toolbar targets even when the legacy selection snapshot is empty', () => {
        const initialNodes = [node('node-1', true), node('node-2')];
        let currentNodes = initialNodes;
        const setNodes = vi.fn((update: SetStateAction<Node[]>) => {
            currentNodes = typeof update === 'function' ? update(currentNodes) : update;
        });
        const takeSnapshot = vi.fn();

        const { result } = renderHook(() => useDiagramActions({
            nodes: [],
            edges: [],
            nodesRef: { current: initialNodes },
            edgesRef: { current: [] },
            setNodes,
            setEdges: vi.fn(),
            selectedNodes: [],
            selectedEdges: [],
            takeSnapshot,
            reactFlowInstance: null,
        }));

        act(() => result.current.handleDuplicate(['node-1']));

        expect(takeSnapshot).toHaveBeenCalledWith(initialNodes, []);
        expect(currentNodes).toHaveLength(3);
        expect(currentNodes.at(-1)).toMatchObject({
            selected: true,
            position: { x: 60, y: 70 },
            data: { label: 'node-1 (Copy)' },
        });
    });

    it('deletes exactly the explicit toolbar targets', async () => {
        const initialNodes = [node('node-1', true), node('node-2', true), node('node-3')];
        const initialEdges: Edge[] = [
            { id: 'edge-1', source: 'node-1', target: 'node-3' },
            { id: 'edge-2', source: 'node-2', target: 'node-3' },
        ];
        let currentNodes = initialNodes;
        let currentEdges = initialEdges;
        const setNodes = vi.fn((update: SetStateAction<Node[]>) => {
            currentNodes = typeof update === 'function' ? update(currentNodes) : update;
        });
        const setEdges = vi.fn((update: SetStateAction<Edge[]>) => {
            currentEdges = typeof update === 'function' ? update(currentEdges) : update;
        });

        const { result } = renderHook(() => useDiagramActions({
            nodes: [],
            edges: [],
            nodesRef: { current: initialNodes },
            edgesRef: { current: initialEdges },
            setNodes,
            setEdges,
            selectedNodes: [],
            selectedEdges: [],
            takeSnapshot: vi.fn(),
            reactFlowInstance: null,
        }));

        await act(async () => result.current.handleDelete(['node-1']));

        expect(currentNodes.map(item => item.id)).toEqual(['node-2', 'node-3']);
        expect(currentEdges.map(item => item.id)).toEqual(['edge-2']);
    });

    it('locks all explicit toolbar targets in one history step', () => {
        const initialNodes = [node('node-1', true), node('node-2', true), node('node-3')];
        let currentNodes = initialNodes;
        const setNodes = vi.fn((update: SetStateAction<Node[]>) => {
            currentNodes = typeof update === 'function' ? update(currentNodes) : update;
        });
        const takeSnapshot = vi.fn();

        const { result } = renderHook(() => useDiagramActions({
            nodes: [],
            edges: [],
            nodesRef: { current: initialNodes },
            edgesRef: { current: [] },
            setNodes,
            setEdges: vi.fn(),
            selectedNodes: [],
            selectedEdges: [],
            takeSnapshot,
            reactFlowInstance: null,
        }));

        act(() => result.current.handleLock(['node-1', 'node-2'], true));

        expect(takeSnapshot).toHaveBeenCalledTimes(1);
        expect(currentNodes.map(item => ({
            id: item.id,
            draggable: item.draggable,
            locked: item.data.locked,
        }))).toEqual([
            { id: 'node-1', draggable: false, locked: true },
            { id: 'node-2', draggable: false, locked: true },
            { id: 'node-3', draggable: undefined, locked: undefined },
        ]);
    });
});
