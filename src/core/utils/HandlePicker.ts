/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * HandlePicker Compatibility Layer
 * 本文件作为旧版 HandlePicker.ts 的替代品，负责将调用转发给新的路由系统。
 * 
 * @deprecated 请直接使用 src/routing 中的 EdgeRouter
 */

import {
    edgeRouter,
    EDGE_ROUTING_PRESETS,
    EdgeRoutingWeights,
    RoutingConfig,
    PortUsage,
    CostContext
} from '../routing';

import { EdgeType } from '../factories/EdgeFactory';
import { diagramConfigManager } from '../components/config/DiagramConfig';
import { analyzeGeometry } from '../algorithms/geometry-classifier';

// Re-export types for compatibility
export { EdgeType, EDGE_ROUTING_PRESETS };
export type { EdgeRoutingWeights, CostContext, RoutingConfig, PortUsage };

// Export helpers (P1, P4, P6, P8 features)
export * from '../routing/utils/EdgeRoutingHelpers';
export * from '../routing/utils/AdvancedRouting';

/**
 * 获取权重预设
 * (Forward to new system or keep simple implementation)
 */
export function getWeightPreset(
    presetName: string = 'default',
    customWeights?: Partial<EdgeRoutingWeights>
): EdgeRoutingWeights {
    const base = EDGE_ROUTING_PRESETS[presetName] || EDGE_ROUTING_PRESETS.default;
    if (customWeights) {
        return { ...base, ...customWeights };
    }
    return base;
}

/**
 * 注册路由插件
 * (Forward to CostEvaluator via EdgeRouter, or just shim it)
 */
export type CostPluginFn = (ctx: CostContext) => number;
export function registerRoutingPlugin(name: string, fn: CostPluginFn) {
    // 将旧版插件函数适配为新版 RoutingPlugin
    edgeRouter.use({
        name,
        priority: 10,
        evaluate: (ctx) => fn(ctx),
        canApply: () => true
    });
}

/**
 * Global handle assignment utility.
 * 智能分配全局端口：根据节点相对位置分配最佳把手
 * 策略：
 * 1. 计算 source 和 target 的中心点相对角度
 * 2. 将角度映射到四象限 (Top/Right/Bottom/Left)
 * 3. 优先使用相对的面作为连接点 (例如 A 在 B 上方，则 A 用 Bottom，B 用 Top)
 * 4. 收集所有边的推荐把手并返回，供 LayoutStrategy 应用到 Edge 对象上
 */
