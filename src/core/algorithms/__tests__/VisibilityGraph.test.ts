import { describe, it, expect } from 'vitest';
import {
    buildVisibilityGraph,
    isVisible,
    addPointToGraph,
    aStarOnGraph,
    findPathOnVisibilityGraph,
    getGraphStats,
    VisibilityGraph
} from '../visibilityGraph';
import { Point, Rectangle, LineSegment } from '../geometryUtils';
import { SpatialIndex } from '../SpatialIndex';

// Mock SpatialIndex
class MockSpatialIndex {
    private queryCalled = false;
    private getAllCalled = false;

    constructor(public obstacles: Rectangle[]) {}

    getAll() {
        this.getAllCalled = true;
        return this.obstacles;
    }

    queryLine(_x1: number, _y1: number, _x2: number, _y2: number) {
        this.queryCalled = true;
        return this.obstacles;
    }

    query() {} // Dummy to satisfy isSpatialIndex function check

    resetFlags() {
        this.queryCalled = false;
        this.getAllCalled = false;
    }

    wasQueryCalled() {
        return this.queryCalled;
    }

    wasGetAllCalled() {
        return this.getAllCalled;
    }
}

describe('VisibilityGraph', () => {
    describe('isVisible', () => {
        it('should return true when there are no obstacles between two points', () => {
            const p1: Point = { x: 0, y: 0 };
            const p2: Point = { x: 10, y: 0 };
            expect(isVisible(p1, p2, [])).toBe(true);
        });

        it('should return false when blocked by an obstacle', () => {
            const p1: Point = { x: 0, y: 0 };
            const p2: Point = { x: 10, y: 0 };
            // 障碍物在 x=5 处切断 x=0 到 x=10 之间的线段
            const obstacles: Rectangle[] = [{ x: 4, y: -5, width: 2, height: 10 }];
            expect(isVisible(p1, p2, obstacles, 0)).toBe(false);
        });

        it('should allow path when endpoints are on the boundary of the same obstacle', () => {
            const obstacles: Rectangle[] = [{ x: 10, y: 10, width: 10, height: 10 }];
            // 端点都在 x=10, y=10 障碍物的边缘（展开容差为 0 且在同一边）
            const p1: Point = { x: 10, y: 10 };
            const p2: Point = { x: 20, y: 10 };
            expect(isVisible(p1, p2, obstacles, 0)).toBe(true);
        });

        it('should query SpatialIndex when obstacles is a SpatialIndex object', () => {
            const p1: Point = { x: 0, y: 0 };
            const p2: Point = { x: 10, y: 0 };
            const obstacles: Rectangle[] = [{ x: 4, y: -5, width: 2, height: 10 }];
            const spatialIndex = new MockSpatialIndex(obstacles);

            expect(isVisible(p1, p2, spatialIndex as unknown as SpatialIndex, 0)).toBe(false);
            expect(spatialIndex.wasQueryCalled()).toBe(true);
        });
    });

    describe('buildVisibilityGraph', () => {
        it('should extract corners correctly with default options', () => {
            const obstacles: Rectangle[] = [{ x: 10, y: 10, width: 10, height: 10 }];
            // 默认 useCornerPoints=true, useEdgeMidpoints=false, obstacleOffset=15
            // 展开后的矩形为: x=-5, y=-5, w=40, h=40
            // 四个角点为: (-5,-5), (35,-5), (35,35), (-5,35)
            const graph = buildVisibilityGraph(obstacles, { obstacleOffset: 15 });

            expect(graph.vertices).toHaveLength(4);
            expect(graph.vertices).toContainEqual({ x: -5, y: -5 });
            expect(graph.vertices).toContainEqual({ x: 35, y: -5 });
            expect(graph.vertices).toContainEqual({ x: 35, y: 35 });
            expect(graph.vertices).toContainEqual({ x: -5, y: 35 });
        });

        it('should support dynamic padding on obstacles', () => {
            const obstacles: Rectangle[] = [{ x: 10, y: 10, width: 10, height: 10, padding: 5 } as any];
            // 展开后的矩形（动态 padding=5）: x=5, y=5, w=20, h=20
            // 四个角点为: (5,5), (25,5), (25,25), (5,25)
            const graph = buildVisibilityGraph(obstacles);

            expect(graph.vertices).toHaveLength(4);
            expect(graph.vertices).toContainEqual({ x: 5, y: 5 });
            expect(graph.vertices).toContainEqual({ x: 25, y: 25 });
        });

        it('should extract midpoints when useEdgeMidpoints is true', () => {
            const obstacles: Rectangle[] = [{ x: 10, y: 10, width: 10, height: 10 }];
            // 仅使用 edgeMidpoints
            const graph = buildVisibilityGraph(obstacles, {
                useCornerPoints: false,
                useEdgeMidpoints: true,
                obstacleOffset: 5
            });

            expect(graph.vertices).toHaveLength(4); // 仅有四个中点
            // 展开后: x=5, y=5, w=20, h=20
            // 原矩形 x=10, y=10, w=10, h=10
            // 上中: { x: rect.x + w/2, y: expandedRect.y } = (15, 5)
            // 右中: { x: expandedRect.x + w, y: rect.y + h/2 } = (25, 15)
            // 下中: { x: rect.x + w/2, y: expandedRect.y + h } = (15, 25)
            // 左中: { x: expandedRect.x, y: rect.y + h/2 } = (5, 15)
            expect(graph.vertices).toContainEqual({ x: 15, y: 5 });
            expect(graph.vertices).toContainEqual({ x: 25, y: 15 });
            expect(graph.vertices).toContainEqual({ x: 15, y: 25 });
            expect(graph.vertices).toContainEqual({ x: 5, y: 15 });
        });

        it('should call getAll on SpatialIndex when passed as obstacles parameter', () => {
            const obstacles: Rectangle[] = [{ x: 10, y: 10, width: 10, height: 10 }];
            const spatialIndex = new MockSpatialIndex(obstacles);

            const graph = buildVisibilityGraph(spatialIndex as unknown as SpatialIndex);
            expect(spatialIndex.wasGetAllCalled()).toBe(true);
            expect(graph.vertices).toHaveLength(4);
        });
    });

    describe('addPointToGraph', () => {
        it('should add a point and connect it to all visible vertices', () => {
            // 图包含两个顶点 A(0, 0) 和 B(10, 0)，它们直接相连
            const graph: VisibilityGraph = {
                vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
                edges: new Map([[0, [1]], [1, [0]]]),
                edgeCosts: new Map([['0-1', 10], ['1-0', 10]]),
                vertexToObstacle: new Map()
            };

            const newPoint: Point = { x: 5, y: 0 };
            const index = addPointToGraph(graph, newPoint, []);

            expect(index).toBe(2);
            expect(graph.vertices).toHaveLength(3);
            expect(graph.vertices[2]).toEqual({ x: 5, y: 0 });

            // 应连向 0 和 1
            expect(graph.edges.get(2)).toContain(0);
            expect(graph.edges.get(2)).toContain(1);
            expect(graph.edges.get(0)).toContain(2);
            expect(graph.edges.get(1)).toContain(2);

            expect(graph.edgeCosts.get('2-0')).toBe(5);
            expect(graph.edgeCosts.get('2-1')).toBe(5);
        });
    });

    describe('aStarOnGraph', () => {
        it('should find the shortest path between start and end index', () => {
            // 构建一个简单的图:
            // 0: A(0,0)
            // 1: B(5,5)
            // 2: C(5,-5)
            // 3: D(10,0)
            // 边: 0-1 (cost 7.07), 0-2 (cost 7.07), 1-3 (cost 7.07), 2-3 (cost 7.07)
            const graph: VisibilityGraph = {
                vertices: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 5, y: -5 }, { x: 10, y: 0 }],
                edges: new Map([
                    [0, [1, 2]],
                    [1, [0, 3]],
                    [2, [0, 3]],
                    [3, [1, 2]]
                ]),
                edgeCosts: new Map([
                    ['0-1', 7.07], ['1-0', 7.07],
                    ['0-2', 7.07], ['2-0', 7.07],
                    ['1-3', 7.07], ['3-1', 7.07],
                    ['2-3', 7.07], ['3-2', 7.07]
                ]),
                vertexToObstacle: new Map()
            };

            const path = aStarOnGraph(graph, 0, 3);
            expect(path).not.toBeNull();
            // 可以是 [0, 1, 3] 或 [0, 2, 3] 都是等价最短路径
            expect(path).toHaveLength(3);
            expect(path![0]).toBe(0);
            expect(path![2]).toBe(3);
        });

        it('should return null when start or end index is out of bounds', () => {
            const graph: VisibilityGraph = {
                vertices: [{ x: 0, y: 0 }],
                edges: new Map([[0, []]]),
                edgeCosts: new Map(),
                vertexToObstacle: new Map()
            };

            expect(aStarOnGraph(graph, -1, 0)).toBeNull();
            expect(aStarOnGraph(graph, 0, 5)).toBeNull();
        });

        it('should return null when there is no path between start and end index', () => {
            // A(0,0) 和 B(10,0) 孤立
            const graph: VisibilityGraph = {
                vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
                edges: new Map([[0, []], [1, []]]),
                edgeCosts: new Map(),
                vertexToObstacle: new Map()
            };

            expect(aStarOnGraph(graph, 0, 1)).toBeNull();
        });

        it('should penalize paths crossing line obstacles', () => {
            // 0: A(0,0)
            // 1: B(10,0) ———— 直接相连
            // 2: C(5,10) ———— 绕远路
            // 边: 0-1 (cost 10), 0-2 (cost 11.18), 1-2 (cost 11.18)
            const graph: VisibilityGraph = {
                vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }],
                edges: new Map([
                    [0, [1, 2]],
                    [1, [0, 2]],
                    [2, [0, 1]]
                ]),
                edgeCosts: new Map([
                    ['0-1', 10], ['1-0', 10],
                    ['0-2', 11.18], ['2-0', 11.18],
                    ['1-2', 11.18], ['2-1', 11.18]
                ]),
                vertexToObstacle: new Map()
            };

            // 1. 无连线障碍，直接走直达 0-1
            expect(aStarOnGraph(graph, 0, 1)).toEqual([0, 1]);

            // 2. 提供阻断线段，使 0-1 必须跨过阻断线，承受 300 惩罚，使其选择绕道走 0-2-1 (成本约为 22.36)
            const lineObstacles: LineSegment[] = [
                { start: { x: 5, y: -5 }, end: { x: 5, y: 5 } } // 在 x=5 处阻碍
            ];
            expect(aStarOnGraph(graph, 0, 1, lineObstacles)).toEqual([0, 2, 1]);
        });
    });

    describe('findPathOnVisibilityGraph', () => {
        it('should optimize and return direct path when start and end are directly visible', () => {
            const start: Point = { x: 0, y: 0 };
            const end: Point = { x: 10, y: 0 };
            const path = findPathOnVisibilityGraph(start, end, []);

            expect(path).toEqual([start, end]);
        });

        it('should bypass obstacles and compute correct path when direct shot is blocked', () => {
            const start: Point = { x: -10, y: 0 };
            const end: Point = { x: 20, y: 0 };
            // 障碍物在 x=4, 阻断直接通路，且 padding 较小，起终点处于外部
            const obstacles: Rectangle[] = [{ x: 4, y: -2, width: 2, height: 4, padding: 1 } as any];
            const path = findPathOnVisibilityGraph(start, end, obstacles);

            expect(path).not.toBeNull();
            expect(path![0]).toEqual(start);
            expect(path![path!.length - 1]).toEqual(end);
            expect(path!.length).toBeGreaterThan(2); // 必定进行了绕障
        });

        it('should reuse prebuiltGraph and pathfind properly', () => {
            const start: Point = { x: 0, y: 0 };
            const end: Point = { x: 10, y: 0 };
            const obstacles: Rectangle[] = [{ x: 4, y: -5, width: 2, height: 10, padding: 2 } as any];

            const prebuilt = buildVisibilityGraph(obstacles, { obstacleOffset: 2 });
            const initialVertexCount = prebuilt.vertices.length;

            const path = findPathOnVisibilityGraph(start, end, obstacles, prebuilt);
            expect(path).not.toBeNull();
            expect(path![0]).toEqual(start);
            expect(path![path!.length - 1]).toEqual(end);

            // 预建图不应被修改 (addPointToGraph 对外部传入的图进行浅拷贝)
            expect(prebuilt.vertices).toHaveLength(initialVertexCount);
        });

        it('should return null when path is completely blocked and A* fails', () => {
            const start: Point = { x: 0, y: 0 };
            const end: Point = { x: 10, y: 0 };
            const obstacles: Rectangle[] = [{ x: 4, y: -8, width: 2, height: 16 } as any];
            
            // 预建图有两个顶点，但互相孤立，没有任何边
            const prebuilt: VisibilityGraph = {
                vertices: [{ x: 5, y: 5 }, { x: 5, y: -5 }],
                edges: new Map([[0, []], [1, []]]),
                edgeCosts: new Map(),
                vertexToObstacle: new Map()
            };

            const path = findPathOnVisibilityGraph(start, end, obstacles, prebuilt);
            expect(path).toBeNull();
        });
    });

    describe('getGraphStats', () => {
        it('should calculate statistics correctly', () => {
            // A (0, 0) <-> B (10, 0) <-> C (5, 5)
            // A 有 1 边; B 有 2 边; C 有 1 边
            // 顶点数: 3
            // 边数（无向）: 2
            // 平均度: 2 * 2 / 3 = 1.33
            // 最大度: 2 (B)
            const graph: VisibilityGraph = {
                vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }],
                edges: new Map([
                    [0, [1]],
                    [1, [0, 2]],
                    [2, [1]]
                ]),
                edgeCosts: new Map(),
                vertexToObstacle: new Map()
            };

            const stats = getGraphStats(graph);
            expect(stats.vertexCount).toBe(3);
            expect(stats.edgeCount).toBe(2);
            expect(stats.avgDegree).toBeCloseTo(1.33, 2);
            expect(stats.maxDegree).toBe(2);
        });

        it('should handle empty graph', () => {
            const graph: VisibilityGraph = {
                vertices: [],
                edges: new Map(),
                edgeCosts: new Map(),
                vertexToObstacle: new Map()
            };

            const stats = getGraphStats(graph);
            expect(stats.vertexCount).toBe(0);
            expect(stats.edgeCount).toBe(0);
            expect(stats.avgDegree).toBe(0);
            expect(stats.maxDegree).toBe(0);
        });
    });
});
