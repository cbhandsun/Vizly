// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFlowchartSearchReplaceActions } from '../hooks/useFlowchartSearchReplaceActions';
import type { FlowchartReplaceResult } from '../flowchartSearchReplace';

describe('useFlowchartSearchReplaceActions', () => {
    const edges: Edge[] = [];

    it('takes one snapshot and applies the planned substring replacement', () => {
        const nodes: Node[] = [{
            id: 'node-1',
            position: { x: 0, y: 0 },
            data: { label: 'Circle circle' },
        }];
        const setNodes = vi.fn();
        const takeSnapshot = vi.fn();
        const { result } = renderHook(() => useFlowchartSearchReplaceActions({
            setNodes,
            getNodes: () => nodes,
            getEdges: () => edges,
            takeSnapshot,
        }));

        let replaceResult: FlowchartReplaceResult | undefined;
        act(() => {
            replaceResult = result.current.handleSearchReplaceNode('node-1', 'circle', 'Square');
        });

        expect(replaceResult?.changedIds).toEqual(['node-1']);
        expect(takeSnapshot).toHaveBeenCalledOnce();
        expect(takeSnapshot).toHaveBeenCalledWith(nodes, edges);
        expect(setNodes).toHaveBeenCalledWith([
            { ...nodes[0], data: { label: 'Square Square' } },
        ]);
    });

    it('does not create history or state updates for locked, blank, or unchanged results', () => {
        const nodes: Node[] = [
            {
                id: 'locked',
                position: { x: 0, y: 0 },
                data: { label: 'Circle', locked: true },
            },
            {
                id: 'plain',
                position: { x: 10, y: 10 },
                data: { label: 'Circle' },
            },
        ];
        const setNodes = vi.fn();
        const takeSnapshot = vi.fn();
        const { result } = renderHook(() => useFlowchartSearchReplaceActions({
            setNodes,
            getNodes: () => nodes,
            getEdges: () => edges,
            takeSnapshot,
        }));

        act(() => {
            result.current.handleSearchReplaceNode('locked', 'Circle', 'Square');
            result.current.handleSearchReplaceNode('plain', 'Circle', '   ');
            result.current.handleSearchReplaceNode('plain', 'Circle', 'Circle');
        });

        expect(takeSnapshot).not.toHaveBeenCalled();
        expect(setNodes).not.toHaveBeenCalled();
    });
});
