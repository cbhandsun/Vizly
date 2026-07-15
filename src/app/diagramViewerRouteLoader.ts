import type { ComponentType } from 'react';

type LazyPageModule = { default: ComponentType };

type DiagramViewerRouteLoaderDependencies = {
  loadPage: () => Promise<LazyPageModule>;
  preloadCanvasRuntime: () => Promise<unknown>;
};

export const createDiagramViewerRouteLoader = ({
  loadPage,
  preloadCanvasRuntime,
}: DiagramViewerRouteLoaderDependencies): (() => Promise<LazyPageModule>) => {
  let pagePromise: Promise<LazyPageModule> | undefined;
  let preloadPromise: Promise<unknown> | undefined;

  return () => {
    preloadPromise ??= preloadCanvasRuntime().catch(() => undefined);
    pagePromise ??= loadPage().catch((error) => {
      pagePromise = undefined;
      throw error;
    });
    return pagePromise;
  };
};

const preloadDefaultFlowchartRuntime = async (): Promise<void> => {
  if (import.meta.env.MODE === 'test') return;
  await Promise.all([
    import('@/core/components/diagrams/FlowchartDesigner'),
    import('@/core/plugins/builtInPlugins').then(({ ensureBuiltInPlugins }) => (
      ensureBuiltInPlugins('flowchart')
    )),
  ]);
};

export const loadDiagramViewerRoute = createDiagramViewerRouteLoader({
  loadPage: () => import('./DiagramViewerRoute'),
  preloadCanvasRuntime: preloadDefaultFlowchartRuntime,
});
