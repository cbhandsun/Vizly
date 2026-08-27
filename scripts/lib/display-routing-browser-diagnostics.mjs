import { readDisplayRoutingViewportZoom } from './display-routing-browser-geometry.mjs';

/**
 * Returns a bounded, content-free request fingerprint for browser-only drift
 * diagnosis. The source is injected into CDP, so this function must remain
 * self-contained and may not expose graph IDs, coordinates, paths, or routing
 * signatures.
 */
export const readDisplayRoutingRequestDriftProbe = request => {
  const boundedArray = (value, limit = 2_048) => (
    Array.isArray(value) ? value.slice(0, limit) : []
  );
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const normalizedNumber = value => finite(value)
    ? Math.round(value * 1_000) / 1_000
    : null;
  const hashText = (domain, value) => {
    const text = `${domain}\u0000${String(value)}`;
    const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
    return `probe-v1:${seeds.map((seed, seedIndex) => {
      let hash = seed;
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index) + seedIndex;
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    }).join('')}`;
  };
  const digestString = (domain, value) => (
    typeof value === 'string' && value.length > 0 && value.length <= 512
      ? hashText(domain, value)
      : null
  );
  const nodes = boundedArray(request?.nodes);
  const baselineNodes = boundedArray(request?.baselineNodes);
  const edges = boundedArray(request?.edges);
  const baselineSourceEdges = boundedArray(request?.baselineSourceEdges);
  const baselinePatches = boundedArray(request?.baselinePatches);
  const nodeIndexById = new Map(nodes.map((node, index) => [node?.id, index]));
  const edgeIndexById = new Map(edges.map((edge, index) => [edge?.id, index]));
  let fractionalGeometryCount = 0;
  let nonFiniteGeometryCount = 0;
  let absolutePositionPresentCount = 0;
  let measuredSizePresentCount = 0;
  const projectNumber = value => {
    if (!finite(value)) {
      if (typeof value !== 'undefined' && value !== null) nonFiniteGeometryCount += 1;
      return null;
    }
    if (!Number.isInteger(value)) fractionalGeometryCount += 1;
    return normalizedNumber(value);
  };
  const nodeGeometry = nodes.map(node => {
    if (finite(node?.positionAbsolute?.x) && finite(node?.positionAbsolute?.y)) {
      absolutePositionPresentCount += 1;
    }
    if (finite(node?.measured?.width) && finite(node?.measured?.height)) {
      measuredSizePresentCount += 1;
    }
    return [
      projectNumber(node?.position?.x),
      projectNumber(node?.position?.y),
      projectNumber(node?.positionAbsolute?.x),
      projectNumber(node?.positionAbsolute?.y),
      projectNumber(node?.width),
      projectNumber(node?.height),
      projectNumber(node?.measured?.width),
      projectNumber(node?.measured?.height),
      nodeIndexById.get(node?.parentId) ?? -1,
    ];
  });
  const edgeTopology = edges.map(edge => [
    nodeIndexById.get(edge?.source) ?? -1,
    nodeIndexById.get(edge?.target) ?? -1,
    typeof edge?.sourceHandle === 'string',
    typeof edge?.targetHandle === 'string',
  ]);
  const edgePaths = edges.map(edge => boundedArray(edge?.data?.computedPath, 512).map(point => [
    normalizedNumber(point?.x),
    normalizedNumber(point?.y),
  ]));
  const ordinalSet = (value, indexById) => boundedArray(value)
    .map(item => indexById.get(item) ?? -1)
    .sort((left, right) => left - right);
  const changeSet = request?.changeSet && typeof request.changeSet === 'object'
    ? request.changeSet
    : {};
  const allowedOperation = new Set([
    'route', 'validate-or-route', 'incremental-route', 'repair',
  ]);
  const allowedReason = new Set([
    'node-drag', 'node-resize', 'node-add', 'node-remove', 'edge-add',
    'edge-remove', 'port-policy', 'container-change', 'layout', 'unknown',
  ]);
  const allowedClassification = new Set(['none', 'style-only', 'geometry', 'topology']);
  const projectedGeometry = JSON.stringify({ nodeGeometry, edgeTopology, edgePaths });
  return {
    schema: 'routing-drift-v1',
    operation: allowedOperation.has(request?.operation) ? request.operation : 'invalid',
    baseline: {
      sessionRefPresent: Boolean(request?.baselineSessionRef),
      inlineBootstrapPresent: baselineNodes.length > 0
        && baselineSourceEdges.length > 0
        && baselinePatches.length > 0,
      inputDigest: digestString('baseline-input', request?.baselineInputGeometryDigest),
      routeDigest: digestString('baseline-route', request?.baselineOutputRouteSignature),
      nodeCount: baselineNodes.length,
      edgeCount: baselineSourceEdges.length,
      patchCount: baselinePatches.length,
    },
    next: {
      inputDigest: digestString('next-input', request?.nextInputGeometryDigest),
      projectedGeometryDigest: hashText('projected-geometry', projectedGeometry),
      nodeGeometryDigest: hashText('node-geometry', JSON.stringify(nodeGeometry)),
      edgeTopologyDigest: hashText('edge-topology', JSON.stringify(edgeTopology)),
      edgeSourcePathDigest: hashText('edge-source-path', JSON.stringify(edgePaths)),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      fractionalGeometryCount,
      nonFiniteGeometryCount,
      absolutePositionPresentCount,
      measuredSizePresentCount,
    },
    change: {
      reason: allowedReason.has(changeSet.reason) ? changeSet.reason : 'invalid',
      classification: allowedClassification.has(changeSet.classification)
        ? changeSet.classification
        : 'invalid',
      topologyChanged: changeSet.topologyChanged === true,
      geometryChanged: changeSet.geometryChanged === true,
      changedNodeCount: boundedArray(changeSet.changedNodeIds).length,
      changedEdgeCount: boundedArray(changeSet.changedEdgeIds).length,
      mutableEdgeCount: boundedArray(request?.mutableEdgeIds).length,
      contextEdgeCount: boundedArray(request?.contextEdgeIds).length,
      changedSetDigest: hashText('changed-set', JSON.stringify({
        nodes: ordinalSet(changeSet.changedNodeIds, nodeIndexById),
        edges: ordinalSet(changeSet.changedEdgeIds, edgeIndexById),
      })),
      closureSetDigest: hashText('closure-set', JSON.stringify({
        mutable: ordinalSet(request?.mutableEdgeIds, edgeIndexById),
        context: ordinalSet(request?.contextEdgeIds, edgeIndexById),
      })),
    },
  };
};

