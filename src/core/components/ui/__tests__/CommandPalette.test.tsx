// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'common.close': 'Close',
      'designer.commandPalette.searchAria': 'Search commands or diagrams',
      'designer.commandPalette.shortcutsHelp': 'Keyboard shortcuts',
    }[key] ?? key),
  }),
}));

vi.mock('../commandPaletteStorage', () => ({
  bumpCommandUsage: vi.fn(),
  bumpRecentCommandId: vi.fn(),
  readCommandUsage: () => ({}),
}));

import { CommandPalette } from '../CommandPalette';

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

    const search = await screen.findByRole('combobox', { name: 'Search commands or diagrams' });
    expect(search.getAttribute('aria-expanded')).toBe('true');
    expect(search.getAttribute('aria-autocomplete')).toBe('list');
    expect(search.getAttribute('aria-controls')).toBe('command-palette-results');
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
});
