import { describe, expect, it, vi } from 'vitest';
import {
  displayRoutingMultiPageStateIsExpected,
  readDisplayRoutingMultiPageState,
} from './display-routing-browser-multipage-matrix.mjs';
import { verifyDisplayRoutingBrowserCases } from './display-routing-matrix-browser-cases.mjs';

const layout = (strategy, direction, nodeLayout = 'dagre') => ({
  version: 1,
  strategy,
  direction,
  nodeLayout,
});

const node = id => ({ id });
const edge = (id, source, target, label) => ({ id, source, target, ...(label ? { label } : {}) });

const createFixture = () => {
  const pages = [
    {
      id: 'page-1',
      name: 'Page 1',
      nodes: [node('first-a'), node('first-b')],
      edges: [edge('first-edge', 'first-a', 'first-b', 'multi-page-first')],
      layoutSelection: layout('domain-compound-elk', 'TB'),
    },
    {
      id: 'page-2',
      name: 'Page 1 copy',
      nodes: [node('copy-a'), node('copy-b')],
      edges: [edge('copy-edge', 'copy-a', 'copy-b', 'multi-page-copy')],
      layoutSelection: layout('domain-lanes', 'LR', 'grid'),
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
  it('runs only the requested production-browser scenario', async () => {
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
    };
    await expect(verifyDisplayRoutingBrowserCases({
      ...common,
      requestedCase: 'multi-page-roundtrip',
    })).resolves.toEqual({
      topologyResults: [],
      multiPageResults: [{ id: 'multi-page-roundtrip' }],
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
    });
    expect(verifyTopology).toHaveBeenCalledTimes(1);
    expect(verifyMultiPage).not.toHaveBeenCalled();
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
