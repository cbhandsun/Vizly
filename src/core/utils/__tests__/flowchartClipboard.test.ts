import { describe, expect, it } from 'vitest';
import {
    buildFlowchartClipboardData,
    coerceClipboardData,
    FLOWCHART_CLIPBOARD_TEXT_MAX_BYTES,
    isFlowchartClipboardTextWithinBounds,
    parseClipboardJson,
} from '../flowchartClipboard';
import {
    createPersistedRoutingCandidate,
    createRoutingOnlyDocumentSnapshot,
} from '../../routing/persistedRoutingCandidate';
import { EDGE_ROUTING_CACHE_VERSION } from '../../routing/routingVersion';

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

    it('detaches a copied child from an unselected parent using its absolute position', () => {
        const parent = { id: 'parent', position: { x: 100, y: 200 }, data: {} };
        const child = {
            id: 'child',
            parentId: 'parent',
            extent: 'parent' as const,
            expandParent: true,
            position: { x: 15, y: 25 },
            data: {},
        };

        const result = buildFlowchartClipboardData([child], [], [parent, child]);

        expect(result.nodes[0]).toMatchObject({
            id: 'child',
            position: { x: 115, y: 225 },
        });
        expect(result.nodes[0]).not.toHaveProperty('parentId');
        expect(result.nodes[0]).not.toHaveProperty('extent');
        expect(result.nodes[0]).not.toHaveProperty('expandParent');
    });

    it('preserves relative hierarchy when both parent and child are copied', () => {
        const parent = { id: 'parent', position: { x: 100, y: 200 }, data: {} };
        const child = {
            id: 'child',
            parentId: 'parent',
            extent: 'parent' as const,
            position: { x: 15, y: 25 },
            data: {},
        };

        const result = buildFlowchartClipboardData([parent, child], [], [parent, child]);

        expect(result.nodes[1]).toBe(child);
    });

    it('expands a selected container to nested descendants and internal edges', () => {
        const group = { id: 'group', type: 'titleGroup', position: { x: 100, y: 200 }, data: {} };
        const subgroup = { id: 'subgroup', type: 'subGroup', parentId: group.id, position: { x: 10, y: 20 }, data: {} };
        const child = { id: 'child', parentId: subgroup.id, position: { x: 5, y: 8 }, data: {} };
        const external = { id: 'external', position: { x: 500, y: 500 }, data: {} };

        const result = buildFlowchartClipboardData([group], [
            { id: 'nested', source: subgroup.id, target: child.id },
            { id: 'external-edge', source: child.id, target: external.id },
        ], [group, subgroup, child, external]);

        expect(result.nodes).toEqual([group, subgroup, child]);
        expect(result.edges.map(edge => edge.id)).toEqual(['nested']);
    });

    it('bounds malformed parent cycles while expanding a container selection', () => {
        const group = { id: 'group', type: 'titleGroup', position: { x: 0, y: 0 }, data: {} };
        const first = { id: 'first', parentId: 'second', position: { x: 0, y: 0 }, data: {} };
        const second = { id: 'second', parentId: 'first', position: { x: 0, y: 0 }, data: {} };

        expect(buildFlowchartClipboardData([group], [], [group, first, second]).nodes).toEqual([group]);
    });

    it('accepts valid clipboard data and normalizes missing node data', () => {
        const result = coerceClipboardData({
            nodes: [{ id: 'a', position: { x: 1, y: 2 } }],
            edges: [],
        });

        expect(result?.nodes[0].data).toEqual({});
    });

    it('separates routing-only geometry from imported business edges', () => {
        const candidate = createPersistedRoutingCandidate({
            routingVersion: EDGE_ROUTING_CACHE_VERSION,
            inputSignature: '1234',
            inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
            outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
            writtenAt: 42,
            patches: [{
                id: 'edge',
                source: 'a',
                target: 'a',
                data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
            }],
        });
        if (!candidate) throw new Error('expected a valid routing fixture');
        const routingSnapshot = createRoutingOnlyDocumentSnapshot(candidate);
        if (!routingSnapshot) throw new Error('expected a valid routing snapshot');

        const result = coerceClipboardData({
            nodes: [{ id: 'a', position: { x: 0, y: 0 } }],
            edges: [{
                id: 'edge',
                source: 'a',
                target: 'a',
                type: 'stablePath',
                sourceHandle: 'right',
                data: {
                    label: 'business',
                    computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
                    layoutPathLocked: true,
                },
            }],
            routingSnapshot,
        });

        expect(result?.routingSnapshot).toEqual(routingSnapshot);
        expect(result?.edges[0]).toMatchObject({
            type: 'advanced-smart-step',
            data: { label: 'business' },
        });
        expect(result?.edges[0].sourceHandle).toBeUndefined();
        expect(result?.edges[0].data?.computedPath).toBeUndefined();
    });

    it('opens legacy business data while ignoring an invalid routing snapshot', () => {
        const result = coerceClipboardData({
            nodes: [{ id: 'a', position: { x: 0, y: 0 } }],
            edges: [],
            routingSnapshot: { schema: 'unknown', candidate: {} },
        });

        expect(result).toEqual({
            nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: {} }],
            edges: [],
        });
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
