import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  createSmokeRouteCatalog,
  isManagementTemplatesReady,
} from './smoke-route-catalog.mjs';
import { CdpSession } from './smoke-route-cdp-session.mjs';
import { waitForRouteReadiness } from './smoke-route-readiness.mjs';
import {
  aggregateRouteSamples,
  collectBudgetViolations,
  dedupeRouteAssets,
  getUnexpectedLogs,
} from './smoke-route-reporting.mjs';
import { isEnterpriseDisplayRoutingSettled } from '../smokeRouteBudgetUtils.mjs';

describe('smoke route modules', () => {
  it.each(['worker-timeout', 'worker-rejected'])(
    'recognizes the exact bounded enterprise timeout in %s state', (stage) => {
      expect(isEnterpriseDisplayRoutingSettled({
        stage,
        error: 'display-edge-worker-timeout',
        workerStartCount: 1,
        workerAbortCount: 0,
      })).toBe(true);
    },
  );

  it('waits for the enterprise route to settle before measuring stability', () => {
    expect(isEnterpriseDisplayRoutingSettled({
      stage: 'worker-rejected',
      error: 'display-edge-worker-invalid-response',
      workerStartCount: 1,
      workerAbortCount: 0,
    })).toBe(false);
    expect(isEnterpriseDisplayRoutingSettled({
      stage: 'worker-phase',
      workerStartCount: 1,
      workerAbortCount: 0,
    })).toBe(false);
  });

  it.each([
    null,
    undefined,
    [],
    'worker-timeout',
    { stage: 'worker-timeout' },
    { stage: 'worker-phase', error: 'display-edge-worker-timeout', workerStartCount: 1, workerAbortCount: 0 },
    { stage: 'worker-timeout', error: 'display-edge-worker-invalid-response', workerStartCount: 1, workerAbortCount: 0 },
    { stage: 'worker-timeout', error: 'display-edge-worker-timeout', workerStartCount: 2, workerAbortCount: 0 },
    { stage: 'worker-timeout', error: 'display-edge-worker-timeout', workerStartCount: 1, workerAbortCount: 1 },
  ])('rejects incomplete or unexpected enterprise terminal states: %j', (state) => {
    expect(isEnterpriseDisplayRoutingSettled(state)).toBe(false);
  });

  it('disconnects long-task observation before forcing heap-accounting GC', () => {
    const smokeSource = readFileSync(new URL('../smoke-routes.mjs', import.meta.url), 'utf8');
    const endObservation = smokeSource.indexOf('state.observer?.disconnect();');
    const finalGarbageCollection = smokeSource.lastIndexOf(
      "session.send('HeapProfiler.collectGarbage')",
    );

    expect(endObservation).toBeGreaterThan(0);
    expect(finalGarbageCollection).toBeGreaterThan(endObservation);
  });

  it('waits for a route stability boundary before starting observation', () => {
    const smokeSource = readFileSync(new URL('../smoke-routes.mjs', import.meta.url), 'utf8');
    const stabilityWait = smokeSource.indexOf('if (route.stabilityExpression)');
    const startObservation = smokeSource.indexOf(
      'const stabilityReport = await collectRouteStabilityReport',
    );

    expect(stabilityWait).toBeGreaterThan(0);
    expect(startObservation).toBeGreaterThan(stabilityWait);
  });

  it('keeps self-contained docs and 3D routes outside the Ant Design shell', () => {
    const routeSource = readFileSync(new URL('../../src/app/routes.tsx', import.meta.url), 'utf8');
    const routeErrorSource = readFileSync(new URL('../../src/app/AppRouteError.tsx', import.meta.url), 'utf8');
    const routeNotFoundSource = readFileSync(new URL('../../src/app/AppRouteNotFound.tsx', import.meta.url), 'utf8');

    expect(routeSource).toContain("const DocsPreview = withoutAntdRoute(() => import('@/pages/DocsPreview'))");
    expect(routeSource).toContain("const Warehouse3DPage = withoutAntdRoute(() => import('@/pages/Warehouse3DPage'))");
    expect(routeSource).not.toContain("import Warehouse3DShell from '@/components/warehouse-3d/Warehouse3DShell'");
    expect(routeSource).toContain("const DiagramManagementPage = withAntdRoute(() => import('@/pages/DiagramManagementPage'))");
    expect(routeErrorSource).not.toContain("from '@ant-design/icons'");
    expect(routeNotFoundSource).not.toContain("from '@ant-design/icons'");
  });

  it('keeps advanced edge routing off the empty-canvas startup path', () => {
    const canvasShellSource = readFileSync(new URL(
      '../../src/core/components/diagrams/FlowchartCanvasShell.tsx',
      import.meta.url,
    ), 'utf8');

    expect(canvasShellSource).toContain("import('./AdvancedFlowchartCanvasShell')");
    expect(canvasShellSource).toContain('props.nodes.length === 0 && props.displayEdges.length === 0');
    expect(canvasShellSource).not.toContain("from '../shared/BaseReactFlow'");
  });

  it('builds a unique route catalog against the supplied base URL', () => {
    const routes = createSmokeRouteCatalog('http://127.0.0.1:5373');
    const names = routes.map((route) => route.name);

    expect(routes.length).toBeGreaterThan(5);
    expect(new Set(names).size).toBe(routes.length);
    expect(routes.every((route) => route.url.startsWith('http://127.0.0.1:5373'))).toBe(true);
    expect(routes.every((route) => route.timeoutMs > 0 && route.expression.length > 0)).toBe(true);
    const enterpriseRoute = routes.find(
      (route) => route.name === 'enterprise-architecture-large-diagram',
    );
    expect(enterpriseRoute?.stabilityBudget)
      .toMatchObject({ durationMs: 15000, maxActiveWorkers: 0 });
    expect(enterpriseRoute?.stabilityTimeoutMs).toBeGreaterThan(10000);
    expect(enterpriseRoute?.stabilityExpression)
      .toContain('displayRoutingReady');
    expect(enterpriseRoute?.expression).not.toContain('displayRoutingReady');
  });

  it('keeps development-only visual routes out of production preview smoke', () => {
    const productionNames = createSmokeRouteCatalog('http://127.0.0.1:5373')
      .map((route) => route.name);
    const developmentNames = createSmokeRouteCatalog('http://127.0.0.1:5373', {
      includeDevRoutes: true,
    }).map((route) => route.name);

    for (const routeName of ['theme-colors', 'theme-side-by-side', 'unified-designer']) {
      expect(productionNames).not.toContain(routeName);
      expect(developmentNames).toContain(routeName);
    }
  });

  it('measures the warehouse shell without blocking on the progressively loaded canvas', () => {
    const warehouseRoute = createSmokeRouteCatalog('http://127.0.0.1:5373')
      .find((route) => route.name === 'warehouse-3d');

    expect(warehouseRoute?.expression).toContain('data-smoke-ready="warehouse-3d"');
    expect(warehouseRoute?.expression).toContain("querySelector('[role=\"status\"]')");
    expect(warehouseRoute?.expression).not.toContain('Large Retail Logistics Center');
    expect(warehouseRoute?.expression).not.toContain('Interactive 3D Simulation View');
    expect(warehouseRoute?.expression).not.toContain("querySelector('canvas')");
  });

  it('detects storage configuration readiness without coupling to localized copy', () => {
    const storageRoute = createSmokeRouteCatalog('http://127.0.0.1:5373')
      .find((route) => route.name === 'storage-config');

    expect(storageRoute?.expression).toContain('data-smoke-ready="storage-config"');
    expect(storageRoute?.expression).not.toContain('Settings & Storage');
    expect(storageRoute?.expression).not.toContain('Connection Settings');
  });

  it('keeps CDP runtime options explicit at the browser boundary', () => {
    const viewport = { width: 390, height: 844, scale: 2 };
    const session = new CdpSession('ws://browser', 'target-1', {
      viewport,
      isMobile: true,
    });

    expect(session.browserUrl).toBe('ws://browser');
    expect(session.targetId).toBe('target-1');
    expect(session.viewport).toEqual(viewport);
    expect(session.isMobile).toBe(true);
    expect(session.logs).toEqual([]);
    expect(session.networkIssues).toEqual([]);
  });

  it('timestamps readiness in the same browser evaluation, before unrelated long tasks', async () => {
    let browserTime = 875;
    let evaluations = 0;
    const session = {
      logs: [], networkIssues: [], pendingLogEnrichments: [],
      evaluate: async (expression) => {
        evaluations += 1;
        const result = runInNewContext(expression, {
          readinessProbe: () => ({ ready: true }),
          performance: { now: () => browserTime },
        });
        // A render task can occupy the main thread before the next CDP call.
        browserTime += 9_000;
        return result;
      },
    };
    const state = await waitForRouteReadiness(session, {
      name: 'progressive-route', expression: 'readinessProbe()', timeoutMs: 20_000,
    });
    expect(state).toEqual({ ready: true, readyAt: 875 });
    expect(evaluations).toBe(1);
  });

  it.each([undefined, null, '0', -1, NaN, Infinity, 'secret-test-marker'])(
    'rejects invalid readiness timestamps without exposing their value: %s', async (timestamp) => {
      const session = {
        evaluate: async (expression) => runInNewContext(expression, {
          readinessProbe: () => ({ ready: true }),
          performance: { now: () => timestamp },
        }),
      };
      await expect(waitForRouteReadiness(session, {
        name: 'invalid-clock', expression: 'readinessProbe()', timeoutMs: 1_000,
      })).rejects.toThrow(/^Invalid route readiness timestamp$/);
    },
  );

  it('does not mark empty or loading probes ready and timestamps only the successful probe', async () => {
    let currentTime = 0;
    let clockReads = 0;
    const states = [null, undefined, { ready: false }, { ready: true, readyAt: -1 }];
    const session = {
      evaluate: async (expression) => runInNewContext(expression, {
        readinessProbe: () => states.shift(),
        performance: { now: () => { clockReads += 1; return 0; } },
      }),
    };
    expect(await waitForRouteReadiness(session, {
      name: 'loading-route', expression: 'readinessProbe()', timeoutMs: 2_000,
    }, {
      now: () => currentTime,
      wait: async (durationMs) => { currentTime += durationMs; },
    })).toEqual({ ready: true, readyAt: 0 });
    expect(currentTime).toBe(1_500);
    expect(clockReads).toBe(1);
  });

  it('keeps polling within the route deadline after a Runtime.evaluate timeout', async () => {
    let currentTime = 0;
    const expressions = [];
    const session = {
      logs: [],
      networkIssues: [],
      pendingLogEnrichments: [],
      evaluate: async (expression) => {
        expressions.push(expression);
        if (expressions.length === 1) {
          throw new Error('CDP command timed out: Runtime.evaluate');
        }
        return runInNewContext(expression, {
          readinessProbe: () => ({ ready: true, href: 'http://example.test/ready' }),
          performance: { now: () => 875 },
        });
      },
    };

    const state = await waitForRouteReadiness(session, {
      name: 'large-diagram',
      expression: 'readinessProbe()',
      timeoutMs: 2_000,
    }, {
      now: () => currentTime,
      wait: async (durationMs) => { currentTime += durationMs; },
    });

    expect(state).toEqual({
      ready: true,
      href: 'http://example.test/ready',
      readyAt: 875,
    });
    expect(expressions).toHaveLength(2);
    expect(expressions[0]).toBe(expressions[1]);
  });

  it('does not swallow unrelated CDP or evaluation errors', async () => {
    const session = {
      logs: [],
      networkIssues: [],
      pendingLogEnrichments: [],
      evaluate: async () => {
        throw new Error('CDP command timed out: Page.navigate');
      },
    };

    await expect(waitForRouteReadiness(session, {
      name: 'broken-route',
      expression: 'readinessProbe()',
      timeoutMs: 2_000,
    })).rejects.toThrow('CDP command timed out: Page.navigate');
  });

  it('fails with timeout diagnostics when Runtime.evaluate stays unavailable', async () => {
    let currentTime = 0;
    let readinessAttempts = 0;
    const session = {
      logs: [{ level: 'warn', message: 'rendering' }],
      networkIssues: [],
      pendingLogEnrichments: [],
      evaluate: async (expression) => {
        if (expression.includes('readinessProbe()')) {
          readinessAttempts += 1;
          throw new Error('CDP command timed out: Runtime.evaluate');
        }
        return null;
      },
    };

    const result = waitForRouteReadiness(session, {
      name: 'stuck-route',
      expression: 'readinessProbe()',
      timeoutMs: 1_000,
    }, {
      now: () => currentTime,
      wait: async (durationMs) => { currentTime += durationMs; },
    });

    await expect(result).rejects.toMatchObject({
      message: 'Route smoke failed for stuck-route',
      details: {
        evaluateTimeoutCount: 2,
        lastEvaluateTimeout: 'CDP command timed out: Runtime.evaluate',
        logs: [{ level: 'warn', message: 'rendering' }],
      },
    });
    expect(readinessAttempts).toBe(2);
  });

  it('accepts localized management-template empty states as ready', () => {
    expect(isManagementTemplatesReady({
      hasRoot: true,
      activeTab: 'Industry templates0',
      body: 'Industry templates0 General templates0 No diagrams yet',
    })).toBe(true);
    expect(isManagementTemplatesReady({
      hasRoot: true,
      activeTab: '行业模板库0',
      body: '行业模板库0 通用模板库0 暂无图表',
    })).toBe(true);
  });

  it('rejects loading, error, missing-root, and malformed template states', () => {
    expect(isManagementTemplatesReady({
      hasRoot: false,
      activeTab: 'Industry templates0',
      body: 'No diagrams yet',
    })).toBe(false);
    expect(isManagementTemplatesReady({
      hasRoot: true,
      activeTab: 'Industry templates0',
      body: '加载应用 No diagrams yet',
    })).toBe(false);
    expect(isManagementTemplatesReady({
      hasRoot: true,
      activeTab: 'Industry templates0',
      body: '页面出现错误 No diagrams yet',
    })).toBe(false);
    expect(isManagementTemplatesReady({
      hasRoot: true,
      activeTab: null,
      body: 'No diagrams yet',
    })).toBe(false);
  });

  it('filters allowlisted warnings but never suppresses errors', () => {
    const logs = [
      { level: 'warn', message: 'known transient warning' },
      { level: 'warn', message: 'new warning' },
      { level: 'error', message: 'known transient warning' },
    ];

    expect(getUnexpectedLogs(logs, [/known transient warning/])).toEqual([
      { level: 'warn', message: 'new warning' },
      { level: 'error', message: 'known transient warning' },
    ]);
  });

  it('counts each built asset once when the browser records repeated requests', () => {
    expect(dedupeRouteAssets([
      {
        file: 'display-routing-shared.js',
        startTime: 900,
        duration: 10,
        transferSize: 0,
        encodedBodySize: 0,
        decodedBodySize: 587_000,
      },
      {
        file: 'display-routing-shared.js',
        startTime: 200,
        duration: 40,
        transferSize: 120_000,
        encodedBodySize: 120_000,
        decodedBodySize: 587_000,
      },
    ])).toEqual([{
      file: 'display-routing-shared.js',
      startTime: 200,
      duration: 40,
      transferSize: 120_000,
      encodedBodySize: 120_000,
      decodedBodySize: 587_000,
    }]);
  });

  it('aggregates repeated samples with upper medians and preserves the worst report', () => {
    const sample = (readyAt, criticalAssets, suffix) => ({
      name: 'management',
      state: { href: `http://example/${suffix}` },
      assetReport: {
        readyAt,
        criticalAssets,
        criticalDecodedKB: criticalAssets * 10,
        totalAssets: criticalAssets + 2,
        totalDecodedKB: criticalAssets * 20,
      },
    });
    const result = aggregateRouteSamples([
      sample(300, 3, 'slow'),
      sample(100, 1, 'fast'),
      sample(200, 2, 'median'),
    ]);

    expect(result.sampleCount).toBe(3);
    expect(result.state.href).toBe('http://example/median');
    expect(result.assetReport).toMatchObject({
      readyAt: 200,
      criticalAssets: 2,
      criticalDecodedKB: 20,
      totalAssets: 4,
      totalDecodedKB: 40,
    });
    expect(result.worstReport.readyAt).toBe(300);
    expect(collectBudgetViolations([result])).toEqual([]);
  });
});
