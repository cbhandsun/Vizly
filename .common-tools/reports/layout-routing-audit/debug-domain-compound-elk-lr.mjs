import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { clickLayout } from '../../../scripts/lib/display-routing-matrix-layout-command.mjs';
import { DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT } from '../../../scripts/lib/display-routing-browser-capture.mjs';
import { withPrecompiledRouteBrowser } from '../../../scripts/lib/precompiled-display-route-cdp.mjs';
import { DISPLAY_ROUTING_MATRIX_PRESET_TARGETS } from '../../../scripts/lib/display-routing-matrix-presets.mjs';
import { parseCanonicalPresetIdentity } from '../../../scripts/lib/display-routing-canonical-preset.mjs';
import { createDisplayRoutingMatrixWaiter } from '../../../scripts/lib/display-routing-matrix-wait.mjs';
import { displayRoutingCommittedEdgesMatchWorkerPatches } from '../../../scripts/lib/display-routing-browser-topology-matrix.mjs';
import {
  findDisplayRoutingRequestForResponse,
  resolveDisplayRoutingFinalRouteSnapshot,
} from '../../../scripts/lib/display-routing-matrix-final-route.mjs';
import { resolveDisplayRoutingConnectedDragDelta } from '../../../scripts/lib/display-routing-matrix-cases.mjs';

const BASE_URL = String(process.env.PRECOMPILED_ROUTE_BASE_URL || '').trim().replace(/\/$/, '');
if (!BASE_URL) throw new Error('PRECOMPILED_ROUTE_BASE_URL is required');

const waitForValue = createDisplayRoutingMatrixWaiter(30_000);
const presetId = 'wms-demand-allocation-strategy-v2';
const layoutCase = { id: 'domain-compound-elk-lr', strategy: 'domain-compound-elk', direction: 'LR' };

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

const readFinalRouteExpression = (
  expectedRequestPrefix,
  minimumExclusiveLayoutJobId,
) => `(() => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  if (routing.stage !== 'final-applied') return null;
  const requests = window.__vizlyRoutingRequests || [];
  const responses = window.__vizlyRoutingResponses || [];
  const renderedEdgeCount = document.querySelectorAll('.react-flow__edge').length;
  const findDisplayRoutingRequestForResponse = ${findDisplayRoutingRequestForResponse.toString()};
  const committedEdgesMatchWorkerPatches = ${displayRoutingCommittedEdgesMatchWorkerPatches.toString()};
  const resolveFinalRoute = ${resolveDisplayRoutingFinalRouteSnapshot.toString()};
  return resolveFinalRoute({
    routing,
    requests,
    responses,
    currentNodes: window.reactFlowInstance?.getNodes?.() || [],
    currentEdges: window.reactFlowInstance?.getEdges?.() || [],
    renderedEdgeCount,
    expectedRequestPrefix: ${JSON.stringify(expectedRequestPrefix)},
    minimumExclusiveLayoutJobId: ${JSON.stringify(minimumExclusiveLayoutJobId)},
    committedEdgesMatchWorkerPatches,
  });
})()`;

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

const readNodeParityDetailsExpression = rawNodes => `(() => {
  const rawNodes = ${JSON.stringify(rawNodes)};
  const nodes = Array.isArray(rawNodes) ? rawNodes.slice(0, 5000) : [];
  const finiteNumber = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const nodeById = new Map(nodes.flatMap(node => (
    node && typeof node === 'object'
      && typeof node.id === 'string'
      && node.id.length > 0
      && node.id.length <= 500
      ? [[node.id, node]]
      : []
  )));
  const resolvePosition = (node, seen = new Set()) => {
    const absoluteX = finiteNumber(node?.positionAbsolute?.x);
    const absoluteY = finiteNumber(node?.positionAbsolute?.y);
    if (absoluteX !== null && absoluteY !== null) return { x: absoluteX, y: absoluteY, source: 'positionAbsolute' };
    const localX = finiteNumber(node?.position?.x) ?? 0;
    const localY = finiteNumber(node?.position?.y) ?? 0;
    const parentId = typeof node?.parentId === 'string' ? node.parentId : '';
    if (!parentId || seen.has(parentId) || seen.size >= 100) return { x: localX, y: localY, source: 'position' };
    const parent = nodeById.get(parentId);
    if (!parent) return { x: localX, y: localY, source: 'orphan-position' };
    seen.add(parentId);
    const parentPosition = resolvePosition(parent, seen);
    return { x: parentPosition.x + localX, y: parentPosition.y + localY, source: 'parent-sum' };
  };
  const readDimension = (node, dimension) => (
    finiteNumber(node?.measured?.[dimension])
      ?? finiteNumber(node?.[dimension])
      ?? finiteNumber(node?.style?.[dimension])
  );
  const path = document.querySelector('.shared-trunk-edge-interaction')
    ?? document.querySelector('.react-flow__edge path');
  const matrix = path?.getScreenCTM?.();
  const project = point => ({
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  });
  const mismatches = [];
  const samples = [];
  for (const [id, node] of nodeById) {
    if (node.hidden === true || (['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane']
      .includes(node.type) && node.data?.collapsed !== true)) continue;
    const element = [...document.querySelectorAll('.react-flow__node[data-id]')]
      .find(candidate => candidate.getAttribute('data-id') === id);
    const width = readDimension(node, 'width');
    const height = readDimension(node, 'height');
    const rect = element?.getBoundingClientRect?.();
    if (!element || width === null || height === null || !rect) continue;
    const position = resolvePosition(node);
    const projectedStart = project(position);
    const projectedEnd = project({ x: position.x + width, y: position.y + height });
    const expectedLeft = Math.min(projectedStart.x, projectedEnd.x);
    const expectedTop = Math.min(projectedStart.y, projectedEnd.y);
    const positionDelta = Math.hypot(rect.left - expectedLeft, rect.top - expectedTop);
    const item = {
      id,
      type: node.type ?? null,
      parentId: node.parentId ?? null,
      position: node.position ?? null,
      positionAbsolute: node.positionAbsolute ?? null,
      resolvedPosition: position,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      expected: { left: expectedLeft, top: expectedTop },
      delta: Math.round(positionDelta * 1000) / 1000,
    };
    samples.push(item);
    if (positionDelta > 1.5) mismatches.push(item);
  }
  return {
    viewport: window.reactFlowInstance?.getViewport?.() ?? null,
    transform: matrix ? { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f } : null,
    mismatches,
    largest: samples.sort((a, b) => b.delta - a.delta).slice(0, 8),
  };
})()`;

