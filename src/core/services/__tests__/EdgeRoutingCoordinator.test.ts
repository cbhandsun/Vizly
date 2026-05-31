import { describe, expect, it, vi } from 'vitest';
import { EdgeRoutingCoordinator } from '../EdgeRoutingCoordinator';
import { Position } from '../../types/routing';
import type { PathFindingJob, Rectangle } from '../../types/routing';

// Mock worker pools since these tests only cover synchronous coordinator partitioning logic.
vi.mock('../../workers/WorkerPool', () => {
    return {
        default: {
            getInstance: vi.fn(() => ({
                calculatePath: vi.fn(),
                markDirty: vi.fn(),
                terminate: vi.fn(),
            })),
        },
    };
});

vi.mock('../../workers/PathfindingWorkerPool', () => {
    return {
        PathfindingWorkerPool: vi.fn().mockImplementation(() => ({
            calculatePaths: vi.fn(),
            getStats: vi.fn(() => null),
            terminate: vi.fn(),
        })),
    };
});

describe('EdgeRoutingCoordinator: assignSameSidePortSeparation', () => {
    it('groups, geometrically sorts, and assigns non-overlapping port indices for same-side conflicts', () => {
        const coordinator = EdgeRoutingCoordinator.getInstance();

        const sRect: Rectangle = { x: 100, y: 100, width: 100, height: 100 };
        const tRectB: Rectangle = { x: 300, y: 500, width: 100, height: 100 }; // 偏右下方
        const tRectC: Rectangle = { x: -100, y: 500, width: 100, height: 100 }; // 偏左下方

        // 创建 3 个 Job 挂在源节点 (sRect) 的 bottom 侧
        const jobs: PathFindingJob[] = [
            {
                jobId: 'job1',
                edgeId: 'edge-to-B',
                source: 'A',
                target: 'B',
                sourceX: 150,
                sourceY: 200,
                targetX: 350,
                targetY: 500,
                sourceRect: sRect,
                targetRect: tRectB,
                isOneToMany: false,
                isManyToOne: false,
            },
            {
                jobId: 'job2',
                edgeId: 'edge-to-C',
                source: 'A',
                target: 'C',
                sourceX: 150,
                sourceY: 200,
                targetX: -50,
                targetY: 500,
                sourceRect: sRect,
                targetRect: tRectC,
                isOneToMany: false,
                isManyToOne: false,
            },
            {
                jobId: 'job3',
                edgeId: 'edge-back-from-B',
                source: 'B',
                target: 'A',
                sourceX: 350,
                sourceY: 500,
                targetX: 150,
                targetY: 200,
                sourceRect: tRectB, // 源为 B
                targetRect: sRect,  // 目标为 A (这也是 A 的底侧入边)
                isOneToMany: false,
                isManyToOne: false,
                bidirectionalChannel: 0,
                bidirectionalSpacing: 25,
            },
        ];

        const graph = {
            nodes: [
                { id: 'A', position: { x: sRect.x, y: sRect.y }, width: sRect.width, height: sRect.height },
                { id: 'B', position: { x: tRectB.x, y: tRectB.y }, width: tRectB.width, height: tRectB.height },
                { id: 'C', position: { x: tRectC.x, y: tRectC.y }, width: tRectC.width, height: tRectC.height },
            ],
        };

        // 强行调用私有方法
        (coordinator as any).assignSameSidePortSeparation(jobs, graph);

        // 预期结果：
        // 在节点 A 的 bottom 侧，两个同源出边先作为隐式 fan-out 共享一个出端槽，
        // 再和入边做 in/out zone 分离，避免同侧入边和出边混在一起。
        // out zone: edge-to-C + edge-to-B (index 0)
        // in zone : edge-back-from-B (index 1)

        const job1 = jobs.find(j => j.edgeId === 'edge-to-B')!;
        const job2 = jobs.find(j => j.edgeId === 'edge-to-C')!;
        const job3 = jobs.find(j => j.edgeId === 'edge-back-from-B')!;

        // 验证分配的端口 index 和 count
        // job2 (A -> C) 为出边，应该共享 A.bottom 的 fan-out 槽 index = 0，总数 2
        expect(job2.outgoingIndex).toBe(0);
        expect(job2.outgoingCount).toBe(2);

        // job3 (B -> A) 为入边，应该在 A.bottom 的 in-zone 占 index = 1，总数 2
        expect(job3.incomingIndex).toBe(1);
        expect(job3.incomingCount).toBe(2);

        // job1 (A -> B) 与 job2 同源，应该共享 A.bottom 的 fan-out 槽
        expect(job1.outgoingIndex).toBe(0);
        expect(job1.outgoingCount).toBe(2);

        // 因为被分配了同侧端口分离（outgoingCount/incomingCount = 3 > 1），
        // 它们在路径层面的双向偏移 bidirectionalChannel 应该被成功清除，以防双重偏移。
        expect(job3.bidirectionalChannel).toBeUndefined();
        expect(job3.bidirectionalSpacing).toBeUndefined();
    });

    it('keeps a same-target M2O fan-in on one shared incoming slot', () => {
        const coordinator = EdgeRoutingCoordinator.getInstance();

        const targetRect: Rectangle = { x: 400, y: 400, width: 140, height: 80 };
        const sourceRects: Record<string, Rectangle> = {
            A: { x: 120, y: 120, width: 120, height: 70 },
            B: { x: 400, y: 120, width: 120, height: 70 },
            C: { x: 680, y: 120, width: 120, height: 70 },
        };

        const jobs: PathFindingJob[] = Object.entries(sourceRects).map(([source, sourceRect], index) => ({
            jobId: `job-${source}`,
            edgeId: `edge-${source}`,
            source,
            target: 'WMS',
            sourceX: sourceRect.x + sourceRect.width / 2,
            sourceY: sourceRect.y + sourceRect.height,
            targetX: targetRect.x + targetRect.width / 2,
            targetY: targetRect.y,
            sourceRect,
            targetRect,
            isOneToMany: false,
            isManyToOne: true,
            incomingCount: 1,
            incomingIndex: 0,
            m2oTrunk: {
                source: { x: 470, y: 250 },
                target: { x: 470, y: 400 },
            },
            m2oTrunkPort: Position.Top,
            busTrunkSource: { x: 470, y: 250 },
            busTrunkTarget: { x: 470, y: 400 },
            busRoutingPlan: {
                busIndex: index,
                peerGroupKey: 'm2o:WMS:top',
                m2oPeerGroupKey: 'm2o:WMS:top',
                peerGroupSize: 3,
                peerGroupMembers: ['edge-A', 'edge-B', 'edge-C'],
                trunkPort: Position.Top,
                trunkPortTangent: 0,
                m2oTrunk: {
                    source: { x: 470, y: 250 },
                    target: { x: 470, y: 400 },
                },
                m2oTrunkPort: Position.Top,
                portFrozen: true,
            },
        }));

        const graph = {
            nodes: [
                ...Object.entries(sourceRects).map(([id, rect]) => ({
                    id,
                    position: { x: rect.x, y: rect.y },
                    width: rect.width,
                    height: rect.height,
                })),
                {
                    id: 'WMS',
                    position: { x: targetRect.x, y: targetRect.y },
                    width: targetRect.width,
                    height: targetRect.height,
                },
            ],
        };

        (coordinator as any).assignSameSidePortSeparation(jobs, graph);

        for (const job of jobs) {
            expect(job.incomingCount).toBe(1);
            expect(job.incomingIndex).toBe(0);
        }
    });

    it('treats unflagged same-target incoming edges on one side as an implicit shared trunk group', () => {
        const coordinator = EdgeRoutingCoordinator.getInstance();

        const targetRect: Rectangle = { x: 400, y: 400, width: 140, height: 80 };
        const sourceRects: Record<string, Rectangle> = {
            A: { x: 260, y: 120, width: 120, height: 70 },
            B: { x: 540, y: 120, width: 120, height: 70 },
        };

        const jobs: PathFindingJob[] = Object.entries(sourceRects).map(([source, sourceRect]) => ({
            jobId: `job-${source}`,
            edgeId: `edge-${source}`,
            source,
            target: 'WMS',
            sourceX: sourceRect.x + sourceRect.width / 2,
            sourceY: sourceRect.y + sourceRect.height,
            targetX: targetRect.x + targetRect.width / 2,
            targetY: targetRect.y,
            sourceRect,
            targetRect,
            isOneToMany: false,
            isManyToOne: false,
        }));

        const graph = {
            nodes: [
                ...Object.entries(sourceRects).map(([id, rect]) => ({
                    id,
                    position: { x: rect.x, y: rect.y },
                    width: rect.width,
                    height: rect.height,
                })),
                {
                    id: 'WMS',
                    position: { x: targetRect.x, y: targetRect.y },
                    width: targetRect.width,
                    height: targetRect.height,
                },
            ],
        };

        (coordinator as any).assignSameSidePortSeparation(jobs, graph);

        for (const job of jobs) {
            expect(job.incomingCount).toBe(1);
            expect(job.incomingIndex).toBe(0);
        }
    });
});