export function assignGlobalPorts(nodes: any[], edges: any[], _cfg: any): Record<string, { source?: string; target?: string }> {
    const result: Record<string, { source?: string; target?: string }> = {};
    if (!Array.isArray(nodes) || !Array.isArray(edges)) return result;

    const nodeMap = new Map<string, any>(nodes.map(n => [n.id, n]));
    const getAbsolutePosition = (node: any, visited?: Set<string>): { x: number; y: number } => {
        const abs = node?.computed?.positionAbsolute || node?.positionAbsolute;
        if (abs) return abs;
        const base = node?.position || { x: node?.x ?? 0, y: node?.y ?? 0 };
        const parentId = node?.parentId || node?.parentNode;
        if (!parentId) return base;
        const v = visited || new Set<string>();
        const id = String(node?.id ?? '');
        if (id && v.has(id)) return base;
        if (id) v.add(id);
        const parent = nodeMap.get(String(parentId));
        if (!parent) return base;
        const pAbs = getAbsolutePosition(parent, v);
        return { x: pAbs.x + (base.x ?? 0), y: pAbs.y + (base.y ?? 0) };
    };

    // 1. 聚合边信息 (Aggregation)
    const outEdges = new Map<string, any[]>();
    const inEdges = new Map<string, any[]>();

    for (const edge of edges) {
        if (!outEdges.has(edge.source)) outEdges.set(edge.source, []);
        const outList = outEdges.get(edge.source);
        if (outList) outList.push(edge);

        if (!inEdges.has(edge.target)) inEdges.set(edge.target, []);
        const inList = inEdges.get(edge.target);
        if (inList) inList.push(edge);
    }

    // 2. 辅助函数：计算单侧端口 (Hub Logic)
    const getBounds = (n: any) => {
        const pos = getAbsolutePosition(n);
        const x = (pos?.x ?? 0);
        const y = (pos?.y ?? 0);
        const w = (n.measured?.width ?? n.width ?? (n.style?.width as any) ?? 100);
        const h = (n.measured?.height ?? n.height ?? (n.style?.height as any) ?? 50);
        return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
    };

    /**
     * 计算一组节点相对于中心节点的“重心方向”
     * 返回建议的端口: 'top' | 'bottom' | 'left' | 'right'
     */
    const getDominantSide = (centerNode: any, relatives: any[]): string => {
        if (relatives.length === 0) return 'bottom';
        const c = getBounds(centerNode);

        // 计算所有相关节点的重心 (Center of Mass)
        let sumCx = 0, sumCy = 0;
        let validCount = 0;
        for (const rel of relatives) {
            if (!rel) continue;
            const b = getBounds(rel);
            sumCx += b.cx;
            sumCy += b.cy;
            validCount++;
        }
        if (validCount === 0) return 'bottom';

        const avgCx = sumCx / validCount;
        const avgCy = sumCy / validCount;

        // 虚拟一个“重心节点”进行方向判断
        const virtualTarget = { cx: avgCx, cy: avgCy }; // 简化对象

        // 使用之前的几何重叠逻辑判断重心方向
        const dx = virtualTarget.cx - c.cx;
        const dy = virtualTarget.cy - c.cy;

        // 简单斜率判断 (Bias towards vertical for Tree layouts if slightly ambiguous)
        // 但这里为了通用性，使用纯几何
        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? 'right' : 'left';
        } else {
            return dy > 0 ? 'bottom' : 'top';
        }
    };

    // 3. 遍历所有边，分别决定 Source 和 TargetHandle
    for (const edge of edges) {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) continue;

        let sHandle = 'bottom';
        let tHandle = 'top';

        // Source Side Decision
        const srcOut = outEdges.get(edge.source) || [];
        // 如果是 1-to-N Hub (出度 > 1)，使用聚合重心方向 (Hub Dominant Side)
        if (srcOut.length > 1) {
            // 获取所有 target 节点
            const targets = srcOut.map(e => nodeMap.get(e.target)).filter(Boolean);
            sHandle = getDominantSide(src, targets);
        } else {
            // 单独连接，退化为两点判定 (与之前逻辑一致)
            sHandle = getDominantSide(src, [tgt]);
        }

        // Target Side Decision
        const tgtIn = inEdges.get(edge.target) || [];
        // 如果是 N-to-1 Hub (入度 > 1)，使用聚合重心方向
        if (tgtIn.length > 1) {
            const sources = tgtIn.map(e => nodeMap.get(e.source)).filter(Boolean);
            tHandle = getDominantSide(tgt, sources);
        } else {
            // 单独连接，退化为两点判定
            tHandle = getDominantSide(tgt, [src]);
        }

        result[edge.id] = { source: sHandle, target: tHandle };
    }

    return result;
}

/**
 * 决策统一：连线类型选择 + 把手选择
 * (Proxy to EdgeRouter)
 */
