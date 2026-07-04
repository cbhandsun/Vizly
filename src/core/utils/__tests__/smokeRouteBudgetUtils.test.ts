import { describe, expect, it } from 'vitest';

import {
  defaultDesktopRouteBudgets,
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
});
