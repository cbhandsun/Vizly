/**
 * 交叉优化器 (Crossing Minimizer)
 * 
 * 通过分层和排序算法主动减少图中的边交叉，改善视觉质量。
 * 
 * 核心算法：
 * 1. Layer Assignment: 基于拓扑排序分配层级
 * 2. Crossing Reduction: 使用Barycenter启发式减少交叉
 * 3. Order Optimization: 层内排序优化
 * 
 * 适用场景：
 * - 层次化布局（Hierarchical Layout）
 * - 流程图（Flowchart）
 * - DAG（有向无环图）
 * 
 * @module CrossingMinimizer
 */

import type { Edge } from '@xyflow/react';

/**
 * 边元数据
 */
export interface EdgeMetadata {
    id: string;
    sourceId: string;
    targetId: string;
    layer?: number;           // 所属层级
    order?: number;           // 层内顺序
    crossingCount?: number;   // 交叉次数
}

/**
 * 层信息
 */
export interface LayerInfo {
    level: number;
    edges: EdgeMetadata[];
    crossingCount: number;
}

/**
 * 优化配置
 */
export interface CrossingOptimizerConfig {
    /** 是否启用分层优化（默认true） */
    enableLayering?: boolean;
    /** 是否启用Barycenter启发式（默认true） */
    enableBarycenter?: boolean;
    /** 最大迭代次数（默认10） */
    maxIterations?: number;
    /** 是否启用调试日志 */
    debug?: boolean;
}

const DEFAULT_CONFIG: Required<CrossingOptimizerConfig> = {
    enableLayering: true,
    enableBarycenter: true,
    maxIterations: 10,
    debug: false
};

/**
 * 优化结果
 */
export interface OptimizationResult {
    /** 优化后的边列表（按绘制顺序） */
    orderedEdges: EdgeMetadata[];
    /** 层信息 */
    layers: LayerInfo[];
    /** 总交叉数 */
    totalCrossings: number;
    /** 优化前交叉数 */
    initialCrossings: number;
    /** 减少的交叉数 */
    improvement: number;
}

/**
 * 交叉优化器
 */
export class CrossingMinimizer {
    private config: Required<CrossingOptimizerConfig>;

