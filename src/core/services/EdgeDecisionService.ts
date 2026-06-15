import type { Node } from '@xyflow/react';
import { EdgeType } from '../factories/EdgeFactory';
import { diagramConfigManager } from '../components/config/DiagramConfig';
import { decideEdgeRouting } from '../utils/HandlePicker';
import { LayeredConfigManager } from '../config/LayeredConfigManager';

type Point = { x: number; y: number };

type DiagramConfigSnapshot = {
    edge?: EdgeConfigSnapshot;
    layout?: { direction?: unknown };
};

type EdgeConfigSnapshot = Record<string, unknown> & {
    angleToleranceDeg?: unknown;
    bezierDistanceThreshold?: unknown;
    obstacleScopePadding?: unknown;
    corridorObstacleThreshold?: unknown;
    directionalHandlePolicy?: unknown;
    verticalBiasThreshold?: unknown;
    horizontalBiasThreshold?: unknown;
    obstaclePadding?: unknown;
    orthogonalSamplingEnabled?: unknown;
    orthogonalGridSize?: unknown;
    orthogonalSampleBudget?: unknown;
    gridAStarEnabled?: unknown;
    gridAStarGridSize?: unknown;
    gridAStarMaxExpansions?: unknown;
    ignoreContainers?: unknown;
    crossDomainVerticalPrefer?: unknown;
    preferLROnHorizontal?: unknown;
};

type RoutingDecision = {
    type: EdgeType;
    sourceHandle?: string | null;
    targetHandle?: string | null;
};

type MutableRoutingDecision = {
    type: EdgeType;
    sourceHandle: string;
    targetHandle: string;
};

type NodeDataRecord = Record<string, unknown> & {
    domainClass?: unknown;
    domain?: unknown;
};

type GeometryNode = Node & {
    positionAbsolute?: Point;
    measured?: { width?: number; height?: number };
    data?: NodeDataRecord;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const getDiagramConfig = (): DiagramConfigSnapshot => {
    const config = diagramConfigManager.getConfig();
    return isRecord(config) ? config as DiagramConfigSnapshot : {};
};

const asNumber = (value: unknown, fallback: number): number => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
};

const getNodePosition = (node: GeometryNode): Point | undefined =>
    node.position ?? node.positionAbsolute;

const getNodeWidth = (node: GeometryNode): number =>
    typeof node.width === 'number' ? node.width : (node.measured?.width ?? 0);

const getNodeHeight = (node: GeometryNode): number =>
    typeof node.height === 'number' ? node.height : (node.measured?.height ?? 0);

/**
 * Service to encapsulate complex edge routing decisions.
 * Moved from DiagramOrchestrator to strict Separation of Concerns.
 */
export class EdgeDecisionService {
    private configManager: LayeredConfigManager;

    constructor() {
        this.configManager = LayeredConfigManager.getInstance();
    }

    /**
     * Automatically decides the best edge type and handles based on geometry and configuration.
     */
    public autoDecideHandlesAndType(
        s: Node | undefined,
        t: Node | undefined,
        processedNodes: Node[],
        preferSmart: boolean,
        globalPath: string,
        enableAutoType: boolean,
        presetType?: EdgeType,
        presetSourceHandle?: string | null,
        presetTargetHandle?: string | null,
        role?: string,
        layoutDirection?: string,
        axisAlignTolerance?: number,
        shortHRatio?: number,
        shortVRatio?: number,
        orthogonalInDomain?: boolean,
        domainBias?: number,
        usageSourceMap?: Map<string, Record<string, number>>,
        usageTargetMap?: Map<string, Record<string, number>>,
        preferDistinctSides?: boolean,
        smoothFallback?: string
    ): RoutingDecision {

        // 1. Determine fallback type based on global settings
        const fallbackType = (() => {
            if (preferSmart) {
                // 'auto' 和未识别值都应该走 step（直角折线），不走 bezier
                if (globalPath === 'auto') return EdgeType.ADVANCED_SMART_STEP;
                if (globalPath.includes('step')) return EdgeType.ADVANCED_SMART_STEP;
                if (globalPath.includes('straight')) return EdgeType.ADVANCED_SMART_STRAIGHT;
                if (globalPath.includes('smooth')) {
                    if (smoothFallback === 'native') return EdgeType.SMOOTHSTEP;
                    if (smoothFallback === 'straight') return EdgeType.ADVANCED_SMART_STRAIGHT;
                    if (smoothFallback === 'step') return EdgeType.ADVANCED_SMART_STEP;
                    return EdgeType.ADVANCED_SMART_BEZIER;
                }
                if (globalPath.includes('bezier')) return EdgeType.ADVANCED_SMART_BEZIER;
                return EdgeType.ADVANCED_SMART_STEP; // 兜底改为 step
            }
            if (globalPath === 'auto') return EdgeType.STEP;
            if (globalPath.includes('step')) return EdgeType.STEP;
            if (globalPath.includes('straight')) return EdgeType.STRAIGHT;
            if (globalPath.includes('smooth')) return EdgeType.SMOOTHSTEP;
            if (globalPath.includes('bezier')) return EdgeType.BEZIER;
            return EdgeType.STEP;
        })();

        const typeKeep = presetType ?? fallbackType;

        // Fast exit if nodes are missing
        if (!s || !t) {
            return { type: typeKeep, sourceHandle: presetSourceHandle, targetHandle: presetTargetHandle };
        }

        // 2. Prepare routing configuration
        const cfgEdgeLocal = getDiagramConfig().edge ?? {};

        // 3. Delegate to pure geometry utility
        const routing = decideEdgeRouting(
            s,
            t,
            processedNodes,
            {
                mode: preferSmart ? 'advanced-smart' : 'native',
                globalPath,
                autoPathSelection: enableAutoType,
                angleToleranceDeg: asNumber(cfgEdgeLocal.angleToleranceDeg, 36),
                bezierDistanceThreshold: asNumber(cfgEdgeLocal.bezierDistanceThreshold, 280),
                obstacleScopePadding: preferSmart ? asNumber(cfgEdgeLocal.obstacleScopePadding, 160) : Math.max(40, asNumber(cfgEdgeLocal.obstacleScopePadding, 80)),
                corridorObstacleThreshold: asNumber(cfgEdgeLocal.corridorObstacleThreshold, 6),
                directionalHandlePolicy: String(cfgEdgeLocal.directionalHandlePolicy || 'force'),
                verticalBiasThreshold: asNumber(cfgEdgeLocal.verticalBiasThreshold, 1.2),
                obstaclePadding: preferSmart ? asNumber(cfgEdgeLocal.obstaclePadding, 24) : Math.max(10, asNumber(cfgEdgeLocal.obstaclePadding, 16)),
                orthogonalSamplingEnabled: preferSmart ? Boolean(cfgEdgeLocal.orthogonalSamplingEnabled ?? true) : false,
                orthogonalGridSize: asNumber(cfgEdgeLocal.orthogonalGridSize, 40),
                orthogonalSampleBudget: preferSmart ? asNumber(cfgEdgeLocal.orthogonalSampleBudget, 3) : 0,
                gridAStarEnabled: preferSmart ? Boolean(cfgEdgeLocal.gridAStarEnabled ?? true) : false,
                gridAStarGridSize: asNumber(cfgEdgeLocal.gridAStarGridSize, 40),
                gridAStarMaxExpansions: preferSmart ? asNumber(cfgEdgeLocal.gridAStarMaxExpansions, 300) : 0,
                ignoreContainers: Boolean(cfgEdgeLocal.ignoreContainers ?? false),
                layoutDirection: layoutDirection || 'LR'
            },
            {
                source: s ? (usageSourceMap?.get(String(s.id)) || undefined) : undefined,
                target: t ? (usageTargetMap?.get(String(t.id)) || undefined) : undefined,
            },
            Boolean(preferDistinctSides ?? true)
        );

        // 4. Post-Correction Logic (Orchestrator-specific awareness)
        const enablePostCorrection = Boolean(
            this.configManager.get<boolean>('diagram.edge.enablePostCorrection', false)
        );

        if (enablePostCorrection) {
            this.applyPostCorrection(
                s, t, routing, preferSmart, layoutDirection, cfgEdgeLocal
            );
        }

        return { type: routing.type, sourceHandle: routing.sourceHandle, targetHandle: routing.targetHandle };
    }

