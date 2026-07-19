import { describe, expect, it } from 'vitest';
import { RoutingCrossingScorer, type CrossingScore } from '../routingCrossingScorer';
import { refineOrthogonalWaypointsDetailed } from '../orthogonalWaypointRefiner';

function expectCrossingScoresToMatch(actual: CrossingScore, expected: CrossingScore): void {
    const normalize = (score: CrossingScore) => ({
        ...score,
        byEdge: Array.from(score.byEdge.entries())
            .sort(([first], [second]) => first.localeCompare(second)),
    });
    expect(normalize(actual)).toEqual(normalize(expected));
}

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

    it('applies shared buddy policy once while preserving source and target trunk semantics', () => {
        const paths = new Map([
            ['first', [
                { x: 0, y: 0 }, { x: 100, y: 0 },
                { x: 100, y: 50 }, { x: 0, y: 50 }, { x: 0, y: 100 },
            ]],
            ['second', [
                { x: 20, y: 0 }, { x: 120, y: 0 },
                { x: 120, y: 50 }, { x: 60, y: 50 }, { x: 60, y: 100 },
            ]],
        ]);
        const scoreFor = (types: Array<'o2m' | 'm2o'>) => new RoutingCrossingScorer({
            buddyGroups: types.map(type => ({
                type,
                edgeIds: new Set(['first', 'second']),
            })),
            parallelOverlapMinLength: 20,
        }).score(paths);

        expect(scoreFor(['o2m']).parallelOverlaps).toBe(2);
        expect(scoreFor(['m2o']).parallelOverlaps).toBe(4);
        expect(scoreFor(['o2m', 'm2o']).parallelOverlaps).toBe(0);
    });

    it('scores a single-edge replacement exactly like a complete trial score', () => {
        const scorer = new RoutingCrossingScorer({
            buddyGroups: [{ type: 'o2m', edgeIds: new Set(['alpha', 'beta']) }],
            softObstacles: [{ x: 30, y: 88, width: 24, height: 24 }],
            parallelOverlapMinLength: 20,
        });
        const baseline = new Map([
            ['alpha', [
                { x: 0, y: 20 }, { x: 120, y: 20 },
                { x: 40, y: 20 }, { x: 40, y: 100 },
            ]],
            ['beta', [{ x: 60, y: 0 }, { x: 60, y: 120 }]],
            ['gamma', [{ x: 20, y: 20 }, { x: 100, y: 20 }]],
        ]);
        const replacement = [
            { x: 0, y: 40 }, { x: 120, y: 40 },
            { x: 120, y: 100 }, { x: 40, y: 100 },
        ];
        const context = scorer.createReplacementContext(baseline);
        const expectedBaseline = scorer.score(baseline);
        const trial = new Map(baseline);
        trial.set('alpha', replacement);

        expectCrossingScoresToMatch(context.currentScore, expectedBaseline);
        expectCrossingScoresToMatch(
            context.scoreReplacement('alpha', replacement),
            scorer.score(trial),
        );
        expectCrossingScoresToMatch(context.currentScore, expectedBaseline);
    });

    it('commits replacements and scores subsequent replacements from the committed state', () => {
        const scorer = new RoutingCrossingScorer({
            softObstacles: [{ x: 85, y: 35, width: 30, height: 30 }],
            parallelOverlapMinLength: 20,
        });
        const baseline = new Map([
            ['horizontal', [{ x: 0, y: 50 }, { x: 200, y: 50 }]],
            ['vertical', [{ x: 100, y: 0 }, { x: 100, y: 140 }]],
            ['overlap', [{ x: 40, y: 50 }, { x: 160, y: 50 }]],
        ]);
        const horizontalReplacement = [
            { x: 0, y: 20 }, { x: 200, y: 20 },
        ];
        const verticalReplacement = [
            { x: 180, y: 0 }, { x: 180, y: 140 },
        ];
        const context = scorer.createReplacementContext(baseline);
        const firstTrial = new Map(baseline);
        firstTrial.set('horizontal', horizontalReplacement);

        expectCrossingScoresToMatch(
            context.commitReplacement('horizontal', horizontalReplacement),
            scorer.score(firstTrial),
        );
        expectCrossingScoresToMatch(context.currentScore, scorer.score(firstTrial));

        const secondTrial = new Map(firstTrial);
        secondTrial.set('vertical', verticalReplacement);
        expectCrossingScoresToMatch(
            context.scoreReplacement('vertical', verticalReplacement),
            scorer.score(secondTrial),
        );
        expectCrossingScoresToMatch(
            context.commitReplacement('vertical', verticalReplacement),
            scorer.score(secondTrial),
        );
        expectCrossingScoresToMatch(context.currentScore, scorer.score(secondTrial));
    });

    it('isolates context state from input mutation and rejects unknown replacement ids', () => {
        const scorer = new RoutingCrossingScorer();
        const baseline = new Map([
            ['horizontal', [{ x: 0, y: 10 }, { x: 100, y: 10 }]],
            ['vertical', [{ x: 50, y: 0 }, { x: 50, y: 100 }]],
        ]);
        const expectedBaseline = scorer.score(baseline);
        const context = scorer.createReplacementContext(baseline);

        baseline.get('horizontal')![0].y = 80;
        expectCrossingScoresToMatch(context.currentScore, expectedBaseline);
        expect(() => context.scoreReplacement('missing', [
            { x: 0, y: 0 }, { x: 10, y: 0 },
        ])).toThrow(/unknown edge/i);
    });
});

describe('refineOrthogonalWaypointsDetailed', () => {
    it('normalizes malformed runtime paths and extreme coordinates before scoring', () => {
        const empty = refineOrthogonalWaypointsDetailed(null as never, null as never);
        expect(empty.paths).toEqual(new Map());
        expect(empty.summary.initial.totalScore).toBe(0);

        const result = refineOrthogonalWaypointsDetailed(new Map<unknown, unknown>([
            ['invalid-points', [null, { x: Number.NaN, y: 0 }]],
            ['bounded', [
                { x: Number.MAX_VALUE, y: -Number.MAX_VALUE },
                { x: 0, y: 0 },
            ]],
            [42, [{ x: 0, y: 0 }, { x: 10, y: 0 }]],
        ]) as never, {
            spacing: Number.POSITIVE_INFINITY,
            maxPasses: -10,
            enableReroute: false,
            hardObstacles: [null, {
                x: 0,
                y: 0,
                width: Number.POSITIVE_INFINITY,
                height: 10,
            }],
            candidateAxes: {
                horizontal: [Number.NaN, Number.MAX_VALUE],
                vertical: null,
            },
        } as never);

        expect([...result.paths.keys()]).toEqual(['invalid-points', 'bounded']);
        expect(result.paths.get('invalid-points')).toEqual([]);
        expect(result.paths.get('bounded')).toEqual([
            { x: 10_000_000, y: -10_000_000 },
            { x: 0, y: 0 },
        ]);
    });

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
