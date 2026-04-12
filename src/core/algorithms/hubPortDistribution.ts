/**
 * Hub 端口均匀分布
 * 
 * 对于连接数 ≥ threshold 的 Hub 节点，按 atan2 角度将连线分配到 4 个面（Top/Bottom/Left/Right）。
 * 
 * 移植自 DiagramView-SVG/routing/AdvancedRouting.ts → distributePortConnections
 */

import { Position } from '@xyflow/react';

export interface HubNodeInfo {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface HubEdgeInfo {
    edgeId: string;
    /** 此边相对 hub 节点的另一端 */
    otherNodeId: string;
    otherNodeCenterX: number;
    otherNodeCenterY: number;
    /** 此边在 hub 侧是 source 还是 target */
    role: 'source' | 'target';
}

/**
 * 根据角度将连线分配到 4 个面。
 * 
 * @param hub Hub 节点信息
 * @param edges 连接到该 Hub 的所有边
 * @returns Map<edgeId, Position> — 每条边在 hub 侧应使用的端口方向
 */
export function distributeHubPorts(
    hub: HubNodeInfo,
    edges: HubEdgeInfo[]
): Map<string, Position> {
    const result = new Map<string, Position>();
    if (edges.length === 0) return result;

    const hubCx = hub.x + hub.width / 2;
    const hubCy = hub.y + hub.height / 2;

    // 按角度排序
    const withAngle = edges.map(e => ({
        ...e,
        angle: Math.atan2(e.otherNodeCenterY - hubCy, e.otherNodeCenterX - hubCx),
    }));

    withAngle.sort((a, b) => a.angle - b.angle);

    // 按角度象限分配端口
    // atan2 返回 [-π, π]
    // Right: [-π/4, π/4)
    // Bottom: [π/4, 3π/4)
    // Left: [3π/4, π) ∪ [-π, -3π/4)
    // Top: [-3π/4, -π/4)
    for (const e of withAngle) {
        const a = e.angle;
        let pos: Position;

        if (a >= -Math.PI / 4 && a < Math.PI / 4) {
            pos = Position.Right;
        } else if (a >= Math.PI / 4 && a < (3 * Math.PI) / 4) {
            pos = Position.Bottom;
        } else if (a >= (-3 * Math.PI) / 4 && a < -Math.PI / 4) {
            pos = Position.Top;
        } else {
            pos = Position.Left;
        }

        result.set(e.edgeId, pos);
    }

    return result;
}

/**
 * 检测图中的 Hub 节点并返回端口分配结果。
 * 
 * Hub 节点：连接数 ≥ threshold 的节点。
 * 
 * @param nodeMap 所有节点的 Map<id, { x, y, width, height }>
 * @param edges 所有边 { id, source, target }[]
 * @param threshold Hub 连接数阈值（默认 3）
 * @returns Map<edgeId, { sourcePos?: Position, targetPos?: Position }>
 */
export function computeHubPortDistribution(
    nodeMap: Map<string, { x: number; y: number; width: number; height: number }>,
    edges: Array<{ id: string; source: string; target: string }>,
    threshold: number = 3
): Map<string, { sourceHubPos?: Position; targetHubPos?: Position }> {
    // 1. 统计各节点连接数
    const connectionCount = new Map<string, number>();
    for (const e of edges) {
        connectionCount.set(e.source, (connectionCount.get(e.source) || 0) + 1);
        connectionCount.set(e.target, (connectionCount.get(e.target) || 0) + 1);
    }

    // 2. 识别 Hub 节点
    const hubIds = new Set<string>();
    for (const [id, count] of connectionCount) {
        if (count >= threshold) {
            hubIds.add(id);
        }
    }

    if (hubIds.size === 0) {
        return new Map();
    }

    // 3. 为每个 Hub 节点计算端口分配
    const result = new Map<string, { sourceHubPos?: Position; targetHubPos?: Position }>();

    for (const hubId of hubIds) {
        const hub = nodeMap.get(hubId);
        if (!hub) continue;

        const hubInfo: HubNodeInfo = {
            id: hubId,
            x: hub.x,
            y: hub.y,
            width: hub.width,
            height: hub.height,
        };

        // 收集连接此 hub 的所有边
        const hubEdges: HubEdgeInfo[] = [];
        for (const e of edges) {
            if (e.source === hubId) {
                const other = nodeMap.get(e.target);
                if (other) {
                    hubEdges.push({
                        edgeId: e.id,
                        otherNodeId: e.target,
                        otherNodeCenterX: other.x + other.width / 2,
                        otherNodeCenterY: other.y + other.height / 2,
                        role: 'source',
                    });
                }
            }
            if (e.target === hubId) {
                const other = nodeMap.get(e.source);
                if (other) {
                    hubEdges.push({
                        edgeId: e.id,
                        otherNodeId: e.source,
                        otherNodeCenterX: other.x + other.width / 2,
                        otherNodeCenterY: other.y + other.height / 2,
                        role: 'target',
                    });
                }
            }
        }

        // 分配端口
        const portMap = distributeHubPorts(hubInfo, hubEdges);

        // 写入结果
        for (const [edgeId, pos] of portMap) {
            const entry = result.get(edgeId) || {};
            const edgeInfo = hubEdges.find(e => e.edgeId === edgeId);
            if (edgeInfo?.role === 'source') {
                entry.sourceHubPos = pos;
            } else {
                entry.targetHubPos = pos;
            }
            result.set(edgeId, entry);
        }
    }

    return result;
}
