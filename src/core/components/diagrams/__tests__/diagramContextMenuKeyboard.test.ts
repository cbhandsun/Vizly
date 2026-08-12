// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDiagramStore } from '../../../store/useDiagramStore';
import {
    focusFirstEnabledDiagramContextMenuItem,
    shouldCloseDiagramContextMenuFromKey,
} from '../diagramContextMenuKeyboard';
import {
    applyContextMenuVisualSelection,
    resolveContextMenuTargetSelection,
} from '../contextMenuTargetSelection';
import { useDesignerContextMenu } from '../hooks/useDesignerContextMenu';

const applyStateUpdate = <T,>(update: SetStateAction<T>, current: T): T =>
    typeof update === 'function' ? (update as (previous: T) => T)(current) : update;

const createContextMenuEvent = (): ReactMouseEvent => ({
    clientX: 120,
    clientY: 160,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
} as unknown as ReactMouseEvent);

describe('diagramContextMenuKeyboard', () => {
    it('focuses the first enabled menu item and skips disabled entries', () => {
        const root = document.createElement('div');
        root.innerHTML = `
            <button role="menuitem" aria-disabled="true">Disabled</button>
            <button role="menuitem">First enabled</button>
            <button role="menuitem">Second enabled</button>
        `;
        document.body.appendChild(root);

        expect(focusFirstEnabledDiagramContextMenuItem(root)).toBe(true);
        expect(document.activeElement?.textContent).toBe('First enabled');

        root.remove();
    });

    it('fails safely for missing roots and menus without enabled items', () => {
        const root = document.createElement('div');
        root.innerHTML = '<button role="menuitem" aria-disabled="true">Disabled</button>';

        expect(focusFirstEnabledDiagramContextMenuItem(null)).toBe(false);
        expect(focusFirstEnabledDiagramContextMenuItem(root)).toBe(false);
    });

    it('only treats Escape as the close key', () => {
        expect(shouldCloseDiagramContextMenuFromKey('Escape')).toBe(true);
        expect(shouldCloseDiagramContextMenuFromKey('Enter')).toBe(false);
        expect(shouldCloseDiagramContextMenuFromKey('Esc')).toBe(false);
    });
});