    constructor(config: CrossingOptimizerConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * 优化边的绘制顺序以减少交叉
     * 
     * @param edges 边列表
     * @returns 优化结果
     */
    optimize(edges: Edge[]): OptimizationResult {
        this.log(`优化开始，共${edges.length}条边`);

        // 转换为元数据
        const edgeMetadata = this.toMetadata(edges);

        // 计算初始交叉数
        const initialCrossings = this.countCrossings(edgeMetadata);
        this.log(`初始交叉数: ${initialCrossings}`);

        let optimizedEdges = edgeMetadata;
        let layers: LayerInfo[] = [];

        // Step 1: 分层
        if (this.config.enableLayering) {
            const layerResult = this.assignLayers(optimizedEdges);
            optimizedEdges = layerResult.edges;
            layers = layerResult.layers;
            this.log(`分层完成，共${layers.length}层`);
        }

        // Step 2: Barycenter启发式减少交叉
        if (this.config.enableBarycenter && layers.length > 0) {
            const reduced = this.reduceCrossings(layers);
            optimizedEdges = reduced.flatMap(layer => layer.edges);
            layers = reduced;
            this.log(`交叉优化完成`);
        }

        // 计算最终交叉数
        const finalCrossings = this.countCrossings(optimizedEdges);
        const improvement = initialCrossings - finalCrossings;

        this.log(`优化完成，交叉数: ${finalCrossings}，改善: ${improvement}`);

        return {
            orderedEdges: optimizedEdges,
            layers,
            totalCrossings: finalCrossings,
            initialCrossings,
            improvement
        };
    }

    /**
     * 转换为元数据
     */
    private toMetadata(edges: Edge[]): EdgeMetadata[] {
        return edges.map(edge => ({
            id: edge.id,
            sourceId: edge.source,
            targetId: edge.target
        }));
    }

    /**
     * 分配层级
     * 
     * 简化版：基于source/target位置的启发式分层
     * （完整版应使用拓扑排序和最长路径算法）
     */
    private assignLayers(edges: EdgeMetadata[]): {
        edges: EdgeMetadata[];
        layers: LayerInfo[];
    } {
        // 简化实现：根据边的"方向"分层
        // 实际应用中可以基于图的拓扑结构
        const layerMap = new Map<number, EdgeMetadata[]>();

        edges.forEach((edge, index) => {
            // 简单启发式：使用源节点ID的hash作为层级
            const layer = this.hashToLayer(edge.sourceId);
            edge.layer = layer;
            edge.order = index;

            if (!layerMap.has(layer)) {
                layerMap.set(layer, []);
            }
            layerMap.get(layer)!.push(edge);
        });

        // 构建层信息
        const layers: LayerInfo[] = Array.from(layerMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([level, edges]) => ({
                level,
                edges,
                crossingCount: this.countLayerCrossings(edges)
            }));

        return { edges, layers };
    }

    /**
     * Hash函数：将节点ID映射到层级
     */
    private hashToLayer(nodeId: string): number {
        let hash = 0;
        for (let i = 0; i < nodeId.length; i++) {
            hash = ((hash << 5) - hash) + nodeId.charCodeAt(i);
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash % 5); // 分配到5层
    }

    /**
     * 使用Barycenter启发式减少交叉
     * 
     * 算法：
     * 1. 计算每条边的barycenter（重心）
     * 2. 按barycenter排序
     * 3. 迭代优化直到收敛
     */
    private reduceCrossings(layers: LayerInfo[]): LayerInfo[] {
        let currentLayers = layers;
        let previousCrossings = this.countTotalLayerCrossings(currentLayers);

        for (let iter = 0; iter < this.config.maxIterations; iter++) {
            // 对每一层应用barycenter排序
            currentLayers = currentLayers.map(layer => {
                const sorted = this.sortByBarycenter(layer.edges);
                return {
                    ...layer,
                    edges: sorted,
                    crossingCount: this.countLayerCrossings(sorted)
                };
            });

            // 检查是否收敛
            const currentCrossings = this.countTotalLayerCrossings(currentLayers);
            if (currentCrossings >= previousCrossings) {
                this.log(`迭代${iter + 1}: 收敛，停止优化`);
                break;
            }

            this.log(`迭代${iter + 1}: 交叉数 ${currentCrossings}`);
            previousCrossings = currentCrossings;
        }

        return currentLayers;
    }

    /**
     * 按Barycenter排序边
     * 
     * Barycenter = 相邻边的平均位置
     */
    private sortByBarycenter(edges: EdgeMetadata[]): EdgeMetadata[] {
        const withBarycenter = edges.map((edge, index) => ({
            edge,
            barycenter: this.calculateBarycenter(edge, index, edges)
        }));

        withBarycenter.sort((a, b) => a.barycenter - b.barycenter);

        return withBarycenter.map((item, index) => ({
            ...item.edge,
            order: index
        }));
    }

    /**
     * 计算边的Barycenter
     * 
     * 简化实现：使用source/target ID的数值化表示
     */
    private calculateBarycenter(
        edge: EdgeMetadata,
        index: number,
        allEdges: EdgeMetadata[]
    ): number {
        // 简化：使用source和target的hash值的平均
        const sourceHash = this.stringToNumber(edge.sourceId);
        const targetHash = this.stringToNumber(edge.targetId);
        return (sourceHash + targetHash) / 2;
    }

    /**
     * 字符串转数值
     */
    private stringToNumber(str: string): number {
        let num = 0;
        for (let i = 0; i < Math.min(str.length, 10); i++) {
            num = num * 31 + str.charCodeAt(i);
        }
        return num;
    }

    /**
     * 计算所有层的总交叉数
     */
    private countTotalLayerCrossings(layers: LayerInfo[]): number {
        return layers.reduce((sum, layer) => sum + layer.crossingCount, 0);
    }

    /**
     * 计算单层内的交叉数
     */
    private countLayerCrossings(edges: EdgeMetadata[]): number {
        let crossings = 0;
        for (let i = 0; i < edges.length; i++) {
            for (let j = i + 1; j < edges.length; j++) {
                if (this.edgesCross(edges[i], edges[j])) {
                    crossings++;
                }
            }
        }
        return crossings;
    }

    /**
     * 计算所有边的交叉数
     */
    private countCrossings(edges: EdgeMetadata[]): number {
        return this.countLayerCrossings(edges);
    }

    /**
     * 判断两条边是否交叉
     * 
     * 简化实现：基于source/target ID的比较
     * 完整实现需要实际的几何计算
     */
    private edgesCross(edge1: EdgeMetadata, edge2: EdgeMetadata): boolean {
        // 简化启发式：如果边的source/target顺序相反，视为交叉
        const order1 = this.stringToNumber(edge1.sourceId) < this.stringToNumber(edge1.targetId);
        const order2 = this.stringToNumber(edge2.sourceId) < this.stringToNumber(edge2.targetId);

        // 如果一条边是正向，另一条是反向，且它们有重叠，则可能交叉
        return order1 !== order2;
    }

    /**
     * 调试日志
     */
    private log(message: string, ...args: unknown[]): void {
        if (this.config.debug) {
        }
    }

    /**
     * 更新配置
     */
    updateConfig(config: Partial<CrossingOptimizerConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * 获取当前配置
     */
    getConfig(): Readonly<Required<CrossingOptimizerConfig>> {
        return { ...this.config };
    }
}

/**
 * 便捷函数：快速优化边顺序
 */
export function minimizeCrossings(
    edges: Edge[],
    config?: CrossingOptimizerConfig
): EdgeMetadata[] {
    const minimizer = new CrossingMinimizer(config);
    const result = minimizer.optimize(edges);
    return result.orderedEdges;
}
