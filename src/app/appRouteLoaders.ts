import {
  type BrowserRouteLocation,
  createSingleFlightLoader,
  type LazyPageModule,
  prewarmBrowserLocationRoute,
  type RoutePrewarmLoaders,
} from './appRoutePrewarm';
import { loadDiagramViewerRoute } from './diagramViewerRouteLoader';

export const loadAntdRouteShellOnce = createSingleFlightLoader(() => import('./AntdRouteShell'));

export const loadDocsPreviewPage = createSingleFlightLoader<LazyPageModule>(
  () => import('@/pages/DocsPreview'),
);
export const loadWarehouse3DPage = createSingleFlightLoader<LazyPageModule>(
  () => import('@/pages/Warehouse3DPage'),
);
export const loadStorageConfigPage = createSingleFlightLoader<LazyPageModule>(
  () => import('@/pages/StorageConfigPage'),
);
export const loadDiagramManagementPage = createSingleFlightLoader<LazyPageModule>(
  () => import('@/pages/DiagramManagementPage'),
);
export const loadShareViewPage = createSingleFlightLoader<LazyPageModule>(
  () => import('@/pages/ShareViewPage'),
);
export const loadThemeColorComparisonPage = import.meta.env.DEV
  ? createSingleFlightLoader<LazyPageModule>(() => import('@/pages/ThemeColorComparison'))
  : null;
export const loadThemeSideBySideComparisonPage = import.meta.env.DEV
  ? createSingleFlightLoader<LazyPageModule>(() => import('@/pages/ThemeSideBySideComparison'))
  : null;
export const loadUnifiedDesignerTestPage = import.meta.env.DEV
  ? createSingleFlightLoader<LazyPageModule>(() => import('@/pages/UnifiedDesignerTestPage'))
  : null;

const prewarmWithAntdShell = (loadPage: () => Promise<LazyPageModule>) => () =>
  Promise.all([loadAntdRouteShellOnce(), loadPage()]);

const defaultAppRoutePrewarmLoaders: RoutePrewarmLoaders = {
  docs: loadDocsPreviewPage,
  'warehouse-3d': loadWarehouse3DPage,
  'storage-config': prewarmWithAntdShell(loadStorageConfigPage),
  shared: prewarmWithAntdShell(loadShareViewPage),
  manage: prewarmWithAntdShell(loadDiagramManagementPage),
  diagram: prewarmWithAntdShell(loadDiagramViewerRoute),
  ...(loadThemeColorComparisonPage
    ? { 'theme-colors': prewarmWithAntdShell(loadThemeColorComparisonPage) }
    : {}),
  ...(loadThemeSideBySideComparisonPage
    ? { 'theme-side-by-side': prewarmWithAntdShell(loadThemeSideBySideComparisonPage) }
    : {}),
  ...(loadUnifiedDesignerTestPage
    ? { 'unified-test': prewarmWithAntdShell(loadUnifiedDesignerTestPage) }
    : {}),
};

export const prewarmAppRouteForLocation = (
  location: BrowserRouteLocation | null | undefined,
): Promise<boolean> => prewarmBrowserLocationRoute(location, {
  routeLoaders: defaultAppRoutePrewarmLoaders,
});
