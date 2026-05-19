import { describe, expect, it } from 'vitest';
import { EdgeRoutingWorker } from '../EdgeRoutingWorker';
import { createDefaultRoutingConfig, Position } from '../../../types/routing';

describe('EdgeRoutingWorker', () => {
    it('uses facing side ports for horizontally separated cross-subGroup links', () => {
        const result = EdgeRoutingWorker.execute({
            job: {
                jobId: 'cross-subgroup-lateral',
                edgeId: 'cross-subgroup-lateral',
                source: 'theoretical-water-level',
                target: 'demand-ranking',
                sourceX: 360,
                sourceY: 800,
                targetX: 760,
                targetY: 220,
                sourcePosition: Position.Top,
                targetPosition: Position.Top,
                layoutDirection: 'TB',
            },
            graph: {
                nodes: [
                    {
                        id: 'source-subgroup',
                        type: 'subGroup',
                        position: { x: 120, y: 120 },
                        measured: { width: 360, height: 820 },
                        data: { children: ['theoretical-water-level'] },
                    },
                    {
                        id: 'target-subgroup',
                        type: 'subGroup',
                        position: { x: 650, y: 130 },
                        measured: { width: 360, height: 470 },
                        data: { children: ['demand-ranking'] },
                    },
                    {
                        id: 'theoretical-water-level',
                        parentId: 'source-subgroup',
                        position: { x: 248, y: 840 },
                        measured: { width: 154, height: 62 },
                    },
                    {
                        id: 'demand-ranking',
                        parentId: 'target-subgroup',
                        position: { x: 682, y: 172 },
                        measured: { width: 132, height: 62 },
                    },
                ],
                edges: [
                    {
                        id: 'cross-subgroup-lateral',
                        source: 'theoretical-water-level',
                        target: 'demand-ranking',
                    },
                ],
                obstacles: [],
                config: {},
            },
            config: createDefaultRoutingConfig(),
            runtime: {},
        } as any);

        const selected = (result.debugInfo as any)?.algorithmDebug?.portSelection?.selected;
        expect(selected).toEqual({ source: Position.Right, target: Position.Left });
        expect(result.points[0].x).toBeGreaterThan(400);
        expect(result.points[result.points.length - 1].x).toBeLessThan(683);
    });
});
