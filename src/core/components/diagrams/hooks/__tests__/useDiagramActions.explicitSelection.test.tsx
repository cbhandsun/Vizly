// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import type { SetStateAction } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDiagramActions } from '../useDiagramActions';
import { scheduleFlowchartEmptyStateFocus } from '../../flowchartDeletionFocus';

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

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('useDiagramActions explicit selection targets', () => {
    it('retries empty-state focus for one render frame and supports cancellation', () => {
        const animationFrames: FrameRequestCallback[] = [];
        const cancelledFrames = new Set<number>();
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            animationFrames.push(callback);
            return animationFrames.length;
        });
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(frameId => {
            cancelledFrames.add(frameId);
        });

        const scheduled = scheduleFlowchartEmptyStateFocus(document);
        expect(scheduled).not.toBeNull();
        act(() => animationFrames[0](0));
        expect(animationFrames).toHaveLength(2);

        scheduled?.cancel();
        expect(cancelledFrames).toContain(2);
        const action = document.createElement('button');
        action.className = 'flowchart-empty-action';
        document.body.append(action);
        act(() => animationFrames[1](16));
        expect(document.activeElement).not.toBe(action);
        action.remove();
    });

    it('moves focus to the empty-state action after deleting the final node', async () => {
        const animationFrames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            animationFrames.push(callback);
            return animationFrames.length;
        });
        const targetNode = node('node-1', true);
        const { result } = renderHook(() => useDiagramActions({
            nodes: [targetNode],
            edges: [],
            setNodes: vi.fn(),
            setEdges: vi.fn(),
            selectedNodes: [targetNode],
            selectedEdges: [],
            takeSnapshot: vi.fn(),
            reactFlowInstance: null,
        }));

        await act(async () => result.current.handleDelete());
        expect(animationFrames).toHaveLength(1);

        const action = document.createElement('button');
        action.className = 'flowchart-empty-action';
        document.body.append(action);
        act(() => animationFrames[0](0));

        expect(document.activeElement).toBe(action);
        action.remove();
    });

    it('selects and focuses the surviving node when deletion removes the focused node', async () => {
        const animationFrames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            animationFrames.push(callback);
            return animationFrames.length;
        });
        const targetNode = node('node-1', true);
        const remainingNode = { ...node('node-2'), position: { x: 80, y: 20 } };
        let currentNodes = [targetNode, remainingNode];
        const setNodes = vi.fn((update: SetStateAction<Node[]>) => {
            currentNodes = typeof update === 'function' ? update(currentNodes) : update;
        });
        document.body.innerHTML = `
            <div class="react-flow__node" data-id="node-1">
                <div id="deleted-node" role="treeitem" aria-selected="true" tabindex="0"></div>
            </div>
        `;
        const deletedNode = document.querySelector<HTMLElement>('#deleted-node');
        if (!deletedNode) throw new Error('test fixture missing');
        deletedNode.focus();
        const { result } = renderHook(() => useDiagramActions({
            nodes: [targetNode, remainingNode],
            edges: [],
            setNodes,
            setEdges: vi.fn(),
            selectedNodes: [targetNode],
            selectedEdges: [],
            takeSnapshot: vi.fn(),
            reactFlowInstance: null,
        }));

        await act(async () => result.current.handleDelete());

        expect(currentNodes).toEqual([{ ...remainingNode, selected: true }]);
        expect(animationFrames).toHaveLength(1);
        document.body.innerHTML = `
            <div class="react-flow__node" data-id="node-2" tabindex="0">
                <div id="surviving-node" role="treeitem" aria-selected="true" tabindex="0"></div>
            </div>
        `;
        act(() => animationFrames.shift()?.(0));
        expect(document.activeElement?.id).toBe('surviving-node');
    });

    it('selects and focuses the target endpoint after deleting the final focused edge', async () => {
        const animationFrames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            animationFrames.push(callback);
            return animationFrames.length;
        });
        const initialNodes = [node('source'), node('target')];
        const deletedEdge: Edge = {
            id: 'edge-a',
            source: 'source',
            target: 'target',
            selected: true,
        };
        let currentNodes = initialNodes;
        let currentEdges = [deletedEdge];
        const setNodes = vi.fn((update: SetStateAction<Node[]>) => {
            currentNodes = typeof update === 'function' ? update(currentNodes) : update;
        });
        const setEdges = vi.fn((update: SetStateAction<Edge[]>) => {
            currentEdges = typeof update === 'function' ? update(currentEdges) : update;
        });
        document.body.innerHTML = '<svg><g id="deleted-edge" class="react-flow__edge selected" data-id="edge-a" tabindex="0"></g></svg>';
        document.querySelector<HTMLElement>('#deleted-edge')?.focus();

        const { result } = renderHook(() => useDiagramActions({
            nodes: initialNodes,
            edges: [deletedEdge],
            setNodes,
            setEdges,
            selectedNodes: [],
            selectedEdges: [deletedEdge],
            takeSnapshot: vi.fn(),
            reactFlowInstance: null,
        }));

        await act(async () => result.current.handleDelete());

        expect(currentEdges).toEqual([]);
        expect(currentNodes).toEqual([
            { ...initialNodes[0], selected: false },
            { ...initialNodes[1], selected: true },
        ]);
        document.body.innerHTML = `
            <div class="react-flow__node selected" data-id="target">
                <div id="target-node" role="treeitem" aria-selected="true" tabindex="0"></div>
            </div>
        `;
        act(() => animationFrames.shift()?.(0));
        expect(document.activeElement?.id).toBe('target-node');
    });

    it('selects and focuses an adjacent surviving edge after deleting a focused edge', async () => {
        const animationFrames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            animationFrames.push(callback);
            return animationFrames.length;
        });
        const initialNodes = [node('a'), node('b'), node('c')];
        const deletedEdge: Edge = { id: 'edge-a', source: 'a', target: 'b', selected: true };
        const survivingEdge: Edge = { id: 'edge-b', source: 'b', target: 'c', selected: false };
        let currentNodes = initialNodes;
        let currentEdges = [deletedEdge, survivingEdge];
        const setNodes = vi.fn((update: SetStateAction<Node[]>) => {
            currentNodes = typeof update === 'function' ? update(currentNodes) : update;
        });
        const setEdges = vi.fn((update: SetStateAction<Edge[]>) => {
            currentEdges = typeof update === 'function' ? update(currentEdges) : update;
        });
        document.body.innerHTML = '<svg><g id="deleted-edge" class="react-flow__edge selected" data-id="edge-a" tabindex="0"></g></svg>';
        document.querySelector<HTMLElement>('#deleted-edge')?.focus();

        const { result } = renderHook(() => useDiagramActions({
            nodes: initialNodes,
            edges: [deletedEdge, survivingEdge],
            setNodes,
            setEdges,
            selectedNodes: [],
            selectedEdges: [deletedEdge],
            takeSnapshot: vi.fn(),
            reactFlowInstance: null,
        }));

        await act(async () => result.current.handleDelete());

        expect(currentNodes.every(item => item.selected === false)).toBe(true);
        expect(currentEdges).toEqual([{ ...survivingEdge, selected: true }]);
        document.body.innerHTML = '<svg><g id="surviving-edge" class="react-flow__edge selected" data-id="edge-b" tabindex="0"></g></svg>';
        act(() => animationFrames.shift()?.(0));
        expect(document.activeElement?.id).toBe('surviving-edge');
    });

    it('uses the explicit toolbar edge target when focus is outside the canvas', async () => {
        const animationFrames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            animationFrames.push(callback);
            return animationFrames.length;
        });
        const initialNodes = [node('source'), node('target')];
        const deletedEdge: Edge = { id: 'edge-a', source: 'source', target: 'target' };
        let currentNodes = initialNodes;
        const setNodes = vi.fn((update: SetStateAction<Node[]>) => {
            currentNodes = typeof update === 'function' ? update(currentNodes) : update;
        });
        const toolbar = document.createElement('button');
        document.body.append(toolbar);
        toolbar.focus();

        const { result } = renderHook(() => useDiagramActions({
            nodes: initialNodes,
            edges: [deletedEdge],
            setNodes,
            setEdges: vi.fn(),
            selectedNodes: [],
            selectedEdges: [],
            takeSnapshot: vi.fn(),
            reactFlowInstance: null,
        }));

        await act(async () => result.current.handleDelete(['edge-a']));

        expect(currentNodes[1]).toMatchObject({ id: 'target', selected: true });
        document.body.innerHTML = `
            <div class="react-flow__node selected" data-id="target">
                <div id="explicit-target" role="treeitem" aria-selected="true" tabindex="0"></div>
            </div>
        `;
        act(() => animationFrames.shift()?.(0));
        expect(document.activeElement?.id).toBe('explicit-target');
    });

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

    it('selects and focuses the newly created duplicate', () => {
        const animationFrames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            animationFrames.push(callback);
            return animationFrames.length;
        });
        const original = node('node-1', true);
        let currentNodes = [original];
        const setNodes = vi.fn((update: SetStateAction<Node[]>) => {
            currentNodes = typeof update === 'function' ? update(currentNodes) : update;
        });
        const { result } = renderHook(() => useDiagramActions({
            nodes: [original],
            edges: [],
            setNodes,
            setEdges: vi.fn(),
            selectedNodes: [original],
            selectedEdges: [],
            takeSnapshot: vi.fn(),
            reactFlowInstance: null,
        }));

        act(() => result.current.handleDuplicate());

        expect(currentNodes).toHaveLength(2);
        expect(currentNodes[0].selected).toBe(false);
        expect(currentNodes[1].selected).toBe(true);
        const duplicateId = currentNodes[1].id;
        document.body.innerHTML = `
            <div class="react-flow__node selected" data-id="${duplicateId}">
                <div id="duplicate-node" role="treeitem" aria-selected="true" tabindex="0"></div>
            </div>
        `;
        act(() => animationFrames.shift()?.(0));
        expect(document.activeElement?.id).toBe('duplicate-node');
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

    it('blocks direct and cascading deletion when a locked connector would be removed', async () => {
        const initialNodes = [node('node-1'), node('node-2')];
        const lockedEdge: Edge = {
            id: 'edge-locked',
            source: 'node-1',
            target: 'node-2',
            data: { locked: true },
            deletable: false,
            reconnectable: false,
        };
        const setNodes = vi.fn();
        const setEdges = vi.fn();
        const takeSnapshot = vi.fn();
        const { result } = renderHook(() => useDiagramActions({
            nodes: [],
            edges: [],
            nodesRef: { current: initialNodes },
            edgesRef: { current: [lockedEdge] },
            setNodes,
            setEdges,
            selectedNodes: [],
            selectedEdges: [lockedEdge],
            takeSnapshot,
            reactFlowInstance: null,
        }));

        await act(async () => result.current.handleDelete(['edge-locked']));
        await act(async () => result.current.handleDelete(['node-1']));

        expect(takeSnapshot).not.toHaveBeenCalled();
        expect(setNodes).not.toHaveBeenCalled();
        expect(setEdges).not.toHaveBeenCalled();
    });

    it('locks and unlocks an explicit connector in one history step per change', () => {
        const initialEdge: Edge = { id: 'edge-1', source: 'node-1', target: 'node-2', selected: true };
        const edgesRef = { current: [initialEdge] };
        let currentEdges = [initialEdge];
        const setEdges = vi.fn((update: SetStateAction<Edge[]>) => {
            currentEdges = typeof update === 'function' ? update(currentEdges) : update;
        });
        const takeSnapshot = vi.fn();
        const { result } = renderHook(() => useDiagramActions({
            nodes: [],
            edges: [],
            nodesRef: { current: [] },
            edgesRef,
            setNodes: vi.fn(),
            setEdges,
            selectedNodes: [],
            selectedEdges: [initialEdge],
            takeSnapshot,
            reactFlowInstance: null,
        }));

        act(() => result.current.handleLock(['edge-1'], true));
        expect(currentEdges[0]).toMatchObject({
            deletable: false,
            reconnectable: false,
            data: { locked: true },
        });

        act(() => result.current.handleLock(['edge-1'], false));
        expect(currentEdges[0]).toMatchObject({
            deletable: true,
            reconnectable: true,
            data: { locked: false },
        });
        expect(takeSnapshot).toHaveBeenCalledTimes(2);

        act(() => result.current.handleLock(['edge-1'], false));
        expect(takeSnapshot).toHaveBeenCalledTimes(2);
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

    it('duplicates internal edges and leaves outbound edges attached only to the original graph', () => {
        const animationFrames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            animationFrames.push(callback);
            return animationFrames.length;
        });
        const initialNodes = [node('node-1', true), node('node-2', true), node('outside')];
        const initialEdges: Edge[] = [
            { id: 'inside', source: 'node-1', target: 'node-2', selected: true },
            { id: 'outbound', source: 'node-2', target: 'outside' },
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
            selectedNodes: initialNodes.slice(0, 2),
            selectedEdges: [initialEdges[0]],
            takeSnapshot: vi.fn(),
            reactFlowInstance: null,
        }));

        act(() => result.current.handleDuplicate());

        expect(currentNodes).toHaveLength(5);
        expect(currentEdges).toHaveLength(3);
        expect(currentEdges.slice(0, 2).every(edge => edge.selected === false)).toBe(true);
        expect(currentEdges[2]).toMatchObject({
            source: currentNodes[3].id,
            target: currentNodes[4].id,
            selected: true,
        });
        expect(currentNodes.slice(3).every(item => item.selected === true)).toBe(true);
        const primaryDuplicateId = currentNodes[3].id;
        document.body.innerHTML = `
            <div class="react-flow__node selected" data-id="${primaryDuplicateId}">
                <div id="primary-duplicate" role="treeitem" aria-selected="true" tabindex="0"></div>
            </div>
        `;
        act(() => animationFrames.shift()?.(0));
        expect(document.activeElement?.id).toBe('primary-duplicate');
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
