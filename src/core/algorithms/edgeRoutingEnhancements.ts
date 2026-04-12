/**
 * Edge Routing Enhancements - 边路由增强统一入口
 * 
 * 整合所有边路由增强模块，提供统一的API访问点。
 * 
 * @example
 * import { 
 *   selectOptimalPorts, 
 *   ChannelManager, 
 *   extractLabelObstacles 
 * } from './algorithms/edgeRoutingEnhancements';
 */

// === 智能端口选择 ===
export {
    selectOptimalPorts,
    selectQuickPorts,
    type NodeRect,
    type PortCandidate,
} from './costAwarePorts';

// === 边通道路由 ===
export {
    ChannelManager,
    extractLineObstaclesFromPaths,
    separateParallelPaths,
    bundleEdges,
    DEFAULT_CHANNEL_CONFIG,
    type EdgeChannelConfig,
} from './edgeChannelRouting';

// === 标签感知路由 ===
export {
    estimateLabelSize,
    calculateLabelBounds,
    extractLabelObstacles,
    getObstaclesWithLabels,
    isPathCrossingLabels,
    DEFAULT_LABEL_CONFIG,
    type NodeLabelInfo,
    type LabelAwareConfig,
} from './labelAwareRouting';

// === 核心路径规划 ===
export {
    findPath,
    generateSimplePath,
    isPathBlocked,
    type Point,
    type Rectangle,
    type LineObstacle,
} from './pathfinding';

/**
 * 创建完整的增强路由配置
 */
export interface EnhancedRoutingConfig {
    // 端口选择
    enableCostAwarePorts: boolean;
    bendPenalty: number;
    obstaclePenalty: number;
    crossingPenalty: number;

    // 通道路由
    enableChannelRouting: boolean;
    channelSpacing: number;
    minEdgeSeparation: number;

    // 边绑定
    enableEdgeBundling: boolean;
    bundleStrength: number;

    // 标签感知
    enableLabelAware: boolean;
    labelPadding: number;

    // 成本函数
    directionChangeCost: number;
    bufferZoneLevels: number;
}

export const DEFAULT_ENHANCED_ROUTING_CONFIG: EnhancedRoutingConfig = {
    // 端口选择
    enableCostAwarePorts: true,
    bendPenalty: 50,
    obstaclePenalty: 100,
    crossingPenalty: 80,

    // 通道路由
    enableChannelRouting: true,
    channelSpacing: 15,
    minEdgeSeparation: 10,

    // 边绑定
    enableEdgeBundling: true,
    bundleStrength: 0.6,

    // 标签感知
    enableLabelAware: true,
    labelPadding: 5,

    // 成本函数
    directionChangeCost: 20, // Increased to prioritize straight lines
    bufferZoneLevels: 2,
};
