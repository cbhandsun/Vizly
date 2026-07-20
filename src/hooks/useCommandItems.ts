import { useMemo } from 'react';
import type { CommandItem } from '@/core/types/plugin';

export interface UseCommandItemsOptions {
    setIsShortcutsOpen: (open: boolean) => void;
    setIsSettingsOpen: (open: boolean) => void;
    isFullscreen: boolean;
    handleToggleFullscreen: () => void;
    setMermaidModalVisible: (visible: boolean) => void;
    navigate: (path: string) => void;
    commandRecentOps: (string | number)[];
    commandFavorites: (string | number)[];
    commandRecent: (string | number)[];
    diagramDefinitions: any[];
    handleSelectDiagram: (id: string | number) => void;
    openDiagramInNewTab: (id: string | number) => void;
    t: (key: string, fallback?: string) => string;
}

export function useCommandItems(options: UseCommandItemsOptions): CommandItem[] {
    const {
        setIsShortcutsOpen,
        setIsSettingsOpen,
        isFullscreen,
        handleToggleFullscreen,
        setMermaidModalVisible,
        navigate,
        commandRecentOps,
        commandFavorites,
        commandRecent,
        diagramDefinitions,
        handleSelectDiagram,
        openDiagramInNewTab,
        t,
    } = options;

    return useMemo(() => {
        const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
        const mod = isMac ? '⌘' : 'Ctrl';
        const ops: CommandItem[] = [
            {
                id: 'op:shortcuts',
                group: 'actions',
                title: t('designer.commandItems.shortcuts', '快捷键 / Shortcuts'),
                keywords: ['快捷键', 'shortcuts', '帮助', 'help'],
                shortcut: '?',
                onSelect: () => setIsShortcutsOpen(true)
            },
            {
                id: 'op:settings',
                group: 'actions',
                title: t('designer.commandItems.settings', '配置面板 / Settings'),
                keywords: ['设置', '配置', 'drawer', 'settings'],
                shortcut: `${mod}+,`,
                onSelect: () => setIsSettingsOpen(true)
            },
            {
                id: 'op:toggleFullscreen',
                group: 'actions',
                title: isFullscreen ? t('designer.commandItems.exitFullscreen', '退出全屏 / Exit Fullscreen') : t('designer.commandItems.enterFullscreen', '进入全屏 / Fullscreen'),
                keywords: ['全屏', 'fullscreen'],
                shortcut: 'Esc',
                onSelect: () => handleToggleFullscreen()
            },
            {
                id: 'op:smartLayout',
                group: 'actions',
                title: t('designer.commandItems.smartLayout', '智能布局 / Smart Layout'),
                keywords: ['布局', '整理', 'layout', 'smart'],
                shortcut: `${mod}+Shift+L`,
                onSelect: () => window.dispatchEvent(new CustomEvent('editor:command', { detail: { action: 'smart-layout' }}))
            },
            {
                id: 'op:addNode',
                group: 'actions',
                title: t('designer.commandItems.addNode', '添加节点 / Add Node'),
                keywords: ['创建', '节点', 'add', 'node', 'create'],
                shortcut: `Alt+N`,
                onSelect: () => window.dispatchEvent(new CustomEvent('editor:command', { detail: { action: 'add-node' }}))
            },
            {
                id: 'op:triggerAi',
                group: 'actions',
                title: t('designer.commandItems.triggerAi', 'AI 助手 / AI Assistant'),
                keywords: ['ai', 'assistant', 'chat', '智能助手'],
                onSelect: () => {
                    const aiBtn = document.querySelector('[data-id="toolbar-ai-btn"]') || document.querySelector('.toolbar-button-ai');
                    if (aiBtn) (aiBtn as HTMLButtonElement).click();
                }
            },
            {
                id: 'op:importMermaid',
                group: 'actions',
                title: t('designer.commandItems.importMermaid', '从 Mermaid 导入 / Import Mermaid'),
                keywords: ['mermaid', 'import', 'code', 'markdown', '导入', '代码'],
                shortcut: `${mod}+Shift+M`,
                onSelect: () => setMermaidModalVisible(true)
            },
            {
                id: 'op:themeNext',
                group: 'actions',
                title: t('designer.commandItems.themeNext', '切换下一个主题 / Next Theme'),
                keywords: ['主题', 'theme', 'color', 'style'],
                shortcut: `${mod}+Shift+T`,
                onSelect: () => {
                    const themeBtn = document.querySelector('[data-id="toolbar-theme-btn"]');
                    if (themeBtn) (themeBtn as HTMLButtonElement).click();
                }
            },
            {
                id: 'op:exportPng',
                group: 'actions',
                title: t('designer.commandItems.exportPng', '导出 PNG / Export PNG'),
                keywords: ['导出', '图片', 'export', 'png', 'image'],
                shortcut: `${mod}+Shift+E`,
                onSelect: () => window.dispatchEvent(new CustomEvent('editor:command', { detail: { action: 'export-png' }}))
            },
            {
                id: 'op:clearCanvas',
                group: 'actions',
                title: t('designer.commandItems.clearCanvas', '清空画布 / Clear Canvas'),
                keywords: ['清空', '重置', 'clear', 'reset'],
                onSelect: () => window.dispatchEvent(new CustomEvent('editor:command', { detail: { action: 'clear-canvas' }}))
            },
            {
                id: 'op:docs',
                group: 'actions',
                title: t('designer.commandItems.docs', '文档 / Documentation'),
                keywords: ['docs', '文档', 'help'],
                onSelect: () => navigate('/docs'),
                onAltSelect: () => window.open('/docs', '_blank', 'noopener,noreferrer')
            },
            {
                id: 'op:manage',
                group: 'actions',
                title: t('designer.commandItems.manage', '管理 / Management'),
                keywords: ['manage', '管理', 'admin'],
                onSelect: () => navigate('/manage'),
                onAltSelect: () => window.open('/manage', '_blank', 'noopener,noreferrer')
            },
            {
                id: 'op:clearFavorites',
                group: 'actions',
                title: t('designer.commandItems.clearFavorites', '清空收藏 / Clear Favorites'),
                keywords: ['收藏', 'favorites', '清空'],
                onSelect: () => {
                    try { localStorage.setItem('diagramMenu.favorites', JSON.stringify([])); } catch { void 0; }
                    window.dispatchEvent(new CustomEvent('diagramMenuFavoritesChanged'));
                }
            }
        ];

        const opsById = new Map(ops.map(op => [op.id, op]));
        const recentOps: CommandItem[] = [];
        const recentOpSet = new Set<string>();
        for (const id of commandRecentOps) {
            const it = opsById.get(String(id));
            if (!it) continue;
            recentOpSet.add(String(id));
            recentOps.push({ ...it, group: 'recent' });
        }

        const opsRest = ops.filter(op => !recentOpSet.has(op.id));

        const byId = new Map(diagramDefinitions.map(d => [String(d.id), d]));
        const used = new Set<string>();
        const diagramOps: CommandItem[] = [];

        for (const id of commandFavorites) {
            const d = byId.get(String(id));
            if (!d) continue;
            used.add(String(d.id));
            diagramOps.push({
                id: `diagram:${d.id}`,
                group: 'favorites',
                title: d.name,
                description: d.description || undefined,
                keywords: [String(d.category || ''), ...(d.tags || [])].filter(Boolean),
                meta: [String(d.category || 'other')].filter(Boolean),
                onSelect: () => handleSelectDiagram(d.id),
                onAltSelect: () => openDiagramInNewTab(d.id)
            });
        }

        for (const id of commandRecent) {
            const d = byId.get(String(id));
            if (!d) continue;
            if (used.has(String(d.id))) continue;
            used.add(String(d.id));
            diagramOps.push({
                id: `diagram:${d.id}`,
                group: 'recent',
                title: d.name,
                description: d.description || undefined,
                keywords: [String(d.category || ''), ...(d.tags || [])].filter(Boolean),
                meta: [String(d.category || 'other')].filter(Boolean),
                onSelect: () => handleSelectDiagram(d.id),
                onAltSelect: () => openDiagramInNewTab(d.id)
            });
        }

        for (const d of diagramDefinitions) {
            if (used.has(String(d.id))) continue;
            diagramOps.push({
                id: `diagram:${d.id}`,
                group: 'diagrams',
                title: d.name,
                description: d.description || undefined,
                keywords: [String(d.category || ''), ...(d.tags || [])].filter(Boolean),
                meta: [String(d.category || 'other')].filter(Boolean),
                onSelect: () => handleSelectDiagram(d.id),
                onAltSelect: () => openDiagramInNewTab(d.id)
            });
        }

        return [...recentOps, ...opsRest, ...diagramOps];
    }, [
        commandFavorites,
        commandRecent,
        commandRecentOps,
        diagramDefinitions,
        handleSelectDiagram,
        handleToggleFullscreen,
        isFullscreen,
        navigate,
        openDiagramInNewTab,
        setIsSettingsOpen,
        setIsShortcutsOpen,
        setMermaidModalVisible,
        t
    ]);
}
