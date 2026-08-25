import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';

import { DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT } from './lib/display-routing-browser-capture.mjs';
import { summarizeSlowestDisplayRoutingPhases } from './lib/display-routing-browser-performance.mjs';
import {
  displayRoutingFinalSvgGeometryIsClean,
  readDisplayRoutingNodeGeometryParity,
  readDisplayRoutingVisualScaleAudit,
  readRenderedDisplayEdgeNodeIntersections,
} from './lib/display-routing-browser-geometry.mjs';
import { withPrecompiledRouteBrowser } from './lib/precompiled-display-route-cdp.mjs';
import { PRECOMPILED_DISPLAY_ROUTE_TARGETS } from './lib/precompiled-display-route-targets.mjs';
import {
  parseCanonicalPresetIdentity,
  verifyCanonicalPresetMount,
} from './lib/display-routing-canonical-preset.mjs';
import {
  createDisplayRoutingMatrixCaseIds,
  DISPLAY_ROUTING_LAYOUT_CASES,
  parseDisplayRoutingMatrixCase,
} from './lib/display-routing-matrix-cases.mjs';
import {
  displayRoutingWaitStateHasTerminalFailure,
  summarizeDisplayRoutingWaitState,
} from './lib/display-routing-matrix-wait-state.mjs';
import { assertDisplayRoutingVisualScaleAudit } from './lib/display-routing-browser-visual-audit.mjs';

const BASE_URL = String(process.env.PRECOMPILED_ROUTE_BASE_URL || '').trim().replace(/\/$/, '');
const WAIT_TIMEOUT_MS = 120_000;
const MAX_LAYOUT_ROUTE_MS = 30_000;
const MATRIX_CASE_IDS = createDisplayRoutingMatrixCaseIds(
  PRECOMPILED_DISPLAY_ROUTE_TARGETS.map(target => target.presetId),
);
const REQUESTED_CASE = parseDisplayRoutingMatrixCase(
  process.env.DISPLAY_ROUTING_MATRIX_CASE,
  MATRIX_CASE_IDS,
);

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
    const state = await session.evaluate(`(() => {
      const summarize = ${summarizeDisplayRoutingWaitState.toString()};
      return summarize(
        window.__vizlyBaseReactFlowDisplayRouting || {},
        window.__vizlyRoutingResponses || [],
        document.querySelectorAll('.react-flow__edge').length,
      );
    })()`);
    if (displayRoutingWaitStateHasTerminalFailure(state)) {
      throw new Error(`Routing failed while waiting for ${label}:\n${JSON.stringify(state, null, 2)}`);
    }
    await delay(100);
  }
  const state = await session.evaluate(`(() => {
    const summarize = ${summarizeDisplayRoutingWaitState.toString()};
    return summarize(
      window.__vizlyBaseReactFlowDisplayRouting || {},
      window.__vizlyRoutingResponses || [],
      document.querySelectorAll('.react-flow__edge').length,
    );
  })()`);
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
  const commercialAudit = await session.evaluate(
    `(${readRenderedDisplayEdgeNodeIntersections.toString()})(${JSON.stringify(route.response.edges)}, 48)`,
  );
  const nodeGeometryParity = await session.evaluate(
    `(${readDisplayRoutingNodeGeometryParity.toString()})(${JSON.stringify(route.request?.nodes)})`,
  );
  if (
    !nodeGeometryParity
    || nodeGeometryParity.comparedNodeCount < 1
    || nodeGeometryParity.positionMismatchCount !== 0
    || nodeGeometryParity.sizeMismatchCount !== 0
  ) {
    throw new Error(`Worker/DOM node geometry parity failed for ${label}: ${JSON.stringify(nodeGeometryParity)}`);
  }
  if (!displayRoutingFinalSvgGeometryIsClean({
    audit,
    commercialAudit,
    expectedPathCount: route.response.edges.length,
  })) {
    throw new Error(`Final SVG geometry failed for ${label}: ${JSON.stringify({
      expectedPathCount: route.response.edges.length,
      auditedPathCount: audit?.auditedPathCount,
      invalidPathCount: audit?.invalidEdgeIds?.length,
      obstacleHitCount: audit?.intersections?.length,
      minimumClearanceRiskCount: audit?.clearanceRisks?.length,
      commercialClearanceRiskCount: commercialAudit?.clearanceRisks?.length,
    })}`);
  }
  const visualAudit = await session.evaluate(
    `(${readDisplayRoutingVisualScaleAudit.toString()})()`,
  );
  assertDisplayRoutingVisualScaleAudit({
    name: label,
    audit: visualAudit,
    expectedSignature: route.routing.outputRouteSignature,
    expectedEdgeCount: route.response.edges.length,
    expectedLabelCount: null,
    requireOverviewPrimaryLabel: false,
  });
  return {
    obstacleHits: audit.intersections.length,
    minimumClearanceRisks: audit.clearanceRisks.length,
    commercialClearanceRisks: commercialAudit.clearanceRisks.length,
    nodeGeometryParity,
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
    const candidateFailures = await session.evaluate(`(() => (
      (window.__vizlyRoutingResponses || []).flatMap(item => {
        const report = item?.boundedCandidate;
        if (!report || typeof report !== 'object') return [];
        return [{
          candidate: report.candidate,
          hardClean: report.hardClean,
          obstacleHits: report.obstacleHits,
          terminalsAttached: report.terminalsAttached,
          terminalsAnchored: report.terminalsAnchored,
          quality: report.quality,
          minimumClearanceViolations: report.minimumClearanceViolations,
          commercialClearanceViolations: report.commercialClearanceViolations,
        }];
      })
    ))()`);
    throw new Error(`${target.presetId} did not use its validated precompiled route:\n${JSON.stringify({
      responseResolution: route.response.routeResolution,
      candidateFailures,
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
  const clickVisibleItem = () => session.evaluate(`(() => {
    const expected = ${JSON.stringify(layoutCase.label)};
    const item = Array.from(document.querySelectorAll('.ant-dropdown-menu-item'))
      .find(candidate => candidate.textContent?.trim() === expected);
    item?.click();
    return item ? Date.now() : null;
  })()`);
  let clicked = await clickVisibleItem();
  if (!clicked) {
    const submenuCenter = await session.evaluate(`(() => {
      const item = Array.from(document.querySelectorAll(
        '.flowchart-layout-menu .ant-dropdown-menu-submenu-title',
      )).find(candidate => candidate.textContent?.includes('更多布局引擎'));
      if (!item) return null;
      const rect = item.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    if (submenuCenter) {
      await session.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: submenuCenter.x,
        y: submenuCenter.y,
      });
      await delay(500);
      clicked = await clickVisibleItem();
    }
  }
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
for (const layoutCase of DISPLAY_ROUTING_LAYOUT_CASES) {
  if (!REQUESTED_CASE || REQUESTED_CASE === layoutCase.id) {
    layoutResults.push(await verifyLayout(layoutCase));
  }
}
console.log(JSON.stringify({ presetResults, layoutResults }, null, 2));
