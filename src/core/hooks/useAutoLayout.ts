import { useCallback } from 'react';
import { Node, Edge, useReactFlow, Position, ReactFlowInstance } from '@xyflow/react';
import dagre from 'dagre';
import ELK from 'elkjs/lib/elk.bundled.js';
import { LayoutStrategyManager } from '../strategies/LayoutStrategyManager';
import { animateLayoutTransition } from '../utils/animateLayoutTransition';
import { refineLayout, extractNodeGroups } from '../strategies/shared/LayoutRefinement';

export type LayoutDirection = 'TB' | 'LR';
export type LayoutAlgorithm = 'dagre' | 'elk';

interface AutoLayoutOptions {
    direction: LayoutDirection;
    spacing?: { x: number; y: number };
    algorithm?: LayoutAlgorithm;
}

/** 策略布局选项 */
export interface StrategyLayoutOptions {
    /** 策略名称 */
    strategyName: 'tree' | 'force' | 'domain-vertical' | 'domain-horizontal' | 'domain-dagre';
    /** 域内节点排布（仅域布局有效） */
    nodeLayout?: string;
    /** 布局方向 */
    direction?: LayoutDirection;
}

const elk = new ELK();

export const useAutoLayout = (instance: ReactFlowInstance | null) => {
    const layout = useCallback(async ({ direction, spacing = { x: 50, y: 50 }, algorithm = 'dagre' }: AutoLayoutOptions) => {
        if (!instance) {
            console.warn('AutoLayout: No ReactFlow instance provided');
            return;
        }
        const { getNodes, getEdges, setNodes, setEdges, fitView } = instance;
        const nodes = getNodes();
        const edges = getEdges();

        if (algorithm === 'elk') {
            const elkOptions = {
                'elk.algorithm': 'layered',
                'elk.direction': direction === 'TB' ? 'DOWN' : 'RIGHT',
                'elk.spacing.nodeNode': String(spacing.x),
                'elk.layered.spacing.nodeNodeBetweenLayers': String(spacing.y),
                'elk.padding': '[top=20,left=20,bottom=20,right=20]',
            };

            const graph = {
                id: 'root',
                layoutOptions: elkOptions,
                children: nodes.map((node: Node) => ({
                    id: node.id,
                    width: node.measured?.width ?? node.width ?? 150,
                    height: node.measured?.height ?? node.height ?? 50,
                })),
                edges: edges.map((edge: Edge) => ({
                    id: edge.id,
                    sources: [edge.source],
                    targets: [edge.target],
                })),
            };

            try {
                const layoutedGraph = await elk.layout(graph);

                const newNodes = nodes.map((node: Node) => {
                    const layoutedNode = layoutedGraph.children?.find((n) => n.id === node.id);
                    if (!layoutedNode) return node;

                    return {
                        ...node,
                        targetPosition: direction === 'LR' ? Position.Left : Position.Top,
                        sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
                        position: {
                            x: layoutedNode.x!,
                            y: layoutedNode.y!,
                        },
                    };
                });

                // ⭐ 路由感知后处理 + 平滑过渡动画
                const { nodes: refinedNodes } = refineLayout(newNodes, edges, {
                    direction,
                    enableChannelSpacing: true,
                    enableCrossingMinimization: true,
                });
                await animateLayoutTransition(setNodes, refinedNodes);
            } catch (err) {
                console.error('ELK Layout Failed:', err);
            }
        } else {
            // DAGRE implementation
            const dagreGraph = new dagre.graphlib.Graph();
            dagreGraph.setDefaultEdgeLabel(() => ({}));

            const isHorizontal = direction === 'LR';
            dagreGraph.setGraph({
                rankdir: direction,
                nodesep: spacing.x,
                ranksep: spacing.y
            });

            nodes.forEach((node: Node) => {
                const width = node.measured?.width ?? node.width ?? 150;
                const height = node.measured?.height ?? node.height ?? 50;
                dagreGraph.setNode(node.id, { width, height });
                if (node.parentId) {
                    dagreGraph.setParent(node.id, node.parentId);
                }
            });

            edges.forEach((edge: Edge) => {
                if (dagreGraph.hasNode(edge.source) && dagreGraph.hasNode(edge.target)) {
                    dagreGraph.setEdge(edge.source, edge.target);
                }
            });

            dagre.layout(dagreGraph);

            const newNodes = nodes.map((node: Node) => {
                const nodeWithPosition = dagreGraph.node(node.id);
                if (!nodeWithPosition) return node;

                const width = node.measured?.width ?? node.width ?? 150;
                const height = node.measured?.height ?? node.height ?? 50;
                const x = nodeWithPosition.x - width / 2;
                const y = nodeWithPosition.y - height / 2;

                return {
                    ...node,
                    targetPosition: isHorizontal ? Position.Left : Position.Top,
                    sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
                    position: { x, y },
                };
            });

            // ⭐ 路由感知后处理 + 平滑过渡动画
            const { nodes: refinedNodes } = refineLayout(newNodes, edges, {
                direction,
                enableChannelSpacing: true,
                enableCrossingMinimization: true,
            });
            await animateLayoutTransition(setNodes, refinedNodes);
        }

        window.requestAnimationFrame(() => {
            fitView({ duration: 800, padding: 0.2, minZoom: 0.55, maxZoom: 1.15 });
        });

    }, [instance]);

    /**
     * 扩展布局：树形 / 力导向 / 域感知策略
     * 对齐新项目 handleAutoLayout() 的前处理逻辑
     */
    const layoutWithStrategy = useCallback(async (options: StrategyLayoutOptions) => {
        if (!instance) {
            console.warn('[AutoLayout] No ReactFlow instance');
            return;
        }

        try {
            const { getNodes, getEdges, setNodes, setEdges, fitView } = instance;
            const allNodes = getNodes();
            const allEdges = getEdges();
            const direction = options.direction || 'TB';
            const isHorizontal = direction === 'LR';

            // ═══ 前处理：对齐新项目 handleAutoLayout ═══
            // 1. 过滤容器节点（titleGroup/subGroup/domain 等分组容器不参与布局计算）
            const containerTypes = new Set(['titleGroup', 'subGroup', 'domain', 'group']);
            const plainNodes = allNodes.filter(n => !containerTypes.has(n.type || ''));

            // 2. 清除 parentId，使所有节点变为顶级节点
            const nodes = plainNodes.map(n => ({
                ...n,
                parentId: undefined,
                extent: undefined,
            }));

            // 3. 过滤掉引用不存在节点的边
            const nodeIdSet = new Set(nodes.map(n => n.id));
            const edges = allEdges.filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target));


            if (nodes.length === 0) {
                console.warn('[AutoLayout] 没有可布局的节点');
                return;
            }

            if (options.strategyName === 'tree' || options.strategyName === 'force') {
                // ── 树形 & 力导向：统一用 dagre 实现（已验证可工作） ──
                const dagreGraph = new dagre.graphlib.Graph();
                dagreGraph.setDefaultEdgeLabel(() => ({}));

                const spacing = options.strategyName === 'force'
                    ? { nodesep: 100, ranksep: 100 }
                    : { nodesep: 40, ranksep: 80 };

                dagreGraph.setGraph({
                    rankdir: direction,
                    nodesep: spacing.nodesep,
                    ranksep: spacing.ranksep,
                });

                nodes.forEach((node: Node) => {
                    const width = node.measured?.width ?? node.width ?? 150;
                    const height = node.measured?.height ?? node.height ?? 50;
                    dagreGraph.setNode(node.id, { width, height });
                });

                edges.forEach((edge: Edge) => {
                    if (dagreGraph.hasNode(edge.source) && dagreGraph.hasNode(edge.target)) {
                        dagreGraph.setEdge(edge.source, edge.target);
                    }
                });

                dagre.layout(dagreGraph);

                const newNodes = nodes.map((node: Node) => {
                    const nodeWithPosition = dagreGraph.node(node.id);
                    if (!nodeWithPosition) return node;

                    const width = node.measured?.width ?? node.width ?? 150;
                    const height = node.measured?.height ?? node.height ?? 50;

                    return {
                        ...node,
                        targetPosition: isHorizontal ? Position.Left : Position.Top,
                        sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
                        position: {
                            x: nodeWithPosition.x - width / 2,
                            y: nodeWithPosition.y - height / 2,
                        },
                    };
                });

                // ⭐ 路由感知后处理 + 平滑过渡动画
                const { nodes: refinedTreeNodes } = refineLayout(newNodes, edges, {
                    direction: options.direction || 'TB',
                    enableChannelSpacing: true,
                    enableCrossingMinimization: true,
                });
                await animateLayoutTransition(setNodes, refinedTreeNodes);
                // 更新边的 handle（FlowchartNode 的 Handle 都有 id，边必须指定）
                const dir = options.direction || 'TB';
                const srcH = dir === 'LR' ? 'right' : 'bottom';
                const tgtH = dir === 'LR' ? 'left' : 'top';
                setEdges(edges.map(e => ({
                    ...e,
                    sourceHandle: srcH,
                    targetHandle: tgtH,
                })));

            } else {
                // ── 域感知策略布局（使用静态导入的 LayoutStrategyManager） ──
                const manager = LayoutStrategyManager.getShared();

                const strategyMap: Record<string, string> = {
                    'domain-vertical': 'DomainVerticalLayout',
                    'domain-horizontal': 'DomainHorizontalLayout',
                    'domain-dagre': 'DomainDagreLayout',
                };
                const resolvedName = strategyMap[options.strategyName] || options.strategyName;
                const strategy = manager.getStrategy(resolvedName);

                if (!strategy) {
                    console.error(`[AutoLayout] 布局策略 "${resolvedName}" 未找到`);
                    return;
                }

                const layoutOptions = {
                    type: resolvedName as any,
                    direction,
                    nodeLayout: options.nodeLayout as any,
                    spacing: { horizontal: 50, vertical: 50 },
                    padding: { top: 40, right: 20, bottom: 20, left: 20 },
                    generateDomainGroups: true,
                    generateSubDomainGroups: false,
                    fitDomainContent: true,
                };

                const result = await strategy.calculateLayout(nodes, edges, layoutOptions);

                if (result.nodes.length > 0) {
                    // ⭐ 路由感知后处理（域感知模式）+ 平滑过渡动画
                    setEdges(result.edges);
                    const nodeGroups = extractNodeGroups(result.nodes);
                    const { nodes: refinedDomainNodes } = refineLayout(result.nodes, edges, {
                        direction,
                        enableChannelSpacing: true,
                        enableCrossingMinimization: true,
                        nodeGroups,
                    });
                    await animateLayoutTransition(setNodes, refinedDomainNodes);
                } else {
                    console.warn('[AutoLayout][domain] 策略返回 0 个节点，布局未应用');
                }
            }

            // 布局后适配视口
            window.requestAnimationFrame(() => {
                fitView({ duration: 800, padding: 0.2, minZoom: 0.55, maxZoom: 1.15 });
            });

        } catch (err) {
            console.error(`[AutoLayout] 布局失败 (${options.strategyName}):`, err);
        }
    }, [instance]);

    return { layout, layoutWithStrategy };
};
