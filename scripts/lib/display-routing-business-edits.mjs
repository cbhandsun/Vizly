import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { withPrecompiledRouteBrowser } from './precompiled-display-route-cdp.mjs';
import { DISPLAY_ROUTING_MATRIX_PRESET_TARGETS } from './display-routing-matrix-presets.mjs';
import { parseCanonicalPresetIdentity, verifyCanonicalPresetMount } from './display-routing-canonical-preset.mjs';
import { resolveDisplayRoutingConnectedDragDelta } from './display-routing-matrix-cases.mjs';
import { waitForStableDisplayRoutingViewport } from './display-routing-browser-viewport.mjs';
import { prepareDisplayRoutingIncrementalCapture, releaseDisplayRoutingDrag } from './display-routing-browser-diagnostics.mjs';
import { projectDisplayRoutingEditStability } from './display-routing-edit-stability.mjs';
import { captureTopologyStabilityBaseline, readTopologyEditStability } from './display-routing-topology-stability.mjs';
import { displayRoutingCommittedEdgesMatchWorkerPatches, displayRoutingTopologyRenderIsCommitted,
  displayRoutingTopologyTransactionIsCommitted } from './display-routing-browser-topology-matrix.mjs';
import { displayRoutingTopologyRequestMatchesResponse, displayRoutingTopologyResponseIsFinal,
  findDisplayRoutingTopologyFinalResponse } from './display-routing-browser-topology-response.mjs';
import { waitForStableDisplayRoutingLayoutVisual } from './display-routing-layout-visual-settle.mjs';
import { startEditProcessSampling, stopEditProcessSampling } from './display-routing-edit-process.mjs';
import { captureBusinessHistoryState, verifyBusinessHistoryRoundtrip } from './display-routing-history-edits.mjs';
import { installHeldRoutingResponse } from './display-routing-held-response.mjs';
import { clickLayout, assertRequestedLayoutSelected } from './display-routing-matrix-layout-command.mjs';

export const businessEditFinalRouteExpression = (nodeId, previousRequestId) => `(() => {
  const displayRoutingTopologyRequestMatchesResponse = ${displayRoutingTopologyRequestMatchesResponse.toString()};
  const displayRoutingTopologyResponseIsFinal = ${displayRoutingTopologyResponseIsFinal.toString()};
  const findResponse = ${findDisplayRoutingTopologyFinalResponse.toString()};
  const transactionIsCommitted = ${displayRoutingTopologyTransactionIsCommitted.toString()};
  const renderIsCommitted = ${displayRoutingTopologyRenderIsCommitted.toString()};
  const patchesMatch = ${displayRoutingCommittedEdgesMatchWorkerPatches.toString()};
  const request = [...(window.__vizlyRoutingRequests || [])].reverse().find(item =>
    item.operation === 'incremental-route' && item.requestId !== ${JSON.stringify(previousRequestId)}
    && item.changeSet?.changedNodeIds?.includes(${JSON.stringify(nodeId)}));
  const response = request ? findResponse(request, window.__vizlyRoutingResponses || []) : null;
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  const edges = window.reactFlowInstance?.getEdges?.();
  const renderedEdgeCount = document.querySelectorAll('.react-flow__edge').length;
  return request && response?.hardClean === true && response.hardReport?.hardClean === true
    && renderIsCommitted(routing) && transactionIsCommitted(routing, request, response)
    && Array.isArray(edges) && edges.length === request.edges.length && renderedEdgeCount === edges.length
    && patchesMatch(edges, response.routingPatches ?? response.edges)
    ? { request, response: {...response, edges}, routing, renderedEdgeCount } : null;
})()`;

export const selectBusinessEditTarget = (nodes, edges) => {
  if (!Array.isArray(nodes) || !Array.isArray(edges) || nodes.length > 5_000 || edges.length > 5_000
    || nodes.some(node => !node || typeof node.id !== 'string')
    || edges.some(edge => !edge || typeof edge.source !== 'string' || typeof edge.target !== 'string')) return null;
  const nodeIds = new Set(nodes.map(node => node.id));
  if (nodeIds.size !== nodes.length || edges.some(edge => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))) return null;
  const degrees = new Map();
  for (const edge of edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    if (edge.target !== edge.source) degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }
  const parents = new Set(nodes.map(node => node.parentId).filter(Boolean));
  const candidates = nodes.flatMap((node, index) => {
    const degree = degrees.get(node.id) ?? 0;
    return !node.hidden && node.draggable !== false && !parents.has(node.id)
      && node.type !== 'titleGroup' && degree > 0 && degree < edges.length
      && node.id.length > 0 && node.id.length <= 500
      && Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y)
      ? [{ nodeId: node.id, nodeIndex: index, degree }] : [];
  });
  return candidates.sort((a, b) => a.degree - b.degree || a.nodeId.localeCompare(b.nodeId))[0] ?? null;
};

