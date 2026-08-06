// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const breakpointState = vi.hoisted(() => ({ md: false }));

vi.mock('antd', () => ({
  Grid: {
    useBreakpoint: () => breakpointState,
  },
  Popover: ({ children, content }: { children: React.ReactNode; content?: React.ReactNode }) => (
    <>
      {children}
      {content}
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
  default: ({ showControls }: { showControls?: boolean }) => (
    <div data-testid="export-tools" data-show-controls={String(showControls)} />
  ),
}));

vi.mock('../DiagramTitleEditor', () => ({
  DiagramTitleEditor: () => <button type="button">rename-title</button>,
}));

vi.mock('../EnhancedThemeSelector', () => ({
  EnhancedThemeSelector: () => <div data-testid="theme-selector" />,
}));

vi.mock('../../shared/LanguageSwitcher', () => ({
  LanguageSwitcher: ({ ariaLabel }: { ariaLabel?: string }) => (
    <select data-testid="language-switcher" aria-label={ariaLabel} />
  ),
}));

vi.mock('../../auth/AuthStatus', () => ({
  AuthStatusCompact: () => <div data-testid="auth-status" />,
}));

import { ModernTopToolbar } from '../ModernTopToolbar';

const renderToolbar = () => render(
  <ModernTopToolbar
    diagramId="diagram-1"
    title="Untitled flowchart"
    onRenameDiagram={async () => undefined}
    edgeMode="native"
    onEdgeModeChange={() => undefined}
    centerChildren={<button type="button">center</button>}
  />,
);

describe('ModernTopToolbar responsive layout', () => {
  it('moves the main canvas tools to a second row on mobile', () => {
    breakpointState.md = false;
    const { container } = renderToolbar();
    const centerPortal = container.querySelector('#vizly-plugin-center-island-portal');
    const centerSection = centerPortal?.parentElement?.parentElement?.parentElement;

    expect(centerSection?.className).toContain('absolute');
    expect(centerSection?.className).toContain('top-[48px]');
    expect(screen.getByTestId('export-tools').getAttribute('data-show-controls')).toBe('false');
    expect(screen.getByRole('button', { name: 'rename-title' })).toBeTruthy();
  });

  it('keeps the main canvas tools inline on desktop', () => {
    breakpointState.md = true;
    const { container } = renderToolbar();
    const centerPortal = container.querySelector('#vizly-plugin-center-island-portal');
    const centerSection = centerPortal?.parentElement?.parentElement?.parentElement;

    expect(centerSection?.className).not.toContain('absolute');
    expect(centerSection?.className).toContain('flex-1');
    expect(screen.getByTestId('export-tools').getAttribute('data-show-controls')).toBe('true');
  });

  it('exposes the system settings trigger and its fields to assistive technology', () => {
    breakpointState.md = false;
    renderToolbar();

    const trigger = screen.getByRole('button', { name: '设置：连线模式、语言' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('dialog', { name: '设置：连线模式、语言' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '连线模式' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '语言 / Language' })).toBeTruthy();
  });
});
