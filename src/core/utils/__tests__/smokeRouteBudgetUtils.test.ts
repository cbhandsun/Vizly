import { describe, expect, it } from 'vitest';

import {
  defaultDesktopRouteBudgets,
  collectRouteStabilityViolations,
  isFinalWmsDisplayRoutingReady,
  resolveRouteBudget,
  shouldRetryEvaluateAfterTimeout,
} from '../../../../scripts/smokeRouteBudgetUtils.mjs';

describe('smokeRouteBudgetUtils', () => {
  it('uses mobile-specific default overrides before desktop defaults', () => {
    expect(defaultDesktopRouteBudgets.management.readyMs).toBe(6000);
    expect(resolveRouteBudget('management', { env: {}, isMobile: true }).readyMs).toBe(7500);
    expect(resolveRouteBudget('management', { env: {}, isMobile: false }).readyMs).toBe(6000);
  });

  it('lets route-specific mobile env budgets override the defaults', () => {
    const budget = resolveRouteBudget('management', {
      env: {
        SMOKE_BUDGET_MANAGEMENT_MOBILE_READY_MS: '8200',
      },
      isMobile: true,
    });

    expect(budget.readyMs).toBe(8200);
  });

  it('falls back to generic budgets for unknown routes', () => {
    const budget = resolveRouteBudget('custom-route', {
      env: {
        SMOKE_MAX_READY_MS: '4200',
        SMOKE_MAX_CRITICAL_ASSETS: '11',
        SMOKE_MAX_CRITICAL_DECODED_KB: '333',
      },
      isMobile: false,
    });

    expect(budget).toEqual({
      criticalAssets: 11,
      criticalDecodedKB: 333,
      readyMs: 4200,
    });
  });

  it('retries only mobile Runtime.evaluate timeouts', () => {
    expect(shouldRetryEvaluateAfterTimeout(new Error('CDP command timed out: Runtime.evaluate'), { isMobile: true })).toBe(true);
    expect(shouldRetryEvaluateAfterTimeout(new Error('CDP command timed out: Runtime.evaluate'), { isMobile: false })).toBe(false);
    expect(shouldRetryEvaluateAfterTimeout(new Error('CDP command timed out: Page.navigate'), { isMobile: true })).toBe(false);
  });

  it('marks WMS ready only after one final hard-clean routing commit', () => {
    const finalState = {
      stage: 'final-applied',
      workerStartCount: 1,
      workerAbortCount: 0,
      workerResolution: 'validated-candidate',
      routeMs: 42,
      finalAppliedAt: 1_000,
      outputRouteSignature: 'route-v2:44:208:c245f0d5d0caa25f',
    };

    expect(isFinalWmsDisplayRoutingReady(finalState)).toBe(true);
    expect(isFinalWmsDisplayRoutingReady({
      ...finalState,
      workerResolution: 'full-route',
    })).toBe(true);
    expect(isFinalWmsDisplayRoutingReady({
      ...finalState,
      workerResolution: 'repair',
    })).toBe(true);
  });

  it('rejects mounted, stale, aborted, and malformed WMS routing states', () => {
    const finalState = {
      stage: 'final-applied',
      workerStartCount: 1,
      workerAbortCount: 0,
      workerResolution: 'validated-candidate',
      routeMs: 42,
      finalAppliedAt: 1_000,
      outputRouteSignature: 'route-v2:44:208:c245f0d5d0caa25f',
    };

    expect(isFinalWmsDisplayRoutingReady(null)).toBe(false);
    expect(isFinalWmsDisplayRoutingReady([])).toBe(false);
    expect(isFinalWmsDisplayRoutingReady({ ...finalState, stage: 'worker-response' })).toBe(false);
    expect(isFinalWmsDisplayRoutingReady({ ...finalState, workerStartCount: 2 })).toBe(false);
    expect(isFinalWmsDisplayRoutingReady({ ...finalState, workerAbortCount: 1 })).toBe(false);
    expect(isFinalWmsDisplayRoutingReady({ ...finalState, routeMs: Number.NaN })).toBe(false);
    expect(isFinalWmsDisplayRoutingReady({ ...finalState, finalAppliedAt: 0 })).toBe(false);
    expect(isFinalWmsDisplayRoutingReady({
      ...finalState,
      outputRouteSignature: 'route-v2:forged',
    })).toBe(false);
  });

  it('reports only bounded post-ready stability regressions', () => {
    expect(collectRouteStabilityViolations({
      maxLongTaskMs: 280,
      longTaskCount: 2,
      heapGrowthKB: 1024,
      activeWorkers: 0,
      queuedTasks: 0,
    }, {
      maxLongTaskMs: 250,
      maxLongTaskCount: 1,
      maxHeapGrowthKB: 8192,
      maxActiveWorkers: 0,
      maxQueuedTasks: 0,
    })).toEqual([
      { metric: 'maxLongTaskMs', actual: 280, max: 250, unit: 'ms' },
      { metric: 'longTaskCount', actual: 2, max: 1, unit: 'tasks' },
    ]);
  });
});
