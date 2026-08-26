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
