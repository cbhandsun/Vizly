import { describe, expect, it } from 'vitest';
import { createSmokeRouteCatalog } from './smoke-route-catalog.mjs';
import { CdpSession } from './smoke-route-cdp-session.mjs';
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
