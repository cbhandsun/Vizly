import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import {
    createLayerDeletionContentSnapshot,
    moveDeletedLayerEdges,
    moveDeletedLayerNodes,
    restoreDeletedLayerEdges,
    restoreDeletedLayerNodes,
} from '../layerDeletionTransaction';

const nodes = [
    { id: 'source-node', position: { x: 0, y: 0 }, data: { layer: 'review', label: 'Review' } },
    { id: 'other-node', position: { x: 100, y: 0 }, data: { layer: 'default', label: 'Default' } },
] satisfies Node[];

const edges = [
    { id: 'source-edge', source: 'source-node', target: 'other-node', data: { layer: 'review' } },
    { id: 'other-edge', source: 'other-node', target: 'source-node', data: { layer: 'default' } },
] satisfies Edge[];

describe('layer deletion content transaction', () => {
    it('moves only content owned by the deleted layer and preserves unrelated data', () => {
        const movedNodes = moveDeletedLayerNodes(nodes, 'review', 'default');
        const movedEdges = moveDeletedLayerEdges(edges, 'review', 'default');

        expect(movedNodes[0]).toMatchObject({
            id: 'source-node',
            data: { layer: 'default', label: 'Review' },
        });
        expect(movedNodes[1]).toBe(nodes[1]);
        expect(movedEdges[0]).toMatchObject({ id: 'source-edge', data: { layer: 'default' } });
        expect(movedEdges[1]).toBe(edges[1]);
    });

    it('restores captured content without overriding items moved again after deletion', () => {
        const snapshot = createLayerDeletionContentSnapshot(nodes, edges, 'review', 'default');
        const movedNodes = moveDeletedLayerNodes(nodes, 'review', 'default');
        const movedEdges = moveDeletedLayerEdges(edges, 'review', 'default');
        const userMovedNodes = movedNodes.map(node => (
            node.id === 'source-node'
                ? { ...node, data: { ...node.data, layer: 'manual-target' } }
                : node
        ));

        expect(restoreDeletedLayerNodes(userMovedNodes, snapshot)[0]?.data.layer).toBe('manual-target');
        expect(restoreDeletedLayerEdges(movedEdges, snapshot)[0]?.data?.layer).toBe('review');
    });

    it('ignores missing and newly-created items during restoration', () => {
        const snapshot = createLayerDeletionContentSnapshot(nodes, edges, 'review', 'default');
        const currentNodes = [
            nodes[1],
            { id: 'new-node', position: { x: 200, y: 0 }, data: { layer: 'default' } },
        ] satisfies Node[];

        expect(restoreDeletedLayerNodes(currentNodes, snapshot)).toEqual(currentNodes);
        expect(restoreDeletedLayerEdges([], snapshot)).toEqual([]);
    });
});
