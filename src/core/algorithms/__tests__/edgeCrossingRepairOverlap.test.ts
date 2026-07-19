import { describe, expect, it } from 'vitest';
import { repairEdgeCrossingViolations } from '../edgeCrossingRepair';
import { RoutingCrossingScorer } from '../routingCrossingScorer';

describe('repairEdgeCrossingViolations parallel overlaps', () => {
    it('separates non-buddy edges that share a middle segment', () => {
        const paths = new Map([
            ['tms-to-yms', [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 200, y: 100 },
            ]],
            ['wms-to-equipment', [
                { x: 40, y: -30 },
                { x: 100, y: -30 },
                { x: 100, y: 80 },
                { x: 180, y: 80 },
            ]],
        ]);
        const scorer = new RoutingCrossingScorer({ parallelOverlapMinLength: 24 });

        const result = repairEdgeCrossingViolations(paths, {
            spacing: 12,
            maxIterations: 4,
        });
        const repaired = result.get('wms-to-equipment') ?? [];

        expect(scorer.score(paths).parallelOverlaps).toBeGreaterThan(0);
        expect(scorer.score(result).parallelOverlaps).toBe(0);
        expect(repaired[0]).toEqual(paths.get('wms-to-equipment')?.[0]);
        expect(repaired[repaired.length - 1]).toEqual(paths.get('wms-to-equipment')?.[3]);
        expect(repaired.some((point, index) =>
            index < repaired.length - 1
            && Math.abs(point.x - repaired[index + 1].x) < 1
            && Math.abs(point.x - 100) > 1
        )).toBe(true);
    });

    it('separates same-source buddy edges when the overlap is not the source trunk', () => {
        const paths = new Map([
            ['tms-to-bms', [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 200, y: 100 },
            ]],
            ['tms-to-yms', [
                { x: 0, y: -30 },
                { x: 100, y: -30 },
                { x: 100, y: 80 },
                { x: 180, y: 80 },
            ]],
        ]);
        const buddyGroups = [
            { type: 'o2m' as const, edgeIds: new Set(['tms-to-bms', 'tms-to-yms']) },
        ];
        const scorer = new RoutingCrossingScorer({ buddyGroups, parallelOverlapMinLength: 24 });

        const result = repairEdgeCrossingViolations(paths, {
            spacing: 12,
            maxIterations: 4,
            buddyGroups,
        });

        expect(scorer.score(paths).parallelOverlaps).toBeGreaterThan(0);
        expect(scorer.score(result).parallelOverlaps).toBe(0);
    });

    it('continues repairing long shared lanes even when an unrelated crossing is fixed elsewhere', () => {
        const paths = new Map([
            ['fixed-horizontal', [
                { x: 0, y: 200 },
                { x: 120, y: 200 },
            ]],
            ['fixed-vertical', [
                { x: 60, y: 140 },
                { x: 60, y: 260 },
            ]],
            ['overlap-a', [
                { x: 0, y: 0 },
                { x: 180, y: 0 },
            ]],
            ['overlap-b', [
                { x: 30, y: 0 },
                { x: 210, y: 0 },
            ]],
        ]);
        const scorer = new RoutingCrossingScorer({ parallelOverlapMinLength: 24 });

        const result = repairEdgeCrossingViolations(paths, {
            spacing: 12,
            maxIterations: 2,
            mutableEdgeIds: new Set(['overlap-a', 'overlap-b']),
            preserveEndpointDirections: true,
        });
        const movedOverlap = result.get('overlap-a')!.length > 2 || result.get('overlap-b')!.length > 2;

        expect(scorer.score(paths).hardCrossings).toBe(1);
        expect(scorer.score(result).hardCrossings).toBe(1);
        expect(scorer.score(result).parallelOverlaps).toBeLessThan(scorer.score(paths).parallelOverlaps);
        expect(movedOverlap).toBe(true);
    });

    it('splits a two-point shared lane while preserving endpoint directions', () => {
        const paths = new Map([
            ['carrier-to-tms', [
                { x: 0, y: 0 },
                { x: 220, y: 0 },
            ]],
            ['tms-to-carrier', [
                { x: 20, y: 0 },
                { x: 240, y: 0 },
            ]],
        ]);
        const scorer = new RoutingCrossingScorer({ parallelOverlapMinLength: 24 });

        const result = repairEdgeCrossingViolations(paths, {
            spacing: 12,
            maxIterations: 2,
            preserveEndpointDirections: true,
        });
        const moved = result.get('carrier-to-tms')!.length > 2 || result.get('tms-to-carrier')!.length > 2;

        expect(scorer.score(paths).parallelOverlaps).toBeGreaterThan(0);
        expect(scorer.score(result).parallelOverlaps).toBe(0);
        expect(moved).toBe(true);
    });

    it('splits opposite-role endpoint trunks on the same hub node', () => {
        const paths = new Map([
            ['hub-to-wms', [
                { x: 0, y: 0 },
                { x: 0, y: 220 },
                { x: 120, y: 220 },
            ]],
            ['hub-to-tms', [
                { x: 0, y: 0 },
                { x: 0, y: 160 },
                { x: -120, y: 160 },
            ]],
            ['wms-to-hub', [
                { x: 180, y: 260 },
                { x: 0, y: 260 },
                { x: 0, y: 0 },
            ]],
            ['erp-to-hub', [
                { x: -180, y: 260 },
                { x: 0, y: 260 },
                { x: 0, y: 0 },
            ]],
        ]);
        const buddyGroups = [
            { type: 'o2m' as const, edgeIds: new Set(['hub-to-wms', 'hub-to-tms']) },
            { type: 'm2o' as const, edgeIds: new Set(['wms-to-hub', 'erp-to-hub']) },
        ];
        const scorer = new RoutingCrossingScorer({ buddyGroups, parallelOverlapMinLength: 24 });

        const result = repairEdgeCrossingViolations(paths, {
            spacing: 12,
            maxIterations: 4,
            buddyGroups,
            preserveEndpointDirections: true,
        });

        expect(scorer.score(paths).parallelOverlaps).toBeGreaterThan(0);
        expect(scorer.score(result).parallelOverlaps).toBeLessThan(scorer.score(paths).parallelOverlaps);
        expect(result.get('hub-to-wms')?.[0]).toEqual({ x: 0, y: 0 });
        expect(result.get('wms-to-hub')?.[result.get('wms-to-hub')!.length - 1]).toEqual({ x: 0, y: 0 });
    });

    it('can move the middle lane of an edge that is both fan-out and fan-in', () => {
        const paths = new Map([
            ['source-peer', [
                { x: 0, y: 0 },
                { x: 0, y: 100 },
                { x: -80, y: 100 },
            ]],
            ['bridge', [
                { x: 0, y: 0 },
                { x: 0, y: 100 },
                { x: 200, y: 100 },
                { x: 200, y: 200 },
            ]],
            ['target-peer', [
                { x: 300, y: 0 },
                { x: 200, y: 0 },
                { x: 200, y: 200 },
            ]],
            ['short-fixed', [
                { x: 20, y: 100 },
                { x: 180, y: 100 },
            ]],
        ]);
        const buddyGroups = [
            { type: 'o2m' as const, edgeIds: new Set(['source-peer', 'bridge']) },
            { type: 'm2o' as const, edgeIds: new Set(['bridge', 'target-peer']) },
        ];
        const scorer = new RoutingCrossingScorer({ buddyGroups, parallelOverlapMinLength: 24 });

        const result = repairEdgeCrossingViolations(paths, {
            spacing: 12,
            maxIterations: 4,
            buddyGroups,
        });
        const bridge = result.get('bridge')!;

        expect(scorer.score(paths).parallelOverlaps).toBeGreaterThan(0);
        expect(scorer.score(result).parallelOverlaps).toBeLessThan(scorer.score(paths).parallelOverlaps);
        expect(bridge[0]).toEqual(paths.get('bridge')?.[0]);
        expect(bridge[bridge.length - 1]).toEqual(paths.get('bridge')?.[3]);
        expect(bridge[1].x).toBe(0);
        expect(bridge[1].y).toBeGreaterThan(0);
        expect(bridge[bridge.length - 2].x).toBe(200);
        expect(bridge[bridge.length - 2].y).toBeLessThan(200);
    });

    it('keeps short protected fan-out trunks shared', () => {
        const paths = new Map([
            ['hub-to-left', [
                { x: 0, y: 0 },
                { x: 0, y: 80 },
                { x: -80, y: 80 },
            ]],
            ['hub-to-right', [
                { x: 0, y: 0 },
                { x: 0, y: 80 },
                { x: 80, y: 80 },
            ]],
        ]);
        const buddyGroups = [
            { type: 'o2m' as const, edgeIds: new Set(['hub-to-left', 'hub-to-right']) },
        ];

        const result = repairEdgeCrossingViolations(paths, {
            spacing: 12,
            maxIterations: 4,
            buddyGroups,
            preserveEndpointDirections: true,
        });

        expect(result.get('hub-to-left')).toEqual(paths.get('hub-to-left'));
        expect(result.get('hub-to-right')).toEqual(paths.get('hub-to-right'));
    });

    it('keeps long protected fan-out trunks as shared bus semantics', () => {
        const paths = new Map([
            ['hub-to-left', [
                { x: 0, y: 0 },
                { x: 0, y: 220 },
                { x: -80, y: 220 },
            ]],
            ['hub-to-right', [
                { x: 0, y: 0 },
                { x: 0, y: 220 },
                { x: 80, y: 220 },
            ]],
        ]);
        const buddyGroups = [
            { type: 'o2m' as const, edgeIds: new Set(['hub-to-left', 'hub-to-right']) },
        ];
        const result = repairEdgeCrossingViolations(paths, {
            spacing: 12,
            maxIterations: 4,
            buddyGroups,
            preserveEndpointDirections: true,
        });

        expect(maxCollinearOverlap(result.get('hub-to-left')!, result.get('hub-to-right')!)).toBe(220);
        expect(result.get('hub-to-left')).toEqual(paths.get('hub-to-left'));
        expect(result.get('hub-to-right')).toEqual(paths.get('hub-to-right'));
    });

    it('normalizes malformed runtime input without leaking non-finite geometry', () => {
        expect(repairEdgeCrossingViolations(null as never, null as never)).toEqual(new Map());

        const paths = new Map<unknown, unknown>([
            ['horizontal', [{ x: -1e100, y: 50 }, { x: 1e100, y: 50 }]],
            ['vertical', [{ x: 50, y: -1e100 }, { x: 50, y: 1e100 }]],
            ['invalid-point', [{ x: 0, y: 0 }, { x: Number.NaN, y: 20 }]],
            [42, [{ x: 0, y: 0 }, { x: 20, y: 0 }]],
        ]);

        const result = repairEdgeCrossingViolations(paths as never, {
            spacing: Number.POSITIVE_INFINITY,
            maxIterations: Number.POSITIVE_INFINITY,
            obstacles: [
                null,
                { x: Number.NaN, y: 0, width: 10, height: 10 },
                { x: 0, y: 0, width: -10, height: 10 },
            ],
            buddyGroups: [null, { type: 'invalid', edgeIds: new Set(['horizontal']) }],
            ignoredRectsByEdge: new Map([[42, []]]),
            mutableEdgeIds: new Set(['horizontal', 'vertical', 42]),
        } as never);

        expect([...result.keys()].sort()).toEqual(['horizontal', 'vertical']);
        expect([...result.values()].flat().every(point =>
            Number.isFinite(point.x)
            && Number.isFinite(point.y)
            && Math.abs(point.x) <= 10_000_000
            && Math.abs(point.y) <= 10_000_000
        )).toBe(true);
    });
});

function maxCollinearOverlap(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): number {
    let maxOverlap = 0;
    for (let i = 0; i < a.length - 1; i++) {
        for (let j = 0; j < b.length - 1; j++) {
            maxOverlap = Math.max(maxOverlap, segmentOverlap(a[i], a[i + 1], b[j], b[j + 1]));
        }
    }
    return maxOverlap;
}

function segmentOverlap(
    a1: { x: number; y: number },
    a2: { x: number; y: number },
    b1: { x: number; y: number },
    b2: { x: number; y: number },
): number {
    const aVertical = Math.abs(a1.x - a2.x) < 1;
    const bVertical = Math.abs(b1.x - b2.x) < 1;
    if (aVertical !== bVertical) return 0;
    if (aVertical) {
        if (Math.abs(a1.x - b1.x) > 1) return 0;
        return Math.max(0, Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y))
            - Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y)));
    }
    if (Math.abs(a1.y - b1.y) > 1) return 0;
    return Math.max(0, Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x))
        - Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x)));
}
