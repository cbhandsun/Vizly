import { describe, expect, it } from 'vitest';

import { resolveCommonPropertyValue } from '../commonPropertyValue';

describe('resolveCommonPropertyValue', () => {
    it('distinguishes an empty selection from a common undefined value', () => {
        expect(resolveCommonPropertyValue([], (value: string | undefined) => value))
            .toEqual({ kind: 'empty' });
        expect(resolveCommonPropertyValue([undefined, undefined], value => value))
            .toEqual({ kind: 'common', value: undefined });
    });

    it('returns the shared value when every selected item matches', () => {
        expect(resolveCommonPropertyValue(
            [{ color: '#2196F3' }, { color: '#2196F3' }],
            item => item.color,
        )).toEqual({ kind: 'common', value: '#2196F3' });
    });

    it('reports mixed values without substituting a fallback', () => {
        expect(resolveCommonPropertyValue(
            [{ color: '#2196F3' }, { color: '#000000' }],
            item => item.color,
        )).toEqual({ kind: 'mixed' });
    });

    it('uses Object.is semantics for numeric edge cases', () => {
        expect(resolveCommonPropertyValue([Number.NaN, Number.NaN], value => value))
            .toEqual({ kind: 'common', value: Number.NaN });
        expect(resolveCommonPropertyValue([0, -0], value => value))
            .toEqual({ kind: 'mixed' });
    });
});
