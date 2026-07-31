import { describe, expect, it } from 'vitest';
import { normalizeLayerNameInput } from '../layerNameInput';

describe('normalizeLayerNameInput', () => {
    it('coerces whitespace and removes control characters', () => {
        expect(normalizeLayerNameInput('  评审\u0000\n  图层  ')).toBe('评审 图层');
    });

    it('rejects empty and non-string input', () => {
        expect(normalizeLayerNameInput(' \n\t ')).toBeNull();
        expect(normalizeLayerNameInput(null)).toBeNull();
        expect(normalizeLayerNameInput(42)).toBeNull();
    });

    it('bounds very long names', () => {
        expect(normalizeLayerNameInput('x'.repeat(500))).toHaveLength(80);
    });
});
