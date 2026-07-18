import { useCallback, useState, MutableRefObject } from 'react';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { animateLayoutTransition } from '../../../utils/animateLayoutTransition';
import { EdgeRoutingCoordinator } from '../../../services/EdgeRoutingCoordinator';
import { flushObstacles } from '../../custom-edges/obstacleContext';
import { buildChildrenMap, getDescendantIds } from './useCollapsibleGroups';
import { dispatchDiagramControl } from '../../shared/diagramControl';
import { applyLayout, forceDirectedLayout, treeLayout } from '../../../utils/LayoutAlgorithms';
import { coerceDiagramId, getQueryOrHashParamFromLocation } from '../../../utils/inputBoundary';
import { refreshDomainLayoutEdgeForRender } from './layoutEdgeRefresh';
import {
    logLayoutNoLayoutableNodes,
    logLayoutOrphanEdgeDropped,
    logLayoutStrategyFailure,
} from './diagramInteractionLogging';


interface UseLayoutStrategyParams {
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    nodesRef: MutableRefObject<Node[]>;
    edgesRef: MutableRefObject<Edge[]>;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    reactFlowInstance: ReactFlowInstance<any, any> | null;
    diagramId?: string;
    loadLayoutPresetMap?: () => Promise<Record<string, unknown>>;
}

const getNodeDataString = (node: Node, key: string): string => (
    typeof (node.data as any)?.[key] === 'string'
        ? String((node.data as any)[key]).trim()
        : ''
);

const isGeneratedTitleGroupNode = (node: Node): boolean => (
    String(node.type || '') === 'titleGroup' || String(node.id || '').startsWith('titlegroup-')
);

const isGeneratedSubGroupNode = (node: Node): boolean => (
    String(node.type || '') === 'subGroup' || String(node.id || '').startsWith('subgroup-')
);

const isHiddenLayoutNode = (node: Node): boolean => (
    node.hidden === true || (node.data as any)?.hidden === true
);

const uniqueVisibleDataValues = (nodes: Node[], predicate: (node: Node) => boolean, key: string): string[] | undefined => {
    const values = nodes
        .filter(node => predicate(node) && !isHiddenLayoutNode(node))
        .map(node => getNodeDataString(node, key))
        .filter(Boolean);
    return values.length ? Array.from(new Set(values)) : undefined;
};

export const resolveLayoutStrategyGeneratedGroupOptions = (preset: any, currentNodes: Node[] = []) => {
    const layout = preset?.layout as any;
    if (!layout && currentNodes.length > 0) {
        const hasGeneratedContainers = currentNodes.some(node => (
            isGeneratedTitleGroupNode(node) || isGeneratedSubGroupNode(node)
        ));
        if (hasGeneratedContainers) {
            const visibleDomains = uniqueVisibleDataValues(currentNodes, isGeneratedTitleGroupNode, 'domain');
            const visibleSubDomains = uniqueVisibleDataValues(currentNodes, isGeneratedSubGroupNode, 'subDomain');
            return {
                generateDomainGroups: Boolean(visibleDomains?.length),
                generateSubDomainGroups: Boolean(visibleSubDomains?.length),
                domainWhitelist: visibleDomains,
                subDomainWhitelist: visibleSubDomains,
            };
        }
    }
    return {
        generateDomainGroups: layout?.generateDomainGroups !== false,
        generateSubDomainGroups: layout?.generateSubDomainGroups !== false,
        domainWhitelist: Array.isArray(layout?.domainWhitelist) ? layout.domainWhitelist : undefined,
        subDomainWhitelist: Array.isArray(layout?.subDomainWhitelist) ? layout.subDomainWhitelist : undefined,
    };
};

export const stripHiddenGeneratedLayoutNodes = (nodes: Node[], groupOptions?: ReturnType<typeof resolveLayoutStrategyGeneratedGroupOptions>): Node[] => (
    nodes.filter(node => {
        if (isHiddenLayoutNode(node)) return false;
        if (groupOptions?.generateDomainGroups === false && isGeneratedTitleGroupNode(node)) return false;
        if (groupOptions?.generateSubDomainGroups === false && isGeneratedSubGroupNode(node)) return false;
        return true;
    })
);

export const resolveLayoutStrategyPresetFromCandidates = (
    presetMap: Record<string, any>,
    candidates: Array<string | undefined>,
): { id?: string; preset?: any } => {
    for (const candidate of candidates) {
        const id = coerceDiagramId(candidate || '');
        if (!id) continue;
        const preset = presetMap[id];
        if (preset) return { id, preset };
    }
    return {};
};

