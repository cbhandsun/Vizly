import { measureDisplayRoutingEditStability, projectDisplayRoutingEditStability }
  from './display-routing-edit-stability.mjs';

export const readTopologyVisibilityEvidence = () => {
  const nodes = window.reactFlowInstance?.getNodes?.();
  const edges = window.reactFlowInstance?.getEdges?.();
  if (!Array.isArray(nodes) || !Array.isArray(edges) || nodes.length > 5_000 || edges.length > 5_000
    || nodes.some(node => !node || typeof node !== 'object')
    || edges.some(edge => !edge || typeof edge !== 'object')) {
    return { available: false, truncated: false, edges: [] };
  }
  const rendered = [...document.querySelectorAll('.react-flow__edge')].map(element => element.getAttribute('data-id'));
  return { available: true, truncated: edges.length > 100, edges: edges.slice(0, 100).map((edge, index) => ({
    index, rendered: rendered.includes(edge.id), hidden: edge.hidden === true,
    sourceIndex: nodes.findIndex(node => node.id === edge.source),
    targetIndex: nodes.findIndex(node => node.id === edge.target),
    sourceHasPosition: nodes.some(node => node.id === edge.source && Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y)),
    targetHasPosition: nodes.some(node => node.id === edge.target && Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y)),
  })) };
};

/** Browser-local capture of the committed store; no graph content leaves the page. */
export const readTopologyStabilitySnapshot = () => {
  const nodes = window.reactFlowInstance?.getNodes?.();
  const edges = window.reactFlowInstance?.getEdges?.();
  if (!Array.isArray(nodes) || !Array.isArray(edges) || nodes.length > 5_000 || edges.length > 5_000) {
    throw new Error('Topology stability store unavailable');
  }
  const hidden = new Set(nodes.filter(node => node.hidden === true).map(node => node.id));
  for (let round = 0; round < 128; round += 1) {
    let changed = false;
    for (const node of nodes) {
      if (hidden.has(node.parentId) && !hidden.has(node.id)) { hidden.add(node.id); changed = true; }
    }
    if (!changed) break;
  }
  const routable = edges.filter(edge => edge.hidden !== true && !hidden.has(edge.source) && !hidden.has(edge.target));
  return {
    hiddenNodeCount: hidden.size, excludedHiddenEdgeCount: edges.length - routable.length,
    nodes: nodes.map(node => ({ id: node.id, parentId: node.parentId,
      position: { x: node.position?.x, y: node.position?.y } })),
    edges: routable.map(edge => ({ id: edge.id, source: edge.source, target: edge.target,
      sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle,
      data: { computedPath: Array.isArray(edge.data?.computedPath)
        ? edge.data.computedPath.map(point => ({ x: point.x, y: point.y })) : null } })),
  };
};

/** Explicit editing intent, independent of the router's chosen mutable closure. */
export const topologyEditedNodeIds = (operationId, before, after) => {
  const direct = {
    'node-resize': ['tms'], 'multi-node-move': ['l-oms', 'wms'],
    'compound-subtree-move': ['titlegroup-logistics'],
    'node-add': ['routing-audit-isolated-node'], 'node-remove': ['routing-audit-isolated-node'],
    'edge-add': [], 'port-policy': [], 'edge-remove': [],
    'container-collapse': ['titlegroup-logistics'], 'container-expand': ['titlegroup-logistics'],
  };
  if (!Object.hasOwn(direct, operationId)) throw new Error('Unknown topology stability operation');
  const selected = new Set(direct[operationId]);
  if (selected.has('titlegroup-logistics')) {
    const nodes = [...before.nodes, ...after.nodes];
    for (let round = 0; round < 128; round += 1) {
      let changed = false;
      for (const node of nodes) {
        if (selected.has(node.parentId) && !selected.has(node.id)) { selected.add(node.id); changed = true; }
      }
      if (!changed) break;
    }
  }
  return [...selected];
};

export const captureTopologyStabilityBaseline = session => session.evaluate(`(() => {
  const read = ${readTopologyStabilitySnapshot.toString()};
  const measure = ${measureDisplayRoutingEditStability.toString()};
  const snapshot = read();
  measure(snapshot, snapshot, []);
  window.__vizlyTopologyStabilityBaseline = snapshot;
  return true;
})()`);

// The request closure can expand inside the Worker, or fall back to a full route.
// This comparison deliberately preserves changes outside the ORIGINAL request;
// it must not be presented as an audit of the final transaction's eligible set.
export const readTopologyEditStability = (session, operationId, mutableEdgeIds) => session.evaluate(`(() => {
  const read = ${readTopologyStabilitySnapshot.toString()};
  const measure = ${measureDisplayRoutingEditStability.toString()};
  const editedIds = ${topologyEditedNodeIds.toString()};
  try {
    const before = window.__vizlyTopologyStabilityBaseline;
    const after = read();
    const selected = editedIds(${JSON.stringify(operationId)}, before, after);
    const intent = measure(before, after, selected);
    const mutable = ${JSON.stringify(mutableEdgeIds)};
    if (!Array.isArray(mutable) || mutable.length > 5_000
      || mutable.some(id => typeof id !== 'string' || !id || id.length > 512)) throw new Error('Invalid mutable edge scope');
    const observedEdges = new Set([...before.edges, ...after.edges].map(edge => edge.id));
    const observedMutable = [...new Set(mutable)].filter(id => observedEdges.has(id));
    return {
      intent, outsideRequestedRoutingGroup: measure(before, after, selected, observedMutable),
      explicitOrDescendantNodeCount: selected.length, observedRequestedMutableEdgeCount: observedMutable.length,
      beforeHiddenNodeCount: before.hiddenNodeCount, afterHiddenNodeCount: after.hiddenNodeCount,
      beforeHiddenEdgeCount: before.excludedHiddenEdgeCount, afterHiddenEdgeCount: after.excludedHiddenEdgeCount,
    };
  } finally { delete window.__vizlyTopologyStabilityBaseline; }
})()`);

export const assertTopologyEditStability = (operationId, evidence) => {
  const intent = projectDisplayRoutingEditStability(evidence?.intent);
  const outside = projectDisplayRoutingEditStability(evidence?.outsideRequestedRoutingGroup);
  if (!intent || !outside) throw new Error('Incomplete topology stability evidence');
  // These edit operations update explicit nodes (including moved descendants),
  // not the positions of retained nodes outside that scope. Router-selected
  // mutable edge groups must not exempt unrelated node movement.
  if (intent.movedNodeCount !== 0) throw new Error('Topology edit changed retained diagram positions');
  // The audit node is deliberately isolated and outside the existing diagram.
  // Adding/removing it has no legitimate effect on retained positions or routes.
  if (['node-add', 'node-remove'].includes(operationId)
    && (intent.changedPortCount !== 0 || intent.changedGeometryCount !== 0
      || Math.abs(intent.afterPathLength - intent.beforePathLength) > 0.01
      || intent.afterBendCount !== intent.beforeBendCount)) {
    throw new Error('Isolated node edit changed retained diagram structure');
  }
};
