import { describe, expect, it } from 'vitest';

import {
    buildEdgeRoutingCandidateAxes,
    EDGE_ROUTING_CANDIDATE_AXIS_LIMIT,
} from '../edgeRoutingCandidateAxes';

describe('edgeRoutingCandidateAxes', () => {
    it('collects rounded candidate axes from hard and soft obstacle bounds', () => {
        const axes = buildEdgeRoutingCandidateAxes({
            hardObstacles: [{ x: 10.2, y: 20.4, width: 30, height: 40 }],
            softObstacles: [{ x: 100.2, y: 200.4, width: 50, height: 20 }],
        });

        expect(axes.horizontal).toEqual([12, 68, 194, 226]);
        expect(axes.vertical).toEqual([2, 48, 94, 156]);
    });

    it('adds vertical or horizontal trunk axes for aligned bus segments', () => {
        const axes = buildEdgeRoutingCandidateAxes({
            assignedJobs: [
                {
                    busTrunkSource: { x: 50.2, y: 10 },
                    busTrunkTarget: { x: 50.7, y: 90 },
                },
                {
                    busTrunkSource: { x: 10, y: 80.2 },
                    busTrunkTarget: { x: 90, y: 80.6 },
                },
                {
                    busTrunkSource: { x: 0, y: 0 },
                    busTrunkTarget: { x: 10, y: 20 },
                },
            ] as any,
        });

        expect(axes.vertical).toEqual([50]);
        expect(axes.horizontal).toEqual([80]);
    });

    it('dedupes and limits axis counts', () => {
        const hardObstacles = Array.from({ length: EDGE_ROUTING_CANDIDATE_AXIS_LIMIT + 20 }, (_, index) => ({
            x: index * 10,
            y: index * 10,
            width: 4,
            height: 4,
        }));

        const axes = buildEdgeRoutingCandidateAxes({ hardObstacles });

        expect(axes.horizontal.length).toBe(EDGE_ROUTING_CANDIDATE_AXIS_LIMIT);
        expect(axes.vertical.length).toBe(EDGE_ROUTING_CANDIDATE_AXIS_LIMIT);
        expect(new Set(axes.horizontal).size).toBe(axes.horizontal.length);
        expect(new Set(axes.vertical).size).toBe(axes.vertical.length);
    });
});
