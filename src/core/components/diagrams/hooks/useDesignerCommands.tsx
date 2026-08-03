import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { FaEdit, FaTrash, FaCopy, FaSave, FaFolderOpen, FaSearchPlus, FaSearchMinus, FaExpand, FaProjectDiagram } from 'react-icons/fa';
import { useCommandRegistry } from './useCommandRegistry';
import { type CommandItem } from '../../../types/plugin';
import { PluginContext, DiagramTypePlugin } from '../../../types/plugin';
import { hasMutationLockedNode } from '../nodeLockPolicy';

interface UseDesignerCommandsProps {
    // View
    reactFlowInstance: ReactFlowInstance | null;
    handleFitView: () => void;
    handleGridRotate: () => void;
    setAutoRoutingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    // Edit
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
    handleCopyWithToast: () => void;
    handlePasteWithToast: () => void;
    handleCutWithToast: () => void;
    handleDeleteWithToast: (targetId?: string) => void;
    handleDuplicateWithToast: (targetId?: string) => void;
    handleSelectAll: () => void;
    handleGroupWithToast: () => void;
    handleUngroupWithToast: () => void;
    // 隐藏功能暴露
    handleMatchSize?: (mode: 'width' | 'height' | 'both') => void;
    handleReverseEdge?: (targetId?: string) => void;
    copyStyle?: (node: Node) => void;
    pasteStyle?: (nodeIds: string[]) => void;
    hasCopiedStyle?: boolean;
    saveAsTemplate?: (node: Node, label: string) => void;
    selectedNodes?: Node[];
    selectedEdges?: Edge[];
    /** 折叠/展开选中容器组 */
    toggleGroupCollapse?: (groupId: string) => void;
    // File
    handleExport: () => void;
    handleExportMermaid: () => void;
    handleCopyAsMermaid: () => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    handleOpenJsonEditor: () => void;
    // Layout
    handleStrategyLayout: (strategyName: string, nodeLayout?: string, direction?: 'TB' | 'LR') => void;
    handleSmartLayout: () => void;
    // UI
    setShowShortcuts: React.Dispatch<React.SetStateAction<boolean>>;
    // Plugins
    onOpenPlugins?: () => void;
    // ⭐ Phase 11: Comments
    isCommentMode: boolean;
    setIsCommentMode: (enabled: boolean) => void;

    pluginCtx?: PluginContext;
    activePlugin?: DiagramTypePlugin | null;
}

/**
 * useDesignerCommands — 命令面板注册与管理
 *
 * 从 FlowchartDesigner 提取的命令面板逻辑：
 * - 注册所有指令（View/Edit/File/Layout）
 * - 提供 commandPaletteItems 给 UI
 * - 管理面板可见性
 */
