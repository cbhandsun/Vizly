import type { Edge, Node } from '@xyflow/react';

import { clearBaseReactFlowLayoutEdgeRoutingData } from '../../shared/baseReactFlowLayoutRoutingTransaction';
import { withDisplayAbsolutePositions } from '../../shared/baseReactFlowDisplayEdgeCore';
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

export const prepareLayeredLayoutEdges = (
    resultNodes: Node[],
    resultEdges: Edge[],
    direction: 'TB' | 'LR',
): Edge[] => {
    const nodeById = new Map(resultNodes.map(node => [node.id, node] as const));
    const absoluteNodeById = new Map(
        withDisplayAbsolutePositions(resultNodes, nodeById)
            .map(node => [node.id, node] as const),
    );
    const clearedEdges = resultEdges.map((edge) => {
        const sourceNode = absoluteNodeById.get(edge.source);
        const targetNode = absoluteNodeById.get(edge.target);
        const layoutRoute = edge.data?.layoutRoutingCandidate === true
            ? readLayoutRoute(edge.data.elkPath)
            : null;
        const handles = sourceNode && targetNode && layoutRoute
            ? {
                sourceHandle: closestLayoutHandle(sourceNode, layoutRoute[0]),
                targetHandle: closestLayoutHandle(targetNode, layoutRoute[layoutRoute.length - 1]),
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
