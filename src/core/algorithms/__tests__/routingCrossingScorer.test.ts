import { describe, expect, it } from 'vitest';
import { RoutingCrossingScorer } from '../routingCrossingScorer';
import { refineOrthogonalWaypointsDetailed } from '../orthogonalWaypointRefiner';
import { globalChannelRouting } from '../globalChannelRouting';
import { refineManyToOneFanIn } from '../manyToOneFanIn';

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

    it('uses fixed context paths for scoring without moving them', () => {
        const fixedPath = [{ x: 50, y: 40 }, { x: 50, y: 60 }];
        const activePath = [{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }];

        const result = refineOrthogonalWaypointsDetailed(new Map([
            ['fixed', fixedPath],
            ['active', activePath],
        ]), {
            spacing: 10,
            maxPasses: 1,
            enableReroute: false,
            fixedEdgeIds: new Set(['fixed']),
        });

        expect(result.summary.initial.hardCrossings).toBe(1);
        expect(result.summary.final.hardCrossings).toBe(0);
        expect(result.summary.changedEdgeIds).toEqual(['active']);
        expect(result.paths.get('fixed')).toEqual(fixedPath);
    });

    it('pulls an over-extended dogleg inward to avoid crossing nearby vertical routes', () => {
        const paths = new Map([
            ['dogleg', [
                { x: 100, y: 100 },
                { x: 260, y: 100 },
                { x: 260, y: 240 },
                { x: 110, y: 240 },
            ]],
            ['vertical-a', [{ x: 220, y: 60 }, { x: 220, y: 150 }]],
            ['vertical-b', [{ x: 230, y: 210 }, { x: 230, y: 280 }]],
        ]);

        const result = refineOrthogonalWaypointsDetailed(paths, {
            spacing: 10,
            maxPasses: 1,
            enableReroute: false,
            fixedEdgeIds: new Set(['vertical-a', 'vertical-b']),
        });

        const refined = result.paths.get('dogleg');
        expect(result.summary.initial.hardCrossings).toBe(2);
        expect(result.summary.final.hardCrossings).toBe(0);
        expect(refined?.[1].x).toBeLessThan(220);
        expect(refined?.[2].x).toBe(refined?.[1].x);
    });

    it('moves a long sweep edge to an outer corridor on the WMS allocation graph shape', () => {
        const paths = new Map([
            ['e10', [
                { x: 1228, y: 390 },
                { x: 1228, y: 462 },
                { x: 1220, y: 470 },
                { x: 41, y: 470 },
                { x: 33, y: 478 },
                { x: 33, y: 1432 },
                { x: 41, y: 1440 },
                { x: 208, y: 1440 },
                { x: 216, y: 1448 },
                { x: 216, y: 1478 },
            ]],
            ['e5', [{ x: 740.5, y: 390 }, { x: 740.5, y: 550 }]],
            ['e-check-inv', [{ x: 242.5, y: 390 }, { x: 242.5, y: 550 }]],
            ['e7', [
                { x: 740.5, y: 550 },
                { x: 740.5, y: 518 },
                { x: 732.5, y: 510 },
                { x: 546, y: 510 },
                { x: 538, y: 502 },
                { x: 538, y: 222 },
                { x: 546, y: 214 },
                { x: 1220, y: 214 },
                { x: 1228, y: 206 },
                { x: 1228, y: 134 },
            ]],
            ['e8', [
                { x: 741, y: 806 },
                { x: 741, y: 780 },
                { x: 749, y: 772 },
                { x: 930.5, y: 772 },
                { x: 938.5, y: 764 },
                { x: 938.5, y: 221 },
                { x: 946.5, y: 213 },
                { x: 1220, y: 213 },
                { x: 1228, y: 205 },
                { x: 1228, y: 134 },
            ]],
            ['e16', [
                { x: 1228, y: 390 },
                { x: 1228, y: 1430 },
                { x: 1220, y: 1438 },
                { x: 677.5, y: 1438 },
                { x: 669.5, y: 1446 },
                { x: 669.5, y: 1478 },
            ]],
            ['e3', [
                { x: 366, y: 1110 },
                { x: 735, y: 1110 },
                { x: 747, y: 1110 },
                { x: 917, y: 1110 },
                { x: 925, y: 1102 },
                { x: 925, y: 94 },
                { x: 917, y: 86 },
                { x: 843, y: 86 },
            ]],
            ['e15', [
                { x: 741, y: 902 },
                { x: 741, y: 1352 },
                { x: 733, y: 1360 },
                { x: 677.5, y: 1360 },
                { x: 669.5, y: 1368 },
                { x: 669.5, y: 1478 },
            ]],
        ]);

        const result = refineOrthogonalWaypointsDetailed(paths, {
            spacing: 12,
            maxPasses: 2,
            enableReroute: true,
            maxRerouteEdges: 4,
            fixedEdgeIds: new Set(['e5', 'e-check-inv', 'e7', 'e8', 'e16', 'e3', 'e15']),
        });

        const refined = result.paths.get('e10') ?? [];
        const horizontalYs = refined
            .filter((point, index) => index < refined.length - 1 && Math.abs(point.y - refined[index + 1].y) < 1.5)
            .map(point => point.y);
        expect(result.summary.final.hardCrossings).toBeLessThan(result.summary.initial.hardCrossings);
        expect(Math.max(...horizontalYs)).toBeGreaterThan(1200);
    });

    it('compacts an oversized same-column U dogleg back toward its anchors', () => {
        const paths = new Map([
            ['wide-u', [
                { x: 740, y: 390 },
                { x: 740, y: 430 },
                { x: 946, y: 430 },
                { x: 946, y: 766 },
                { x: 741, y: 766 },
                { x: 741, y: 806 },
            ]],
        ]);

        const result = refineOrthogonalWaypointsDetailed(paths, {
            spacing: 12,
            maxPasses: 1,
            enableReroute: false,
        });

        const refined = result.paths.get('wide-u') ?? [];
        expect(refined.some(point => Math.abs(point.x - 946) < 1)).toBe(false);
        expect(Math.max(...refined.map(point => point.x))).toBeLessThan(800);
    });

    it('compacts a WMS same-column bypass to the nearest obstacle skirt', () => {
        const paths = new Map([
            ['e6', [
                { x: 740.5, y: 390 },
                { x: 740.5, y: 430 },
                { x: 946.5, y: 430 },
                { x: 946.5, y: 766 },
                { x: 741, y: 766 },
                { x: 741, y: 806 },
            ]],
            ['e5', [
                { x: 740.5, y: 390 },
                { x: 740.5, y: 550 },
            ]],
        ]);

        const result = refineOrthogonalWaypointsDetailed(paths, {
            spacing: 12,
            maxPasses: 1,
            enableReroute: false,
            hardObstacles: [
                { x: 616, y: 294, width: 249, height: 96 },
                { x: 632, y: 550, width: 217, height: 96 },
                { x: 633, y: 806, width: 216, height: 96 },
            ],
            buddyGroups: [
                { type: 'o2m', edgeIds: ['e5', 'e6'] },
            ],
            fixedEdgeIds: new Set(['e5']),
        });

        const refined = result.paths.get('e6') ?? [];
        const maxX = Math.max(...refined.map(point => point.x));
        expect(maxX).toBeGreaterThan(849);
        expect(maxX).toBeLessThan(885);
        expect(refined[1]).toEqual({ x: 740.5, y: 430 });
    });

    it('pulls a wrong-side WMS return path back into the target corridor', () => {
        const paths = new Map([
            ['e7', [
                { x: 740.5, y: 550 },
                { x: 740.5, y: 510 },
                { x: 538, y: 510 },
                { x: 538, y: 214 },
                { x: 1228, y: 214 },
                { x: 1228, y: 134 },
            ]],
        ]);

        const result = refineOrthogonalWaypointsDetailed(paths, {
            spacing: 12,
            maxPasses: 1,
            enableReroute: false,
            hardObstacles: [
                { x: 616, y: 294, width: 249, height: 96 },
                { x: 632, y: 550, width: 217, height: 96 },
                { x: 1132, y: 38, width: 192, height: 96 },
            ],
        });

        const refined = result.paths.get('e7') ?? [];
        const verticalAxes = refined
            .filter((point, index) => index < refined.length - 1 && Math.abs(point.x - refined[index + 1].x) < 1.5)
            .map(point => point.x);
        expect(Math.min(...refined.map(point => point.x))).toBeGreaterThan(700);
        expect(verticalAxes.some(x => x > 865 && x < 910)).toBe(true);
        expect(RoutingCrossingScorer.pathLength(refined)).toBeLessThan(RoutingCrossingScorer.pathLength(paths.get('e7')!));
    });

});