export const prepareDisplayRoutingIncrementalCapture = session => session.evaluate(`(() => {
  const readRequestDriftProbe = ${readDisplayRoutingRequestDriftProbe.toString()};
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  const existingRequests = window.__vizlyRoutingRequests || [];
  const initialRequest = [...existingRequests].reverse().find(item => (
    item?.operation !== 'incremental-route'
  ));
  window.__vizlyInitialRoutingDriftProbe = readRequestDriftProbe(initialRequest);
  window.__vizlyIncrementalRoutingCounterBaseline = {
    workerStartCount: Number.isFinite(routing.workerStartCount) ? routing.workerStartCount : 0,
    workerAbortCount: Number.isFinite(routing.workerAbortCount) ? routing.workerAbortCount : 0,
  };
  window.__vizlyRoutingRequests = [];
  window.__vizlyRoutingResponses = [];
  window.__vizlyRouteSamplingEnabled = false;
  for (const minimap of document.querySelectorAll('.fixed-minimap-container')) {
    minimap.style.display = 'none';
  }
  return true;
})()`);

export const readDisplayRoutingViewportZoomFromSession = async session => {
  const zoom = await session.evaluate(`(() => {
    const readViewportZoom = ${readDisplayRoutingViewportZoom.toString()};
    return readViewportZoom();
  })()`);
  if (!Number.isFinite(zoom)) throw new Error('Unable to read a finite viewport zoom');
  return zoom;
};

