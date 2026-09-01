import { setTimeout as delay } from 'node:timers/promises';
import { withPrecompiledRouteBrowser } from './precompiled-display-route-cdp.mjs';
import { clickLayout, assertRequestedLayoutSelected } from './display-routing-matrix-layout-command.mjs';
import {
  DISPLAY_ROUTING_LAYOUT_CASES,
  DISPLAY_ROUTING_MULTI_PAGE_CASE_ID,
} from './display-routing-matrix-cases.mjs';

const MULTI_PAGE_PRESET_ID = 'wms-demand-allocation-strategy-v2';
const FIRST_LAYOUT_ID = 'domain-compound-elk-tb';
const COPY_LAYOUT_ID = 'domain-lanes-lr';
const MARKERS = Object.freeze({ first: 'multi-page-first', copy: 'multi-page-copy' });

/** Bounded storage/UI parser used both by Node tests and inside the production browser. */
export const readDisplayRoutingMultiPageState = (raw, tabs, currentNodes, currentEdges) => {
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const safeToken = value => typeof value === 'string' && value.length > 0 && value.length <= 1024;
  const markerValues = new Set(['multi-page-first', 'multi-page-copy']);
  const readSafeIds = (values, maximum) => {
    if (!Array.isArray(values) || values.length > maximum) return null;
    const ids = [];
    const unique = new Set();
    for (const value of values) {
      if (!isRecord(value) || !safeToken(value.id) || unique.has(value.id)) return null;
      unique.add(value.id);
      ids.push(value.id);
    }
    return ids.sort();
  };
  const readSafeLayout = value => {
    if (!isRecord(value) || value.version !== 1 || !safeToken(value.strategy)
      || !['TB', 'BT', 'LR', 'RL'].includes(value.direction) || !safeToken(value.nodeLayout)) return null;
    return { strategy: value.strategy, direction: value.direction, nodeLayout: value.nodeLayout };
  };
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4 * 1024 * 1024
    || !Array.isArray(tabs) || tabs.length === 0 || tabs.length > 50) return null;
  let payload;
  try { payload = JSON.parse(raw); } catch { return null; }
  const multiPage = isRecord(payload?.metadata) && isRecord(payload.metadata.multiPage)
    ? payload.metadata.multiPage : null;
  if (!multiPage || multiPage.version !== 1 || !safeToken(multiPage.activePageId)
    || !Array.isArray(multiPage.pages) || multiPage.pages.length !== tabs.length
    || multiPage.pages.length > 50) return null;
  const pageIds = new Set();
  const pages = [];
  for (let index = 0; index < multiPage.pages.length; index += 1) {
    const page = multiPage.pages[index];
    const tab = tabs[index];
    if (!isRecord(page) || !safeToken(page.id) || pageIds.has(page.id) || !safeToken(page.name)
      || !isRecord(tab) || tab.name !== page.name || typeof tab.selected !== 'boolean') return null;
    const nodeIds = readSafeIds(page.nodes, 5000);
    const edgeIds = readSafeIds(page.edges, 300);
    const layout = readSafeLayout(page.layoutSelection);
    if (!nodeIds || !edgeIds || !layout) return null;
    const nodeIdSet = new Set(nodeIds);
    if (page.edges.some(edge => !isRecord(edge) || !safeToken(edge.source) || !safeToken(edge.target)
      || !nodeIdSet.has(edge.source) || !nodeIdSet.has(edge.target))) return null;
    pageIds.add(page.id);
    pages.push({
      id: page.id,
      name: page.name,
      selected: tab.selected,
      nodeIds,
      edgeIds,
      layout,
      markers: page.edges.flatMap(edge => safeToken(edge?.label) ? [edge.label] : [])
        .filter(label => markerValues.has(label)),
    });
  }
  const activeIndex = pages.findIndex(page => page.id === multiPage.activePageId);
  if (activeIndex < 0 || pages.filter(page => page.selected).length !== 1
    || pages[activeIndex]?.selected !== true) return null;
  const currentNodeIds = readSafeIds(currentNodes, 5000);
  const currentEdgeIds = readSafeIds(currentEdges, 300);
  if (!currentNodeIds || !currentEdgeIds
    || JSON.stringify(currentNodeIds) !== JSON.stringify(pages[activeIndex].nodeIds)
    || JSON.stringify(currentEdgeIds) !== JSON.stringify(pages[activeIndex].edgeIds)) return null;
  return { activeIndex, pages };
};

