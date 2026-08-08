// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useDiagramStore } from '../../../../store/useDiagramStore';
import { useFlowchartState } from '../useFlowchartState';

const node = (id: string, x: number): Node => ({
    id,
    position: { x, y: 0 },
    data: {},
});

describe('useFlowchartState history ref boundaries', () => {
    beforeEach(() => {
        useDiagramStore.setState({ nodes: [], edges: [] });
    });

    it('updates live refs atomically across immediate undo and redo', () => {
        const initial = [node('node-1', 0)];
        const moved = [node('node-1', 120)];
        useDiagramStore.setState({ nodes: initial, edges: [] });
        const { result } = renderHook(() => useFlowchartState());

        act(() => {
            result.current.diagramHistory.takeSnapshot(initial, [], '移动节点前');
            result.current.setNodes(moved);
        });
        expect(result.current.nodesRef.current).toEqual(moved);

        act(() => {
            expect(result.current.diagramHistory.undo()).toBe(true);
            expect(result.current.nodesRef.current).toEqual(initial);
            expect(result.current.diagramHistory.redo()).toBe(true);
            expect(result.current.nodesRef.current).toEqual(moved);
        });

        expect(useDiagramStore.getState().nodes).toEqual(moved);
    });

    it('updates live refs before a history jump can be persisted by another operation', () => {
        const first = [node('node-1', 0)];
        const second = [node('node-1', 80)];
        const current = [node('node-1', 160)];
        useDiagramStore.setState({ nodes: current, edges: [] });
        const { result } = renderHook(() => useFlowchartState());

        act(() => {
            result.current.diagramHistory.takeSnapshot(first, [], '初始状态');
            result.current.diagramHistory.takeSnapshot(second, [], '第二状态');
            result.current.diagramHistory.jumpTo(0);
            expect(result.current.nodesRef.current).toEqual(first);
        });

        expect(useDiagramStore.getState().nodes).toEqual(first);
    });
});
