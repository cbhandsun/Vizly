import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { hasMutationLockedNode, isNodeMutationLocked, resolveTargetNodes } from '../nodeLockPolicy';

const node = (id: string, locked?: boolean, draggable?: boolean): Node => ({
    id,
    position: { x: 0, y: 0 },
    data: { ...(locked === undefined ? {} : { locked }) },
    draggable,
});

describe('nodeLockPolicy', () => {
    it('treats explicit locks and non-draggable nodes as mutation protected', () => {
        expect(isNodeMutationLocked(node('explicit', true, true))).toBe(true);
        expect(isNodeMutationLocked(node('layer', false, false))).toBe(true);
        expect(isNodeMutationLocked(node('editable', false, true))).toBe(false);
    });

    it('resolves only existing targets and detects mixed protected selections', () => {
        const nodes = [node('locked', true), node('editable', false)];
        const targets = resolveTargetNodes(nodes, new Set(['missing', 'locked']));

        expect(targets.map(item => item.id)).toEqual(['locked']);
        expect(hasMutationLockedNode(targets)).toBe(true);
        expect(hasMutationLockedNode([])).toBe(false);
    });
});