    /**
     * Applies corrective logic based on global layout direction and domain constraints.
     */
    private applyPostCorrection(
        s: Node,
        t: Node,
        routing: MutableRoutingDecision,
        preferSmart: boolean,
        layoutDirection: string | undefined,
        cfgEdgeLocal: EdgeConfigSnapshot
    ) {
        try {
            const sourceNode = s as GeometryNode;
            const targetNode = t as GeometryNode;
            const sPos = getNodePosition(sourceNode);
            const tPos = getNodePosition(targetNode);
            const sW = getNodeWidth(sourceNode);
            const sH = getNodeHeight(sourceNode);
            const tW = getNodeWidth(targetNode);
            const tH = getNodeHeight(targetNode);

            if (sPos && tPos && sW && sH && tW && tH) {
                const sCenter = { x: sPos.x + sW / 2, y: sPos.y + sH / 2 };
                const tCenter = { x: tPos.x + tW / 2, y: tPos.y + tH / 2 };
                const dx2 = tCenter.x - sCenter.x;
                const dy2 = tCenter.y - sCenter.y;

                const vBias = Math.max(0.8, Math.min(2.0, asNumber(cfgEdgeLocal.verticalBiasThreshold, 1.2)));
                const hBias = Math.max(0.6, asNumber(getDiagramConfig().edge?.horizontalBiasThreshold, 1.0));

                const isVerticalMain = Math.abs(dy2) >= Math.abs(dx2) * vBias;
                const isHorizontalMain = Math.abs(dx2) >= Math.abs(dy2) * hBias;

                const preferVerticalByLayout = isVerticalMain;

                const sDomain = String(sourceNode.data?.domainClass || sourceNode.data?.domain || '') || '';
                const tDomain = String(targetNode.data?.domainClass || targetNode.data?.domain || '') || '';
                const crossDomain = sDomain !== tDomain;
                const crossPrefer = Boolean(cfgEdgeLocal.crossDomainVerticalPrefer ?? true);

                // [FIX C-8] 使用互斥分支（if...else if）防止垂直和水平修正互相覆盖 handle
                // 原来两段独立 if 都会写 sourceHandle/targetHandle，第二段会覆盖第一段
                if (!preferSmart && preferVerticalByLayout && (isVerticalMain || (crossDomain && crossPrefer))) {
                    const desired = dy2 >= 0 ? { s: 'b', t: 't' } : { s: 't', t: 'b' };
                    routing.sourceHandle = desired.s;
                    routing.targetHandle = desired.t;
                } else {
                    const preferLR = Boolean(getDiagramConfig().edge?.preferLROnHorizontal ?? true);
                    if (preferLR && isHorizontalMain) {
                        const desiredLR = dx2 >= 0 ? { s: 'r', t: 'l' } : { s: 'l', t: 'r' };
                        routing.sourceHandle = desiredLR.s;
                        routing.targetHandle = desiredLR.t;
                    }
                }

            }
        } catch {
            // Safe failure, keep original routing
            void 0;
        }
    }
}
