import { describe, expect, it } from 'vitest';

import { buildStrictLoopShortcutCandidates } from '../baseReactFlowDisplayStrictLoopShortcutCandidates';

const pathLength = (path: Array<{ x: number; y: number }>): number => path
  .slice(0, -1)
  .reduce((total, point, index) => (
    total
    + Math.abs(path[index + 1].x - point.x)
    + Math.abs(path[index + 1].y - point.y)
  ), 0);

describe('strict loop shortcut candidates', () => {
  const loopedPath = [
    { x: 1486, y: 1985 },
    { x: 1486, y: 1937 },
    { x: 1789, y: 1937 },
    { x: 1789, y: 52 },
    { x: 1414, y: 52 },
    { x: 1414, y: 514 },
    { x: 1631, y: 514 },
    { x: 1631, y: 374 },
    { x: 1250, y: 374 },
    { x: 1250, y: 181 },
  ];

  it('removes interior rectangular loops while preserving both endpoint stubs', () => {
    const candidates = buildStrictLoopShortcutCandidates(loopedPath, 12);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(12);
    for (const candidate of candidates) {
      expect(candidate.slice(0, 2)).toEqual(loopedPath.slice(0, 2));
      expect(candidate.slice(-2)).toEqual(loopedPath.slice(-2));
      expect(pathLength(candidate)).toBeLessThan(pathLength(loopedPath));
      expect(candidate.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
      expect(candidate.slice(0, -1).every((point, index) => (
        point.x === candidate[index + 1].x || point.y === candidate[index + 1].y
      ))).toBe(true);
    }
  });

  it('is bounded, deterministic, and returns no candidates for empty or loop-free input', () => {
    expect(buildStrictLoopShortcutCandidates([], 12)).toEqual([]);
    expect(buildStrictLoopShortcutCandidates(loopedPath, 0)).toEqual([]);
    expect(buildStrictLoopShortcutCandidates([
      { x: 0, y: 0 },
      { x: 0, y: 48 },
      { x: 120, y: 48 },
      { x: 120, y: 96 },
    ], 12)).toEqual([]);
    expect(buildStrictLoopShortcutCandidates(loopedPath, 4))
      .toEqual(buildStrictLoopShortcutCandidates(loopedPath, 4));
  });
});
