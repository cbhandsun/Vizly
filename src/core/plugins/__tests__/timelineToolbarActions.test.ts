import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { buildTimelineAppendPlan } from '../timelineToolbarActions';

const timelineNode = (
    id: string,
    date: unknown,
    endDate?: unknown,
): Node => ({
    id,
    type: 'timelineNode',
    position: { x: 0, y: 0 },
    data: { type: 'event', date, endDate },
});

describe('buildTimelineAppendPlan', () => {
    it('creates a selected one-workday event and moves a weekend fallback forward', () => {
        const plan = buildTimelineAppendPlan({
            nodes: [],
            type: 'event',
            nodeId: 'event-1',
            edgeId: 'edge-1',
            label: 'New event',
            fallbackDate: '2026-08-08',
        });

        expect(plan.edge).toBeNull();
        expect(plan.node).toMatchObject({
            id: 'event-1',
            type: 'timelineNode',
            selected: true,
            data: {
                type: 'event',
                label: 'New event',
                date: '2026-08-10',
                endDate: '2026-08-10',
                status: 'pending',
            },
        });
    });

    it('moves a weekend append date to the next workday', () => {
        const plan = buildTimelineAppendPlan({
            nodes: [timelineNode('friday', '2026-08-28')],
            type: 'event',
            nodeId: 'event-1',
            edgeId: 'edge-1',
            label: 'New event',
            fallbackDate: '2026-08-21',
        });

        expect(plan.node.data).toMatchObject({
            date: '2026-08-31',
            endDate: '2026-08-31',
        });
        expect(plan.edge?.source).toBe('friday');
    });

    it('appends after the latest valid end date and connects from that task', () => {
        const plan = buildTimelineAppendPlan({
            nodes: [
                timelineNode('early', '2026-08-01'),
                timelineNode('latest', '2026-08-03', '2026-08-10'),
                timelineNode('invalid', 'not-a-date'),
            ],
            type: 'milestone',
            nodeId: 'milestone-1',
            edgeId: 'edge-1',
            label: 'New milestone',
            fallbackDate: '2026-08-08',
        });

        expect(plan.node.data).toMatchObject({
            date: '2026-08-12',
            label: 'New milestone',
            type: 'milestone',
        });
        expect(plan.edge).toMatchObject({
            id: 'edge-1',
            source: 'latest',
            target: 'milestone-1',
            type: 'smoothstep',
        });
    });

    it('gives a phase a fourteen-day span and ignores unrelated nodes', () => {
        const plan = buildTimelineAppendPlan({
            nodes: [{
                id: 'shape',
                type: 'rectangle',
                position: { x: 0, y: 0 },
                data: { date: '2099-01-01' },
            }],
            type: 'phase',
            nodeId: 'phase-1',
            edgeId: 'edge-1',
            label: 'New phase',
            fallbackDate: '2026-08-08',
        });

        expect(plan.edge).toBeNull();
        expect(plan.node.data).toMatchObject({
            date: '2026-08-10',
            endDate: '2026-08-24',
            progress: 0,
        });
    });
});
