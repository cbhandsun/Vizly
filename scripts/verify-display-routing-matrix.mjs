import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';

import { DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT } from './lib/display-routing-browser-capture.mjs';
import { summarizeSlowestDisplayRoutingPhases } from './lib/display-routing-browser-performance.mjs';
import {
  readDisplayRoutingVisualScaleAudit,
  readRenderedDisplayEdgeNodeIntersections,
} from './lib/display-routing-browser-geometry.mjs';
import { withPrecompiledRouteBrowser } from './lib/precompiled-display-route-cdp.mjs';
import { PRECOMPILED_DISPLAY_ROUTE_TARGETS } from './lib/precompiled-display-route-targets.mjs';
import {
  parseCanonicalPresetIdentity,
  verifyCanonicalPresetMount,
} from './lib/display-routing-canonical-preset.mjs';

const BASE_URL = String(process.env.PRECOMPILED_ROUTE_BASE_URL || '').trim().replace(/\/$/, '');
const WAIT_TIMEOUT_MS = 120_000;
const MAX_LAYOUT_ROUTE_MS = 30_000;
const LAYOUT_CASES = Object.freeze([
  { id: 'domain-compound-elk-tb', label: '复杂流程（保留域·上→下）' },
  { id: 'domain-compound-elk-lr', label: '复杂流程（保留域·左→右）' },
  { id: 'domain-lanes-lr', label: '循环流程泳道（左→右）' },
]);
const REQUESTED_CASE = String(process.env.DISPLAY_ROUTING_MATRIX_CASE || '').trim();
const MATRIX_CASE_IDS = new Set([
  ...PRECOMPILED_DISPLAY_ROUTE_TARGETS.map(target => target.presetId),
  ...LAYOUT_CASES.map(layoutCase => layoutCase.id),
]);
if (REQUESTED_CASE && !MATRIX_CASE_IDS.has(REQUESTED_CASE)) {
  throw new Error(`Unknown DISPLAY_ROUTING_MATRIX_CASE: ${REQUESTED_CASE.slice(0, 128)}`);
}