describe('context menu target selection', () => {
    beforeEach(() => {
        useDiagramStore.setState({ contextMenu: null });
    });

    it('selects an unselected node exclusively so follow-up actions use the visible target', () => {
        expect(resolveContextMenuTargetSelection({
            targetId: 'node-b',
            targetType: 'node',
            selectedNodeIds: ['node-a'],
        })).toEqual({ nodeIds: ['node-b'], edgeIds: [] });
    });

    it('preserves a multi-node selection when the right-click target belongs to it', () => {
        expect(resolveContextMenuTargetSelection({
            targetId: 'node-b',
            targetType: 'node',
            selectedNodeIds: ['node-a', 'node-b'],
        })).toEqual({ nodeIds: ['node-a', 'node-b'], edgeIds: [] });
    });

    it('makes an edge context menu explicitly target one edge', () => {
        expect(resolveContextMenuTargetSelection({
            targetId: 'edge-b',
            targetType: 'edge',
            selectedNodeIds: ['node-a'],
        })).toEqual({ nodeIds: [], edgeIds: ['edge-b'] });
    });

    it('updates only visual selection values that need to change', () => {
        const selectedNode: Node = {
            id: 'node-a',
            position: { x: 0, y: 0 },
            data: {},
            selected: true,
        };
        const unselectedNode: Node = {
            id: 'node-b',
            position: { x: 0, y: 0 },
            data: {},
            selected: false,
        };
        const edge: Edge = {
            id: 'edge-a',
            source: 'node-a',
            target: 'node-b',
            selected: true,
        };

        const nodes = applyContextMenuVisualSelection(
            [selectedNode, unselectedNode],
            new Set(['node-b']),
        );
        const edges = applyContextMenuVisualSelection([edge], new Set());

        expect(nodes).toEqual([
            { ...selectedNode, selected: false },
            { ...unselectedNode, selected: true },
        ]);
        expect(edges).toEqual([{ ...edge, selected: false }]);
    });

    it('aligns visual and scoped selection before opening a node menu', () => {
        const previousNode: Node = {
            id: 'node-a', position: { x: 0, y: 0 }, data: {}, selected: true,
        };
        const targetNode: Node = {
            id: 'node-b', position: { x: 10, y: 10 }, data: {}, selected: false,
        };
        const previousEdge: Edge = {
            id: 'edge-a', source: 'node-a', target: 'node-b', selected: true,
        };
        let nodes = [previousNode, targetNode];
        let edges = [previousEdge];
        const setNodes: Dispatch<SetStateAction<Node[]>> = update => {
            nodes = applyStateUpdate(update, nodes);
        };
        const setEdges: Dispatch<SetStateAction<Edge[]>> = update => {
            edges = applyStateUpdate(update, edges);
        };
        const setSelectedNodes = vi.fn<Dispatch<SetStateAction<Node[]>>>();
        const setSelectedEdges = vi.fn<Dispatch<SetStateAction<Edge[]>>>();
        const wrapper = document.createElement('div');
        vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
            top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600,
            x: 0, y: 0, toJSON: () => ({}),
        });
        const { result } = renderHook(() => useDesignerContextMenu({
            reactFlowWrapper: { current: wrapper },
            selectedNodes: [previousNode],
            selectedEdges: [previousEdge],
            setNodes,
            setEdges,
            setSelectedNodes,
            setSelectedEdges,
        }));

        act(() => result.current.onNodeContextMenu(createContextMenuEvent(), targetNode));

        expect(nodes.map(node => [node.id, node.selected])).toEqual([
            ['node-a', false],
            ['node-b', true],
        ]);
        expect(edges[0].selected).toBe(false);
        expect(setSelectedNodes).toHaveBeenCalledWith([targetNode]);
        expect(setSelectedEdges).toHaveBeenCalledWith([]);
        expect(useDiagramStore.getState().contextMenu).toMatchObject({
            type: 'node',
            targetId: 'node-b',
        });
    });

    it('makes an edge the sole visible and scoped target before opening its menu', () => {
        const node: Node = {
            id: 'node-a', position: { x: 0, y: 0 }, data: {}, selected: true,
        };
        const edge: Edge = {
            id: 'edge-a', source: 'node-a', target: 'node-b', selected: false,
        };
        let nodes = [node];
        let edges = [edge];
        const setNodes: Dispatch<SetStateAction<Node[]>> = update => {
            nodes = applyStateUpdate(update, nodes);
        };
        const setEdges: Dispatch<SetStateAction<Edge[]>> = update => {
            edges = applyStateUpdate(update, edges);
        };
        const setSelectedNodes = vi.fn<Dispatch<SetStateAction<Node[]>>>();
        const setSelectedEdges = vi.fn<Dispatch<SetStateAction<Edge[]>>>();
        const wrapper = document.createElement('div');
        vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
            top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600,
            x: 0, y: 0, toJSON: () => ({}),
        });
        const { result } = renderHook(() => useDesignerContextMenu({
            reactFlowWrapper: { current: wrapper },
            selectedNodes: [node],
            selectedEdges: [],
            setNodes,
            setEdges,
            setSelectedNodes,
            setSelectedEdges,
        }));

        act(() => result.current.onEdgeContextMenu(createContextMenuEvent(), edge));

        expect(nodes[0].selected).toBe(false);
        expect(edges[0].selected).toBe(true);
        expect(setSelectedNodes).toHaveBeenCalledWith([]);
        expect(setSelectedEdges).toHaveBeenCalledWith([edge]);
        expect(useDiagramStore.getState().contextMenu).toMatchObject({
            type: 'edge',
            targetId: 'edge-a',
        });
    });
});
