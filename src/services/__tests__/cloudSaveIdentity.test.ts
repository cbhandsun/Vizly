// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readSavedDiagramId } from '../cloudSaveIdentity';

describe('storage returned identity', () => {
    it.each(['diagram.json', 'diagram-1', '11111111-1111-4111-8111-111111111111'])('accepts a canonical id: %s', id => {
        expect(readSavedDiagramId({ id })).toBe(id);
    });
    it.each([undefined, null, [], {}, { id: '' }, { id: 123 }, { id: '\u0000unsafe' }, { id: 'x'.repeat(10000) }])('rejects invalid provider results: case %#', value => {
        expect(() => readSavedDiagramId(value)).toThrow('invalid diagram identity');
    });
});
