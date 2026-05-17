import { describe, expect, it } from 'vitest';
import { RoutingCrossingScorer } from '../routingCrossingScorer';
import { refineOrthogonalWaypointsDetailed } from '../orthogonalWaypointRefiner';

describe('RoutingCrossingScorer', () => {
    it('counts strict orthogonal crossings', () => {
        const scorer = new RoutingCrossingScorer();
        const score = scorer.score(new Map([
            ['horizontal', [{ x: 0, y: 10 }, { x: 100, y: 10 }]],
            ['vertical', [{ x: 50, y: 0 }, { x: 50, y: 100 }]],
        ]));

        expect(score.hardCrossings).toBe(1);
        expect(score.totalScore).toBeGreaterThan(0);
    });

    it('uses configurable crossing weights', () => {
        const scorer = new RoutingCrossingScorer({ hardCrossingWeight: 7 });
        const score = scorer.score(new Map([
            ['horizontal', [{ x: 0, y: 10 }, { x: 100, y: 10 }]],
            ['vertical', [{ x: 50, y: 0 }, { x: 50, y: 100 }]],
        ]));

        expect(score.hardCrossings).toBe(1);
        expect(score.totalScore).toBe(7);
    });

    it('treats a shared trunk buddy group as one line for crossing purposes', () => {
        const scorer = new RoutingCrossingScorer({
            buddyGroups: [{
                type: 'm2o',
                edgeIds: new Set(['branch-a', 'branch-b']),
            }],
        });
        const score = scorer.score(new Map([
            ['branch-a', [{ x: 0, y: 10 }, { x: 100, y: 10 }]],
            ['branch-b', [{ x: 50, y: 0 }, { x: 50, y: 100 }]],
        ]));

        expect(score.hardCrossings).toBe(0);
        expect(score.totalScore).toBe(0);
    });
});

describe('refineOrthogonalWaypointsDetailed', () => {
    it('moves internal bend axes when doing so reduces avoidable crossings', () => {
        const paths = new Map([
            ['dogleg', [{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }]],
            ['short-vertical', [{ x: 50, y: 40 }, { x: 50, y: 60 }]],
        ]);

        const result = refineOrthogonalWaypointsDetailed(paths, {
            spacing: 10,
            maxPasses: 1,
            enableReroute: false,
        });

        expect(result.summary.initial.hardCrossings).toBe(1);
        expect(result.summary.final.hardCrossings).toBe(0);
        expect(result.summary.changedEdgeIds).toContain('dogleg');
    });

    it('can refine a single route away from soft obstacles', () => {
        const paths = new Map([
            ['label-hit', [{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }]],
        ]);

        const result = refineOrthogonalWaypointsDetailed(paths, {
            spacing: 10,
            maxPasses: 1,
            enableReroute: false,
            softObstacles: [{ x: 40, y: 42, width: 20, height: 16 }],
        });

        expect(result.summary.initial.softCrossings).toBe(1);
        expect(result.summary.final.softCrossings).toBe(0);
        expect(result.summary.changedEdgeIds).toContain('label-hit');
    });

    it('refines non-trunk segments of buddy edges while preserving the shared trunk junction', () => {
        const buddyPath = [
            { x: 0, y: 0 },
            { x: 0, y: 30 },
            { x: 20, y: 30 },
            { x: 20, y: 50 },
            { x: 100, y: 50 },
            { x: 100, y: 100 },
        ];
        const result = refineOrthogonalWaypointsDetailed(new Map([
            ['buddy-edge', buddyPath],
            ['other-edge', [{ x: 50, y: 40 }, { x: 50, y: 60 }]],
        ]), {
            spacing: 10,
            maxPasses: 1,
            enableReroute: false,
            buddyGroups: [{ type: 'o2m', edgeIds: new Set(['buddy-edge']) }],
        });

        const refined = result.paths.get('buddy-edge');
        expect(result.summary.initial.hardCrossings).toBe(1);
        expect(result.summary.final.hardCrossings).toBe(0);
        expect(result.summary.changedEdgeIds).toContain('buddy-edge');
        expect(refined?.[1]).toEqual({ x: 0, y: 30 });
    });
});
