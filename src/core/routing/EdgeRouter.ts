import { geometryAnalyzer } from './core/GeometryAnalyzer';
import { portSelector } from './core/PortSelector';
import { costEvaluator } from './core/CostEvaluator';
import * as pathFinder from '../algorithms/pathfinding';
import { calculateAdaptiveGridSize } from '../workers/core/GraphBuilder'; // [P1]
import { expandHandle, normalizeHandle, isHorizontalHandle, isVerticalHandle } from './utils/handleUtils';

import type {
    NodeGeometry,
    RoutingConfig,
    RoutingDecision,
    EdgeRoutingWeights,
    PortUsage,
    EdgeType,
    RoutingPlugin,
    Point
} from './types/routing';

/**
 * 权重预设
 */
export const EDGE_ROUTING_PRESETS: Record<string, EdgeRoutingWeights> = {
    default: {
        length: 1.0,
        turn: 50,
        crossing: 160,
        lrBias: 120,
        tbBias: 120,
        wrongSign: 2000,
        usagePenalty: 40,
        overlapPenalty: 220,
        exitContainerPenalty: 1600,
        crossDomainPenalty: 0,
        detourPenalty: 300,
        lastSegShort: 22,
        alignmentBonus: 120,
        flowBonus: 500,
        edgeCrossing: 80
    },
    compact: {
        length: 2.0,
        turn: 30,
        crossing: 100,
        lrBias: 80,
        tbBias: 80,
        wrongSign: 2000,
        usagePenalty: 20,
        overlapPenalty: 150,
        exitContainerPenalty: 800,
        crossDomainPenalty: 0,
        detourPenalty: 400,
        lastSegShort: 10,
        alignmentBonus: 60,
        flowBonus: 40,
        edgeCrossing: 50
    },
    clear: {
        length: 0.5,
        turn: 60,
        crossing: 300,
        lrBias: 150,
        tbBias: 150,
        wrongSign: 2000,
        usagePenalty: 80,
        overlapPenalty: 400,
        exitContainerPenalty: 2000,
        crossDomainPenalty: 100,
        detourPenalty: 1200,
        lastSegShort: 30,
        alignmentBonus: 180,
        flowBonus: 120,
        edgeCrossing: 150
    }
};

export class EdgeRouter {
    private plugins: Map<string, RoutingPlugin> = new Map();

