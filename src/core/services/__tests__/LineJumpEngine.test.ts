import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectLineJumpIntersections, injectLineJumps, LineJumpEngine } from '../LineJumpEngine';
import { createVerticalSegmentIndex, queryVerticalSegments } from '../lineJumpSpatialIndex';

describe('LineJumpEngine', () => {
    let engine: LineJumpEngine;

    beforeEach(() => {
        LineJumpEngine.getInstance().cleanup();
        engine = LineJumpEngine.getInstance();
    });

    afterEach(() => {
        engine.cleanup();
    });

    it('draws a jump for a non-buddy vertical endpoint touching a horizontal sweep', () => {
        const horizontal = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
        const vertical = [{ x: 80, y: 20 }, { x: 80, y: 100 }];

        engine.registerEdge('horizontal', horizontal, { source: 'a', target: 'b' });
        engine.registerEdge('vertical', vertical, { source: 'c', target: 'd' });

        const jumps = engine.getJumpsForEdge('horizontal');
        expect(jumps).toHaveLength(1);
        expect(jumps[0].point).toEqual({ x: 80, y: 100 });
        expect(injectLineJumps(horizontal, jumps)).toContain('A 6 6');
    });

    it('keeps O2M and M2O buddy endpoint contacts as shared junctions', () => {
        const horizontal = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
        const vertical = [{ x: 80, y: 20 }, { x: 80, y: 100 }];

        engine.registerEdge('o2m-a', horizontal, { source: 'hub', target: 'a' });
        engine.registerEdge('o2m-b', vertical, { source: 'hub', target: 'b' });
        expect(engine.getJumpsForEdge('o2m-a')).toEqual([]);

        engine.cleanup();
        engine = LineJumpEngine.getInstance();
        engine.registerEdge('m2o-a', horizontal, { source: 'a', target: 'hub' });
        engine.registerEdge('m2o-b', vertical, { source: 'b', target: 'hub' });
        expect(engine.getJumpsForEdge('m2o-a')).toEqual([]);
    });

    it('does not exempt strict interior crossings merely because edges share an endpoint group', () => {
        const horizontal = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
        const vertical = [{ x: 80, y: 20 }, { x: 80, y: 180 }];

        engine.registerEdge('same-target-a', horizontal, { source: 'a', target: 'hub' });
        engine.registerEdge('same-target-b', vertical, { source: 'b', target: 'hub' });

        expect(engine.getJumpsForEdge('same-target-a')).toEqual([
            expect.objectContaining({ point: { x: 80, y: 100 } }),
        ]);
        expect(collectLineJumpIntersections([
            {
                edgeId: 'same-target-a',
                points: horizontal,
                endpointInfo: { source: 'a', target: 'hub' },
            },
            {
                edgeId: 'same-target-b',
                points: vertical,
                endpointInfo: { source: 'b', target: 'hub' },
            },
        ])).toEqual(engine.getJumpsForEdge('same-target-a'));
    });

    it('queries sparse vertical segments without changing registration order', () => {
        const verticals = Array.from({ length: 1_000 }, (_, index) => ({
            p1: { x: index * 20, y: 0 },
            p2: { x: index * 20, y: 200 },
            edgeId: `vertical-${index}`,
            isHorizontal: false,
        }));
        const shuffled = [...verticals].sort((first, second) => (
            Number(second.edgeId.slice(9)) % 17 - Number(first.edgeId.slice(9)) % 17
        ));
        const index = createVerticalSegmentIndex(shuffled);
        const candidates = queryVerticalSegments(index, 9_900, 10_100);

        expect(candidates.length).toBeLessThan(12);
        expect(candidates.map(segment => segment.edgeId)).toEqual(
            shuffled
                .filter(segment => segment.p1.x > 9_900 && segment.p1.x < 10_100)
                .map(segment => segment.edgeId),
        );
    });

    it('keeps indexed crossing output equivalent to an explicit sparse construction', () => {
        const horizontalPaths = Array.from({ length: 80 }, (_, index) => ({
            edgeId: `horizontal-${index}`,
            points: [
                { x: index * 40, y: index * 12 + 20 },
                { x: index * 40 + 120, y: index * 12 + 20 },
            ],
        }));
        const verticalPaths = Array.from({ length: 800 }, (_, index) => ({
            edgeId: `vertical-${index}`,
            points: [
                { x: index * 8 + 10, y: 0 },
                { x: index * 8 + 10, y: 1_200 },
            ],
        }));
        const startedAt = performance.now();
        const intersections = collectLineJumpIntersections([...horizontalPaths, ...verticalPaths]);
        const durationMs = performance.now() - startedAt;

        const expected = horizontalPaths.flatMap(horizontal => {
            const first = horizontal.points[0];
            const second = horizontal.points[1];
            return verticalPaths.flatMap(vertical => {
                const x = vertical.points[0].x;
                return x > first.x + 6 && x < second.x - 6
                    ? [{
                        point: { x, y: first.y },
                        horizontalEdgeId: horizontal.edgeId,
                        verticalEdgeId: vertical.edgeId,
                    }]
                    : [];
            });
        });
        expect(intersections).toEqual(expected);
        expect(durationMs).toBeLessThan(1_000);
    });
});
