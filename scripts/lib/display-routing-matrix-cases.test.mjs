import { describe, expect, it } from 'vitest';

import {
  createDisplayRoutingMatrixCaseIds,
  DISPLAY_ROUTING_LAYOUT_CASES,
  DISPLAY_ROUTING_TOPOLOGY_CASE_ID,
  findDisplayRoutingMenuElementByKey,
  parseDisplayRoutingMatrixCase,
  parseDisplayRoutingMatrixCaseList,
  parseDisplayRoutingMatrixPreset,
  parseDisplayRoutingMatrixTimeoutMs,
  resolveDisplayRoutingConnectedDragDelta,
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

  it('selects a validated layout preset and preserves the default', () => {
    const knownPresetIds = new Set(['small-preset', 'large-preset']);

    expect(parseDisplayRoutingMatrixPreset(undefined, knownPresetIds, 'small-preset'))
      .toBe('small-preset');
    expect(parseDisplayRoutingMatrixPreset(' large-preset ', knownPresetIds, 'small-preset'))
      .toBe('large-preset');
    expect(() => parseDisplayRoutingMatrixPreset('unknown', knownPresetIds, 'small-preset'))
      .toThrowError('Unknown DISPLAY_ROUTING_MATRIX_PRESET');
    expect(() => parseDisplayRoutingMatrixPreset('x'.repeat(10_000), knownPresetIds, 'small-preset'))
      .toThrowError('Unknown DISPLAY_ROUTING_MATRIX_PRESET');
  });

  it('parses a bounded matrix wait timeout', () => {
    expect(parseDisplayRoutingMatrixTimeoutMs(undefined)).toBe(120_000);
    expect(parseDisplayRoutingMatrixTimeoutMs(' 45000 ')).toBe(45_000);
    expect(() => parseDisplayRoutingMatrixTimeoutMs('999'))
      .toThrowError('Invalid DISPLAY_ROUTING_MATRIX_WAIT_TIMEOUT_MS');
    expect(() => parseDisplayRoutingMatrixTimeoutMs('Infinity'))
      .toThrowError('Invalid DISPLAY_ROUTING_MATRIX_WAIT_TIMEOUT_MS');
    expect(() => parseDisplayRoutingMatrixTimeoutMs('120001'))
      .toThrowError('Invalid DISPLAY_ROUTING_MATRIX_WAIT_TIMEOUT_MS');
  });

  it('parses a bounded unique sequence of warm layout cases', () => {
    const known = new Set(DISPLAY_ROUTING_LAYOUT_CASES.map(layoutCase => layoutCase.id));
    expect(parseDisplayRoutingMatrixCaseList(
      ' domain-elk-rl,tree-bt,domain-lanes-lr ',
      known,
    )).toEqual(['domain-elk-rl', 'tree-bt', 'domain-lanes-lr']);
    expect(parseDisplayRoutingMatrixCaseList('', known)).toEqual([]);
    expect(() => parseDisplayRoutingMatrixCaseList('tree-bt,tree-bt', known)).toThrow();
    expect(() => parseDisplayRoutingMatrixCaseList('unknown', known)).toThrow();
    expect(() => parseDisplayRoutingMatrixCaseList('x'.repeat(2_000), known)).toThrow();
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

  it('moves the incremental probe away from the dominant connected-node centroid', () => {
    const origin = {
      id: 'origin',
      position: { x: 100, y: 100 },
      measured: { width: 100, height: 60 },
    };
    const horizontal = resolveDisplayRoutingConnectedDragDelta([
      origin,
      { id: 'right', position: { x: 300, y: 100 }, width: 100, height: 60 },
      { id: 'lower-right', position: { x: 260, y: 180 }, width: 100, height: 60 },
    ], [
      { source: 'origin', target: 'right' },
      { source: 'origin', target: 'lower-right' },
    ], 'origin');
    expect(horizontal).toEqual({ x: -40, y: 0 });

    const vertical = resolveDisplayRoutingConnectedDragDelta([
      origin,
      { id: 'above', positionAbsolute: { x: 100, y: -200 }, width: 100, height: 60 },
    ], [{ source: 'above', target: 'origin' }], 'origin', 500);
    expect(vertical).toEqual({ x: 0, y: 200 });
  });

  it('fails the drag-vector boundary closed for empty, malformed, and disconnected input', () => {
    expect(resolveDisplayRoutingConnectedDragDelta([], [], 'origin')).toBeNull();
    expect(resolveDisplayRoutingConnectedDragDelta([
      { id: 'origin', position: { x: Number.NaN, y: 0 } },
      { id: 'neighbor', position: { x: 10, y: 0 } },
    ], [{ source: 'origin', target: 'neighbor' }], 'origin')).toBeNull();
    expect(resolveDisplayRoutingConnectedDragDelta([
      { id: 'origin', position: { x: 0, y: 0 } },
    ], [], 'origin')).toBeNull();
    expect(resolveDisplayRoutingConnectedDragDelta(null, [], 'origin')).toBeNull();
    expect(resolveDisplayRoutingConnectedDragDelta([], [], 'x'.repeat(300))).toBeNull();
  });
});
