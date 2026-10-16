// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import { useDiagramViewerCommands } from '../useDiagramViewerCommands';

describe('CommandPalette focus return contract', () => {
  const translate = ((key: string, fallback?: unknown) => (
    typeof fallback === 'string' ? fallback : key
  )) as unknown as TFunction;

  const renderCommands = () => renderHook(() => useDiagramViewerCommands({
    t: translate,
    isFullscreen: false,
    isPresentationMode: false,
    isReadonly: false,
    handleToggleFullscreen: vi.fn(),
    exitFullscreen: vi.fn(),
    handleSelectDiagram: vi.fn(),
    navigate: vi.fn(),
    setMermaidModalVisible: vi.fn(),
    exitPresentation: vi.fn(),
  }));

  it('restores the element that owned focus before the command palette opened', () => {
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0);
        return 1;
      });
    const trigger = document.createElement('button');
    const temporaryFocus = document.createElement('button');
    document.body.append(trigger, temporaryFocus);
    trigger.focus();
    const { result, unmount } = renderCommands();

    act(() => result.current.setIsCommandOpen(true));
    temporaryFocus.focus();
    act(() => result.current.restoreCommandPaletteFocus());

    expect(document.activeElement).toBe(trigger);
    unmount();
    trigger.remove();
    temporaryFocus.remove();
    requestAnimationFrameSpy.mockRestore();
  });

  it('falls back to the persistent toolbar trigger when the captured target is gone', () => {
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0);
        return 1;
      });
    const transientTrigger = document.createElement('button');
    const persistentTrigger = document.createElement('button');
    persistentTrigger.dataset.commandPaletteFocusReturn = '';
    document.body.append(transientTrigger, persistentTrigger);
    transientTrigger.focus();
    const { result, unmount } = renderCommands();

    act(() => result.current.setIsCommandOpen(true));
    transientTrigger.remove();
    act(() => result.current.restoreCommandPaletteFocus());

    expect(document.activeElement).toBe(persistentTrigger);
    unmount();
    persistentTrigger.remove();
    requestAnimationFrameSpy.mockRestore();
  });
});
