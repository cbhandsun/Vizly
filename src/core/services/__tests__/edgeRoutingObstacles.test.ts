import { describe, expect, it } from 'vitest';

import {
    createEdgeRoutingObstacleCollector,
    normalizeEdgeRoutingObstacleRect,
} from '../edgeRoutingObstacles';

describe('edgeRoutingObstacles', () => {
    it('normalizes numeric obstacle fields and strips ownership metadata', () => {
        expect(
            normalizeEdgeRoutingObstacleRect({
                edgeId: 'edge-1',
                x: '10',
                y: '20',
                width: '40',
                height: '24',
            })
        ).toEqual({ x: 10, y: 20, width: 40, height: 24 });
    });

    it('filters excluded owners and invalid obstacle sizes', () => {
        expect(
            normalizeEdgeRoutingObstacleRect(
                { ownerId: 'edge-2', x: 10, y: 20, width: 40, height: 24 },
                new Set(['edge-2'])
            )
        ).toBeNull();
        expect(
            normalizeEdgeRoutingObstacleRect({ x: Number.NaN, y: 0, width: 12, height: 12 })
        ).toBeNull();
        expect(
            normalizeEdgeRoutingObstacleRect({ x: 0, y: 0, width: 1, height: 12 })
        ).toBeNull();
    });

    it('dedupes normalized rectangles when requested', () => {
        const collected: Array<{ x: number; y: number; width: number; height: number }> = [];
        const pushRect = createEdgeRoutingObstacleCollector(collected, { dedupe: true });

        pushRect({ x: 10.04, y: 20.04, width: 30.04, height: 40.04 });
        pushRect({ x: 10.03, y: 20.03, width: 30.03, height: 40.03 });
        pushRect({ x: 11, y: 20, width: 30, height: 40 });

        expect(collected).toEqual([
            { x: 10.04, y: 20.04, width: 30.04, height: 40.04 },
            { x: 11, y: 20, width: 30, height: 40 },
        ]);
    });
});
