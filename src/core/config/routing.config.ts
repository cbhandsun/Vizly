/**
 * Routing Configuration Presets
 * 
 * Provides three standard presets optimized for different scenarios:
 * - FAST: Minimal processing, optimized for speed
 * - QUALITY: Maximum quality, slower but best visual results
 * - BALANCED: Good balance between speed and quality (default)
 */

import { UnifiedRoutingConfig, createDefaultRoutingConfig } from '../types/routing';

export enum RoutingPreset {
    FAST = 'FAST',
    QUALITY = 'QUALITY',
    BALANCED = 'BALANCED',
    COMPACT = 'COMPACT',   // [P3-SVG] 紧凑模式
    CLEAR = 'CLEAR',       // [P3-SVG] 清晰模式
    DENSE = 'DENSE'        // [P3-SVG] 密集图模式
}

/**
 * FAST预设：性能优先
 * 
 * 适用场景：
 * - 大规模图（500+节点）
 * - 实时交互（拖拽、缩放）
 * - 性能受限环境
 * 
 * 特点：
 * - 粗网格（gridSize: 20）
 * - 禁用VG（useVisibilityGraph: false）
 * - 简化后处理
 * - 预计性能提升：2-3倍
 */
export const FAST_PRESET: UnifiedRoutingConfig = {
    algorithm: {
        gridSize: 20,
        useVisibilityGraph: false,
        visibilityGraphThreshold: 100,
        enableJPS: false
    },
    costs: {
        normal: 10,
        bufferZoneClose: 1000,
        bufferZoneFar: 50,
        directionChange: 100,
        lineOccupied: 2000,
        lineCross: 10000,
        obstacle: 10000000,
        mergePath: 1
    },
    bus: {
        spacing: 30,
        manyToOneSpacing: 5,
        trunkBase: 40,
        trunkMultiplier: 5,
        enableAdaptiveSeparation: false
    },
    portSelection: {
        bonusCostThreshold: -50,
        lowConfidenceThreshold: 0.3,
        highConfidenceThreshold: 0.7,
        preferGeometryOverBus: true,
        enableObstacleAwareness: false,
        portUsageWeight: 30,
        enableDynamicPorts: false,
        portSlidePadding: 8
    },
    channel: {
        enableChannelRouting: false,
        enableEdgeBundling: false,
        channelSpacing: 20,
        minEdgeSeparation: 15,
        bundleStrength: 0.3
    },
    postProcessing: {
        enableSimplification: true,
        enableNudge: false,
        enableOrthogonalization: true,
        borderRadius: 16,
        minFirstSegment: 40,
        minLastSegment: 40,
        redundantBendThreshold: 60,
        finalRedundantBendThreshold: 15,
        nudgeSpacing: 6,
        nudgeSearchLimit: 120,
        enableWaypointRefinement: false,
        waypointRefinementPasses: 1,
        maxWaypointRefineEdgesPerPass: 24,
        enableWaypointReroute: false,
        maxWaypointRerouteEdges: 0,
        waypointHardCrossingWeight: 800,
        waypointSoftObstacleWeight: 80,
        waypointSoftNearMissWeight: 20,
        waypointSoftNearMissPadding: 8,
        waypointTurnbackWeight: 12,
        waypointBendWeight: 1
    },
    offsets: {
        source: 30,
        target: 30
    },
    debug: false
};

/**
 * QUALITY预设：质量优先
 * 
 * 适用场景：
 * - 中小规模图（<200节点）
 * - 演示和展示
 * - 静态布局
 * 
 * 特点：
 * - 细网格（gridSize: 10）
 * - 启用VG（useVisibilityGraph: true）
 * - 完整后处理
 * - 预计性能影响：1.5-2倍慢于BALANCED
 */
