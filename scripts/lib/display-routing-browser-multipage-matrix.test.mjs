import { describe, expect, it, vi } from 'vitest';
import {
  displayRoutingMultiPageStateIsExpected,
  readDisplayRoutingMultiPageState,
  readDisplayRoutingMarkedLabelOffset,
} from './display-routing-browser-multipage-matrix.mjs';
import { verifyDisplayRoutingBrowserCases } from './display-routing-matrix-browser-cases.mjs';
import { parseLayoutSelection } from '../../src/core/components/diagrams/layoutSelectionPersistence';

const layout = (strategy, direction, nodeLayout = 'dagre') => ({
  version: 2,
  strategy,
  direction,
  nodeLayout,
  laneRankPreference: 'auto',
});

const decision = (direction, applied = 'global') => ({
  version: 1,
  policyVersion: 1,
  requested: 'auto',
  applied,
  reason: applied === 'global' ? 'global-preserved' : 'compact-benefit',
  direction,
  connectedInputFingerprint: 'fixture-fingerprint',
  metrics: {
    global: { flowLength: 1, whitespaceRatio: 0.1, backwardTravel: 0, backwardEdgeCount: 0 },
    compact: { flowLength: 1, whitespaceRatio: 0.2, backwardTravel: 0, backwardEdgeCount: 0 },
  },
});

const node = id => ({ id });
const edge = (id, source, target, label) => ({ id, source, target, ...(label ? { label } : {}) });

const createFixture = () => {
  const pages = [
    {
      id: 'page-1',
      name: 'Page 1',
      nodes: [node('first-a'), node('first-b')],
      edges: [{ ...edge('first-edge', 'first-a', 'first-b', 'multi-page-first'),
        data: { labelOffset: { x: 12, y: -4 } } }],
      layoutSelection: layout('domain-compound-elk', 'TB'),
    },
    {
      id: 'page-2',
      name: 'Page 1 copy',
      nodes: [node('copy-a'), node('copy-b')],
      edges: [{ ...edge('copy-edge', 'copy-a', 'copy-b', 'multi-page-copy'),
        data: { labelOffset: { x: -8, y: 6 } } }],
      layoutSelection: { ...layout('domain-lanes', 'LR'), laneRankDecision: decision('LR') },
    },
    {
      id: 'page-3',
      name: 'Page 3',
      nodes: [],
      edges: [],
      layoutSelection: layout('domain-dagre', 'TB'),
    },
  ];
  return {
    pages,
    raw: JSON.stringify({ metadata: { multiPage: { version: 1, activePageId: 'page-2', pages } } }),
    tabs: pages.map((page, index) => ({ name: page.name, selected: index === 1 })),
  };
};

