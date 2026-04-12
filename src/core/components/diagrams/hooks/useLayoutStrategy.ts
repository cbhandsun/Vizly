import { useCallback, useState, useRef, MutableRefObject } from 'react';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { treeLayout, forceDirectedLayout, applyLayout } from '../../../utils/LayoutAlgorithms';
import { animateLayoutTransition } from '../../../utils/animateLayoutTransition';
import { EdgeRoutingCoordinator } from '../../../services/EdgeRoutingCoordinator';
import { flushObstacles } from '../../custom-edges/ObstacleContext';

interface UseLayoutStrategyParams {
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    nodesRef: MutableRefObject<Node[]>;
    edgesRef: MutableRefObject<Edge[]>;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    reactFlowInstance: ReactFlowInstance<any, any>;
}

/**
 * 边验证：确保布局后所有边有效
 *
 * 后处理管道 (P7 beautifyOrthogonalEdges / P8 optimizeTreeBusRouting) 使用短格式 handle ID ('r'/'l'/'t'/'b')
 * 而 FlowchartNode 只注册了全称 Handle ID ('right'/'left'/'top'/'bottom')
 * 必须先正确映射短格式→全称，再验证有效性
 */
function sanitizeLayoutEdges(resultNodes: Node[], resultEdges: Edge[], dir: 'TB' | 'LR'): Edge[] {
    const nodeIdSet = new Set(resultNodes.map(n => n.id));
    const validHandles = new Set(['top', 'right', 'bottom', 'left']);
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
    let orphan = 0, expanded = 0, defaulted = 0;

    const sanitized = resultEdges
        .filter(e => {
            const ok = nodeIdSet.has(e.source) && nodeIdSet.has(e.target);
            if (!ok) { orphan++; console.warn(`[Layout] ⚠️ 移除孤立边: ${e.id}, src=${nodeIdSet.has(e.source)}, tgt=${nodeIdSet.has(e.target)}`); }
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
            if (srcH) expanded++; else defaulted++;
            if (tgtH) expanded++; else defaulted++;

            // ⭐ [FIX] 切换布局时清除连线的自定义控制点缓冲，让重新计算的布局能够生效起步
            edge.data = { ...edge.data, waypoints: [], computedPath: undefined, elkPath: undefined, algorithm: undefined, _layoutEpoch: undefined };

            return edge;
        });

    if (orphan || expanded || defaulted) console.log(`[Layout] 边验证: 孤立=${orphan}, 短格式展开=${expanded}, 默认回退=${defaulted}`);
    return sanitized;
}

