import { readDisplayRoutingViewportZoom } from './display-routing-browser-geometry.mjs';

/** Session-hit incremental requests intentionally omit bootstrap baselines. */
export const readDisplayRoutingRequestDebugSnapshot = request => {
  // Keep this helper self-contained because its source is injected into CDP.
  const projectNodes = value => (
    Array.isArray(value)
      ? value.map(node => ({
        id: node?.id,
        type: node?.type,
        parentId: node?.parentId,
        position: node?.position,
        positionAbsolute: node?.positionAbsolute,
        width: node?.width,
        height: node?.height,
        measured: node?.measured,
      }))
      : []
  );
  return {
    changeSet: request?.changeSet,
    mutableEdgeIds: Array.isArray(request?.mutableEdgeIds) ? request.mutableEdgeIds : [],
    contextEdgeIds: Array.isArray(request?.contextEdgeIds) ? request.contextEdgeIds : [],
    nodes: projectNodes(request?.nodes),
    baselineNodes: projectNodes(request?.baselineNodes),
    edges: Array.isArray(request?.edges)
      ? request.edges.map(edge => ({
        id: edge?.id,
        source: edge?.source,
        target: edge?.target,
        sourceHandle: edge?.sourceHandle,
        targetHandle: edge?.targetHandle,
        data: {
          autoSource: edge?.data?.autoSource,
          autoTarget: edge?.data?.autoTarget,
          auto: edge?.data?.auto,
          computedPath: edge?.data?.computedPath,
        },
      }))
      : [],
    baselinePatches: Array.isArray(request?.baselinePatches) ? request.baselinePatches : [],
  };
};

export const prepareDisplayRoutingIncrementalCapture = session => session.evaluate(`(() => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
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
    routing: window.__vizlyBaseReactFlowDisplayRouting || {},
    requests: (window.__vizlyRoutingRequests || []).map(item => ({
      requestId: item?.requestId,
      operation: item?.operation,
      mutableEdgeCount: item?.mutableEdgeIds?.length,
    })),
    responses: (window.__vizlyRoutingResponses || []).map(item => ({
      requestId: item?.requestId,
      routeResolution: item?.routeResolution,
      hardClean: item?.hardClean,
    })),
    nodeTransform: document.querySelector(
      '.react-flow__node[data-id=${JSON.stringify(nodeId)}]',
    )?.getAttribute('transform') || null,
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
