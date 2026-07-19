import { describe, expect, it } from 'vitest';
import type { SharedGraphContext } from '../../types/routing';

import {
    collectHardEdgeRoutingObstacles,
    collectSoftEdgeRoutingObstacles,
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

    it('collects soft graph, label, and routed obstacles while honoring exclusions', () => {
        const graph = {
            softObstacles: [{ x: 0, y: 0, width: 10, height: 10 }],
            routingLabels: [{ ownerId: 'excluded', x: 20, y: 0, width: 10, height: 10 }],
            nodes: [],
        } as unknown as SharedGraphContext;

        expect(collectSoftEdgeRoutingObstacles(
            graph,
            [{ edgeId: 'label', x: 40, y: 0, width: 10, height: 10 }],
            new Set(['excluded']),
        )).toEqual([
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 40, y: 0, width: 10, height: 10 },
        ]);
    });

    it('deduplicates hard graph obstacles and rejects malformed input', () => {
        const graph = {
            obstacles: [
                { x: 0, y: 0, width: 10, height: 10 },
                { x: 0, y: 0, width: 10, height: 10 },
                { x: Number.NaN, y: 0, width: 10, height: 10 },
            ],
            nodes: [],
        } as unknown as SharedGraphContext;

        expect(collectHardEdgeRoutingObstacles(graph)).toEqual([
            { x: 0, y: 0, width: 10, height: 10 },
        ]);
    });
});
