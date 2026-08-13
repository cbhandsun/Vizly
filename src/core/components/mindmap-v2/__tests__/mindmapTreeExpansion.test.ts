import { describe, expect, it, vi } from 'vitest';
import type { MindElixirData, MindElixirInstance, NodeObj } from 'mind-elixir';

import {
    applyMindMapTreeExpansionTransaction,
    hasMindMapTreeExpansionChange,
    setMindMapTreeExpanded,
} from '../mindmapTreeExpansion';

const createTree = (expanded = true): NodeObj => ({
    id: 'root',
    topic: 'Root',
    expanded: true,
    children: [{
        id: 'child',
        topic: 'Child',
        expanded,
        children: [{ id: 'leaf', topic: 'Leaf' }],
    }],
});

describe('mind map tree expansion', () => {
    it.each([true, false])('sets every branch expanded=%s without mutating input', (expanded) => {
        const tree = createTree(!expanded);

        const result = setMindMapTreeExpanded(tree, expanded);

        expect(result.expanded).toBe(true);
        expect(result.children?.[0].expanded).toBe(expanded);
        expect(result.children?.[0].children?.[0].expanded).toBeUndefined();
        expect(tree.children?.[0].expanded).toBe(!expanded);
        expect(result).not.toBe(tree);
    });

    it('normalizes a missing children collection while keeping the root visible', () => {
        expect(setMindMapTreeExpanded({ id: 'root', topic: 'Root' }, false)).toEqual({
            id: 'root',
            topic: 'Root',
            expanded: true,
            children: [],
        });
    });

    it('only reports changes that affect a visible non-root branch', () => {
        expect(hasMindMapTreeExpansionChange(createTree(true), false)).toBe(true);
        expect(hasMindMapTreeExpansionChange(createTree(false), false)).toBe(false);
        expect(hasMindMapTreeExpansionChange({ id: 'root', topic: 'Root' }, false)).toBe(false);
    });

    it.each([
        [false, 'collapseAllBranches'],
        [true, 'expandAllBranches'],
    ] as const)('publishes expanded=%s as one undoable operation', (expanded, operationName) => {
        const previousData: MindElixirData = {
            nodeData: createTree(!expanded),
            direction: 1,
        };
        const calls: string[] = [];
        const fire = vi.fn(function () { calls.push('operation'); });
        const mind = {
            bus: { fire },
            getData: vi.fn(() => previousData),
            refresh: vi.fn(() => calls.push('refresh')),
        } as unknown as MindElixirInstance;

        expect(applyMindMapTreeExpansionTransaction(mind, expanded)).toBe(true);

        expect(calls).toEqual(['refresh', 'operation']);
        const nextData = vi.mocked(mind.refresh).mock.calls[0]?.[0] as MindElixirData;
        expect(nextData.nodeData.children?.[0].expanded).toBe(expanded);
        expect(nextData.nodeData.children?.[0].children?.[0].topic).toBe('Leaf');
        expect(fire).toHaveBeenCalledWith('operation', {
            name: operationName,
            obj: nextData.nodeData,
        });
        expect(fire.mock.instances[0]).toBe(mind.bus);
    });

    it('does not refresh or pollute history when every branch already has the requested state', () => {
        const mind = {
            bus: { fire: vi.fn() },
            getData: vi.fn(() => ({ nodeData: createTree(false) })),
            refresh: vi.fn(),
        } as unknown as MindElixirInstance;

        expect(applyMindMapTreeExpansionTransaction(mind, false)).toBe(false);
        expect(mind.refresh).not.toHaveBeenCalled();
        expect(mind.bus.fire).not.toHaveBeenCalled();
    });

    it('restores the complete previous tree when history publication fails', () => {
        const operationError = new Error('operation failed');
        const previousData: MindElixirData = {
            nodeData: createTree(true),
            direction: 2,
        };
        const mind = {
            bus: { fire: vi.fn(() => { throw operationError; }) },
            getData: vi.fn(() => previousData),
            refresh: vi.fn(),
        } as unknown as MindElixirInstance;

        expect(() => applyMindMapTreeExpansionTransaction(mind, false)).toThrow(operationError);
        expect(mind.refresh).toHaveBeenCalledTimes(2);
        expect(mind.refresh).toHaveBeenLastCalledWith(previousData);
        expect(previousData.nodeData.children?.[0].children?.[0].topic).toBe('Leaf');
    });

    it('reports both failures if publishing and rollback fail', () => {
        const operationError = new Error('operation failed');
        const rollbackError = new Error('rollback failed');
        const mind = {
            bus: { fire: vi.fn(() => { throw operationError; }) },
            getData: vi.fn(() => ({ nodeData: createTree(true) })),
            refresh: vi.fn()
                .mockImplementationOnce(() => undefined)
                .mockImplementationOnce(() => { throw rollbackError; }),
        } as unknown as MindElixirInstance;

        try {
            applyMindMapTreeExpansionTransaction(mind, false);
            throw new Error('Expected transaction to fail');
        } catch (error) {
            expect(error).toBeInstanceOf(AggregateError);
            expect((error as AggregateError).errors).toEqual([operationError, rollbackError]);
            expect((error as Error & { cause?: unknown }).cause).toBe(rollbackError);
        }
    });
});
