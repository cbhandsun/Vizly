import { describe, expect, it } from 'vitest';
import { parseDragNodeTemplate, parseReverseImportDiagramState } from '../dragDropPayload';

describe('dragDropPayload', () => {
    it('normalizes valid drag templates', () => {
        const template = parseDragNodeTemplate(JSON.stringify({
            typeName: 'flowchart',
            label: '  API  ',
            config: {
                shape: 'rectangle',
                count: 2,
                lanes: [{ id: 'lane-1', label: 'Ops' }],
            },
            offsetX: 20,
            offsetY: 30,
        }));

        expect(template).toEqual({
            typeName: 'flowchart',
            label: 'API',
            config: {
                shape: 'rectangle',
                count: 2,
                lanes: [{ id: 'lane-1', label: 'Ops' }],
            },
            offsetX: 20,
            offsetY: 30,
        });
    });

    it('rejects malformed, oversized, and unsafe drag templates', () => {
        expect(parseDragNodeTemplate('{broken')).toBeNull();
        expect(parseDragNodeTemplate('x'.repeat(64 * 1024 + 1))).toBeNull();
        expect(parseDragNodeTemplate(JSON.stringify({ typeName: '<script>', label: 'x' }))).toBeNull();
        expect(parseDragNodeTemplate(JSON.stringify({ typeName: 'x'.repeat(65), label: 'x' }))).toBeNull();
    });

    it('removes prototype pollution keys and invalid scalar values from config', () => {
        const template = parseDragNodeTemplate(JSON.stringify({
            typeName: 'flowchart',
            label: 'Node',
            config: {
                safe: true,
                constructor: { polluted: true },
                prototype: { polluted: true },
                nested: {
                    __proto__: { polluted: true },
                    value: Number.MAX_SAFE_INTEGER,
                    text: 'a'.repeat(1_100),
                },
            },
            offsetX: Number.POSITIVE_INFINITY,
            offsetY: 3_000,
        }));

        expect(template?.offsetX).toBe(0);
        expect(template?.offsetY).toBe(0);
        expect(template?.config).toEqual({
            safe: true,
            nested: {
                text: 'a'.repeat(1_000),
            },
        });
    });

    it('parses encoded reverse import diagram metadata through clipboard guards', () => {
        const encoded = encodeURIComponent(JSON.stringify({
            nodes: [{ id: ' a ', position: { x: 10, y: 20 } }],
            edges: [
                { id: 'valid', source: 'a', target: 'a' },
                { id: 'missing', source: 'a', target: 'missing' },
            ],
        }));

        const result = parseReverseImportDiagramState(encoded, true);

        expect(result?.nodes).toEqual([expect.objectContaining({ id: 'a', position: { x: 10, y: 20 } })]);
        expect(result?.edges).toEqual([expect.objectContaining({ id: 'valid' })]);
    });

    it('rejects invalid or oversized reverse import metadata', () => {
        expect(parseReverseImportDiagramState('%E0%A4%A', true)).toBeNull();
        expect(parseReverseImportDiagramState('x'.repeat(5 * 1024 * 1024 + 1))).toBeNull();
        expect(parseReverseImportDiagramState(JSON.stringify({ nodes: [{ id: 'a' }], edges: [] }))).toBeNull();
    });
});