export const readDisplayRoutingIncrementalFailureStatus = (session, nodeId) => (
  session.evaluate(`(() => ({
    routing: (() => {
      const value = window.__vizlyBaseReactFlowDisplayRouting || {};
      return {
        stage: value.stage,
        workerStartCount: value.workerStartCount,
        workerAbortCount: value.workerAbortCount,
        workerResolution: value.workerResolution,
        fallbackLevel: value.fallbackLevel,
      };
    })(),
    requests: (window.__vizlyRoutingRequests || []).map(item => ({
      operation: item?.operation,
      mutableEdgeCount: item?.mutableEdgeIds?.length,
    })),
    responses: (window.__vizlyRoutingResponses || []).map(item => ({
      routeResolution: item?.routeResolution,
      hardClean: item?.hardClean,
      fallbackLevel: item?.fallbackLevel,
    })),
    targetNodePresent: Boolean(document.querySelector(
      '.react-flow__node[data-id=${JSON.stringify(nodeId)}]',
    )),
  }))()`)
);

/** Read only bounded routing identity/counter data and a digest of final SVG paths. */
export const readDisplayRoutingCommittedReuseSnapshot = () => {
  // Keep this helper self-contained because its source is injected into CDP.
  const hashText = value => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };
  const paths = [...document.querySelectorAll(
    '.react-flow__edge .react-flow__edge-path',
  )]
    .map(path => path.getAttribute('d') || '')
    .sort();
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  return {
    stage: routing.stage,
    cacheTrustLevel: routing.cacheTrustLevel,
    inputSignature: routing.signature,
    inputGeometryDigest: routing.inputGeometryDigest,
    outputRouteSignature: routing.outputRouteSignature,
    workerStartCount: routing.workerStartCount,
    workerAbortCount: routing.workerAbortCount,
    requestCount: (window.__vizlyRoutingRequests || []).length,
    responseCount: (window.__vizlyRoutingResponses || []).length,
    renderedEdgeCount: document.querySelectorAll('.react-flow__edge').length,
    renderedEdgesWithPathCount: [...document.querySelectorAll('.react-flow__edge')]
      .filter(edge => edge.querySelector('.react-flow__edge-path')).length,
    renderedPathCount: paths.length,
    renderedPathDigest: hashText(paths.join('\u0000')),
  };
};

export const assertDisplayRoutingCommittedReuse = ({ before, after, expectedEdgeCount }) => {
  const issues = [];
  const exactFields = [
    'inputSignature',
    'inputGeometryDigest',
    'outputRouteSignature',
    'renderedPathDigest',
  ];
  if (before?.stage !== 'final-applied') issues.push('before.stage');
  if (after?.stage !== 'final-applied') issues.push('after.stage');
  if (after?.cacheTrustLevel !== 'runtime-committed') issues.push('after.cacheTrustLevel');
  if (after?.workerStartCount !== 0) issues.push('after.workerStartCount');
  if (after?.workerAbortCount !== 0) issues.push('after.workerAbortCount');
  if (after?.requestCount !== 0) issues.push('after.requestCount');
  if (after?.responseCount !== 0) issues.push('after.responseCount');
  if (after?.renderedEdgeCount !== expectedEdgeCount) issues.push('after.renderedEdgeCount');
  if (after?.renderedEdgesWithPathCount !== expectedEdgeCount) {
    issues.push('after.renderedEdgesWithPathCount');
  }
  if (!Number.isInteger(after?.renderedPathCount) || after.renderedPathCount < expectedEdgeCount) {
    issues.push('after.renderedPathCount');
  }
  if (before?.renderedPathCount !== after?.renderedPathCount) {
    issues.push('after.renderedPathCountExact');
  }
  for (const field of exactFields) {
    if (typeof before?.[field] !== 'string' || before[field] !== after?.[field]) {
      issues.push(`after.${field}`);
    }
  }
  if (issues.length > 0) {
    throw new Error(`Committed routing reuse failed: ${issues.join(', ')}`);
  }
};
