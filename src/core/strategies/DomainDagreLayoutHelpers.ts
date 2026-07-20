import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import dagre from 'dagre';

const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 80;
const MAX_NODE_DIMENSION = 100_000;
const MAX_COORDINATE = 1_000_000;

type NodeDimensions = { width: number; height: number };
type NodeDimensionsResolver = (node: ReactFlowNode) => NodeDimensions;

const boundedFinite = (value: unknown, fallback: number, min: number, max: number): number => (
    typeof value === 'number' && Number.isFinite(value) && value >= min
        ? Math.min(value, max)
        : fallback
);

const firstValidDimension = (values: unknown[], fallback: number): number => {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return Math.min(value, MAX_NODE_DIMENSION);
        }
    }
    return fallback;
};

const resolveDimensions = (
    node: ReactFlowNode,
    resolver?: NodeDimensionsResolver,
): NodeDimensions => {
    const fallback = getNodeDimensions(node);
    if (!resolver) return fallback;
    try {
        const resolved = resolver(node);
        return {
            width: boundedFinite(resolved?.width, fallback.width, 1, MAX_NODE_DIMENSION),
            height: boundedFinite(resolved?.height, fallback.height, 1, MAX_NODE_DIMENSION),
        };
    } catch {
        return fallback;
    }
};

/**
 * 使用 Dagre 进行布局
 */
export function layoutWithDagre(
    nodes: ReactFlowNode[],
    edges: Edge[],
    direction: string,
    nodeSep: number,
    rankSep: number,
    resolveNodeDimensions?: NodeDimensionsResolver,
    ranker: string = 'network-simplex'
): { id: string; x: number; y: number }[] {
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    const safeEdges = Array.isArray(edges) ? edges : [];
    if (safeNodes.length === 0) return [];

    const g = new dagre.graphlib.Graph();

    // 分析边的连接模式，确定最佳对齐策略
    const outDegree: Record<string, number> = {};
    const inDegree: Record<string, number> = {};
    safeEdges.forEach(e => {
        outDegree[e.source] = (outDegree[e.source] || 0) + 1;
        inDegree[e.target] = (inDegree[e.target] || 0) + 1;
    });

    // 检测是否有一对多或多对一的模式
    const hasOneToMany = Object.values(outDegree).some(d => d > 1);
    const hasManyToOne = Object.values(inDegree).some(d => d > 1);

    // 根据连接模式选择对齐策略
    // - 一对多模式：使用 'DL' (down-left) 让目标节点向下展开
    // - 多对一模式：使用 'UL' (up-left) 让源节点向上聚合
    // - 混合模式或无特殊模式：使用 undefined (居中对齐)
    let alignStrategy: string | undefined;
    if (hasOneToMany && !hasManyToOne) {
        alignStrategy = 'DL';
    } else if (hasManyToOne && !hasOneToMany) {
        alignStrategy = 'UL';
    } else {
        // 混合模式或简单链式：居中对齐通常效果最好
        alignStrategy = undefined;
    }

    g.setGraph({
        rankdir: direction === 'LR' ? 'LR' : direction === 'RL' ? 'RL' : direction === 'BT' ? 'BT' : 'TB',
        nodesep: boundedFinite(nodeSep, 50, 0, 10_000),
        ranksep: boundedFinite(rankSep, 50, 0, 10_000),
        ranker: ['network-simplex', 'tight-tree', 'longest-path'].includes(ranker)
            ? ranker
            : 'network-simplex',
        align: alignStrategy,
        marginx: 0,
        marginy: 0,
    });

    g.setDefaultEdgeLabel(() => ({}));

    // 添加节点（按输入顺序，Dagre 会尊重这个顺序进行层级分配）
    safeNodes.forEach(node => {
        const dims = resolveDimensions(node, resolveNodeDimensions);
        const w = dims.width;
        const h = dims.height;

        g.setNode(node.id, { width: w, height: h });
    });

    // 添加边（带权重和最小层级跨度）
    safeEdges.forEach(edge => {
        if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
            // 计算边的权重：一对多的边权重较低，让目标节点更分散
            const sourceOutDegree = outDegree[edge.source] || 1;
            const targetInDegree = inDegree[edge.target] || 1;

            // 权重计算：连接度越高，权重越低（允许更灵活的布局）
            const weight = 1 / Math.max(sourceOutDegree, targetInDegree);

            g.setEdge(edge.source, edge.target, {
                weight: weight,
                minlen: 1,  // 最小层级跨度
            });
        }
    });

    // 执行布局
    dagre.layout(g);

    // 收集结果
    const result: { id: string; x: number; y: number }[] = [];
    safeNodes.forEach(node => {
        const nodeWithPos = g.node(node.id);
        if (nodeWithPos) {
            const dims = resolveDimensions(node, resolveNodeDimensions);
            const w = dims.width;
            const h = dims.height;

            // Dagre 返回的是中心点，需要转换为左上角
            result.push({
                id: node.id,
                x: nodeWithPos.x - w / 2,
                y: nodeWithPos.y - h / 2,
            });
        }
    });

    return result;
}

