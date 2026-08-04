import { describe, expect, it } from 'vitest';
import {
    isLayerNameAvailable,
    normalizeLayerNameInput,
    resolveUniqueLayerName,
} from '../../../utils/layerName';

describe('normalizeLayerNameInput', () => {
    it('coerces whitespace and removes control characters', () => {
        expect(normalizeLayerNameInput('  评审\u0000\n  图层  ')).toBe('评审 图层');
        expect(normalizeLayerNameInput('评\u200B审\u202E图层')).toBe('评审图层');
    });

    it('rejects empty and non-string input', () => {
        expect(normalizeLayerNameInput(' \n\t ')).toBeNull();
        expect(normalizeLayerNameInput(null)).toBeNull();
        expect(normalizeLayerNameInput(42)).toBeNull();
    });

    it('bounds very long names', () => {
        expect(normalizeLayerNameInput('x'.repeat(500))).toHaveLength(80);
    });

    it('rejects visually equivalent names while allowing the current layer name', () => {
        const layers = [
            { id: 'layer-0', name: '默认' },
            { id: 'layer-1', name: 'Review' },
        ];

        expect(isLayerNameAvailable(layers, ' 默\u200B认 ')).toBe(false);
        expect(isLayerNameAvailable(layers, 'ＲＥＶＩＥＷ')).toBe(false);
        expect(isLayerNameAvailable(layers, 'review', 'layer-1')).toBe(true);
        expect(isLayerNameAvailable(layers, '')).toBe(false);
    });

    it('repairs duplicate stored names without dropping their layer ids', () => {
        expect(resolveUniqueLayerName(['默认'], '默认')).toBe('默认 (2)');
        expect(resolveUniqueLayerName(['Review', 'review (2)'], 'ＲＥＶＩＥＷ')).toBe('ＲＥＶＩＥＷ (3)');
        expect(resolveUniqueLayerName([], null)).toBeNull();
    });
});
