// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'common.close': 'Close',
      'designer.commandPalette.searchAria': 'Search commands or diagrams',
      'designer.commandPalette.clearSearch': 'Clear search',
      'designer.commandPalette.noResults': 'No matching commands or diagrams',
      'designer.commandPalette.resultsStatus': 'Matching commands or diagrams',
      'designer.commandPalette.shortcutsHelp': 'Keyboard shortcuts',
    }[key] ?? key),
  }),
}));

vi.mock('../commandPaletteStorage', () => ({
  bumpCommandUsage: vi.fn(),
  bumpRecentCommandId: vi.fn(),
  readCommandUsage: () => ({}),
  readRecentCommandIds: () => [],
}));

import { CommandPalette } from '../CommandPalette';
import { useDiagramViewerCommands } from '../../../../components/useDiagramViewerCommands';

describe('CommandPalette commercial interaction contract', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('exposes combobox state and touch-sized close, command, and help actions', async () => {
    const onClose = vi.fn();

    render(
      <CommandPalette
        open
        onClose={onClose}
        items={[
          { id: 'op:test', group: 'actions', title: 'Run test', onSelect: vi.fn() },
          { id: 'op:shortcuts', group: 'actions', title: 'Show shortcuts', onSelect: vi.fn() },
        ]}
      />,
    );

    expect(await screen.findByRole('dialog', { name: 'Search commands or diagrams' })).toBeTruthy();
    const dialog = screen.getByRole('dialog', { name: 'Search commands or diagrams' });
    expect(dialog.closest('.ant-modal-wrap')?.getAttribute('style')).toContain('z-index: 2200');
    expect(dialog.querySelector('.command-palette-surface')).toBeTruthy();
    expect(dialog.querySelector('.command-palette-list')).toBeTruthy();
    const search = await screen.findByRole('combobox', { name: 'Search commands or diagrams' });
    expect(search.getAttribute('aria-expanded')).toBe('true');
    expect(search.getAttribute('aria-autocomplete')).toBe('list');
    expect(search.getAttribute('aria-controls')).toBe('command-palette-results');
    expect(search.getAttribute('aria-keyshortcuts')).toBe(
      'ArrowDown ArrowUp Home End Enter Control+Enter Meta+Enter Escape ?',
    );
    expect(search.style.minWidth).toBe('0px');
    expect(search.style.flex).toBe('1 1 auto');
    expect(search.style.minHeight).toBe('var(--commercial-touch-target, 44px)');

    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.style.width).toBe('var(--commercial-touch-target, 44px)');
    expect(close.style.height).toBe('var(--commercial-touch-target, 44px)');

    const command = screen.getByRole('option', { name: 'Run test' });
    expect(command.style.minHeight).toBe('var(--commercial-touch-target, 44px)');

    const help = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    expect(help.style.minHeight).toBe('var(--commercial-touch-target, 44px)');

    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows locked commands as disabled and skips them during keyboard execution', async () => {
    const lockedAction = vi.fn();
    const viewAction = vi.fn();

    render(
      <CommandPalette
        open
        onClose={vi.fn()}
        items={[
          {
            id: 'op:locked',
            group: 'actions',
            title: 'Clear canvas',
            description: 'Canvas locked · Unlock to edit',
            disabled: true,
            onSelect: lockedAction,
          },
          { id: 'op:view', group: 'actions', title: 'Fit view', onSelect: viewAction },
        ]}
      />,
    );

    const locked = await screen.findByRole('option', { name: /Clear canvas/ });
    expect((locked as HTMLButtonElement).disabled).toBe(true);
    expect(locked.getAttribute('aria-selected')).toBe('false');

    const search = screen.getByRole('combobox', { name: 'Search commands or diagrams' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(lockedAction).not.toHaveBeenCalled();
    expect(viewAction).toHaveBeenCalledTimes(1);
  });

  it('keeps disabled matches visible without announcing a false empty result', async () => {
    render(
      <CommandPalette
        open
        onClose={vi.fn()}
        items={[
          {
            id: 'op:locked',
            group: 'actions',
            title: 'Clear canvas',
            description: 'Canvas locked · Unlock to edit',
            disabled: true,
            onSelect: vi.fn(),
          },
        ]}
      />,
    );

    expect(await screen.findByRole('option', { name: /Clear canvas/ })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Matching commands or diagrams');
    expect(screen.queryByText('No matching commands or diagrams')).toBeNull();
    expect(
      screen.getByRole('combobox', { name: 'Search commands or diagrams' }).getAttribute('aria-activedescendant'),
    ).toBeNull();
  });

  it('supports circular arrow navigation plus Home and End', async () => {
    render(
      <CommandPalette
        open
        onClose={vi.fn()}
        items={[
          { id: 'op:first', group: 'actions', title: 'First action', onSelect: vi.fn() },
          { id: 'op:second', group: 'actions', title: 'Second action', onSelect: vi.fn() },
          { id: 'op:third', group: 'actions', title: 'Third action', onSelect: vi.fn() },
        ]}
      />,
    );

    const search = await screen.findByRole('combobox', { name: 'Search commands or diagrams' });
    expect(search.getAttribute('aria-activedescendant')).toBe('command-palette-option-op:first');

    fireEvent.keyDown(search, { key: 'ArrowUp' });
    expect(search.getAttribute('aria-activedescendant')).toBe('command-palette-option-op:third');
    fireEvent.keyDown(search, { key: 'Home' });
    expect(search.getAttribute('aria-activedescendant')).toBe('command-palette-option-op:first');
    fireEvent.keyDown(search, { key: 'End' });
    expect(search.getAttribute('aria-activedescendant')).toBe('command-palette-option-op:third');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(search.getAttribute('aria-activedescendant')).toBe('command-palette-option-op:first');
  });

  it('keeps the first keyboard option active until the pointer actually moves', async () => {
    const firstAction = vi.fn();
    const secondAction = vi.fn();
    render(
      <CommandPalette
        open
        onClose={vi.fn()}
        items={[
          { id: 'op:first', group: 'actions', title: 'First action', onSelect: firstAction },
          { id: 'op:second', group: 'actions', title: 'Second action', onSelect: secondAction },
        ]}
      />,
    );

    const search = await screen.findByRole('combobox', { name: 'Search commands or diagrams' });
    const second = screen.getByRole('option', { name: 'Second action' });

    fireEvent.mouseEnter(second);
    expect(search.getAttribute('aria-activedescendant')).toBe('command-palette-option-op:first');

    fireEvent.pointerMove(second);
    expect(search.getAttribute('aria-activedescendant')).toBe('command-palette-option-op:second');

    fireEvent.keyDown(search, { key: 'Enter' });
    expect(firstAction).not.toHaveBeenCalled();
    expect(secondAction).toHaveBeenCalledTimes(1);
  });

  it('announces result changes and clears an empty search without moving focus', async () => {
    render(
      <CommandPalette
        open
        onClose={vi.fn()}
        items={[{ id: 'op:test', group: 'actions', title: 'Run test', onSelect: vi.fn() }]}
      />,
    );

    const search = await screen.findByRole('combobox', { name: 'Search commands or diagrams' });
    fireEvent.change(search, { target: { value: 'missing' } });

    expect(screen.getByRole('status').textContent).toBe('No matching commands or diagrams');
    const clear = screen.getByRole('button', { name: 'Clear search' });
    expect(clear.classList.contains('command-palette-clear')).toBe(true);
    expect(clear.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(clear);

    expect((search as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(search);
    expect(screen.getByRole('status').textContent).toBe('Matching commands or diagrams');
  });

  it('restores focus only for dismissals, not command execution', async () => {
    const onClose = vi.fn();
    const onDismiss = vi.fn();
    const onSelect = vi.fn();
    render(
      <CommandPalette
        open
        onClose={onClose}
        onDismiss={onDismiss}
        items={[{ id: 'op:test', group: 'actions', title: 'Run test', onSelect }]}
      />,
    );

    const search = await screen.findByRole('combobox', { name: 'Search commands or diagrams' });
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('option', { name: 'Run test' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Control', { ctrlKey: true }],
    ['Meta', { metaKey: true }],
  ] as const)('runs the secondary action with %s+Enter', async (_modifier, keyboardState) => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const onAltSelect = vi.fn();
    render(
      <CommandPalette
        open
        onClose={onClose}
        items={[{
          id: 'op:test',
          group: 'actions',
          title: 'Run test',
          onSelect,
          onAltSelect,
        }]}
      />,
    );

    const search = await screen.findByRole('combobox', { name: 'Search commands or diagrams' });
    fireEvent.keyDown(search, { key: 'Enter', ...keyboardState });

    expect(onAltSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('runs the shortcuts command from the declared question-mark shortcut', async () => {
    const onClose = vi.fn();
    const showShortcuts = vi.fn();
    render(
      <CommandPalette
        open
        onClose={onClose}
        items={[
          { id: 'op:test', group: 'actions', title: 'Run test', onSelect: vi.fn() },
          { id: 'op:shortcuts', group: 'actions', title: 'Show shortcuts', onSelect: showShortcuts },
        ]}
      />,
    );

    const search = await screen.findByRole('combobox', { name: 'Search commands or diagrams' });
    fireEvent.keyDown(search, { key: '?' });

    expect(showShortcuts).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

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
