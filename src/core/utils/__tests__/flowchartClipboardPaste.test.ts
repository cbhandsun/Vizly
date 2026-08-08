import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
    advanceClipboardPasteCursor,
    buildFlowchartPasteBatch,
    createClipboardTextSignature,
    MAX_FLOWCHART_PASTE_SEQUENCE,
    resolveFlowchartPasteOffset,
} from '../flowchartClipboardPaste';

const node = (id: string, position = { x: 10, y: 20 }): Node => ({
    id,
    position,
    data: { label: id },
});

describe('flowchartClipboardPaste', () => {
    it('advances repeated payloads in the same operation scope', () => {
        const first = advanceClipboardPasteCursor(null, 'payload-a', 'diagram:page-1');
        const second = advanceClipboardPasteCursor(first, 'payload-a', 'diagram:page-1');

        expect(first.sequence).toBe(1);
        expect(second.sequence).toBe(2);
    });

    it('resets the sequence when clipboard content or operation scope changes', () => {
        const previous = { signature: 'payload-a', scope: 'diagram:page-1', sequence: 7 };

        expect(advanceClipboardPasteCursor(previous, 'payload-b', previous.scope).sequence).toBe(1);
        expect(advanceClipboardPasteCursor(previous, previous.signature, 'diagram:page-2').sequence).toBe(1);
    });

    it('creates stable signatures without retaining clipboard text', () => {
        expect(createClipboardTextSignature('diagram A')).toBe(createClipboardTextSignature('diagram A'));
        expect(createClipboardTextSignature('diagram A')).not.toBe(createClipboardTextSignature('diagram B'));
    });

    it('uses a visible adaptive offset for small and large pasted nodes', () => {
        expect(resolveFlowchartPasteOffset([node('small')], 1)).toBe(32);
        expect(resolveFlowchartPasteOffset([{
            ...node('large'),
            measured: { width: 600, height: 180 },
        }], 1)).toBe(72);
    });

    it('bounds invalid and extreme paste sequences', () => {
        expect(resolveFlowchartPasteOffset([node('a')], Number.NaN)).toBe(32);
        expect(resolveFlowchartPasteOffset([node('a')], 0)).toBe(32);
        expect(resolveFlowchartPasteOffset([node('a')], Number.POSITIVE_INFINITY)).toBe(32);
        expect(resolveFlowchartPasteOffset([node('a')], 10_000))
            .toBe(32 * MAX_FLOWCHART_PASTE_SEQUENCE);
    });

    it('pastes an internal subgraph with the requested cascade offset', () => {
        const edges: Edge[] = [{ id: 'inside', source: 'a', target: 'b', data: { label: 'A to B' } }];
        const result = buildFlowchartPasteBatch({
            clipboardData: { nodes: [node('a'), node('b')], edges },
            batchId: 'batch',
            offset: 40,
        });

        expect(result.nodes.map(item => item.position)).toEqual([
            { x: 50, y: 60 },
            { x: 50, y: 60 },
        ]);
        expect(result.edges).toEqual([
            expect.objectContaining({
                id: 'edge-paste-batch-0',
                source: 'node-paste-batch-0',
                target: 'node-paste-batch-1',
                selected: true,
                data: { label: 'A to B' },
            }),
        ]);
    });

    it('remaps pasted hierarchy without double-offsetting child coordinates', () => {
        const parent = node('parent', { x: 100, y: 120 });
        const child = { ...node('child', { x: 15, y: 25 }), parentId: 'parent' };
        const result = buildFlowchartPasteBatch({
            clipboardData: { nodes: [parent, child], edges: [] },
            batchId: 'batch',
            offset: 40,
        });

        expect(result.nodes[0]).toMatchObject({ position: { x: 140, y: 160 } });
        expect(result.nodes[1]).toMatchObject({
            parentId: 'node-paste-batch-0',
            position: { x: 15, y: 25 },
        });
    });

    it('detaches nodes whose original parent is not part of the pasted batch', () => {
        const child = {
            ...node('child', { x: 115, y: 225 }),
            parentId: 'outside-parent',
            extent: 'parent' as const,
            expandParent: true,
        };
        const result = buildFlowchartPasteBatch({
            clipboardData: { nodes: [child], edges: [] },
            batchId: 'batch',
            offset: 20,
        });

        expect(result.nodes[0]).toMatchObject({ position: { x: 135, y: 245 } });
        expect(result.nodes[0]).not.toHaveProperty('parentId');
        expect(result.nodes[0]).not.toHaveProperty('extent');
        expect(result.nodes[0]).not.toHaveProperty('expandParent');
    });

    it('drops dangling edges instead of reconnecting them to the original graph', () => {
        const result = buildFlowchartPasteBatch({
            clipboardData: {
                nodes: [node('a')],
                edges: [{ id: 'dangling', source: 'a', target: 'outside' }],
            },
            batchId: 'batch',
            offset: 20,
        });

        expect(result.edges).toEqual([]);
    });
});
