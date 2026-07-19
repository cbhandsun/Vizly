import { describe, expect, it } from 'vitest';

import {
  findCoverageThresholdFailures,
  validateCoverageThresholds,
} from './coverage-policy.mjs';

const thresholds = { statements: 61, branches: 48, functions: 61, lines: 63 };

describe('coverage policy', () => {
  it('accepts a complete bounded threshold policy', () => {
    expect(validateCoverageThresholds(thresholds)).toEqual(thresholds);
  });

  it('reports every metric below its threshold', () => {
    expect(findCoverageThresholdFailures({
      statements: { pct: 60.9 },
      branches: { pct: 48 },
      functions: { pct: 59 },
      lines: { pct: 70 },
    }, thresholds)).toEqual([
      { metric: 'statements', actual: 60.9, required: 61 },
      { metric: 'functions', actual: 59, required: 61 },
    ]);
  });

  it('rejects incomplete, out-of-range, or malformed input', () => {
    expect(() => validateCoverageThresholds({})).toThrow(/statements/);
    expect(() => validateCoverageThresholds({ ...thresholds, lines: 101 })).toThrow(/lines/);
    expect(() => findCoverageThresholdFailures({}, thresholds)).toThrow(/statements/);
  });
});
