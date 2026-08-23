
import React, { Suspense } from 'react';
import { useLocation } from 'react-router';
import { coerceSafeStringParam, getQueryOrHashParamFromLocation, type LocationLike, coerceDiagramId } from '@/core/utils/inputBoundary';
import { loadDiagramViewerRoute } from './diagramViewerRouteLoader';
import AppRouteNotFound from './AppRouteNotFound';
import { resolveAppRouteTarget } from './appRouteResolver';

type LazyPageModule = { default: React.ComponentType };

const withoutAntdRoute = (loadPage: () => Promise<LazyPageModule>) => React.lazy(loadPage);

const withAntdRoute = (loadPage: () => Promise<LazyPageModule>) => React.lazy(async () => {
  const [{ default: AntdRouteShell }, { default: Page }] = await Promise.all([
    import('./AntdRouteShell'),
    loadPage(),
  ]);

  return {
    default: () => (
      <AntdRouteShell>
        <Page />
      </AntdRouteShell>
    ),
  };
});

const DiagramViewerRoute = withAntdRoute(loadDiagramViewerRoute);
const ThemeColorComparison = import.meta.env.DEV
  ? withAntdRoute(() => import('@/pages/ThemeColorComparison'))
  : null;
const ThemeSideBySideComparison = import.meta.env.DEV
  ? withAntdRoute(() => import('@/pages/ThemeSideBySideComparison'))
  : null;
// These self-contained routes use native controls and their own theme styles.
// Keeping them outside AntdRouteShell prevents the full Ant Design runtime from
// becoming part of their critical path.
const DocsPreview = withoutAntdRoute(() => import('@/pages/DocsPreview'));
const Warehouse3DPage = withoutAntdRoute(() => import('@/pages/Warehouse3DPage'));
const StorageConfigPage = withAntdRoute(() => import('@/pages/StorageConfigPage'));
const DiagramManagementPage = withAntdRoute(() => import('@/pages/DiagramManagementPage'));
const ShareViewPage = withAntdRoute(() => import('@/pages/ShareViewPage'));
const UnifiedDesignerTestPage = import.meta.env.DEV
  ? withAntdRoute(() => import('@/pages/UnifiedDesignerTestPage'))
  : null;

const renderRoute = (fallback: React.ReactNode, RouteComponent: React.ComponentType) => (
  <Suspense fallback={typeof fallback === 'string' ? <div style={{ padding: 16 }}>{fallback}</div> : fallback}>
    <RouteComponent />
  </Suspense>
);

const allowedTestModes = new Set([
  'docs',
  '3d',
  ...(import.meta.env.DEV ? ['colors', 'sidebyside', 'unified'] : []),
]);

const AppRoutes = () => {
  // 根据路径或查询参数决定显示哪个组件
  const location = useLocation();
  const browserLocation = typeof window === 'undefined' ? null : window.location;
  const testModeRaw = coerceSafeStringParam(
    getQueryOrHashParamFromLocation(location as LocationLike, 'test') ||
    getQueryOrHashParamFromLocation(browserLocation, 'test'),
    '',
    64
  );
  const testMode = allowedTestModes.has(testModeRaw) ? testModeRaw : '';
  const diagramFromRoute = coerceDiagramId(
    getQueryOrHashParamFromLocation(location as LocationLike, 'diagram') ||
    getQueryOrHashParamFromLocation(browserLocation, 'diagram')
  );
  
  // 兼容 HashRouter 和 直接输入的 pathname
  // 如果 HashRouter 有明确的目标且不是单纯的根路径，优先使用它
  let path = location.pathname;
  const browserPathname = browserLocation ? browserLocation.pathname : '';
  if (path === '/' && browserPathname && browserPathname !== '/' && browserPathname !== '/index.html') {
    // 只有在没有 diagram 参数且没有特定的 test mode 的情况才 fallback 到 window.location.pathname
    if (!diagramFromRoute && !testMode) {
      path = browserPathname;
    }
  }

  const routeTarget = resolveAppRouteTarget({
    path,
    diagramId: diagramFromRoute,
    testMode,
    enableDevRoutes: import.meta.env.DEV,
  });

  if (routeTarget === 'theme-colors' && ThemeColorComparison) {
    return renderRoute('加载主题对比页面...', ThemeColorComparison);
  }

  if (routeTarget === 'theme-side-by-side' && ThemeSideBySideComparison) {
    return renderRoute('加载并排对比页面...', ThemeSideBySideComparison);
  }

  if (routeTarget === 'docs') {
    return renderRoute('加载文档预览页面...', DocsPreview);
  }

  if (routeTarget === 'warehouse-3d') {
    return renderRoute('加载 3D 仓储场景...', Warehouse3DPage);
  }

  if (routeTarget === 'storage-config') {
    return renderRoute('加载存储配置...', StorageConfigPage);
  }

  if (routeTarget === 'shared') {
    return renderRoute('加载分享页面...', ShareViewPage);
  }

  if (routeTarget === 'manage') {
    return renderRoute('加载图表管理...', DiagramManagementPage);
  }

  if (UnifiedDesignerTestPage && routeTarget === 'unified-test') {
    return renderRoute('加载统一外壳测试页...', UnifiedDesignerTestPage);
  }

  if (routeTarget === 'diagram') {
    return renderRoute('加载图表...', DiagramViewerRoute);
  }

  return <AppRouteNotFound />;
};

export default AppRoutes;
