import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemePerformanceOptimizer } from '../ThemePerformanceOptimizer';
import type { Theme, ThemePerformanceOptions } from '../types/ThemeTypes';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('@/core/utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

const color = (main: string) => ({
  main,
  light: `${main}11`,
  dark: `${main}22`,
  contrast: '#ffffff',
  border: `${main}33`,
  background: `${main}44`,
  text: '#111111',
  shadow: 'rgba(0, 0, 0, 0.2)',
});

const theme = (id: string, mode: 'light' | 'dark' = 'light'): Theme => ({
  id,
  name: id,
  mode,
  palette: {
    primary: color('#AABBCC'),
    secondary: color('#112233'),
    success: color('#00AA00'),
    warning: color('#ffaa00'),
    error: color('#cc0000'),
    info: color('#0066cc'),
    neutral: color('#999999'),
  },
  typography: {
    fontFamily: { sans: ['Inter', 'Arial'], mono: ['JetBrains Mono'] },
    fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, xxl: 32 },
    fontWeight: { light: 300, normal: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeight: { tight: 1.2, normal: 1.5, relaxed: 1.8 },
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  borderRadius: { none: 0, sm: 2, md: 4, lg: 8, xl: 12, full: 999 },
  shadow: {
    none: 'none',
    sm: '0 1px 2px rgba(0,0,0,0.1)',
    md: '0 2px 4px rgba(0,0,0,0.1)',
    lg: '0 4px 8px rgba(0,0,0,0.1)',
    xl: '0 8px 16px rgba(0,0,0,0.1)',
    inner: 'inset 0 1px 2px rgba(0,0,0,0.1)',
  },
  animation: {
    duration: { fast: 100, normal: 200, slow: 400 },
    easing: {
      linear: 'linear',
      ease: 'ease',
      easeIn: 'ease-in',
      easeOut: 'ease-out',
      easeInOut: 'ease-in-out',
    },
  },
  diagram: {
    domains: { logistics: color('#445566') },
    edges: {
      default: color('#111111'),
      primary: color('#222222'),
      secondary: color('#333333'),
      dashed: color('#444444'),
    },
    nodes: {
      default: color('#555555'),
      selected: color('#666666'),
      hover: color('#777777'),
    },
    canvas: {
      background: '#fafafa',
      grid: { color: '#cccccc', size: 20, opacity: 0.5 },
    },
  },
});

const options = (overrides: Partial<ThemePerformanceOptions> = {}): ThemePerformanceOptions => ({
  cacheThemes: true,
  lazyLoad: false,
  preloadDelay: 0,
  maxCacheSize: 50,
  batchUpdates: true,
  debounceDelay: 1,
  enableTransitions: true,
  transitionDuration: 25,
  preloadThemes: [],
  ...overrides,
});

describe('ThemePerformanceOptimizer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      setTimeout(() => callback(performance.now()), 0);
      return 1;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    document.documentElement.removeAttribute('style');
    delete (window as unknown as { gc?: () => void }).gc;
  });

  it('preloads themes, records cache hits, and exposes cache stats', async () => {
    const optimizer = new ThemePerformanceOptimizer(options({
      preloadThemes: ['bright'],
    }));
    const bright = theme('bright');

    await optimizer.optimizeThemeSwitch(bright);
    const afterFirst = optimizer.getCacheStats();
    expect(afterFirst.size).toBe(1);
    expect(afterFirst.hitRate).toBe(0.5);
    expect(afterFirst.entries[0]).toMatchObject({ key: 'bright-light', accessCount: 2 });

    await optimizer.optimizeThemeSwitch(bright);
    expect(optimizer.getCacheStats()).toMatchObject({
      size: 1,
      hitRate: expect.any(Number),
    });
    expect(optimizer.getCacheStats().hitRate).toBeGreaterThan(0.5);
  });

  it('applies cached CSS variables in a debounced animation frame batch', async () => {
    const optimizer = new ThemePerformanceOptimizer(options());
    const element = document.documentElement;

    await optimizer.preloadTheme(theme('cached'));
    await optimizer.optimizeThemeSwitch(theme('cached'), element);
    await vi.advanceTimersByTimeAsync(1);
    await vi.runOnlyPendingTimersAsync();

    expect(element.style.getPropertyValue('--color-primary-main')).toBe('#aabbcc');
    expect(element.style.getPropertyValue('--font-family')).toBe('Inter, Arial');
    expect(element.style.getPropertyValue('--spacing-md')).toBe('12px');
    expect(element.style.getPropertyValue('--diagram-grid-size')).toBe('20px');
  });

  it('sets transition styles and clears them after the configured duration', async () => {
    const optimizer = new ThemePerformanceOptimizer(options({ batchUpdates: false, transitionDuration: 40 }));
    const element = document.createElement('section');

    await optimizer.optimizeThemeSwitch(theme('transition'), element);
    expect(element.style.transition).toBe('all 40ms ease-in-out');

    await vi.advanceTimersByTimeAsync(40);
    expect(element.style.transition).toBe('');
  });

  it('updates strategy options and skips disabled cache/batch/transition behavior', async () => {
    const optimizer = new ThemePerformanceOptimizer(options());
    const element = document.documentElement;

    optimizer.updateOptions({
      cacheThemes: false,
      batchUpdates: false,
      enableTransitions: false,
      debounceDelay: 5,
    });

    await optimizer.optimizeThemeSwitch(theme('disabled'), element);
    await vi.advanceTimersByTimeAsync(10);

    expect(optimizer.getCacheStats().size).toBe(0);
    expect(element.style.transition).toBe('');
    expect(element.style.getPropertyValue('--color-primary-main')).toBe('');
  });

  it('cleans old cache entries and calls optional gc during memory strategy', async () => {
    const gc = vi.fn();
    (window as unknown as { gc: () => void }).gc = gc;
    const optimizer = new ThemePerformanceOptimizer(options({ batchUpdates: false }));

    for (let i = 0; i < 55; i++) {
      await optimizer.preloadTheme(theme(`theme-${i}`));
    }
    expect(optimizer.getCacheStats().size).toBe(55);

    await optimizer.optimizeThemeSwitch(theme('memory'));

    expect(optimizer.getCacheStats().size).toBeLessThanOrEqual(50);
    expect(gc).toHaveBeenCalledTimes(1);
  });

  it('resets metrics and disposes cached resources', async () => {
    const optimizer = new ThemePerformanceOptimizer(options());
    await optimizer.preloadThemes([theme('one'), theme('two', 'dark')]);
    expect(optimizer.getCacheStats().size).toBe(2);

    optimizer.resetMetrics();
    expect(optimizer.getMetrics()).toMatchObject({
      themeLoadTime: 0,
      cssUpdateTime: 0,
      domUpdateTime: 0,
      totalSwitchTime: 0,
      cacheHitRate: 0,
    });

    optimizer.dispose();
    expect(optimizer.getCacheStats().size).toBe(0);
  });

  it('handles legacy typography and missing diagram fields without crashing', async () => {
    const optimizer = new ThemePerformanceOptimizer(options());
    const legacyTheme = {
      ...theme('legacy'),
      typography: {
        fontFamily: 'System UI',
        fontSize: { md: '16' },
        fontWeight: { normal: false },
        lineHeight: { normal: null },
      },
      diagram: undefined,
    } as unknown as Theme;

    await optimizer.preloadTheme(legacyTheme);
    await optimizer.optimizeThemeSwitch(legacyTheme);
    await vi.advanceTimersByTimeAsync(1);
    await vi.runOnlyPendingTimersAsync();

    expect(document.documentElement.style.getPropertyValue('--font-family')).toBe('System UI');
    expect(document.documentElement.style.getPropertyValue('--font-size-md')).toBe('0px');
    expect(document.documentElement.style.getPropertyValue('--font-weight-normal')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--diagram-grid-size')).toBe('');
  });

  it('warns and continues when an optimization strategy fails', async () => {
    const optimizer = new ThemePerformanceOptimizer(options({
      cacheThemes: true,
      batchUpdates: false,
      enableTransitions: false,
      preloadThemes: ['broken'],
    }));
    const brokenTheme = {
      ...theme('broken'),
      animation: undefined,
    } as unknown as Theme;

    await expect(optimizer.optimizeThemeSwitch(brokenTheme)).resolves.toEqual(expect.objectContaining({
      totalSwitchTime: expect.any(Number),
    }));
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[ThemePerformanceOptimizer] Optimization strategy "preload" failed:',
      expect.objectContaining({
        name: 'TypeError',
      })
    );
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[ThemePerformanceOptimizer] Optimization strategy "cache" failed:',
      expect.objectContaining({
        name: 'TypeError',
      })
    );
  });

  it('covers optional strategy branches without cache, preload lists, custom duration, or gc', async () => {
    const optimizer = new ThemePerformanceOptimizer(options({
      cacheThemes: false,
      batchUpdates: true,
      enableTransitions: true,
      transitionDuration: undefined,
      preloadThemes: undefined,
    }));
    const element = document.createElement('main');

    await optimizer.optimizeThemeSwitch(theme('uncached'), element);

    expect(optimizer.getCacheStats().size).toBe(0);
    expect(document.documentElement.style.getPropertyValue('--color-primary-main')).toBe('');
    expect(element.style.transition).toBe('all 300ms ease-in-out');

    await vi.advanceTimersByTimeAsync(300);
    expect(element.style.transition).toBe('');
  });

  it('normalizes CSS sizes with redundant decimals during preload extraction', async () => {
    const optimizer = new ThemePerformanceOptimizer(options());
    const decimalTheme = {
      ...theme('decimal'),
      shadow: {
        ...theme('decimal').shadow,
        sm: '0 1px 2px rgba(0,0,0,0.1)',
      },
      diagram: {
        ...theme('decimal').diagram,
        canvas: {
          background: '#ffffff',
          grid: { color: '#eeeeee', size: 12.0, opacity: 1 },
        },
      },
    };

    await optimizer.preloadTheme(decimalTheme);
    await optimizer.optimizeThemeSwitch(decimalTheme);
    await vi.advanceTimersByTimeAsync(1);
    await vi.runOnlyPendingTimersAsync();

    expect(document.documentElement.style.getPropertyValue('--diagram-grid-size')).toBe('12px');
  });
});
