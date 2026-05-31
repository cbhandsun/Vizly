
import React, { Suspense } from 'react';
import { useLocation } from 'react-router-dom';
const DiagramViewer = React.lazy(() => import('@/components/DiagramViewer'));
const ThemeColorComparison = React.lazy(() => import('@/pages/ThemeColorComparison'));
const ThemeSideBySideComparison = React.lazy(() => import('@/pages/ThemeSideBySideComparison'));
const DocsPreview = React.lazy(() => import('@/pages/DocsPreview'));
const Warehouse3DPage = React.lazy(() => import('@/pages/Warehouse3DPage'));
const StorageConfigPage = React.lazy(() => import('@/pages/StorageConfigPage'));
const DiagramManagementPage = React.lazy(() => import('@/pages/DiagramManagementPage'));
const ShareViewPage = React.lazy(() => import('@/pages/ShareViewPage'));
const UnifiedDesignerTestPage = React.lazy(() => import('@/pages/UnifiedDesignerTestPage'));

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
    return (
      <Suspense fallback={<div style={{ padding: 16 }}>加载主题对比页面...</div>}>
        <ThemeColorComparison />
      </Suspense>
    );
  }

  if (testMode === 'sidebyside') {
    return (
      <Suspense fallback={<div style={{ padding: 16 }}>加载并排对比页面...</div>}>
        <ThemeSideBySideComparison />
      </Suspense>
    );
  }

  if (path.startsWith('/docs') || testMode === 'docs') {
    return (
      <Suspense fallback={<div style={{ padding: 16 }}>加载文档预览页面...</div>}>
        <DocsPreview />
      </Suspense>
    );
  }

  if (path.startsWith('/warehouse-3d') || testMode === '3d') {
    return (
      <Suspense fallback={<div style={{ padding: 16 }}>Loading 3D Warehouse...</div>}>
        <Warehouse3DPage />
      </Suspense>
    );
  }

  if (path.startsWith('/storage-config')) {
    return (
      <Suspense fallback={<div style={{ padding: 16 }}>加载存储配置...</div>}>
        <StorageConfigPage />
      </Suspense>
    );
  }

  if (path.startsWith('/shared')) {
    return (
      <Suspense fallback={<div style={{ padding: 16 }}>加载分享页面...</div>}>
        <ShareViewPage />
      </Suspense>
    );
  }

  const isHomeEmpty = (path === '/' || path === '') && !urlParams.has('diagram') && !testMode;

  if (path.startsWith('/manage') || isHomeEmpty) {
    return (
      <Suspense fallback={<div style={{ padding: 16 }}>加载图表管理...</div>}>
        <DiagramManagementPage />
      </Suspense>
    );
  }

  if (path.startsWith('/unified-test') || testMode === 'unified') {
    return (
      <Suspense fallback={<div style={{ padding: 16 }}>加载统一外壳测试页...</div>}>
        <UnifiedDesignerTestPage />
      </Suspense>
    );
  }

  // 默认显示正常的图表查看器
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>加载图表...</div>}>
      <DiagramViewer />
    </Suspense>
  );
};

export default AppRoutes;
