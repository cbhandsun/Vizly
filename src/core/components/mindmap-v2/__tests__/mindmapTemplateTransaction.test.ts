import type { MindElixirData, MindElixirInstance, NodeObj } from 'mind-elixir';
import { describe, expect, it, vi } from 'vitest';

import { applyMindMapTemplateTransaction } from '../mindmapTemplateTransaction';

const createNode = (id: string): NodeObj => ({
    id,
    topic: id,
    children: [],
});

const createMind = (
    previousData: MindElixirData,
    overrides: Partial<MindElixirInstance> = {},
): MindElixirInstance => ({
    bus: { fire: vi.fn() },
    getData: vi.fn(() => previousData),
    refresh: vi.fn(),
    toCenter: vi.fn(),
    ...overrides,
} as unknown as MindElixirInstance);

describe('applyMindMapTemplateTransaction', () => {
    it('publishes one undoable template operation and preserves the current direction', () => {
        const calls: string[] = [];
        const previousData: MindElixirData = {
            nodeData: createNode('previous-root'),
            direction: 2,
        };
        const replacementRoot = createNode('template-root');
        const fire = vi.fn(() => calls.push('operation'));
        const clearHistory = vi.fn();
        const mind = createMind(previousData, {
            bus: { fire } as unknown as MindElixirInstance['bus'],
            clearHistory,
            refresh: vi.fn(() => calls.push('refresh')),
            toCenter: vi.fn(() => calls.push('center')),
        });

        applyMindMapTemplateTransaction(mind, replacementRoot);

        expect(calls).toEqual(['refresh', 'operation', 'center']);
        expect(mind.refresh).toHaveBeenCalledWith({
            nodeData: replacementRoot,
            direction: 2,
        });
        expect(fire).toHaveBeenCalledWith('operation', {
            name: 'template_apply',
            obj: replacementRoot,
        });
        expect(fire.mock.instances[0]).toBe(mind.bus);
        expect(clearHistory).not.toHaveBeenCalled();
    });

    it('does not publish or center when refresh rejects the replacement', () => {
        const refreshError = new Error('refresh failed');
        const mind = createMind(
            { nodeData: createNode('previous-root'), direction: 1 },
            { refresh: vi.fn(() => { throw refreshError; }) },
        );

        expect(() => applyMindMapTemplateTransaction(mind, createNode('template-root')))
            .toThrow(refreshError);
        expect(mind.bus.fire).not.toHaveBeenCalled();
        expect(mind.toCenter).not.toHaveBeenCalled();
    });

    it('restores the previous map when the operation cannot be published', () => {
        const operationError = new Error('operation failed');
        const previousData: MindElixirData = {
            nodeData: createNode('previous-root'),
            direction: 0,
        };
        const replacementRoot = createNode('template-root');
        const mind = createMind(previousData, {
            bus: { fire: vi.fn(() => { throw operationError; }) } as unknown as MindElixirInstance['bus'],
        });

        expect(() => applyMindMapTemplateTransaction(mind, replacementRoot))
            .toThrow(operationError);
        expect(mind.refresh).toHaveBeenNthCalledWith(1, {
            nodeData: replacementRoot,
            direction: 0,
        });
        expect(mind.refresh).toHaveBeenNthCalledWith(2, previousData);
        expect(mind.toCenter).not.toHaveBeenCalled();
    });

    it('surfaces both operation and rollback failures without centering', () => {
        const operationError = new Error('operation failed');
        const rollbackError = new Error('rollback failed');
        const previousData: MindElixirData = {
            nodeData: createNode('previous-root'),
            direction: 1,
        };
        const mind = createMind(previousData, {
            bus: { fire: vi.fn(() => { throw operationError; }) } as unknown as MindElixirInstance['bus'],
            refresh: vi.fn()
                .mockImplementationOnce(() => undefined)
                .mockImplementationOnce(() => { throw rollbackError; }),
        });

        expect(() => applyMindMapTemplateTransaction(mind, createNode('template-root')))
            .toThrow(AggregateError);
        expect(mind.toCenter).not.toHaveBeenCalled();
    });

    it('keeps the committed template when viewport centering fails', () => {
        const mind = createMind(
            { nodeData: createNode('previous-root'), direction: 2 },
            { toCenter: vi.fn(() => { throw new Error('center failed'); }) },
        );

        expect(() => applyMindMapTemplateTransaction(mind, createNode('template-root')))
            .not.toThrow();
        expect(mind.bus.fire).toHaveBeenCalledWith('operation', expect.objectContaining({
            name: 'template_apply',
        }));
    });
});
