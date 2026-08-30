import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { requestLayoutCommitFit } from '../../shared/diagramControlRequest';
import { applyLayout, forceDirectedLayout, treeLayout } from '../../../utils/LayoutAlgorithms';
import { getQueryOrHashParamFromLocation } from '../../../utils/inputBoundary';
import {
    preserveEdgesOnEmptyLayoutResult,
    resolveLayoutSourceEdges,
} from './layoutEdgeBoundary';
import {
    useLayoutRoutingTransaction,
    type LayoutPresentationPreviewRequest,
} from './useLayoutRoutingTransaction';
import { clearBaseReactFlowLayoutEdgeRoutingData } from '../../shared/baseReactFlowLayoutEdgeRoutingData';
import type { BaseReactFlowRoutingSessionRuntime } from '../../shared/baseReactFlowRoutingSessionRuntime';
import { createLayoutRoutingTransactionDiagnostics } from './layoutRoutingTransactionDiagnostics';
import { normalizeLayoutVisibilityNodes } from './layoutVisibilityNodes';
import { isDirectedForestLayoutGraph } from './treeLayoutTopology';
import { commitCyclicTreeLayeredLayout } from './cyclicTreeLayeredLayout';
import { calculateLayeredLayoutWithReverse } from './reverseLayeredLayoutGeometry';
import {
    clearLayoutEdgeRoutingType,
    prepareLayeredLayoutEdges,
} from './layeredLayoutEdgePreparation';
import type { ILayoutStrategy } from '../../../types/layout-strategy';
import type { LayoutOptions } from '../../../types/layout';
import type { ElkLayoutExecutor } from '../../../ports/elkLayoutExecutor';
import {
    logLayoutNoLayoutableNodes,
    logLayoutStrategyDomainPreservingFallback,
    logLayoutStrategySafetyFallback,
    logLayoutStrategyFailure,
} from './diagramInteractionLogging';
import {
    isGlobalFullGraphLayoutStrategy,
    isOrderedDomainLaneLayoutStrategy,
    resolveDomainLayoutRoutingQuality,
    resolveLayoutDomainOrder,
    shouldPromoteDomainDagreRouteCandidate,
    shouldRetryRejectedDomainLayoutWithCompoundElk,
    type FlowchartLayoutDirection,
} from '../flowchartLayoutStrategyMode';
import {
    createLazyElkLayoutExecutor,
    LAYERED_TREE_ROUTING_SPACING,
    loadDomainCompoundElkStrategy,
    loadDomainElkStrategy,
} from './layoutStrategyRuntime';
import {
    asLayoutStrategyRecord as asRecord,
    clearLayoutRuntimeAbsolutePosition,
    coerceLayoutStrategyStringArray as coerceStringArray,
    coerceLayoutStrategyStringArrayRecord as coerceStringArrayRecord,
    loadLayoutStrategyPresetFromCandidates,
    resolveLayoutStrategyGeneratedGroupOptions,
    stripHiddenGeneratedLayoutNodes,
} from './layoutStrategyInputBoundary';

export {
    LAYERED_TREE_ROUTING_SPACING,
    loadDomainCompoundElkStrategy,
    loadDomainElkStrategy,
} from './layoutStrategyRuntime';
export { normalizeLayoutVisibilityNodes } from './layoutVisibilityNodes';
export {
    clearLayoutRuntimeAbsolutePosition,
    loadLayoutStrategyPresetFromCandidates,
    resolveLayoutStrategyGeneratedGroupOptions,
    resolveLayoutStrategyPresetFromCandidates,
    stripHiddenGeneratedLayoutNodes,
} from './layoutStrategyInputBoundary';


interface UseLayoutStrategyParams {
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    nodesRef: MutableRefObject<Node[]>;
    edgesRef: MutableRefObject<Edge[]>;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    reactFlowInstance: ReactFlowInstance | null;
    diagramId?: string;
    loadLayoutPresetMap?: () => Promise<Record<string, unknown>>;
    setLayoutStable?: React.Dispatch<React.SetStateAction<boolean>>;
    routingSessionRuntime: BaseReactFlowRoutingSessionRuntime;
    publishLayoutPreview?: (request: LayoutPresentationPreviewRequest) => void;
    clearLayoutPreview?: (
        routingJob: LayoutPresentationPreviewRequest['routingJob'],
    ) => boolean | undefined;
}

