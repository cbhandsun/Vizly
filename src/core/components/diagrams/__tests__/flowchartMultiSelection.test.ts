import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { buildShiftMultiSelectionChanges } from '../flowchartMultiSelection';

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
