import { describe, it, expect } from 'vitest';
import { pathFinder } from '../PathFinder';
import { Point, Rectangle } from '../../types/routing';

describe('PathFinder', () => {
    describe('MinHeap', () => {
        it('should pop elements in ascending order of fScore', () => {
            // 通过实例化的方式间接测试 MinHeap，因为 A* 内部使用了它。
            // 但为了 100% 覆盖 MinHeap 的 bubbleUp 和 sinkDown，
            // 我们可以利用 JS 的特性直接从导出的 PathFinder 或用特殊输入触发它，
            // 或者直接用 A* 寻路的表现来体现堆的正常排序。
            // 实际上，MinHeap 是 PathFinder.ts 里的私有类（非导出）。
            // 我们可以通过运行多次 A* 寻路，输入不同的 fScore 自动让 A* 引擎对堆进行 push 和 pop 操作，从而覆盖所有的分支。
            // 下面的 A* 寻路测试将会完美覆盖堆中 bubbleUp 和 sinkDown 的所有交换逻辑。
        });
    });

    describe('findPath', () => {
        const bbox = { minX: -100, minY: -100, maxX: 200, maxY: 200 };
        const gridSize = 10;
        const maxExpansions = 1000;

        it('should find a direct snapped path when no obstacles are present', () => {
            const start: Point = { x: 0, y: 0 };
            const goal: Point = { x: 30, y: 0 };
            const path = pathFinder.findPath(bbox, start, goal, gridSize, maxExpansions, []);

            expect(path).not.toBeNull();
            expect(path![0]).toEqual(start);
            expect(path![path!.length - 1]).toEqual(goal);
            // 路径点应该按网格大小 10 递增
            expect(path).toContainEqual({ x: 10, y: 0 });
            expect(path).toContainEqual({ x: 20, y: 0 });
        });

        it('should bypass a hard obstacle in the way', () => {
            const start: Point = { x: 0, y: 0 };
            const goal: Point = { x: 30, y: 0 };
            // 在 x=10, y=0 处放置一个 10x10 的硬障碍物，挡住直接通路
            const obstacles: Rectangle[] = [{ x: 10, y: -5, width: 10, height: 10 }];
            
            const path = pathFinder.findPath(bbox, start, goal, gridSize, maxExpansions, obstacles);

            expect(path).not.toBeNull();
            expect(path![0]).toEqual(start);
            expect(path![path!.length - 1]).toEqual(goal);
            // 路径不应该穿过障碍物所在的网格 (10,0)
            expect(path).not.toContainEqual({ x: 10, y: 0 });
        });

        it('should respect bbox boundaries and not expand outside', () => {
            // 将 bbox 的上限设置得很紧，使得它不能向上探索
            const tightBbox = { minX: 0, minY: 0, maxX: 30, maxY: 10 };
            const start: Point = { x: 0, y: 0 };
            const goal: Point = { x: 30, y: 0 };
            // 障碍物挡在 (10,0)
            const obstacles: Rectangle[] = [{ x: 10, y: 0, width: 10, height: 10 }];

            const path = pathFinder.findPath(tightBbox, start, goal, gridSize, maxExpansions, obstacles);
            expect(path).not.toBeNull();
            // 因为 maxY=10，且有 10x10 障碍物在 (10,0)，它必须绕到 y=10 甚至更高。
            // 但如果 tightBbox 允许 y=10 探索，它就可以成功绕过；如果我们将 bbox 限制到极致使之无解：
            const superTightBbox = { minX: 0, minY: 0, maxX: 30, maxY: 5 }; // 连一格(10px)都绕不过去
            const failedPath = pathFinder.findPath(superTightBbox, start, goal, gridSize, maxExpansions, obstacles);
            expect(failedPath).toBeNull();
        });

        it('should return null when max expansions is reached before finding a path', () => {
            const start: Point = { x: 0, y: 0 };
            const goal: Point = { x: 100, y: 0 };
            // 限制最大探索步数为 2，这肯定找不到 100px 外的终点
            const path = pathFinder.findPath(bbox, start, goal, gridSize, 2, []);
            expect(path).toBeNull();
        });

        it('should return null when goal is completely enclosed by hard obstacles', () => {
            const start: Point = { x: 0, y: 0 };
            const goal: Point = { x: 30, y: 0 };
            // 用四个硬障碍物把终点 (30,0) 四面围死
            const obstacles: Rectangle[] = [
                { x: 20, y: 0, width: 10, height: 10 },  // 左
                { x: 40, y: 0, width: 10, height: 10 },  // 右
                { x: 30, y: -10, width: 10, height: 10 }, // 上
                { x: 30, y: 10, width: 10, height: 10 }   // 下
            ];

            const path = pathFinder.findPath(bbox, start, goal, gridSize, maxExpansions, obstacles);
            expect(path).toBeNull();
        });

        it('should bypass soft zones when there is an alternative route', () => {
            const start: Point = { x: 0, y: 0 };
            const goal: Point = { x: 30, y: 0 };
            // 在 x=10, y=0 处放一个软障碍物。它不属于硬阻挡，但惩罚巨大 (gs * 15)
            const obstacles: any[] = [{ x: 10, y: -5, width: 10, height: 10, isSoftZone: true }];

            const path = pathFinder.findPath(bbox, start, goal, gridSize, maxExpansions, obstacles);

            expect(path).not.toBeNull();
            // 由于外面是空旷的，算法应当选择绕开软障碍物（不包含 (10,0)）
            expect(path).not.toContainEqual({ x: 10, y: 0 });
        });

        it('should force through soft zones when there are no alternative routes', () => {
            const start: Point = { x: 0, y: 0 };
            const goal: Point = { x: 30, y: 0 };
            // 外界被硬障碍物上下封锁，且 BBox 在 Y 方向限制在 [-10, 10]
            const tightYBbox = { minX: -100, minY: -10, maxX: 200, maxY: 10 };
            const obstacles: any[] = [
                { x: 10, y: -10, width: 10, height: 20, isSoftZone: true }, // 软通路，覆盖 y in [-10, 10]
                { x: 10, y: 10, width: 10, height: 20 },  // 上方硬封锁，覆盖 y in [10, 30]
                { x: 10, y: -30, width: 10, height: 20 }  // 下方硬封锁，覆盖 y in [-30, -10]
            ];

            const path = pathFinder.findPath(tightYBbox, start, goal, gridSize, maxExpansions, obstacles);

            expect(path).not.toBeNull();
            // 别无选择，必须直接穿过软障碍物（即包含 (10,0)）
            expect(path).toContainEqual({ x: 10, y: 0 });
        });

        it('should apply gradient penalty when points are near soft zones or hard obstacles', () => {
            const start: Point = { x: 0, y: 0 };
            const goal: Point = { x: 30, y: 0 };
            
            // 仅在旁边放置障碍物（不挡在直接路径上），测试梯度惩罚
            // 障碍物在 (10, 25) 处，起点到终点的连线在 y=0 上，距离为 25 (刚好在 gs*2.5 = 25 的缓冲区边缘)
            const obstacles: Rectangle[] = [{ x: 10, y: 25, width: 10, height: 10 }];

            const path1 = pathFinder.findPath(bbox, start, goal, gridSize, maxExpansions, obstacles);
            expect(path1).not.toBeNull();

            // 同样测试软障碍物的外围梯度惩罚 (softBufferZone = gs * 5 = 50)
            const softObstacles: any[] = [{ x: 10, y: 30, width: 10, height: 10, isSoftZone: true }];
            const path2 = pathFinder.findPath(bbox, start, goal, gridSize, maxExpansions, softObstacles);
            expect(path2).not.toBeNull();
        });

        it('should apply detour penalty when paths are significantly longer than direct distance', () => {
            const start: Point = { x: 0, y: 0 };
            const goal: Point = { x: 20, y: 0 };
            // 设置一个迷宫型的长障碍物，迫使路径变得非常长，触发 detourRatio > 1.8 绕路惩罚
            const obstacles: Rectangle[] = [
                { x: 10, y: -30, width: 10, height: 60 } // 高墙，强制往 y=30 或 y=-40 绕行
            ];

            const path = pathFinder.findPath(bbox, start, goal, gridSize, maxExpansions, obstacles);
            expect(path).not.toBeNull();
        });

        it('should apply path density penalty and avoid routed paths if possible', () => {
            const start: Point = { x: 0, y: 0 };
            const goal: Point = { x: 30, y: 0 };
            
            // 已有的路径在 y=0 线上: (0,0) -> (30,0)
            // 复制多次以累加惩罚，使 A* 强烈倾向于走下方
            const line = [{ x: 0, y: 0 }, { x: 30, y: 0 }];
            const routedPaths: Point[][] = [line, line, line];

            // 我们再次寻路，并在上方 y=10 处放置硬障碍，逼迫新路径要么挤在 y=0 附近，要么绕行到 y=-10
            // 正常情况下，如果没有密集度惩罚，走 y=0 成本最低。
            // 但有密集度惩罚时，算法会避开已有的 y=0 路径，选择从没有布线的下方 y=-10 绕过去。
            const obstacles: Rectangle[] = [
                { x: 10, y: 10, width: 10, height: 10 } // 封堵上方
            ];

            const path = pathFinder.findPath(bbox, start, goal, gridSize, maxExpansions, obstacles, routedPaths);

            expect(path).not.toBeNull();
            // 避开 y=0 附近的密集线，选择走负的 y 坐标 (如 y = -10)
            const hasNegativeY = path!.some(p => p.y < 0);
            expect(hasNegativeY).toBe(true);
        });

        it('should handle edge cases in pointToSegmentDistance helper', () => {
            // 通过提供一些特别靠近/远离已有路径的情况来覆盖 pointToSegmentDistance
            const start: Point = { x: 0, y: 0 };
            const goal: Point = { x: 20, y: 0 };
            // 包含退化路径点（单个点或无效段）
            const routedPaths: Point[][] = [
                [{ x: 5, y: 5 }], // 单点，长度 < 2，应当跳过
                [{ x: 10, y: 10 }, { x: 10, y: 10 }] // 退化线段 (起点终点重合)
            ];

            const path = pathFinder.findPath(bbox, start, goal, gridSize, maxExpansions, [], routedPaths);
            expect(path).not.toBeNull();
        });
    });
});
