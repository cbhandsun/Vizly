import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { resolveFloatingContextToolbarOffset } from '../floatingContextToolbarPosition';

const node = (id: string, y: number, parentId?: string): Node => ({
    id,
    position: { x: 0, y },
    data: {},
    parentId,
});

describe('resolveFloatingContextToolbarOffset', () => {
    it('clears a nearby parent group header', () => {
        expect(resolveFloatingContextToolbarOffset([
            node('child', 84, 'group'),
        ])).toBe(56);
    });

    it('uses the compact gap for top-level and lower child nodes', () => {
        expect(resolveFloatingContextToolbarOffset([node('top-level', 40)])).toBe(20);
        expect(resolveFloatingContextToolbarOffset([
            node('lower-child', 300, 'group'),
        ])).toBe(20);
    });

    it('ignores invalid relative coordinates', () => {
        expect(resolveFloatingContextToolbarOffset([
            node('invalid', Number.NaN, 'group'),
        ])).toBe(20);
    });
});
