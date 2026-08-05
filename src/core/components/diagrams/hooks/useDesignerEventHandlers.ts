import React, { useCallback, useEffect, useRef } from 'react';
import { Node, Edge, type ReactFlowInstance } from '@xyflow/react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { NotificationInstance } from 'antd/es/notification/interface';
import { useDesignerContextMenu } from './useDesignerContextMenu';
import { useClipboard } from './useClipboard';
import { useToastActions } from './useToastActions';
import { useLayerKeyboardShortcuts } from '../../../hooks/useLayerKeyboardShortcuts';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { useContainerAutoLayout } from './useContainerAutoLayout';
import { useDiagramActions } from './useDiagramActions';
import { useSpacePan } from './useSpacePan';
import type { DiagramTypePlugin, PluginContext } from '../../../types/plugin';
import type { LayerConfig } from './useLayerManagement';
import {
    focusFlowchartNodeById,
    shouldHandleFlowchartCanvasTab,
} from '../flowchartTabNavigation';

export interface UseDesignerEventHandlersProps {
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    selectedNodes: Node[];
    selectedEdges: Edge[];
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    getOperationScope: () => string;
    undo: () => void;
    redo: () => void;
    reactFlowInstance: ReactFlowInstance | null;
    reactFlowWrapper: React.RefObject<HTMLDivElement | null>;
    isDragging: boolean;
    editingEnabled: boolean;
    pluginCtx: PluginContext | null;
    activePlugin?: DiagramTypePlugin;
    messageApi: MessageInstance;
    notificationApi: NotificationInstance;
    
    layers: LayerConfig[];
    setActiveLayerId: (layerId: string) => void;
    toggleVisibility: (layerId: string) => void;
    canAlign: boolean;
    canDistribute: boolean;
    handleAlign: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
    handleDistribute: (direction: 'horizontal' | 'vertical') => void;

    handleGroup: () => void;
    handleUngroup: () => void;
    nodesRef: React.MutableRefObject<Node[]>;
    edgesRef: React.MutableRefObject<Edge[]>;
    
    setCommandPaletteVisible: (visible: boolean) => void;
    setShortcutHelpVisible: (visible: boolean) => void;
    setCanvasSearchVisible: (visible: boolean) => void;
    setCanvasSearchReplaceVisible: (visible: boolean) => void;
    copyStyle: (node: Node) => void;
    pasteStyle: (nodeIds: string[]) => void;
    hasCopiedStyle: boolean;
    saveAsTemplate: (node: Node, label: string) => void;
    /** 折叠/展开容器组 */
    toggleGroupCollapse?: (groupId: string) => void;
}

