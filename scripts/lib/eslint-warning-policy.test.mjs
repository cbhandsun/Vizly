import { describe, expect, it } from 'vitest';
import { evaluateEslintWarningPolicy } from './eslint-warning-policy.mjs';

const evaluate = (warningEntries, baselineEntries) => evaluateEslintWarningPolicy({
  warningCounts: new Map(warningEntries),
  warningBaseline: new Map(baselineEntries),
});

describe('ESLint warning policy', () => {
  it('accepts an exact historical warning baseline', () => {
    expect(evaluate(
      [['legacy.ts :: no-unused-vars', 2]],
      [['legacy.ts :: no-unused-vars', 2]],
    )).toEqual([]);
  });

  it('rejects new warning fingerprints and growth in existing debt', () => {
    expect(evaluate(
      [
        ['legacy.ts :: no-unused-vars', 3],
        ['new.ts :: prefer-const', 1],
      ],
      [['legacy.ts :: no-unused-vars', 2]],
    )).toEqual([
      'legacy.ts :: no-unused-vars: 3 warnings exceeds baseline 2',
      'new.ts :: prefer-const: 1 new warning; fix before merging',
    ]);
  });

  it('forces the baseline down when warning debt decreases', () => {
    expect(evaluate(
      [['legacy.ts :: no-unused-vars', 1]],
      [['legacy.ts :: no-unused-vars', 2]],
    )).toEqual([
      'legacy.ts :: no-unused-vars: reduced to 1 warnings; lower the stale baseline 2',
    ]);
  });

  it('rejects stale entries after warning debt is cleared', () => {
    expect(evaluate([], [['legacy.ts :: no-unused-vars', 2]])).toEqual([
      'legacy.ts :: no-unused-vars: warning debt cleared; remove stale baseline 2',
    ]);
  });
});
