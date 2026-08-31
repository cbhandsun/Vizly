import { setTimeout as delay } from 'node:timers/promises';

import { DISPLAY_ROUTING_TOPOLOGY_CASE_ID } from './display-routing-matrix-cases.mjs';
import { readDisplayRoutingNodeDragTarget } from './display-routing-browser-geometry.mjs';
import { withPrecompiledRouteBrowser } from './precompiled-display-route-cdp.mjs';
import {
  countDisplayRoutingTopologyFinalResponses,
  displayRoutingTopologyRequestMatchesResponse,
  displayRoutingTopologyResponseIsFinal,
  findDisplayRoutingTopologyFinalResponse,
} from './display-routing-browser-topology-response.mjs';

export {
  countDisplayRoutingTopologyFinalResponses,
  displayRoutingTopologyRequestMatchesResponse,
  displayRoutingTopologyResponseIsFinal,
  findDisplayRoutingTopologyFinalResponse,
} from './display-routing-browser-topology-response.mjs';

export { DISPLAY_ROUTING_TOPOLOGY_CASE_ID } from './display-routing-matrix-cases.mjs';

const TOPOLOGY_PRESET_ID = 'logistics-architecture-v1';
const WAIT_TIMEOUT_MS = 60_000;

/**
 * The routing debug state is published immediately before React applies the
 * deferred edge props. Do not snapshot React Flow's edge store until its
 * terminal-render-critical fields match the Worker response; otherwise a
 * verifier can pair a new computed path with previous source/target handles.
 */
export const displayRoutingCommittedEdgesMatchWorkerPatches = (
  rawEdges,
  rawPatches,
) => {
  const MAX_ITEMS = 5_000;
  const MAX_POINTS = 512;
  if (
    !Array.isArray(rawEdges)
    || !Array.isArray(rawPatches)
    || rawEdges.length !== rawPatches.length
    || rawEdges.length > MAX_ITEMS
  ) return false;
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const tokenMatches = (edge, patch, key) => (
    !hasOwn(patch, key) || edge?.[key] === patch[key]
  );
  const pathMatches = (edgeData, patchData, key) => {
    if (!hasOwn(patchData, key)) return true;
    const edgePath = edgeData?.[key];
    const patchPath = patchData[key];
    if (typeof patchPath === 'undefined') return typeof edgePath === 'undefined';
    if (
      !Array.isArray(edgePath)
      || !Array.isArray(patchPath)
      || edgePath.length !== patchPath.length
      || edgePath.length > MAX_POINTS
    ) return false;
    return patchPath.every((point, index) => (
      point && typeof point === 'object'
      && Number.isFinite(point.x) && Number.isFinite(point.y)
      && edgePath[index] && typeof edgePath[index] === 'object'
      && edgePath[index].x === point.x && edgePath[index].y === point.y
    ));
  };
  return rawPatches.every((patch, index) => {
    const edge = rawEdges[index];
    if (
      !edge || !patch || typeof edge !== 'object' || typeof patch !== 'object'
      || edge.id !== patch.id || edge.source !== patch.source || edge.target !== patch.target
      || !tokenMatches(edge, patch, 'type')
      || !tokenMatches(edge, patch, 'sourceHandle')
      || !tokenMatches(edge, patch, 'targetHandle')
    ) return false;
    if (!hasOwn(patch, 'data')) return true;
    if (!patch.data || typeof patch.data !== 'object' || Array.isArray(patch.data)) return false;
    const edgeData = edge.data && typeof edge.data === 'object' && !Array.isArray(edge.data)
      ? edge.data
      : {};
    return pathMatches(edgeData, patch.data, 'computedPath')
      && pathMatches(edgeData, patch.data, 'elkPath');
  });
};

