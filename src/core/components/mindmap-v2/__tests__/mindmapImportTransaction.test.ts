import type { MindElixirData, MindElixirInstance, NodeObj } from 'mind-elixir';
import { describe, expect, it, vi } from 'vitest';

import { applyMindMapImportTransaction } from '../mindmapImportTransaction';

const createNode = (id: string): NodeObj => ({
    id,
    topic: id,
    children: [],
});

describe('applyMindMapImportTransaction', () => {
    it('publishes the replacement as an undoable import operation without clearing history', () => {
        const calls: string[] = [];
        const fire = vi.fn(function (this: unknown) {
            calls.push('operation');
        });
        const clearHistory = vi.fn();
        const importedRoot = createNode('imported-root');
        const importedData: MindElixirData = {
            nodeData: importedRoot,
            direction: 1,
        };
        const mind = {
            bus: { fire },
            clearHistory,
            getData: vi.fn(() => ({ nodeData: createNode('previous-root'), direction: 2 })),
            refresh: vi.fn(() => calls.push('refresh')),
            toCenter: vi.fn(() => calls.push('center')),
        } as unknown as MindElixirInstance;

        applyMindMapImportTransaction(mind, importedData);

        expect(calls).toEqual(['refresh', 'operation', 'center']);
        expect(mind.refresh).toHaveBeenCalledWith(importedData);
        expect(fire).toHaveBeenCalledWith('operation', {
            name: 'import',
            obj: importedRoot,
        });
        expect(fire.mock.instances[0]).toBe(mind.bus);
        expect(clearHistory).not.toHaveBeenCalled();
    });

    it('does not center when replacing the map fails', () => {
        const replacementError = new Error('refresh failed');
        const mind = {
            bus: { fire: vi.fn() },
            getData: vi.fn(() => ({ nodeData: createNode('previous-root'), direction: 2 })),
            refresh: vi.fn(() => { throw replacementError; }),
            toCenter: vi.fn(),
        } as unknown as MindElixirInstance;

        expect(() => applyMindMapImportTransaction(mind, {
            nodeData: createNode('imported-root'),
        })).toThrow(replacementError);
        expect(mind.bus.fire).not.toHaveBeenCalled();
        expect(mind.toCenter).not.toHaveBeenCalled();
    });

    it('keeps the committed import when viewport centering fails', () => {
        const centerError = new Error('center failed');
        const mind = {
            bus: { fire: vi.fn() },
            getData: vi.fn(() => ({ nodeData: createNode('previous-root'), direction: 2 })),
            refresh: vi.fn(),
            toCenter: vi.fn(() => { throw centerError; }),
        } as unknown as MindElixirInstance;

        expect(() => applyMindMapImportTransaction(mind, {
            nodeData: createNode('imported-root'),
        })).not.toThrow();
        expect(mind.bus.fire).toHaveBeenCalledWith('operation', expect.objectContaining({
            name: 'import',
        }));
    });

    it('restores the previous map when the history operation cannot be published', () => {
        const operationError = new Error('operation failed');
        const previousData: MindElixirData = {
            nodeData: createNode('previous-root'),
            direction: 2,
        };
        const importedData: MindElixirData = {
            nodeData: createNode('imported-root'),
            direction: 1,
        };
        const mind = {
            bus: { fire: vi.fn(() => { throw operationError; }) },
            getData: vi.fn(() => previousData),
            refresh: vi.fn(),
            toCenter: vi.fn(),
        } as unknown as MindElixirInstance;

        expect(() => applyMindMapImportTransaction(mind, importedData)).toThrow(operationError);
        expect(mind.refresh).toHaveBeenNthCalledWith(1, importedData);
        expect(mind.refresh).toHaveBeenNthCalledWith(2, previousData);
        expect(mind.toCenter).not.toHaveBeenCalled();
    });
});
