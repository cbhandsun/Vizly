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

import { EdgeType } from '../types/edgeType';
import { diagramConfigManager } from '../config/DiagramConfig';
import { analyzeGeometry } from '../algorithms/geometry-classifier';
import { configureEdgeRoutingDecision } from '../routing/utils/EdgeRoutingHelpers';

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
        const virtualTarget = { cx: avgCx, cy: avgCy };

        const dx = virtualTarget.cx - c.cx;
        const dy = virtualTarget.cy - c.cy;

        // 💡 改进：引入对布局方向 (layoutDirection) 的感知
        const dir = String(_cfg?.layoutDirection || '').toUpperCase();
        const isH = dir === 'LR' || dir === 'RL';

        const PRIMARY_AXIS_RATIO = 1.1;

        if (isH) {
            // 水平流向：优先选择左右端口
            if (validCount > 1 && Math.abs(dx) > 30) {
                return dx > 0 ? 'right' : 'left';
            }
            if (Math.abs(dy) >= Math.abs(dx) * PRIMARY_AXIS_RATIO) {
                return dy > 0 ? 'bottom' : 'top';
            }
            return dx > 0 ? 'right' : 'left';
        } else {
            // 垂直流向 (默认 / TB)：优先选择上下端口
            if (validCount > 1 && Math.abs(dy) > 30) {
                return dy > 0 ? 'bottom' : 'top';
            }
            if (Math.abs(dx) >= Math.abs(dy) * PRIMARY_AXIS_RATIO) {
                return dx > 0 ? 'right' : 'left';
            }
            return dy > 0 ? 'bottom' : 'top';
        }
    };

    // 3. 遍历所有边，分别决定 Source 和 TargetHandle
    const edgeDecisions: Record<string, { sHandle: string; tHandle: string }> = {};
    const dir = String(_cfg?.layoutDirection || '').toUpperCase();
    const isH = dir === 'LR' || dir === 'RL';

    const getSideSign = (center: any, target: any) => {
        const c = getBounds(center);
        const t = getBounds(target);
        if (isH) {
            return (t.cx - c.cx) >= 0 ? 1 : -1;
        } else {
            return (t.cy - c.cy) >= 0 ? 1 : -1;
        }
    };

    for (const edge of edges) {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) continue;

        // Source Side Decision
        const srcOut = outEdges.get(edge.source) || [];
        // 如果是 1-to-N Hub (出度 > 1)，仅对相同流动方向的分支目标进行重心方向聚合
        const sHandle = (() => {
          if (srcOut.length > 1) {
            const tgtSign = getSideSign(src, tgt);
            const targets = srcOut
                .map(e => nodeMap.get(e.target))
                .filter(Boolean)
                .filter(t => getSideSign(src, t) === tgtSign);
            return getDominantSide(src, targets);
          }

            // 单独连接，退化为两点判定 (与之前逻辑一致)
          return getDominantSide(src, [tgt]);
        })();

        // Target Side Decision
        const tgtIn = inEdges.get(edge.target) || [];
        // 如果是 N-to-1 Hub (入度 > 1)，仅对相同流动方向的来源节点进行重心方向聚合
        const tHandle = (() => {
          if (tgtIn.length > 1) {
            const srcSign = getSideSign(tgt, src);
            const sources = tgtIn
                .map(e => nodeMap.get(e.source))
                .filter(Boolean)
                .filter(s => getSideSign(tgt, s) === srcSign);
            return getDominantSide(tgt, sources);
          }

            // 单独连接，退化为两点判定
          return getDominantSide(tgt, [src]);
        })();

        edgeDecisions[edge.id] = { sHandle, tHandle };
    }

    const nodeSourceHandles = new Map<string, Set<string>>();
    const nodeTargetHandles = new Map<string, Set<string>>();

    for (const edge of edges) {
        const dec = edgeDecisions[edge.id];
        if (!dec) continue;

        result[edge.id] = { source: dec.sHandle, target: dec.tHandle };

        if (!nodeSourceHandles.has(edge.source)) nodeSourceHandles.set(edge.source, new Set());
        nodeSourceHandles.get(edge.source)!.add(dec.sHandle);

        if (!nodeTargetHandles.has(edge.target)) nodeTargetHandles.set(edge.target, new Set());
        nodeTargetHandles.get(edge.target)!.add(dec.tHandle);
    }

    // 仅当所有连接到该节点的边在端口方向上达成一致时，才在节点层级预分配端口
    for (const [nodeId, handles] of nodeSourceHandles.entries()) {
        if (handles.size === 1) {
            const handle = Array.from(handles)[0];
            if (!result[nodeId]) result[nodeId] = {};
            result[nodeId].source = handle;
        }
    }

    for (const [nodeId, handles] of nodeTargetHandles.entries()) {
        if (handles.size === 1) {
            const handle = Array.from(handles)[0];
            if (!result[nodeId]) result[nodeId] = {};
            result[nodeId].target = handle;
        }
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
    const parentMap = new Map<string, string>();
    if (Array.isArray(allNodes)) {
        for (const n of allNodes) {
            if (n?.id != null) nodeMap.set(String(n.id), n);
            const type = String(n?.type || '');
            if (type === 'subGroup' || type === 'domain' || type === 'group' || type === 'titleGroup') {
                const children = n?.data?.children;
                if (Array.isArray(children)) {
                    for (const cid of children) {
                        if (cid) parentMap.set(String(cid), String(n.id));
                    }
                }
            }
            if (n?.parentId) {
                parentMap.set(String(n.id), String(n.parentId));
            }
        }
    }
    const getAbsolutePosition = (node: any, visited?: Set<string>): { x: number; y: number } => {
        const abs = node?.computed?.positionAbsolute || node?.positionAbsolute;
        if (abs) return abs;
        const base = node?.position || { x: node?.x ?? 0, y: node?.y ?? 0 };
        const parentId = node?.parentId || node?.parentNode || parentMap.get(String(node?.id));
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
            const pId = n.parentId || n.parentNode;
            if (pId) parentIds.add(pId);
        }
    }

    const obstacles = (allNodes || [])
        .filter(n => n.id !== sNode.id && n.id !== tNode.id)
        .filter(n => {
            // Exclude explicit containers AND implied containers (parents)
            if (parentIds.has(n.id)) return false;

            const t = String(n.type || '');
            return t !== 'domain' && t !== 'group' && t !== 'subGroup' && t !== 'titleGroup' && !String(t).includes('container');
        })
        .map(n => ({
            x: getAbsolutePosition(n).x ?? 0,
            y: getAbsolutePosition(n).y ?? 0,
            width: n.width ?? n.measured?.width ?? n.style?.width ?? 100,
            height: n.height ?? n.measured?.height ?? n.style?.height ?? 50,
            // [FIX] Use 10px hard clearance to prevent blocking narrow gaps between vertically adjacent nodes.
            // Soft buffer zones (20px/40px) in buildPathfindingGrid will still keep lines 40px away when possible.
            padding: 10,
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

    // [FIX] Cross-subGroup edges: add the target's parent container as a soft cost zone.
    // Without this, A* routes through the target group's interior (since containers are
    // excluded from obstacles), producing paths that appear to hug the group boundary.
    // We mark the container with isSoftZone so it raises cost but doesn't block access
    // (otherwise A* would never reach the target node inside the container).
    //
    // [FIX v2] Only add soft zone for TRUE cross-domain edges (different top-level domains).
    // Intra-domain edges crossing between subdomains (e.g. "数据准备" → "初分逻辑" within
    // "策略计算") should route DIRECTLY through the gap without penalty. The old code added
    // the target subdomain as expensive, causing A* to detour far around it.
    // Find parent container using pre-built parentMap
    const getParentId = (nodeId: string) => parentMap.get(nodeId);

    const sParentId = sNode.parentId || sNode.parentNode || getParentId(sNode.id);
    const tParentId = tNode.parentId || tNode.parentNode || getParentId(tNode.id);
    const isCrossGroup = !!(sParentId && tParentId && sParentId !== tParentId);

    if (isCrossGroup) {
        // Check if they share a common grandparent domain (intra-domain cross-subdomain)
        const sGrandParentId = getParentId(sParentId!);
        const tGrandParentId = getParentId(tParentId!);
        const isIntraDomain = !!(sGrandParentId && tGrandParentId && sGrandParentId === tGrandParentId);

        // Only add soft zone for true cross-domain edges, not intra-domain subdomain crossings
        if (!isIntraDomain) {
            const tParentNode = (allNodes || []).find((n: any) => n.id === tParentId);
            if (tParentNode) {
                const tParentPos = getAbsolutePosition(tParentNode);
                const tParentW = tParentNode.width ?? tParentNode.measured?.width ?? tParentNode.style?.width ?? 400;
                const tParentH = tParentNode.height ?? tParentNode.measured?.height ?? tParentNode.style?.height ?? 300;
                // Mark as soft zone: A* sees it as expensive but not impossible to traverse.
                // This makes A* prefer going AROUND the container boundary first, then enter
                // from the correct handle side near the target node.
                obstacles.push({
                    x: tParentPos.x,
                    y: tParentPos.y,
                    width: tParentW,
                    height: tParentH,
                    padding: 40, // Increased padding to ensure visible distance from group border
                    isSoftZone: true, // signals PathFinder to treat as high-cost, not blocked
                } as any);
            }
        }
    }

    const layoutDir = fallbackIsValid ? (fallbackDir as any) : inferredLayoutDirection;

    const enrichedCfg = {
        ...cfg,
        mode: effectiveMode,
        globalPath: effectiveGlobalPath,
        layoutDirection: layoutDir,
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

configureEdgeRoutingDecision(decideEdgeRouting);