const OPERATION_CASES = Object.freeze([
  Object.freeze({
    id: 'node-resize',
    classification: 'geometry',
    reason: 'node-resize',
    edgeDelta: 0,
  }),
  Object.freeze({
    id: 'multi-node-move',
    classification: 'geometry',
    reason: 'node-drag',
    edgeDelta: 0,
    expectedChangedNodeIds: Object.freeze(['l-oms', 'wms']),
    maximumMutableEdgeCount: 8,
  }),
  Object.freeze({
    id: 'compound-subtree-move',
    classification: 'geometry',
    reason: 'unknown',
    edgeDelta: 0,
    expectedChangedNodeIds: Object.freeze([
      'bms',
      'customs',
      'l-oms',
      'titlegroup-logistics',
      'tms',
      'wcs',
      'wms',
      'yms',
    ]),
    maximumMutableEdgeCount: 13,
    requiredFallbackLevel: 'none',
  }),
  Object.freeze({
    id: 'node-add',
    classification: 'topology',
    reason: 'node-add',
    edgeDelta: 0,
  }),
  Object.freeze({
    id: 'node-remove',
    classification: 'topology',
    reason: 'node-remove',
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
    requiredFallbackLevel: 'none',
  }),
  Object.freeze({
    id: 'edge-remove',
    classification: 'topology',
    reason: 'edge-remove',
    edgeDelta: 0,
  }),
  Object.freeze({
    id: 'container-collapse',
    classification: 'topology',
    reason: 'container-change',
    edgeDelta: 0,
    expectedRoutableEdgeCount: 7,
  }),
  Object.freeze({
    id: 'container-expand',
    classification: 'topology',
    reason: 'container-change',
    edgeDelta: 0,
    requiredFallbackLevel: 'none',
  }),
]);

export const projectDisplayRoutingTopologyDiagnostics = ({
  routing = {}, requests = [], responses = [],
  nodeCount = null, edgeCount = null, renderedEdgeCount = null,
} = {}) => ({
  routing: {
    stage: routing?.stage,
    workerStartCount: routing?.workerStartCount,
    workerAbortCount: routing?.workerAbortCount,
    workerResolution: routing?.workerResolution,
    fallbackLevel: routing?.fallbackLevel,
    renderAuthorityStatus: routing?.renderAuthorityStatus,
    renderAuthorityIssue: routing?.renderAuthorityIssue,
    hasRequestId: typeof routing?.requestId === 'string',
    hasOutputRouteSignature: typeof routing?.outputRouteSignature === 'string',
  },
  requests: (Array.isArray(requests) ? requests : []).map(request => ({
    operation: request?.operation,
    classification: request?.changeSet?.classification,
    reason: request?.changeSet?.reason,
    changedNodeCount: request?.changeSet?.changedNodeIds?.length ?? 0,
    changedEdgeCount: request?.changeSet?.changedEdgeIds?.length ?? 0,
    mutableEdgeCount: request?.mutableEdgeIds?.length ?? 0,
    contextEdgeCount: request?.contextEdgeIds?.length ?? 0,
    nodeCount: request?.nodes?.length ?? 0,
    edgeCount: request?.edges?.length ?? 0,
    hasRequestId: typeof request?.requestId === 'string',
  })),
  responses: (Array.isArray(responses) ? responses : []).map(response => ({
    hardClean: response?.hardClean,
    hardReport: {
      hardClean: response?.hardReport?.hardClean,
      obstacleHits: response?.hardReport?.obstacleHits,
      terminalsAttached: response?.hardReport?.terminalsAttached,
      terminalsAnchored: response?.hardReport?.terminalsAnchored,
      minimumClearanceViolations: response?.hardReport?.minimumClearanceViolations,
      quality: Object.fromEntries([
        'nonOrthogonalSegments', 'strictCrossings', 'reverseOverlap', 'unrelatedOverlap',
        'unexplainedRelatedOverlap', 'shortEndpointStubs', 'tinyInteriorDoglegs', 'hairpins',
      ].map(key => [key, response?.hardReport?.quality?.[key]])),
    },
    routeResolution: response?.routeResolution,
    fallbackLevel: response?.fallbackLevel,
    affectedEdgeCount: response?.affectedEdgeCount,
    patchCount: response?.routingPatches?.length ?? response?.edges?.length ?? 0,
    hasRequestId: typeof response?.requestId === 'string',
  })),
  nodeCount,
  edgeCount,
  renderedEdgeCount,
});

export const displayRoutingTopologyRenderIsCommitted = routing => (
  routing?.stage === 'final-applied'
  && routing?.renderAuthorityStatus === 'accepted'
  && typeof routing?.outputRouteSignature === 'string'
);

/**
 * A successful Worker commit can immediately be republished from the trusted
 * committed snapshot. That intentionally clears the global request id so a
 * later cache reuse cannot impersonate a newer transaction. Accept that state
 * only when the captured transaction identity and exact output signature still
 * prove that the rendered snapshot came from this response.
 */
