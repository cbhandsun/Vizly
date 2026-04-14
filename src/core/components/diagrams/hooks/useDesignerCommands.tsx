import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlowInstance } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { FaEdit, FaTrash, FaCopy, FaSave, FaFolderOpen, FaSearchPlus, FaSearchMinus, FaExpand, FaProjectDiagram } from 'react-icons/fa';
import { useCommandRegistry } from './useCommandRegistry';
import { type CommandItem } from '../../ui/CommandPalette';
import { PluginContext, DiagramTypePlugin } from '../../../types/plugin';

interface UseDesignerCommandsProps {
    // View
    reactFlowInstance: ReactFlowInstance<any, any> | null;
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
    const { t } = useTranslation();
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const mod = isMac ? '⌘' : 'Ctrl';

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
            { id: 'diagram.flowchart', label: '切换图表: 流程图 (Flowchart)', category: 'Diagram', keywords: ['switch', 'flowchart', '流程图'], icon: <FaProjectDiagram />, action: () => window.dispatchEvent(new CustomEvent('diagram-global-format-changed', { detail: 'flowchart' })) },
            { id: 'diagram.architecture', label: '切换图表: 架构图 (Architecture)', category: 'Diagram', keywords: ['switch', 'architecture', '架构图'], icon: <FaProjectDiagram />, action: () => window.dispatchEvent(new CustomEvent('diagram-global-format-changed', { detail: 'architecture' })) },
            { id: 'diagram.mindmap', label: '切换图表: 思维导图 (Mind Map)', category: 'Diagram', keywords: ['switch', 'mindmap', '思维导图'], icon: <FaProjectDiagram />, action: () => window.dispatchEvent(new CustomEvent('diagram-global-format-changed', { detail: 'mindmap' })) },

            // --- View ---
            { id: 'zoom.in', label: t('designer.toolbar.zoomIn'), category: 'View', shortcut: `${mod} + =`, icon: <FaSearchPlus />, action: () => props.reactFlowInstance?.zoomIn() },
            { id: 'zoom.out', label: t('designer.toolbar.zoomOut'), category: 'View', shortcut: `${mod} + -`, icon: <FaSearchMinus />, action: () => props.reactFlowInstance?.zoomOut() },
            { id: 'zoom.fit', label: t('designer.toolbar.fitView'), category: 'View', shortcut: `${mod} + 0`, icon: <FaExpand />, action: props.handleFitView },
            { id: 'view.grid', label: t('designer.flowchart.commands.toggleGrid'), category: 'View', action: props.handleGridRotate },
            { id: 'view.routing', label: t('designer.flowchart.commands.toggleSmartRouting'), category: 'View', action: () => props.setAutoRoutingEnabled(p => !p) },

            // --- Edit ---
            { id: 'edit.undo', label: t('designer.flowchart.commands.undo'), category: 'General', shortcut: `${mod} + Z`, enabled: props.canUndo, action: props.undo },
            { id: 'edit.redo', label: t('designer.flowchart.commands.redo'), category: 'General', shortcut: isMac ? `${mod} + Shift + Z` : `${mod} + Y`, enabled: props.canRedo, action: props.redo },
            { id: 'edit.copy', label: t('designer.flowchart.commands.copy'), category: 'General', shortcut: `${mod} + C`, icon: <FaCopy />, action: props.handleCopyWithToast },
            { id: 'edit.paste', label: t('designer.flowchart.commands.paste'), category: 'General', shortcut: `${mod} + V`, action: props.handlePasteWithToast },
            { id: 'edit.cut', label: t('designer.flowchart.commands.cut'), category: 'General', shortcut: `${mod} + X`, action: props.handleCutWithToast },
            { id: 'edit.delete', label: t('designer.flowchart.commands.deleteSelected'), category: 'General', shortcut: t('designer.flowchart.commands.deleteShortcut'), icon: <FaTrash />, action: () => props.handleDeleteWithToast() },
            { id: 'edit.duplicate', label: t('designer.flowchart.commands.duplicate'), category: 'General', shortcut: `${mod} + D`, action: () => props.handleDuplicateWithToast() },
            { id: 'edit.selectAll', label: t('designer.flowchart.commands.selectAll'), category: 'General', shortcut: `${mod} + A`, action: props.handleSelectAll },
            { id: 'edit.group', label: t('designer.flowchart.commands.group'), category: 'Nodes', shortcut: `${mod} + G`, action: props.handleGroupWithToast },
            { id: 'edit.ungroup', label: t('designer.flowchart.commands.ungroup'), category: 'Nodes', shortcut: `${mod} + Shift + G`, action: props.handleUngroupWithToast },

            // --- File ---
            { id: 'file.export', label: t('designer.toolbar.export'), category: 'File', icon: <FaSave />, action: props.handleExport },
            { id: 'file.exportMermaid', label: '导出为 Mermaid 文件', category: 'File', icon: <FaProjectDiagram />, action: props.handleExportMermaid },
            { id: 'file.copyMermaid', label: '复制为 Mermaid (剪贴板)', category: 'File', icon: <FaCopy />, action: props.handleCopyAsMermaid },
            { id: 'file.import', label: t('designer.toolbar.import'), category: 'File', icon: <FaFolderOpen />, action: () => props.fileInputRef.current?.click() },
            { id: 'file.editJson', label: t('designer.toolbar.edit'), category: 'File', icon: <FaEdit />, action: props.handleOpenJsonEditor },

            // --- Layout ---
            { id: 'layout.tb', label: t('designer.flowchart.commands.autoLayoutTB'), category: 'Action', icon: <FaProjectDiagram />, action: () => props.handleStrategyLayout('tree', undefined, 'TB') },
            { id: 'layout.lr', label: t('designer.flowchart.commands.autoLayoutLR'), category: 'Action', icon: <FaProjectDiagram />, action: () => props.handleStrategyLayout('tree', undefined, 'LR') },
            { id: 'layout.smart', label: '智能布局推荐 (Smart Layout)', category: 'Action', icon: <FaProjectDiagram />, action: props.handleSmartLayout },
        ]);
    }, [props.canUndo, props.canRedo, isMac, mod, registerCommands, t]);

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
            onSelect: () => props.setShowShortcuts(true)
        });

        // 注入当前激活插件的专属指令
        if (props.activePlugin?.contributeCommands && props.pluginCtx) {
            const pluginCommands = props.activePlugin.contributeCommands(props.pluginCtx);
            if (pluginCommands?.length) {
                base.push(...pluginCommands.map(cmd => ({
                    ...cmd,
                    group: 'plugin' as any,
                    meta: [props.activePlugin?.name || 'Plugin', ...(cmd.meta || [])]
                })));
            }
        }

        return base;
    }, [categoryMeta, commands, t, props.setShowShortcuts, props.activePlugin, props.pluginCtx]);

    return {
        commandPaletteVisible,
        setCommandPaletteVisible,
        commandPaletteItems,
    };
}
