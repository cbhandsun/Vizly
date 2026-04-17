import { Node, Edge } from '@xyflow/react';
import { LayoutType } from '../types/layout';

export interface OptimizationResult {
    nodes: Node[];
    edges: Edge[];
    stats: {
        rectifiedOverlaps: number;
        alignedNodes: number;
        lintViolationsFixed?: number;
    };
}

/**
 * 图表智能服务 (Diagram Intelligence Service)
 * 处理高级拓扑分析、自动纠偏、对齐提示以及优化。
 */
export class DiagramIntelligenceService {
    private static instance: DiagramIntelligenceService;

    private constructor() {}

    public static getInstance(): DiagramIntelligenceService {
        if (!DiagramIntelligenceService.instance) {
            DiagramIntelligenceService.instance = new DiagramIntelligenceService();
        }
        return DiagramIntelligenceService.instance;
    }

    /**
     * 检测节点重叠
     */
    public detectOverlaps(nodes: Node[]): Array<{ a: string; b: string }> {
        const overlaps: Array<{ a: string; b: string }> = [];
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                if (this.isOverlapping(nodes[i], nodes[j])) {
                    overlaps.push({ a: nodes[i].id, b: nodes[j].id });
                }
            }
        }
        return overlaps;
    }

    /**
     * 一键智能优化（核心入口）
     */
    public async optimize(nodes: Node[], edges: Edge[]): Promise<OptimizationResult> {
        let currentNodes = [...nodes];
        let currentEdges = [...edges];
        let rectifiedOverlaps = 0;
        let alignedNodes = 0;

        // 1. 解决重叠 (简单的排斥扩散)
        const nodeMap = new Map(currentNodes.map(n => [n.id, n]));
        const overlaps = this.detectOverlaps(currentNodes);
        
        if (overlaps.length > 0) {
            rectifiedOverlaps = overlaps.length;
            overlaps.forEach(({ a, b }) => {
                const nodeA = nodeMap.get(a);
                const nodeB = nodeMap.get(b);
                if (nodeA && nodeB) {
                    // 简单的向右下方移动被覆盖节点
                    nodeB.position.x += 60;
                    nodeB.position.y += 60;
                }
            });
        }

        // 2. 栅格吸附 (对齐到 20px 栅格)
        currentNodes = currentNodes.map(node => {
            const oldX = node.position.x;
            const oldY = node.position.y;
            const newX = Math.round(oldX / 20) * 20;
            const newY = Math.round(oldY / 20) * 20;
            
            if (newX !== oldX || newY !== oldY) {
                alignedNodes++;
            }

            return {
                ...node,
                position: { x: newX, y: newY }
            };
        });

        // 3. 统计结果并返回
        return {
            nodes: currentNodes,
            edges: currentEdges,
            stats: {
                rectifiedOverlaps,
                alignedNodes
            }
        };
    }

    /**
     * 判断两个节点是否重叠
     */
    private isOverlapping(nodeA: Node, nodeB: Node): boolean {
        // 忽略父子节点关系（因为子节点理应在父节点内）
        if (nodeA.parentId === nodeB.id || nodeB.parentId === nodeA.id) return false;
        if (nodeA.parentId && nodeA.parentId === nodeB.parentId) {
            // 在同一个容器内的兄弟节点需要检测重叠
        }

        const rectA = {
            x: nodeA.position.x,
            y: nodeA.position.y,
            w: nodeA.measured?.width ?? 150,
            h: nodeA.measured?.height ?? 80
        };
        const rectB = {
            x: nodeB.position.x,
            y: nodeB.position.y,
            w: nodeB.measured?.width ?? 150,
            h: nodeB.measured?.height ?? 80
        };

        return !(
            rectA.x + rectA.w < rectB.x ||
            rectB.x + rectB.w < rectA.x ||
            rectA.y + rectA.h < rectB.y ||
            rectB.y + rectB.h < rectA.y
        );
    }

    /**
     * 智能布局推荐
     */
    public suggestLayout(nodes: Node[], edges: Edge[]): LayoutType {
        const nodeCount = nodes.length;
        const edgeCount = edges.length;
        const containerCount = nodes.filter(n => n.type === 'subGroup' || n.type === 'networkContainer').length;

        // 如果容器很多，优先使用 ELK (因为它更擅长层级容器布局)
        if (containerCount > 2) return LayoutType.ELK;
        
        // 如果是长链条结构，建议 Dagre
        if (edgeCount >= nodeCount - 1 && nodeCount > 5) return LayoutType.DAGRE;

        return LayoutType.ELK; // 默认使用 ELK，视觉效果更现代
    }
}
