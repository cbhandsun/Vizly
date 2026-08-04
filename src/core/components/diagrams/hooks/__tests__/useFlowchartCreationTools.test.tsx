// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import type { TFunction } from 'i18next';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useFlowchartCreationTools } from '../useFlowchartCreationTools';

describe('useFlowchartCreationTools', () => {
    it('adds a freehand node in one history step without requiring a mounted flow instance', () => {
        const existingNode = { id: 'existing', position: { x: 0, y: 0 }, data: {} } satisfies Node;
        const nodesRef = { current: [existingNode] } satisfies MutableRefObject<Node[]>;
        const edgesRef = { current: [] } satisfies MutableRefObject<Edge[]>;
        const takeSnapshot = vi.fn();
        const setNodes = vi.fn() as unknown as Dispatch<SetStateAction<Node[]>>;
        const { result } = renderHook(() => useFlowchartCreationTools({
            editingEnabled: true,
            isDrawingMode: true,
            isMarqueeActive: false,
            setIsDrawingMode: vi.fn(),
            setIsMarqueeActive: vi.fn(),
            activeLayerId: 'layer-7',
            nodesRef,
            edgesRef,
            reactFlowInstance: null as ReactFlowInstance | null,
            setNodes,
            takeSnapshot,
            t: ((key: string) => key) as TFunction,
        }));

        act(() => result.current.handleAddFreehandStroke({
            points: [[10, 20, 0.5], [30, 40, 0.5]],
            color: '#123456',
            size: 4,
        }));

        expect(takeSnapshot).toHaveBeenCalledOnce();
        expect(takeSnapshot).toHaveBeenCalledWith(nodesRef.current, edgesRef.current);
        expect(setNodes).toHaveBeenCalledOnce();
        const update = vi.mocked(setNodes).mock.calls[0][0];
        expect(typeof update).toBe('function');
        if (typeof update !== 'function') throw new Error('Expected functional node update');
        const nextNodes = update(nodesRef.current);
        expect(nextNodes).toHaveLength(2);
        expect(nextNodes[1]).toMatchObject({
            type: 'freehand',
            data: { layer: 'layer-7', color: '#123456' },
        });
    });
});
