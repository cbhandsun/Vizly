import { isFinalWmsDisplayRoutingReady } from '../smokeRouteBudgetUtils.mjs';

export const isManagementTemplatesReady = ({ hasRoot, activeTab, body }) => {
  if (!hasRoot || typeof activeTab !== 'string' || typeof body !== 'string') return false;
  const hasExpectedTab = (
    activeTab.includes('行业模板库')
    || activeTab.includes('Industry templates')
  );
  return hasExpectedTab
    && !body.includes('加载应用')
    && !body.includes('加载图表管理')
    && !body.includes('页面出现错误')
    && (
      body.includes('行业模板库')
      || body.includes('Industry templates')
      || body.includes('No diagrams')
    );
};

export const createSmokeRouteCatalog = (BASE_URL) => {
  const routes = [
    {
      name: 'management',
      url: `${BASE_URL}/`,
      timeoutMs: 25000,
      expression: `(() => {
        const body = document.body?.textContent || '';
        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          hasRoot: Boolean(document.getElementById('root')),
          hasReactFlow: Boolean(document.querySelector('.react-flow')),
          appFallback: body.includes('加载应用'),
          pageFallback: body.includes('加载图表管理') || body.includes('加载图表'),
          errorBoundary: body.includes('页面出现错误'),
          bodyText: body.slice(0, 240),
          scriptCount: document.scripts.length,
          scripts: Array.from(document.scripts).map((script) => script.src).filter(Boolean).slice(0, 8),
          resources: performance.getEntriesByType('resource').map((entry) => ({
            name: entry.name,
            duration: Math.round(entry.duration),
            transferSize: entry.transferSize,
          })).slice(0, 16),
          rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
          ready: Boolean(document.getElementById('root')) &&
            !body.includes('加载应用') &&
            !body.includes('加载图表管理') &&
            !body.includes('页面出现错误') &&
            (body.includes('Workspace') || body.includes('New Diagram') || body.includes('行业模板库')),
        };
      })()`,
    },
    {
      name: 'management-templates',
      url: `${BASE_URL}/?view=templates`,
      timeoutMs: 30000,
      expression: `(() => {
        const body = document.body?.textContent || '';
        const activeTab = document.querySelector('.filter-tab.active')?.textContent || '';
        const hasRoot = Boolean(document.getElementById('root'));
        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          hasRoot,
          activeTab,
          appFallback: body.includes('加载应用'),
          pageFallback: body.includes('加载图表管理') || body.includes('加载图表'),
          errorBoundary: body.includes('页面出现错误'),
          bodyText: body.slice(0, 240),
          rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
          ready: (${isManagementTemplatesReady.toString()})({ hasRoot, activeTab, body }),
        };
      })()`,
    },
    {
      name: 'default-diagram',
      url: `${BASE_URL}/?diagram=flowchart`,
      timeoutMs: 35000,
      expression: `(() => {
        const body = document.body?.textContent || '';
        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          hasRoot: Boolean(document.getElementById('root')),
          hasReactFlow: Boolean(document.querySelector('.react-flow')),
          hasRenderer: Boolean(document.querySelector('.react-flow__renderer')),
          appFallback: body.includes('加载应用'),
          pageFallback: body.includes('加载图表'),
          errorBoundary: body.includes('页面出现错误'),
          bodyText: body.slice(0, 240),
          scriptCount: document.scripts.length,
          scripts: Array.from(document.scripts).map((script) => script.src).filter(Boolean).slice(0, 8),
          resources: performance.getEntriesByType('resource').map((entry) => ({
            name: entry.name,
            duration: Math.round(entry.duration),
            transferSize: entry.transferSize,
          })).slice(0, 16),
          rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
          ready: Boolean(document.querySelector('.react-flow')) &&
            Boolean(document.querySelector('.react-flow__renderer')) &&
            !body.includes('加载图表') &&
            !body.includes('页面出现错误'),
        };
      })()`,
    },
    {
      name: 'wms-process-large-diagram',
      url: `${BASE_URL}/?diagram=wms-process-flow-v1`,
      timeoutMs: 55000,
      stabilityBudget: {
        durationMs: 15000,
        maxLongTaskMs: 250,
        maxLongTaskCount: 1,
        maxHeapGrowthKB: 8192,
        maxActiveWorkers: 0,
        maxQueuedTasks: 0,
      },
      expression: `(() => {
        const body = document.body?.textContent || '';
        const bridge = window.__flowDataBridge?.['wms-process-flow-v1'];
        const renderedNodeCount = document.querySelectorAll('.react-flow__node').length;
        const renderedEdgeCount = document.querySelectorAll('.react-flow__edge').length;
        const bridgeNodeCount = Array.isArray(bridge?.nodes) ? bridge.nodes.length : 0;
        const bridgeEdgeCount = Array.isArray(bridge?.edges) ? bridge.edges.length : 0;
        const optimizationStats = window.__vizly_coordinator__?.getOptimizationStats?.();
        const parallelStats = optimizationStats?.parallel || null;
        const workerHealthy = !parallelStats ||
          (parallelStats.activeWorkers === 0 && parallelStats.queuedTasks === 0);
        const displayRouting = window.__vizlyBaseReactFlowDisplayRouting;
        const displayRoutingReady = (${isFinalWmsDisplayRoutingReady.toString()})(displayRouting);
        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          hasRoot: Boolean(document.getElementById('root')),
          hasReactFlow: Boolean(document.querySelector('.react-flow')),
          hasRenderer: Boolean(document.querySelector('.react-flow__renderer')),
          renderedNodeCount,
          renderedEdgeCount,
          bridgeNodeCount,
          bridgeEdgeCount,
          parallelStats,
          workerHealthy,
          displayRouting: displayRouting && {
            stage: displayRouting.stage,
            error: displayRouting.error,
            requestId: displayRouting.requestId,
            boundedCandidate: displayRouting.boundedCandidate,
            inputGeometryDigest: displayRouting.inputGeometryDigest,
            signature: displayRouting.signature,
            terminalDiagnostics: displayRouting.terminalDiagnostics,
            workerStartCount: displayRouting.workerStartCount,
            workerAbortCount: displayRouting.workerAbortCount,
            workerResolution: displayRouting.workerResolution,
            routeMs: displayRouting.routeMs,
            finalAppliedAt: displayRouting.finalAppliedAt,
            outputRouteSignature: displayRouting.outputRouteSignature,
          },
          displayRoutingReady,
          appFallback: body.includes('加载应用'),
          pageFallback: body.includes('加载图表'),
          errorBoundary: body.includes('页面出现错误'),
          bodyText: body.slice(0, 240),
          rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
          ready: Boolean(document.querySelector('.react-flow')) &&
            Boolean(document.querySelector('.react-flow__renderer')) &&
            renderedNodeCount >= 20 &&
            renderedEdgeCount >= 35 &&
            workerHealthy &&
            displayRoutingReady &&
            !body.includes('加载图表') &&
            !body.includes('页面出现错误'),
        };
      })()`,
    },
    {
      name: 'enterprise-architecture-large-diagram',
      url: `${BASE_URL}/?diagram=enterprise-architecture-v2`,
      timeoutMs: 55000,
      stabilityBudget: {
        durationMs: 15000,
        maxLongTaskMs: 250,
        maxLongTaskCount: 1,
        maxHeapGrowthKB: 8192,
        maxActiveWorkers: 0,
        maxQueuedTasks: 0,
      },
      expression: `(() => {
        const body = document.body?.textContent || '';
        const renderedNodeCount = document.querySelectorAll('.react-flow__node').length;
        const renderedEdgeCount = document.querySelectorAll('.react-flow__edge').length;
        const optimizationStats = window.__vizly_coordinator__?.getOptimizationStats?.();
        const parallelStats = optimizationStats?.parallel || null;
        const workerHealthy = !parallelStats ||
          (parallelStats.activeWorkers === 0 && parallelStats.queuedTasks === 0);
        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          renderedNodeCount,
          renderedEdgeCount,
          parallelStats,
          workerHealthy,
          appFallback: body.includes('加载应用'),
          pageFallback: body.includes('加载图表'),
          errorBoundary: body.includes('页面出现错误'),
          bodyText: body.slice(0, 240),
          ready: Boolean(document.querySelector('.react-flow__renderer')) &&
            renderedNodeCount >= 40 &&
            renderedEdgeCount >= 30 &&
            workerHealthy &&
            !body.includes('加载图表') &&
            !body.includes('页面出现错误'),
        };
      })()`,
    },
    {
      name: 'storage-config',
      url: `${BASE_URL}/storage-config`,
      timeoutMs: 30000,
      expression: `(() => {
        const body = document.body?.textContent || '';
        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          hasRoot: Boolean(document.getElementById('root')),
          appFallback: body.includes('加载应用'),
          pageFallback: body.includes('加载存储配置'),
          errorBoundary: body.includes('页面出现错误'),
          bodyText: body.slice(0, 240),
          rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
          ready: Boolean(document.getElementById('root')) &&
            !body.includes('加载存储配置') &&
            !body.includes('页面出现错误') &&
            body.includes('Settings & Storage') &&
            body.includes('Connection Settings'),
        };
      })()`,
    },
    {
      name: 'shared-missing-token',
      url: `${BASE_URL}/shared`,
      timeoutMs: 30000,
      expression: `(() => {
        const body = document.body?.textContent || '';
        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          hasRoot: Boolean(document.getElementById('root')),
          appFallback: body.includes('加载应用'),
          pageFallback: body.includes('加载分享页面'),
          errorBoundary: body.includes('页面出现错误'),
          bodyText: body.slice(0, 240),
          rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
          ready: Boolean(document.getElementById('root')) &&
            !body.includes('加载分享页面') &&
            !body.includes('页面出现错误') &&
            body.includes('404'),
        };
      })()`,
    },
    {
      name: 'theme-colors',
      url: `${BASE_URL}/?test=colors`,
      timeoutMs: 30000,
      expression: `(() => {
        const body = document.body?.textContent || '';
        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          hasRoot: Boolean(document.getElementById('root')),
          appFallback: body.includes('加载应用'),
          pageFallback: body.includes('加载主题对比页面'),
          errorBoundary: body.includes('页面出现错误'),
          bodyText: body.slice(0, 240),
          rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
          ready: Boolean(document.getElementById('root')) &&
            !body.includes('加载主题对比页面') &&
            !body.includes('页面出现错误') &&
            body.includes('主题颜色对比测试'),
        };
      })()`,
    },
    {
      name: 'theme-side-by-side',
      url: `${BASE_URL}/?test=sidebyside`,
      timeoutMs: 30000,
      expression: `(() => {
        const body = document.body?.textContent || '';
        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          hasRoot: Boolean(document.getElementById('root')),
          appFallback: body.includes('加载应用'),
          pageFallback: body.includes('加载并排对比页面'),
          errorBoundary: body.includes('页面出现错误'),
          bodyText: body.slice(0, 240),
          rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
          ready: Boolean(document.getElementById('root')) &&
            !body.includes('加载并排对比页面') &&
            !body.includes('页面出现错误') &&
            body.includes('主题颜色并排对比测试'),
        };
      })()`,
    },
    {
      name: 'docs-preview',
      url: `${BASE_URL}/?test=docs`,
      timeoutMs: 30000,
      expression: `(() => {
        const body = document.body?.textContent || '';
        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          hasRoot: Boolean(document.getElementById('root')),
          appFallback: body.includes('加载应用'),
          pageFallback: body.includes('加载文档预览页面'),
          errorBoundary: body.includes('页面出现错误'),
          bodyText: body.slice(0, 240),
          rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
          ready: Boolean(document.getElementById('root')) &&
            !body.includes('加载文档预览页面') &&
            !body.includes('页面出现错误'),
        };
      })()`,
    },
    {
      name: 'warehouse-3d',
      url: `${BASE_URL}/?test=3d`,
      timeoutMs: 45000,
      expression: `(() => {
        const body = document.body?.textContent || '';
        const readyMarker = document.querySelector('[data-smoke-ready="warehouse-3d"]');
        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          hasRoot: Boolean(document.getElementById('root')),
          hasReadyMarker: Boolean(readyMarker),
          hasLoadingStatus: Boolean(document.querySelector('[role="status"]')),
          appFallback: body.includes('加载应用'),
          pageFallback: body.includes('Loading 3D Warehouse') || body.includes('Loading 3D Environment'),
          errorBoundary: body.includes('页面出现错误'),
          bodyText: body.slice(0, 240),
          rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
          ready: Boolean(readyMarker) &&
            !body.includes('Loading 3D Warehouse') &&
            !body.includes('Loading 3D Environment') &&
            !body.includes('页面出现错误') &&
            body.includes('Large Retail Logistics Center') &&
            body.includes('Interactive 3D Simulation View'),
        };
      })()`,
    },
    {
      name: 'unified-designer',
      url: `${BASE_URL}/?test=unified`,
      timeoutMs: 45000,
      expression: `(() => {
        const body = document.body?.textContent || '';
        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          hasRoot: Boolean(document.getElementById('root')),
          hasReactFlow: Boolean(document.querySelector('.react-flow')),
          hasRenderer: Boolean(document.querySelector('.react-flow__renderer')),
          appFallback: body.includes('加载应用'),
          pageFallback: body.includes('加载统一外壳测试页'),
          errorBoundary: body.includes('页面出现错误'),
          bodyText: body.slice(0, 240),
          rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
          ready: Boolean(document.querySelector('.react-flow')) &&
            Boolean(document.querySelector('.react-flow__renderer')) &&
            !body.includes('加载统一外壳测试页') &&
            !body.includes('页面出现错误'),
        };
      })()`,
    },
  ];

  return routes;
};
