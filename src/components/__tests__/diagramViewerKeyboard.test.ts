// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  createDiagramViewerGlobalKeydownHandler,
  resolveDiagramViewerKeyboardActions,
} from '../diagramViewerKeyboard';

describe('diagramViewerKeyboard', () => {
  it('resolves keyboard actions for global shortcuts', () => {
    expect(resolveDiagramViewerKeyboardActions({
      event: {
        key: 'L',
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
        altKey: false,
      } as KeyboardEvent,
      isPresentationMode: false,
      isFullscreenActive: false,
    })).toEqual(['smartLayout']);

    expect(resolveDiagramViewerKeyboardActions({
      event: {
        key: 'Escape',
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      } as KeyboardEvent,
      isPresentationMode: true,
      isFullscreenActive: true,
    })).toEqual(['exitFullscreen', 'exitPresentation']);
  });

  it('executes resolved actions in order and prevents default where needed', () => {
    const exitFullscreen = vi.fn();
    const toggleDebugPanel = vi.fn();
    const openCommandPalette = vi.fn();
    const openSettings = vi.fn();
    const triggerEditorCommand = vi.fn();
    const triggerAi = vi.fn();
    const triggerTheme = vi.fn();
    const exitPresentation = vi.fn();
    const onFullscreenExitFailure = vi.fn();

    const handler = createDiagramViewerGlobalKeydownHandler({
      isPresentationMode: true,
      editingEnabled: true,
      isFullscreenActive: () => true,
      exitFullscreen,
      onFullscreenExitFailure,
      toggleDebugPanel,
      openCommandPalette,
      openSettings,
      triggerEditorCommand,
      triggerAi,
      triggerTheme,
      exitPresentation,
    });

    const preventDefault = vi.fn();
    handler({
      key: 'Escape',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault,
    } as unknown as KeyboardEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(exitPresentation).toHaveBeenCalledTimes(1);

    const addNodePreventDefault = vi.fn();
    handler({
      key: 'N',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: true,
      preventDefault: addNodePreventDefault,
    } as unknown as KeyboardEvent);

    expect(addNodePreventDefault).toHaveBeenCalled();
    expect(triggerEditorCommand).toHaveBeenCalledWith('add-node');
  });

  it('logs fullscreen exit failures without breaking later handlers', () => {
    const triggerTheme = vi.fn();
    const onFullscreenExitFailure = vi.fn();
    const handler = createDiagramViewerGlobalKeydownHandler({
      isPresentationMode: false,
      editingEnabled: true,
      isFullscreenActive: () => true,
      exitFullscreen: () => {
        throw new Error('boom');
      },
      onFullscreenExitFailure,
      toggleDebugPanel: vi.fn(),
      openCommandPalette: vi.fn(),
      openSettings: vi.fn(),
      triggerEditorCommand: vi.fn(),
      triggerAi: vi.fn(),
      triggerTheme,
      exitPresentation: vi.fn(),
    });

    handler({
      key: 'Escape',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(onFullscreenExitFailure).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate shortcuts already handled by the active designer', () => {
    const openCommandPalette = vi.fn();
    const handler = createDiagramViewerGlobalKeydownHandler({
      isPresentationMode: false,
      editingEnabled: true,
      isFullscreenActive: () => false,
      exitFullscreen: vi.fn(),
      onFullscreenExitFailure: vi.fn(),
      toggleDebugPanel: vi.fn(),
      openCommandPalette,
      openSettings: vi.fn(),
      triggerEditorCommand: vi.fn(),
      triggerAi: vi.fn(),
      triggerTheme: vi.fn(),
      exitPresentation: vi.fn(),
    });

    handler({
      key: 'k',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: true,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(openCommandPalette).not.toHaveBeenCalled();
  });

  it('consumes editing shortcuts without dispatching mutations when the canvas is locked', () => {
    const triggerEditorCommand = vi.fn();
    const triggerAi = vi.fn();
    const handler = createDiagramViewerGlobalKeydownHandler({
      isPresentationMode: false,
      editingEnabled: false,
      isFullscreenActive: () => false,
      exitFullscreen: vi.fn(),
      onFullscreenExitFailure: vi.fn(),
      toggleDebugPanel: vi.fn(),
      openCommandPalette: vi.fn(),
      openSettings: vi.fn(),
      triggerEditorCommand,
      triggerAi,
      triggerTheme: vi.fn(),
      exitPresentation: vi.fn(),
    });

    for (const event of [
      { key: 'N', ctrlKey: false, metaKey: false, shiftKey: false, altKey: true },
      { key: 'J', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
      { key: 'L', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false },
    ]) {
      const preventDefault = vi.fn();
      handler({ ...event, preventDefault } as unknown as KeyboardEvent);
      expect(preventDefault).toHaveBeenCalledTimes(1);
    }

    expect(triggerEditorCommand).not.toHaveBeenCalled();
    expect(triggerAi).not.toHaveBeenCalled();
  });
});