export const displayRoutingMultiPageStateIsExpected = state => Boolean(
  state && state.activeIndex === 1 && state.pages?.length === 3
  && state.pages[0]?.layout?.strategy === 'domain-compound-elk'
  && state.pages[0]?.layout?.direction === 'TB'
  && state.pages[0]?.markers?.includes('multi-page-first')
  && !state.pages[0]?.markers?.includes('multi-page-copy')
  && state.pages[1]?.layout?.strategy === 'domain-lanes'
  && state.pages[1]?.layout?.direction === 'LR'
  && state.pages[1]?.markers?.includes('multi-page-copy')
  && !state.pages[1]?.markers?.includes('multi-page-first')
  && state.pages[1]?.nodeIds?.length === state.pages[0]?.nodeIds?.length
  && state.pages[1]?.edgeIds?.length === state.pages[0]?.edgeIds?.length
  && state.pages[2]?.layout?.strategy === 'domain-dagre'
  && state.pages[2]?.layout?.direction === 'TB'
  && state.pages[2]?.nodeIds?.length === 0
  && state.pages[2]?.edgeIds?.length === 0
);

const browserStateExpression = presetId => `(() => {
  const readState = ${readDisplayRoutingMultiPageState.toString()};
  return readState(
    localStorage.getItem(${JSON.stringify(`flowchart-autosave-v2-${presetId}`)}),
    Array.from(document.querySelectorAll('.page-tabs__tab')).map(tab => ({
      name: tab.getAttribute('aria-label') || '',
      selected: tab.getAttribute('aria-selected') === 'true',
    })),
    window.reactFlowInstance?.getNodes?.() || [],
    window.reactFlowInstance?.getEdges?.() || [],
  );
})()`;

const clickPageElement = async (session, selector, index = 0) => {
  const target = await session.evaluate(`(() => {
    const element = document.querySelectorAll(${JSON.stringify(selector)})[${JSON.stringify(index)}];
    if (!(element instanceof HTMLElement) || element.matches(':disabled')
      || element.getAttribute('aria-disabled') === 'true') return null;
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (![x, y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0
      || x < 0 || y < 0 || x > innerWidth || y > innerHeight
      || !element.contains(document.elementFromPoint(x, y))) return null;
    return { x, y };
  })()`);
  if (!target) throw new Error(`Multi-page control is unavailable: ${selector}[${index}]`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await session.send('Input.dispatchMouseEvent', {
      type,
      x: target.x,
      y: target.y,
      ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }),
    });
  }
};

const waitForPageCanvas = (waitForValue, session, expected) => waitForValue(session, `(() => {
  const tabs = Array.from(document.querySelectorAll('.page-tabs__tab'));
  const nodes = window.reactFlowInstance?.getNodes?.() || [];
  const edges = window.reactFlowInstance?.getEdges?.() || [];
  return tabs.length === ${expected.pageCount}
    && tabs[${expected.activeIndex}]?.getAttribute('aria-selected') === 'true'
    && nodes.length === ${expected.nodeCount}
    && edges.length === ${expected.edgeCount}
    ? { pageCount: tabs.length, nodeCount: nodes.length, edgeCount: edges.length }
    : null;
})()`, expected.label);

