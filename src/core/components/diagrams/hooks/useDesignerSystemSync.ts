import { useEffect, useMemo, useRef } from 'react';
import { Node, Edge } from '@xyflow/react';
import type { MessageInstance } from 'antd/es/message/interface';
import { useAutoSave } from './useAutoSave';
import { PluginRegistry } from '../../../services/PluginRegistry';
import { LayoutOptimizer } from '../../layout/LayoutOptimizer';

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