export function useLayoutStrategy({
    setNodes,
    setEdges,
    nodesRef,
    edgesRef,
    takeSnapshot,
    reactFlowInstance,
}: UseLayoutStrategyParams) {
    // [对齐 SVG 版] 跟踪当前域布局策略和方向
    const [lastDomainStrategy, setLastDomainStrategy] = useState<string>('domain-dagre');
    const [lastDomainDirection, setLastDomainDirection] = useState<'TB' | 'LR'>('TB');
    const [lastNodeLayout, setLastNodeLayout] = useState<string>('dagre');

    // [FIX] 两步 fitView：先无动画（解决虚拟化 onlyRenderVisibleElements），再平滑动画
    const twoStepFitView = useCallback(() => {
        requestAnimationFrame(() => {
            reactFlowInstance.fitView({ duration: 0, padding: 0.2 });
            setTimeout(() => reactFlowInstance.fitView({ duration: 600, padding: 0.2 }), 100);
        });
    }, [reactFlowInstance]);

    /** ═══════════════════════════════════════════════════════════════
     * 统一布局入口（对齐 SVG 版 handleAutoLayout）
     * strategyName: 'tree' | 'force' | 'domain-vertical' | 'domain-horizontal' | 'domain-dagre'
     * nodeLayout: 'flow' | 'grid' | 'horizontal' | 'vertical' | 'dagre'
     * direction: 'TB' | 'LR'
     * ═══════════════════════════════════════════════════════════════ */
    const handleStrategyLayout = useCallback(async (strategyName: string, nodeLayout?: string, direction?: 'TB' | 'LR') => {
        const dir = direction || 'TB';
        console.log(`[Layout] ▶ handleStrategyLayout: strategy=${strategyName} dir=${dir} nodeLayout=${nodeLayout}`);

        // [对齐 SVG 版] 跟踪当前域布局策略和方向
        if (strategyName.startsWith('domain-')) {
            setLastDomainStrategy(strategyName);
            setLastDomainDirection(dir);
            if (nodeLayout) setLastNodeLayout(nodeLayout);
        }
        takeSnapshot(nodesRef.current, edgesRef.current);

        try {
            const allNodes = nodesRef.current;
            const allEdges = edgesRef.current;

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
            const plainNodes = allNodes.filter(n => !containerTypes.has(n.type || ''));
            const layoutNodes = plainNodes.map(n => ({
                ...n,
                position: toAbsolutePosition(n),
                parentId: undefined,
                extent: undefined,
            }));
            const nodeIdSet = new Set(layoutNodes.map(n => n.id));
            const layoutEdges = allEdges.filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target));
            console.log(`[Layout] 过滤后: layoutNodes=${layoutNodes.length} layoutEdges=${layoutEdges.length}`);
            if (layoutNodes.length === 0) { console.warn('[Layout] 没有可布局的节点'); return; }

            if (strategyName === 'tree') {
                // ── 扁平树形布局（对齐 SVG 版：不检测域） ──
                const positions = treeLayout(layoutNodes, layoutEdges, { direction: dir });
                const newNodes = applyLayout(layoutNodes, positions);
                // [FIX] Clear handles + cached data BEFORE animation — let smart port selection decide
                setEdges(prev => prev.map(e => ({ ...e, sourceHandle: null, targetHandle: null, data: { ...e.data, waypoints: [], computedPath: undefined, elkPath: undefined, algorithm: undefined, _layoutEpoch: undefined } })));
                EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
                // ⭐ 平滑过渡动画（edges already have clean data）
                await animateLayoutTransition(setNodes, newNodes, { onComplete: twoStepFitView });
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
                const positions = forceDirectedLayout(layoutNodes, layoutEdges);
                const newNodes = applyLayout(layoutNodes, positions);
                // [FIX] Clear handles + cached data BEFORE animation — let smart port selection decide
                setEdges(prev => prev.map(e => ({
                    ...e,
                    sourceHandle: null,
                    targetHandle: null,
                    data: { ...e.data, waypoints: [], computedPath: undefined, elkPath: undefined, algorithm: undefined, _layoutEpoch: undefined }
                })));
                EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
                // ⭐ 平滑过渡动画（edges already have clean data）
                await animateLayoutTransition(setNodes, newNodes, { onComplete: twoStepFitView });
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
                const isDomainDagre = strategyName === 'domain-dagre';
                const finalNodeLayout = isDomainDagre
                    ? 'dagre'
                    : (nodeLayout || 'flow');

                console.log(`[Layout] 域策略: ${strategyName} dir=${dir} nodeLayout=${finalNodeLayout}`);
                let strategy: any;
                if (strategyName === 'domain-vertical' || (isDomainDagre && dir === 'TB')) {
                    const { DomainVerticalLayoutStrategy } = await import('../../../strategies/DomainVerticalLayoutStrategy');
                    strategy = new DomainVerticalLayoutStrategy();
                } else if (strategyName === 'domain-horizontal' || (isDomainDagre && dir === 'LR')) {
                    const { DomainHorizontalLayoutStrategy } = await import('../../../strategies/DomainHorizontalLayoutStrategy');
                    strategy = new DomainHorizontalLayoutStrategy();
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
                    generateDomainGroups: true,
                    generateSubDomainGroups: true,
                    fitDomainContent: true,
                });

                console.log(`[Layout][domain] ✅ nodes=${result.nodes.length} edges=${result.edges.length}`);
                if (result.nodes.length > 0) {
                    // [FIX] Clear edges + cache BEFORE animation
                    setEdges(sanitizeLayoutEdges(result.nodes, result.edges, dir));
                    EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
                    await animateLayoutTransition(setNodes, result.nodes, { onComplete: twoStepFitView });
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
                                // Touch edges to force re-render with fresh positionAbsolute
                                setEdges(prev => prev.map(e => ({
                                    ...e,
                                    data: { ...e.data, _layoutEpoch: Date.now() }
                                })));
                                flushObstacles();
                                resolve();
                            });
                        });
                    });
                }
            }
        } catch (err) {
            console.error(`[Layout] ❌ 布局异常 (${strategyName}):`, err);
        }
    }, [setNodes, setEdges, takeSnapshot, nodesRef, edgesRef, twoStepFitView]);

    return {
        handleStrategyLayout,
        lastDomainStrategy,
        lastDomainDirection,
        lastNodeLayout,
    };
}
