import { describe, expect, it } from 'vitest';

import {
    getMindMapOutlineNavigationTarget,
    getMindMapOutlineRovingId,
} from '../mindMapOutlineKeyboard';

const visibleIds = ['root', 'branch-a', 'branch-b'];

describe('mind map outline keyboard navigation', () => {
    it('keeps exactly one visible tree item in the roving tab sequence', () => {
        expect(getMindMapOutlineRovingId(visibleIds, 'branch-a')).toBe('branch-a');
        expect(getMindMapOutlineRovingId(visibleIds, 'filtered-out')).toBe('root');
        expect(getMindMapOutlineRovingId([], 'branch-a')).toBeNull();
    });

    it('moves through the visible result set with arrows, Home, and End', () => {
        expect(getMindMapOutlineNavigationTarget({
            key: 'ArrowDown', currentId: 'root', visibleIds,
        })).toBe('branch-a');
        expect(getMindMapOutlineNavigationTarget({
            key: 'ArrowUp', currentId: 'branch-b', visibleIds,
        })).toBe('branch-a');
        expect(getMindMapOutlineNavigationTarget({
            key: 'Home', currentId: 'branch-b', visibleIds,
        })).toBe('root');
        expect(getMindMapOutlineNavigationTarget({
            key: 'End', currentId: 'root', visibleIds,
        })).toBe('branch-b');
    });

    it('stays bounded and rejects unrelated or empty navigation requests', () => {
        expect(getMindMapOutlineNavigationTarget({
            key: 'ArrowUp', currentId: 'root', visibleIds,
        })).toBe('root');
        expect(getMindMapOutlineNavigationTarget({
            key: 'ArrowDown', currentId: 'branch-b', visibleIds,
        })).toBe('branch-b');
        expect(getMindMapOutlineNavigationTarget({
            key: 'ArrowDown', currentId: 'missing', visibleIds,
        })).toBe('root');
        expect(getMindMapOutlineNavigationTarget({
            key: 'Enter', currentId: 'root', visibleIds,
        })).toBeNull();
        expect(getMindMapOutlineNavigationTarget({
            key: 'ArrowDown', currentId: 'root', visibleIds: [],
        })).toBeNull();
    });
});
