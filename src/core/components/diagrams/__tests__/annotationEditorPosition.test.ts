import { describe, expect, it } from 'vitest';

import { resolveAnnotationEditorPosition } from '../annotationEditorPosition';

describe('resolveAnnotationEditorPosition', () => {
    it('keeps a central desktop click close to its source point', () => {
        expect(resolveAnnotationEditorPosition({ x: 500, y: 300 }, { width: 1280, height: 800 }))
            .toEqual({ x: 492, y: 292 });
    });

    it('keeps the editor above mobile bottom navigation', () => {
        const position = resolveAnnotationEditorPosition({ x: 100, y: 650 }, { width: 406, height: 844 });
        expect(position.x).toBe(92);
        expect(position.y).toBe(516);
    });

    it('coerces extreme and invalid viewport input into visible bounds', () => {
        expect(resolveAnnotationEditorPosition({ x: -500, y: 9999 }, { width: Number.NaN, height: 0 }))
            .toEqual({ x: 12, y: 240 });
    });
});
