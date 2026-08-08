import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { buildDiagramSelectionDuplicate } from '../diagramSelectionDuplication';

const node = (id: string, position = { x: 10, y: 20 }): Node => ({
    id,
    type: 'custom',
    position,
    data: { label: id },
});

const duplicate = (
    nodes: Node[],
    edges: Edge[],
    targetIds: string[],
) => buildDiagramSelectionDuplicate({
    nodes,
    edges,
    targetIds: new Set(targetIds),
    batchId: 'batch',
    getDuplicateLabel: source => `${String(source.data.label)} (Copy)`,
});

describe('buildDiagramSelectionDuplicate', () => {
    it('rebuilds only the internal edges of a duplicated subgraph', () => {
        const result = duplicate(
            [node('a'), node('b'), node('outside')],
            [
                { id: 'inside', source: 'a', target: 'b', data: { label: 'A to B' } },
                { id: 'outbound', source: 'b', target: 'outside' },
            ],
            ['a', 'b'],
        );

        expect(result.nodes).toHaveLength(2);
        expect(result.nodes.map(item => item.position)).toEqual([
            { x: 60, y: 70 },
            { x: 60, y: 70 },
        ]);
        expect(result.edges).toEqual([
            expect.objectContaining({
                id: 'edge-copy-batch-0',
                source: 'node-copy-batch-0',
                target: 'node-copy-batch-1',
                selected: true,
                data: { label: 'A to B' },
            }),
        ]);
    });

    it('remaps duplicated hierarchy without double-offsetting child coordinates', () => {
        const parent = node('parent', { x: 100, y: 120 });
        const child = { ...node('child', { x: 15, y: 25 }), parentId: 'parent' };

        const result = duplicate([parent, child], [], ['parent', 'child']);

        expect(result.nodes[0]).toMatchObject({
            id: 'node-copy-batch-0',
            position: { x: 150, y: 170 },
        });
        expect(result.nodes[1]).toMatchObject({
            id: 'node-copy-batch-1',
            parentId: 'node-copy-batch-0',
            position: { x: 15, y: 25 },
        });
    });

    it('keeps an unselected parent and offsets a duplicated child within it', () => {
        const parent = node('parent');
        const child = { ...node('child', { x: 15, y: 25 }), parentId: 'parent' };

        const result = duplicate([parent, child], [], ['child']);

        expect(result.nodes).toEqual([
            expect.objectContaining({
                parentId: 'parent',
                position: { x: 65, y: 75 },
            }),
        ]);
    });

    it('returns an empty result for missing targets', () => {
        expect(duplicate([node('a')], [], ['missing'])).toEqual({ nodes: [], edges: [] });
    });
});
