import { describe, expect, it } from 'vitest';

import {
  EDGE_CONTRAST_OUTLINE_WIDTH,
  EDGE_NON_TEXT_MIN_CONTRAST,
  resolveEdgeContrastPaint,
} from '../../../rendering/edgeContrastPaint';

describe('resolveEdgeContrastPaint', () => {
  it('adds a contrast-qualified neutral boundary around cyan on a white canvas', () => {
    const decision = resolveEdgeContrastPaint({
      stroke: '#47CACC',
      strokeWidth: 2,
      canvasBackground: '#ffffff',
    });

    expect(decision.kind).toBe('underlay');
    if (decision.kind !== 'underlay') throw new Error('Expected an underlay decision');
    expect(decision.semanticContrastRatio).toBeCloseTo(1.98, 2);
    expect(decision.underlayContrastRatio).toBeGreaterThanOrEqual(EDGE_NON_TEXT_MIN_CONTRAST);
    expect(decision.underlayColor).toBe('#334155');
    expect(decision.underlayStrokeWidth).toBe(2 + EDGE_CONTRAST_OUTLINE_WIDTH * 2);
  });

  it.each([
    ['main-chain orange', '#FF5722', 3.16],
    ['support slate', '#78909C', 3.35],
  ])('does not decorate already sufficient %s', (_name, stroke, expectedRatio) => {
    const decision = resolveEdgeContrastPaint({
      stroke,
      strokeWidth: 2,
      canvasBackground: '#ffffff',
    });

    expect(decision.kind).toBe('sufficient');
    expect(decision.semanticContrastRatio).toBeCloseTo(expectedRatio, 2);
  });

  it('re-evaluates the same semantic cyan against dark and high-contrast themes', () => {
    const darkTheme = resolveEdgeContrastPaint({
      stroke: '#47CACC',
      strokeWidth: 2,
      canvasBackground: '#141414',
    });
    const highContrastTheme = resolveEdgeContrastPaint({
      stroke: '#47CACC',
      strokeWidth: 2,
      canvasBackground: '#ffffff',
    });

    expect(darkTheme.kind).toBe('sufficient');
    expect(darkTheme.semanticContrastRatio).toBeGreaterThan(EDGE_NON_TEXT_MIN_CONTRAST);
    expect(highContrastTheme.kind).toBe('underlay');
  });

  it('composites alpha colors before deciding whether a boundary is required', () => {
    const decision = resolveEdgeContrastPaint({
      stroke: 'rgba(71, 202, 204, 0.5)',
      strokeWidth: '2px',
      canvasBackground: 'rgb(255, 255, 255)',
    });

    expect(decision.kind).toBe('underlay');
    expect(decision.semanticContrastRatio).not.toBeNull();
    expect(decision.semanticContrastRatio ?? Infinity).toBeLessThan(EDGE_NON_TEXT_MIN_CONTRAST);
    if (decision.kind !== 'underlay') throw new Error('Expected an underlay decision');
    expect(decision.effectiveSemanticOpacity).toBeCloseTo(0.5, 3);
  });

  it('composes explicit style and ancestor opacity before judging the semantic stroke', () => {
    const explicitOpacity = resolveEdgeContrastPaint({
      stroke: '#FF5722',
      strokeWidth: 3,
      canvasBackground: '#ffffff',
      opacity: 0.5,
      ancestorOpacity: 0.8,
    });

    expect(explicitOpacity.kind).toBe('underlay');
    if (explicitOpacity.kind !== 'underlay') throw new Error('Expected an underlay decision');
    expect(explicitOpacity.effectiveSemanticOpacity).toBeCloseTo(0.4, 3);
    expect(explicitOpacity.effectiveBoundaryOpacity).toBeCloseTo(0.8, 3);
    expect(explicitOpacity.semanticContrastRatio).toBeLessThan(EDGE_NON_TEXT_MIN_CONTRAST);
    expect(explicitOpacity.underlayContrastRatio).toBeGreaterThanOrEqual(EDGE_NON_TEXT_MIN_CONTRAST);
  });

  it('uses an extreme neutral only when inherited opacity makes the preferred slate insufficient', () => {
    const decision = resolveEdgeContrastPaint({
      stroke: '#47CACC',
      strokeWidth: 2,
      canvasBackground: '#ffffff',
      ancestorOpacity: 0.42,
    });

    expect(decision.kind).toBe('underlay');
    if (decision.kind !== 'underlay') throw new Error('Expected an underlay decision');
    expect(decision.underlayColor).toBe('#000000');
    expect(decision.underlayContrastRatio).toBeGreaterThanOrEqual(EDGE_NON_TEXT_MIN_CONTRAST);
  });

  it.each([
    { opacity: 0, ancestorOpacity: 1 },
    { opacity: -10, ancestorOpacity: 1 },
    { opacity: Number.NaN, ancestorOpacity: 1 },
    { opacity: 'invalid', ancestorOpacity: 1 },
    { opacity: 1, ancestorOpacity: Number.POSITIVE_INFINITY },
    { opacity: 1, ancestorOpacity: 0.05 },
  ])('fails closed when opacity is empty, invalid, or cannot support a 3:1 boundary: %o', values => {
    expect(resolveEdgeContrastPaint({
      stroke: '#47CACC',
      strokeWidth: 2,
      canvasBackground: '#ffffff',
      ...values,
    })).toEqual({ kind: 'unresolved', semanticContrastRatio: null });
  });

  it('clamps an extreme positive opacity to the CSS maximum', () => {
    const decision = resolveEdgeContrastPaint({
      stroke: '#FF5722',
      strokeWidth: 3,
      canvasBackground: '#ffffff',
      opacity: 10_000,
    });

    expect(decision.kind).toBe('sufficient');
    if (decision.kind !== 'sufficient') throw new Error('Expected sufficient contrast');
    expect(decision.effectiveSemanticOpacity).toBe(1);
  });

  it.each([
    ['', '#ffffff'],
    ['not-a-color', '#ffffff'],
    ['url(javascript:alert(1))', '#ffffff'],
    [`#${'1'.repeat(128)}`, '#ffffff'],
    ['#47CACC', 'var(--unresolved-canvas)'],
  ])('fails closed for invalid or unresolved paint input', (stroke, canvasBackground) => {
    expect(resolveEdgeContrastPaint({ stroke, strokeWidth: 2, canvasBackground })).toEqual({
      kind: 'unresolved',
      semanticContrastRatio: null,
    });
  });

  it('bounds empty, zero, non-finite, and extreme widths without changing the contrast decision', () => {
    const widths = [
      { value: undefined, expected: 3.5 },
      { value: 0, expected: 2.5 },
      { value: Number.POSITIVE_INFINITY, expected: 3.5 },
      { value: 1_000_000, expected: 66 },
    ];

    widths.forEach(({ value, expected }) => {
      const decision = resolveEdgeContrastPaint({
        stroke: '#47CACC',
        strokeWidth: value,
        canvasBackground: '#ffffff',
      });
      expect(decision.kind).toBe('underlay');
      if (decision.kind !== 'underlay') throw new Error('Expected an underlay decision');
      expect(decision.underlayStrokeWidth).toBe(expected);
    });
  });
});