const assertProductionPreview = async () => {
  if (!BASE_URL) throw new Error('PRECOMPILED_ROUTE_BASE_URL must point to a production preview');
  const response = await fetch(`${BASE_URL}/`, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Production preview returned HTTP ${response.status}`);
  const html = await response.text();
  if (
    html.includes('/@vite/client')
    || !/<script[^>]+src=["'][^"']*\/assets\/[^"']+\.js["']/i.test(html)
  ) throw new Error('PRECOMPILED_ROUTE_BASE_URL is not a production Vite preview');
};

const waitForValue = async (session, expression, label) => {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await session.evaluate(expression);
    if (value) return value;
    await delay(100);
  }
  const state = await session.evaluate(`(() => ({
    routing: window.__vizlyBaseReactFlowDisplayRouting || {},
    responses: window.__vizlyRoutingResponses || [],
    edgeCount: document.querySelectorAll('.react-flow__edge').length,
  }))()`);
  throw new Error(`Timed out waiting for ${label}:\n${JSON.stringify(state, null, 2)}`);
};

const prepareSession = async session => {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1_600,
    height: 1_200,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await session.send('Page.addScriptToEvaluateOnNewDocument', {
    source: DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT,
  });
};

const readFinalRouteExpression = expectedRequestPrefix => `(() => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  if (routing.stage !== 'final-applied') return null;
  if (${JSON.stringify(expectedRequestPrefix)}
    && !String(routing.requestId || '').startsWith(${JSON.stringify(expectedRequestPrefix)})) return null;
  const requests = window.__vizlyRoutingRequests || [];
  const responses = window.__vizlyRoutingResponses || [];
  const response = [...responses].reverse().find(item => item?.requestId === routing.requestId);
  const request = [...requests].reverse().find(item => item?.requestId === routing.requestId);
  if (!response || response.hardClean !== true || !Array.isArray(response.edges)) return null;
  if (!response.hardReport || response.hardReport.hardClean !== true) return null;
  const renderedEdgeCount = document.querySelectorAll('.react-flow__edge').length;
  if (renderedEdgeCount !== response.edges.length) return null;
  return { routing, request, response, renderedEdgeCount };
})()`;

const auditFinalSvg = async (session, route, label) => {
  await delay(500);
  const audit = await session.evaluate(
    `(${readRenderedDisplayEdgeNodeIntersections.toString()})(${JSON.stringify(route.response.edges)}, 16)`,
  );
  if (
    audit.invalidEdgeIds?.length !== 0
    || audit.intersections?.length !== 0
    || audit.auditedPathCount !== route.response.edges.length
  ) throw new Error(`Final SVG geometry failed for ${label}:\n${JSON.stringify(audit, null, 2)}`);
  const commercialAudit = await session.evaluate(
    `(${readRenderedDisplayEdgeNodeIntersections.toString()})(${JSON.stringify(route.response.edges)}, 48)`,
  );
  const visualAudit = await session.evaluate(
    `(${readDisplayRoutingVisualScaleAudit.toString()})()`,
  );
  if (
    !visualAudit
    || visualAudit.invalidNonScalingPathCount !== 0
    || visualAudit.invalidStrokeWidthCount !== 0
    || visualAudit.lowContrastPathCount !== 0
    || visualAudit.invalidVisibleLabelFontSizeCount !== 0
    || visualAudit.labelNodeOverlapCount !== 0
    || visualAudit.markerCount < 1
    || visualAudit.edgeAccessibleNameMissingCount !== 0
    || (visualAudit.zoom < 0.4 && !visualAudit.zoomedOut)
    || (visualAudit.zoom >= 0.4 && visualAudit.zoomedOut)
  ) throw new Error(`Final SVG visual quality failed for ${label}:\n${JSON.stringify(visualAudit, null, 2)}`);
  const riskNodeIds = [...new Set([
    ...audit.clearanceRisks.map(risk => risk.nodeId),
    ...commercialAudit.clearanceRisks.map(risk => risk.nodeId),
  ])].slice(0, 16);
  const riskNodeGeometry = await session.evaluate(`(() => {
    const instance = window.reactFlowInstance;
    return ${JSON.stringify(riskNodeIds)}.map(id => {
      const node = instance?.getNode?.(id);
      const internal = instance?.getInternalNode?.(id);
      return {
        id,
        position: internal?.internals?.positionAbsolute ?? node?.position ?? null,
        width: node?.measured?.width ?? node?.width ?? null,
        height: node?.measured?.height ?? node?.height ?? null,
      };
    });
  })()`);
  const nodeGeometryById = new Map(riskNodeGeometry.map(node => [node.id, node]));
  const edgeById = new Map(route.response.edges.map(edge => [edge.id, edge]));
  const minimumClearanceRiskDetails = audit.clearanceRisks.slice(0, 8).map(risk => ({
    ...risk,
    node: nodeGeometryById.get(risk.nodeId) ?? null,
    path: edgeById.get(risk.edgeId)?.data?.computedPath?.slice(0, 64) ?? [],
  }));
  const commercialClearanceRiskDetails = commercialAudit.clearanceRisks.slice(0, 8).map(risk => ({
    ...risk,
    node: nodeGeometryById.get(risk.nodeId) ?? null,
    path: edgeById.get(risk.edgeId)?.data?.computedPath?.slice(0, 64) ?? [],
  }));
  return {
    obstacleHits: audit.intersections.length,
    minimumClearanceRisks: audit.clearanceRisks.length,
    minimumClearanceRiskDetails,
    commercialClearanceRisks: commercialAudit.clearanceRisks.length,
    commercialClearanceRiskDetails,
    visualAudit,
  };
};

const verifyPreset = target => withPrecompiledRouteBrowser(async session => {
  await prepareSession(session);
  const identity = parseCanonicalPresetIdentity(
    JSON.parse(await readFile(target.sourcePath, 'utf8')),
    target.presetId,
  );
  const url = `${BASE_URL}/?canonicalPreset=${encodeURIComponent(target.presetId)}`
    + `&routingMatrix=${Date.now()}`
    + `#/?diagram=${encodeURIComponent(target.presetId)}`;
  await session.send('Page.navigate', { url });
  const route = await waitForValue(session, readFinalRouteExpression(''), target.presetId);
  const usedValidatedExternalCandidate = route.routing.cacheTrustLevel === 'external-candidate'
    && ['validated-candidate', 'repaired-candidate'].includes(route.response.routeResolution)
    && route.response.phaseTrace?.some(trace => (
      trace?.phase === 'candidate-validation' && trace?.resolution === 'hit'
    ));
  if (!usedValidatedExternalCandidate) {
    throw new Error(`${target.presetId} did not use its validated precompiled route:\n${JSON.stringify({
      responseResolution: route.response.routeResolution,
      routing: route.routing,
      requestInputSignature: route.request?.inputSignature,
      requestInputGeometryDigest: route.request?.inputGeometryDigest,
    }, null, 2)}`);
  }
  const mounted = await session.evaluate(`(() => ({
    nodes: window.reactFlowInstance?.getNodes?.().map(node => ({ id: node.id })) || [],
    edges: window.reactFlowInstance?.getEdges?.().map(edge => ({ id: edge.id })) || [],
  }))()`);
  const canonicalMount = verifyCanonicalPresetMount({
    identity,
    requestNodes: route.request?.nodes,
    requestEdges: route.request?.edges,
    mountedNodes: mounted.nodes,
    mountedEdges: mounted.edges,
  });
  return {
    id: target.presetId,
    resolution: route.response.routeResolution,
    routeMs: Number.isFinite(route.request?.__browserCapturedAt)
      && Number.isFinite(route.response.__browserCapturedAt)
      ? route.response.__browserCapturedAt - route.request.__browserCapturedAt
      : route.routing.routeMs,
    totalRouteMs: route.routing.totalRouteMs,
    slowestPhases: summarizeSlowestDisplayRoutingPhases(route.response.phaseTrace),
    canonicalMount,
    ...(await auditFinalSvg(session, route, target.presetId)),
  };
});

