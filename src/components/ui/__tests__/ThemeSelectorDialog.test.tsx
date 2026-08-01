// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ThemeSelectorDialog } from '../ThemeSelectorDialog';

const renderDialog = (overrides: Partial<React.ComponentProps<typeof ThemeSelectorDialog>> = {}) => {
  const props: React.ComponentProps<typeof ThemeSelectorDialog> = {
    activeTab: 'themes',
    closeLabel: '关闭主题设置',
    customLabel: '自定义',
    onClose: vi.fn(),
    onTabChange: vi.fn(),
    presetsLabel: '预设主题',
    settingsLabel: '设置',
    showCustomThemes: true,
    showPresets: true,
    themesLabel: '主题列表',
    title: '主题设置',
    children: <button type="button">主题卡片</button>,
    ...overrides,
  };
  return { ...render(<ThemeSelectorDialog {...props} />), props };
};

describe('ThemeSelectorDialog', () => {
  it('exposes modal and tab semantics with commercial touch targets', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: '主题设置' });
    const close = screen.getByRole('button', { name: '关闭主题设置' });
    const themesTab = screen.getByRole('tab', { name: '主题列表' });

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(close.className).toContain('min-w-[44px]');
    expect(close.className).toContain('min-h-[44px]');
    expect(themesTab.getAttribute('aria-selected')).toBe('true');
    expect(themesTab.className).toContain('min-h-[44px]');
    expect(screen.getByRole('tabpanel', { name: '主题列表' })).toBeTruthy();
  });

  it('supports arrow-key tab navigation', () => {
    const onTabChange = vi.fn();
    renderDialog({ onTabChange });

    fireEvent.keyDown(screen.getByRole('tab', { name: '主题列表' }), { key: 'ArrowRight' });
    expect(onTabChange).toHaveBeenCalledWith('presets');
  });

  it('traps focus, closes on Escape, and restores the trigger focus', () => {
    const trigger = document.createElement('button');
    trigger.textContent = '打开主题';
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { unmount } = renderDialog({ onClose });

    const close = screen.getByRole('button', { name: '关闭主题设置' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
