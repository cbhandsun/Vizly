// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  beforeEach(() => {
    getConfig.mockClear();
    setConfig.mockReset();
    setConfig.mockResolvedValue(undefined);
  });

  it('uses responsive modal semantics and accessible commercial-size controls', async () => {
    render(<ConfigurationPanel isOpen onClose={vi.fn()} />);

    const dialog = await screen.findByRole('dialog', { name: 'config.title' });
    const close = screen.getByRole('button', { name: 'config.actions.close' });
    const field = await screen.findByRole('spinbutton', { name: 'Min Width' });

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.className).toContain('flex-col sm:flex-row');
    expect(screen.getByTestId('configuration-panel-sidebar').className).not.toContain('max-h-[190px]');
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
    render(<ConfigurationPanel isOpen onClose={vi.fn()} />);
    const field = await screen.findByRole('spinbutton', { name: 'Min Width' });
    await waitFor(() => expect((field as HTMLInputElement).value).toBe('80'));

    fireEvent.change(field, { target: { value: '90' } });
    expect(setConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'config.actions.save' }));

    await waitFor(() => expect(setConfig).toHaveBeenCalledWith('diagram.node.minWidth', 90));
  });

  it('stages layout presets until save and lets cancel discard them', async () => {
    const onClose = vi.fn();
    render(<ConfigurationPanel isOpen onClose={onClose} />);
    await screen.findByRole('spinbutton', { name: 'Min Width' });

    fireEvent.click(screen.getByRole('switch', { name: 'Expert Mode' }));
    fireEvent.click(screen.getByRole('tab', { name: 'config.tabs.layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'config.actions.applyCompact' }));

    expect(setConfig).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'config.actions.save' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('supports arrow-key navigation across expert tabs', async () => {
    render(<ConfigurationPanel isOpen onClose={vi.fn()} />);
    await screen.findByRole('spinbutton', { name: 'Min Width' });
    fireEvent.click(screen.getByRole('switch', { name: 'Expert Mode' }));

    const nodesTab = screen.getByRole('tab', { name: 'config.tabs.nodes' });
    const containersTab = screen.getByRole('tab', { name: 'config.tabs.containers' });
    expect(nodesTab.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(nodesTab, { key: 'ArrowRight' });

    expect(containersTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(containersTab);
  });

  it('prevents duplicate writes while a save is in progress and announces success', async () => {
    let resolveSave: (() => void) | undefined;
    setConfig.mockImplementation(() => new Promise<undefined>(resolve => {
      resolveSave = () => resolve(undefined);
    }));
    render(<ConfigurationPanel isOpen onClose={vi.fn()} />);
    const field = await screen.findByRole('spinbutton', { name: 'Min Width' });
    fireEvent.change(field, { target: { value: '90' } });
    const save = screen.getByRole('button', { name: 'config.actions.save' });

    fireEvent.click(save);
    fireEvent.click(save);

    expect(setConfig).toHaveBeenCalledTimes(1);
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(save.getAttribute('aria-busy')).toBe('true');
    resolveSave?.();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('config.saveSuccess'));
  });

  it('keeps the draft editable and exposes an alert when saving fails', async () => {
    setConfig.mockRejectedValueOnce(new Error('storage unavailable'));
    render(<ConfigurationPanel isOpen onClose={vi.fn()} />);
    const field = await screen.findByRole('spinbutton', { name: 'Min Width' });
    fireEvent.change(field, { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'config.actions.save' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('config.saveError');
    expect((screen.getByRole('button', { name: 'config.actions.save' }) as HTMLButtonElement).disabled).toBe(false);
    expect((field as HTMLInputElement).value).toBe('90');
  });
});
