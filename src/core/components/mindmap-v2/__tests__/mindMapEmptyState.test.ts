import { describe, expect, it, vi } from 'vitest';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';

import { bindMindMapEmptyState, readMindMapEmptyState } from '../mindMapEmptyState';

describe('mind map empty state', () => {
    it('derives emptiness from root children without traversing an untrusted tree', () => {
        const getData = (children?: NodeObj[]) => () => ({
            nodeData: { id: 'root', topic: 'Root', children },
        });

        expect(readMindMapEmptyState({ getData: getData() } as Pick<MindElixirInstance, 'getData'>)).toBe(true);
        expect(readMindMapEmptyState({
            getData: getData([{ id: 'child', topic: 'Child', children: [] } as NodeObj]),
        } as Pick<MindElixirInstance, 'getData'>)).toBe(false);
    });

    it('rechecks after DOM refreshes so undo cannot leave the empty guide stale', () => {
        const operationListener: { current: (() => void) | null } = { current: null };
        const mutationListener: { current: (() => void) | null } = { current: null };
        let children: NodeObj[] = [];
        const scheduled: Array<() => void> = [];
        const onChange = vi.fn();
        const disconnect = vi.fn();
        const removeListener = vi.fn();
        const mind = {
            bus: {
                addListener: (_event: string, listener: () => void) => { operationListener.current = listener; },
                removeListener,
            },
            container: {} as Node,
            getData: () => ({ nodeData: { id: 'root', topic: 'Root', children } }),
        } as unknown as MindElixirInstance;

        const cleanup = bindMindMapEmptyState({
            mind,
            onChange,
            onFailure: vi.fn(),
            dependencies: {
                createObserver: listener => {
                    mutationListener.current = listener;
                    return { disconnect, observe: vi.fn() };
                },
                schedule: callback => scheduled.push(callback),
            },
        });

        scheduled.shift()?.();
        expect(onChange).toHaveBeenLastCalledWith(true);

        children = [{ id: 'restored', topic: 'Restored', children: [] } as NodeObj];
        mutationListener.current?.();
        mutationListener.current?.();
        expect(scheduled).toHaveLength(1);
        scheduled.shift()?.();
        expect(onChange).toHaveBeenLastCalledWith(false);

        operationListener.current?.();
        cleanup();
        scheduled.shift()?.();
        expect(onChange).toHaveBeenCalledTimes(2);
        expect(removeListener).toHaveBeenCalledWith('operation', expect.any(Function));
        expect(disconnect).toHaveBeenCalledTimes(1);
    });
});
