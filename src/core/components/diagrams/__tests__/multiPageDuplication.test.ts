import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { duplicatePageCanvas } from '../multiPageDuplication';

const node = (id: string, parentId?: string): Node => ({
    id,
    parentId,
    extent: parentId ? 'parent' : undefined,
    position: { x: 10, y: 20 },
    data: { nested: { value: id } },
});

describe('duplicatePageCanvas', () => {
    it('keeps empty pages empty', () => {
        expect(duplicatePageCanvas([], [], 'empty')).toEqual({ nodes: [], edges: [] });
    });

    it('detaches a child whose missing parent is outside the page', () => {
        const result = duplicatePageCanvas([node('child', 'missing-parent')], [], 'detached');

        expect(result.nodes[0]).toMatchObject({
            id: 'node-page-copy-detached-0',
            position: { x: 10, y: 20 },
            selected: false,
        });
        expect(result.nodes[0]?.parentId).toBeUndefined();
        expect(result.nodes[0]?.extent).toBeUndefined();
    });

    it('rejects an edge whose endpoint is not part of the page', () => {
        const invalidEdge: Edge = { id: 'edge-1', source: 'node-1', target: 'missing' };

        expect(() => duplicatePageCanvas([node('node-1')], [invalidEdge], 'invalid'))
            .toThrow('endpoint is missing from the page');
    });
});
