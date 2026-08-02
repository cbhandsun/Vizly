import { describe, expect, it } from 'vitest';
import {
  createSmokeRouteCatalog,
  isManagementTemplatesReady,
} from './smoke-route-catalog.mjs';
import { CdpSession } from './smoke-route-cdp-session.mjs';
import { waitForRouteReadiness } from './smoke-route-readiness.mjs';
import {
  aggregateRouteSamples,
  collectBudgetViolations,
  getUnexpectedLogs,
} from './smoke-route-reporting.mjs';

describe('smoke route modules', () => {
  it('builds a unique route catalog against the supplied base URL', () => {
    const routes = createSmokeRouteCatalog('http://127.0.0.1:5373');
    const names = routes.map((route) => route.name);

    expect(routes.length).toBeGreaterThan(5);
    expect(new Set(names).size).toBe(routes.length);
    expect(routes.every((route) => route.url.startsWith('http://127.0.0.1:5373'))).toBe(true);
    expect(routes.every((route) => route.timeoutMs > 0 && route.expression.length > 0)).toBe(true);
    expect(routes.find((route) => route.name === 'enterprise-architecture-large-diagram')?.stabilityBudget)
      .toMatchObject({ durationMs: 15000, maxActiveWorkers: 0 });
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
        if (expression === 'performance.now()') return 875;
        return { ready: true, href: 'http://example.test/ready' };
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
    expect(expressions).toEqual([
      'readinessProbe()',
      'readinessProbe()',
      'performance.now()',
    ]);
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
        if (expression === 'readinessProbe()') {
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
