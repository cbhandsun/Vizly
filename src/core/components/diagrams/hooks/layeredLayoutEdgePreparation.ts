import type { Edge, Node } from '@xyflow/react';

import { withDisplayAbsolutePositions } from '../../shared/baseReactFlowAbsolutePositions';
import { clearBaseReactFlowLayoutEdgeRoutingData } from '../../shared/baseReactFlowLayoutEdgeRoutingData';
import { logLayoutOrphanEdgeDropped } from './diagramInteractionLogging';

const asRecord = (value: unknown): Record<string, unknown> => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
);

/**
 * 边验证：确保布局后所有边有效
 *
 * 后处理管道 (P7 beautifyOrthogonalEdges / P8 optimizeTreeBusRouting) 使用短格式 handle ID ('r'/'l'/'t'/'b')
 * 而 FlowchartNode 只注册了全称 Handle ID ('right'/'left'/'top'/'bottom')
 * 必须先正确映射短格式→全称，再验证有效性
 */
export function sanitizeLayoutEdges(resultNodes: Node[], resultEdges: Edge[], dir: 'TB' | 'LR'): Edge[] {
    const nodeIdSet = new Set(resultNodes.map(n => n.id));
    const expandHandle = (h: string | null | undefined): string | null => {
        if (!h) return null;
        const s = h.toLowerCase();
        if (s === 'r' || s === 'right') return 'right';
        if (s === 'l' || s === 'left') return 'left';
        if (s === 't' || s === 'top') return 'top';
        if (s === 'b' || s === 'bottom') return 'bottom';
        return null;
    };
    const isH = dir === 'LR';
    const defSrc = isH ? 'right' : 'bottom';
    const defTgt = isH ? 'left' : 'top';
    let _orphan = 0, _expanded = 0, _defaulted = 0;

    const sanitized = resultEdges
        .filter(e => {
            const ok = nodeIdSet.has(e.source) && nodeIdSet.has(e.target);
            if (!ok) {
                _orphan++;
                logLayoutOrphanEdgeDropped({
                    edgeId: e.id,
                    hasSource: nodeIdSet.has(e.source),
                    hasTarget: nodeIdSet.has(e.target),
                });
            }
            return ok;
        })
        .map(e => {
            const edge = { ...e };
            // [FIX] 展开短格式 handle（P7/P8 后处理可能写入 'r'/'l'/'t'/'b'）并应用方向默认值
            // 保留策略已计算的路由决策，避免清空为 null 后运行时在动画过渡期使用旧坐标重算
            const srcH = expandHandle(e.sourceHandle);
            const tgtH = expandHandle(e.targetHandle);
            edge.sourceHandle = srcH || defSrc;
            edge.targetHandle = tgtH || defTgt;
            if (srcH) _expanded++; else _defaulted++;
            if (tgtH) _expanded++; else _defaulted++;

            // ⭐ [FIX] 切换布局时清除连线的自定义控制点缓冲，让重新计算的布局能够生效起步；但保留布局策略计算好的路径/总线/ELK信息
            edge.data = {
                ...edge.data,
                waypoints: [],
                computedPath: e.data?.computedPath,
                elkPath: e.data?.elkPath,
                treeRouting: e.data?.treeRouting,
                isTreeBus: e.data?.isTreeBus,
                useElkRouting: e.data?.useElkRouting,
                algorithm: e.data?.algorithm,
                layoutPathLocked: e.data?.layoutPathLocked,
                _layoutPathLocked: e.data?._layoutPathLocked,
                sharedTrunkAware: e.data?.sharedTrunkAware,
                stablePathQuality: e.data?.stablePathQuality,
                _layoutEpoch: e.data?._layoutEpoch
            };
            return edge;
        });

    return sanitized;
}

type LayoutTerminalHandles = Readonly<{
    sourceHandle: 'top' | 'right' | 'bottom' | 'left';
    targetHandle: 'top' | 'right' | 'bottom' | 'left';
}>;

const getLayoutNodeSize = (node: Node): { width: number; height: number } => ({
    width: Math.max(
        1,
        node.measured?.width
            ?? node.width
            ?? (typeof node.style?.width === 'number' ? node.style.width : 150),
    ),
    height: Math.max(
        1,
        node.measured?.height
            ?? node.height
            ?? (typeof node.style?.height === 'number' ? node.style.height : 80),
    ),
});