describe('globalChannelRouting', () => {
    it('keeps fixed paths in place while assigning nearby active paths to another track', () => {
        const fixedPath = [{ x: 0, y: 10 }, { x: 100, y: 10 }];
        const activePath = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 20 }];

        const result = globalChannelRouting(new Map([
            ['fixed', fixedPath],
            ['active', activePath],
        ]), 12, undefined, new Set(['fixed']));

        expect(result.get('fixed')).toEqual(fixedPath);
        expect(result.get('active')?.[1].y).not.toBe(10);
        expect(result.get('active')?.[2].y).toBe(result.get('active')?.[1].y);
    });

    it('widens close long vertical bundles without changing endpoints', () => {
        const result = globalChannelRouting(new Map([
            ['left-return', [
                { x: 92, y: 40 },
                { x: 100, y: 48 },
                { x: 100, y: 360 },
                { x: 92, y: 368 },
            ]],
            ['right-return', [
                { x: 120, y: 40 },
                { x: 112, y: 48 },
                { x: 112, y: 360 },
                { x: 120, y: 368 },
            ]],
        ]), 12);

        const left = result.get('left-return')!;
        const right = result.get('right-return')!;
        const gap = Math.abs(right[1].x - left[1].x);

        expect(left[0]).toEqual({ x: 92, y: 40 });
        expect(right[3]).toEqual({ x: 120, y: 368 });
        expect(gap).toBeGreaterThan(24);
        expect(left[1].x).toBe(left[2].x);
        expect(right[1].x).toBe(right[2].x);
    });
});

