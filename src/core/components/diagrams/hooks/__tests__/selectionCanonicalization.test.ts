import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { canonicalizeSelectionById } from '../selectionCanonicalization';

describe('canonicalizeSelectionById', () => {
    it('replaces stale selected node objects with the latest canonical state', () => {
        const staleNode: Node = {
            id: 'node-1',
            position: { x: 0, y: 0 },
            data: { label: 'Node' },
            draggable: true,
        };
        const lockedNode: Node = {
            ...staleNode,
            draggable: false,
            data: { ...staleNode.data, locked: true },
        };

        expect(canonicalizeSelectionById([staleNode], [lockedNode])).toEqual([lockedNode]);
    });

    it('preserves a selected item when the current collection does not contain it', () => {
        const detached = { id: 'detached', value: 1 };
        expect(canonicalizeSelectionById([detached], [])).toEqual([detached]);
    });
});
