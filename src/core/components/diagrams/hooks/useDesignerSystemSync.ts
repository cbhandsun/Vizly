import { useEffect, useMemo, useRef, useState } from 'react';
import { Node, Edge } from '@xyflow/react';
import type { MessageInstance } from 'antd/es/message/interface';
import { useAutoSave } from './useAutoSave';
import { PluginRegistry } from '../../../services/PluginRegistry';
import { analyzeDiagram } from '@/utils/diagramAnalyzer';
import { EdgeRoutingCoordinator } from '../../../services/EdgeRoutingCoordinator';
import { cancelLayoutTransition, suspendLayoutTransitions } from '../../../utils/animateLayoutTransition';
import { readReactFlowCanvasSize } from '../../../utils/domViewport';
import { loadStandardPresetCanvas } from './standardPresetCanvasCache';
import {
    logDesignerSystemSyncAutoSaveFailure,
    logDesignerSystemSyncAutosaveRecalculationFailure,
    logDesignerSystemSyncDataRegistryImportFailure,
    logDesignerSystemSyncDataRegistryWriteFailure,
    logDesignerSystemSyncImportDataFailure,
    logDesignerSystemSyncPresetLoadFailure,
    logDesignerSystemSyncStaleAutosaveDetected,
    logDesignerSystemSyncStandardDataToCanvasFailure,
} from './designerSystemSyncLogging';
import { getApplicationDiagramRuntime } from '../../../ports/applicationDiagramRuntime';
import {
    clearDesignerFreshSeedFlag,
    mergePresetExplicitEdgeHandles,
    recalculateAutosaveNodeSizes,
} from './designerSystemSyncPersistence';

const PLUGIN_EMPTY_CANVAS_IDS = new Set(['flowchart']);

const getPluginEmptyState = (pluginId: string) => {
    const plugin = PluginRegistry.getInstance().getPlugin(pluginId);
    return plugin?.getEmptyState();
};

const stripHtml = (value: string) => value ? value.replace(/<[^>]*>?/gm, '') : '';

export interface UseDesignerSystemSyncProps {
    id?: string;
    diagramIdForExport: string;
    nodes: Node[];
    edges: Edge[];
    setNodes: any;
    setEdges: any;
    reactFlowInstance: any;
    isDragging: boolean;
    pluginId: string;
    messageApi?: MessageInstance;
}

