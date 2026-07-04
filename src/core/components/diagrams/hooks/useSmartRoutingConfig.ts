/**
 * 共享路由配置管理
 * 
 * 统一了设计器 (FlowchartDesigner) 和通用标准流程图 (GenericStandardDiagram)
 * 的路由参数设置与 autoPathSelection 同步逻辑。
 */
import { diagramConfigManager, type EdgeConfig, type DiagramConfig } from '../../config/DiagramConfig';
import { LayeredConfigManager, ConfigLayer } from '../../../config/LayeredConfigManager';
import {
    logSmartRoutingConfigLayerSyncFailure,
    logSmartRoutingConfigSyncFailure,
} from './diagramInteractionLogging';

// ─── 类型定义 ───────────────────────────────────────────────────

/**
 * 路由参数档位函数
 * 接收当前 EdgeConfig，返回需要合并的覆盖值。
 * 使用 `typeof prev.xxx === 'number' ? prev.xxx : default` 模式可兼容面板已设值。
 */
export type RoutingProfile = (prev: EdgeConfig) => Partial<EdgeConfig>;

/** LayeredConfigManager 的键值覆盖映射 */
export type LayeredOverrides = Record<string, unknown>;

// ─── 工具函数 ───────────────────────────────────────────────────

const getNumericWeight = (
    weights: EdgeConfig['handleWeights'],
    key: string,
    fallback: number,
): number => {
    const value = weights?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

/**
 * 将 autoPathSelection 同步到 DiagramConfig + LayeredConfigManager。
 * 仅在值不一致时写入，避免无效更新。
 */
export function syncAutoPathSelection(enabled: boolean): void {
    try {
        const cfg = diagramConfigManager.getConfig();
        const prev = (cfg?.edge || {}) as EdgeConfig;

        if (prev.autoPathSelection !== enabled) {
            diagramConfigManager.updateConfig({
                edge: { ...prev, autoPathSelection: enabled }
            } as Partial<DiagramConfig>);
            try {
                const layered = LayeredConfigManager.getInstance();
                layered.set('diagram.edge.autoPathType', enabled, ConfigLayer.USER);
            } catch (e) {
                logSmartRoutingConfigLayerSyncFailure(e);
            }
        }
    } catch (e) { logSmartRoutingConfigSyncFailure(e); }
}

/**
 * 将路由参数档位应用到全局 EdgeConfig，可选同步 LayeredConfig 覆盖值。
 * 返回一个 cleanup 函数，调用后恢复应用前的原始配置。
 */
export function applyRoutingProfile(
    profile: RoutingProfile,
    layeredOverrides?: LayeredOverrides,
): () => void {
    const prev = (diagramConfigManager.getConfig()?.edge || {}) as EdgeConfig;
    const overrides = profile(prev);

    // 深度合并 handleWeights，避免覆盖丢失其他权重字段
    const mergedWeights = overrides.handleWeights
        ? { ...(prev.handleWeights || {}), ...overrides.handleWeights }
        : prev.handleWeights;

    const next: EdgeConfig = {
        ...prev,
        ...overrides,
        ...(mergedWeights ? { handleWeights: mergedWeights } : {}),
    };

    diagramConfigManager.updateConfig({ edge: next } as Partial<DiagramConfig>);

    // 同步 LayeredConfig 覆盖值
    if (layeredOverrides) {
        try {
            const layered = LayeredConfigManager.getInstance();
            for (const [key, value] of Object.entries(layeredOverrides)) {
                layered.set(key, value, ConfigLayer.USER);
            }
        } catch { void 0; }
    }

    // cleanup: 恢复应用前的配置
    return () => {
        try {
            diagramConfigManager.updateConfig({ edge: prev } as Partial<DiagramConfig>);
        } catch { void 0; }
    };
}

// ─── 预定义档位 ─────────────────────────────────────────────────

/**
 * 设计器路由档位
 * 特征：简洁权重、ignoreContainers=true（容器不参与避障）
 */
export const DESIGNER_ROUTING_PROFILE: RoutingProfile = (prev) => ({
    handleSelectionPolicy: 'respect',
    directionalHandlePolicy: 'force',
    crossDomainVerticalPrefer: true,
    preferOrthogonalInDomain: true,
    ignoreContainers: true,
    gridAStarEnabled: true,
    orthogonalSamplingEnabled: true,
    handleWeights: {
        ...(prev.handleWeights || {}),
        detourPenalty: 600,
        turn: 12,
    },
});

/**
 * 通用标准流程图路由档位
 * 特征：含跨域偏好/车道钳制/域正交偏好，ignoreContainers=false
 * 使用 typeof prev 模式兼容面板已设值
 */
export const STANDARD_ROUTING_PROFILE: RoutingProfile = (prev) => ({
    // 基础路由参数（原 Effect 1）
    handleSelectionPolicy: 'respect',
    directionalHandlePolicy: 'force',
    crossDomainVerticalPrefer: true,
    crossDomainBias: typeof prev.crossDomainBias === 'number' ? prev.crossDomainBias : 1.0,
    gridAStarEnabled: true,
    gridAStarGridSize: typeof prev.gridAStarGridSize === 'number' ? prev.gridAStarGridSize : 32,
    gridAStarMaxExpansions: typeof prev.gridAStarMaxExpansions === 'number' ? prev.gridAStarMaxExpansions : 600,
    orthogonalSamplingEnabled: true,
    orthogonalGridSize: typeof prev.orthogonalGridSize === 'number' ? prev.orthogonalGridSize : 32,
    orthogonalSampleBudget: typeof prev.orthogonalSampleBudget === 'number' ? prev.orthogonalSampleBudget : 10,
    angleToleranceDeg: typeof prev.angleToleranceDeg === 'number' ? prev.angleToleranceDeg : 42,
    bezierDistanceThreshold: typeof prev.bezierDistanceThreshold === 'number' ? prev.bezierDistanceThreshold : 180,
    detourLimitRatio: typeof prev.detourLimitRatio === 'number' ? prev.detourLimitRatio : 3.5,
    axisAlignTolerance: typeof prev.axisAlignTolerance === 'number' ? prev.axisAlignTolerance : 10,

    // 域偏好参数（原 Effect 3，其中 ignoreContainers 覆盖 Effect 1 的 true → false）
    preferOrthogonalInDomain: true,
    domainOrthogonalBias: typeof prev.domainOrthogonalBias === 'number' ? prev.domainOrthogonalBias : 0.7,
    ignoreContainers: false,
    laneClamp: true,
    disableDomainInfluence: false,

    // 合并后的权重（原 Effect 1 + Effect 3 的 handleWeights 合并）
    handleWeights: {
        tbBias: getNumericWeight(prev.handleWeights, 'tbBias', 220),
        lrBias: getNumericWeight(prev.handleWeights, 'lrBias', 140),
        usagePenalty: getNumericWeight(prev.handleWeights, 'usagePenalty', 12),
        turn: getNumericWeight(prev.handleWeights, 'turn', 12),
        detourPenalty: getNumericWeight(prev.handleWeights, 'detourPenalty', 600),
        crossDomainPenalty: getNumericWeight(prev.handleWeights, 'crossDomainPenalty', 8),
        exitContainerPenalty: getNumericWeight(prev.handleWeights, 'exitContainerPenalty', 10),
    },
});

/**
 * 通用标准流程图的 LayeredConfig 覆盖值
 * 对应原 GenericStandardDiagram Effect 3 的 LayeredConfig 写入
 */
export const STANDARD_LAYERED_OVERRIDES: LayeredOverrides = {
    'diagram.edge.crossDomainVerticalPrefer': true,
    'diagram.edge.preferOrthogonalInDomain': true,
    'diagram.edge.disableDomainInfluence': false,
    'diagram.edge.laneClamp': true,
};
