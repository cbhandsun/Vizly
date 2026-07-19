import { describe, expect, it } from 'vitest';

import {
    coerceMindElixirDirection,
    DEFAULT_MIND_ELIXIR_DIRECTION,
} from '../mindElixirDirection';

describe('coerceMindElixirDirection', () => {
    it.each([0, 1, 2] as const)('preserves supported direction %s', (direction) => {
        expect(coerceMindElixirDirection(direction)).toBe(direction);
    });

    it('migrates the legacy left value to mind-elixir LEFT', () => {
        expect(coerceMindElixirDirection(3)).toBe(0);
    });

    it.each([undefined, null, Number.NaN, Number.POSITIVE_INFINITY, '2', -1, 4])(
        'uses a bounded fallback for %s',
        (value) => {
            expect(coerceMindElixirDirection(value)).toBe(DEFAULT_MIND_ELIXIR_DIRECTION);
            expect(coerceMindElixirDirection(value, 1)).toBe(1);
        },
    );
});
