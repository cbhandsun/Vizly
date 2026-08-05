import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
    ensureParentsPrecedeChildren,
    reorderNodesWithinParentScopes,
} from '../nodeLayerOrdering';

const node = (id: string, parentId?: string): Node => ({
    id,
    parentId,
    position: { x: 0, y: 0 },
    data: { label: id },
});

const ids = (nodes: readonly Node[]) => nodes.map(item => item.id);

describe('nodeLayerOrdering', () => {
    it('moves every selected node within its own parent scope', () => {
        const input = [
            node('root-a'),
            node('root-b'),
            node('a-1', 'root-a'),
            node('a-2', 'root-a'),
            node('b-1', 'root-b'),
            node('b-2', 'root-b'),
        ];

        const result = reorderNodesWithinParentScopes(
            input,
            new Set(['a-1', 'b-1']),
            'front',
        );

        expect(result.changed).toBe(true);
        expect(ids(result.nodes)).toEqual([
            'root-a',
            'root-b',
            'a-2',
            'a-1',
            'b-2',
            'b-1',
        ]);
    });

    it('sends a child behind its siblings without placing it before the parent', () => {
        const input = [
            node('parent'),
            node('root-peer'),
            node('child-a', 'parent'),
            node('child-b', 'parent'),
        ];

        const result = reorderNodesWithinParentScopes(
            input,
            new Set(['child-b']),
            'back',
        );

        expect(result.changed).toBe(true);
        expect(ids(result.nodes)).toEqual([
            'parent',
            'root-peer',
            'child-b',
            'child-a',
        ]);
        expect(result.nodes.findIndex(item => item.id === 'parent'))
            .toBeLessThan(result.nodes.findIndex(item => item.id === 'child-b'));
    });

    it('preserves the relative order of multiple selected siblings', () => {
        const input = [node('a'), node('b'), node('c'), node('d')];

        expect(ids(reorderNodesWithinParentScopes(
            input,
            new Set(['b', 'd']),
            'back',
        ).nodes)).toEqual(['b', 'd', 'a', 'c']);

        expect(ids(reorderNodesWithinParentScopes(
            input,
            new Set(['a', 'c']),
            'front',
        ).nodes)).toEqual(['b', 'd', 'a', 'c']);
    });

    it('repairs a child-before-parent order without looping on malformed cycles', () => {
        const childBeforeParent = [node('child', 'parent'), node('parent')];
        expect(ids(ensureParentsPrecedeChildren(childBeforeParent)))
            .toEqual(['parent', 'child']);

        const cycle = [node('a', 'b'), node('b', 'a')];
        expect(ids(ensureParentsPrecedeChildren(cycle)).sort())
            .toEqual(['a', 'b']);
    });

    it('returns unchanged results for empty, missing, or already-extreme targets', () => {
        const input = [node('a'), node('b')];

        expect(reorderNodesWithinParentScopes(input, new Set(), 'front').changed).toBe(false);
        expect(reorderNodesWithinParentScopes(input, new Set(['missing']), 'front').changed).toBe(false);
        expect(reorderNodesWithinParentScopes(input, new Set(['b']), 'front').changed).toBe(false);
        expect(reorderNodesWithinParentScopes(input, new Set(['a']), 'back').changed).toBe(false);
    });
});
