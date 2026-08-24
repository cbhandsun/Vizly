import { describe, expect, it } from 'vitest';

import {
  createDisplayRoutingMatrixCaseIds,
  DISPLAY_ROUTING_LAYOUT_CASES,
  parseDisplayRoutingMatrixCase,
} from './display-routing-matrix-cases.mjs';

describe('display routing matrix cases', () => {
  it('covers every layout action currently exposed by the flowchart toolbar', () => {
    expect(DISPLAY_ROUTING_LAYOUT_CASES.map(layoutCase => layoutCase.id)).toEqual([
      'domain-compound-elk-tb',
      'domain-compound-elk-lr',
      'domain-lanes-tb',
      'domain-lanes-lr',
      'domain-elk-tb',
      'domain-elk-bt',
      'domain-elk-lr',
      'domain-elk-rl',
      'tree-tb',
      'tree-lr',
    ]);
    expect(new Set(DISPLAY_ROUTING_LAYOUT_CASES.map(layoutCase => layoutCase.label)).size)
      .toBe(DISPLAY_ROUTING_LAYOUT_CASES.length);
  });

  it('accepts a known preset or layout id and trims surrounding whitespace', () => {
    const knownCaseIds = createDisplayRoutingMatrixCaseIds(['canonical-preset']);

    expect(parseDisplayRoutingMatrixCase(' canonical-preset ', knownCaseIds))
      .toBe('canonical-preset');
    expect(parseDisplayRoutingMatrixCase(' domain-lanes-tb ', knownCaseIds))
      .toBe('domain-lanes-tb');
    expect(parseDisplayRoutingMatrixCase('', knownCaseIds)).toBe('');
    expect(parseDisplayRoutingMatrixCase(undefined, knownCaseIds)).toBe('');
  });

  it('fails closed without reflecting malformed or oversized environment input', () => {
    const knownCaseIds = createDisplayRoutingMatrixCaseIds([]);

    expect(() => parseDisplayRoutingMatrixCase('not-a-case', knownCaseIds))
      .toThrowError('Unknown DISPLAY_ROUTING_MATRIX_CASE');
    expect(() => parseDisplayRoutingMatrixCase('x'.repeat(10_000), knownCaseIds))
      .toThrowError('Unknown DISPLAY_ROUTING_MATRIX_CASE');
  });
});
