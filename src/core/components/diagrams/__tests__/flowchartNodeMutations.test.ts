import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
    cloneFlowchartNode,
    quickCloneFlowchartNode,
    shouldSnapshotFlowchartNodeDataUpdate,
} from '../../custom-nodes/flowchartNodeMutations';

const sourceNode: Node = {
    id: 'source',
    type: 'flowchart',
    position: { x: 100, y: 100 },
    width: 120,
    height: 60,
    data: {
        label: 'Source',
        shape: 'rectangle',
        layer: 'layer-1',
    },
    selected: true,
};

const selectedEdge: Edge = {
    id: 'existing-edge',
    source: 'other',
    target: 'source',
    selected: true,
};

describe('flowchart node structural mutations', () => {
    it('quick-clones a connected node while selecting only the new node', () => {
        const result = quickCloneFlowchartNode({
            nodes: [sourceNode],
            edges: [selectedEdge],
            sourceId: sourceNode.id,
            direction: 'right',
            label: 'Process',
            timestamp: 100,
        });

        expect(result).not.toBeNull();
        expect(result?.nodes).toHaveLength(2);
        expect(result?.edges).toHaveLength(2);
        expect(result?.nodes.filter(node => node.selected).map(node => node.id)).toEqual([
            'flowchart-node-100',
        ]);
        expect(result?.edges.some(edge => edge.selected)).toBe(false);
        expect(result?.edges.at(-1)).toMatchObject({
            source: 'source',
            target: 'flowchart-node-100',
            sourceHandle: 'right',
            targetHandle: 'left',
            markerEnd: { type: MarkerType.ArrowClosed },
            selected: false,
        });
    });

    it('moves repeated quick clones beyond occupied positions and creates collision-safe ids', () => {
        const occupiedNode: Node = {
            id: 'flowchart-node-100',
            position: { x: 280, y: 100 },
            width: 120,
            height: 60,
            data: {},
        };
        const result = quickCloneFlowchartNode({
            nodes: [sourceNode, occupiedNode],
            edges: [],
            sourceId: sourceNode.id,
            direction: 'right',
            label: 'Process',
            timestamp: 100,
        });

        expect(result?.newNode.id).toBe('flowchart-node-100-2');
        expect(result?.newNode.position.x).toBe(460);
        expect(result?.newNode.position.y).toBe(100);
    });

    it('duplicates a node without retaining stale edge selection', () => {
        const result = cloneFlowchartNode({
            nodes: [sourceNode],
            edges: [selectedEdge],
            sourceId: sourceNode.id,
            timestamp: 200,
        });

        expect(result?.newNode.id).toBe('source_copy-200');
        expect(result?.newNode.position).toEqual({ x: 130, y: 130 });
        expect(result?.nodes.filter(node => node.selected)).toEqual([result?.newNode]);
        expect(result?.edges[0].selected).toBe(false);
    });

    it('rejects an unknown source without mutating the graph', () => {
        expect(quickCloneFlowchartNode({
            nodes: [sourceNode],
            edges: [],
            sourceId: 'missing',
            direction: 'bottom',
            label: 'Process',
            timestamp: 100,
        })).toBeNull();
        expect(cloneFlowchartNode({
            nodes: [sourceNode],
            edges: [],
            sourceId: 'missing',
            timestamp: 100,
        })).toBeNull();
    });

    it('keeps transient edit-mode changes out of the undo history', () => {
        expect(shouldSnapshotFlowchartNodeDataUpdate({ isEditing: true })).toBe(false);
        expect(shouldSnapshotFlowchartNodeDataUpdate({})).toBe(false);
        expect(shouldSnapshotFlowchartNodeDataUpdate({
            isEditing: false,
            label: 'Updated',
        })).toBe(true);
    });
});