export const loadLayoutStrategyPresetFromCandidates = async (
    loadPresetMap: (() => Promise<Record<string, unknown>>) | undefined,
    candidates: Array<string | undefined>,
): Promise<{ id?: string; preset?: unknown }> => {
    if (!loadPresetMap) return {};
    const presetMap = await loadPresetMap();
    if (!presetMap || typeof presetMap !== 'object' || Array.isArray(presetMap)) return {};
    return resolveLayoutStrategyPresetFromCandidates(presetMap, candidates);
};

export const normalizeLayoutVisibilityNodes = (rawNodes: Node[]): Node[] => {
    const collapsedGroups = rawNodes.filter(n => n.data?.collapsed);
    const childrenMap = buildChildrenMap(rawNodes);
    const hiddenNodeIds = new Set<string>();
    collapsedGroups.forEach(group => {
        getDescendantIds(rawNodes, group.id, childrenMap).forEach(id => hiddenNodeIds.add(id));
    });

    return rawNodes.map(n => {
        const dataHidden = n.data?.hidden === true;
        const shouldHide = hiddenNodeIds.has(n.id) || n.hidden === true || dataHidden;
        if (shouldHide) {
            return { ...n, hidden: true, data: { ...n.data, hidden: true } };
        }
        return { ...n, hidden: false };
    });
};

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
    const axisOf = (a: { x: number; y: number }, b: { x: number; y: number }): 'h' | 'v' | null => {
        if (Math.abs(a.y - b.y) < 1.5 && Math.abs(a.x - b.x) > 1.5) return 'h';
        if (Math.abs(a.x - b.x) < 1.5 && Math.abs(a.y - b.y) > 1.5) return 'v';
        return null;
    };
    const normalizeComputedPath = (raw: unknown): Array<{ x: number; y: number }> | undefined => {
        if (!Array.isArray(raw) || raw.length < 2) return undefined;
        const points = raw
            .map((p: any) => ({ x: Number(p?.x), y: Number(p?.y) }))
            .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
        if (points.length < 2) return undefined;

        const orthogonal: Array<{ x: number; y: number }> = [points[0]];
        for (let i = 1; i < points.length; i++) {
            const prev = orthogonal[orthogonal.length - 1];
            const curr = points[i];
            if (Math.abs(prev.x - curr.x) > 1.5 && Math.abs(prev.y - curr.y) > 1.5) {
                const next = points[i + 1];
                const hv = { x: curr.x, y: prev.y };
                const vh = { x: prev.x, y: curr.y };
                const hvScore = next && axisOf(hv, curr) !== axisOf(curr, next) ? 1 : 0;
                const vhScore = next && axisOf(vh, curr) !== axisOf(curr, next) ? 1 : 0;
                orthogonal.push(hvScore <= vhScore ? hv : vh);
            }
            orthogonal.push(curr);
        }

        const collapse = (pts: Array<{ x: number; y: number }>) => {
            if (pts.length < 3) return pts;
            const out: Array<{ x: number; y: number }> = [pts[0]];
            for (let i = 1; i < pts.length - 1; i++) {
                const prev = out[out.length - 1];
                const curr = pts[i];
                const next = pts[i + 1];
                const sameX = Math.abs(prev.x - curr.x) < 1.5 && Math.abs(curr.x - next.x) < 1.5;
                const sameY = Math.abs(prev.y - curr.y) < 1.5 && Math.abs(curr.y - next.y) < 1.5;
                if (!sameX && !sameY) out.push(curr);
            }
            out.push(pts[pts.length - 1]);
            return out;
        };

        let cleaned = collapse(orthogonal);
        let changed = true;
        while (changed) {
            changed = false;
            for (let i = 1; i < cleaned.length - 1; i++) {
                const prev = cleaned[i - 1];
                const curr = cleaned[i];
                const next = cleaned[i + 1];
                const shortIn = Math.abs(prev.x - curr.x) + Math.abs(prev.y - curr.y) < 8;
                const shortOut = Math.abs(curr.x - next.x) + Math.abs(curr.y - next.y) < 8;
                if ((shortIn || shortOut) && axisOf(prev, next)) {
                    cleaned = [...cleaned.slice(0, i), ...cleaned.slice(i + 1)];
                    changed = true;
                    break;
                }
            }
        }
        return collapse(cleaned);
    };
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
            const computedPath = normalizeComputedPath(e.data?.computedPath);
            edge.data = {
                ...edge.data,
                waypoints: [],
                computedPath: computedPath ?? e.data?.computedPath,
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

export function useLayoutStrategy({
    setNodes,
    setEdges,
    nodesRef,
    edgesRef,
    takeSnapshot,
    _reactFlowInstance,
    diagramId,
    loadLayoutPresetMap,
}: UseLayoutStrategyParams) {
    // [对齐 SVG 版] 跟踪当前域布局策略和方向
    const [lastDomainStrategy, setLastDomainStrategy] = useState<string>('domain-dagre');
    const [lastDomainDirection, setLastDomainDirection] = useState<'TB' | 'LR'>('TB');
    const [lastNodeLayout, setLastNodeLayout] = useState<string>('dagre');

    // [FIX] 精准两步 fitView：调用统一的 diagramControl 'fit' 逻辑，自适应侧边栏和最小缩放比例
    const twoStepFitView = useCallback(() => {
        requestAnimationFrame(() => {
            dispatchDiagramControl('fit', diagramId);
        });
    }, [diagramId]);

    /** ═══════════════════════════════════════════════════════════════
     * 统一布局入口（对齐 SVG 版 handleAutoLayout）
     * strategyName: 'tree' | 'force' | 'domain-vertical' | 'domain-horizontal' | 'domain-dagre' | 'domain-dagre-sub-horizontal'
     * nodeLayout: 'flow' | 'grid' | 'horizontal' | 'vertical' | 'dagre'
     * direction: 'TB' | 'LR'
     * ═══════════════════════════════════════════════════════════════ */
    const handleStrategyLayout = useCallback(async (strategyName: string, nodeLayout?: string, direction?: 'TB' | 'LR') => {
        const dir = direction || 'TB';

        // [对齐 SVG 版] 跟踪当前域布局策略和方向
        if (strategyName.startsWith('domain-')) {
            setLastDomainStrategy(strategyName);
            setLastDomainDirection(dir);
            if (nodeLayout) setLastNodeLayout(nodeLayout);
        }
        takeSnapshot(nodesRef.current, edgesRef.current);

        try {
            const rawNodes = nodesRef.current;
            const allEdges = edgesRef.current;

            // 1. 自动传播折叠容器的折叠状态到子节点
            // 确保布局策略和后处理管线能够通过 data.hidden 正确过滤隐藏节点
            const allNodes = normalizeLayoutVisibilityNodes(rawNodes);

            // ═══ 前处理：过滤容器、转绝对坐标、清除 parentId ═══
            const nodeById = new Map(allNodes.map(n => [n.id, n]));
            const toAbsolutePosition = (node: Node): { x: number; y: number } => {
                let x = node.position?.x ?? 0;
                let y = node.position?.y ?? 0;
                let pid = (node as any).parentId;
                while (pid) {
                    const parent = nodeById.get(pid);
                    if (!parent) break;
                    x += parent.position?.x ?? 0;
                    y += parent.position?.y ?? 0;
                    pid = (parent as any).parentId;
                }
                return { x, y };
            };
            const containerTypes = new Set(['titleGroup', 'subGroup', 'domain', 'group']);
            const nonLayoutTypes = new Set(['mindmap', 'mindmap-boundary', 'sticky-note']);
            const excludedTypes = new Set([...containerTypes, ...nonLayoutTypes]);
            const plainNodes = allNodes.filter(n => !excludedTypes.has(n.type || ''));
            const layoutNodes = plainNodes.map(n => ({
                ...n,
                position: toAbsolutePosition(n),
                parentId: undefined,
                extent: undefined,
            }));
            const nodeIdSet = new Set(layoutNodes.map(n => n.id));
            const layoutEdges = allEdges.filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target));
            if (layoutNodes.length === 0) { logLayoutNoLayoutableNodes(); return; }

            if (strategyName === 'tree') {
                // ── 扁平树形布局（对齐 SVG 版：不检测域） ──
                const { refineLayout } = await import('../../../strategies/shared/LayoutRefinement');
                const positions = treeLayout(layoutNodes, layoutEdges, { direction: dir });
                const newNodes = applyLayout(layoutNodes, positions);
                // [FIX] 保留非流程图节点
                const treeNodeIds = new Set(newNodes.map(n => n.id));
                const treePreserved = allNodes.filter(n => nonLayoutTypes.has(n.type || '') && !treeNodeIds.has(n.id));
                const treeResultRaw = [...newNodes, ...treePreserved];
                // ⭐ 路由感知后处理：优化节点位置以改善连线质量
                const { nodes: treeResult } = refineLayout(treeResultRaw, layoutEdges, {
                    direction: dir,
                    enableChannelSpacing: true,
                    enableCrossingMinimization: true,
                    enableNodeNudging: false,
                });
                // [FIX] Clear handles + cached data BEFORE animation — let smart port selection decide
                setEdges(prev => prev.map(e => ({ ...e, sourceHandle: null, targetHandle: null, data: { ...e.data, waypoints: [], computedPath: undefined, elkPath: undefined, algorithm: undefined, _layoutEpoch: undefined } })));
                EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
                // ⭐ 平滑过渡动画（edges already have clean data）
                await animateLayoutTransition(setNodes, treeResult, { onComplete: twoStepFitView });
                // [FIX] Post-animation safety clear
                EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
                // [FIX] Double RAF: let RF recompute positionAbsolute, then re-trigger edges
                await new Promise<void>(resolve => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
                            setEdges(prev => prev.map(e => ({ ...e, data: { ...e.data, _layoutEpoch: Date.now() } })));
                            flushObstacles();
                            resolve();
                        });
                    });
                });
            } else if (strategyName === 'force') {
                // ── 扁平力导向布局（对齐 SVG 版：不检测域） ──
                const { refineLayout } = await import('../../../strategies/shared/LayoutRefinement');
                const positions = forceDirectedLayout(layoutNodes, layoutEdges);
                const newNodes = applyLayout(layoutNodes, positions);
                // [FIX] 保留非流程图节点
                const forceNodeIds = new Set(newNodes.map(n => n.id));
                const forcePreserved = allNodes.filter(n => nonLayoutTypes.has(n.type || '') && !forceNodeIds.has(n.id));
                const forceResultRaw = [...newNodes, ...forcePreserved];
                // ⭐ 路由感知后处理
                const { nodes: forceResult } = refineLayout(forceResultRaw, layoutEdges, {
                    direction: dir,
                    enableChannelSpacing: true,
                    enableCrossingMinimization: true,
                    enableNodeNudging: false,
                });
                // [FIX] Clear handles + cached data BEFORE animation — let smart port selection decide
                setEdges(prev => prev.map(e => ({
                    ...e,
                    sourceHandle: null,
                    targetHandle: null,
                    data: { ...e.data, waypoints: [], computedPath: undefined, elkPath: undefined, algorithm: undefined, _layoutEpoch: undefined }
                })));
                EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
                // ⭐ 平滑过渡动画（edges already have clean data）
                await animateLayoutTransition(setNodes, forceResult, { onComplete: twoStepFitView });
                // [FIX] Post-animation safety clear
                EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
                // [FIX] Double RAF: let RF recompute positionAbsolute, then re-trigger edges
                await new Promise<void>(resolve => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
                            setEdges(prev => prev.map(e => ({ ...e, data: { ...e.data, _layoutEpoch: Date.now() } })));
                            flushObstacles();
                            resolve();
                        });
                    });
                });
            } else {
                // ── 域感知策略布局 ──
                const isDomainDagre = strategyName === 'domain-dagre' || strategyName === 'domain-dagre-sub-horizontal' || strategyName === 'dagre';
                const isDomainDagreSubHorizontal = strategyName === 'domain-dagre-sub-horizontal';
                const finalNodeLayout = isDomainDagre
                    ? 'dagre'
                    : (nodeLayout || 'flow');
                // [FIX] 获取域排序：显式配置 > 标准数据节点出现顺序 > 策略内部扫描兜底
                let domainOrder: string[] | undefined;
                let subDomainOrder: Record<string, string[]> | undefined;
                let generatedGroupOptions = resolveLayoutStrategyGeneratedGroupOptions(undefined, allNodes);
                try {
                    const locationDiagramId = getQueryOrHashParamFromLocation(
                        typeof window === 'undefined' ? undefined : window.location,
                        'diagram'
                    );
                    const candidate = await loadLayoutStrategyPresetFromCandidates(
                        loadLayoutPresetMap,
                        [
                            diagramId,
                            locationDiagramId || undefined,
                        ],
                    );
                    const preset = candidate.preset;
                    if (preset) {
                        generatedGroupOptions = resolveLayoutStrategyGeneratedGroupOptions(preset, allNodes);
                        // 优先显式配置
                        domainOrder = (preset as any).layout?.domainOrder;
                        subDomainOrder = (preset as any).layout?.subDomainOrder;
                        // 回退：从节点出现顺序推导
                        if (!domainOrder && Array.isArray((preset as any).nodes)) {
                            const implicitOrder: string[] = [];
                            const implicitSubOrder: Record<string, string[]> = {};
                            for (const n of (preset as any).nodes) {
                                const d = String(n.domain || '').trim();
                                if (!d || d === '默认域' || d === 'default') continue;
                                if (!implicitOrder.includes(d)) implicitOrder.push(d);
                                const s = String(n.subDomain || '').trim();
                                if (s) {
                                    if (!implicitSubOrder[d]) implicitSubOrder[d] = [];
                                    if (!implicitSubOrder[d].includes(s)) implicitSubOrder[d].push(s);
                                }
                            }
                            if (implicitOrder.length > 0) {
                                domainOrder = implicitOrder;
                                if (!subDomainOrder) subDomainOrder = implicitSubOrder;
                            }
                        }
                    }
                } catch { /* ignore */ }

                let strategy: any;
                // [FIX] domain-dagre 始终走 DomainDagreLayoutStrategy（唯一支持 domainOrder 的策略）
                if (isDomainDagre) {
                    const { DomainDagreLayoutStrategy } = await import('../../../strategies/DomainDagreLayoutStrategy');
                    strategy = new DomainDagreLayoutStrategy();
                } else if (strategyName === 'domain-vertical') {
                    const { DomainVerticalLayoutStrategy } = await import('../../../strategies/DomainVerticalLayoutStrategy');
                    strategy = new DomainVerticalLayoutStrategy();
                } else if (strategyName === 'domain-horizontal') {
                    const { DomainHorizontalLayoutStrategy } = await import('../../../strategies/DomainHorizontalLayoutStrategy');
                    strategy = new DomainHorizontalLayoutStrategy();
                } else if (strategyName === 'domain-elk' || strategyName === 'elk') {
                    const { DomainElkLayoutStrategy } = await import('../../../strategies/DomainElkLayoutStrategy');
                    strategy = new DomainElkLayoutStrategy();
                } else if (strategyName === 'dagre') {
                    const { DomainDagreLayoutStrategy } = await import('../../../strategies/DomainDagreLayoutStrategy');
                    strategy = new DomainDagreLayoutStrategy();
                } else {
                    const { DomainVerticalLayoutStrategy } = await import('../../../strategies/DomainVerticalLayoutStrategy');
                    strategy = new DomainVerticalLayoutStrategy();
                }

                const result = await strategy.calculateLayout(layoutNodes, layoutEdges, {
                    type: strategy.getName() as any,
                    direction: dir,
                    nodeLayout: finalNodeLayout as any,
                    spacing: { horizontal: 50, vertical: 50 },
                    padding: { top: 40, right: 20, bottom: 20, left: 20 },
                    ...generatedGroupOptions,
                    fitDomainContent: true,
                    domainOrder,
                    subDomainOrder,
                    domainSubGroupDirection: isDomainDagreSubHorizontal ? 'LR' : dir,
                    subDomainNodeDirection: dir,
                } as any);

                if (result.nodes.length > 0) {
                    // [FIX] 保留非流程图节点（mindmap、sticky-note 等）：布局算法不处理它们，但不能丢弃
                    const resultNodeIds = new Set(result.nodes.map((n: any) => n.id));
                    const preservedNodes = allNodes.filter(n => nonLayoutTypes.has(n.type || '') && !resultNodeIds.has(n.id));
                    const finalNodes = stripHiddenGeneratedLayoutNodes(
                        [...result.nodes, ...preservedNodes],
                        generatedGroupOptions,
                    );
                    // 域布局策略已完成所有位置计算，禁止后处理微调
                    // [FIX] Clear edges + cache BEFORE animation
                    setEdges(sanitizeLayoutEdges(finalNodes, result.edges, dir));
                    EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
                    await animateLayoutTransition(setNodes, finalNodes, { onComplete: twoStepFitView });
                    // [FIX] Post-animation safety clear
                    EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
                    // [FIX] ROOT CAUSE FIX: After setNodes(targetNodes), React Flow needs one render cycle
                    // to recompute `internals.positionAbsolute` for child nodes (those with parentId).
                    // Smart edges read `nodeLookup.internals.positionAbsolute` — if stale, centeredCoords
                    // get wrong absolute coords (e.g. sourceY=2570 instead of 200).
                    // Double RAF ensures RF's internal state is updated before we force edge re-render.
                    await new Promise<void>(resolve => {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
                                // Touch edges to force re-render with fresh positionAbsolute.
                                const layoutEpoch = Date.now();
                                setEdges(prev => prev.map(e => refreshDomainLayoutEdgeForRender(e, layoutEpoch)));
                                flushObstacles();
                                resolve();
                            });
                        });
                    });
                }
            }
        } catch (err) {
            logLayoutStrategyFailure(strategyName, err);
        }
    }, [diagramId, loadLayoutPresetMap, setNodes, setEdges, takeSnapshot, nodesRef, edgesRef, twoStepFitView]);

    return {
        handleStrategyLayout,
        lastDomainStrategy,
        lastDomainDirection,
        lastNodeLayout,
    };
}
