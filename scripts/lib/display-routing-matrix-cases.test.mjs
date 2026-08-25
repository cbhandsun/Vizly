import { describe, expect, it } from 'vitest';

import {
  createDisplayRoutingMatrixCaseIds,
  DISPLAY_ROUTING_LAYOUT_CASES,
  DISPLAY_ROUTING_TOPOLOGY_CASE_ID,
  findDisplayRoutingMenuElementByKey,
  parseDisplayRoutingMatrixCase,
} from './display-routing-matrix-cases.mjs';

describe('display routing matrix cases', () => {
  it('covers every layout action currently exposed by the flowchart toolbar', () => {
    expect(DISPLAY_ROUTING_LAYOUT_CASES.map(layoutCase => layoutCase.id)).toEqual([
      'domain-compound-elk-tb',
      'domain-compound-elk-bt',
      'domain-compound-elk-lr',
      'domain-compound-elk-rl',
      'domain-lanes-tb',
      'domain-lanes-bt',
      'domain-lanes-lr',
      'domain-lanes-rl',
      'domain-elk-tb',
      'domain-elk-bt',
      'domain-elk-lr',
      'domain-elk-rl',
      'tree-tb',
      'tree-bt',
      'tree-lr',
      'tree-rl',
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
    expect(parseDisplayRoutingMatrixCase(DISPLAY_ROUTING_TOPOLOGY_CASE_ID, knownCaseIds))
      .toBe(DISPLAY_ROUTING_TOPOLOGY_CASE_ID);
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

  it('finds Ant menu actions by stable key without depending on translated text', () => {
    const translatedTreeItem = {
      getAttribute: name => name === 'data-menu-id' ? 'rc-menu-uuid-tree-lr' : null,
      textContent: 'Tree (left to right)',
    };
    const unrelatedItem = {
      getAttribute: name => name === 'data-menu-id' ? 'rc-menu-uuid-tree-tb' : null,
    };

    expect(findDisplayRoutingMenuElementByKey(
      [unrelatedItem, translatedTreeItem],
      'tree-lr',
    )).toBe(translatedTreeItem);
    expect(findDisplayRoutingMenuElementByKey([translatedTreeItem], 'tree-rl')).toBeNull();
    expect(findDisplayRoutingMenuElementByKey([translatedTreeItem], '')).toBeNull();
    expect(findDisplayRoutingMenuElementByKey(
      [translatedTreeItem],
      'x'.repeat(10_000),
    )).toBeNull();
  });
});
