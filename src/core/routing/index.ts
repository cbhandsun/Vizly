/**
 * 路由模块索引文件
 * 统一导出所有公共API
 */

// 主入口
export { edgeRouter, EdgeRouter, EDGE_ROUTING_PRESETS } from './EdgeRouter';

// 核心模块
export { geometryAnalyzer, GeometryAnalyzer } from './core/GeometryAnalyzer';
export { portSelector, PortSelector } from './core/PortSelector';
export { costEvaluator, CostEvaluator } from './core/CostEvaluator';
export { pathFinder, PathFinder } from './algorithms/PathFinder';

// 类型定义
export type {
    // 基础类型
    Point,
    Rectangle,
    NodeGeometry,

    // 配置类型
    RoutingConfig,
    EdgeRoutingWeights,
    PortUsage,

    // 结果类型
    RoutingDecision,
    PortSelectionResult,
    CostResult,
    PathResult,
    GeometryAnalysis,
    AlignmentInfo,

    // 插件系统
    RoutingPlugin,
    PluginRegistry,
    CostContext,

    // 枚举
    EdgeType
} from './types/routing';
