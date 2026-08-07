// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import type { SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useDesignerBatchUpdates } from '../useDesignerBatchUpdates';

const node = (id: string, locked = false): Node => ({
    id,
    position: { x: 0, y: 0 },
    data: { label: id, locked },
    draggable: !locked,
});

describe('useDesignerBatchUpdates locked node boundary', () => {
    it('updates editable targets and records one snapshot', () => {
        const initialNodes = [node('editable')];
        let currentNodes = initialNodes;
        const setNodes = vi.fn((update: SetStateAction<Node[]>) => {
            currentNodes = typeof update === 'function' ? update(currentNodes) : update;
        });
        const takeSnapshot = vi.fn();

        const { result } = renderHook(() => useDesignerBatchUpdates({
            nodes: initialNodes,
            edges: [],
            setNodes,
            setEdges: vi.fn(),
            setSelectedNodes: vi.fn(),
            setSelectedEdges: vi.fn(),
            takeSnapshot,
        }));

        act(() => result.current.updateNodesBatch(['editable'], { label: 'updated' }));

        expect(currentNodes[0].data.label).toBe('updated');
        expect(takeSnapshot).toHaveBeenCalledTimes(1);
    });

    it('rejects the whole mixed update when any target is protected', () => {
        const initialNodes = [node('editable'), node('locked', true)];
        const setNodes = vi.fn();
        const takeSnapshot = vi.fn();

        const { result } = renderHook(() => useDesignerBatchUpdates({
            nodes: initialNodes,
            edges: [],
            setNodes,
            setEdges: vi.fn(),
            setSelectedNodes: vi.fn(),
            setSelectedEdges: vi.fn(),
            takeSnapshot,
        }));

        act(() => result.current.updateNodesBatch(['editable', 'locked'], { label: 'blocked' }));

        expect(setNodes).not.toHaveBeenCalled();
        expect(takeSnapshot).not.toHaveBeenCalled();
    });
});

describe('useDesignerBatchUpdates edge history boundary', () => {
    const initialEdge: Edge = {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        label: 'Original',
        data: { label: 'Original' },
    };

    it('records one snapshot and synchronizes controlled selection for an edge edit', () => {
        const takeSnapshot = vi.fn();
        const setEdges = vi.fn();
        let selectedEdges = [initialEdge];
        const setSelectedEdges = vi.fn((update: SetStateAction<Edge[]>) => {
            selectedEdges = typeof update === 'function' ? update(selectedEdges) : update;
        });
        const { result } = renderHook(() => useDesignerBatchUpdates({
            nodes: [],
            edges: [initialEdge],
            setNodes: vi.fn(),
            setEdges,
            setSelectedNodes: vi.fn(),
            setSelectedEdges,
            takeSnapshot,
        }));

        act(() => result.current.updateEdgesBatch(['edge-1'], { label: 'Updated' }));

        expect(takeSnapshot).toHaveBeenCalledWith([], [initialEdge]);
        expect(takeSnapshot).toHaveBeenCalledTimes(1);
        expect(setEdges).toHaveBeenCalledTimes(1);
        expect(selectedEdges[0].label).toBe('Updated');
        expect(selectedEdges[0].data?.label).toBe('Updated');
    });

    it('does not create history or state writes for no-op, missing, or protected targets', () => {
        const lockedEdge: Edge = {
            ...initialEdge,
            id: 'edge-locked',
            data: { label: 'Original', locked: true },
        };
        const setEdges = vi.fn();
        const setSelectedEdges = vi.fn();
        const takeSnapshot = vi.fn();
        const { result } = renderHook(() => useDesignerBatchUpdates({
            nodes: [],
            edges: [initialEdge, lockedEdge],
            setNodes: vi.fn(),
            setEdges,
            setSelectedNodes: vi.fn(),
            setSelectedEdges,
            takeSnapshot,
        }));

        act(() => result.current.updateEdgesBatch(['edge-1'], { label: 'Original' }));
        act(() => result.current.updateEdgesBatch(['missing'], { label: 'Updated' }));
        act(() => result.current.updateEdgesBatch(['edge-locked'], { label: 'Updated' }));

        expect(takeSnapshot).not.toHaveBeenCalled();
        expect(setEdges).not.toHaveBeenCalled();
        expect(setSelectedEdges).not.toHaveBeenCalled();
    });
});
