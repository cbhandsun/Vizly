import { describe, expect, it } from 'vitest';
import type { NodeObj } from 'mind-elixir';

import { setMindMapTreeExpanded } from '../mindmapTreeExpansion';

describe('setMindMapTreeExpanded', () => {
    it.each([true, false])('sets every node expanded=%s without mutating input', (expanded) => {
        const tree: NodeObj = {
            id: 'root',
            topic: 'Root',
            expanded: !expanded,
            children: [{
                id: 'child',
                topic: 'Child',
                expanded: !expanded,
                children: [{ id: 'leaf', topic: 'Leaf' }],
            }],
        };

        const result = setMindMapTreeExpanded(tree, expanded);

        expect(result.expanded).toBe(expanded);
        expect(result.children?.[0].expanded).toBe(expanded);
        expect(result.children?.[0].children?.[0].expanded).toBe(expanded);
        expect(tree.expanded).toBe(!expanded);
        expect(result).not.toBe(tree);
    });

    it('normalizes a missing children collection to an empty array', () => {
        expect(setMindMapTreeExpanded({ id: 'root', topic: 'Root' }, true).children).toEqual([]);
    });
});
