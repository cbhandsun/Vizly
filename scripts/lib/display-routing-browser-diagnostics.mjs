import { readDisplayRoutingViewportZoom } from './display-routing-browser-geometry.mjs';

export const prepareDisplayRoutingIncrementalCapture = session => session.evaluate(`(() => {
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