export const assertBusinessEditStability = (value, displacement) => {
  const metrics = projectDisplayRoutingEditStability(value);
  if (!metrics || !Number.isFinite(displacement) || displacement <= 0.01
    || metrics.comparedNodeCount === 0 || metrics.comparedEdgeCount === 0) {
    throw new Error('Incomplete business edit stability evidence');
  }
  if (metrics.movedNodeCount !== 0 || metrics.addedNodeCount !== 0 || metrics.removedNodeCount !== 0
    || metrics.addedEdgeCount !== 0 || metrics.removedEdgeCount !== 0 || metrics.rewiredEdgeCount !== 0) {
    throw new Error('Business drag changed unrelated positions or topology');
  }
  // All four canonical leaf-drag fixtures retain feasible nonincident routes.
  // Keep this independent of any enlargement of the router's eligible scope.
  if (metrics.changedPortCount !== 0 || metrics.changedGeometryCount !== 0) {
    throw new Error('Business drag changed retained nonincident routes');
  }
  return metrics;
};

export const businessEditPositionExpression = nodeId => `(() => {
  const node = window.reactFlowInstance?.getInternalNode?.(${JSON.stringify(nodeId)});
  const position = node?.internals?.positionAbsolute;
  return Number.isFinite(position?.x) && Number.isFinite(position?.y)
    ? { x: position.x, y: position.y } : null;
})()`;

export const assertBusinessEditRepairScope = evidence => {
  const scope = evidence?.finalRepairScope;
  if (scope?.status === 'full-route') return;
  const outside = projectDisplayRoutingEditStability(scope?.outsideFinalRepairGroup);
  if (scope?.status !== 'available' || !outside) throw new Error('Business edit final repair scope unavailable');
  if (outside.changedPortCount !== 0 || outside.changedGeometryCount !== 0) {
    throw new Error('Business edit changed routes outside final repair group');
  }
};

const dragBusinessNode = async (session, nodeId, direction) => {
  // parentId may be restored during an edit: local coordinates are not
  // comparable across that transition. Measure both endpoints in canvas space.
  const before = await session.evaluate(businessEditPositionExpression(nodeId));
  if (!before) throw new Error('Business drag absolute position unavailable');
  const prepared = await session.evaluate(`(() => {
    const instance = window.reactFlowInstance;
    const node = instance?.getNodes?.().find(item => item.id === ${JSON.stringify(nodeId)});
    if (!node) return null;
    instance.setNodes(nodes => nodes.map(item => ({ ...item, selected: false })));
    instance.fitView({ nodes: [node], padding: 0.6, minZoom: 0.5, maxZoom: 1, duration: 0 });
    return { x: node.position.x, y: node.position.y };
  })()`);
  if (!prepared) throw new Error('Business drag node unavailable');
  const { target, viewport } = await waitForStableDisplayRoutingViewport(session, nodeId);
  const delta = await session.evaluate(`(${resolveDisplayRoutingConnectedDragDelta.toString()})(
    window.reactFlowInstance.getNodes(), window.reactFlowInstance.getEdges(), ${JSON.stringify(nodeId)}, 16)`);
  if (!target || !delta || !Number.isFinite(viewport.zoom) || viewport.zoom <= 0) throw new Error('Business drag target unavailable');
  await captureTopologyStabilityBaseline(session);
  await prepareDisplayRoutingIncrementalCapture(session);
  await startEditProcessSampling(session, nodeId);
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...target, button: 'none' });
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...target, button: 'left', buttons: 1, clickCount: 1 });
  const end = { x: target.x + direction * delta.x * viewport.zoom, y: target.y + direction * delta.y * viewport.zoom };
  for (let step = 1; step <= 4; step += 1) {
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1,
      x: target.x + (end.x - target.x) * step / 4, y: target.y + (end.y - target.y) * step / 4 });
    await delay(20);
  }
  return { before, releasedAt: await releaseDisplayRoutingDrag(session, end.x, end.y) };
};

