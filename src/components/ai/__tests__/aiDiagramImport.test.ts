import { describe, expect, it, vi } from 'vitest';
import {
    getAIDiagramTitle,
    parseAIDiagramJson,
    registerAIDiagramLocally,
    upsertDiagramConfigIndex,
} from '../aiDiagramImport';
import { DIAGRAM_JSON_IMPORT_MAX_CHARS } from '@/core/utils/diagramJsonImport';

const makeDiagramJson = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    id: 'ai-diagram',
    name: 'AI Diagram',
    type: 'flowchart',
    version: '1.0.0',
    nodes: [{
        id: 'n1',
        description: 'Node',
        domain: 'ops',
        constructor: { polluted: true },
    }],
    edges: [],
    metadata: {
        title: 'AI Generated',
        __proto__: { polluted: true },
    },
    ...overrides,
});

describe('aiDiagramImport', () => {
    it('parses and sanitizes AI diagram JSON before use', () => {
        const diagram = parseAIDiagramJson(makeDiagramJson(), {
            id: 'fallback',
            title: 'Fallback',
        });

        expect(diagram.id).toBe('ai-diagram');
        expect(diagram.metadata?.title).toBe('AI Generated');
        expect(Object.hasOwn(diagram.nodes[0], 'constructor')).toBe(false);
        expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('rejects oversized AI diagram JSON', () => {
        expect(() => parseAIDiagramJson('x'.repeat(DIAGRAM_JSON_IMPORT_MAX_CHARS + 1), {
            id: 'fallback',
            title: 'Fallback',
        })).toThrow('too large');
    });

    it('derives bounded titles and repairs corrupted dashboard indexes', () => {
        const diagram = parseAIDiagramJson(makeDiagramJson({
            metadata: { title: 'x'.repeat(300) },
        }), {
            id: 'fallback',
            title: 'Fallback',
        });

        const storage = localStorage;
        storage.setItem('vizly_diagram_configs', '{broken');
        const title = getAIDiagramTitle(diagram, 'Fallback');
        upsertDiagramConfigIndex(storage, diagram, title, 123);

        const saved = JSON.parse(storage.getItem('vizly_diagram_configs') || '{}');
        expect(title).toHaveLength(160);
        expect(saved['ai-diagram']).toEqual({
            id: 'ai-diagram',
            type: 'flowchart',
            name: title,
            updatedAt: 123,
        });
    });

    it('registers AI local saves through the remote diagram guard', () => {
        const diagram = parseAIDiagramJson(makeDiagramJson(), {
            id: 'fallback',
            title: 'Fallback',
        });
        const registerRemoteDiagram = vi.fn((content, fallback, persist, overrides) => ({
            ...(content as object),
            ...overrides,
            id: fallback.id,
        }));

        const registered = registerAIDiagramLocally({ registerRemoteDiagram }, diagram, 'Saved AI Diagram');

        expect(registerRemoteDiagram).toHaveBeenCalledWith(diagram, {
            id: 'ai-diagram',
            title: 'Saved AI Diagram',
        }, true, {
            id: 'ai-diagram',
            metadata: {
                ...(diagram.metadata || {}),
                title: 'Saved AI Diagram',
            },
        });
        expect(registered.id).toBe('ai-diagram');
        expect(registered.metadata?.title).toBe('Saved AI Diagram');
    });
});