export const displayRoutingTopologyTransactionIsCommitted = (
  routing,
  request,
  response,
) => {
  if (
    !displayRoutingTopologyRequestMatchesResponse(request, response)
    || typeof response?.outputRouteSignature !== 'string'
    || routing?.outputRouteSignature !== response.outputRouteSignature
  ) return false;
  if (routing?.requestId === request.requestId) return true;
  return routing?.cacheTrustLevel === 'runtime-committed'
    && response?.commitReceipt?.outputRouteSignature === response.outputRouteSignature;
};

const readOperationResultExpression = operationCase => `(() => {
  const committedEdgesMatchWorkerPatches = ${displayRoutingCommittedEdgesMatchWorkerPatches.toString()};
  const renderIsCommitted = ${displayRoutingTopologyRenderIsCommitted.toString()};
  const displayRoutingTopologyRequestMatchesResponse = ${displayRoutingTopologyRequestMatchesResponse.toString()};
  const displayRoutingTopologyResponseIsFinal = ${displayRoutingTopologyResponseIsFinal.toString()};
  const findFinalResponse = ${findDisplayRoutingTopologyFinalResponse.toString()};
  const countFinalResponses = ${countDisplayRoutingTopologyFinalResponses.toString()};
  const transactionIsCommitted = ${displayRoutingTopologyTransactionIsCommitted.toString()};
  const requests = window.__vizlyRoutingRequests || [];
  const responses = window.__vizlyRoutingResponses || [];
  const request = [...requests].reverse().find(item => (
    item?.operation === 'incremental-route'
    && item?.changeSet?.classification === ${JSON.stringify(operationCase.classification)}
  ));
  const response = request ? findFinalResponse(request, responses) : null;
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  const committedEdges = window.reactFlowInstance?.getEdges?.() || [];
  if (
    !request
    || !response
    || !renderIsCommitted(routing)
    || !transactionIsCommitted(routing, request, response)
    || response.hardClean !== true
    || response.hardReport?.hardClean !== true
    || !Array.isArray(committedEdges)
    || !committedEdgesMatchWorkerPatches(committedEdges, response.routingPatches)
  ) return null;
  return {
    operationId: ${JSON.stringify(operationCase.id)},
    capturedRequestCount: requests.length,
    capturedResponseCount: countFinalResponses(request, responses),
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
  const diagnostics = await session.evaluate(`(() => {
    const projectDiagnostics = ${projectDisplayRoutingTopologyDiagnostics.toString()};
    return projectDiagnostics({
      routing: window.__vizlyBaseReactFlowDisplayRouting || {},
      requests: window.__vizlyRoutingRequests || [],
      responses: window.__vizlyRoutingResponses || [],
      nodeCount: window.reactFlowInstance?.getNodes?.().length ?? null,
      edgeCount: window.reactFlowInstance?.getEdges?.().length ?? null,
      renderedEdgeCount: document.querySelectorAll('.react-flow__edge').length,
    });
  })()`);
  throw new Error(`Timed out waiting for ${operationCase.id}:\n${JSON.stringify(diagnostics, null, 2)}`);
};

const prepareOperationCapture = async session => session.evaluate(`(() => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  for (const key of [
    '__vizlyRoutingRequests',
    '__vizlyRoutingResponses',
    '__vizlyBoundedCandidates',
  ]) {
    if (Array.isArray(window[key])) window[key].length = 0;
    else window[key] = [];
  }
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

const applyMultiNodeMove = async session => {
  const prepared = await session.evaluate(`(() => {
    const instance = window.reactFlowInstance;
    const selectedIds = new Set(['l-oms', 'wms']);
    const selectedNodes = instance?.getNodes?.().filter(node => selectedIds.has(node.id));
    if (!instance?.setNodes || selectedNodes?.length !== selectedIds.size) return false;
    instance.setNodes(nodes => nodes.map(node => ({
      ...node,
      selected: selectedIds.has(node.id),
    })));
    instance.fitView?.({ nodes: selectedNodes, padding: 0.4, duration: 0 });
    return true;
  })()`);
  if (!prepared) return false;
  await delay(200);
  const target = await session.evaluate(`(() => {
    const readNodeDragTarget = ${readDisplayRoutingNodeDragTarget.toString()};
    return readNodeDragTarget('wms');
  })()`);
  if (!target) return false;
  const end = { x: target.x + 32, y: target.y + 10 };
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', ...target, button: 'none',
  });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', ...target, button: 'left', buttons: 1, clickCount: 1,
  });
  for (let step = 1; step <= 4; step += 1) {
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: target.x + ((end.x - target.x) * step) / 4,
      y: target.y + ((end.y - target.y) * step) / 4,
      button: 'left',
      buttons: 1,
    });
    await delay(20);
  }
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', ...end, button: 'left', buttons: 0, clickCount: 1,
  });
  return true;
};

