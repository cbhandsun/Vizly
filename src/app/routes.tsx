
import React, { Suspense } from 'react';
import { useLocation } from 'react-router-dom';
type LazyPageModule = { default: React.ComponentType };

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

const DiagramViewerRoute = withAntdRoute(() => import('./DiagramViewerRoute'));
const ThemeColorComparison = withAntdRoute(() => import('@/pages/ThemeColorComparison'));
const ThemeSideBySideComparison = withAntdRoute(() => import('@/pages/ThemeSideBySideComparison'));
const DocsPreview = withAntdRoute(() => import('@/pages/DocsPreview'));
const Warehouse3DPage = withAntdRoute(() => import('@/pages/Warehouse3DPage'));
const StorageConfigPage = withAntdRoute(() => import('@/pages/StorageConfigPage'));
const DiagramManagementPage = withAntdRoute(() => import('@/pages/DiagramManagementPage'));
const ShareViewPage = withAntdRoute(() => import('@/pages/ShareViewPage'));
const UnifiedDesignerTestPage = withAntdRoute(() => import('@/pages/UnifiedDesignerTestPage'));

const renderRoute = (fallback: string, RouteComponent: React.ComponentType) => (
  <Suspense fallback={<div style={{ padding: 16 }}>{fallback}</div>}>
    <RouteComponent />
  </Suspense>
);

const AppRoutes = () => {
  // 根据路径或查询参数决定显示哪个组件
  const location = useLocation();
  const urlParams = new URLSearchParams(location.search || window.location.search);
  const testMode = urlParams.get('test');
  
  // 兼容 HashRouter 和 直接输入的 pathname
  // 如果 HashRouter 有明确的目标且不是单纯的根路径，优先使用它
  let path = location.pathname;
  if (path === '/' && window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
    // 只有在没有 diagram 参数且没有特定的 test mode 的情况才 fallback 到 window.location.pathname
    if (!urlParams.has('diagram') && !testMode) {
      path = window.location.pathname;
    }
  }

  // 如果URL参数包含test=colors，显示主题颜色对比测试页面
  if (testMode === 'colors') {
    return renderRoute('加载主题对比页面...', ThemeColorComparison);
  }

  if (testMode === 'sidebyside') {
    return renderRoute('加载并排对比页面...', ThemeSideBySideComparison);
  }

  if (path.startsWith('/docs') || testMode === 'docs') {
    return renderRoute('加载文档预览页面...', DocsPreview);
  }

  if (path.startsWith('/warehouse-3d') || testMode === '3d') {
    return renderRoute('Loading 3D Warehouse...', Warehouse3DPage);
  }

  if (path.startsWith('/storage-config')) {
    return renderRoute('加载存储配置...', StorageConfigPage);
  }

  if (path.startsWith('/shared')) {
    return renderRoute('加载分享页面...', ShareViewPage);
  }

  const isHomeEmpty = (path === '/' || path === '') && !urlParams.has('diagram') && !testMode;

  if (path.startsWith('/manage') || isHomeEmpty) {
    return renderRoute('加载图表管理...', DiagramManagementPage);
  }

  if (path.startsWith('/unified-test') || testMode === 'unified') {
    return renderRoute('加载统一外壳测试页...', UnifiedDesignerTestPage);
  }

  // 默认显示正常的图表查看器
  return renderRoute('加载图表...', DiagramViewerRoute);
};

export default AppRoutes;