const result = await withPrecompiledRouteBrowser(async session => {
  await prepareSession(session);
  const target = DISPLAY_ROUTING_MATRIX_PRESET_TARGETS.find(candidate => candidate.presetId === presetId);
  if (!target) throw new Error(`Missing preset target: ${presetId}`);
  parseCanonicalPresetIdentity(JSON.parse(await readFile(target.sourcePath, 'utf8')), presetId);
  await session.send('Page.navigate', {
    url: `${BASE_URL}/?canonicalPreset=${encodeURIComponent(presetId)}&routingMatrix=debug-${Date.now()}#/?diagram=${encodeURIComponent(presetId)}`,
  });
  await waitForValue(session, readFinalRouteExpression(''), 'initial route');
  await session.evaluate('window.__vizlyRoutingResponses = []');
  const previousLayoutJobId = await session.evaluate(
    'window.__vizlyBaseReactFlowDisplayRouting?.layoutTransactionJobId ?? 0',
  );
  await clickLayout(session, layoutCase);
  const route = await waitForValue(
    session,
    readFinalRouteExpression('layout:', previousLayoutJobId),
    'layout route',
  );
  await delay(500);
  const dragTarget = await session.evaluate(`(() => {
    const instance = window.reactFlowInstance;
    const edges = instance?.getEdges?.() || [];
    const incidentIds = new Set(edges.flatMap(edge => [edge.source, edge.target]));
    const connected = (instance?.getNodes?.() || []).filter(node => incidentIds.has(node.id));
    const nodeId = connected.find(node => !node.parentId)?.id ?? connected[0]?.id ?? null;
    const resolveDelta = ${resolveDisplayRoutingConnectedDragDelta.toString()};
    const delta = nodeId ? resolveDelta(instance.getNodes(), edges, nodeId) : null;
    return nodeId && delta ? { nodeId, delta } : null;
  })()`);
  await session.evaluate('window.__vizlyRoutingRequests = []; window.__vizlyRoutingResponses = [];');
  await session.evaluate(`(() => {
    const instance = window.reactFlowInstance;
    instance.setNodes(nodes => nodes.map(node => node.id === ${JSON.stringify(dragTarget.nodeId)} ? {
      ...node,
      position: {
        x: Number(node.position?.x || 0) + ${JSON.stringify(dragTarget.delta.x)},
        y: Number(node.position?.y || 0) + ${JSON.stringify(dragTarget.delta.y)},
      },
    } : node));
  })()`);
  const incremental = await waitForValue(session, readLatestCompletedRouteExpression, 'post-layout move');
  const details = await session.evaluate(readNodeParityDetailsExpression(incremental.request?.nodes));
  return {
    dragTarget,
    layoutRoute: {
      requestId: route.request?.requestId,
      nodeCount: route.request?.nodes?.length,
      edgeCount: route.request?.edges?.length,
    },
    incrementalRoute: {
      requestId: incremental.request?.requestId,
      operation: incremental.request?.operation,
      nodeCount: incremental.request?.nodes?.length,
      edgeCount: incremental.request?.edges?.length,
      routeResolution: incremental.response?.routeResolution,
      affectedEdgeCount: incremental.response?.affectedEdgeCount,
    },
    details,
  };
});

console.log(JSON.stringify(result, null, 2));
