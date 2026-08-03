// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
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
