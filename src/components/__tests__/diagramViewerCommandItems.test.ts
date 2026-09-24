// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import en from '../../locales/en.json';
import zh from '../../locales/zh.json';

import {
  createDiagramViewerCommandItems,
  getDiagramViewerCommandModifierLabel,
} from '../diagramViewerCommandItems';

describe('diagramViewerCommandItems', () => {
  it('keeps command titles localized instead of falling back to bilingual labels', () => {
    const keys = [
      'smartLayout',
      'addNode',
      'triggerAi',
      'importMermaid',
      'themeNext',
      'exportPng',
      'clearCanvas',
    ] as const;

    for (const key of keys) {
      expect(en.designer.commandItems[key]).not.toMatch(/[\u3400-\u9fff]/u);
      expect(zh.designer.commandItems[key]).toMatch(/[\u3400-\u9fff]/u);
      expect(en.designer.commandItems[key]).not.toContain('/');
      expect(zh.designer.commandItems[key]).not.toContain('/');
    }
  });

  it('detects the platform-specific modifier label', () => {
    expect(getDiagramViewerCommandModifierLabel({ platform: 'MacIntel' })).toBe('⌘');
    expect(getDiagramViewerCommandModifierLabel({ platform: 'Win32' })).toBe('Ctrl');
  });

  it('only advertises Escape for exiting an active fullscreen session', () => {
    const t = ((_: string, fallback: string) => fallback) as unknown as TFunction;
    const createItems = (isFullscreen: boolean) => createDiagramViewerCommandItems({
      t,
      modifierLabel: 'Ctrl',
      isFullscreen,
      editingEnabled: true,
      commandFavorites: [],
      commandRecent: [],
      commandRecentOps: [],
      diagramDefinitions: [],
      setIsShortcutsOpen: vi.fn(),
      setIsSettingsOpen: vi.fn(),
      setMermaidModalVisible: vi.fn(),
      handleToggleFullscreen: vi.fn(),
      handleSelectDiagram: vi.fn(),
      openDiagramInNewTab: vi.fn(),
      navigate: vi.fn(),
      triggerEditorCommand: vi.fn(),
      triggerAiButton: vi.fn(),
      triggerThemeButton: vi.fn(),
      clearFavorites: vi.fn(),
    });

    expect(createItems(false).find(item => item.id === 'op:toggleFullscreen')).toMatchObject({
      title: '进入全屏 / Fullscreen',
      shortcut: undefined,
    });
    expect(createItems(true).find(item => item.id === 'op:toggleFullscreen')).toMatchObject({
      title: '退出全屏 / Exit Fullscreen',
      shortcut: 'Esc',
    });
  });

  it('builds action items and prioritizes recent/favorite diagrams', () => {
    const setIsShortcutsOpen = vi.fn();
    const setIsSettingsOpen = vi.fn();
    const setMermaidModalVisible = vi.fn();
    const handleToggleFullscreen = vi.fn();
    const handleSelectDiagram = vi.fn();
    const openDiagramInNewTab = vi.fn();
    const navigate = vi.fn();
    const triggerEditorCommand = vi.fn();
    const triggerAiButton = vi.fn();
    const triggerThemeButton = vi.fn();
    const clearFavorites = vi.fn();
    const t = ((_: string, fallback: string) => fallback) as unknown as TFunction;

    const items = createDiagramViewerCommandItems({
      t,
      modifierLabel: 'Ctrl',
      isFullscreen: false,
      editingEnabled: true,
      commandFavorites: ['b'],
      commandRecent: ['a', 'b'],
      commandRecentOps: ['op:smartLayout'],
      diagramDefinitions: [
        { id: 'a', name: 'Alpha', category: 'basic', tags: ['one'] },
        { id: 'b', name: 'Beta', category: 'advanced', tags: ['two'] },
        { id: 'c', name: 'Gamma', category: 'basic', tags: ['three'] },
      ],
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
    });

    expect(items[0].id).toBe('op:smartLayout');
    expect(items[0].group).toBe('recent');

    const favoriteDiagram = items.find((item) => item.id === 'diagram:b');
    const recentDiagram = items.find((item) => item.id === 'diagram:a');
    const defaultDiagram = items.find((item) => item.id === 'diagram:c');

    expect(favoriteDiagram?.group).toBe('favorites');
    expect(recentDiagram?.group).toBe('recent');
    expect(defaultDiagram?.group).toBe('diagrams');

    const addNode = items.find((item) => item.id === 'op:addNode');
    addNode?.onSelect?.();
    expect(triggerEditorCommand).toHaveBeenCalledWith('add-node');

    favoriteDiagram?.onSelect?.();
    favoriteDiagram?.onAltSelect?.();
    expect(handleSelectDiagram).toHaveBeenCalledWith('b');
    expect(openDiagramInNewTab).toHaveBeenCalledWith('b');
  });

  it('keeps view commands available while blocking every canvas mutation when locked', () => {
    const triggerEditorCommand = vi.fn();
    const triggerAiButton = vi.fn();
    const setMermaidModalVisible = vi.fn();
    const t = ((_: string, fallback: string) => fallback) as unknown as TFunction;

    const items = createDiagramViewerCommandItems({
      t,
      modifierLabel: 'Ctrl',
      isFullscreen: false,
      editingEnabled: false,
      commandFavorites: [],
      commandRecent: [],
      commandRecentOps: ['op:clearCanvas'],
      diagramDefinitions: [],
      setIsShortcutsOpen: vi.fn(),
      setIsSettingsOpen: vi.fn(),
      setMermaidModalVisible,
      handleToggleFullscreen: vi.fn(),
      handleSelectDiagram: vi.fn(),
      openDiagramInNewTab: vi.fn(),
      navigate: vi.fn(),
      triggerEditorCommand,
      triggerAiButton,
      triggerThemeButton: vi.fn(),
      clearFavorites: vi.fn(),
    });

    for (const id of ['op:smartLayout', 'op:addNode', 'op:triggerAi', 'op:importMermaid', 'op:clearCanvas']) {
      const item = items.find(candidate => candidate.id === id);
      expect(item).toMatchObject({
        disabled: true,
        description: 'Canvas locked · Unlock to edit',
      });
      item?.onSelect();
    }

    expect(items.find(item => item.id === 'op:exportPng')?.disabled).not.toBe(true);
    expect(items.find(item => item.id === 'op:settings')?.disabled).not.toBe(true);
    expect(triggerEditorCommand).not.toHaveBeenCalled();
    expect(triggerAiButton).not.toHaveBeenCalled();
    expect(setMermaidModalVisible).not.toHaveBeenCalled();
  });
});
