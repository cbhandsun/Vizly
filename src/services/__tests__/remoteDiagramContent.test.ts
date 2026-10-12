import { describe, expect, it } from 'vitest';
import { parseRemoteDiagramContent, parseRemoteDiagramJson } from '../remoteDiagramContent';

const makeRemoteDiagram = (overrides: Record<string, unknown> = {}) => ({
    id: 'remote-template',
    name: 'Remote Template',
    type: 'flowchart',
    version: '1.0.0',
    nodes: [{
        id: 'node-1',
        description: 'Start',
        domain: 'default',
        constructor: { polluted: true },
    }],
    edges: [],
    metadata: {
        title: 'Remote Template',
        __proto__: { polluted: true },
    },
    layout: { type: 'custom', direction: 'LR', spacing: { horizontal: 100, vertical: 80 }, padding: { horizontal: 20, vertical: 20 } },
    theme: { name: 'light', displayName: 'Light', domains: {} },
    ...overrides,
});

describe('remoteDiagramContent', () => {
    it.each(['object', 'json'] as const)('preserves a bounded preview over 20KB through the %s boundary', mode => {
        const dataUrl = `data:image/jpeg;base64,${'A'.repeat(24_000)}`;
        const raw = makeRemoteDiagram({ metadata: { title: 'Preview', description: 'x'.repeat(24_000), preview: { mime: 'image/jpeg', dataUrl, width: 640, height: 360, constructor: 'blocked' } } });
        const parsed = parseRemoteDiagramContent(mode === 'json' ? JSON.stringify(raw) : raw, { id: 'fallback', title: 'Fallback' });
        expect(parsed.metadata?.preview?.dataUrl).toBe(dataUrl);
        expect(parsed.metadata?.description).toHaveLength(20_000);
        expect(parsed.metadata?.preview).not.toHaveProperty('constructor');
    });
    it.each([
        null, {},
        { mime: 'image/jpeg', dataUrl: 'https://example.com/image.jpg', width: 10, height: 10 },
        { mime: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,AAAA', width: 10, height: 10 },
        { mime: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AAAA', width: 4097, height: 10 },
        { mime: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AAAA', width: 4096, height: 4096 },
        { mime: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${'A'.repeat(4 * 1024 * 1024)}`, width: 10, height: 10 },
    ])('discards an invalid preview without relaxing the content boundary', preview => {
        const parsed = parseRemoteDiagramContent(makeRemoteDiagram({ metadata: { preview } }), { id: 'fallback', title: 'Fallback' });
        expect(parsed.metadata?.preview).toBeUndefined();
        expect(parsed.nodes).toHaveLength(1);
    });
    it('parses string remote content through bounded diagram coercion', () => {
        const diagram = parseRemoteDiagramContent(JSON.stringify(makeRemoteDiagram()), {
            id: 'fallback',
            title: 'Fallback',
        });

        expect(diagram.id).toBe('remote-template');
        expect(diagram.name).toBe('Remote Template');
        expect(diagram.nodes[0].description).toBe('Start');
        expect(Object.hasOwn(diagram.nodes[0], 'constructor')).toBe(false);
        expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('rejects malformed string content instead of treating it as an object', () => {
        expect(() => parseRemoteDiagramContent('{broken', {
            id: 'fallback',
            title: 'Fallback',
        })).toThrow();
    });

    it('rejects wrong-shaped and oversized remote content', () => {
        expect(() => parseRemoteDiagramContent('plain text', {
            id: 'fallback',
            title: 'Fallback',
        })).toThrow();

        expect(() => parseRemoteDiagramJson('x'.repeat(5 * 1024 * 1024 + 1), {
            id: 'fallback',
            title: 'Fallback',
        })).toThrow('too large');

        expect(() => parseRemoteDiagramContent({
            ...makeRemoteDiagram(),
            nodes: Array.from({ length: 5001 }, (_, index) => ({ id: `node-${index}` })),
        }, {
            id: 'fallback',
            title: 'Fallback',
        })).toThrow('too many nodes');

        expect(() => parseRemoteDiagramContent({
            ...makeRemoteDiagram(),
            groups: Array.from({ length: 2001 }, (_, index) => ({ id: `group-${index}` })),
        }, {
            id: 'fallback',
            title: 'Fallback',
        })).toThrow('too many groups');
    });
});