export function useDesignerEventHandlers({
    nodes, edges, setNodes, setEdges,
    selectedNodes, selectedEdges,
    takeSnapshot, getOperationScope, undo, redo,
    reactFlowInstance, reactFlowWrapper,
    isDragging, editingEnabled, pluginCtx, activePlugin,
    messageApi, notificationApi,
    layers, setActiveLayerId, toggleVisibility,
    canAlign, canDistribute, handleAlign, handleDistribute,
    handleGroup, handleUngroup,
    nodesRef, edgesRef,
    setCommandPaletteVisible, setShortcutHelpVisible,
    setCanvasSearchVisible, setCanvasSearchReplaceVisible,
    copyStyle, pasteStyle, hasCopiedStyle, saveAsTemplate,
    toggleGroupCollapse
}: UseDesignerEventHandlersProps) {

    const FLOWCHART_CLIPBOARD_KEY = 'flowchart-clipboard';
    
    const { onNodeContextMenu, onEdgeContextMenu, onPaneContextMenu, onPaneClick } = useDesignerContextMenu({
        reactFlowWrapper, selectedNodes,
    });

    const { 
        handleDelete, 
        handleDuplicate, 
        handleSelectAll, 
        handleFitView, 
        handleBringToFront, 
        handleSendToBack, 
        onContextMenuAction,
        handleLock,
        handleMatchSize,
        handleReverseEdge,
    } = useDiagramActions({
        nodes, edges, nodesRef, edgesRef, setNodes, setEdges, selectedNodes, selectedEdges,
        takeSnapshot,
        reactFlowInstance,
        pluginCtx: pluginCtx ?? undefined,
        activePlugin,
    });

    const { handleCopy, handlePaste, handleCut } = useClipboard({
        nodesRef, edgesRef, selectedNodes, selectedEdges, setNodes, setEdges, takeSnapshot,
        getOperationScope,
        clipboardKey: FLOWCHART_CLIPBOARD_KEY,
    });

    const {
        handleCopyWithToast, handlePasteWithToast, handleCutWithToast,
        handleDeleteWithToast, handleDuplicateWithToast,
        handleGroupWithToast, handleUngroupWithToast, onContextMenuActionWithToast
    } = useToastActions({
        messageApi, notificationApi, handleDelete, handleDuplicate, handleCopy, handlePaste, handleCut,
        handleGroup, handleUngroup, onContextMenuAction, undo, selectedNodes, selectedEdges, nodesRef, edgesRef,
    });

    const { layoutContainer } = useContainerAutoLayout(takeSnapshot);

    const handleContextMenuActionWithContainer = useCallback((action: string, targetId?: string) => {
        if (action === 'autoLayoutContainer' && targetId) {
            layoutContainer(targetId);
            return;
        }
        if (action === 'toggleCollapse' && targetId) {
            toggleGroupCollapse?.(targetId);
            return;
        }
        if (action === 'undo') { undo(); return; }
        if (action === 'redo') { redo(); return; }
        if (action === 'zoomIn') { reactFlowInstance?.zoomIn(); return; }
        if (action === 'zoomOut') { reactFlowInstance?.zoomOut(); return; }
        if (action === 'selectAll') { handleSelectAll(); return; }
        if (action === 'group') { handleGroupWithToast(); return; }
        if (action === 'ungroup') { handleUngroupWithToast(targetId); return; }
        
        onContextMenuActionWithToast(action, targetId);
    }, [layoutContainer, toggleGroupCollapse, onContextMenuActionWithToast, undo, redo, reactFlowInstance, handleSelectAll, handleGroupWithToast, handleUngroupWithToast]);

    const handleNudge = useCallback((direction: 'up' | 'down' | 'left' | 'right', distance: number) => {
        if (!editingEnabled) return;
        if (selectedNodes.length === 0) return;
        takeSnapshot(nodesRef.current, edgesRef.current);
        const delta = {
            x: direction === 'left' ? -distance : direction === 'right' ? distance : 0,
            y: direction === 'up' ? -distance : direction === 'down' ? distance : 0
        };
        const selectedIds = new Set(selectedNodes.map(sn => sn.id));
        setNodes((nds: Node[]) => nds.map(n => {
            if (selectedIds.has(n.id)) {
                return { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } };
            }
            return n;
        }));
    }, [editingEnabled, edgesRef, nodesRef, selectedNodes, setNodes, takeSnapshot]);

    useLayerKeyboardShortcuts({
        messageApi, layers, canAlign, canDistribute,
        callbacks: {
            onHelp: () => setShortcutHelpVisible(true),
            onLayerSwitch: (layerIndex: number) => setActiveLayerId(layers[layerIndex].id),
            onLayerToggleVisibility: (layerIndex: number) => toggleVisibility(layers[layerIndex].id),
            onAlign: (type) => { if (editingEnabled) handleAlign(type); },
            onDistribute: (direction) => { if (editingEnabled) handleDistribute(direction); },
        },
    });

    const isDraggingRef = useRef(isDragging);
    useEffect(() => {
        isDraggingRef.current = isDragging;
    }, [isDragging]);

    useKeyboardShortcuts({
        onDelete: () => { if (editingEnabled) handleDeleteWithToast(); },
        onDuplicate: () => { if (editingEnabled && !isDraggingRef.current) handleDuplicateWithToast(); },
        onUndo: () => { if (editingEnabled) undo(); },
        onRedo: () => { if (editingEnabled) redo(); },
        onSelectAll: handleSelectAll,
        onCopy: () => { if (!isDraggingRef.current) handleCopyWithToast(); },
        onPaste: () => { if (editingEnabled) void handlePasteWithToast(); },
        onCut: () => { if (editingEnabled && !isDraggingRef.current) handleCutWithToast(); },
        onGroup: () => { if (editingEnabled) handleGroupWithToast(); },
        onUngroup: () => { if (editingEnabled) handleUngroupWithToast(); },
        onNudge: handleNudge,
        onZoomIn: () => reactFlowInstance?.zoomIn(),
        onZoomOut: () => reactFlowInstance?.zoomOut(),
        onFitView: handleFitView,
        onEnterEdit: () => {
            if (!editingEnabled) return;
            if (selectedNodes.length === 1) {
                const nodeId = selectedNodes[0].id;
                setNodes((nds: Node[]) => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, isEditing: true } } : n));
            }
        },
        onOpenCommandPalette: () => setCommandPaletteVisible(true),
        onShowShortcuts: () => setShortcutHelpVisible(true),
        pluginShortcuts: pluginCtx
            ? activePlugin?.contributeShortcuts?.(pluginCtx)
            : undefined,
        pluginCtx: pluginCtx ?? undefined,
    });

    useEffect(() => {
        const handleCtrlF = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                const target = e.target as HTMLElement;
                if (!['INPUT', 'TEXTAREA'].includes(target.tagName) && !target.isContentEditable) {
                    e.preventDefault();
                    setCanvasSearchReplaceVisible(false);
                    setCanvasSearchVisible(true);
                }
            }
        };
        window.addEventListener('keydown', handleCtrlF);
        return () => window.removeEventListener('keydown', handleCtrlF);
    }, [setCanvasSearchReplaceVisible, setCanvasSearchVisible]);

    // Ctrl+H：打开查找替换
    useEffect(() => {
        const handleCtrlH = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
                const target = e.target as HTMLElement;
                if (!['INPUT', 'TEXTAREA'].includes(target.tagName) && !target.isContentEditable) {
                    e.preventDefault();
                    setCanvasSearchReplaceVisible(true);
                    setCanvasSearchVisible(true);
                }
            }
        };
        window.addEventListener('keydown', handleCtrlH);
        return () => window.removeEventListener('keydown', handleCtrlH);
    }, [setCanvasSearchReplaceVisible, setCanvasSearchVisible]);

    // Tab / Shift+Tab：在节点间循环导航
    useEffect(() => {
        const handleTabNav = (e: KeyboardEvent) => {
            if (!shouldHandleFlowchartCanvasTab({
                key: e.key,
                target: e.target,
                activeElement: document.activeElement,
            })) return;
            // 有模态框打开时不拦截
            if (document.querySelector('.ant-modal-wrap:not([style*="display: none"])')) return;

            const currentNodes = nodesRef.current;
            if (currentNodes.length === 0) return;

            e.preventDefault();

            // 按空间位置排序：从左到右、从上到下（同行内按 x 排）
            const sorted = [...currentNodes].sort((a, b) => {
                const rowDiff = a.position.y - b.position.y;
                return Math.abs(rowDiff) < 50 ? a.position.x - b.position.x : rowDiff;
            });

            const currentSelected = selectedNodes[0];
            const currentIdx = currentSelected ? sorted.findIndex(n => n.id === currentSelected.id) : -1;
            const nextIdx = e.shiftKey
                ? (currentIdx - 1 + sorted.length) % sorted.length
                : (currentIdx + 1) % sorted.length;
            const nextNode = sorted[nextIdx];

            if (!nextNode) return;

            // 更新选中状态
            setNodes((nds: Node[]) => nds.map(n => ({ ...n, selected: n.id === nextNode.id })));
            window.requestAnimationFrame(() => {
                focusFlowchartNodeById(document, nextNode.id);
            });

            // 自动居中到目标节点
            if (reactFlowInstance) {
                const w = nextNode.measured?.width || (nextNode.width as number) || 120;
                const h = nextNode.measured?.height || (nextNode.height as number) || 60;
                reactFlowInstance.setCenter(
                    nextNode.position.x + w / 2,
                    nextNode.position.y + h / 2,
                    { zoom: Math.max(reactFlowInstance.getZoom(), 1.0), duration: 250 }
                );
            }
        };

        window.addEventListener('keydown', handleTabNav);
        return () => window.removeEventListener('keydown', handleTabNav);
    }, [nodesRef, selectedNodes, setNodes, reactFlowInstance]);

    useEffect(() => {
        const handleStyleKeys = (e: KeyboardEvent) => {
            if (!editingEnabled) return;
            const isCtrlOrCmd = e.ctrlKey || e.metaKey;
            if (!isCtrlOrCmd || !e.altKey) return;
            const target = e.target as HTMLElement;
            if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;

            if (e.key.toLowerCase() === 'c' && selectedNodes.length === 1) {
                e.preventDefault();
                copyStyle(selectedNodes[0]);
            } else if (e.key.toLowerCase() === 'v' && hasCopiedStyle && selectedNodes.length > 0) {
                e.preventDefault();
                pasteStyle(selectedNodes.map(n => n.id));
            } else if (e.key.toLowerCase() === 's' && selectedNodes.length === 1) {
                e.preventDefault();
                const node = selectedNodes[0];
                const label = (node.data as Record<string, unknown>)?.label as string || '未命名';
                saveAsTemplate(node, label);
            }
        };
        window.addEventListener('keydown', handleStyleKeys);
        return () => window.removeEventListener('keydown', handleStyleKeys);
    }, [copyStyle, editingEnabled, hasCopiedStyle, pasteStyle, saveAsTemplate, selectedNodes]);

    // Alt+[ / Alt+] : 折叠/展开选中的容器节点
    useEffect(() => {
        const CONTAINER_TYPES = new Set(['titleGroup', 'subGroup', 'swimlane', 'group']);
        const handleCollapseKey = (e: KeyboardEvent) => {
            if (!editingEnabled) return;
            if (!e.altKey || e.ctrlKey || e.metaKey) return;
            if (e.key !== '[' && e.key !== ']') return;
            const target = e.target as HTMLElement;
            if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;

            const containerNode = selectedNodes.find(n => CONTAINER_TYPES.has(n.type || ''));
            if (!containerNode) return;

            e.preventDefault();
            toggleGroupCollapse?.(containerNode.id);
        };
        window.addEventListener('keydown', handleCollapseKey);
        return () => window.removeEventListener('keydown', handleCollapseKey);
    }, [editingEnabled, selectedNodes, toggleGroupCollapse]);

    const { isSpacePressed } = useSpacePan();

    return {
        onNodeContextMenu,
        onEdgeContextMenu,
        onPaneContextMenu,
        onPaneClick,
        handleContextMenuAction: handleContextMenuActionWithContainer,
        handleSelectAll,
        handleFitView,
        handleBringToFront,
        handleSendToBack,
        isSpacePressed,
        // Toast actions
        handleCopyWithToast,
        handlePasteWithToast,
        handleCutWithToast,
        handleDeleteWithToast,
        handleDuplicateWithToast,
        handleGroupWithToast,
        handleUngroupWithToast,
        onContextMenuActionWithToast,
        handleLock,
        // 暴露隐藏功能
        handleMatchSize,
        handleReverseEdge,
    };
}
