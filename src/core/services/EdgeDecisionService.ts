// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Node } from '@xyflow/react';
import { EdgeType } from '../factories/EdgeFactory';
import { diagramConfigManager } from '../components/config/DiagramConfig';
import { decideEdgeRouting } from '../utils/HandlePicker';
import { LayeredConfigManager } from '../config/LayeredConfigManager';

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
    ): { type: EdgeType; sourceHandle?: string | null; targetHandle?: string | null } {

        // 1. Determine fallback type based on global settings
        const fallbackType = (() => {
            if (preferSmart) {
                if (globalPath.includes('step')) return EdgeType.ADVANCED_SMART_STEP;
                if (globalPath.includes('straight')) return EdgeType.ADVANCED_SMART_STRAIGHT;
                if (globalPath.includes('smooth')) {
                    if (smoothFallback === 'native') return EdgeType.SMOOTHSTEP;
                    if (smoothFallback === 'straight') return EdgeType.ADVANCED_SMART_STRAIGHT;
                    if (smoothFallback === 'step') return EdgeType.ADVANCED_SMART_STEP;
                    return EdgeType.ADVANCED_SMART_BEZIER;
                }
                if (globalPath.includes('bezier')) return EdgeType.ADVANCED_SMART_BEZIER;
                return EdgeType.ADVANCED_SMART_BEZIER;
            }
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
        const cfgEdgeLocal = (diagramConfigManager.getConfig() as any)?.edge || {};

        // 3. Delegate to pure geometry utility
        const routing = decideEdgeRouting(
            s as any,
            t as any,
            processedNodes as any,
            {
                mode: preferSmart ? 'advanced-smart' : 'native',
                globalPath,
                autoPathSelection: enableAutoType,
                angleToleranceDeg: Number(cfgEdgeLocal.angleToleranceDeg ?? 36),
                bezierDistanceThreshold: Number(cfgEdgeLocal.bezierDistanceThreshold ?? 280),
                obstacleScopePadding: preferSmart ? Number(cfgEdgeLocal.obstacleScopePadding ?? 160) : Math.max(40, Number(cfgEdgeLocal.obstacleScopePadding ?? 80)),
                corridorObstacleThreshold: Number(cfgEdgeLocal.corridorObstacleThreshold ?? 6),
                directionalHandlePolicy: String(cfgEdgeLocal.directionalHandlePolicy || 'force') as any,
                verticalBiasThreshold: Number(cfgEdgeLocal.verticalBiasThreshold ?? 1.2),
                obstaclePadding: preferSmart ? Number(cfgEdgeLocal.obstaclePadding ?? 24) : Math.max(10, Number(cfgEdgeLocal.obstaclePadding ?? 16)),
                orthogonalSamplingEnabled: preferSmart ? Boolean(cfgEdgeLocal.orthogonalSamplingEnabled ?? true) : false,
                orthogonalGridSize: Number(cfgEdgeLocal.orthogonalGridSize ?? 40),
                orthogonalSampleBudget: preferSmart ? Number(cfgEdgeLocal.orthogonalSampleBudget ?? 3) : 0,
                gridAStarEnabled: preferSmart ? Boolean(cfgEdgeLocal.gridAStarEnabled ?? true) : false,
                gridAStarGridSize: Number(cfgEdgeLocal.gridAStarGridSize ?? 40),
                gridAStarMaxExpansions: preferSmart ? Number(cfgEdgeLocal.gridAStarMaxExpansions ?? 300) : 0,
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
        routing: any,
        preferSmart: boolean,
        layoutDirection: string | undefined,
        cfgEdgeLocal: any
    ) {
        try {
            const sPos = (s as any)?.position ?? (s as any)?.positionAbsolute;
            const tPos = (t as any)?.position ?? (t as any)?.positionAbsolute;
            const sW = ((s as any)?.width ?? (s as any)?.measured?.width ?? 0) as number;
            const sH = ((s as any)?.height ?? (s as any)?.measured?.height ?? 0) as number;
            const tW = ((t as any)?.width ?? (t as any)?.measured?.width ?? 0) as number;
            const tH = ((t as any)?.height ?? (t as any)?.measured?.height ?? 0) as number;

            if (sPos && tPos && sW && sH && tW && tH) {
                const sCenter = { x: sPos.x + sW / 2, y: sPos.y + sH / 2 };
                const tCenter = { x: tPos.x + tW / 2, y: tPos.y + tH / 2 };
                const dx2 = tCenter.x - sCenter.x;
                const dy2 = tCenter.y - sCenter.y;

                const vBias = Math.max(0.8, Math.min(2.0, Number(cfgEdgeLocal?.verticalBiasThreshold ?? 1.2)));
                const hBias = Math.max(0.6, Number((diagramConfigManager.getConfig() as any)?.edge?.horizontalBiasThreshold ?? 1.0));

                const isVerticalMain = Math.abs(dy2) >= Math.abs(dx2) * vBias;
                const isHorizontalMain = Math.abs(dx2) >= Math.abs(dy2) * hBias;

                const preferVerticalByLayout = isVerticalMain;

                const sDomain = String(((s as any)?.data || {})?.domainClass || ((s as any)?.data || {})?.domain || '') || '';
                const tDomain = String(((t as any)?.data || {})?.domainClass || ((t as any)?.data || {})?.domain || '') || '';
                const crossDomain = sDomain !== tDomain;
                const crossPrefer = Boolean((cfgEdgeLocal as any)?.crossDomainVerticalPrefer ?? true);

                // [FIX C-8] 使用互斥分支（if...else if）防止垂直和水平修正互相覆盖 handle
                // 原来两段独立 if 都会写 sourceHandle/targetHandle，第二段会覆盖第一段
                if (!preferSmart && preferVerticalByLayout && (isVerticalMain || (crossDomain && crossPrefer))) {
                    const desired = dy2 >= 0 ? { s: 'b', t: 't' } : { s: 't', t: 'b' };
                    (routing as any).sourceHandle = desired.s;
                    (routing as any).targetHandle = desired.t;
                } else {
                    const preferLR = !!(((diagramConfigManager.getConfig() as any)?.edge || {}).preferLROnHorizontal ?? true);
                    if (preferLR && isHorizontalMain) {
                        const desiredLR = dx2 >= 0 ? { s: 'r', t: 'l' } : { s: 'l', t: 'r' };
                        (routing as any).sourceHandle = desiredLR.s;
                        (routing as any).targetHandle = desiredLR.t;
                    }
                }

            }
        } catch {
            // Safe failure, keep original routing
            void 0;
        }
    }
}