describe('display routing browser multi-page matrix', () => {
  it('finds the edited label after layout/reload reorders and duplication renames edges', () => {
    const edited = { id: 'copy-id', label: 'multi-page-copy', data: { labelOffset: { x: -8, y: 6 } } };
    for (const edges of [[edited, { id: 'other' }], [{ id: 'other' }, edited]]) {
      expect(readDisplayRoutingMarkedLabelOffset(edges, 'multi-page-copy')).toEqual({ x: -8, y: 6 });
    }
    expect(readDisplayRoutingMarkedLabelOffset([edited, edited], 'multi-page-copy')).toBeNull();
    expect(readDisplayRoutingMarkedLabelOffset([edited], 'multi-page-first')).toBeNull();
  });

  it.each([undefined, null, [], {}, '[]', Array(10_001).fill(null)])('rejects missing or invalid edge lists', edges => {
    expect(readDisplayRoutingMarkedLabelOffset(edges, 'multi-page-copy')).toBeNull();
  });

  it.each([undefined, null, [], {}, { x: '6', y: 1 }, { x: NaN, y: 1 },
    { x: 1, y: Infinity }, { x: 1001, y: 0 }, { x: 0, y: -1001 },
    { x: '<img src=x onerror=alert(1)>', y: 0 },
  ])('rejects invalid label offsets without interpreting content', labelOffset => {
    expect(readDisplayRoutingMarkedLabelOffset([
      { label: 'multi-page-copy', data: { labelOffset } },
    ], 'multi-page-copy')).toBeNull();
  });

  it.each([null, '', 42, 'x'.repeat(1025)])('rejects an invalid marker', marker => {
    expect(readDisplayRoutingMarkedLabelOffset([], marker)).toBeNull();
  });

  it('accepts bounded zero and signed offsets', () => {
    for (const labelOffset of [{ x: 0, y: 0 }, { x: -1000, y: 1000 }]) {
      expect(readDisplayRoutingMarkedLabelOffset([
        { label: 'marker', data: { labelOffset } },
      ], 'marker')).toEqual(labelOffset);
    }
  });

  it('runs only the requested production-browser scenario', async () => {
    const verifyBusinessEdits = vi.fn();
    const verifyTopology = vi.fn(async () => ({ id: 'topology-edit-cycle' }));
    const verifyMultiPage = vi.fn(async options => {
      await options.waitForInitialRoute('session', 'initial');
      await options.waitForLayoutRoute('session', 7, 'layout');
      return { id: 'multi-page-roundtrip' };
    });
    const waitForValue = vi.fn(async (_session, expression, label) => ({ expression, label }));
    const readFinalRouteExpression = vi.fn((prefix, jobId) => `${prefix || 'initial'}:${jobId ?? ''}`);
    const common = {
      baseUrl: 'http://127.0.0.1:4173',
      prepareSession: vi.fn(),
      waitForValue,
      readFinalRouteExpression,
      auditFinalSvg: vi.fn(),
      verifyTopology,
      verifyMultiPage,
      verifyBusinessEdits,
    };
    await expect(verifyDisplayRoutingBrowserCases({
      ...common,
      requestedCase: 'multi-page-roundtrip',
    })).resolves.toEqual({
      topologyResults: [],
      multiPageResults: [{ id: 'multi-page-roundtrip' }],
      businessEditResults: [],
    });
    expect(verifyTopology).not.toHaveBeenCalled();
    expect(waitForValue).toHaveBeenNthCalledWith(1, 'session', 'initial:', 'initial initial route');
    expect(waitForValue).toHaveBeenNthCalledWith(2, 'session', 'layout::7', 'layout layout route');

    verifyMultiPage.mockClear();
    await expect(verifyDisplayRoutingBrowserCases({
      ...common,
      requestedCase: 'topology-edit-cycle',
    })).resolves.toEqual({
      topologyResults: [{ id: 'topology-edit-cycle' }],
      multiPageResults: [],
      businessEditResults: [],
    });
    expect(verifyTopology).toHaveBeenCalledTimes(1);
    expect(verifyMultiPage).not.toHaveBeenCalled();
    expect(verifyBusinessEdits).not.toHaveBeenCalled();
  });

  it('accepts isolated page content, layouts and markers after a durable reload', () => {
    const fixture = createFixture();
    const state = readDisplayRoutingMultiPageState(
      fixture.raw,
      fixture.tabs,
      fixture.pages[1].nodes,
      fixture.pages[1].edges,
    );
    expect(state).toMatchObject({ activeIndex: 1 });
    expect(displayRoutingMultiPageStateIsExpected(state)).toBe(true);
    expect(state.pages.map(page => page.markers)).toEqual([
      ['multi-page-first'],
      ['multi-page-copy'],
      [],
    ]);
  });

  it('allows layout-generated container counts to differ while preserving business nodes', () => {
    const fixture = createFixture();
    fixture.pages[0].nodes.push({ id: 'generated-domain', type: 'titleGroup' });
    fixture.raw = JSON.stringify({ metadata: { multiPage: {
      version: 1, activePageId: 'page-2', pages: fixture.pages,
    } } });
    const state = readDisplayRoutingMultiPageState(
      fixture.raw, fixture.tabs, fixture.pages[1].nodes, fixture.pages[1].edges,
    );
    expect(state?.pages.map(page => page.nodeIds.length)).toEqual([3, 2, 0]);
    expect(state?.pages.slice(0, 2).map(page => page.contentNodeIds)).toEqual([
      ['first-a', 'first-b'],
      ['copy-a', 'copy-b'],
    ]);
    expect(displayRoutingMultiPageStateIsExpected(state)).toBe(true);
  });

  it('rejects stale tabs, active canvas drift, dangling edges and duplicated ids', () => {
    const fixture = createFixture();
    const read = (raw = fixture.raw, tabs = fixture.tabs, nodes = fixture.pages[1].nodes,
      edges = fixture.pages[1].edges) => readDisplayRoutingMultiPageState(raw, tabs, nodes, edges);
    expect(read(fixture.raw, fixture.tabs.map(tab => ({ ...tab, selected: false })))).toBeNull();
    expect(read(fixture.raw, fixture.tabs.map((tab, index) => ({ ...tab, name: index ? tab.name : 'stale' })))).toBeNull();
    expect(read(fixture.raw, fixture.tabs, [node('wrong')])).toBeNull();
    const dangling = structuredClone(JSON.parse(fixture.raw));
    dangling.metadata.multiPage.pages[0].edges[0].target = 'missing';
    expect(read(JSON.stringify(dangling))).toBeNull();
    const duplicate = structuredClone(JSON.parse(fixture.raw));
    duplicate.metadata.multiPage.pages[1].nodes[1].id = 'copy-a';
    expect(read(JSON.stringify(duplicate))).toBeNull();
  });

  it('keeps bounded label offsets isolated per page and fails closed on corruption', () => {
    const fixture = createFixture();
    const read = (raw, nodes = fixture.pages[1].nodes, edges = fixture.pages[1].edges) => (
      readDisplayRoutingMultiPageState(raw, fixture.tabs, nodes, edges)
    );
    const persisted = JSON.parse(fixture.raw);
    expect(read(fixture.raw)?.pages.map(page => page.labelOffsets)).toEqual([
      [{ edgeId: 'first-edge', x: 12, y: -4 }],
      [{ edgeId: 'copy-edge', x: -8, y: 6 }],
      [],
    ]);
    expect(read(fixture.raw)?.pages[1].labelOffsets).not.toEqual(
      read(fixture.raw)?.pages[0].labelOffsets,
    );

    const missing = structuredClone(persisted);
    delete missing.metadata.multiPage.pages[1].edges[0].data.labelOffset;
    const missingCurrentEdges = structuredClone(fixture.pages[1].edges);
    delete missingCurrentEdges[0].data.labelOffset;
    expect(read(JSON.stringify(missing), fixture.pages[1].nodes, missingCurrentEdges)).not.toBeNull();
    for (const labelOffset of [null, { x: 'bad', y: 6 }, { x: NaN, y: 6 }, { x: 1001, y: 0 }]) {
      const corrupt = structuredClone(persisted);
      corrupt.metadata.multiPage.pages[1].edges[0].data.labelOffset = labelOffset;
      expect(read(JSON.stringify(corrupt))).toBeNull();
    }
    const malformedId = structuredClone(persisted);
    malformedId.metadata.multiPage.pages[1].edges[0].id = { bad: true };
    expect(() => read(JSON.stringify(malformedId))).not.toThrow();
    expect(read(JSON.stringify(malformedId))).toBeNull();

    const polluted = structuredClone(persisted);
    polluted.metadata.multiPage.pages[1].edges[0].data.labelOffset = { x: 12, y: -4 };
    expect(read(JSON.stringify(polluted))).toBeNull();
  });

  it('fails closed for malformed, empty, oversized and invalid layout input', () => {
    const fixture = createFixture();
    for (const raw of [null, '', '{', 'null', '[]', 'x'.repeat(4 * 1024 * 1024 + 1)]) {
      expect(readDisplayRoutingMultiPageState(raw, fixture.tabs, [], [])).toBeNull();
    }
    const invalidLayouts = [
      null,
      { version: 2, strategy: 'domain-lanes', direction: 'LR', nodeLayout: 'grid' },
      { version: 1, strategy: '', direction: 'LR', nodeLayout: 'grid' },
      { version: 1, strategy: 'domain-lanes', direction: 'diagonal', nodeLayout: 'grid' },
      { version: 1, strategy: 'domain-lanes', direction: 'LR', nodeLayout: [] },
    ];
    for (const invalidLayout of invalidLayouts) {
      const payload = JSON.parse(fixture.raw);
      payload.metadata.multiPage.pages[0].layoutSelection = invalidLayout;
      expect(readDisplayRoutingMultiPageState(
        JSON.stringify(payload), fixture.tabs, fixture.pages[1].nodes, fixture.pages[1].edges,
      )).toBeNull();
    }
    expect(displayRoutingMultiPageStateIsExpected(null)).toBe(false);
  });

  it('migrates v1 layouts with unknown applied mode', () => {
    const fixture = createFixture();
    const payload = JSON.parse(fixture.raw);
    payload.metadata.multiPage.pages[0].layoutSelection = {
      version: 1, strategy: 'domain-compound-elk', direction: 'TB', nodeLayout: 'dagre',
    };
    const state = readDisplayRoutingMultiPageState(
      JSON.stringify(payload), fixture.tabs, fixture.pages[1].nodes, fixture.pages[1].edges,
    );
    expect(state?.pages[0].layout).toMatchObject({
      version: 2, laneRankPreference: 'auto', laneRankApplied: 'unknown',
    });

    payload.metadata.multiPage.pages[1].layoutSelection = {
      version: 1, strategy: 'domain-lanes', direction: 'LR', nodeLayout: 'grid',
    };
    const v1 = readDisplayRoutingMultiPageState(
      JSON.stringify(payload), fixture.tabs, fixture.pages[1].nodes, fixture.pages[1].edges,
    );
    expect(v1?.pages[1].layout).toMatchObject({
      version: 2, laneRankPreference: 'auto', laneRankApplied: 'unknown',
    });
  });

  it('fails closed for corrupt v2 decision fields', () => {
    const fixture = createFixture();
    const corruptions = [
      { requested: 'global' },
      { applied: 'unknown' },
      { policyVersion: 2 },
      { direction: 'TB' },
      { metrics: { global: { flowLength: Infinity } } },
      { margin: -1 },
      { additionalBacktrackTravel: -1 },
      { reason: 'manual-global' },
      { metrics: { compact: decision('LR').metrics.compact } },
    ];
    for (const corruption of corruptions) {
      const payload = JSON.parse(fixture.raw);
      payload.metadata.multiPage.pages[1].layoutSelection.laneRankDecision = {
        ...decision('LR'), ...corruption,
      };
      expect(readDisplayRoutingMultiPageState(
        JSON.stringify(payload), fixture.tabs, fixture.pages[1].nodes, fixture.pages[1].edges,
      )).toBeNull();
    }
  });

  it.each(['global', 'compact'])('agrees with persistence for a single %s candidate', applied => {
    const fixture = createFixture();
    for (const requested of [applied, 'auto']) {
      const singleDecision = { ...decision('LR', applied), requested,
        reason: requested === 'auto' ? 'alternative-invalid' : `manual-${applied}`,
        metrics: { [applied]: decision('LR').metrics[applied] } };
      const selection = { ...layout('domain-lanes', 'LR'), laneRankPreference: requested,
        laneRankDecision: singleDecision };
      expect(parseLayoutSelection(selection)?.laneRankDecision).toEqual(singleDecision);
      const payload = JSON.parse(fixture.raw);
      payload.metadata.multiPage.pages[1].layoutSelection = selection;
      const state = readDisplayRoutingMultiPageState(JSON.stringify(payload), fixture.tabs,
        fixture.pages[1].nodes, fixture.pages[1].edges);
      expect(state?.pages[1].layout.laneRankDecision).toEqual(singleDecision);
    }
  });

  it('treats prototype-like ids as data without mutating object prototypes', () => {
    const fixture = createFixture();
    fixture.pages[1].id = '__proto__';
    const payload = { metadata: { multiPage: {
      version: 1,
      activePageId: '__proto__',
      pages: fixture.pages,
    } } };
    const tabs = fixture.pages.map((page, index) => ({ name: page.name, selected: index === 1 }));
    expect(readDisplayRoutingMultiPageState(
      JSON.stringify(payload), tabs, fixture.pages[1].nodes, fixture.pages[1].edges,
    )).not.toBeNull();
    expect({}.polluted).toBeUndefined();
  });
});
