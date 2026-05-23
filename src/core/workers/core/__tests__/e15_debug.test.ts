import { describe, expect, it } from 'vitest';
import { getNodePosition } from '../../../algorithms/smartEdgeUtils';

describe('EdgeRoutingWorker E-15 position regression', () => {
    it('normalizes malformed node coordinates without throwing', () => {
        const inputs = [
            null,
            undefined,
            {},
            { computed: null },
            { computed: { positionAbsolute: null } },
            { positionAbsolute: null },
            { position: null },
            { position: { x: null, y: null } },
            { positionAbsolute: { x: Number.NaN, y: Infinity } },
        ];

        for (const input of inputs) {
            expect(() => getNodePosition(input as never)).not.toThrow();
            expect(getNodePosition(input as never)).toEqual({ x: 0, y: 0 });
        }
    });

    it('prefers computed absolute coordinates over positionAbsolute and position', () => {
        expect(getNodePosition({
            position: { x: 1, y: 2 },
            positionAbsolute: { x: 3, y: 4 },
            computed: { positionAbsolute: { x: 5, y: 6 } },
        })).toEqual({ x: 5, y: 6 });
    });
});

