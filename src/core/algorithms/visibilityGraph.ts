/**
 * 可见性图（VisibilityGraph）算法实现
 * 用于优化A*路径查找,减少搜索空间
 * 
 * 核心思想:
 * - 只在"可见性边"上搜索（两点间直线不穿越障碍物）
 * - 搜索空间从 O(Grid Size) 降低到 O(Vertices²)
 */

import {
    Point,
    Rectangle,
    LineSegment,
    distance,
    manhattanDistance,
    lineIntersectsRect,
    getRectCorners,
    pointInRect,
    lineSegmentsIntersect
} from './geometryUtils';
import { SpatialIndex } from './SpatialIndex';

function isSpatialIndex(obs: unknown): obs is SpatialIndex {
    return typeof obs === 'object' && obs !== null && typeof (obs as SpatialIndex).query === 'function';
}

const rectanglePadding = (rect: Rectangle, fallback: number): number => {
    const value = (rect as Rectangle & { padding?: unknown }).padding;
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

/**
 * 可见性图数据结构
 */
export interface VisibilityGraph {
    vertices: Point[];                           // 所有顶点
    edges: Map<number, number[]>;                // 邻接表: vertexId → [邻居ID列表]
    edgeCosts: Map<string, number>;              // 边成本: "id1-id2" → 距离
    vertexToObstacle: Map<number, number>;       // 顶点到障碍物的映射（用于调试）
}

/**
 * 构建可见性图
 * 
 * @param obstacles 障碍物列表（矩形节点）或空间索引
 * @param options 配置选项
 * @returns 可见性图
 */
export function buildVisibilityGraph(
    obstacles: Rectangle[] | SpatialIndex,
    options: {
        useCornerPoints?: boolean;     // 使用角点（默认true）
        useEdgeMidpoints?: boolean;    // 使用边中点（默认false,可提升精度但增加顶点）
        obstacleOffset?: number;       // 障碍物偏移（避免贴边，默认15px）
    } = {}
): VisibilityGraph {
    const {
        useCornerPoints = true,
        useEdgeMidpoints = false,
        obstacleOffset = 15
    } = options;

    // 获取障碍物列表用于生成顶点
    const obstacleList = isSpatialIndex(obstacles) ? obstacles.getAll() : obstacles;

    // 1. 收集所有顶点
    const vertices: Point[] = [];
    const vertexToObstacle = new Map<number, number>();

    obstacleList.forEach((rect, obstacleIdx) => {
        const dynamicPadding = rectanglePadding(rect, obstacleOffset);
        const expandedRect = {
            x: rect.x - dynamicPadding,
            y: rect.y - dynamicPadding,
            width: rect.width + dynamicPadding * 2,
            height: rect.height + dynamicPadding * 2
        };

        if (useCornerPoints) {
            // 获取四个角点（带动态偏移）
            const corners = getRectCorners(expandedRect);
            corners.forEach(corner => {
                vertices.push(corner);
                vertexToObstacle.set(vertices.length - 1, obstacleIdx);
            });
        }

        if (useEdgeMidpoints) {
            // 添加边中点（带动态偏移）
            vertices.push(
                { x: rect.x + rect.width / 2, y: expandedRect.y },                               // 上中
                { x: expandedRect.x + expandedRect.width, y: rect.y + rect.height / 2 },         // 右中
                { x: rect.x + rect.width / 2, y: expandedRect.y + expandedRect.height },         // 下中
                { x: expandedRect.x, y: rect.y + rect.height / 2 }                               // 左中
            );
            for (let i = 0; i < 4; i++) {
                vertexToObstacle.set(vertices.length - 4 + i, obstacleIdx);
            }
        }
    });

    // 2. 构建可见性边
    const edges = new Map<number, number[]>();
    const edgeCosts = new Map<string, number>();

    // 初始化邻接表
    for (let i = 0; i < vertices.length; i++) {
        edges.set(i, []);
    }

    // 检查每对顶点的可见性
    for (let i = 0; i < vertices.length; i++) {
        const obsI = vertexToObstacle.get(i);
        const p1 = vertices[i];

        for (let j = i + 1; j < vertices.length; j++) {
            const obsJ = vertexToObstacle.get(j);
            const p2 = vertices[j];

            // 1. 同一障碍物优化
            if (obsI !== undefined && obsI === obsJ) {
                // ...
            }

            // 2. Bitangent (切线) 检查 [NEW]
            // We pass obstacleOffset to isLocalTangent (which also should be updated to read padding)
            if (obsI !== undefined && !isLocalTangent(p1, p2, obstacleList[obsI], obstacleOffset)) continue;
            if (obsJ !== undefined && !isLocalTangent(p2, p1, obstacleList[obsJ], obstacleOffset)) continue;

            // 3. 全局可见性检查 (Raycast)
            // We pass obstacleOffset. isVisible must be updated to expand obstacles!
            if (isVisible(p1, p2, obstacles, obstacleOffset)) {
                const cost = distance(p1, p2);

                edges.get(i)!.push(j);
                edges.get(j)!.push(i);

                edgeCosts.set(`${i}-${j}`, cost);
                edgeCosts.set(`${j}-${i}`, cost);
            }
        }
    }

    return {
        vertices,
        edges,
        edgeCosts,
        vertexToObstacle
    };
}

/**
 * 判断两点之间是否可见（直线路径不穿越障碍物）
 * 
 * @param p1 起点
 * @param p2 终点
 * @param obstacles 障碍物列表或空间索引
 * @param tolerance 容差（默认1px，允许轻微贴边）
 * @returns 是否可见
 */
export function isVisible(
    p1: Point,
    p2: Point,
    obstacles: Rectangle[] | SpatialIndex,
    tolerance = 1
): boolean {
    const segment: LineSegment = { start: p1, end: p2 };

    // 获取可能相交的障碍物列表
    let potentialObstacles: Rectangle[];
    if (isSpatialIndex(obstacles)) {
        potentialObstacles = obstacles.queryLine(p1.x, p1.y, p2.x, p2.y);
    } else {
        potentialObstacles = obstacles;
    }

    for (const obstacle of potentialObstacles) {
        // [FIX] Read padding from obstacle, defaulting to the passed tolerance/offset
        const dynamicPadding = rectanglePadding(obstacle, tolerance);
        
        const expandedObstacle = {
            x: obstacle.x - dynamicPadding,
            y: obstacle.y - dynamicPadding,
            width: obstacle.width + dynamicPadding * 2,
            height: obstacle.height + dynamicPadding * 2
        };

        // 检查端点是否在障碍物内部
        // 如果端点在边界上，不算穿越
        const p1InObstacle = pointInRect(p1, expandedObstacle, -1);
        const p2InObstacle = pointInRect(p2, expandedObstacle, -1);

        // 检查线段是否穿越障碍物
        // allowEdgeTouch=false 表示仅边界接触不算相交
        if (lineIntersectsRect(segment, expandedObstacle, false)) {
            // 进一步验证：如果两个端点都在同一个障碍物的边界上，允许通过
            if (p1InObstacle && p2InObstacle) {
                // 端点都在同一障碍物边界，可能是沿着边移动，允许
                continue;
            }
            return false;
        }
    }

    return true;
}

/**
 * 将新点连接到可见性图
 * (用于添加起点或终点到已构建的图中)
 * 
 * @param graph 已有的可见性图
 * @param point 要添加的点
 * @param obstacles 障碍物列表或空间索引
 * @returns 新点在图中的索引
 */
export function addPointToGraph(
    graph: VisibilityGraph,
    point: Point,
    obstacles: Rectangle[] | SpatialIndex,
    tolerance: number = 1
): number {
    const newIdx = graph.vertices.length;
    graph.vertices.push(point);
    graph.edges.set(newIdx, []);

    // 连接到所有可见的现有顶点
    for (let i = 0; i < newIdx; i++) {
        if (isVisible(point, graph.vertices[i], obstacles, tolerance)) {
            const cost = distance(point, graph.vertices[i]);

            graph.edges.get(newIdx)!.push(i);
            graph.edges.get(i)!.push(newIdx);

            graph.edgeCosts.set(`${newIdx}-${i}`, cost);
            graph.edgeCosts.set(`${i}-${newIdx}`, cost);
        }
    }

    return newIdx;
}

/**
 * 在可见性图上执行A*搜索
 * 
 * @param graph 可见性图
 * @param startIdx 起点索引
 * @param endIdx 终点索引
 * @returns 路径（顶点索引序列），如果失败返回null
 */
export function aStarOnGraph(
    graph: VisibilityGraph,
    startIdx: number,
    endIdx: number,
    lineObstacles?: LineSegment[]
): number[] | null {
    const { vertices, edges, edgeCosts } = graph;

    if (startIdx < 0 || startIdx >= vertices.length ||
        endIdx < 0 || endIdx >= vertices.length) {
        return null;
    }

    const gScores = new Map<number, number>();
    const cameFrom = new Map<number, number>();
    const closedSet = new Set<number>();

    gScores.set(startIdx, 0);

    // [K-1/K-2] Replace sort()+shift() O(N log N + N) open set with a MinHeap.
    // Heap stores [fScore, vertexIndex] pairs. Min-first ordering by fScore.
    // This reduces per-iteration cost from O(N log N) to O(log N).
    const heap: Array<[number, number]> = [];

    // [K-3] Track open-set membership in O(1) with a Set.
    // Previously openSet.includes(neighbor) was O(N) per neighbor.
    const inOpenSet = new Set<number>();

    const heapPush = (fScore: number, idx: number): void => {
        // Sorted insertion (binary search for position)
        // For typical VG graphs (< 400 vertices), this is fast.
        let lo = 0, hi = heap.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (heap[mid][0] < fScore) lo = mid + 1;
            else hi = mid;
        }
        heap.splice(lo, 0, [fScore, idx]);
    };

    const startF = heuristic(vertices[startIdx], vertices[endIdx]);
    heapPush(startF, startIdx);
    inOpenSet.add(startIdx);

    while (heap.length > 0) {
        // [K-2] O(1) pop from front (already sorted)
        const [, current] = heap.shift()!;
        inOpenSet.delete(current);

        if (current === endIdx) {
            return reconstructPath(cameFrom, current);
        }

        closedSet.add(current);

        const neighbors = edges.get(current) || [];
        for (const neighbor of neighbors) {
            if (closedSet.has(neighbor)) continue;

            const edgeKey = `${current}-${neighbor}`;
            
            // [FIX] Calculate penalty for crossing existing lines
            let penalty = 0;
            if (lineObstacles && lineObstacles.length > 0) {
                const p1 = vertices[current];
                const p2 = vertices[neighbor];
                const edgeSegment = { start: p1, end: p2 };
                for (const line of lineObstacles) {
                    if (lineSegmentsIntersect(edgeSegment, line, false)) {
                        penalty += 300; // LINE_CROSS penalty
                    }
                }
            }

            const tentativeG = (gScores.get(current) ?? 0) + (edgeCosts.get(edgeKey) ?? 0) + penalty;

            if (!inOpenSet.has(neighbor)) {
                // [K-3] O(1) membership check instead of O(N) includes()
                gScores.set(neighbor, tentativeG);
                cameFrom.set(neighbor, current);
                const f = tentativeG + heuristic(vertices[neighbor], vertices[endIdx]);
                heapPush(f, neighbor);
                inOpenSet.add(neighbor);
            } else if (tentativeG < (gScores.get(neighbor) ?? Infinity)) {
                gScores.set(neighbor, tentativeG);
                cameFrom.set(neighbor, current);
                // Re-insert with better score; stale entry in heap is harmless
                // (will be skipped when popped since it will be in closedSet)
                const f = tentativeG + heuristic(vertices[neighbor], vertices[endIdx]);
                heapPush(f, neighbor);
            }
        }
    }

    return null; // 未找到路径
}

