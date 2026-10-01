// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeChoiceButton, type ThemePreviewDetails } from '../ThemeChoiceButton';

describe('ThemeChoiceButton', () => {
  const sampleDetails: ThemePreviewDetails = {
    canvasBg: '#ffffff',
    gridColor: 'rgba(0,0,0,0.06)',
    nodeBg: '#ffffff',
    nodeBorder: '#cbd5e1',
    nodeText: '#0f172a',
    edgeColor: '#2563eb',
    accentColor: '#4f46e5',
    mode: 'light',
  };

  it('renders theme choice button with accessible labels and pressed state', () => {
    const handleSelect = vi.fn();
    render(
      <ThemeChoiceButton
        themeId="ocean"
        active={true}
        categoryLabel="系统预设"
        disabled={false}
        gradient="linear-gradient(#fff, #eee)"
        label="海洋主题"
        previewDetails={sampleDetails}
        onSelect={handleSelect}
      />
    );

    const button = screen.getByRole('button', { name: '海洋主题' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('data-theme-id')).toBe('ocean');
    expect(screen.getByText('当前生效')).toBeTruthy();
    expect(screen.getByText('系统预设')).toBeTruthy();
    expect(screen.getByText('Light')).toBeTruthy();

    fireEvent.click(button);
    expect(handleSelect).toHaveBeenCalledTimes(1);
  });

  it('renders color swatches capsule with high-contrast borders', () => {
    render(
      <ThemeChoiceButton
        themeId="dark"
        active={false}
        categoryLabel="基础主题"
        disabled={false}
        gradient="linear-gradient(#141414, #000)"
        label="深色主题"
        previewDetails={{
          ...sampleDetails,
          mode: 'dark',
          canvasBg: '#141414',
          nodeBg: '#1f1f1f',
        }}
        onSelect={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: '深色主题' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('当前生效')).toBeNull();
    expect(screen.getByText('Dark')).toBeTruthy();

    // Verify 4 swatches exist with proper titles
    expect(screen.getByTitle('画布背景')).toBeTruthy();
    expect(screen.getByTitle('节点底色')).toBeTruthy();
    expect(screen.getByTitle('主强调色')).toBeTruthy();
    expect(screen.getByTitle('连线颜色')).toBeTruthy();
  });

  it('handles gradient fallback when previewDetails is not provided', () => {
    render(
      <ThemeChoiceButton
        themeId="fallback"
        active={false}
        categoryLabel="自定义"
        disabled={false}
        gradient="linear-gradient(to right, #123456, #654321)"
        label="自定义备用"
        onSelect={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: '自定义备用' });
    expect(button).toBeTruthy();
    expect(screen.queryByTitle('画布背景')).toBeNull();
  });
});