export function useLayoutStrategy({
    setNodes,
    setEdges,
    nodesRef,
    edgesRef,
    takeSnapshot,
    reactFlowInstance,
    diagramId,
    loadLayoutPresetMap,
    setLayoutStable,
    routingSessionRuntime,
    publishLayoutPreview,
    clearLayoutPreview,
}: UseLayoutStrategyParams) {
    // lastDomainStrategy is retained as a public compatibility name, but it
    // represents the active top-level layout strategy (domain-aware or global).
    const [lastDomainStrategy, setLastDomainStrategy] = useState<string>('domain-dagre');
    const [lastDomainDirection, setLastDomainDirection] = useState<FlowchartLayoutDirection>('TB');
    // Remember the domain-internal arrangement across temporary global modes.
    const [lastNodeLayout, setLastNodeLayout] = useState<string>('dagre');
    const elkLayoutExecutorRef = useRef<ElkLayoutExecutor | null>(null);
    const layoutFitControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const executor = createLazyElkLayoutExecutor();
        elkLayoutExecutorRef.current = executor;
        return () => {
            layoutFitControllerRef.current?.abort();
            layoutFitControllerRef.current = null;
            if (elkLayoutExecutorRef.current === executor) {
                elkLayoutExecutorRef.current = null;
            }
            executor.dispose();
        };
    }, []);

    const commitLayout = useLayoutRoutingTransaction({
        setNodes,
        setEdges,
        setLayoutStable,
        nodesRef,
        edgesRef,
        takeSnapshot,
        routingSessionRuntime,
        publishLayoutPreview,
        clearLayoutPreview,
    });

    /** ═══════════════════════════════════════════════════════════════
     * 统一布局入口（对齐 SVG 版 handleAutoLayout）
     * strategyName: 'tree' | 'force' | 'domain-vertical' | 'domain-horizontal' | 'domain-dagre' | 'domain-dagre-sub-horizontal' | 'domain-lanes'
     * nodeLayout: 'flow' | 'grid' | 'horizontal' | 'vertical' | 'dagre'
     * direction: 'TB' | 'BT' | 'LR' | 'RL'
     * ═══════════════════════════════════════════════════════════════ */
    const handleStrategyLayout = useCallback(async (
        strategyName: string,
        nodeLayout?: string,
        direction?: FlowchartLayoutDirection,
    ) => {
        // The layout intent must own the Canvas routing epoch before any
        // asynchronous strategy/ELK work starts. Otherwise a stale layout
        // result could open a fresh epoch after a newer display commit.
        const routingJob = routingSessionRuntime.beginJob('layout');
        const transactionDiagnostics = createLayoutRoutingTransactionDiagnostics(routingJob.id);
        transactionDiagnostics.beginPhase('command');
        layoutFitControllerRef.current?.abort();
        const layoutFitController = new AbortController();
        layoutFitControllerRef.current = layoutFitController;
        const beforePreviewRelease = () => requestLayoutCommitFit({
            diagramId,
            signal: layoutFitController.signal,
        });
        // Capture the Canvas-owned runner once for the whole job. If unmount
        // disposes it while an async continuation is pending, that continuation
        // must fail against the disposed owner instead of creating a one-shot
        // worker outside the Canvas lifecycle.
        const layoutContext = {
            signal: routingJob.signal,
            elkLayoutRunner: elkLayoutExecutorRef.current ?? undefined,
        };
        transactionDiagnostics.finishPhase('command');
        const dir = direction || 'TB';
        const appliedDirection = dir;
        const axisDirection = dir === 'LR' || dir === 'RL' ? 'LR' : 'TB';
        let appliedStrategyName = strategyName;
        let appliedNodeLayout = nodeLayout;

        try {
            transactionDiagnostics.beginPhase('input-preparation');
            const rawNodes = nodesRef.current;

            // 1. 自动传播折叠容器的折叠状态到子节点
            // 确保布局策略和后处理管线能够通过 data.hidden 正确过滤隐藏节点
            const allNodes = normalizeLayoutVisibilityNodes(rawNodes);
            const allEdges = resolveLayoutSourceEdges(
                edgesRef.current,
                reactFlowInstance?.getEdges(),
                new Set(allNodes.map(node => node.id)),
            );

            // ═══ 前处理：过滤容器、转绝对坐标、清除 parentId ═══
            const nodeById = new Map(allNodes.map(n => [n.id, n]));
            const toAbsolutePosition = (node: Node): { x: number; y: number } => {
                let x = node.position?.x ?? 0;
                let y = node.position?.y ?? 0;
                let pid = node.parentId;
                while (pid) {
                    const parent = nodeById.get(pid);
                    if (!parent) break;
                    x += parent.position?.x ?? 0;
                    y += parent.position?.y ?? 0;
                    pid = parent.parentId;
                }
                return { x, y };
            };
            const containerTypes = new Set(['titleGroup', 'subGroup', 'domain', 'group']);
            const nonLayoutTypes = new Set(['mindmap', 'mindmap-boundary', 'sticky-note']);
            const excludedTypes = new Set([...containerTypes, ...nonLayoutTypes]);
            const plainNodes = allNodes.filter(n => !excludedTypes.has(n.type || ''));
            const layoutNodes = plainNodes.map(n => clearLayoutRuntimeAbsolutePosition({
                ...n,
                position: toAbsolutePosition(n),
                parentId: undefined,
                extent: undefined,
            }));
            const nodeIdSet = new Set(layoutNodes.map(n => n.id));
            const layoutEdges = allEdges.filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target));
            if (layoutNodes.length === 0) {
                logLayoutNoLayoutableNodes();
                transactionDiagnostics.noLayoutableNodes();
                return false;
            }
            transactionDiagnostics.finishPhase('input-preparation');

            const commitLayoutAttempt = async (
                request: Parameters<typeof commitLayout>[0],
            ): Promise<void> => {
                transactionDiagnostics.finishPhase('layout-calculation');
                transactionDiagnostics.beginAttempt();
                await commitLayout({ ...request, diagnostics: transactionDiagnostics });
            };

            transactionDiagnostics.beginPhase('layout-calculation');
            if (strategyName === 'tree') {
                // ── 扁平树形布局（对齐 SVG 版：不检测域） ──
                const { refineLayout } = await import('../../../strategies/shared/LayoutRefinement');
                const usesNativeTreeLayout = isDirectedForestLayoutGraph(layoutNodes, layoutEdges);
                if (usesNativeTreeLayout) {
                    const positions = treeLayout(layoutNodes, layoutEdges, {
                        direction: dir,
                        ...LAYERED_TREE_ROUTING_SPACING,
                    });
                    const newNodes = applyLayout(layoutNodes, positions);
                    const treeNodeIds = new Set(newNodes.map(n => n.id));
                    const treePreserved = allNodes.filter(n => (
                        nonLayoutTypes.has(n.type || '') && !treeNodeIds.has(n.id)
                    ));
                    const treeResult = refineLayout([...newNodes, ...treePreserved], layoutEdges, {
                        direction: axisDirection,
                        enableChannelSpacing: true,
                        enableCrossingMinimization: true,
                        enableNodeNudging: false,
                    }).nodes;
                    await commitLayoutAttempt({
                        nodes: treeResult,
                        edges: prepareLayeredLayoutEdges(treeResult, layoutEdges, dir),
                        routingJob,
                        beforePreviewRelease,
                        candidateRepairPolicy: 'default',
                    });
                } else {
                    // A graph with multiple parents or feedback cycles is not a
                    // tree. Use the industry layered engine for ranking while
                    // retaining the user's Tree command and the common hard
                    // routing transaction.
                    await commitCyclicTreeLayeredLayout({
                        layoutNodes,
                        layoutEdges,
                        allNodes,
                        nonLayoutTypes,
                        direction: dir,
                        context: layoutContext,
                    }, async (candidate, usedCompoundFallback) => {
                        await commitLayoutAttempt({
                            ...candidate,
                            routingJob,
                            beforePreviewRelease,
                            rejectUnanchoredFlatElkCandidate: !usedCompoundFallback,
                            retainLayoutPreviewOnFailure: !usedCompoundFallback,
                            candidateRepairPolicy: usedCompoundFallback ? 'default' : 'skip-exact-clean',
                        });
                    });
                }
            } else if (strategyName === 'force') {
                // ── 扁平力导向布局（对齐 SVG 版：不检测域） ──
                const { refineLayout } = await import('../../../strategies/shared/LayoutRefinement');
                const { resolveForceLayoutEngine } = await import('./forceLayoutTopology');
                const forceEngine = resolveForceLayoutEngine(layoutNodes, layoutEdges);
                let newNodes: Node[];
                let forceSourceEdges = layoutEdges;
                if (forceEngine === 'force') {
                    const positions = forceDirectedLayout(layoutNodes, layoutEdges, {
                        initialization: 'deterministic',
                    });
                    newNodes = applyLayout(layoutNodes, positions);
                } else {
                    const layered = await (await loadDomainElkStrategy()).calculateLayout(
                        layoutNodes,
                        layoutEdges,
                        {
                            type: 'elk-layered' as LayoutOptions['type'],
                            direction: dir,
                            nodeLayout: 'elk-layered' as LayoutOptions['nodeLayout'],
                            spacing: { horizontal: 120, vertical: 120 },
                            edgeRouting: 'ORTHOGONAL',
                            padding: { top: 40, right: 20, bottom: 20, left: 20 },
                        },
                        layoutContext,
                    );
                    newNodes = layered.nodes;
                    forceSourceEdges = layered.edges;
                }
                // [FIX] 保留非流程图节点
                const forceNodeIds = new Set(newNodes.map(n => n.id));
                const forcePreserved = allNodes.filter(n => nonLayoutTypes.has(n.type || '') && !forceNodeIds.has(n.id));
                const forceResultRaw = [...newNodes, ...forcePreserved];
                // ⭐ 路由感知后处理
                const forceResult = forceEngine === 'force'
                    ? refineLayout(forceResultRaw, layoutEdges, {
                        direction: axisDirection,
                        enableChannelSpacing: true,
                        enableCrossingMinimization: true,
                        enableNodeNudging: false,
                    }).nodes
                    : forceResultRaw;
                const forceEdges = forceEngine === 'force'
                    ? layoutEdges.map(e => ({
                        ...e,
                        sourceHandle: null,
                        targetHandle: null,
                        type: clearLayoutEdgeRoutingType(e),
                        data: clearBaseReactFlowLayoutEdgeRoutingData(e.data),
                    }))
                    : prepareLayeredLayoutEdges(forceResult, forceSourceEdges, dir);
                await commitLayoutAttempt({
                    nodes: forceResult,
                    edges: forceEdges,
                    routingJob,
                    beforePreviewRelease,
                });
            } else {
                // ── 域感知策略布局 ──
                const isDomainLane = isOrderedDomainLaneLayoutStrategy(strategyName);
                const isDomainDagre = strategyName === 'domain-dagre' || strategyName === 'domain-dagre-sub-horizontal' || strategyName === 'dagre' || isDomainLane;
                const isDomainElk = strategyName === 'domain-elk' || strategyName === 'elk';
                const isDomainCompoundElk = strategyName === 'domain-compound-elk';
                const finalNodeLayout = isDomainDagre && !isDomainLane
                    ? 'dagre'
                    : (nodeLayout || 'dagre');
                // Explicit semantic order wins. Ordinary domain layouts retain
                // the legacy scan-order fallback; cyclic swimlanes leave an
                // absent order unset so their bounded net-flow sweep can run.
                let domainOrder: string[] | undefined;
                let subDomainOrder: Record<string, string[]> | undefined;
                let generatedGroupOptions = resolveLayoutStrategyGeneratedGroupOptions(undefined, allNodes);
                const locationDiagramId = getQueryOrHashParamFromLocation(
                    typeof window === 'undefined' ? undefined : window.location,
                    'diagram'
                );
                const presetCandidate = loadLayoutStrategyPresetFromCandidates(
                    loadLayoutPresetMap,
                    [diagramId, locationDiagramId || undefined],
                );
                try {
                    const candidate = await presetCandidate;
                    const preset = candidate.preset;
                    if (preset) {
                        const presetRecord = asRecord(preset);
                        const presetLayout = asRecord(presetRecord.layout);
                        generatedGroupOptions = resolveLayoutStrategyGeneratedGroupOptions(preset, allNodes);
                        // 优先显式配置
                        domainOrder = coerceStringArray(presetLayout.domainOrder);
                        subDomainOrder = coerceStringArrayRecord(presetLayout.subDomainOrder);
                        // 回退：从节点出现顺序推导
                        if (!domainOrder && Array.isArray(presetRecord.nodes)) {
                            const implicitOrder: string[] = [];
                            const implicitSubOrder: Record<string, string[]> = {};
                            for (const rawNode of presetRecord.nodes) {
                                const presetNode = asRecord(rawNode);
                                const d = String(presetNode.domain || '').trim();
                                if (!d || d === '默认域' || d === 'default') continue;
                                if (!implicitOrder.includes(d)) implicitOrder.push(d);
                                const s = String(presetNode.subDomain || '').trim();
                                if (s) {
                                    if (!implicitSubOrder[d]) implicitSubOrder[d] = [];
                                    if (!implicitSubOrder[d].includes(s)) implicitSubOrder[d].push(s);
                                }
                            }
                            if (implicitOrder.length > 0) {
                                domainOrder = resolveLayoutDomainOrder(
                                    strategyName,
                                    domainOrder,
                                    implicitOrder,
                                );
                                if (!subDomainOrder) subDomainOrder = implicitSubOrder;
                            }
                        }
                    }
                } catch { /* ignore */ }

                let strategy: ILayoutStrategy;
                // [FIX] domain-dagre 始终走 DomainDagreLayoutStrategy（唯一支持 domainOrder 的策略）
                if (isDomainDagre) {
                    strategy = new (await import('../../../strategies/DomainDagreLayoutStrategy')).DomainDagreLayoutStrategy();
                } else if (strategyName === 'domain-horizontal') {
                    strategy = new (await import('../../../strategies/DomainHorizontalLayoutStrategy')).DomainHorizontalLayoutStrategy();
                } else if (isDomainElk) {
                    strategy = await loadDomainElkStrategy();
                } else if (isDomainCompoundElk) {
                    strategy = await loadDomainCompoundElkStrategy();
                } else {
                    strategy = new (await import('../../../strategies/DomainVerticalLayoutStrategy')).DomainVerticalLayoutStrategy();
                }

                const layoutOptions: LayoutOptions = {
                    type: strategy.getName() as LayoutOptions['type'],
                    direction: dir,
                    nodeLayout: finalNodeLayout as LayoutOptions['nodeLayout'],
                    spacing: isDomainElk || isDomainCompoundElk
                        ? { horizontal: 120, vertical: 120 }
                        : isDomainLane
                            ? { horizontal: 120, vertical: 120 }
                            : { horizontal: 50, vertical: 50 },
                    edgeRouting: isDomainElk || isDomainCompoundElk ? 'ORTHOGONAL' : undefined,
                    edgeRoutingQuality: resolveDomainLayoutRoutingQuality(strategyName),
                    padding: { top: 40, right: 20, bottom: 20, left: 20 },
                    ...generatedGroupOptions,
                    fitDomainContent: true,
                    domainPlacement: isDomainLane ? 'ordered-lanes' : 'topology',
                    domainOrder,
                    subDomainOrder,
                    domainSubGroupDirection: strategyName === 'domain-dagre-sub-horizontal'
                        ? 'LR'
                        : dir,
                    subDomainNodeDirection: dir,
                };
                const legacyFallback = await import('./legacyDomainLayoutFallback');
                const canUseFlatElkFallback = Boolean(
                    legacyFallback?.canUseFlatElkSafetyFallback(
                        generatedGroupOptions,
                        layoutNodes,
                    ),
                );
                let usedDomainElk = isDomainElk;
                let usedDomainCompoundElk = isDomainCompoundElk;
                let usedDomainDagre = isDomainDagre;
                const calculateDomainCompoundElkFallback = async (
                    fallbackDirection: FlowchartLayoutDirection = dir,
                ) => {
                    const compoundStrategy = await loadDomainCompoundElkStrategy();
                    const fallbackResult = await calculateLayeredLayoutWithReverse(
                        compoundStrategy,
                        layoutNodes,
                        layoutEdges,
                        {
                            ...layoutOptions,
                            type: 'elk-layered' as LayoutOptions['type'],
                            nodeLayout: 'elk-layered' as LayoutOptions['nodeLayout'],
                            spacing: { horizontal: 120, vertical: 120 },
                            edgeRouting: 'ORTHOGONAL',
                        },
                        fallbackDirection,
                        true,
                        layoutContext,
                    );
                    usedDomainCompoundElk = true;
                    usedDomainDagre = false;
                    appliedStrategyName = 'domain-compound-elk';
                    appliedNodeLayout = undefined;
                    return fallbackResult;
                };
                const topologyFallback = !isDomainElk && !isDomainCompoundElk && !isDomainLane
                    ? legacyFallback.resolveLegacyDomainTopologyFallback(
                        generatedGroupOptions,
                        layoutNodes,
                        layoutEdges,
                    )
                    : null;
                if (topologyFallback === 'flat-elk') {
                    logLayoutStrategySafetyFallback(strategyName);
                    strategy = await loadDomainElkStrategy();
                    usedDomainElk = true;
                    usedDomainDagre = false;
                    appliedStrategyName = 'domain-elk';
                    appliedNodeLayout = undefined;
                } else if (topologyFallback === 'domain-compound-elk') {
                    logLayoutStrategyDomainPreservingFallback(strategyName);
                    strategy = await loadDomainCompoundElkStrategy();
                    usedDomainCompoundElk = true;
                    usedDomainDagre = false;
                    appliedStrategyName = 'domain-compound-elk';
                    appliedNodeLayout = undefined;
                }
                const effectiveLayoutOptions = usedDomainElk || usedDomainCompoundElk
                    ? {
                        ...layoutOptions,
                        type: 'elk-layered' as LayoutOptions['type'],
                        nodeLayout: 'elk-layered' as LayoutOptions['nodeLayout'],
                        spacing: { horizontal: 120, vertical: 120 },
                        edgeRouting: 'ORTHOGONAL' as const,
                    }
                    : layoutOptions;
                let result = await calculateLayeredLayoutWithReverse(
                    strategy,
                    layoutNodes,
                    layoutEdges,
                    effectiveLayoutOptions,
                    dir,
                    isDomainLane || usedDomainCompoundElk,
                    layoutContext,
                );
                if (!usedDomainElk && !usedDomainCompoundElk && !isDomainLane) {
                    const qualityFallback = legacyFallback.resolveLegacyDomainQualityFallback(
                        generatedGroupOptions,
                        result.nodes,
                        result.edges,
                    );
                    if (qualityFallback === 'flat-elk') {
                        logLayoutStrategySafetyFallback(strategyName);
                        const elkStrategy = await loadDomainElkStrategy();
                        result = await elkStrategy.calculateLayout(layoutNodes, layoutEdges, {
                            ...layoutOptions,
                            type: 'elk-layered' as LayoutOptions['type'],
                            nodeLayout: 'elk-layered' as LayoutOptions['nodeLayout'],
                            spacing: { horizontal: 120, vertical: 120 },
                            edgeRouting: 'ORTHOGONAL',
                        }, layoutContext);
                        usedDomainElk = true;
                        usedDomainDagre = false;
                        appliedStrategyName = 'domain-elk';
                        appliedNodeLayout = undefined;
                    } else if (
                        qualityFallback === 'domain-compound-elk'
                        && !usedDomainCompoundElk
                    ) {
                        logLayoutStrategyDomainPreservingFallback(strategyName);
                        result = await calculateDomainCompoundElkFallback();
                    }
                }

                if (result.nodes.length > 0) {
                    const commitDomainResult = async (
                        candidate: typeof result,
                        candidateUsesElk: boolean,
                        candidateUsesCompoundElk: boolean,
                        candidateUsesDomainDagre: boolean,
                        candidateDirection: FlowchartLayoutDirection,
                    ) => {
                        // Preserve non-flow nodes; semantic containers are
                        // regenerated by the domain-aware strategy itself.
                        const resultNodeIds = new Set(candidate.nodes.map(node => node.id));
                        const preservedNodes = allNodes.filter(n => (
                            nonLayoutTypes.has(n.type || '') && !resultNodeIds.has(n.id)
                        ));
                        const finalNodes = stripHiddenGeneratedLayoutNodes(
                            [...candidate.nodes, ...preservedNodes],
                            generatedGroupOptions,
                        );
                        const finalNodeIds = new Set(finalNodes.map(node => node.id));
                        const preservedResultEdges = preserveEdgesOnEmptyLayoutResult(
                            layoutEdges,
                            candidate.edges,
                            finalNodeIds,
                        );
                        const finalEdges = candidateUsesElk
                            || candidateUsesCompoundElk
                            || candidateUsesDomainDagre
                            ? prepareLayeredLayoutEdges(
                                finalNodes,
                                preservedResultEdges,
                                candidateDirection,
                                {
                                    promoteLockedComputedPath:
                                        candidateUsesDomainDagre
                                        && !candidateUsesElk
                                        && !candidateUsesCompoundElk
                                        && shouldPromoteDomainDagreRouteCandidate(strategyName),
                                },
                            )
                            : preservedResultEdges.map(edge => ({
                                ...edge,
                                sourceHandle: null,
                                targetHandle: null,
                                type: clearLayoutEdgeRoutingType(edge),
                                data: clearBaseReactFlowLayoutEdgeRoutingData(edge.data),
                            }));
                        await commitLayoutAttempt({
                            nodes: finalNodes,
                            edges: finalEdges,
                            routingJob,
                            beforePreviewRelease,
                            rejectObstacleDirtyBoundedCandidate: isDomainLane,
                            rejectUnanchoredFlatElkCandidate:
                                candidateUsesElk && !candidateUsesCompoundElk,
                            retainLayoutPreviewOnFailure:
                                shouldRetryRejectedDomainLayoutWithCompoundElk({
                                    usedDomainElk,
                                    usedDomainCompoundElk,
                                    canUseFlatElkFallback,
                                    hardQualityRejected: true,
                                }),
                            candidateRepairPolicy:
                                candidateUsesElk && !candidateUsesCompoundElk
                                    ? 'skip-exact-clean'
                                    : 'default',
                        });
                    };

                    try {
                        await commitDomainResult(
                            result,
                            usedDomainElk,
                            usedDomainCompoundElk,
                            usedDomainDagre,
                            appliedDirection,
                        );
                    } catch (error) {
                        const hardQualityRejected = Boolean(
                            legacyFallback.isLayoutRoutingHardQualityRejection(error),
                        );
                        const canRetryWithDomainCompoundElk = shouldRetryRejectedDomainLayoutWithCompoundElk({
                            usedDomainElk,
                            usedDomainCompoundElk,
                            canUseFlatElkFallback,
                            hardQualityRejected,
                        });
                        if (!canRetryWithDomainCompoundElk) throw error;
                        logLayoutStrategyDomainPreservingFallback(strategyName);
                        transactionDiagnostics.beginPhase('layout-calculation');
                        result = await calculateDomainCompoundElkFallback();
                        await commitDomainResult(
                            result,
                            false,
                            true,
                            false,
                            appliedDirection,
                        );
                    }
                }
            }
            setLastDomainStrategy(appliedStrategyName);
            setLastDomainDirection(appliedDirection);
            if (appliedNodeLayout && !isGlobalFullGraphLayoutStrategy(appliedStrategyName)) {
                setLastNodeLayout(appliedNodeLayout);
            }
            transactionDiagnostics.committed();
            return true;
        } catch (err) {
            transactionDiagnostics.failed(err);
            logLayoutStrategyFailure(strategyName, err);
            return false;
        } finally {
            if (routingSessionRuntime.isCurrentJob(routingJob)) {
                const released = clearLayoutPreview?.(routingJob) ?? true;
                if (released) setLayoutStable?.(true);
            }
            if (layoutFitControllerRef.current === layoutFitController) {
                layoutFitControllerRef.current = null;
            }
            layoutFitController.abort();
            routingSessionRuntime.cancelJob(routingJob);
        }
    }, [
        clearLayoutPreview,
        commitLayout,
        diagramId,
        loadLayoutPresetMap,
        reactFlowInstance,
        nodesRef,
        edgesRef,
        routingSessionRuntime,
        setLayoutStable,
    ]);

    return {
        handleStrategyLayout,
        lastDomainStrategy,
        lastDomainDirection,
        lastNodeLayout,
    };
}
