// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFlowchartSearchReplaceActions } from '../hooks/useFlowchartSearchReplaceActions';
import type { FlowchartCanvasReplaceResult } from '../flowchartSearchReplace';

describe('useFlowchartSearchReplaceActions', () => {
    const edges: Edge[] = [];

    it('takes one snapshot and applies the planned substring replacement', () => {
        const nodes: Node[] = [{
            id: 'node-1',
            position: { x: 0, y: 0 },
            data: { label: 'Circle circle' },
        }];
        const setNodes = vi.fn();
        const setEdges = vi.fn();
        const takeSnapshot = vi.fn();
        const { result } = renderHook(() => useFlowchartSearchReplaceActions({
            setNodes,
            setEdges,
            getNodes: () => nodes,
            getEdges: () => edges,
            takeSnapshot,
        }));

        let replaceResult: FlowchartCanvasReplaceResult | undefined;
        act(() => {
            replaceResult = result.current.handleSearchReplaceMatch(
                { kind: 'node', id: 'node-1' },
                'circle',
                'Square',
            );
        });

        expect(replaceResult?.changedMatches).toEqual([{ kind: 'node', id: 'node-1' }]);
        expect(takeSnapshot).toHaveBeenCalledOnce();
        expect(takeSnapshot).toHaveBeenCalledWith(nodes, edges);
        expect(setNodes).toHaveBeenCalledWith([
            { ...nodes[0], data: { label: 'Square Square' } },
        ]);
        expect(setEdges).not.toHaveBeenCalled();
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
        const setEdges = vi.fn();
        const takeSnapshot = vi.fn();
        const { result } = renderHook(() => useFlowchartSearchReplaceActions({
            setNodes,
            setEdges,
            getNodes: () => nodes,
            getEdges: () => edges,
            takeSnapshot,
        }));

        act(() => {
            result.current.handleSearchReplaceMatch({ kind: 'node', id: 'locked' }, 'Circle', 'Square');
            result.current.handleSearchReplaceMatch({ kind: 'node', id: 'plain' }, 'Circle', '   ');
            result.current.handleSearchReplaceMatch({ kind: 'node', id: 'plain' }, 'Circle', 'Circle');
        });

        expect(takeSnapshot).not.toHaveBeenCalled();
        expect(setNodes).not.toHaveBeenCalled();
        expect(setEdges).not.toHaveBeenCalled();
    });

    it('updates an edge label and keeps node state untouched in the same history step', () => {
        const nodes: Node[] = [
            { id: 'source', position: { x: 0, y: 0 }, data: { label: 'Source' } },
            { id: 'target', position: { x: 100, y: 0 }, data: { label: 'Target' } },
        ];
        const currentEdges: Edge[] = [{
            id: 'edge-fee',
            source: 'source',
            target: 'target',
            label: '运输费用',
            data: { label: '运输费用' },
        }];
        const setNodes = vi.fn();
        const setEdges = vi.fn();
        const takeSnapshot = vi.fn();
        const { result } = renderHook(() => useFlowchartSearchReplaceActions({
            setNodes,
            setEdges,
            getNodes: () => nodes,
            getEdges: () => currentEdges,
            takeSnapshot,
        }));

        act(() => {
            result.current.handleSearchReplaceMatch(
                { kind: 'edge', id: 'edge-fee' },
                '运输',
                '配送',
            );
        });

        expect(takeSnapshot).toHaveBeenCalledWith(nodes, currentEdges);
        expect(setNodes).not.toHaveBeenCalled();
        expect(setEdges).toHaveBeenCalledWith([{
            ...currentEdges[0],
            label: '配送费用',
            data: { label: '配送费用' },
        }]);
    });
});
