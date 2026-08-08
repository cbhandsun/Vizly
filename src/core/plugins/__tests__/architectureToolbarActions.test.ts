import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
    buildArchitectureRelationshipPlan,
    createArchitectureRelationshipEdge,
} from '../architectureToolbarActions';

const architectureNode = (id: string, selected = false): Node => ({
    id,
    type: 'architectureNode',
    selected,
    position: { x: 0, y: 0 },
    data: { label: id, type: 'component' },
});

describe('buildArchitectureRelationshipPlan', () => {
    it.each([0, 1, 3])('requires exactly two selected nodes when %i are selected', (selectedCount) => {
        const nodes = Array.from({ length: 3 }, (_, index) => (
            architectureNode(`node-${index}`, index < selectedCount)
        ));

        expect(buildArchitectureRelationshipPlan({
            nodes,
            edges: [],
        })).toEqual({ status: 'selection-required', selectedCount });
    });

    it('resolves the two selected endpoints without allocating the edge during render', () => {
        expect(buildArchitectureRelationshipPlan({
            nodes: [architectureNode('source', true), architectureNode('target', true)],
            edges: [],
        })).toEqual({
            status: 'ready',
            sourceId: 'source',
            targetId: 'target',
        });
    });

    it('rejects an existing dependency in the same direction', () => {
        const existingEdge: Edge = { id: 'existing', source: 'source', target: 'target' };

        expect(buildArchitectureRelationshipPlan({
            nodes: [architectureNode('source', true), architectureNode('target', true)],
            edges: [existingEdge],
        })).toEqual({ status: 'duplicate', sourceId: 'source', targetId: 'target' });
    });

    it('allows a reverse dependency because architecture relationships are directional', () => {
        const result = buildArchitectureRelationshipPlan({
            nodes: [architectureNode('source', true), architectureNode('target', true)],
            edges: [{ id: 'reverse', source: 'target', target: 'source' }],
        });

        expect(result.status).toBe('ready');
    });

    it('builds a localized selected edge only when the action is committed', () => {
        expect(createArchitectureRelationshipEdge({
            id: 'edge-1',
            sourceId: 'source',
            targetId: 'target',
            label: 'Dependency',
        })).toEqual({
            id: 'edge-1',
            source: 'source',
            target: 'target',
            type: 'archEdge',
            selected: true,
            data: { semantic: 'dependency', label: 'Dependency' },
        });
    });
});
