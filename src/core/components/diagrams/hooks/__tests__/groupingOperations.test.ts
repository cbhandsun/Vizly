import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createGroupingPlan } from '../groupingOperations';

const node = (
    id: string,
    x: number,
    y: number,
    options: Partial<Node> = {},
): Node => ({
    id,
    position: { x, y },
    measured: { width: 100, height: 60 },
    data: {},
    ...options,
});

describe('createGroupingPlan', () => {
    it('places a root group before its children and preserves their absolute positions', () => {
        const first = node('first', 100, 150);
        const second = node('second', 300, 240);

        const plan = createGroupingPlan({
            nodes: [first, second],
            selectedNodes: [first, second],
            groupId: 'group-1',
        });

        expect(plan).not.toBeNull();
        expect(plan?.nodes.map(item => item.id)).toEqual(['group-1', 'first', 'second']);
        expect(plan?.groupNode).toMatchObject({
            id: 'group-1',
            type: 'titleGroup',
            position: { x: 60, y: 110 },
            selected: true,
        });
        expect(plan?.nodes[1]).toMatchObject({
            parentId: 'group-1',
            position: { x: 40, y: 40 },
            extent: 'parent',
        });
        expect(plan?.nodes[2]).toMatchObject({
            parentId: 'group-1',
            position: { x: 240, y: 130 },
            extent: 'parent',
        });
    });

    it('inserts a nested group after its parent and before reparented children', () => {
        const parent = node('parent', 20, 30, { type: 'titleGroup' });
        const first = node('first', 80, 90, { parentId: 'parent' });
        const second = node('second', 220, 180, { parentId: 'parent' });

        const plan = createGroupingPlan({
            nodes: [parent, first, second],
            selectedNodes: [first, second],
            groupId: 'group-2',
        });

        expect(plan?.nodes.map(item => item.id)).toEqual([
            'parent',
            'group-2',
            'first',
            'second',
        ]);
        expect(plan?.groupNode).toMatchObject({
            type: 'subGroup',
            parentId: 'parent',
        });
    });

    it('rejects empty, single, cross-parent, and non-finite selections', () => {
        const first = node('first', 0, 0, { parentId: 'a' });
        const second = node('second', 20, 20, { parentId: 'b' });
        const invalid = node('invalid', Number.POSITIVE_INFINITY, 0, { parentId: 'a' });

        expect(createGroupingPlan({
            nodes: [],
            selectedNodes: [],
            groupId: 'group',
        })).toBeNull();
        expect(createGroupingPlan({
            nodes: [first],
            selectedNodes: [first],
            groupId: 'group',
        })).toBeNull();
        expect(createGroupingPlan({
            nodes: [first, second],
            selectedNodes: [first, second],
            groupId: 'group',
        })).toBeNull();
        expect(createGroupingPlan({
            nodes: [first, invalid],
            selectedNodes: [first, invalid],
            groupId: 'group',
        })).toBeNull();
    });
});
