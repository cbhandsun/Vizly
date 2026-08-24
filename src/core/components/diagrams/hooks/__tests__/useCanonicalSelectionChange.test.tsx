// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDiagramStore } from '../../../../store/useDiagramStore';
import { useCanonicalSelectionChange } from '../useCanonicalSelectionChange';

describe('useCanonicalSelectionChange', () => {
    beforeEach(() => {
        useDiagramStore.setState({ selectedNodes: [], selectedEdges: [] });
    });

    it('defers UI projections while preserving canonical store selections', () => {
        const canonicalNode = {
            id: 'node-1',
            position: { x: 10, y: 20 },
            data: { label: 'canonical node' },
        } satisfies Node;
        const canonicalEdge = {
            id: 'edge-1',
            source: 'node-1',
            target: 'node-2',
            data: { label: 'canonical edge' },
        } satisfies Edge;
        const staleNode = { ...canonicalNode, data: { label: 'stale node' } };
        const staleEdge = { ...canonicalEdge, data: { label: 'stale edge' } };
        const setSelectedNodes = vi.fn();
        const setSelectedEdges = vi.fn();
        const { result } = renderHook(() => useCanonicalSelectionChange({
            nodesRef: { current: [canonicalNode] },
            edgesRef: { current: [canonicalEdge] },
            setSelectedNodes,
            setSelectedEdges,
        }));

        act(() => result.current({ nodes: [staleNode], edges: [staleEdge] }));

        expect(setSelectedNodes).toHaveBeenCalledWith([canonicalNode]);
        expect(setSelectedEdges).toHaveBeenCalledWith([canonicalEdge]);
        expect(useDiagramStore.getState().selectedNodes).toEqual([canonicalNode]);
        expect(useDiagramStore.getState().selectedEdges).toEqual([canonicalEdge]);
    });
});
