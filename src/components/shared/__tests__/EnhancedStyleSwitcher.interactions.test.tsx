// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { presetMock, setPresetMock } = vi.hoisted(() => {
  const edge = {
    color: '#2563eb',
    width: 2,
    arrow: { color: '#2563eb', type: 'arrow' as const },
  };
  return {
    presetMock: {
      name: 'demo',
      label: 'Demo',
      category: 'professional' as const,
      description: 'Commercial diagram style',
      edges: {
        main: edge,
        status: edge,
        support: edge,
        dependency: edge,
        data: edge,
        external: edge,
      },
      node: {
        borderStyle: 'solid' as const,
        borderWidth: 2,
        radius: 8,
        shadow: 'soft' as const,
        paddingScale: 1,
        backgroundPolicy: 'white' as const,
      },
      subdomain: {
        borderStyle: 'solid' as const,
        borderWidth: 1,
        radius: 8,
        bgAlpha: 0.1,
      },
      domain: {
        radius: 12,
        bgAlpha: 0.1,
        sideSafeGap: 16,
        bottomSafeGap: 16,
        titleBarHeight: 32,
      },
    },
    setPresetMock: vi.fn(),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/core/hooks/useDiagramStylePreset_v2', () => ({
  useDiagramStylePreset_v2: () => presetMock,
}));

vi.mock('@/core/components/shared/DiagramStyleManager', () => ({
  diagramStyleManager: {
    getCategories: () => ['professional'],
    getCategoryMeta: () => ({ label: 'Professional', description: '' }),
    getPresetsByCategory: () => [presetMock],
    setPreset: setPresetMock,
  },
}));

import { EnhancedStyleSwitcher } from '../EnhancedStyleSwitcher';

describe('EnhancedStyleSwitcher interactions', () => {
  it('opens a named modal, traps focus, closes with Escape, and restores the trigger', async () => {
    render(<EnhancedStyleSwitcher />);
    const trigger = screen.getByRole('button', { name: 'style.switcher.title' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'style.switcher.title' });
    const close = screen.getByRole('button', { name: 'common.close' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(document.activeElement).toBe(close));

    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'style.preset.demo' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'style.switcher.title' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('applies a keyboard-addressable pressed preset without leaving the dialog open', () => {
    setPresetMock.mockClear();
    render(<EnhancedStyleSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: 'style.switcher.title' }));

    const preset = screen.getByRole('button', { name: 'style.preset.demo' });
    expect(preset).toHaveAttribute('aria-pressed', 'true');
    expect(preset).toHaveClass('min-h-[44px]');
    fireEvent.click(preset);

    expect(setPresetMock).toHaveBeenCalledWith('demo');
    expect(screen.queryByRole('dialog', { name: 'style.switcher.title' })).toBeNull();
  });
});