const waitForCurrentRenderAuthority = (waitForValue, session, label) => waitForValue(session, `(() => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  const edgeCount = window.reactFlowInstance?.getEdges?.().length ?? 0;
  return routing.stage === 'final-applied'
    && routing.renderAuthorityStatus === 'accepted'
    && edgeCount > 0
    && document.querySelectorAll('.react-flow__edge').length === edgeCount
    ? { workerStartCount: routing.workerStartCount ?? 0, edgeCount }
    : null;
})()`, label);

const markFirstEdge = async (session, marker) => {
  const marked = await session.evaluate(`(() => {
    const instance = window.reactFlowInstance;
    const edge = instance?.getEdges?.()[0];
    if (!edge) return false;
    instance.setEdges(edges => edges.map(item => item.id === edge.id
      ? { ...item, label: ${JSON.stringify(marker)} } : item));
    return true;
  })()`);
  if (!marked) throw new Error(`Could not mark active multi-page edge: ${marker}`);
};

const selectLayout = async ({ session, layoutCase, waitForLayoutRoute, auditFinalSvg }) => {
  const previousJobId = await session.evaluate(
    'window.__vizlyBaseReactFlowDisplayRouting?.layoutTransactionJobId ?? 0',
  );
  await clickLayout(session, layoutCase);
  const route = await waitForLayoutRoute(session, previousJobId, layoutCase.id);
  await auditFinalSvg(session, route, layoutCase.id);
  await assertRequestedLayoutSelected(session, layoutCase.id);
  return route;
};

const readCurrentCanvas = session => session.evaluate(`(() => ({
  routing: window.__vizlyBaseReactFlowDisplayRouting || {},
  nodes: window.reactFlowInstance?.getNodes?.() || [],
  edges: window.reactFlowInstance?.getEdges?.() || [],
}))()`);

const auditCurrentCanvas = async (session, auditFinalSvg, label) => {
  const current = await readCurrentCanvas(session);
  if (!current.nodes.length || !current.edges.length) throw new Error(`${label} has no canvas content`);
  return auditFinalSvg(session, {
    routing: current.routing,
    request: { nodes: current.nodes },
    response: { edges: current.edges },
  }, label);
};

