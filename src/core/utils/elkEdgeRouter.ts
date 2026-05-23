/**
 * ELK Edge Router - 使用 ELK 算法进行边路由
 * 
 * 这是一个工业级的边路由解决方案，专注于：
 * - 正交边路由（只有水平和垂直线段）
 * - 障碍物避让（边不穿过节点）
 * - 边与边分离（避免重叠）
 * - 弯折最小化
 * - 智能端口分布（防止多条边汇聚成一点）
 */

import ELK, { type ElkNode, type ElkExtendedEdge, type ElkPort } from 'elkjs';
import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import { parseHandleDirection } from '../algorithms/simpleFallbackPath';

interface Point {
    x: number;
    y: number;
}

/**
 * 使用 ELK 算法路由边
 * 
 * 这个函数保持节点位置不变，只计算边的路径
 */
export async function routeEdgesWithELK(
    nodes: ReactFlowNode[],
    edges: Edge[],
    options: {
        direction?: 'TB' | 'LR' | 'BT' | 'RL';
        edgeNodeSpacing?: number;
        edgeEdgeSpacing?: number;
        bendMinimization?: boolean;
    } = {}
): Promise<Map<string, Point[]>> {
    const {
        direction = 'TB',
        edgeNodeSpacing = 20,
        edgeEdgeSpacing = 15,
        _bendMinimization = true
    } = options;

    const elk = new ELK();

    // 构建节点 ID 到节点信息的映射
    const nodeMap = new Map<string, ReactFlowNode>(nodes.map(n => [n.id, n]));

    // 计算节点的绝对位置（考虑父子嵌套）
    const getAbsolutePosition = (node: ReactFlowNode): { x: number; y: number } => {
        let x = (node.position as any)?.x ?? 0;
        let y = (node.position as any)?.y ?? 0;
        let current = node;
        let depth = 0;
        while (current.parentId && depth < 10) {
            const parent = nodeMap.get(current.parentId);
            if (!parent) break;
            x += (parent.position as any)?.x ?? 0;
            y += (parent.position as any)?.y ?? 0;
            current = parent;
            depth++;
        }
        return { x, y };
    };

    // 过滤出叶子节点（非容器节点）
    const CONTAINER_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
    const leafNodes = nodes.filter(n => !CONTAINER_TYPES.has(String(n.type || '')));

    // 构建节点的基本结构
    const elkNodes: ElkNode[] = leafNodes.map(n => {
        const pos = getAbsolutePosition(n);
        // [FIX] 忽略 React Flow 的 measured（异步填充，导致不稳定），只用 style
        const w = (n as any)?.style?.width ?? (n as any)?.width ?? 100;
        const h = (n as any)?.style?.height ?? (n as any)?.height ?? 50;

        return {
            id: n.id,
            x: pos.x,
            y: pos.y,
            width: w,
            height: h,
            ports: [], // 稍后填充端口
            // 固定节点位置 - 使用 INTERACTIVE 策略时这些值会被尊重
            layoutOptions: {
                'elk.position': `(${pos.x}, ${pos.y})`,
                'elk.nodeLabels.placement': 'INSIDE V_CENTER H_CENTER',
                'elk.portConstraints': 'FIXED_SIDE' // 关键：强制端口在指定边上
            }
        };
    });

    const elkNodeMap = new Map<string, ElkNode>(elkNodes.map(n => [n.id, n]));
    const elkEdges: ElkExtendedEdge[] = [];

    // 处理边和端口
    // 为每个边的连接创建专用的 ELK Port，并指定其所在方向
    edges.forEach(e => {
        if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) return;

        const sourceNode = elkNodeMap.get(e.source);
        const targetNode = elkNodeMap.get(e.target);

        if (!sourceNode || !targetNode) return;

        // 解析方向
        const sourceDir = parseHandleDirection(e.sourceHandle); // 'top' | 'bottom' | 'left' | 'right'
        const targetDir = parseHandleDirection(e.targetHandle);

        // 映射到 ELK 侧边常量
        const getElkSide = (dir: string) => {
            switch (dir) {
                case 'top': return 'NORTH';
                case 'bottom': return 'SOUTH';
                case 'left': return 'WEST';
                case 'right': return 'EAST';
                default: return 'EAST';
            }
        };

        // 创建源端口
        const sourcePortId = `p_${e.id}_s`;
        const sourcePort: ElkPort = {
            id: sourcePortId,
            layoutOptions: {
                'elk.port.side': getElkSide(sourceDir)
            }
        };
        sourceNode.ports = sourceNode.ports || [];
        sourceNode.ports.push(sourcePort);

        // 创建目标端口
        const targetPortId = `p_${e.id}_t`;
        const targetPort: ElkPort = {
            id: targetPortId,
            layoutOptions: {
                'elk.port.side': getElkSide(targetDir)
            }
        };
        targetNode.ports = targetNode.ports || [];
        targetNode.ports.push(targetPort);

        // 添加边连接端口
        elkEdges.push({
            id: e.id || `${e.source}->${e.target}`,
            sources: [sourcePortId],
            targets: [targetPortId],
            // 确保这些属性指向节点ID，这是ELK JSON格式的要求
            container: 'elk-edge-routing'
        } as any);
    });

    // 确定布局方向
    const elkDir = direction === 'LR' ? 'RIGHT' :
        direction === 'RL' ? 'LEFT' :
            direction === 'BT' ? 'UP' : 'DOWN';

    // 构建 ELK 图结构
    const graph: ElkNode = {
        id: 'elk-edge-routing',
        layoutOptions: {
            // 使用 layered 算法 - 它有最好的正交边路由支持
            'elk.algorithm': 'layered',

            // 边路由选项
            'elk.layered.edgeRouting': 'ORTHOGONAL',
            'elk.layered.mergeEdges': 'false', // 关闭合并，让每条线独立，视觉更清晰
            'elk.spacing.edgeNode': String(edgeNodeSpacing),
            'elk.spacing.edgeEdge': String(edgeEdgeSpacing),

            // 端口约束：关键配置
            // FIXED_ORDER: 保持端口顺序，减少交叉
            // FIXED_SIDE: 端口必须在指定边上 (我们在 node 级别设置了)
            // 'elk.portConstraints': 'FIXED_ORDER', 

            // 方向
            'elk.direction': elkDir,

            // 关键：告诉 ELK 节点位置是固定的
            'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
            'elk.layered.layering.strategy': 'INTERACTIVE',
            'elk.layered.crossingMinimization.strategy': 'INTERACTIVE',

            // 边风格
            'elk.edgeRouting.selfLoopRouting.strategy': 'NORTH',
        },
        children: elkNodes,
        edges: elkEdges.map(e => ({
            ...e,
            // 修正：ELK edge 定义需要直接指向端口ID，这里的 sources/targets 已经是端口ID了
            // container 属性不是必须的，但在某些类型定义中可能出现
        })),
    };

    try {
        const result = await elk.layout(graph);

        // 提取边路径
        const edgePaths = new Map<string, Point[]>();

        if (result.edges) {
            for (const edge of result.edges) {
                if (edge.sections && edge.sections.length > 0) {
                    const section = edge.sections[0];
                    const path: Point[] = [section.startPoint];

                    if (section.bendPoints) {
                        path.push(...section.bendPoints);
                    }

                    path.push(section.endPoint);
                    edgePaths.set(edge.id, path);
                }
            }
        }

        // 还要处理子节点内的边（如果有层级结构，ELK会返回嵌套的edges）
        // 目前我们是扁平化处理，只需检查顶层 result.edges
        // 如果未来支持嵌套布局，需要递归遍历

        return edgePaths;
    } catch (error) {
        console.error('[ELK Edge Router] Layout failed:', error);
        return new Map();
    }
}

/**
 * 将 ELK 计算的路径转换为 React Flow 边的 data.pathPoints
 */
export function applyElkRoutesToEdges<T extends Edge>(
    edges: T[],
    elkPaths: Map<string, Point[]>
): T[] {
    return edges.map(edge => {
        const path = elkPaths.get(edge.id || `${edge.source}->${edge.target}`);

        if (path && path.length >= 2) {
            return {
                ...edge,
                data: {
                    ...edge.data,
                    // 存储计算后的路径点
                    elkPath: path,
                    // 标记使用 ELK 路由
                    useElkRouting: true,
                }
            };
        }

        return edge;
    });
}

/**
 * 简化的一步调用：路由边并返回更新后的边数组
 */
export async function routeEdges(
    nodes: ReactFlowNode[],
    edges: Edge[],
    direction: 'TB' | 'LR' | 'BT' | 'RL' = 'TB'
): Promise<Edge[]> {
    const elkPaths = await routeEdgesWithELK(nodes, edges, { direction });
    return applyElkRoutesToEdges(edges, elkPaths);
}

export default routeEdgesWithELK;

