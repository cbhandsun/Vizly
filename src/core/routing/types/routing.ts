/**
 * 路由系统核心类型定义
 * 从 HandlePicker.ts 提取,作为模块间的契约
 */

// ============================================================================
// 基础几何类型
// ============================================================================

export interface Point {
    x: number;
    y: number;
}

export interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface NodeGeometry {
    id: string;
    position: Point;
    dimensions: { width: number; height: number };
    type?: string;
    data?: Record<string, unknown>;
}

// ============================================================================
// 路由配置
// ============================================================================

export interface EdgeRoutingWeights {
    length: number;           // 路径长度权重
    turn: number;             // 转弯惩罚
    crossing: number;         // 穿越节点惩罚
    lrBias: number;           // 左右方向偏好
    tbBias: number;           // 上下方向偏好
    wrongSign: number;        // 方向错误惩罚
    usagePenalty: number;     // 端口复用惩罚
    overlapPenalty: number;   // 重叠惩罚
    exitContainerPenalty: number;  // 离开容器惩罚
    crossDomainPenalty: number;    // 跨域惩罚
    detourPenalty: number;    // 绕路惩罚
    lastSegShort: number;     // 最后线段过短惩罚
    alignmentBonus: number;   // 对齐奖励
    flowBonus: number;        // 流向奖励
    edgeCrossing: number;     // 边交叉惩罚
    // 几何权重
    wrongAxisPenalty?: number;
    preferredAxisBonus?: number;
    lShapeBonus?: number;
    crossAxisPenalty?: number;
    dominantAxisRatio?: number;
    threshold?: number;
    lShapeThreshold?: number;
    majorAxisBonus?: number;
    busBonus?: number;
}

export interface RoutingConfig {
    mode: 'advanced-smart' | 'native';
    globalPath?: string;
    autoPathSelection?: boolean;
    angleToleranceDeg?: number;
    bezierDistanceThreshold?: number;
    obstacleScopePadding?: number;
    corridorObstacleThreshold?: number;
    directionalHandlePolicy?: 'prefer' | 'force' | 'off';
    verticalBiasThreshold?: number;
    obstaclePadding?: number;
    orthogonalSamplingEnabled?: boolean;
    orthogonalGridSize?: number;
    orthogonalSampleBudget?: number;
    gridAStarEnabled?: boolean;
    gridAStarGridSize?: number;
    gridAStarMaxExpansions?: number;
    ignoreContainers?: boolean;
    layoutDirection?: string;
    routedPaths?: Array<{ points: Array<Point> }>;
    preAssignedPorts?: Record<string, { source?: string; target?: string }>;
    preAssignedPortPolicy?: 'prefer' | 'force';
    nodePortConstraints?: Record<string, { source?: string[]; target?: string[] }>;
    routingPlugins?: string[];
}

// ============================================================================
// 端口相关
// ============================================================================

export interface PortCandidate {
    source: string;  // 'l' | 'r' | 't' | 'b'
    target: string;  // 'l' | 'r' | 't' | 'b'
}

export interface PortUsage {
    source?: Record<string, number>;
    target?: Record<string, number>;
}

export interface PortSelectionResult {
    sourceHandle: string;
    targetHandle: string;
    cost: number;
    autoSource: boolean;
    autoTarget: boolean;
}

// ============================================================================
// 成本计算
// ============================================================================

export interface CostContext {
    sNode: NodeGeometry;
    tNode: NodeGeometry;
    sDir: string;
    tDir: string;
    dx: number;
    dy: number;
    config: RoutingConfig;
    weights: EdgeRoutingWeights;
    baseCost: number;
    obstacles: Rectangle[];
    usage?: PortUsage;
}

export interface CostResult {
    totalCost: number;
    breakdown: {
        length: number;
        turns: number;
        crossings: number;
        direction: number;
        usage: number;
        [key: string]: number;
    };
}

// ============================================================================
// 路径结果
// ============================================================================

export interface PathResult {
    points: Point[];
    type: EdgeType;
    sourceHandle: string;
    targetHandle: string;
    cost: number;
    metadata?: {
        algorithm?: string;
        duration?: number;
        iterations?: number;
    };
}

export enum EdgeType {
    STRAIGHT = 'straight',
    BEZIER = 'default',
    STEP = 'step',
    SMOOTHSTEP = 'smoothstep',
    ADVANCED_SMART_STRAIGHT = 'advanced-smart-straight',
    ADVANCED_SMART_BEZIER = 'advanced-smart-bezier',
    ADVANCED_SMART_STEP = 'advanced-smart-step',
}

// ============================================================================
// 几何分析
// ============================================================================

export interface GeometryAnalysis {
    dx: number;
    dy: number;
    distance: number;
    angle: number; // degrees
    isHorizontalDominant: boolean;
    isVerticalDominant: boolean;
    isDiagonal: boolean;
    isBackwards: boolean;
    layoutDirection: string;
}

export interface AlignmentInfo {
    isAligned: boolean;
    alignAxis: 'horizontal' | 'vertical' | 'none';
    offset: number;
}

// ============================================================================
// 插件系统
// ============================================================================

export interface RoutingPlugin {
    name: string;
    priority: number;
    evaluate(context: CostContext): number;
    canApply?(context: CostContext): boolean;
}

export interface PluginRegistry {
    register(plugin: RoutingPlugin): void;
    unregister(name: string): void;
    getPlugins(): RoutingPlugin[];
    evaluateAll(context: CostContext): number;
}

// ============================================================================
// 路由决策结果
// ============================================================================

export interface RoutingDecision {
    type: EdgeType;
    sourceHandle: string;
    targetHandle: string;
    autoSource: boolean;
    autoTarget: boolean;
    computedPath: Point[];
    cost: number;
    algorithm: string;
}