/**
 * 将叶节点边映射到容器边
 */
export function mapEdgesToContainers(edges: Edge[], nodeToContainer: Map<string, string>): Edge[] {
    const containerEdges: Edge[] = [];
    const seen = new Set<string>();
    const safeEdges = Array.isArray(edges) ? edges : [];
    const safeNodeToContainer = nodeToContainer instanceof Map
        ? nodeToContainer
        : new Map<string, string>();

    safeEdges.forEach(e => {
        const srcContainer = safeNodeToContainer.get(e.source) || e.source;
        const tgtContainer = safeNodeToContainer.get(e.target) || e.target;

        if (srcContainer !== tgtContainer) {
            const key = `${srcContainer}->${tgtContainer}`;
            if (!seen.has(key)) {
                seen.add(key);
                containerEdges.push({
                    ...e,
                    id: `cnt-${e.id}`,
                    source: srcContainer,
                    target: tgtContainer
                });
            }
        }
    });

    return containerEdges;
}

/**
 * 计算节点的边界框
 */
export function getNodeDimensions(node: ReactFlowNode): { width: number; height: number } {
    const candidate = node as ReactFlowNode & {
        width?: unknown;
        height?: unknown;
        measured?: { width?: unknown; height?: unknown };
    };
    return {
        width: firstValidDimension([
            candidate?.measured?.width,
            candidate?.style?.width,
            candidate?.width,
        ], DEFAULT_NODE_WIDTH),
        height: firstValidDimension([
            candidate?.measured?.height,
            candidate?.style?.height,
            candidate?.height,
        ], DEFAULT_NODE_HEIGHT),
    };
}

/**
 * 计算节点的边界框
 * @param widthCompensation 可选的宽度补偿系数，用于补偿中文文本实际渲染宽度与计算宽度的差异
 */
export function calculateBounds(
    nodes: ReactFlowNode[],
    resolveNodeDimensions?: NodeDimensionsResolver,
    widthCompensation: number = 1.0
): { width: number; height: number; minX: number; minY: number } {
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    if (safeNodes.length === 0) {
        return { width: 200, height: 100, minX: 0, minY: 0 };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const safeWidthCompensation = boundedFinite(widthCompensation, 1, 0.1, 10);

    safeNodes.forEach(node => {
        const x = boundedFinite(node?.position?.x, 0, -MAX_COORDINATE, MAX_COORDINATE);
        const y = boundedFinite(node?.position?.y, 0, -MAX_COORDINATE, MAX_COORDINATE);
        const dims = resolveDimensions(node, resolveNodeDimensions);
        // 应用宽度补偿系数
        const w = dims.width * safeWidthCompensation;
        const h = dims.height;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
    });

    return {
        width: Math.max(100, maxX - minX),
        height: Math.max(60, maxY - minY),
        minX,
        minY
    };
}
