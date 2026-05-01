// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import { ConfigProvider, App as AntdApp, theme as antdTheme } from 'antd';
import { useConfigIntegration } from '@/core';
import { AntdApiBridge } from '@/core';
import type { Theme } from '@/core';

type BridgeTokens = {
  mode: 'light' | 'dark';
  primary: string;
  info: string;
  success: string;
  warning: string;
  error: string;
  fontFamily: string;
  borderRadius: number;
};

const fallbackTokens: BridgeTokens = {
  mode: 'light',
  primary: '#6366f1',
  info: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  borderRadius: 8
};

const toBridgeTokens = (theme: Theme | null): BridgeTokens => {
  if (!theme) return fallbackTokens;

  const sans = theme.typography?.fontFamily?.sans || [];
  const fontFamily = sans.length > 0 ? sans.join(', ') : fallbackTokens.fontFamily;

  return {
    mode: theme.mode === 'dark' ? 'dark' : 'light',
    primary: theme.palette?.primary?.main || fallbackTokens.primary,
    info: theme.palette?.info?.main || fallbackTokens.info,
    success: theme.palette?.success?.main || fallbackTokens.success,
    warning: theme.palette?.warning?.main || fallbackTokens.warning,
    error: theme.palette?.error?.main || fallbackTokens.error,
    fontFamily,
    borderRadius: 12 // 🚀 Universal V3 Standard
  };
};

const parseHexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const raw = String(hex || '').trim();
  const normalized = raw.startsWith('#') ? raw.slice(1) : raw;
  if (normalized.length === 3) {
    const r = parseInt(normalized[0] + normalized[0], 16);
    const g = parseInt(normalized[1] + normalized[1], 16);
    const b = parseInt(normalized[2] + normalized[2], 16);
    if ([r, g, b].some(n => Number.isNaN(n))) return null;
    return { r, g, b };
  }
  if (normalized.length === 6) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    if ([r, g, b].some(n => Number.isNaN(n))) return null;
    return { r, g, b };
  }
  return null;
};

const toRgba = (hex: string, alpha: number): string => {
  const rgb = parseHexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(1, Math.max(0, alpha))})`;
};

const tokensEqual = (a: BridgeTokens, b: BridgeTokens): boolean => {
  return (
    a.mode === b.mode &&
    a.primary === b.primary &&
    a.info === b.info &&
    a.success === b.success &&
    a.warning === b.warning &&
    a.error === b.error &&
    a.fontFamily === b.fontFamily &&
    a.borderRadius === b.borderRadius
  );
};

const applyCssVariables = (t: BridgeTokens, theme: Theme | null) => {
  try {
    const el = document.documentElement;
    el.style.colorScheme = t.mode;
    el.setAttribute('data-theme', t.mode);
    el.style.setProperty('--color-primary-500', t.primary);
    el.style.setProperty('--color-primary-600', t.primary);
    el.style.setProperty('--color-info', t.info);
    el.style.setProperty('--color-success', t.success);
    el.style.setProperty('--color-warning', t.warning);
    el.style.setProperty('--color-danger', t.error);

    const neutralBg = theme?.palette?.neutral?.background || (t.mode === 'dark' ? '#0f172a' : '#fafafa');
    const neutralText = theme?.palette?.neutral?.text || (t.mode === 'dark' ? '#e5e7eb' : '#0f172a');
    const neutralBorder = theme?.palette?.neutral?.border || (t.mode === 'dark' ? '#334155' : '#e2e8f0');

    el.style.setProperty('--bg-app', neutralBg);
    el.style.setProperty('--bg-surface', neutralBg);
    el.style.setProperty('--bg-surface-translucent', toRgba(neutralBg, t.mode === 'dark' ? 0.7 : 0.6));
    el.style.setProperty('--bg-sidebar', toRgba(neutralBg, t.mode === 'dark' ? 0.7 : 0.65));
    el.style.setProperty('--bg-panel', toRgba(neutralBg, t.mode === 'dark' ? 0.8 : 0.75));

    el.style.setProperty('--menu-bg-light', toRgba(neutralBg, 0.65));
    el.style.setProperty('--menu-bg-dark', toRgba(neutralBg, 0.65));
    el.style.setProperty('--menu-border-light', toRgba(neutralBorder, 0.4));
    el.style.setProperty('--menu-border-dark', toRgba(neutralBorder, 0.25));

    el.style.setProperty('--color-slate-800', neutralText);
    el.style.setProperty('--border-focus', t.primary);
    el.style.setProperty('--menu-item-active-border', t.primary);

    const patternDot = t.mode === 'dark' ? toRgba(neutralBorder, 0.35) : toRgba(neutralBorder, 0.7);
    el.style.setProperty('--bg-pattern', `radial-gradient(${patternDot} 1px, transparent 1px)`);
  } catch { void 0; }
};

export const AntdThemeBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state] = useConfigIntegration({ autoInitialize: true });
  const [tokens, setTokens] = useState<BridgeTokens>(fallbackTokens);

  useEffect(() => {
    const tm = state.integration?.getThemeManager?.();
    if (!tm) return;

    const sync = (nextTheme: Theme | null) => {
      const next = toBridgeTokens(nextTheme);
      setTokens(prev => (tokensEqual(prev, next) ? prev : next));
      applyCssVariables(next, nextTheme);
    };

    sync(tm.getCurrentTheme?.() ?? null);
    const unsubscribe = tm.addThemeChangeListener?.((nextTheme: Theme) => sync(nextTheme ?? null));
    return () => { if (unsubscribe) unsubscribe(); };
  }, [state.integration]);

  const algorithm = useMemo(() => {
    return tokens.mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;
  }, [tokens.mode]);

  const themeConfig = useMemo(() => {
    return {
      algorithm,
      token: {
        fontFamily: tokens.fontFamily,
        colorPrimary: tokens.primary,
        colorInfo: tokens.info,
        colorSuccess: tokens.success,
        colorWarning: tokens.warning,
        colorError: tokens.error,
        borderRadius: tokens.borderRadius,
        // 🚀 V3: 增加组件级的玻璃态与高级投影
        components: {
          Card: {
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            colorBorderSecondary: 'rgba(0,0,0,0.06)'
          },
          Input: {
            colorBgContainer: 'rgba(255, 255, 255, 0.45)',
            colorBorder: 'rgba(0, 0, 0, 0.1)'
          },
          Modal: {
            contentBg: 'rgba(255, 255, 255, 0.72)',
            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.1)'
          }
        }
      }
    } as const;
  }, [algorithm, tokens]);

  return (
    <ConfigProvider theme={themeConfig}>
      <AntdApp><AntdApiBridge>{children}</AntdApiBridge></AntdApp>
    </ConfigProvider>
  );
};

export default AntdThemeBridge;
