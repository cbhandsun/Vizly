import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import {
    coerceProTimelineViewMode,
    stepProTimelineZoom,
} from '../../components/diagrams/timeline-pro/proTimelineChromeBoundary';
import { projectProTimelineTasks } from '../../components/diagrams/timeline-pro/proTimelineTaskProjection';
import {
    addWorkDays,
    adjustToWorkDay,
    getWorkDays,
    getWorkDaysSigned,
    isWeekend,
    useProTimelineEngine,
} from '../useProTimelineEngine';

describe('useProTimelineEngine date helpers', () => {
    it('round-trips date-only coordinates without UTC day drift', () => {
        const { dateToX, xToDate } = useProTimelineEngine.getState();

        expect(dateToX('2026-01-01')).toBe(0);
        expect(xToDate(dateToX('2026-06-13'))).toBe('2026-06-13');
    });

    it('adjusts weekends to working days', () => {
        expect(isWeekend('2026-06-13')).toBe(true);
        expect(adjustToWorkDay('2026-06-13', 'forward')).toBe('2026-06-15');
        expect(adjustToWorkDay('2026-06-13', 'backward')).toBe('2026-06-12');
    });

    it('counts and adds inclusive workdays across weekends', () => {
        expect(getWorkDays('2026-06-12', '2026-06-16')).toBe(3);
        expect(addWorkDays('2026-06-12', 2)).toBe('2026-06-15');
        expect(getWorkDaysSigned('2026-06-12', '2026-06-16')).toBe(2);
        expect(getWorkDaysSigned('2026-06-16', '2026-06-12')).toBe(-2);
    });

    it('handles invalid dates defensively', () => {
        expect(isWeekend('2026-02-31')).toBe(false);
        expect(getWorkDays('2026-02-31', '2026-03-02')).toBe(0);
        expect(getWorkDaysSigned('bad', '2026-03-02')).toBe(0);
    });

    it('coerces chrome controls at the component boundary', () => {
        expect(coerceProTimelineViewMode('quarter', 'day')).toBe('quarter');
        expect(coerceProTimelineViewMode('year', 'week')).toBe('week');
        expect(stepProTimelineZoom(Number.NaN, 0.2)).toBe(1.2);
        expect(stepProTimelineZoom(0.2, -1)).toBe(0.15);
        expect(stepProTimelineZoom(4.9, 1)).toBe(5);
    });

    it('projects external node data into validated timeline tasks', () => {
        const nodes: Node[] = [
            {
                id: 'valid',
                type: 'timelineNode',
                position: { x: 0, y: 0 },
                selected: true,
                data: {
                    type: 'event',
                    label: ' Task ',
                    date: '2026-07-20',
                    endDate: 'invalid',
                    progress: '120',
                    priority: 'urgent',
                    color: 'url(https://example.invalid/tracker)',
                    status: 'x'.repeat(100),
                },
            },
            {
                id: 'invalid-date',
                type: 'timelineNode',
                position: { x: 0, y: 0 },
                data: { type: 'event', date: '2026-02-31' },
            },
            {
                id: 'phase-without-date',
                position: { x: 0, y: 0 },
                data: { type: 'phase', label: '' },
            },
        ];
        const edges: Edge[] = [{ id: 'dependency', source: 'phase-without-date', target: 'valid' }];

        expect(projectProTimelineTasks(nodes, edges)).toEqual([
            expect.objectContaining({
                id: 'valid',
                name: 'Task',
                startDate: '2026-07-20',
                endDate: '2026-07-20',
                progress: 100,
                priority: undefined,
                color: undefined,
                status: 'x'.repeat(64),
                dependencies: ['phase-without-date'],
                _rawSelected: true,
            }),
            expect.objectContaining({
                id: 'phase-without-date',
                name: '未命名',
                startDate: '',
                endDate: '',
            }),
        ]);
    });
});
