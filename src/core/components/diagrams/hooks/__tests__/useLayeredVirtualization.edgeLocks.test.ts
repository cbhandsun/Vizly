// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, EdgeChange } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { useLayeredVirtualization } from '../useLayeredVirtualization';

describe('useLayeredVirtualization edge locks', () => {
    it('keeps locked connectors selectable while blocking removal and endpoint changes', () => {
        const lockedEdge: Edge = {
            id: 'edge-locked',
            source: 'source',
            target: 'target',
            data: { locked: true },
            deletable: false,
            reconnectable: false,
        };
        const onEdgesChange = vi.fn();
        const { result } = renderHook(() => useLayeredVirtualization({
            nodes: [],
            edges: [lockedEdge],
            virtualizedNodes: [],
            edgesWithCollapseState: [lockedEdge],
            layers: [],
            getLayer: () => undefined,
            isDragging: false,
            onNodesChange: vi.fn(),
            onEdgesChange,
        }));

        const changes: EdgeChange[] = [
            { id: lockedEdge.id, type: 'select', selected: true },
            { id: lockedEdge.id, type: 'remove' },
            { id: lockedEdge.id, type: 'replace', item: { ...lockedEdge, target: 'next' } },
        ];
        act(() => result.current.onEdgesChangeWithLock(changes));

        expect(onEdgesChange).toHaveBeenCalledWith([
            { id: lockedEdge.id, type: 'select', selected: true },
        ]);
    });
});