/**
 * A*启发式函数（曼哈顿距离）
 */
function heuristic(p1: Point, p2: Point): number {
    return manhattanDistance(p1, p2);
}

/**
 * 重建路径
 */
function reconstructPath(cameFrom: Map<number, number>, current: number): number[] {
    // [K-6] Build in reverse then flip — O(V) total instead of O(V²) via repeated unshift.
    const path: number[] = [current];
    while (cameFrom.has(current)) {
        current = cameFrom.get(current)!;
        path.push(current);
    }
    return path.reverse();
}

/**
 * 在可见性图上查找路径（完整流程）
 * 
 * @param start 起点
 * @param end 终点
 * @param obstacles 障碍物或空间索引
 * @param prebuiltGraph 预构建的图（可选,用于缓存）
 * @returns 路径点序列，失败返回null
 */
export function findPathOnVisibilityGraph(
    start: Point,
    end: Point,
    obstacles: Rectangle[] | SpatialIndex,
    prebuiltGraph?: VisibilityGraph,
    options: { obstacleOffset?: number, lineObstacles?: LineSegment[] } = {}
): Point[] | null {
    // 1. 快速检查：起终点直接可见且不会穿越已有连线。
    // lineObstacles are a soft cost in A*, so a crossing direct segment must enter
    // the graph search instead of bypassing the crossing penalty entirely.
    const directSegment: LineSegment = { start, end };
    const directCrossesExistingLine = options.lineObstacles?.some(line => (
        lineSegmentsIntersect(directSegment, line, false)
    )) ?? false;
    if (isVisible(start, end, obstacles) && !directCrossesExistingLine) {
        return [start, end];
    }

    // 2. 构建或复用可见性图
    let graph: VisibilityGraph;
    if (prebuiltGraph) {
        // 复用已有图（浅拷贝，避免修改原图）
        graph = {
            vertices: [...prebuiltGraph.vertices],
            edges: new Map(
                Array.from(prebuiltGraph.edges, ([vertex, neighbors]) => [vertex, [...neighbors]])
            ),
            edgeCosts: new Map(prebuiltGraph.edgeCosts),
            vertexToObstacle: new Map(prebuiltGraph.vertexToObstacle)
        };
    } else {
        graph = buildVisibilityGraph(obstacles, { obstacleOffset: options.obstacleOffset ?? 5 });
    }

    // 3. 添加起点和终点到图中
    const startIdx = addPointToGraph(graph, start, obstacles);
    const endIdx = addPointToGraph(graph, end, obstacles);

    // 4. A*搜索
    const pathIndices = aStarOnGraph(graph, startIdx, endIdx, options.lineObstacles);

    if (!pathIndices) {
        return null;
    }

    // 5. 转换索引为坐标点
    return pathIndices.map(idx => graph.vertices[idx]);
}