export function useDesignerCommands(props: UseDesignerCommandsProps) {
    const {
        reactFlowInstance,
        handleFitView,
        handleGridRotate,
        setAutoRoutingEnabled,
        canUndo,
        canRedo,
        undo,
        redo,
        handleCopyWithToast,
        handlePasteWithToast,
        handleCutWithToast,
        handleDeleteWithToast,
        handleDuplicateWithToast,
        handleSelectAll,
        handleGroupWithToast,
        handleUngroupWithToast,
        handleMatchSize,
        handleReverseEdge,
        copyStyle,
        pasteStyle,
        hasCopiedStyle,
        saveAsTemplate,
        selectedNodes,
        selectedEdges,
        toggleGroupCollapse,
        handleExport,
        handleExportMermaid,
        handleCopyAsMermaid,
        fileInputRef,
        handleOpenJsonEditor,
        handleStrategyLayout,
        handleSmartLayout,
        setShowShortcuts,
        onOpenPlugins,
        isCommentMode,
        setIsCommentMode,
        pluginCtx,
        activePlugin,
    } = props;
    const { t } = useTranslation();
    const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const mod = isMac ? '⌘' : 'Ctrl';
    const hasLockedSelection = hasMutationLockedNode(selectedNodes ?? []);

    const [commandPaletteVisible, setCommandPaletteVisible] = useState(false);
    const { registerCommands, commands } = useCommandRegistry();

    useEffect(() => {
        registerCommands([
            // --- Diagram / Nodes ---
            { id: 'node.add', label: '新建节点 (Add Node)', category: 'Nodes', keywords: ['add', 'new', 'create', '新建', '节点'], icon: <FaProjectDiagram />, action: () => window.dispatchEvent(new CustomEvent('editor:command', { detail: { action: 'add-node' } })) },
            { id: 'node.clear', label: '清空画布 (Clear Canvas)', category: 'General', keywords: ['clear', 'empty', 'reset', '清空', '重置'], icon: <FaTrash />, action: () => window.dispatchEvent(new CustomEvent('editor:command', { detail: { action: 'clear-canvas' } })) },

            // --- AI ---
            { id: 'ai.generate', label: 'AI 顾问 (AI Assistant)', category: 'Action', keywords: ['ai', 'generate', 'assistant', 'chat', '顾问', '生成'], icon: <FaProjectDiagram />, action: () => window.dispatchEvent(new CustomEvent('editor:command', { detail: { action: 'toggle-ai-chat' } })) },
            
            // --- Diagram Types ---
            { id: 'diagram.flowchart', label: '切换图表: 流程图 (Flowchart)', category: 'Action', keywords: ['switch', 'flowchart', '流程图'], icon: <FaProjectDiagram />, action: () => window.dispatchEvent(new CustomEvent('diagram-global-format-changed', { detail: 'flowchart' })) },
            { id: 'diagram.architecture', label: '切换图表: 架构图 (Architecture)', category: 'Action', keywords: ['switch', 'architecture', '架构图'], icon: <FaProjectDiagram />, action: () => window.dispatchEvent(new CustomEvent('diagram-global-format-changed', { detail: 'architecture' })) },
            { id: 'diagram.mindmap', label: '切换图表: 思维导图 (Mind Map)', category: 'Action', keywords: ['switch', 'mindmap', '思维导图'], icon: <FaProjectDiagram />, action: () => window.dispatchEvent(new CustomEvent('diagram-global-format-changed', { detail: 'mindmap' })) },

            // --- View ---
            { id: 'zoom.in', label: t('designer.toolbar.zoomIn'), category: 'View', shortcut: `${mod} + =`, icon: <FaSearchPlus />, action: () => reactFlowInstance?.zoomIn() },
            { id: 'zoom.out', label: t('designer.toolbar.zoomOut'), category: 'View', shortcut: `${mod} + -`, icon: <FaSearchMinus />, action: () => reactFlowInstance?.zoomOut() },
            { id: 'zoom.fit', label: t('designer.toolbar.fitView'), category: 'View', shortcut: `${mod} + 0`, icon: <FaExpand />, action: handleFitView },
            { id: 'view.grid', label: t('designer.flowchart.commands.toggleGrid'), category: 'View', action: handleGridRotate },
            { id: 'view.routing', label: t('designer.flowchart.commands.toggleSmartRouting'), category: 'View', action: () => setAutoRoutingEnabled(p => !p) },

            // --- Edit ---
            { id: 'edit.undo', label: t('designer.flowchart.commands.undo'), category: 'General', shortcut: `${mod} + Z`, enabled: canUndo, action: undo },
            { id: 'edit.redo', label: t('designer.flowchart.commands.redo'), category: 'General', shortcut: isMac ? `${mod} + Shift + Z` : `${mod} + Y`, enabled: canRedo, action: redo },
            { id: 'edit.copy', label: t('designer.flowchart.commands.copy'), category: 'General', shortcut: `${mod} + C`, icon: <FaCopy />, action: handleCopyWithToast },
            { id: 'edit.paste', label: t('designer.flowchart.commands.paste'), category: 'General', shortcut: `${mod} + V`, action: handlePasteWithToast },
            { id: 'edit.cut', label: t('designer.flowchart.commands.cut'), category: 'General', shortcut: `${mod} + X`, enabled: !hasLockedSelection, action: handleCutWithToast },
            { id: 'edit.delete', label: t('designer.flowchart.commands.deleteSelected'), category: 'General', shortcut: t('designer.flowchart.commands.deleteShortcut'), icon: <FaTrash />, enabled: !hasLockedSelection, action: () => handleDeleteWithToast() },
            { id: 'edit.duplicate', label: t('designer.flowchart.commands.duplicate'), category: 'General', shortcut: `${mod} + D`, enabled: !hasLockedSelection, action: () => handleDuplicateWithToast() },
            { id: 'edit.selectAll', label: t('designer.flowchart.commands.selectAll'), category: 'General', shortcut: `${mod} + A`, action: handleSelectAll },
            { id: 'edit.group', label: t('designer.flowchart.commands.group'), category: 'Nodes', shortcut: `${mod} + G`, enabled: !hasLockedSelection, action: handleGroupWithToast },
            { id: 'edit.ungroup', label: t('designer.flowchart.commands.ungroup'), category: 'Nodes', shortcut: `${mod} + Shift + G`, enabled: !hasLockedSelection, action: handleUngroupWithToast },

            // --- File ---
            { id: 'file.export', label: '高级导出 (High-DPI Export)...', category: 'File', keywords: ['export', 'png', 'svg', 'pdf', 'high-dpi', '导出', '打印'], icon: <FaSave />, action: handleExport },
            { id: 'file.exportMermaid', label: '导出为 Mermaid 文件', category: 'File', icon: <FaProjectDiagram />, action: handleExportMermaid },
            { id: 'file.copyMermaid', label: '复制为 Mermaid (剪贴板)', category: 'File', icon: <FaCopy />, action: handleCopyAsMermaid },
            { id: 'file.import', label: t('designer.toolbar.import'), category: 'File', icon: <FaFolderOpen />, action: () => fileInputRef.current?.click() },
            { id: 'file.editJson', label: t('designer.toolbar.edit'), category: 'File', icon: <FaEdit />, action: handleOpenJsonEditor },
            { id: 'file.plugins', label: '插件管理 (Plugin Manager)...', category: 'General', keywords: ['plugins', 'management', 'extensions', '插件', '管理'], icon: <FaProjectDiagram />, action: () => onOpenPlugins?.() },

            // --- 镭局 ---
            { id: 'layout.tb', label: t('designer.flowchart.commands.autoLayoutTB'), category: 'Action', icon: <FaProjectDiagram />, action: () => handleStrategyLayout('tree', undefined, 'TB') },
            { id: 'layout.lr', label: t('designer.flowchart.commands.autoLayoutLR'), category: 'Action', icon: <FaProjectDiagram />, action: () => handleStrategyLayout('tree', undefined, 'LR') },
            { id: 'layout.smart', label: '智能布局推荐 (Smart Layout)', category: 'Action', icon: <FaProjectDiagram />, action: handleSmartLayout },

            // --- 统一尺寸 (Match Size) ---
            { id: 'node.matchWidth', label: '统一宽度 (Match Width)', category: 'Nodes', keywords: ['match', 'width', 'size', '统一', '宽度'], icon: <FaProjectDiagram />, enabled: !hasLockedSelection && (selectedNodes?.length ?? 0) >= 2, action: () => handleMatchSize?.('width') },
            { id: 'node.matchHeight', label: '统一高度 (Match Height)', category: 'Nodes', keywords: ['match', 'height', 'size', '统一', '高度'], icon: <FaProjectDiagram />, enabled: !hasLockedSelection && (selectedNodes?.length ?? 0) >= 2, action: () => handleMatchSize?.('height') },
            { id: 'node.matchSize', label: '统一大小 (Match Size)', category: 'Nodes', keywords: ['match', 'size', 'both', '统一', '大小'], icon: <FaProjectDiagram />, enabled: !hasLockedSelection && (selectedNodes?.length ?? 0) >= 2, action: () => handleMatchSize?.('both') },

            // --- 连线操作 ---
            { id: 'edge.reverse', label: '反转连线方向 (Reverse Edge)', category: 'Edges', keywords: ['reverse', 'edge', 'direction', '反转', '连线'], icon: <FaCopy />, enabled: (selectedEdges?.length ?? 0) === 1, action: () => handleReverseEdge?.(selectedEdges?.[0]?.id) },

            // --- 格式刷 (Style Painter) ---
            { id: 'style.copy', label: '复制样式 (Copy Style) - Ctrl+Alt+C', category: 'Nodes', keywords: ['copy', 'style', 'format', 'painter', '格式刷', '样式'], icon: <FaCopy />, enabled: (selectedNodes?.length ?? 0) === 1, action: () => selectedNodes?.[0] && copyStyle?.(selectedNodes[0]) },
            { id: 'style.paste', label: '粘贴样式 (Paste Style) - Ctrl+Alt+V', category: 'Nodes', keywords: ['paste', 'style', 'format', 'painter', '格式刷', '样式'], icon: <FaCopy />, enabled: !hasLockedSelection && !!hasCopiedStyle && (selectedNodes?.length ?? 0) > 0, action: () => pasteStyle?.(selectedNodes?.map(n => n.id) ?? []) },
            { id: 'style.saveTemplate', label: '保存为模板 (Save as Template) - Ctrl+Alt+S', category: 'Nodes', keywords: ['save', 'template', 'style', '模板', '保存'], icon: <FaSave />, enabled: (selectedNodes?.length ?? 0) === 1, action: () => { const n = selectedNodes?.[0]; if (n) saveAsTemplate?.(n, typeof n.data?.label === 'string' ? n.data.label : '未命名'); } },

            // --- 折叠/展开 组容器 ---
            { 
                id: 'node.collapseGroup', 
                label: '折叠/展开选中组 (Toggle Collapse) — Alt+[', 
                category: 'Nodes', 
                keywords: ['collapse', 'expand', 'group', '折叠', '展开', '容器'], 
                icon: <FaProjectDiagram />,
                shortcut: 'Alt + [',
                enabled: !hasLockedSelection && (selectedNodes?.length ?? 0) > 0 && selectedNodes?.some(
                    n => ['titleGroup', 'subGroup', 'swimlane', 'group'].includes(n.type || '')
                ),
                action: () => {
                    const containerNode = selectedNodes?.find(
                        n => ['titleGroup', 'subGroup', 'swimlane', 'group'].includes(n.type || '')
                    );
                    if (containerNode) toggleGroupCollapse?.(containerNode.id);
                }
            },

            // --- ⭐ Phase 11: 评论系统 ---
            { id: 'comment.toggle', label: '切换评论模式 (Toggle Comment Mode)', category: 'General', shortcut: 'C', icon: <FaEdit />, action: () => setIsCommentMode(!isCommentMode) },
        ]);
    }, [
        activePlugin,
        canRedo,
        canUndo,
        copyStyle,
        fileInputRef,
        handleCopyAsMermaid,
        handleCopyWithToast,
        handleCutWithToast,
        handleDeleteWithToast,
        handleDuplicateWithToast,
        handleExport,
        handleExportMermaid,
        handleFitView,
        handleGridRotate,
        handleGroupWithToast,
        handleMatchSize,
        handleOpenJsonEditor,
        handlePasteWithToast,
        handleReverseEdge,
        handleSelectAll,
        handleSmartLayout,
        handleStrategyLayout,
        handleUngroupWithToast,
        hasCopiedStyle,
        hasLockedSelection,
        isCommentMode,
        isMac,
        mod,
        onOpenPlugins,
        pasteStyle,
        reactFlowInstance,
        redo,
        registerCommands,
        saveAsTemplate,
        selectedEdges,
        selectedNodes,
        setAutoRoutingEnabled,
        setIsCommentMode,
        t,
        toggleGroupCollapse,
        undo,
    ]);

    const categoryMeta = useCallback((category: string) => {
        if (category === 'View') return t('designer.flowchart.commandCategory.view');
        if (category === 'File') return t('designer.flowchart.commandCategory.file');
        if (category === 'Action') return t('designer.flowchart.commandCategory.action');
        if (category === 'Nodes') return t('designer.flowchart.commandCategory.nodes');
        if (category === 'Edges') return t('designer.flowchart.commandCategory.edges');
        return t('designer.flowchart.commandCategory.general');
    }, [t]);

    const commandPaletteItems = useMemo<CommandItem[]>(() => {
        const base: CommandItem[] = commands.map((cmd) => ({
            id: cmd.id,
            group: 'actions',
            title: cmd.label,
            description: cmd.enabled === false ? t('designer.flowchart.commandDisabled') : undefined,
            keywords: cmd.keywords,
            meta: [categoryMeta(cmd.category)],
            shortcut: cmd.shortcut,
            onSelect: () => {
                if (cmd.enabled === false) return;
                cmd.action();
            }
        }));

        base.unshift({
            id: 'op:shortcuts',
            group: 'actions',
            title: t('designer.commandPalette.shortcutsHelp'),
            description: t('designer.flowchartShortcuts.paletteDescription'),
            shortcut: '?',
            onSelect: () => setShowShortcuts(true)
        });

        // 注入当前激活插件的专属指令
        if (activePlugin?.contributeCommands && pluginCtx) {
            const pluginCommands = activePlugin.contributeCommands(pluginCtx);
            if (pluginCommands?.length) {
                base.push(...pluginCommands.map(cmd => ({
                    ...cmd,
                    meta: [activePlugin?.name || 'Plugin', ...(cmd.meta || [])]
                })));
            }
        }

        return base;
    }, [activePlugin, categoryMeta, commands, pluginCtx, setShowShortcuts, t]);

    return {
        commandPaletteVisible,
        setCommandPaletteVisible,
        commandPaletteItems,
    };
}
