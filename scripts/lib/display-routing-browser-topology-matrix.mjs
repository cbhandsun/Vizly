import { setTimeout as delay } from 'node:timers/promises';

import { DISPLAY_ROUTING_TOPOLOGY_CASE_ID } from './display-routing-matrix-cases.mjs';
import { withPrecompiledRouteBrowser } from './precompiled-display-route-cdp.mjs';

export { DISPLAY_ROUTING_TOPOLOGY_CASE_ID } from './display-routing-matrix-cases.mjs';

const TOPOLOGY_PRESET_ID = 'logistics-architecture-v1';
const WAIT_TIMEOUT_MS = 60_000;

const OPERATION_CASES = Object.freeze([
  Object.freeze({
    id: 'node-resize',
    classification: 'geometry',
    reason: 'node-resize',
    edgeDelta: 0,
  }),
  Object.freeze({
    id: 'edge-add',
    classification: 'topology',
    reason: 'edge-add',
    edgeDelta: 1,
  }),
  Object.freeze({
    id: 'port-policy',
    classification: 'topology',
    reason: 'port-policy',
    edgeDelta: 1,
  }),
  Object.freeze({
    id: 'edge-remove',
    classification: 'topology',
    reason: 'edge-remove',
    edgeDelta: 0,
  }),
]);

const readOperationResultExpression = operationCase => `(() => {
  const requests = window.__vizlyRoutingRequests || [];
  const responses = window.__vizlyRoutingResponses || [];
  const request = [...requests].reverse().find(item => (
    item?.operation === 'incremental-route'
    && item?.changeSet?.classification === ${JSON.stringify(operationCase.classification)}
  ));
  const response = request
    ? [...responses].reverse().find(item => item?.requestId === request.requestId)
    : null;
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  const committedEdges = window.reactFlowInstance?.getEdges?.() || [];
  if (
    !request
    || !response
    || routing.stage !== 'final-applied'
    || routing.requestId !== request.requestId
    || response.hardClean !== true
    || response.hardReport?.hardClean !== true
    || !Array.isArray(committedEdges)
  ) return null;
  return {
    operationId: ${JSON.stringify(operationCase.id)},
    capturedRequestCount: requests.length,
    capturedResponseCount: responses.length,
    requestOperation: request.operation,
    changeSet: request.changeSet,
    requestEdgeCount: request.edges?.length,
    responseEdgeCount: committedEdges.length,
    renderedEdgeCount: document.querySelectorAll('.react-flow__edge').length,
    request,
    response: { ...response, edges: committedEdges },
    routing: {
      requestId: routing.requestId,
      workerStartCount: routing.workerStartCount,
      workerAbortCount: routing.workerAbortCount,
      workerResolution: routing.workerResolution,
      fallbackLevel: routing.fallbackLevel,
      outputRouteSignature: routing.outputRouteSignature,
      finalAppliedAt: routing.finalAppliedAt,
    },
  };
})()`;

const waitForOperationResult = async (session, operationCase) => {
  const expression = readOperationResultExpression(operationCase);
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await session.evaluate(expression);
    if (result) return result;
    await delay(100);
  }
  const diagnostics = await session.evaluate(`(() => ({
    routing: window.__vizlyBaseReactFlowDisplayRouting || {},
    requests: window.__vizlyRoutingRequests || [],
    responses: window.__vizlyRoutingResponses || [],
    nodeCount: window.reactFlowInstance?.getNodes?.().length ?? null,
    edgeCount: window.reactFlowInstance?.getEdges?.().length ?? null,
    renderedEdgeCount: document.querySelectorAll('.react-flow__edge').length,
  }))()`);
  throw new Error(`Timed out waiting for ${operationCase.id}:\n${JSON.stringify(diagnostics, null, 2)}`);
};

const prepareOperationCapture = async session => session.evaluate(`(() => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  window.__vizlyRoutingRequests = [];
  window.__vizlyRoutingResponses = [];
  window.__vizlyBoundedCandidates = [];
  return {
    workerStartCount: routing.workerStartCount,
    workerAbortCount: routing.workerAbortCount,
  };
})()`);

