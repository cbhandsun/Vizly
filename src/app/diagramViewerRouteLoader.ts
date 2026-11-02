import type { ComponentType } from 'react';
import { prewarmCanvasTheme } from '../main/prewarmCanvasTheme';

type LazyPageModule = { default: ComponentType };

type DiagramViewerRouteLoaderDependencies = {
  loadPage: () => Promise<LazyPageModule>;
  preloadCanvasRuntime?: () => Promise<unknown>;
};

export const createDiagramViewerRouteLoader = ({
  loadPage,
  preloadCanvasRuntime,
}: DiagramViewerRouteLoaderDependencies): (() => Promise<LazyPageModule>) => {
  let pagePromise: Promise<LazyPageModule> | undefined;
  let preloadPromise: Promise<unknown> | undefined;

  return () => {
    if (preloadCanvasRuntime) {
      preloadPromise ??= preloadCanvasRuntime().catch(() => undefined);
    }
    pagePromise ??= loadPage().catch((error) => {
      pagePromise = undefined;
      throw error;
    });
    return pagePromise;
  };
};

export const loadDiagramViewerRoute = createDiagramViewerRouteLoader({
  loadPage: () => import('./DiagramViewerRoute'),
  preloadCanvasRuntime: () => Promise.all([
    import('@vizly/core/react'),
    prewarmCanvasTheme(),
  ]),
});
