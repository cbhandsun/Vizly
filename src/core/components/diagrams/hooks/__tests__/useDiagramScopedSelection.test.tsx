// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { useDiagramScopedSelection } from '../useDiagramScopedSelection';

describe('useDiagramScopedSelection', () => {
    it('does not expose a previous diagram selection after the identity changes', () => {
        const { result, rerender } = renderHook(
            ({ diagramId, nodes }) => useDiagramScopedSelection(diagramId, nodes, []),
            { initialProps: { diagramId: 'diagram-a', nodes: [] as Node[] } },
        );
        const selectedNode: Node = {
            id: 'node-a',
            position: { x: 0, y: 0 },
            data: {},
        };

        rerender({ diagramId: 'diagram-a', nodes: [selectedNode] });
        act(() => result.current.setSelectedNodes([selectedNode]));
        expect(result.current.selectedNodes).toEqual([selectedNode]);

        rerender({ diagramId: 'diagram-b', nodes: [selectedNode] });

        expect(result.current.selectedNodes).toEqual([]);
        expect(result.current.selectedEdges).toEqual([]);
    });

    it('applies functional updates against an empty selection in a new diagram', () => {
        const { result, rerender } = renderHook(
            ({ diagramId, nodes }) => useDiagramScopedSelection(diagramId, nodes, []),
            { initialProps: { diagramId: 'diagram-a', nodes: [] as Node[] } },
        );
        const firstNode: Node = {
            id: 'node-a',
            position: { x: 0, y: 0 },
            data: {},
        };
        rerender({ diagramId: 'diagram-a', nodes: [firstNode] });
        act(() => result.current.setSelectedNodes([firstNode]));

        const secondNode: Node = {
            id: 'node-b',
            position: { x: 10, y: 20 },
            data: {},
        };
        rerender({ diagramId: 'diagram-b', nodes: [secondNode] });
        act(() => result.current.setSelectedNodes(previous => [...previous, secondNode]));

        expect(result.current.selectedNodes.map(node => node.id)).toEqual(['node-b']);
    });

    it('resolves selected entities from the latest diagram state after history changes', () => {
        const initialNode: Node = {
            id: 'node-a',
            position: { x: 0, y: 0 },
            data: { label: 'Before' },
        };
        const initialEdge: Edge = {
            id: 'edge-a',
            source: 'node-a',
            target: 'node-b',
            data: { label: 'Before edge' },
        };
        const { result, rerender } = renderHook(
            ({ nodes, edges }) => useDiagramScopedSelection('diagram-a', nodes, edges),
            { initialProps: { nodes: [initialNode], edges: [initialEdge] } },
        );

        act(() => {
            result.current.setSelectedNodes([initialNode]);
            result.current.setSelectedEdges([initialEdge]);
        });

        const restoredNode: Node = {
            ...initialNode,
            data: { label: 'Restored' },
        };
        const restoredEdge: Edge = {
            ...initialEdge,
            data: { label: 'Restored edge' },
        };
        rerender({ nodes: [restoredNode], edges: [restoredEdge] });

        expect(result.current.selectedNodes[0]).toBe(restoredNode);
        expect(result.current.selectedNodes[0].data.label).toBe('Restored');
        expect(result.current.selectedEdges[0]).toBe(restoredEdge);
        expect(result.current.selectedEdges[0].data?.label).toBe('Restored edge');
    });

    it('clears node and edge ids through a stable page-lifecycle boundary', () => {
        const selectedNode: Node = {
            id: 'node-a',
            position: { x: 0, y: 0 },
            data: {},
        };
        const selectedEdge: Edge = {
            id: 'edge-a',
            source: 'node-a',
            target: 'node-b',
        };
        const { result, rerender } = renderHook(
            ({ nodes }) => useDiagramScopedSelection('diagram-a', nodes, [selectedEdge]),
            { initialProps: { nodes: [selectedNode] } },
        );
        const initialClearSelection = result.current.clearSelection;

        act(() => {
            result.current.setSelectedNodes([selectedNode]);
            result.current.setSelectedEdges([selectedEdge]);
        });
        expect(result.current.selectedNodes).toHaveLength(1);
        expect(result.current.selectedEdges).toHaveLength(1);

        rerender({ nodes: [{ ...selectedNode, data: { updated: true } }] });
        expect(result.current.clearSelection).toBe(initialClearSelection);

        act(() => result.current.clearSelection());
        expect(result.current.selectedNodes).toEqual([]);
        expect(result.current.selectedEdges).toEqual([]);
    });
});