const applyNodeResize = session => session.evaluate(`(() => {
  const instance = window.reactFlowInstance;
  const target = instance?.getNodes?.().find(node => node.id === 'tms');
  if (!instance?.setNodes || !target) return false;
  const width = Number(target.measured?.width ?? target.width ?? 300);
  instance.setNodes(nodes => nodes.map(node => node.id === target.id ? {
    ...node,
    width: width + 32,
    style: { ...node.style, width: width + 32 },
  } : node));
  return true;
})()`);

const applyEdgeAdd = async session => {
  await session.evaluate(`(() => {
    const instance = window.reactFlowInstance;
    const nodes = instance?.getNodes?.().filter(node => node.id === 'wcs' || node.id === 'bms');
    if (nodes?.length === 2) instance.fitView?.({ nodes, padding: 0.25, duration: 0 });
    return nodes?.length === 2;
  })()`);
  await delay(200);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const gesture = await session.evaluate(`(() => {
      const source = document.querySelector(
        '.react-flow__node[data-id="wcs"] .react-flow__handle.source.react-flow__handle-right',
      );
      const target = document.querySelector(
        '.react-flow__node[data-id="bms"] .react-flow__handle.target.react-flow__handle-left',
      );
      const instance = window.reactFlowInstance;
      if (!source || !target || !instance?.getEdges) return null;
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const inViewport = rect => (
        rect.width > 0
        && rect.height > 0
        && rect.left >= 0
        && rect.top >= 0
        && rect.right <= window.innerWidth
        && rect.bottom <= window.innerHeight
      );
      if (!inViewport(sourceRect) || !inViewport(targetRect)) return null;
      return {
        source: { x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + sourceRect.height / 2 },
        target: { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 },
        previousEdgeIds: instance.getEdges().map(edge => edge.id),
      };
    })()`);
    if (!gesture) {
      await delay(100);
      continue;
    }
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      ...gesture.source,
      button: 'none',
    });
    await delay(80);
    await session.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...gesture.source,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    for (let step = 1; step <= 10; step += 1) {
      await session.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: gesture.source.x + ((gesture.target.x - gesture.source.x) * step) / 10,
        y: gesture.source.y + ((gesture.target.y - gesture.source.y) * step) / 10,
        button: 'left',
        buttons: 1,
      });
      await delay(20);
    }
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...gesture.target,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    const previousIds = JSON.stringify(gesture.previousEdgeIds);
    const deadline = Date.now() + 1_500;
    while (Date.now() < deadline) {
      const edgeId = await session.evaluate(`(() => {
        const previousIds = new Set(${previousIds});
        const edge = window.reactFlowInstance?.getEdges?.()
          .find(candidate => !previousIds.has(candidate.id));
        if (!edge) return null;
        window.__vizlyTopologyAuditEdgeId = edge.id;
        return edge.id;
      })()`);
      if (edgeId) return true;
      await delay(50);
    }
  }
  return false;
};

const applyPortPolicyChange = session => session.evaluate(`(() => {
  const instance = window.reactFlowInstance;
  const target = instance?.getEdges?.().find(edge => edge.id === window.__vizlyTopologyAuditEdgeId);
  if (!instance?.setEdges || !target) return false;
  const nextHandle = target.targetHandle === 'left' ? 'top' : 'left';
  instance.setEdges(edges => edges.map(edge => edge.id === target.id ? {
    ...edge,
    targetHandle: nextHandle,
    data: { ...(edge.data || {}), autoTarget: false },
  } : edge));
  return true;
})()`);

const applyEdgeRemove = session => session.evaluate(`(() => {
  const instance = window.reactFlowInstance;
  if (!instance?.setEdges) return false;
  const before = instance.getEdges?.().length;
  instance.setEdges(edges => edges.filter(edge => edge.id !== window.__vizlyTopologyAuditEdgeId));
  return Number.isFinite(before) && before > 0;
})()`);

const APPLY_OPERATION = Object.freeze({
  'node-resize': applyNodeResize,
  'edge-add': applyEdgeAdd,
  'port-policy': applyPortPolicyChange,
  'edge-remove': applyEdgeRemove,
});

