import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import dagre from 'dagre';

/**
 * 使用 Dagre 进行布局
 */
export function layoutWithDagre(
    nodes: ReactFlowNode[],
    edges: Edge[],
    direction: string,
    nodeSep: number,
    rankSep: number,
    getNodeDimensions?: (node: ReactFlowNode) => { width: number; height: number },
    ranker: string = 'network-simplex'
): { id: string; x: number; y: number }[] {
    if (nodes.length === 0) return [];

    const g = new dagre.graphlib.Graph();

    // 分析边的连接模式，确定最佳对齐策略
    const outDegree: Record<string, number> = {};
    const inDegree: Record<string, number> = {};
    edges.forEach(e => {
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
        nodesep: nodeSep,
        ranksep: rankSep,
        ranker: ranker,
        align: alignStrategy,
        marginx: 0,
        marginy: 0,
    });

    g.setDefaultEdgeLabel(() => ({}));

    // 添加节点（按输入顺序，Dagre 会尊重这个顺序进行层级分配）
    nodes.forEach(node => {
        // 使用传入的尺寸获取器，或者默认逻辑
        const dims = getNodeDimensions ? getNodeDimensions(node) : getNodeDimensions(node);
        const w = dims.width;
        const h = dims.height;

        g.setNode(node.id, { width: w, height: h });
    });

    // 添加边（带权重和最小层级跨度）
    edges.forEach(edge => {
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
    nodes.forEach(node => {
        const nodeWithPos = g.node(node.id);
        if (nodeWithPos) {
            const dims = getNodeDimensions ? getNodeDimensions(node) : getNodeDimensions(node);
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

    edges.forEach(e => {
        const srcContainer = nodeToContainer.get(e.source) || e.source;
        const tgtContainer = nodeToContainer.get(e.target) || e.target;

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
    const w = (node as any).measured?.width
        || (typeof (node as any).style?.width === 'number' ? (node as any).style.width : null)
        || (node as any).width
        || 200;
    const h = (node as any).measured?.height
        || (typeof (node as any).style?.height === 'number' ? (node as any).style.height : null)
        || (node as any).height
        || 80;
    return { width: w, height: h };
}

/**
 * 计算节点的边界框
 * @param widthCompensation 可选的宽度补偿系数，用于补偿中文文本实际渲染宽度与计算宽度的差异
 */
export function calculateBounds(
    nodes: ReactFlowNode[],
    getNodeDimensions?: (node: ReactFlowNode) => { width: number; height: number },
    widthCompensation: number = 1.0
): { width: number; height: number; minX: number; minY: number } {
    if (nodes.length === 0) {
        return { width: 200, height: 100, minX: 0, minY: 0 };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    nodes.forEach(node => {
        const x = node.position.x;
        const y = node.position.y;
        const dims = getNodeDimensions ? getNodeDimensions(node) : getNodeDimensions(node);
        // 应用宽度补偿系数
        const w = dims.width * widthCompensation;
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