const clickLayout = async (session, layoutCase) => {
  const opened = await session.evaluate(`(() => {
    const trigger = Array.from(document.querySelectorAll('button'))
      .find(button => /自动布局|layout/i.test(button.getAttribute('aria-label') || ''));
    trigger?.click();
    return Boolean(trigger);
  })()`);
  if (!opened) throw new Error('Layout menu trigger was not found');
  await delay(300);
  const clicked = await session.evaluate(`(() => {
    const expected = ${JSON.stringify(layoutCase.label)};
    const item = Array.from(document.querySelectorAll('.flowchart-layout-menu .ant-dropdown-menu-item'))
      .find(candidate => candidate.textContent?.trim() === expected);
    item?.click();
    return item ? Date.now() : null;
  })()`);
  if (!clicked) throw new Error(`Layout menu item was not found: ${layoutCase.label}`);
  return clicked;
};

const verifyLayout = layoutCase => withPrecompiledRouteBrowser(async session => {
  await prepareSession(session);
  const presetId = 'wms-demand-allocation-strategy-v2';
  const target = PRECOMPILED_DISPLAY_ROUTE_TARGETS.find(candidate => candidate.presetId === presetId);
  if (!target) throw new Error(`Canonical layout preset target is missing: ${presetId}`);
  const identity = parseCanonicalPresetIdentity(
    JSON.parse(await readFile(target.sourcePath, 'utf8')),
    presetId,
  );
  await session.send('Page.navigate', {
    url: `${BASE_URL}/?canonicalPreset=${encodeURIComponent(presetId)}`
      + `&routingMatrix=${layoutCase.id}-${Date.now()}`
      + `#/?diagram=${encodeURIComponent(presetId)}`,
  });
  await waitForValue(session, readFinalRouteExpression(''), `${layoutCase.id} initial route`);
  await session.evaluate('window.__vizlyRoutingResponses = []');
  const clickedAt = await clickLayout(session, layoutCase);
  const route = await waitForValue(
    session,
    readFinalRouteExpression('layout:'),
    `${layoutCase.id} layout route`,
  );
  const totalRouteMs = Number.isFinite(route.routing.finalAppliedAt)
    ? route.routing.finalAppliedAt - clickedAt
    : route.routing.totalRouteMs;
  if (!Number.isFinite(totalRouteMs) || totalRouteMs > MAX_LAYOUT_ROUTE_MS) {
    throw new Error(`${layoutCase.id} exceeded ${MAX_LAYOUT_ROUTE_MS}ms: ${totalRouteMs}`);
  }
  const mounted = await session.evaluate(`(() => ({
    nodes: window.reactFlowInstance?.getNodes?.().map(node => ({ id: node.id })) || [],
    edges: window.reactFlowInstance?.getEdges?.().map(edge => ({ id: edge.id })) || [],
  }))()`);
  const canonicalMount = verifyCanonicalPresetMount({
    identity,
    requestNodes: route.request?.nodes,
    requestEdges: route.request?.edges,
    mountedNodes: mounted.nodes,
    mountedEdges: mounted.edges,
  });
  return {
    id: layoutCase.id,
    resolution: route.response.routeResolution,
    routeMs: Number.isFinite(route.request?.__browserCapturedAt)
      && Number.isFinite(route.response.__browserCapturedAt)
      ? route.response.__browserCapturedAt - route.request.__browserCapturedAt
      : route.routing.routeMs,
    totalRouteMs,
    slowestPhases: summarizeSlowestDisplayRoutingPhases(route.response.phaseTrace),
    canonicalMount,
    ...(await auditFinalSvg(session, route, layoutCase.id)),
  };
});

await assertProductionPreview();
const presetResults = [];
for (const target of PRECOMPILED_DISPLAY_ROUTE_TARGETS) {
  if (!REQUESTED_CASE || REQUESTED_CASE === target.presetId) {
    presetResults.push(await verifyPreset(target));
  }
}
const layoutResults = [];
for (const layoutCase of LAYOUT_CASES) {
  if (!REQUESTED_CASE || REQUESTED_CASE === layoutCase.id) {
    layoutResults.push(await verifyLayout(layoutCase));
  }
}
console.log(JSON.stringify({ presetResults, layoutResults }, null, 2));