/**
 * Resolve fixed-side port candidates from the staged geometry. Layered flow
 * direction wins when nodes are separated on both axes; same-rank and return
 * edges use their actual relative axis instead of manufacturing a hairpin.
 */
export const resolveLayeredLayoutTerminalHandles = (
    sourceNode: Node,
    targetNode: Node,
    direction: 'TB' | 'LR',
): LayoutTerminalHandles => {
    const sourceSize = getLayoutNodeSize(sourceNode);
    const targetSize = getLayoutNodeSize(targetNode);
    const sourcePosition = (sourceNode as Node & { positionAbsolute?: Node['position'] })
        .positionAbsolute ?? sourceNode.position;
    const targetPosition = (targetNode as Node & { positionAbsolute?: Node['position'] })
        .positionAbsolute ?? targetNode.position;
    const sourceCenter = {
        x: sourcePosition.x + sourceSize.width / 2,
        y: sourcePosition.y + sourceSize.height / 2,
    };
    const targetCenter = {
        x: targetPosition.x + targetSize.width / 2,
        y: targetPosition.y + targetSize.height / 2,
    };
    const deltaX = targetCenter.x - sourceCenter.x;
    const deltaY = targetCenter.y - sourceCenter.y;
    const horizontallySeparated = Math.abs(deltaX)
        >= (sourceSize.width + targetSize.width) / 2;
    const verticallySeparated = Math.abs(deltaY)
        >= (sourceSize.height + targetSize.height) / 2;
    const longHorizontalSpan = horizontallySeparated
        && Math.abs(deltaX) > Math.abs(deltaY) * 1.5;
    const useHorizontal = direction === 'LR'
        ? horizontallySeparated || !verticallySeparated
        : horizontallySeparated && (!verticallySeparated || longHorizontalSpan);

    if (useHorizontal) {
        return deltaX >= 0
            ? { sourceHandle: 'right', targetHandle: 'left' }
            : { sourceHandle: 'left', targetHandle: 'right' };
    }
    return deltaY >= 0
        ? { sourceHandle: 'bottom', targetHandle: 'top' }
        : { sourceHandle: 'top', targetHandle: 'bottom' };
};

export const clearLayoutEdgeRoutingType = (edge: Edge): Edge['type'] => {
    const type = String(edge.type ?? '').toLowerCase();
    return type === 'stablepath' || type === 'elk'
        ? 'advanced-smart-step'
        : edge.type;
};

const readLayoutRoute = (value: unknown): Array<{ x: number; y: number }> | null => {
    if (!Array.isArray(value) || value.length < 2) return null;
    const points: Array<{ x: number; y: number }> = [];
    for (const item of value) {
        const point = asRecord(item);
        if (
            typeof point.x !== 'number'
            || !Number.isFinite(point.x)
            || typeof point.y !== 'number'
            || !Number.isFinite(point.y)
        ) return null;
        points.push({ x: point.x, y: point.y });
    }
    return points;
};

type LayeredLayoutEdgePreparationOptions = Readonly<{
    /**
     * The caller has just calculated these locked paths against resultNodes.
     * Promote them to hidden Worker candidates; they are never displayable
     * until the shared hard-quality transaction accepts them.
     */
    promoteLockedComputedPath?: boolean;
}>;

const closestLayoutHandle = (
    node: Node,
    point: { x: number; y: number },
): LayoutTerminalHandles['sourceHandle'] => {
    const position = (node as Node & { positionAbsolute?: Node['position'] })
        .positionAbsolute ?? node.position;
    const size = getLayoutNodeSize(node);
    const candidates = [
        { handle: 'left' as const, distance: Math.abs(point.x - position.x) },
        { handle: 'right' as const, distance: Math.abs(point.x - (position.x + size.width)) },
        { handle: 'top' as const, distance: Math.abs(point.y - position.y) },
        { handle: 'bottom' as const, distance: Math.abs(point.y - (position.y + size.height)) },
    ];
    candidates.sort((first, second) => first.distance - second.distance);
    return candidates[0].handle;
};

const LAYOUT_ROUTE_TERMINAL_AXIS_SNAP_MAX = 80;