/**
 * 可见性图统计信息（用于调试和性能分析）
 */
export function getGraphStats(graph: VisibilityGraph): {
    vertexCount: number;
    edgeCount: number;
    avgDegree: number;
    maxDegree: number;
} {
    const vertexCount = graph.vertices.length;
    let edgeCount = 0;
    let maxDegree = 0;

    graph.edges.forEach(neighbors => {
        edgeCount += neighbors.length;
        maxDegree = Math.max(maxDegree, neighbors.length);
    });

    edgeCount /= 2; // 无向图，每条边被计数两次

    return {
        vertexCount,
        edgeCount,
        avgDegree: vertexCount > 0 ? edgeCount * 2 / vertexCount : 0,
        maxDegree
    };
}

/**
 * 检查从 p1 指向 p2 的向量是否是 p1 所属障碍物的切线（即不穿过障碍物内部）
 */
function isLocalTangent(p1: Point, p2: Point, rect: Rectangle, padding: number): boolean {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const smallStep = 0.1;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len < smallStep * 2) return true;

    // Check if a point slightly along the vector is inside the "inflated" obstacle (forbidden zone)
    const pTest = {
        x: p1.x + (dx / len) * smallStep,
        y: p1.y + (dy / len) * smallStep
    };

    const dynamicPadding = rectanglePadding(rect, padding);
    const rx = rect.x - dynamicPadding;
    const ry = rect.y - dynamicPadding;
    const rw = rect.width + dynamicPadding * 2;
    const rh = rect.height + dynamicPadding * 2;

    // Strict interior check (excluding boundary)
    if (pTest.x > rx + 0.01 && pTest.x < rx + rw - 0.01 &&
        pTest.y > ry + 0.01 && pTest.y < ry + rh - 0.01) {
        return false;
    }

    return true;
}