const applyCompoundSubtreeMove = session => session.evaluate(`(() => {
  const instance = window.reactFlowInstance;
  const containerId = 'titlegroup-logistics';
  const container = instance?.getNodes?.().find(node => node.id === containerId);
  if (!instance?.setNodes || !container) return false;
  instance.setNodes(nodes => nodes.map(node => node.id === containerId ? {
    ...node,
    position: {
      x: Number(node.position?.x || 0) + 24,
      y: Number(node.position?.y || 0) + 8,
    },
  } : node));
  return true;
})()`);

const applyNodeAdd = session => session.evaluate(`(() => {
  const instance = window.reactFlowInstance;
  const template = instance?.getNodes?.().find(node => node.id === 'wms');
  if (!instance?.setNodes || !template) return false;
  const id = 'routing-audit-isolated-node';
  if (instance.getNodes().some(node => node.id === id)) return false;
  window.__vizlyTopologyAuditNodeId = id;
  instance.setNodes(nodes => [...nodes, {
    ...template,
    id,
    parentId: undefined,
    extent: undefined,
    expandParent: undefined,
    position: { x: 2_400, y: 2_000 },
    positionAbsolute: { x: 2_400, y: 2_000 },
    width: 160,
    height: 80,
    measured: { width: 160, height: 80 },
    selected: false,
    dragging: false,
    data: { ...(template.data || {}), label: 'Routing audit node' },
    style: { ...(template.style || {}), width: 160, height: 80 },
  }]);
  return true;
})()`);

