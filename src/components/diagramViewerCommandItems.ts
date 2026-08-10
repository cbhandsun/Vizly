import type { TFunction } from 'i18next';

import type { CommandItem } from '@/core/types/plugin';

type DiagramDefinitionLike = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  tags?: string[] | null;
};

export const getDiagramViewerCommandModifierLabel = ({
  platform,
}: {
  platform: string;
}): string => /Mac|iPhone|iPad|iPod/i.test(platform || '') ? '⌘' : 'Ctrl';

export const createDiagramViewerCommandItems = ({
  t,
  modifierLabel,
  isFullscreen,
  editingEnabled,
  commandFavorites,
  commandRecent,
  commandRecentOps,
  diagramDefinitions,
  setIsShortcutsOpen,
  setIsSettingsOpen,
  setMermaidModalVisible,
  handleToggleFullscreen,
  handleSelectDiagram,
  openDiagramInNewTab,
  navigate,
  triggerEditorCommand,
  triggerAiButton,
  triggerThemeButton,
  clearFavorites,
}: {
  t: TFunction;
  modifierLabel: string;
  isFullscreen: boolean;
  editingEnabled: boolean;
  commandFavorites: string[];
  commandRecent: string[];
  commandRecentOps: string[];
  diagramDefinitions: DiagramDefinitionLike[];
  setIsShortcutsOpen: (open: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setMermaidModalVisible: (open: boolean) => void;
  handleToggleFullscreen: () => void;
  handleSelectDiagram: (id: string) => void;
  openDiagramInNewTab: (id: string) => void;
  navigate: (path: string) => void;
  triggerEditorCommand: (action: string) => void;
  triggerAiButton: () => void;
  triggerThemeButton: () => void;
  clearFavorites: () => void;
}): CommandItem[] => {
  const editingUnavailable = (item: CommandItem): CommandItem => {
    if (editingEnabled) return item;
    return {
      ...item,
      disabled: true,
      description: t(
        'designer.commandItems.readonlyDisabled',
        'Canvas locked · Unlock to edit',
      ),
      onSelect: () => undefined,
      onAltSelect: undefined,
    };
  };

  const ops: CommandItem[] = [
    {
      id: 'op:shortcuts',
      group: 'actions',
      title: t('designer.commandItems.shortcuts', '快捷键 / Shortcuts'),
      keywords: ['快捷键', 'shortcuts', '帮助', 'help'],
      shortcut: '?',
      onSelect: () => setIsShortcutsOpen(true),
    },
    {
      id: 'op:settings',
      group: 'actions',
      title: t('designer.commandItems.settings', '配置面板 / Settings'),
      keywords: ['设置', '配置', 'drawer', 'settings'],
      shortcut: `${modifierLabel}+,`,
      onSelect: () => setIsSettingsOpen(true),
    },
    {
      id: 'op:toggleFullscreen',
      group: 'actions',
      title: isFullscreen
        ? t('designer.commandItems.exitFullscreen', '退出全屏 / Exit Fullscreen')
        : t('designer.commandItems.enterFullscreen', '进入全屏 / Fullscreen'),
      keywords: ['全屏', 'fullscreen'],
      shortcut: isFullscreen ? 'Esc' : undefined,
      onSelect: () => handleToggleFullscreen(),
    },
    editingUnavailable({
      id: 'op:smartLayout',
      group: 'actions',
      title: t('designer.commandItems.smartLayout', 'Smart layout'),
      keywords: ['布局', '整理', 'layout', 'smart'],
      shortcut: `${modifierLabel}+Shift+L`,
      onSelect: () => triggerEditorCommand('smart-layout'),
    }),
    editingUnavailable({
      id: 'op:addNode',
      group: 'actions',
      title: t('designer.commandItems.addNode', 'Add node'),
      keywords: ['创建', '节点', 'add', 'node', 'create'],
      shortcut: 'Alt+N',
      onSelect: () => triggerEditorCommand('add-node'),
    }),
    editingUnavailable({
      id: 'op:triggerAi',
      group: 'actions',
      title: t('designer.commandItems.triggerAi', 'AI assistant'),
      keywords: ['ai', 'assistant', '助手', '生成'],
      onSelect: () => triggerAiButton(),
    }),
    editingUnavailable({
      id: 'op:importMermaid',
      group: 'actions',
      title: t('designer.commandItems.importMermaid', 'Import from Mermaid'),
      keywords: ['mermaid', 'import', 'code', 'markdown', '导入', '代码'],
      shortcut: `${modifierLabel}+Shift+M`,
      onSelect: () => setMermaidModalVisible(true),
    }),
    {
      id: 'op:themeNext',
      group: 'actions',
      title: t('designer.commandItems.themeNext', 'Switch to next theme'),
      keywords: ['主题', 'theme', 'color', 'style'],
      shortcut: `${modifierLabel}+Shift+T`,
      onSelect: () => triggerThemeButton(),
    },
    {
      id: 'op:exportPng',
      group: 'actions',
      title: t('designer.commandItems.exportPng', 'Export PNG'),
      keywords: ['导出', '图片', 'export', 'png', 'image'],
      shortcut: `${modifierLabel}+Shift+E`,
      onSelect: () => triggerEditorCommand('export-png'),
    },
    editingUnavailable({
      id: 'op:clearCanvas',
      group: 'actions',
      title: t('designer.commandItems.clearCanvas', 'Clear canvas'),
      keywords: ['清空', '重置', 'clear', 'reset'],
      onSelect: () => triggerEditorCommand('clear-canvas'),
    }),
    {
      id: 'op:docs',
      group: 'actions',
      title: t('designer.commandItems.docs', '文档 / Documentation'),
      keywords: ['docs', '文档', 'help'],
      onSelect: () => navigate('/docs'),
      onAltSelect: () => window.open('/docs', '_blank', 'noopener,noreferrer'),
    },
    {
      id: 'op:manage',
      group: 'actions',
      title: t('designer.commandItems.manage', '管理 / Management'),
      keywords: ['manage', '管理', 'admin'],
      onSelect: () => navigate('/manage'),
      onAltSelect: () => window.open('/manage', '_blank', 'noopener,noreferrer'),
    },
    {
      id: 'op:clearFavorites',
      group: 'actions',
      title: t('designer.commandItems.clearFavorites', '清空收藏 / Clear Favorites'),
      keywords: ['收藏', 'favorites', '清空'],
      onSelect: () => clearFavorites(),
    },
  ];

  const opsById = new Map(ops.map((op) => [op.id, op]));
  const recentOps: CommandItem[] = [];
  const recentOpSet = new Set<string>();
  for (const id of commandRecentOps) {
    const item = opsById.get(String(id));
    if (!item) continue;
    recentOpSet.add(String(id));
    recentOps.push({ ...item, group: 'recent' });
  }

  const opsRest = ops.filter((op) => !recentOpSet.has(op.id));
  const diagramsById = new Map(diagramDefinitions.map((definition) => [String(definition.id), definition]));
  const used = new Set<string>();
  const diagramOps: CommandItem[] = [];

  const pushDiagramItem = (definition: DiagramDefinitionLike, group: CommandItem['group']) => {
    diagramOps.push({
      id: `diagram:${definition.id}`,
      group,
      title: definition.name,
      description: definition.description || undefined,
      keywords: [String(definition.category || ''), ...((definition.tags || []) as string[])].filter(Boolean),
      meta: [String(definition.category || 'other')].filter(Boolean),
      onSelect: () => handleSelectDiagram(definition.id),
      onAltSelect: () => openDiagramInNewTab(definition.id),
    });
  };

  for (const id of commandFavorites) {
    const definition = diagramsById.get(String(id));
    if (!definition) continue;
    used.add(String(definition.id));
    pushDiagramItem(definition, 'favorites');
  }

  for (const id of commandRecent) {
    const definition = diagramsById.get(String(id));
    if (!definition || used.has(String(definition.id))) continue;
    used.add(String(definition.id));
    pushDiagramItem(definition, 'recent');
  }

  for (const definition of diagramDefinitions) {
    if (used.has(String(definition.id))) continue;
    pushDiagramItem(definition, 'diagrams');
  }

  return [...recentOps, ...opsRest, ...diagramOps];
};
