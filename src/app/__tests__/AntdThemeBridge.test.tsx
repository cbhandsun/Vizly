// @ts-nocheck
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { Theme } from '@/core';
import AntdThemeBridge from '../AntdThemeBridge';

type ThemeManagerStub = {
  getCurrentTheme: () => Theme | null;
  addThemeChangeListener: (cb: (t: Theme) => void) => () => void;
};

const makeTheme = (mode: 'light' | 'dark', primary: string, neutralBg: string, neutralText: string, neutralBorder: string): Theme => {
  return {
    id: mode,
    name: mode,
    mode,
    palette: {
      primary: { main: primary, light: primary, dark: primary, contrast: '#fff', border: primary, background: neutralBg, text: neutralText, shadow: 'rgba(0,0,0,0.1)' },
      secondary: { main: primary, light: primary, dark: primary, contrast: '#fff', border: primary, background: neutralBg, text: neutralText, shadow: 'rgba(0,0,0,0.1)' },
      success: { main: '#10b981', light: '#10b981', dark: '#10b981', contrast: '#fff', border: '#10b981', background: neutralBg, text: neutralText, shadow: 'rgba(0,0,0,0.1)' },
      warning: { main: '#f59e0b', light: '#f59e0b', dark: '#f59e0b', contrast: '#fff', border: '#f59e0b', background: neutralBg, text: neutralText, shadow: 'rgba(0,0,0,0.1)' },
      error: { main: '#ef4444', light: '#ef4444', dark: '#ef4444', contrast: '#fff', border: '#ef4444', background: neutralBg, text: neutralText, shadow: 'rgba(0,0,0,0.1)' },
      info: { main: '#3b82f6', light: '#3b82f6', dark: '#3b82f6', contrast: '#fff', border: '#3b82f6', background: neutralBg, text: neutralText, shadow: 'rgba(0,0,0,0.1)' },
      neutral: { main: '#8c8c8c', light: '#d9d9d9', dark: '#262626', contrast: '#fff', border: neutralBorder, background: neutralBg, text: neutralText, shadow: 'rgba(0,0,0,0.1)' }
    },
    typography: {
      fontFamily: { sans: ['Inter', 'system-ui'], mono: ['ui-monospace'] },
      fontSize: { xs: 10, sm: 12, md: 14, lg: 16, xl: 18, xxl: 20 },
      fontWeight: { light: 300, normal: 400, medium: 500, semibold: 600, bold: 700 },
      lineHeight: { tight: 1.2, normal: 1.5, relaxed: 1.7 }
    },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
    borderRadius: { none: 0, sm: 4, md: 8, lg: 12, xl: 16, full: 999 },
    shadow: { none: 'none', sm: '0 1px 2px rgba(0,0,0,0.1)', md: '0 4px 8px rgba(0,0,0,0.1)', lg: '0 8px 16px rgba(0,0,0,0.1)', xl: '0 12px 24px rgba(0,0,0,0.1)', inner: 'inset 0 1px 2px rgba(0,0,0,0.06)' },
    animation: { duration: { fast: 120, normal: 200, slow: 320 }, easing: { linear: 'linear', ease: 'ease', easeIn: 'ease-in', easeOut: 'ease-out', easeInOut: 'ease-in-out' } },
    diagram: {
      domains: {},
      edges: { default: { main: primary, light: primary, dark: primary, contrast: '#fff', border: primary, background: neutralBg, text: neutralText, shadow: 'rgba(0,0,0,0.1)' }, primary: { main: primary, light: primary, dark: primary, contrast: '#fff', border: primary, background: neutralBg, text: neutralText, shadow: 'rgba(0,0,0,0.1)' }, secondary: { main: primary, light: primary, dark: primary, contrast: '#fff', border: primary, background: neutralBg, text: neutralText, shadow: 'rgba(0,0,0,0.1)' }, dashed: { main: primary, light: primary, dark: primary, contrast: '#fff', border: primary, background: neutralBg, text: neutralText, shadow: 'rgba(0,0,0,0.1)' } },
      canvas: { background: neutralBg, grid: { color: neutralBorder, size: 10, opacity: 0.2 } },
      nodes: { default: { main: primary, light: primary, dark: primary, contrast: '#fff', border: primary, background: neutralBg, text: neutralText, shadow: 'rgba(0,0,0,0.1)' }, selected: { main: primary, light: primary, dark: primary, contrast: '#fff', border: primary, background: neutralBg, text: neutralText, shadow: 'rgba(0,0,0,0.1)' }, hover: { main: primary, light: primary, dark: primary, contrast: '#fff', border: primary, background: neutralBg, text: neutralText, shadow: 'rgba(0,0,0,0.1)' } }
    }
  };
};

let themeChangeCb: ((t: Theme) => void) | null = null;
let currentTheme: Theme = makeTheme('light', '#6366f1', '#fafafa', '#111827', '#e5e7eb');
const integrationStub = {
  getThemeManager: () => ({
    getCurrentTheme: () => currentTheme,
    addThemeChangeListener: (cb: (t: Theme) => void) => {
      themeChangeCb = cb;
      return () => { themeChangeCb = null; };
    }
  })
};

vi.mock('@/core', () => {
  return {
    AntdApiBridge: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useConfigIntegration: () => [
      {
        integration: {
          getThemeManager: () => integrationStub.getThemeManager()
        },
        isReady: true,
        isLoading: false,
        error: null,
        status: {
          layeredConfigReady: true,
          themeSystemReady: true,
          validationReady: true,
          performanceOptimizerReady: true,
          migrationComplete: true
        }
      },
      {}
    ]
  };
});

describe('AntdThemeBridge', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    themeChangeCb = null;
    currentTheme = makeTheme('light', '#6366f1', '#fafafa', '#111827', '#e5e7eb');
  });

  it('renders children and applies CSS variables from theme', () => {
    render(
      <AntdThemeBridge>
        <div data-testid="child">ok</div>
      </AntdThemeBridge>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--color-primary-500')).toBe('#6366f1');
    expect(document.documentElement.style.getPropertyValue('--bg-app')).toBe('#fafafa');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('updates variables on theme change', () => {
    render(
      <AntdThemeBridge>
        <div data-testid="child">ok</div>
      </AntdThemeBridge>
    );

    const dark = makeTheme('dark', '#177ddc', '#1f1f1f', '#f0f0f0', '#434343');

    act(() => {
      currentTheme = dark;
      themeChangeCb?.(dark);
    });

    expect(document.documentElement.style.getPropertyValue('--color-primary-500')).toBe('#177ddc');
    expect(document.documentElement.style.getPropertyValue('--bg-app')).toBe('#1f1f1f');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});
