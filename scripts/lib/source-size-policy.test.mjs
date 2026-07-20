import { describe, expect, it } from 'vitest';
import { evaluateSourceSizePolicy, resolveSourceSizeLimit } from './source-size-policy.mjs';

const limits = { default: 800, component: 700, test: 1000, compositionRoot: 300 };
const evaluate = (entries, baselineEntries = []) => evaluateSourceSizePolicy({
  lineCounts: new Map(entries),
  oversizedBaseline: new Map(baselineEntries),
  limits,
});

describe('source size policy', () => {
  it('accepts ordinary files and exact historical baselines', () => {
    expect(evaluate([['small.ts', 200], ['legacy.ts', 900]], [['legacy.ts', 900]])).toEqual([]);
  });

  it('rejects new oversized files and growth in historical files', () => {
    expect(evaluate([['new.ts', 801], ['legacy.ts', 901]], [['legacy.ts', 900]])).toEqual([
      'new.ts: 801 lines exceeds 800; split or add a justified baseline',
      'legacy.ts: 901 lines exceeds oversized baseline 900',
    ]);
  });

  it('forces the baseline down after a successful extraction', () => {
    expect(evaluate([['legacy.ts', 850]], [['legacy.ts', 900]])).toEqual([
      'legacy.ts: reduced to 850 lines; lower the stale oversized baseline 900',
    ]);
  });

  it('uses tighter budgets for components and composition roots while allowing larger tests', () => {
    expect(resolveSourceSizeLimit('src/components/Panel.tsx', limits)).toBe(700);
    expect(resolveSourceSizeLimit('src/components/panelModel.ts', limits)).toBe(700);
    expect(resolveSourceSizeLimit('src/core/hooks/useDiagramState.ts', limits)).toBe(700);
    expect(resolveSourceSizeLimit('src/main/bootstrapApplication.ts', limits)).toBe(300);
    expect(resolveSourceSizeLimit('src/core/__tests__/large.test.ts', limits)).toBe(1000);
    expect(resolveSourceSizeLimit('src/core/service.ts', limits)).toBe(800);
    expect(resolveSourceSizeLimit('scripts/check-source-size.mjs', limits)).toBe(800);
  });

  it('rejects baselines that no longer exceed the applicable role budget', () => {
    expect(evaluate([['src/components/Panel.tsx', 700]], [['src/components/Panel.tsx', 700]])).toEqual([
      'src/components/Panel.tsx: oversized baseline 700 must be an integer above its 700-line limit',
    ]);
  });

  it('rejects stale entries for removed files', () => {
    expect(evaluate([], [['removed.ts', 1500]])).toEqual([
      'removed.ts: oversized baseline entry points to a missing file',
    ]);
  });
});