export const QUALITY_PRESET: UnifiedRoutingConfig = {
    algorithm: {
        gridSize: 10,
        useVisibilityGraph: true,
        visibilityGraphThreshold: 5,
        enableJPS: false
    },
    costs: {
        normal: 10,
        bufferZoneClose: 3000,
        bufferZoneFar: 150,
        directionChange: 300,
        lineOccupied: 8000,
        lineCross: 80000,
        obstacle: 10000000,
        mergePath: 1
    },
    bus: {
        spacing: 20,
        manyToOneSpacing: 2,
        trunkBase: 80,
        trunkMultiplier: 10,
        enableAdaptiveSeparation: true
    },
    portSelection: {
        bonusCostThreshold: -150,
        lowConfidenceThreshold: 0.15,
        highConfidenceThreshold: 0.85,
        preferGeometryOverBus: false, // [FIX] Enforce Bus/Trunk over Geometry
        enableObstacleAwareness: true,
        portUsageWeight: 80,
        enableDynamicPorts: true,
        portSlidePadding: 15
    },
    channel: {
        enableChannelRouting: true,
        enableEdgeBundling: true,
        channelSpacing: 12,
        minEdgeSeparation: 8,
        bundleStrength: 0.8
    },
    postProcessing: {
        enableSimplification: true,
        enableNudge: true,
        enableOrthogonalization: true,
        borderRadius: 30,
        minFirstSegment: 65,
        minLastSegment: 70,
        redundantBendThreshold: 60,
        finalRedundantBendThreshold: 15,
        nudgeSpacing: 6,
        nudgeSearchLimit: 120,
        enableWaypointRefinement: true,
        waypointRefinementPasses: 3,
        maxWaypointRefineEdgesPerPass: 120,
        enableWaypointReroute: true,
        maxWaypointRerouteEdges: 16,
        waypointHardCrossingWeight: 1600,
        waypointSoftObstacleWeight: 180,
        waypointSoftNearMissWeight: 45,
        waypointSoftNearMissPadding: 12,
        waypointTurnbackWeight: 20,
        waypointBendWeight: 2
    },
    offsets: {
        source: 40,
        target: 40
    },
    debug: false
};

/**
 * BALANCED预设：平衡（默认）
 * 
 * 适用场景：
 * - 通用场景
 * - 中等规模图（100-500节点）
 * - 标准应用
 * 
 * 特点：
 * - 中等网格（gridSize: 15）
 * - 智能VG（根据障碍物数量）
 * - 标准后处理
 */
export const BALANCED_PRESET: UnifiedRoutingConfig = createDefaultRoutingConfig();

// ─── [P3-SVG] 场景优化预设 ───

/**
 * COMPACT 预设：紧凑模式
 * 
 * 适用场景：密集布局、空间有限的图
 * 核心策略：加重方向变更成本减少弯折，降低缓冲允许贴近障碍
 */
export const COMPACT_PRESET: UnifiedRoutingConfig = mergeConfig(
    createDefaultRoutingConfig(),
    {
        algorithm: { gridSize: 8 },
        costs: {
            directionChange: 400,
            bufferZoneClose: 800,
            bufferZoneFar: 50,
        },
        bus: { spacing: 20 },
        postProcessing: {
            borderRadius: 16,
            nudgeSpacing: 8,
            minFirstSegment: 38,
            minLastSegment: 38,
        },
        offsets: { source: 25, target: 25 },
    }
);

/**
 * CLEAR 预设：清晰模式
 * 
 * 适用场景：演示、打印、文档导出
 * 核心策略：加重交叉/线占用/缓冲成本，极力避免任何重叠
 */
export const CLEAR_PRESET: UnifiedRoutingConfig = mergeConfig(
    createDefaultRoutingConfig(),
    {
        algorithm: { gridSize: 15 },
        costs: {
            directionChange: 100,
            bufferZoneClose: 5000,
            bufferZoneFar: 300,
            lineOccupied: 10000,
            lineCross: 100000,
        },
        bus: { spacing: 40 },
        postProcessing: {
            borderRadius: 28,
            nudgeSpacing: 18,
            minFirstSegment: 62,
            minLastSegment: 62,
            waypointRefinementPasses: 3,
            maxWaypointRefineEdgesPerPass: 120,
            maxWaypointRerouteEdges: 16,
            waypointHardCrossingWeight: 1800,
            waypointSoftObstacleWeight: 220,
            waypointSoftNearMissWeight: 60,
            waypointSoftNearMissPadding: 14,
        },
        offsets: { source: 50, target: 50 },
    }
);

/**
 * DENSE 预设：密集图优化
 * 
 * 适用场景：50+ 节点的大型图
 * 核心策略：提高 VG 使用率，加大搜索预算，启用通道和简化
 */
export const DENSE_PRESET: UnifiedRoutingConfig = mergeConfig(
    createDefaultRoutingConfig(),
    {
        algorithm: {
            gridSize: 12,
            visibilityGraphThreshold: 4,
        },
        costs: {
            directionChange: 150,
            lineOccupied: 8000,
            lineCross: 80000,
        },
        bus: {
            spacing: 25,
            enableAdaptiveSeparation: true,
        },
        channel: {
            enableChannelRouting: true,
            channelSpacing: 15,
            minEdgeSeparation: 8,
        },
        postProcessing: {
            nudgeSpacing: 10,
            nudgeSearchLimit: 200,
            simplificationLevel: 'high',
            waypointRefinementPasses: 2,
            maxWaypointRefineEdgesPerPass: 140,
            maxWaypointRerouteEdges: 10,
            waypointHardCrossingWeight: 1200,
            waypointSoftObstacleWeight: 130,
            waypointSoftNearMissWeight: 30,
        },
    }
);

