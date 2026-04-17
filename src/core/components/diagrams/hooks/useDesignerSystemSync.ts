import { useEffect, useMemo, useRef } from 'react';
import { Node, Edge } from '@xyflow/react';
import type { MessageInstance } from 'antd/es/message/interface';
import { useAutoSave } from './useAutoSave';
import { PluginRegistry } from '../../../services/PluginRegistry';
import { LayoutOptimizer } from '../../layout/LayoutOptimizer';
import { analyzeDiagram } from '@/utils/diagramAnalyzer';

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

    useEffect(() => {
        import('../designerUtils').then(async ({ canvasToStandardData }) => {
            if (!(window as any).__flowDataBridge) {
                (window as any).__flowDataBridge = {};
            }
            let standardData = canvasToStandardData(nodes, edges, diagramIdForExport);
            
            // 尝试从 DataRegistry 中恢复 Layout/Metadata 配置，防止在同步时丢失
            try {
                const { dataRegistry } = await import('@/data/DataRegistry');
                const localSvc = dataRegistry.getDataService();
                const existing = localSvc.getDiagram(diagramIdForExport || id || '');
                if (existing) {
                    standardData = {
                        ...existing,
                        nodes: standardData.nodes,
                        edges: standardData.edges,
                        groups: standardData.groups
                    } as any;
                }
            } catch (e) {
                // Ignore silent fail
            }
            
            // 附加 importData 特权方法供外部组件（如 AI 对话面板）应用生成的 JSON数据
            Object.defineProperty(standardData, 'importData', {
                enumerable: false, // Prevents serialization issues in JSON.stringify
                value: async (newData: any, options?: { keepHistory?: boolean }) => {
                    try {
                        const { standardDataToCanvas } = await import('../designerUtils');
                        const { nodes: newNodes, edges: newEdges } = await standardDataToCanvas(newData);
                        
                        // 写回 DataRegistry 中
                        try {
                            const { dataRegistry } = await import('@/data/DataRegistry');
                            const localSvc = dataRegistry.getDataService();
                            localSvc.registerDiagram(newData);
                        } catch(e) { }

                        setNodes(newNodes);
                        setEdges(newEdges);
                        
                        // 强制延迟执行一次路由与 Layout
                        if (reactFlowInstance) {
                            setTimeout(() => {
                                reactFlowInstance.fitView({ padding: 0.2, duration: 400, minZoom: 0.55 });
                            }, 50);
                        }
                    } catch(err) {
                        console.error('importData 失败', err);
                    }
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
                        let nextNodes = [...nds, newNode];
                        
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
                    setNodes((nds: any) => nds.map((n: any) => {
                        if (n.id === id) {
                            const newData = { ...n.data, ...data };
                            if (data.label && !data.description) {
                                newData.description = `<b>${data.label}</b>`;
                            }
                            
                            // Re-calculate width if label changed
                            let width = n.width;
                            let style = n.style;
                            if (data.label) {
                                const width_val = LayoutOptimizer.getInstance().calculateNodeWidth(data.label);
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
                    return analyzeDiagram(nodes as any, edges as any);
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
        });
        return () => {
            delete (window as any).__flowDataBridge?.[diagramIdForExport];
        };
    }, [nodes, edges, diagramIdForExport, id]);

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

    useEffect(() => {
        if (nodes.length > 300 && !performanceMode) {
            console.info('[Performance] High node count detected', {
                nodeCount: nodes.length,
                performanceMode: false,
                recommendation: 'Performance mode will be enabled automatically during drag operations'
            });
        }
    }, [nodes.length, performanceMode]);

    const { saveState, loadSaved } = useAutoSave(nodes, edges, {
        interval: 60000,
        storageKey: `flowchart-autosave-v2-${id || 'default'}`,
        enabled: true,
        onSaveSuccess: () => console.log('Auto-save successful'),
        onSaveError: (error) => console.error('Auto-save failed:', error)
    });

    const hasRestoredAutoSave = useRef(false);
    const needsInitialFitView = useRef(false);

    useEffect(() => {
        if (hasRestoredAutoSave.current) return;

        const saved = loadSaved();
        
        // Guard against corrupted autosave that contains RAW Standard Nodes instead of Canvas Nodes
        const isCanvasData = saved && saved.nodes && saved.nodes.length > 0 && 
            saved.nodes.some((n: any) => n.data !== undefined && (n.type === 'flowchart' || n.type === 'titleGroup' || n.type === 'subGroup' || n.type === 'group' || n.type === 'swimlane'));

        if (isCanvasData) {
            hasRestoredAutoSave.current = true;
            const layoutOptimizer = LayoutOptimizer.getInstance();
            const containerTypes = new Set(['titleGroup', 'subGroup', 'swimlane', 'group']);

            const recalculatedNodes = saved.nodes.map((node: Node) => {
                if (containerTypes.has(node.type || '')) return node;

                const desc = String(node.data?.description || node.data?.label || '');
                if (!desc) return node;

                const contentWidth = layoutOptimizer.calculateNodeWidth(desc);
                return {
                    ...node,
                    width: contentWidth,
                    style: { ...node.style, width: contentWidth },
                    measured: { ...(node as any).measured, width: contentWidth },
                };
            });

            setNodes(recalculatedNodes);
            setEdges(saved.edges);
            needsInitialFitView.current = true;
            messageApi?.info('已恢复上次编辑内容');
        } else {
            hasRestoredAutoSave.current = true;
            console.log('[DesignerSystemSync] No autosave, checking PRESET_MAP for id:', id);
            
            // Core Fallback & Preset Injection Logic
            import('@/data/standardized').then(({ PRESET_MAP }) => {
                const preset = id ? PRESET_MAP[id] : null;
                console.log('[DesignerSystemSync] PRESET_MAP loaded. Keys available:', Object.keys(PRESET_MAP));
                console.log('[DesignerSystemSync] Target preset found:', !!preset);

                if (preset) {
                    // IF the requested diagram matches a known standard preset map
                    // WE securely run standardDataToCanvas to apply ELK.js layout mapping!
                    import('../designerUtils').then(({ standardDataToCanvas }) => {
                        console.log('[DesignerSystemSync] Executing standardDataToCanvas for preset...');
                        standardDataToCanvas(preset).then(({ nodes: newNodes, edges: newEdges }) => {
                            console.log('[DesignerSystemSync] ELK.js layout complete:', newNodes.length, 'nodes derived.');
                            if (newNodes.length > 0) {
                                setNodes(newNodes);
                                setEdges(newEdges);
                                needsInitialFitView.current = true;
                            }
                        }).catch(e => console.error('[DesignerSystemSync] standardDataToCanvas error:', e));
                    }).catch(e => console.error('[DesignerSystemSync] Import designerUtils failed:', e));
                } else {
                    console.log('[DesignerSystemSync] Render fallback empty state for plugin:', pluginId);
                    // Normal plugin fallback empty state
                    const plugin = PluginRegistry.getInstance().getPlugin(pluginId);
                    if (plugin) {
                        const emptyState = plugin.getEmptyState();
                        if (emptyState.nodes.length > 0) {
                            setNodes(emptyState.nodes);
                            setEdges(emptyState.edges);
                        }
                        // ALWAYS trigger initial viewport adjustment, even for empty canvases
                        needsInitialFitView.current = true;
                    }
                }
            }).catch(e => console.error('[DesignerSystemSync] load PRESET_MAP failed:', e));
        }
    }, [loadSaved, setNodes, setEdges, pluginId]);

    // Deferred view adjustment: waits for reactFlowInstance to become available
    useEffect(() => {
        if (needsInitialFitView.current && reactFlowInstance) {
            needsInitialFitView.current = false;
            
            // Define a function to safely apply initial layout
            const applyInitialViewport = () => {
                const currentNodes = reactFlowInstance.getNodes();
                const container = document.querySelector('.react-flow') as HTMLElement | null;
                const cw = container ? container.clientWidth : window.innerWidth;
                const ch = container ? container.clientHeight : window.innerHeight;
                
                // All diagrams, regardless of node count, should use the industry-standard true center 'fit'.
                // Our customized 'fit' handles safe zones and absolute centering.
                
                const allMeasured = currentNodes.every((n: any) => n.measured?.width || n.width);
                if (allMeasured) {
                    window.dispatchEvent(new CustomEvent('diagramControl', { detail: { action: 'fit' } }));
                } else {
                    // Fallback to forcefully push it to a general center if unmeasured,
                    // avoiding the top-left snag, then trigger actual fit after it measures.
                    reactFlowInstance.setViewport({ x: cw / 2 - 100, y: ch / 2 - 100, zoom: 1 });
                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('diagramControl', { detail: { action: 'fit' } }));
                    }, 400);
                }
            };

            setTimeout(applyInitialViewport, 100);
        }
    }, [reactFlowInstance]);

    return {
        performanceMode
    };
}

