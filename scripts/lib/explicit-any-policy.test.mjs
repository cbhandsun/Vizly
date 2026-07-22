import { describe, expect, it } from 'vitest';
import { evaluateExplicitAnyPolicy } from './explicit-any-policy.mjs';

const evaluate = (actual, baseline) => evaluateExplicitAnyPolicy({
  actualCounts: new Map(actual),
  baselineCounts: new Map(baseline),
});

describe('explicit any policy', () => {
  it('accepts an exact historical baseline', () => {
    expect(evaluate([['legacy.ts', 2]], [['legacy.ts', 2]])).toEqual([]);
  });

  it('rejects new files and increases', () => {
    expect(evaluate(
      [['legacy.ts', 3], ['new.ts', 1]],
      [['legacy.ts', 2]],
    )).toEqual([
      'legacy.ts: 3 explicit any occurrences exceeds baseline 2',
      'new.ts: 1 new explicit any occurrence; use a concrete or unknown type',
    ]);
  });

  it('forces the baseline down as debt is removed', () => {
    expect(evaluate(
      [['partly-fixed.ts', 1]],
      [['partly-fixed.ts', 2], ['fixed.ts', 4]],
    )).toEqual([
      'partly-fixed.ts: reduced to 1 explicit any occurrences; lower the stale baseline 2',
      'fixed.ts: explicit any debt cleared; remove stale baseline 4',
    ]);
  });
});
