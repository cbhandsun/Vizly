// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getConfig = vi.fn(async (key: string) => key === 'diagram.node.minWidth' ? 80 : undefined);
const setConfig = vi.fn(async () => undefined);
const configState = { isReady: true, integration: {}, error: null };
const configActions = { getConfig, setConfig };

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

vi.mock('@/core/hooks/useConfigIntegration', () => ({
  useConfigIntegration: () => [
    configState,
    configActions,
  ],
}));

vi.mock('@/core/strategies/LayoutStrategyManager', () => ({
  LayoutStrategyManager: {
    getShared: () => ({
      getAvailableHierarchyStrategies: () => [{ type: 'DomainVerticalLayout' }],
      getAvailableNodeStrategies: () => [{ type: 'VerticalLayout' }],
      isNodeLayoutExternallySelectable: () => true,
    }),
  },
}));

vi.mock('@/core/config/LayeredConfigManager', () => ({
  LayeredConfigManager: { getInstance: () => ({ get: () => 'DomainVerticalLayout' }) },
}));

import { ConfigurationPanel } from '../ConfigurationPanel';

describe('ConfigurationPanel interactions', () => {
  it('uses responsive modal semantics and accessible commercial-size controls', async () => {
    render(<ConfigurationPanel isOpen onClose={vi.fn()} />);

    const dialog = await screen.findByRole('dialog', { name: 'config.title' });
    const close = screen.getByRole('button', { name: 'config.actions.close' });
    const field = await screen.findByRole('spinbutton', { name: 'Min Width' });

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.className).toContain('flex-col sm:flex-row');
    expect(close.className).toContain('min-w-[44px]');
    expect(field.className).toContain('min-h-[44px]');
  });

  it('discards staged edits on cancel and reloads persisted values when reopened', async () => {
    const onClose = vi.fn();
    const view = render(<ConfigurationPanel isOpen onClose={onClose} />);
    const field = await screen.findByRole('spinbutton', { name: 'Min Width' });
    await waitFor(() => expect((field as HTMLInputElement).value).toBe('80'));

    fireEvent.change(field, { target: { value: '90' } });
    expect((field as HTMLInputElement).value).toBe('90');
    expect(setConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();

    view.rerender(<ConfigurationPanel isOpen={false} onClose={onClose} />);
    view.rerender(<ConfigurationPanel isOpen onClose={onClose} />);
    const reopenedField = await screen.findByRole('spinbutton', { name: 'Min Width' });
    await waitFor(() => expect((reopenedField as HTMLInputElement).value).toBe('80'));
  });

  it('persists staged values only after the explicit save action', async () => {
    setConfig.mockClear();
    render(<ConfigurationPanel isOpen onClose={vi.fn()} />);
    const field = await screen.findByRole('spinbutton', { name: 'Min Width' });
    await waitFor(() => expect((field as HTMLInputElement).value).toBe('80'));

    fireEvent.change(field, { target: { value: '90' } });
    expect(setConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'config.actions.save' }));

    await waitFor(() => expect(setConfig).toHaveBeenCalledWith('diagram.node.minWidth', 90));
  });
});
