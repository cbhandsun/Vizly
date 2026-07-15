import { describe, expect, it } from 'vitest';

import { isSafeSvgPathData } from '../../export/svgPathSafety';

describe('svgPathSafety', () => {
  it('accepts internally generated SVG path shapes', () => {
    expect(isSafeSvgPathData('M 0 0 L 120 0')).toBe(true);
    expect(isSafeSvgPathData('M0-10 L20.5,30 z')).toBe(true);
    expect(isSafeSvgPathData('M 0 0 C 10 10 20 10 30 0 S 40 -10 50 0')).toBe(true);
    expect(isSafeSvgPathData('M 0 0 A 10 10 0 0 1 20 20')).toBe(true);
  });

  it('rejects non-string, empty, and non-path input', () => {
    expect(isSafeSvgPathData(null)).toBe(false);
    expect(isSafeSvgPathData(42)).toBe(false);
    expect(isSafeSvgPathData('')).toBe(false);
    expect(isSafeSvgPathData('10 10')).toBe(false);
    expect(isSafeSvgPathData('L 10 10')).toBe(false);
  });

  it('rejects ignored punctuation and SVG/CSS injection fragments', () => {
    expect(isSafeSvgPathData('M 0 0 .')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 -')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 10..20')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 L 10 10 QDROP')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 L 10 10;')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 L 10 10 url(#x)')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 L 10 10" onload="alert(1)')).toBe(false);
  });

  it('rejects incomplete command parameter groups', () => {
    expect(isSafeSvgPathData('M 0')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 L 10')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 C 10 10 20 10')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 A 10 10 0 0 1 20')).toBe(false);
    expect(isSafeSvgPathData('M 0 0 Z 10')).toBe(false);
  });
});
