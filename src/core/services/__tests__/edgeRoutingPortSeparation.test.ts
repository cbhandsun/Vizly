import { describe, expect, it } from 'vitest';
import type {
    PathFindingJob,
    Rectangle,
    SharedGraphContext,
} from '../../types/routing';
import {
    assignSameSidePortSeparation,
    inferRoutingPortSide,
} from '../edgeRoutingPortSeparation';

const rect = (x: number, y: number, width = 100, height = 100): Rectangle => ({
    x,
    y,
    width,
    height,
});

const createJob = (
    edgeId: string,
    source: string,
    target: string,
    sourceRect: Rectangle,
    targetRect: Rectangle,
): PathFindingJob => ({
    jobId: `job-${edgeId}`,
    edgeId,
    source,
    target,
    sourceX: sourceRect.x + sourceRect.width / 2,
    sourceY: sourceRect.y + sourceRect.height / 2,
    targetX: targetRect.x + targetRect.width / 2,
    targetY: targetRect.y + targetRect.height / 2,
    sourceRect,
    targetRect,
    isOneToMany: false,
    isManyToOne: false,
});

describe('edgeRoutingPortSeparation', () => {
    it('infers deterministic source and target sides', () => {
        const source = rect(0, 0);

        expect(inferRoutingPortSide(source, rect(300, 0), 'source')).toBe('right');
        expect(inferRoutingPortSide(source, rect(300, 0), 'target')).toBe('left');
        expect(inferRoutingPortSide(source, rect(0, 300), 'source')).toBe('bottom');
        expect(inferRoutingPortSide(source, rect(0, 300), 'target')).toBe('top');
    });

    it('separates mixed same-side traffic and clears duplicate bidirectional offsets', () => {
        const hub = rect(100, 100);
        const lowerLeft = rect(-100, 500);
        const lowerRight = rect(300, 500);
        const jobs = [
            createJob('out-left', 'hub', 'left', hub, lowerLeft),
            createJob('out-right', 'hub', 'right', hub, lowerRight),
            {
                ...createJob('incoming', 'right', 'hub', lowerRight, hub),
                bidirectionalChannel: 1,
                bidirectionalSpacing: 24,
            },
        ];

        assignSameSidePortSeparation(jobs, { nodes: [] } as unknown as SharedGraphContext);

        expect(jobs[0].outgoingCount).toBe(2);
        expect(jobs[1].outgoingCount).toBe(2);
        expect(jobs[0].outgoingIndex).toBe(0);
        expect(jobs[1].outgoingIndex).toBe(0);
        expect(jobs[2].incomingCount).toBe(2);
        expect(jobs[2].incomingIndex).toBe(1);
        expect(jobs[2].bidirectionalChannel).toBeUndefined();
        expect(jobs[2].bidirectionalSpacing).toBeUndefined();
    });

    it('uses cached siblings without mutating their request jobs', () => {
        const hub = rect(100, 100);
        const lower = rect(100, 500);
        const current = createJob('current', 'hub', 'lower', hub, lower);
        const cachedJob = {
            source: 'lower',
            target: 'hub',
            isOneToMany: false,
            isManyToOne: false,
        };
        const cachedRequests = new Map([
            ['cached', { request: { job: cachedJob } }],
        ]);
        const graph = {
            nodes: [
                { id: 'hub', position: { x: 100, y: 100 }, width: 100, height: 100 },
                { id: 'lower', position: { x: 100, y: 500 }, width: 100, height: 100 },
            ],
        } as unknown as SharedGraphContext;

        assignSameSidePortSeparation([current], graph, cachedRequests);

        expect(current.outgoingCount).toBe(2);
        expect(current.outgoingIndex).toBe(0);
        expect(cachedJob).not.toHaveProperty('incomingCount');
        expect(cachedJob).not.toHaveProperty('incomingIndex');
    });

    it('terminates on cyclic parents and sanitizes invalid cached-node geometry', () => {
        const hub = rect(100, 100);
        const lower = rect(100, 500);
        const current = createJob('current', 'hub', 'lower', hub, lower);
        const cachedRequests = new Map([
            ['cached', {
                request: {
                    job: {
                        source: 'lower',
                        target: 'hub',
                        isOneToMany: false,
                        isManyToOne: false,
                    },
                },
            }],
        ]);
        const graph = {
            nodes: [
                {
                    id: 'hub',
                    parentId: 'lower',
                    position: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
                    width: -10,
                    height: Number.NaN,
                },
                {
                    id: 'lower',
                    parentId: 'hub',
                    position: { x: 100, y: 500 },
                    measured: { width: Number.POSITIVE_INFINITY, height: -20 },
                },
            ],
        } as unknown as SharedGraphContext;

        expect(() => assignSameSidePortSeparation(
            [current],
            graph,
            cachedRequests,
        )).not.toThrow();
        expect(Number.isFinite(current.outgoingIndex)).toBe(true);
        expect(Number.isFinite(current.outgoingCount)).toBe(true);
    });

    it('ignores empty and geometry-incomplete batches', () => {
        const incomplete = {
            ...createJob('incomplete', 'a', 'b', rect(0, 0), rect(200, 0)),
            targetRect: undefined,
        };

        assignSameSidePortSeparation([], { nodes: [] } as unknown as SharedGraphContext);
        assignSameSidePortSeparation(
            [incomplete],
            { nodes: [] } as unknown as SharedGraphContext,
        );

        expect(incomplete.outgoingCount).toBeUndefined();
        expect(incomplete.incomingCount).toBeUndefined();
    });
});
