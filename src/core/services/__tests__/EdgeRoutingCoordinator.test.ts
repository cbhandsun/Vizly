import { describe, expect, it, vi } from 'vitest';
import { EdgeRoutingCoordinator } from '../EdgeRoutingCoordinator';
import { Position } from '../../../types/routing';
import type { PathFindingJob } from '../../../types/routing';
import type { Rectangle } from '../../../algorithms/geometryUtils';

// Mock WorkerPool since we only test the coordinator's synchronous partitioning logic
vi.mock('../../WorkerPool', () => {
    return {
        WorkerPool: vi.fn().mockImplementation(() => ({
            calculatePath: vi.fn(),
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

        // 强行调用私有方法
        (coordinator as any).assignSameSidePortSeparation(jobs);

        // 预期结果：
        // 在节点 A 的 bottom 侧有三条边冲突：
        // 1. edge-to-C (对端 C.center.x = -50)
        // 2. edge-to-B (对端 B.center.x = 350)
        // 3. edge-back-from-B (对端 B.center.x = 350)
        // 根据 getOppositeCoord 排序，C 在最左侧，所以 edge-to-C (job2) 排在最前 (index = 0)。
        // edge-to-B (job1) 与 edge-back-from-B (job3) 对端都是 B，根据 edgeId 排序。
        // edge-back-from-B ('edge-back-from-B') 比 edge-to-B ('edge-to-B') 的 ASCII 值小，
        // 所以 edge-back-from-B (job3) 排在第二 (index = 1)，edge-to-B (job1) 排在最后 (index = 2)。

        const job1 = jobs.find(j => j.edgeId === 'edge-to-B')!;
        const job2 = jobs.find(j => j.edgeId === 'edge-to-C')!;
        const job3 = jobs.find(j => j.edgeId === 'edge-back-from-B')!;

        // 验证分配的端口 index 和 count
        // job2 (A -> C) 为出边，应该在 A.bottom 占 index = 0，总数 3
        expect(job2.outgoingIndex).toBe(0);
        expect(job2.outgoingCount).toBe(3);

        // job3 (B -> A) 为入边，应该在 A.bottom 占 index = 1，总数 3
        expect(job3.incomingIndex).toBe(1);
        expect(job3.incomingCount).toBe(3);

        // job1 (A -> B) 为出边，应该在 A.bottom 占 index = 2，总数 3
        expect(job1.outgoingIndex).toBe(2);
        expect(job1.outgoingCount).toBe(3);

        // 因为被分配了同侧端口分离（outgoingCount/incomingCount = 3 > 1），
        // 它们在路径层面的双向偏移 bidirectionalChannel 应该被成功清除，以防双重偏移。
        expect(job3.bidirectionalChannel).toBeUndefined();
        expect(job3.bidirectionalSpacing).toBeUndefined();
    });
});
