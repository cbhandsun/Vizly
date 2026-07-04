import { describe, expect, it, vi } from 'vitest';

import {
  createDiagramViewerCommandItems,
  getDiagramViewerCommandModifierLabel,
} from '../diagramViewerCommandItems';

describe('diagramViewerCommandItems', () => {
  it('detects the platform-specific modifier label', () => {
    expect(getDiagramViewerCommandModifierLabel({ platform: 'MacIntel' })).toBe('⌘');
    expect(getDiagramViewerCommandModifierLabel({ platform: 'Win32' })).toBe('Ctrl');
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
    const t = ((_: string, fallback: string) => fallback) as any;

    const items = createDiagramViewerCommandItems({
      t,
      modifierLabel: 'Ctrl',
      isFullscreen: false,
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
});
