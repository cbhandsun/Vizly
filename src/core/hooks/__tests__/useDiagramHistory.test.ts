import { act, renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { useDiagramHistory } from '../useDiagramHistory';

const node = (id: string, x: number): Node => ({
    id,
    position: { x, y: 0 },
    data: {},
});

describe('useDiagramHistory', () => {
    it('enables undo for the first pre-operation snapshot', () => {
        const initial = [node('node-1', 0)];
        const { result } = renderHook(() => useDiagramHistory([], []));

        act(() => result.current.takeSnapshot(initial, [], '移动节点'));

        expect(result.current.canUndo).toBe(true);
        expect(result.current.pastEntries).toHaveLength(1);
        expect(result.current.getPreviousState()).toEqual({ nodes: initial, edges: [] });
    });

    it('records a drag snapshot without refreshing history UI until the gesture commits', () => {
        const initial = [node('node-1', 0)];
        const { result } = renderHook(() => useDiagramHistory([], []));

        act(() => {
            result.current.takeSnapshot(initial, [], '移动节点', {
                notify: false,
                dedupe: false,
            });
        });

        expect(result.current.canUndo).toBe(false);
        expect(result.current.pastEntries).toHaveLength(0);
        expect(result.current.getPreviousState()).toEqual({ nodes: initial, edges: [] });

        act(() => result.current.notifyHistoryChanged());

        expect(result.current.canUndo).toBe(true);
        expect(result.current.pastEntries).toHaveLength(1);
        expect(result.current.pastEntries[0]).toMatchObject({
            patch: [],
            changeCount: 1,
        });
    });

    it('surfaces and relabels a matching silent snapshot for the next named operation', () => {
        const initial = [node('node-1', 0)];
        const { result } = renderHook(() => useDiagramHistory([], []));

        act(() => {
            result.current.takeSnapshot(initial, [], '移动节点', {
                notify: false,
                dedupe: false,
            });
            result.current.takeSnapshot(initial, [], '复制 1 个节点前');
        });

        expect(result.current.canUndo).toBe(true);
        expect(result.current.canRedo).toBe(false);
        expect(result.current.pastEntries).toHaveLength(1);
        expect(result.current.pastEntries[0]).toMatchObject({
            label: '复制 1 个节点前',
            patch: [],
            changeCount: 1,
        });
    });

    it('undoes and redoes the first edit using the live current state', () => {
        const initial = [node('node-1', 0)];
        const moved = [node('node-1', 100)];
        const { result } = renderHook(() => useDiagramHistory([], []));
        act(() => result.current.takeSnapshot(initial, [], '移动节点'));

        let restored: ReturnType<typeof result.current.undo> = null;
        act(() => {
            restored = result.current.undo(moved, []);
        });
        expect(restored).toEqual({ nodes: initial, edges: [] });
        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(true);

        let redone: ReturnType<typeof result.current.redo> = null;
        act(() => {
            redone = result.current.redo(initial, []);
        });
        expect(redone).toEqual({ nodes: moved, edges: [] });
        expect(result.current.canUndo).toBe(true);
        expect(result.current.canRedo).toBe(false);
    });

    it('walks multiple snapshots in order and ignores duplicate snapshots', () => {
        const first = [node('node-1', 0)];
        const second = [node('node-1', 100)];
        const third = [node('node-1', 200)];
        const { result } = renderHook(() => useDiagramHistory([], []));
        act(() => {
            result.current.takeSnapshot(first, []);
            result.current.takeSnapshot(first, []);
            result.current.takeSnapshot(second, []);
        });
        expect(result.current.pastEntries).toHaveLength(2);

        let restored: ReturnType<typeof result.current.undo> = null;
        act(() => {
            restored = result.current.undo(third, []);
        });
        expect(restored).toEqual({ nodes: second, edges: [] });
        act(() => {
            restored = result.current.undo(second, []);
        });
        expect(restored).toEqual({ nodes: first, edges: [] });
    });

    it('jumps to a prior snapshot and keeps later states redoable', () => {
        const first = [node('node-1', 0)];
        const second = [node('node-1', 100)];
        const third = [node('node-1', 200)];
        const current = [node('node-1', 300)];
        const { result } = renderHook(() => useDiagramHistory([], []));
        act(() => {
            result.current.takeSnapshot(first, []);
            result.current.takeSnapshot(second, []);
            result.current.takeSnapshot(third, []);
        });

        let jumped: ReturnType<typeof result.current.jumpTo> = null;
        act(() => {
            jumped = result.current.jumpTo(1, current, []);
        });
        expect(jumped).toEqual({ nodes: second, edges: [] });
        expect(result.current.canRedo).toBe(true);

        let redone: ReturnType<typeof result.current.redo> = null;
        act(() => {
            redone = result.current.redo(second, []);
        });
        expect(redone).toEqual({ nodes: third, edges: [] });
    });

    it('isolates undo and redo entries between page scopes', () => {
        const pageOneInitial = [node('page-1-node', 0)];
        const pageOneCurrent = [node('page-1-node', 100)];
        const pageTwoInitial = [node('page-2-node', 20)];
        const pageTwoCurrent = [node('page-2-node', 200)];
        const { result } = renderHook(() => useDiagramHistory([], []));

        act(() => {
            result.current.switchScope('page-1');
            result.current.takeSnapshot(pageOneInitial, [], '移动第 1 页节点');
        });
        expect(result.current.canUndo).toBe(true);

        act(() => result.current.switchScope('page-2'));
        expect(result.current.canUndo).toBe(false);
        expect(result.current.getPreviousState()).toBeNull();

        act(() => result.current.takeSnapshot(pageTwoInitial, [], '移动第 2 页节点'));
        let restored: ReturnType<typeof result.current.undo> = null;
        act(() => {
            restored = result.current.undo(pageTwoCurrent, []);
        });
        expect(restored).toEqual({ nodes: pageTwoInitial, edges: [] });
        expect(result.current.canRedo).toBe(true);

        act(() => result.current.switchScope('page-1'));
        expect(result.current.canUndo).toBe(true);
        expect(result.current.canRedo).toBe(false);
        expect(result.current.getPreviousState()).toEqual({ nodes: pageOneInitial, edges: [] });

        act(() => {
            restored = result.current.undo(pageOneCurrent, []);
        });
        expect(restored).toEqual({ nodes: pageOneInitial, edges: [] });
    });

    it('discards a removed page scope without affecting another page', () => {
        const pageOneInitial = [node('page-1-node', 0)];
        const pageTwoInitial = [node('page-2-node', 0)];
        const { result } = renderHook(() => useDiagramHistory([], []));

        act(() => {
            result.current.switchScope('page-1');
            result.current.takeSnapshot(pageOneInitial, []);
            result.current.switchScope('page-2');
            result.current.takeSnapshot(pageTwoInitial, []);
            result.current.removeScope('page-2');
            result.current.switchScope('page-2');
        });

        expect(result.current.canUndo).toBe(false);
        expect(result.current.getPreviousState()).toBeNull();

        act(() => result.current.switchScope('page-1'));
        expect(result.current.canUndo).toBe(true);
        expect(result.current.getPreviousState()).toEqual({ nodes: pageOneInitial, edges: [] });
    });
});
