import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertRequestedLayoutSelected, clickLayout } from './display-routing-matrix-layout-command.mjs';
import { parseSavedDisplayRoutingMode, readSavedDisplayRoutingState } from './display-routing-saved-roundtrip.mjs';

import {
  createDisplayRoutingMatrixCaseIds,
  displayRoutingLayoutSelectionMatches,
  DISPLAY_ROUTING_LAYOUT_CASES,
  DISPLAY_ROUTING_TOPOLOGY_CASE_ID,
  findDisplayRoutingMenuElementByKey,
  parseDisplayRoutingMatrixCase,
  parseDisplayRoutingMatrixCaseList,
  parseDisplayRoutingMatrixPreset,
  parseDisplayRoutingMatrixTimeoutMs,
  resolveDisplayRoutingConnectedDragDelta,
  resolveDisplayRoutingMenuPointerTarget,
  parseDisplayRoutingMatrixViewport,
} from './display-routing-matrix-cases.mjs';

describe('display routing matrix cases', () => {
  it('runs both ordinary saved-document regressions in the main CI build job', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    const savedStep = workflow.split('- name: Verify ordinary saved diagram recovery')[1]?.split('\n  tests:')[0];
    expect(savedStep).toBeDefined();
    expect(savedStep).toContain("DISPLAY_ROUTING_MATRIX_SAVED_RELOAD = 'initial'");
    expect(savedStep).toContain("DISPLAY_ROUTING_MATRIX_SAVED_RELOAD = 'layout'");
    expect(savedStep).toContain("DISPLAY_ROUTING_MATRIX_PRESET = 'wms-process-flow-v1'");
    expect(savedStep).toContain("DISPLAY_ROUTING_MATRIX_PRESET = 'logistics-architecture-v1'");
    expect(savedStep.match(/npm run verify:display-routing-matrix/g)).toHaveLength(2);
    expect(savedStep.match(/if \(\$LASTEXITCODE -ne 0\)/g)).toHaveLength(2);
    expect(savedStep).toContain('finally {');
    expect(savedStep).toContain('Stop-Process -Id $savedPreview.Id');
    expect(savedStep).not.toContain('continue-on-error');
  });

  it('requires an explicit supported saved-document scenario', () => {
    expect(parseSavedDisplayRoutingMode()).toBeNull();
    expect(parseSavedDisplayRoutingMode('')).toBeNull();
    expect(parseSavedDisplayRoutingMode('initial')).toBe('initial');
    expect(parseSavedDisplayRoutingMode('layout')).toBe('layout');
    for (const invalid of ['true', '1', [], {}, null, 'layout'.repeat(2000)]) {
      expect(() => parseSavedDisplayRoutingMode(invalid)).toThrow('DISPLAY_ROUTING_MATRIX_SAVED_RELOAD');
    }
  });

  it('requires a durable route snapshot, exact geometry/topology and the actual saved edit', () => {
    const nodes = [{ id: 'source', position: { x: 0, y: 0 }, width: 100, height: 60 },
      { id: 'target', position: { x: 300, y: 0 }, measured: { width: 100, height: 60 } }];
    const edges = [{ id: 'edge', source: 'source', target: 'target', label: 'saved-check' }];
    const saved = { nodes, edges, routingSnapshot: { candidate: { hardClean: true } } };
    const raw = JSON.stringify(saved);
    expect(readSavedDisplayRoutingState(raw, nodes, edges, 'edge')).toMatchObject({ nodeCount: 2, edgeCount: 1 });
    expect(readSavedDisplayRoutingState(raw, structuredClone(nodes), structuredClone(edges))).not.toBeNull();
    for (const changed of [[], nodes.map(node => ({ ...node, position: { x: 0.0001, y: 0 } })),
      nodes.map(node => ({ ...node, measured: { width: 101, height: 60 } })),
      nodes.map(node => ({ ...node, parentId: 'other' }))]) {
      expect(readSavedDisplayRoutingState(raw, changed, edges)).toBeNull();
    }
    expect(readSavedDisplayRoutingState(raw, nodes, [{ ...edges[0], target: 'source' }])).toBeNull();
    expect(readSavedDisplayRoutingState(raw, nodes, [{ ...edges[0], label: 'old' }], 'edge')).toBeNull();
    expect(readSavedDisplayRoutingState(JSON.stringify({ ...saved, routingSnapshot: null }), nodes, edges)).toBeNull();
    expect(readSavedDisplayRoutingState(JSON.stringify({ ...saved, edges: [{ ...edges[0], label: 'old' }] }), nodes, edges, 'edge')).toBeNull();
  });

  it('fails closed on malformed, empty, unsafe-size or invalid saved geometry', () => {
    const node = { id: 'node', position: { x: 0, y: 0 }, width: 100, height: 60 };
    const edge = { id: 'edge', source: 'node', target: 'node' };
    const saved = { nodes: [node], edges: [edge], routingSnapshot: { candidate: { hardClean: true } } };
    for (const raw of [null, 1, {}, '', '{', 'null', '[]', 'x'.repeat(2 * 1024 * 1024 + 1)]) {
      expect(readSavedDisplayRoutingState(raw, [node], [edge])).toBeNull();
    }
    for (const nodes of [[], [node, node], [null], [{ ...node, id: 'x'.repeat(1025) }],
      [{ ...node, width: 0 }], [{ ...node, height: -1 }], [{ ...node, position: { x: Infinity, y: 0 } }],
      [{ ...node, position: { x: 1_000_001, y: 0 } }], Array(5001).fill(node)]) {
      expect(readSavedDisplayRoutingState(JSON.stringify({ ...saved, nodes }), nodes, [edge])).toBeNull();
    }
    for (const edges of [[], [null], [edge, edge], [{ ...edge, source: 'missing' }], Array(301).fill(edge)]) {
      expect(readSavedDisplayRoutingState(JSON.stringify({ ...saved, edges }), [node], edges)).toBeNull();
    }
    const safeId = { ...node, id: '__proto__' };
    const safeEdge = { ...edge, source: '__proto__', target: '__proto__' };
    expect(readSavedDisplayRoutingState(JSON.stringify({ ...saved, nodes: [safeId], edges: [safeEdge] }), [safeId], [safeEdge])).not.toBeNull();
    expect({}.polluted).toBeUndefined();
  });

  it('accepts bounded desktop and narrow viewport configurations', () => {
    expect(parseDisplayRoutingMatrixViewport()).toEqual({ width: 1600, height: 1200 });
    expect(parseDisplayRoutingMatrixViewport('1280x720')).toEqual({ width: 1280, height: 720 });
    expect(parseDisplayRoutingMatrixViewport('320x240')).toEqual({ width: 320, height: 240 });
    expect(parseDisplayRoutingMatrixViewport('3840x2160')).toEqual({ width: 3840, height: 2160 });
    for (const invalid of ['0x720', '319x720', '1280x239', '3841x2160', '1280x2161',
      '1280x720<script>', 'x'.repeat(100), {}, 1280, 'NaNx720']) {
      expect(() => parseDisplayRoutingMatrixViewport(invalid)).toThrow('Invalid DISPLAY_ROUTING_MATRIX_VIEWPORT');
    }
  });

  it('rejects hidden, clipped, covered and invalid pointer targets', () => {
    const viewport = { width: 1280, height: 720 };
    const rect = { left: 780, top: 100, width: 240, height: 44 };
    expect(resolveDisplayRoutingMenuPointerTarget(rect, viewport)).toEqual({ x: 900, y: 122 });
    expect(resolveDisplayRoutingMenuPointerTarget(rect, viewport, false)).toBeNull();
    for (const invalid of [null, {}, { ...rect, top: -106 }, { ...rect, left: -1 },
      { ...rect, width: 0 }, { ...rect, height: -1 }, { ...rect, top: 700 },
      { ...rect, left: 1200 }, { ...rect, width: Infinity }, { ...rect, top: NaN }]) {
      expect(resolveDisplayRoutingMenuPointerTarget(invalid, viewport)).toBeNull();
    }
    expect(resolveDisplayRoutingMenuPointerTarget(rect, null)).toBeNull();
    expect(resolveDisplayRoutingMenuPointerTarget(rect, { width: 0, height: 720 })).toBeNull();
  });

  it('uses pointer events instead of invoking an offscreen DOM click', async () => {
    const session = {
      evaluate: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce({ x: 120, y: 90, clickedAt: 123 }),
      send: vi.fn().mockResolvedValue(undefined),
    };
    await expect(clickLayout(session, { id: 'domain-compound-elk-bt' })).resolves.toBe(123);
    expect(session.send.mock.calls.map(call => call[1].type)).toEqual(['mouseMoved', 'mousePressed', 'mouseReleased']);
    expect(session.evaluate.mock.calls[1][0]).not.toContain('item?.click()');
    const covered = { evaluate: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce({ inaccessible: true }), send: vi.fn() };
    await expect(clickLayout(covered, { id: 'domain-compound-elk-bt' })).rejects.toThrow('outside the viewport or covered');
    expect(covered.send).not.toHaveBeenCalled();
  });
  it('checks the applied layout in the live-session assertion', async () => {
    const correct = { evaluate: async () => ({ requested: 'Vertical swimlanes', applied: 'Auto Layout: Vertical swimlanes' }) };
    await expect(assertRequestedLayoutSelected(correct, 'domain-lanes-tb')).resolves.toBeUndefined();
    const fallback = { evaluate: async () => ({ requested: 'Vertical swimlanes', applied: 'Auto Layout: Complex process' }) };
    await expect(assertRequestedLayoutSelected(fallback, 'domain-lanes-tb')).rejects.toThrow('different layout');
    await expect(assertRequestedLayoutSelected(fallback, 'domain-compound-elk-bt')).rejects.toThrow('different layout');
    await expect(assertRequestedLayoutSelected({}, 'tree-tb')).resolves.toBeUndefined();
  });

  it('reports only known layout ids when selection verification fails', async () => {
    const mismatch = { evaluate: async () => ({
      requested: '泳道 · 域左右并列（域内上→下）',
      applied: '自动布局：复杂流程（保留域·上→下）',
    }) };
    await expect(assertRequestedLayoutSelected(mismatch, 'domain-lanes-tb')).rejects.toThrow(
      'requested=domain-lanes-tb, applied=domain-compound-elk-tb',
    );
    const unknown = { evaluate: async () => ({ requested: 'private diagram token=secret', applied: null }) };
    await expect(assertRequestedLayoutSelected(unknown, 'domain-lanes-tb')).rejects.toThrow(
      'domain-lanes-tb committed a different layout than requested (requested=unrecognized, applied=unrecognized)',
    );
  });

  it('fails the command when no toolbar trigger exists', async () => {
    await expect(clickLayout({ evaluate: async () => false }, { id: 'domain-lanes-tb' }))
      .rejects.toThrow('trigger was not found');
  });

  it('rejects silent compound fallback even when its routes committed cleanly', () => {
    expect(displayRoutingLayoutSelectionMatches('Vertical swimlanes', 'Auto Layout: Vertical swimlanes + Automatic layered')).toBe(true);
    expect(displayRoutingLayoutSelectionMatches('Vertical swimlanes', 'Auto Layout: Complex process')).toBe(false);
    expect(displayRoutingLayoutSelectionMatches('Horizontal swimlanes', 'Auto Layout: Vertical swimlanes')).toBe(false);
    expect(displayRoutingLayoutSelectionMatches('  Vertical\n swimlanes ', 'Auto Layout: Vertical swimlanes')).toBe(true);
    for (const malformed of ['', undefined, null, {}, 'x'.repeat(1025)]) {
      expect(displayRoutingLayoutSelectionMatches(malformed, 'Auto Layout: Vertical swimlanes')).toBe(false);
      expect(displayRoutingLayoutSelectionMatches('Vertical swimlanes', malformed)).toBe(false);
    }
  });
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
    const fullSequence = DISPLAY_ROUTING_LAYOUT_CASES.slice(1).map(item => item.id).join(',');
    expect(parseDisplayRoutingMatrixCaseList(
      fullSequence,
      known,
      DISPLAY_ROUTING_LAYOUT_CASES.length - 1,
    )).toHaveLength(15);
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
