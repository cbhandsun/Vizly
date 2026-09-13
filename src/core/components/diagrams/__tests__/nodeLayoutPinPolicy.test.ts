import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
    applyNodeLayoutPinnedState,
    areAllNodesLayoutPinned,
    isNodeLayoutPinned,
} from '../nodeLayoutPinPolicy';

const node = (id: string, fixed?: boolean): Node => ({
    id,
    position: { x: 0, y: 0 },
    data: { ...(fixed === undefined ? {} : { fixed }) },
});

describe('nodeLayoutPinPolicy', () => {
    it('detects fully pinned selections without treating empty selections as pinned', () => {
        expect(isNodeLayoutPinned(node('fixed', true))).toBe(true);
        expect(isNodeLayoutPinned(node('free', false))).toBe(false);
        expect(areAllNodesLayoutPinned([])).toBe(false);
        expect(areAllNodesLayoutPinned([node('a', true), node('b', true)])).toBe(true);
        expect(areAllNodesLayoutPinned([node('a', true), node('b', false)])).toBe(false);
    });

    it('toggles only explicit targets while preserving node editability fields', () => {
        const nodes = [
            { ...node('a'), draggable: true, data: { label: 'A' } },
            { ...node('b', true), draggable: true, data: { label: 'B', fixed: true } },
            { ...node('c'), draggable: false, data: { label: 'C', locked: true } },
        ];

        const pinned = applyNodeLayoutPinnedState(nodes, new Set(['a', 'missing']), true);
        expect(pinned.changed).toBe(true);
        expect(pinned.nodes.map(item => ({
            id: item.id,
            fixed: item.data?.fixed,
            locked: item.data?.locked,
            draggable: item.draggable,
        }))).toEqual([
            { id: 'a', fixed: true, locked: undefined, draggable: true },
            { id: 'b', fixed: true, locked: undefined, draggable: true },
            { id: 'c', fixed: undefined, locked: true, draggable: false },
        ]);

        const unchanged = applyNodeLayoutPinnedState(pinned.nodes, new Set(['a']), true);
        expect(unchanged.changed).toBe(false);
        expect(unchanged.nodes).toBe(pinned.nodes);

        const unpinned = applyNodeLayoutPinnedState(pinned.nodes, new Set(['a', 'b']), false);
        expect(unpinned.changed).toBe(true);
        expect(unpinned.nodes.slice(0, 2).map(item => item.data?.fixed)).toEqual([false, false]);
    });
});