/**
 * A route endpoint can sit on one node side while its terminal segment clearly
 * enters through another side (most commonly a vertical segment ending near a
 * left/right corner). The segment axis is the authoritative port contract; the
 * nearest boundary is only a fallback when the route is diagonal, degenerate,
 * or too far from the required side to be snapped safely.
 */
const resolveLayoutRouteTerminalHandle = (
    node: Node,
    terminal: { x: number; y: number },
    adjacent: { x: number; y: number } | undefined,
): LayoutTerminalHandles['sourceHandle'] => {
    if (!adjacent) return closestLayoutHandle(node, terminal);
    const position = (node as Node & { positionAbsolute?: Node['position'] })
        .positionAbsolute ?? node.position;
    const size = getLayoutNodeSize(node);
    const deltaX = adjacent.x - terminal.x;
    const deltaY = adjacent.y - terminal.y;
    const horizontal = Math.abs(deltaX) > 0.5 && Math.abs(deltaY) <= 0.5;
    const vertical = Math.abs(deltaY) > 0.5 && Math.abs(deltaX) <= 0.5;

    if (horizontal) {
        const handle = deltaX > 0 ? 'right' : 'left';
        const boundaryX = handle === 'right' ? position.x + size.width : position.x;
        if (Math.abs(terminal.x - boundaryX) <= LAYOUT_ROUTE_TERMINAL_AXIS_SNAP_MAX) {
            return handle;
        }
    }
    if (vertical) {
        const handle = deltaY > 0 ? 'bottom' : 'top';
        const boundaryY = handle === 'bottom' ? position.y + size.height : position.y;
        if (Math.abs(terminal.y - boundaryY) <= LAYOUT_ROUTE_TERMINAL_AXIS_SNAP_MAX) {
            return handle;
        }
    }
    return closestLayoutHandle(node, terminal);
};

export const prepareLayeredLayoutEdges = (
    resultNodes: Node[],
    resultEdges: Edge[],
    direction: 'TB' | 'LR',
    options: LayeredLayoutEdgePreparationOptions = {},
): Edge[] => {
    const nodeById = new Map(resultNodes.map(node => [node.id, node] as const));
    const absoluteNodeById = new Map(
        withDisplayAbsolutePositions(resultNodes, nodeById)
            .map(node => [node.id, node] as const),
    );
    const clearedEdges = resultEdges.map((edge) => {
        const sourceNode = absoluteNodeById.get(edge.source);
        const targetNode = absoluteNodeById.get(edge.target);
        const explicitLayoutRoute = edge.data?.layoutRoutingCandidate === true
            ? readLayoutRoute(edge.data.elkPath)
            : null;
        const currentLockedRoute = options.promoteLockedComputedPath
            && (
                edge.data?.layoutPathLocked === true
                || edge.data?._layoutPathLocked === true
            )
            ? readLayoutRoute(edge.data?.computedPath)
            : null;
        const layoutRoute = explicitLayoutRoute ?? currentLockedRoute;
        const handles = sourceNode && targetNode && layoutRoute
            ? {
                sourceHandle: resolveLayoutRouteTerminalHandle(
                    sourceNode,
                    layoutRoute[0],
                    layoutRoute[1],
                ),
                targetHandle: resolveLayoutRouteTerminalHandle(
                    targetNode,
                    layoutRoute[layoutRoute.length - 1],
                    layoutRoute[layoutRoute.length - 2],
                ),
            }
            : sourceNode && targetNode
                ? resolveLayeredLayoutTerminalHandles(sourceNode, targetNode, direction)
            : { sourceHandle: null, targetHandle: null };
        return {
            ...edge,
            ...handles,
            type: clearLayoutEdgeRoutingType(edge),
            data: {
                ...clearBaseReactFlowLayoutEdgeRoutingData(edge.data),
                ...(layoutRoute ? {
                    elkPath: layoutRoute,
                    layoutRoutingCandidate: true,
                } : {}),
                intraContainerNoObstacle: true,
                obstacleScope: 'corridor',
                obstaclePadding: 24,
                pathOptions: {
                    ...asRecord(edge.data?.pathOptions),
                    gridRatio: 1.04,
                    borderRadius: 4,
                },
                layoutDirection: direction,
            },
        };
    });
    return sanitizeLayoutEdges(resultNodes, clearedEdges, direction);
};
