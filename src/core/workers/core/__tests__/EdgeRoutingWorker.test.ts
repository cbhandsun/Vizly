import { describe, expect, it } from 'vitest';
import { EdgeRoutingWorker } from '../EdgeRoutingWorker';
import { createDefaultRoutingConfig, Position } from '../../../types/routing';

describe('EdgeRoutingWorker', () => {
    const route = (overrides: Record<string, any> = {}, graphOverrides: Record<string, any> = {}) => {
        const sourceNode = {
            id: 'source',
            position: { x: 0, y: 0 },
            measured: { width: 80, height: 40 },
            ...(graphOverrides.sourceNode || {}),
        };
        const targetNode = {
            id: 'target',
            position: { x: 300, y: 0 },
            measured: { width: 80, height: 40 },
            ...(graphOverrides.targetNode || {}),
        };

        return EdgeRoutingWorker.execute({
            job: {
                jobId: overrides.edgeId || 'edge',
                edgeId: overrides.edgeId || 'edge',
                source: sourceNode.id,
                target: targetNode.id,
                sourceX: sourceNode.position.x,
                sourceY: sourceNode.position.y,
                targetX: targetNode.position.x,
                targetY: targetNode.position.y,
                layoutDirection: 'LR',
                ...overrides,
            },
            graph: {
                nodes: graphOverrides.nodes || [sourceNode, targetNode],
                edges: graphOverrides.edges || [{ id: overrides.edgeId || 'edge', source: sourceNode.id, target: targetNode.id }],
                obstacles: graphOverrides.obstacles || [],
                config: {},
                pendingEdges: graphOverrides.pendingEdges,
            },
            config: graphOverrides.config || createDefaultRoutingConfig(),
            runtime: graphOverrides.runtime || {},
        } as any);
    };

    it('returns a structured error when source or target node is missing', () => {
        const result = EdgeRoutingWorker.execute({
            job: {
                jobId: 'missing-node',
                edgeId: 'missing-node',
                source: 'missing',
                target: 'target',
                sourceX: 0,
                sourceY: 0,
                targetX: 100,
                targetY: 0,
            },
            graph: {
                nodes: [{ id: 'target', position: { x: 100, y: 0 }, measured: { width: 80, height: 40 } }],
                edges: [],
                obstacles: [],
                config: {},
            },
            config: createDefaultRoutingConfig(),
            runtime: {},
        } as any);

        expect(result.error).toBe('Source or Target node not found');
        expect(result.points).toEqual([]);
        expect(result.path).toBe('');
    });

    it('generates a deterministic rectangular self-loop', () => {
        const result = EdgeRoutingWorker.execute({
            job: {
                jobId: 'self-loop',
                edgeId: 'self-loop',
                source: 'node',
                target: 'node',
                sourceX: 0,
                sourceY: 0,
                targetX: 0,
                targetY: 0,
            },
            graph: {
                nodes: [{ id: 'node', position: { x: 10, y: 20 }, measured: { width: 80, height: 40 } }],
                edges: [{ id: 'self-loop', source: 'node', target: 'node' }],
                obstacles: [],
                config: {},
            },
            config: createDefaultRoutingConfig(),
            runtime: {},
        } as any);

        expect(result.metadata).toEqual({ strategy: 'Self-Loop' });
        expect(result.sourcePos).toBe(Position.Right);
        expect(result.targetPos).toBe(Position.Right);
        expect(result.points).toEqual([
            { x: 90, y: 40 },
            { x: 98, y: 40 },
            { x: 130, y: 25 },
            { x: 130, y: 55 },
            { x: 98, y: 40 },
            { x: 90, y: 40 },
        ]);
    });

    it('parses exact, shorthand, compound, and unknown handle directions', () => {
        expect(EdgeRoutingWorker.parseHandleDir('left')).toBe(Position.Left);
        expect(EdgeRoutingWorker.parseHandleDir('R')).toBe(Position.Right);
        expect(EdgeRoutingWorker.parseHandleDir('source-top-handle')).toBe(Position.Top);
        expect(EdgeRoutingWorker.parseHandleDir('target-bottom')).toBe(Position.Bottom);
        expect(EdgeRoutingWorker.parseHandleDir('center')).toBeUndefined();
        expect(EdgeRoutingWorker.parseHandleDir(null)).toBeUndefined();
    });

    it('honors explicit source and target handles during routing', () => {
        const result = route({
            edgeId: 'explicit-handles',
            sourceHandle: 'source-bottom-handle',
            targetHandle: 'target-top-handle',
        }, {
            targetNode: { position: { x: 0, y: 220 } },
        });

        expect(result.error).toBeUndefined();
        expect(result.sourcePos).toBe(Position.Bottom);
        expect(result.targetPos).toBe(Position.Top);
        expect((result.debugInfo as any).algorithmDebug.portSelection).toEqual(expect.objectContaining({
            hasExplicitSource: true,
            hasExplicitTarget: true,
            selected: { source: Position.Bottom, target: Position.Top },
        }));
    });

    it('uses a deterministic top U-turn for horizontal reverse edges', () => {
        const result = route({
            edgeId: 'reverse-horizontal',
            isReverseEdge: true,
        });

        expect(result.error).toBeUndefined();
        expect(result.metadata?.strategy).toBe('Reverse U-Turn');
        expect(result.sourcePos).toBe(Position.Top);
        expect(result.targetPos).toBe(Position.Top);
        expect(result.points.some((p) => p.y < 0)).toBe(true);
    });

    it('uses the target side for near-tie vertical reverse-edge bypasses', () => {
        const result = route({
            edgeId: 'reverse-vertical',
            isReverseEdge: true,
            layoutDirection: 'TB',
        }, {
            targetNode: { position: { x: 100, y: 300 } },
        });

        expect(result.error).toBeUndefined();
        expect(result.metadata?.strategy).toBe('Reverse U-Turn');
        expect(result.sourcePos).toBe(Position.Right);
        expect(result.targetPos).toBe(Position.Right);
        expect(result.points.some((p) => p.x > 180)).toBe(true);
    });

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
