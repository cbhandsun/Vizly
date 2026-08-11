// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { FlowchartOnboardingHint } from '../FlowchartOnboardingHint';

const renderHint = (onDismiss = vi.fn()) => render(
  <>
    <button data-command-palette-focus-return type="button">打开命令搜索</button>
    <FlowchartOnboardingHint
      visible
      mod="Ctrl"
      onDismiss={onDismiss}
      onOpenCommandPalette={vi.fn()}
    />
  </>,
);

describe('FlowchartOnboardingHint focus continuity', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh');
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('returns keyboard dismissal focus to the persistent command entry', () => {
    const onDismiss = vi.fn();
    renderHint(onDismiss);

    fireEvent.click(screen.getByRole('button', { name: '不再提示' }), { detail: 0 });

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '打开命令搜索' })).toHaveFocus();
  });

  it('does not move focus after pointer dismissal', () => {
    renderHint();
    const focusTarget = screen.getByRole('button', { name: '打开命令搜索' });
    const focus = vi.spyOn(focusTarget, 'focus');

    fireEvent.click(screen.getByRole('button', { name: '不再提示' }), { detail: 1 });

    expect(focus).not.toHaveBeenCalled();
  });
});