describe('refineManyToOneFanIn', () => {
    it('collects left and right branches on one shared fan-in trunk junction', () => {
        const paths = new Map([
            ['left', [
                { x: 100, y: 0 },
                { x: 100, y: 40 },
                { x: 70, y: 40 },
                { x: 70, y: 180 },
                { x: 200, y: 180 },
                { x: 200, y: 240 },
            ]],
            ['center', [
                { x: 200, y: 0 },
                { x: 200, y: 240 },
            ]],
            ['right', [
                { x: 300, y: 0 },
                { x: 300, y: 80 },
                { x: 330, y: 80 },
                { x: 330, y: 160 },
                { x: 200, y: 160 },
                { x: 200, y: 240 },
            ]],
        ]);

        const result = refineManyToOneFanIn(paths, [
            { targetId: 'target', edgeIds: ['left', 'center', 'right'] },
        ], { spacing: 12 });

        const branchYs = ['left', 'right'].map(edgeId => {
            const points = result.get(edgeId)!;
            const trunkJoin = points.find((point, index) =>
                index > 0
                && index < points.length - 1
                && Math.abs(point.x - 200) < 1
                && Math.abs(points[index + 1].x - 200) < 1
            );
            return trunkJoin?.y ?? 0;
        });

        expect(new Set(branchYs.map(y => Math.round(y))).size).toBe(1);
        expect(branchYs[0]).toBeGreaterThan(170);
        expect(branchYs[0]).toBeLessThan(200);
        for (const edgeId of ['left', 'center', 'right']) {
            const points = result.get(edgeId)!;
            expect(points[points.length - 1]).toEqual({ x: 200, y: 240 });
        }
    });

    it('keeps the original group when a fan-in branch would hit an obstacle', () => {
        const paths = new Map([
            ['left', [
                { x: 100, y: 0 },
                { x: 100, y: 40 },
                { x: 200, y: 40 },
                { x: 200, y: 240 },
            ]],
            ['right', [
                { x: 300, y: 0 },
                { x: 300, y: 80 },
                { x: 200, y: 80 },
                { x: 200, y: 240 },
            ]],
        ]);

        const result = refineManyToOneFanIn(paths, [
            { targetId: 'target', edgeIds: ['left', 'right'] },
        ], {
            spacing: 12,
            obstacles: [{ x: 120, y: 183, width: 70, height: 12 }],
        });

        expect(result.get('left')).toEqual(paths.get('left'));
        expect(result.get('right')).toEqual(paths.get('right'));
    });

    it('moves very short collector jogs up to the source side to avoid rounded S artifacts', () => {
        const paths = new Map([
            ['near-trunk', [
                { x: 188, y: 0 },
                { x: 188, y: 40 },
                { x: 188, y: 180 },
                { x: 200, y: 180 },
                { x: 200, y: 240 },
            ]],
            ['trunk', [
                { x: 200, y: 0 },
                { x: 200, y: 240 },
            ]],
        ]);

        const result = refineManyToOneFanIn(paths, [
            { targetId: 'target', edgeIds: ['near-trunk', 'trunk'] },
        ], { spacing: 12 });

        const near = result.get('near-trunk')!;
        const collectorY = 240 - Math.max(52, 12 * 4.5);
        const hasShortJogAtCollector = near.some((point, index) =>
            index < near.length - 1
            && Math.abs(point.y - collectorY) < 1
            && Math.abs(near[index + 1].y - collectorY) < 1
            && Math.abs(point.x - near[index + 1].x) < 24
            && Math.abs(point.x - near[index + 1].x) > 1
        );

        expect(hasShortJogAtCollector).toBe(false);
        expect(near).toContainEqual({ x: 200, y: 40 });
    });

    it('drops diagonal source stubs before rebuilding a shared fan-in path', () => {
        const paths = new Map([
            ['diagonal-stub', [
                { x: 150, y: 100 },
                { x: 188, y: 138 },
                { x: 188, y: 180 },
                { x: 200, y: 180 },
                { x: 200, y: 240 },
            ]],
            ['trunk', [
                { x: 200, y: 100 },
                { x: 200, y: 240 },
            ]],
        ]);

        const result = refineManyToOneFanIn(paths, [
            { targetId: 'target', edgeIds: ['diagonal-stub', 'trunk'] },
        ], { spacing: 12 });

        const rebuilt = result.get('diagonal-stub')!;
        for (let i = 0; i < rebuilt.length - 1; i++) {
            const a = rebuilt[i];
            const b = rebuilt[i + 1];
            expect(Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1).toBe(true);
        }
        expect(rebuilt).not.toContainEqual({ x: 188, y: 138 });
    });
});
