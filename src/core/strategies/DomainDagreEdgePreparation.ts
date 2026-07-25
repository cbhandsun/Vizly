import type { Edge, XYPosition } from '@xyflow/react';
import type { LayoutOptions } from '../types/layout';
import { decideEdgeRouting, assignGlobalPorts, type RoutingConfig } from '../utils/HandlePicker';
import { expandHandle, normalizeHandle } from '../routing/utils/handleUtils';
import { logDomainDagreMissingNodeHandle } from './layoutLogging';
import { repairSharedTrunkAwareCrossings } from './shared/edgeRoutingPipeline';
import {
    buildEndpointOrthogonalFallbackPath,
    lockComputedPathOnEdge,
    resolveRoutingResultPath,
} from './shared/edgeFallbackPath';
import { repairEndpointOrthogonalPaths } from './shared/edgeEndpointPathRepair';
import { separateDetachedParallelOverlaps } from './shared/edgeDetachedOverlapRepair';
import { reorderDomainDagrePortAnchors } from './domainDagrePortAnchorOrdering';
import {
    repairSharedTargetEntryCrossings,
    synthesizeSharedEndpointTrunks,
} from './shared/edgeSharedTrunkSynthesis';
import {
    applyAutoHandleData,
    asRoutingRecord,
    finiteRoutingNumber as finiteNumber,
    readDirectionalHandlePolicy,
    readManualHandleSides,
    routingNodeAbsolutePosition,
    routingNodeSize,
    type RoutingNode,
} from './domainDagreEdgePreparationSupport';

export interface DomainDagreEdgePreparationInput {
    nodes: RoutingNode[];
    edges: Edge[];
    options: LayoutOptions;
    config: unknown;
    nodeById: Map<string, RoutingNode>;
    leafNodes: RoutingNode[];
}

