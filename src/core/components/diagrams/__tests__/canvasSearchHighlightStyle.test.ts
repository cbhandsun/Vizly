import { describe, expect, it } from 'vitest';

import { buildPresentationNodeSelector } from '../../presentation/presentationSelectorSafety';
import { buildCanvasSearchHighlightStyle } from '../canvasSearchHighlightStyle';

describe('buildCanvasSearchHighlightStyle', () => {
    it('returns no style for a blank query or no matches', () => {
        expect(buildCanvasSearchHighlightStyle({
            currentMatch: null,
            currentMatchKey: null,
            edges: [],
            matches: [],
            nodes: [],
            query: ' ',
        })).toBe('');
    });

    it('escapes imported ids and includes reduced-motion protection', () => {
        const unsafeId = 'node-1"] { color: red; } /*';
        const style = buildCanvasSearchHighlightStyle({
            currentMatch: { kind: 'node', id: unsafeId },
            currentMatchKey: `node:${unsafeId}`,
            edges: [],
            matches: [{ kind: 'node', id: unsafeId }],
            nodes: [{ id: unsafeId, position: { x: 0, y: 0 }, data: {} }],
            query: 'unsafe',
        });

        expect(style).toContain(buildPresentationNodeSelector(unsafeId));
        expect(style).toContain('@media (prefers-reduced-motion: reduce)');
        expect(style).not.toContain(`data-id="${unsafeId}"`);
    });
});
