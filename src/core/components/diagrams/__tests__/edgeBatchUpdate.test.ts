import { MarkerType, type Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { FLOWCHART_REPLACE_TEXT_MAX_LENGTH } from '../flowchartSearchReplace';
import { planEdgeBatchUpdate } from '../edgeBatchUpdate';

const edge = (overrides: Partial<Edge> = {}): Edge => ({
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
    label: 'Original',
    data: { label: 'Original', retained: true },
    markerEnd: 'arrowclosed',
    style: { stroke: '#111827', strokeWidth: 2 },
    ...overrides,
});

describe('planEdgeBatchUpdate', () => {
    it('synchronizes a bounded sanitized visible label across both label stores', () => {
        const rawLabel = `Updated\u0000${'x'.repeat(FLOWCHART_REPLACE_TEXT_MAX_LENGTH)}`;
        const result = planEdgeBatchUpdate([edge()], ['edge-1'], { label: rawLabel });
        const updated = result.edges[0];

        expect(result.changedIds).toEqual(['edge-1']);
        expect(updated.label).toBe(`Updated${'x'.repeat(FLOWCHART_REPLACE_TEXT_MAX_LENGTH - 7)}`);
        expect(updated.data?.label).toBe(updated.label);
        expect(updated.data?.retained).toBe(true);
    });

    it('clears blank labels from both visible label stores', () => {
        const result = planEdgeBatchUpdate([edge()], ['edge-1'], { label: ' \n ' });

        expect(result.changedIds).toEqual(['edge-1']);
        expect(result.edges[0].label).toBeUndefined();
        expect(result.edges[0].data).not.toHaveProperty('label');
    });

    it('keeps top-level labels synchronized when the data label is edited', () => {
        const result = planEdgeBatchUpdate([edge()], ['edge-1'], { data: { label: 'Data update' } });

        expect(result.edges[0].label).toBe('Data update');
        expect(result.edges[0].data?.label).toBe('Data update');
    });

    it('merges style and marker objects and can explicitly remove an arrow', () => {
        const merged = planEdgeBatchUpdate([edge()], ['edge-1'], {
            style: { strokeWidth: 3 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb' },
        }).edges[0];
        const cleared = planEdgeBatchUpdate([merged], ['edge-1'], { markerEnd: undefined });

        expect(merged.style).toEqual({ stroke: '#111827', strokeWidth: 3 });
        expect(merged.markerEnd).toEqual({ type: 'arrowclosed', color: '#2563eb' });
        expect(cleared.edges[0].markerEnd).toBeUndefined();
    });

    it('skips protected targets and reports no-op updates without changing references', () => {
        const editable = edge();
        const blank = edge({ id: 'edge-blank', label: undefined, data: undefined });
        const locked = edge({ id: 'edge-locked', data: { label: 'Locked', locked: true } });
        const result = planEdgeBatchUpdate(
            [editable, blank, locked],
            ['edge-1', 'edge-blank', 'edge-locked', '', 'missing'],
            { label: 'Original' },
        );
        const blankResult = planEdgeBatchUpdate([blank], ['edge-blank'], { label: '  ' });

        expect(result.changedIds).toEqual(['edge-blank']);
        expect(result.skippedLockedIds).toEqual(['edge-locked']);
        expect(result.edges[0]).toBe(editable);
        expect(result.edges[2]).toBe(locked);
        expect(blankResult.changedIds).toEqual([]);
        expect(blankResult.edges[0]).toBe(blank);
    });
});
