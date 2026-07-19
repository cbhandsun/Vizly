import { describe, expect, it } from 'vitest';

import { createSmartEdgeAbsolutePositionResolver } from '../smartEdgeNodeGeometry';

describe('createSmartEdgeAbsolutePositionResolver', () => {
    it('prefers live absolute coordinates over simplified nodes', () => {
        const resolve = createSmartEdgeAbsolutePositionResolver(
            new Map([['child', { id: 'child', internals: { positionAbsolute: { x: 30, y: 40 } } }]]),
            new Map([['child', { id: 'child', position: { x: 1, y: 2 } }]]),
        );

        expect(resolve('child')).toEqual({ x: 30, y: 40 });
    });

    it('adds parent positions for nested nodes without absolute coordinates', () => {
        const resolve = createSmartEdgeAbsolutePositionResolver(
            new Map([
                ['parent', { id: 'parent', position: { x: 100, y: 200 } }],
                ['child', { id: 'child', parentId: 'parent', position: { x: 10, y: 20 } }],
            ]),
            new Map(),
        );

        expect(resolve('child')).toEqual({ x: 110, y: 220 });
    });

    it('coerces missing, non-finite, and cyclic node data to finite coordinates', () => {
        const resolve = createSmartEdgeAbsolutePositionResolver(
            new Map([
                ['a', { id: 'a', parentId: 'b', position: { x: Number.NaN, y: 5 } }],
                ['b', { id: 'b', parentId: 'a', x: Number.POSITIVE_INFINITY, y: 7 }],
            ]),
            new Map(),
        );

        expect(resolve('missing')).toEqual({ x: 0, y: 0 });
        expect(resolve('a')).toEqual({ x: 0, y: 17 });
    });
});
