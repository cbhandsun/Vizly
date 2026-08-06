import { describe, expect, it } from 'vitest';

import {
    parseMermaidDocumentDeclaration,
    requireMermaidDocumentDeclaration,
} from '../mermaidDocumentBoundary';

describe('mermaidDocumentBoundary', () => {
    it.each([
        [['graph TD', 'A --> B'], 'flowchart'],
        [['flowchart LR', 'A --> B'], 'flowchart'],
        [['%% comment', '', 'mindmap', '  root((Root))'], 'mindmap'],
    ] as const)('recognizes a declared Mermaid document', (lines, kind) => {
        expect(parseMermaidDocumentDeclaration(lines)).toMatchObject({ ok: true, kind });
    });

    it.each([
        { lines: [] },
        { lines: ['', '%% comment'] },
        { lines: ['not a mermaid document'] },
        { lines: ['graph', 'A --> B'] },
        { lines: ['sequenceDiagram', 'A->>B: hello'] },
    ])('rejects empty, headerless, incomplete, or unsupported input', ({ lines }) => {
        expect(parseMermaidDocumentDeclaration(lines).ok).toBe(false);
        expect(() => requireMermaidDocumentDeclaration(lines)).toThrow(
            'Mermaid document declaration is required.',
        );
    });

    it('rejects a valid but unsupported document kind without exposing input', () => {
        expect(() => requireMermaidDocumentDeclaration(
            ['mindmap', '  root((sensitive-content))'],
            ['flowchart'],
        )).toThrow('Unsupported Mermaid document type.');
    });
});
