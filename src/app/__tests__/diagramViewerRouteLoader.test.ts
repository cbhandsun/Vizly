import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createDiagramViewerRouteLoader } from '../diagramViewerRouteLoader';

describe('createDiagramViewerRouteLoader', () => {
  it('starts the page and canvas runtime concurrently and single-flights both', async () => {
    let resolvePage!: (value: { default: ComponentType }) => void;
    let resolveCanvas!: () => void;
    const loadPage = vi.fn(() => new Promise<{ default: ComponentType }>((resolve) => {
      resolvePage = resolve;
    }));
    const preloadCanvasRuntime = vi.fn(() => new Promise<void>((resolve) => {
      resolveCanvas = resolve;
    }));
    const load = createDiagramViewerRouteLoader({ loadPage, preloadCanvasRuntime });

    const first = load();
    const second = load();

    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(preloadCanvasRuntime).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);

    const Page = () => null;
    resolvePage({ default: Page });
    resolveCanvas();
    await expect(first).resolves.toEqual({ default: Page });
  });

  it('does not block the page when speculative canvas preloading fails', async () => {
    const Page = () => null;
    const load = createDiagramViewerRouteLoader({
      loadPage: vi.fn(async () => ({ default: Page })),
      preloadCanvasRuntime: vi.fn(async () => {
        throw new Error('preload failed');
      }),
    });

    await expect(load()).resolves.toEqual({ default: Page });
  });

  it('loads the route without assuming a default diagram runtime', async () => {
    const Page = () => null;
    const loadPage = vi.fn(async () => ({ default: Page }));
    const load = createDiagramViewerRouteLoader({ loadPage });

    await expect(load()).resolves.toEqual({ default: Page });
    expect(loadPage).toHaveBeenCalledTimes(1);
  });
});
