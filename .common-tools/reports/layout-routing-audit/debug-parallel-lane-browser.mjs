import { setTimeout as delay } from 'node:timers/promises';

import { DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT } from '../../../scripts/lib/display-routing-browser-capture.mjs';
import { readRenderedDisplayEdgeHardGeometryAudit } from '../../../scripts/lib/display-routing-browser-hard-geometry.mjs';
import {
  displayRoutingFinalSvgGeometryIsClean,
  readDisplayRoutingVisualScaleAudit,
  readRenderedDisplayEdgeNodeIntersections,
  summarizeDisplayRoutingGeometryFailure,
} from '../../../scripts/lib/display-routing-browser-geometry.mjs';
import { withPrecompiledRouteBrowser } from '../../../scripts/lib/precompiled-display-route-cdp.mjs';
import { createDisplayRoutingMatrixWaiter } from '../../../scripts/lib/display-routing-matrix-wait.mjs';
import { findDisplayRoutingRequestForResponse, resolveDisplayRoutingFinalRouteSnapshot } from '../../../scripts/lib/display-routing-matrix-final-route.mjs';
import { displayRoutingCommittedEdgesMatchWorkerPatches } from '../../../scripts/lib/display-routing-browser-topology-matrix.mjs';

const BASE_URL = String(process.env.PRECOMPILED_ROUTE_BASE_URL || '').trim().replace(/\/$/, '');
if (!BASE_URL) throw new Error('PRECOMPILED_ROUTE_BASE_URL is required');

const waitForValue = createDisplayRoutingMatrixWaiter(30_000);

const prepareSession = async session => {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await session.send('Page.addScriptToEvaluateOnNewDocument', {
    source: DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT,
  });
};

const readLatestCompletedRouteExpression = `(() => {
  const committedEdgesMatchWorkerPatches = ${displayRoutingCommittedEdgesMatchWorkerPatches.toString()};
  const findRequestForResponse = ${findDisplayRoutingRequestForResponse.toString()};
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  const requests = window.__vizlyRoutingRequests || [];
  const responses = window.__vizlyRoutingResponses || [];
  const response = [...responses].reverse().find(item => item?.hardClean === true);
  const request = findRequestForResponse(requests, response) ?? requests.at(-1);
  const currentEdges = window.reactFlowInstance?.getEdges?.() || [];
  const responsePatches = response?.routingPatches ?? response?.edges;
  return routing.stage === 'final-applied'
    && routing.renderAuthorityStatus === 'accepted'
    && routing.requestId === response?.requestId
    && request?.requestId === response?.requestId
    && currentEdges.length > 0
    && committedEdgesMatchWorkerPatches(currentEdges, responsePatches)
    ? {
      routing,
      request,
      response: { ...response, edges: Array.isArray(response.edges) ? response.edges : currentEdges },
      renderedEdgeCount: document.querySelectorAll('.react-flow__edge').length,
    }
    : null;
})()`;

const installParallelScenarioExpression = `(() => {
  const instance = window.reactFlowInstance;
  if (!instance?.setNodes || !instance?.setEdges) throw new Error('React Flow instance unavailable');
  const width = 120;
  const height = 72;
  const nodes = [
    {
      id: 'parallel-source',
      type: 'custom',
      position: { x: 120, y: 220 },
      width,
      height,
      measured: { width, height },
      data: { label: '并行源', description: 'parallel source', fixed: true },
    },
    {
      id: 'parallel-target',
      type: 'custom',
      position: { x: 520, y: 380 },
      width,
      height,
      measured: { width, height },
      data: { label: '并行目标', description: 'parallel target', fixed: true },
    },
  ];
  const edges = ['a', 'b', 'c', 'd'].map((suffix, index) => ({
    id: 'parallel-edge-' + suffix,
    source: 'parallel-source',
    target: 'parallel-target',
    sourceHandle: 'bottom',
    targetHandle: 'left',
    type: 'advanced-smart-step',
    label: '关系 ' + String(index + 1),
    data: {
      label: '关系 ' + String(index + 1),
      relationKey: 'parallel-review',
      edgeType: 'parallel-review',
    },
    style: { stroke: '#2563eb', strokeWidth: 2 },
  }));
  window.__vizlyRoutingRequests = [];
  window.__vizlyRoutingResponses = [];
  instance.setNodes(nodes);
  instance.setEdges(edges);
  return { nodeCount: nodes.length, edgeCount: edges.length, ids: edges.map(edge => edge.id) };
})()`;

