import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import {
    findNodeParentCandidate,
    findNodeParentPreviewCandidate,
    getNodeAbsolutePosition,
    mergeDraggedNodesIntoGraph,
} from '../diagramNodeParenting';

const node = (
    id: string,
    position: { x: number; y: number },
    options: Partial<Node> = {},
): Node => ({
    id,
    position,
    data: {},
    ...options,
});

describe('diagramNodeParenting', () => {
    it('resolves nested relative coordinates to an absolute canvas position', () => {
        const outer = node('outer', { x: 100, y: 200 }, { type: 'titleGroup' });
        const inner = node('inner', { x: 30, y: 40 }, {
            type: 'subGroup',
            parentId: outer.id,
        });
        const child = node('child', { x: 5, y: 6 }, { parentId: inner.id });

        expect(getNodeAbsolutePosition(child, [outer, inner, child])).toEqual({
            x: 135,
            y: 246,
        });
    });

    it('keeps a dragged child in its existing group when its relative position overlaps another group', () => {
        const external = node('external', { x: 500, y: 30 }, {
            type: 'titleGroup',
            measured: { width: 900, height: 300 },
        });
        const logistics = node('logistics', { x: 200, y: 500 }, {
            type: 'titleGroup',
            measured: { width: 1800, height: 850 },
        });
        const child = node('l-oms', { x: 900, y: 90 }, {
            parentId: logistics.id,
            measured: { width: 258, height: 118 },
        });

        expect(findNodeParentCandidate(child, [external, logistics, child])?.id)
            .toBe(logistics.id);
        expect(findNodeParentPreviewCandidate(child, [external, logistics, child]))
            .toBeNull();
    });

    it('previews a different container when a dragged child crosses group boundaries', () => {
        const source = node('source', { x: 0, y: 0 }, {
            type: 'titleGroup',
            measured: { width: 300, height: 300 },
        });
        const target = node('target', { x: 400, y: 0 }, {
            type: 'titleGroup',
            measured: { width: 300, height: 300 },
        });
        const child = node('child', { x: 450, y: 80 }, {
            parentId: source.id,
            measured: { width: 80, height: 40 },
        });

        expect(findNodeParentPreviewCandidate(child, [source, target, child])?.id)
            .toBe(target.id);
    });

    it('selects the deepest containing group for nested containers', () => {
        const outer = node('outer', { x: 100, y: 100 }, {
            type: 'titleGroup',
            measured: { width: 600, height: 600 },
        });
        const inner = node('inner', { x: 80, y: 80 }, {
            type: 'subGroup',
            parentId: outer.id,
            measured: { width: 300, height: 300 },
        });
        const child = node('child', { x: 60, y: 60 }, {
            parentId: inner.id,
            measured: { width: 80, height: 40 },
        });

        expect(findNodeParentCandidate(child, [outer, inner, child])?.id)
            .toBe(inner.id);
    });

    it('does not allow a container to become a child of its own descendant', () => {
        const outer = node('outer', { x: 100, y: 100 }, {
            type: 'titleGroup',
            measured: { width: 500, height: 500 },
        });
        const childGroup = node('child-group', { x: 40, y: 40 }, {
            type: 'subGroup',
            parentId: outer.id,
            measured: { width: 300, height: 300 },
        });

        expect(findNodeParentCandidate(outer, [outer, childGroup])).toBeNull();
    });

    it('stops safely on missing parents, cycles, and non-finite coordinates', () => {
        const first = node('first', { x: Number.NaN, y: 10 }, { parentId: 'second' });
        const second = node('second', { x: 20, y: Number.POSITIVE_INFINITY }, {
            parentId: 'first',
        });
        const orphan = node('orphan', { x: 4, y: 5 }, { parentId: 'missing' });

        expect(getNodeAbsolutePosition(first, [first, second])).toEqual({ x: 20, y: 10 });
        expect(getNodeAbsolutePosition(orphan, [orphan])).toEqual({ x: 4, y: 5 });
    });

    it('merges React Flow dragged nodes into the full graph before parent hit testing', () => {
        const group = node('group', { x: 100, y: 400 }, {
            type: 'titleGroup',
            measured: { width: 600, height: 500 },
        });
        const child = node('child', { x: 100, y: 80 }, {
            parentId: group.id,
            measured: { width: 80, height: 40 },
        });
        const draggedChild = {
            ...child,
            position: { x: 140, y: 100 },
        };

        const merged = mergeDraggedNodesIntoGraph(
            [group, child],
            draggedChild,
            [draggedChild],
        );

        expect(merged).toHaveLength(2);
        expect(merged.find((candidate) => candidate.id === child.id)?.position)
            .toEqual({ x: 140, y: 100 });
        expect(findNodeParentCandidate(draggedChild, merged)?.id).toBe(group.id);
    });
});