export function decideEdgeRouting(
    sNode: any,
    tNode: any,
    allNodes: any[], // 新系统暂不需要 allNodes 进行 A*，除非在后续阶段启用
    cfg: any, // Use any for broad compatibility due to legacy config shapes
    usage?: { source?: Record<string, number>; target?: Record<string, number> },
    _preferDistinctSides: boolean = true
): { type: EdgeType; sourceHandle: string; targetHandle: string; autoSource: boolean; autoTarget: boolean; computedPath: Array<{ x: number; y: number }> } {

    const nodeMap = new Map<string, any>();
    if (Array.isArray(allNodes)) {
        for (const n of allNodes) {
            if (n?.id != null) nodeMap.set(String(n.id), n);
        }
    }
    const getAbsolutePosition = (node: any, visited?: Set<string>): { x: number; y: number } => {
        const abs = node?.computed?.positionAbsolute || node?.positionAbsolute;
        if (abs) return abs;
        const base = node?.position || { x: node?.x ?? 0, y: node?.y ?? 0 };
        const parentId = node?.parentId || node?.parentNode;
        if (!parentId) return base;
        const v = visited || new Set<string>();
        const id = String(node?.id ?? '');
        if (id && v.has(id)) return base;
        if (id) v.add(id);
        const parent = nodeMap.get(String(parentId));
        if (!parent) return base;
        const pAbs = getAbsolutePosition(parent, v);
        return { x: pAbs.x + (base.x ?? 0), y: pAbs.y + (base.y ?? 0) };
    };

    // 构造适配对象
    // Handle potential missing geometric data safely
    const sPos = getAbsolutePosition(sNode);
    const tPos = getAbsolutePosition(tNode);
    const sDim = {
        width: sNode.width || sNode.measured?.width || sNode.style?.width || 0,
        height: sNode.height || sNode.measured?.height || sNode.style?.height || 0
    };
    const tDim = {
        width: tNode.width || tNode.measured?.width || tNode.style?.width || 0,
        height: tNode.height || tNode.measured?.height || tNode.style?.height || 0
    };

    const sGeo = {
        id: sNode.id,
        position: sPos,
        dimensions: sDim,
        data: sNode.data
    };

    const tGeo = {
        id: tNode.id,
        position: tPos,
        dimensions: tDim,
        data: tNode.data
    };

    // [FIX] Prepare Obstacles for A*
    // Strategy: Identify containers by checking if they are parents to other nodes.
    // Containers should NOT be obstacles for their own children or internal routing.
    const parentIds = new Set<string>();
    if (allNodes) {
        for (const n of allNodes) {
            if (n.parentId) parentIds.add(n.parentId);
        }
    }

    const obstacles = (allNodes || [])
        .filter(n => n.id !== sNode.id && n.id !== tNode.id)
        .filter(n => {
            // Exclude explicit containers AND implied containers (parents)
            if (parentIds.has(n.id)) return false;

            const t = String(n.type || '');
            return t !== 'domain' && t !== 'group' && t !== 'subGroup' && !String(t).includes('container');
        })
        .map(n => ({
            x: getAbsolutePosition(n).x ?? 0,
            y: getAbsolutePosition(n).y ?? 0,
            width: n.width ?? n.measured?.width ?? n.style?.width ?? 100,
            height: n.height ?? n.measured?.height ?? n.style?.height ?? 50
        }));

    const cfgEdge = diagramConfigManager?.getConfig?.()?.edge || {};
    const sCenter = { x: sPos.x + sDim.width / 2, y: sPos.y + sDim.height / 2 };
    const tCenter = { x: tPos.x + tDim.width / 2, y: tPos.y + tDim.height / 2 };
    const dx = tCenter.x - sCenter.x;
    const dy = tCenter.y - sCenter.y;
    const geometry = analyzeGeometry(dx, dy, { sourceSize: sDim, targetSize: tDim });
    const fallbackDir = String(cfg?.layoutDirection || cfgEdge?.layoutDirection || '').toUpperCase();
    const fallbackIsValid = fallbackDir === 'LR' || fallbackDir === 'RL' || fallbackDir === 'TB' || fallbackDir === 'BT';
    let inferredLayoutDirection: 'LR' | 'RL' | 'TB' | 'BT';
    if (geometry === 'horizontal-forward') inferredLayoutDirection = 'LR';
    else if (geometry === 'horizontal-reverse') inferredLayoutDirection = 'RL';
    else if (geometry === 'vertical-forward') inferredLayoutDirection = 'TB';
    else if (geometry === 'vertical-reverse') inferredLayoutDirection = 'BT';
    else if (geometry === 'collocated') inferredLayoutDirection = fallbackIsValid ? (fallbackDir as any) : 'LR';
    else if (Math.abs(dx) >= Math.abs(dy)) inferredLayoutDirection = dx >= 0 ? 'LR' : 'RL';
    else inferredLayoutDirection = dy >= 0 ? 'TB' : 'BT';
    const smoothFallback = cfg?.smoothFallback ?? cfgEdge.smoothFallback;
    let effectiveMode = cfg?.mode;
    let effectiveGlobalPath = cfg?.globalPath;
    if (typeof effectiveGlobalPath === 'string' && effectiveGlobalPath.includes('smooth') && smoothFallback) {
        if (smoothFallback === 'native') {
            effectiveMode = 'native';
            effectiveGlobalPath = 'smoothstep';
        } else {
            effectiveGlobalPath = smoothFallback;
        }
    }

    const enrichedCfg = {
        ...cfg,
        mode: effectiveMode,
        globalPath: effectiveGlobalPath,
        layoutDirection: inferredLayoutDirection,
        // [OPT] Main Thread Fast-Pass
        // Limit expansions to prevent blocking the UI.
        // Complex paths will be refined by the Worker.
        gridAStarMaxExpansions: 1500,
        obstacles
    };

    // Forward call
    const decision = edgeRouter.route(
        sGeo,
        tGeo,
        enrichedCfg,
        usage
    );

    return {
        type: decision.type as unknown as EdgeType,
        sourceHandle: decision.sourceHandle,
        targetHandle: decision.targetHandle,
        autoSource: decision.autoSource,
        autoTarget: decision.autoTarget,
        computedPath: decision.computedPath
    };
}
