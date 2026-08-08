import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
    buildShiftEdgeMultiSelectionChanges,
    buildShiftMultiSelectionChanges,
} from '../flowchartMultiSelection';

const nodes = [
    { id: 'a', position: { x: 0, y: 0 }, data: {}, selected: true },
    { id: 'b', position: { x: 10, y: 0 }, data: {}, selected: false },
] satisfies Node[];

describe('buildShiftMultiSelectionChanges', () => {
    it('adds an unselected node while preserving the existing selection', () => {
        expect(buildShiftMultiSelectionChanges(nodes, 'b')).toEqual([
            { id: 'a', type: 'select', selected: true },
            { id: 'b', type: 'select', selected: true },
        ]);
    });

    it('toggles an already-selected node without clearing the other nodes', () => {
        expect(buildShiftMultiSelectionChanges([
            nodes[0],
            { ...nodes[1], selected: true },
        ], 'a')).toEqual([
            { id: 'a', type: 'select', selected: false },
            { id: 'b', type: 'select', selected: true },
        ]);
    });

    it('rejects missing and oversized ids and deduplicates malformed node input', () => {
        expect(buildShiftMultiSelectionChanges(nodes, '')).toEqual([]);
        expect(buildShiftMultiSelectionChanges(nodes, 'x'.repeat(1_025))).toEqual([]);
        expect(buildShiftMultiSelectionChanges(nodes, 'missing')).toEqual([]);
        expect(buildShiftMultiSelectionChanges([nodes[0], nodes[0]], 'a')).toEqual([
            { id: 'a', type: 'select', selected: false },
        ]);
    });
});

describe('buildShiftEdgeMultiSelectionChanges', () => {
    const edges = [
        { id: 'edge-a', source: 'a', target: 'b', selected: true },
        { id: 'edge-b', source: 'b', target: 'c', selected: false },
    ] satisfies Edge[];

    it('adds an edge while preserving the existing connector selection', () => {
        expect(buildShiftEdgeMultiSelectionChanges(edges, 'edge-b')).toEqual([
            { id: 'edge-a', type: 'select', selected: true },
            { id: 'edge-b', type: 'select', selected: true },
        ]);
    });

    it('toggles selected edges and rejects invalid target ids', () => {
        expect(buildShiftEdgeMultiSelectionChanges(edges, 'edge-a')).toEqual([
            { id: 'edge-a', type: 'select', selected: false },
            { id: 'edge-b', type: 'select', selected: false },
        ]);
        expect(buildShiftEdgeMultiSelectionChanges(edges, '')).toEqual([]);
        expect(buildShiftEdgeMultiSelectionChanges(edges, 'missing')).toEqual([]);
        expect(buildShiftEdgeMultiSelectionChanges(edges, 'x'.repeat(1_025))).toEqual([]);
    });
});