export async function prepareDomainDagreEdges({
    nodes: updatedNodes,
    edges,
    options,
    config: cfg,
    nodeById: idMap,
}: DomainDagreEdgePreparationInput): Promise<Edge[]> {
    const getAbsPos = (n: RoutingNode): { x: number, y: number } => {
        let x = n.position.x;
        let y = n.position.y;
        let current = n;
        let depth = 0;
        while (current.parentId && depth < 10) {
            const parent = idMap.get(current.parentId);
            if (!parent) break;
            x += parent.position.x;
            y += parent.position.y;
            current = parent;
            depth++;
        }
        return { x, y };
    };

    // 确保所有节点有 positionAbsolute、width、height 和 measured
    updatedNodes.forEach(n => {
        const absPos = getAbsPos(n);
        n.positionAbsolute = absPos;

        // [FIX] 忽略 React Flow 的 measured（它可能在不同渲染周期有不同值），只使用 ensureMeasuredForNodes 写入的 style
        const w = finiteNumber(n.style?.width ?? n.width, 200);
        const h = finiteNumber(n.style?.height ?? n.height, 80);
        n.width = w;
        n.height = h;
        n.measured = { width: w, height: h };
    });

    const cfgEdge = asRoutingRecord(asRoutingRecord(cfg).edge);
    const routingConfig: RoutingConfig = {
        mode: 'advanced-smart' as const,
        globalPath: (cfgEdge.pathType || 'step') as string,
        autoPathSelection: true,
        angleToleranceDeg: Number(cfgEdge.angleToleranceDeg ?? 36),
        bezierDistanceThreshold: Number(cfgEdge.bezierDistanceThreshold ?? 280),
        // [FIX] 增大搜索范围，让 A* 算法能寻找到绕行空旷区域的路径
        obstacleScopePadding: Number(cfgEdge.obstacleScopePadding ?? 300),
        corridorObstacleThreshold: Number(cfgEdge.corridorObstacleThreshold ?? 6),
        directionalHandlePolicy: readDirectionalHandlePolicy(cfgEdge.directionalHandlePolicy),
        verticalBiasThreshold: Number(cfgEdge.verticalBiasThreshold ?? 1.2),
        // [FIX] 增大障碍物膨胀，让节点周围有更大禁区，迫使连线绕行空旷区域
        obstaclePadding: Number(cfgEdge.obstaclePadding ?? 80),
        ignoreContainers: Boolean(cfgEdge.ignoreContainers ?? false),
        layoutDirection: options.direction || 'TB',
        // [FIX] 增大 A* 扩展次数，允许搜索更远的绕行路径
        gridAStarMaxExpansions: Number(cfgEdge.gridAStarMaxExpansions ?? 600),
        // [FIX] 减小网格尺寸，提高绕行精度
        gridAStarGridSize: Number(cfgEdge.gridAStarGridSize ?? 30),
        preAssignedPortPolicy: 'prefer',
    };

    // Enforce strict direction for Dagre to ensure stability
    if (routingConfig.mode === 'advanced-smart') {
        routingConfig.directionalHandlePolicy = 'force';
    }

    // [FIX] 确保传入 decideEdgeRouting 的节点数组顺序是确定性的
    // 这对于 A* 障碍物避让计算非常重要，不同的顺序可能导致不同的路径选择
    const sortedNodesForRouting = [...updatedNodes].sort((a, b) => a.id.localeCompare(b.id));

    // 克隆 edges 以确保 React 能检测到修改
    // Sort edges by source then target to ensure consistent processing order for "bus" optimization
    // [FIX] Clear stale computedPath from previous layouts so EdgeRouter always recomputes fresh.
    // Without this, the old C-shaped path would be preserved across layout runs.
    const clonedEdges = edges
        .map(e => ({
            ...e,
            data: e.data ? { ...e.data as object, computedPath: undefined } : e.data
        }))
        .sort((a, b) => {
            const sComp = a.source.localeCompare(b.source);
            if (sComp !== 0) return sComp;
            return a.target.localeCompare(b.target);
        });

    const edgeRoutingQuality = String(options.edgeRoutingQuality ?? 'full');
    if (edgeRoutingQuality === 'interactive') {
        const layoutDir = String(options.direction || 'TB').toUpperCase();
        const pickInteractiveHandles = (source: RoutingNode, target: RoutingNode) => {
            const sourcePos = routingNodeAbsolutePosition(source);
            const targetPos = routingNodeAbsolutePosition(target);
            const sourceSize = routingNodeSize(source);
            const targetSize = routingNodeSize(target);
            const dx = (targetPos.x + targetSize.width / 2) - (sourcePos.x + sourceSize.width / 2);
            const dy = (targetPos.y + targetSize.height / 2) - (sourcePos.y + sourceSize.height / 2);
            if (layoutDir === 'LR' || layoutDir === 'RL' || Math.abs(dx) > Math.abs(dy) * 1.35) {
                return dx >= 0
                    ? { sourceHandle: 'right', targetHandle: 'left' }
                    : { sourceHandle: 'left', targetHandle: 'right' };
            }
            return dy >= 0
                ? { sourceHandle: 'bottom', targetHandle: 'top' }
                : { sourceHandle: 'top', targetHandle: 'bottom' };
        };
        const interactiveEdges = clonedEdges.map(edge => {
            const source = idMap.get(edge.source);
            const target = idMap.get(edge.target);
            if (!source || !target) {
                return {
                    ...edge,
                    sourceHandle: edge.sourceHandle || (layoutDir === 'LR' || layoutDir === 'RL' ? 'right' : 'bottom'),
                    targetHandle: edge.targetHandle || (layoutDir === 'LR' || layoutDir === 'RL' ? 'left' : 'top'),
                    data: {
                        ...(edge.data || {}),
                        algorithm: 'domain-dagre-interactive',
                        trunkPolishVersion: 2,
                    },
                };
            }
            const handles = pickInteractiveHandles(source, target);
            const nextEdge = {
                ...edge,
                sourceHandle: expandHandle(edge.sourceHandle || handles.sourceHandle),
                targetHandle: expandHandle(edge.targetHandle || handles.targetHandle),
                data: {
                    ...(edge.data || {}),
                    autoSource: !edge.sourceHandle,
                    autoTarget: !edge.targetHandle,
                    auto: [
                        ...(!edge.sourceHandle ? ['source'] : []),
                        ...(!edge.targetHandle ? ['target'] : []),
                    ],
                    algorithm: 'domain-dagre-interactive',
                    trunkPolishVersion: 2,
                },
            } as Edge;
            lockComputedPathOnEdge(nextEdge, buildEndpointOrthogonalFallbackPath({
                source,
                target,
                sourceHandle: nextEdge.sourceHandle,
                targetHandle: nextEdge.targetHandle,
                nodeById: idMap,
                stubLength: 40,
            }));
            return nextEdge;
        });
        const trunkPolishedEdges = repairSharedTargetEntryCrossings(
            synthesizeSharedEndpointTrunks(interactiveEdges, { nodes: updatedNodes }),
        ).map(edge => ({
            ...edge,
            data: {
                ...(edge.data || {}),
                algorithm: 'domain-dagre-interactive',
                trunkPolishVersion: 2,
                layoutPathLocked: true,
                runtimeHandleLock: {
                    ...asRoutingRecord(asRoutingRecord(edge.data).runtimeHandleLock),
                    source: true,
                    target: true,
                },
            },
        })) as Edge[];
        return trunkPolishedEdges;
    }


    const nodeUsage: Record<string, Record<string, number>> = {};
    // P1: Edge-Edge Avoidance - 收集已路由边的路径
    const routedPaths: Array<{ points: Array<{ x: number; y: number }> }> = [];
    const isAutoHandle = (edge: Edge, side: 'source' | 'target') => {
        const data = asRoutingRecord(edge.data);
        const auto = Array.isArray(data.auto) ? data.auto : [];
        return Boolean(data[side === 'source' ? 'autoSource' : 'autoTarget']) || auto.includes(side);
    };
    const oppositeHandle = (h: string): string => {
        const normalized = normalizeHandle(h);
        if (normalized === 'l') return 'right';
        if (normalized === 'r') return 'left';
        if (normalized === 't') return 'bottom';
        if (normalized === 'b') return 'top';
        return 'bottom';
    };
    const sourceOutCounts = new Map<string, number>();
    const targetInCounts = new Map<string, number>();
    clonedEdges.forEach(edge => {
        sourceOutCounts.set(edge.source, (sourceOutCounts.get(edge.source) || 0) + 1);
        targetInCounts.set(edge.target, (targetInCounts.get(edge.target) || 0) + 1);
    });
    const getRolePortForce = (
        edge: Edge,
        source: RoutingNode,
        target: RoutingNode,
        edgePorts?: { source?: string; target?: string }
    ) => {
        if (!edgePorts) return { sourceFanOut: false, targetFanIn: false };
        const layoutDir = String(options.direction || 'TB').toUpperCase();
        const isVerticalFlow = layoutDir === 'TB' || layoutDir === 'BT';
        const isHorizontalFlow = layoutDir === 'LR' || layoutDir === 'RL';
        const sourcePre = normalizeHandle(edgePorts.source);
        const targetPre = normalizeHandle(edgePorts.target);
        const sPos = routingNodeAbsolutePosition(source);
        const tPos = routingNodeAbsolutePosition(target);
        const sDims = routingNodeSize(source);
        const tDims = routingNodeSize(target);
        const dx = (tPos.x + tDims.width / 2) - (sPos.x + sDims.width / 2);
        const dy = (tPos.y + tDims.height / 2) - (sPos.y + sDims.height / 2);
        const sourceFanOut = (sourceOutCounts.get(edge.source) || 0) > 1;
        const targetFanIn = (targetInCounts.get(edge.target) || 0) > 1;

        if (isVerticalFlow) {
            const sourceMatchesFlow = sourceFanOut && (sourcePre === 'b' || sourcePre === 't')
                && Math.abs(dy) > 30
                && ((sourcePre === 'b' && dy > 0) || (sourcePre === 't' && dy < 0));
            const targetMatchesFlow = targetFanIn && (targetPre === 't' || targetPre === 'b')
                && Math.abs(dy) > 30
                && ((targetPre === 't' && dy > 0) || (targetPre === 'b' && dy < 0));
            return { sourceFanOut: sourceMatchesFlow, targetFanIn: targetMatchesFlow };
        }

        if (isHorizontalFlow) {
            const sourceMatchesFlow = sourceFanOut && (sourcePre === 'r' || sourcePre === 'l')
                && Math.abs(dx) > 30
                && ((sourcePre === 'r' && dx > 0) || (sourcePre === 'l' && dx < 0));
            const targetMatchesFlow = targetFanIn && (targetPre === 'l' || targetPre === 'r')
                && Math.abs(dx) > 30
                && ((targetPre === 'l' && dx > 0) || (targetPre === 'r' && dx < 0));
            return { sourceFanOut: sourceMatchesFlow, targetFanIn: targetMatchesFlow };
        }

        return { sourceFanOut: false, targetFanIn: false };
    };

    // [FIX] 强制同步点：让出到微任务队列，确保所有待处理的状态更新完成
    // 这模拟了 DevTools 打开时 console.log 造成的微小延迟，解决 F12 打开/关闭的差异问题
    await Promise.resolve();

    // 预分配智能端口（支持多路重心对齐）
    const globalPorts = assignGlobalPorts(sortedNodesForRouting, clonedEdges, routingConfig);

    clonedEdges.forEach(edge => {
        const source = idMap.get(edge.source);
        const target = idMap.get(edge.target);
        if (!source || !target) {
            // [FIX] 即使 source/target 不在 idMap 中，也要确保边有 handle ID
            // 否则 React Flow 无法定位连接点，边不会渲染
            const dir = (options.direction || 'TB').toUpperCase();
            if (!edge.sourceHandle) {
                edge.sourceHandle = (dir === 'LR' || dir === 'RL') ? 'right' : 'bottom';
            }
            if (!edge.targetHandle) {
                edge.targetHandle = (dir === 'LR' || dir === 'RL') ? 'left' : 'top';
            }
            logDomainDagreMissingNodeHandle(String(edge.id || `${edge.source}->${edge.target}`), !!source, !!target);
            return;
        }

        const sUsage = nodeUsage[source.id] || {};
        const tUsage = nodeUsage[target.id] || {};
        const edgeDataForManual = asRoutingRecord(edge.data);
        const manualSides = readManualHandleSides(edgeDataForManual);
        const manualHandles = edgeDataForManual.manualHandles ?? edgeDataForManual._manualHandles;
        const manualHandleRecord = asRoutingRecord(manualHandles);
        const hasManualSourceHandle = manualSides.includes('source')
            || manualHandles === true
            || Boolean(manualHandleRecord.source);
        const hasManualTargetHandle = manualSides.includes('target')
            || manualHandles === true
            || Boolean(manualHandleRecord.target);

        let explicitSourceHandle = edge.sourceHandle && hasManualSourceHandle && !isAutoHandle(edge, 'source')
            ? normalizeHandle(edge.sourceHandle)
            : undefined;
        let explicitTargetHandle = edge.targetHandle && hasManualTargetHandle && !isAutoHandle(edge, 'target')
            ? normalizeHandle(edge.targetHandle)
            : undefined;

        // [FIX] Same-side overshoot guard for explicit handles.
        // JSON data or stale localStorage may contain explicit handles that create
        // geometrically absurd paths (e.g. both=right when target is far to the right,
        // causing a huge U-turn loop). Detect this and DROP the explicit handles,
        // letting globalPorts + geometry choose the optimal ports.
        if (explicitSourceHandle && explicitTargetHandle) {
            const sAbsPos = routingNodeAbsolutePosition(source);
            const tAbsPos = routingNodeAbsolutePosition(target);
            const sDims = routingNodeSize(source);
            const tDims = routingNodeSize(target);
            const oCenterDx = (tAbsPos.x + tDims.width / 2) - (sAbsPos.x + sDims.width / 2);
            const oCenterDy = (tAbsPos.y + tDims.height / 2) - (sAbsPos.y + sDims.height / 2);
            const OVERSHOOT_PX = 40;

            const sh = explicitSourceHandle; // 'r','l','t','b'
            const th = explicitTargetHandle;

            // Same-side overshoot: source and target use the same side, and target is
            // clearly on that same side → path loops around
            let isSameSideOvershoot = false;
            if (sh === th) {
                if (sh === 'r' && oCenterDx > OVERSHOOT_PX) isSameSideOvershoot = true;
                if (sh === 'l' && oCenterDx < -OVERSHOOT_PX) isSameSideOvershoot = true;
                if (sh === 'b' && oCenterDy > OVERSHOOT_PX) isSameSideOvershoot = true;
                if (sh === 't' && oCenterDy < -OVERSHOOT_PX) isSameSideOvershoot = true;
            }
            // Source exits AWAY from target (opposite direction)
            let isSourceAwayFromTarget = false;
            if (sh === 'r' && oCenterDx < -OVERSHOOT_PX) isSourceAwayFromTarget = true;
            if (sh === 'l' && oCenterDx > OVERSHOOT_PX) isSourceAwayFromTarget = true;
            if (sh === 'b' && oCenterDy < -OVERSHOOT_PX) isSourceAwayFromTarget = true;
            if (sh === 't' && oCenterDy > OVERSHOOT_PX) isSourceAwayFromTarget = true;

            if (isSameSideOvershoot || isSourceAwayFromTarget) {
                // Drop explicit handles — let globalPorts and geometry decide
                explicitSourceHandle = undefined;
                explicitTargetHandle = undefined;
            }
        }

        const mergedPorts = { ...globalPorts };

        // [FIX] Lift per-edge handle decisions into per-node entries.
        // assignGlobalPorts stores per-edge decisions as globalPorts[edge.id],
        // but PortSelector only reads globalPorts[nodeId]. When per-node
        // consensus doesn't exist (e.g. L-OMS has 3 outgoing edges in different
        // directions), the per-edge decision is lost. Lift it here.
        const edgePorts = globalPorts[edge.id];
        if (edgePorts) {
            if (edgePorts.source) {
                mergedPorts[source.id] = {
                    ...mergedPorts[source.id],
                    source: edgePorts.source
                };
            }
            if (edgePorts.target) {
                mergedPorts[target.id] = {
                    ...mergedPorts[target.id],
                    target: edgePorts.target
                };
            }
        }

        if (explicitSourceHandle) {
            mergedPorts[source.id] = {
                ...mergedPorts[source.id],
                source: explicitSourceHandle
            };
        }
        if (explicitTargetHandle) {
            mergedPorts[target.id] = {
                ...mergedPorts[target.id],
                target: explicitTargetHandle
            };
        }

        const routingConfigForEdge: RoutingConfig = {
            ...routingConfig,
            preAssignedPorts: mergedPorts
        };
        const rolePortForce = getRolePortForce(edge, source, target, edgePorts);
        const forceRolePorts = rolePortForce.sourceFanOut || rolePortForce.targetFanIn;
        if (forceRolePorts) {
            routingConfigForEdge.preAssignedPortPolicy = 'force';
            if (rolePortForce.sourceFanOut && edgePorts?.source && !explicitTargetHandle) {
                mergedPorts[target.id] = {
                    ...mergedPorts[target.id],
                    target: oppositeHandle(edgePorts.source),
                };
            }
            if (rolePortForce.targetFanIn && edgePorts?.target && !explicitSourceHandle) {
                mergedPorts[source.id] = {
                    ...mergedPorts[source.id],
                    source: oppositeHandle(edgePorts.target),
                };
            }
        }

        const routingResult = explicitSourceHandle && explicitTargetHandle
            ? {
                type: 'advanced-smart-step' as const,
                sourceHandle: explicitSourceHandle,
                targetHandle: explicitTargetHandle,
                autoSource: false,
                autoTarget: false,
                computedPath: undefined as Array<{ x: number; y: number }> | undefined,
            }
            : decideEdgeRouting(
                source,
                target,
                sortedNodesForRouting,  // [FIX] 使用排序后的节点数组确保确定性
                { ...routingConfigForEdge, routedPaths },  // P1: 传入已路由路径
                { source: sUsage, target: tUsage },
                true
            );

        const sourceHandle = expandHandle(routingResult.sourceHandle || 'bottom');
        const targetHandle = expandHandle(routingResult.targetHandle || 'top');
        edge.type = routingResult.type;
        edge.sourceHandle = sourceHandle;
        edge.targetHandle = targetHandle;
        applyAutoHandleData(edge, routingResult.autoSource, routingResult.autoTarget);

        const computedPathForEdge = resolveRoutingResultPath({
            routingResult,
            source,
            target,
            nodeById: idMap,
        });

        lockComputedPathOnEdge(edge, computedPathForEdge);

        // P1: 记录此边的完整计算路径
        if (computedPathForEdge.length >= 2) {
            routedPaths.push({ points: computedPathForEdge });
        } else {
            // Fallback: 使用起点终点
            const sPos = routingNodeAbsolutePosition(source);
            const tPos = routingNodeAbsolutePosition(target);
            const { width: sW, height: sH } = routingNodeSize(source, 100, 50);
            const { width: tW, height: tH } = routingNodeSize(target, 100, 50);

            // 根据 handle 计算锚点
            const handleToAnchor = (pos: XYPosition, w: number, h: number, handle: string) => {
                switch (handle) {
                    case 'l': case 'left': return { x: pos.x, y: pos.y + h / 2 };
                    case 'r': case 'right': return { x: pos.x + w, y: pos.y + h / 2 };
                    case 't': case 'top': return { x: pos.x + w / 2, y: pos.y };
                    case 'b': case 'bottom': return { x: pos.x + w / 2, y: pos.y + h };
                    default: return { x: pos.x + w / 2, y: pos.y + h / 2 };
                }
            };

            const startPt = handleToAnchor(sPos, sW, sH, routingResult.sourceHandle);
            const endPt = handleToAnchor(tPos, tW, tH, routingResult.targetHandle);
            routedPaths.push({ points: [startPt, endPt] });
        }

        if (!nodeUsage[source.id]) nodeUsage[source.id] = {};
        nodeUsage[source.id][edge.sourceHandle] =
            (nodeUsage[source.id][edge.sourceHandle] || 0) + 1;

        if (!nodeUsage[target.id]) nodeUsage[target.id] = {};
        nodeUsage[target.id][edge.targetHandle] =
            (nodeUsage[target.id][edge.targetHandle] || 0) + 1;
    });

    // Spread shared-side anchors by the opposing endpoint order to avoid X-crossings.
    reorderDomainDagrePortAnchors(clonedEdges, idMap);

    // ═══════════════════════════════════════════════════════════════
    // [FIX] 禁用 P4-P8 后处理管道（对齐 DiagramView-SVG 设计）
    // 根因：P7 beautifyOrthogonalEdges / P8 optimizeTreeBusRouting
    // 使用短格式 handle ID ('r'/'l'/'t'/'b')，与 FlowchartNode 的
    // 全称 Handle ID ('right'/'left'/'top'/'bottom') 不兼容，
    // 导致 React Flow 无法匹配 Handle → 边不渲染。
    // decideEdgeRouting 返回的 handle 已经是正确的全称格式，
    // 直接使用即可。
    // ═══════════════════════════════════════════════════════════════
    const finalRoutedEdges = separateDetachedParallelOverlaps(
        repairEndpointOrthogonalPaths(
            repairEndpointOrthogonalPaths(
                separateDetachedParallelOverlaps(
                    repairSharedTrunkAwareCrossings(clonedEdges, updatedNodes),
                    updatedNodes,
                ),
                updatedNodes,
            ),
            updatedNodes,
        ),
        updatedNodes,
        24,
    );
    return finalRoutedEdges;
}

