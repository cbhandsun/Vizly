import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
    buildTimelineDateUpdate,
    buildTimelineDeletionPlan,
    readTimelineDate,
} from '../timelinePropertyActions';

const task = (id: string, parentId?: string): Node => ({
    id,
    type: 'timelineNode',
    position: { x: 0, y: 0 },
    data: { type: 'phase', date: '2026-08-10', endDate: '2026-08-20', parentId },
});

describe('timelinePropertyActions', () => {
    it('accepts canonical dates and rejects empty, malformed, and impossible values', () => {
        expect(readTimelineDate('2026-08-10')).toBe('2026-08-10');
        expect(readTimelineDate('')).toBeNull();
        expect(readTimelineDate('August 10, 2026')).toBeNull();
        expect(readTimelineDate('2026-02-30')).toBeNull();
        expect(readTimelineDate('99999-12-31')).toBeNull();
        expect(readTimelineDate(20260810)).toBeNull();
    });

    it('rejects reversed ranges without mutating the task data', () => {
        const data = { date: '2026-08-10', endDate: '2026-08-20' };

        expect(buildTimelineDateUpdate(data, 'endDate', '2026-08-09')).toEqual({
            ok: false,
            reason: 'end-before-start',
        });
        expect(buildTimelineDateUpdate(data, 'date', '2026-08-21')).toEqual({
            ok: false,
            reason: 'end-before-start',
        });
        expect(data).toEqual({ date: '2026-08-10', endDate: '2026-08-20' });
    });

    it('returns the single validated date patch for a valid edit', () => {
        expect(buildTimelineDateUpdate(
            { date: '2026-08-10', endDate: '2026-08-20' },
            'endDate',
            '2026-08-25',
        )).toEqual({ ok: true, updates: { endDate: '2026-08-25' } });
    });

    it('deletes descendants and every attached connector while preserving unrelated data', () => {
        const nodes = [task('root'), task('child', 'root'), task('grandchild', 'child'), task('other')];
        const edges: Edge[] = [
            { id: 'root-child', source: 'root', target: 'child' },
            { id: 'grandchild-other', source: 'grandchild', target: 'other' },
            { id: 'other-self', source: 'other', target: 'other' },
        ];

        const plan = buildTimelineDeletionPlan(nodes, edges, 'root');

        expect([...plan.deletedNodeIds]).toEqual(['root', 'child', 'grandchild']);
        expect(plan.nodes.map(node => node.id)).toEqual(['other']);
        expect(plan.edges.map(edge => edge.id)).toEqual(['other-self']);
    });

    it('terminates safely when malformed parent data contains a cycle', () => {
        const nodes = [task('a', 'b'), task('b', 'a'), task('other')];
        const plan = buildTimelineDeletionPlan(nodes, [], 'a');

        expect([...plan.deletedNodeIds]).toEqual(['a', 'b']);
        expect(plan.nodes.map(node => node.id)).toEqual(['other']);
    });

    it('returns the original collections when the selected task no longer exists', () => {
        const nodes = [task('existing')];
        const edges: Edge[] = [];
        const plan = buildTimelineDeletionPlan(nodes, edges, 'missing');

        expect(plan.deletedNodeIds.size).toBe(0);
        expect(plan.nodes).toBe(nodes);
        expect(plan.edges).toBe(edges);
    });
});
