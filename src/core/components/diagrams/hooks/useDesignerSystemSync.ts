import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { MarkerType, type Edge, type Node, type ReactFlowInstance } from '@xyflow/react';
import type { MessageInstance } from 'antd/es/message/interface';
import { useAutoSave } from './useAutoSave';
import { EdgeRoutingCoordinator } from '../../../services/EdgeRoutingCoordinator';
import { readReactFlowCanvasSize } from '../../../utils/domViewport';
import { useDesignerPresetInitialization } from './useDesignerPresetInitialization';
import {
    logDesignerSystemSyncAutoSaveFailure,
    logDesignerSystemSyncDataRegistryWriteFailure,
    logDesignerSystemSyncImportDataFailure,
} from './designerSystemSyncLogging';
import { getApplicationDiagramRuntime } from '../../../ports/applicationDiagramRuntime';
import { shouldUseGlobalDesignerPerformanceMode } from './designerSystemSyncPersistence';
import { useDesignerInitialDiagramLoad } from './useDesignerInitialDiagramLoad';
import {
    analyzeDesignerCanvas,
    projectDesignerStandardEdges,
    projectDesignerStandardNodes,
} from './designerFlowDataBridgeProjection';
import {
    registerFlowDataBridge,
    registerFlowDesignerCloudOpener,
    type FlowDataBridgeEntry,
} from '../../../utils/flowDataBridge';
import type { StandardDiagramData } from '../../../models/DiagramModels';

export interface UseDesignerSystemSyncProps {
    id?: string;
    diagramIdForExport: string;
    nodes: Node[];
    edges: Edge[];
    setNodes: Dispatch<SetStateAction<Node[]>>;
    setEdges: Dispatch<SetStateAction<Edge[]>>;
    reactFlowInstance: ReactFlowInstance<Node, Edge> | null;
    isDragging: boolean;
    pluginId: string;
    messageApi?: MessageInstance;
    getAutoSaveMetadata?: () => unknown;
    restoreAutoSaveMetadata?: (metadata: unknown) => { nodes: Node[]; edges: Edge[] } | null;
}