const summarizeRouteExpression = `(() => {
  const edges = window.reactFlowInstance?.getEdges?.() || [];
  const lanes = edges.map(edge => {
    const path = edge.data?.computedPath ?? null;
    const trunkX = Array.isArray(path) && path.length >= 5 ? path[2]?.x : null;
    const laneOffset = typeof trunkX === 'number' ? trunkX - 180 : null;
    return {
      id: edge.id,
      laneOffset,
      separated: typeof laneOffset === 'number' && laneOffset > 0,
      path,
    };
  });
  const pathElements = [...document.querySelectorAll('[data-testid^="rf__edge-"]')].map(wrapper => ({
    id: wrapper.getAttribute('data-testid'),
    d: wrapper.querySelector('.shared-trunk-edge-interaction, .shared-trunk-accent-trace, .react-flow__edge-path')?.getAttribute('d') || '',
  }));
  return { lanes, pathElements };
})()`;

const result = await withPrecompiledRouteBrowser(async session => {
  await prepareSession(session);
  await session.send('Page.navigate', {
    url: `${BASE_URL}/?canonicalPreset=logistics-architecture-v1&parallelLaneAudit=${Date.now()}#/?diagram=logistics-architecture-v1`,
  });
  await waitForValue(session, readLatestCompletedRouteExpression, 'initial route');
  const installed = await session.evaluate(installParallelScenarioExpression);
  const route = await waitForValue(session, readLatestCompletedRouteExpression, 'parallel lane route');
  await delay(500);
  const routeSummary = await session.evaluate(summarizeRouteExpression);
  const audit = await session.evaluate(
    `(${readRenderedDisplayEdgeNodeIntersections.toString()})(${JSON.stringify(route.response.edges)}, 16)`,
  );
  const commercialAudit = await session.evaluate(
    `(${readRenderedDisplayEdgeNodeIntersections.toString()})(${JSON.stringify(route.response.edges)}, 48)`,
  );
  const hardAudit = await session.evaluate(
    `(${readRenderedDisplayEdgeHardGeometryAudit.toString()})(${JSON.stringify(route.response.edges)}, ${JSON.stringify(route.request?.nodes)})`,
  );
  const visualAudit = await session.evaluate(
    `(${readDisplayRoutingVisualScaleAudit.toString()})()`,
  );
  if (!displayRoutingFinalSvgGeometryIsClean({
    audit,
    commercialAudit,
    hardAudit,
    expectedPathCount: route.response.edges.length,
  })) {
    throw new Error(`Parallel lane SVG geometry failed: ${JSON.stringify(
      summarizeDisplayRoutingGeometryFailure({ route, audit, commercialAudit, hardAudit, visualAudit }),
    )}`);
  }
  const laneOffsets = routeSummary.lanes
    .map(edge => edge.laneOffset)
    .sort((first, second) => first - second);
  if (JSON.stringify(laneOffsets) !== JSON.stringify([24, 48, 72, 96])) {
    throw new Error(`Expected four separated parallel lane paths: ${JSON.stringify(routeSummary, null, 2)}`);
  }
  return {
    installed,
    request: {
      requestId: route.request?.requestId,
      operation: route.request?.operation,
      nodeCount: route.request?.nodes?.length,
      edgeCount: route.request?.edges?.length,
    },
    response: {
      requestId: route.response?.requestId,
      hardClean: route.response?.hardClean,
      routeResolution: route.response?.routeResolution,
      renderedEdgeCount: route.renderedEdgeCount,
    },
    lanes: routeSummary.lanes.map(edge => ({
      id: edge.id,
      laneOffset: edge.laneOffset,
      separated: edge.separated,
      path: edge.path,
    })),
    audit: {
      obstacleHits: audit.intersections.length,
      minimumClearanceRisks: audit.clearanceRisks.length,
      commercialClearanceRisks: commercialAudit.clearanceRisks.length,
      strictCrossings: hardAudit?.quality?.strictCrossings ?? null,
      hardClean: route.response?.hardClean === true,
      labelNodeOverlapCount: visualAudit?.labelNodeOverlapCount ?? null,
      labelLabelOverlapCount: visualAudit?.labelLabelOverlapCount ?? null,
    },
  };
});

console.log(JSON.stringify(result, null, 2));
