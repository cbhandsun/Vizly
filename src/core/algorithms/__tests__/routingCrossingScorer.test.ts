import { describe, expect, it } from 'vitest';
import { RoutingCrossingScorer } from '../routingCrossingScorer';
import { refineOrthogonalWaypointsDetailed } from '../orthogonalWaypointRefiner';
import { globalChannelRouting } from '../globalChannelRouting';
import { refineManyToOneFanIn } from '../manyToOneFanIn';
import { repairHardObstacleViolations } from '../hardObstaclePathRepair';
import { repairEdgeCrossingViolations } from '../edgeCrossingRepair';

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

    it('keeps shared trunk overlap exempt while flagging same-buddy branch crossings', () => {
        const scorer = new RoutingCrossingScorer({
            buddyGroups: [{
                type: 'm2o',
                edgeIds: new Set(['branch-a', 'branch-b']),
            }],
            parallelOverlapMinLength: 20,
            buddyCrossingWeight: 11,
        });
        const crossed = scorer.score(new Map([
            ['branch-a', [{ x: 0, y: 10 }, { x: 100, y: 10 }]],
            ['branch-b', [{ x: 50, y: 0 }, { x: 50, y: 100 }]],
        ]));
        const sharedTrunk = scorer.score(new Map([
            ['branch-a', [{ x: 0, y: 10 }, { x: 100, y: 10 }]],
            ['branch-b', [{ x: 30, y: 10 }, { x: 120, y: 10 }]],
        ]));

        expect(crossed.hardCrossings).toBe(0);
        expect(crossed.buddyCrossings).toBe(1);
        expect(crossed.totalScore).toBe(11);
        expect(sharedTrunk.hardCrossings).toBe(0);
        expect(sharedTrunk.buddyCrossings).toBe(0);
        expect(sharedTrunk.parallelOverlaps).toBe(0);
        expect(sharedTrunk.totalScore).toBe(0);
    });

    it('penalizes non-buddy parallel overlaps', () => {
        const scorer = new RoutingCrossingScorer({ parallelOverlapMinLength: 20, parallelOverlapWeight: 5 });
        const score = scorer.score(new Map([
            ['left', [{ x: 0, y: 10 }, { x: 100, y: 10 }]],
            ['right', [{ x: 25, y: 10 }, { x: 95, y: 10 }]],
        ]));

        expect(score.hardCrossings).toBe(0);
        expect(score.parallelOverlaps).toBeGreaterThan(0);
        expect(score.totalScore).toBeGreaterThan(0);
    });

    it('preserves every identity for edges that are in two buddy groups', () => {
        const scorer = new RoutingCrossingScorer({
            buddyGroups: [
                { type: 'o2m', edgeIds: new Set(['quota', 'shared']) },
                { type: 'm2o', edgeIds: new Set(['shared', 'merge']) },
            ],
            parallelOverlapMinLength: 20,
        });
        const score = scorer.score(new Map([
            ['quota', [{ x: 0, y: 10 }, { x: 100, y: 10 }]],
            ['shared', [{ x: 25, y: 10 }, { x: 125, y: 10 }]],
        ]));

        expect(score.parallelOverlaps).toBe(0);
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

    it('reroutes high-cost WMS buddy sweep edges without unlocking shared trunk junctions', () => {
        const paths = new Map([
            ['e10', [
                { x: 2063, y: 450 },
                { x: 1960, y: 450 },
                { x: 1952, y: 458 },
                { x: 1952, y: 1710 },
                { x: 1944, y: 1718 },
                { x: 978, y: 1718 },
                { x: 970, y: 1726 },
                { x: 970, y: 1825 },
                { x: 962, y: 1833 },
                { x: 368, y: 1833 },
                { x: 360, y: 1825 },
                { x: 360, y: 1726 },
                { x: 352, y: 1718 },
                { x: 280, y: 1718 },
            ]],
            ['e16', [
                { x: 2063, y: 450 },
                { x: 1228, y: 450 },
                { x: 1220, y: 458 },
                { x: 1220, y: 1698 },
                { x: 1212, y: 1706 },
                { x: 901, y: 1706 },
            ]],
            ['e15', [
                { x: 1547, y: 754 },
                { x: 1547, y: 786 },
                { x: 1539, y: 794 },
                { x: 1228, y: 794 },
                { x: 1220, y: 802 },
                { x: 1220, y: 1710 },
                { x: 1212, y: 1718 },
                { x: 901, y: 1718 },
            ]],
            ['e7', [
                { x: 1119, y: 706 },
                { x: 1351, y: 706 },
                { x: 1359, y: 698 },
                { x: 1359, y: 202 },
                { x: 1367, y: 194 },
                { x: 2093, y: 194 },
            ]],
            ['e8', [
                { x: 1655, y: 706 },
                { x: 1972, y: 706 },
                { x: 1980, y: 698 },
                { x: 1980, y: 214 },
                { x: 1988, y: 206 },
                { x: 2093, y: 206 },
            ]],
            ['e6', [
                { x: 1135, y: 450 },
                { x: 1207, y: 450 },
                { x: 1215, y: 458 },
                { x: 1215, y: 698 },
                { x: 1223, y: 706 },
                { x: 1439, y: 706 },
            ]],
            ['e17', [
                { x: 795, y: 1766 },
                { x: 795, y: 1926 },
            ]],
        ]);
        const buddyGroups = [
            { type: 'o2m' as const, edgeIds: new Set(['e10', 'e16']) },
            { type: 'm2o' as const, edgeIds: new Set(['e15', 'e16']) },
            { type: 'm2o' as const, edgeIds: new Set(['e7', 'e8']) },
        ];

        const result = refineOrthogonalWaypointsDetailed(paths, {
            spacing: 12,
            maxPasses: 1,
            enableReroute: true,
            maxRerouteEdges: 8,
            buddyGroups,
            fixedEdgeIds: new Set(['e6', 'e17']),
        });

        const refinedE10 = result.paths.get('e10') ?? [];
        const changedImportantEdge = result.summary.changedEdgeIds.some(edgeId =>
            ['e10', 'e16', 'e15', 'e7', 'e8'].includes(edgeId)
        );

        expect(result.summary.initial.hardCrossings).toBeGreaterThan(0);
        expect(result.summary.final.hardCrossings).toBeLessThan(result.summary.initial.hardCrossings);
        expect(result.summary.final.parallelOverlaps).toBeLessThanOrEqual(result.summary.initial.parallelOverlaps);
        expect(changedImportantEdge).toBe(true);
        expect(refinedE10[1]).toEqual({ x: 1960, y: 450 });
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

    it('keeps an outer return lane when a shorter inner segment would cross a routed spine', () => {
        const paths = new Map([
            ['e9', [
                { x: 1228, y: 134 },
                { x: 1228, y: 294 },
            ]],
            ['e8', [
                { x: 849, y: 854 },
                { x: 937, y: 854 },
                { x: 937, y: 207 },
                { x: 1364, y: 207 },
                { x: 1364, y: 86 },
                { x: 1324, y: 86 },
            ]],
        ]);

        const result = refineOrthogonalWaypointsDetailed(paths, {
            spacing: 12,
            maxPasses: 1,
            enableReroute: false,
            fixedEdgeIds: new Set(['e9']),
            hardObstacles: [
                { x: 1132, y: 38, width: 192, height: 96 },
                { x: 1102, y: 294, width: 252, height: 96 },
                { x: 633, y: 806, width: 216, height: 96 },
            ],
        });

        const refined = result.paths.get('e8') ?? [];
        expect(result.summary.initial.hardCrossings).toBe(1);
        expect(result.summary.final.hardCrossings).toBe(0);
        expect(refined).toEqual([
            { x: 849, y: 854 },
            { x: 1364, y: 854 },
            { x: 1364, y: 86 },
            { x: 1324, y: 86 },
        ]);
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

describe('repairHardObstacleViolations', () => {
    it('doglegs a WMS fan-in branch around an intervening node', () => {
        const checkLimit = { x: 616, y: 294, width: 249, height: 96 };
        const paths = new Map([
            ['e7', [
                { x: 760.5, y: 550 },
                { x: 760.5, y: 214 },
                { x: 1228, y: 214 },
                { x: 1228, y: 134 },
            ]],
            ['e4', [
                { x: 760.75, y: 134 },
                { x: 760.75, y: 294 },
            ]],
        ]);

        const result = repairHardObstacleViolations(paths, {
            spacing: 12,
            obstacles: [checkLimit],
        });

        const refined = result.get('e7') ?? [];
        const verticalAxes = refined
            .filter((point, index) => index < refined.length - 1 && Math.abs(point.x - refined[index + 1].x) < 1.5)
            .map(point => point.x);

        expect(RoutingCrossingScorer.pathHitsObstacle(refined, [checkLimit], 2)).toBe(false);
        expect(refined[0]).toEqual(paths.get('e7')?.[0]);
        expect(refined[refined.length - 1]).toEqual(paths.get('e7')?.[3]);
        expect(verticalAxes.some(x => x > 865 && x < 910)).toBe(true);
        for (let i = 0; i < refined.length - 1; i++) {
            expect(Math.abs(refined[i].x - refined[i + 1].x) < 1.5 || Math.abs(refined[i].y - refined[i + 1].y) < 1.5).toBe(true);
        }
    });

    it('ignores own endpoint nodes while repairing a middle obstacle', () => {
        const source = { x: 632, y: 550, width: 217, height: 96 };
        const target = { x: 1130, y: 38, width: 196, height: 96 };
        const middle = { x: 616, y: 294, width: 249, height: 96 };
        const paths = new Map([
            ['e7', [
                { x: 747.7, y: 551.8 },
                { x: 747.7, y: 134.6 },
                { x: 1235.2, y: 134.6 },
            ]],
        ]);

        const repaired = repairHardObstacleViolations(paths, {
            spacing: 12,
            obstacles: [source, middle, target],
            ignoredRectsByEdge: new Map([['e7', [source, target]]]),
        }).get('e7')!;

        expect(pathHitsRectInterior(repaired, middle)).toBe(false);
        expect(repaired[0]).toEqual(paths.get('e7')?.[0]);
        expect(repaired[repaired.length - 1]).toEqual(paths.get('e7')?.[2]);
        expect(isOrthogonalPath(repaired)).toBe(true);
    });

    it('doglegs the WMS quota feedback lane around downstream allocation work', () => {
        const fixQuota = { x: 1833, y: 402, width: 230, height: 96 };
        const greedySpec = { x: 116, y: 1670, width: 164, height: 96 };
        const allocMixed = { x: 567, y: 1974, width: 204, height: 96 };
        const paths = new Map([
            ['e10', [
                { x: 2063, y: 450 },
                { x: 1952, y: 450 },
                { x: 1952, y: 2022 },
                { x: 328, y: 2022 },
                { x: 328, y: 1718 },
                { x: 280, y: 1718 },
            ]],
        ]);

        const repaired = repairHardObstacleViolations(paths, {
            spacing: 12,
            obstacles: [fixQuota, greedySpec, allocMixed],
            ignoredRectsByEdge: new Map([['e10', [fixQuota, greedySpec]]]),
            maxIterationsPerEdge: 6,
        }).get('e10')!;

        expect(pathHitsRectInterior(paths.get('e10')!, allocMixed)).toBe(true);
        expect(pathHitsRectInterior(repaired, allocMixed)).toBe(false);
        expect(repaired[0]).toEqual(paths.get('e10')?.[0]);
        expect(repaired[repaired.length - 1]).toEqual(paths.get('e10')?.[5]);
        expect(isOrthogonalPath(repaired)).toBe(true);
    });

    it('adds a final clearance dogleg for near-miss business nodes', () => {
        const source = { x: 487.625, y: 658, width: 204, height: 96 };
        const target = { x: 466.625, y: 1170, width: 246, height: 96 };
        const nearNode = { x: 299.875, y: 914, width: 273, height: 96 };
        const paths = new Map([
            ['e-shortage-no', [
                { x: 589.625, y: 754 },
                { x: 589.625, y: 1170 },
            ]],
        ]);

        const repaired = repairHardObstacleViolations(paths, {
            spacing: 12,
            obstacles: [source, target, nearNode],
            ignoredRectsByEdge: new Map([['e-shortage-no', [source, target]]]),
            minClearance: 18,
        }).get('e-shortage-no')!;

        expect(minDistanceToRect(paths.get('e-shortage-no')!, nearNode)).toBeLessThan(18);
        expect(minDistanceToRect(repaired, nearNode)).toBeGreaterThanOrEqual(18);
        expect(repaired[0]).toEqual(paths.get('e-shortage-no')?.[0]);
        expect(repaired[repaired.length - 1]).toEqual(paths.get('e-shortage-no')?.[1]);
        expect(isOrthogonalPath(repaired)).toBe(true);
    });

    it('lifts a return lane away from a non-endpoint obstacle boundary', () => {
        const fixQuota = { x: 1102, y: 294, width: 252, height: 96 };
        const greedySpec = { x: 114, y: 1478, width: 204, height: 96 };
        const mergeRes = { x: 564, y: 1478, width: 211, height: 96 };
        const paths = new Map([
            ['e10', [
                { x: 1228, y: 390 },
                { x: 1228, y: 470 },
                { x: 1324, y: 470 },
                { x: 1324, y: 1484 },
                { x: 799, y: 1484 },
                { x: 799, y: 1478 },
                { x: 216, y: 1478 },
            ]],
        ]);

        const repaired = repairHardObstacleViolations(paths, {
            spacing: 12,
            obstacles: [fixQuota, greedySpec, mergeRes],
            ignoredRectsByEdge: new Map([['e10', [fixQuota, greedySpec]]]),
            minClearance: 18,
            maxIterationsPerEdge: 6,
        }).get('e10')!;

        expect(minDistanceToRect(paths.get('e10')!, mergeRes)).toBe(0);
        expect(minDistanceToRect(repaired, mergeRes)).toBeGreaterThanOrEqual(18);
        expect(repaired[0]).toEqual(paths.get('e10')?.[0]);
        expect(repaired[repaired.length - 1]).toEqual(paths.get('e10')?.[6]);
        expect(isOrthogonalPath(repaired)).toBe(true);
    });

    it('repairs stacked WMS trunk hits over multiple iterations', () => {
        const taskDirectA = { x: 116, y: 2383, width: 172, height: 96 };
        const taskRepB = { x: 106, y: 2639, width: 191, height: 96 };
        const taskDirectB = { x: 116, y: 2895, width: 172, height: 96 };
        const endWms = { x: 116, y: 3151, width: 172, height: 96 };
        const paths = new Map([
            ['e21', [
                { x: 209.2, y: 2479.6 },
                { x: 209.2, y: 2499.6 },
                { x: 209.2, y: 2816.2 },
                { x: 209.2, y: 3132.8 },
                { x: 209.2, y: 3152.8 },
            ]],
        ]);

        const repaired = repairHardObstacleViolations(paths, {
            spacing: 12,
            obstacles: [taskDirectA, taskRepB, taskDirectB, endWms],
            ignoredRectsByEdge: new Map([['e21', [taskDirectA, endWms]]]),
            maxIterationsPerEdge: 6,
        }).get('e21')!;

        expect(pathHitsRectInterior(repaired, taskRepB)).toBe(false);
        expect(pathHitsRectInterior(repaired, taskDirectB)).toBe(false);
        expect(repaired[0]).toEqual(paths.get('e21')?.[0]);
        expect(repaired[repaired.length - 1]).toEqual(paths.get('e21')?.[4]);
        expect(isOrthogonalPath(repaired)).toBe(true);
    });
});

describe('repairEdgeCrossingViolations', () => {
    it('repairs same-buddy branch crossings without separating shared trunk overlap', () => {
        const paths = new Map([
            ['left-branch', [
                { x: 0, y: 0 },
                { x: 0, y: 20 },
                { x: 20, y: 20 },
                { x: 20, y: 60 },
                { x: 100, y: 60 },
                { x: 100, y: 100 },
            ]],
            ['right-branch', [
                { x: 70, y: 0 },
                { x: 70, y: 20 },
                { x: 40, y: 20 },
                { x: 40, y: 100 },
            ]],
            ['shared-trunk-a', [
                { x: 200, y: 10 },
                { x: 260, y: 10 },
            ]],
            ['shared-trunk-b', [
                { x: 220, y: 10 },
                { x: 280, y: 10 },
            ]],
        ]);
        const buddyGroups = [
            { type: 'o2m' as const, edgeIds: new Set(['left-branch', 'right-branch']) },
            { type: 'm2o' as const, edgeIds: new Set(['shared-trunk-a', 'shared-trunk-b']) },
        ];
        const scorer = new RoutingCrossingScorer({ buddyGroups, parallelOverlapMinLength: 12 });

        const result = repairEdgeCrossingViolations(paths, {
            spacing: 6,
            buddyGroups,
        });

        expect(scorer.score(paths).hardCrossings).toBe(0);
        expect(scorer.score(paths).buddyCrossings).toBe(1);
        expect(scorer.score(result).hardCrossings).toBe(0);
        expect(scorer.score(result).buddyCrossings).toBe(0);
        expect(scorer.score(result).parallelOverlaps).toBe(0);
        expect(result.get('left-branch')?.[1]).toEqual(paths.get('left-branch')?.[1]);
        expect(result.get('right-branch')?.[1]).toEqual(paths.get('right-branch')?.[1]);
        expect(result.get('shared-trunk-a')).toEqual(paths.get('shared-trunk-a'));
        expect(result.get('shared-trunk-b')).toEqual(paths.get('shared-trunk-b'));
    });

    it('moves a WMS branch crossing after hard obstacle doglegs', () => {
        const paths = new Map([
            ['e10', [
                { x: 1228, y: 390 },
                { x: 1228, y: 1334 },
                { x: 216, y: 1334 },
                { x: 216, y: 1478 },
            ]],
            ['e16', [
                { x: 1228, y: 390 },
                { x: 1228, y: 1424 },
                { x: 670, y: 1424 },
                { x: 670, y: 1478 },
            ]],
            ['e15', [
                { x: 741, y: 902 },
                { x: 741, y: 1424 },
                { x: 670, y: 1424 },
                { x: 670, y: 1478 },
            ]],
        ]);
        const buddyGroups = [
            { type: 'o2m' as const, edgeIds: new Set(['e10', 'e16']) },
            { type: 'm2o' as const, edgeIds: new Set(['e16', 'e15']) },
        ];
        const quotaCheck = { x: 106, y: 806, width: 273, height: 96 };
        const fixQuota = { x: 1102, y: 294, width: 252, height: 96 };
        const poolB = { x: 633, y: 806, width: 216, height: 96 };
        const mergeRes = { x: 564, y: 1478, width: 211, height: 96 };
        const greedySpec = { x: 114, y: 1478, width: 204, height: 96 };
        const obstacles = [quotaCheck, fixQuota, poolB, mergeRes, greedySpec];
        const scorer = new RoutingCrossingScorer({ buddyGroups, parallelOverlapMinLength: 24 });

        const crossingRepaired = repairEdgeCrossingViolations(paths, {
            spacing: 12,
            buddyGroups,
            obstacles,
            ignoredRectsByEdge: new Map([
                ['e10', [fixQuota, greedySpec]],
                ['e16', [fixQuota, mergeRes]],
                ['e15', [poolB, mergeRes]],
            ]),
            mutableEdgeIds: new Set(['e10', 'e15', 'e16']),
            allowObstacleHitIfImprovesCrossing: true,
        });
        const result = repairHardObstacleViolations(crossingRepaired, {
            spacing: 12,
            obstacles,
            ignoredRectsByEdge: new Map([
                ['e10', [fixQuota, greedySpec]],
                ['e16', [fixQuota, mergeRes]],
                ['e15', [poolB, mergeRes]],
            ]),
        });

        expect(scorer.score(paths).hardCrossings).toBe(1);
        expect(scorer.score(result).hardCrossings).toBe(0);
        for (const [edgeId, points] of result) {
            const ignored = new Map([
                ['e10', [fixQuota, greedySpec]],
                ['e16', [fixQuota, mergeRes]],
                ['e15', [poolB, mergeRes]],
            ]).get(edgeId) ?? [];
            const applicableObstacles = obstacles.filter(rect =>
                !ignored.some(ignoredRect =>
                    Math.abs(ignoredRect.x - rect.x) < 1
                    && Math.abs(ignoredRect.y - rect.y) < 1
                    && Math.abs(ignoredRect.width - rect.width) < 1
                    && Math.abs(ignoredRect.height - rect.height) < 1
                )
            );
            expect(RoutingCrossingScorer.pathHitsObstacle(points, applicableObstacles, 2)).toBe(false);
        }
    });

    it('moves a non-buddy sweep corridor without breaking adjacent bus trunks', () => {
        const paths = new Map([
            ['e10', [
                { x: 1228, y: 390 },
                { x: 1228, y: 470 },
                { x: 1180, y: 470 },
                { x: 1180, y: 1399 },
                { x: 216, y: 1399 },
                { x: 216, y: 1478 },
            ]],
            ['e15', [
                { x: 741, y: 902 },
                { x: 741, y: 1424 },
                { x: 669.5, y: 1424 },
                { x: 669.5, y: 1478 },
            ]],
            ['e16', [
                { x: 1228, y: 390 },
                { x: 1228, y: 1424 },
                { x: 669.5, y: 1424 },
                { x: 669.5, y: 1478 },
            ]],
        ]);
        const buddyGroups = [
            { type: 'o2m' as const, edgeIds: new Set(['e10', 'e16']) },
            { type: 'm2o' as const, edgeIds: new Set(['e15', 'e16']) },
        ];
        const scorer = new RoutingCrossingScorer({ buddyGroups, parallelOverlapMinLength: 24 });

        const result = repairEdgeCrossingViolations(paths, {
            spacing: 6,
            buddyGroups,
        });

        expect(scorer.score(paths).hardCrossings).toBeGreaterThan(0);
        expect(scorer.score(result).hardCrossings).toBe(0);
        expect(result.get('e10')?.[1]).toEqual(paths.get('e10')?.[1]);
        expect(result.get('e15')?.[result.get('e15')!.length - 2]).toEqual(paths.get('e15')?.[2]);
    });

    it('moves the WMS quota return lane away from the merge-resource vertical lane', () => {
        const paths = new Map([
            ['e10', [
                { x: 1228, y: 390 },
                { x: 1228, y: 462 },
                { x: 1324, y: 462 },
                { x: 1324, y: 1580 },
                { x: 216, y: 1580 },
                { x: 216, y: 1478 },
            ]],
            ['e17', [
                { x: 669.5, y: 1574 },
                { x: 669.5, y: 1734 },
            ]],
            ['e16', [
                { x: 1228, y: 390 },
                { x: 1228, y: 1416 },
                { x: 670, y: 1416 },
                { x: 670, y: 1478 },
            ]],
        ]);
        const buddyGroups = [
            { type: 'o2m' as const, edgeIds: new Set(['e10', 'e16']) },
        ];
        const scorer = new RoutingCrossingScorer({ buddyGroups, parallelOverlapMinLength: 24 });

        const result = repairEdgeCrossingViolations(paths, {
            spacing: 12,
            maxIterations: 8,
            buddyGroups,
        });

        expect(scorer.score(paths).hardCrossings).toBe(1);
        expect(scorer.score(result).hardCrossings).toBe(0);
        expect(result.get('e10')?.[1]).toEqual(paths.get('e10')?.[1]);
        expect(result.get('e16')?.[1]).toEqual(paths.get('e16')?.[1]);
    });

    it('preserves or extends an O2M source trunk while detouring a crossing branch', () => {
        const paths = new Map([
            ['e10', [
                { x: 1228, y: 390 },
                { x: 1228, y: 1334 },
                { x: 216, y: 1334 },
                { x: 216, y: 1478 },
            ]],
            ['e15', [
                { x: 741, y: 902 },
                { x: 741, y: 1424 },
                { x: 670, y: 1424 },
                { x: 670, y: 1478 },
            ]],
            ['e16', [
                { x: 1228, y: 390 },
                { x: 1228, y: 1424 },
                { x: 670, y: 1424 },
                { x: 670, y: 1478 },
            ]],
        ]);
        const buddyGroups = [
            { type: 'o2m' as const, edgeIds: new Set(['e10', 'e16']) },
            { type: 'm2o' as const, edgeIds: new Set(['e15', 'e16']) },
        ];
        const scorer = new RoutingCrossingScorer({ buddyGroups, parallelOverlapMinLength: 24 });

        const result = repairEdgeCrossingViolations(paths, {
            spacing: 12,
            buddyGroups,
        });
        const repairedE10 = result.get('e10')!;

        expect(scorer.score(paths).hardCrossings).toBeGreaterThan(0);
        expect(scorer.score(result).hardCrossings).toBe(0);
        expect(repairedE10[0]).toEqual(paths.get('e10')?.[0]);
        expect(repairedE10[1].x).toBe(paths.get('e10')?.[1].x);
        expect(repairedE10[1].y).toBeGreaterThanOrEqual(paths.get('e10')![1].y);
    });

    it('moves a middle corridor outside a lower execution crossing', () => {
        const paths = new Map([
            ['e20', [
                { x: 669, y: 2063 },
                { x: 669, y: 2188 },
                { x: 621, y: 2188 },
                { x: 621, y: 2824 },
                { x: 202, y: 2824 },
                { x: 202, y: 2895 },
            ]],
            ['e21', [
                { x: 202, y: 2479 },
                { x: 202, y: 2624 },
                { x: 302, y: 2624 },
                { x: 302, y: 3111 },
                { x: 202, y: 3111 },
                { x: 202, y: 3151 },
            ]],
        ]);
        const scorer = new RoutingCrossingScorer();

        const result = repairEdgeCrossingViolations(paths, { spacing: 12 });

        expect(scorer.score(paths).hardCrossings).toBeGreaterThan(0);
        expect(scorer.score(result).hardCrossings).toBe(0);
        expect(result.get('e20')?.[0]).toEqual(paths.get('e20')?.[0]);
        expect(result.get('e21')?.[0]).toEqual(paths.get('e21')?.[0]);
    });

    it('turns same-buddy branch crossings into shared trunk junctions', () => {
        const paths = new Map([
            ['e10', [
                { x: 1228, y: 390 },
                { x: 1228, y: 470 },
                { x: 1324, y: 470 },
                { x: 1324, y: 1334 },
                { x: 216, y: 1334 },
                { x: 216, y: 1478 },
            ]],
            ['e16', [
                { x: 1228, y: 390 },
                { x: 1228, y: 1424 },
                { x: 669, y: 1424 },
                { x: 669, y: 1478 },
            ]],
        ]);
        const buddyGroups = [
            { type: 'o2m' as const, edgeIds: new Set(['e10', 'e16']) },
        ];
        const scorer = new RoutingCrossingScorer({ buddyGroups, parallelOverlapMinLength: 24 });

        const result = repairEdgeCrossingViolations(paths, {
            spacing: 12,
            buddyGroups,
        });

        expect(scorer.score(paths).buddyCrossings).toBe(1);
        expect(scorer.score(result).buddyCrossings).toBe(0);
        expect(result.get('e10')).toEqual([
            { x: 1228, y: 390 },
            { x: 1228, y: 1334 },
            { x: 216, y: 1334 },
            { x: 216, y: 1478 },
        ]);
    });

    it('borrows the peer suffix for same-buddy many-to-one fan-in crossings', () => {
        const paths = new Map([
            ['e13', [
                { x: 216.5, y: 1807 },
                { x: 216.5, y: 1857 },
                { x: 349, y: 1857 },
                { x: 349, y: 2241.5 },
                { x: 202, y: 2241.5 },
                { x: 202, y: 2383 },
            ]],
            ['e14', [
                { x: 216, y: 2063 },
                { x: 216, y: 2280 },
                { x: 202, y: 2280 },
                { x: 202, y: 2383 },
            ]],
        ]);
        const buddyGroups = [
            { type: 'm2o' as const, edgeIds: new Set(['e13', 'e14']) },
        ];
        const scorer = new RoutingCrossingScorer({ buddyGroups, parallelOverlapMinLength: 24 });

        const result = repairEdgeCrossingViolations(paths, {
            spacing: 12,
            buddyGroups,
        });

        expect(scorer.score(paths).buddyCrossings).toBe(1);
        expect(scorer.score(result).buddyCrossings).toBe(0);
        expect(result.get('e14')).toEqual([
            { x: 216, y: 2063 },
            { x: 216, y: 2241.5 },
            { x: 202, y: 2241.5 },
            { x: 202, y: 2383 },
        ]);
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

    it('moves a reverse source stub to the source side facing the shared fan-in trunk', () => {
        const wmsRect = { x: 50, y: 812, width: 282, height: 118 };
        const paths = new Map([
            ['wms-visibility', [
                { x: 191, y: 812 },
                { x: 191, y: 780 },
                { x: 394.5, y: 780 },
                { x: 394.5, y: 1440 },
                { x: 1434.3375, y: 1440 },
                { x: 1434.3375, y: 1540 },
            ]],
            ['tms-visibility', [
                { x: 1064.75, y: 812 },
                { x: 1064.75, y: 1446 },
                { x: 1434.3375, y: 1446 },
                { x: 1434.3375, y: 1540 },
            ]],
        ]);

        const result = refineManyToOneFanIn(paths, [
            { targetId: 'visibility', edgeIds: ['wms-visibility', 'tms-visibility'] },
        ], {
            spacing: 12,
            ignoredRectsByEdge: new Map([
                ['wms-visibility', [wmsRect]],
            ]),
        });

        const rebuilt = result.get('wms-visibility')!;
        expect(rebuilt[0]).toEqual({ x: 332, y: 871 });
        expect(rebuilt).not.toContainEqual({ x: 191, y: 780 });
        expect(rebuilt.some(point => Math.abs(point.x - 1434.3375) < 1)).toBe(true);
    });

    it('collects horizontal fan-in branches on one shared trunk junction', () => {
        const paths = new Map([
            ['top', [
                { x: 0, y: 100 },
                { x: 40, y: 100 },
                { x: 40, y: 70 },
                { x: 180, y: 70 },
                { x: 180, y: 200 },
                { x: 240, y: 200 },
            ]],
            ['center', [
                { x: 0, y: 200 },
                { x: 240, y: 200 },
            ]],
            ['bottom', [
                { x: 0, y: 300 },
                { x: 80, y: 300 },
                { x: 80, y: 330 },
                { x: 160, y: 330 },
                { x: 160, y: 200 },
                { x: 240, y: 200 },
            ]],
        ]);

        const result = refineManyToOneFanIn(paths, [
            { targetId: 'target', edgeIds: ['top', 'center', 'bottom'] },
        ], { spacing: 12 });

        const branchXs = ['top', 'bottom'].map(edgeId => {
            const points = result.get(edgeId)!;
            const trunkJoin = points.find((point, index) =>
                index > 0
                && index < points.length - 1
                && Math.abs(point.y - 200) < 1
                && Math.abs(points[index + 1].y - 200) < 1
            );
            return trunkJoin?.x ?? 0;
        });

        expect(new Set(branchXs.map(x => Math.round(x))).size).toBe(1);
        expect(branchXs[0]).toBeGreaterThan(180);
        expect(branchXs[0]).toBeLessThan(210);
        for (const edgeId of ['top', 'center', 'bottom']) {
            const points = result.get(edgeId)!;
            expect(points[points.length - 1]).toEqual({ x: 240, y: 200 });
            for (let i = 0; i < points.length - 1; i++) {
                expect(Math.abs(points[i].x - points[i + 1].x) < 1 || Math.abs(points[i].y - points[i + 1].y) < 1).toBe(true);
            }
        }
    });

    it('repairs a final segment that enters a target node from the wrong side', () => {
        const target = { x: 116, y: 2895, width: 172, height: 96 };
        const paths = new Map([
            ['e20', [
                { x: 669, y: 2063 },
                { x: 669, y: 2179.5 },
                { x: 621, y: 2179.5 },
                { x: 621, y: 3010 },
                { x: 202, y: 3010 },
                { x: 202, y: 2895 },
            ]],
        ]);

        const repaired = repairHardObstacleViolations(paths, {
            obstacles: [target],
            spacing: 12,
        }).get('e20')!;

        expect(repaired[repaired.length - 1]).toEqual({ x: 202, y: 2895 });
        expect(pathHitsRectInterior(repaired, target)).toBe(false);
        expect(isOrthogonalPath(repaired)).toBe(true);
    });
});

function pathHitsRectInterior(
    points: Array<{ x: number; y: number }>,
    rect: { x: number; y: number; width: number; height: number }
): boolean {
    const left = rect.x + 2;
    const right = rect.x + rect.width - 2;
    const top = rect.y + 2;
    const bottom = rect.y + rect.height - 2;

    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (Math.abs(a.x - b.x) < 1) {
            const minY = Math.min(a.y, b.y);
            const maxY = Math.max(a.y, b.y);
            if (a.x > left && a.x < right && Math.max(minY, top) < Math.min(maxY, bottom)) return true;
        } else if (Math.abs(a.y - b.y) < 1) {
            const minX = Math.min(a.x, b.x);
            const maxX = Math.max(a.x, b.x);
            if (a.y > top && a.y < bottom && Math.max(minX, left) < Math.min(maxX, right)) return true;
        }
    }

    return false;
}

function minDistanceToRect(
    points: Array<{ x: number; y: number }>,
    rect: { x: number; y: number; width: number; height: number }
): number {
    let minDistance = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
        minDistance = Math.min(minDistance, segmentDistanceToRect(points[i], points[i + 1], rect));
    }
    return minDistance;
}

function segmentDistanceToRect(
    a: { x: number; y: number },
    b: { x: number; y: number },
    rect: { x: number; y: number; width: number; height: number }
): number {
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;

    if (Math.abs(a.x - b.x) < 1) {
        const x = a.x;
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);
        const overlapsY = Math.max(minY, top) <= Math.min(maxY, bottom);
        if (overlapsY && x >= left && x <= right) return 0;
        if (overlapsY) return Math.min(Math.abs(x - left), Math.abs(x - right));
        const dx = x < left ? left - x : x > right ? x - right : 0;
        const dy = maxY < top ? top - maxY : minY > bottom ? minY - bottom : 0;
        return Math.hypot(dx, dy);
    }

    if (Math.abs(a.y - b.y) < 1) {
        const y = a.y;
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        const overlapsX = Math.max(minX, left) <= Math.min(maxX, right);
        if (overlapsX && y >= top && y <= bottom) return 0;
        if (overlapsX) return Math.min(Math.abs(y - top), Math.abs(y - bottom));
        const dx = maxX < left ? left - maxX : minX > right ? minX - right : 0;
        const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
        return Math.hypot(dx, dy);
    }

    return Infinity;
}

function isOrthogonalPath(points: Array<{ x: number; y: number }>): boolean {
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (Math.abs(a.x - b.x) >= 1 && Math.abs(a.y - b.y) >= 1) return false;
    }
    return true;
}
