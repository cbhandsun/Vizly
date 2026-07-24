import { useState, useEffect, useCallback, useRef } from 'react';
import { MarkerType, type Edge, type Node, type ReactFlowInstance } from '@xyflow/react';
import { useDiagramStylePreset_v2 } from '../../../hooks/useDiagramStylePreset_v2';
import { diagramStyleManager } from '../../shared/DiagramStyleManager';
import { useTheme } from '../../../themes/useCoreTheme';
import { useFlowchartState } from './useFlowchartState';
import { subscribeViewport } from '../../shared/viewportStore';
import { logDiagramGlobalThemeSyncFailure } from '../diagramThemeLogging';


export interface UseDesignerCanvasStateProps {
    externalReadonly?: boolean;
    externalEdgeMode?: 'advanced-smart' | 'native';
    externalShowOnlyMainFlow?: boolean;
    externalHighlightMainFlow?: boolean;
    onReadonlyChange?: (isReadonly: boolean) => void;
    onMainFlowAnimationChange?: (highlight: boolean) => void;
    onShowOnlyMainFlowChange?: (showOnly: boolean) => void;
    onSyncPush?: (nodes: Node[], edges: Edge[]) => void;
}

export function useDesignerCanvasState({
    externalReadonly = false,
    externalEdgeMode = 'advanced-smart',
    externalShowOnlyMainFlow = false,
    externalHighlightMainFlow = false,
    onReadonlyChange,
    onMainFlowAnimationChange,
    onShowOnlyMainFlowChange,
    onSyncPush,
}: UseDesignerCanvasStateProps) {
    const preset = useDiagramStylePreset_v2();
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
    const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

    const [internalReadonly, setInternalReadonly] = useState(externalReadonly);
    useEffect(() => {
        const timer = window.setTimeout(() => setInternalReadonly(externalReadonly), 0);
        return () => window.clearTimeout(timer);
    }, [externalReadonly]);
    const isReadonly = internalReadonly;

    const handleReadonlyChange = useCallback((val: boolean) => {
        setInternalReadonly(val);
        if (onReadonlyChange) onReadonlyChange(val);
    }, [onReadonlyChange]);

    const [internalEdgeMode, setInternalEdgeMode] = useState<'advanced-smart' | 'native'>(externalEdgeMode);
    useEffect(() => {
        const timer = window.setTimeout(() => setInternalEdgeMode(externalEdgeMode), 0);
        return () => window.clearTimeout(timer);
    }, [externalEdgeMode]);
    const edgeMode = internalEdgeMode;

    const [internalShowOnlyMainFlow, setInternalShowOnlyMainFlow] = useState(externalShowOnlyMainFlow);
    const [internalHighlightMainFlow, setInternalHighlightMainFlow] = useState(externalHighlightMainFlow);
    useEffect(() => {
        const timer = window.setTimeout(() => setInternalShowOnlyMainFlow(externalShowOnlyMainFlow), 0);
        return () => window.clearTimeout(timer);
    }, [externalShowOnlyMainFlow]);
    useEffect(() => {
        const timer = window.setTimeout(() => setInternalHighlightMainFlow(externalHighlightMainFlow), 0);
        return () => window.clearTimeout(timer);
    }, [externalHighlightMainFlow]);
    const showOnlyMainFlow = internalShowOnlyMainFlow;
    const highlightMainFlow = internalHighlightMainFlow;

    const handleToggleShowOnlyMainFlow = useCallback(() => {
        const next = !internalShowOnlyMainFlow;
        setInternalShowOnlyMainFlow(next);
        if (onShowOnlyMainFlowChange) onShowOnlyMainFlowChange(next);
    }, [internalShowOnlyMainFlow, onShowOnlyMainFlowChange]);

    const handleToggleHighlightMainFlow = useCallback(() => {
        const next = !internalHighlightMainFlow;
        setInternalHighlightMainFlow(next);
        if (onMainFlowAnimationChange) onMainFlowAnimationChange(next);
    }, [internalHighlightMainFlow, onMainFlowAnimationChange]);

    useEffect(() => {
        // 静态 import，避免动态异步导入导致组件卸载时 unsubscribe 丢失内存泄漏
        const unsubscribe = subscribeViewport((vp) => setViewport(vp));
        return () => unsubscribe();
    }, []);

    const [theme, setTheme] = useTheme({ autoInitialize: true });
    
    useEffect(() => {
        const handleGlobalThemeChanged = (event: Event) => {
            const newThemeId = event instanceof CustomEvent && typeof event.detail === 'string'
                ? event.detail
                : '';
            if (newThemeId && newThemeId !== theme?.id) {
                setTheme(newThemeId).catch((error) => {
                    logDiagramGlobalThemeSyncFailure('useDesignerCanvasState', newThemeId, error);
                });
            }
        };
        window.addEventListener('diagram-global-theme-changed', handleGlobalThemeChanged);
        return () => window.removeEventListener('diagram-global-theme-changed', handleGlobalThemeChanged);
    }, [theme?.id, setTheme]);

    const isDarkBg = theme?.mode === 'dark';
    const canvasBg = theme?.diagram?.canvas?.background || (isDarkBg ? '#1e1e2e' : 'transparent');
    const gridColor = theme?.diagram?.canvas?.grid?.color || (isDarkBg ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)');

    const {
        nodes,
        setNodes,
        edges,
        setEdges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        diagramHistory
    } = useFlowchartState(internalEdgeMode);

    useEffect(() => {
        setEdges(eds => {
            let changed = false;
            const updated = eds.map(e => {
                if (e.type === 'domain') return e;

                if (internalEdgeMode === 'native') {
                    if (e.type === 'advanced-smart-step' || e.type === 'advanced-smart-bezier' || e.type === 'smart') {
                        changed = true;
                        return { ...e, type: 'smoothstep' };
                    }
                } else {
                    if (e.type === 'smoothstep' || e.type === 'step' || e.type === 'default' || !e.type) {
                        changed = true;
                        return { ...e, type: 'advanced-smart-step' };
                    }
                }
                return e;
            });
            return changed ? updated : eds;
        });
    }, [internalEdgeMode, setEdges]);

    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    useEffect(() => {
        nodesRef.current = nodes;
        edgesRef.current = edges;
    }, [nodes, edges]);

    const previousPresetRef = useRef<string | null>(null);
    useEffect(() => {
        if (!previousPresetRef.current) {
            previousPresetRef.current = preset.name;
            return;
        }

        if (preset.name !== previousPresetRef.current) {
            const allPresetColors = new Set(diagramStyleManager.getPresets().map(p => p.edges.main.color));

            setEdges((eds) => {
                let changed = false;
                const nextEdges = eds.map(e => {
                    const currentStroke = e.style?.stroke;
                    if (!currentStroke || allPresetColors.has(currentStroke as string)) {
                        changed = true;
                        return {
                            ...e,
                            style: {
                                ...e.style,
                                stroke: preset.edges.main.color,
                                strokeWidth: preset.edges.main.width,
                                strokeDasharray: preset.edges.main.dash,
                            },
                            markerEnd: {
                                ...(typeof e.markerEnd === 'object' ? e.markerEnd : {}),
                                type: MarkerType.ArrowClosed,
                                color: preset.edges.main.color,
                                width: preset.edges.main.arrow.width,
                                height: preset.edges.main.arrow.height,
                            }
                        };
                    }
                    return e;
                });
                return changed ? nextEdges : eds;
            });

            setNodes((nds) => {
                let changed = false;
                const nextNodes = nds.map(n => {
                    const nodeTheme = n.data?.theme;
                    if (nodeTheme && typeof nodeTheme === 'object' && !Array.isArray(nodeTheme) && 'main' in nodeTheme && nodeTheme.main === '#2196F3') {
                        changed = true;
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                theme: { ...nodeTheme, main: undefined, border: undefined }
                            }
                        };
                    }
                    return n;
                });
                return changed ? nextNodes : nds;
            });

            previousPresetRef.current = preset.name;
        }
    }, [preset, setEdges, setNodes]);

    useEffect(() => {
        if (onSyncPush) {
            onSyncPush(nodes, edges);
        }
    }, [nodes, edges, onSyncPush]);

    return {
        reactFlowInstance,
        setReactFlowInstance,
        viewport,
        
        isReadonly,
        handleReadonlyChange,
        
        edgeMode,
        preset,
        
        showOnlyMainFlow,
        highlightMainFlow,
        handleToggleShowOnlyMainFlow,
        handleToggleHighlightMainFlow,
        
        theme,
        canvasBg,
        gridColor,
        isDarkBg,
        
        nodes,
        setNodes,
        edges,
        setEdges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        diagramHistory,
        
        nodesRef,
        edgesRef,
    };
}
