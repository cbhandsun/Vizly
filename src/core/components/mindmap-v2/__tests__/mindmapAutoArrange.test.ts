import { describe, expect, it } from 'vitest';
import type { NodeObj } from 'mind-elixir';
import { arrangeMindMapTree, getRootSideWeights } from '../mindmapAutoArrange';

describe('arrangeMindMapTree', () => {
    it('balances root branches by subtree weight without mutating input', () => {
        const root: NodeObj = {
            id: 'root',
            topic: '中心',
            children: [
                {
                    id: 'big',
                    topic: '大分支',
                    children: [
                        { id: 'big-1', topic: '1', children: [] },
                        { id: 'big-2', topic: '2', children: [] },
                        { id: 'big-3', topic: '3', children: [] },
                    ],
                },
                { id: 'small-1', topic: '小分支 1', children: [] },
                { id: 'small-2', topic: '小分支 2', children: [] },
                { id: 'small-3', topic: '小分支 3', children: [] },
            ],
        };

        const arranged = arrangeMindMapTree(root);
        const weights = getRootSideWeights(arranged);

        expect(root.children?.every(child => child.direction === undefined)).toBe(true);
        expect(arranged).not.toBe(root);
        expect(arranged.children?.map(child => child.id)).toEqual(['big', 'small-1', 'small-2', 'small-3']);
        expect(Math.abs(weights.left - weights.right)).toBeLessThanOrEqual(1);
    });
});
