// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import type { SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useDiagramActions } from '../useDiagramActions';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => {
            if (key === 'designer.flowchart.newNode') return 'Node';
            if (key === 'designer.flowchart.duplicateLabel') return `${String(options?.label ?? 'Node')} (Copy)`;
            if (key === 'designer.historyPanel.beforeDuplicate') return `复制 ${String(options?.count ?? 0)} 个节点前`;
            if (key === 'designer.historyPanel.beforeDelete') return `删除 ${String(options?.count ?? 0)} 项前`;
            return key;
        },
    }),
}));

const node = (id: string, selected = false): Node => ({
    id,
    type: 'custom',
    position: { x: 10, y: 20 },
    data: { label: id },
    selected,
});

describe('useDiagramActions explicit selection targets', () => {
    it('records a meaningful pre-operation label before duplicating nodes', () => {
        const takeSnapshot = vi.fn();
        const targetNode = node('node-1');
        const { result } = renderHook(() => useDiagramActions({
            nodes: [targetNode],
            edges: [],
            setNodes: vi.fn(),
            setEdges: vi.fn(),
            selectedNodes: [targetNode],
            selectedEdges: [],
            takeSnapshot,
            reactFlowInstance: null,
        }));

        act(() => result.current.handleDuplicate());

        expect(takeSnapshot).toHaveBeenCalledWith(
            [targetNode],
            [],
            '复制 1 个节点前',
        );
    });

    it.each(['delete', 'duplicate'] as const)('blocks %s when an explicit target is locked', async actionName => {
        const lockedNode = { ...node('node-1', true), draggable: false, data: { label: 'node-1', locked: true } };
        const setNodes = vi.fn();
        const setEdges = vi.fn();
        const takeSnapshot = vi.fn();

        const { result } = renderHook(() => useDiagramActions({
            nodes: [],
            edges: [],
            nodesRef: { current: [lockedNode] },
            edgesRef: { current: [] },
            setNodes,
            setEdges,
            selectedNodes: [lockedNode],
            selectedEdges: [],
            takeSnapshot,
            reactFlowInstance: null,
        }));

        if (actionName === 'delete') {
            await act(async () => result.current.handleDelete(['node-1']));
        } else {
            act(() => result.current.handleDuplicate(['node-1']));
        }

        expect(takeSnapshot).not.toHaveBeenCalled();
        expect(setNodes).not.toHaveBeenCalled();
        expect(setEdges).not.toHaveBeenCalled();
    });

    it('blocks cascading deletion when a protected descendant would be removed', async () => {
        const root = { ...node('root', true), type: 'mindmap' };
        const lockedChild = { ...node('child'), draggable: false, data: { label: 'child', locked: true } };
        const initialNodes = [root, lockedChild];
        const initialEdges: Edge[] = [{ id: 'parent-child', source: 'root', target: 'child' }];
        const setNodes = vi.fn();
        const setEdges = vi.fn();
        const takeSnapshot = vi.fn();

        const { result } = renderHook(() => useDiagramActions({
            nodes: [],
            edges: [],
            nodesRef: { current: initialNodes },
            edgesRef: { current: initialEdges },
            setNodes,
            setEdges,
            selectedNodes: [root],
            selectedEdges: [],
            takeSnapshot,
            reactFlowInstance: null,
        }));

        await act(async () => result.current.handleDelete(['root']));

        expect(takeSnapshot).not.toHaveBeenCalled();
        expect(setNodes).not.toHaveBeenCalled();
        expect(setEdges).not.toHaveBeenCalled();
    });

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

        expect(takeSnapshot).toHaveBeenCalledWith(initialNodes, [], '复制 1 个节点前');
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
        const nodesRef = { current: initialNodes };
        let currentNodes = initialNodes;
        const setNodes = vi.fn((update: SetStateAction<Node[]>) => {
            currentNodes = typeof update === 'function' ? update(currentNodes) : update;
        });
        const takeSnapshot = vi.fn();

        const { result } = renderHook(() => useDiagramActions({
            nodes: [],
            edges: [],
            nodesRef,
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

        act(() => result.current.handleLock(['node-1', 'node-2'], false));

        expect(takeSnapshot).toHaveBeenCalledTimes(2);
        expect(currentNodes.slice(0, 2).map(item => ({
            draggable: item.draggable,
            locked: item.data.locked,
        }))).toEqual([
            { draggable: true, locked: false },
            { draggable: true, locked: false },
        ]);

        act(() => result.current.handleLock(['node-1', 'node-2'], false));
        expect(takeSnapshot).toHaveBeenCalledTimes(2);
    });

    it('moves every explicit layer target in one history step', () => {
        const initialNodes = [
            node('parent-a'),
            node('parent-b'),
            { ...node('a-1'), parentId: 'parent-a' },
            { ...node('a-2'), parentId: 'parent-a' },
            { ...node('b-1'), parentId: 'parent-b' },
            { ...node('b-2'), parentId: 'parent-b' },
        ];
        const nodesRef = { current: initialNodes };
        let currentNodes = initialNodes;
        const setNodes = vi.fn((update: SetStateAction<Node[]>) => {
            currentNodes = typeof update === 'function' ? update(currentNodes) : update;
        });
        const takeSnapshot = vi.fn();

        const { result } = renderHook(() => useDiagramActions({
            nodes: [],
            edges: [],
            nodesRef,
            edgesRef: { current: [] },
            setNodes,
            setEdges: vi.fn(),
            selectedNodes: [],
            selectedEdges: [],
            takeSnapshot,
            reactFlowInstance: null,
        }));

        act(() => result.current.handleBringToFront(['a-1', 'b-1']));

        expect(currentNodes.map(item => item.id)).toEqual([
            'parent-a',
            'parent-b',
            'a-2',
            'a-1',
            'b-2',
            'b-1',
        ]);
        expect(nodesRef.current).toBe(currentNodes);
        expect(takeSnapshot).toHaveBeenCalledTimes(1);
        expect(takeSnapshot).toHaveBeenCalledWith(initialNodes, []);
    });

    it('blocks a batch layer action when any target is protected', () => {
        const unlocked = node('node-1');
        const locked = {
            ...node('node-2'),
            draggable: false,
            data: { label: 'node-2', locked: true },
        };
        const initialNodes = [unlocked, locked, node('node-3')];
        const setNodes = vi.fn();
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

        act(() => result.current.handleSendToBack(['node-2', 'node-3']));

        expect(takeSnapshot).not.toHaveBeenCalled();
        expect(setNodes).not.toHaveBeenCalled();
    });
});
