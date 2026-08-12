import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { resolveFloatingToolbarStyleState } from '../floatingContextToolbarState';

const node = (id: string, opacity: unknown, strokeWidth: unknown, dashed = false): Node => ({
    id,
    position: { x: 0, y: 0 },
    data: { label: id },
    style: {
        opacity: opacity as number,
        strokeWidth: strokeWidth as number,
        strokeDasharray: dashed ? '4,4' : undefined,
    },
});

describe('resolveFloatingToolbarStyleState', () => {
    it('reports mixed values instead of averaging them into a false shared value', () => {
        expect(resolveFloatingToolbarStyleState([
            node('a', 0.6, 1),
            node('b', 0.8, 2, true),
            node('c', 0.8, 2, true),
        ])).toEqual({
            opacity: 0.6,
            opacityMixed: true,
            strokeWidth: 1,
            dashed: false,
            borderMixed: true,
        });
    });

    it('coerces invalid persisted values to safe toolbar defaults', () => {
        expect(resolveFloatingToolbarStyleState([
            node('invalid', 'not-a-number', Number.NaN),
        ])).toEqual({
            opacity: 1,
            opacityMixed: false,
            strokeWidth: 1,
            dashed: false,
            borderMixed: false,
        });

        expect(resolveFloatingToolbarStyleState([
            node('extreme', 4, -10),
        ])).toMatchObject({ opacity: 1, strokeWidth: 0 });
    });
});
