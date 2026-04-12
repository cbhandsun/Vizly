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
    pointInRect
} from './geometryUtils';
import { SpatialIndex } from './SpatialIndex';

function isSpatialIndex(obs: any): obs is SpatialIndex {
    return obs && typeof (obs as SpatialIndex).query === 'function';
}

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
        obstacleOffset?: number;       // 障碍物偏移（避免贴边，默认5px）
    } = {}
): VisibilityGraph {
    const {
        useCornerPoints = true,
        useEdgeMidpoints = false,
        obstacleOffset = 5
    } = options;

    // 获取障碍物列表用于生成顶点
    const obstacleList = isSpatialIndex(obstacles) ? obstacles.getAll() : obstacles;

    // 1. 收集所有顶点
    const vertices: Point[] = [];
    const vertexToObstacle = new Map<number, number>();

    obstacleList.forEach((rect, obstacleIdx) => {
        if (useCornerPoints) {
            // 获取四个角点（带偏移）
            const corners = getRectCorners(rect);
            corners.forEach(corner => {
                vertices.push(corner);
                vertexToObstacle.set(vertices.length - 1, obstacleIdx);
            });
        }

        if (useEdgeMidpoints) {
            // 添加边中点（可选）
            vertices.push(
                { x: rect.x + rect.width / 2, y: rect.y - obstacleOffset },             // 上中
                { x: rect.x + rect.width + obstacleOffset, y: rect.y + rect.height / 2 }, // 右中
                { x: rect.x + rect.width / 2, y: rect.y + rect.height + obstacleOffset }, // 下中
                { x: rect.x - obstacleOffset, y: rect.y + rect.height / 2 }               // 左中
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
                // 对于同一障碍物，只连接相邻的角点
                // 这里假设vertices按顺时针或逆时针存储。
                // 如果没有确定的顺序，这个优化很难做。
                // 保守起见: 总是允许同一障碍物上的连接（构成凸包），或者相信isBitangent检查。
                // 简单的Reduced VG逻辑通常忽略同一障碍物的非相邻边（对角线），除非它们构成了凸包边界。
                // 但为了简单和正确性，我们先保留内部可见性检查。
                // 更好的优化：如果是在障碍物"内部"穿过，则不可见。
            }

            // 2. Bitangent (切线) 检查 [NEW]
            // 如果连线穿过了 p1 所属障碍物的"内部"，或者 p2 所属障碍物的"内部"，则不是切线边。
            // 这极大地减少了无用边。
            // 只有当不仅可见，而且是"切线"时才连接。

            // 如何检查？
            // 简单方法：将连线向障碍物内部微推一点，如果相交，则不是切线。
            // 或者，检查连线角度是否在该顶点的"可行角扇区"内。

            // 在这里，我们将使用一个简化的几何检查：
            // 如果 p1 是某矩形的一个角，p1->p2 向量必须在该角的"外侧"。

            if (obsI !== undefined && !isLocalTangent(p1, p2, obstacleList[obsI], obstacleOffset)) continue;
            if (obsJ !== undefined && !isLocalTangent(p2, p1, obstacleList[obsJ], obstacleOffset)) continue;

            // 3. 全局可见性检查 (Raycast)
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
        // 检查端点是否在障碍物内部
        // 如果端点在边界上，不算穿越
        const p1InObstacle = pointInRect(p1, obstacle, -tolerance);
        const p2InObstacle = pointInRect(p2, obstacle, -tolerance);

        // 检查线段是否穿越障碍物
        // allowEdgeTouch=false 表示仅边界接触不算相交
        if (lineIntersectsRect(segment, obstacle, false)) {
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
    endIdx: number
): number[] | null {
    const { vertices, edges, edgeCosts } = graph;

    if (startIdx < 0 || startIdx >= vertices.length ||
        endIdx < 0 || endIdx >= vertices.length) {
        return null;
    }

    // 初始化
    const gScores = new Map<number, number>();
    const fScores = new Map<number, number>();
    const cameFrom = new Map<number, number>();
    const closedSet = new Set<number>();

    gScores.set(startIdx, 0);
    fScores.set(endIdx, heuristic(vertices[startIdx], vertices[endIdx]));

    // 优先队列（简化版，使用数组+排序）
    const openSet: number[] = [startIdx];

    while (openSet.length > 0) {
        // 找到f值最小的节点
        openSet.sort((a, b) => (fScores.get(a) || Infinity) - (fScores.get(b) || Infinity));
        const current = openSet.shift()!;

        // 找到目标
        if (current === endIdx) {
            return reconstructPath(cameFrom, current);
        }

        closedSet.add(current);

        // 遍历邻居
        const neighbors = edges.get(current) || [];
        for (const neighbor of neighbors) {
            if (closedSet.has(neighbor)) continue;

            const edgeKey = `${current}-${neighbor}`;
            const tentativeG = (gScores.get(current) || 0) + (edgeCosts.get(edgeKey) || 0);

            if (!openSet.includes(neighbor)) {
                openSet.push(neighbor);
            } else if (tentativeG >= (gScores.get(neighbor) || Infinity)) {
                continue;
            }

            // 更新路径
            cameFrom.set(neighbor, current);
            gScores.set(neighbor, tentativeG);
            fScores.set(neighbor, tentativeG + heuristic(vertices[neighbor], vertices[endIdx]));
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
    const path: number[] = [current];
    while (cameFrom.has(current)) {
        current = cameFrom.get(current)!;
        path.unshift(current);
    }
    return path;
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
    options: { obstacleOffset?: number } = {}
): Point[] | null {
    // 1. 快速检查：起终点直接可见
    if (isVisible(start, end, obstacles)) {
        return [start, end];
    }

    // 2. 构建或复用可见性图
    let graph: VisibilityGraph;
    if (prebuiltGraph) {
        // 复用已有图（浅拷贝，避免修改原图）
        graph = {
            vertices: [...prebuiltGraph.vertices],
            edges: new Map(prebuiltGraph.edges),
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
    const pathIndices = aStarOnGraph(graph, startIdx, endIdx);

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

    const rx = rect.x - padding;
    const ry = rect.y - padding;
    const rw = rect.width + padding * 2;
    const rh = rect.height + padding * 2;

    // Strict interior check (excluding boundary)
    if (pTest.x > rx + 0.01 && pTest.x < rx + rw - 0.01 &&
        pTest.y > ry + 0.01 && pTest.y < ry + rh - 0.01) {
        return false;
    }

    return true;
}
