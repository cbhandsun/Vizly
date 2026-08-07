// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const breakpointState = vi.hoisted(() => ({ md: false }));
const commandOpenState = vi.hoisted(() => ({ setOpen: vi.fn() }));

vi.mock('antd', () => ({
  Grid: {
    useBreakpoint: () => breakpointState,
  },
  Popover: ({
    children,
    content,
    open = false,
    onOpenChange,
    afterOpenChange,
  }: {
    children: React.ReactNode;
    content?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    afterOpenChange?: (open: boolean) => void;
  }) => (
    <>
      <div
        onClick={() => {
          const nextOpen = !open;
          onOpenChange?.(nextOpen);
          window.setTimeout(() => afterOpenChange?.(nextOpen), 0);
        }}
      >
        {children}
      </div>
      {open ? content : null}
    </>
  ),
  Select: ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) => <select aria-label={ariaLabel} />,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock('../../ExportTools', () => ({
  default: ({
    showControls,
    variant,
    commercialTouchTarget,
  }: {
    showControls?: boolean;
    variant?: string;
    commercialTouchTarget?: boolean;
  }) => (
    <button
      type="button"
      data-testid="export-tools"
      data-show-controls={String(showControls)}
      data-variant={variant}
      data-commercial-touch-target={String(commercialTouchTarget)}
    >
      export-tools
    </button>
  ),
}));

vi.mock('../DiagramTitleEditor', () => ({
  DiagramTitleEditor: ({ commercialTouchTarget }: { commercialTouchTarget?: boolean }) => (
    <button
      type="button"
      data-testid="rename-title"
      data-commercial-touch-target={String(commercialTouchTarget)}
    >
      rename-title
    </button>
  ),
}));

vi.mock('../EnhancedThemeSelector', () => ({
  EnhancedThemeSelector: ({ variant, borderless }: { variant?: string; borderless?: boolean }) => (
    <div
      data-testid="theme-selector"
      data-variant={variant}
      data-borderless={String(borderless)}
    />
  ),
}));

vi.mock('../../shared/LanguageSwitcher', () => ({
  LanguageSwitcher: ({ ariaLabel }: { ariaLabel?: string }) => (
    <select data-testid="language-switcher" aria-label={ariaLabel} />
  ),
}));

vi.mock('../../auth/AuthStatus', () => ({
  AuthStatusCompact: ({ commercialTouchTarget }: { commercialTouchTarget?: boolean }) => (
    <div
      data-testid="auth-status"
      data-commercial-touch-target={String(commercialTouchTarget)}
    />
  ),
}));

import { ModernTopToolbar } from '../ModernTopToolbar';

const renderToolbar = () => render(
  <ModernTopToolbar
    diagramId="diagram-1"
    title="Untitled flowchart"
    onRenameDiagram={async () => undefined}
    edgeMode="native"
    onEdgeModeChange={() => undefined}
    leftChildren={<input aria-label="筛选图表" />}
    centerChildren={<button type="button">center</button>}
    setIsCommandOpen={commandOpenState.setOpen}
  />,
);

describe('ModernTopToolbar responsive layout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    commandOpenState.setOpen.mockClear();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  it('moves the main canvas tools to a second row on mobile', () => {
    breakpointState.md = false;
    const { container } = renderToolbar();
    const centerPortal = container.querySelector('#vizly-plugin-center-island-portal');
    const centerSection = centerPortal?.parentElement?.parentElement?.parentElement;

    expect(centerSection?.className).toContain('absolute');
    expect(centerSection?.className).toContain('top-[48px]');
    expect(screen.queryByTestId('export-tools')).toBeNull();
    expect(screen.queryByTestId('theme-selector')).toBeNull();
    expect(screen.getByRole('button', { name: 'rename-title' })).toBeTruthy();
    expect(screen.getByTestId('rename-title').getAttribute('data-commercial-touch-target')).toBe('true');
    expect(screen.getByTestId('auth-status').getAttribute('data-commercial-touch-target')).toBe('true');
    expect(screen.queryByRole('link')).toBeNull();
    const diagramSwitcher = screen.getByRole('button', { name: '切换图表：Untitled flowchart' });
    expect(diagramSwitcher.className).toContain('h-[44px]');
    expect(diagramSwitcher.style.minHeight).toBe('var(--commercial-touch-target, 44px)');
    const systemActions = screen.getByRole('button', { name: '系统操作' });
    expect(systemActions.className).toContain('min-w-[44px]');
    expect(systemActions.className).toContain('min-h-[44px]');
    expect(systemActions.style.width).toBe('var(--commercial-touch-target, 44px)');
    expect(systemActions.style.minHeight).toBe('var(--commercial-touch-target, 44px)');
    const leftIsland = container.querySelector('[data-toolbar-left-island]');
    expect(leftIsland?.className).toContain('min-w-0');
    expect(leftIsland?.className).not.toContain('shrink-0');
    expect(screen.queryByRole('button', { name: '打开命令搜索' })).toBeNull();
  });

  it('keeps the main canvas tools inline on desktop', () => {
    breakpointState.md = true;
    const { container } = renderToolbar();
    const centerPortal = container.querySelector('#vizly-plugin-center-island-portal');
    const centerSection = centerPortal?.parentElement?.parentElement?.parentElement;

    expect(centerSection?.className).not.toContain('absolute');
    expect(centerSection?.className).toContain('flex-1');
    expect(screen.getByTestId('export-tools').getAttribute('data-show-controls')).toBe('true');
    expect(screen.getByTestId('theme-selector').getAttribute('data-variant')).toBe('icon');
    expect(screen.getByTestId('auth-status').getAttribute('data-commercial-touch-target')).toBe('false');
    expect(screen.getByRole('link')).toBeTruthy();
  });

  it('exposes diagram switching and command search as keyboard-operable controls', async () => {
    breakpointState.md = true;
    renderToolbar();

    const diagramSwitcher = screen.getByRole('button', { name: '切换图表：Untitled flowchart' });
    expect(diagramSwitcher.getAttribute('aria-haspopup')).toBe('dialog');
    expect(diagramSwitcher.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog', { name: '切换图表：Untitled flowchart' })).toBeNull();
    fireEvent.click(diagramSwitcher);
    expect(diagramSwitcher.getAttribute('aria-expanded')).toBe('true');
    expect(await screen.findByRole('dialog', { name: '切换图表：Untitled flowchart' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '筛选图表' })).toBeTruthy();

    const commandSearch = screen.getByRole('button', { name: '打开命令搜索' });
    expect(commandSearch.getAttribute('aria-haspopup')).toBe('dialog');
    expect(commandSearch.getAttribute('aria-keyshortcuts')).toBe('Control+K');
    fireEvent.click(commandSearch);
    expect(commandOpenState.setOpen).toHaveBeenCalledWith(true);
  });

  it('moves focus into system settings and restores it after Escape', async () => {
    breakpointState.md = false;
    renderToolbar();

    const trigger = screen.getByRole('button', { name: '系统操作' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toMatch(/^toolbar-system-settings-/);
    expect(screen.queryByRole('dialog', { name: '系统操作' })).toBeNull();

    fireEvent.click(trigger);

    expect(await screen.findByRole('dialog', { name: '系统操作' })).toBeTruthy();
    expect(screen.getByText('文件操作')).toBeTruthy();
    const exportTools = screen.getByTestId('export-tools');
    expect(exportTools.getAttribute('data-variant')).toBe('inline');
    expect(exportTools.getAttribute('data-commercial-touch-target')).toBe('true');
    expect(screen.getByTestId('theme-selector').getAttribute('data-variant')).toBe('default');
    expect(screen.getByTestId('theme-selector').getAttribute('data-borderless')).toBe('true');
    expect(screen.getByRole('combobox', { name: '连线模式' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '语言 / Language' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '工作台' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(exportTools));

    const workspaceButton = screen.getByRole('button', { name: '工作台' });
    workspaceButton.focus();
    fireEvent.keyDown(workspaceButton, { key: 'Tab' });
    expect(document.activeElement).toBe(exportTools);

    exportTools.focus();
    fireEvent.keyDown(exportTools, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(workspaceButton);

    fireEvent.keyDown(exportTools, { key: 'Escape' });
    await waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger);
    });
  });
});
