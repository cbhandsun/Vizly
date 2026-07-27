/**
 * Generation accepts one final hard-clean route/validate response. A standalone
 * later `:repair` response remains invalid because it has a different request
 * identity; an in-job full-route repair is represented by one final response.
 */
export const isMatchingHardCleanDisplayWorkerResponse = (request, response) => (
  Boolean(request)
  && typeof request === 'object'
  && (request.operation === 'route' || request.operation === 'validate-or-route')
  && typeof request.requestId === 'string'
  && request.requestId.length > 0
  && Array.isArray(request.edges)
  && Boolean(response)
  && typeof response === 'object'
  && response.requestId === request.requestId
  && response.hardClean === true
  && (
    response.routeResolution === 'validated-candidate'
    || response.routeResolution === 'full-route'
    || response.routeResolution === 'full-route-repaired'
  )
  && Array.isArray(response.edges)
  && response.edges.length === request.edges.length
);

export const createPrecompiledDisplayRoutePatches = (sourceEdges, routedEdges) => {
  let totalPathPoints = 0;
  const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const isIdentifier = value => typeof value === 'string' && value.length > 0 && value.length <= 500;
  const copyToken = value => (
    value == null || (typeof value === 'string' && value.length <= 500)
      ? value
      : Symbol.for('invalid-precompiled-route-token')
  );
  const copyPath = (value, required) => {
    if (!Array.isArray(value) || value.length > 2_000 || (required && value.length < 2)) return null;
    totalPathPoints += value.length;
    if (totalPathPoints > 200_000) return null;
    const path = [];
    for (const point of value) {
      if (
        !isRecord(point)
        || !Object.keys(point).every(key => key === 'x' || key === 'y')
        || typeof point.x !== 'number'
        || !Number.isFinite(point.x)
        || Math.abs(point.x) > 1_000_000_000
        || typeof point.y !== 'number'
        || !Number.isFinite(point.y)
        || Math.abs(point.y) > 1_000_000_000
      ) return null;
      path.push({ x: point.x, y: point.y });
    }
    return path;
  };

  if (!Array.isArray(sourceEdges) || !Array.isArray(routedEdges) || sourceEdges.length !== routedEdges.length) {
    return null;
  }
  const patches = [];
  for (let index = 0; index < routedEdges.length; index += 1) {
    const source = sourceEdges[index];
    const routed = routedEdges[index];
    if (
      !isRecord(source)
      || !isRecord(routed)
      || !isIdentifier(routed.id)
      || !isIdentifier(routed.source)
      || !isIdentifier(routed.target)
      || routed.id !== source.id
      || routed.source !== source.source
      || routed.target !== source.target
    ) return null;
    const patch = { id: routed.id, source: routed.source, target: routed.target };
    for (const key of ['type', 'sourceHandle', 'targetHandle']) {
      if (routed[key] == null) {
        if (source[key] != null) return null;
        continue;
      }
      const token = copyToken(routed[key]);
      if (typeof token === 'symbol') return null;
      patch[key] = token;
    }
    if (patch.type !== source.type && patch.type !== 'stablePath') return null;
    const sourceData = isRecord(source.data) ? source.data : {};
    const routedData = isRecord(routed.data) ? routed.data : null;
    if (!routedData) return null;
    const data = {};
    const computedPath = copyPath(routedData.computedPath, true);
    if (!computedPath) return null;
    data.computedPath = computedPath;
    if (typeof routedData.elkPath !== 'undefined') {
      const elkPath = copyPath(routedData.elkPath, false);
      if (!elkPath) return null;
      data.elkPath = elkPath;
    } else if (typeof sourceData.elkPath !== 'undefined') {
      return null;
    }
    if (typeof routedData.treeRouting !== 'undefined') {
      if (!isRecord(routedData.treeRouting)) return null;
      const treeRouting = {};
      for (const key of ['effectiveSourceHandle', 'effectiveTargetHandle']) {
        if (typeof routedData.treeRouting[key] === 'undefined') continue;
        const token = copyToken(routedData.treeRouting[key]);
        if (typeof token === 'symbol') return null;
        treeRouting[key] = token;
      }
      if (typeof routedData.treeRouting.points !== 'undefined') {
        const points = copyPath(routedData.treeRouting.points, false);
        if (!points) return null;
        treeRouting.points = points;
      }
      data.treeRouting = treeRouting;
    } else if (typeof sourceData.treeRouting !== 'undefined') {
      return null;
    }
    for (const key of ['sharedTrunkAware', 'sharedTrunkSynthesized', 'isTreeBus']) {
      if (typeof routedData[key] !== 'undefined') {
        if (typeof routedData[key] !== 'boolean') return null;
        data[key] = routedData[key];
      } else if (sourceData[key] === true) {
        return null;
      }
    }
    patch.data = data;
    patches.push(patch);
  }
  return patches;
};

export const renderPrecompiledDisplayRouteCaptureExpression = targetId => `(async () => {
  const isMatchingResponse = ${isMatchingHardCleanDisplayWorkerResponse.toString()};
  const createPatches = ${createPrecompiledDisplayRoutePatches.toString()};
  const hashQueryIndex = window.location.hash.indexOf('?');
  const activeTargetId = hashQueryIndex >= 0
    ? new URLSearchParams(window.location.hash.slice(hashQueryIndex + 1)).get('diagram')
    : null;
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  const request = window.__vizlyPrecompiledRouteRequest;
  const response = window.__vizlyPrecompiledRouteResponse;
  if (activeTargetId !== ${JSON.stringify(targetId)}
    || routing.stage !== 'final-applied'
    || routing.workerAbortCount !== 0
    || routing.requestId !== request?.requestId
    || !isMatchingResponse(request, response)
    || routing.workerResolution !== response.routeResolution
    || typeof routing.inputGeometryDigest !== 'string'
    || !/^geometry-v1:[0-9a-f]{32}$/.test(routing.inputGeometryDigest)
    || typeof routing.outputRouteSignature !== 'string'
    || !/^route-v2:\\d{1,3}:\\d{1,6}:[0-9a-f]{16}$/.test(routing.outputRouteSignature)
    || typeof routing.routingVersion !== 'string'
    || routing.routingVersion.length === 0) return null;
  const patches = createPatches(request.edges, response.edges);
  if (!patches) return null;
  return {
    targetId: ${JSON.stringify(targetId)},
    routing,
    requestShape: { nodes: request.nodes.length, edges: request.edges.length },
    patches,
    inputGeometryDigest: routing.inputGeometryDigest,
    outputRouteSignature: routing.outputRouteSignature,
    workerResolution: response.routeResolution,
  };
})()`;
