// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { useDiagramScopedSelection } from '../useDiagramScopedSelection';

describe('useDiagramScopedSelection', () => {
    it('does not expose a previous diagram selection after the identity changes', () => {
        const { result, rerender } = renderHook(
            ({ diagramId }) => useDiagramScopedSelection(diagramId),
            { initialProps: { diagramId: 'diagram-a' } },
        );
        const selectedNode: Node = {
            id: 'node-a',
            position: { x: 0, y: 0 },
            data: {},
        };

        act(() => result.current.setSelectedNodes([selectedNode]));
        expect(result.current.selectedNodes).toEqual([selectedNode]);

        rerender({ diagramId: 'diagram-b' });

        expect(result.current.selectedNodes).toEqual([]);
        expect(result.current.selectedEdges).toEqual([]);
    });

    it('applies functional updates against an empty selection in a new diagram', () => {
        const { result, rerender } = renderHook(
            ({ diagramId }) => useDiagramScopedSelection(diagramId),
            { initialProps: { diagramId: 'diagram-a' } },
        );
        act(() => result.current.setSelectedNodes([{
            id: 'node-a',
            position: { x: 0, y: 0 },
            data: {},
        }]));

        rerender({ diagramId: 'diagram-b' });
        act(() => result.current.setSelectedNodes(previous => [...previous, {
            id: 'node-b',
            position: { x: 10, y: 20 },
            data: {},
        }]));

        expect(result.current.selectedNodes.map(node => node.id)).toEqual(['node-b']);
    });
});
