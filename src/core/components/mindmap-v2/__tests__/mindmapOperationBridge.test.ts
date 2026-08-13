import { describe, expect, it, vi } from 'vitest';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';

import { emitVizlyMindMapOperation, refreshVizlyMindMapData } from '../mindmapOperationBridge';

describe('emitVizlyMindMapOperation', () => {
    it('emits application operations through the mind-elixir operation channel', () => {
        const fire = vi.fn(function () {});
        const bus = { fire };
        const mind = { bus } as unknown as Pick<MindElixirInstance, 'bus'>;
        const node = { id: 'root', topic: 'Root' } as NodeObj;
        const arrow = {
            id: 'arrow',
            label: 'Related',
            from: 'a',
            to: 'b',
        } as unknown as MindElixirInstance['arrows'][number];

        emitVizlyMindMapOperation(mind, { name: 'autoArrangeMindmap', obj: node });
        emitVizlyMindMapOperation(mind, { name: 'changeDirection', obj: node });
        emitVizlyMindMapOperation(mind, { name: 'collapseAllBranches', obj: node });
        emitVizlyMindMapOperation(mind, { name: 'expandAllBranches', obj: node });
        emitVizlyMindMapOperation(mind, { name: 'editArrowLabel', obj: arrow });
        emitVizlyMindMapOperation(mind, { name: 'outline_structure_change', obj: node });

        expect(fire).toHaveBeenNthCalledWith(1, 'operation', {
            name: 'autoArrangeMindmap',
            obj: node,
        });
        expect(fire).toHaveBeenNthCalledWith(2, 'operation', {
            name: 'changeDirection',
            obj: node,
        });
        expect(fire).toHaveBeenNthCalledWith(3, 'operation', {
            name: 'collapseAllBranches',
            obj: node,
        });
        expect(fire).toHaveBeenNthCalledWith(4, 'operation', {
            name: 'expandAllBranches',
            obj: node,
        });
        expect(fire).toHaveBeenNthCalledWith(5, 'operation', {
            name: 'editArrowLabel',
            obj: arrow,
        });
        expect(fire).toHaveBeenNthCalledWith(6, 'operation', {
            name: 'outline_structure_change',
            obj: node,
        });
        expect(fire.mock.instances).toEqual([bus, bus, bus, bus, bus, bus]);
    });

    it('refreshes runtime-supported direction values through one typed adapter', () => {
        const refresh = vi.fn();
        const mind = { refresh } as unknown as MindElixirInstance;
        const data = {
            nodeData: { id: 'root', topic: 'Root' } as NodeObj,
            direction: 3,
        };

        refreshVizlyMindMapData(mind, data);

        expect(refresh).toHaveBeenCalledWith(data);
    });
});
