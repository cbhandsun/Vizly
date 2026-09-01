import { describe, expect, it } from 'vitest';

import { coerceDetachedRepairBudget } from '../edgeDetachedOverlapRepairBoundary';

describe('coerceDetachedRepairBudget', () => {
  it('coerces finite values to non-negative integer budgets', () => {
    expect(coerceDetachedRepairBudget('4.9', 8)).toBe(4);
    expect(coerceDetachedRepairBudget(-3, 8)).toBe(0);
    expect(coerceDetachedRepairBudget('', 8)).toBe(0);
  });

  it('uses the caller fallback for missing, invalid, and unbounded values', () => {
    expect(coerceDetachedRepairBudget(undefined, 8)).toBe(8);
    expect(coerceDetachedRepairBudget('invalid', 8)).toBe(8);
    expect(coerceDetachedRepairBudget(Number.POSITIVE_INFINITY, 8)).toBe(8);
  });

  it('preserves finite zero and bounded extreme integers', () => {
    expect(coerceDetachedRepairBudget(0, 8)).toBe(0);
    expect(coerceDetachedRepairBudget(Number.MAX_SAFE_INTEGER, 8))
      .toBe(Number.MAX_SAFE_INTEGER);
  });
});
