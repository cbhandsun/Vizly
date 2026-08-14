import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
    parsePageContentMetrics,
    PRESERVE_PAGE_COPY_NODE_ID,
    resolvePageContentMetrics,
    shouldPreservePageCopyNodeId,
} from '../pageCanvasMetadata';

const node = (data: Record<string, unknown> = {}): Node => ({
    id: 'node-1',
    position: { x: 0, y: 0 },
    data,
});

describe('pageCanvasMetadata', () => {
    it('recognizes only the explicit preserve-id policy', () => {
        expect(shouldPreservePageCopyNodeId({ pageCopyIdPolicy: PRESERVE_PAGE_COPY_NODE_ID })).toBe(true);
        expect(shouldPreservePageCopyNodeId({ pageCopyIdPolicy: 'remap' })).toBe(false);
        expect(shouldPreservePageCopyNodeId(null)).toBe(false);
    });

    it('parses bounded versioned metrics', () => {
        expect(parsePageContentMetrics({ version: 1, nodeCount: 4, edgeCount: 0 }))
            .toEqual({ nodeCount: 4, edgeCount: 0 });
    });

    it.each([
        null,
        {},
        { version: 2, nodeCount: 4, edgeCount: 0 },
        { version: 1, nodeCount: -1, edgeCount: 0 },
        { version: 1, nodeCount: 1.5, edgeCount: 0 },
        { version: 1, nodeCount: Number.POSITIVE_INFINITY, edgeCount: 0 },
        { version: 1, nodeCount: 1_000_001, edgeCount: 0 },
        { version: 1, nodeCount: '4', edgeCount: 0 },
    ])('rejects unsafe content metrics %#', (value) => {
        expect(parsePageContentMetrics(value)).toBeNull();
    });

    it('prefers valid domain metrics over live React Flow counts', () => {
        const nodes = [node({
            pageContentMetrics: { version: 1, nodeCount: 4, edgeCount: 0 },
        })];

        expect(resolvePageContentMetrics(nodes, [], 1, 0)).toEqual({
            nodeCount: 4,
            edgeCount: 0,
        });
    });

    it('falls back to safe live counts and then graph lengths', () => {
        const nodes = [node({ pageContentMetrics: { version: 1, nodeCount: -1, edgeCount: 0 } })];
        const edges: Edge[] = [{ id: 'edge-1', source: 'node-1', target: 'node-1' }];

        expect(resolvePageContentMetrics(nodes, edges, 3, 2)).toEqual({ nodeCount: 3, edgeCount: 2 });
        expect(resolvePageContentMetrics(nodes, edges, -1, Number.NaN)).toEqual({ nodeCount: 1, edgeCount: 1 });
    });
});
