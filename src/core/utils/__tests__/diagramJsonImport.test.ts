import { describe, expect, it } from 'vitest';
import {
    coerceReactFlowImport,
    coerceStandardDiagramImport,
    DiagramJsonImportError,
    DIAGRAM_JSON_IMPORT_MAX_CHARS,
    getDiagramImportKind,
    isLikelyStandardDiagramData,
    parseDiagramJson,
} from '../diagramJsonImport';

describe('diagramJsonImport', () => {
    it('classifies supported import filenames case-insensitively', () => {
        expect(getDiagramImportKind('DIAGRAM.JSON')).toBe('json');
        expect(getDiagramImportKind('flow.MMD')).toBe('mermaid');
        expect(getDiagramImportKind('flow.mermaid')).toBe('mermaid');
        expect(getDiagramImportKind('notes.TXT')).toBe('mermaid');
        expect(getDiagramImportKind('diagram.png')).toBeNull();
        expect(getDiagramImportKind('json')).toBeNull();
    });

    it('parses bounded JSON and rejects oversized content', () => {
        expect(parseDiagramJson('{"nodes":[],"edges":[]}')).toEqual({ nodes: [], edges: [] });
        let oversizedJsonError: unknown;
        try {
            parseDiagramJson('x'.repeat(DIAGRAM_JSON_IMPORT_MAX_CHARS + 1));
        } catch (error) {
            oversizedJsonError = error;
        }
        expect(oversizedJsonError).toBeInstanceOf(DiagramJsonImportError);
        expect(oversizedJsonError).toMatchObject({ code: 'too-large' });
        let invalidJsonError: unknown;
        try {
            parseDiagramJson('{broken');
        } catch (error) {
            invalidJsonError = error;
        }
        expect(invalidJsonError).toBeInstanceOf(Error);
        expect(invalidJsonError).toMatchObject({
            name: 'DiagramJsonImportError',
            code: 'invalid-json',
            message: 'Diagram JSON is invalid.',
            cause: expect.any(SyntaxError),
        });
    });

    it('detects likely standard diagram data', () => {
        expect(isLikelyStandardDiagramData({
            type: 'flowchart',
            version: '1.0.0',
            nodes: [{ id: 'n1', description: 'Node', domain: 'ops' }],
            edges: [],
        })).toBe(true);

        expect(isLikelyStandardDiagramData({
            nodes: [{ id: 'n1', position: { x: 0, y: 0 } }],
            edges: [],
        })).toBe(false);
    });

    it('coerces standard diagram imports and strips dangerous keys', () => {
        const diagram = coerceStandardDiagramImport(JSON.parse(`{
            "name": "Imported",
            "type": "flowchart",
            "version": "1.0.0",
            "nodes": [{
                "id": "n1",
                "description": "Node",
                "domain": "ops",
                "constructor": { "polluted": true }
            }],
            "edges": [],
            "metadata": { "__proto__": { "polluted": true }, "safe": true }
        }`), { id: 'fallback', title: 'Fallback' });

        expect(diagram).toMatchObject({
            name: 'Imported',
            nodes: [expect.objectContaining({ id: 'n1', description: 'Node', domain: 'ops' })],
            metadata: { safe: true },
        });
        expect(Object.hasOwn(diagram.nodes[0], 'constructor')).toBe(false);
        expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('keeps exported groups when coercing JSON editor content', () => {
        const diagram = coerceStandardDiagramImport({
            name: 'Imported',
            type: 'flowchart',
            version: '1.0.0',
            nodes: [{
                id: 'child',
                description: 'Child',
                domain: 'ops',
                parentId: 'group-1',
                metadata: { canvasPosition: { x: 24, y: 32 }, parentId: 'group-1' },
            }],
            edges: [],
            groups: [{
                id: 'group-1',
                type: 'group',
                description: 'Operations',
                domain: 'ops',
                position: { x: 300, y: 120 },
                measured: { width: 600, height: 400 },
                metadata: { canvasPosition: { x: 300, y: 120 } },
                data: { label: 'Operations' },
            }],
        }, { id: 'fallback', title: 'Fallback' });

        expect(diagram.groups?.[0]).toMatchObject({
            id: 'group-1',
            position: { x: 300, y: 120 },
            measured: { width: 600, height: 400 },
        });
    });

    it('coerces React Flow imports through clipboard guards', () => {
        const canvas = coerceReactFlowImport(JSON.parse(`{
            "nodes": [{
                "id": "n1",
                "position": { "x": 0, "y": 0 },
                "data": { "label": "Node", "constructor": { "polluted": true } }
            }],
            "edges": []
        }`));

        expect(canvas.nodes[0].data).toEqual({ label: 'Node' });
        expect(() => coerceReactFlowImport({ nodes: [{ id: 'bad' }], edges: [] })).toThrow('React Flow JSON');
    });
});
