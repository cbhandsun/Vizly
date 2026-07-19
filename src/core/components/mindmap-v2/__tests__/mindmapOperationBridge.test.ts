import { describe, expect, it, vi } from 'vitest';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';

import { emitVizlyMindMapOperation, refreshVizlyMindMapData } from '../mindmapOperationBridge';

describe('emitVizlyMindMapOperation', () => {
    it('emits application operations through the mind-elixir operation channel', () => {
        const fire = vi.fn();
        const mind = { bus: { fire } } as unknown as Pick<MindElixirInstance, 'bus'>;
        const node = { id: 'root', topic: 'Root' } as NodeObj;
        const arrow = {
            id: 'arrow',
            label: 'Related',
            from: 'a',
            to: 'b',
        } as unknown as MindElixirInstance['arrows'][number];

        emitVizlyMindMapOperation(mind, { name: 'autoArrangeMindmap', obj: node });
        emitVizlyMindMapOperation(mind, { name: 'editArrowLabel', obj: arrow });
        emitVizlyMindMapOperation(mind, { name: 'outline_structure_change', obj: node });

        expect(fire).toHaveBeenNthCalledWith(1, 'operation', {
            name: 'autoArrangeMindmap',
            obj: node,
        });
        expect(fire).toHaveBeenNthCalledWith(2, 'operation', {
            name: 'editArrowLabel',
            obj: arrow,
        });
        expect(fire).toHaveBeenNthCalledWith(3, 'operation', {
            name: 'outline_structure_change',
            obj: node,
        });
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
