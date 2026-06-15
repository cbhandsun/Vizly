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
    });
});
