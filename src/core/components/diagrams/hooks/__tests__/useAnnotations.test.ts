import { describe, expect, it } from 'vitest';
import { coerceAnnotations } from '../useAnnotations';

describe('useAnnotations security coercion', () => {
    it('filters malformed annotations and strips unsafe shapes', () => {
        const annotations = coerceAnnotations(JSON.parse(`[
            {
                "id": "ann-1",
                "text": "ok",
                "x": 10,
                "y": 20,
                "color": "#60a5fa",
                "resolved": true,
                "createdAt": 123,
                "constructor": { "polluted": true }
            },
            { "id": "ann-1", "text": "duplicate", "x": 30, "y": 40 },
            { "id": "bad-x", "text": "bad", "x": "NaN", "y": 1 },
            { "id": "", "text": "bad", "x": 1, "y": 1 }
        ]`));

        expect(annotations).toEqual([{
            id: 'ann-1',
            text: 'ok',
            x: 10,
            y: 20,
            color: '#60a5fa',
            resolved: true,
            createdAt: 123,
        }]);
        expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('bounds text, color, coordinates, and timestamps', () => {
        const annotations = coerceAnnotations([{
            id: 'ann-2',
            text: 'x'.repeat(5000),
            x: 1_000_000,
            y: -1_000_000,
            color: 'url(javascript:alert(1))',
            resolved: false,
            createdAt: -10,
        }]);

        expect(annotations).toHaveLength(1);
        expect(annotations[0].text).toHaveLength(4000);
        expect(annotations[0].color).toBe('#facc15');
        expect(annotations[0].createdAt).toBe(0);
    });

    it('rejects non-array payloads', () => {
        expect(coerceAnnotations({ id: 'ann' })).toEqual([]);
        expect(coerceAnnotations(null)).toEqual([]);
    });
});