/**
 * 应用智能边路由
 */
export function applyDomainDagreEdgeRouting(
    nodes: RoutingNode[],
    edges: Edge[],
    idMap: Map<string, RoutingNode>,
    cfg: unknown,
    options: LayoutOptions
): void {
    const getNodeSize = (n: RoutingNode): { width: number; height: number } =>
        routingNodeSize(n, 120, 60);
    const getNodeCenter = (n: RoutingNode): { cx: number; cy: number } => {
        const pos = routingNodeAbsolutePosition(n);
        const size = getNodeSize(n);
        return { cx: pos.x + size.width / 2, cy: pos.y + size.height / 2 };
    };
    const getDominantHandle = (centerNode: RoutingNode, relatives: RoutingNode[]): string => {
        if (relatives.length === 0) return 'bottom';
        const c = getNodeCenter(centerNode);
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        relatives.forEach(rel => {
            if (!rel) return;
            const r = getNodeCenter(rel);
            sumX += r.cx;
            sumY += r.cy;
            count += 1;
        });
        if (count === 0) return 'bottom';
        const dx = sumX / count - c.cx;
        const dy = sumY / count - c.cy;
        const layoutDir = String(options.direction || 'TB').toUpperCase();
        const isHorizontalFlow = layoutDir === 'LR' || layoutDir === 'RL';
        if (isHorizontalFlow) {
            if (count > 1 && Math.abs(dx) > 30) return dx > 0 ? 'right' : 'left';
            if (Math.abs(dy) > Math.abs(dx) * 1.1) return dy > 0 ? 'bottom' : 'top';
            return dx > 0 ? 'right' : 'left';
        }
        if (count > 1 && Math.abs(dy) > 30) return dy > 0 ? 'bottom' : 'top';
        if (Math.abs(dx) > Math.abs(dy) * 1.1) return dx > 0 ? 'right' : 'left';
        return dy > 0 ? 'bottom' : 'top';
    };
    const oppositeHandle = (h: string): string => {
        if (h === 'left' || h === 'l') return 'right';
        if (h === 'right' || h === 'r') return 'left';
        if (h === 'top' || h === 't') return 'bottom';
        if (h === 'bottom' || h === 'b') return 'top';
        return 'bottom';
    };

    const getAbsPos = (n: RoutingNode): { x: number, y: number } => {
        let x = n.position.x;
        let y = n.position.y;
        let current = n;
        let depth = 0;
        while (current.parentId && depth < 10) {
            const parent = idMap.get(current.parentId);
            if (!parent) break;
            x += parent.position.x;
            y += parent.position.y;
            current = parent;
            depth++;
        }
        return { x, y };
    };

    nodes.forEach(n => {
        n.positionAbsolute = getAbsPos(n);
    });

    const cfgEdge = asRoutingRecord(asRoutingRecord(cfg).edge);
    const routingConfig: RoutingConfig = {
        mode: 'advanced-smart' as const,
        globalPath: (cfgEdge.pathType || 'step') as string,
        autoPathSelection: true,
        angleToleranceDeg: Number(cfgEdge.angleToleranceDeg ?? 36),
        bezierDistanceThreshold: Number(cfgEdge.bezierDistanceThreshold ?? 280),
        obstacleScopePadding: Number(cfgEdge.obstacleScopePadding ?? 160),
        corridorObstacleThreshold: Number(cfgEdge.corridorObstacleThreshold ?? 6),
        directionalHandlePolicy: readDirectionalHandlePolicy(cfgEdge.directionalHandlePolicy),
        verticalBiasThreshold: Number(cfgEdge.verticalBiasThreshold ?? 1.2),
        obstaclePadding: Number(cfgEdge.obstaclePadding ?? 24),
        ignoreContainers: Boolean(cfgEdge.ignoreContainers ?? false),
        layoutDirection: options.direction || 'TB'
    };

    // ============================================
    // 预分析：检测一对多和多对一模式
    // ============================================
    const outgoingEdges: Record<string, Edge[]> = {};  // 每个源节点的出边
    const incomingEdges: Record<string, Edge[]> = {};  // 每个目标节点的入边

    edges.forEach(edge => {
        if (!outgoingEdges[edge.source]) outgoingEdges[edge.source] = [];
        outgoingEdges[edge.source].push(edge);
        if (!incomingEdges[edge.target]) incomingEdges[edge.target] = [];
        incomingEdges[edge.target].push(edge);
    });

    // 预计算：对于多对一的目标节点，决定统一的目标端口
    const manyToOneTargetHandle: Record<string, string> = {};

    for (const [targetId, edgeList] of Object.entries(incomingEdges)) {
        if (edgeList.length > 1) {
            const targetNode = idMap.get(targetId);
            if (!targetNode) continue;
            const sources = edgeList
                .map(e => idMap.get(e.source))
                .filter((node): node is RoutingNode => node !== undefined);
            const unifiedHandle = getDominantHandle(targetNode, sources);
            manyToOneTargetHandle[targetId] = unifiedHandle;
        }
    }

    // 预计算：对于一对多的源节点，决定统一的源端口
    const oneToManySourceHandle: Record<string, string> = {};

    for (const [sourceId, edgeList] of Object.entries(outgoingEdges)) {
        if (edgeList.length > 1) {
            const sourceNode = idMap.get(sourceId);
            if (!sourceNode) continue;
            const targets = edgeList
                .map(e => idMap.get(e.target))
                .filter((node): node is RoutingNode => node !== undefined);
            const unifiedHandle = getDominantHandle(sourceNode, targets);
            oneToManySourceHandle[sourceId] = unifiedHandle;
        }
    }

    // ============================================
    // 边路由：应用统一端口或智能选择
    // ============================================
    const nodeUsage: Record<string, Record<string, number>> = {};
    edges.forEach(edge => {
        const source = idMap.get(edge.source);
        const target = idMap.get(edge.target);
        if (!source || !target) return;

        const sUsage = nodeUsage[source.id] || {};
        const tUsage = nodeUsage[target.id] || {};

        // 检查是否需要使用预定的统一端口
        const unifiedSourceHandle = oneToManySourceHandle[source.id];
        const unifiedTargetHandle = manyToOneTargetHandle[target.id];
        const edgeData = asRoutingRecord(edge.data);
        const manualSides = readManualHandleSides(edgeData);
        const sourceDomain = String(source.data.domain ?? '').trim();
        const targetDomain = String(target.data.domain ?? '').trim();
        const sourceSubDomain = String(source.data.subDomain ?? '').trim();
        const targetSubDomain = String(target.data.subDomain ?? '').trim();
        const isHorizontalSubDomainEdge = sourceDomain
            && targetDomain
            && sourceDomain === targetDomain
            && sourceSubDomain
            && targetSubDomain
            && sourceSubDomain !== targetSubDomain;
        const sourceParentId = String(source.parentId ?? '');
        const targetParentId = String(target.parentId ?? '');
        const isCrossContainerEdge = Boolean(sourceParentId && targetParentId && sourceParentId !== targetParentId);
        if (
            (isHorizontalSubDomainEdge || isCrossContainerEdge) &&
            manualSides.includes('source') &&
            manualSides.includes('target') &&
            ['top', 'bottom', 't', 'b'].includes(String(edge.sourceHandle || '').toLowerCase()) &&
            ['top', 'bottom', 't', 'b'].includes(String(edge.targetHandle || '').toLowerCase())
        ) {
            const sPos = routingNodeAbsolutePosition(source);
            const tPos = routingNodeAbsolutePosition(target);
            if (tPos.x >= sPos.x) {
                edge.sourceHandle = 'right';
                edge.targetHandle = 'left';
            } else {
                edge.sourceHandle = 'left';
                edge.targetHandle = 'right';
            }
        }
        const preserveManualHandles = Boolean(edge.sourceHandle && edge.targetHandle)
            && manualSides.includes('source')
            && manualSides.includes('target');

        let routingResult;
        if (preserveManualHandles) {
            routingResult = {
                type: 'advanced-smart-step' as const,
                sourceHandle: edge.sourceHandle,
                targetHandle: edge.targetHandle,
                autoSource: false,
                autoTarget: false,
                computedPath: undefined as Array<{ x: number; y: number }> | undefined,
            };
        } else if (unifiedSourceHandle || unifiedTargetHandle) {
            let sourceHandle: string;
            let targetHandle: string;

            if (unifiedTargetHandle) {
                targetHandle = unifiedTargetHandle;
                sourceHandle = oppositeHandle(targetHandle);
            } else {
                sourceHandle = unifiedSourceHandle || 'bottom';
                targetHandle = oppositeHandle(sourceHandle);
            }

            routingResult = {
                type: 'advanced-smart-step' as const,
                sourceHandle,
                targetHandle,
                computedPath: undefined as Array<{ x: number; y: number }> | undefined,
            };
        } else {
            // 无统一端口约束，使用完整的智能路由
            routingResult = decideEdgeRouting(
                source,
                target,
                nodes,
                routingConfig,
                { source: sUsage, target: tUsage },
                true
            );
        }

        const sourceHandle = expandHandle(routingResult.sourceHandle || 'bottom');
        const targetHandle = expandHandle(routingResult.targetHandle || 'top');
        edge.type = routingResult.type;
        edge.sourceHandle = sourceHandle;
        edge.targetHandle = targetHandle;
        applyAutoHandleData(edge, routingResult.autoSource, routingResult.autoTarget);

        lockComputedPathOnEdge(edge, resolveRoutingResultPath({
            routingResult: {
                sourceHandle,
                targetHandle,
                computedPath: Array.isArray(routingResult.computedPath)
                    ? routingResult.computedPath
                    : undefined,
            },
            source,
            target,
            nodeById: idMap,
        }));
        if (!nodeUsage[source.id]) nodeUsage[source.id] = {};
        nodeUsage[source.id][edge.sourceHandle] =
            (nodeUsage[source.id][edge.sourceHandle] || 0) + 1;

        if (!nodeUsage[target.id]) nodeUsage[target.id] = {};
        nodeUsage[target.id][edge.targetHandle] =
            (nodeUsage[target.id][edge.targetHandle] || 0) + 1;
    });
    separateDetachedParallelOverlaps(
        repairEndpointOrthogonalPaths(
            repairEndpointOrthogonalPaths(
                separateDetachedParallelOverlaps(
                    repairSharedTrunkAwareCrossings(edges, nodes),
                    nodes,
                ),
                nodes,
            ),
            nodes,
        ),
        nodes,
        24,
    )
        .forEach((edge, index) => { edges[index] = edge; });
}
