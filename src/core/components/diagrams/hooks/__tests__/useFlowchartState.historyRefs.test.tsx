// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
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

    it('restores focus to the selected node when undo replaces the focused empty state', () => {
        const restored = [{ ...node('node-1', 0), selected: true }];
        useDiagramStore.setState({ nodes: restored, edges: [] });
        const frames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frames.push(callback);
            return frames.length;
        });
        const { result } = renderHook(() => useFlowchartState());

        act(() => {
            result.current.diagramHistory.takeSnapshot(restored, [], '删除节点前');
            result.current.setNodes([]);
        });
        document.body.innerHTML = '<button class="flowchart-empty-action">Choose a shape</button>';
        const emptyAction = document.querySelector<HTMLButtonElement>('.flowchart-empty-action');
        if (!emptyAction) throw new Error('test fixture missing');
        emptyAction.focus();

        act(() => {
            expect(result.current.diagramHistory.undo()).toBe(true);
        });
        document.body.innerHTML = `
            <div class="react-flow__node" data-id="node-1" tabindex="0">
                <div id="restored-node" role="treeitem" aria-selected="true" tabindex="0"></div>
            </div>
        `;
        act(() => {
            frames.shift()?.(0);
        });

        expect(document.activeElement?.id).toBe('restored-node');
        expect(useDiagramStore.getState().nodes).toEqual(restored);
    });

    it('restores focus to the empty action when redo removes the focused final node', () => {
        const restored = [{ ...node('node-1', 0), selected: true }];
        useDiagramStore.setState({ nodes: restored, edges: [] });
        const frames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frames.push(callback);
            return frames.length;
        });
        const { result } = renderHook(() => useFlowchartState());

        act(() => {
            result.current.diagramHistory.takeSnapshot(restored, [], '删除节点前');
            result.current.setNodes([]);
        });
        document.body.innerHTML = '<button class="flowchart-empty-action">Choose a shape</button>';
        const firstEmptyAction = document.querySelector<HTMLButtonElement>('.flowchart-empty-action');
        if (!firstEmptyAction) throw new Error('test fixture missing');
        firstEmptyAction.focus();
        act(() => {
            expect(result.current.diagramHistory.undo()).toBe(true);
        });
        document.body.innerHTML = `
            <div class="react-flow__node" data-id="node-1" tabindex="0">
                <div id="restored-node" role="treeitem" aria-selected="true" tabindex="0"></div>
            </div>
        `;
        act(() => {
            frames.shift()?.(0);
        });
        const restoredNode = document.querySelector<HTMLElement>('#restored-node');
        if (!restoredNode) throw new Error('test fixture missing');
        restoredNode.focus();

        act(() => {
            expect(result.current.diagramHistory.redo()).toBe(true);
        });
        document.body.innerHTML = '<button id="empty-after-redo" class="flowchart-empty-action">Choose a shape</button>';
        act(() => {
            frames.shift()?.(16);
        });

        expect(document.activeElement?.id).toBe('empty-after-redo');
        expect(useDiagramStore.getState().nodes).toEqual([]);
    });
});