    /**
     * 主要路由方法
     */
    route(
        sourceNode: NodeGeometry,
        targetNode: NodeGeometry,
        config: RoutingConfig,
        usage?: PortUsage,
        customWeights?: Partial<EdgeRoutingWeights>
    ): RoutingDecision {



        try {
            // [OPT-P2⑧] normalizeHandle/expandHandle 已统一到 handleUtils.ts
            const weights = this.getWeights(config, customWeights);

            // 2. 几何分析
            const geometry = geometryAnalyzer.analyze(
                sourceNode,
                targetNode,
                config.layoutDirection || 'LR'
            );

            // 3. 端口选择
            const portResult = portSelector.selectOptimalPorts(
                sourceNode,
                targetNode,
                config,
                weights,
                usage,
                geometry
            );

            // [FIX-C-shape] Post-port-selection guard: prevent C-shaped paths.
            // When both ports are horizontal (right/left) but nodes are primarily vertically
            // separated (|dy| > |dx| * 2), the orthogonal path must make 3 segments
            // (right → down → left = C-shape). Switch to vertical ports for a 2-segment L-shape.
            // Only applies when there is no forced layout direction (i.e., TB layout where we
            // naturally want bottom→top connections).
            {
                const sCx = sourceNode.position.x + sourceNode.dimensions.width / 2;
                const sCy = sourceNode.position.y + sourceNode.dimensions.height / 2;
                const tCx = targetNode.position.x + targetNode.dimensions.width / 2;
                const tCy = targetNode.position.y + targetNode.dimensions.height / 2;
                const ddx = tCx - sCx;
                const ddy = tCy - sCy;
                const addx = Math.abs(ddx);
                const addy = Math.abs(ddy);

                // [OPT-P2⑧] 使用 handleUtils 中的 isHorizontalHandle / isVerticalHandle
                const srcIsHoriz = isHorizontalHandle(portResult.sourceHandle);
                const tgtIsHoriz = isHorizontalHandle(portResult.targetHandle);
                const srcIsVert  = isVerticalHandle(portResult.sourceHandle);
                const tgtIsVert  = isVerticalHandle(portResult.targetHandle);

                if (srcIsHoriz && tgtIsHoriz && addy > addx * 2) {
                    // Both horizontal but strong vertical dominance → switch to vertical
                    portResult.sourceHandle = ddy > 0 ? 'b' : 't';
                    portResult.targetHandle = ddy > 0 ? 't' : 'b';
                } else if (srcIsVert && tgtIsVert && addx > addy * 2) {
                    // Both vertical but strong horizontal dominance → switch to horizontal
                    portResult.sourceHandle = ddx > 0 ? 'r' : 'l';
                    portResult.targetHandle = ddx > 0 ? 'l' : 'r';
                }
            }

            // 4. 确定路由类型

            const type = this.resolveEdgeType(config, geometry);

            // 5. 计算路径
            let computedPath: Point[] = [];

            // 如果是Step相关类型，启用高级寻路
            // 确保有 obstacles 数据（由HandlePicker注入）
            if ((type === 'advanced-smart-step' || type === 'step' || type === 'advanced-smart-straight' || type === 'advanced-smart-bezier') && (config as any).obstacles) {

                // 计算边界盒 (包含 Source, Target 和所有 Obstacles)
                let minX = Math.min(sourceNode.position.x, targetNode.position.x);
                let minY = Math.min(sourceNode.position.y, targetNode.position.y);
                let maxX = Math.max(sourceNode.position.x + sourceNode.dimensions.width, targetNode.position.x + targetNode.dimensions.width);
                let maxY = Math.max(sourceNode.position.y + sourceNode.dimensions.height, targetNode.position.y + targetNode.dimensions.height);

                // 扩展边界以容纳绕路
                const padding = 600;
                minX -= padding;
                minY -= padding;
                maxX += padding;
                maxY += padding;

                const sh = normalizeHandle(portResult.sourceHandle);
                const th = normalizeHandle(portResult.targetHandle);

                const startPoint = {
                    x: sourceNode.position.x + (sh === 'r' ? sourceNode.dimensions.width : sh === 'l' ? 0 : sourceNode.dimensions.width / 2),
                    y: sourceNode.position.y + (sh === 'b' ? sourceNode.dimensions.height : sh === 't' ? 0 : sourceNode.dimensions.height / 2)
                };

                const endPoint = {
                    x: targetNode.position.x + (th === 'r' ? targetNode.dimensions.width : th === 'l' ? 0 : targetNode.dimensions.width / 2),
                    y: targetNode.position.y + (th === 'b' ? targetNode.dimensions.height : th === 't' ? 0 : targetNode.dimensions.height / 2)
                };

                // 端口微调：将起始点移出节点一点点，防止直接碰撞
                const offset = 1;
                if (sh === 'r') startPoint.x += offset;
                else if (sh === 'l') startPoint.x -= offset;
                else if (sh === 'b') startPoint.y += offset;
                else if (sh === 't') startPoint.y -= offset;

                if (th === 'r') endPoint.x += offset;
                else if (th === 'l') endPoint.x -= offset;
                else if (th === 'b') endPoint.y += offset;
                else if (th === 't') endPoint.y -= offset;


                // [FIX] Correct Argument Order for findPath
                // Signature: findPath(start, end, obstacles, gridSize, lineObstacles, debugOut)
                // Note: 'bbox' and 'maxExpansions' are not used in current pathfinding.ts implementation or handled internally.
                // Note: 'lineObstacles' acts as 'routedPaths' here.

                // Transform routedPaths (Point[][]) to LineObstacle[]
                const lineObstacles: { start: { x: number; y: number }; end: { x: number; y: number } }[] = [];
                if (config.routedPaths) {
                    for (const rp of config.routedPaths) {
                        if (rp.points && rp.points.length > 1) {
                            for (let i = 0; i < rp.points.length - 1; i++) {
                                lineObstacles.push({ start: rp.points[i], end: rp.points[i + 1] });
                            }
                        }
                    }
                }

                // [P1] 自适应 gridSize：短距离连线用 10px 精细网格，长距离自动升为粗网格
                // 原来硬编码 orthogonalGridSize（默认 20），导致短距离节点间精度不足
                const adaptiveGridSize = calculateAdaptiveGridSize(
                    startPoint.x, startPoint.y,
                    endPoint.x, endPoint.y,
                    config.orthogonalGridSize || 20
                );

                const path = pathFinder.findPath(
                    startPoint,
                    endPoint,
                    (config as any).obstacles || [],
                    adaptiveGridSize,  // [P1]
                    lineObstacles
                );

                if (path && path.length > 0) {
                    computedPath = path;
                } else {
                    // [FIX] Fallback for Main Thread "Fast Pass" Failure
                    // If A* fails (e.g. exceeds 1500 limit), return a simple straight line
                    // so the edge is VISIBLE immediately. The Worker will refine it later.
                    computedPath = [startPoint, endPoint];
                }
            }

            return {
                type,
                sourceHandle: expandHandle(portResult.sourceHandle),
                targetHandle: expandHandle(portResult.targetHandle),
                autoSource: portResult.autoSource,
                autoTarget: portResult.autoTarget,
                computedPath,
                cost: portResult.cost,
                algorithm: 'modular'
            };
        } catch (error) {
            console.error('[EdgeRouter] Fatal Error:', error);
            // Fallback to straight line to prevent missing lines
            return {
                type: 'advanced-smart-straight' as any,
                sourceHandle: 'bottom',
                targetHandle: 'top',
                autoSource: true,
                autoTarget: true,
                computedPath: [],
                cost: 0,
                algorithm: 'fallback'
            };
        }
    }