export const assertDisplayRoutingTopologyOperationResult = ({
  operationCase,
  result,
  counterBaseline,
  baselineEdgeCount,
}) => {
  const diagnostics = JSON.stringify({ operationCase, result, counterBaseline, baselineEdgeCount }, null, 2);
  const expectedEdgeCount = baselineEdgeCount + operationCase.edgeDelta;
  if (result?.requestOperation !== 'incremental-route') {
    throw new Error(`Topology operation did not use the incremental Worker protocol: ${diagnostics}`);
  }
  if (
    result?.changeSet?.classification !== operationCase.classification
    || result?.changeSet?.reason !== operationCase.reason
  ) {
    throw new Error(`Topology operation was misclassified: ${diagnostics}`);
  }
  if (
    result?.capturedRequestCount !== 1
    || result?.capturedResponseCount !== 1
    || result?.routing?.workerStartCount - counterBaseline.workerStartCount !== 1
    || result?.routing?.workerAbortCount - counterBaseline.workerAbortCount !== 0
  ) {
    throw new Error(`Topology operation was not one atomic Worker transaction: ${diagnostics}`);
  }
  if (
    result?.response?.hardClean !== true
    || result?.response?.hardReport?.hardClean !== true
    || result?.requestEdgeCount !== expectedEdgeCount
    || result?.responseEdgeCount !== expectedEdgeCount
    || result?.renderedEdgeCount !== expectedEdgeCount
    || typeof result?.routing?.outputRouteSignature !== 'string'
  ) {
    throw new Error(`Topology operation did not commit one hard-clean complete route: ${diagnostics}`);
  }
  if (
    operationCase.classification === 'topology'
    && (result?.response?.fallbackLevel !== 'full' || result?.routing?.fallbackLevel !== 'full')
  ) {
    throw new Error(`Topology operation did not use the bounded in-job full fallback: ${diagnostics}`);
  }
};

const verifyOperationGroup = ({
  baseUrl,
  prepareSession,
  waitForInitialRoute,
  auditFinalSvg,
  operationCases,
}) => withPrecompiledRouteBrowser(async session => {
  await prepareSession(session);
  const url = `${baseUrl}/?canonicalPreset=${encodeURIComponent(TOPOLOGY_PRESET_ID)}`
    + `&routingMatrix=${DISPLAY_ROUTING_TOPOLOGY_CASE_ID}-${Date.now()}`
    + `#/?diagram=${encodeURIComponent(TOPOLOGY_PRESET_ID)}`;
  await session.send('Page.navigate', { url });
  const initial = await waitForInitialRoute(session, TOPOLOGY_PRESET_ID);
  const baselineEdgeCount = initial.response.edges.length;
  const operationResults = [];
  for (const operationCase of operationCases) {
    const counterBaseline = await prepareOperationCapture(session);
    const applied = await APPLY_OPERATION[operationCase.id](session);
    if (!applied) throw new Error(`Could not apply browser topology operation: ${operationCase.id}`);
    const result = await waitForOperationResult(session, operationCase);
    assertDisplayRoutingTopologyOperationResult({
      operationCase,
      result,
      counterBaseline,
      baselineEdgeCount,
    });
    operationResults.push({
      id: operationCase.id,
      classification: result.changeSet.classification,
      reason: result.changeSet.reason,
      routeResolution: result.response.routeResolution,
      fallbackLevel: result.response.fallbackLevel,
      workerDurationMs: result.response.workerDurationMs,
      ...(await auditFinalSvg(session, result, operationCase.id)),
    });
  }
  return operationResults;
});

export const verifyDisplayRoutingTopologyMatrix = async options => ({
  id: DISPLAY_ROUTING_TOPOLOGY_CASE_ID,
  presetId: TOPOLOGY_PRESET_ID,
  operations: [
    ...await verifyOperationGroup({
      ...options,
      operationCases: OPERATION_CASES.slice(0, 1),
    }),
    ...await verifyOperationGroup({
      ...options,
      operationCases: OPERATION_CASES.slice(1),
    }),
  ],
});
