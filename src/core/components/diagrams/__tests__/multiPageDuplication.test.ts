import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { duplicatePageCanvas } from '../multiPageDuplication';
import { PRESERVE_PAGE_COPY_NODE_ID } from '../pageCanvasMetadata';

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

    it('preserves explicitly stable plugin node IDs while remapping ordinary nodes and edges', () => {
        const metadataNode: Node = {
            id: '__mindmap_meta__',
            type: 'mindmap',
            hidden: true,
            position: { x: -9999, y: -9999 },
            data: {
                pageCopyIdPolicy: PRESERVE_PAGE_COPY_NODE_ID,
                nested: { topic: 'Source' },
            },
        };
        const sourceEdge: Edge = {
            id: 'edge-1',
            source: '__mindmap_meta__',
            target: 'ordinary',
            data: { nested: { value: 1 } },
        };
        const result = duplicatePageCanvas(
            [metadataNode, node('ordinary')],
            [sourceEdge],
            'mindmap',
        );

        expect(result.nodes.map(item => item.id)).toEqual([
            '__mindmap_meta__',
            'node-page-copy-mindmap-1',
        ]);
        expect(result.edges[0]).toMatchObject({
            id: 'edge-page-copy-mindmap-0',
            source: '__mindmap_meta__',
            target: 'node-page-copy-mindmap-1',
        });
        expect(result.nodes[0]?.data).not.toBe(metadataNode.data);
        expect(result.nodes[0]?.data.nested).not.toBe(metadataNode.data.nested);
        expect(result.edges[0]?.data).not.toBe(sourceEdge.data);
        expect(result.edges[0]?.data?.nested).not.toBe(sourceEdge.data?.nested);
    });
});