export function useDesignerSystemSync({
    id, diagramIdForExport, nodes, edges, setNodes, setEdges,
    reactFlowInstance, isDragging, pluginId, messageApi
}: UseDesignerSystemSyncProps) {

    // 使用 ref 持有最新的 nodes/edges，避免 __flowDataBridge Effect 因每次编辑重建整个 API 对象
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    const reactFlowRef = useRef(reactFlowInstance);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { edgesRef.current = edges; }, [edges]);
    useEffect(() => { reactFlowRef.current = reactFlowInstance; }, [reactFlowInstance]);

    useEffect(() => {
        if (!(window as any).__flowDataBridge) {
            (window as any).__flowDataBridge = {};
        }

        const toStandardNodes = () => {
            const standardNodes: any[] = [];
            const groups: any[] = [];
            nodesRef.current.forEach((node: any) => {
                const nodeData = node.data || {};
                const rawLabel = nodeData.label as string || '';
                const description = (nodeData.description as string) || `<b>${rawLabel}</b>`;
                const canvasMetadata = {
                    canvasPosition: node.position,
                    width: node.measured?.width ?? node.width ?? 100,
                    height: node.measured?.height ?? node.height ?? 50,
                    parentId: node.parentId,
                    shape: nodeData.shape,
                    icon: nodeData.icon,
                    style: node.style,
                    theme: nodeData.theme,
                    sequence: nodeData.sequence || '1',
                };
                const baseNode = {
                    id: node.id,
                    description,
                    domain: nodeData.domain || nodeData.domainClass || '业务域',
                    subDomain: nodeData.subDomain || undefined,
                    domainClass: nodeData.domainClass || 'core',
                    type: 'custom',
                    metadata: canvasMetadata,
                };

                if (node.type === 'titleGroup' || node.type === 'subGroup') {
                    groups.push({
                        ...baseNode,
                        type: 'group',
                        label: rawLabel || stripHtml(description),
                        isGroup: true,
                        measured: { width: canvasMetadata.width, height: canvasMetadata.height },
                        position: node.position,
                        themeColor: nodeData.themeColor,
                        data: nodeData,
                    });
                } else {
                    standardNodes.push(baseNode);
                }
            });
            return { standardNodes, groups };
        };

        const toStandardEdges = () => edgesRef.current.map((edge: any) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: (edge.type === 'smart-step' || edge.type === 'smart') ? 'main' : edge.type || 'main',
            label: edge.label || edge.data?.label,
            markerEnd: edge.markerEnd,
            style: edge.style,
            metadata: {
                sourceHandle: edge.sourceHandle,
                targetHandle: edge.targetHandle,
                autoHandles: edge.data?.auto,
                manualHandles: Boolean(edge.data?.manualHandles),
                manualHandleSides: edge.data?.manualHandleSides,
            },
        }));

        const standardData: any = {
            id: `diagram-${Date.now()}`,
            name: diagramIdForExport,
            type: 'architecture',
            version: '1.0.0',
            metadata: {
                title: diagramIdForExport,
                createdAt: new Date().toISOString(),
                author: 'User (Manual)',
                tags: ['manual-export'],
            },
            layout: {
                type: 'custom',
                direction: 'LR',
                autoDirection: true,
                fitDomainContent: true,
                spacing: { horizontal: 50, vertical: 50 },
                padding: { horizontal: 20, vertical: 20, top: 20, bottom: 20, left: 20, right: 20 },
            },
            theme: {
                name: 'manual',
                displayName: 'Manual Theme',
                domains: {},
                isCustom: true,
            },
        };

        Object.defineProperties(standardData, {
            nodes: {
                enumerable: true,
                get: () => toStandardNodes().standardNodes,
            },
            groups: {
                enumerable: true,
                get: () => toStandardNodes().groups,
            },
            edges: {
                enumerable: true,
                get: () => toStandardEdges(),
            },
        });
            
            // 附加 importData 特权方法供外部组件（如 AI 对话面板）应用生成的 JSON数据
            Object.defineProperty(standardData, 'importData', {
                enumerable: false, // Prevents serialization issues in JSON.stringify
                value: async (newData: any, _options?: { keepHistory?: boolean }) => {
                    try {
                        const { coerceStandardDiagramImport } = await import('@/core/utils/diagramJsonImport');
                        const safeData = coerceStandardDiagramImport(newData, {
                            id: diagramIdForExport,
                            title: diagramIdForExport,
                        });
                        const { standardDataToCanvas } = await import('../designerUtils');
                        const { nodes: newNodes, edges: newEdges } = await standardDataToCanvas(safeData);
                        
                        // 写回 DataRegistry 中
                        try {
                            await getApplicationDiagramRuntime().registerDiagram(safeData, {
                                id: diagramIdForExport,
                                title: diagramIdForExport,
                            }, true, {
                                id: diagramIdForExport,
                            });
                        } catch (error) {
                            logDesignerSystemSyncDataRegistryWriteFailure(diagramIdForExport, error);
                        }

                        setNodes(newNodes);
                        setEdges(newEdges);
                        
                        // 强制延迟执行一次路由与 Layout
                        if (reactFlowRef.current) {
                            setTimeout(() => {
                                // 触发全局重新布局，确保无位置的节点能正确展开，解决零维度问题
                                window.dispatchEvent(new CustomEvent('diagramControl', { detail: { action: 'layout' } }));
                                reactFlowRef.current?.fitView({ padding: 0.2, duration: 400, minZoom: 0.55 });
                            }, 50);
                        }
                    } catch(err) {
                        logDesignerSystemSyncImportDataFailure(err);
                    }
                }
            });

            Object.defineProperty(standardData, 'replaceCanvasSnapshot', {
                enumerable: false,
                value: (snapshot: { nodes?: Node[]; edges?: Edge[] }) => {
                    const nextNodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
                    const nextEdges = Array.isArray(snapshot?.edges) ? snapshot.edges : [];
                    nodesRef.current = nextNodes;
                    edgesRef.current = nextEdges;
                    setNodes(nextNodes);
                    setEdges(nextEdges);
                }
            });

            // --- 扩展原子化操作 API (Phase 3: AI Design Pilot) ---
            Object.defineProperty(standardData, 'addNode', {
                enumerable: false,
                value: async (args: { id?: string; label: string; type?: string; shape?: string; parentId?: string; position?: {x: number, y: number} }) => {
                    const { id: incomingId, label, type: incomingType, shape = 'rectangle', parentId, position } = args;
                    const id = incomingId || `node_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
                    
                    const layoutOptimizer = (await import('../../layout/LayoutOptimizer')).LayoutOptimizer.getInstance();
                    const width = layoutOptimizer.calculateNodeWidth(label);

                    // 默认类型映射逻辑
                    let nodeType = incomingType || (pluginId === 'architecture-diagram' ? 'architectureNode' : 'flowchart');
                    let architectureType: any = undefined;

                    // 如果是在架构图模式下，或者指令明确要求 architecture 类型
                    if (nodeType === 'architectureNode' || pluginId === 'architecture-diagram') {
                        nodeType = 'architectureNode';
                        const lowerLabel = label.toLowerCase();
                        if (lowerLabel.includes('db') || lowerLabel.includes('数据库') || lowerLabel.includes('mysql') || lowerLabel.includes('redis') || lowerLabel.includes('mongo')) {
                            architectureType = lowerLabel.includes('redis') ? 'cache' : 'database';
                        } else if (lowerLabel.includes('网关') || lowerLabel.includes('gateway') || lowerLabel.includes('nginx')) {
                            architectureType = 'gateway';
                        } else if (lowerLabel.includes('服务') || lowerLabel.includes('service') || lowerLabel.includes('api')) {
                            architectureType = 'microservice';
                        } else if (lowerLabel.includes('前端') || lowerLabel.includes('web') || lowerLabel.includes('app') || lowerLabel.includes('ui')) {
                            architectureType = 'frontend';
                        } else if (lowerLabel.includes('队列') || lowerLabel.includes('mq') || lowerLabel.includes('kafka')) {
                            architectureType = 'messageQueue';
                        } else {
                            architectureType = 'component';
                        }
                    }
                    
                    const newNode: Node = {
                        id,
                        type: nodeType,
                        position: position || (parentId ? { x: 20, y: 60 } : { x: 100, y: 100 }), // 子节点默认相对坐标
                        parentId,
                        data: {
                            label,
                            description: `<b>${label}</b>`,
                            shape,
                            type: architectureType,
                            domain: '业务域',
                            domainClass: 'core'
                        },
                        width,
                        height: 50,
                        style: { width }
                    };

                    setNodes((nds: any) => {
                        const nextNodes = [...nds, newNode];
                        
                        // Phase 5: 自动调整父容器尺寸
                        if (parentId) {
                            const parentIdx = nextNodes.findIndex(n => n.id === parentId);
                            if (parentIdx !== -1) {
                                const parent = nextNodes[parentIdx];
                                // 如果是容器类型 (group/subGroup等)
                                const isContainer = ['group', 'subGroup', 'titleGroup', 'titleGroupNode'].includes(parent.type || '');
                                if (isContainer) {
                                    const minWidth = (newNode.position.x || 0) + (newNode.width || 120) + 40;
                                    const minHeight = (newNode.position.y || 0) + (newNode.height || 50) + 40;
                                    
                                    const newParentWidth = Math.max(parent.width || 0, minWidth);
                                    const newParentHeight = Math.max(parent.height || 0, minHeight);
                                    
                                    nextNodes[parentIdx] = {
                                        ...parent,
                                        width: newParentWidth,
                                        height: newParentHeight,
                                        style: { ...parent.style, width: newParentWidth, height: newParentHeight }
                                    };
                                }
                            }
                        }
                        return nextNodes;
                    });
                    return id;
                }
            });

            Object.defineProperty(standardData, 'deleteNodes', {
                enumerable: false,
                value: async (ids: string[]) => {
                    setNodes((nds: any) => nds.filter((n: any) => !ids.includes(n.id)));
                    setEdges((eds: any) => eds.filter((e: any) => !ids.includes(e.source) && !ids.includes(e.target)));
                }
            });

            Object.defineProperty(standardData, 'connectNodes', {
                enumerable: false,
                value: async (args: { source: string; target: string; label?: string; type?: string }) => {
                    const { source, target, label, type = 'advanced-smart-step' } = args;
                    const id = `edge_${source}_${target}_${Date.now().toString().substring(7)}`;
                    
                    const newEdge: Edge = {
                        id,
                        source,
                        target,
                        type,
                        label,
                        markerEnd: { type: 'arrowclosed' as any }
                    };

                    setEdges((eds: any) => [...eds, newEdge]);
                    return id;
                }
            });

            Object.defineProperty(standardData, 'updateNode', {
                enumerable: false,
                value: async (id: string, data: any) => {
                    const layoutOptimizer = data.label
                        ? (await import('../../layout/LayoutOptimizer')).LayoutOptimizer.getInstance()
                        : null;
                    setNodes((nds: any) => nds.map((n: any) => {
                        if (n.id === id) {
                            const newData = { ...n.data, ...data };
                            if (data.label && !data.description) {
                                newData.description = `<b>${data.label}</b>`;
                            }
                            
                            // Re-calculate width if label changed
                            let width = n.width;
                            let style = n.style;
                            if (data.label && layoutOptimizer) {
                                const width_val = layoutOptimizer.calculateNodeWidth(data.label);
                                width = width_val;
                                style = { ...style, width: width_val };
                            }

                            return { ...n, data: newData, width, style };
                        }
                        return n;
                    }));
                }
            });

            Object.defineProperty(standardData, 'triggerLayout', {
                enumerable: false,
                value: async (strategy?: string) => {
                    window.dispatchEvent(new CustomEvent('diagramControl', { detail: { action: 'layout', strategy } }));
                }
            });

            Object.defineProperty(standardData, 'groupNodes', {
                enumerable: false,
                value: async (nodeIds: string[], groupName?: string) => {
                    if (nodeIds.length === 0) return;
                    
                    setNodes((nds: any) => {
                        const targetNodes = nds.filter((n: any) => nodeIds.includes(n.id));
                        if (targetNodes.length === 0) return nds;

                        // Calculate BBox
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        targetNodes.forEach((n: any) => {
                            const x = n.position.x;
                            const y = n.position.y;
                            const w = n.measured?.width || n.width || 120;
                            const h = n.measured?.height || n.height || 60;
                            minX = Math.min(minX, x);
                            minY = Math.min(minY, y);
                            maxX = Math.max(maxX, x + w);
                            maxY = Math.max(maxY, y + h);
                        });

                        const padding = 40;
                        const groupId = `group_${Date.now()}`;
                        const groupNode: Node = {
                            id: groupId,
                            type: 'titleGroup',
                            position: { x: minX - padding, y: minY - padding },
                            data: {
                                label: groupName || '智能分组',
                                description: 'AI 自动创建的分组',
                                domainClass: 'core'
                            },
                            style: {
                                width: maxX - minX + padding * 2,
                                height: maxY - minY + padding * 2,
                            },
                            zIndex: -1
                        };

                        const nodeIdSet = new Set(nodeIds);
                        const nextNodes = nds.map((n: any) => {
                            if (nodeIdSet.has(n.id)) {
                                return {
                                    ...n,
                                    parentId: groupId,
                                    extent: 'parent',
                                    position: {
                                        x: n.position.x - (minX - padding),
                                        y: n.position.y - (minY - padding)
                                    }
                                };
                            }
                            return n;
                        });

                        return [...nextNodes, groupNode];
                    });
                }
            });

            Object.defineProperty(standardData, 'analyze', {
                enumerable: false,
                value: () => {
                    return analyzeDiagram(nodesRef.current as any, edgesRef.current as any);
                }
            });

            Object.defineProperty(standardData, 'animatePath', {
                enumerable: false,
                value: async (edgeIds: string[], options?: { duration?: number; loop?: boolean }) => {
                    if (!edgeIds || edgeIds.length === 0) return;
                    const duration = options?.duration || 2000;
                    
                    // 1. 开始动画
                    setEdges((eds: any) => eds.map((e: any) => {
                        if (edgeIds.includes(e.id)) {
                            return { ...e, animated: true };
                        }
                        return e;
                    }));

                    // 2. 如果不是循环模式，则在 duration 后关闭
                    if (!options?.loop) {
                        setTimeout(() => {
                            setEdges((eds: any) => eds.map((e: any) => {
                                if (edgeIds.includes(e.id)) {
                                    return { ...e, animated: false };
                                }
                                return e;
                            }));
                        }, duration);
                    }
                }
            });

            (window as any).__flowDataBridge[diagramIdForExport] = standardData;
        return () => {
            delete (window as any).__flowDataBridge?.[diagramIdForExport];
        };
    // 仅在 diagramIdForExport/id/pluginId 变化时重建，nodes/edges 通过 ref 访问
    }, [diagramIdForExport, id, setNodes, setEdges, pluginId, messageApi]);

    useEffect(() => {
        (window as any).__flowDesignerOpenCloud = async (data: any) => {
            const { standardDataToCanvas } = await import('../designerUtils');
            const { nodes: newNodes, edges: newEdges } = await standardDataToCanvas(data);
            if (newNodes.length > 0) {
                setNodes(newNodes);
                setEdges(newEdges);
                setTimeout(() => reactFlowInstance?.fitView({ duration: 800, padding: 0.35, minZoom: 0.55, maxZoom: 1.15 }), 50);
            }
        };
        return () => {
            delete (window as any).__flowDesignerOpenCloud;
        };
    }, [setNodes, setEdges, reactFlowInstance]);

    const performanceMode = useMemo(() => {
        return nodes.length > 300 || isDragging;
    }, [nodes.length, isDragging]);

    useEffect(() => {
        if (typeof document !== 'undefined') {
            document.documentElement.dataset.performance = performanceMode ? 'high' : 'normal';
        }
    }, [performanceMode]);

    // performanceMode = nodes.length > 300 || isDragging
    // nodes.length > 300 && !performanceMode 永远为 false，无需 Effect

    const [autosaveEnabled, setAutosaveEnabled] = useState(false);

    const { loadSaved, clearSaved, saveNow } = useAutoSave(nodes, edges, {
        interval: 60000,
        storageKey: `flowchart-autosave-v2-${id || 'default'}`,
        enabled: autosaveEnabled,
        diagramId: id,
        onSaveSuccess: undefined,
        onSaveError: (error) => logDesignerSystemSyncAutoSaveFailure(error)
    });

    // [FIX-AUTOSAVE] 节点/边变化后 3 秒防抖保存（补充 beforeunload 之前的兜底）。
    // 用 skipCountRef 跳过前 2 次 effect 触发：
    //   第 1 次 = 初始 mount（nodes/edges 可能为空或来自 reactflow 初始化）
    //   第 2 次 = autosave 恢复后 setNodes/setEdges 触发（此时数据刚从 localStorage 读回，保存毫无意义）
    // 从第 3 次开始 = 用户真正的操作，才需要防抖保存。
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const skipCountRef = useRef(0);
    const isMountedRef = useRef(true);
    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);
    useEffect(() => {
        if (!autosaveEnabled) return;
        if (skipCountRef.current < 2) {
            skipCountRef.current++;
            return;
        }
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            // 只在组件仍挂载时执行（beforeunload 负责卸载后的最终保存）
            if (isMountedRef.current) saveNow();
        }, 3000);
        // 注意：cleanup 只清除「因 deps 变化」导致的旧计时器，
        // 不影响 beforeunload 的同步保存（它们是独立的机制）
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [nodes, edges, saveNow, autosaveEnabled]);


    const hasRestoredAutoSave = useRef(false);
    const needsInitialFitView = useRef(false);
    const processedDiagramId = useRef(id);
    const [presetLookup, setPresetLookup] = useState<{ id?: string; ready: boolean; preset: any | null }>({
        id,
        ready: false,
        preset: null,
    });

    useEffect(() => {
        let cancelled = false;
        if (!getApplicationDiagramRuntime().isStandardPresetId(id)) {
            setPresetLookup({ id, ready: true, preset: null });
            return () => { cancelled = true; };
        }

        setPresetLookup({ id, ready: false, preset: null });

        void getApplicationDiagramRuntime().loadStandardPreset(id).then((preset) => {
            if (!cancelled) setPresetLookup({ id, ready: true, preset });
        }).catch((error) => {
            logDesignerSystemSyncPresetLoadFailure(error);
            if (!cancelled) setPresetLookup({ id, ready: true, preset: null });
        });

        return () => { cancelled = true; };
    }, [id]);

    // If ID changed dynamically WITHOUT unmount, reset local initialization flags
    if (processedDiagramId.current !== id) {
        processedDiagramId.current = id;
        hasRestoredAutoSave.current = false;
        needsInitialFitView.current = true;
    }

    useEffect(() => {
        if (!presetLookup.ready || presetLookup.id !== id) return;
        if (hasRestoredAutoSave.current) return;

        const preset = presetLookup.preset;
        const isStandardPreset = !!preset && !String(id || '').startsWith('custom:');
        setAutosaveEnabled(!isStandardPreset);

        // Seed switching now uses localStorage + reload exclusively.
        // useDiagramSeedStore is no longer used for handoff.
        let saved = loadSaved();
        saved = mergePresetExplicitEdgeHandles(saved, preset);
        let shouldLoadAutosave = false;

        if (isStandardPreset && saved) {
            // Standard presets are source templates, not editable documents.
            // Ordinary autosave state for their ids is stale user/session state and must not mask PRESET_MAP.
            // Fresh seed was previously allowed here, but it can preserve old template layout output after
            // strategy iterations. The preset map is now the single source of truth for standard templates.
            clearSaved();
            saved = null;
        }
        
        if (saved) {
            if (saved.diagramId && saved.diagramId !== id) {
                // Check for stale autosave leaking across diagrams
                logDesignerSystemSyncStaleAutosaveDetected(id, saved.diagramId);
                clearSaved();
            } else {
                // Guard against corrupted autosave that contains RAW Standard Nodes instead of Canvas Nodes.
                // Also explicitly allow length 0 (valid empty canvas).
                // isFreshSeed shortcut: if the flag is set AND within the 5-minute TTL,
                // trust the data unconditionally (any node type, written by seedAutoSaveAndNavigate).
                // If isFreshSeed is set but older than 5 min → stale crash remnant, ignore the flag.
                const FRESH_SEED_TTL_MS = 5 * 60 * 1000;
                const isFreshAndValid = saved.isFreshSeed && saved.timestamp &&
                    (Date.now() - saved.timestamp) < FRESH_SEED_TTL_MS;

                // [FIX-AUTOSAVE] 放宽验证逻辑：只要节点有 data 字段就认定为有效 canvas 数据。
                // 原来的白名单（flowchart/titleGroup/subGroup...）对用户在空白画布上新建的节点过于严格，
                // 导致 autosave 数据存在但负载失败，画布被重置。
                const isCanvasData = isFreshAndValid || (saved.nodes !== undefined && (
                    saved.nodes.length === 0 ||
                    saved.nodes.some((n: any) => n.data !== undefined)
                ));
                
                // If the isFreshSeed flag is stale (crash remnant), strip it from storage
                if (saved.isFreshSeed && !isFreshAndValid) {
                    clearDesignerFreshSeedFlag(`flowchart-autosave-v2-${id || 'default'}`);
                    saved = { ...saved, isFreshSeed: false };
                }
                
                shouldLoadAutosave = !!isCanvasData;
            }
        }

        if (shouldLoadAutosave && saved) {
            hasRestoredAutoSave.current = true;
            void recalculateAutosaveNodeSizes(saved.nodes).then((recalculatedNodes) => {
                cancelLayoutTransition(setNodes);
                setNodes(recalculatedNodes);
                setEdges(saved.edges);
                needsInitialFitView.current = true;

                // [COLD-START FIX] 冻结路由器，阻止在节点尺寸未稳定前触发大量 A* 计算。
                // 根据 CDP 调试，34节点图加载时出现 A* openSet exhausted (iterations=23892)，
                // 原因是节点 measured 不稳定，Worker 被反复触发，导致 1-2 秒连线白屏。
                // freeze() 后所有 route() 请求会被积压在 latestRequests 里，
                // 等 unfreeze() 调用后一次性批量计算。
                EdgeRoutingCoordinator.getInstance().freeze();

                // ★ After consuming the fresh seed, clear the isFreshSeed flag from localStorage
                // so that subsequent autosave cycles are no longer blocked by the guard.
                if (saved.isFreshSeed) {
                    messageApi?.success('加载模板成功');
                    clearDesignerFreshSeedFlag(`flowchart-autosave-v2-${id || 'default'}`);
                } else {
                    messageApi?.info('已恢复上次编辑内容');
                }
            }).catch((error) => {
                logDesignerSystemSyncAutosaveRecalculationFailure(error);
            });
        } else {
            // Core Fallback & Preset Injection Logic
            if (preset) {
                // IF the requested diagram matches a known standard preset map
                // WE securely run standardDataToCanvas to apply ELK.js layout mapping!
                loadStandardPresetCanvas(String(id || ''), preset).then(({ nodes: newNodes, edges: newEdges }) => {
                    suspendLayoutTransitions(setNodes);
                    setNodes(newNodes);
                    setEdges(newEdges);
                    needsInitialFitView.current = true;
                    hasRestoredAutoSave.current = true;
                }).catch(e => {
                    hasRestoredAutoSave.current = true;
                    logDesignerSystemSyncStandardDataToCanvasFailure('preset', e);
                });
            } else if (PLUGIN_EMPTY_CANVAS_IDS.has(String(id || ''))) {
                const emptyState = getPluginEmptyState(pluginId);
                if (emptyState) {
                    setNodes(emptyState.nodes);
                    setEdges(emptyState.edges);
                    needsInitialFitView.current = true;
                }
                hasRestoredAutoSave.current = true;
            } else {
                // Try DataRegistry for imported/general templates before falling back to empty state
                getApplicationDiagramRuntime().loadDiagram(id || '', { initialize: true }).then(async (existing) => {
                    if (existing) {
                        import('../designerUtils').then(({ standardDataToCanvas }) => {
                            standardDataToCanvas(existing).then(({ nodes: newNodes, edges: newEdges }) => {
                                cancelLayoutTransition(setNodes);
                                setNodes(newNodes);
                                setEdges(newEdges);
                                needsInitialFitView.current = true;
                                hasRestoredAutoSave.current = true;
                            }).catch(e => {
                                hasRestoredAutoSave.current = true;
                                logDesignerSystemSyncStandardDataToCanvasFailure('registry', e);
                            });
                        });
                    } else {
                        // Normal plugin fallback empty state
                        const emptyState = getPluginEmptyState(pluginId);
                        if (emptyState) {
                            setNodes(emptyState.nodes);
                            setEdges(emptyState.edges);
                            // ALWAYS trigger initial viewport adjustment, even for empty canvases
                            needsInitialFitView.current = true;
                        }
                        hasRestoredAutoSave.current = true;
                    }
                }).catch(e => {
                    hasRestoredAutoSave.current = true;
                    logDesignerSystemSyncDataRegistryImportFailure(e);
                });
            }
        }
    }, [loadSaved, clearSaved, setNodes, setEdges, pluginId, id, presetLookup, messageApi]);

    // Deferred view adjustment: waits for reactFlowInstance to become available
    useEffect(() => {
        if (needsInitialFitView.current && reactFlowInstance) {
            needsInitialFitView.current = false;

            // [COLD-START FIX] 等节点被 React Flow 测量后解冻路由器。
            // freeze() 阻止了节点测量期间的所有 A* 计算（避免 23892次 openSet 迭代），
            // 所有 route() 请求已积压在 latestRequests 中。
            // unfreeze() 会将它们全部标脏，然后触发一次性批量计算。
            const triggerRoutingAfterMeasure = () => {
                const currentNodes = reactFlowInstance.getNodes();
                const allMeasured = currentNodes.length > 0 &&
                    currentNodes.every((n: any) => (n.measured?.width && n.measured.width > 0) || n.width);

                if (allMeasured) {
                    // 节点已被 RF 测量，解冻路由器 → 积压请求立即批量计算
                    EdgeRoutingCoordinator.getInstance().unfreeze();
                    window.dispatchEvent(new CustomEvent('diagramControl', { detail: { action: 'fit' } }));
                } else {
                    // 节点尚未测量完毕，先把视口大致定到中心，稍后重试
                    const { width: cw, height: ch } = readReactFlowCanvasSize();
                    reactFlowInstance.setViewport({ x: cw / 2 - 100, y: ch / 2 - 100, zoom: 1 });
                    setTimeout(() => {
                        // 350ms 后 RF 应已完成测量，解冻并 fit
                        EdgeRoutingCoordinator.getInstance().unfreeze();
                        window.dispatchEvent(new CustomEvent('diagramControl', { detail: { action: 'fit' } }));
                    }, 350);
                }
            };

            // 给 RF 一点时间完成初次布局测量（通常 <1 帧，60ms 是保守值）
            setTimeout(triggerRoutingAfterMeasure, 60);
        }
    }, [reactFlowInstance, nodes]);

    return {
        performanceMode,
        isInitialDiagramLoading: getApplicationDiagramRuntime().isStandardPresetId(id) && (!presetLookup.ready || !hasRestoredAutoSave.current)
    };
}

