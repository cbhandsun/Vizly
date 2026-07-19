// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  getPreviewEdgeColor,
  toBoundedNumber,
  toSafeSvgIdPart,
} from '../enhancedStylePreviewSecurity';

describe('enhanced style preview guards', () => {
  it('normalizes SVG id fragments for filter references', () => {
    expect(toSafeSvgIdPart('preset:blue/glow')).toBe('preset-blue-glow');
    expect(toSafeSvgIdPart('')).toBe('preset');
    expect(toSafeSvgIdPart('x'.repeat(100))).toHaveLength(64);
  });

  it('bounds numeric preview attributes', () => {
    expect(toBoundedNumber(8, 1, 0, 10)).toBe(8);
    expect(toBoundedNumber(999, 1, 0, 10)).toBe(10);
    expect(toBoundedNumber(-5, 1, 0, 10)).toBe(0);
    expect(toBoundedNumber(Number.NaN, 1, 0, 10)).toBe(1);
  });

  it('accepts safe colors and falls back for unsafe values', () => {
    expect(getPreviewEdgeColor('#3E8EDE')).toBe('#3E8EDE');
    expect(getPreviewEdgeColor('rgba(1, 2, 3, 0.5)')).toBe('rgba(1, 2, 3, 0.5)');
    expect(getPreviewEdgeColor('url(javascript:alert(1))', '#000000')).toBe('#000000');
  });
});