/**
 * 预设映射表
 */
export const PRESETS: Record<RoutingPreset, UnifiedRoutingConfig> = {
    [RoutingPreset.FAST]: FAST_PRESET,
    [RoutingPreset.QUALITY]: QUALITY_PRESET,
    [RoutingPreset.BALANCED]: BALANCED_PRESET,
    [RoutingPreset.COMPACT]: COMPACT_PRESET,
    [RoutingPreset.CLEAR]: CLEAR_PRESET,
    [RoutingPreset.DENSE]: DENSE_PRESET,
};

/**
 * 获取预设配置
 * 
 * @param preset 预设名称
 * @returns 配置对象
 */
export function getPresetConfig(preset: RoutingPreset): UnifiedRoutingConfig {
    return PRESETS[preset];
}

/**
 * 路由配置更新类型（支持一级深度的 Partial）
 */
export type RoutingConfigUpdate = {
    algorithm?: Partial<UnifiedRoutingConfig['algorithm']>;
    costs?: Partial<UnifiedRoutingConfig['costs']>;
    bus?: Partial<UnifiedRoutingConfig['bus']>;
    portSelection?: Partial<UnifiedRoutingConfig['portSelection']>;
    channel?: Partial<UnifiedRoutingConfig['channel']>;
    postProcessing?: Partial<UnifiedRoutingConfig['postProcessing']>;
    offsets?: Partial<UnifiedRoutingConfig['offsets']>;
    debug?: boolean;
};

/**
 * 深度合并配置对象
 * 
 * @param base 基础配置
 * @param overrides 覆盖配置
 * @returns 合并后的配置
 */
export function mergeConfig(
    base: UnifiedRoutingConfig,
    overrides: RoutingConfigUpdate
): UnifiedRoutingConfig {
    return {
        algorithm: { ...base.algorithm, ...overrides.algorithm },
        costs: { ...base.costs, ...overrides.costs },
        bus: { ...base.bus, ...overrides.bus },
        portSelection: { ...base.portSelection, ...overrides.portSelection },
        channel: { ...base.channel, ...overrides.channel },
        postProcessing: { ...base.postProcessing, ...overrides.postProcessing },
        offsets: { ...base.offsets, ...overrides.offsets },
        debug: overrides.debug ?? base.debug
    };
}

/**
 * 从预设创建定制配置
 * 
 * @param preset 基础预设
 * @param overrides 定制选项
 * @returns 定制配置
 * 
 * @example
 * ```typescript
 * const config = createCustomConfig(RoutingPreset.FAST, {
 *     algorithm: { gridSize: 15 }
 * });
 * ```
 */
export function createCustomConfig(
    preset: RoutingPreset,
    overrides: RoutingConfigUpdate
): UnifiedRoutingConfig {
    const baseConfig = getPresetConfig(preset);
    return mergeConfig(baseConfig, overrides);
}

/**
 * 配置比较：列出两个配置的差异
 * 
 * @param config1 配置1
 * @param config2 配置2
 * @returns 差异列表
 */
export function compareConfigs(
    config1: UnifiedRoutingConfig,
    config2: UnifiedRoutingConfig
): string[] {
    const differences: string[] = [];

    // Algorithm differences
    Object.keys(config1.algorithm).forEach(key => {
        const k = key as keyof typeof config1.algorithm;
        if (config1.algorithm[k] !== config2.algorithm[k]) {
            differences.push(`algorithm.${key}: ${config1.algorithm[k]} → ${config2.algorithm[k]}`);
        }
    });

    // Cost differences
    Object.keys(config1.costs).forEach(key => {
        const k = key as keyof typeof config1.costs;
        if (config1.costs[k] !== config2.costs[k]) {
            differences.push(`costs.${key}: ${config1.costs[k]} → ${config2.costs[k]}`);
        }
    });

    // Bus differences
    Object.keys(config1.bus).forEach(key => {
        const k = key as keyof typeof config1.bus;
        if (config1.bus[k] !== config2.bus[k]) {
            differences.push(`bus.${key}: ${config1.bus[k]} → ${config2.bus[k]}`);
        }
    });

    return differences;
}
