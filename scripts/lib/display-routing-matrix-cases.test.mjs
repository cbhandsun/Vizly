import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertRequestedLayoutSelected,
  clickLayout,
  displayRoutingLayoutParentMenuKey,
  readDisplayRoutingLayoutMenuDiagnostics,
} from './display-routing-matrix-layout-command.mjs';
import {
  parseSavedDisplayRoutingMode,
  readSavedDisplayRoutingState,
  verifySavedDisplayRoutingRoundtrip,
} from './display-routing-saved-roundtrip.mjs';

import {
  createDisplayRoutingMatrixCaseIds,
  displayRoutingLayoutSelectionMatches,
  DISPLAY_ROUTING_LAYOUT_CASES,
  DISPLAY_ROUTING_MULTI_PAGE_CASE_ID,
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
    expect(savedStep).toContain("DISPLAY_ROUTING_MATRIX_CASE = 'multi-page-roundtrip'");
    expect(savedStep).toContain("DISPLAY_ROUTING_MATRIX_CASE = 'topology-edit-cycle'");
    expect(savedStep).toContain("DISPLAY_ROUTING_MATRIX_CASE = 'business-edit-stability'");
    expect(savedStep).toContain("DISPLAY_ROUTING_MATRIX_CASE = 'swimlane-edit-stability'");
    expect(savedStep.match(/npm run verify:display-routing-matrix/g)).toHaveLength(6);
    expect(savedStep).toContain('node scripts/verify-startup-failures.mjs');
    expect(savedStep.match(/if \(\$LASTEXITCODE -ne 0\)/g)).toHaveLength(7);
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

  it('compares saved manual label coordinates, offsets and text without trusting generated positions', () => {
    const nodes = [{ id: 'a', position: { x: 0, y: 0 }, width: 100, height: 60 }];
    const edge = { id: 'e', source: 'a', target: 'a', label: 'manual',
      data: { labelPosition: { x: 110, y: -30 }, labelOffset: { x: 12, y: -4 }, absoluteLabelX: 140 } };
    const raw = JSON.stringify({ nodes, edges: [edge], routingSnapshot: { candidate: { hardClean: true } } });
    expect(readSavedDisplayRoutingState(raw, nodes, [structuredClone(edge)])).not.toBeNull();
    for (const patch of [{ labelPosition: { x: 111, y: -30 } }, { labelOffset: { x: 12, y: 0 } },
      { absoluteLabelX: 141 }, { labelOffset: { x: NaN, y: 0 } }]) {
      expect(readSavedDisplayRoutingState(raw, nodes, [{ ...edge, data: { ...edge.data, ...patch } }])).toBeNull();
    }
    expect(readSavedDisplayRoutingState(raw, nodes, [{ ...edge, label: 'changed' }])).toBeNull();
    const generated = { ...edge, data: { labelPosition: { x: 10, y: 20, adjusted: false } } };
    const generatedRaw = JSON.stringify({ nodes, edges: [generated], routingSnapshot: { candidate: { hardClean: true } } });
    expect(readSavedDisplayRoutingState(generatedRaw, nodes, [{ ...generated,
      data: { labelPosition: { x: 500, y: 600, adjusted: true } } }])).not.toBeNull();
  });

  it('waits for restored route visuals to settle before auditing saved reload labels', async () => {
    const events = [];
    let visualSample = 0;
    const state = {
      geometry: 'same-geometry',
      topology: 'same-topology',
      annotations: 'same-annotations',
      nodeCount: 2,
      edgeCount: 1,
    };
    const restoredRoute = {
      routing: { requestId: 'saved-request-1' },
      request: { nodes: [{ id: 'source' }, { id: 'target' }] },
      response: { edges: [{ id: 'edge' }] },
    };
    const session = {
      evaluate: vi.fn(async expression => {
        if (expression === 'window.__vizlyRequestedLayoutLabel ?? null') return null;
        if (expression === 'window.__vizlySavedReloadSentinel = true') return true;
        if (String(expression).includes('const readSnapshot =')) {
          events.push('visual-settle');
          visualSample += 1;
          return {
            ready: true,
            requestId: 'saved-request-1',
            committedRouteSignature: null,
            nodeCount: 2,
            edgeCount: 1,
            renderedNodeCount: 2,
            renderedEdgeCount: 1,
            renderedPathCount: 1,
            nodeGeometryFingerprint: 'nodes',
            pathFingerprint: 'paths',
            viewport: { x: 0, y: 0, zoom: 1 },
            sampledAt: visualSample * 150,
          };
        }
        if (String(expression).includes('flowchart-autosave-v2-saved-preset')) return state;
        return null;
      }),
      send: vi.fn(async () => undefined),
    };
    const waitForValue = vi.fn(async (_session, _expression, label) => {
      events.push(label);
      if (label === 'durable routing snapshot') return state;
      if (label === 'new saved document') return true;
      if (label === 'saved final route') return restoredRoute;
      return null;
    });
    const auditFinalSvg = vi.fn(async () => {
      events.push('audit');
      return { visualAudit: { labelLabelOverlapCount: 0 } };
    });

    await expect(verifySavedDisplayRoutingRoundtrip({
      session,
      presetId: 'saved-preset',
      semanticChains: [],
      waitForValue,
      readFinalRouteExpression: () => 'final-route-expression',
      auditFinalSvg,
      visualSettleTimeoutMs: 1_000,
    })).resolves.toMatchObject({ status: 'passed' });

    expect(events).toEqual([
      'durable routing snapshot',
      'new saved document',
      'saved final route',
      'visual-settle',
      'visual-settle',
      'visual-settle',
      'audit',
    ]);
    expect(session.evaluate.mock.calls.some(([expression]) => (
      String(expression).includes('"expectedRequestId":"saved-request-1"')
      && String(expression).includes('"expectedNodeCount":2')
      && String(expression).includes('"expectedEdgeCount":1')
    ))).toBe(true);
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

  it('prefers a visible menu item when rc-menu keeps hidden clones with the same key', () => {
    const hidden = {
      getAttribute: name => name === 'data-menu-id' ? 'rc-menu-uuid-domain-elk-bt' : null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    };
    const visible = {
      getAttribute: name => name === 'data-menu-id' ? 'rc-menu-uuid-domain-elk-bt' : null,
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 30 }),
    };
    vi.stubGlobal('getComputedStyle', element => ({
      display: element === hidden ? 'none' : 'block',
      visibility: 'visible',
    }));
    expect(findDisplayRoutingMenuElementByKey([hidden, visible], 'domain-elk-bt')).toBe(visible);
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
    expect(session.evaluate.mock.calls[1][0]).toContain('.flowchart-layout-submenu-popup [data-menu-id]');
    const covered = { evaluate: vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({ inaccessible: true })
      .mockResolvedValueOnce({ inaccessible: true }), send: vi.fn() };
    await expect(clickLayout(covered, { id: 'domain-compound-elk-bt' })).rejects.toThrow('outside the viewport or covered');
    expect(covered.send).not.toHaveBeenCalled();

    const scrollSettled = { evaluate: vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({ inaccessible: true })
      .mockResolvedValueOnce({ x: 140, y: 110, clickedAt: 456 }), send: vi.fn().mockResolvedValue(undefined) };
    await expect(clickLayout(scrollSettled, { id: 'tree-tb' })).resolves.toBe(456);
    expect(scrollSettled.send).toHaveBeenCalledTimes(3);
  });

  it('reveals the grouped swimlane menu before selecting its hidden item', async () => {
    const session = {
      evaluate: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ inaccessible: true })
        .mockResolvedValueOnce({ x: 180, y: 640 })
        .mockResolvedValueOnce({ x: 420, y: 640, clickedAt: 789 }),
      send: vi.fn().mockResolvedValue(undefined),
    };

    await expect(clickLayout(session, { id: 'domain-lanes-rl' })).resolves.toBe(789);
    expect(session.send.mock.calls.map(call => call[1].type)).toEqual([
      'mouseMoved',
      'mouseMoved',
      'mousePressed',
      'mouseReleased',
    ]);
    expect(session.evaluate.mock.calls[2][0]).toContain("item.scrollIntoView({ block: 'nearest'");
  });

  it('maps only the primary domain scenarios to their grouped menu parents', () => {
    expect(displayRoutingLayoutParentMenuKey('domain-dagre-tb')).toBe('group-standard-process');
    expect(displayRoutingLayoutParentMenuKey('domain-compound-elk-rl')).toBe('group-complex-process');
    expect(displayRoutingLayoutParentMenuKey('domain-lanes-lr')).toBe('group-swimlane-process');
    expect(displayRoutingLayoutParentMenuKey('domain-dagre-sub-horizontal-tb')).toBeUndefined();
    expect(displayRoutingLayoutParentMenuKey('tree-tb')).toBeUndefined();
    expect(displayRoutingLayoutParentMenuKey(undefined)).toBeUndefined();
  });

  it('falls back to clicking a grouped menu when hover does not mount its submenu', async () => {
    const session = {
      evaluate: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ x: 180, y: 640 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ x: 180, y: 640 })
        .mockResolvedValueOnce({ x: 420, y: 640, clickedAt: 987 }),
      send: vi.fn().mockResolvedValue(undefined),
    };

    await expect(clickLayout(session, { id: 'domain-compound-elk-bt' })).resolves.toBe(987);
    expect(session.send.mock.calls.map(call => call[1].type)).toEqual([
      'mouseMoved',
      'mouseMoved',
      'mousePressed',
      'mouseReleased',
      'mouseMoved',
      'mousePressed',
      'mouseReleased',
    ]);
  });

  it('uses keyboard expansion when a clicked grouped menu still has not mounted its submenu', async () => {
    const session = {
      evaluate: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ x: 180, y: 190 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ x: 180, y: 190 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ x: 420, y: 190, clickedAt: 654 }),
      send: vi.fn().mockResolvedValue(undefined),
    };

    await expect(clickLayout(session, { id: 'domain-lanes-lr' })).resolves.toBe(654);
    expect(session.send.mock.calls.filter(call => call[0] === 'Input.dispatchKeyEvent').map(call => call[1])).toMatchObject([
      { type: 'keyDown', key: 'ArrowRight' },
      { type: 'keyUp', key: 'ArrowRight' },
    ]);
  });
  it('checks the applied layout in the live-session assertion', async () => {
    const correct = { evaluate: async () => ({
      requested: '泳道 · 域左右并列（域内上→下）',
      applied: '自动布局：泳道 · 域左右并列（域内上→下）',
    }) };
    await expect(assertRequestedLayoutSelected(correct, 'domain-lanes-tb')).resolves.toBeUndefined();
    const fallback = { evaluate: vi.fn().mockResolvedValue({
      requested: '泳道 · 域左右并列（域内上→下）',
      applied: '自动布局：复杂流程（保留域·上→下）',
    }) };
    await expect(assertRequestedLayoutSelected(fallback, 'domain-lanes-tb')).rejects.toThrow('different layout');
    await expect(assertRequestedLayoutSelected(fallback, 'domain-compound-elk-bt')).rejects.toThrow('different layout');
    expect(fallback.evaluate).toHaveBeenCalledTimes(2);
    const standard = { evaluate: vi.fn().mockResolvedValue({
      requested: '标准流程（保留域·左→右）',
      applied: '自动布局',
      appliedKey: 'domain-dagre-lr',
    }) };
    await expect(assertRequestedLayoutSelected(standard, 'domain-dagre-lr')).resolves.toBeUndefined();
    expect(standard.evaluate).toHaveBeenCalledTimes(1);
    await expect(assertRequestedLayoutSelected({}, 'tree-tb')).resolves.toBeUndefined();
  });

  it('waits for the toolbar selection to commit after a restored page switch', async () => {
    const session = { evaluate: vi.fn()
      .mockResolvedValueOnce({ requested: '复杂流程（保留域·上→下）', applied: null })
      .mockResolvedValueOnce({
        requested: '复杂流程（保留域·上→下）',
        applied: '自动布局：复杂流程（保留域·上→下）',
      }) };

    await expect(assertRequestedLayoutSelected(session, 'domain-compound-elk-tb'))
      .resolves.toBeUndefined();
    expect(session.evaluate).toHaveBeenCalledTimes(2);
  });

  it('uses the stable toolbar layout key when translated status text has not settled', async () => {
    const session = { evaluate: vi.fn().mockResolvedValue({
      requested: '泳道 · 域左右并列（域内上→下）',
      applied: '自动布局',
      appliedKey: 'domain-lanes-tb',
    }) };

    await expect(assertRequestedLayoutSelected(session, 'domain-lanes-tb'))
      .resolves.toBeUndefined();
    expect(session.evaluate).toHaveBeenCalledTimes(1);
  });

  it('rejects a recognized wrong toolbar layout key without waiting', async () => {
    const session = { evaluate: vi.fn().mockResolvedValue({
      requested: '复杂流程（保留域·上→下）',
      applied: '自动布局',
      appliedKey: 'domain-lanes-lr',
    }) };

    await expect(assertRequestedLayoutSelected(session, 'domain-compound-elk-tb')).rejects.toThrow(
      'requested=domain-compound-elk-tb, applied=domain-lanes-lr',
    );
    expect(session.evaluate).toHaveBeenCalledTimes(1);
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
      'domain-lanes-tb committed a different layout than requested (requested=domain-lanes-tb, applied=unrecognized)',
    );
  });

  it('uses the requested case id when the clicked menu label is unavailable', async () => {
    const session = { evaluate: vi.fn().mockResolvedValue({
      requested: undefined,
      applied: '自动布局',
      appliedKey: 'domain-lanes-tb',
    }) };

    await expect(assertRequestedLayoutSelected(session, 'domain-lanes-tb'))
      .resolves.toBeUndefined();
    expect(session.evaluate).toHaveBeenCalledTimes(1);
  });

  it('fails the command when no toolbar trigger exists', async () => {
    await expect(clickLayout({ evaluate: async () => false }, { id: 'domain-lanes-tb' }))
      .rejects.toThrow('trigger was not found');
  });

  it('adds bounded menu diagnostics when a layout item is missing', async () => {
    const session = {
      evaluate: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce({
          caseId: 'domain-lanes-tb',
          menuItemCount: 2,
          target: null,
          more: { menuId: 'x-more-layout-engines', text: { length: 12 } },
          knownMenuIds: ['x-more-layout-engines'],
        }),
      send: vi.fn().mockResolvedValue(undefined),
    };

    await expect(clickLayout(session, {
      id: 'domain-lanes-tb',
      label: 'private label should not matter',
    })).rejects.toThrow(/"menuItemCount":2/);
    expect(session.evaluate).toHaveBeenCalledTimes(8);
  });

  it('summarizes menu state without returning raw labels', () => {
    const target = {
      tagName: 'DIV',
      textContent: 'secret menu label',
      getAttribute: name => name === 'data-menu-id' ? 'root-domain-lanes-tb' : null,
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 30 }),
    };
    const button = {
      tagName: 'BUTTON',
      textContent: 'secret trigger',
      getAttribute: name => name === 'aria-label' ? 'layout secret' : null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 50, height: 20 }),
    };
    const root = { tagName: 'DIV', getAttribute: () => null, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }) };
    vi.stubGlobal('getComputedStyle', () => ({ display: 'block', visibility: 'visible' }));
    vi.stubGlobal('document', {
      querySelectorAll: selector => (
        selector === 'button'
          ? [button]
          : selector === '.flowchart-layout-menu, .flowchart-layout-submenu-popup'
            ? [root]
            : [target]
      ),
      elementFromPoint: () => target,
    });

    const diagnostics = readDisplayRoutingLayoutMenuDiagnostics('domain-lanes-tb');
    expect(diagnostics).toMatchObject({
      menuRootCount: 1,
      menuItemCount: 1,
      target: {
        menuId: 'root-domain-lanes-tb',
        text: { length: 17 },
      },
      hitAtTargetCenter: {
        menuId: 'root-domain-lanes-tb',
      },
    });
    expect(JSON.stringify(diagnostics)).not.toContain('secret menu label');
    expect(JSON.stringify(diagnostics)).not.toContain('secret trigger');
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
      'domain-dagre-tb',
      'domain-dagre-bt',
      'domain-dagre-lr',
      'domain-dagre-rl',
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
    expect(parseDisplayRoutingMatrixCase(DISPLAY_ROUTING_MULTI_PAGE_CASE_ID, knownCaseIds))
      .toBe(DISPLAY_ROUTING_MULTI_PAGE_CASE_ID);
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
    )).toHaveLength(19);
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
