import { describe, expect, it, vi } from 'vitest';
import type { MindElixirData, MindElixirInstance, NodeObj } from 'mind-elixir';
import {
    applyMindMapAutoArrangeTransaction,
    arrangeMindMapTree,
    getRootSideWeights,
    hasMindMapAutoArrangeChange,
} from '../mindmapAutoArrange';
import { cleanAndValidateTree } from '../mindmapTreeSanitizer';

const createTree = (): NodeObj => ({
    id: 'root',
    topic: 'Root',
    children: [
        {
            id: 'big',
            topic: 'Big',
            direction: 1,
            children: [
                { id: 'big-1', topic: '1', children: [] },
                { id: 'big-2', topic: '2', children: [] },
            ],
        },
        { id: 'small-1', topic: 'Small 1', direction: 1, children: [] },
        { id: 'small-2', topic: 'Small 2', direction: 1, children: [] },
        { id: 'small-3', topic: 'Small 3', direction: 1, children: [] },
    ],
});

describe('arrangeMindMapTree', () => {
    it('balances root branches by subtree weight without mutating input', () => {
        const root: NodeObj = {
            id: 'root',
            topic: '中心',
            children: [
                {
                    id: 'big',
                    topic: '大分支',
                    children: [
                        { id: 'big-1', topic: '1', children: [] },
                        { id: 'big-2', topic: '2', children: [] },
                        { id: 'big-3', topic: '3', children: [] },
                    ],
                },
                { id: 'small-1', topic: '小分支 1', children: [] },
                { id: 'small-2', topic: '小分支 2', children: [] },
                { id: 'small-3', topic: '小分支 3', children: [] },
            ],
        };

        const arranged = arrangeMindMapTree(root);
        const weights = getRootSideWeights(arranged);

        expect(root.children?.every(child => child.direction === undefined)).toBe(true);
        expect(arranged).not.toBe(root);
        expect(arranged.children?.map(child => child.id)).toEqual(['big', 'small-1', 'small-2', 'small-3']);
        expect(Math.abs(weights.left - weights.right)).toBeLessThanOrEqual(1);
    });

    it('detects only root branch order or direction changes', () => {
        const current = createTree();
        const arranged = arrangeMindMapTree(current);

        expect(hasMindMapAutoArrangeChange(current, arranged)).toBe(true);
        expect(hasMindMapAutoArrangeChange(arranged, arrangeMindMapTree(arranged))).toBe(false);
    });

    it('keeps valid persisted branch directions while sanitizing the transaction input', () => {
        const previousData: MindElixirData = {
            nodeData: {
                ...arrangeMindMapTree(createTree()),
                hyperLink: 'javascript:alert(1)',
            },
        };
        const mind = {
            bus: { fire: vi.fn() },
            getData: vi.fn(() => previousData),
            refresh: vi.fn(),
            layout: vi.fn(),
        } as unknown as MindElixirInstance;

        expect(applyMindMapAutoArrangeTransaction(mind)).toBe(false);
        expect(mind.refresh).not.toHaveBeenCalled();
    });

    it('preserves only valid branch directions at the sanitizer boundary', () => {
        const cleaned = cleanAndValidateTree({
            id: 'root',
            topic: 'Root',
            children: [
                { id: 'left', topic: 'Left', direction: 0 },
                { id: 'right', topic: 'Right', direction: 1 },
                { id: 'too-large', topic: 'Invalid', direction: 2 },
                { id: 'negative', topic: 'Invalid', direction: -1 },
                { id: 'string', topic: 'Invalid', direction: '1' },
            ],
        }, true);

        expect(cleaned.children?.map(child => child.direction)).toEqual([0, 1, undefined, undefined, undefined]);
    });

    it('treats a root without branches as a no-op', () => {
        const mind = {
            bus: { fire: vi.fn() },
            getData: vi.fn(() => ({ nodeData: { id: 'root', topic: 'Root', children: [] } })),
            refresh: vi.fn(),
            layout: vi.fn(),
        } as unknown as MindElixirInstance;

        expect(applyMindMapAutoArrangeTransaction(mind)).toBe(false);
        expect(mind.refresh).not.toHaveBeenCalled();
        expect(mind.layout).not.toHaveBeenCalled();
        expect(mind.bus.fire).not.toHaveBeenCalled();
    });

    it('refreshes, lays out, and publishes one recoverable operation', () => {
        const calls: string[] = [];
        const previousData: MindElixirData = { nodeData: createTree(), direction: 2 };
        const fire = vi.fn(function () { calls.push('operation'); });
        const mind = {
            bus: { fire },
            getData: vi.fn(() => previousData),
            refresh: vi.fn(() => calls.push('refresh')),
            layout: vi.fn(() => calls.push('layout')),
        } as unknown as MindElixirInstance;

        expect(applyMindMapAutoArrangeTransaction(mind)).toBe(true);

        expect(calls).toEqual(['refresh', 'layout', 'operation']);
        const nextData = vi.mocked(mind.refresh).mock.calls[0]?.[0] as MindElixirData;
        expect(getRootSideWeights(nextData.nodeData)).toEqual({ left: 3, right: 3 });
        expect(fire).toHaveBeenCalledWith('operation', {
            name: 'autoArrangeMindmap',
            obj: nextData.nodeData,
        });
        expect(fire.mock.instances[0]).toBe(mind.bus);
    });

    it('does not refresh, layout, or publish an already balanced tree', () => {
        const balanced = arrangeMindMapTree(createTree());
        const mind = {
            bus: { fire: vi.fn() },
            getData: vi.fn(() => ({ nodeData: balanced })),
            refresh: vi.fn(),
            layout: vi.fn(),
        } as unknown as MindElixirInstance;

        expect(applyMindMapAutoArrangeTransaction(mind)).toBe(false);
        expect(mind.refresh).not.toHaveBeenCalled();
        expect(mind.layout).not.toHaveBeenCalled();
        expect(mind.bus.fire).not.toHaveBeenCalled();
    });

    it.each(['layout', 'operation'] as const)('restores the previous map when %s fails', failure => {
        const failureError = new Error(`${failure} failed`);
        const previousData: MindElixirData = { nodeData: createTree(), direction: 2 };
        const mind = {
            bus: { fire: vi.fn(() => {
                if (failure === 'operation') throw failureError;
            }) },
            getData: vi.fn(() => previousData),
            refresh: vi.fn(),
            layout: vi.fn(() => {
                if (failure === 'layout') throw failureError;
            }),
        } as unknown as MindElixirInstance;

        expect(() => applyMindMapAutoArrangeTransaction(mind)).toThrow(failureError);
        expect(mind.refresh).toHaveBeenCalledTimes(2);
        expect(mind.refresh).toHaveBeenLastCalledWith(previousData);
    });

    it('preserves both errors when operation publication and rollback fail', () => {
        const operationError = new Error('operation failed');
        const rollbackError = new Error('rollback failed');
        const mind = {
            bus: { fire: vi.fn(() => { throw operationError; }) },
            getData: vi.fn(() => ({ nodeData: createTree() })),
            refresh: vi.fn()
                .mockImplementationOnce(() => undefined)
                .mockImplementationOnce(() => { throw rollbackError; }),
            layout: vi.fn(),
        } as unknown as MindElixirInstance;

        try {
            applyMindMapAutoArrangeTransaction(mind);
            throw new Error('Expected transaction to fail');
        } catch (error) {
            expect(error).toBeInstanceOf(AggregateError);
            expect((error as AggregateError).errors).toEqual([operationError, rollbackError]);
            expect((error as Error & { cause?: unknown }).cause).toBe(rollbackError);
        }
    });
});