    /**
     * 注册插件
     */
    use(plugin: RoutingPlugin): void {
        this.plugins.set(plugin.name, plugin);
        costEvaluator.registerPlugin(plugin);
    }

    /**
     * 卸载插件
     */
    unuse(pluginName: string): void {
        this.plugins.delete(pluginName);
    }

    /**
     * 获取权重配置
     */
    private getWeights(
        config: RoutingConfig,
        customWeights?: Partial<EdgeRoutingWeights>
    ): EdgeRoutingWeights {
        const preset = config.globalPath || 'default';
        const base = EDGE_ROUTING_PRESETS[preset] || EDGE_ROUTING_PRESETS.default;

        if (customWeights) {
            return { ...base, ...customWeights };
        }

        return base;
    }

    /**
     * 解析边类型
     */
    private resolveEdgeType(config: RoutingConfig, geometry: any): EdgeType {
        if (config.mode === 'native') {
            const globalPath = config.globalPath || 'bezier';
            if (globalPath.includes('smooth')) return 'smoothstep' as unknown as EdgeType;
            if (globalPath.includes('straight')) return 'straight' as unknown as EdgeType;
            if (globalPath.includes('bezier')) return 'bezier' as unknown as EdgeType;
            return 'step' as unknown as EdgeType;
        }

        const globalPath = config.globalPath || 'step';

        // 'auto' 明确映射为 step（直角折线），不落入 bezier 兆底
        if (globalPath === 'auto') return 'advanced-smart-step' as unknown as EdgeType;
        if (globalPath.includes('straight')) return 'advanced-smart-straight' as unknown as EdgeType;
        if (globalPath.includes('step')) return 'advanced-smart-step' as unknown as EdgeType;
        if (globalPath.includes('bezier')) return 'advanced-smart-bezier' as unknown as EdgeType;

        // 其他未识别的值也回退到 step，而不是 bezier
        return 'advanced-smart-step' as unknown as EdgeType;
    }
}

// 导出单例
export const edgeRouter = new EdgeRouter();

// 导出类型和工具
export {
    geometryAnalyzer,
    portSelector,
    costEvaluator,
    pathFinder
};

export type {
    NodeGeometry,
    RoutingConfig,
    RoutingDecision,
    EdgeRoutingWeights,
    PortUsage
};
