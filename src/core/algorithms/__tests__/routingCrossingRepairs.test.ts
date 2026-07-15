import { describe, expect, it } from 'vitest';
import { RoutingCrossingScorer } from '../routingCrossingScorer';
import { globalChannelRouting } from '../globalChannelRouting';
import { refineManyToOneFanIn } from '../manyToOneFanIn';
import { repairHardObstacleViolations } from '../hardObstaclePathRepair';
import { repairEdgeCrossingViolations } from '../edgeCrossingRepair';

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

    it('keeps the WMS quota loop away from the mixed allocation boundary', () => {
        const fixQuota = { x: 2063.05, y: 402, width: 252, height: 96 };
        const greedySpec = { x: 60, y: 1670, width: 220, height: 96 };
        const allocMixed = { x: 693, y: 1926, width: 204, height: 96 };
        const paths = new Map([
            ['e10', [
                { x: 2063, y: 450 },
                { x: 1952, y: 450 },
                { x: 1952, y: 2022 },
                { x: 669, y: 2022 },
                { x: 669, y: 1718 },
                { x: 280, y: 1718 },
            ]],
        ]);

        const repaired = repairHardObstacleViolations(paths, {
            spacing: 12,
            obstacles: [fixQuota, greedySpec, allocMixed],
            ignoredRectsByEdge: new Map([['e10', [fixQuota, greedySpec]]]),
            minClearance: 18,
            maxIterationsPerEdge: 6,
        }).get('e10')!;

        expect(minDistanceToRect(paths.get('e10')!, allocMixed)).toBe(0);
        expect(minDistanceToRect(repaired, allocMixed)).toBeGreaterThanOrEqual(18);
        expect(repaired[0]).toEqual(paths.get('e10')?.[0]);
        expect(repaired[repaired.length - 1]).toEqual(paths.get('e10')?.[5]);
        expect(isOrthogonalPath(repaired)).toBe(true);
    });

    it('rechecks crossings after final quota-loop clearance repair', () => {
        const mergeRes = { x: 564, y: 1478, width: 211, height: 96 };
        const paths = new Map([
            ['e10', [
                { x: 1228, y: 390 },
                { x: 1228, y: 470 },
                { x: 1324, y: 470 },
                { x: 1324, y: 1484 },
                { x: 799, y: 1484 },
                { x: 799, y: 1598 },
                { x: 540, y: 1598 },
                { x: 540, y: 1478 },
                { x: 216, y: 1478 },
            ]],
            ['e17', [
                { x: 669.5, y: 1574 },
                { x: 669.5, y: 1734 },
            ]],
        ]);
        const scorer = new RoutingCrossingScorer();

        const crossed = repairEdgeCrossingViolations(paths, {
            spacing: 12,
            obstacles: [mergeRes],
            maxIterations: 8,
        });
        const crossedByVertical = repairEdgeCrossingViolations(paths, {
            spacing: 12,
            obstacles: [mergeRes],
            ignoredRectsByEdge: new Map([['e17', [mergeRes]]]),
            maxIterations: 8,
            mutableEdgeIds: new Set(['e17']),
        });

        expect(scorer.score(paths).hardCrossings).toBe(1);
        expect(scorer.score(crossed).hardCrossings).toBe(0);
        expect(scorer.score(crossedByVertical).hardCrossings).toBe(0);
        expect(pathHitsRectInterior(crossed.get('e10')!, mergeRes)).toBe(false);
        expect(crossed.get('e10')?.[0]).toEqual(paths.get('e10')?.[0]);
        expect(crossed.get('e10')?.[crossed.get('e10')!.length - 1]).toEqual(paths.get('e10')?.[8]);
        expect(isOrthogonalPath(crossed.get('e10')!)).toBe(true);
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
