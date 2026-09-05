import { describe, expect, it } from 'vitest';
import { estimateEdgeLabelRect } from '../edgeLabelAvoidance';
import { estimateEdgeLabelSize, readEdgeLabelSize } from '../edgeLabelMeasurement';

describe('full edge label dimensions', () => {
  it('reserves additional lines for the complete 140-character Chinese condition', () => {
    const short = estimateEdgeLabelRect({ x: 0, y: 0 }, '条件'.repeat(48));
    const full = estimateEdgeLabelRect({ x: 0, y: 0 }, '条件'.repeat(70));
    expect(full.height).toBeGreaterThan(short.height);
    expect(full.width).toBeLessThanOrEqual(220);
  });
  it('measures angle-bracket conditions as visible text', () => {
    expect(estimateEdgeLabelRect({ x: 0, y: 0 }, '<条件>已满足').width)
      .toBeGreaterThan(estimateEdgeLabelRect({ x: 0, y: 0 }, '已满足').width);
  });
  it('uses measured dimensions and applies readability scale exactly once', () => {
    expect(estimateEdgeLabelRect({ x: 100, y: 200 }, '条件'.repeat(70), 2, { width: 220, height: 134 }))
      .toEqual({ x: -120, y: 66, width: 440, height: 268 });
  });
  it.each([null, undefined, {}, '220', { width: '220', height: 22 },
    { width: NaN, height: 22 }, { width: Infinity, height: 22 },
    { width: 0, height: 22 }, { width: -1, height: 22 },
    { width: 220, height: 0 }, { width: 220, height: 100001 }])('rejects invalid measurement %j', input => {
    expect(readEdgeLabelSize(input)).toBeUndefined();
  });
  it('rounds fractional measurements outward and falls back for empty text', () => {
    expect(readEdgeLabelSize({ width: 30.2, height: 22.4 })).toEqual({ width: 31, height: 23 });
    expect(estimateEdgeLabelSize('')).toEqual({ width: 42, height: 26 });
    expect(estimateEdgeLabelSize('\n').height).toBeGreaterThan(26);
  });
  it('accounts for wide glyphs and every character in extreme labels', () => {
    expect(estimateEdgeLabelSize('宽'.repeat(50)).height).toBeGreaterThan(estimateEdgeLabelSize('a'.repeat(50)).height);
    const extreme = estimateEdgeLabelSize('🙂'.repeat(10000));
    expect(Number.isFinite(extreme.height)).toBe(true);
    expect(extreme.height).toBeGreaterThan(estimateEdgeLabelSize('🙂'.repeat(9999)).height - 1);
  });
});