export function useDesignerSystemSync({
    id, diagramIdForExport, nodes, edges, setNodes, setEdges,
    reactFlowInstance, isDragging, pluginId, messageApi,
    getAutoSaveMetadata, restoreAutoSaveMetadata,
}: UseDesignerSystemSyncProps) {
    // 使用 ref 持有最新的 nodes/edges，避免 __flowDataBridge Effect 因每次编辑重建整个 API 对象
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    const reactFlowRef = useRef(reactFlowInstance);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { edgesRef.current = edges; }, [edges]);
    useEffect(() => { reactFlowRef.current = reactFlowInstance; }, [reactFlowInstance]);

    useEffect(() => {
        const standardData: FlowDataBridgeEntry = {
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
            getCanvasSnapshot: () => ({
                nodes: nodesRef.current,
                edges: edgesRef.current,
            }),
        };

        Object.defineProperties(standardData, {
            nodes: {
                enumerable: true,
                get: () => projectDesignerStandardNodes(nodesRef.current).standardNodes,
            },
            groups: {
                enumerable: true,
                get: () => projectDesignerStandardNodes(nodesRef.current).groups,
            },
            edges: {
                enumerable: true,
                get: () => projectDesignerStandardEdges(edgesRef.current),
            },
        });
            
            // 附加 importData 特权方法供外部组件（如 AI 对话面板）应用生成的 JSON数据
            Object.defineProperty(standardData, 'importData', {
                enumerable: false, // Prevents serialization issues in JSON.stringify
                value: async (newData: unknown, _options?: { keepHistory?: boolean }) => {
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
                    let architectureType: string | undefined;

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

                    setNodes((nds) => {
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
                    setNodes((nds) => nds.filter((node) => !ids.includes(node.id)));
                    setEdges((eds) => eds.filter((edge) => !ids.includes(edge.source) && !ids.includes(edge.target)));
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
                        markerEnd: { type: MarkerType.ArrowClosed }
                    };

                    setEdges((eds) => [...eds, newEdge]);
                    return id;
                }
            });

            Object.defineProperty(standardData, 'updateNode', {
                enumerable: false,
                value: async (id: string, data: Record<string, unknown>) => {
                    const label = typeof data.label === 'string' ? data.label : undefined;
                    const layoutOptimizer = label
                        ? (await import('../../layout/LayoutOptimizer')).LayoutOptimizer.getInstance()
                        : null;
                    setNodes((nds) => nds.map((n) => {
                        if (n.id === id) {
                            const newData = { ...n.data, ...data };
                            if (label && !data.description) {
                                newData.description = label;
                            }
                            
                            // Re-calculate width if label changed
                            let width = n.width;
                            let style = n.style;
                            if (label && layoutOptimizer) {
                                const width_val = layoutOptimizer.calculateNodeWidth(label);
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
                    
                    setNodes((nds) => {
                        const targetNodes = nds.filter((node) => nodeIds.includes(node.id));
                        if (targetNodes.length === 0) return nds;

                        // Calculate BBox
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        targetNodes.forEach((n) => {
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
                        const nextNodes = nds.map((n) => {
                            if (nodeIdSet.has(n.id)) {
                                return {
                                    ...n,
                                    parentId: groupId,
                                    extent: 'parent' as const,
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
                    return analyzeDesignerCanvas(nodesRef.current, edgesRef.current);
                }
            });

            Object.defineProperty(standardData, 'animatePath', {
                enumerable: false,
                value: async (edgeIds: string[], options?: { duration?: number; loop?: boolean }) => {
                    if (!edgeIds || edgeIds.length === 0) return;
                    const duration = options?.duration || 2000;
                    
                    // 1. 开始动画
                    setEdges((eds) => eds.map((e) => {
                        if (edgeIds.includes(e.id)) {
                            return { ...e, animated: true };
                        }
                        return e;
                    }));

                    // 2. 如果不是循环模式，则在 duration 后关闭
                    if (!options?.loop) {
                        setTimeout(() => {
                            setEdges((eds) => eds.map((e) => {
                                if (edgeIds.includes(e.id)) {
                                    return { ...e, animated: false };
                                }
                                return e;
                            }));
                        }, duration);
                    }
                }
            });

        return registerFlowDataBridge(diagramIdForExport, standardData);
    // 仅在 diagramIdForExport/id/pluginId 变化时重建，nodes/edges 通过 ref 访问
    }, [diagramIdForExport, id, setNodes, setEdges, pluginId, messageApi]);

    useEffect(() => {
        const openCloudDiagram = async (data: StandardDiagramData) => {
            const { standardDataToCanvas } = await import('../designerUtils');
            const { nodes: newNodes, edges: newEdges } = await standardDataToCanvas(data);
            if (newNodes.length > 0) {
                setNodes(newNodes);
                setEdges(newEdges);
                setTimeout(() => reactFlowInstance?.fitView({ duration: 800, padding: 0.35, minZoom: 0.55, maxZoom: 1.15 }), 50);
            }
        };
        return registerFlowDesignerCloudOpener(openCloudDiagram);
    }, [setNodes, setEdges, reactFlowInstance]);

    const performanceMode = useMemo(() => {
        return nodes.length > 300 || isDragging;
    }, [nodes.length, isDragging]);
    const globalPerformanceMode = useMemo(
        () => shouldUseGlobalDesignerPerformanceMode(nodes.length),
        [nodes.length],
    );

    useEffect(() => {
        if (typeof document !== 'undefined') {
            document.documentElement.dataset.performance = globalPerformanceMode ? 'high' : 'normal';
        }
    }, [globalPerformanceMode]);

    const needsInitialFitView = useRef(false);
    const {
        activePresetLookup,
        isCurrentDiagramInitialized,
        markCurrentDiagramInitialized,
    } = useDesignerPresetInitialization(id);
    const autosaveEnabled = activePresetLookup.ready
        && isCurrentDiagramInitialized;

    const { loadSaved, clearSaved, saveNow, saveState } = useAutoSave(nodes, edges, {
        interval: 60000,
        storageKey: `flowchart-autosave-v2-${id || 'default'}`,
        enabled: autosaveEnabled,
        diagramId: id,
        onSaveSuccess: undefined,
        onSaveError: (error) => logDesignerSystemSyncAutoSaveFailure(error),
        getMetadata: getAutoSaveMetadata,
    });

    // Only debounce after the active diagram has completed initialization.
    // Restored autosaves are deduplicated by useAutoSave; registry-loaded canvases
    // still receive their first durable local snapshot.
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!autosaveEnabled) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            void saveNow();
        }, 3000);
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
        };
    }, [nodes, edges, saveNow, autosaveEnabled]);

    useDesignerInitialDiagramLoad({
        id,
        pluginId,
        activePresetLookup,
        isCurrentDiagramInitialized,
        markCurrentDiagramInitialized,
        loadSaved,
        clearSaved,
        restoreAutoSaveMetadata,
        messageApi,
        setNodes,
        setEdges,
        needsInitialFitView,
    });

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
                    currentNodes.every((node) => (node.measured?.width && node.measured.width > 0) || node.width);

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
        saveState,
        isInitialDiagramLoading: !activePresetLookup.ready || !isCurrentDiagramInitialized,
    };
}

