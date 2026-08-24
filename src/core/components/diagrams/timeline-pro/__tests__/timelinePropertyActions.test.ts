import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
    buildTimelineDateUpdate,
    buildTimelineDeletionPlan,
    buildTimelineProgressUpdate,
    buildTimelineStatusUpdate,
    buildTimelineTypeUpdate,
    hasTimelineTaskChildren,
    readTimelineDate,
    readTimelineProgress,
    readTimelineTaskPriority,
    readTimelineTaskStatus,
    readTimelineTaskType,
    resolveTimelineTaskType,
    sanitizeTimelineText,
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

    it('coerces imported property values into safe UI boundaries', () => {
        expect(readTimelineTaskType('event')).toBe('event');
        expect(readTimelineTaskType('script')).toBe('phase');
        expect(readTimelineTaskStatus(null)).toBe('pending');
        expect(readTimelineTaskPriority('urgent')).toBeUndefined();
        expect(readTimelineProgress('42.5')).toBe(42.5);
        expect(readTimelineProgress(-10)).toBe(0);
        expect(readTimelineProgress(500)).toBe(100);
        expect(readTimelineProgress(Number.POSITIVE_INFINITY)).toBe(0);
    });

    it('sanitizes control characters and limits imported text by Unicode characters', () => {
        expect(sanitizeTimelineText('Owner\u0000\nName', 20)).toBe('Owner  Name');
        expect(sanitizeTimelineText('😀😀😀', 2)).toBe('😀😀');
        expect(sanitizeTimelineText({ unsafe: true }, 20)).toBe('');
        expect(sanitizeTimelineText('unchanged', 0)).toBe('');
    });

    it('keeps phase status and progress aligned at lifecycle boundaries', () => {
        expect(buildTimelineStatusUpdate({ type: 'phase', progress: 35 }, 'done')).toEqual({
            status: 'done',
            progress: 100,
        });
        expect(buildTimelineStatusUpdate({ type: 'phase', progress: 35 }, 'pending')).toEqual({
            status: 'pending',
            progress: 0,
        });
        expect(buildTimelineStatusUpdate({ type: 'phase', progress: 100 }, 'active')).toEqual({
            status: 'active',
            progress: 99,
        });
        expect(buildTimelineStatusUpdate({ type: 'event', progress: 35 }, 'done')).toEqual({
            status: 'done',
        });
    });

    it('derives task lifecycle status from normalized progress', () => {
        expect(buildTimelineProgressUpdate(-10)).toEqual({ progress: 0, status: 'pending' });
        expect(buildTimelineProgressUpdate(42)).toEqual({ progress: 42, status: 'active' });
        expect(buildTimelineProgressUpdate('100')).toEqual({ progress: 100, status: 'done' });
        expect(buildTimelineProgressUpdate(Number.POSITIVE_INFINITY)).toEqual({
            progress: 0,
            status: 'pending',
        });
    });

    it('derives summary type from hierarchy instead of exposing a misleading editable type', () => {
        const parent = task('parent');
        const child = task('child', 'parent');

        expect(hasTimelineTaskChildren([parent, child], 'parent')).toBe(true);
        expect(hasTimelineTaskChildren([parent, child], 'child')).toBe(false);
        expect(hasTimelineTaskChildren([parent, child], null)).toBe(false);
        expect(resolveTimelineTaskType('milestone', true)).toBe('summary');
        expect(resolveTimelineTaskType('milestone', false)).toBe('milestone');
    });

    it('migrates type-specific schedule fields as one deterministic patch', () => {
        expect(buildTimelineTypeUpdate({
            type: 'phase',
            date: '2026-08-21',
            endDate: '2026-08-28',
            progress: 47,
            status: 'active',
        }, 'milestone')).toEqual({
            type: 'milestone',
            endDate: '2026-08-21',
            progress: undefined,
        });
        expect(buildTimelineTypeUpdate({ progress: 47 }, 'event')).toEqual({
            type: 'event',
            progress: undefined,
        });
        expect(buildTimelineTypeUpdate({
            date: '2026-08-21',
            endDate: '2026-08-28',
            progress: 47,
        }, 'event')).toEqual({
            type: 'event',
            endDate: '2026-08-21',
            progress: undefined,
        });
        expect(buildTimelineTypeUpdate({
            type: 'event',
            date: '2026-08-21',
            endDate: '2026-08-20',
            progress: Number.POSITIVE_INFINITY,
            status: 'active',
        }, 'phase')).toEqual({
            type: 'phase',
            endDate: '2026-08-21',
            progress: 1,
        });
        expect(buildTimelineTypeUpdate({ type: 'phase' }, 'summary')).toEqual({});
        expect(buildTimelineTypeUpdate({ type: 'phase' }, { unsafe: true })).toEqual({});
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
        expect(buildTimelineDateUpdate(
            { type: 'event', date: '2026-08-10', endDate: '2026-08-20' },
            'date',
            '2026-08-25',
        )).toEqual({
            ok: true,
            updates: { date: '2026-08-25', endDate: '2026-08-25' },
        });
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
