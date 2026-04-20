import React, { useCallback, useRef, useEffect, useState } from 'react';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { useDesignerContextMenu } from './useDesignerContextMenu';
import { useClipboard } from './useClipboard';
import { useToastActions } from './useToastActions';
import { useLayerKeyboardShortcuts } from '../../../hooks/useLayerKeyboardShortcuts';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { useContainerAutoLayout } from './useContainerAutoLayout';
import { useDiagramActions } from './useDiagramActions';
import { useSpacePan } from './useSpacePan';

export interface UseDesignerEventHandlersProps {
    nodes: Node[];
    edges: Edge[];
    setNodes: any;
    setEdges: any;
    selectedNodes: Node[];
    selectedEdges: Edge[];
    takeSnapshot: any;
    undo: any;
    redo: any;
    reactFlowInstance: any;
    reactFlowWrapper: React.RefObject<HTMLDivElement>;
    isDragging: boolean;
    pluginCtx: any;
    activePlugin: any;
    messageApi: any;
    notificationApi: any;
    
    layers: any[];
    setActiveLayerId: any;
    toggleVisibility: any;
    canAlign: boolean;
    canDistribute: boolean;
    handleAlign: any;
    handleDistribute: any;

    handleGroup: any;
    handleUngroup: any;
    nodesRef: React.MutableRefObject<Node[]>;
    edgesRef: React.MutableRefObject<Edge[]>;
    
    setCommandPaletteVisible: (visible: boolean) => void;
    setShortcutHelpVisible: (visible: boolean) => void;
    setCanvasSearchVisible: (visible: boolean) => void;
    copyStyle: any;
    pasteStyle: any;
    hasCopiedStyle: boolean;
    saveAsTemplate: any;
    /** 折叠/展开容器组 */
    toggleGroupCollapse?: (groupId: string) => void;
}

export function useDesignerEventHandlers({
    nodes, edges, setNodes, setEdges,
    selectedNodes, selectedEdges,
    takeSnapshot, undo, redo,
    reactFlowInstance, reactFlowWrapper,
    isDragging, pluginCtx, activePlugin,
    messageApi, notificationApi,
    layers, setActiveLayerId, toggleVisibility,
    canAlign, canDistribute, handleAlign, handleDistribute,
    handleGroup, handleUngroup,
    nodesRef, edgesRef,
    setCommandPaletteVisible, setShortcutHelpVisible,
    setCanvasSearchVisible,
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
        nodes, edges, setNodes, setEdges, selectedNodes, selectedEdges,
        takeSnapshot, reactFlowInstance, pluginCtx, activePlugin
    });

    const { handleCopy, handlePaste, handleCut } = useClipboard({
        nodes, edges, selectedNodes, selectedEdges, setNodes, setEdges, takeSnapshot
    });

    const {
        handleCopyWithToast, handlePasteWithToast, handleCutWithToast,
        handleDeleteWithToast, handleDuplicateWithToast,
        handleGroupWithToast, handleUngroupWithToast, onContextMenuActionWithToast
    } = useToastActions({
        messageApi, notificationApi, handleDelete, handleDuplicate, handleCopy, handlePaste, handleCut,
        handleGroup, handleUngroup, onContextMenuAction, undo, selectedNodes, selectedEdges, nodesRef, edgesRef,
        clipboardKey: FLOWCHART_CLIPBOARD_KEY,
    });

    const { layoutContainer } = useContainerAutoLayout();

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
        
        onContextMenuActionWithToast(action, targetId);
    }, [layoutContainer, toggleGroupCollapse, onContextMenuActionWithToast, undo, redo, reactFlowInstance, handleSelectAll]);

    const handleNudge = useCallback((direction: 'up' | 'down' | 'left' | 'right', distance: number) => {
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
    }, [setNodes, takeSnapshot, selectedNodes, nodesRef, edgesRef]);

    useLayerKeyboardShortcuts({
        messageApi, layers, canAlign, canDistribute,
        callbacks: {
            onHelp: () => setShortcutHelpVisible(true),
            onLayerSwitch: (layerIndex: number) => setActiveLayerId(layers[layerIndex].id),
            onLayerToggleVisibility: (layerIndex: number) => toggleVisibility(layers[layerIndex].id),
            onAlign: handleAlign,
            onDistribute: handleDistribute,
        },
    });

    const isDraggingRef = useRef(isDragging);
    isDraggingRef.current = isDragging;

    useKeyboardShortcuts({
        onDelete: () => handleDeleteWithToast(),
        onDuplicate: () => { if (!isDraggingRef.current) handleDuplicateWithToast(); },
        onUndo: undo,
        onRedo: redo,
        onSelectAll: handleSelectAll,
        onCopy: () => { if (!isDraggingRef.current) handleCopyWithToast(); },
        onPaste: handlePasteWithToast,
        onCut: () => { if (!isDraggingRef.current) handleCutWithToast(); },
        onGroup: handleGroupWithToast,
        onUngroup: handleUngroupWithToast,
        onNudge: handleNudge,
        onZoomIn: () => reactFlowInstance?.zoomIn(),
        onZoomOut: () => reactFlowInstance?.zoomOut(),
        onFitView: handleFitView,
        onEnterEdit: () => {
            if (selectedNodes.length === 1) {
                const nodeId = selectedNodes[0].id;
                setNodes((nds: Node[]) => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, isEditing: true } } : n));
            }
        },
        onOpenCommandPalette: () => setCommandPaletteVisible(true),
        onShowShortcuts: () => setShortcutHelpVisible(true),
        pluginShortcuts: activePlugin?.contributeShortcuts?.(pluginCtx),
        pluginCtx,
    });

    useEffect(() => {
        const handleCtrlF = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                const target = e.target as HTMLElement;
                if (!['INPUT', 'TEXTAREA'].includes(target.tagName) && !target.isContentEditable) {
                    e.preventDefault();
                    setCanvasSearchVisible(true);
                }
            }
        };
        window.addEventListener('keydown', handleCtrlF);
        return () => window.removeEventListener('keydown', handleCtrlF);
    }, [setCanvasSearchVisible]);

    // Ctrl+H：打开查找替换
    useEffect(() => {
        const handleCtrlH = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
                const target = e.target as HTMLElement;
                if (!['INPUT', 'TEXTAREA'].includes(target.tagName) && !target.isContentEditable) {
                    e.preventDefault();
                    setCanvasSearchVisible(true);
                    // 延迟点击替换切换按钮（组件挂载后）
                    setTimeout(() => {
                        const replaceToggle = document.querySelector('[title="查找替换 (Ctrl+H)"]') as HTMLButtonElement;
                        replaceToggle?.click();
                    }, 80);
                }
            }
        };
        window.addEventListener('keydown', handleCtrlH);
        return () => window.removeEventListener('keydown', handleCtrlH);
    }, [setCanvasSearchVisible]);

    // Tab / Shift+Tab：在节点间循环导航
    useEffect(() => {
        const handleTabNav = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            const target = e.target as HTMLElement;
            // 焦点在输入框时不拦截
            if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;
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
    }, [selectedNodes, copyStyle, pasteStyle, hasCopiedStyle, saveAsTemplate]);

    // Alt+[ / Alt+] : 折叠/展开选中的容器节点
    useEffect(() => {
        const CONTAINER_TYPES = new Set(['titleGroup', 'subGroup', 'swimlane', 'group']);
        const handleCollapseKey = (e: KeyboardEvent) => {
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
    }, [selectedNodes, toggleGroupCollapse]);

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