export const verifyDisplayRoutingBusinessEdits = async ({ baseUrl, prepareSession,
  waitForValue, readFinalRouteExpression, auditFinalSvg, layoutCase, onProgress = () => {} }) => {
  const results = [];
  for (const target of DISPLAY_ROUTING_MATRIX_PRESET_TARGETS) {
    results.push(await withPrecompiledRouteBrowser(async session => {
      await prepareSession(session);
      const identity = parseCanonicalPresetIdentity(JSON.parse(await readFile(target.sourcePath, 'utf8')), target.presetId);
      await session.send('Page.navigate', { url: `${baseUrl}/?canonicalPreset=${encodeURIComponent(target.presetId)}`
        + `&businessEdit=${Date.now()}#/?diagram=${encodeURIComponent(target.presetId)}` });
      let route = await waitForValue(session, readFinalRouteExpression(''), `${target.presetId} initial route`);
      let mounted = await session.evaluate('({nodes:window.reactFlowInstance.getNodes(),edges:window.reactFlowInstance.getEdges()})');
      const canonicalMount = verifyCanonicalPresetMount({ identity, requestNodes: route.request.nodes,
        requestEdges: route.request.edges, mountedNodes: mounted.nodes, mountedEdges: mounted.edges });
      await waitForStableDisplayRoutingLayoutVisual({ session, expectedRequestId: route.routing.requestId,
        expectedNodeCount: route.request.nodes.length, expectedEdgeCount: route.response.edges.length });
      if (layoutCase) {
        const previousJobId = await session.evaluate('window.__vizlyBaseReactFlowDisplayRouting?.layoutTransactionJobId ?? 0');
        await clickLayout(session, layoutCase);
        route = await waitForValue(session, readFinalRouteExpression('layout:', previousJobId),
          `${target.presetId} ${layoutCase.id} before editing`);
        await waitForStableDisplayRoutingLayoutVisual({ session, expectedRequestId: route.routing.requestId,
          expectedNodeCount: route.request.nodes.length, expectedEdgeCount: route.response.edges.length });
        await assertRequestedLayoutSelected(session, layoutCase.id);
        mounted = await session.evaluate('({nodes:window.reactFlowInstance.getNodes(),edges:window.reactFlowInstance.getEdges()})');
      }
      const initialAudit = await auditFinalSvg(session, route, `${target.presetId} before editing`);
      onProgress({ event: 'business-edit-initial-passed', presetId: target.presetId });
      const selected = selectBusinessEditTarget(mounted.nodes, mounted.edges);
      if (!selected) throw new Error('Business fixture has no eligible connected leaf');
      const operations = [];
      for (const direction of [1, -1]) {
        await captureBusinessHistoryState(session, 'before');
        const priorRequestId = route.request.requestId;
        const drag = await dragBusinessNode(session, selected.nodeId, direction);
        route = await waitForValue(session, businessEditFinalRouteExpression(selected.nodeId, priorRequestId),
          `${target.presetId} business drag`);
        await waitForStableDisplayRoutingLayoutVisual({ session,
          ...(route.routing.requestId ? { expectedRequestId: route.routing.requestId }
            : { expectedCommittedRouteSignature: route.response.outputRouteSignature }),
          expectedNodeCount: route.request.nodes.length, expectedEdgeCount: route.response.edges.length });
        const after = await session.evaluate(businessEditPositionExpression(selected.nodeId));
        const processStability = await stopEditProcessSampling(session);
        const scopeEvidence = await readTopologyEditStability(session, 'business-drag',
          route.request.mutableEdgeIds, route.response, [selected.nodeId]);
        const stability = scopeEvidence.intent;
        assertBusinessEditRepairScope(scopeEvidence);
        assertBusinessEditStability(stability, after ? Math.hypot(after.x - drag.before.x, after.y - drag.before.y) : NaN);
        operations.push({ id: direction === 1 ? 'drag-away' : 'drag-reverse', editedNodeIndex: selected.nodeIndex,
          routeResolution: route.response.routeResolution, fallbackLevel: route.response.fallbackLevel,
          workerDurationMs: route.response.workerDurationMs, releaseToObservedMs: Date.now() - drag.releasedAt,
          stability, scopeEvidence, processStability, ...(await auditFinalSvg(session, route, `${target.presetId} edited route`)) });
        onProgress({ event: 'business-edit-operation-passed', presetId: target.presetId,
          operation: operations.at(-1).id, stability: projectDisplayRoutingEditStability(stability), scopeEvidence, processStability });
      }
      await captureBusinessHistoryState(session, 'after');
      const history = await verifyBusinessHistoryRoundtrip({ session, editedNodeId: selected.nodeId,
        waitForValue, readFinalRouteExpression, auditFinalSvg });
      onProgress({ event: 'business-edit-history-passed', presetId: target.presetId, operations: history.map(item => item.operation) });
      let pendingHistory;
      if (target === DISPLAY_ROUTING_MATRIX_PRESET_TARGETS[0]) {
        await captureBusinessHistoryState(session, 'before');
        await session.evaluate(`window.__vizlyHeldRoutingResponse = (${installHeldRoutingResponse.toString()})()`);
        try {
          await dragBusinessNode(session, selected.nodeId, 1);
          await waitForValue(session, 'window.__vizlyHeldRoutingResponse.state().held', 'held incremental response');
          await stopEditProcessSampling(session);
          await captureBusinessHistoryState(session, 'after');
          pendingHistory = await verifyBusinessHistoryRoundtrip({ session, editedNodeId: selected.nodeId,
            waitForValue, readFinalRouteExpression, auditFinalSvg,
            beforeVisualCheck: async operation => {
              if (operation === 'undo') await session.evaluate('window.__vizlyHeldRoutingResponse.release()');
            } });
          const hold = await session.evaluate('window.__vizlyHeldRoutingResponse.state()');
          if (!hold?.matched || !hold.held || !hold.released || hold.overflow || hold.disposed) {
            throw new Error('Pending history response injection incomplete');
          }
          onProgress({ event: 'business-edit-pending-history-passed', presetId: target.presetId, hold });
        } finally {
          await session.evaluate('window.__vizlyHeldRoutingResponse?.dispose(); delete window.__vizlyHeldRoutingResponse; delete window.__vizlyBusinessHistory; delete window.__vizlyTopologyStabilityBaseline');
        }
      }
      return { presetId: target.presetId, layoutId: layoutCase?.id ?? 'canonical', canonicalMount, initialAudit, operations, history, pendingHistory };
    }));
  }
  return results;
};
