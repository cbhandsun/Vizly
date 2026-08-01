import { describe, expect, it } from 'vitest';
import {
    buildFlowchartClipboardData,
    coerceClipboardData,
    FLOWCHART_CLIPBOARD_TEXT_MAX_BYTES,
    isFlowchartClipboardTextWithinBounds,
    parseClipboardJson,
} from '../flowchartClipboard';

describe('flowchartClipboard', () => {
    it('copies a selected subgraph with all connecting edges', () => {
        const selectedNodes = [
            { id: 'a', position: { x: 0, y: 0 }, data: {} },
            { id: 'b', position: { x: 10, y: 10 }, data: {} },
        ];
        const result = buildFlowchartClipboardData(selectedNodes, [
            { id: 'inside', source: 'a', target: 'b' },
            { id: 'outbound', source: 'b', target: 'c' },
            { id: 'inbound', source: 'c', target: 'a' },
        ]);

        expect(result.nodes).toBe(selectedNodes);
        expect(result.edges.map(edge => edge.id)).toEqual(['inside']);
    });

    it('returns an empty subgraph for an empty node selection', () => {
        expect(buildFlowchartClipboardData([], [
            { id: 'edge', source: 'a', target: 'b' },
        ])).toEqual({ nodes: [], edges: [] });
    });

    it('accepts valid clipboard data and normalizes missing node data', () => {
        const result = coerceClipboardData({
            nodes: [{ id: 'a', position: { x: 1, y: 2 } }],
            edges: [],
        });

        expect(result?.nodes[0].data).toEqual({});
    });

    it('rejects nodes without finite positions', () => {
        expect(coerceClipboardData({
            nodes: [{ id: 'a' }],
            edges: [],
        })).toBeNull();

        expect(coerceClipboardData({
            nodes: [{ id: 'a', position: { x: Number.NaN, y: 0 } }],
            edges: [],
        })).toBeNull();
    });

    it('filters edges that reference missing nodes', () => {
        const result = coerceClipboardData({
            nodes: [{ id: 'a', position: { x: 0, y: 0 } }],
            edges: [
                { id: 'valid', source: 'a', target: 'a' },
                { id: 'bad', source: 'a', target: 'missing' },
            ],
        });

        expect(result?.edges).toHaveLength(1);
        expect(result?.edges[0].id).toBe('valid');
    });

    it('rejects oversized state payloads and unsafe identifiers', () => {
        expect(coerceClipboardData({
            nodes: Array.from({ length: 3 }, (_, i) => ({ id: `n-${i}`, position: { x: 0, y: 0 } })),
            edges: [],
        }, { maxNodes: 2 })).toBeNull();

        expect(coerceClipboardData({
            nodes: [{ id: 'x'.repeat(257), position: { x: 0, y: 0 } }],
            edges: [],
        })).toBeNull();

        expect(coerceClipboardData({
            nodes: [{ id: 'a', position: { x: 1_000_001, y: 0 } }],
            edges: [],
        })).toBeNull();

        expect(coerceClipboardData({
            nodes: [{ id: 'a', position: { x: 0, y: 0 } }],
            edges: Array.from({ length: 3 }, (_, i) => ({ id: `e-${i}`, source: 'a', target: 'a' })),
        }, { maxEdges: 2 })).toBeNull();
    });

    it('deduplicates nodes and trims ids before validating edges', () => {
        const result = coerceClipboardData({
            nodes: [
                { id: ' a ', position: { x: 0, y: 0 } },
                { id: 'a', position: { x: 10, y: 10 } },
            ],
            edges: [
                { id: ' e ', source: ' a ', target: 'a' },
            ],
        });

        expect(result?.nodes).toHaveLength(1);
        expect(result?.nodes[0].id).toBe('a');
        expect(result?.edges).toEqual([
            expect.objectContaining({ id: 'e', source: 'a', target: 'a' }),
        ]);
    });

    it('parses JSON safely without throwing on malformed input', () => {
        expect(parseClipboardJson('{broken')).toBeNull();
        expect(parseClipboardJson(JSON.stringify({
            nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: 'x'.repeat(2 * 1024 * 1024) }],
            edges: [],
        }))).toBeNull();
        expect(parseClipboardJson(JSON.stringify({
            nodes: [{ id: 'a', position: { x: 0, y: 0 } }],
            edges: [],
        }))?.nodes).toHaveLength(1);
    });

    it('bounds raw clipboard text before expensive parsing', () => {
        expect(isFlowchartClipboardTextWithinBounds('flowchart TD\nA-->B')).toBe(true);
        expect(isFlowchartClipboardTextWithinBounds('x'.repeat(FLOWCHART_CLIPBOARD_TEXT_MAX_BYTES + 1))).toBe(false);
        expect(parseClipboardJson('x'.repeat(FLOWCHART_CLIPBOARD_TEXT_MAX_BYTES + 1))).toBeNull();
    });

    it('strips dangerous nested keys from node and edge data', () => {
        const result = coerceClipboardData(JSON.parse(`{
            "nodes": [{
                "id": "a",
                "position": { "x": 0, "y": 0 },
                "data": {
                    "label": "A",
                    "constructor": { "polluted": true },
                    "nested": { "__proto__": { "polluted": true }, "safe": true }
                }
            }],
            "edges": [{
                "id": "e",
                "source": "a",
                "target": "a",
                "data": {
                    "label": "edge",
                    "prototype": { "polluted": true }
                }
            }]
        }`));

        expect(result?.nodes[0].data).toEqual({ label: 'A', nested: { safe: true } });
        expect(result?.edges[0].data).toEqual({ label: 'edge' });
        expect(Object.prototype).not.toHaveProperty('polluted');
    });
});