export const verifyDisplayRoutingMultiPageMatrix = async ({
  baseUrl,
  prepareSession,
  waitForValue,
  waitForInitialRoute,
  waitForLayoutRoute,
  auditFinalSvg,
}) => withPrecompiledRouteBrowser(async session => {
  await prepareSession(session);
  const url = `${baseUrl}/?diagram=${encodeURIComponent(MULTI_PAGE_PRESET_ID)}`
    + `&routingMatrix=${DISPLAY_ROUTING_MULTI_PAGE_CASE_ID}-${Date.now()}`
    + `#/?diagram=${encodeURIComponent(MULTI_PAGE_PRESET_ID)}`;
  await session.send('Page.navigate', { url });
  const initial = await waitForInitialRoute(session, MULTI_PAGE_PRESET_ID);
  const nodeCount = initial.response.edges.length > 0 ? initial.request.nodes.length : 0;
  const edgeCount = initial.response.edges.length;
  if (!nodeCount || !edgeCount) throw new Error('Multi-page preset is empty');

  const firstLayout = DISPLAY_ROUTING_LAYOUT_CASES.find(item => item.id === FIRST_LAYOUT_ID);
  const copyLayout = DISPLAY_ROUTING_LAYOUT_CASES.find(item => item.id === COPY_LAYOUT_ID);
  if (!firstLayout || !copyLayout) throw new Error('Multi-page layout case is unavailable');
  await selectLayout({ session, layoutCase: firstLayout, waitForLayoutRoute, auditFinalSvg });
  await markFirstEdge(session, MARKERS.first);

  await clickPageElement(session, '.page-tabs__duplicate');
  await waitForPageCanvas(waitForValue, session, {
    pageCount: 2, activeIndex: 1, nodeCount, edgeCount, label: 'duplicated page canvas',
  });
  await waitForCurrentRenderAuthority(waitForValue, session, 'duplicated page route authority');
  await auditCurrentCanvas(session, auditFinalSvg, 'duplicated page route');
  await markFirstEdge(session, MARKERS.copy);
  await selectLayout({ session, layoutCase: copyLayout, waitForLayoutRoute, auditFinalSvg });

  await clickPageElement(session, '.page-tabs__add');
  await waitForPageCanvas(waitForValue, session, {
    pageCount: 3, activeIndex: 2, nodeCount: 0, edgeCount: 0, label: 'new empty page canvas',
  });
  await clickPageElement(session, '.page-tabs__tab', 1);
  await waitForPageCanvas(waitForValue, session, {
    pageCount: 3, activeIndex: 1, nodeCount, edgeCount, label: 'copy page before reload',
  });
  await waitForCurrentRenderAuthority(waitForValue, session, 'copy page before reload authority');
  await auditCurrentCanvas(session, auditFinalSvg, 'copy page before reload');

  await session.evaluate('window.__vizlyMultiPageReloadSentinel = true');
  await session.send('Page.reload', {});
  await waitForValue(session, '!window.__vizlyMultiPageReloadSentinel', 'new multi-page document');
  await waitForPageCanvas(waitForValue, session, {
    pageCount: 3, activeIndex: 1, nodeCount, edgeCount, label: 'restored copy page canvas',
  });
  await waitForCurrentRenderAuthority(waitForValue, session, 'restored copy page authority');
  const restored = await waitForValue(
    session,
    `(() => { const state = ${browserStateExpression(MULTI_PAGE_PRESET_ID)};
      const expected = ${displayRoutingMultiPageStateIsExpected.toString()};
      return expected(state) ? state : null; })()`,
    'durable multi-page state',
  );
  const copyAudit = await auditCurrentCanvas(session, auditFinalSvg, 'restored copy page');

  await session.evaluate(`window.__vizlyRequestedLayoutLabel = ${JSON.stringify(firstLayout.label)}`);
  await clickPageElement(session, '.page-tabs__tab', 0);
  await waitForPageCanvas(waitForValue, session, {
    pageCount: 3, activeIndex: 0, nodeCount, edgeCount, label: 'restored first page canvas',
  });
  await waitForCurrentRenderAuthority(waitForValue, session, 'restored first page authority');
  await assertRequestedLayoutSelected(session, FIRST_LAYOUT_ID);
  const firstAudit = await auditCurrentCanvas(session, auditFinalSvg, 'restored first page');

  await session.evaluate(`window.__vizlyRequestedLayoutLabel = ${JSON.stringify(copyLayout.label)}`);
  await clickPageElement(session, '.page-tabs__tab', 1);
  await waitForPageCanvas(waitForValue, session, {
    pageCount: 3, activeIndex: 1, nodeCount, edgeCount, label: 'restored copy page revisit',
  });
  await waitForCurrentRenderAuthority(waitForValue, session, 'restored copy page revisit authority');
  await assertRequestedLayoutSelected(session, COPY_LAYOUT_ID);

  await clickPageElement(session, '.page-tabs__tab', 2);
  await waitForPageCanvas(waitForValue, session, {
    pageCount: 3, activeIndex: 2, nodeCount: 0, edgeCount: 0, label: 'restored empty page canvas',
  });
  await delay(50);

  return {
    id: DISPLAY_ROUTING_MULTI_PAGE_CASE_ID,
    presetId: MULTI_PAGE_PRESET_ID,
    pageCount: restored.pages.length,
    restoredActiveIndex: restored.activeIndex,
    layouts: restored.pages.map(page => page.layout),
    nodeCounts: restored.pages.map(page => page.nodeIds.length),
    edgeCounts: restored.pages.map(page => page.edgeIds.length),
    markers: restored.pages.map(page => page.markers),
    firstAudit,
    copyAudit,
  };
});
