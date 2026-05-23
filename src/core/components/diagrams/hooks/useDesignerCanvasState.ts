import { useState, useEffect, useCallback, useRef } from 'react';
import { MarkerType } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { message } from 'antd';
import { useDiagramStylePreset_v2 } from '../../../hooks/useDiagramStylePreset_v2';
import { diagramStyleManager } from '../../shared/DiagramStyleManager';
import { useTheme } from '../../../themes/useCoreTheme';
import { useFlowchartState } from './useFlowchartState';
import { subscribeViewport } from '../../shared/viewportStore';
import { appMessage } from '@/core/utils/antdStaticBridge';


export interface UseDesignerCanvasStateProps {
    id?: string;
    externalReadonly?: boolean;
    externalEdgeMode?: 'advanced-smart' | 'native';
    externalShowOnlyMainFlow?: boolean;
    externalHighlightMainFlow?: boolean;
    onReadonlyChange?: (isReadonly: boolean) => void;
    onMainFlowAnimationChange?: (highlight: boolean) => void;
    onShowOnlyMainFlowChange?: (showOnly: boolean) => void;
    onOpenSettings?: () => void;
    onSyncPush?: (nodes: any[], edges: any[]) => void;
}

export function useDesignerCanvasState({
    _id,
    externalReadonly = false,
    externalEdgeMode = 'advanced-smart',
    externalShowOnlyMainFlow = false,
    externalHighlightMainFlow = false,
    onReadonlyChange,
    onMainFlowAnimationChange,
    onShowOnlyMainFlowChange,
    onOpenSettings,
    onSyncPush,
}: UseDesignerCanvasStateProps) {
    const { t } = useTranslation();
    const preset = useDiagramStylePreset_v2();
    const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
    const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

    const [internalReadonly, setInternalReadonly] = useState(externalReadonly);
    useEffect(() => setInternalReadonly(externalReadonly), [externalReadonly]);
    const isReadonly = internalReadonly;

    const handleReadonlyChange = useCallback((val: boolean) => {
        setInternalReadonly(val);
        if (onReadonlyChange) onReadonlyChange(val);
    }, [onReadonlyChange]);

    const [internalEdgeMode, setInternalEdgeMode] = useState<'advanced-smart' | 'native'>(externalEdgeMode);
    useEffect(() => setInternalEdgeMode(externalEdgeMode), [externalEdgeMode]);
    const edgeMode = internalEdgeMode;

    const [internalShowOnlyMainFlow, setInternalShowOnlyMainFlow] = useState(externalShowOnlyMainFlow);
    const [internalHighlightMainFlow, setInternalHighlightMainFlow] = useState(externalHighlightMainFlow);
    useEffect(() => setInternalShowOnlyMainFlow(externalShowOnlyMainFlow), [externalShowOnlyMainFlow]);
    useEffect(() => setInternalHighlightMainFlow(externalHighlightMainFlow), [externalHighlightMainFlow]);
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

    const handleOpenSettings = useCallback(() => {
        if (onOpenSettings) {
            onOpenSettings();
        } else {
            appMessage.info('当前独立设计器模式未挂载高级首选项面板，请在主视图中或按快捷键 Ctrl+Shift+, 打开。');
        }
    }, [onOpenSettings]);

    useEffect(() => {
        // 静态 import，避免动态异步导入导致组件卸载时 unsubscribe 丢失内存泄漏
        const unsubscribe = subscribeViewport((vp) => setViewport(vp));
        return () => unsubscribe();
    }, []);

    const [theme, setTheme] = useTheme({ autoInitialize: true });
    
    useEffect(() => {
        const handleGlobalThemeChanged = (e: any) => {
            const newThemeId = e.detail;
            if (newThemeId && newThemeId !== theme?.id) {
                setTheme(newThemeId).catch(console.warn);
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
                    const data = n.data as any;
                    if (data?.theme?.main === '#2196F3') {
                        changed = true;
                        return {
                            ...n,
                            data: {
                                ...data,
                                theme: { ...data.theme, main: undefined, border: undefined }
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
        
        handleOpenSettings,
        
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