const applyNodeRemove = session => session.evaluate(`(() => {
  const instance = window.reactFlowInstance;
  const id = window.__vizlyTopologyAuditNodeId;
  if (!instance?.setNodes || typeof id !== 'string') return false;
  const before = instance.getNodes?.().length;
  instance.setNodes(nodes => nodes.filter(node => node.id !== id));
  return Number.isFinite(before) && before > 0;
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

const toggleLogisticsContainer = async session => {
  const prepared = await session.evaluate(`(() => {
    const instance = window.reactFlowInstance;
    const group = instance?.getNodes?.().find(node => node.id === 'titlegroup-logistics');
    if (!group) return false;
    instance.fitView?.({ nodes: [group], padding: 0.2, duration: 0 });
    return true;
  })()`);
  if (!prepared) return false;
  await delay(200);
  return session.evaluate(`(() => {
    const button = document.querySelector(
      '.react-flow__node[data-id="titlegroup-logistics"] .title-group-collapse-btn',
    );
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
};

const APPLY_OPERATION = Object.freeze({
  'node-resize': applyNodeResize,
  'multi-node-move': applyMultiNodeMove,
  'compound-subtree-move': applyCompoundSubtreeMove,
  'node-add': applyNodeAdd,
  'node-remove': applyNodeRemove,
  'edge-add': applyEdgeAdd,
  'port-policy': applyPortPolicyChange,
  'edge-remove': applyEdgeRemove,
  'container-collapse': toggleLogisticsContainer,
  'container-expand': toggleLogisticsContainer,
});

export const projectDisplayRoutingTopologyAssertionDiagnostics = ({
  operationCase,
  result,
  counterBaseline,
  baselineEdgeCount,
}) => ({
  operationCase: {
    id: operationCase?.id,
    classification: operationCase?.classification,
    reason: operationCase?.reason,
    edgeDelta: operationCase?.edgeDelta,
    expectedRoutableEdgeCount: operationCase?.expectedRoutableEdgeCount,
  },
  result: {
    requestOperation: result?.requestOperation,
    capturedRequestCount: result?.capturedRequestCount,
    capturedResponseCount: result?.capturedResponseCount,
    changeSet: {
      classification: result?.changeSet?.classification,
      reason: result?.changeSet?.reason,
      changedNodeCount: result?.changeSet?.changedNodeIds?.length ?? 0,
      changedEdgeCount: result?.changeSet?.changedEdgeIds?.length ?? 0,
    },
    requestEdgeCount: result?.requestEdgeCount,
    responseEdgeCount: result?.responseEdgeCount,
    renderedEdgeCount: result?.renderedEdgeCount,
    mutableEdgeCount: result?.request?.mutableEdgeIds?.length ?? 0,
    response: {
      hardClean: result?.response?.hardClean,
      hardReportClean: result?.response?.hardReport?.hardClean,
      routeResolution: result?.response?.routeResolution,
      fallbackLevel: result?.response?.fallbackLevel,
      affectedEdgeCount: result?.response?.affectedEdgeCount,
    },
    routing: {
      workerStartCount: result?.routing?.workerStartCount,
      workerAbortCount: result?.routing?.workerAbortCount,
      fallbackLevel: result?.routing?.fallbackLevel,
      hasOutputRouteSignature: typeof result?.routing?.outputRouteSignature === 'string',
    },
  },
  counterBaseline,
  baselineEdgeCount,
});

export const assertDisplayRoutingTopologyOperationResult = ({
  operationCase,
  result,
  counterBaseline,
  baselineEdgeCount,
}) => {
  const diagnostics = JSON.stringify(projectDisplayRoutingTopologyAssertionDiagnostics({
    operationCase,
    result,
    counterBaseline,
    baselineEdgeCount,
  }), null, 2);
  const expectedEdgeCount = operationCase.expectedRoutableEdgeCount
    ?? baselineEdgeCount + operationCase.edgeDelta;
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
    Array.isArray(operationCase.expectedChangedNodeIds)
    && (
      result?.changeSet?.changedNodeIds?.length !== operationCase.expectedChangedNodeIds.length
      || operationCase.expectedChangedNodeIds.some((nodeId, index) => (
        result.changeSet.changedNodeIds[index] !== nodeId
      ))
    )
  ) {
    throw new Error(`Geometry operation changed an unexpected node set: ${diagnostics}`);
  }
  if (
    Number.isInteger(operationCase.maximumMutableEdgeCount)
    && (
      !Array.isArray(result?.request?.mutableEdgeIds)
      || result.request.mutableEdgeIds.length > operationCase.maximumMutableEdgeCount
    )
  ) {
    throw new Error(`Geometry operation exceeded the mutable-edge budget: ${diagnostics}`);
  }
  if (
    typeof operationCase.requiredFallbackLevel === 'string'
    && (
      result?.response?.fallbackLevel !== operationCase.requiredFallbackLevel
      || result?.routing?.fallbackLevel !== operationCase.requiredFallbackLevel
    )
  ) {
    throw new Error(`Geometry operation exceeded its fallback budget: ${diagnostics}`);
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
    && (
      !['none', 'full'].includes(result?.response?.fallbackLevel)
      || result?.routing?.fallbackLevel !== result?.response?.fallbackLevel
    )
  ) {
    throw new Error(`Topology operation reported an invalid fallback level: ${diagnostics}`);
  }
};

export const assertDisplayRoutingTopologyOperationGroupResult = operationResults => {
  const topologyResults = operationResults.filter(result => result?.classification === 'topology');
  if (topologyResults.length === 0) return;
  const diagnostics = JSON.stringify({ operationResults }, null, 2);
  if (topologyResults.length !== 7) {
    throw new Error(`Topology operation group was incomplete: ${diagnostics}`);
  }
  for (const operationId of [
    'node-add',
    'node-remove',
    'edge-add',
    'port-policy',
    'edge-remove',
    'container-expand',
  ]) {
    const result = topologyResults.find(item => item?.id === operationId);
    if (result?.fallbackLevel !== 'none') {
      throw new Error(`Topology ${operationId} operation did not remain incremental: ${diagnostics}`);
    }
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
      mutableEdgeCount: result.request.mutableEdgeIds?.length ?? null,
      localRouteMs: result.response.phaseTrace
        ?.find(trace => trace?.phase === 'local-route')?.durationMs ?? null,
      workerDurationMs: result.response.workerDurationMs,
      ...(await auditFinalSvg(session, result, operationCase.id)),
    });
  }
  assertDisplayRoutingTopologyOperationGroupResult(operationResults);
  return operationResults;
});

export const verifyDisplayRoutingTopologyMatrix = async options => ({
  id: DISPLAY_ROUTING_TOPOLOGY_CASE_ID,
  presetId: TOPOLOGY_PRESET_ID,
  operations: [
    ...await verifyOperationGroup({
      ...options,
      operationCases: OPERATION_CASES.slice(0, 3),
    }),
    ...await verifyOperationGroup({
      ...options,
      operationCases: OPERATION_CASES.slice(3),
    }),
  ],
});
