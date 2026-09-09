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
  const strategies = new Set([
    'domain-dagre', 'domain-dagre-sub-horizontal', 'dagre', 'domain-lanes',
    'domain-horizontal', 'domain-vertical', 'domain-elk', 'elk',
    'domain-compound-elk', 'tree', 'force',
  ]);
  const nodeLayouts = new Set(['dagre', 'flow', 'grid', 'horizontal', 'vertical']);
  const preferences = new Set(['auto', 'global', 'compact']);
  const modes = new Set(['global', 'compact']);
  const reasons = new Set([
    'manual-global', 'manual-compact', 'compact-benefit', 'global-preserved',
    'hysteresis', 'unchanged-connected-flow', 'alternative-invalid',
  ]);
  const finiteBounded = value => typeof value === 'number' && Number.isFinite(value)
    && value >= 0 && value <= 1_000_000_000;
  const readMetrics = value => {
    if (!isRecord(value) || !finiteBounded(value.flowLength)
      || !finiteBounded(value.whitespaceRatio) || value.whitespaceRatio > 1
      || !finiteBounded(value.backwardTravel) || !finiteBounded(value.backwardEdgeCount)
      || !Number.isInteger(value.backwardEdgeCount) || value.backwardEdgeCount > 100_000) return null;
    return {
      flowLength: value.flowLength,
      whitespaceRatio: value.whitespaceRatio,
      backwardTravel: value.backwardTravel,
      backwardEdgeCount: value.backwardEdgeCount,
    };
  };
  const readDecision = (value, preference, direction) => {
    if (!isRecord(value) || value.version !== 1 || value.policyVersion !== 1
      || !preferences.has(value.requested) || value.requested !== preference
      || !modes.has(value.applied) || !reasons.has(value.reason)
      || value.direction !== direction || !safeToken(value.connectedInputFingerprint)
      || value.connectedInputFingerprint.length > 256) return null;
    if (!isRecord(value.metrics)) return null;
    const global = typeof value.metrics.global === 'undefined' ? undefined : readMetrics(value.metrics.global);
    const compact = typeof value.metrics?.compact === 'undefined'
      ? undefined : readMetrics(value.metrics.compact);
    if ((typeof value.metrics.global !== 'undefined' && !global)
      || (typeof value.metrics.compact !== 'undefined' && !compact)
      || !(value.applied === 'global' ? global : compact)
      || (preference !== 'auto' && (value.applied !== preference || value.reason !== `manual-${preference}`))
      || (preference === 'auto' && (value.reason === 'manual-global' || value.reason === 'manual-compact'))
      || (value.reason === 'compact-benefit' && value.applied !== 'compact')
      || (value.reason === 'global-preserved' && value.applied !== 'global')) return null;
    const optionalNumber = candidate => typeof candidate === 'undefined'
      ? undefined : typeof candidate === 'number' && Number.isFinite(candidate)
        && candidate >= -1_000_000_000 && candidate <= 1_000_000_000 ? candidate : null;
    const additionalBacktrackTravel = optionalNumber(value.additionalBacktrackTravel);
    const score = optionalNumber(value.score);
    const margin = optionalNumber(value.margin);
    if ((typeof value.additionalBacktrackTravel !== 'undefined' && additionalBacktrackTravel === null)
      || (typeof additionalBacktrackTravel === 'number' && additionalBacktrackTravel < 0)
      || (typeof margin === 'number' && margin < 0)
      || (typeof value.score !== 'undefined' && score === null)
      || (typeof value.margin !== 'undefined' && margin === null)
      || (typeof value.previousApplied !== 'undefined' && !modes.has(value.previousApplied))) return null;
    return {
      version: 1,
      policyVersion: 1,
      requested: value.requested,
      applied: value.applied,
      reason: value.reason,
      direction: value.direction,
      connectedInputFingerprint: value.connectedInputFingerprint,
      metrics: { ...(global ? { global } : {}), ...(compact ? { compact } : {}) },
      ...(additionalBacktrackTravel === undefined ? {} : { additionalBacktrackTravel }),
      ...(score === undefined ? {} : { score }),
      ...(margin === undefined ? {} : { margin }),
      ...(modes.has(value.previousApplied) ? { previousApplied: value.previousApplied } : {}),
    };
  };
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
  const readSafeLabelOffsets = values => {
    if (!Array.isArray(values) || values.length > 300) return null;
    const offsets = [];
    for (const edge of values) {
      if (!isRecord(edge) || !safeToken(edge.id)) return null;
      if (typeof edge.data === 'undefined' || !isRecord(edge.data)) {
        if (typeof edge.data !== 'undefined') return null;
        continue;
      }
      if (typeof edge.data.labelOffset === 'undefined') continue;
      const offset = edge.data.labelOffset;
      if (!isRecord(offset) || ![offset.x, offset.y].every(value => (
        typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000
      ))) return null;
      offsets.push({ edgeId: edge.id, x: offset.x, y: offset.y });
    }
    return offsets.sort((left, right) => left.edgeId.localeCompare(right.edgeId));
  };
  const readSafeLayout = value => {
    if (!isRecord(value) || !strategies.has(value.strategy)
      || !['TB', 'BT', 'LR', 'RL'].includes(value.direction) || !nodeLayouts.has(value.nodeLayout)) return null;
    if (value.version === 1) {
      return {
        version: 2,
        strategy: value.strategy,
        direction: value.direction,
        nodeLayout: value.nodeLayout,
        laneRankPreference: 'auto',
        laneRankApplied: 'unknown',
      };
    }
    if (value.version !== 2 || !preferences.has(value.laneRankPreference)) return null;
    const decision = typeof value.laneRankDecision === 'undefined'
      ? undefined : readDecision(value.laneRankDecision, value.laneRankPreference, value.direction);
    if (typeof value.laneRankDecision !== 'undefined' && !decision) return null;
    return {
      version: 2,
      strategy: value.strategy,
      direction: value.direction,
      nodeLayout: value.nodeLayout,
      laneRankPreference: value.laneRankPreference,
      laneRankApplied: decision?.applied ?? 'unknown',
      ...(decision ? { laneRankDecision: decision } : {}),
    };
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
    const contentNodeIds = readSafeIds(page.nodes.filter(node => (
      !['titleGroup', 'subGroup'].includes(node?.type)
    )), 5000);
    const edgeIds = readSafeIds(page.edges, 300);
    const layout = readSafeLayout(page.layoutSelection);
    const labelOffsets = readSafeLabelOffsets(page.edges);
    if (!nodeIds || !contentNodeIds || !edgeIds || !layout || !labelOffsets) return null;
    const nodeIdSet = new Set(nodeIds);
    if (page.edges.some(edge => !isRecord(edge) || !safeToken(edge.source) || !safeToken(edge.target)
      || !nodeIdSet.has(edge.source) || !nodeIdSet.has(edge.target))) return null;
    pageIds.add(page.id);
    pages.push({
      id: page.id,
      name: page.name,
      selected: tab.selected,
      nodeIds,
      contentNodeIds,
      edgeIds,
      labelOffsets,
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
  const currentLabelOffsets = readSafeLabelOffsets(currentEdges);
  if (!currentNodeIds || !currentEdgeIds
    || !currentLabelOffsets
    || JSON.stringify(currentNodeIds) !== JSON.stringify(pages[activeIndex].nodeIds)
    || JSON.stringify(currentEdgeIds) !== JSON.stringify(pages[activeIndex].edgeIds)
    || JSON.stringify(currentLabelOffsets) !== JSON.stringify(pages[activeIndex].labelOffsets)) return null;
  return { activeIndex, pages };
};

export const displayRoutingMultiPageStateIsExpected = state => Boolean(
  state && state.activeIndex === 1 && state.pages?.length === 3
  && state.pages[0]?.layout?.strategy === 'domain-compound-elk'
  && state.pages[0]?.layout?.direction === 'TB'
  && state.pages[0]?.layout?.laneRankPreference === 'auto'
  && state.pages[0]?.layout?.laneRankApplied === 'unknown'
  && state.pages[0]?.markers?.includes('multi-page-first')
  && state.pages[0]?.labelOffsets?.length === 1
  && state.pages[0]?.labelOffsets[0]?.x === 12
  && state.pages[0]?.labelOffsets[0]?.y === -4
  && !state.pages[0]?.markers?.includes('multi-page-copy')
  && state.pages[1]?.layout?.strategy === 'domain-lanes'
  && state.pages[1]?.layout?.direction === 'LR'
  && state.pages[1]?.layout?.laneRankPreference === 'auto'
  && ['global', 'compact'].includes(state.pages[1]?.layout?.laneRankApplied)
  && state.pages[1]?.layout?.laneRankDecision?.requested === 'auto'
  && state.pages[1]?.markers?.includes('multi-page-copy')
  && state.pages[1]?.labelOffsets?.length === 1
  && state.pages[1]?.labelOffsets[0]?.x === -8
  && state.pages[1]?.labelOffsets[0]?.y === 6
  && !state.pages[1]?.markers?.includes('multi-page-first')
  && state.pages[1]?.contentNodeIds?.length === state.pages[0]?.contentNodeIds?.length
  && state.pages[1]?.edgeIds?.length === state.pages[0]?.edgeIds?.length
  && state.pages[2]?.layout?.strategy === 'domain-dagre'
  && state.pages[2]?.layout?.direction === 'TB'
  && state.pages[2]?.layout?.laneRankPreference === 'auto'
  && state.pages[2]?.layout?.laneRankApplied === 'unknown'
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

const setFirstEdgeLabelOffset = async (session, marker, offset) => {
  const updated = await session.evaluate(`(() => {
    const instance = window.reactFlowInstance;
    const edge = instance?.getEdges?.()[0];
    if (!edge) return false;
    instance.setEdges(edges => edges.map(item => item.id === edge.id
      ? { ...item, label: ${JSON.stringify(marker)}, data: { ...(item.data || {}), labelOffset: ${JSON.stringify(offset)} } }
      : item));
    return true;
  })()`);
  if (!updated) throw new Error(`Could not set active multi-page label offset: ${marker}`);
};

// Routing may reorder edges, and duplication replaces IDs. The unique marker
// identifies the edited label throughout this page's layout/reload transaction.
export const readDisplayRoutingMarkedLabelOffset = (edges, marker) => {
  if (!Array.isArray(edges) || edges.length > 10_000
    || typeof marker !== 'string' || marker.length === 0 || marker.length > 1024) return null;
  const matches = edges.filter(edge => edge && typeof edge === 'object' && edge.label === marker);
  if (matches.length !== 1) return null;
  const offset = matches[0].data?.labelOffset;
  if (!offset || typeof offset !== 'object' || Array.isArray(offset)
    || !Number.isFinite(offset.x) || !Number.isFinite(offset.y)
    || Math.abs(offset.x) > 1000 || Math.abs(offset.y) > 1000) return null;
  return { x: offset.x, y: offset.y };
};

const assertCurrentEdgeLabelOffset = async (waitForValue, session, marker, expected, label) => waitForValue(
  session, `(() => {
    const readOffset = ${readDisplayRoutingMarkedLabelOffset.toString()};
    const offset = readOffset(window.reactFlowInstance?.getEdges?.(), ${JSON.stringify(marker)});
    return offset && Number.isFinite(offset.x) && Number.isFinite(offset.y)
      && offset.x === ${JSON.stringify(expected.x)} && offset.y === ${JSON.stringify(expected.y)}
      ? { x: offset.x, y: offset.y } : null;
  })()`, label).catch(async error => {
    const offset = await session.evaluate(`(() => {
      const readOffset = ${readDisplayRoutingMarkedLabelOffset.toString()};
      return readOffset(window.reactFlowInstance?.getEdges?.(), ${JSON.stringify(marker)});
    })()`);
    throw new Error(`${error.message}\nMarked label offset: ${JSON.stringify(offset)}`, { cause: error });
  });

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
  const firstRoute = await selectLayout({
    session, layoutCase: firstLayout, waitForLayoutRoute, auditFinalSvg,
  });
  const firstNodeCount = firstRoute.request.nodes.length;
  const firstEdgeCount = firstRoute.response.edges.length;
  await setFirstEdgeLabelOffset(session, MARKERS.first, { x: 12, y: -4 });

  await clickPageElement(session, '.page-tabs__duplicate');
  await waitForPageCanvas(waitForValue, session, {
    pageCount: 2, activeIndex: 1, nodeCount: firstNodeCount, edgeCount: firstEdgeCount,
    label: 'duplicated page canvas',
  });
  await waitForCurrentRenderAuthority(waitForValue, session, 'duplicated page route authority');
  await auditCurrentCanvas(session, auditFinalSvg, 'duplicated page route');
  await assertCurrentEdgeLabelOffset(waitForValue, session, MARKERS.first, { x: 12, y: -4 }, 'duplicated page inherited');
  await setFirstEdgeLabelOffset(session, MARKERS.copy, { x: -8, y: 6 });
  await assertCurrentEdgeLabelOffset(waitForValue, session, MARKERS.copy, { x: -8, y: 6 }, 'duplicated page edited');
  const copyRoute = await selectLayout({
    session, layoutCase: copyLayout, waitForLayoutRoute, auditFinalSvg,
  });
  const copyNodeCount = copyRoute.request.nodes.length;
  const copyEdgeCount = copyRoute.response.edges.length;

  await clickPageElement(session, '.page-tabs__add');
  await waitForPageCanvas(waitForValue, session, {
    pageCount: 3, activeIndex: 2, nodeCount: 0, edgeCount: 0, label: 'new empty page canvas',
  });
  await clickPageElement(session, '.page-tabs__tab', 1);
  await waitForPageCanvas(waitForValue, session, {
    pageCount: 3, activeIndex: 1, nodeCount: copyNodeCount, edgeCount: copyEdgeCount,
    label: 'copy page before reload',
  });
  await waitForCurrentRenderAuthority(waitForValue, session, 'copy page before reload authority');
  await auditCurrentCanvas(session, auditFinalSvg, 'copy page before reload');

  await session.evaluate('window.__vizlyMultiPageReloadSentinel = true');
  await session.send('Page.reload', {});
  await waitForValue(session, '!window.__vizlyMultiPageReloadSentinel', 'new multi-page document');
  await waitForPageCanvas(waitForValue, session, {
    pageCount: 3, activeIndex: 1, nodeCount: copyNodeCount, edgeCount: copyEdgeCount,
    label: 'restored copy page canvas',
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
  await assertCurrentEdgeLabelOffset(waitForValue, session, MARKERS.copy, { x: -8, y: 6 }, 'restored copy page');

  await session.evaluate(`window.__vizlyRequestedLayoutLabel = ${JSON.stringify(firstLayout.label)}`);
  await clickPageElement(session, '.page-tabs__tab', 0);
  await waitForPageCanvas(waitForValue, session, {
    pageCount: 3, activeIndex: 0, nodeCount: firstNodeCount, edgeCount: firstEdgeCount,
    label: 'restored first page canvas',
  });
  await waitForCurrentRenderAuthority(waitForValue, session, 'restored first page authority');
  await assertRequestedLayoutSelected(session, FIRST_LAYOUT_ID);
  const firstAudit = await auditCurrentCanvas(session, auditFinalSvg, 'restored first page');
  await assertCurrentEdgeLabelOffset(waitForValue, session, MARKERS.first, { x: 12, y: -4 }, 'restored first page isolation');

  await session.evaluate(`window.__vizlyRequestedLayoutLabel = ${JSON.stringify(copyLayout.label)}`);
  await clickPageElement(session, '.page-tabs__tab', 1);
  await waitForPageCanvas(waitForValue, session, {
    pageCount: 3, activeIndex: 1, nodeCount: copyNodeCount, edgeCount: copyEdgeCount,
    label: 'restored copy page revisit',
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
